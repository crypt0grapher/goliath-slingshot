# Add per-pod route parity validation to smoke checks

## Context
What you need to know to complete this task:
- Current smoke checks hit only the load-balanced endpoint and can miss split-brain deployments.
- This incident passed some checks despite one pod lacking XCN routes.
- Route parity must be verified per pod to catch partial rollouts and node-local image drift.

## Task
Enhance smoke checks to enumerate each `bridge-api` pod and validate route contract (`/` keys + both XCN POST routes) per pod, then fail fast if any pod is inconsistent.

## Blockers
- `task-001-stabilize-bridge-api-runtime-images.md` — parity checks should run against a known baseline after stabilization

## Acceptance Checklist
- [ ] Smoke check prints per-pod route results (pass/fail)
- [ ] Smoke check fails when any pod misses XCN route keys
- [ ] Smoke check fails when any pod returns route-level 404 for XCN routes
- [ ] Smoke check still validates LB endpoint behavior
- [ ] Tests are written and passing
- [ ] Code follows the project's style
