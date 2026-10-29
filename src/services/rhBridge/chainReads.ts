// Read-only JSON-RPC access to the two lane chains through their keyless public RPCs.
// Used for balances, allowance, decimals, native gas balance, restricted-mode holder checks, fee and
// capacity guards, receipts and nonces (replacement detection),
// independent of which chain the wallet currently has selected. Never sends a transaction.
import { LaneBinding, RH_RPC_URLS } from '../../config/rhBridge';
import { LaneChainId, RhDirection } from '../../constants/rhBridge';
import { LANE_ABI, OnchainFee } from './lane';

export interface Receipt {
  status: 0 | 1;
  blockNumber: number;
}
export interface ChainReader {
  call(chainId: LaneChainId, to: string, data: string): Promise<string>;
  getBalance(chainId: LaneChainId, address: string): Promise<string>;
  getReceipt(chainId: LaneChainId, txHash: string): Promise<Receipt | null>;
  // eth_getTransactionByHash: the transaction's nonce and sender, or null when the RPC does not know it.
  getTransaction(chainId: LaneChainId, txHash: string): Promise<{ nonce: number; from: string } | null>;
  getTransactionCount(chainId: LaneChainId, address: string, block: 'latest' | 'pending'): Promise<number>;
  estimateGas?(chainId: LaneChainId, tx: { from: string; to: string; data: string; value: string }): Promise<string>;
  gasPrice?(chainId: LaneChainId): Promise<string>;
  getCode?(chainId: LaneChainId, address: string): Promise<string>;
  getChainId?(chainId: LaneChainId): Promise<number>;
  genesisHash?(chainId: LaneChainId): Promise<string>;
}

const QUANTITY = /^0x[0-9a-f]{1,64}$/i;
const fail = (code: string): never => {
  throw new Error('RH_RPC_' + code);
};
const quantity = (value: unknown): string =>
  typeof value === 'string' && QUANTITY.test(value) ? BigInt(value).toString() : fail('INVALID');

export function createChainReader(
  fetchImpl: typeof fetch,
  urls: Readonly<Record<number, string>> = RH_RPC_URLS,
  timeoutMs = 10000
): ChainReader {
  let id = 0;
  async function rpc(chainId: LaneChainId, method: string, params: unknown[]): Promise<unknown> {
    const url = urls[chainId];
    if (!url) return fail('UNKNOWN_CHAIN');
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller?.signal,
        });
      } catch {
        return fail('UNREACHABLE');
      }
      if (!response.ok) return fail('HTTP');
      let body: { result?: unknown; error?: { code?: unknown; message?: unknown } };
      try {
        body = await response.json();
      } catch {
        return fail('INVALID');
      }
      if (body && body.error) {
        const error = new Error('RH_RPC_ERROR') as Error & { rpcCode?: unknown };
        error.rpcCode = body.error.code;
        throw error;
      }
      if (!body || !('result' in body)) return fail('INVALID');
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }
  return Object.freeze({
    async estimateGas(chainId: LaneChainId, tx: { from: string; to: string; data: string; value: string }) {
      return quantity(await rpc(chainId, 'eth_estimateGas', [tx]));
    },
    async gasPrice(chainId: LaneChainId) {
      return quantity(await rpc(chainId, 'eth_gasPrice', []));
    },
    async getCode(chainId: LaneChainId, address: string) {
      const code = await rpc(chainId, 'eth_getCode', [address, 'latest']);
      if (typeof code !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(code)) return fail('INVALID');
      return code.toLowerCase();
    },
    async getChainId(chainId: LaneChainId) {
      return Number(quantity(await rpc(chainId, 'eth_chainId', [])));
    },
    async genesisHash(chainId: LaneChainId) {
      const block = (await rpc(chainId, 'eth_getBlockByNumber', ['0x0', false])) as { hash?: unknown };
      if (typeof block?.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(block.hash)) return fail('INVALID');
      return block.hash.toLowerCase();
    },
    async call(chainId: LaneChainId, to: string, data: string) {
      const result = await rpc(chainId, 'eth_call', [{ to, data }, 'latest']);
      return typeof result === 'string' && /^0x([0-9a-f]{2})*$/i.test(result) ? result : fail('INVALID');
    },
    async getBalance(chainId: LaneChainId, address: string) {
      return quantity(await rpc(chainId, 'eth_getBalance', [address, 'latest']));
    },
    async getReceipt(chainId: LaneChainId, txHash: string) {
      const result = (await rpc(chainId, 'eth_getTransactionReceipt', [txHash])) as {
        status?: unknown;
        blockNumber?: unknown;
      } | null;
      if (result === null) return null;
      if (!result || typeof result !== 'object') return fail('INVALID');
      const status = result.status === '0x1' ? 1 : result.status === '0x0' ? 0 : fail('INVALID');
      return { status, blockNumber: Number(quantity(result.blockNumber)) } as Receipt;
    },
    async getTransaction(chainId: LaneChainId, txHash: string) {
      const result = (await rpc(chainId, 'eth_getTransactionByHash', [txHash])) as {
        nonce?: unknown;
        from?: unknown;
      } | null;
      if (result === null) return null;
      if (
        !result ||
        typeof result !== 'object' ||
        typeof result.from !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(result.from)
      ) {
        return fail('INVALID');
      }
      return { nonce: Number(quantity(result.nonce)), from: result.from.toLowerCase() };
    },
    async getTransactionCount(chainId: LaneChainId, address: string, block: 'latest' | 'pending') {
      return Number(quantity(await rpc(chainId, 'eth_getTransactionCount', [address, block])));
    },
  });
}

