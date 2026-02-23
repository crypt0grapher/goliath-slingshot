import migrationReducer, { migrationActions } from '../slice';
import {
  MigrationState,
  StakingSnapshot,
  MigrationOperation,
} from '../types';
import { MigrationStep, StepExecutionStatus } from '../../../constants/migration';
import {
  selectStakingSnapshot,
  selectVisibleSteps,
  selectActiveStep,
  selectStepExecution,
  selectStakeToggle,
  selectIsToggleLocked,
  selectOperation,
  selectIsResumeMode,
  selectIsEmpty,
} from '../selectors';

// ============================================
// Helpers
// ============================================

function getInitialState(): MigrationState {
  return migrationReducer(undefined, { type: '@@INIT' });
}

function buildAppState(migration: MigrationState) {
  return { migration } as { migration: MigrationState };
}

// ============================================
// Initial State
// ============================================

describe('migration slice - initial state', () => {
  it('should return the correct initial state', () => {
    const state = getInitialState();

    // Snapshot defaults
    expect(state.snapshot.staked).toBe('0');
    expect(state.snapshot.rewards).toBe('0');
    expect(state.snapshot.walletXcn).toBe('0');
    expect(state.snapshot.allowance).toBe('0');
    expect(state.snapshot.loading).toBe(false);
    expect(state.snapshot.error).toBeNull();

    // Flow defaults
    expect(state.flow.visibleSteps).toEqual([]);
    expect(state.flow.activeStep).toBeNull();
    expect(state.flow.stepExecutions[MigrationStep.CLAIM_REWARDS].status).toBe(
      StepExecutionStatus.IDLE
    );
    expect(state.flow.stepExecutions[MigrationStep.APPROVE].status).toBe(
      StepExecutionStatus.IDLE
    );
    expect(state.flow.stepExecutions[MigrationStep.UNSTAKE].status).toBe(
      StepExecutionStatus.IDLE
    );
    expect(state.flow.stepExecutions[MigrationStep.BRIDGE].status).toBe(
      StepExecutionStatus.IDLE
    );

    // Preferences defaults
    expect(state.preferences.stakeOnGoliath).toBe(true);
    expect(state.preferences.isToggleLocked).toBe(false);

    // Operation default
    expect(state.operation).toBeNull();

    // UI defaults
    expect(state.ui.isResumeMode).toBe(false);
    expect(state.ui.isEmpty).toBe(false);
    expect(state.ui.isStatusView).toBe(false);
  });
});

// ============================================
// Snapshot Reducers
// ============================================

describe('migration slice - setSnapshot', () => {
  it('should set the staking snapshot', () => {
    const snapshot: StakingSnapshot = {
      staked: '1000000000000000000',
      rewards: '500000000000000000',
      walletXcn: '2000000000000000000',
      allowance: '0',
      loading: false,
      error: null,
    };

    const state = migrationReducer(getInitialState(), migrationActions.setSnapshot(snapshot));

    expect(state.snapshot).toEqual(snapshot);
  });

  it('should overwrite existing snapshot completely', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setSnapshot({
        staked: '100',
        rewards: '50',
        walletXcn: '200',
        allowance: '10',
        loading: true,
        error: 'old error',
      })
    );

    const newSnapshot: StakingSnapshot = {
      staked: '999',
      rewards: '0',
      walletXcn: '0',
      allowance: '0',
      loading: false,
      error: null,
    };

    state = migrationReducer(state, migrationActions.setSnapshot(newSnapshot));
    expect(state.snapshot).toEqual(newSnapshot);
  });
});

// ============================================
// Flow Reducers
// ============================================

describe('migration slice - setFlow', () => {
  it('should set visible steps and active step', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.setFlow({
        visibleSteps: [MigrationStep.APPROVE, MigrationStep.UNSTAKE, MigrationStep.BRIDGE],
        activeStep: MigrationStep.APPROVE,
      })
    );

    expect(state.flow.visibleSteps).toEqual([
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(state.flow.activeStep).toBe(MigrationStep.APPROVE);
  });

  it('should preserve existing stepExecutions when setting flow', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xabc' },
      })
    );

    state = migrationReducer(
      state,
      migrationActions.setFlow({
        visibleSteps: [MigrationStep.UNSTAKE, MigrationStep.BRIDGE],
        activeStep: MigrationStep.UNSTAKE,
      })
    );

    // stepExecutions should NOT be wiped
    expect(state.flow.stepExecutions[MigrationStep.APPROVE].status).toBe(
      StepExecutionStatus.CONFIRMED
    );
    expect(state.flow.stepExecutions[MigrationStep.APPROVE].txHash).toBe('0xabc');
  });
});

