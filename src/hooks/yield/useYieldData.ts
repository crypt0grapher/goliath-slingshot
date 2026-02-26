import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { useStakedXCNContract } from './useStakedXCNContract';
import { yieldActions } from '../../state/yield/slice';
import { stakingConfig } from '../../config/stakingConfig';

export function useYieldData(): { refetch: () => void; isLoading: boolean } {
  const contract = useStakedXCNContract(false);
  const { account } = useActiveWeb3React();
  const dispatch = useDispatch();
  const isLoadingRef = useRef(false);

  const fetchProtocolData = useCallback(async (attempt = 0) => {
    if (!contract) return;
    try {
      const [totalSupply, cumulativeIndex, rewardRate, feePercent, lastTimestamp, isPaused] = await Promise.all([
        contract.totalSupply(),
        contract.getCumulativeIndex(),
        contract.getRewardRate(),
        contract.getFeePercent(),
        contract.getLastUpdateTimestamp(),
        contract.paused(),
      ]);
      dispatch(
        yieldActions.setProtocolData({
          totalSupply: totalSupply.toString(),
          rewardRateRay: rewardRate.toString(),
          feePercentBps: feePercent.toNumber(),
          cumulativeIndex: cumulativeIndex.toString(),
          lastUpdateTimestamp: typeof lastTimestamp === 'number' ? lastTimestamp : lastTimestamp.toNumber(),
          isPaused,
        })
      );
      dispatch(yieldActions.clearError());
    } catch (err) {
      console.error('Failed to fetch protocol data:', err);
      if (attempt < 2) {
        setTimeout(() => fetchProtocolData(attempt + 1), 2000);
      }
    }
  }, [contract, dispatch]);

  const fetchUserData = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const [userBalance, userScaledBalance] = await Promise.all([
        contract.balanceOf(account),
        contract.scaledBalanceOf(account),
      ]);
      dispatch(
        yieldActions.setUserData({
          userBalance: userBalance.toString(),
          userScaledBalance: userScaledBalance.toString(),
        })
      );
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    }
  }, [contract, account, dispatch]);

  const refetch = useCallback(() => {
    fetchProtocolData();
    fetchUserData();
  }, [fetchProtocolData, fetchUserData]);

  // Poll protocol data
  useEffect(() => {
    if (!contract) return;
    fetchProtocolData();
    const id = setInterval(fetchProtocolData, stakingConfig.protocolPollMs);
    return () => clearInterval(id);
  }, [contract, fetchProtocolData]);

  // Poll user data
  useEffect(() => {
    if (!contract || !account) return;
    fetchUserData();
    const id = setInterval(fetchUserData, stakingConfig.balancePollMs);
    return () => clearInterval(id);
  }, [contract, account, fetchUserData]);

  // Clear user data on disconnect
  useEffect(() => {
    if (!account) {
      dispatch(yieldActions.clearUserData());
    }
  }, [account, dispatch]);

  return { refetch, isLoading: isLoadingRef.current };
}
