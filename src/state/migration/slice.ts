import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MigrationStep, StepExecutionStatus } from '../../constants/migration';
import {
  MigrationState,
  StakingSnapshot,
  StepExecution,
  MigrationOperation,
} from './types';

// ============================================
// Initial Step Executions
// ============================================

function createInitialStepExecutions(): Record<MigrationStep, StepExecution> {
  return {
    [MigrationStep.CLAIM_REWARDS]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.APPROVE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.UNSTAKE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.BRIDGE]: { status: StepExecutionStatus.IDLE },
  };
}

// ============================================
// Initial State
// ============================================

const initialState: MigrationState = {
  snapshot: {
    staked: '0',
    rewards: '0',
    walletXcn: '0',
    allowance: '0',
    loading: false,
    error: null,
  },
  flow: {
    visibleSteps: [],
    activeStep: null,
    stepExecutions: createInitialStepExecutions(),
  },
  preferences: {
    stakeOnGoliath: true,
    isToggleLocked: false,
  },
  operation: null,
  ui: {
    isResumeMode: false,
    isEmpty: false,
    isStatusView: false,
  },
};

// ============================================
// Slice
// ============================================

const migrationSlice = createSlice({
  name: 'migration',
  initialState,
  reducers: {
    // ========================================
    // Snapshot
    // ========================================
    setSnapshot(state, action: PayloadAction<StakingSnapshot>) {
      state.snapshot = action.payload;
    },

    // ========================================
    // Flow
    // ========================================
    setFlow(
      state,
      action: PayloadAction<{ visibleSteps: MigrationStep[]; activeStep: MigrationStep | null }>
    ) {
      state.flow.visibleSteps = action.payload.visibleSteps;
      state.flow.activeStep = action.payload.activeStep;
      // Note: stepExecutions are intentionally preserved across flow changes
    },

    // ========================================
    // Step Execution
    // ========================================
    updateStepExecution(
      state,
      action: PayloadAction<{ step: MigrationStep; execution: StepExecution }>
    ) {
      state.flow.stepExecutions[action.payload.step] = action.payload.execution;
    },

    // ========================================
    // Preferences
    // ========================================
    toggleStakePreference(state) {
      if (!state.preferences.isToggleLocked) {
        state.preferences.stakeOnGoliath = !state.preferences.stakeOnGoliath;
      }
    },

    lockToggle(state) {
      state.preferences.isToggleLocked = true;
    },

    // ========================================
    // Operation
    // ========================================
    setOperation(state, action: PayloadAction<MigrationOperation>) {
      state.operation = action.payload;
    },

    updateOperationStatus(
      state,
      action: PayloadAction<{
        status: string;
        stakingTxHash?: string;
        stakingError?: string;
        lastPolledAt?: number;
      }>
    ) {
      if (state.operation) {
        const { status, stakingTxHash, stakingError, lastPolledAt } = action.payload;
        state.operation.status = status;
        if (stakingTxHash !== undefined) {
          state.operation.stakingTxHash = stakingTxHash;
        }
        if (stakingError !== undefined) {
          state.operation.stakingError = stakingError;
        }
        if (lastPolledAt !== undefined) {
          state.operation.lastPolledAt = lastPolledAt;
        }
      }
    },

    clearOperation(state) {
      state.operation = null;
    },

    // ========================================
    // UI Flags
    // ========================================
    setUiFlags(
      state,
      action: PayloadAction<Partial<MigrationState['ui']>>
    ) {
      state.ui = { ...state.ui, ...action.payload };
    },
  },
});

export const migrationActions = migrationSlice.actions;
export default migrationSlice.reducer;
