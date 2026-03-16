import React from 'react';
import { useTranslation } from 'react-i18next';
import { BigNumber } from '@ethersproject/bignumber';
import { formatTokenAmount, StatsContainer, StatRow, StatLabel, StatValue, StatValueWarning } from './styleds';

interface ProtocolStatsProps {
  totalSupply: string | null;
  rewardRateRay: string | null;
  feePercentBps: number | null;
  userBalance: string | null;
  totalPrincipal: BigNumber;
  isConnected: boolean;
  contractBalance?: string | null;
}

function computeNetAPY(rewardRateRay: string | null, feePercentBps: number | null): string {
  if (!rewardRateRay || feePercentBps === null) return '--';
  const grossAPY = (parseFloat(rewardRateRay) / 1e27) * 100;
  const netAPY = (grossAPY * (10000 - feePercentBps)) / 10000;
  return netAPY.toFixed(2) + '%';
}

function computeContractHealth(
  contractBalance: string | null | undefined,
  totalSupply: string | null
): 'ok' | 'low' | 'unknown' {
  if (!contractBalance || !totalSupply) return 'unknown';
  try {
    const bal = BigNumber.from(contractBalance);
    const supply = BigNumber.from(totalSupply);
    if (supply.isZero()) return 'ok';
    if (bal.gte(supply)) return 'ok';
    // deficit% = (supply - bal) * 100 / supply > 5%
    const deficit = supply.sub(bal).mul(100);
    if (deficit.gt(supply.mul(5))) return 'low';
    return 'ok';
  } catch {
    return 'unknown';
  }
}

function computeRewards(userBalance: string | null, totalPrincipal: BigNumber): string {
  if (!userBalance) return '--';
  try {
    const rewards = BigNumber.from(userBalance).sub(totalPrincipal);
    if (rewards.lt(0)) return formatTokenAmount('0');
    return formatTokenAmount(rewards.toString()) + ' stXCN';
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
  contractBalance,
}: ProtocolStatsProps) {
  const { t } = useTranslation();
  const healthStatus = computeContractHealth(contractBalance, totalSupply);
  return (
    <StatsContainer>
      <StatRow>
        <StatLabel>{t('yield.totalStaked')}</StatLabel>
        <StatValue>{totalSupply ? formatTokenAmount(totalSupply) + ' XCN' : '--'}</StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>{t('yield.netAPY')}</StatLabel>
        <StatValue>{computeNetAPY(rewardRateRay, feePercentBps)}</StatValue>
      </StatRow>
      {isConnected && (
        <StatRow>
          <StatLabel>{t('yield.yourRewards')}</StatLabel>
          <StatValue>{computeRewards(userBalance, totalPrincipal)}</StatValue>
        </StatRow>
      )}
      {healthStatus !== 'unknown' && (
        <StatRow>
          {healthStatus === 'ok' ? (
            <StatValue>{t('yield.contractHealthOk')}</StatValue>
          ) : (
            <StatValueWarning>{t('yield.contractHealthLow')}</StatValueWarning>
          )}
        </StatRow>
      )}
    </StatsContainer>
  );
}
