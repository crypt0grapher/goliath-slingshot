/**
 * Migration Integration Tests
 *
 * These tests verify that migration subsystems work together correctly:
 *   1. deriveSteps + Redux slice + selectors (step derivation -> store -> read-back)
 *   2. Migration API response parsing + Redux operation updates
 *   3. Persistence round-trip (save -> load -> restore in Redux)
 *   4. Feature flag gating (migrationConfig controls feature availability)
 *   5. Non-regression checks (bridge types and API imports unchanged)
 *
 * All tests exercise pure logic integration without DOM rendering.
 */

import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import migrationReducer, { migrationActions } from 'state/migration/slice';
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
} from 'state/migration/selectors';
import { MigrationState, StakingSnapshot, MigrationOperation, StepExecution } from 'state/migration/types';
import { MigrationStep, StepExecutionStatus, getMigrationStorageKey } from 'constants/migration';
import { deriveSteps, DeriveStepsResult } from 'hooks/migration/useMigrationFlow';
import {
  savePendingMigration,
  loadPendingMigration,
  clearPendingMigration,
  PendingMigration,
  STALENESS_THRESHOLD_MS,
} from 'state/migration/persistence';
import {
  MigrationApiClient,
  MigrationApiError,
  MigrationStatusResponse,
} from 'services/migrationApi';

// Bridge types for non-regression
import {
  BridgeDirection,
  BridgeStatus,
  BridgeTokenSymbol,
  BridgeNetwork,
  BridgeOperation,
  BridgeState,
} from 'state/bridge/types';
import { BridgeApiClient, BridgeApiError, BridgeStatusResponse } from 'services/bridgeApi';

// ==========================================================================
// Helpers
// ==========================================================================

interface TestAppState {
  migration: MigrationState;
}

function createTestStore(): EnhancedStore<TestAppState> {
  return configureStore({
    reducer: { migration: migrationReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
}

function buildSnapshot(overrides: Partial<StakingSnapshot> = {}): StakingSnapshot {
  return {
    staked: '0',
    rewards: '0',
    walletXcn: '0',
    allowance: '0',
    loading: false,
    error: null,
    ...overrides,
  };
}

function buildStepExecutions(
  overrides: Partial<Record<MigrationStep, StepExecution>> = {}
): Record<MigrationStep, StepExecution> {
  return {
    [MigrationStep.CLAIM_REWARDS]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.APPROVE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.UNSTAKE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.BRIDGE]: { status: StepExecutionStatus.IDLE },
    ...overrides,
  };
}

function buildOperation(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
  return {
    originTxHash: '0xabc123',
    intentId: 'intent-001',
    status: 'CONFIRMING',
    ...overrides,
  };
}

function mockFetchSuccess(data: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, body?: { message?: string; code?: string }): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body ?? {}),
  });
}

// ==========================================================================
// 1. Step Derivation + Redux Slice Integration
// ==========================================================================

