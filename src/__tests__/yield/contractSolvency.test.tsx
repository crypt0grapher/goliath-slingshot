import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from '@ethersproject/units';
import { theme } from '../../theme';
import reducer, { yieldActions } from '../../state/yield/slice';
import ProtocolStats from '../../pages/Yield/ProtocolStats';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

const darkTheme = theme(true);

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>);
}

// =========================================================================
// 1. Reducer: setContractBalance
// =========================================================================
describe('yield slice – setContractBalance', () => {
  it('FE-UT-060: initial state has contractBalance as null', () => {
    const state = reducer(undefined, { type: 'unknown' });
    expect(state.contractBalance).toBeNull();
  });

  it('FE-UT-061: setContractBalance sets the value', () => {
    const balance = '15379795000000000000000000'; // ~15.3M XCN in wei
    const state = reducer(undefined, yieldActions.setContractBalance(balance));
    expect(state.contractBalance).toBe(balance);
  });

  it('FE-UT-062: setContractBalance updates on subsequent calls', () => {
    let state = reducer(undefined, yieldActions.setContractBalance('1000'));
    expect(state.contractBalance).toBe('1000');
    state = reducer(state, yieldActions.setContractBalance('2000'));
    expect(state.contractBalance).toBe('2000');
  });
});

// =========================================================================
// 2. Solvency warning logic (pure logic, mirrors UnstakeForm)
// =========================================================================
describe('solvency warning logic', () => {
  /**
   * The warning should trigger when the user's unstake amount (in wei)
   * exceeds the contract's native XCN balance (also in wei).
   */
  function shouldShowSolvencyWarning(unstakeAmountWei: string, contractBalanceWei: string | null): boolean {
    if (!contractBalanceWei) return false;
    try {
      return BigNumber.from(unstakeAmountWei).gt(BigNumber.from(contractBalanceWei));
    } catch {
      return false;
    }
  }

  it('FE-UT-063: no warning when amount is within contract balance', () => {
    const amount = parseUnits('100', 18).toString();
    const balance = parseUnits('1000', 18).toString();
    expect(shouldShowSolvencyWarning(amount, balance)).toBe(false);
  });

  it('FE-UT-064: warning when amount exceeds contract balance', () => {
    const amount = parseUnits('2000', 18).toString();
    const balance = parseUnits('1000', 18).toString();
    expect(shouldShowSolvencyWarning(amount, balance)).toBe(true);
  });

  it('FE-UT-065: no warning when contract balance is null', () => {
    const amount = parseUnits('100', 18).toString();
    expect(shouldShowSolvencyWarning(amount, null)).toBe(false);
  });

  it('FE-UT-066: no warning when amounts are equal', () => {
    const amount = parseUnits('1000', 18).toString();
    const balance = parseUnits('1000', 18).toString();
    expect(shouldShowSolvencyWarning(amount, balance)).toBe(false);
  });
});

// =========================================================================
// 3. Contract health indicator logic
// =========================================================================
describe('contract health indicator logic', () => {
  /**
   * Mirrors the logic in ProtocolStats:
   * - "OK" when contractBalance >= totalSupply
   * - "Low Reserves" when deficit > 5%
   */
  function getContractHealthStatus(
    contractBalance: string | null,
    totalSupply: string | null
  ): 'ok' | 'low' | 'unknown' {
    if (!contractBalance || !totalSupply) return 'unknown';
    try {
      const bal = BigNumber.from(contractBalance);
      const supply = BigNumber.from(totalSupply);
      if (supply.isZero()) return 'ok';
      if (bal.gte(supply)) return 'ok';
      // deficit% = (supply - bal) * 100 / supply
      const deficit = supply.sub(bal).mul(100);
      if (deficit.gt(supply.mul(5))) return 'low';
      return 'ok';
    } catch {
      return 'unknown';
    }
  }

  it('FE-UT-067: returns ok when balance >= supply', () => {
    const balance = parseUnits('1000000', 18).toString();
    const supply = parseUnits('900000', 18).toString();
    expect(getContractHealthStatus(balance, supply)).toBe('ok');
  });

  it('FE-UT-068: returns ok when balance equals supply', () => {
    const val = parseUnits('1000000', 18).toString();
    expect(getContractHealthStatus(val, val)).toBe('ok');
  });

  it('FE-UT-069: returns low when deficit > 5%', () => {
    // supply=100, balance=90 => deficit=10% > 5%
    const supply = parseUnits('100', 18).toString();
    const balance = parseUnits('90', 18).toString();
    expect(getContractHealthStatus(balance, supply)).toBe('low');
  });

  it('FE-UT-070: returns ok when deficit is exactly 5%', () => {
    // supply=100, balance=95 => deficit=5% (not > 5%)
    const supply = parseUnits('100', 18).toString();
    const balance = parseUnits('95', 18).toString();
    expect(getContractHealthStatus(balance, supply)).toBe('ok');
  });

  it('FE-UT-071: returns ok when deficit < 5%', () => {
    // supply=100, balance=96 => deficit=4%
    const supply = parseUnits('100', 18).toString();
    const balance = parseUnits('96', 18).toString();
    expect(getContractHealthStatus(balance, supply)).toBe('ok');
  });

  it('FE-UT-072: returns unknown when contractBalance is null', () => {
    const supply = parseUnits('100', 18).toString();
    expect(getContractHealthStatus(null, supply)).toBe('unknown');
  });

  it('FE-UT-073: returns unknown when totalSupply is null', () => {
    const balance = parseUnits('100', 18).toString();
    expect(getContractHealthStatus(balance, null)).toBe('unknown');
  });

  it('FE-UT-074: returns ok when supply is zero', () => {
    expect(getContractHealthStatus('0', '0')).toBe('ok');
  });
});

// =========================================================================
// 4. ProtocolStats renders contract health row
// =========================================================================
describe('ProtocolStats – contract health indicator', () => {
  const baseProps = {
    totalSupply: parseUnits('1000000', 18).toString(),
    rewardRateRay: '278000000000000000000000000',
    feePercentBps: 1000,
    userBalance: null,
    totalPrincipal: BigNumber.from(0),
    isConnected: false,
  };

  it('FE-UT-075: shows OK when contract balance >= total supply', () => {
    renderWithTheme(
      <ProtocolStats
        {...baseProps}
        contractBalance={parseUnits('1100000', 18).toString()}
      />
    );
    expect(screen.getByText('yield.contractHealthOk')).toBeTruthy();
  });

  it('FE-UT-076: shows Low Reserves when deficit > 5%', () => {
    // supply=1M, balance=900K => deficit=10%
    renderWithTheme(
      <ProtocolStats
        {...baseProps}
        contractBalance={parseUnits('900000', 18).toString()}
      />
    );
    expect(screen.getByText('yield.contractHealthLow')).toBeTruthy();
  });

  it('FE-UT-077: does not show health row when contractBalance is null', () => {
    renderWithTheme(
      <ProtocolStats
        {...baseProps}
        contractBalance={null}
      />
    );
    expect(screen.queryByText('yield.contractHealthOk')).toBeNull();
    expect(screen.queryByText('yield.contractHealthLow')).toBeNull();
  });
});
