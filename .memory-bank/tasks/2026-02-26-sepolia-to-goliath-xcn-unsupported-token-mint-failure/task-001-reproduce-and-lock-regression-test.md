# Reproduce and lock XCN submitter regression with tests

## Context
What you need to know to complete this task:
- Users bridging XCN from Sepolia to Goliath fail at the relayer step with `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN`.
- The affected logic is in `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`.
- Existing XCN tests are already failing; we need a stable regression test that encodes the intended branch behavior before code changes.

## Task
Add or tighten a focused test case in `transactionSubmitter.test.ts` that proves `SEPOLIA_TO_GOLIATH + XCN` must execute native send/stake flow without attempting destination ERC-20 token resolution.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Regression test clearly describes expected XCN Sepolia->Goliath behavior
- [ ] Test fails before fix for the current buggy implementation
- [ ] Failure message makes branch/flow mismatch obvious
- [ ] Tests are written and passing
- [ ] Code follows the project's style
