import { BigNumber } from '@ethersproject/bignumber';
import { estimateGasWithFallback } from '../../hooks/yield/useStake';
import { STAKE_GAS_LIMIT, UNSTAKE_GAS_LIMIT } from '../../constants/staking';

describe('estimateGasWithFallback', () => {
  it('returns estimated gas with 20% buffer when estimation succeeds', async () => {
    const mockEstimate = jest.fn().mockResolvedValue(BigNumber.from(100_000));
    const result = await estimateGasWithFallback(mockEstimate, STAKE_GAS_LIMIT);
    expect(result).toBe(120_000); // 100K * 1.2
  });

  it('returns fallback gas limit when estimation fails', async () => {
    const mockEstimate = jest.fn().mockRejectedValue(new Error('estimation failed'));
    const result = await estimateGasWithFallback(mockEstimate, STAKE_GAS_LIMIT);
    expect(result).toBe(STAKE_GAS_LIMIT);
  });

  it('returns fallback for unstake gas limit', async () => {
    const mockEstimate = jest.fn().mockRejectedValue(new Error('estimation failed'));
    const result = await estimateGasWithFallback(mockEstimate, UNSTAKE_GAS_LIMIT);
    expect(result).toBe(UNSTAKE_GAS_LIMIT);
  });

  it('returns a number, not BigNumber', async () => {
    const mockEstimate = jest.fn().mockResolvedValue(BigNumber.from(50_000));
    const result = await estimateGasWithFallback(mockEstimate, STAKE_GAS_LIMIT);
    expect(typeof result).toBe('number');
  });
});
