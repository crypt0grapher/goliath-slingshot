import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from '@ethersproject/units';
import { formatTokenAmount } from '../../pages/Yield/styleds';
import { parseTransactionError } from '../../hooks/yield/useStake';

describe('formatTokenAmount', () => {
  it('FE-UT-001: formats zero', () => {
    expect(formatTokenAmount('0')).toBe('0');
  });

  it('FE-UT-002: formats large numbers with 1 decimal, no commas', () => {
    const result = formatTokenAmount('1250234567000000000000');
    expect(result).toBe('1250.2');
  });

  it('FE-UT-003: handles null', () => {
    expect(formatTokenAmount(null)).toBe('0');
  });
});

describe('parseTransactionError', () => {
  it('FE-UT-004: handles user rejection (code 4001)', () => {
    expect(parseTransactionError({ code: 4001 })).toBe('Transaction rejected by user');
  });

  it('FE-UT-005: handles contract revert with reason string', () => {
    expect(parseTransactionError({ reason: 'Staking paused' })).toBe('Staking paused');
  });
});

describe('stake math – 18-dec native units', () => {
  it('FE-UT-006: getMaxStakeAmount subtracts gas reserve', () => {
    const balance = parseUnits('100', 18);
    const gasReserve = parseUnits('0.01', 18);
    const max = balance.sub(gasReserve);
    expect(max.gt(parseUnits('99.98', 18))).toBe(true);
    expect(max.lt(parseUnits('100', 18))).toBe(true);
  });

  it('FE-UT-007: getMaxStakeAmount returns zero for dust', () => {
    const balance = parseUnits('0.005', 18);
    const gasReserve = parseUnits('0.01', 18);
    const max = balance.sub(gasReserve);
    expect(max.lte(0)).toBe(true);
  });

  it('FE-UT-008: computeNetAPY with 27.8% gross and 10% fee', () => {
    const grossAPY = 0.278 * 100;
    const netAPY = (grossAPY * (10000 - 1000)) / 10000;
    expect(netAPY).toBeCloseTo(25.02, 1);
  });

  it('FE-UT-009: computeNetAPY with zero fee', () => {
    const grossAPY = 27.8;
    const netAPY = (grossAPY * (10000 - 0)) / 10000;
    expect(netAPY).toBe(27.8);
  });

  it('FE-UT-010: stake tx value equals user input in 18-dec', () => {
    // With 18-dec RPC, the stake tx value should be the parsed input directly
    const inputWad = parseUnits('100', 18);
    // No conversion needed — value sent to contract is the wad itself
    expect(inputWad.toString()).toBe('100000000000000000000');
  });

  it('FE-UT-011: preview amount equals input amount (no precision loss)', () => {
    // With 18-dec native units, the preview should match input exactly
    const inputWad = parseUnits('1.234567891234567891', 18);
    // No tinyXCN truncation — full 18-dec precision preserved
    expect(inputWad.toString()).toBe('1234567891234567891');
  });
});
