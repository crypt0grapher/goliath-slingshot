# Implement Timeout-Aware Failover in bridgeProviders

## Context
What you need to know to complete this task:
- `ensureSepoliaProviderReady()` currently waits for primary RPC validation without timeout.
- Primary endpoint can succeed but take ~39s, causing long UI blocking.
- Fallback currently triggers only on explicit error codes/messages.

## Task
Implement timeout and latency-aware fallback in `src/services/bridgeProviders.ts`:
- Add a bounded timeout for provider validation/readiness checks.
- Treat timeout (and optionally latency threshold exceedance) as retryable RPC failure.
- Switch to fallback provider when primary validation exceeds timeout budget.
- Preserve existing behavior for explicit error-code failover.

## Blockers
- `task-001-add-latency-regression-tests.md` - Tests must be in place first (TDD)

## Acceptance Checklist
- [ ] Provider readiness no longer blocks indefinitely on slow-success primary
- [ ] Fallback activates on timeout path
- [ ] Existing explicit-error fallback behavior still passes
- [ ] `bridgeProviders` tests pass including new latency regression tests
- [ ] Tests are written and passing
- [ ] Code follows the project's style
