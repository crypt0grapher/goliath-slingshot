# Fix destination token resolution order in relayer submitter

## Context
What you need to know to complete this task:
- `submitDestinationTx()` currently resolves destination token address before branching by direction/token.
- XCN on Sepolia->Goliath is native on destination, so destination ERC-20 token address is not required.
- The mismatch triggers `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN` and blocks all XCN deposits.

## Task
Refactor `submitDestinationTx()` so destination token resolution happens only in branches that need it (mint/release ERC-20 paths). Preserve strict unsupported-token guards for genuinely invalid combinations.

## Blockers
- `task-001-reproduce-and-lock-regression-test.md` — ensures the fix is validated against a clear failing scenario

## Acceptance Checklist
- [ ] XCN Sepolia->Goliath path reaches native send/stake branch
- [ ] No unsupported-token error is thrown for valid XCN deposits
- [ ] USDC/ETH behavior remains unchanged
- [ ] No new TypeScript or lint issues introduced
- [ ] Tests are written and passing
- [ ] Code follows the project's style
