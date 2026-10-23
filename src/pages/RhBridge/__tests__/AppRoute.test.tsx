// Exercise App's real Route/Switch and lazy import wiring in both build-time flag states.
// App, BridgeForm, NetworkSelector and the RH page are real; unrelated page bodies,
// chrome, legacy form data hooks and network transport are isolated.
const mockSelectNetwork = jest.fn();
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key === 'from' ? 'From' : key === 'toLabel' ? 'To' : key }),
}));
jest.mock('../../../hooks', () => ({ useActiveWeb3React: () => ({ active: false, account: null }) }));
jest.mock('../../../state/application/hooks', () => ({ useWalletModalToggle: () => () => undefined }));
jest.mock('../../../hooks/bridge', () => ({
  useBridgeForm: () => {
    const React = require('react');
    const [origin, setOrigin] = React.useState('SEPOLIA');
    return {
      originNetwork: origin, destinationNetwork: origin === 'SEPOLIA' ? 'GOLIATH' : 'SEPOLIA',
      selectedToken: 'ETH', inputAmount: '', outputAmount: '', originBalance: '0', destinationBalance: '0',
      direction: origin === 'SEPOLIA' ? 'SEPOLIA_TO_GOLIATH' : 'GOLIATH_TO_SEPOLIA',
      validation: { state: 'NOT_CONNECTED', isValid: false, buttonText: { key: 'connectWallet' }, errorMessage: null, disableButton: false },
      setOriginNetwork: (network: string) => { mockSelectNetwork(network); setOrigin(network); },
    };
  },
  useBridgeApprove: () => ({ approve: () => undefined, isLoading: false }),
  useBridgeNetworkSwitch: () => ({ switchNetwork: () => undefined }),
}));
jest.mock('../../../components/bridge', () => ({
  NetworkSelector: require('../../../components/bridge/NetworkSelector').default,
  BridgeAmountInput: () => null, BridgeSummary: () => null, DirectionSwapButton: () => null,
}));
jest.mock('../../../components/Button', () => {
  const button = (props: any) => require('react').createElement('button', props);
  return { ButtonPrimary: button, ButtonError: button };
});
jest.mock('../../../components/Header', () => () => null);
jest.mock('../../../components/Header/Polling', () => () => null);
jest.mock('../../../components/Popups', () => () => null);
jest.mock('../../../components/Loader', () => () => null);
jest.mock('../../../theme/DarkModeQueryParamReader', () => () => null);
jest.mock('../../../components/Web3ReactManager', () => ({ children }: any) => children);
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }), { virtual: true });
jest.mock('../../AddLiquidity', () => () => null);
jest.mock('../../AddLiquidity/redirects', () => ({
  RedirectDuplicateTokenIds: () => null,
  RedirectOldAddLiquidityPathStructure: () => null,
  RedirectToAddLiquidity: () => null,
}));
jest.mock('../../Pool', () => () => null);
jest.mock('../../PoolFinder', () => () => null);
jest.mock('../../RemoveLiquidity', () => () => null);
jest.mock('../../RemoveLiquidity/redirects', () => ({ RedirectOldRemoveLiquidityPathStructure: () => null }));
jest.mock('../../Swap', () => () => require('react').createElement('div', null, 'Swap page'));
jest.mock('../../Swap/redirects', () => ({
  OpenClaimAddressModalAndRedirectToSwap: () => null,
  RedirectPathToSwapOnly: () => require('react').createElement(require('react-router-dom').Redirect, { to: '/swap' }),
}));
jest.mock('../../Bridge', () => () => {
  const React = require('react');
  const { RhBridgeEntryLink } = require('../EntryLink');
  const BridgeForm = require('../../Bridge/BridgeForm').default;
  return React.createElement('div', null, 'Existing bridge', React.createElement(RhBridgeEntryLink), React.createElement(BridgeForm));
});
jest.mock('../../../config/migrationConfig', () => ({ migrationConfig: { migrationEnabled: false } }));
jest.mock('../../../config/stakingConfig', () => ({ stakingConfig: { stakingEnabled: false } }));

