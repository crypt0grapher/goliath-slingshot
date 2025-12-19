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

  const fetchBalance = useCallback(async (silent = false) => {
    if (!account) {
      setBalanceAtomic(BigInt(0));
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const tokenConfig = getTokenConfigForChain(token, network);

      // Debug: log token config to identify balance fetch issues
      console.log('[Bridge Balance]', {
        token,
        network,
        tokenAddress: tokenConfig.address,
        isNative: tokenConfig.isNative,
        account,
      });

      let balance: bigint;
      if (tokenConfig.isNative) {
        balance = await getNativeBalance(account, network);
      } else if (tokenConfig.address) {
        balance = await getTokenBalance(tokenConfig.address, account, network);
      } else {
        console.warn('[Bridge Balance] No token address configured for', token, 'on', network);
        balance = BigInt(0);
      }

      setBalanceAtomic(balance);
      if (!silent) {
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      if (!silent) {
        setError('Failed to fetch balance');
        setBalanceAtomic(BigInt(0));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [account, token, network]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Poll balances every second to keep them updated (silent mode to avoid UI flickering)
  useEffect(() => {
    if (!account) return;

    const intervalId = setInterval(() => {
      fetchBalance(true);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [account, fetchBalance]);

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
