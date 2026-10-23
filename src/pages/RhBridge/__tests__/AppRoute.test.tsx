// Exercise App's real Route/Switch and lazy import wiring in both build-time flag states.
// Page bodies and app chrome are isolated; RH configuration and entry link remain real.
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
  return React.createElement('div', null, 'Existing bridge', React.createElement(RhBridgeEntryLink));
});
jest.mock('../index', () => () => require('react').createElement('div', null, 'Robinhood lane page'));
jest.mock('../../../config/migrationConfig', () => ({ migrationConfig: { migrationEnabled: false } }));
jest.mock('../../../config/stakingConfig', () => ({ stakingConfig: { stakingEnabled: false } }));

const FLAG = 'REACT_APP_RH_TESTNET_BRIDGE_ENABLED';

async function mount(flag: boolean, path: string) {
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
        { theme: { flexRowNoWrap: '' } },
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
  const result = {
    pathname,
    text: container.textContent,
    entry: container.querySelector('a[href="#/bridge/robinhood-testnet"]') !== null,
  };
  act(() => ReactDOM.unmountComponentAtNode(container));
  container.remove();
  return result;
}

test('App flag on: RH exact route renders the lazy lane page', async () => {
  expect(await mount(true, '/bridge/robinhood-testnet')).toEqual({
    pathname: '/bridge/robinhood-testnet',
    text: 'Robinhood lane page',
    entry: false,
  });
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
  expect(bridge.text).not.toContain('Robinhood lane page');
  expect(bridge.entry).toBe(flag);
});

test('App RH route stays exact: a child path follows the existing swap fallback', async () => {
  expect((await mount(true, '/bridge/robinhood-testnet/unknown')).pathname).toBe('/swap');
});

export {};
