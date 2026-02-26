# Add Tests for Provider Fallback Mechanism

## Context
`src/services/__tests__/bridgeProviders.test.ts` exists but may not cover the race condition or the fallback behavior when the primary RPC is completely unavailable (monthly limit exceeded vs. transient 429).

We need to ensure the fallback mechanism works correctly: when the primary provider fails validation (NETWORK_ERROR, 429, CORS), the module switches to the fallback URL before any consumer uses the provider.

## Task
1. In `src/services/__tests__/bridgeProviders.test.ts`, add or update tests:

   a. **Test: primary RPC works → uses primary provider**
      - Mock `JsonRpcProvider.getBlockNumber()` to resolve successfully
      - Call `ensureSepoliaProviderReady()` + `getSepoliaProvider()`
      - Assert provider was created with the primary URL

   b. **Test: primary RPC returns NETWORK_ERROR → switches to fallback**
      - Mock `getBlockNumber()` to reject with `code: 'NETWORK_ERROR'`
      - Call `ensureSepoliaProviderReady()` + `getSepoliaProvider()`
      - Assert provider was re-created with the fallback URL

   c. **Test: primary RPC returns 429 → switches to fallback**
      - Mock `getBlockNumber()` to reject with `code: 429` or message including '429'
      - Assert fallback is used

   d. **Test: concurrent calls share the same validation promise**
      - Call `ensureSepoliaProviderReady()` twice concurrently
      - Assert `getBlockNumber()` was only called once (not duplicated)

   e. **Test: after fallback switch, subsequent getSepoliaProvider() returns fallback**
      - Trigger fallback switch
      - Call `getSepoliaProvider()` multiple times
      - Assert all return the fallback provider

2. Ensure tests properly reset module state between test cases (may need `jest.resetModules()` or re-importing the module).

## Blockers
- `task-002-fix-provider-validation-race.md` — the `ensureSepoliaProviderReady()` function must exist before these tests can be written

## Acceptance Checklist
- [ ] At least 5 test cases covering: healthy primary, NETWORK_ERROR fallback, 429 fallback, concurrent call dedup, post-fallback consistency
- [ ] Tests use proper mocking of ethers.js `JsonRpcProvider`
- [ ] Tests reset module state between cases to avoid cross-contamination
- [ ] All tests pass: `npx react-scripts test --watchAll=false --testPathPattern=bridgeProviders`
- [ ] Code follows the project's test style conventions
