// SPDX-License-Identifier: Apache-2.0
// Actual standard card/reducer/hooks; only wallet/transport and unrelated chrome are isolated.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import bridgeReducer from '../../../state/bridge/reducer';
import Bridge from '../index';
import { bridgeActions } from '../../../state/bridge/reducer';
import { BridgeNetwork } from '../../../constants/bridge/networks';
import type { BridgeAdapter } from '../../../hooks/bridge/BridgeSession';
import { selectionKey, observed } from '../../../hooks/bridge/BridgeSession';
import type { BridgeSelection } from '../../../constants/bridge/registry';

const mockDepositWalletPrompt = jest.fn(async () => ({
  hash: '0x' + 'a'.repeat(64),
  wait: async () => ({ status: 1 }),
}));
const mockApproveWalletPrompt = jest.fn(async () => ({
  hash: '0x' + 'b'.repeat(64),
  wait: async () => ({ status: 1 }),
}));
const mockApprovalGas = jest.fn();
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn().mockImplementation(() => ({
        populateTransaction: {
          depositNative: async () => ({ action: 'deposit' }),
          approve: async () => ({ action: 'approve' }),
        },
        estimateGas: { approve: mockApprovalGas },
      })),
    },
  };
});

let mockWallet: { account: string | null; chainId: number | null; library?: any; active?: boolean; connector?: any } = {
  account: null,
  chainId: null,
};
let mockProviderReady = true;
let mockSession: any;
jest.mock('../../../hooks', () => ({ useActiveWeb3React: () => mockWallet }));
jest.mock('../../../hooks/useProviderReady', () => ({
  useProviderReady: () => ({ isReady: mockProviderReady, recheckProvider: () => undefined }),
}));
jest.mock('../../../state/application/hooks', () => ({ useWalletModalToggle: () => () => undefined }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (({ from: 'From', toLabel: 'To' } as Record<string, string>)[key] || key),
  }),
}));
jest.mock('../../../components/Settings', () => () => null);
jest.mock('../BridgeStatusModal', () => () => {
  mockSession = require('../../../hooks/bridge/BridgeSessionContext').useOptionalBridgeSession();
  return null;
});
jest.mock('../../../components/NavigationTabs', () => ({ SwapPoolBridgeTabs: () => null }));
jest.mock(
  '../../AppBody',
  () =>
    ({ children }: any) =>
      children
);
jest.mock('../../../components/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: any) => (isOpen ? children : null),
}));
jest.mock('../../../components/Button', () => {
  const button = (props: any) => require('react').createElement('button', props);
  return { ButtonPrimary: button, ButtonError: button, ButtonOutlined: button };
});
jest.mock('../../../services/bridgeProviders', () => ({
  getNativeBalance: jest.fn(),
  getTokenBalance: jest.fn(),
  getTokenAllowance: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: () => 'test-operation-id' }));

const theme = {
  text1: '#111',
  text2: '#333',
  text3: '#666',
  bg1: '#fff',
  bg2: '#eee',
  bg3: '#ddd',
  bg4: '#ccc',
  primary1: '#2172e5',
  green1: '#080',
  red1: '#b00',
  mediaWidth: { upToExtraSmall: () => '', upToSmall: () => '' },
} as any;
let container: HTMLDivElement;
let pathname = '';
let rerenderWalletContext: () => void;
const originalFetch = global.fetch;
function Location() {
  pathname = useLocation().pathname;
  return null;
}
async function mount(
  options: { selection?: BridgeSelection; adapter?: BridgeAdapter; rhEnabled?: boolean; rhDeps?: any } = {}
) {
  const initial = bridgeReducer(undefined, { type: '@@init' });
  const store = configureStore({
    reducer: { bridge: bridgeReducer },
    preloadedState: { bridge: { ...initial, form: options.selection || initial.form } },
  });
  rerenderWalletContext = () => {
    ReactDOM.render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={['/bridge']}>
            <Bridge rhEnabled={options.rhEnabled ?? true} rhAdapter={options.adapter} rhDeps={options.rhDeps} />
            <Location />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>,
      container
    );
  };
  await act(async () => {
    rerenderWalletContext();
  });
  return store;
}
const networkMenu = (label: string) =>
  container.querySelector(`button[aria-label="${label} network"]`) as HTMLButtonElement;
const radio = (label: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find((e) =>
    e.textContent?.includes(label)
  );

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  window.localStorage.clear();
  mockWallet = { account: null, chainId: null };
  mockProviderReady = true;
  mockSession = undefined;
  mockDepositWalletPrompt.mockClear();
  mockApproveWalletPrompt.mockClear();
  mockApprovalGas.mockReset().mockResolvedValue(require('ethers').ethers.BigNumber.from(21000));
  (require('ethers').ethers.Contract as jest.Mock).mockImplementation(() => ({
    populateTransaction: {
      depositNative: async () => ({ action: 'deposit' }),
      approve: async () => ({ action: 'approve' }),
    },
    estimateGas: { approve: mockApprovalGas },
  }));
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as any;
});

