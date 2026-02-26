# Add Goliath Provider Validation and Resilience

## Context
What you need to know to complete this task:
- The Sepolia provider (`bridgeProviders.ts`) has comprehensive resilience: validation on creation, timeout handling, retry, and multi-URL fallback
- The Goliath provider has NONE of this — it's a bare `new ethers.providers.JsonRpcProvider(url, network)` with no validation
- When the Goliath RPC is slow or returning errors, all contract reads via the read-only provider fail silently
- The Goliath provider is used by: `useYieldData`, `useStakingEvents`, and bridge balance reads
- File: `src/services/bridgeProviders.ts` (lines 162-171)
- The pattern to follow is `validateSepoliaProvider()` (lines 82-119) adapted for Goliath

## Task
1. Add a `validateGoliathProvider()` function that validates the provider by calling `getBlockNumber()`, similar to `validateSepoliaProvider()`
2. Add configurable timeout via `REACT_APP_GOLIATH_RPC_TIMEOUT_MS` env var (default: 4000ms)
3. Add optional fallback RPC URL via `REACT_APP_GOLIATH_RPC_URL_FALLBACK` env var
4. Add `ensureGoliathProviderReady()` exported function for consumers to await before using the provider
5. Kick off validation eagerly at module load (same pattern as Sepolia at line 150)

Do NOT break the existing Sepolia provider code. Follow the same patterns for consistency.

## Blockers
No blockers — this task can be started immediately.

## Acceptance Checklist
- [ ] Goliath provider is validated on first use by calling `getBlockNumber()`
- [ ] If validation fails and a fallback URL is configured, it switches to the fallback
- [ ] `getReadonlyProvider(BridgeNetwork.GOLIATH)` still works for all existing consumers
- [ ] Timeout is configurable via env var with a sensible default
- [ ] Existing Sepolia provider code is not affected
- [ ] Tests are written and passing
- [ ] Code follows the project's style
