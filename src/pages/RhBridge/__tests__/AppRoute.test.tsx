// Exercise App's real Route/Switch and lazy import wiring in both build-time flag states.
// App, BridgeForm, NetworkSelector and the RH page are real; unrelated page bodies,
// chrome, legacy form data hooks and network transport are isolated.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'from' ? 'From' : key === 'toLabel' ? 'To' : key) }),
}));
let mockWallet: any = { active: false, account: null };
jest.mock('../../../hooks', () => ({ useActiveWeb3React: () => mockWallet }));
jest.mock('../../../state/application/hooks', () => ({ useWalletModalToggle: () => () => undefined }));
jest.mock('../../../hooks/useProviderReady', () => ({
  useProviderReady: () => ({ isReady: true, recheckProvider: () => undefined }),
}));
jest.mock('uuid', () => ({ v4: () => 'test-operation-id' }));
jest.mock('../../../components/Settings', () => () => null);
jest.mock('../../../components/NavigationTabs', () => ({ SwapPoolBridgeTabs: () => null }));
jest.mock(
  '../../AppBody',
  () =>
    ({ children }: any) =>
      require('react').createElement('div', null, children)
);
jest.mock('../../../components/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: any) => (isOpen ? children : null),
}));
jest.mock('../../../components/Button', () => {
  const button = (props: any) => require('react').createElement('button', props);
  return { ButtonPrimary: button, ButtonError: button, ButtonOutlined: button };
});
jest.mock('../../../components/Header', () => () => null);
jest.mock('../../../components/Header/Polling', () => () => null);
jest.mock('../../../components/Popups', () => () => null);
jest.mock('../../../components/Loader', () => () => null);
jest.mock('../../../theme/DarkModeQueryParamReader', () => () => null);
jest.mock(
  '../../../components/Web3ReactManager',
  () =>
    ({ children }: any) =>
      children
);
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
jest.mock('../../../config/migrationConfig', () => ({ migrationConfig: { migrationEnabled: false } }));
jest.mock('../../../config/stakingConfig', () => ({ stakingConfig: { stakingEnabled: false } }));

const FLAG = 'REACT_APP_RH_TESTNET_BRIDGE_ENABLED';

beforeEach(() => {
  window.localStorage.clear();
  mockWallet = { active: false, account: null };
});

