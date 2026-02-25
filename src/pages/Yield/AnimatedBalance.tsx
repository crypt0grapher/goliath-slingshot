import React from 'react';
import { useAnimatedBalance } from '../../hooks/yield';
import { BalanceContainer, BalanceLabel, BalanceValue, BalanceSymbol } from './styleds';

interface AnimatedBalanceProps {
  balance: string | null;
  rewardRateRay: string | null;
  feePercentBps: number | null;
  isConnected: boolean;
}

export default function AnimatedBalance({
  balance,
  rewardRateRay,
  feePercentBps,
  isConnected,
}: AnimatedBalanceProps) {
  const { displayValue } = useAnimatedBalance(balance, rewardRateRay, feePercentBps);

  return (
    <BalanceContainer>
      <BalanceLabel>Your stXCN Balance</BalanceLabel>
      {!isConnected ? (
        <BalanceValue>--</BalanceValue>
      ) : (
        <BalanceValue>
          {displayValue}
          <BalanceSymbol>stXCN</BalanceSymbol>
        </BalanceValue>
      )}
    </BalanceContainer>
  );
}
