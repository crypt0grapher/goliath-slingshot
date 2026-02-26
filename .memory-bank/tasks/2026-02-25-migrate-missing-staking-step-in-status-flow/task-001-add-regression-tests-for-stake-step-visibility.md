# Add Regression Tests For Stake Step Visibility

## Context
What you need to know to complete this task:
- What problem we're solving
  The migration status timeline can skip the staking step and jump to migration complete.
- Where in the project this is located
  `src/components/migration/MigrationStatusPanel.tsx`, `src/pages/Migrate/index.tsx`, `src/state/migration/slice.ts`.
- Related components/modules
  Migration status panel, migrate page state resolution, migration slice operation updates.

## Task
Create failing-first regression tests that reproduce stake-step omission scenarios and lock expected behavior:
- Staking step is visible for stake-intent operations.
- Migration complete is pending until staking confirms.
- Temporary backend false does not remove staking from active operation intent.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] New tests reproduce the current bug before code changes
- [ ] Tests cover status panel stake-step rendering and completion gating
- [ ] Tests cover operation stake-intent downgrade scenario
- [ ] Tests are written and passing
- [ ] Code follows the project's style