function decodeUint(data: string, method: 'balanceOf' | 'allowance' | 'decimals'): string {
  return LANE_ABI.decodeFunctionResult(method, data)[0].toString();
}
function decodeBool(data: string, method: 'restrictedMode' | 'allowedHolder'): boolean {
  return LANE_ABI.decodeFunctionResult(method, data)[0] === true;
}

export async function readTokenBalance(
  reader: ChainReader,
  chainId: LaneChainId,
  token: string,
  owner: string
): Promise<string> {
  return decodeUint(await reader.call(chainId, token, LANE_ABI.encodeFunctionData('balanceOf', [owner])), 'balanceOf');
}
export async function readAllowance(
  reader: ChainReader,
  chainId: LaneChainId,
  token: string,
  owner: string,
  spender: string
): Promise<string> {
  return decodeUint(
    await reader.call(chainId, token, LANE_ABI.encodeFunctionData('allowance', [owner, spender])),
    'allowance'
  );
}
export async function readDecimals(reader: ChainReader, chainId: LaneChainId, token: string): Promise<number> {
  return Number(decodeUint(await reader.call(chainId, token, LANE_ABI.encodeFunctionData('decimals', [])), 'decimals'));
}
export async function readRestricted(reader: ChainReader, chainId: LaneChainId, contract: string): Promise<boolean> {
  return decodeBool(
    await reader.call(chainId, contract, LANE_ABI.encodeFunctionData('restrictedMode', [])),
    'restrictedMode'
  );
}
export async function readAllowedHolder(
  reader: ChainReader,
  chainId: LaneChainId,
  contract: string,
  holder: string
): Promise<boolean> {
  return decodeBool(
    await reader.call(chainId, contract, LANE_ABI.encodeFunctionData('allowedHolder', [holder])),
    'allowedHolder'
  );
}

const call = async (reader: ChainReader, chainId: LaneChainId, to: string, method: string, args: unknown[]) =>
  LANE_ABI.decodeFunctionResult(method, await reader.call(chainId, to, LANE_ABI.encodeFunctionData(method, args)));

// The minter's own fee for `gross` and its governance ceiling inputs (keyless Onyx RPC).
export async function readOnchainFee(reader: ChainReader, lane: LaneBinding, gross: string): Promise<OnchainFee> {
  const [fee, maxFeeBps, registry] = await Promise.all([
    call(reader, lane.onyxChainId, lane.minter, 'feeFor', [lane.wrapper, gross]),
    call(reader, lane.onyxChainId, lane.minter, 'MAX_FEE_BPS', []),
    call(reader, lane.onyxChainId, lane.minter, 'registry', [lane.wrapper]),
  ]);
  return {
    fee: fee[0].toString(),
    maxFeeBps: Number(maxFeeBps[0].toString()),
    maxMinFee: registry[0].maxMinFee.toString(),
  };
}

const minBig = (values: bigint[]): bigint => values.reduce((a, b) => (b < a ? b : a));
const room = (cap: bigint, used: bigint): bigint => (cap > used ? cap - used : BigInt(0));

// Remaining on-chain capacity for one transfer in `direction` (the API v1 does not expose it):
// deposit = min(escrow custody room, minter rolling 24 h mint room, minter outstanding room);
// exit = min(minter outstanding supply, escrow rolling release room).
export async function readRemainingCapacity(
  reader: ChainReader,
  lane: LaneBinding,
  direction: RhDirection
): Promise<string> {
  const big = (r: { toString(): string }) => BigInt(r.toString());
  if (direction === 'RH_TO_ONYX') {
    const [config, custodied, registry, usage, outstanding] = await Promise.all([
      call(reader, lane.rhChainId, lane.escrow, 'tokenConfig', [lane.token]),
      call(reader, lane.rhChainId, lane.escrow, 'totalCustodied', [lane.token]),
      call(reader, lane.onyxChainId, lane.minter, 'registry', [lane.wrapper]),
      call(reader, lane.onyxChainId, lane.minter, 'mintUsage', [lane.wrapper]),
      call(reader, lane.onyxChainId, lane.minter, 'outstanding', [lane.wrapper]),
    ]);
    return minBig([
      room(big(config.custodyCap), big(custodied[0])),
      room(big(registry[0].mint24hCap), big(usage[0])),
      room(big(registry[0].outstandingCap), big(outstanding[0])),
    ]).toString();
  }
  const [outstanding, config, released] = await Promise.all([
    call(reader, lane.onyxChainId, lane.minter, 'outstanding', [lane.wrapper]),
    call(reader, lane.rhChainId, lane.escrow, 'tokenConfig', [lane.token]),
    call(reader, lane.rhChainId, lane.escrow, 'releaseUsage', [lane.token]),
  ]);
  return minBig([big(outstanding[0]), room(big(config.releaseCap), big(released[0]))]).toString();
}
