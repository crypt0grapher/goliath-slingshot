# Add Frontend Capability Gate And 404 Terminal State

## Context
What you need to know to complete this task:
- Frontend currently initiates XCN reverse flow assuming backend XCN routes exist.
- Bind-origin failures can be silent for users and status polling can loop on 404.
- Even after backend fix, frontend needs a guard to prevent recurrence during future runtime drift.

## Task
Implement frontend runtime capability checks for reverse XCN flow and convert persistent status-404 polling into a clear terminal/degraded UX state with support guidance.

## Blockers
- `task-001-verify-runtime-route-contract-and-image-drift.md` — defines the capability contract to probe

## Acceptance Checklist
- [ ] XCN reverse bridge is blocked before native transfer when backend capability probe fails.
- [ ] User-facing error clearly states backend support is unavailable.
- [ ] Persistent 404 status polling transitions to explicit degraded/failed state.
- [ ] Existing ETH and normal status-polling flows are not regressed.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