// Explicit presentation fixtures only; UB-06 must prove the real profile-aware adapter separately.
function rhFixture() {
  mockWallet = { account: '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a', chainId: 46630 };
  const selection: BridgeSelection = {
    originNetwork: BridgeNetwork.ROBINHOOD,
    destinationNetwork: BridgeNetwork.GOLIATH,
    selectedAssetKey: 'TSLA',
    inputAmount: '0.1',
    recipient: null,
  };
  const adapter: BridgeAdapter = {
    selectionKey: selectionKey(selection, mockWallet.account, mockWallet.chainId),
    binding: {
      assetId: 'TSLA',
      profileSha256: '38a14bcb94536c4efb8d62d9d0a42ae702117db3e495f6884cf25839da47ee8e',
      profileVersion: 1,
      abiVersion: 'rh-stock-bridge-abi-12fc53612bcf',
    },
    fee: observed('0'),
    net: observed('0.1'),
    eta: observed('~21 minutes'),
    perTxMax: observed('0.7'),
    remainingCapacity: observed('2.75'),
    sourceBalance: observed('1'),
    destinationBalance: observed('2'),
    maxAmount: '0.7',
    canApprove: false,
    canConfirm: true,
    busy: false,
    approve: jest.fn(async () => undefined),
    confirm: jest.fn(async () => undefined),
    refresh: jest.fn(),
  };
  return { selection, adapter };
}
test('shared card distinguishes the two capacity rows, shows connected-wallet balances, and bounds MAX', async () => {
  const fixture = rhFixture();
  const store = await mount(fixture);
  const summary = container.querySelector('[aria-label="Bridge summary"]')!;
  expect(summary.textContent).toContain('0.7 TSLA');
  expect(summary.textContent).toContain('2.75 TSLA');
  const balances = container.querySelector('[aria-label="Balances"]')!;
  expect(balances.textContent).toContain('Robinhood Chain Testnet: 1 TSLA');
  expect(balances.textContent).toContain('Onyx Testnet: 2 TSLA');
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((e) => e.textContent === 'MAX')!
      .click();
  });
  expect(store.getState().bridge.form.inputAmount).toBe('0.7');
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});
test.each(['ready', 'stale', 'error'])('RH availability notice reflects %s observations', async (state) => {
  const fixture = rhFixture();
  const errorNotice = 'Bridge observations are unavailable or stale. Live actions stay disabled.';
  if (state === 'stale') {
    fixture.adapter.remainingCapacity = { status: 'stale' };
    fixture.adapter.canConfirm = false;
  } else if (state === 'error') {
    fixture.adapter.notice = errorNotice;
    fixture.adapter.canConfirm = false;
  }
  await mount(fixture);
  expect(mockSession.notice).toBe(
    state === 'ready' ? undefined : state === 'error' ? errorNotice : 'Robinhood bridge availability is being checked.'
  );
  if (state === 'ready') expect(container.textContent).not.toContain('Robinhood bridge availability is being checked.');
  else expect(mockSession.canConfirm).toBe(false);
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});
test.each((['RH_ETH', 'TSLA'] as const).flatMap((asset) => ['', '0', '0.0'].map((amount) => ({ asset, amount }))))(
  '$asset amount "$amount" does not treat an intentionally absent amount quote as unavailable service',
  async ({ asset, amount }) => {
    const fixture = rhFixture();
    fixture.selection.selectedAssetKey = asset;
    fixture.selection.inputAmount = amount;
    fixture.adapter.selectionKey = selectionKey(fixture.selection, mockWallet.account, mockWallet.chainId);
    fixture.adapter.binding = { ...fixture.adapter.binding, assetId: asset };
    fixture.adapter.sourceBalance = observed('0');
    fixture.adapter.fee = { status: 'unavailable' };
    fixture.adapter.net = { status: 'unavailable' };
    await mount(fixture);
    expect(mockSession.notice).toBeUndefined();
    expect(mockSession.canConfirm).toBe(false);
    expect(mockSession.canApprove).toBe(false);
    expect(mockSession.fee.status).toBe('unavailable');
    expect(mockSession.net.status).toBe('unavailable');
    expect(fixture.adapter.confirm).not.toHaveBeenCalled();
  }
);
test('changing the selected asset invalidates a captured confirmation and clears old observations', async () => {
  const fixture = rhFixture();
  const store = await mount(fixture);
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((e) => e.textContent === 'confirmBridge')!
      .click();
  });
  expect(store.getState().bridge.isConfirmModalOpen).toBe(true);
  await act(async () => {
    store.dispatch(bridgeActions.setSelectedAsset('RH_ETH'));
  });
  expect(store.getState().bridge.isConfirmModalOpen).toBe(false);
  expect(container.querySelector('[aria-label="Balances"]')!.textContent).not.toContain('2 TSLA');
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});

