import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { useStakedXCNContract } from './useStakedXCNContract';
import { yieldActions } from '../../state/yield/slice';
import { stakingConfig } from '../../config/stakingConfig';
import { STAKED_XCN_ADDRESS } from '../../constants/staking';
import { getReadonlyProvider } from '../../services/bridgeProviders';
import { BridgeNetwork } from '../../constants/bridge/networks';

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

      // Fetch native XCN balance held by the StakedXCN contract
      const contractAddress = STAKED_XCN_ADDRESS[8901];
      if (contractAddress) {
        try {
          const provider = getReadonlyProvider(BridgeNetwork.GOLIATH);
          const balance = await provider.getBalance(contractAddress);
          dispatch(yieldActions.setContractBalance(balance.toString()));
        } catch (balanceErr) {
          console.error('Failed to fetch contract balance:', balanceErr);
        }
      }
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
