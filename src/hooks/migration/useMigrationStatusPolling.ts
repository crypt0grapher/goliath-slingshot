import { useEffect, useRef, useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import { migrationApiClient } from 'services/migrationApi';
import { migrationActions } from 'state/migration/slice';
import { clearPendingMigration } from 'state/migration/persistence';
import { migrationConfig } from 'config/migrationConfig';
import { BridgeStatus } from 'state/bridge/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Backend status values that indicate the operation has reached a final state. */
const TERMINAL_STATUSES: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];

/** Number of consecutive poll failures before showing a user-visible warning. */
const CONSECUTIVE_ERROR_THRESHOLD = 3;

/**
 * Duration in milliseconds after which the hook shows a "taking longer than
 * expected" warning if no status progress has been observed. Default: 5 minutes.
 */
const DELAY_WARNING_THRESHOLD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationFields {
  stakeOnGoliath?: boolean;
  amount?: string | null;
  stakingTxHash?: string | null;
  stakingError?: string | null;
  destinationTxHash?: string | null;
  completedAt?: string | null;
}

export interface UseMigrationStatusPollingOptions {
  /**
   * The sender's wallet address. When provided, the hook will clear the
   * localStorage pending-migration entry on COMPLETED status.
   */
  senderAddress?: string;
}

export interface UseMigrationStatusPollingResult {
  /** The current operation status string from the backend, or null if not yet polled. */
  operationStatus: BridgeStatus | null;
  /** Whether the hook is actively polling. */
  isPolling: boolean;
  /** User-facing error message when consecutive poll failures exceed the threshold. */
  error: string | null;
  /** Migration-specific optional fields from the backend response. */
  migrationFields: MigrationFields | null;
  /** Warning shown when the operation is taking longer than expected. */
  delayWarning: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Polls the migration status endpoint for a given origin transaction hash.
 *
 * - Starts polling immediately when `originTxHash` is non-null.
 * - Polls at the interval defined by `migrationConfig.statusPollMs` (default 3s).
 * - Dispatches `migrationActions.updateOperationStatus` on each successful poll.
 * - Stops polling when a terminal status (COMPLETED, FAILED, EXPIRED) is reached.
 * - On COMPLETED: clears the localStorage pending-migration entry if `senderAddress` is provided.
 * - Handles transient failures: continues polling and shows a warning after `CONSECUTIVE_ERROR_THRESHOLD`.
 * - Shows a "taking longer than expected" warning after `DELAY_WARNING_THRESHOLD_MS`.
 * - Cleans up the polling interval on unmount or when `originTxHash` changes to null.
 */
export function useMigrationStatusPolling(
  originTxHash: string | null,
  options?: UseMigrationStatusPollingOptions
): UseMigrationStatusPollingResult {
  const dispatch = useDispatch();
  const senderAddress = options?.senderAddress;

  // ---- State ----
  const [operationStatus, setOperationStatus] = useState<BridgeStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationFields, setMigrationFields] = useState<MigrationFields | null>(null);
  const [delayWarning, setDelayWarning] = useState<string | null>(null);

  // ---- Refs (mutable across renders, not part of React state) ----
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const pollingStartTimeRef = useRef<number>(0);
  const lastProgressStatusRef = useRef<string | null>(null);
  const isTerminalRef = useRef(false);
  // Track whether the component is mounted to prevent setState after unmount
  const mountedRef = useRef(true);

  // Stable ref for senderAddress to avoid unnecessary effect re-runs
  const senderAddressRef = useRef(senderAddress);
  senderAddressRef.current = senderAddress;

  // ---- Poll function ----
  const pollStatus = useCallback(async () => {
    if (!originTxHash || isTerminalRef.current) {
      return;
    }

    try {
      const response = await migrationApiClient.getMigrationStatus(originTxHash);

      // Guard against setState after unmount
      if (!mountedRef.current) return;

      // Reset consecutive errors on success
      consecutiveErrorsRef.current = 0;
      setError(null);

      if (response) {
        const status = response.status as BridgeStatus;
        setOperationStatus(status);

        // Extract migration-specific fields
        const fields: MigrationFields = {};
        if (response.stakeOnGoliath !== undefined) {
          fields.stakeOnGoliath = response.stakeOnGoliath;
        }
        if (response.amount !== undefined) {
          fields.amount = response.amount;
        }
        if (response.stakingTxHash !== undefined) {
          fields.stakingTxHash = response.stakingTxHash;
        }
        if (response.stakingError !== undefined) {
          fields.stakingError = response.stakingError;
        }
        if (response.destinationTxHash !== undefined) {
          fields.destinationTxHash = response.destinationTxHash;
        }
        if (response.timestamps?.completedAt !== undefined) {
          fields.completedAt = response.timestamps.completedAt;
        }
        setMigrationFields(fields);

        // Dispatch to Redux
        // Guard: never downgrade stakeOnGoliath from true to false via polling.
        // The local operation state (set during executeBridge) is the source of truth.
        // Only propagate stakeOnGoliath when the backend confirms it as true.
        dispatch(
          migrationActions.updateOperationStatus({
            status,
            destinationTxHash: response.destinationTxHash ?? undefined,
            completedAt: response.timestamps?.completedAt ?? undefined,
            ...(response.stakeOnGoliath === true ? { stakeOnGoliath: true } : {}),
            amount: response.amount ?? undefined,
            stakingTxHash: response.stakingTxHash ?? undefined,
            stakingError: response.stakingError ?? undefined,
            lastPolledAt: Date.now(),
          })
        );

        // Check for progress (status change)
        if (status !== lastProgressStatusRef.current) {
          lastProgressStatusRef.current = status;
        }

        // Check for "taking longer than expected"
        const elapsed = Date.now() - pollingStartTimeRef.current;
        if (elapsed >= DELAY_WARNING_THRESHOLD_MS && !TERMINAL_STATUSES.includes(status)) {
          setDelayWarning('Transaction is taking longer than expected.');
        }

        // Terminal state handling
        if (TERMINAL_STATUSES.includes(status)) {
          isTerminalRef.current = true;
          setIsPolling(false);

          // Clear interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          // Clear localStorage on COMPLETED
          if (status === 'COMPLETED' && senderAddressRef.current) {
            clearPendingMigration(senderAddressRef.current);
          }
        }
      }
      // null response (404) -- continue polling, status stays as-is
    } catch (err) {
      // Guard against setState after unmount
      if (!mountedRef.current) return;

      console.error('[Migration Polling] Status polling error:', err);
      consecutiveErrorsRef.current += 1;

      if (consecutiveErrorsRef.current >= CONSECUTIVE_ERROR_THRESHOLD) {
        setError('Unable to fetch migration status. Retrying...');
      }
    }
  }, [originTxHash, dispatch]);

  // ---- Effect: start/stop polling ----
  useEffect(() => {
    mountedRef.current = true;

    // Reset state when originTxHash changes
    setOperationStatus(null);
    setError(null);
    setMigrationFields(null);
    setDelayWarning(null);
    consecutiveErrorsRef.current = 0;
    lastProgressStatusRef.current = null;
    isTerminalRef.current = false;

    if (!originTxHash) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    pollingStartTimeRef.current = Date.now();

    // Fire initial poll immediately
    pollStatus();

    // Set up interval for subsequent polls
    intervalRef.current = setInterval(pollStatus, migrationConfig.statusPollMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [originTxHash, pollStatus]);

  return {
    operationStatus,
    isPolling,
    error,
    migrationFields,
    delayWarning,
  };
}
