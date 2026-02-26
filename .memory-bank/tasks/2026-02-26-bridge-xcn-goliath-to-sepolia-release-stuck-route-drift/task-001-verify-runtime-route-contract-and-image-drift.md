# Verify Runtime Route Contract And Image Drift

## Context
What you need to know to complete this task:
- The frontend reverse XCN flow depends on backend routes `POST /api/v1/bridge/xcn-withdraw-intent` and `POST /api/v1/bridge/xcn-withdraw-intent/bind-origin`.
- User reports are currently stuck on status polling 404 for `originTxHash`.
- Earlier incidents already showed backend runtime drift from source/deployment expectations.

## Task
Confirm whether production runtime serves the XCN withdraw routes and whether deployed image digests match the backend commit that includes `xcnWithdrawRoutes` and `XcnWithdrawProcessor`.
Capture evidence from live endpoints and Kubernetes image IDs, and record the exact mismatch.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Live `/bridge/` endpoint contract is captured and compared to expected route map.
- [ ] Direct POST probes to both XCN routes are executed and documented.
- [ ] `bridge-api` and `bridge-relayer` image IDs are collected from Kubernetes.
- [ ] Drift finding is documented with actionable next step.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
