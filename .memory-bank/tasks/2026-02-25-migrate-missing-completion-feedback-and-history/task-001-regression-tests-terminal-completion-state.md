# Add Regression Tests For Terminal Completion State Persistence

## Context
What you need to know to complete this task:
- Problem: `deriveSteps` currently exits status view when operation status becomes terminal (`COMPLETED`, `FAILED`, `EXPIRED`).
- Location: `src/hooks/migration/useMigrationFlow.ts` and `src/hooks/migration/__tests__/useMigrationFlow.test.ts`.
- Related components: `/migrate` render branches depend on `isStatusView`; this bug causes fallback to empty state.

## Task
Add/adjust tests so terminal completion remains in status view while an operation object exists. Replace assertions that currently require `isStatusView=false` for terminal states, and add explicit coverage for "status view remains until clear operation" behavior.

## Blockers
No blockers

## Acceptance Checklist
- [ ] Existing terminal fallback assertions are updated to new expected behavior
- [ ] New regression test covers `COMPLETED` + zero balances path intent
- [ ] Tests fail before implementation and pass after implementation
- [ ] Tests are written and passing
- [ ] Code follows the project's style
