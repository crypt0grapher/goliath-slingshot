import React from 'react';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { ThemeProvider } from 'styled-components';
import { BigNumber } from '@ethersproject/bignumber';
import { theme } from '../../theme';
import yieldReducer from '../../state/yield/slice';
import ProtocolStats from '../../pages/Yield/ProtocolStats';
import TransactionHistory from '../../pages/Yield/TransactionHistory';
import { StakingEvent } from '../../state/yield/types';

// Mock react-i18next — t() returns the key as-is for deterministic assertions
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// Build a real styled-components theme object (dark mode, LTR)
const darkTheme = theme(true);

// Minimal store for tests that need Redux
function createTestStore(yieldState?: any) {
  return configureStore({
    reducer: { yield: yieldReducer },
    preloadedState: yieldState ? { yield: yieldState } : undefined,
  });
}

// Wrapper with providers
function renderWithProviders(ui: React.ReactElement, storeOverride?: any) {
  const store = storeOverride || createTestStore();
  return render(
    <Provider store={store}>
      <ThemeProvider theme={darkTheme}>
        {ui}
      </ThemeProvider>
    </Provider>
  );
}

// ProtocolStats and TransactionHistory are presentational -- they receive all
// data via props and do not dispatch Redux actions. We only need ThemeProvider.

describe('ProtocolStats', () => {
  // grossAPY = 278000000000000000000000000 / 1e27 * 100 = 27.8%
  // netAPY   = 27.8 * (10000 - 1000) / 10000 = 25.02%
  const defaultProps = {
    totalSupply: '500000000000000000000000', // 500,000 XCN
    rewardRateRay: '278000000000000000000000000',
    feePercentBps: 1000,
    userBalance: null,
    totalPrincipal: BigNumber.from(0),
    isConnected: false,
  };

  it('FE-UT-024: renders net APY', () => {
    renderWithProviders(<ProtocolStats {...defaultProps} />);
    expect(screen.getByText('25.02%')).toBeTruthy();
  });

  it('FE-UT-025: renders total staked', () => {
    renderWithProviders(<ProtocolStats {...defaultProps} />);
    expect(screen.getByText(/500000\.0/)).toBeTruthy();
  });

  it('FE-UT-026: renders dashes when data is null', () => {
    renderWithProviders(
      <ProtocolStats
        totalSupply={null}
        rewardRateRay={null}
        feePercentBps={null}
        userBalance={null}
        totalPrincipal={BigNumber.from(0)}
        isConnected={false}
      />
    );
    // Both "Total Staked" and "Net APY" values should show '--'
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('FE-UT-027: shows rewards row when connected', () => {
    renderWithProviders(
      <ProtocolStats
        {...defaultProps}
        isConnected={true}
        userBalance="110000000000000000000"
        totalPrincipal={BigNumber.from('100000000000000000000')}
      />
    );
    expect(screen.getByText('yield.yourRewards')).toBeTruthy();
    expect(screen.getByText(/stXCN/)).toBeTruthy();
  });

  it('FE-UT-028: hides rewards row when disconnected', () => {
    renderWithProviders(<ProtocolStats {...defaultProps} isConnected={false} />);
    expect(screen.queryByText('yield.yourRewards')).toBeNull();
  });
});

describe('TransactionHistory', () => {
  it('FE-UT-029: renders stake events', () => {
    const events: StakingEvent[] = [
      {
        type: 'stake',
        txHash: '0xabc123',
        user: '0x1234',
        xcnAmount: '100000000000000000000',
        stXCNAmount: '100000000000000000000',
        blockNumber: 1000,
        timestamp: 1700000000,
      },
    ];
    renderWithProviders(<TransactionHistory events={events} isLoading={false} />);
    expect(screen.getByText('yield.eventStaked')).toBeTruthy();
    expect(screen.getByText(/100/)).toBeTruthy();
  });

  it('FE-UT-030: renders unstake events', () => {
    const events: StakingEvent[] = [
      {
        type: 'unstake',
        txHash: '0xdef456',
        user: '0x5678',
        xcnAmount: '50000000000000000000',
        stXCNAmount: '50000000000000000000',
        blockNumber: 2000,
        timestamp: 1700100000,
      },
    ];
    renderWithProviders(<TransactionHistory events={events} isLoading={false} />);
    expect(screen.getByText('yield.eventUnstaked')).toBeTruthy();
  });

  it('FE-UT-031: renders empty state', () => {
    renderWithProviders(<TransactionHistory events={[]} isLoading={false} />);
    expect(screen.getByText('yield.noTransactions')).toBeTruthy();
  });

  it('FE-UT-032: falls back to block number when timestamp is null', () => {
    const events: StakingEvent[] = [
      {
        type: 'stake',
        txHash: '0xghi789',
        user: '0x9abc',
        xcnAmount: '200000000000000000000',
        stXCNAmount: '200000000000000000000',
        blockNumber: 42000,
        timestamp: null,
      },
    ];
    renderWithProviders(<TransactionHistory events={events} isLoading={false} />);
    expect(screen.getByText('Block #42000')).toBeTruthy();
  });
});