describe('Integration: deriveSteps + Redux slice + selectors', () => {
  let store: EnhancedStore<TestAppState>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should derive steps from snapshot, dispatch to store, and read back via selectors', () => {
    // Simulate: user has 1000 staked, 0 allowance, claim disabled
    const snapshot = buildSnapshot({
      staked: '1000000000000000000',
      rewards: '0',
      walletXcn: '0',
      allowance: '0',
    });

    // Derive the steps from the snapshot (pure function)
    const derived = deriveSteps(snapshot, null, buildStepExecutions(), false);

    // Verify derivation
    expect(derived.visibleSteps).toEqual([
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(derived.activeStep).toBe(MigrationStep.APPROVE);
    expect(derived.isResume).toBe(false);
    expect(derived.isEmpty).toBe(false);
    expect(derived.isStatusView).toBe(false);

    // Dispatch snapshot + derived flow + UI flags to Redux (same as the hook does)
    store.dispatch(migrationActions.setSnapshot(snapshot));
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );
    store.dispatch(
      migrationActions.setUiFlags({
        isResumeMode: derived.isResume,
        isEmpty: derived.isEmpty,
        isStatusView: derived.isStatusView,
      })
    );

    // Read back via selectors
    const state = store.getState();
    expect(selectStakingSnapshot(state)).toEqual(snapshot);
    expect(selectVisibleSteps(state)).toEqual([
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(selectActiveStep(state)).toBe(MigrationStep.APPROVE);
    expect(selectIsResumeMode(state)).toBe(false);
    expect(selectIsEmpty(state)).toBe(false);
  });

  it('should derive resume flow (staked=0, walletXcn>0) and reflect in store', () => {
    const snapshot = buildSnapshot({
      staked: '0',
      walletXcn: '5000000000000000000',
      allowance: '0',
    });

    const derived = deriveSteps(snapshot, null, buildStepExecutions(), false);

    expect(derived.visibleSteps).toEqual([MigrationStep.APPROVE, MigrationStep.BRIDGE]);
    expect(derived.isResume).toBe(true);

    store.dispatch(migrationActions.setSnapshot(snapshot));
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );
    store.dispatch(
      migrationActions.setUiFlags({
        isResumeMode: derived.isResume,
        isEmpty: derived.isEmpty,
        isStatusView: derived.isStatusView,
      })
    );

    const state = store.getState();
    expect(selectVisibleSteps(state)).toEqual([MigrationStep.APPROVE, MigrationStep.BRIDGE]);
    expect(selectIsResumeMode(state)).toBe(true);
    expect(selectIsEmpty(state)).toBe(false);
  });

  it('should correctly track step execution progression through the full pipeline', () => {
    // Setup: staked user with full flow
    const snapshot = buildSnapshot({
      staked: '1000000000000000000',
      rewards: '50000000000000000',
      allowance: '0',
    });

    const initialExecs = buildStepExecutions();
    const derived = deriveSteps(snapshot, null, initialExecs, true);

    // Should include all 4 steps
    expect(derived.visibleSteps).toEqual([
      MigrationStep.CLAIM_REWARDS,
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(derived.activeStep).toBe(MigrationStep.CLAIM_REWARDS);

    // Dispatch initial state
    store.dispatch(migrationActions.setSnapshot(snapshot));
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );

    // Simulate step execution: CLAIM_REWARDS confirmed
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.CLAIM_REWARDS,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xclaim' },
      })
    );

    // Re-derive steps with updated executions
    const updatedExecs = store.getState().migration.flow.stepExecutions;
    const derived2 = deriveSteps(snapshot, null, updatedExecs, true);

    // Steps are the same (still derived from snapshot), but active step should advance
    expect(derived2.visibleSteps).toEqual([
      MigrationStep.CLAIM_REWARDS,
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(derived2.activeStep).toBe(MigrationStep.APPROVE);

    // Dispatch updated flow
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived2.visibleSteps,
        activeStep: derived2.activeStep,
      })
    );

    // Verify via selectors
    const state2 = store.getState();
    expect(selectActiveStep(state2)).toBe(MigrationStep.APPROVE);
    expect(selectStepExecution(state2, MigrationStep.CLAIM_REWARDS)).toEqual({
      status: StepExecutionStatus.CONFIRMED,
      txHash: '0xclaim',
    });
    expect(selectStepExecution(state2, MigrationStep.APPROVE)).toEqual({
      status: StepExecutionStatus.IDLE,
    });
  });

  it('should derive status view when operation is in-flight and reflect in store', () => {
    const snapshot = buildSnapshot({ staked: '1000' });
    const operation = buildOperation({ status: 'CONFIRMING' });

    const derived = deriveSteps(snapshot, operation, buildStepExecutions(), false);

    expect(derived.isStatusView).toBe(true);
    expect(derived.visibleSteps).toEqual([]);
    expect(derived.activeStep).toBeNull();

    store.dispatch(migrationActions.setSnapshot(snapshot));
    store.dispatch(migrationActions.setOperation(operation));
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );
    store.dispatch(
      migrationActions.setUiFlags({
        isResumeMode: derived.isResume,
        isEmpty: derived.isEmpty,
        isStatusView: derived.isStatusView,
      })
    );

    const state = store.getState();
    expect(selectOperation(state)).toEqual(operation);
    expect(selectVisibleSteps(state)).toEqual([]);
    expect(selectActiveStep(state)).toBeNull();
    // isStatusView is stored in ui flags but we verify via the raw state since
    // there is no exported selectIsStatusView selector
    expect(state.migration.ui.isStatusView).toBe(true);
  });

  it('should transition from status view back to step derivation when operation reaches terminal state', () => {
    // walletXcn > 0, allowance >= walletXcn so APPROVE is not needed
    const snapshot = buildSnapshot({ staked: '0', walletXcn: '500', allowance: '500' });
    const operation = buildOperation({ status: 'PROCESSING_DESTINATION' });

    // Phase 1: in-flight -> status view
    const derived1 = deriveSteps(snapshot, operation, buildStepExecutions(), false);
    expect(derived1.isStatusView).toBe(true);

    // Phase 2: operation completes -> falls through to snapshot-based derivation
    const completedOp = buildOperation({ status: 'COMPLETED' });
    const derived2 = deriveSteps(snapshot, completedOp, buildStepExecutions(), false);

    expect(derived2.isStatusView).toBe(false);
    expect(derived2.visibleSteps).toEqual([MigrationStep.BRIDGE]);
    expect(derived2.isResume).toBe(true);
  });

  it('should handle empty state (no XCN) correctly through store', () => {
    const snapshot = buildSnapshot({ staked: '0', walletXcn: '0' });
    const derived = deriveSteps(snapshot, null, buildStepExecutions(), false);

    expect(derived.isEmpty).toBe(true);
    expect(derived.visibleSteps).toEqual([]);

    store.dispatch(migrationActions.setSnapshot(snapshot));
    store.dispatch(
      migrationActions.setUiFlags({ isEmpty: derived.isEmpty })
    );

    expect(selectIsEmpty(store.getState())).toBe(true);
  });

  it('should correctly handle toggle lock through the full preference lifecycle', () => {
    const store = createTestStore();

    // Default: unlocked, stakeOnGoliath = true
    expect(selectStakeToggle(store.getState())).toBe(true);
    expect(selectIsToggleLocked(store.getState())).toBe(false);

    // Toggle off
    store.dispatch(migrationActions.toggleStakePreference());
    expect(selectStakeToggle(store.getState())).toBe(false);

    // Lock the toggle (as happens when bridge step begins)
    store.dispatch(migrationActions.lockToggle());
    expect(selectIsToggleLocked(store.getState())).toBe(true);

    // Attempt to toggle while locked: should have no effect
    store.dispatch(migrationActions.toggleStakePreference());
    expect(selectStakeToggle(store.getState())).toBe(false);
  });
});