async function mount(flag: boolean, path: string, exercise?: (view: any) => Promise<void>, runtime?: () => any) {
  jest.resetModules();
  const previous = process.env[FLAG];
  if (flag) process.env[FLAG] = 'true';
  else delete process.env[FLAG];
  const React = require('react');
  const ReactDOM = require('react-dom');
  const { act } = require('react-dom/test-utils');
  const { MemoryRouter, useLocation } = require('react-router-dom');
  const { Provider } = require('react-redux');
  const { configureStore } = require('@reduxjs/toolkit');
  const store = configureStore({ reducer: { bridge: require('../../../state/bridge/reducer').default } });
  const { ThemeProvider } = require('styled-components');
  const App = require('../../App').default;
  const bridgeDeps = runtime?.();
  const theme = require('../../../theme').theme(false);
  const { liveRoutes, jsonResponse } = require('../../../services/rhBridge/__fixtures__');
  const routes = liveRoutes(Date.now());
  const previousFetch = window.fetch;
  window.fetch = jest.fn(async (url: string) => {
    if (url.includes('/api/v1/bridge/limits')) return jsonResponse(url, 200, {});
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
  const rerender = () =>
    ReactDOM.render(
      React.createElement(
        ThemeProvider,
        { theme },
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Provider, { store }, React.createElement(App, { bridgeDeps })),
          React.createElement(LocationProbe)
        )
      ),
      container
    );
  await act(async () => {
    rerender();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  // Lazy import resolution schedules a second React render after the initial Suspense commit.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (exercise) {
    await exercise({ container, act, store, rerender, Simulate: require('react-dom/test-utils').Simulate });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  const result = {
    pathname,
    text: container.textContent,
    entry: container.querySelector('a[href="#/bridge/robinhood-testnet"]') !== null,
    standard: container.querySelector('[data-testid="standard-bridge-form"]') !== null,
  };
  act(() => ReactDOM.unmountComponentAtNode(container));
  container.remove();
  window.fetch = previousFetch;
  return result;
}

test('App flag on: RH exact route replaces once into the actual standard RH/Onyx TSLA card', async () => {
  const lane = await mount(true, '/bridge/robinhood-testnet', async ({ container, store }) => {
    expect(container.querySelector('[data-testid="standard-bridge-form"]')).not.toBeNull();
    expect(store.getState().bridge.form).toMatchObject({
      originNetwork: 'ROBINHOOD',
      destinationNetwork: 'GOLIATH',
      selectedAssetKey: 'TSLA',
    });
  });
  expect(lane.pathname).toBe('/bridge');
  expect(lane.text).not.toContain('Robinhood ↔ Onyx · TSLA');
  expect(lane.entry).toBe(false);
});

test('actual App + real RH controller/Session native adapter encodes exact native value without approval', async () => {
  let fixture: any;
  await mount(
    true,
    '/bridge',
    async ({ container, act, store, Simulate }) => {
      const { bridgeActions } = require('../../../state/bridge/reducer');
      const input = container.querySelector('input');
      await act(async () => {
        store.dispatch(
          bridgeActions.hydrateForm({
            originNetwork: 'ROBINHOOD',
            destinationNetwork: 'GOLIATH',
            selectedAssetKey: 'RH_ETH',
            inputAmount: '0.0001',
            recipient: null,
          })
        );
        await new Promise((r) => setTimeout(r, 350));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });
      expect(container.querySelector('input')).toBe(input);
      expect(container.querySelector('[aria-label="Balances"]').textContent).toContain('0.001 ETH');
      expect(container.querySelector('[aria-label="Bridge summary"]').textContent).toContain('0.001 ETH');
      const first = Array.from(container.querySelectorAll('button')).find(
        (b: any) => b.textContent === 'confirmBridge'
      ) as HTMLButtonElement;
      expect(first.disabled).toBe(false);
      await act(async () => {
        first.click();
      });
      await act(async () => {
        const all = Array.from(container.querySelectorAll('button')).filter(
          (b: any) => b.textContent === 'confirmBridge'
        );
        (all[all.length - 1] as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 15));
      });
      expect(fixture.state.sends).toHaveLength(1);
      const native = fixture.catalog.current('RH_ETH').descriptor,
        tx = fixture.state.sends[0];
      expect(tx).toMatchObject({
        to: native.escrow.address,
        from: fixture.state.account,
        chainId: '0xb626',
        value: '0x5af3107a4000',
      });
      const parsed = require('../../../services/rhBridge/lane').LANE_ABI.parseTransaction({ data: tx.data });
      expect(parsed.name).toBe('depositNative');
      expect(parsed.args[0].toLowerCase()).toBe(fixture.state.account);
      expect(
        fixture.state.calls.some(
          (c: any) => c.chainId === 46630 && ['allowance', 'approve', 'balanceOf', 'decimals'].includes(c.method)
        )
      ).toBe(false);
      expect(JSON.parse(fixture.storageData.values().next().value)[0]).toMatchObject({
        schemaVersion: 2,
        assetBinding: native.binding,
        sourceTxHash: '0x' + 'd'.repeat(64),
        grossRaw: '100000000000000',
      });
    },
    () => {
      fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
      mockWallet = {
        active: true,
        account: fixture.state.account,
        chainId: 46630,
        connector: require('../../../connectors').injected,
        library: { provider: fixture.provider },
      };
      return fixture.deps;
    }
  );
});

test('actual App reviewed native pins cannot authorize actions against a different backend registry', async () => {
  let fixture: any;
  await mount(
    true,
    '/bridge',
    async ({ container, act, store }) => {
      const { bridgeActions } = require('../../../state/bridge/reducer');
      await act(async () => {
        store.dispatch(
          bridgeActions.hydrateForm({
            originNetwork: 'ROBINHOOD',
            destinationNetwork: 'GOLIATH',
            selectedAssetKey: 'RH_ETH',
            inputAmount: '0.0001',
            recipient: null,
          })
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });
      expect(container.textContent).toContain('Not available');
      expect(container.querySelector('[data-testid="standard-bridge-form"]')).not.toBeNull();
      const confirm = Array.from(container.querySelectorAll('button')).find(
        (button: any) => button.textContent === 'confirmBridge'
      ) as HTMLButtonElement;
      expect(confirm.disabled).toBe(true);
      expect(Array.from(container.querySelectorAll('button')).some((button: any) => button.textContent === 'MAX')).toBe(
        false
      );
      expect(
        fixture.state.requests.some((url: string) =>
          url.includes('assetId=RH_ETH&profileSha256=3dde968a2121f9b94482240df81492d91fdcefbc53727b1b0bbd9c9b7cb8bee2')
        )
      ).toBe(true);
      expect(fixture.state.sends).toEqual([]);
    },
    () => {
      fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
      mockWallet = {
        active: true,
        account: fixture.state.account,
        chainId: 46630,
        connector: require('../../../connectors').injected,
        library: { provider: fixture.provider },
      };
      return {
        ...fixture.deps,
        v2: { ...fixture.deps.v2, catalog: require('../../../config/rhBridge/profiles').REVIEWED_PROFILES },
      };
    }
  );
});

test('actual App native MAX fills a blank amount from fresh gas-bounded data before an amount quote exists', async () => {
  let fixture: any;
  await mount(
    true,
    '/bridge',
    async ({ container, act, store }) => {
      const { bridgeActions } = require('../../../state/bridge/reducer');
      await act(async () => {
        store.dispatch(
          bridgeActions.hydrateForm({
            originNetwork: 'ROBINHOOD',
            destinationNetwork: 'GOLIATH',
            selectedAssetKey: 'RH_ETH',
            inputAmount: '',
            recipient: null,
          })
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });
      expect(container.querySelector('[aria-label="Bridge summary"]').textContent).toContain('Not available');
      const max = Array.from(container.querySelectorAll('button')).find(
        (button: any) => button.textContent === 'MAX'
      ) as HTMLButtonElement;
      expect(max).toBeDefined();
      await act(async () => {
        max.click();
      });
      expect(store.getState().bridge.form.inputAmount).toBe('0.0009748');
      expect(fixture.state.sends).toHaveLength(0);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });
      const confirm = Array.from(container.querySelectorAll('button')).find(
        (button: any) => button.textContent === 'confirmBridge'
      ) as HTMLButtonElement;
      expect(confirm.disabled).toBe(false);
      expect(fixture.state.sends).toHaveLength(0);
    },
    () => {
      fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
      mockWallet = {
        active: true,
        account: fixture.state.account,
        chainId: 46630,
        connector: require('../../../connectors').injected,
        library: { provider: fixture.provider },
      };
      return fixture.deps;
    }
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function startNative({ container, act, store }: any) {
  const { bridgeActions } = require('../../../state/bridge/reducer');
  await act(async () => {
    store.dispatch(
      bridgeActions.hydrateForm({
        originNetwork: 'ROBINHOOD',
        destinationNetwork: 'GOLIATH',
        selectedAssetKey: 'RH_ETH',
        inputAmount: '0.0001',
        recipient: null,
      })
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
  await act(async () => {
    (
      Array.from(container.querySelectorAll('button')).find(
        (b: any) => b.textContent === 'confirmBridge'
      ) as HTMLButtonElement
    ).click();
  });
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll('button')).filter(
      (b: any) => b.textContent === 'confirmBridge'
    );
    (buttons[buttons.length - 1] as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 350));
  });
}
test.each(['source', 'asset', 'amount', 'recipient', 'account', 'wallet-chain', 'provider'])(
  'real App/Session/RH controller: %s away-and-back while nonce awaits never revives a native prompt',
  async (change) => {
    const nonce = deferred<number>();
    let fixture: any;
    await mount(
      true,
      '/bridge',
      async (view) => {
        await startNative(view);
        expect(fixture.state.sends).toHaveLength(0);
        const { act, store, rerender } = view,
          { bridgeActions } = require('../../../state/bridge/reducer'),
          form = { ...store.getState().bridge.form },
          wallet = mockWallet;
        try {
          if (['source', 'asset', 'amount', 'recipient'].includes(change))
            await act(async () => {
              if (change === 'source') store.dispatch(bridgeActions.setOriginNetwork('GOLIATH'));
              if (change === 'asset') store.dispatch(bridgeActions.setSelectedAsset('TSLA'));
              if (change === 'amount') store.dispatch(bridgeActions.setInputAmount('0.0002'));
              if (change === 'recipient')
                store.dispatch(bridgeActions.setRecipient('0xaa91057c8f98af30c44bb8708399bf4daa188a81'));
              store.dispatch(bridgeActions.hydrateForm(form));
            });
          else {
            await act(async () => {
              mockWallet = {
                ...wallet,
                ...(change === 'account'
                  ? { account: '0xaa91057c8f98af30c44bb8708399bf4daa188a81' }
                  : change === 'wallet-chain'
                  ? { chainId: 8901 }
                  : { library: { provider: { request: fixture.provider.request } } }),
              };
              rerender();
            });
            await act(async () => {
              mockWallet = wallet;
              rerender();
            });
          }
        } finally {
          await act(async () => {
            nonce.resolve(0);
            await new Promise((r) => setTimeout(r, 350));
          });
        }
        expect(fixture.state.sends).toHaveLength(0);
        expect(JSON.parse(fixture.storageData.values().next().value)[0].stage).toBe('FAILED');
      },
      () => {
        fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
        fixture.state.nonce = nonce.promise;
        mockWallet = {
          active: true,
          account: fixture.state.account,
          chainId: 46630,
          connector: require('../../../connectors').injected,
          library: { provider: fixture.provider },
        };
        return fixture.deps;
      }
    );
  }
);
test('real App keeps the one active controller and attaches an issued native hash to its original profile after selection changes', async () => {
  const walletResult = deferred<string>();
  let fixture: any;
  await mount(
    true,
    '/bridge',
    async (view) => {
      await startNative(view);
      expect(fixture.state.sends).toHaveLength(1);
      const { act, store } = view,
        { bridgeActions } = require('../../../state/bridge/reducer');
      await act(async () => {
        store.dispatch(bridgeActions.setSelectedAsset('TSLA'));
        walletResult.resolve('0x' + 'e'.repeat(64));
        await new Promise((r) => setTimeout(r, 350));
      });
      const records = JSON.parse(fixture.storageData.values().next().value);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        assetBinding: fixture.catalog.current('RH_ETH').descriptor.binding,
        stage: 'SOURCE_PENDING',
        sourceTxHash: '0x' + 'e'.repeat(64),
        grossRaw: '100000000000000',
        failure: null,
      });
      expect(fixture.state.sends).toHaveLength(1);
      expect(view.container.textContent).toContain('ETH · Robinhood-backed');
    },
    () => {
      fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
      fixture.state.walletResult = walletResult.promise;
      mockWallet = {
        active: true,
        account: fixture.state.account,
        chainId: 46630,
        connector: require('../../../connectors').injected,
        library: { provider: fixture.provider },
      };
      return fixture.deps;
    }
  );
});

test('App flag off: exact old RH URL replaces into safe standard Sepolia/Onyx selection', async () => {
  const result = await mount(false, '/bridge/robinhood-testnet', async ({ store }) => {
    expect(store.getState().bridge.form).toMatchObject({
      originNetwork: 'SEPOLIA',
      destinationNetwork: 'GOLIATH',
      selectedAssetKey: 'SEPOLIA_ETH',
    });
  });
  expect(result.pathname).toBe('/bridge');
  expect(result.standard).toBe(true);
});

test.each([false, true])(
  'App flag %s: standard bridge route remains reachable without a separate-page banner',
  async (flag) => {
    const bridge = await mount(flag, '/bridge');
    expect(bridge.pathname).toBe('/bridge');
    expect(bridge.standard).toBe(true);
    expect(bridge.text).not.toContain('Robinhood ↔ Onyx · TSLA');
    expect(bridge.entry).toBe(false);
  }
);

test.each([false, true])(
  'App flag %s: From menu exposes allowed networks as selections; external To has one choice',
  async (flag) => {
    await mount(flag, '/bridge', async ({ container, act }) => {
      const from = container.querySelector('button[aria-label="From network"]') as HTMLButtonElement;
      const to = container.querySelector('button[aria-label="To network"]') as HTMLButtonElement;
      expect(to.disabled).toBe(true);
      await act(async () => {
        to.click();
      });
      expect(container.querySelector('[role="menu"]')).toBeNull();
      await act(async () => {
        from.click();
      });
      const choices = container.querySelectorAll('[role="menuitemradio"]');
      expect(Array.from(choices).map((item: any) => item.textContent)).toEqual(
        flag
          ? ['SEthereum Sepolia', 'OOnyx Testnet', 'RRobinhood Chain Testnet']
          : ['SEthereum Sepolia', 'OOnyx Testnet']
      );
      expect(container.querySelector('a[role="menuitem"]')).toBeNull();
    });
  }
);

test('From RH selection keeps App on the same standard card with TSLA selected', async () => {
  const legacy = '{"keep":"sepolia history"}';
  window.localStorage.setItem('bridge:operations:v2', legacy);
  const lane = await mount(true, '/bridge', async ({ container, act, store }) => {
    const input = container.querySelector('input');
    await act(async () => {
      container.querySelector('button[aria-label="From network"]').click();
    });
    await act(async () => {
      container.querySelectorAll('[role="menuitemradio"]')[2].click();
    });
    expect(container.querySelector('input')).toBe(input);
    expect(store.getState().bridge.form.selectedAssetKey).toBe('TSLA');
  });
  expect(lane.pathname).toBe('/bridge');
  expect(lane.standard).toBe(true);
  expect(lane.text).not.toContain('Robinhood ↔ Onyx · TSLA');
  expect(lane.entry).toBe(false);
  expect(window.localStorage.getItem('bridge:operations:v2')).toBe(legacy);
});

test.each([false, true])(
  'App flag %s: ordinary network choices keep the legacy callback and derived destination',
  async (flag) => {
    const bridge = await mount(flag, '/bridge', async ({ container, act }) => {
      const trigger = container.querySelector('button[aria-label="From network"]');
      await act(async () => {
        trigger.click();
      });
      await act(async () => {
        container.querySelectorAll('[role="menuitemradio"]')[1].click();
      });
      expect(container.querySelector('button[aria-label="From network"]').textContent).toContain('Onyx Testnet');
      expect(container.querySelector('button[aria-label="To network"]').textContent).toContain('Ethereum Sepolia');
      await act(async () => {
        trigger.click();
      });
      expect(document.activeElement).toBe(container.querySelectorAll('[role="menuitemradio"]')[1]);
      await act(async () => {
        container.querySelectorAll('[role="menuitemradio"]')[0].click();
      });
    });
    expect(bridge.pathname).toBe('/bridge');
  }
);

test('From network menu supports keyboard focus, arrow navigation and Escape', async () => {
  await mount(true, '/bridge', async ({ container, act, Simulate }) => {
    const trigger = container.querySelector('button[aria-label="From network"]');
    await act(async () => {
      Simulate.keyDown(trigger, { key: 'ArrowDown' });
    });
    const items = container.querySelectorAll('[role^="menuitem"]');
    expect(document.activeElement).toBe(items[0]);
    await act(async () => {
      Simulate.keyDown(items[0], { key: 'End' });
    });
    expect(document.activeElement).toBe(items[2]);
    await act(async () => {
      Simulate.keyDown(items[2], { key: 'Escape' });
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

test('From network menu closes when focus leaves without changing a network or blocking Tab', async () => {
  await mount(true, '/bridge', async ({ container, act, Simulate }) => {
    const trigger = container.querySelector('button[aria-label="From network"]');
    await act(async () => {
      trigger.click();
    });
    const items = container.querySelectorAll('[role^="menuitem"]');
    await act(async () => {
      (items[1] as HTMLElement).focus();
    });
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
    try {
      await act(async () => {
        outside.focus();
      });
    } finally {
      outside.remove();
    }
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

test('App RH route stays exact: a child path follows the existing swap fallback', async () => {
  expect((await mount(true, '/bridge/robinhood-testnet/unknown')).pathname).toBe('/swap');
});
test.each(['/BRIDGE/ROBINHOOD-TESTNET', '/bridge/robinhood-testnet/'])(
  'noncanonical compatibility path %s cannot initialize RH selection',
  async (path) => {
    const result = await mount(true, path, async ({ store }) => {
      expect(store.getState().bridge.form.selectedAssetKey).toBe('SEPOLIA_ETH');
    });
    expect(result.pathname).toBe('/swap');
  }
);
test('legacy URL query data cannot supply an asset or arbitrary transaction target', async () => {
  await mount(
    true,
    '/bridge/robinhood-testnet?assetId=RH_ETH&contract=0x1212121212121212121212121212121212121212',
    async ({ store }) => {
      expect(store.getState().bridge.form).toMatchObject({
        selectedAssetKey: 'TSLA',
        inputAmount: '',
        recipient: null,
      });
    }
  );
});

export {};
