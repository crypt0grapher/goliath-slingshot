import { useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeApiClient } from '../../services/bridgeApi';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { bridgeConfig } from '../../config/bridgeConfig';

const TERMINAL_STATUSES: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];

// Max additional polls after COMPLETED to fetch destination tx hash
const MAX_DESTINATION_TX_POLLS = 10;

// Threshold for marking a transaction as "stuck" (5 minutes in PENDING_ORIGIN_TX)
const TX_STUCK_THRESHOLD_MS = 5 * 60 * 1000;

// Max consecutive polling errors before showing warning
const MAX_CONSECUTIVE_ERRORS = 3;

export function useBridgeStatusPolling(operation: BridgeOperation | null) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiClient = useRef(new BridgeApiClient(bridgeConfig.statusApiBaseUrl));
  const destinationPollCountRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);

  const pollStatus = useCallback(async () => {
    if (!operation || !operation.originTxHash) {
      return;
    }

    // Stop polling if terminal status AND we have the destination tx hash (or we've tried enough times)
    const isTerminal = TERMINAL_STATUSES.includes(operation.status);
    const hasDestinationTx = !!operation.destinationTxHash;
    const exhaustedDestinationPolls = destinationPollCountRef.current >= MAX_DESTINATION_TX_POLLS;

    if (isTerminal && (hasDestinationTx || exhaustedDestinationPolls)) {
      return;
    }

    // Track additional polls after COMPLETED to get destination tx hash
    if (isTerminal && !hasDestinationTx) {
      destinationPollCountRef.current += 1;
    }

    // Check for stuck transaction (pending for too long without any status update)
    if (
      operation.status === 'PENDING_ORIGIN_TX' &&
      Date.now() - operation.createdAt > TX_STUCK_THRESHOLD_MS
    ) {
      dispatch(
        bridgeActions.updateOperationStatus({
          id: operation.id,
          status: 'DELAYED',
          errorMessage: t('transactionTakingLonger'),
        })
      );
    }

    try {
      const response = await apiClient.current.getStatus({
        originTxHash: operation.originTxHash,
      });

      // Reset consecutive error counter on success
      consecutiveErrorsRef.current = 0;
      dispatch(bridgeActions.clearPollingError());

      if (response) {
        // Defensive check: never decrease confirmations (prevents UI flicker if API returns stale data)
        const safeConfirmations = Math.max(
          response.originConfirmations,
          operation.originConfirmations
        );

        dispatch(
          bridgeActions.updateOperationStatus({
            id: operation.id,
            status: response.status,
            originConfirmations: safeConfirmations,
            destinationTxHash: response.destinationTxHash ?? undefined,
            estimatedCompletionTime: response.estimatedCompletionTime ?? undefined,
            errorMessage: response.error ?? undefined,
          })
        );
      }
    } catch (error) {
      console.error('[Bridge Polling] Status polling error:', error);
      consecutiveErrorsRef.current += 1;

      // Show warning to user after multiple consecutive failures
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        dispatch(
          bridgeActions.setPollingError(t('unableFetchBridgeStatus'))
        );
      }
    }
  }, [operation, dispatch, t]);

  // Reset counters when operation changes
  useEffect(() => {
    destinationPollCountRef.current = 0;
    consecutiveErrorsRef.current = 0;
    dispatch(bridgeActions.clearPollingError());
  }, [operation?.id, dispatch]);

  // Start/stop polling based on operation state
  useEffect(() => {
    if (!operation) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const isTerminal = TERMINAL_STATUSES.includes(operation.status);
    const hasDestinationTx = !!operation.destinationTxHash;
    const exhaustedDestinationPolls = destinationPollCountRef.current >= MAX_DESTINATION_TX_POLLS;

    // Stop polling only if:
    // - Failed/Expired status, OR
    // - Completed AND (has destination tx OR exhausted polls)
    const shouldStopPolling =
      operation.status === 'FAILED' ||
      operation.status === 'EXPIRED' ||
      (isTerminal && (hasDestinationTx || exhaustedDestinationPolls));

    if (shouldStopPolling) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial poll
    pollStatus();

    // Set up interval
    intervalRef.current = setInterval(pollStatus, bridgeConfig.statusPollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [operation?.id, operation?.status, operation?.destinationTxHash, pollStatus]);
}
