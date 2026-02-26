# Validate Migrate SLO and Prepare Release

## Context
What you need to know to complete this task:
- The objective is to reduce migrate load time from >60s to acceptable bounds.
- Changes span provider logic, migration hook behavior, and RPC config.
- Final validation must include tests, build, and manual migrate-tab verification.

## Task
Run final validation and produce release-ready evidence:
- Execute targeted test suites and full build.
- Perform manual `/migrate` verification with connected Sepolia wallet.
- Record timing evidence before/after and confirm SLO target.
- Prepare deployment notes and rollback triggers.

## Blockers
- `task-002-implement-timeout-aware-failover.md` - Core fix required before validation
- `task-003-promote-fast-primary-rpc-config.md` - Runtime endpoint order needed for mitigation
- `task-004-harden-usemigrationdata-timeouts.md` - Hook behavior must be finalized before signoff

## Acceptance Checklist
- [ ] Targeted tests pass
- [ ] Project build succeeds
- [ ] Manual migrate verification meets time budget
- [ ] Rollback procedure is documented and tested
- [ ] Tests are written and passing
- [ ] Code follows the project's style
