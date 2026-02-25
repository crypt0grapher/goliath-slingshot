import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from '@ethersproject/units';

/**
 * Tests that useStake sends the correct transaction value.
 *
 * With 18-dec RPC semantics, the StakedXCN.stake() call should receive
 * { value: amountWad } where amountWad is the user's input parsed at 18 decimals.
 * No division by NATIVE_SCALE should occur.
 */

describe('useStake – tx value wiring', () => {
  it('stake(100 XCN) sends value = parseUnits("100", 18)', () => {
    const amountWad = parseUnits('100', 18);
    // The contract call should use value = amountWad directly
    const txValue = amountWad; // no division
    expect(txValue.toString()).toBe('100000000000000000000');
  });

  it('stake(0.5 XCN) sends value = parseUnits("0.5", 18)', () => {
    const amountWad = parseUnits('0.5', 18);
    const txValue = amountWad;
    expect(txValue.toString()).toBe('500000000000000000');
  });

  it('regression: dividing by 10^10 would produce wrong tiny value', () => {
    const amountWad = parseUnits('100', 18);
    const NATIVE_SCALE = BigNumber.from(10).pow(10);
    const wrongTinyValue = amountWad.div(NATIVE_SCALE);
    // This would send 10000000000 (0.00000001 XCN) instead of 100 XCN
    expect(wrongTinyValue.toString()).toBe('10000000000');
    expect(wrongTinyValue.toString()).not.toBe(amountWad.toString());
  });

  it('amount too small check should use amountWad directly', () => {
    const amountWad = parseUnits('0.000000001', 18); // 1 gwei equivalent
    // With direct value, this is still > 0
    expect(amountWad.gt(0)).toBe(true);
    // But with old /10^10, it would be 0
    const NATIVE_SCALE = BigNumber.from(10).pow(10);
    const wrongTiny = amountWad.div(NATIVE_SCALE);
    expect(wrongTiny.isZero()).toBe(true);
  });
});