// ==========================================================================
// 2. Migration API + Redux Operation Status Updates
// ==========================================================================

describe('Integration: MigrationApiClient + Redux operation updates', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const baseStatusResponse: MigrationStatusResponse = {
    operationId: 'op-123',
    direction: 'SEPOLIA_TO_GOLIATH',
    status: 'CONFIRMING',
    token: 'ETH',
    amount: '1000000000000000000',
    amountFormatted: '1.0',
    sender: '0xsender',
    recipient: '0xrecipient',
    originChainId: 11155111,
    destinationChainId: 8901,
    originTxHash: '0xtx123',
    destinationTxHash: null,
    originConfirmations: 3,
    requiredConfirmations: 12,
    timestamps: {
      depositedAt: '2026-02-23T10:00:00Z',
      finalizedAt: null,
      destinationSubmittedAt: null,
      completedAt: null,
    },
    estimatedCompletionTime: '2026-02-23T10:10:00Z',
    error: null,
    isSameWallet: true,
    stakeOnGoliath: true,
    stakingTxHash: null,
    stakingError: null,
  };

  it('should parse getMigrationStatus response and update Redux operation status', async () => {
    const store = createTestStore();
    const client = new MigrationApiClient('https://test.api.com');

    // Set initial operation in Redux
    store.dispatch(
      migrationActions.setOperation({
        originTxHash: '0xtx123',
        intentId: 'intent-001',
        status: 'PENDING_ORIGIN_TX',
      })
    );

    // Mock API response: status has progressed to CONFIRMING
    mockFetchSuccess(baseStatusResponse);

    const response = await client.getMigrationStatus('0xtx123');
    expect(response).not.toBeNull();

    // Dispatch to Redux as the polling hook would
    if (response) {
      store.dispatch(
        migrationActions.updateOperationStatus({
          status: response.status,
          stakingTxHash: response.stakingTxHash ?? undefined,
          stakingError: response.stakingError ?? undefined,
          lastPolledAt: 1700000000000,
        })
      );
    }

    // Verify operation is updated in store
    const op = selectOperation(store.getState());
    expect(op).not.toBeNull();
    expect(op!.status).toBe('CONFIRMING');
    expect(op!.originTxHash).toBe('0xtx123');
    expect(op!.intentId).toBe('intent-001');
    expect(op!.lastPolledAt).toBe(1700000000000);
  });

  it('should handle status progression: CONFIRMING -> AWAITING_RELAY -> COMPLETED with staking fields', async () => {
    const store = createTestStore();
    const client = new MigrationApiClient('https://test.api.com');

    store.dispatch(
      migrationActions.setOperation({
        originTxHash: '0xtx123',
        intentId: 'intent-001',
        status: 'CONFIRMING',
      })
    );

    // Step 1: CONFIRMING -> AWAITING_RELAY
    mockFetchSuccess({ ...baseStatusResponse, status: 'AWAITING_RELAY' });
    const resp1 = await client.getMigrationStatus('0xtx123');
    expect(resp1!.status).toBe('AWAITING_RELAY');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: resp1!.status,
        lastPolledAt: Date.now(),
      })
    );
    expect(selectOperation(store.getState())!.status).toBe('AWAITING_RELAY');

    // Step 2: AWAITING_RELAY -> COMPLETED with staking fields
    mockFetchSuccess({
      ...baseStatusResponse,
      status: 'COMPLETED',
      destinationTxHash: '0xdest456',
      stakeOnGoliath: true,
      stakingTxHash: '0xstaking789',
      stakingError: null,
    });

    const resp2 = await client.getMigrationStatus('0xtx123');
    expect(resp2!.status).toBe('COMPLETED');
    expect(resp2!.stakingTxHash).toBe('0xstaking789');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: resp2!.status,
        stakingTxHash: resp2!.stakingTxHash ?? undefined,
        lastPolledAt: Date.now(),
      })
    );

    const finalOp = selectOperation(store.getState());
    expect(finalOp!.status).toBe('COMPLETED');
    expect(finalOp!.stakingTxHash).toBe('0xstaking789');
  });

  it('should handle migration status response without optional migration fields', async () => {
    const client = new MigrationApiClient('https://test.api.com');

    // Response from a plain bridge operation (no migration fields)
    const plainResponse = { ...baseStatusResponse };
    delete (plainResponse as Partial<MigrationStatusResponse>).stakeOnGoliath;
    delete (plainResponse as Partial<MigrationStatusResponse>).stakingTxHash;
    delete (plainResponse as Partial<MigrationStatusResponse>).stakingError;

    mockFetchSuccess(plainResponse);

    const response = await client.getMigrationStatus('0xtx123');
    expect(response).not.toBeNull();
    expect(response!.stakeOnGoliath).toBeUndefined();
    expect(response!.stakingTxHash).toBeUndefined();
    expect(response!.stakingError).toBeUndefined();
  });

  it('should return null for 404 and not disrupt Redux state', async () => {
    const store = createTestStore();
    const client = new MigrationApiClient('https://test.api.com');

    store.dispatch(
      migrationActions.setOperation({
        originTxHash: '0xtx123',
        intentId: 'intent-001',
        status: 'PENDING_ORIGIN_TX',
      })
    );

    mockFetchError(404, { message: 'Not found' });

    const response = await client.getMigrationStatus('0xtx123');
    expect(response).toBeNull();

    // Redux state should remain unchanged
    const op = selectOperation(store.getState());
    expect(op!.status).toBe('PENDING_ORIGIN_TX');
  });

  it('should throw MigrationApiError on server errors (non-404)', async () => {
    const client = new MigrationApiClient('https://test.api.com');

    mockFetchError(500, { message: 'Internal server error' });

    await expect(client.getMigrationStatus('0xtx123')).rejects.toThrow(MigrationApiError);
    await expect(client.getMigrationStatus('0xtx123')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('should handle staking error in status response and update Redux', async () => {
    const store = createTestStore();
    const client = new MigrationApiClient('https://test.api.com');

    store.dispatch(
      migrationActions.setOperation({
        originTxHash: '0xtx123',
        intentId: 'intent-001',
        status: 'COMPLETED',
      })
    );

    mockFetchSuccess({
      ...baseStatusResponse,
      status: 'COMPLETED',
      stakeOnGoliath: true,
      stakingTxHash: null,
      stakingError: 'Staking transaction reverted: insufficient gas',
    });

    const response = await client.getMigrationStatus('0xtx123');
    expect(response!.stakingError).toBe('Staking transaction reverted: insufficient gas');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: response!.status,
        stakingError: response!.stakingError ?? undefined,
        lastPolledAt: Date.now(),
      })
    );

    const op = selectOperation(store.getState());
    expect(op!.stakingError).toBe('Staking transaction reverted: insufficient gas');
  });
});

