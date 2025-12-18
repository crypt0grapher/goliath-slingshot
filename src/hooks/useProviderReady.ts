import { useEffect, useState, useRef, useCallback } from 'react';
import { useActiveWeb3React } from './index';

/**
 * Hook to check if the Web3 provider is fully initialized and ready for transactions.
 *
 * The Goliath Slingshot (WalletLink) connector can have slow initialization,
 * causing the first transaction to fail. This hook waits for the provider to be
 * responsive before allowing transactions.
 *
 * @returns Object with:
 *  - isReady: boolean indicating if provider is ready
 *  - isChecking: boolean indicating if we're currently checking
 *  - recheckProvider: function to manually trigger a recheck
 */
export function useProviderReady(): {
  isReady: boolean;
  isChecking: boolean;
  recheckProvider: () => void;
} {
  const { library, account, chainId } = useActiveWeb3React();
  const [isReady, setIsReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const checkCountRef = useRef(0);
  const lastAccountRef = useRef<string | null | undefined>(undefined);
  const lastChainIdRef = useRef<number | undefined>(undefined);

  const checkProvider = useCallback(async () => {
    if (!library || !account) {
      setIsReady(false);
      return;
    }

    setIsChecking(true);
    checkCountRef.current += 1;
    const currentCheck = checkCountRef.current;

    try {
      // Perform a series of checks to ensure provider is fully responsive
      // 1. Get block number (verifies basic RPC connectivity)
      const blockNumber = await library.getBlockNumber();

      // Check if this check is still relevant (not superseded by a newer check)
      if (currentCheck !== checkCountRef.current) return;

      if (blockNumber > 0) {
        // 2. Verify we can get the account balance (ensures account access is ready)
        await library.getBalance(account);

        if (currentCheck !== checkCountRef.current) return;

        // 3. Brief delay to allow any pending state updates
        await new Promise(resolve => setTimeout(resolve, 100));

        if (currentCheck !== checkCountRef.current) return;

        // Provider is ready if we got here without errors
        setIsReady(true);
      }
    } catch (error) {
      console.debug('Provider not ready yet:', error);
      // Provider not ready - will be rechecked on next render
      setIsReady(false);
    } finally {
      if (currentCheck === checkCountRef.current) {
        setIsChecking(false);
      }
    }
  }, [library, account]);

  // Manual recheck function for forced refreshes
  const recheckProvider = useCallback(() => {
    setIsReady(false);
    checkProvider();
  }, [checkProvider]);

  // Reset and recheck when account or chainId changes
  useEffect(() => {
    if (account !== lastAccountRef.current || chainId !== lastChainIdRef.current) {
      lastAccountRef.current = account;
      lastChainIdRef.current = chainId;
      setIsReady(false);

      // Small delay before checking to allow connector to fully initialize
      const timer = setTimeout(() => {
        checkProvider();
      }, 200);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [account, chainId, checkProvider]);

  // Initial check when library becomes available
  useEffect(() => {
    if (library && account && !isReady && !isChecking) {
      checkProvider();
    }
  }, [library, account, isReady, isChecking, checkProvider]);

  // Periodic recheck if not ready (with backoff)
  useEffect(() => {
    if (!isReady && library && account && !isChecking) {
      const timer = setTimeout(() => {
        checkProvider();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isReady, library, account, isChecking, checkProvider]);

  return { isReady, isChecking, recheckProvider };
}

/**
 * Higher-order hook that wraps a callback with provider readiness check and retry logic.
 *
 * @param callback The callback to wrap
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Delay between retries in ms
 * @returns Wrapped callback with automatic retry
 */
export function useRetryableCallback<T>(
  callback: (() => Promise<T>) | null,
  maxRetries: number = 2,
  retryDelay: number = 500
): {
  execute: (() => Promise<T>) | null;
  isRetrying: boolean;
  retryCount: number;
} {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { recheckProvider } = useProviderReady();

  const execute = useCallback(async (): Promise<T> => {
    if (!callback) {
      throw new Error('Callback is not available');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        setRetryCount(attempt);
        if (attempt > 0) {
          setIsRetrying(true);
          // On retry, recheck provider readiness
          recheckProvider();
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        const result = await callback();
        setIsRetrying(false);
        setRetryCount(0);
        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry if user rejected the transaction
        if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
          setIsRetrying(false);
          setRetryCount(0);
          throw error;
        }

        // Don't retry on final attempt
        if (attempt === maxRetries) {
          break;
        }

        console.debug(`Transaction attempt ${attempt + 1} failed, retrying...`, error);
      }
    }

    setIsRetrying(false);
    setRetryCount(0);
    throw lastError || new Error('Transaction failed after retries');
  }, [callback, maxRetries, retryDelay, recheckProvider]);

  return {
    execute: callback ? execute : null,
    isRetrying,
    retryCount,
  };
}

export default useProviderReady;
