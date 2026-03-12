import { useState, useEffect, useRef, useCallback } from 'react';
import { BridgeApiClient, FeeQuoteResponse } from '../../services/bridgeApi';
import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeDirection } from '../../state/bridge/types';
import { isValidAmountString, isPositiveAmount } from '../../utils/bridge/amounts';

const DEBOUNCE_MS = 300;

interface UseBridgeFeeParams {
  amount: string;
  token: string;
  direction: BridgeDirection;
}

interface UseBridgeFeeReturn {
  feeQuote: FeeQuoteResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook that fetches fee quotes from the backend with debounce.
 *
 * For SEPOLIA_TO_GOLIATH: returns a static zero-fee response (no API call).
 * For GOLIATH_TO_SEPOLIA: debounces 300ms, then fetches from backend.
 * Caches the last valid result to prevent flickering during typing.
 */
export function useBridgeFee({ amount, token, direction }: UseBridgeFeeParams): UseBridgeFeeReturn {
  const [feeQuote, setFeeQuote] = useState<FeeQuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidQuoteRef = useRef<FeeQuoteResponse | null>(null);

  // Stable API client ref
  const apiClientRef = useRef(new BridgeApiClient(bridgeConfig.statusApiBaseUrl));

  const cleanup = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // For deposits (S2G), fees are zero -- return static response immediately
    if (direction === 'SEPOLIA_TO_GOLIATH') {
      cleanup();
      const zeroFee: FeeQuoteResponse = {
        inputAmount: '0',
        inputFormatted: amount || '0',
        feeAmount: '0',
        feeFormatted: '0',
        feeBps: 0,
        outputAmount: '0',
        outputFormatted: amount || '0',
        token,
      };
      setFeeQuote(zeroFee);
      setIsLoading(false);
      setError(null);
      lastValidQuoteRef.current = null;
      return cleanup;
    }

    // For withdrawals (G2S), validate input before fetching
    if (!amount || !isValidAmountString(amount) || !isPositiveAmount(amount)) {
      cleanup();
      setFeeQuote(lastValidQuoteRef.current);
      setIsLoading(false);
      setError(null);
      return cleanup;
    }

    // Debounce the API call
    cleanup();
    setIsLoading(true);
    setError(null);

    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await apiClientRef.current.getFeeQuote({
          token,
          amount,
          direction,
        });

        // Check if this request was aborted while in-flight
        if (controller.signal.aborted) return;

        setFeeQuote(result);
        lastValidQuoteRef.current = result;
        setError(null);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        // On error, keep the last valid quote to prevent UI flicker
        setFeeQuote(lastValidQuoteRef.current);
        setError(err?.message || 'Failed to fetch fee quote');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return cleanup;
  }, [amount, token, direction, cleanup]);

  return { feeQuote, isLoading, error };
}