const FLAG = 'REACT_APP_RH_TESTNET_BRIDGE_ENABLED';

beforeEach(() => {
  mockSelectNetwork.mockClear();
  mockDispatch.mockClear();
  window.localStorage.clear();
});

async function mount(flag: boolean, path: string, exercise?: (view: any) => Promise<void>) {
  jest.resetModules();
  const previous = process.env[FLAG];
  if (flag) process.env[FLAG] = 'true';
  else delete process.env[FLAG];
  const React = require('react');
  const ReactDOM = require('react-dom');
  const { act } = require('react-dom/test-utils');
  const { MemoryRouter, useLocation } = require('react-router-dom');
  const { ThemeProvider } = require('styled-components');
  const App = require('../../App').default;
  const theme = require('../../../theme').theme(false);
  const { liveRoutes, jsonResponse } = require('../../../services/rhBridge/__fixtures__');
  const routes = liveRoutes(Date.now());
  const previousFetch = window.fetch;
  window.fetch = jest.fn(async (url: string) => {
    const route = routes[url.replace('https://bridgeapi.testnet.onyx.org', '')];
    if (!route) throw new Error('Unexpected test network request');
    return jsonResponse(url, route.status, route.body);
  }) as any;
  // Import the real entry while the build-time flag is set, as its body is rendered later.
  require('../EntryLink');
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
  let pathname = '';
  function LocationProbe() {
    pathname = useLocation().pathname;
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    ReactDOM.render(
      React.createElement(
        ThemeProvider,
        { theme },
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(App),
          React.createElement(LocationProbe)
        )
      ),
      container
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  // Lazy import resolution schedules a second React render after the initial Suspense commit.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (exercise) {
    await exercise({ container, act, Simulate: require('react-dom/test-utils').Simulate });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  const result = {
    pathname,
    text: container.textContent,
    entry: container.querySelector('a[href="#/bridge/robinhood-testnet"]') !== null,
  };
  act(() => ReactDOM.unmountComponentAtNode(container));
  container.remove();
  window.fetch = previousFetch;
  return result;
}

test('App flag on: RH exact route renders the lazy lane page', async () => {
  const lane = await mount(true, '/bridge/robinhood-testnet', async ({ container }) => {
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Robinhood → Onyx');
  });
  expect(lane.pathname).toBe('/bridge/robinhood-testnet');
  expect(lane.text).toContain('Robinhood ↔ Onyx · TSLA');
  expect(lane.entry).toBe(false);
});

test('App flag off: RH route is unavailable and follows the existing swap fallback', async () => {
  expect(await mount(false, '/bridge/robinhood-testnet')).toEqual({
    pathname: '/swap',
    text: 'Swap page',
    entry: false,
  });
});

test.each([false, true])('App flag %s: existing bridge route remains reachable and entry follows the flag', async (flag) => {
  const bridge = await mount(flag, '/bridge');
  expect(bridge.pathname).toBe('/bridge');
  expect(bridge.text).toContain('Existing bridge');
  expect(bridge.text).not.toContain('Robinhood ↔ Onyx · TSLA');
  expect(bridge.entry).toBe(flag);
});

test.each([false, true])('App flag %s: From menu exposes only the enabled lanes; To remains derived and disabled', async (flag) => {
  await mount(flag, '/bridge', async ({ container, act }) => {
    const from = container.querySelector('button[aria-label="From network"]') as HTMLButtonElement;
    const to = container.querySelector('button[aria-label="To network"]') as HTMLButtonElement;
    expect(to.disabled).toBe(true);
    await act(async () => { to.click(); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    await act(async () => { from.click(); });
    const choices = container.querySelectorAll('[role="menuitemradio"]');
    expect(Array.from(choices).map((item: any) => item.textContent)).toEqual(['SEthereum Sepolia', 'OOnyx Testnet']);
    const navigation = container.querySelector('a[role="menuitem"]');
    expect(!!navigation).toBe(flag);
    if (navigation) {
      expect(navigation.textContent).toContain('Robinhood Chain Testnet');
      expect(navigation.textContent).toContain('TSLA → Onyx Testnet');
      expect(navigation.getAttribute('href')).toBe('/bridge/robinhood-testnet');
    }
  });
});

test('From menu RH link navigates through App to the real TSLA page with Robinhood → Onyx selected', async () => {
  const legacy = '{"keep":"sepolia history"}';
  window.localStorage.setItem('bridge:operations:v2', legacy);
  const lane = await mount(true, '/bridge', async ({ container, act }) => {
    await act(async () => { container.querySelector('button[aria-label="From network"]').click(); });
    await act(async () => { container.querySelector('a[role="menuitem"]').click(); });
  });
  expect(lane.pathname).toBe('/bridge/robinhood-testnet');
  expect(lane.text).toContain('Robinhood ↔ Onyx · TSLA');
  expect(lane.text).toContain('TSLA on Robinhood Chain Testnet');
  expect(lane.text).toContain('Recipient on Onyx Testnet');
  expect(lane.text).toContain('Deposit to Onyx');
  expect(mockSelectNetwork).not.toHaveBeenCalled();
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('bridge:operations:v2')).toBe(legacy);
});

test.each([false, true])('App flag %s: ordinary network choices keep the legacy callback and derived destination', async (flag) => {
  const bridge = await mount(flag, '/bridge', async ({ container, act }) => {
    const trigger = container.querySelector('button[aria-label="From network"]');
    await act(async () => { trigger.click(); });
    await act(async () => { container.querySelectorAll('[role="menuitemradio"]')[1].click(); });
    expect(mockSelectNetwork).toHaveBeenLastCalledWith('GOLIATH');
    expect(container.querySelector('button[aria-label="From network"]').textContent).toContain('Onyx Testnet');
    expect(container.querySelector('button[aria-label="To network"]').textContent).toContain('Ethereum Sepolia');
    await act(async () => { trigger.click(); });
    expect(document.activeElement).toBe(container.querySelectorAll('[role="menuitemradio"]')[1]);
    await act(async () => { container.querySelectorAll('[role="menuitemradio"]')[0].click(); });
    expect(mockSelectNetwork).toHaveBeenLastCalledWith('SEPOLIA');
  });
  expect(bridge.pathname).toBe('/bridge');
});

test('From network menu supports keyboard focus, arrow navigation and Escape', async () => {
  await mount(true, '/bridge', async ({ container, act, Simulate }) => {
    const trigger = container.querySelector('button[aria-label="From network"]');
    await act(async () => { Simulate.keyDown(trigger, { key: 'ArrowDown' }); });
    const items = container.querySelectorAll('[role^="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
    await act(async () => { Simulate.keyDown(items[0], { key: 'End' }); });
    expect(document.activeElement).toBe(items[2]);
    await act(async () => { Simulate.keyDown(items[2], { key: 'Escape' }); });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

test('From network menu closes when focus leaves without changing a network or blocking Tab', async () => {
  await mount(true, '/bridge', async ({ container, act, Simulate }) => {
    const trigger = container.querySelector('button[aria-label="From network"]');
    await act(async () => { trigger.click(); });
    const items = container.querySelectorAll('[role^="menuitem"]');
    await act(async () => { (items[1] as HTMLElement).focus(); });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    const preventDefault = jest.fn();
    await act(async () => {
      Simulate.keyDown(items[1], { key: 'Tab', preventDefault });
      trigger.focus();
    });
    expect(preventDefault).not.toHaveBeenCalled();
    // Focus remains inside the selector, so it stays open until focus actually leaves it.
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try { await act(async () => { outside.focus(); }); }
    finally { outside.remove(); }
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(mockSelectNetwork).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

test('App RH route stays exact: a child path follows the existing swap fallback', async () => {
  expect((await mount(true, '/bridge/robinhood-testnet/unknown')).pathname).toBe('/swap');
});

export {};
