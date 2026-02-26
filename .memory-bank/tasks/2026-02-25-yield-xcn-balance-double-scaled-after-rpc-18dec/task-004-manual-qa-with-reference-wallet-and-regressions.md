# Manual QA with Reference Wallet and Regressions

## Context
What you need to know to complete this task:
- The user-reported wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` demonstrates the bug clearly.
- Fix correctness depends on real-chain behavior, not only unit tests.
- Swap and Bridge are currently considered working and must remain unaffected.

## Task
Run a focused QA pass after code changes:
- verify Yield balance display matches RPC value for reference wallet
- perform stake flow sanity checks for normal amounts (for example 1 and 100 XCN)
- spot-check Swap and Bridge balance display paths for regressions
- capture evidence (values/screenshots/tx hashes) in implementation notes

## Blockers
- `task-002-fix-yield-balance-and-stake-value-scaling.md` — QA must validate final behavior
- `task-003-update-stale-tests-and-decimal-documentation.md` — QA checklist should match final documented assumptions

## Acceptance Checklist
- [ ] Reference wallet balance in Yield matches RPC/explorer human value
- [ ] Stake tx values align with entered amounts in 18-dec units
- [ ] Swap and Bridge still show expected balances
- [ ] Tests are written and passing
- [ ] Code follows the project's style
