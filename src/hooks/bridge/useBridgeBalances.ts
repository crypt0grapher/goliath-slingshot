import { useState, useEffect, useCallback } from 'react';
import { useActiveWeb3React } from '../index';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getNativeBalance, getTokenBalance } from '../../services/bridgeProviders';
import { formatAmount } from '../../utils/bridge/amounts';

interface UseBridgeBalancesReturn {
  balance: string;
  balanceAtomic: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBridgeBalances(
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): UseBridgeBalancesReturn {
  const { account } = useActiveWeb3React();
  const [balanceAtomic, setBalanceAtomic] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!account) {
      setBalanceAtomic(BigInt(0));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tokenConfig = getTokenConfigForChain(token, network);

      let balance: bigint;
      if (tokenConfig.isNative) {
        balance = await getNativeBalance(account, network);
      } else if (tokenConfig.address) {
        balance = await getTokenBalance(tokenConfig.address, account, network);
      } else {
        balance = BigInt(0);
      }

      setBalanceAtomic(balance);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Failed to fetch balance');
      setBalanceAtomic(BigInt(0));
    } finally {
      setIsLoading(false);
    }
  }, [account, token, network]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Format the balance for display
  const balance = balanceAtomic > BigInt(0) ? formatAmount(balanceAtomic, token, network) : '0';

  return {
    balance,
    balanceAtomic,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
