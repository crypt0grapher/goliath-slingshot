import { BigNumber } from '@ethersproject/bignumber';
import { yieldActions } from '../../state/yield/slice';

/**
 * Tests for fetchProtocolData in useYieldData.
 *
 * The core bug: getLastUpdateTimestamp() returns uint40 from the ABI,
 * which ethers.js v5 decodes as a plain JS number (not BigNumber).
 * Calling .toNumber() on a plain number crashes with TypeError,
 * preventing ALL protocol data from being dispatched.
 */

// Reproduce the exact dispatch payload construction from useYieldData.ts
function buildProtocolPayload(contractResults: {
  totalSupply: BigNumber;
  cumulativeIndex: BigNumber;
  rewardRate: BigNumber;
  feePercent: BigNumber;
  lastTimestamp: any; // uint40 returns number, uint256 returns BigNumber
  isPaused: boolean;
}) {
  const { totalSupply, cumulativeIndex, rewardRate, feePercent, lastTimestamp, isPaused } = contractResults;
  return {
    totalSupply: totalSupply.toString(),
    rewardRateRay: rewardRate.toString(),
    feePercentBps: feePercent.toNumber(),
    cumulativeIndex: cumulativeIndex.toString(),
    lastUpdateTimestamp: lastTimestamp.toNumber(), // 💥 crashes when lastTimestamp is a plain number
    isPaused,
  };
}

// Fixed version that handles both number and BigNumber
function buildProtocolPayloadFixed(contractResults: {
  totalSupply: BigNumber;
  cumulativeIndex: BigNumber;
  rewardRate: BigNumber;
  feePercent: BigNumber;
  lastTimestamp: any;
  isPaused: boolean;
}) {
  const { totalSupply, cumulativeIndex, rewardRate, feePercent, lastTimestamp, isPaused } = contractResults;
  return {
    totalSupply: totalSupply.toString(),
    rewardRateRay: rewardRate.toString(),
    feePercentBps: feePercent.toNumber(),
    cumulativeIndex: cumulativeIndex.toString(),
    lastUpdateTimestamp: typeof lastTimestamp === 'number' ? lastTimestamp : lastTimestamp.toNumber(),
    isPaused,
  };
}

const MOCK_CONTRACT_RESULTS = {
  totalSupply: BigNumber.from('155013598910938952062'),
  cumulativeIndex: BigNumber.from('1001415091567888663153940888'),
  rewardRate: BigNumber.from('278000000000000000000000000'),
  feePercent: BigNumber.from(1000),
  isPaused: false,
};

describe('fetchProtocolData – uint40 handling', () => {
  it('FE-UT-045: crashes when getLastUpdateTimestamp returns plain number (uint40 behavior)', () => {
    // ethers.js v5 returns uint40 as plain JS number
    const results = {
      ...MOCK_CONTRACT_RESULTS,
      lastTimestamp: 1772062973, // plain number, not BigNumber
    };

    expect(() => buildProtocolPayload(results)).toThrow();
  });

  it('FE-UT-046: succeeds when getLastUpdateTimestamp returns BigNumber (uint256 behavior)', () => {
    const results = {
      ...MOCK_CONTRACT_RESULTS,
      lastTimestamp: BigNumber.from(1772062973),
    };

    const payload = buildProtocolPayload(results);
    expect(payload.lastUpdateTimestamp).toBe(1772062973);
    expect(payload.totalSupply).toBe('155013598910938952062');
    expect(payload.rewardRateRay).toBe('278000000000000000000000000');
    expect(payload.feePercentBps).toBe(1000);
    expect(payload.isPaused).toBe(false);
  });

  it('FE-UT-047: fixed version handles plain number (uint40)', () => {
    const results = {
      ...MOCK_CONTRACT_RESULTS,
      lastTimestamp: 1772062973, // plain number
    };

    const payload = buildProtocolPayloadFixed(results);
    expect(payload.lastUpdateTimestamp).toBe(1772062973);
    expect(payload.totalSupply).toBe('155013598910938952062');
  });

  it('FE-UT-048: fixed version handles BigNumber (uint256)', () => {
    const results = {
      ...MOCK_CONTRACT_RESULTS,
      lastTimestamp: BigNumber.from(1772062973),
    };

    const payload = buildProtocolPayloadFixed(results);
    expect(payload.lastUpdateTimestamp).toBe(1772062973);
  });

  it('FE-UT-049: setProtocolData action accepts the fixed payload shape', () => {
    const payload = {
      totalSupply: '155013598910938952062',
      rewardRateRay: '278000000000000000000000000',
      feePercentBps: 1000,
      cumulativeIndex: '1001415091567888663153940888',
      lastUpdateTimestamp: 1772062973,
      isPaused: false,
    };

    const action = yieldActions.setProtocolData(payload);
    expect(action.type).toBe('yield/setProtocolData');
    expect(action.payload.lastUpdateTimestamp).toBe(1772062973);
    expect(action.payload.totalSupply).toBe('155013598910938952062');
  });
});
