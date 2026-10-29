/**
 * Regression (M2): Robinhood Chain Testnet (46630) is accepted by the injected connector ONLY
 * when REACT_APP_RH_TESTNET_BRIDGE_ENABLED=true. With the flag off the connector is exactly the
 * live one ([8901, 11155111]); Onyx Testnet and Sepolia behave the same either way, and every
 * other chain still produces the unsupported-network state.
 */
import { validateBridgeInput } from '../../utils/bridge/validation';
import { BridgeNetwork } from '../../constants/bridge/networks';

const ACCOUNT = '0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A';
const FLAG = 'REACT_APP_RH_TESTNET_BRIDGE_ENABLED';

// Fresh module registry with the flag set as at build time; everything React-related is
// required inside it so hooks and the renderer share one React instance.
function load(flag: boolean) {
  const previous = process.env[FLAG];
  let mods: any;
  jest.isolateModules(() => {
    if (flag) process.env[FLAG] = 'true';
    else delete process.env[FLAG];
    mods = {
      React: require('react'),
      ReactDOM: require('react-dom'),
      act: require('react-dom/test-utils').act,
      core: require('@web3-react/core'),
      Web3Provider: require('@ethersproject/providers').Web3Provider,
      injected: require('../index').injected,
    };
  });
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
  return mods;
}

function installEthereum(chainId: number) {
  const hex = '0x' + chainId.toString(16);
  const answer = (method: string) => {
    if (method === 'eth_chainId') return hex;
    if (method === 'net_version') return String(chainId);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCOUNT];
    throw new Error('unsupported ' + method);
  };
  (window as any).ethereum = {
    isMetaMask: true,
    send: jest.fn(async (method: string) => ({ result: answer(method) })),
    request: jest.fn(async ({ method }: { method: string }) => answer(method)),
    on: jest.fn(),
    removeListener: jest.fn(),
  };
}

async function activateOn(
  flag: boolean,
  chainId: number
): Promise<{ chainId?: number; account?: string | null; error?: Error }> {
  const m = load(flag);
  installEthereum(chainId);
  const result: { chainId?: number; account?: string | null; error?: Error } = {};
  function Probe() {
    const { activate, chainId: active, account } = m.core.useWeb3React();
    m.React.useEffect(() => {
      activate(m.injected, undefined, true).catch((error: Error) => (result.error = error));
    }, [activate]);
    result.chainId = active;
    result.account = account;
    return null;
  }
  const container = document.createElement('div');
  await m.act(async () => {
    m.ReactDOM.render(
      m.React.createElement(
        m.core.Web3ReactProvider,
        { getLibrary: (p: any) => new m.Web3Provider(p) },
        m.React.createElement(Probe)
      ),
      container
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  m.act(() => {
    m.ReactDOM.unmountComponentAtNode(container);
  });
  delete (window as any).ethereum;
  return {
    ...result,
    error:
      result.error &&
      Object.assign(result.error, { isUnsupported: result.error instanceof m.core.UnsupportedChainIdError }),
  };
}

test('flag off: the connector is exactly the live one; flag on: Robinhood Chain Testnet is added', () => {
  expect(load(false).injected.supportedChainIds).toEqual([8901, 11155111]);
  expect(load(true).injected.supportedChainIds).toEqual([8901, 11155111, 46630]);
  expect(load(true).injected.supportedChainIds).not.toContain(327); // Onyx mainnet stays unsupported
});

describe.each([false, true])('flag %s', (flag) => {
  test.each([8901, 11155111])('activation on %i succeeds with the account', async (chainId) => {
    const result = await activateOn(flag, chainId);
    expect(result.error).toBeUndefined();
    expect(result.chainId).toBe(chainId);
    expect(result.account).toBe(ACCOUNT);
  });

  test.each([1, 137, 327, 46631])(
    'activation on unsupported chain %i fails with UnsupportedChainIdError',
    async (chainId) => {
      const result = await activateOn(flag, chainId);
      expect((result.error as any)?.isUnsupported).toBe(true);
      expect(result.account).toBeUndefined();
    }
  );
});

test('46630 is unsupported with the flag off (as live) and supported with it on', async () => {
  const off = await activateOn(false, 46630);
  expect((off.error as any)?.isUnsupported).toBe(true);
  expect(off.account).toBeUndefined();
  const on = await activateOn(true, 46630);
  expect(on.error).toBeUndefined();
  expect(on).toMatchObject({ chainId: 46630, account: ACCOUNT });
});

describe('existing Sepolia <-> Onyx bridge form is unchanged on 8901 and 11155111 and refuses 46630', () => {
  const base = {
    account: ACCOUNT,
    selectedToken: 'XCN' as const,
    inputAmount: '1',
    originBalance: '10',
    minAmount: '0.000001',
    bridgeEnabled: true,
  };
  test.each([
    [BridgeNetwork.SEPOLIA, 11155111, 'READY'],
    [BridgeNetwork.GOLIATH, 8901, 'READY'],
    [BridgeNetwork.SEPOLIA, 8901, 'WRONG_NETWORK'],
    [BridgeNetwork.GOLIATH, 11155111, 'WRONG_NETWORK'],
    [BridgeNetwork.SEPOLIA, 46630, 'WRONG_NETWORK'],
    [BridgeNetwork.GOLIATH, 46630, 'WRONG_NETWORK'],
  ])('origin %s on chain %i -> %s', (originNetwork, chainId, state) => {
    expect(validateBridgeInput({ ...base, originNetwork, chainId }).state).toBe(state);
  });
});
