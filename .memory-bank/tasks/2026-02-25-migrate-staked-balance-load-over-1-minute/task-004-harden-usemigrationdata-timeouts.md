# Harden useMigrationData Timeout/Error Behavior

## Context
What you need to know to complete this task:
- `useMigrationData` awaits provider readiness and then performs four RPC reads.
- Even with fallback logic, hook should always terminate loading deterministically.
- User-facing message should explain RPC slowness/fallback exhaustion clearly.

## Task
Update `src/hooks/migration/useMigrationData.ts` to handle timeout-class failures cleanly:
- Ensure timeout/fallback exhaustion errors map to actionable UI-safe messages.
- Guarantee loading state exits in all timeout/failure paths.
- Keep existing success behavior unchanged.

## Blockers
- `task-002-implement-timeout-aware-failover.md` - Hook behavior depends on new provider error semantics

## Acceptance Checklist
- [ ] Hook exits loading state on timeout failure
- [ ] Timeout errors produce deterministic user-facing message
- [ ] Existing success and non-timeout error behavior remains correct
- [ ] Hook tests pass including latency regression coverage
- [ ] Tests are written and passing
- [ ] Code follows the project's style