test.each(['amount', 'recipient', 'source', 'account', 'wallet-chain', 'provider'])(
  '%s changes invalidate the captured standard confirmation before any send',
  async (change) => {
    const fixture = rhFixture();
    const store = await mount(fixture);
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((e) => e.textContent === 'confirmBridge')!
        .click();
    });
    expect(store.getState().bridge.isConfirmModalOpen).toBe(true);
    await act(async () => {
      if (change === 'amount') store.dispatch(bridgeActions.setInputAmount('0.2'));
      else if (change === 'recipient')
        store.dispatch(bridgeActions.setRecipient('0xaa91057c8f98af30c44bb8708399bf4daa188a81'));
      else if (change === 'source') store.dispatch(bridgeActions.setOriginNetwork(BridgeNetwork.GOLIATH));
      else {
        if (change === 'account') mockWallet = { ...mockWallet, account: '0xaa91057c8f98af30c44bb8708399bf4daa188a81' };
        if (change === 'wallet-chain') mockWallet = { ...mockWallet, chainId: 8901 };
        if (change === 'provider') mockWallet = { ...mockWallet, library: { provider: {} } };
        // Simulate the wallet context provider update; changing an unrelated Redux field
        // does not rerender consumers whose selected values are unchanged.
        rerenderWalletContext();
      }
    });
    expect(store.getState().bridge.isConfirmModalOpen).toBe(false);
    expect(fixture.adapter.confirm).not.toHaveBeenCalled();
  }
);
test('unknown/stale RH observations cannot appear Free or enable a bridge action', async () => {
  const fixture = rhFixture();
  fixture.adapter.fee = { status: 'stale' };
  fixture.adapter.net = { status: 'unavailable' };
  fixture.adapter.canConfirm = true; // The shared action gate must still refuse stale observations.
  await mount(fixture);
  expect(container.querySelector('[aria-label="Bridge summary"]')!.textContent).toContain('Stale — refreshing');
  expect(container.querySelector('[aria-label="Bridge summary"]')!.textContent).not.toContain('free');
  expect(
    (
      Array.from(container.querySelectorAll('button')).find(
        (e) => e.textContent === 'confirmBridge'
      ) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
const receiveOutput = () =>
  Array.from(container.querySelectorAll('div')).find((element) => element.textContent === 'youWillReceiveBridge')!
    .nextElementSibling!.textContent;
const receiveSummary = () =>
  Array.from(container.querySelectorAll('dt')).find((element) => element.textContent === 'bridgeYouReceive')!
    .nextElementSibling!.textContent;
test.each(['RH_ETH', 'SEPOLIA_ETH', 'TSLA'] as const)(
  '%s empty and numeric-zero amounts display zero without claiming a live quote or enabling actions',
  async (asset) => {
    const fixture = rhFixture();
    fixture.selection.selectedAssetKey = asset;
    if (asset === 'SEPOLIA_ETH') {
      fixture.selection.originNetwork = BridgeNetwork.SEPOLIA;
      mockWallet = { ...mockWallet, chainId: 11155111 };
    }
    fixture.selection.inputAmount = '';
    fixture.adapter.selectionKey = selectionKey(fixture.selection, mockWallet.account, mockWallet.chainId);
    fixture.adapter.binding = { ...fixture.adapter.binding, assetId: asset === 'TSLA' ? 'TSLA' : 'RH_ETH' };
    fixture.adapter.net = { status: 'unavailable' };
    const store = await mount(fixture);
    for (const amount of ['', '0', '0.0', '00.000', '.0']) {
      await act(async () => {
        store.dispatch(bridgeActions.setInputAmount(amount));
      });
      expect(receiveOutput()).toBe(`0.0 ${asset === 'TSLA' ? 'TSLA' : 'ETH'}`);
      expect(receiveSummary()).toBe(receiveOutput());
      expect(mockSession.canConfirm).toBe(false);
      expect(mockSession.canApprove).toBe(false);
      expect(mockSession.net.status).not.toBe('ready');
      expect(store.getState().bridge.form.selectedAssetKey).toBe(asset);
    }
    expect(fixture.adapter.confirm).not.toHaveBeenCalled();
    expect(fixture.adapter.approve).not.toHaveBeenCalled();
  }
);
test.each(['0.01', '-1', 'abc', '.', '0..0', '1e-999'])(
  'unavailable receive details for %s remain honest and disabled',
  async (amount) => {
    const fixture = rhFixture();
    fixture.selection.inputAmount = amount;
    fixture.adapter.selectionKey = selectionKey(fixture.selection, mockWallet.account, mockWallet.chainId);
    fixture.adapter.net = { status: 'unavailable' };
    await mount(fixture);
    expect(receiveOutput()).toBe('Not available');
    expect(receiveSummary()).toBe('Not available');
    expect(mockSession.canConfirm).toBe(false);
    expect(mockSession.notice).toBe('Robinhood bridge availability is being checked.');
    expect(fixture.adapter.confirm).not.toHaveBeenCalled();
  }
);
test.each(['RH_ETH', 'SEPOLIA_ETH'] as const)(
  '%s uses Ethereum in visible token and balance names while retaining its distinct selection identity',
  async (asset) => {
    const fixture = rhFixture();
    fixture.selection.selectedAssetKey = asset;
    if (asset === 'SEPOLIA_ETH') fixture.selection.originNetwork = BridgeNetwork.SEPOLIA;
    const store = await mount(fixture);
    expect(container.querySelector('[aria-label="Balances"]')!.textContent).toContain('Ethereum');
    await act(async () => {
      (container.querySelector('[aria-label="Select bridge token"]') as HTMLButtonElement).click();
    });
    const eth = Array.from(container.querySelectorAll('[role="option"]')).find((option) =>
      option.textContent?.startsWith('ETH')
    )!;
    expect(eth.textContent).toBe('ETHEthereum');
    expect(container.textContent).not.toMatch(/Ether · (Robinhood|Sepolia) origin/);
    await act(async () => {
      (eth as HTMLButtonElement).click();
    });
    expect(store.getState().bridge.form.selectedAssetKey).toBe(asset);
    const storedAsset = require('../../../constants/bridge/registry').BRIDGE_ASSETS[asset];
    expect(storedAsset.name).toBe(asset === 'RH_ETH' ? 'Ether · Robinhood origin' : 'Ether · Sepolia origin');
    expect(storedAsset.originChainId).toBe(asset === 'RH_ETH' ? 46630 : 11155111);
  }
);
test('ETH confirmation uses the Ethereum display name without changing the captured RH asset', async () => {
  const fixture = rhFixture();
  fixture.selection.selectedAssetKey = 'RH_ETH';
  fixture.adapter.binding = { ...fixture.adapter.binding, assetId: 'RH_ETH' };
  fixture.adapter.selectionKey = selectionKey(fixture.selection, mockWallet.account, mockWallet.chainId);
  const store = await mount(fixture);
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'confirmBridge')!
      .click();
  });
  expect(store.getState().bridge.isConfirmModalOpen).toBe(true);
  expect(container.textContent).toContain('0.1 ETH · Ethereum');
  expect(container.textContent).not.toContain('Ether · Robinhood origin');
  expect(store.getState().bridge.form.selectedAssetKey).toBe('RH_ETH');
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});
test('summary has five rows while the editable recipient remains bound to the transfer', async () => {
  const fixture = rhFixture();
  const store = await mount(fixture);
  const summary = container.querySelector('[aria-label="Bridge summary"]')!;
  expect(summary.querySelectorAll('dt')).toHaveLength(5);
  expect(Array.from(summary.querySelectorAll('dt')).map((row) => row.textContent)).not.toContain('recipient');
  const recipient = container.querySelector('input[aria-label="Bridge recipient"]') as HTMLInputElement;
  expect(recipient).not.toBeNull();
  await act(async () => {
    store.dispatch(bridgeActions.setRecipient('0xaa91057c8f98af30c44bb8708399bf4daa188a81'));
  });
  expect(recipient.value).toBe('0xaa91057c8f98af30c44bb8708399bf4daa188a81');
  expect(mockSession.recipient).toBe(recipient.value);
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});
test('confirmation visibly retains the exact recipient while the main summary avoids the duplicate row', async () => {
  const fixture = rhFixture();
  await mount(fixture);
  const main = container.querySelector('[aria-label="Bridge summary"]')!;
  expect(main.querySelectorAll('dt')).toHaveLength(5);
  expect(Array.from(main.querySelectorAll('dt')).map((row) => row.textContent)).not.toContain('recipient');
  await act(async () => {
    mockSession.openConfirm();
  });
  const summaries = container.querySelectorAll('[aria-label="Bridge summary"]');
  expect(summaries).toHaveLength(2);
  const confirmation = summaries[1];
  expect(confirmation.querySelectorAll('dt')).toHaveLength(6);
  const recipient = Array.from(confirmation.querySelectorAll('dt')).find((row) => row.textContent === 'recipient')!;
  expect(recipient.nextElementSibling!.textContent).toBe(mockWallet.account);
  expect(mockSession.confirmation.recipient).toBe(mockWallet.account);
  expect(container.querySelector('input[aria-label="Bridge recipient"]')).not.toBeNull();
  expect(fixture.adapter.confirm).not.toHaveBeenCalled();
});
test('real RH controller keeps expired same-context values visibly stale across failed refreshes without enabling actions', async () => {
  jest.useFakeTimers();
  const { v2Fixture } = require('../../../services/rhBridge/__fixtures__/v2');
  const { RhLaneController } = require('../../../hooks/rhBridge/controller');
  const fixture = v2Fixture();
  fixture.state.account = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
  jest.spyOn(Date, 'now').mockImplementation(() => fixture.state.now);
  mockWallet = {
    account: fixture.state.account,
    chainId: 46630,
    active: true,
    connector: require('../../../connectors').injected,
    library: { provider: fixture.provider },
  };
  let controller: any;
  const originalRefresh = RhLaneController.prototype.refreshLane;
  jest.spyOn(RhLaneController.prototype, 'refreshLane').mockImplementation(function (this: any) {
    controller = this;
    return originalRefresh.call(this);
  });
  const read = fixture.deps.v2.api.read;
  let failed = false;
  fixture.deps.v2.api = {
    read: async (request: any) => {
      if (failed) throw new Error('Controlled readonly failure');
      return read(request);
    },
  };
  await mount({
    selection: {
      originNetwork: BridgeNetwork.ROBINHOOD,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: 'RH_ETH',
      inputAmount: '0.0001',
      recipient: null,
    },
    rhDeps: fixture.deps,
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
    for (let i = 0; i < 100; i++) await Promise.resolve();
  });
  expect(mockSession.canConfirm).toBe(true);
  const original = controller.state.v2;
  fixture.state.now = original.validUntil + 1;
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(mockSession.net.status).toBe('stale');
  const expiredText = receiveOutput();
  failed = true;
  await act(async () => {
    await controller.refreshLane();
  });
  expect(controller.state.v2).toBeNull(); // The original action authority remains fail closed.
  expect(receiveOutput()).toBe(expiredText);
  expect(receiveOutput()).toContain('0.0001 ETH');
  expect(receiveOutput()).toContain('Stale');
  expect(mockSession.net.status).toBe('stale');
  expect(controller.state.v2Display.validUntil).toBe(original.validUntil);
  expect(mockSession.canConfirm).toBe(false);
  expect(mockSession.canApprove).toBe(false);
  expect(mockSession.notice).toBe('Bridge observations are unavailable or stale. Live actions stay disabled.');
  await act(async () => {
    await controller.refreshLane();
  });
  expect(receiveOutput()).toBe(expiredText);
  expect(fixture.state.sends).toHaveLength(0);
});
test('healthy 15-second observations stay fresh through slow independent RPC reads and repeated polling', async () => {
  jest.useFakeTimers();
  const { v2Fixture } = require('../../../services/rhBridge/__fixtures__/v2');
  const { RhLaneController } = require('../../../hooks/rhBridge/controller');
  const fixture = v2Fixture();
  jest.spyOn(Date, 'now').mockImplementation(() => fixture.state.now);
  mockWallet = {
    account: fixture.state.account,
    chainId: 46630,
    active: true,
    connector: require('../../../connectors').injected,
    library: { provider: fixture.provider },
  };
  for (const method of ['getChainId', 'genesisHash', 'getCode', 'getBalance', 'call', 'gasPrice', 'estimateGas']) {
    const original = fixture.chains[method];
    fixture.chains[method] = async (...args: any[]) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return original(...args);
    };
  }
  let active = 0,
    maxActive = 0;
  const refresh = RhLaneController.prototype.refreshLane;
  jest.spyOn(RhLaneController.prototype, 'refreshLane').mockImplementation(async function (this: any) {
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      return await refresh.call(this);
    } finally {
      active--;
    }
  });
  await mount({
    selection: {
      originNetwork: BridgeNetwork.ROBINHOOD,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: 'RH_ETH',
      inputAmount: '0.0001',
      recipient: null,
    },
    rhDeps: fixture.deps,
  });
  let fresh = 0,
    requestsAtWarmup = 0;
  for (let step = 1; step <= 80; step++) {
    await act(async () => {
      fixture.state.now += 1000;
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 150; i++) await Promise.resolve();
    });
    if (step === 20) requestsAtWarmup = fixture.transport.mock.calls.length;
    if (step > 20 && mockSession.net.status === 'ready') fresh++;
  }
  expect(fresh).toBe(60); // Healthy controlled path is continuously fresh; no TTL is changed.
  expect(fixture.transport.mock.calls.length - requestsAtWarmup).toBeLessThanOrEqual(42);
  expect(maxActive).toBe(1);
  expect(fixture.state.sends).toHaveLength(0);
});
test('failed background reads even with a blank amount back off and stay visibly disabled', async () => {
  jest.useFakeTimers();
  const fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture(),
    starts: number[] = [];
  jest.spyOn(Date, 'now').mockImplementation(() => fixture.state.now);
  mockWallet = {
    account: fixture.state.account,
    chainId: 46630,
    active: true,
    connector: require('../../../connectors').injected,
    library: { provider: fixture.provider },
  };
  fixture.deps.v2.api = {
    read: async (request: any) => {
      if (request.kind === 'assets') starts.push(fixture.state.now);
      throw Error('RH_V2_RATE_LIMITED');
    },
  };
  await mount({
    selection: {
      originNetwork: BridgeNetwork.ROBINHOOD,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: 'RH_ETH',
      inputAmount: '',
      recipient: null,
    },
    rhDeps: fixture.deps,
  });
  for (let step = 0; step < 100; step++)
    await act(async () => {
      fixture.state.now += 1000;
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
  expect(starts).toHaveLength(4);
  expect(starts.slice(1).map((time, i) => time - starts[i])).toEqual([10000, 20000, 40000]);
  expect(mockSession.canConfirm).toBe(false);
  expect(mockSession.notice).toBe('Bridge observations are unavailable or stale. Live actions stay disabled.');
  expect(fixture.state.sends).toHaveLength(0);
});
test('real empty native wallet needs no amount quote and has no perpetual availability warning', async () => {
  jest.useFakeTimers();
  const fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
  fixture.state.nativeBalance = '0';
  jest.spyOn(Date, 'now').mockImplementation(() => fixture.state.now);
  mockWallet = {
    account: fixture.state.account,
    chainId: 46630,
    active: true,
    connector: require('../../../connectors').injected,
    library: { provider: fixture.provider },
  };
  const store = await mount({
    selection: {
      originNetwork: BridgeNetwork.ROBINHOOD,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: 'RH_ETH',
      inputAmount: '',
      recipient: null,
    },
    rhDeps: fixture.deps,
  });
  for (const amount of ['', '0', '0.0']) {
    await act(async () => {
      store.dispatch(bridgeActions.setInputAmount(amount));
    });
    await act(async () => {
      fixture.state.now += 1000;
      jest.advanceTimersByTime(300);
      for (let i = 0; i < 150; i++) await Promise.resolve();
    });
    expect(mockSession.perTxMax.status).toBe('ready');
    expect(mockSession.remainingCapacity.status).toBe('ready');
    expect(mockSession.sourceBalance.value).toBe('0');
    expect(mockSession.fee.status).toBe('unavailable');
    expect(mockSession.net.status).toBe('unavailable');
    expect(mockSession.notice).toBeUndefined();
    expect(mockSession.canConfirm).toBe(false);
    expect(mockSession.canApprove).toBe(false);
    expect(receiveOutput()).toBe('0.0 ETH');
  }
  expect(fixture.transport.mock.calls.some(([url]: any[]) => url.includes('/fee-quote'))).toBe(false);
  expect(fixture.state.sends).toHaveLength(0);
});
test('unmount during a pending refresh prevents tracking and future background reads', async () => {
  jest.useFakeTimers();
  const fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
  const { RhLaneController } = require('../../../hooks/rhBridge/controller');
  jest.spyOn(Date, 'now').mockImplementation(() => fixture.state.now);
  mockWallet = {
    account: fixture.state.account,
    chainId: 46630,
    active: true,
    connector: require('../../../connectors').injected,
    library: { provider: fixture.provider },
  };
  const held = deferred<void>(),
    entered = deferred<void>(),
    read = fixture.deps.v2.api.read;
  fixture.deps.v2.api = {
    read: async (request: any) => {
      if (request.kind === 'assets') {
        entered.resolve();
        await held.promise;
      }
      return read(request);
    },
  };
  const tracking = jest.spyOn(RhLaneController.prototype, 'trackOnce').mockResolvedValue(undefined);
  jest.spyOn(RhLaneController.prototype, 'hasOpenRecords').mockReturnValue(true);
  await mount({
    selection: {
      originNetwork: BridgeNetwork.ROBINHOOD,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: 'RH_ETH',
      inputAmount: '0.0001',
      recipient: null,
    },
    rhDeps: fixture.deps,
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
    await entered.promise;
  });
  act(() => {
    ReactDOM.unmountComponentAtNode(container);
  });
  await act(async () => {
    held.resolve();
    for (let i = 0; i < 150; i++) await Promise.resolve();
    jest.advanceTimersByTime(60000);
  });
  expect(tracking).not.toHaveBeenCalled();
  expect(fixture.transport.mock.calls.filter(([url]: any[]) => url.includes('/assets'))).toHaveLength(1);
  expect(fixture.state.sends).toHaveLength(0);
});
test('flag-off hides RH choices and normalizes persisted RH selection without deleting history', async () => {
  const fixture = rhFixture();
  const preserved = '[{"unknown":"keep"}]';
  window.localStorage.setItem('bridge:rh:testnet:46630:8901:operations:v1', preserved);
  const store = await mount({ selection: fixture.selection, rhEnabled: false });
  expect(store.getState().bridge.form.selectedAssetKey).toBe('SEPOLIA_ETH');
  await act(async () => {
    networkMenu('From').click();
  });
  expect(radio('Robinhood Chain Testnet')).toBeUndefined();
  expect(window.localStorage.getItem('bridge:rh:testnet:46630:8901:operations:v1')).toBe(preserved);
});
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(container);
  });
  container.remove();
  global.fetch = originalFetch;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('T1: selecting Robinhood keeps the actual standard form and path with pair tokens', async () => {
  await mount();
  const amountInput = container.querySelector('input');
  await act(async () => {
    networkMenu('From').click();
  });
  expect(radio('Robinhood Chain Testnet')).toBeDefined();
  await act(async () => {
    radio('Robinhood Chain Testnet')!.click();
  });
  expect(pathname).toBe('/bridge');
  expect(container.querySelector('input')).toBe(amountInput);
  expect(networkMenu('To').textContent).toContain('Onyx Testnet');
  const token = container.querySelector('button[aria-label="Select bridge token"]') as HTMLButtonElement;
  await act(async () => {
    token.click();
  });
  const choices = Array.from(container.querySelectorAll('[role="option"]')).map((e) => e.textContent);
  expect(choices.some((e) => e?.includes('TSLA'))).toBe(true);
  expect(choices.some((e) => e?.includes('ETH'))).toBe(true);
  expect(container.textContent).not.toContain('Minimum deposit');
});

