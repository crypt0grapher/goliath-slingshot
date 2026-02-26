# Harden Auto Flow and Validate with Tests

## Context
What you need to know to complete this task:
- Automated sequencing can reach bridge step before snapshot balance refresh completes after unstake.
- Bridge step currently reads balance from snapshot state, which may be stale.
- Regression coverage is needed for one-button orchestration behavior.

## Task
Add a live on-chain wallet-balance fallback before bridge submission and add tests validating one-click stepper orchestration order and fail-fast behavior.

## Blockers
- `task-002-single-button-tracked-stepper.md` — tests depend on one-button orchestration implementation

## Acceptance Checklist
- [ ] Bridge step reads fresh on-chain balance when snapshot balance is zero/stale
- [ ] Refetch calls after claim/approve/unstake are awaited for sequencing stability
- [ ] New stepper orchestration tests pass
- [ ] Existing migration tests continue to pass
- [ ] Tests are written and passing
- [ ] Code follows the project's style
