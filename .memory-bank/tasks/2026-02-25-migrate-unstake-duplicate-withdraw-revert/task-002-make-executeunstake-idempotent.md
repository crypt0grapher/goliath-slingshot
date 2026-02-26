# Make `executeUnstake` Idempotent

## Context
What you need to know to complete this task:
- `executeUnstake` currently calls `withdraw(POOL_ID, snapshot.staked)` without a fresh on-chain amount check.
- CHNStaking reverts with `withdraw: not good` when `_amount` exceeds `user.amount`.
- Duplicate/stale submissions should not produce a user-blocking failure loop.

## Task
Update `executeUnstake` in `src/hooks/migration/useMigrationTransactions.ts` to preflight the latest on-chain staked amount for the signer, skip tx when amount is zero, and avoid sending stale-high amounts. Ensure semantic revert handling triggers state refresh and clear user guidance.

## Blockers
- `task-001-add-regression-tests-for-unstake-idempotency.md` — tests must exist first to validate behavior

## Acceptance Checklist
- [ ] `executeUnstake` reads current on-chain staked amount before withdraw
- [ ] If on-chain staked amount is zero, no withdraw tx is sent
- [ ] Stale snapshot values do not cause invalid withdraw amount submission
- [ ] Existing and new tests pass
- [ ] Tests are written and passing
- [ ] Code follows the project's style
