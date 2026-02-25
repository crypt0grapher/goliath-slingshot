# Preserve Terminal Status UI On Migrate Page

## Context
What you need to know to complete this task:
- `deriveSteps` currently treats terminal statuses as non-status-view and reverts to balance-derived flow.
- Post-migration balances are often zero, so UI falls to empty state.
- User needs explicit completion/failed status continuity and ability to continue safely.

## Task
Change migration flow derivation and page rendering so terminal operations remain visible in status panel until explicit user reset (`Start New Migration`). Ensure this does not regress non-terminal flow behavior.

## Blockers
- `task-002-operation-status-payload-extension.md` — status payload fields must be available for rendering

## Acceptance Checklist
- [ ] `deriveSteps` no longer falls back to empty state when operation exists in terminal status.
- [ ] `/migrate` shows status panel for completed operation even when balances are zero.
- [ ] "Start New Migration" clears operation and returns to normal snapshot-derived stepper flow.
- [ ] Existing non-terminal status/polling behavior remains intact.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
