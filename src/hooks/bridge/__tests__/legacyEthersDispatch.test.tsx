// SPDX-License-Identifier: Apache-2.0
// Real installed Ethers Contract population, signer dispatch and final provider guard; only RPC/mining are in memory.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ethers } from 'ethers';
import { useBridgeDeposit } from '../useBridgeDeposit';
import { useBridgeBurn } from '../useBridgeBurn';
import { useBridgeApprove } from '../useBridgeApprove';
import { StaleBridgeIntent } from '../walletIntent';
import { BridgeNetwork } from '../../../constants/bridge/networks';
import { BRIDGE_SEPOLIA_ABI, BRIDGE_GOLIATH_ABI, ERC20_ABI } from '../../../constants/bridge/abis';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const HASH = '0x' + 'a'.repeat(64);
let mockWallet: any;
const mockDispatch = jest.fn();
jest.mock('../../index', () => ({ useActiveWeb3React: () => mockWallet }));
jest.mock('../../useProviderReady', () => ({
  useProviderReady: () => ({ isReady: true, recheckProvider: () => undefined }),
}));
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('uuid', () => ({ v4: () => 'real-ethers-operation' }));

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function fixture(chain: number) {
  const state = { chain, account: ACCOUNT, generation: 0, expiry: Date.now() + 30000, owner: true };
  const requests: { method: string; params: any[] }[] = [];
  const gates: {
    gas?: Deferred<string>;
    wallet?: Deferred<string>;
    gasEntered?: Deferred<void>;
    walletEntered?: Deferred<void>;
  } = {};
  const request = async ({ method, params = [] }: { method: string; params?: any[] }) => {
    requests.push({ method, params });
    if (method === 'eth_chainId') return '0x' + state.chain.toString(16);
    if (method === 'eth_accounts') return [state.account];
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_estimateGas') {
      gates.gasEntered?.resolve();
      return gates.gas?.promise ?? '0x5208';
    }
    if (method === 'eth_sendTransaction') {
      gates.walletEntered?.resolve();
      return gates.wallet?.promise ?? HASH;
    }
    throw Error('Unexpected offline RPC ' + method);
  };
  const library = new ethers.providers.Web3Provider({ request }, 'any');
  // Mining/tracking is isolated; Contract population and JsonRpcSigner send/serialization stay real.
  jest.spyOn(library, 'getTransaction').mockResolvedValue({ hash: HASH, wait: async () => ({ status: 1 }) } as any);
  jest.spyOn(library as any, '_wrapTransaction').mockImplementation((tx: any) => tx);
  mockWallet = { account: ACCOUNT, chainId: chain, library };
  const guard = {
    expectedAccount: ACCOUNT,
    expectedChainId: chain,
    assertCurrent() {
      if (state.generation || !state.owner || Date.now() >= state.expiry) throw new StaleBridgeIntent();
    },
  };
  return {
    state,
    requests,
    gates,
    library,
    guard,
    sends: () => requests.filter((r) => r.method === 'eth_sendTransaction'),
  };
}
async function mount() {
  let hooks!: {
    deposit: ReturnType<typeof useBridgeDeposit>;
    burn: ReturnType<typeof useBridgeBurn>;
    approve: ReturnType<typeof useBridgeApprove>;
  };
  function Harness() {
    hooks = {
      deposit: useBridgeDeposit(),
      burn: useBridgeBurn(),
      approve: useBridgeApprove(
        'USDC',
        mockWallet.chainId === 11155111 ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH,
        '0.01'
      ),
    };
    return null;
  }
  const div = document.createElement('div');
  act(() => ReactDOM.render(<Harness />, div));
  return {
    current: () => hooks,
    close: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(div);
      }),
  };
}
const kinds = ['native-deposit', 'token-deposit', 'burn', 'approve-sepolia', 'approve-onyx'];
function invoke(view: Awaited<ReturnType<typeof mount>>, kind: string, guard: ReturnType<typeof fixture>['guard']) {
  return kind.startsWith('approve')
    ? view.current().approve.approve(guard)
    : kind === 'burn'
    ? view.current().burn.burn('ETH', '0.01', ACCOUNT, guard)
    : view.current().deposit.deposit(kind === 'native-deposit' ? 'ETH' : 'USDC', '0.01', ACCOUNT, guard);
}
beforeEach(() => {
  mockDispatch.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test.each(kinds)(
  'installed Ethers 5.3 actual hook dispatches %s with supported population and guarded signer',
  async (kind) => {
    expect(ethers.version).toBe('ethers/5.3.0');
    const chain = kind === 'burn' || kind === 'approve-onyx' ? 8901 : 11155111;
    const x = fixture(chain),
      view = await mount();
    const dispatch = jest.spyOn(ethers.providers.JsonRpcSigner.prototype, 'sendTransaction');
    try {
      let result: unknown, error: unknown;
      await act(async () => {
        try {
          result = kind.startsWith('approve')
            ? await view.current().approve.approve(x.guard)
            : kind === 'burn'
            ? await view.current().burn.burn('ETH', '0.01', ACCOUNT, x.guard)
            : await view
                .current()
                .deposit.deposit(kind === 'native-deposit' ? 'ETH' : 'USDC', '0.01', ACCOUNT, x.guard);
        } catch (e) {
          error = e;
        }
      });
      expect(error).toBeUndefined();
      expect(result).toBe(kind.startsWith('approve') ? true : 'real-ethers-operation');
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ chainId: chain }));
      expect(x.sends()).toHaveLength(1);
      const wire = x.sends()[0].params[0];
      expect(wire.from.toLowerCase()).toBe(ACCOUNT);
      const abi = new ethers.utils.Interface(
        kind.startsWith('approve') ? ERC20_ABI : kind === 'burn' ? BRIDGE_GOLIATH_ABI : BRIDGE_SEPOLIA_ABI
      );
      const decoded = abi.parseTransaction({ data: wire.data, value: wire.value });
      expect(decoded.name).toBe(
        kind.startsWith('approve')
          ? 'approve'
          : kind === 'burn'
          ? 'burn'
          : kind === 'native-deposit'
          ? 'depositNative'
          : 'deposit'
      );
      expect(BigInt(wire.value ?? '0')).toBe(kind === 'native-deposit' ? BigInt('10000000000000000') : BigInt(0));
      if (!kind.startsWith('approve'))
        expect(mockDispatch.mock.calls.some(([a]) => a.payload?.originTxHash === HASH)).toBe(true);
    } finally {
      view.close();
      x.library.removeAllListeners();
    }
  }
);