// ==========================================================================
// 3. Persistence Round-Trip Integration
// ==========================================================================

describe('Integration: Persistence save -> load -> Redux restore', () => {
  const TEST_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('should save a migration, load it back, and restore the operation in Redux', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const store = createTestStore();

    // Phase 1: Save pending migration (as happens after bridge deposit)
    savePendingMigration(TEST_ADDRESS, {
      originTxHash: '0xbridge-deposit-tx',
      intentId: 'intent-42',
      stakeOnGoliath: true,
    });

    // Phase 2: Load pending migration (as happens on page refresh)
    const loaded = loadPendingMigration(TEST_ADDRESS);
    expect(loaded).not.toBeNull();
    expect(loaded!.originTxHash).toBe('0xbridge-deposit-tx');
    expect(loaded!.intentId).toBe('intent-42');
    expect(loaded!.stakeOnGoliath).toBe(true);
    expect(loaded!.timestamp).toBe(now);

    // Phase 3: Restore to Redux (as happens in the resume flow)
    store.dispatch(
      migrationActions.setOperation({
        originTxHash: loaded!.originTxHash,
        intentId: loaded!.intentId,
        status: 'PENDING_ORIGIN_TX', // Initial status before first poll
      })
    );

    // Verify the operation is in the store
    const op = selectOperation(store.getState());
    expect(op).not.toBeNull();
    expect(op!.originTxHash).toBe('0xbridge-deposit-tx');
    expect(op!.intentId).toBe('intent-42');
    expect(op!.status).toBe('PENDING_ORIGIN_TX');

    // Verify deriveSteps now shows status view
    const snapshot = buildSnapshot({ staked: '1000' });
    const derived = deriveSteps(snapshot, op!, buildStepExecutions(), false);
    expect(derived.isStatusView).toBe(true);
  });

  it('should handle the full lifecycle: save -> reload -> poll updates -> completion -> clear', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const store = createTestStore();

    // Save
    savePendingMigration(TEST_ADDRESS, {
      originTxHash: '0xdeposit',
      intentId: 'intent-99',
      stakeOnGoliath: false,
    });

    // Load
    const loaded = loadPendingMigration(TEST_ADDRESS);
    expect(loaded).not.toBeNull();

    // Restore to Redux
    store.dispatch(
      migrationActions.setOperation({
        originTxHash: loaded!.originTxHash,
        intentId: loaded!.intentId,
        status: 'CONFIRMING',
      })
    );

    // Simulate poll updates
    store.dispatch(
      migrationActions.updateOperationStatus({
        status: 'AWAITING_RELAY',
        lastPolledAt: now + 3000,
      })
    );
    expect(selectOperation(store.getState())!.status).toBe('AWAITING_RELAY');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: 'COMPLETED',
        lastPolledAt: now + 10000,
      })
    );
    expect(selectOperation(store.getState())!.status).toBe('COMPLETED');

    // Clear persistence on completion
    clearPendingMigration(TEST_ADDRESS);
    expect(loadPendingMigration(TEST_ADDRESS)).toBeNull();

    // After clearing operation, derive steps should use snapshot
    store.dispatch(migrationActions.clearOperation());
    const snapshot = buildSnapshot({ staked: '0', walletXcn: '0' });
    const derived = deriveSteps(snapshot, null, buildStepExecutions(), false);
    expect(derived.isEmpty).toBe(true);
    expect(derived.isStatusView).toBe(false);
  });

  it('should reject stale persisted migrations and not restore them', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Save a migration with an old timestamp by writing directly
    const key = getMigrationStorageKey(TEST_ADDRESS);
    const staleEntry: PendingMigration = {
      originTxHash: '0xold',
      intentId: 'old-intent',
      stakeOnGoliath: true,
      timestamp: now - STALENESS_THRESHOLD_MS - 1,
    };
    localStorage.setItem(key, JSON.stringify(staleEntry));

    // Load should return null for stale entry
    const loaded = loadPendingMigration(TEST_ADDRESS);
    expect(loaded).toBeNull();

    // Entry should have been auto-cleared
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('should handle independent address persistence', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const addr1 = '0x1111111111111111111111111111111111111111';
    const addr2 = '0x2222222222222222222222222222222222222222';

    savePendingMigration(addr1, {
      originTxHash: '0xa',
      intentId: 'intent-a',
      stakeOnGoliath: true,
    });

    savePendingMigration(addr2, {
      originTxHash: '0xb',
      intentId: 'intent-b',
      stakeOnGoliath: false,
    });

    const loaded1 = loadPendingMigration(addr1);
    const loaded2 = loadPendingMigration(addr2);

    expect(loaded1!.intentId).toBe('intent-a');
    expect(loaded1!.stakeOnGoliath).toBe(true);
    expect(loaded2!.intentId).toBe('intent-b');
    expect(loaded2!.stakeOnGoliath).toBe(false);

    // Clear one, the other should remain
    clearPendingMigration(addr1);
    expect(loadPendingMigration(addr1)).toBeNull();
    expect(loadPendingMigration(addr2)).not.toBeNull();
  });

  it('should handle malformed localStorage data gracefully without crashing store restore', () => {
    const key = getMigrationStorageKey(TEST_ADDRESS);
    localStorage.setItem(key, 'not-valid-json{{{');

    const loaded = loadPendingMigration(TEST_ADDRESS);
    expect(loaded).toBeNull();

    // Store should still function normally
    const store = createTestStore();
    expect(selectOperation(store.getState())).toBeNull();
  });
});