// ============================================
// Step Execution Reducers
// ============================================

describe('migration slice - updateStepExecution', () => {
  it('should update a specific step execution status', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.WAITING_SIGNATURE },
      })
    );

    expect(state.flow.stepExecutions[MigrationStep.APPROVE]).toEqual({
      status: StepExecutionStatus.WAITING_SIGNATURE,
    });
  });

  it('should set txHash and error on step execution', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.updateStepExecution({
        step: MigrationStep.BRIDGE,
        execution: {
          status: StepExecutionStatus.FAILED,
          txHash: '0xdeadbeef',
          error: 'user rejected',
        },
      })
    );

    expect(state.flow.stepExecutions[MigrationStep.BRIDGE]).toEqual({
      status: StepExecutionStatus.FAILED,
      txHash: '0xdeadbeef',
      error: 'user rejected',
    });
  });

  it('should not affect other steps when updating one', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.updateStepExecution({
        step: MigrationStep.UNSTAKE,
        execution: { status: StepExecutionStatus.TX_PENDING, txHash: '0x123' },
      })
    );

    expect(state.flow.stepExecutions[MigrationStep.APPROVE].status).toBe(
      StepExecutionStatus.IDLE
    );
    expect(state.flow.stepExecutions[MigrationStep.CLAIM_REWARDS].status).toBe(
      StepExecutionStatus.IDLE
    );
    expect(state.flow.stepExecutions[MigrationStep.BRIDGE].status).toBe(
      StepExecutionStatus.IDLE
    );
  });
});

// ============================================
// Preference Reducers
// ============================================

describe('migration slice - preferences', () => {
  it('should toggle stakeOnGoliath from true to false', () => {
    const state = migrationReducer(getInitialState(), migrationActions.toggleStakePreference());
    expect(state.preferences.stakeOnGoliath).toBe(false);
  });

  it('should toggle stakeOnGoliath back to true', () => {
    let state = migrationReducer(getInitialState(), migrationActions.toggleStakePreference());
    state = migrationReducer(state, migrationActions.toggleStakePreference());
    expect(state.preferences.stakeOnGoliath).toBe(true);
  });

  it('should not toggle when locked', () => {
    let state = migrationReducer(getInitialState(), migrationActions.lockToggle());
    state = migrationReducer(state, migrationActions.toggleStakePreference());
    // Should remain true (default) because toggle is locked
    expect(state.preferences.stakeOnGoliath).toBe(true);
  });

  it('should lock the toggle', () => {
    const state = migrationReducer(getInitialState(), migrationActions.lockToggle());
    expect(state.preferences.isToggleLocked).toBe(true);
  });
});

// ============================================
// Operation Reducers
// ============================================

describe('migration slice - operation', () => {
  const mockOperation: MigrationOperation = {
    originTxHash: '0xorigin123',
    intentId: 'intent-456',
    status: 'pending',
  };

  it('should set an operation', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.setOperation(mockOperation)
    );
    expect(state.operation).toEqual(mockOperation);
  });

  it('should update operation status fields', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setOperation(mockOperation)
    );

    state = migrationReducer(
      state,
      migrationActions.updateOperationStatus({
        status: 'completed',
        stakingTxHash: '0xstaking789',
        lastPolledAt: 1700000000000,
      })
    );

    expect(state.operation).toEqual({
      originTxHash: '0xorigin123',
      intentId: 'intent-456',
      status: 'completed',
      stakingTxHash: '0xstaking789',
      lastPolledAt: 1700000000000,
    });
  });

  it('should not update operation status when no operation exists', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.updateOperationStatus({
        status: 'completed',
      })
    );
    expect(state.operation).toBeNull();
  });

  it('should set stakingError on operation', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setOperation(mockOperation)
    );

    state = migrationReducer(
      state,
      migrationActions.updateOperationStatus({
        status: 'failed',
        stakingError: 'staking tx reverted',
      })
    );

    expect(state.operation?.stakingError).toBe('staking tx reverted');
    expect(state.operation?.status).toBe('failed');
  });

  it('should clear an operation', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setOperation(mockOperation)
    );

    state = migrationReducer(state, migrationActions.clearOperation());
    expect(state.operation).toBeNull();
  });
});

// ============================================
// UI Flags Reducers
// ============================================

