import { BridgeOperation, BridgeDirection, BridgeStatus } from '../../state/bridge/types';

// ============================================
// Static Fallback Estimates
// ============================================

const STATIC_ESTIMATES: Record<BridgeDirection, { min: number; max: number }> = {
  SEPOLIA_TO_GOLIATH: { min: 3, max: 5 }, // 3-5 minutes
  GOLIATH_TO_SEPOLIA: { min: 3, max: 5 }, // 3-5 minutes
};

// ============================================
// ETA Formatting Functions
// ============================================

/**
 * Format ETA for display in UI
 */
export function formatEta(operation: BridgeOperation): string {
  const { status, estimatedCompletionTime, direction } = operation;

  // Terminal states
  if (status === 'COMPLETED') {
    return 'Completed';
  }
  if (status === 'FAILED') {
    return 'Failed';
  }
  if (status === 'EXPIRED') {
    return 'Expired';
  }

  // Use backend ETA if available
  if (estimatedCompletionTime) {
    return formatRelativeEta(estimatedCompletionTime, status);
  }

  // Fallback to static estimate
  const estimate = STATIC_ESTIMATES[direction];
  return `~${estimate.min}-${estimate.max} minutes`;
}

/**
 * Format relative ETA from ISO timestamp
 */
function formatRelativeEta(isoTimestamp: string, status: BridgeStatus): string {
  const eta = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = eta.getTime() - now.getTime();

  // ETA is in the past but not completed
  if (diffMs < 0) {
    if (status === 'DELAYED') {
      return 'Taking longer than expected...';
    }
    return 'Processing...';
  }

  const diffMinutes = Math.ceil(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'Less than 1 minute';
  }
  if (diffMinutes === 1) {
    return '~1 minute remaining';
  }
  if (diffMinutes < 60) {
    return `~${diffMinutes} minutes remaining`;
  }

  const diffHours = Math.ceil(diffMinutes / 60);
  return `~${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
}

/**
 * Get status step description with ETA context
 */
export function getStepDescription(stepIndex: number, operation: BridgeOperation): string {
  const { status, originConfirmations, requiredConfirmations, direction } = operation;

  switch (stepIndex) {
    case 0: // Origin tx submitted
      if (status === 'PENDING_ORIGIN_TX') {
        return 'Waiting for transaction to be mined...';
      }
      return 'Transaction submitted';

    case 1: // Confirmations
      if (status === 'CONFIRMING') {
        return `${originConfirmations}/${requiredConfirmations} confirmations`;
      }
      if (['AWAITING_RELAY', 'PROCESSING_DESTINATION', 'COMPLETED'].includes(status)) {
        return `${requiredConfirmations}/${requiredConfirmations} confirmations`;
      }
      return 'Waiting for confirmations';

    case 2: // Processing on destination
      if (status === 'AWAITING_RELAY') {
        return 'Waiting for relayer...';
      }
      if (status === 'PROCESSING_DESTINATION') {
        const action = direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting' : 'Releasing';
        return `${action} on destination chain...`;
      }
      if (status === 'COMPLETED') {
        const action = direction === 'SEPOLIA_TO_GOLIATH' ? 'Minted' : 'Released';
        return `${action} successfully`;
      }
      return direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting' : 'Releasing';

    case 3: // Completed
      if (status === 'COMPLETED') {
        return 'Bridge complete!';
      }
      return 'Pending completion';

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