// ==========================================================================
// 4. Feature Flag Gating Integration
// ==========================================================================

describe('Integration: migrationConfig feature flag gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should gate claimEnabled flag and affect step derivation', () => {
    // When claimEnabled=true and rewards>0, CLAIM_REWARDS step appears
    const snapshot = buildSnapshot({
      staked: '1000',
      rewards: '500',
      allowance: '0',
    });

    const withClaim = deriveSteps(snapshot, null, buildStepExecutions(), true);
    expect(withClaim.visibleSteps).toContain(MigrationStep.CLAIM_REWARDS);

    const withoutClaim = deriveSteps(snapshot, null, buildStepExecutions(), false);
    expect(withoutClaim.visibleSteps).not.toContain(MigrationStep.CLAIM_REWARDS);
  });

  it('should load migrationEnabled from env and control feature availability', () => {
    // Test with flag enabled
    process.env.REACT_APP_MIGRATION_ENABLED = 'true';
    const { migrationConfig: enabledConfig } = require('config/migrationConfig');
    expect(enabledConfig.migrationEnabled).toBe(true);

    // Test with flag disabled
    jest.resetModules();
    process.env.REACT_APP_MIGRATION_ENABLED = 'false';
    const { migrationConfig: disabledConfig } = require('config/migrationConfig');
    expect(disabledConfig.migrationEnabled).toBe(false);
  });

  it('should load statsEnabled and historyEnabled from env independently', () => {
    process.env.REACT_APP_MIGRATION_STATS_ENABLED = 'true';
    process.env.REACT_APP_MIGRATION_HISTORY_ENABLED = 'false';

    const { migrationConfig } = require('config/migrationConfig');
    expect(migrationConfig.statsEnabled).toBe(true);
    expect(migrationConfig.historyEnabled).toBe(false);
  });

  it('should reject non-exact "true" strings for boolean flags', () => {
    process.env.REACT_APP_MIGRATION_ENABLED = 'TRUE';
    process.env.REACT_APP_MIGRATION_CLAIM_ENABLED = '1';
    process.env.REACT_APP_MIGRATION_STATS_ENABLED = 'yes';
    process.env.REACT_APP_MIGRATION_HISTORY_ENABLED = '';

    const { migrationConfig } = require('config/migrationConfig');
    expect(migrationConfig.migrationEnabled).toBe(false);
    expect(migrationConfig.claimEnabled).toBe(false);
    expect(migrationConfig.statsEnabled).toBe(false);
    expect(migrationConfig.historyEnabled).toBe(false);
  });

  it('should load custom polling intervals from env', () => {
    process.env.REACT_APP_MIGRATION_STATS_POLL_MS = '15000';
    process.env.REACT_APP_MIGRATION_STATUS_POLL_MS = '1000';

    const { migrationConfig } = require('config/migrationConfig');
    expect(migrationConfig.statsPollMs).toBe(15000);
    expect(migrationConfig.statusPollMs).toBe(1000);
  });

  it('should use fallback polling intervals for invalid env values', () => {
    process.env.REACT_APP_MIGRATION_STATS_POLL_MS = 'abc';
    process.env.REACT_APP_MIGRATION_STATUS_POLL_MS = '';

    const { migrationConfig } = require('config/migrationConfig');
    expect(migrationConfig.statsPollMs).toBe(60000);
    expect(migrationConfig.statusPollMs).toBe(3000);
  });

  it('should provide contract addresses with defaults or from env', () => {
    // With defaults
    delete process.env.REACT_APP_SEPOLIA_XCN_ADDRESS;
    delete process.env.REACT_APP_SEPOLIA_STAKING_CONTRACT;

    const { migrationConfig: defaultConfig } = require('config/migrationConfig');
    expect(defaultConfig.sepoliaXcnAddress).toBe('0x7a8adc542A35c93da263A188367F4bF4c445B8E9');
    expect(defaultConfig.sepoliaStakingContract).toBe('0xc50B664BA11F5558b8FF7358bb7C576542655D54');

    // With overrides
    jest.resetModules();
    process.env.REACT_APP_SEPOLIA_XCN_ADDRESS = '0xcustom1';
    process.env.REACT_APP_SEPOLIA_STAKING_CONTRACT = '0xcustom2';

    const { migrationConfig: customConfig } = require('config/migrationConfig');
    expect(customConfig.sepoliaXcnAddress).toBe('0xcustom1');
    expect(customConfig.sepoliaStakingContract).toBe('0xcustom2');
  });
});

