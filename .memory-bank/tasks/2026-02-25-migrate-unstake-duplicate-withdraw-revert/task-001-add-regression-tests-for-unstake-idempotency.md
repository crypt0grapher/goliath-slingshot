# Add Regression Tests for Unstake Idempotency

## Context
What you need to know to complete this task:
- The migration flow can hit `withdraw: not good` when unstake is retried after a prior successful unstake.
- The transaction logic lives in `src/hooks/migration/useMigrationTransactions.ts`.
- There is no existing unit test file for `useMigrationTransactions`; current migration tests do not cover stale snapshot + duplicate unstake behavior.

## Task
Create a new test suite for `useMigrationTransactions` that reproduces the stale/duplicate unstake scenario and fails against current behavior. Include cases for on-chain amount zero, stale snapshot amount greater than on-chain amount, and revert handling path for `withdraw: not good`.

## Blockers
No blockers

## Acceptance Checklist
- [ ] New test file created at `src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
- [ ] Tests cover stale snapshot + already-unstaked scenarios
- [ ] Tests fail before implementation changes
- [ ] Tests are written and passing
- [ ] Code follows the project's style
