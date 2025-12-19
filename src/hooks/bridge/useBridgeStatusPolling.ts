import { useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeApiClient } from '../../services/bridgeApi';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { bridgeConfig } from '../../config/bridgeConfig';

const TERMINAL_STATUSES: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];

export function useBridgeStatusPolling(operation: BridgeOperation | null) {
  const dispatch = useDispatch();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiClient = useRef(new BridgeApiClient(bridgeConfig.statusApiBaseUrl));

  const pollStatus = useCallback(async () => {
    if (!operation || TERMINAL_STATUSES.includes(operation.status) || !operation.originTxHash) {
      return;
    }

    try {
      const response = await apiClient.current.getStatus({
        originTxHash: operation.originTxHash,
      });

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
    }
  }, [operation, dispatch]);

  // Start/stop polling based on operation state
  useEffect(() => {
    if (!operation) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (TERMINAL_STATUSES.includes(operation.status)) {
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
  }, [operation?.id, operation?.status, pollStatus]);
}
