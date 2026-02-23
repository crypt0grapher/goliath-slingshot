import { MigrationStep, StepExecutionStatus } from '../../constants/migration';

// ============================================
// Staking Snapshot
// ============================================

/**
 * On-chain staking position data fetched from the Sepolia staking contract.
 * All numeric values are stringified wei amounts to avoid BigNumber serialization issues in Redux.
 */
export interface StakingSnapshot {
  staked: string;
  rewards: string;
  walletXcn: string;
  allowance: string;
  loading: boolean;
  error: string | null;
}

// ============================================
// Step Execution
// ============================================

/**
 * Tracks the execution lifecycle of a single migration step.
 */
export interface StepExecution {
  status: StepExecutionStatus;
  txHash?: string;
  error?: string;
}

// ============================================
// Migration Flow
// ============================================

/**
 * Describes the current migration flow: which steps are visible,
 * which step is active, and the execution state of each step.
 */
export interface MigrationFlow {
  visibleSteps: MigrationStep[];
  activeStep: MigrationStep | null;
  stepExecutions: Record<MigrationStep, StepExecution>;
}

// ============================================
// Migration Preferences
// ============================================

/**
 * User preferences for the migration flow.
 * stakeOnGoliath: whether to auto-stake bridged XCN on Goliath.
 * isToggleLocked: prevents toggling once the bridge step has begun.
 */
export interface MigrationPreferences {
  stakeOnGoliath: boolean;
  isToggleLocked: boolean;
}

// ============================================
// Migration Operation
// ============================================

/**
 * Tracks an active bridge+stake operation after the user submits the bridge transaction.
 */
export interface MigrationOperation {
  originTxHash: string;
  intentId: string;
  status: string;
  stakingTxHash?: string;
  stakingError?: string;
  lastPolledAt?: number;
}

// ============================================
// Migration State (Top-Level)
// ============================================

/**
 * Top-level state shape for the migration feature.
 */
export interface MigrationState {
  snapshot: StakingSnapshot;
  flow: MigrationFlow;
  preferences: MigrationPreferences;
  operation: MigrationOperation | null;
  ui: {
    isResumeMode: boolean;
    isEmpty: boolean;
    isStatusView: boolean;
  };
}
