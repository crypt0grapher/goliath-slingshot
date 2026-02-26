# Stabilize bridge-api runtime images across all nodes

## Context
What you need to know to complete this task:
- The bridge service currently serves mixed API behavior because `bridge-api` pods run different image digests under the same `bridge-api:latest` tag.
- XCN routes exist on one pod and are missing on another, causing intermittent `404 Route ... not found`.
- This issue affects XCN withdraw intent and bind-origin calls, which can strand user operations.

## Task
Unify the running `bridge-api` deployment so every replica uses the exact same image digest, then verify route parity per pod and through the public load-balanced endpoint.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `kubectl get pods -l app=bridge-api` shows identical `imageID` for all replicas
- [ ] Each `bridge-api` pod responds with XCN route keys at `/`
- [ ] Each pod returns validation/domain responses (not route 404) for both XCN POST routes
- [ ] Public endpoint no longer alternates between route-present and route-missing responses
- [ ] Tests are written and passing
- [ ] Code follows the project's style
