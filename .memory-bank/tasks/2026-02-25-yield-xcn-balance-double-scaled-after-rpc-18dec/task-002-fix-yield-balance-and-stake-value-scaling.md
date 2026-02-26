# Fix Yield Balance and Stake Value Scaling

## Context
What you need to know to complete this task:
- `src/pages/Yield/index.tsx` multiplies chain 8901 balance by `NATIVE_SCALE`, inflating UI by 10^10.
- `src/hooks/yield/useStake.ts` divides stake amount by `NATIVE_SCALE`, sending tiny tx values.
- Swap/Bridge already operate correctly with 18-dec RPC-facing values.

## Task
Implement the production fix:
- remove extra native balance scaling in Yield balance sourcing
- remove stake transaction value downscaling
- keep user-facing math consistent in 18-dec units

## Blockers
- `task-001-add-failing-tests-for-current-18dec-semantics.md` — ensures the fix is test-driven and prevents repeating stale assumptions

## Acceptance Checklist
- [ ] Yield balance display matches RPC human value for reference wallet
- [ ] Stake submit value equals user input amount in 18-dec units
- [ ] No regression in existing Yield/Swap/Bridge test coverage
- [ ] Tests are written and passing
- [ ] Code follows the project's style
