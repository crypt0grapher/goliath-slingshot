import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from '@ethersproject/units';
import { formatTokenAmount } from '../../pages/Yield/styleds';

/**
 * Tests for Yield xcnBalance display and comparison.
 *
 * On Goliath (chain 8901) the RPC and multicall3 both return native balances
 * in 18-decimal units. The Yield page passes the raw value through to
 * StakeForm without any additional scaling.
 */

const MIN_GAS_RESERVE = parseUnits('0.01', 18);

describe('xcnBalance display – 18-dec raw from RPC', () => {
  it('1 XCN (10^18 raw) displays as "1.0"', () => {
    const raw = parseUnits('1', 18).toString();
    expect(formatTokenAmount(raw)).toBe('1.0');
  });

  it('1,000 XCN displays as "1,000.0"', () => {
    const raw = parseUnits('1000', 18).toString();
    expect(formatTokenAmount(raw)).toBe('1,000.0');
  });

  it('0.5 XCN displays as "0.5"', () => {
    const raw = parseUnits('0.5', 18).toString();
    expect(formatTokenAmount(raw)).toBe('0.5');
  });

  it('fractional XCN with >4 decimals truncates correctly', () => {
    const raw = parseUnits('1.23456789', 18).toString();
    expect(formatTokenAmount(raw)).toBe('1.2345');
  });

  it('zero balance displays as "0"', () => {
    expect(formatTokenAmount('0')).toBe('0');
  });

  it('reference wallet 130,199.8855 XCN displays correctly', () => {
    // Exact raw value from RPC for 0xe359...78d
    const raw = '130199885583430000000000';
    expect(formatTokenAmount(raw)).toBe('130,199.8855');
  });

  it('regression: old *10^10 normalization would inflate display by 10^10', () => {
    const raw = parseUnits('1', 18);
    const inflated = raw.mul(BigNumber.from(10).pow(10));
    // If the old scaling were applied, 1 XCN would display as 10,000,000,000
    expect(formatTokenAmount(inflated.toString())).not.toBe('1.0');
    expect(formatTokenAmount(inflated.toString())).toBe('10,000,000,000.0');
  });
});

describe('xcnBalance comparison – 18-dec raw', () => {
  it('staking 1 XCN passes when balance is 100 XCN', () => {
    const balance = parseUnits('100', 18);
    const input = parseUnits('1', 18);
    expect(input.gt(balance)).toBe(false);
  });

  it('staking 200 XCN fails when balance is 100 XCN', () => {
    const balance = parseUnits('100', 18);
    const input = parseUnits('200', 18);
    expect(input.gt(balance)).toBe(true);
  });

  it('staking 100 XCN exactly equals 100 XCN balance', () => {
    const balance = parseUnits('100', 18);
    const input = parseUnits('100', 18);
    expect(input.eq(balance)).toBe(true);
  });
});

describe('xcnBalance Max button – 18-dec raw', () => {
  it('Max with 100 XCN balance produces ~99.99 XCN', () => {
    const balance = parseUnits('100', 18);
    const max = balance.sub(MIN_GAS_RESERVE);
    expect(max.gt(parseUnits('99.98', 18))).toBe(true);
    expect(max.lt(parseUnits('100', 18))).toBe(true);
  });

  it('Max with 1000 XCN balance produces ~999.99 XCN', () => {
    const balance = parseUnits('1000', 18);
    const max = balance.sub(MIN_GAS_RESERVE);
    expect(max.gt(parseUnits('999.98', 18))).toBe(true);
  });

  it('Max with dust balance (< gas reserve) produces zero or negative', () => {
    const balance = parseUnits('0.005', 18);
    const max = balance.sub(MIN_GAS_RESERVE);
    expect(max.lte(0)).toBe(true);
  });
});
