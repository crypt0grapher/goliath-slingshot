import { useState, useEffect, useCallback, useRef } from 'react';
import { BridgeApiClient, LimitsResponse } from '../../services/bridgeApi';
import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeDirection } from '../../state/bridge/types';

interface MinAmountResult {
  amount: string;
  formatted: string;
}

interface UseBridgeLimitsReturn {
  limits: LimitsResponse | null;
  isLoading: boolean;
  error: string | null;
  getMinAmount: (token: string, direction: BridgeDirection) => MinAmountResult | null;
}

/**
 * Hook that fetches bridge limits once on mount and caches them.
 * Provides a helper to look up minimum amounts per token/direction.
 */
export function useBridgeLimits(): UseBridgeLimitsReturn {
  const [limits, setLimits] = useState<LimitsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const apiClient = new BridgeApiClient(bridgeConfig.statusApiBaseUrl);

    apiClient
      .getLimits()
      .then((result) => {
        setLimits(result);
        setError(null);
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to fetch limits');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const getMinAmount = useCallback(
    (token: string, direction: BridgeDirection): MinAmountResult | null => {
      if (!limits) return null;

      const dirLimits =
        direction === 'GOLIATH_TO_SEPOLIA' ? limits.goliathToSepolia : limits.sepoliaToGoliath;

      const tokenLimits = dirLimits.tokens[token];
      if (!tokenLimits) return null;

      return {
        amount: tokenLimits.minAmount,
        formatted: tokenLimits.minAmountFormatted,
      };
    },
    [limits]
  );

  return { limits, isLoading, error, getMinAmount };
}
