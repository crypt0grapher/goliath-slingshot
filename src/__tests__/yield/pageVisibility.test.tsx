import React from 'react';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'styled-components';
import { theme } from '../../theme';
import yieldReducer from '../../state/yield/slice';
import applicationReducer from '../../state/application/reducer';
import Yield from '../../pages/Yield/index';

// Mock react-i18next — t() returns the key as-is for deterministic assertions
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

const darkTheme = theme(true);

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockAccount: string | null = null;
let mockChainId: number | undefined = undefined;

jest.mock('../../hooks', () => ({
  useActiveWeb3React: () => ({
    account: mockAccount,
    chainId: mockChainId,
    library: undefined,
  }),
}));

jest.mock('../../hooks/useNetworkSwitch', () => ({
  GOLIATH_TESTNET_CHAIN_ID: 8901,
  useNetworkSwitch: () => ({
    switchToGoliath: jest.fn(),
    isLoading: false,
    error: null,
    isOnGoliath: mockChainId === 8901,
  }),
}));

jest.mock('../../state/application/hooks', () => ({
  useWalletModalToggle: () => jest.fn(),
}));

jest.mock('../../hooks/yield', () => ({
  useYieldData: () => ({ refetch: jest.fn(), isLoading: false }),
  useStake: () => ({ stake: jest.fn(), isLoading: false }),
  useUnstake: () => ({ unstake: jest.fn(), isLoading: false }),
  useStakingEvents: () => ({ events: [], isLoading: false, totalPrincipal: require('@ethersproject/bignumber').BigNumber.from(0) }),
  useAnimatedBalance: () => ({ displayValue: '0.0' }),
}));

jest.mock('../../state/wallet/hooks', () => ({
  useCurrencyBalance: () => null,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function createStore() {
  return configureStore({
    reducer: {
      yield: yieldReducer,
      application: applicationReducer,
    },
  });
}

function renderYield() {
  const store = createStore();
  return render(
    <Provider store={store}>
      <ThemeProvider theme={darkTheme}>
        <Yield />
      </ThemeProvider>
    </Provider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Yield page visibility', () => {
  afterEach(() => {
    mockAccount = null;
    mockChainId = undefined;
  });

  it('FE-UT-040: shows Total Staked and Net APY when wallet is disconnected', () => {
    mockAccount = null;
    mockChainId = undefined;

    renderYield();

    expect(screen.getByText('yield.totalStaked')).toBeTruthy();
    expect(screen.getByText('yield.netAPY')).toBeTruthy();
    // Connect wallet CTA should still be visible
    expect(screen.getByText('yield.connectWallet')).toBeTruthy();
  });

  it('FE-UT-041: shows Total Staked and Net APY when on wrong network', () => {
    mockAccount = '0x1234567890abcdef1234567890abcdef12345678';
    mockChainId = 11155111; // Sepolia

    renderYield();

    expect(screen.getByText('yield.totalStaked')).toBeTruthy();
    expect(screen.getByText('yield.netAPY')).toBeTruthy();
    // Switch network CTA should still be visible
    expect(screen.getByText('yield.switchToGoliath')).toBeTruthy();
  });

  it('FE-UT-042: shows staking controls and stats when connected to Goliath', () => {
    mockAccount = '0x1234567890abcdef1234567890abcdef12345678';
    mockChainId = 8901;

    renderYield();

    expect(screen.getByText('yield.totalStaked')).toBeTruthy();
    expect(screen.getByText('yield.netAPY')).toBeTruthy();
    expect(screen.getByText('yield.tabStake')).toBeTruthy();
    expect(screen.getByText('yield.tabUnstake')).toBeTruthy();
  });

  it('FE-UT-043: hides stake/unstake forms when disconnected', () => {
    mockAccount = null;
    mockChainId = undefined;

    renderYield();

    // Stake/Unstake tabs should not be rendered
    expect(screen.queryByText('yield.tabStake')).toBeNull();
    expect(screen.queryByText('yield.tabUnstake')).toBeNull();
  });

  it('FE-UT-044: hides stake/unstake forms when on wrong network', () => {
    mockAccount = '0x1234567890abcdef1234567890abcdef12345678';
    mockChainId = 11155111;

    renderYield();

    // Stake/Unstake tabs should not be rendered
    expect(screen.queryByText('yield.tabStake')).toBeNull();
    expect(screen.queryByText('yield.tabUnstake')).toBeNull();
  });
});