test.each([false, true])(
  'real Session and RH controller preserve captured observation expiry during a refresh (expired=%s)',
  async (expired) => {
    const fixture = require('../../../services/rhBridge/__fixtures__/v2').v2Fixture();
    const { RhLaneController } = require('../../../hooks/rhBridge/controller');
    const originalBridge = RhLaneController.prototype.bridge;
    let clock = fixture.state.now;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    fixture.deps.now = () => clock;
    mockWallet = {
      active: true,
      account: fixture.state.account,
      chainId: 46630,
      connector: require('../../../connectors').injected,
      library: { provider: fixture.provider },
    };
    const capturedExpiry = clock + 15000;
    const checks: { now: number; refused: boolean; sameContextBeforeExpiry?: boolean }[] = [];
    jest.spyOn(RhLaneController.prototype, 'bridge').mockImplementation(function (this: any, guard: any) {
      return originalBridge.call(this, {
        ...guard,
        assertCurrent() {
          try {
            guard.assertCurrent();
            checks.push({ now: clock, refused: false });
          } catch (error) {
            const actualNow = clock;
            let sameContextBeforeExpiry = false;
            try {
              // Diagnostic only: change the clock for one extra assertion, never for the action itself.
              // If this passes, the refusal is expiry rather than selection/readiness/owner invalidation.
              clock = capturedExpiry - 1;
              guard.assertCurrent();
              sameContextBeforeExpiry = true;
            } finally {
              clock = actualNow;
            }
            checks.push({ now: clock, refused: true, sameContextBeforeExpiry });
            throw error;
          }
        },
      });
    });
    await mount({
      selection: {
        originNetwork: BridgeNetwork.ROBINHOOD,
        destinationNetwork: BridgeNetwork.GOLIATH,
        selectedAssetKey: 'RH_ETH',
        inputAmount: '0.0001',
        recipient: null,
      },
      rhDeps: fixture.deps,
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(mockSession.canConfirm).toBe(true);
    clock += 14000;
    fixture.state.now = clock; // The refresh really observes new data; no observation is restamped.
    await act(async () => mockSession.openConfirm());
    expect(mockSession.confirmationValid).toBe(true);
    const codeRead = deferred<void>();
    const originalCode = fixture.chains.getCode;
    let reading = false;
    fixture.chains.getCode = async (...args: any[]) => {
      reading = true;
      await codeRead.promise;
      return originalCode(...args);
    };
    let action!: Promise<void>;
    await act(async () => {
      action = mockSession.confirm();
      for (let i = 0; i < 100; i++) await Promise.resolve();
    });
    expect(reading).toBe(true);
    await act(async () => {
      clock += expired ? 2000 : 500;
      codeRead.resolve();
      await action;
    });
    // New snapshot is still fresh and semantically identical in both cases.
    expect(mockSession.canConfirm).toBe(true);
    expect(mockSession.fee.status).toBe('ready');
    expect(fixture.state.sends).toHaveLength(expired ? 0 : 1);
    if (expired) {
      expect(checks.filter((c) => c.refused)).toEqual([
        { now: capturedExpiry + 1000, refused: true, sameContextBeforeExpiry: true },
      ]);
      expect(mockSession.notice).toBe('Bridge details changed. Review them before continuing.');
      expect(fixture.storageData.size).toBe(0);
    } else expect(checks.every((c) => !c.refused)).toBe(true);
  }
);

test('T2: from Onyx offers Sepolia and Robinhood destinations inside the standard card', async () => {
  await mount();
  await act(async () => {
    networkMenu('From').click();
  });
  await act(async () => {
    radio('Onyx Testnet')!.click();
  });
  expect(networkMenu('To').disabled).toBe(false);
  await act(async () => {
    networkMenu('To').click();
  });
  expect(radio('Ethereum Sepolia')).toBeDefined();
  expect(radio('Robinhood Chain Testnet')).toBeDefined();
  await act(async () => {
    radio('Robinhood Chain Testnet')!.click();
  });
  expect(pathname).toBe('/bridge');
  expect(networkMenu('From').textContent).toContain('Onyx Testnet');
  expect(networkMenu('To').textContent).toContain('Robinhood Chain Testnet');
});

test.each(['source', 'asset', 'amount', 'recipient', 'account', 'wallet-chain', 'provider'])(
  'review regression: %s changes during the real legacy nonce await prevent a wallet prompt',
  async (change) => {
    let releaseNonce!: (value: number) => void;
    const noncePending = new Promise<number>((resolve) => {
      releaseNonce = resolve;
    });
    const account = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
    mockDepositWalletPrompt.mockClear();
    mockDepositWalletPrompt.mockImplementation(async () => ({
      hash: '0x' + 'a'.repeat(64),
      wait: async () => ({ status: 1 }),
    }));
    (require('ethers').ethers.Contract as jest.Mock).mockImplementation(() => ({
      depositNative: mockDepositWalletPrompt,
    }));
    mockWallet = {
      account,
      chainId: 11155111,
      library: {
        provider: { request: async ({ method }: any) => (method === 'eth_accounts' ? [account] : '0xaa36a7') },
        getTransactionCount: () => noncePending,
        getSigner: () => ({}),
      },
    };
    const transports = require('../../../services/bridgeProviders');
    transports.getNativeBalance.mockResolvedValue(BigInt('5000000000000000000'));
    transports.getTokenBalance.mockResolvedValue(BigInt('5000000000000000000'));
    const store = await mount({
      selection: {
        originNetwork: BridgeNetwork.SEPOLIA,
        destinationNetwork: BridgeNetwork.GOLIATH,
        selectedAssetKey: 'SEPOLIA_ETH',
        inputAmount: '0.01',
        recipient: null,
      },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    const first = Array.from(container.querySelectorAll('button')).find((e) => e.textContent === 'confirmBridge')!;
    expect((first as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      first.click();
    });
    expect(store.getState().bridge.isConfirmModalOpen).toBe(true);
    await act(async () => {
      const confirmButtons = Array.from(container.querySelectorAll('button')).filter(
        (e) => e.textContent === 'confirmBridge'
      );
      confirmButtons[confirmButtons.length - 1].click();
      await Promise.resolve();
    });
    expect(store.getState().bridge.isSubmitting).toBe(true);
    await act(async () => {
      changeIntent(change, store);
    });
    await act(async () => {
      releaseNonce(0);
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(mockDepositWalletPrompt).not.toHaveBeenCalled();
  }
);

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const OTHER = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function changeIntent(change: string, store: Awaited<ReturnType<typeof mount>>) {
  if (change === 'source') store.dispatch(bridgeActions.setOriginNetwork(BridgeNetwork.ROBINHOOD));
  else if (change === 'asset')
    store.dispatch(
      bridgeActions.setSelectedAsset(
        store.getState().bridge.form.selectedAssetKey === 'SEPOLIA_XCN' ? 'SEPOLIA_ETH' : 'SEPOLIA_XCN'
      )
    );
  else if (change === 'amount') store.dispatch(bridgeActions.setInputAmount('0.02'));
  else if (change === 'recipient') store.dispatch(bridgeActions.setRecipient(OTHER));
  else {
    if (change === 'account') mockWallet = { ...mockWallet, account: OTHER };
    if (change === 'wallet-chain') mockWallet = { ...mockWallet, chainId: 8901 };
    if (change === 'provider') mockWallet = { ...mockWallet, library: { ...mockWallet.library } };
    rerenderWalletContext();
  }
}
async function legacyFixture(asset: 'SEPOLIA_ETH' | 'SEPOLIA_XCN' = 'SEPOLIA_ETH') {
  mockWallet = {
    account: ACCOUNT,
    chainId: 11155111,
    library: {
      provider: { request: async ({ method }: any) => (method === 'eth_accounts' ? [ACCOUNT] : '0xaa36a7') },
      getTransactionCount: jest.fn(async () => 0),
      getSigner: () => ({
        sendTransaction: (transaction: { action: string }) =>
          transaction.action === 'approve' ? mockApproveWalletPrompt() : mockDepositWalletPrompt(),
      }),
    },
  };
  const transports = require('../../../services/bridgeProviders');
  transports.getNativeBalance.mockResolvedValue(BigInt('5000000000000000000'));
  transports.getTokenBalance.mockResolvedValue(BigInt('5000000000000000000'));
  transports.getTokenAllowance.mockResolvedValue(BigInt(0));
  const store = await mount({
    selection: {
      originNetwork: BridgeNetwork.SEPOLIA,
      destinationNetwork: BridgeNetwork.GOLIATH,
      selectedAssetKey: asset,
      inputAmount: '0.01',
      recipient: null,
    },
  });
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  return store;
}
async function confirmLegacy() {
  await act(async () => {
    const first = Array.from(container.querySelectorAll('button')).find((e) => e.textContent === 'confirmBridge')!;
    expect((first as HTMLButtonElement).disabled).toBe(false);
    first.click();
  });
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll('button')).filter((e) => e.textContent === 'confirmBridge');
    buttons[buttons.length - 1].click();
  });
}
test.each(['amount', 'quote-expiry', 'account', 'wallet-chain'])(
  'approval checks %s again after its real gas estimate and before any approval wallet prompt',
  async (change) => {
    jest.useFakeTimers();
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const gas = deferred<any>();
    mockApprovalGas.mockReturnValue(gas.promise);
    const store = await legacyFixture('SEPOLIA_XCN');
    await act(async () => {
      const approve = Array.from(container.querySelectorAll('button')).find((e) => e.textContent === 'approve')!;
      expect(approve).toBeDefined();
      approve.click();
    });
    expect(mockApprovalGas).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (change === 'quote-expiry') now += 30001;
      else changeIntent(change, store);
      gas.resolve(require('ethers').ethers.BigNumber.from(21000));
    });
    expect(mockApproveWalletPrompt).not.toHaveBeenCalled();
    expect(store.getState().bridge.isApproving).toBe(false);
  }
);
test('provider readiness preparation cannot prompt after the standard selection changes', async () => {
  jest.useFakeTimers();
  mockProviderReady = false;
  const store = await legacyFixture();
  const nonce = mockWallet.library.getTransactionCount;
  await confirmLegacy();
  expect(store.getState().bridge.isSubmitting).toBe(true);
  await act(async () => {
    changeIntent('asset', store);
    jest.advanceTimersByTime(300);
  });
  expect(nonce).not.toHaveBeenCalled();
  expect(mockDepositWalletPrompt).not.toHaveBeenCalled();
});
test('a transient wallet failure cannot retry after the selected intent changes', async () => {
  jest.useFakeTimers();
  mockDepositWalletPrompt.mockRejectedValueOnce(new Error('network timeout'));
  const store = await legacyFixture();
  await confirmLegacy();
  expect(mockDepositWalletPrompt).toHaveBeenCalledTimes(1);
  await act(async () => {
    changeIntent('recipient', store);
    jest.advanceTimersByTime(500);
  });
  expect(mockDepositWalletPrompt).toHaveBeenCalledTimes(1);
  expect(store.getState().bridge.isSubmitting).toBe(false);
});
test('a wallet request already issued remains tracked against its original intent after selection changes', async () => {
  jest.useFakeTimers();
  const wallet = deferred<any>();
  mockDepositWalletPrompt.mockReturnValueOnce(wallet.promise);
  const store = await legacyFixture();
  await confirmLegacy();
  expect(mockDepositWalletPrompt).toHaveBeenCalledTimes(1);
  await act(async () => {
    changeIntent('source', store);
    wallet.resolve({ hash: '0x' + 'c'.repeat(64), wait: async () => ({ status: 1 }) });
  });
  expect(Object.values(store.getState().bridge.operations)[0]).toMatchObject({
    token: 'ETH',
    sender: ACCOUNT,
    recipient: ACCOUNT,
    amountHuman: '0.01',
    amountAtomic: '10000000000000000',
    originChainId: 11155111,
    destinationChainId: 8901,
    originTxHash: '0x' + 'c'.repeat(64),
    status: 'CONFIRMING',
  });
  expect(mockDepositWalletPrompt).toHaveBeenCalledTimes(1);
});

async function returnIntent(change: string, store: Awaited<ReturnType<typeof mount>>) {
  const originalForm = { ...store.getState().bridge.form };
  const originalWallet = mockWallet;
  if (['source', 'asset', 'amount', 'recipient'].includes(change)) {
    // Both dispatches share one render batch; the synchronous transition observer must still see both.
    await act(async () => {
      changeIntent(change, store);
      store.dispatch(bridgeActions.hydrateForm(originalForm));
    });
  } else {
    await act(async () => {
      changeIntent(change, store);
    });
    await act(async () => {
      mockWallet = originalWallet;
      rerenderWalletContext();
    });
  }
}
test.each(['source', 'asset', 'amount', 'recipient', 'account', 'wallet-chain', 'provider'])(
  'R2: %s moving away and back cannot resurrect a real legacy nonce preparation',
  async (change) => {
    jest.useFakeTimers();
    const nonce = deferred<number>();
    const store = await legacyFixture();
    mockWallet.library.getTransactionCount.mockReturnValue(nonce.promise);
    await confirmLegacy();
    expect(store.getState().bridge.isSubmitting).toBe(true);
    await returnIntent(change, store);
    await act(async () => {
      nonce.resolve(0);
    });
    expect(mockDepositWalletPrompt).not.toHaveBeenCalled();
    expect(store.getState().bridge.isSubmitting).toBe(false);
  }
);
test.each(['source', 'asset', 'amount', 'recipient', 'account', 'wallet-chain', 'provider'])(
  'R2: %s moving away and back cannot resurrect approval after its real gas estimate',
  async (change) => {
    jest.useFakeTimers();
    const gas = deferred<any>();
    mockApprovalGas.mockReturnValue(gas.promise);
    const store = await legacyFixture('SEPOLIA_XCN');
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((e) => e.textContent === 'approve')!
        .click();
    });
    expect(mockApprovalGas).toHaveBeenCalledTimes(1);
    await returnIntent(change, store);
    await act(async () => {
      gas.resolve(require('ethers').ethers.BigNumber.from(21000));
    });
    expect(mockApproveWalletPrompt).not.toHaveBeenCalled();
    expect(store.getState().bridge.isApproving).toBe(false);
  }
);
test('R2: a quote becoming stale then ready with identical values cannot resurrect nonce preparation', async () => {
  jest.useFakeTimers();
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  const nonce = deferred<number>();
  const store = await legacyFixture();
  mockWallet.library.getTransactionCount.mockReturnValue(nonce.promise);
  await confirmLegacy();
  await act(async () => {
    jest.advanceTimersByTime(30000);
  });
  expect(container.textContent).toContain('Stale — refreshing');
  await act(async () => {
    // Exercise the actual session/fee refresh rather than clicking the busy-disabled refresh control.
    mockSession.refreshDetails();
  });
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(container.querySelector('[aria-label="Bridge summary"]')!.textContent).not.toContain('Stale — refreshing');
  await act(async () => {
    nonce.resolve(0);
  });
  expect(mockDepositWalletPrompt).not.toHaveBeenCalled();
  expect(store.getState().bridge.isSubmitting).toBe(false);
});
test.each(['source', 'account', 'provider', 'amount', 'wallet-chain'])(
  'R2: switch source context handles an away-and-back %s transition during add-chain correctly',
  async (change) => {
    jest.useFakeTimers();
    const added = deferred<void>();
    let switches = 0;
    const request = jest.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'wallet_switchEthereumChain') {
        if (++switches === 1) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
        return undefined;
      }
      if (method === 'wallet_addEthereumChain') return added.promise;
      throw new Error('Unexpected fixture RPC');
    });
    mockWallet = { account: ACCOUNT, chainId: 11155111, library: { provider: { request } } };
    const store = await mount({
      selection: {
        originNetwork: BridgeNetwork.GOLIATH,
        destinationNetwork: BridgeNetwork.SEPOLIA,
        selectedAssetKey: 'SEPOLIA_ETH',
        inputAmount: '',
        recipient: null,
      },
    });
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((e) => e.textContent === 'switchTo')!
        .click();
    });
    expect(request.mock.calls.filter(([r]) => r.method === 'wallet_addEthereumChain')).toHaveLength(1);
    await returnIntent(change, store);
    expect(
      (Array.from(container.querySelectorAll('button')).find((e) => e.textContent === 'switchTo') as HTMLButtonElement)
        .disabled
    ).toBe(true);
    await act(async () => {
      added.resolve();
    });
    expect(switches).toBe(['amount', 'wallet-chain'].includes(change) ? 2 : 1);
  }
);
