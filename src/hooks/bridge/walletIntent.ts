// SPDX-License-Identifier: Apache-2.0
// A preparation guard stops future prompts. It must never discard the result of an issued prompt.
export interface WalletIntentGuard {
  readonly expectedAccount: string;
  readonly expectedChainId?: number;
  assertCurrent(): void;
}
export class StaleBridgeIntent extends Error {
  readonly code = 'STALE_BRIDGE_INTENT';
  constructor() {
    super('Bridge intent changed; review again.');
  }
}
export const isStaleBridgeIntent = (error: unknown): boolean =>
  error instanceof StaleBridgeIntent || (error as { code?: unknown } | null)?.code === 'STALE_BRIDGE_INTENT';

interface WalletLibrary {
  provider?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  send?: (method: string, params: unknown[]) => Promise<unknown>;
}
export async function beforeWalletPrompt(guard: WalletIntentGuard | undefined, library: WalletLibrary): Promise<void> {
  if (!guard) return;
  guard.assertCurrent();
  const request = library.provider?.request
    ? (method: string) => library.provider!.request!({ method })
    : library.send
    ? (method: string) => library.send!(method, [])
    : undefined;
  if (!request) throw new StaleBridgeIntent();
  let accounts: unknown;
  let chain: unknown;
  try {
    [accounts, chain] = await Promise.all([request('eth_accounts'), request('eth_chainId')]);
  } catch {
    throw new StaleBridgeIntent();
  }
  guard.assertCurrent();
  if (
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== guard.expectedAccount.toLowerCase() ||
    (guard.expectedChainId !== undefined && Number(chain) !== guard.expectedChainId)
  )
    throw new StaleBridgeIntent();
}
const PROMPT_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sign',
  'personal_sign',
]);
// Ethers may await gas/population inside a contract invocation. Intercept its final provider send as well.
export function walletLibraryForIntent<T extends WalletLibrary>(library: T, guard?: WalletIntentGuard): T {
  if (!guard) return library;
  return new Proxy(library, {
    get(target, property, receiver) {
      if (property !== 'send' || typeof target.send !== 'function') return Reflect.get(target, property, receiver);
      return async (method: string, params: unknown[]) => {
        if (PROMPT_METHODS.has(method)) {
          await beforeWalletPrompt(guard, target);
          if (method === 'eth_sendTransaction') {
            const tx = params[0] as { from?: unknown; chainId?: unknown } | undefined;
            if (
              !tx ||
              typeof tx.from !== 'string' ||
              tx.from.toLowerCase() !== guard.expectedAccount.toLowerCase() ||
              (tx.chainId !== undefined &&
                guard.expectedChainId !== undefined &&
                Number(tx.chainId) !== guard.expectedChainId)
            )
              throw new StaleBridgeIntent();
          }
          guard.assertCurrent();
        }
        // Nothing checks staleness after this call: its result belongs to the original captured intent.
        return target.send!.call(target, method, params);
      };
    },
  });
}

export interface WalletActionOwner {
  isOwner(): boolean;
  release(): void;
}
let owner: symbol | null = null;
const listeners = new Set<() => void>();
export const walletActionBusy = () => owner !== null;
export function subscribeWalletActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function acquireWalletAction(): WalletActionOwner | null {
  if (owner !== null) return null;
  const token = Symbol('bridge-wallet-action');
  owner = token;
  listeners.forEach((fn) => fn());
  return {
    isOwner: () => owner === token,
    release: () => {
      if (owner === token) {
        owner = null;
        listeners.forEach((fn) => fn());
      }
    },
  };
}
