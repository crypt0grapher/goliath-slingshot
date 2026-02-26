import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { MigrationStep, StepExecutionStatus } from 'constants/migration';
import { migrationConfig } from 'config/migrationConfig';
import { selectStakingSnapshot, selectOperation } from 'state/migration/selectors';
import { migrationActions } from 'state/migration/slice';
import { StakingSnapshot, MigrationOperation, StepExecution } from 'state/migration/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO = BigNumber.from(0);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeriveStepsResult {
  visibleSteps: MigrationStep[];
  activeStep: MigrationStep | null;
  isResume: boolean;
  isEmpty: boolean;
  isStatusView: boolean;
}

export interface UseMigrationFlowResult extends DeriveStepsResult {}

// ---------------------------------------------------------------------------
// Pure derivation function (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Deterministically derives the visible migration steps and UI flags from the
 * current on-chain snapshot and operation state. This function is pure and has
 * no side effects, making it straightforward to unit test.
 *
 * Algorithm:
 * 1. If an operation exists (any status, including terminal) -> status view mode
 *    (terminal operations stay visible until explicitly cleared via clearOperation)
 * 2. Else if staked > 0 -> full unstake path (optionally with CLAIM_REWARDS and APPROVE)
 * 3. Else if staked == 0 && walletXcn > 0 -> wallet-only bridge path (with resume hint)
 * 4. Else -> empty state (no XCN)
 *
 * Active step = first visible step whose execution status is not CONFIRMED.
 */
export function deriveSteps(
  snapshot: StakingSnapshot,
  operation: MigrationOperation | null,
  stepExecutions: Record<MigrationStep, StepExecution>,
  claimEnabled: boolean
): DeriveStepsResult {
  // ------------------------------------------------------------------
  // 1. Status view: operation exists (any status, including terminal).
  //    Terminal operations stay in status view until explicitly cleared
  //    via clearOperation (auto-cleared on unmount when fully completed).
  // ------------------------------------------------------------------
  if (operation) {
    return {
      visibleSteps: [],
      activeStep: null,
      isResume: false,
      isEmpty: false,
      isStatusView: true,
    };
  }

  // ------------------------------------------------------------------
  // Parse stringified wei values into BigNumber for comparison
  // ------------------------------------------------------------------
  const staked = parseBN(snapshot.staked);
  const rewards = parseBN(snapshot.rewards);
  const walletXcn = parseBN(snapshot.walletXcn);
  const allowance = parseBN(snapshot.allowance);

  // ------------------------------------------------------------------
  // 2. Full unstake path: staked > 0
  // ------------------------------------------------------------------
  if (staked.gt(ZERO)) {
    const steps: MigrationStep[] = [];

    // Include CLAIM_REWARDS only if claim flag enabled AND rewards > 0
    if (claimEnabled && rewards.gt(ZERO)) {
      steps.push(MigrationStep.CLAIM_REWARDS);
    }

    // Include APPROVE if allowance < staked
    if (allowance.lt(staked)) {
      steps.push(MigrationStep.APPROVE);
    }

    // Always include UNSTAKE and BRIDGE
    steps.push(MigrationStep.UNSTAKE);
    steps.push(MigrationStep.BRIDGE);

    return {
      visibleSteps: steps,
      activeStep: findActiveStep(steps, stepExecutions),
      isResume: false,
      isEmpty: false,
      isStatusView: false,
    };
  }

  // ------------------------------------------------------------------
  // 3. Wallet-only bridge path: staked == 0 && walletXcn > 0
  // ------------------------------------------------------------------
  if (walletXcn.gt(ZERO)) {
    const steps: MigrationStep[] = [];

    // Include APPROVE if allowance < walletXcn
    if (allowance.lt(walletXcn)) {
      steps.push(MigrationStep.APPROVE);
    }

    steps.push(MigrationStep.BRIDGE);

    return {
      visibleSteps: steps,
      activeStep: findActiveStep(steps, stepExecutions),
      isResume: true,
      isEmpty: false,
      isStatusView: false,
    };
  }

  // ------------------------------------------------------------------
  // 4. Empty state: no XCN anywhere
  // ------------------------------------------------------------------
  return {
    visibleSteps: [],
    activeStep: null,
    isResume: false,
    isEmpty: true,
    isStatusView: false,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse a stringified wei value into a BigNumber.
 * Returns BigNumber(0) for falsy, empty, or invalid strings.
 */
function parseBN(value: string | undefined | null): BigNumber {
  if (!value) return ZERO;
  try {
    return BigNumber.from(value);
  } catch {
    return ZERO;
  }
}

/**
 * Returns the first step from `visibleSteps` whose execution status is not CONFIRMED,
 * or null if all steps are confirmed (or the list is empty).
 */
function findActiveStep(
  visibleSteps: MigrationStep[],
  stepExecutions: Record<MigrationStep, StepExecution>
): MigrationStep | null {
  for (const step of visibleSteps) {
    if (stepExecutions[step].status !== StepExecutionStatus.CONFIRMED) {
      return step;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Core migration flow hook. Reads the staking snapshot and operation state from
 * the Redux store, derives the visible steps and active step, and dispatches
 * the flow and UI flags back into the migration slice.
 *
 * Per ADR-2, step visibility is deterministically derived from on-chain data
 * and backend operation state -- never from client-side completion flags.
 */
export function useMigrationFlow(): UseMigrationFlowResult {
  const dispatch = useDispatch();
  const snapshot = useSelector(selectStakingSnapshot);
  const operation = useSelector(selectOperation);

  // Read the full migration state to access stepExecutions
  const stepExecutions = useSelector(
    (state: { migration: { flow: { stepExecutions: Record<MigrationStep, StepExecution> } } }) =>
      state.migration.flow.stepExecutions
  );

  const claimEnabled = migrationConfig.claimEnabled;

  // Derive the step flow
  const derived = deriveSteps(snapshot, operation, stepExecutions, claimEnabled);

  // Ref to track the last dispatched value and avoid redundant dispatches
  const prevDerivedRef = useRef<DeriveStepsResult | null>(null);

  useEffect(() => {
    const prev = prevDerivedRef.current;

    // Skip dispatch if nothing changed (shallow comparison of serializable values)
    if (
      prev &&
      prev.isStatusView === derived.isStatusView &&
      prev.isEmpty === derived.isEmpty &&
      prev.isResume === derived.isResume &&
      prev.activeStep === derived.activeStep &&
      arraysEqual(prev.visibleSteps, derived.visibleSteps)
    ) {
      return;
    }

    prevDerivedRef.current = derived;

    // Dispatch flow (visible steps + active step)
    dispatch(
      migrationActions.setFlow({
        visibleSteps: derived.visibleSteps,
        activeStep: derived.activeStep,
      })
    );

    // Dispatch UI flags
    dispatch(
      migrationActions.setUiFlags({
        isResumeMode: derived.isResume,
        isEmpty: derived.isEmpty,
        isStatusView: derived.isStatusView,
      })
    );
  }, [dispatch, derived]);

  return derived;
}

/**
 * Shallow comparison of two MigrationStep arrays.
 */
function arraysEqual(a: MigrationStep[], b: MigrationStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
