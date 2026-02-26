# Add Tests for Multicall Config and Provider Fallback

## Context
The root cause of the Sepolia balance bug (missing multicall address) was not caught by any existing test. There is no automated validation that `MULTICALL_NETWORKS` covers all supported chains. Additionally, the `bridgeProviders.ts` fallback logic has no unit tests.

Adding tests ensures these issues don't regress and documents the expected behavior.

## Task
Create the following test files:

### 1. `src/constants/multicall/__tests__/index.test.ts`
- Test that `MULTICALL_NETWORKS` has an entry for Sepolia (11155111)
- Test that `MULTICALL_NETWORKS` has an entry for Goliath (8901)
- Test that all entries are valid Ethereum addresses (start with `0x`, 42 characters)
- Test that the exported `MULTICALL_ABI` is a non-empty array

### 2. `src/services/__tests__/bridgeProviders.test.ts`
- Test that `getNativeBalance()` returns a bigint from a mocked provider
- Test that `getTokenBalance()` returns a bigint from a mocked provider
- Test that when the primary Sepolia RPC fails with a 429-like error, the provider switches to fallback
- Test that when the primary Sepolia RPC succeeds, the fallback is NOT used

## Blockers
- `task-001-add-sepolia-multicall-address.md` — the multicall config test will fail without the Sepolia entry
- `task-004-improve-bridge-provider-resilience.md` — the provider retry test depends on the re-validation mechanism being implemented

## Acceptance Checklist
- [ ] `src/constants/multicall/__tests__/index.test.ts` exists and passes
- [ ] `src/services/__tests__/bridgeProviders.test.ts` exists and passes
- [ ] All tests run successfully via `npm test`
- [ ] Tests cover the specific regression scenarios documented in the issue
- [ ] No existing tests are broken
