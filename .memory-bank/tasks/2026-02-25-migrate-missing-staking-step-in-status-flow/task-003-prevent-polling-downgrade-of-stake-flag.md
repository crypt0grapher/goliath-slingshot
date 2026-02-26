# Prevent Polling Downgrade Of Stake Flag

## Context
What you need to know to complete this task:
- What problem we're solving
  Polling updates can write `stakeOnGoliath=false` into an operation that was created with `true`.
- Where in the project this is located
  `src/state/migration/slice.ts` and related polling updates in `src/hooks/migration/useMigrationStatusPolling.ts`.
- Related components/modules
  `updateOperationStatus` reducer, migration status polling hook.

## Task
Harden state merge rules so a known positive stake intent for the active operation is not downgraded by transient backend responses. Keep behavior explicit and test-covered.

## Blockers
- `task-001-add-regression-tests-for-stake-step-visibility.md` — reducer behavior must be validated by tests first

## Acceptance Checklist
- [ ] Reducer/hook merge logic prevents unintended true -> false downgrade
- [ ] No regression in normal status polling updates
- [ ] Behavior is deterministic for resumed operations
- [ ] Tests are written and passing
- [ ] Code follows the project's style
