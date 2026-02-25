# Lock Regression Tests For Terminal Status View

## Context
What you need to know to complete this task:
- The `/migrate` flow currently drops to empty state after backend status becomes terminal (`COMPLETED/FAILED/EXPIRED`).
- This behavior is encoded in current tests (`useMigrationFlow.test.ts`) and must be intentionally changed via TDD.
- We need failing tests first to prevent reintroducing the same UX regression.

## Task
Add/adjust migration test coverage so terminal operations with an existing migration operation object must stay in status view until the user explicitly starts a new migration.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `useMigrationFlow` tests are updated to assert terminal operation objects remain in status view.
- [ ] A migrate page/component regression test confirms completed operation does not render "No XCN to migrate" empty state.
- [ ] Tests fail before implementation changes and pass after implementation.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
