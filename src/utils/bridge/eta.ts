import { TFunction } from 'i18next';
import { BridgeOperation, BridgeDirection, BridgeStatus } from '../../state/bridge/types';

// ============================================
// Static Fallback Estimates
// ============================================

const STATIC_ESTIMATES: Record<BridgeDirection, { min: number; max: number }> = {
  SEPOLIA_TO_GOLIATH: { min: 1, max: 2 }, // 1-2 minutes
  GOLIATH_TO_SEPOLIA: { min: 1, max: 2 }, // 1-2 minutes
};

// ============================================
// ETA Formatting Functions
// ============================================

/**
 * Format ETA for display in UI
 */
export function formatEta(operation: BridgeOperation, t?: TFunction): string {
  const { status, estimatedCompletionTime, direction } = operation;

  // Terminal states
  if (status === 'COMPLETED') {
    return t ? t('etaCompleted') : 'Completed';
  }
  if (status === 'FAILED') {
    return t ? t('etaFailed') : 'Failed';
  }
  if (status === 'EXPIRED') {
    return t ? t('etaExpired') : 'Expired';
  }

  // When at final processing step (releasing/minting), show shorter estimate
  if (status === 'AWAITING_RELAY' || status === 'PROCESSING_DESTINATION') {
    return t ? t('etaOneMinuteRemaining') : '~1 minute remaining';
  }

  // Use backend ETA if available
  if (estimatedCompletionTime) {
    return formatRelativeEta(estimatedCompletionTime, status, t);
  }

  // Fallback to static estimate
  const estimate = STATIC_ESTIMATES[direction];
  return t ? t('etaMinutes', { min: estimate.min, max: estimate.max }) : `~${estimate.min}-${estimate.max} minutes`;
}

/**
 * Format relative ETA from ISO timestamp
 */
function formatRelativeEta(isoTimestamp: string, status: BridgeStatus, t?: TFunction): string {
  const eta = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = eta.getTime() - now.getTime();

  // ETA is in the past but not completed
  if (diffMs < 0) {
    if (status === 'DELAYED') {
      return t ? t('etaTakingLonger') : 'Taking longer than expected...';
    }
    return t ? t('etaProcessing') : 'Processing...';
  }

  const diffMinutes = Math.ceil(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return t ? t('etaLessThanOneMinute') : 'Less than 1 minute';
  }
  if (diffMinutes === 1) {
    return t ? t('etaOneMinuteRemaining') : '~1 minute remaining';
  }
  if (diffMinutes < 60) {
    return t ? t('etaMinutesRemaining', { count: diffMinutes }) : `~${diffMinutes} minutes remaining`;
  }

  const diffHours = Math.ceil(diffMinutes / 60);
  return t ? t('etaHoursRemaining', { count: diffHours }) : `~${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
}

/**
 * Get status step description with ETA context
 */
export function getStepDescription(stepIndex: number, operation: BridgeOperation, t?: TFunction): string {
  const { status, originConfirmations, requiredConfirmations, direction } = operation;

  switch (stepIndex) {
    case 0: // Origin tx submitted
      if (status === 'PENDING_ORIGIN_TX') {
        return t ? t('waitingForTxMined') : 'Waiting for transaction to be mined...';
      }
      return t ? t('transactionSubmitted') : 'Transaction submitted';

    case 1: // Confirmations
      if (status === 'CONFIRMING') {
        return t ? t('confirmationsProgress', { current: originConfirmations, required: requiredConfirmations }) : `${originConfirmations}/${requiredConfirmations} confirmations`;
      }
      if (['AWAITING_RELAY', 'PROCESSING_DESTINATION', 'COMPLETED'].includes(status)) {
        return t ? t('confirmationsProgress', { current: requiredConfirmations, required: requiredConfirmations }) : `${requiredConfirmations}/${requiredConfirmations} confirmations`;
      }
      return t ? t('waitingForConfirmations') : 'Waiting for confirmations';

    case 2: // Processing on destination
      if (status === 'AWAITING_RELAY') {
        return t ? t('waitingForRelayer') : 'Waiting for relayer...';
      }
      if (status === 'PROCESSING_DESTINATION') {
        return t ? (direction === 'SEPOLIA_TO_GOLIATH' ? t('mintingOnDestination') : t('releasingOnDestination')) : (direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting on destination chain...' : 'Releasing on destination chain...');
      }
      if (status === 'COMPLETED') {
        return t ? (direction === 'SEPOLIA_TO_GOLIATH' ? t('mintedSuccessfully') : t('releasedSuccessfully')) : (direction === 'SEPOLIA_TO_GOLIATH' ? 'Minted successfully' : 'Released successfully');
      }
      return t ? (direction === 'SEPOLIA_TO_GOLIATH' ? t('minting') : t('releasing')) : (direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting' : 'Releasing');

    case 3: // Completed
      if (status === 'COMPLETED') {
        return t ? t('bridgeCompleteStep') : 'Bridge complete!';
      }
      return t ? t('pendingCompletion') : 'Pending completion';

    default:
      return '';
  }
}

/**
 * Check if operation is taking longer than expected
 */
export function isDelayed(operation: BridgeOperation): boolean {
  if (operation.status === 'DELAYED') return true;

  if (operation.estimatedCompletionTime) {
    const eta = new Date(operation.estimatedCompletionTime);
    const now = new Date();
    // If ETA is more than 5 minutes in the past
    if (now.getTime() - eta.getTime() > 5 * 60 * 1000) {
      return true;
    }
  }

  // If operation has been pending for more than 10 minutes
  const elapsed = Date.now() - operation.createdAt;
  if (elapsed > 10 * 60 * 1000 && operation.status !== 'COMPLETED') {
    return true;
  }

  return false;
}

/**
 * Get static ETA estimate for display before operation starts
 */
export function getStaticEtaEstimate(direction: BridgeDirection): string {
  const estimate = STATIC_ESTIMATES[direction];
  return `~${estimate.min}-${estimate.max} minutes`;
}