// ==========================================================================
// 5. Non-Regression: Bridge Types and APIs Unchanged
// ==========================================================================

describe('Non-regression: Bridge types and imports are unchanged', () => {
  it('should export BridgeDirection as a valid type', () => {
    const direction: BridgeDirection = 'SEPOLIA_TO_GOLIATH';
    expect(direction).toBe('SEPOLIA_TO_GOLIATH');

    const reverse: BridgeDirection = 'GOLIATH_TO_SEPOLIA';
    expect(reverse).toBe('GOLIATH_TO_SEPOLIA');
  });

  it('should export all BridgeStatus values as valid types', () => {
    const statuses: BridgeStatus[] = [
      'PENDING_ORIGIN_TX',
      'CONFIRMING',
      'AWAITING_RELAY',
      'PROCESSING_DESTINATION',
      'COMPLETED',
      'FAILED',
      'EXPIRED',
      'DELAYED',
    ];

    expect(statuses).toHaveLength(8);
    statuses.forEach((s) => {
      expect(typeof s).toBe('string');
    });
  });

  it('should export BridgeTokenSymbol with expected values', () => {
    const tokens: BridgeTokenSymbol[] = ['USDC', 'ETH'];
    expect(tokens).toContain('USDC');
    expect(tokens).toContain('ETH');
  });

  it('should export BridgeNetwork enum with SEPOLIA and GOLIATH', () => {
    expect(BridgeNetwork.SEPOLIA).toBe('SEPOLIA');
    expect(BridgeNetwork.GOLIATH).toBe('GOLIATH');
  });

  it('should export BridgeOperation interface shape (type check via object literal)', () => {
    const op: BridgeOperation = {
      id: 'op-1',
      direction: 'SEPOLIA_TO_GOLIATH',
      token: 'ETH',
      amountHuman: '1.0',
      amountAtomic: '1000000000000000000',
      sender: '0xsender',
      recipient: '0xrecipient',
      originChainId: 11155111,
      destinationChainId: 8901,
      originTxHash: '0xorigin',
      destinationTxHash: null,
      depositId: null,
      withdrawId: null,
      status: 'CONFIRMING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      originConfirmations: 3,
      requiredConfirmations: 12,
      errorMessage: null,
      estimatedCompletionTime: null,
    };

    expect(op.id).toBe('op-1');
    expect(op.direction).toBe('SEPOLIA_TO_GOLIATH');
    expect(op.token).toBe('ETH');
  });

  it('should export BridgeApiClient as a constructable class', () => {
    const client = new BridgeApiClient('https://test.api.com');
    expect(client).toBeDefined();
    expect(typeof client.getStatus).toBe('function');
    expect(typeof client.getHistory).toBe('function');
    expect(typeof client.getHealth).toBe('function');
    expect(typeof client.isPaused).toBe('function');
  });

  it('should export BridgeApiError as a valid error class', () => {
    const error = new BridgeApiError(500, 'Server Error', 'INTERNAL');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BridgeApiError);
    expect(error.name).toBe('BridgeApiError');
    expect(error.status).toBe(500);
    expect(error.message).toBe('Server Error');
    expect(error.code).toBe('INTERNAL');
  });

  it('should export BridgeStatusResponse interface shape (compatible with MigrationStatusResponse)', () => {
    // BridgeStatusResponse is the base shape; MigrationStatusResponse extends it
    // with optional migration fields. Verify the base fields match.
    const bridgeResp: BridgeStatusResponse = {
      operationId: 'op-1',
      direction: 'SEPOLIA_TO_GOLIATH',
      status: 'COMPLETED',
      token: 'ETH',
      amount: '1000000000000000000',
      amountFormatted: '1.0',
      sender: '0xsender',
      recipient: '0xrecipient',
      originChainId: 11155111,
      destinationChainId: 8901,
      originTxHash: '0xorigin',
      destinationTxHash: '0xdest',
      originConfirmations: 12,
      requiredConfirmations: 12,
      timestamps: {
        depositedAt: '2026-02-23T10:00:00Z',
        finalizedAt: '2026-02-23T10:05:00Z',
        destinationSubmittedAt: '2026-02-23T10:06:00Z',
        completedAt: '2026-02-23T10:07:00Z',
      },
      estimatedCompletionTime: null,
      error: null,
      isSameWallet: true,
    };

    // A MigrationStatusResponse should be assignable from a BridgeStatusResponse
    // with optional migration fields
    const migrationResp: MigrationStatusResponse = {
      ...bridgeResp,
      stakeOnGoliath: true,
      stakingTxHash: '0xstake',
      stakingError: null,
    };

    // Verify base fields are identical
    expect(migrationResp.operationId).toBe(bridgeResp.operationId);
    expect(migrationResp.direction).toBe(bridgeResp.direction);
    expect(migrationResp.status).toBe(bridgeResp.status);
    expect(migrationResp.token).toBe(bridgeResp.token);

    // Verify migration-specific fields
    expect(migrationResp.stakeOnGoliath).toBe(true);
    expect(migrationResp.stakingTxHash).toBe('0xstake');
  });

  it('should export MigrationApiClient as a constructable class with expected methods', () => {
    const client = new MigrationApiClient('https://test.api.com');
    expect(client).toBeDefined();
    expect(typeof client.submitStakePreference).toBe('function');
    expect(typeof client.bindOriginTxHash).toBe('function');
    expect(typeof client.getMigrationStatus).toBe('function');
    expect(typeof client.getMigrationStats).toBe('function');
    expect(typeof client.getMigrationHistory).toBe('function');
  });

  it('should export MigrationApiError as a valid error class', () => {
    const error = new MigrationApiError(400, 'Bad Request', 'INVALID_INPUT');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MigrationApiError);
    expect(error.name).toBe('MigrationApiError');
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_INPUT');
  });

  it('should export MigrationStep enum with all expected values', () => {
    expect(MigrationStep.CLAIM_REWARDS).toBe('CLAIM_REWARDS');
    expect(MigrationStep.APPROVE).toBe('APPROVE');
    expect(MigrationStep.UNSTAKE).toBe('UNSTAKE');
    expect(MigrationStep.BRIDGE).toBe('BRIDGE');
  });

  it('should export StepExecutionStatus enum with all expected values', () => {
    expect(StepExecutionStatus.IDLE).toBe('IDLE');
    expect(StepExecutionStatus.WAITING_SIGNATURE).toBe('WAITING_SIGNATURE');
    expect(StepExecutionStatus.TX_PENDING).toBe('TX_PENDING');
    expect(StepExecutionStatus.CONFIRMED).toBe('CONFIRMED');
    expect(StepExecutionStatus.FAILED).toBe('FAILED');
  });

  it('should export getMigrationStorageKey function that lowercases addresses', () => {
    const key = getMigrationStorageKey('0xAbCd');
    expect(key).toBe('migration:pending:v1:0xabcd');
  });
});

