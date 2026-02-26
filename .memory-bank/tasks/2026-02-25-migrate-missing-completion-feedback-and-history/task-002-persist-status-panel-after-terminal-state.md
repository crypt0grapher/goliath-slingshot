# Keep Status Panel Visible After Terminal Completion

## Context
What you need to know to complete this task:
- Problem: UI drops to `No XCN to migrate` right after `COMPLETED` because `isStatusView` becomes false.
- Location: `src/hooks/migration/useMigrationFlow.ts`, `src/pages/Migrate/index.tsx`.
- Related components/modules: `MigrationStatusPanel`, `MigrationStepper`, migration UI flags in Redux.

## Task
Implement flow logic so status view persists whenever an operation exists, including terminal states, until user explicitly clicks `Start New Migration` (which clears operation). Ensure this does not break resume and non-terminal behavior.

## Blockers
- `task-001-regression-tests-terminal-completion-state.md` — defines expected behavior before implementation

## Acceptance Checklist
- [ ] `deriveSteps` no longer exits status view solely because status is terminal
- [ ] `/migrate` keeps rendering `MigrationStatusPanel` for completed operation
- [ ] `Start New Migration` still resets to normal snapshot-derived flow
- [ ] Tests are written and passing
- [ ] Code follows the project's style
