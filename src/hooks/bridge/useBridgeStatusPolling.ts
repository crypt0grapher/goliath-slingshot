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
    console.log('[Bridge Polling] pollStatus called', {
      hasOperation: !!operation,
      status: operation?.status,
      txHash: operation?.originTxHash
    });

    if (!operation) return;
    if (TERMINAL_STATUSES.includes(operation.status)) {
      console.log('[Bridge Polling] Skipping - terminal status:', operation.status);
      return;
    }
    if (!operation.originTxHash) return;

    try {
      console.log('[Bridge Polling] Fetching status for:', operation.originTxHash);
      const response = await apiClient.current.getStatus({
        originTxHash: operation.originTxHash,
      });

      console.log('[Bridge Polling] API Response:', response);

      if (response) {
        console.log('[Bridge Polling] Dispatching update:', {
          id: operation.id,
          status: response.status,
          originConfirmations: response.originConfirmations,
        });
        dispatch(
          bridgeActions.updateOperationStatus({
            id: operation.id,
            status: response.status,
            originConfirmations: response.originConfirmations,
            destinationTxHash: response.destinationTxHash ?? undefined,
            estimatedCompletionTime: response.estimatedCompletionTime ?? undefined,
            errorMessage: response.error ?? undefined,
          })
        );
      } else {
        console.log('[Bridge Polling] No response from API');
      }
    } catch (error) {
      console.error('[Bridge Polling] Status polling error:', error);
      // Don't update state on error - will retry next interval
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
