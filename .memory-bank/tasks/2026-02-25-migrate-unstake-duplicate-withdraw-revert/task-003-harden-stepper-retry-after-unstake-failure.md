# Harden Stepper Retry After Unstake Failure

## Context
What you need to know to complete this task:
- The `MigrationStepper` automation loop retries failed steps via `Continue migration`.
- Without refreshed state gating, retries can repeatedly target `UNSTAKE` even after unstake is already complete on-chain.
- Flow derivation depends on refreshed snapshot and step execution state.

## Task
Adjust retry orchestration in `src/components/migration/MigrationStepper.tsx` (and related migration flow wiring if needed) so retry behavior depends on refreshed, current state. Add tests to prove `Continue` does not re-call `executeUnstake` when staked balance has already reached zero.

## Blockers
- `task-002-make-executeunstake-idempotent.md` — step retry logic should be validated against the new idempotent unstake behavior

## Acceptance Checklist
- [ ] Retry path prevents repeated unstake invocation for already-unstaked state
- [ ] Stepper tests cover continue/retry after unstake semantic failure
- [ ] Integration behavior remains sequential and deterministic
- [ ] Tests are written and passing
- [ ] Code follows the project's style
