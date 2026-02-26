# Roll out relayer patch and verify live XCN operations

## Context
What you need to know to complete this task:
- Backend deployment uses Kubernetes namespace `bridge-backend` and script `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh`.
- `bridge-relayer` runs on node `lon-3` with image `bridge-relayer:latest` and `imagePullPolicy: Never`, so image transfer/import is required.
- Verification must confirm the specific unsupported-token error is gone and operations complete.

## Task
Deploy the patched relayer image using the existing backend deployment flow, then verify logs/status endpoint behavior for Sepolia->Goliath XCN operations and document rollback readiness.

## Blockers
- `task-003-validate-relayer-regression-suite.md` — deploy only after tests/build validation

## Acceptance Checklist
- [ ] Patched relayer image is built and imported to target node(s)
- [ ] `bridge-relayer` rollout succeeds in `bridge-backend`
- [ ] Relayer logs show no new `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN` errors
- [ ] At least one Sepolia->Goliath XCN operation reaches `COMPLETED`
- [ ] Rollback command and trigger conditions are documented
- [ ] Tests are written and passing
- [ ] Code follows the project's style
