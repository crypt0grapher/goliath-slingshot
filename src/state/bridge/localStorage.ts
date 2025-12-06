import { BridgeOperation, BridgeStatus } from './types';

const STORAGE_KEY = 'bridge:operations:v1';
const MAX_STORED_OPERATIONS = 100;
const EXPIRY_DAYS = 30;

interface StoredData {
  version: number;
  operations: Record<string, BridgeOperation>;
  operationIds: string[];
  lastUpdated: number;
}

/**
 * Load operations from localStorage
 */
export function loadOperationsFromStorage(): {
  operations: Record<string, BridgeOperation>;
  operationIds: string[];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { operations: {}, operationIds: [] };
    }

    const data: StoredData = JSON.parse(raw);

    // Filter out expired operations
    const expiryThreshold = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const validOperationIds = data.operationIds.filter((id) => {
      const op = data.operations[id];
      return op && op.createdAt > expiryThreshold;
    });

    const validOperations: Record<string, BridgeOperation> = {};
    validOperationIds.forEach((id) => {
      validOperations[id] = data.operations[id];
    });

    return {
      operations: validOperations,
      operationIds: validOperationIds,
    };
  } catch (error) {
    console.error('Failed to load bridge operations from storage:', error);
    return { operations: {}, operationIds: [] };
  }
}

/**
 * Save operations to localStorage
 */
export function saveOperationsToStorage(
  operations: Record<string, BridgeOperation>,
  operationIds: string[]
): void {
  try {
    // Limit stored operations
    const limitedIds = operationIds.slice(0, MAX_STORED_OPERATIONS);
    const limitedOperations: Record<string, BridgeOperation> = {};
    limitedIds.forEach((id) => {
      if (operations[id]) {
        limitedOperations[id] = operations[id];
      }
    });

    const data: StoredData = {
      version: 1,
      operations: limitedOperations,
      operationIds: limitedIds,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save bridge operations to storage:', error);
  }
}

/**
 * Clear all stored operations
 */
export function clearStoredOperations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear bridge operations from storage:', error);
  }
}

/**
 * Determine if an operation needs status polling
 */
export function operationNeedsPolling(status: BridgeStatus): boolean {
  const terminalStatuses: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];
  return !terminalStatuses.includes(status);
}
