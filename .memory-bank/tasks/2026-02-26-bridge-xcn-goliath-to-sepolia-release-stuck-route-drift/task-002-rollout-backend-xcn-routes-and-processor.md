# Rollout Backend XCN Routes And Processor

## Context
What you need to know to complete this task:
- Local backend source includes XCN route registration and XCN withdraw processor.
- Production runtime currently behaves as if those routes are missing.
- This task restores backend parity so reverse XCN bridging can create `BridgeOperation` records.

## Task
Build and deploy the backend revision that includes XCN withdraw routes and processor, apply schema migrations if needed, and verify route availability and relayer startup in production.

## Blockers
- `task-001-verify-runtime-route-contract-and-image-drift.md` — confirms exact drift and target runtime state

## Acceptance Checklist
- [ ] Backend build succeeds on target deployment host.
- [ ] Prisma migration state is confirmed/applied for XCN intent tables.
- [ ] `bridge-api` and `bridge-relayer` deployments are rolled out successfully.
- [ ] Live XCN intent and bind-origin routes no longer return route 404.
- [ ] Relayer logs show XCN withdraw processor startup.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
