import { createSelector } from '@reduxjs/toolkit';
import { MigrationStep } from '../../constants/migration';
import { MigrationState, StepExecution } from './types';

// ============================================
// State type for selectors
// ============================================

/**
 * Minimal type for the root state used by migration selectors.
 * Using a local type avoids importing from the root store index,
 * which would create a circular dependency during store setup.
 */
interface RootWithMigration {
  migration: MigrationState;
}

// ============================================
// Base Selectors
// ============================================

const selectMigrationState = (state: RootWithMigration) => state.migration;

// ============================================
// Snapshot Selectors
// ============================================

export const selectStakingSnapshot = createSelector(
  [selectMigrationState],
  (migration) => migration.snapshot
);

// ============================================
// Flow Selectors
// ============================================

export const selectVisibleSteps = createSelector(
  [selectMigrationState],
  (migration) => migration.flow.visibleSteps
);

export const selectActiveStep = createSelector(
  [selectMigrationState],
  (migration) => migration.flow.activeStep
);

/**
 * Returns the StepExecution for a given MigrationStep.
 * Usage: selectStepExecution(state, MigrationStep.APPROVE)
 */
export const selectStepExecution = (
  state: RootWithMigration,
  step: MigrationStep
): StepExecution => {
  return state.migration.flow.stepExecutions[step];
};

// ============================================
// Preference Selectors
// ============================================

export const selectStakeToggle = createSelector(
  [selectMigrationState],
  (migration) => migration.preferences.stakeOnGoliath
);

export const selectIsToggleLocked = createSelector(
  [selectMigrationState],
  (migration) => migration.preferences.isToggleLocked
);

// ============================================
// Operation Selectors
// ============================================

export const selectOperation = createSelector(
  [selectMigrationState],
  (migration) => migration.operation
);

// ============================================
// UI Selectors
// ============================================

export const selectIsResumeMode = createSelector(
  [selectMigrationState],
  (migration) => migration.ui.isResumeMode
);

export const selectIsEmpty = createSelector(
  [selectMigrationState],
  (migration) => migration.ui.isEmpty
);
