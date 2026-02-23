import { migrationConfig } from '../../config/migrationConfig';

/**
 * Ordered steps of the migration flow.
 * Each step represents a discrete on-chain or off-chain action the user must complete.
 */
export enum MigrationStep {
  CLAIM_REWARDS = 'CLAIM_REWARDS',
  APPROVE = 'APPROVE',
  UNSTAKE = 'UNSTAKE',
  BRIDGE = 'BRIDGE',
}

/**
 * Execution status for an individual migration step.
 * Tracks the lifecycle of a single transaction or action.
 */
export enum StepExecutionStatus {
  IDLE = 'IDLE',
  WAITING_SIGNATURE = 'WAITING_SIGNATURE',
  TX_PENDING = 'TX_PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

/**
 * Maps backend bridge status strings to human-readable UI labels.
 * The keys are the status values returned by the bridge backend API.
 */
export const BRIDGE_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * Returns a deterministic localStorage key for persisting pending migration state.
 * The address is lowercased to prevent duplicate entries for checksum vs non-checksum addresses.
 */
export function getMigrationStorageKey(address: string): string {
  return `migration:pending:v1:${address.toLowerCase()}`;
}

// Contract addresses re-exported from centralised config
export const STAKING_CONTRACT_ADDRESS = migrationConfig.sepoliaStakingContract;
export const XCN_TOKEN_ADDRESS = migrationConfig.sepoliaXcnAddress;
