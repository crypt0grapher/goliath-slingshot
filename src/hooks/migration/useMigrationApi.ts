import { useState, useEffect, useRef, useCallback } from 'react';
import { migrationApiClient, MigrationStatsResponse, MigrationHistoryResponse } from 'services/migrationApi';
import { migrationConfig } from 'config/migrationConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseStatsResult {
  data: MigrationStatsResponse | null;
  loading: boolean;
  error: string | null;
}

export interface UseHistoryResult {
  data: MigrationHistoryResponse | null;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
}

// ---------------------------------------------------------------------------
// useStats
// ---------------------------------------------------------------------------

/**
 * Polls the migration stats endpoint at the configured interval.
 *
 * - Only makes requests when `migrationConfig.statsEnabled` is `true`.
 * - Polls at `migrationConfig.statsPollMs` (default 60 000 ms).
 * - Returns data, loading, and error state.
 */
export function useStats(): UseStatsResult {
  const [data, setData] = useState<MigrationStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    if (!migrationConfig.statsEnabled) return;

    try {
      setLoading((prev) => (data === null ? true : prev)); // Only show loading on first fetch
      const response = await migrationApiClient.getMigrationStats();
      if (!mountedRef.current) return;
      setData(response);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch migration stats';
      setError(message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [data]);

  useEffect(() => {
    mountedRef.current = true;

    if (!migrationConfig.statsEnabled) {
      return;
    }

    // Initial fetch
    setLoading(true);
    fetchStats();

    // Set up polling interval
    intervalRef.current = setInterval(fetchStats, migrationConfig.statsPollMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// useHistory
// ---------------------------------------------------------------------------

/** Default page size for history pagination. */
const HISTORY_PAGE_SIZE = 10;

/**
 * Fetches paginated migration history for a given wallet address.
 *
 * - Only makes requests when `migrationConfig.historyEnabled` is `true`.
 * - Uses the `/migration/history` endpoint (NOT `/bridge/history`).
 * - Returns data, loading, error, and a `loadMore` callback for pagination.
 */
export function useHistory(address: string | null | undefined): UseHistoryResult {
  const [data, setData] = useState<MigrationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const offsetRef = useRef(0);

  // Reset when address changes
  useEffect(() => {
    setData(null);
    setError(null);
    offsetRef.current = 0;
  }, [address]);

  const fetchHistory = useCallback(
    async (offset: number) => {
      if (!migrationConfig.historyEnabled || !address) return;

      try {
        setLoading(true);
        const response = await migrationApiClient.getMigrationHistory(address, HISTORY_PAGE_SIZE, offset);
        if (!mountedRef.current) return;

        setData((prev) => {
          if (!prev || offset === 0) {
            return response;
          }
          // Append new operations to existing list
          return {
            ...response,
            operations: [...prev.operations, ...response.operations],
          };
        });
        setError(null);
        offsetRef.current = offset + response.operations.length;
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch migration history';
        setError(message);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [address]
  );

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;

    if (!migrationConfig.historyEnabled || !address) {
      return;
    }

    fetchHistory(0);

    return () => {
      mountedRef.current = false;
    };
  }, [address, fetchHistory]);

  const loadMore = useCallback(() => {
    if (loading) return;
    if (data && !data.pagination.hasMore) return;
    fetchHistory(offsetRef.current);
  }, [loading, data, fetchHistory]);

  return { data, loading, error, loadMore };
}
