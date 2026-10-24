// EIP-1193 wallet operations for the RH lane: context reads, chain switch with the
// 4902 add-then-switch path, and a single guarded eth_sendTransaction. There is no
// retry, rebroadcast, nonce override or signing here; the wallet owns its nonces.
import { RH_WALLET_NETWORKS } from '../../config/rhBridge';
import { LaneChainId } from '../../constants/rhBridge';
import { LaneCall } from './lane';
import type { WalletIntentGuard } from '../../hooks/bridge/walletIntent';
import { beforeWalletPrompt } from '../../hooks/bridge/walletIntent';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export interface WalletContext {
  chainId: number;
  account: string | null; // lowercase
}

const fail = (code: string): never => {
  throw new Error('RH_WALLET_' + code);
};

export function isEip1193(value: unknown): value is Eip1193 {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as Eip1193).request === 'function'
  );
}

function errorCode(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const own = (error as { code?: unknown }).code;
  if (typeof own === 'number' || typeof own === 'string') return own;
  // ethers wraps provider errors and keeps the original under `error`.
  const nested = (error as { error?: { code?: unknown } }).error?.code;
  return typeof nested === 'number' ? nested : undefined;
}

export async function readWalletContext(provider: Eip1193): Promise<WalletContext> {
  let chain: unknown;
  let accounts: unknown;
  try {
    chain = await provider.request({ method: 'eth_chainId' });
    accounts = await provider.request({ method: 'eth_accounts' });
  } catch {
    return fail('READ_FAILED');
  }
  if (typeof chain !== 'string' || !/^0x[0-9a-fA-F]{1,8}$/.test(chain)) return fail('READ_FAILED');
  if (!Array.isArray(accounts)) return fail('READ_FAILED');
  const first = accounts[0];
  if (first !== undefined && (typeof first !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(first)))
    return fail('READ_FAILED');
  return { chainId: parseInt(chain, 16), account: first ? first.toLowerCase() : null };
}

export type SwitchOutcome = 'SWITCHED' | 'REJECTED' | 'FAILED';

// wallet_switchEthereumChain; on 4902 (unknown chain) wallet_addEthereumChain, then switch again.
export async function switchWalletChain(provider: Eip1193, chainId: LaneChainId): Promise<SwitchOutcome> {
  const network = RH_WALLET_NETWORKS[chainId];
  if (!network) return 'FAILED';
  const params = [{ chainId: network.chainId }];
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params });
    return 'SWITCHED';
  } catch (error) {
    const code = errorCode(error);
    if (code === 4001) return 'REJECTED';
    if (code !== 4902) return 'FAILED';
  }
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: network.chainId,
          chainName: network.chainName,
          nativeCurrency: { ...network.nativeCurrency },
          rpcUrls: [...network.rpcUrls],
          blockExplorerUrls: [...network.blockExplorerUrls],
        },
      ],
    });
    await provider.request({ method: 'wallet_switchEthereumChain', params });
    return 'SWITCHED';
  } catch (error) {
    return errorCode(error) === 4001 ? 'REJECTED' : 'FAILED';
  }
}

export type SendOutcome =
  | { kind: 'SENT'; txHash: string }
  | { kind: 'NOT_SENT'; code: string } // definitely not broadcast (rejected or refused before signing)
  | { kind: 'UNCERTAIN'; code: string }; // the wallet may have broadcast; never retry automatically

// Codes that guarantee nothing was signed: user rejection, unauthorized, unsupported,
// disconnected and invalid params (EIP-1193 / JSON-RPC).
const NOT_SENT_CODES: Array<number | string> = [4001, 4100, 4200, 4900, 4901, -32602, 'ACTION_REJECTED'];

// Confirms account and chain immediately before the prompt, then sends exactly `call`.
// Throws RH_WALLET_CONTEXT_CHANGED (before any prompt) on a mismatch.
export async function sendLaneTransaction(
  provider: Eip1193,
  expectedAccount: string,
  call: LaneCall,
  guard?: WalletIntentGuard
): Promise<SendOutcome> {
  const context = await readWalletContext(provider);
  if (context.chainId !== call.chainId || !context.account || context.account !== expectedAccount.toLowerCase()) {
    return fail('CONTEXT_CHANGED');
  }
  let result: unknown;
  const value = call.value ?? '0';
  if (
    !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
    BigInt(value) >= BigInt(1) << BigInt(256) ||
    (call.kind === 'depositNative' ? value !== call.amount : value !== '0')
  )
    return fail('VALUE_MISMATCH');
  await beforeWalletPrompt(guard, { provider });
  guard?.assertCurrent();
  try {
    result = await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: context.account,
          to: call.to,
          data: call.data,
          value: '0x' + BigInt(value).toString(16),
          chainId: '0x' + call.chainId.toString(16),
        },
      ],
    });
  } catch (error) {
    const code = errorCode(error);
    if (code !== undefined && NOT_SENT_CODES.includes(code)) return { kind: 'NOT_SENT', code: String(code) };
    return { kind: 'UNCERTAIN', code: code === undefined ? 'UNKNOWN' : String(code) };
  }
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result))
    return { kind: 'UNCERTAIN', code: 'INVALID_HASH' };
  return { kind: 'SENT', txHash: result.toLowerCase() };
}
