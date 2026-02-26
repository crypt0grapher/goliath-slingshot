# Regression QA and Release Validation for Yield Stats Visibility

## Context
After refactoring Yield visibility logic, we need to confirm no behavioral regressions in staking gates and core Yield interactions before deployment.

## Task
Run regression checks across disconnected, wrong-network, and connected+Goliath flows. Validate that protocol stats are always visible and that transaction-capable actions remain restricted correctly. Capture outcomes for release handoff.

## Blockers
- `task-002-refactor-yield-layout-to-always-show-protocol-stats.md` — core fix must be merged first
- `task-003-add-protocol-stats-loading-and-error-state-coverage.md` — state handling should be finalized

## Acceptance Checklist
- [ ] Manual QA covers disconnected, wrong-network, connected+Goliath scenarios
- [ ] `Total Staked` and `Net APY` confirmed visible in all scenarios
- [ ] Stake/Unstake actions confirmed disabled or gated when not eligible
- [ ] Test suite and build pass in CI/local validation
- [ ] Tests are written and passing
- [ ] Code follows the project's style
