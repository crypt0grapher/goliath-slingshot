// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import Header from './index';
import { theme } from '../../theme';
import bridgeReducer, { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork } from '../../constants/bridge/networks';
const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const mockRequest = jest.fn(),
  mockDexSwitch = jest.fn();
let mockChain = 46630;
const mockLibrary = { provider: { request: mockRequest } };
jest.mock('../../hooks', () => ({
  useActiveWeb3React: () => ({ account: ACCOUNT, chainId: mockChain, library: mockLibrary }),
}));
jest.mock('../../hooks/useNetworkSwitch', () => ({
  GOLIATH_TESTNET_CHAIN_ID: 8901,
  useNetworkSwitch: () => ({ switchToGoliath: mockDexSwitch, isLoading: false }),
}));
jest.mock('../../state/user/hooks', () => ({ useDarkModeManager: () => [false, () => undefined] }));
jest.mock('../../state/wallet/hooks', () => ({ useETHBalances: () => ({ [ACCOUNT]: { toSignificant: () => '1' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../Web3Status', () => () => null);
jest.mock('../../config/migrationConfig', () => ({ migrationConfig: { migrationEnabled: false } }));
jest.mock('../../config/stakingConfig', () => ({ stakingConfig: { stakingEnabled: false } }));
async function mount(path: string, source: BridgeNetwork, chain: number) {
  mockChain = chain;
  mockRequest.mockImplementation(async ({ method }) =>
    method === 'eth_accounts' ? [ACCOUNT] : method === 'eth_chainId' ? '0x' + chain.toString(16) : undefined
  );
  const store = configureStore({ reducer: { bridge: bridgeReducer } });
  store.dispatch(bridgeActions.setOriginNetwork(source));
  const container = document.createElement('div');
  await act(async () => {
    ReactDOM.render(
      <Provider store={store}>
        <ThemeProvider theme={theme(false)}>
          <MemoryRouter initialEntries={[path]}>
            <Header />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>,
      container
    );
  });
  return {
    container,
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      }),
  };
}
beforeEach(() => {
  mockRequest.mockReset();
  mockDexSwitch.mockReset();
});
test('Header accepts selected Sepolia source on standard bridge and labels actual wallet gas ETH', async () => {
  const v = await mount('/bridge', BridgeNetwork.SEPOLIA, 11155111);
  try {
    expect(v.container.querySelector('button[title*="Click to switch"]')).toBeNull();
    expect(v.container.textContent).toContain('1 ETH');
  } finally {
    v.unmount();
  }
});
test('Header switches to selected bridge source through shared coordinator rather than DEX target', async () => {
  const v = await mount('/bridge', BridgeNetwork.SEPOLIA, 8901);
  try {
    const button = v.container.querySelector('button[title*="Ethereum Sepolia"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    await act(async () => {
      button.click();
    });
    expect(mockDexSwitch).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xaa36a7' }],
    });
  } finally {
    v.unmount();
  }
});
test('DEX still targets Onyx for a Robinhood wallet and labels its native gas ETH', async () => {
  const v = await mount('/swap', BridgeNetwork.SEPOLIA, 46630);
  try {
    const button = v.container.querySelector('button[title*="Onyx Testnet"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    expect(mockDexSwitch).toHaveBeenCalledTimes(1);
    expect(v.container.textContent).toContain('1 ETH');
    expect(mockRequest).not.toHaveBeenCalled();
  } finally {
    v.unmount();
  }
});
