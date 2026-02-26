# Harden frontend bind-origin failure handling for XCN withdraw

## Context
What you need to know to complete this task:
- `useBridgeXcnWithdraw` currently sends native XCN and then calls bind-origin in fire-and-forget mode.
- If bind-origin fails repeatedly, the hook only logs to console, and users can get stuck in status polling with `OPERATION_NOT_FOUND`.
- Backend stabilization reduces failures but frontend still needs explicit safety behavior for degraded backend conditions.

## Task
Refactor XCN withdraw flow so bind-origin failures become explicit user-visible terminal states with recovery guidance, and add tests for repeated 404/5xx bind failures.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Repeated bind-origin failure transitions operation to FAILED with actionable message
- [ ] Hook test covers bind retry exhaustion path
- [ ] Hook test confirms success path remains unchanged
- [ ] UI no longer spins indefinitely on bind-origin loss scenarios
- [ ] Tests are written and passing
- [ ] Code follows the project's style
