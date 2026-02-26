# Propagate Completion Metadata To Status UI

## Context
What you need to know to complete this task:
- Problem: status UI can show destination/staking links only if metadata is passed through; page currently passes `destinationTxHash={null}`.
- Location: `src/hooks/migration/useMigrationStatusPolling.ts`, `src/state/migration/types.ts`, `src/state/migration/slice.ts`, `src/pages/Migrate/index.tsx`.
- Related components/modules: `MigrationStatusPanel`, migration API response type with `destinationTxHash` and `timestamps.completedAt`.

## Task
Extend polling/state wiring to capture and persist completion metadata (`destinationTxHash`, completion timestamp, staking fields, stake preference) and pass it into `MigrationStatusPanel` so completed state has full verification context.

## Blockers
- `task-001-regression-tests-terminal-completion-state.md` — ensures tests guide expected terminal UX

## Acceptance Checklist
- [ ] Polling layer maps required completion fields from API responses
- [ ] Operation state stores completion metadata needed by UI
- [ ] Migrate page passes real destination/stake/completion values to status panel
- [ ] Regression tests verify completion metadata is rendered in terminal state
- [ ] Tests are written and passing
- [ ] Code follows the project's style
