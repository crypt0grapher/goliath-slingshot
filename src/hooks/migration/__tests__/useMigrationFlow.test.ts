import { MigrationStep, StepExecutionStatus } from 'constants/migration';
import { StakingSnapshot, MigrationOperation, StepExecution } from 'state/migration/types';
import { deriveSteps, DeriveStepsResult } from '../useMigrationFlow';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    originTxHash: '0xabc',
    intentId: 'intent-1',
    status: 'CONFIRMING',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests for deriveSteps (pure function)
// ---------------------------------------------------------------------------

describe('deriveSteps', () => {
  // ========================================
  // Status view mode (in-flight operation)
  // ========================================

  describe('status view mode (in-flight operation)', () => {
    it('should return isStatusView=true when operation exists with non-terminal status', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000' }),
        buildOperation({ status: 'CONFIRMING' }),
        buildStepExecutions(),
        true
      );

      expect(result.isStatusView).toBe(true);
      expect(result.visibleSteps).toEqual([]);
      expect(result.activeStep).toBeNull();
      expect(result.isResume).toBe(false);
      expect(result.isEmpty).toBe(false);
    });

    it('should return isStatusView=true for PENDING_ORIGIN_TX status', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'PENDING_ORIGIN_TX' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(true);
    });

    it('should return isStatusView=true for AWAITING_RELAY status', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'AWAITING_RELAY' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(true);
    });

    it('should return isStatusView=true for PROCESSING_DESTINATION status', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'PROCESSING_DESTINATION' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(true);
    });

    it('should NOT return isStatusView when operation has terminal status COMPLETED', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'COMPLETED' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(false);
    });

    it('should NOT return isStatusView when operation has terminal status FAILED', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'FAILED' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(false);
    });

    it('should NOT return isStatusView when operation has terminal status EXPIRED', () => {
      const result = deriveSteps(
        buildSnapshot(),
        buildOperation({ status: 'EXPIRED' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(false);
    });

    it('should NOT return isStatusView when operation is null', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.isStatusView).toBe(false);
    });
  });

  // ========================================
  // Staked > 0 flow (full unstake path)
  // ========================================

  describe('staked > 0 flow', () => {
    it('should include CLAIM_REWARDS when claim enabled and rewards > 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '500', allowance: '0' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.visibleSteps).toContain(MigrationStep.CLAIM_REWARDS);
    });

    it('should NOT include CLAIM_REWARDS when claim disabled', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '500', allowance: '0' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.CLAIM_REWARDS);
    });

    it('should NOT include CLAIM_REWARDS when rewards is 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '0', allowance: '0' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.CLAIM_REWARDS);
    });

    it('should include APPROVE when allowance < staked', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '500' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toContain(MigrationStep.APPROVE);
    });

    it('should NOT include APPROVE when allowance >= staked', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '1000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.APPROVE);
    });

    it('should NOT include APPROVE when allowance > staked', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '2000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.APPROVE);
    });

    it('should always include UNSTAKE and BRIDGE when staked > 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '1000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toContain(MigrationStep.UNSTAKE);
      expect(result.visibleSteps).toContain(MigrationStep.BRIDGE);
    });

    it('should NOT set isResume when staked > 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '1000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.isResume).toBe(false);
    });

    it('should produce correct full step order: CLAIM, APPROVE, UNSTAKE, BRIDGE', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '100', allowance: '0' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.visibleSteps).toEqual([
        MigrationStep.CLAIM_REWARDS,
        MigrationStep.APPROVE,
        MigrationStep.UNSTAKE,
        MigrationStep.BRIDGE,
      ]);
    });

    it('should produce correct order without claim: APPROVE, UNSTAKE, BRIDGE', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '100', allowance: '0' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toEqual([
        MigrationStep.APPROVE,
        MigrationStep.UNSTAKE,
        MigrationStep.BRIDGE,
      ]);
    });

    it('should produce correct order when allowance sufficient: UNSTAKE, BRIDGE', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '0', allowance: '5000' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.visibleSteps).toEqual([
        MigrationStep.UNSTAKE,
        MigrationStep.BRIDGE,
      ]);
    });

    it('should handle very large BigNumber values (wei-scale)', () => {
      // 1000 ETH in wei = 1000 * 10^18
      const staked = '1000000000000000000000';
      const allowance = '999999999999999999999'; // slightly less

      const result = deriveSteps(
        buildSnapshot({ staked, allowance }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toContain(MigrationStep.APPROVE);
    });

    it('should NOT include APPROVE when allowance equals staked at wei scale', () => {
      const staked = '1000000000000000000000';
      const allowance = '1000000000000000000000';

      const result = deriveSteps(
        buildSnapshot({ staked, allowance }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.APPROVE);
    });
  });

  // ========================================
  // Wallet-only flow (staked == 0, walletXcn > 0)
  // ========================================

  describe('wallet-only flow (staked == 0, walletXcn > 0)', () => {
    it('should include APPROVE and BRIDGE when walletXcn > 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '5000', allowance: '0' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toEqual([
        MigrationStep.APPROVE,
        MigrationStep.BRIDGE,
      ]);
    });

    it('should NOT include APPROVE when allowance >= walletXcn', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '5000', allowance: '5000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toEqual([MigrationStep.BRIDGE]);
    });

    it('should set isResume=true for wallet-only flow', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '5000', allowance: '5000' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.isResume).toBe(true);
    });

    it('should NOT include UNSTAKE or CLAIM_REWARDS in wallet-only flow', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '5000', rewards: '100', allowance: '0' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.visibleSteps).not.toContain(MigrationStep.UNSTAKE);
      expect(result.visibleSteps).not.toContain(MigrationStep.CLAIM_REWARDS);
    });

    it('should handle allowance comparison with walletXcn at wei scale', () => {
      const walletXcn = '500000000000000000000';
      const allowance = '499999999999999999999';

      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn, allowance }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.visibleSteps).toContain(MigrationStep.APPROVE);
    });
  });

  // ========================================
  // Empty state
  // ========================================

  describe('empty state (no XCN)', () => {
    it('should return isEmpty=true when staked and walletXcn are both 0', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '0' }),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.isEmpty).toBe(true);
      expect(result.visibleSteps).toEqual([]);
      expect(result.activeStep).toBeNull();
      expect(result.isResume).toBe(false);
      expect(result.isStatusView).toBe(false);
    });

    it('should return isEmpty=true even with rewards and claim enabled (staked=0, wallet=0)', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '0', rewards: '100' }),
        null,
        buildStepExecutions(),
        true
      );

      expect(result.isEmpty).toBe(true);
      expect(result.visibleSteps).toEqual([]);
    });
  });

  // ========================================
  // Active step derivation
  // ========================================

  describe('active step derivation', () => {
    it('should set activeStep to the first visible step with non-CONFIRMED status', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '100', allowance: '0' }),
        null,
        buildStepExecutions(),
        true
      );

      // All IDLE, so first step is active
      expect(result.activeStep).toBe(MigrationStep.CLAIM_REWARDS);
    });

    it('should skip CONFIRMED steps and set activeStep to next non-CONFIRMED', () => {
      const executions = buildStepExecutions({
        [MigrationStep.CLAIM_REWARDS]: { status: StepExecutionStatus.CONFIRMED },
        [MigrationStep.APPROVE]: { status: StepExecutionStatus.CONFIRMED },
      });

      const result = deriveSteps(
        buildSnapshot({ staked: '1000', rewards: '100', allowance: '0' }),
        null,
        executions,
        true
      );

      expect(result.activeStep).toBe(MigrationStep.UNSTAKE);
    });

    it('should handle activeStep when all visible steps are CONFIRMED', () => {
      const executions = buildStepExecutions({
        [MigrationStep.UNSTAKE]: { status: StepExecutionStatus.CONFIRMED },
        [MigrationStep.BRIDGE]: { status: StepExecutionStatus.CONFIRMED },
      });

      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '5000' }),
        null,
        executions,
        false
      );

      // visible = [UNSTAKE, BRIDGE], both confirmed
      expect(result.activeStep).toBeNull();
    });

    it('should treat WAITING_SIGNATURE as active (not confirmed)', () => {
      const executions = buildStepExecutions({
        [MigrationStep.APPROVE]: { status: StepExecutionStatus.WAITING_SIGNATURE },
      });

      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '0' }),
        null,
        executions,
        false
      );

      expect(result.activeStep).toBe(MigrationStep.APPROVE);
    });

    it('should treat TX_PENDING as active (not confirmed)', () => {
      const executions = buildStepExecutions({
        [MigrationStep.APPROVE]: { status: StepExecutionStatus.TX_PENDING, txHash: '0x123' },
      });

      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '0' }),
        null,
        executions,
        false
      );

      expect(result.activeStep).toBe(MigrationStep.APPROVE);
    });

    it('should treat FAILED as active (not confirmed)', () => {
      const executions = buildStepExecutions({
        [MigrationStep.APPROVE]: { status: StepExecutionStatus.FAILED, error: 'User rejected' },
      });

      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '0' }),
        null,
        executions,
        false
      );

      expect(result.activeStep).toBe(MigrationStep.APPROVE);
    });

    it('should return null activeStep for empty state', () => {
      const result = deriveSteps(
        buildSnapshot(),
        null,
        buildStepExecutions(),
        false
      );

      expect(result.activeStep).toBeNull();
    });

    it('should return null activeStep for status view mode', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000' }),
        buildOperation({ status: 'CONFIRMING' }),
        buildStepExecutions(),
        false
      );

      expect(result.activeStep).toBeNull();
    });
  });

  // ========================================
  // Terminal operation fallback
  // ========================================

  describe('terminal operation fallback to snapshot-based derivation', () => {
    it('should derive steps from snapshot when operation is COMPLETED', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '1000', allowance: '0' }),
        buildOperation({ status: 'COMPLETED' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(false);
      expect(result.visibleSteps).toContain(MigrationStep.UNSTAKE);
      expect(result.visibleSteps).toContain(MigrationStep.BRIDGE);
    });

    it('should derive steps from snapshot when operation is FAILED', () => {
      const result = deriveSteps(
        buildSnapshot({ staked: '0', walletXcn: '3000', allowance: '5000' }),
        buildOperation({ status: 'FAILED' }),
        buildStepExecutions(),
        false
      );

      expect(result.isStatusView).toBe(false);
      expect(result.visibleSteps).toEqual([MigrationStep.BRIDGE]);
      expect(result.isResume).toBe(true);
    });
  });
});