test.each(
  kinds.flatMap((kind) => ['account', 'chain', 'account-return', 'expiry', 'owner'].map((change) => [kind, change]))
)('real Ethers %s gas await cannot issue a wallet prompt after %s invalidation', async (kind, change) => {
  const x = fixture(kind === 'burn' || kind === 'approve-onyx' ? 8901 : 11155111),
    view = await mount();
  x.gates.gas = deferred<string>();
  x.gates.gasEntered = deferred<void>();
  let result: unknown, error: any, action!: Promise<void>;
  try {
    await act(async () => {
      action = (async () => {
        try {
          result = await invoke(view, kind, x.guard);
        } catch (e) {
          error = e;
        }
      })();
      await x.gates.gasEntered!.promise;
    });
    if (change === 'account') x.state.account = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
    if (change === 'chain') x.state.chain = x.state.chain === 8901 ? 11155111 : 8901;
    if (change === 'account-return') {
      x.state.account = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
      x.state.generation++;
      x.state.account = ACCOUNT;
      x.state.generation++;
    }
    if (change === 'expiry') x.state.expiry = Date.now() - 1;
    if (change === 'owner') x.state.owner = false;
    await act(async () => {
      x.gates.gas!.resolve('0x5208');
      await action;
    });
    expect(x.sends()).toHaveLength(0);
    if (kind.startsWith('approve')) expect(result).toBe(false);
    else expect(error).toMatchObject({ code: 'STALE_BRIDGE_INTENT' });
  } finally {
    view.close();
    x.library.removeAllListeners();
  }
});

test.each(kinds)('real Ethers %s retains an already-issued result for the original operation', async (kind) => {
  const x = fixture(kind === 'burn' || kind === 'approve-onyx' ? 8901 : 11155111),
    view = await mount();
  x.gates.wallet = deferred<string>();
  x.gates.walletEntered = deferred<void>();
  let action!: Promise<unknown>;
  try {
    await act(async () => {
      action = invoke(view, kind, x.guard);
      await x.gates.walletEntered!.promise;
    });
    expect(x.sends()).toHaveLength(1);
    x.state.account = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
    x.state.chain = x.state.chain === 8901 ? 11155111 : 8901;
    x.state.generation++;
    let result: unknown;
    await act(async () => {
      x.gates.wallet!.resolve(HASH);
      result = await action;
    });
    expect(result).toBe(kind.startsWith('approve') ? true : 'real-ethers-operation');
    expect(x.sends()).toHaveLength(1);
    if (!kind.startsWith('approve'))
      expect(
        mockDispatch.mock.calls.some(([a]) => a.payload?.originTxHash === HASH && a.payload.sender === ACCOUNT)
      ).toBe(true);
  } finally {
    view.close();
    x.library.removeAllListeners();
  }
});