// ==========================================================================
// 6. End-to-End Scenario: Full Migration Sequence (Logic Only)
// ==========================================================================

describe('Integration: Full migration sequence (logic pipeline)', () => {
  const TEST_ADDRESS = '0xUserWallet1234567890AbCdEf1234567890AbCdEf';
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should execute the full happy-path migration pipeline: derive -> execute steps -> persist -> poll -> complete -> clear', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const store = createTestStore();

    // === Phase 1: Initial state with staked tokens ===
    const snapshot = buildSnapshot({
      staked: '5000000000000000000', // 5 XCN
      rewards: '0',
      walletXcn: '0',
      allowance: '0',
    });
    store.dispatch(migrationActions.setSnapshot(snapshot));

    const execs = store.getState().migration.flow.stepExecutions;
    const derived = deriveSteps(snapshot, null, execs, false);

    expect(derived.visibleSteps).toEqual([
      MigrationStep.APPROVE,
      MigrationStep.UNSTAKE,
      MigrationStep.BRIDGE,
    ]);
    expect(derived.activeStep).toBe(MigrationStep.APPROVE);

    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );

    // === Phase 2: Execute APPROVE step ===
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.WAITING_SIGNATURE },
      })
    );
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.TX_PENDING, txHash: '0xapprove-tx' },
      })
    );
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xapprove-tx' },
      })
    );

    // Re-derive: active step should advance
    const execs2 = store.getState().migration.flow.stepExecutions;
    const derived2 = deriveSteps(snapshot, null, execs2, false);
    expect(derived2.activeStep).toBe(MigrationStep.UNSTAKE);

    // === Phase 3: Execute UNSTAKE step ===
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.UNSTAKE,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xunstake-tx' },
      })
    );

    const execs3 = store.getState().migration.flow.stepExecutions;
    const derived3 = deriveSteps(snapshot, null, execs3, false);
    expect(derived3.activeStep).toBe(MigrationStep.BRIDGE);

    // === Phase 4: Lock toggle before bridge ===
    store.dispatch(migrationActions.lockToggle());
    expect(selectIsToggleLocked(store.getState())).toBe(true);

    // === Phase 5: Execute BRIDGE step and create operation ===
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.BRIDGE,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xbridge-deposit-tx' },
      })
    );

    store.dispatch(
      migrationActions.setOperation({
        originTxHash: '0xbridge-deposit-tx',
        intentId: 'intent-final',
        status: 'PENDING_ORIGIN_TX',
      })
    );

    // Save to persistence
    savePendingMigration(TEST_ADDRESS, {
      originTxHash: '0xbridge-deposit-tx',
      intentId: 'intent-final',
      stakeOnGoliath: selectStakeToggle(store.getState()),
    });

    // === Phase 6: Status view during polling ===
    const op = selectOperation(store.getState())!;
    const execs4 = store.getState().migration.flow.stepExecutions;
    const derived4 = deriveSteps(snapshot, op, execs4, false);
    expect(derived4.isStatusView).toBe(true);

    // === Phase 7: Simulate poll updates through status transitions ===
    store.dispatch(
      migrationActions.updateOperationStatus({
        status: 'CONFIRMING',
        lastPolledAt: now + 3000,
      })
    );
    expect(selectOperation(store.getState())!.status).toBe('CONFIRMING');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: 'AWAITING_RELAY',
        lastPolledAt: now + 10000,
      })
    );
    expect(selectOperation(store.getState())!.status).toBe('AWAITING_RELAY');

    store.dispatch(
      migrationActions.updateOperationStatus({
        status: 'COMPLETED',
        stakingTxHash: '0xstaking-on-goliath',
        lastPolledAt: now + 30000,
      })
    );

    const finalOp = selectOperation(store.getState())!;
    expect(finalOp.status).toBe('COMPLETED');
    expect(finalOp.stakingTxHash).toBe('0xstaking-on-goliath');

    // === Phase 8: Cleanup ===
    clearPendingMigration(TEST_ADDRESS);
    expect(loadPendingMigration(TEST_ADDRESS)).toBeNull();

    // After terminal status, derive should fall through to snapshot-based derivation
    const execs5 = store.getState().migration.flow.stepExecutions;
    const finalDerived = deriveSteps(snapshot, finalOp, execs5, false);
    expect(finalDerived.isStatusView).toBe(false);
    // All steps confirmed, so activeStep is null
    expect(finalDerived.activeStep).toBeNull();
  });

  it('should handle a failed step with retry in the pipeline', () => {
    const store = createTestStore();

    const snapshot = buildSnapshot({
      staked: '1000',
      allowance: '0',
    });
    store.dispatch(migrationActions.setSnapshot(snapshot));

    // Derive steps
    const execs = store.getState().migration.flow.stepExecutions;
    const derived = deriveSteps(snapshot, null, execs, false);
    store.dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );

    // APPROVE fails
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.FAILED, error: 'User rejected transaction' },
      })
    );

    // Active step should still be APPROVE (FAILED is not CONFIRMED)
    const execs2 = store.getState().migration.flow.stepExecutions;
    const derived2 = deriveSteps(snapshot, null, execs2, false);
    expect(derived2.activeStep).toBe(MigrationStep.APPROVE);

    // Retry APPROVE
    store.dispatch(
      migrationActions.updateStepExecution({
        step: MigrationStep.APPROVE,
        execution: { status: StepExecutionStatus.CONFIRMED, txHash: '0xapprove-retry' },
      })
    );

    // Now should advance to UNSTAKE
    const execs3 = store.getState().migration.flow.stepExecutions;
    const derived3 = deriveSteps(snapshot, null, execs3, false);
    expect(derived3.activeStep).toBe(MigrationStep.UNSTAKE);
  });
});
