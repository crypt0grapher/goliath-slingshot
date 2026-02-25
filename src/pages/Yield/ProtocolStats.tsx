import React from 'react';
import { BigNumber } from '@ethersproject/bignumber';
import { formatTokenAmount, StatsContainer, StatRow, StatLabel, StatValue } from './styleds';

interface ProtocolStatsProps {
  totalSupply: string | null;
  rewardRateRay: string | null;
  feePercentBps: number | null;
  userBalance: string | null;
  totalPrincipal: BigNumber;
  isConnected: boolean;
}

function computeNetAPY(rewardRateRay: string | null, feePercentBps: number | null): string {
  if (!rewardRateRay || feePercentBps === null) return '--';
  const grossAPY = (parseFloat(rewardRateRay) / 1e27) * 100;
  const netAPY = (grossAPY * (10000 - feePercentBps)) / 10000;
  return netAPY.toFixed(2) + '%';
}

function computeRewards(userBalance: string | null, totalPrincipal: BigNumber): string {
  if (!userBalance) return '--';
  try {
    const rewards = BigNumber.from(userBalance).sub(totalPrincipal);
    if (rewards.lt(0)) return formatTokenAmount('0', 4);
    return formatTokenAmount(rewards.toString(), 4) + ' stXCN';
  } catch {
    return '--';
  }
}

export default function ProtocolStats({
  totalSupply,
  rewardRateRay,
  feePercentBps,
  userBalance,
  totalPrincipal,
  isConnected,
}: ProtocolStatsProps) {
  return (
    <StatsContainer>
      <StatRow>
        <StatLabel>Total Staked</StatLabel>
        <StatValue>{totalSupply ? formatTokenAmount(totalSupply, 2) + ' XCN' : '--'}</StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>Net APY</StatLabel>
        <StatValue>{computeNetAPY(rewardRateRay, feePercentBps)}</StatValue>
      </StatRow>
      {isConnected && (
        <StatRow>
          <StatLabel>Your Rewards</StatLabel>
          <StatValue>{computeRewards(userBalance, totalPrincipal)}</StatValue>
        </StatRow>
      )}
    </StatsContainer>
  );
}
