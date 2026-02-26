# Add Failing Tests for Current 18-dec Semantics

## Context
What you need to know to complete this task:
- The Yield suite currently assumes 8901 wallet balances are raw 8-dec values.
- Live RPC and multicall now return 18-dec quantities for native balance reads.
- The stale tests mask regressions in both display and stake submission behavior.

## Task
Replace old normalization-focused tests with failing tests that assert current behavior:
- balance display uses raw 18-dec values from wallet hooks
- `useStake` submits transaction `value` equal to parsed 18-dec user input
- old `*10^10` display inflation is caught as regression

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `src/__tests__/yield/xcnBalanceNormalization.test.ts` rewritten for 18-dec runtime semantics
- [ ] New hook-level test covers `useStake` tx value wiring
- [ ] Tests fail before implementation and document expected post-fix behavior
- [ ] Tests are written and passing
- [ ] Code follows the project's style
