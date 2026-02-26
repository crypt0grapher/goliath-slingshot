import { parseUnits } from '@ethersproject/units';
import { formatTokenAmount } from '../../pages/Yield/styleds';

describe('formatTokenAmount – 1 decimal, no commas (default)', () => {
  it('formats typical XCN balance with 1 decimal, no commas', () => {
    // ~130549.77 XCN
    const raw = parseUnits('130549.77', 18).toString();
    expect(formatTokenAmount(raw)).toBe('130549.7');
  });

  it('formats 1 XCN correctly', () => {
    const raw = parseUnits('1', 18).toString();
    expect(formatTokenAmount(raw)).toBe('1.0');
  });

  it('formats 0.5 XCN correctly', () => {
    const raw = parseUnits('0.5', 18).toString();
    expect(formatTokenAmount(raw)).toBe('0.5');
  });

  it('returns "0" for zero', () => {
    expect(formatTokenAmount('0')).toBe('0');
  });

  it('returns "0" for null', () => {
    expect(formatTokenAmount(null)).toBe('0');
  });

  it('truncates rather than rounds', () => {
    // 1.99 should display as 1.9, not 2.0
    const raw = parseUnits('1.99', 18).toString();
    expect(formatTokenAmount(raw)).toBe('1.9');
  });

  it('does not include comma separators by default', () => {
    const raw = parseUnits('1000000', 18).toString();
    const result = formatTokenAmount(raw);
    expect(result).not.toContain(',');
    expect(result).toBe('1000000.0');
  });

  it('includes comma separators when addCommas=true', () => {
    const raw = parseUnits('1000000', 18).toString();
    const result = formatTokenAmount(raw, 1, true);
    expect(result).toBe('1,000,000.0');
  });

  it('supports explicit decimal override', () => {
    const raw = parseUnits('1.23456', 18).toString();
    expect(formatTokenAmount(raw, 4, false)).toBe('1.2345');
  });
});
