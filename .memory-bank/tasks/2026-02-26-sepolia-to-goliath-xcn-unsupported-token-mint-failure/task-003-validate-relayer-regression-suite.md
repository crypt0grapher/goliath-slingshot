# Validate relayer regression suite after submitter fix

## Context
What you need to know to complete this task:
- The fix touches core submitter logic that affects multiple tokens and both bridge directions.
- Regression confidence must cover XCN native flow plus legacy mint/release paths.
- Backend tests run with Vitest in `/Users/alex/goliath/goliath-bridge-backend`.

## Task
Run targeted relayer/unit/integration tests and build checks to verify the submitter patch resolves XCN failures without regressing USDC/ETH paths.

## Blockers
- `task-002-fix-destination-token-resolution-order.md` — test validation only meaningful after fix

## Acceptance Checklist
- [ ] `transactionSubmitter.test.ts` passes fully
- [ ] Related integration tests for emergency/regression flows pass
- [ ] `npm run build` succeeds
- [ ] Test commands and outcomes are documented in issue log
- [ ] Tests are written and passing
- [ ] Code follows the project's style
