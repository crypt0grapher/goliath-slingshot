import { createSelector } from '@reduxjs/toolkit';
import { AppState } from '../index';
import { BridgeOperation, BridgeStatus, BridgeNetwork } from './types';

// Base selectors
export const selectBridgeState = (state: AppState) => state.bridge;
export const selectBridgeForm = (state: AppState) => state.bridge.form;
export const selectOperations = (state: AppState) => state.bridge.operations;
export const selectOperationIds = (state: AppState) => state.bridge.operationIds;
export const selectActiveOperationId = (state: AppState) => state.bridge.activeOperationId;

// Derived selectors
export const selectActiveOperation = createSelector(
  [selectOperations, selectActiveOperationId],
  (operations, activeId): BridgeOperation | null => {
    return activeId ? operations[activeId] ?? null : null;
  }
);

export const selectAllOperations = createSelector(
  [selectOperations, selectOperationIds],
  (operations, ids): BridgeOperation[] => {
    return ids.map((id) => operations[id]).filter(Boolean);
  }
);

export const selectPendingOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    const pendingStatuses: BridgeStatus[] = [
      'PENDING_ORIGIN_TX',
      'CONFIRMING',
      'AWAITING_RELAY',
      'PROCESSING_DESTINATION',
      'DELAYED',
    ];
    return operations.filter((op) => pendingStatuses.includes(op.status));
  }
);

export const selectCompletedOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.filter((op) => op.status === 'COMPLETED');
  }
);

export const selectFailedOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.filter((op) => op.status === 'FAILED' || op.status === 'EXPIRED');
  }
);

export const selectRecentOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.slice(0, 10); // Last 10 operations
  }
);

export const selectOperationsByAddress = createSelector(
  [selectAllOperations, (_state: AppState, address: string) => address],
  (operations, address): BridgeOperation[] => {
    const normalizedAddress = address.toLowerCase();
    return operations.filter(
      (op) =>
        op.sender.toLowerCase() === normalizedAddress ||
        op.recipient.toLowerCase() === normalizedAddress
    );
  }
);

export const selectDirection = createSelector([selectBridgeForm], (form) => {
  return form.originNetwork === BridgeNetwork.SEPOLIA
    ? 'SEPOLIA_TO_GOLIATH'
    : 'GOLIATH_TO_SEPOLIA';
});

export const selectIsSubmitting = (state: AppState) => state.bridge.isSubmitting;
export const selectIsApproving = (state: AppState) => state.bridge.isApproving;
export const selectBridgeError = (state: AppState) => state.bridge.error;
export const selectIsConfirmModalOpen = (state: AppState) => state.bridge.isConfirmModalOpen;
export const selectIsStatusModalOpen = (state: AppState) => state.bridge.isStatusModalOpen;
