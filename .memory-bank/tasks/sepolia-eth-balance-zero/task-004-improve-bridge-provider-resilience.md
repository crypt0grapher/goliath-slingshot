# Improve Bridge Provider Mid-Session Resilience

## Context
The frontend's `bridgeProviders.ts` validates the Sepolia RPC on first use and switches to a fallback if the primary returns HTTP 429. However, this validation happens only once (`_sepoliaValidated` flag). If the Alchemy key works initially but then gets rate-limited mid-session, balance fetches via `getNativeBalance()` and `getTokenBalance()` will fail with no automatic recovery.

Key files:
- `src/services/bridgeProviders.ts:29-57` — `validateSepoliaProvider()` runs once, sets `_sepoliaValidated = true`
- `src/services/bridgeProviders.ts:97-101` — `getNativeBalance()` uses provider directly, no error recovery
- `src/hooks/bridge/useBridgeBalances.ts:103-108` — catches errors but only logs them, keeps stale balance

The Bridge page balance display depends on `useBridgeBalances` → `getNativeBalance()` → `bridgeProviders.ts`. If the provider becomes unhealthy mid-session, balance stays stale or shows an error.

## Task
Add a retry-with-re-validation mechanism to `getNativeBalance()` and `getTokenBalance()`:

1. On the first balance fetch failure that looks like a rate-limit (HTTP 429, NETWORK_ERROR, SERVER_ERROR), reset `_sepoliaValidated = false` and re-run `validateSepoliaProvider()` to trigger fallback switch
2. Retry the balance fetch once with the new provider
3. If the retry also fails, throw the error (let the caller handle it)

This should be a simple wrapper — do not add complex retry logic. One re-validation + one retry is sufficient.

## Blockers
No blockers (independent of multicall fix, but should be done after task-001 to focus on the critical fix first).

## Acceptance Checklist
- [ ] `getNativeBalance()` retries with fallback provider if primary fails with 429/NETWORK_ERROR
- [ ] `getTokenBalance()` retries with fallback provider if primary fails with 429/NETWORK_ERROR
- [ ] `getTokenAllowance()` retries with fallback provider if primary fails
- [ ] Re-validation only happens once per failure (no infinite retry loops)
- [ ] Tests verify the fallback-and-retry behavior with mocked providers
- [ ] Code follows the project's style
- [ ] `npm run build` succeeds