describe('migration slice - setUiFlags', () => {
  it('should set isResumeMode', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.setUiFlags({ isResumeMode: true })
    );
    expect(state.ui.isResumeMode).toBe(true);
    // Other flags should remain unchanged
    expect(state.ui.isEmpty).toBe(false);
    expect(state.ui.isStatusView).toBe(false);
  });

  it('should set multiple flags at once', () => {
    const state = migrationReducer(
      getInitialState(),
      migrationActions.setUiFlags({ isEmpty: true, isStatusView: true })
    );
    expect(state.ui.isEmpty).toBe(true);
    expect(state.ui.isStatusView).toBe(true);
    expect(state.ui.isResumeMode).toBe(false);
  });

  it('should merge flags with existing state', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setUiFlags({ isResumeMode: true })
    );
    state = migrationReducer(state, migrationActions.setUiFlags({ isStatusView: true }));

    expect(state.ui.isResumeMode).toBe(true);
    expect(state.ui.isStatusView).toBe(true);
  });
});

// ============================================
// Selectors
// ============================================

describe('migration selectors', () => {
  it('selectStakingSnapshot returns snapshot', () => {
    const state = getInitialState();
    const appState = buildAppState(state);
    expect(selectStakingSnapshot(appState)).toBe(state.snapshot);
  });

  it('selectVisibleSteps returns visible steps array', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setFlow({
        visibleSteps: [MigrationStep.APPROVE, MigrationStep.BRIDGE],
        activeStep: MigrationStep.APPROVE,
      })
    );
    const appState = buildAppState(state);
    expect(selectVisibleSteps(appState)).toEqual([MigrationStep.APPROVE, MigrationStep.BRIDGE]);
  });

  it('selectActiveStep returns active step', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.setFlow({
        visibleSteps: [MigrationStep.UNSTAKE],
        activeStep: MigrationStep.UNSTAKE,
      })
    );
    const appState = buildAppState(state);
    expect(selectActiveStep(appState)).toBe(MigrationStep.UNSTAKE);
  });

  it('selectActiveStep returns null when no active step', () => {
    const appState = buildAppState(getInitialState());
    expect(selectActiveStep(appState)).toBeNull();
  });

  it('selectStepExecution returns execution for a given step', () => {
    let state = migrationReducer(
      getInitialState(),
      migrationActions.updateStepExecution({
        step: MigrationStep.BRIDGE,
        execution: { status: StepExecutionStatus.TX_PENDING, txHash: '0xabc' },
      })
    );
    const appState = buildAppState(state);
    const execution = selectStepExecution(appState, MigrationStep.BRIDGE);
    expect(execution.status).toBe(StepExecutionStatus.TX_PENDING);
    expect(execution.txHash).toBe('0xabc');
  });

  it('selectStakeToggle returns stakeOnGoliath value', () => {
    const appState = buildAppState(getInitialState());
    expect(selectStakeToggle(appState)).toBe(true);
  });

  it('selectIsToggleLocked returns isToggleLocked value', () => {
    const appState = buildAppState(getInitialState());
    expect(selectIsToggleLocked(appState)).toBe(false);

    const locked = migrationReducer(getInitialState(), migrationActions.lockToggle());
    expect(selectIsToggleLocked(buildAppState(locked))).toBe(true);
  });

  it('selectOperation returns current operation or null', () => {
    const appState = buildAppState(getInitialState());
    expect(selectOperation(appState)).toBeNull();

    const withOp = migrationReducer(
      getInitialState(),
      migrationActions.setOperation({
        originTxHash: '0x1',
        intentId: 'id1',
        status: 'pending',
      })
    );
    expect(selectOperation(buildAppState(withOp))).toEqual({
      originTxHash: '0x1',
      intentId: 'id1',
      status: 'pending',
    });
  });

  it('selectIsResumeMode returns ui.isResumeMode', () => {
    const appState = buildAppState(getInitialState());
    expect(selectIsResumeMode(appState)).toBe(false);

    const resumed = migrationReducer(
      getInitialState(),
      migrationActions.setUiFlags({ isResumeMode: true })
    );
    expect(selectIsResumeMode(buildAppState(resumed))).toBe(true);
  });

  it('selectIsEmpty returns ui.isEmpty', () => {
    const appState = buildAppState(getInitialState());
    expect(selectIsEmpty(appState)).toBe(false);

    const empty = migrationReducer(
      getInitialState(),
      migrationActions.setUiFlags({ isEmpty: true })
    );
    expect(selectIsEmpty(buildAppState(empty))).toBe(true);
  });
});
