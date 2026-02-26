# Add Regression Tests And Runtime Smoke Checks

## Context
What you need to know to complete this task:
- This incident repeats a known pattern: feature code exists locally but runtime contract is missing endpoints.
- Without explicit tests and smoke checks, regressions can reappear during release rollouts.
- Both backend and frontend need guards at CI and post-deploy stages.

## Task
Add automated tests and post-deploy smoke checks that validate XCN route availability and end-to-end operation creation semantics before and after release.

## Blockers
- `task-002-rollout-backend-xcn-routes-and-processor.md` — backend behavior must be stable
- `task-004-add-frontend-capability-gate-and-404-terminal-state.md` — frontend behavior contract must be finalized

## Acceptance Checklist
- [ ] Backend integration tests cover XCN intent route existence and intent->operation flow.
- [ ] Frontend tests cover capability-gated submit behavior and bounded 404 handling.
- [ ] A deploy smoke checklist includes route probes and at least one reverse-XCN dry run.
- [ ] Monitoring/alerting requirement is documented for missing route contract.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
