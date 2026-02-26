# Promote Fast Sepolia Endpoint to Primary RPC

## Context
What you need to know to complete this task:
- Current env uses Chainstack as primary and PublicNode as fallback.
- Measured latency shows primary around ~39s while fallback is ~0.05s.
- Config-only ordering gives immediate relief while code hardening is implemented.

## Task
Update runtime configuration so the low-latency endpoint is primary:
- Update deployment env (and optionally default fallback order in `src/config/bridgeConfig.ts`).
- Keep slower endpoint as fallback.
- Document the expected ordering and rollback in issue/deployment notes.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Sepolia primary points to low-latency endpoint
- [ ] Sepolia fallback remains configured and reachable
- [ ] Local build/tests continue to pass after config update
- [ ] Rollback config path is documented
- [ ] Tests are written and passing
- [ ] Code follows the project's style
