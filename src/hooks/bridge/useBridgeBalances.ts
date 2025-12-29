import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const previousAccountRef = useRef<string | null | undefined>(null);

  // Reset balance only when account actually changes to a different account
  useEffect(() => {
    if (previousAccountRef.current !== account) {
      if (previousAccountRef.current && account && previousAccountRef.current !== account) {
        // Account changed to a different account - reset balance
        setBalanceAtomic(BigInt(0));
        hasFetchedRef.current = false;
      } else if (!account && previousAccountRef.current) {
        // Account disconnected - reset balance
        setBalanceAtomic(BigInt(0));
        hasFetchedRef.current = false;
      }
      previousAccountRef.current = account;
    }
  }, [account]);

  const fetchBalance = useCallback(async (silent = false) => {
    if (!account) {
      // Don't reset balance here - let the effect above handle it
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
        console.log('[Bridge Balance] Native balance:', balance.toString());
      } else if (tokenConfig.address) {
        console.log('[Bridge Balance] Fetching ERC20 balance from:', tokenConfig.address, 'on', network);
        balance = await getTokenBalance(tokenConfig.address, account, network);
        console.log('[Bridge Balance] ERC20 balance:', balance.toString());
      } else {
        console.warn('[Bridge Balance] No token address configured for', token, 'on', network);
        balance = BigInt(0);
      }

      setBalanceAtomic(balance);
      hasFetchedRef.current = true;
      if (!silent) {
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      if (!silent) {
        setError('Failed to fetch balance');
        // Don't reset balance on error - keep showing the previous value
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
  // Show '-' while loading initial balance, '0' only after confirmed fetch
  const balance = isLoading && !hasFetchedRef.current
    ? '-'
    : balanceAtomic > BigInt(0)
      ? formatAmount(balanceAtomic, token, network)
      : '0';

  return {
    balance,
    balanceAtomic,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
