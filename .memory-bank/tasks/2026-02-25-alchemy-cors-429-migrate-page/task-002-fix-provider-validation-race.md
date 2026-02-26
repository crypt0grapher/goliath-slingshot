# Fix Provider Validation Race Condition in bridgeProviders.ts

## Context
`src/services/bridgeProviders.ts` has a race condition. The module eagerly starts async validation of the Sepolia provider (`validateSepoliaProvider().catch(() => {})`) at import time (line 61), but the synchronous `getSepoliaProvider()` (lines 63-68) returns the provider immediately without waiting for validation to complete. React hooks that call `getReadonlyProvider(BridgeNetwork.SEPOLIA)` during render may get the unvalidated primary provider, which fails if the primary RPC is down.

The fix is to expose an async readiness gate that consumers can await, ensuring the provider has been validated (and potentially switched to fallback) before any RPC call is made.

Affected consumers:
- `src/hooks/migration/useMigrationData.ts` — calls `getReadonlyProvider(BridgeNetwork.SEPOLIA)`
- `src/hooks/bridge/useBridgeBalances.ts` — calls `getNativeBalance()` / `getTokenBalance()` (these already have retry logic but the initial call still races)

## Task
1. In `bridgeProviders.ts`:
   - Store the validation promise in a module-level variable (`_validationPromise`)
   - Export a new function `ensureSepoliaProviderReady(): Promise<void>` that awaits the validation promise
   - Keep the synchronous `getSepoliaProvider()` for backward compatibility
   - Make sure multiple concurrent calls to `ensureSepoliaProviderReady()` share the same promise (no duplicate validation)

2. In `useMigrationData.ts`:
   - Import `ensureSepoliaProviderReady`
   - In `fetchData()`, call `await ensureSepoliaProviderReady()` before calling `getReadonlyProvider()`
   - This ensures the provider has been validated before any contract calls

3. In `bridgeProviders.ts` exported functions (`getNativeBalance`, `getTokenBalance`, `getTokenAllowance`):
   - Add `await ensureSepoliaProviderReady()` at the start of each function when the network is Sepolia
   - This ensures the retry-with-fallback functions also start with a validated provider

## Blockers
- `task-001-swap-primary-fallback-rpc.md` — the RPC swap should be done first so tests run against the correct URLs

## Acceptance Checklist
- [ ] `ensureSepoliaProviderReady()` is exported from `bridgeProviders.ts`
- [ ] Multiple calls to `ensureSepoliaProviderReady()` share the same promise
- [ ] `useMigrationData` awaits provider readiness before fetching
- [ ] `getNativeBalance`, `getTokenBalance`, `getTokenAllowance` await readiness for Sepolia
- [ ] No consumer can get a provider that hasn't completed validation
- [ ] `yarn build` succeeds
- [ ] Tests are written and passing
- [ ] Code follows the project's style
