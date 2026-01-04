import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveWeb3React } from '../index';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getNativeBalance, getTokenBalance } from '../../services/bridgeProviders';
import { formatAmount } from '../../utils/bridge/amounts';

// Configuration for aggressive polling after transactions
const AGGRESSIVE_POLL_INTERVAL = 500; // ms - faster polling right after tx
const AGGRESSIVE_POLL_DURATION = 15000; // ms - how long to poll aggressively
const NORMAL_POLL_INTERVAL = 2000; // ms - normal polling interval

interface UseBridgeBalancesReturn {
  balance: string;
  balanceAtomic: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  triggerAggressivePolling: () => void; // Force aggressive polling after tx
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
  const aggressivePollingUntilRef = useRef<number>(0); // Timestamp when aggressive polling should stop
  const lastFetchedBalanceRef = useRef<bigint>(BigInt(0)); // Track last balance to detect changes

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

      // Track if balance changed (useful for debugging and detecting updates)
      if (balance !== lastFetchedBalanceRef.current) {
        console.log('[Bridge Balance] Balance changed:', {
          from: lastFetchedBalanceRef.current.toString(),
          to: balance.toString(),
          network,
          token,
        });
        lastFetchedBalanceRef.current = balance;
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

  // Trigger aggressive polling mode (called after transactions)
  const triggerAggressivePolling = useCallback(() => {
    console.log('[Bridge Balance] Aggressive polling triggered for', network, token);
    aggressivePollingUntilRef.current = Date.now() + AGGRESSIVE_POLL_DURATION;
    // Immediately fetch to get the latest balance
    fetchBalance(false);
  }, [fetchBalance, network, token]);

  // Poll balances with adaptive interval (aggressive after tx, normal otherwise)
  useEffect(() => {
    if (!account) return;

    let intervalId: NodeJS.Timeout;

    const poll = () => {
      const isAggressiveMode = Date.now() < aggressivePollingUntilRef.current;
      const interval = isAggressiveMode ? AGGRESSIVE_POLL_INTERVAL : NORMAL_POLL_INTERVAL;

      fetchBalance(true);

      // Schedule next poll with appropriate interval
      intervalId = setTimeout(poll, interval);
    };

    // Start polling
    const initialInterval = Date.now() < aggressivePollingUntilRef.current
      ? AGGRESSIVE_POLL_INTERVAL
      : NORMAL_POLL_INTERVAL;
    intervalId = setTimeout(poll, initialInterval);

    return () => clearTimeout(intervalId);
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
    triggerAggressivePolling,
  };
}
