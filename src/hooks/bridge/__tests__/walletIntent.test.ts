// SPDX-License-Identifier: Apache-2.0
import { ethers } from 'ethers';
import {
  acquireWalletAction,
  beforeWalletPrompt,
  StaleBridgeIntent,
  walletActionBusy,
  walletLibraryForIntent,
} from '../walletIntent';
import type { WalletIntentGuard } from '../walletIntent';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const TO = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function intent() {
  const state = { valid: true };
  const guard: WalletIntentGuard = {
    expectedAccount: ACCOUNT,
    expectedChainId: 11155111,
    assertCurrent: () => {
      if (!state.valid) throw new StaleBridgeIntent();
    },
  };
  return { state, guard };
}
test('only the matching wallet-action owner can release a lease', () => {
  const first = acquireWalletAction()!;
  expect(first.isOwner()).toBe(true);
  expect(acquireWalletAction()).toBeNull();
  first.release();
  const second = acquireWalletAction()!;
  first.release();
  expect(second.isOwner()).toBe(true);
  expect(walletActionBusy()).toBe(true);
  second.release();
  expect(walletActionBusy()).toBe(false);
});
test('wallet context preparation rechecks generation after awaiting accounts', async () => {
  const { state, guard } = intent();
  const accounts = deferred<string[]>();
  const library = {
    provider: {
      request: async ({ method }: { method: string }) => (method === 'eth_accounts' ? accounts.promise : '0xaa36a7'),
    },
  };
  const preparing = beforeWalletPrompt(guard, library);
  state.valid = false;
  accounts.resolve([ACCOUNT]);
  await expect(preparing).rejects.toMatchObject({ code: 'STALE_BRIDGE_INTENT' });
});
test.each([
  [TO, '0xaa36a7'],
  [ACCOUNT, '0x22c5'],
])('wallet account/chain mismatch is rejected at the final boundary', async (account, chain) => {
  const { guard } = intent();
  await expect(
    beforeWalletPrompt(guard, {
      provider: { request: async ({ method }) => (method === 'eth_accounts' ? [account] : chain) },
    })
  ).rejects.toMatchObject({ code: 'STALE_BRIDGE_INTENT' });
});
test('real ethers gas population cannot forward a stale send to the wallet', async () => {
  const { state, guard } = intent();
  const gas = deferred<string>();
  const estimating = deferred<void>();
  const request = jest.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_accounts') return [ACCOUNT];
    if (method === 'eth_estimateGas') {
      estimating.resolve();
      return gas.promise;
    }
    if (method === 'eth_sendTransaction') throw new Error('A stale prompt reached the wallet');
    throw new Error('Unexpected fixture RPC ' + method);
  });
  const library = new ethers.providers.Web3Provider({ request }, 'any');
  const originalSend = library.send;
  const scoped = walletLibraryForIntent(library, guard);
  const sending = scoped.getSigner(ACCOUNT).sendUncheckedTransaction({ to: TO, value: '0x1', chainId: 11155111 });
  await estimating.promise;
  state.valid = false;
  gas.resolve('0x5208');
  await expect(sending).rejects.toMatchObject({ code: 'STALE_BRIDGE_INTENT' });
  expect(request.mock.calls.filter(([r]) => r.method === 'eth_sendTransaction')).toHaveLength(0);
  expect(library.send).toBe(originalSend);
});
test('an issued wallet send returns its original hash despite later selection changes', async () => {
  const { state, guard } = intent();
  const wallet = deferred<string>();
  const issued = deferred<void>();
  const request = jest.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_accounts') return [ACCOUNT];
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_sendTransaction') {
      issued.resolve();
      return wallet.promise;
    }
    throw new Error('Unexpected fixture RPC');
  });
  const library = new ethers.providers.Web3Provider({ request }, 'any');
  const sending = walletLibraryForIntent(library, guard).send('eth_sendTransaction', [
    { from: ACCOUNT, to: TO, chainId: '0xaa36a7', value: '0x1' },
  ]);
  await issued.promise;
  state.valid = false;
  const hash = '0x' + 'a'.repeat(64);
  wallet.resolve(hash);
  await expect(sending).resolves.toBe(hash);
});
