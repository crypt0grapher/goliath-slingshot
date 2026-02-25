# Migrate Page NETWORK_ERROR: Alchemy Sepolia RPC Monthly Limit Exceeded + Fallback Race Condition

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (Vercel rebuild after code change)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md` (earlier report, same Alchemy key issue)
- `docs/issues/2026-02-25-sepolia-eth-balance-shows-zero.md` (Alchemy 429 documented)

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The Migrate page at `https://goliath-slingshot.vercel.app/#/migrate` loads without CORS or NETWORK_ERROR errors. Sepolia on-chain data (staked XCN, wallet balance, allowance) is fetched reliably through a CORS-friendly RPC endpoint, with the Alchemy endpoint demoted to a fallback role. The fallback mechanism correctly awaits validation before returning a provider to any consumer.

**Must-have outcomes**

- [ ] Migrate page loads without `NETWORK_ERROR` on Vercel deployment
- [ ] No CORS errors in browser console from Sepolia RPC calls
- [ ] `useMigrationData` successfully fetches staking snapshot data
- [ ] `useBridgeBalances` successfully fetches Sepolia token balances
- [ ] Fallback mechanism is synchronization-safe (no race condition)

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `getSepoliaProvider()` returns a validated provider (fallback if primary fails)
- [ ] Test B: `useMigrationData` returns non-zero `staked` when provider works (mocked)
- [ ] Test C: When primary RPC returns 429, fallback is used before any consumer gets the provider
- [ ] Test D: Bridge balance hooks work when primary RPC is down

**Non-goals**

- Upgrading the Alchemy plan (operational concern, not a code fix)
- Changing the migration flow steps or UI layout
- Modifying smart contracts

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React 17, TypeScript, ethers.js v5.3, Redux Toolkit, web3-react, CRA
- **Entry point:** `src/index.tsx`
- **Build command:** `yarn build` (CRA with `CI=false`)
- **Test command:** `yarn test` / `npx react-scripts test`

### Deployment Details

- **Platform:** Vercel
- **Domain:** `https://goliath-slingshot.vercel.app`
- **Branch:** `feat/migrate`
- **Build env:** `.env` is committed to git and read at build time by CRA

### Network Context

- Goliath Testnet Chain ID: 8901
- Sepolia Chain ID: 11155111
- Primary Sepolia RPC: `https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt` (**MONTHLY LIMIT EXCEEDED**)
- Fallback Sepolia RPC: `https://ethereum-sepolia-rpc.publicnode.com` (working, CORS-open)

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Must not break Bridge tab functionality (uses same provider infrastructure)

### Operational Constraints

- Allowed downtime: None (Vercel atomic deployments)
- Blast radius: Migrate page, Bridge page (both use `bridgeProviders.ts`)

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Migrate page at `https://goliath-slingshot.vercel.app/#/migrate` shows error
- Browser console shows repeated CORS errors:
  ```
  Access to fetch at 'https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt'
  from origin 'https://goliath-slingshot.vercel.app' has been blocked by CORS policy
  ```
- `useMigrationData.ts:169` logs: `Error: could not detect network (event="noNetwork", code=NETWORK_ERROR, version=providers/5.3.0)`
- `useBridgeBalances.ts:104` logs: `Error fetching balance: Error: could not detect network`
- `bridgeProviders.ts:63` logs: `[BridgeProviders] getTokenBalance - provider chainId: 8901 expected: GOLIATH`

### 4.2 Impact

- **User impact:** ALL users visiting the Migrate page on Vercel see an error and cannot proceed with migration
- **System impact:** Migration feature is completely non-functional on the deployed app
- **Scope:** Migrate page, Bridge page Sepolia balance fetching

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/services/bridgeProviders.ts:17-68` | `createSepoliaProvider`, `validateSepoliaProvider`, `getSepoliaProvider` | Race condition: provider returned before validation completes |
| `src/services/bridgeProviders.ts:61` | Module-level eager validation | Non-blocking `.catch(() => {})` swallows validation result |
| `src/hooks/migration/useMigrationData.ts:150` | `fetchData` | Gets provider synchronously, may get unvalidated primary |
| `src/hooks/bridge/useBridgeBalances.ts:76-81` | `fetchBalance` | Uses `getNativeBalance`/`getTokenBalance` which have retry logic but initial call still races |
| `src/config/bridgeConfig.ts:36` | `loadBridgeConfig` | Primary RPC set to exhausted Alchemy key |

### 4.4 Evidence

**Alchemy 429 confirmation (tested 2026-02-25 13:39 UTC):**

```
$ curl -s -D - "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
  -H "Origin: https://goliath-slingshot.vercel.app" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

HTTP/2 429
x-alchemy-response-code: 429
{"jsonrpc":"2.0","id":1,"error":{"code":429,"message":"Monthly capacity limit exceeded. Visit https://dashboard.alchemy.com/settings/billing to upgrade your scaling policy for continued service."}}
```

**PublicNode fallback confirmed working:**

```
$ curl -s "https://ethereum-sepolia-rpc.publicnode.com" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

{"jsonrpc":"2.0","result":"0x9dafa8","id":1}
```

**PublicNode CORS confirmed open (Access-Control-Allow-Origin: \*):**

```
$ curl -s -D - -o /dev/null -X OPTIONS "https://ethereum-sepolia-rpc.publicnode.com" \
  -H "Origin: https://goliath-slingshot.vercel.app" \
  -H "Access-Control-Request-Method: POST"

HTTP/2 204
access-control-allow-origin: *
```

### 4.5 Tasks

- `task-001-swap-primary-fallback-rpc.md` - Swap primary and fallback Sepolia RPC URLs
- `task-002-fix-provider-validation-race.md` - Make provider validation synchronous for consumers
- `task-003-add-provider-fallback-tests.md` - Add tests for the fallback mechanism

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The Alchemy Sepolia API key has exceeded its monthly capacity limit, causing all RPC requests to return HTTP 429. The existing fallback mechanism in `bridgeProviders.ts` has a race condition where consumers get the broken primary provider before async validation completes.

### 5.2 Supporting Evidence

1. **Alchemy monthly limit exceeded** - Confirmed via direct curl: HTTP 429 with `"Monthly capacity limit exceeded"`
2. **PublicNode fallback works** - Confirmed via curl: returns valid data with CORS `*`
3. **Race condition in code** - `validateSepoliaProvider()` is async (line 61) but `getSepoliaProvider()` is synchronous (line 63-68). React hooks call `getSepoliaProvider()` during render, before the async validation resolves.
4. **Validation error swallowed** - Line 61: `.catch(() => {})` silently swallows validation errors, so if validation itself fails (e.g., CORS blocks the preflight in certain conditions), the provider is never switched.

### 5.3 Gaps / Items to Verify

- TO VERIFY: Check Alchemy dashboard to confirm monthly limit status and whether the key can be upgraded
- TO VERIFY: Confirm that Vercel env vars match the committed `.env` file

### 5.4 Root Cause (final)

- **Root cause (primary):** Alchemy Sepolia API key `KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt` has exceeded its monthly capacity limit. All requests return HTTP 429, which browsers often block at the CORS preflight level, producing the `NETWORK_ERROR`.
- **Root cause (secondary):** The fallback mechanism in `bridgeProviders.ts` has a race condition. The async validation (`validateSepoliaProvider()`) is fire-and-forget at module load. The synchronous `getSepoliaProvider()` returns the primary (broken) provider to hook consumers before validation can switch to the fallback.
- **Contributing factors:**
  - Primary RPC is a rate-limited service (Alchemy with a free-tier monthly cap)
  - No synchronization gate between provider validation and provider consumption
  - The eager validation swallows errors with `.catch(() => {})`

---

## 6) SOLUTIONS (compare options)

### Option A - Swap Primary/Fallback + Fix Race Condition

**Changes required**

1. `src/config/bridgeConfig.ts:36-37` — Swap the primary and fallback RPC URLs so PublicNode (unlimited, CORS-open) is primary and Alchemy is fallback
2. `src/services/bridgeProviders.ts:29-68` — Make `getSepoliaProvider()` return a promise that awaits validation on first call, ensuring no consumer gets an unvalidated provider
3. `src/hooks/migration/useMigrationData.ts:150` — Await provider validation before using it
4. Add tests for the fallback mechanism

**Pros**
- Immediately fixes the issue for all users
- PublicNode has no rate limits and allows all CORS origins
- The race condition fix prevents this class of bug from recurring with any RPC provider
- Minimal code changes, focused on the root cause

**Cons / risks**
- PublicNode is a public endpoint (no SLA), but it's already the configured fallback
- Slightly more complex provider initialization (async)

**Complexity:** Low-Medium
**Rollback:** Easy (`git revert`, redeploy)

---

### Option B - Upgrade Alchemy Plan (Operational Fix Only)

**Changes required**

1. Upgrade Alchemy plan in dashboard to increase monthly capacity
2. Add `goliath-slingshot.vercel.app` to Alchemy's allowed origins (if not already)

**Pros**
- No code changes needed
- Alchemy provides better reliability guarantees than public endpoints

**Cons / risks**
- Does NOT fix the race condition — issue will recur whenever Alchemy is temporarily unavailable
- Requires Alchemy dashboard access and potentially payment
- Monthly limits can be hit again if usage grows
- Does not address the architectural weakness

**Complexity:** Low
**Rollback:** N/A

---

### Option C - Both A + B

Combine the code fix (Option A) with an Alchemy plan upgrade (Option B).

**Pros**
- Best of both worlds: robust fallback + reliable primary
- Defense in depth

**Cons / risks**
- More work (both code and ops)

**Complexity:** Low-Medium
**Rollback:** Independent rollback for each part

---

### Decision

**Chosen option:** Option A (code fix — swap primary/fallback + fix race condition)

**Justification:**
- Immediately resolves the deployed issue without requiring Alchemy dashboard access
- Fixes the underlying race condition that would cause issues regardless of which RPC provider is primary
- PublicNode is already trusted as the fallback; promoting it to primary is low-risk
- Option B (Alchemy upgrade) can be pursued independently as a follow-up

**Accepted tradeoffs:**
- PublicNode as primary has no SLA, but it's a widely-used public RPC and is already the configured fallback

---

## 7) DELIVERABLES

- [ ] Code changes: `src/config/bridgeConfig.ts`, `src/services/bridgeProviders.ts`, `src/hooks/migration/useMigrationData.ts`
- [ ] Tests: `src/services/__tests__/bridgeProviders.test.ts` (update/expand)
- [ ] Config changes: `.env` (swap primary/fallback values)
- [ ] Deployment: Vercel rebuild after push to `feat/migrate`

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/services/__tests__/bridgeProviders.test.ts`
- **Run command:** `npx react-scripts test --watchAll=false --testPathPattern=bridgeProviders`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**

- [ ] `getSepoliaProvider()` returns a provider using the primary RPC URL when it's healthy
- [ ] `getSepoliaProvider()` returns a provider using the fallback RPC URL when primary returns 429
- [ ] `getSepoliaProvider()` returns a provider using the fallback when primary throws NETWORK_ERROR
- [ ] Validation is awaited before provider is returned to consumers (no race condition)
- [ ] Multiple concurrent calls to the provider getter share the same validation promise (no duplicate validation)

**Integration tests (if applicable)**

- [ ] `useMigrationData` hook successfully fetches data when primary RPC is down and fallback is available

### 8.3 Baseline

- Test run before fix: TO RECORD (run `npx react-scripts test --watchAll=false --testPathPattern=bridgeProviders`)

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. `git status` — confirm working on `feat/migrate` branch
2. `yarn install` — ensure dependencies are up to date
3. `yarn build` — confirm current state builds

### Phase 1 - Backup / Safety

1. No backup needed — all changes are reversible via git
2. Existing `.env` values documented in this issue

### Phase 2 - Write Tests First

**Step 1:** Update `src/services/__tests__/bridgeProviders.test.ts`

- Add test: "returns fallback provider when primary fails with NETWORK_ERROR"
- Add test: "awaits validation before returning provider"
- Run: `npx react-scripts test --watchAll=false --testPathPattern=bridgeProviders`
- Expected: Tests FAIL (race condition still present, no async getter)

### Phase 3 - Implement the Fix

**Step 1:** Swap primary/fallback RPC in `.env`

- File: `.env:28-29`
- Change:
  ```
  # Before
  REACT_APP_SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt"
  REACT_APP_SEPOLIA_RPC_URL_FALLBACK="https://ethereum-sepolia-rpc.publicnode.com"

  # After
  REACT_APP_SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
  REACT_APP_SEPOLIA_RPC_URL_FALLBACK="https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt"
  ```
- Rollback: `git checkout -- .env`

**Step 2:** Swap hardcoded defaults in `bridgeConfig.ts`

- File: `src/config/bridgeConfig.ts:36-37`
- Change: Swap the fallback default values to match
  ```ts
  // Before
  rpcUrl: process.env.REACT_APP_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
  rpcUrlFallback: process.env.REACT_APP_SEPOLIA_RPC_URL_FALLBACK || 'https://ethereum-sepolia-rpc.publicnode.com',

  // After
  rpcUrl: process.env.REACT_APP_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  rpcUrlFallback: process.env.REACT_APP_SEPOLIA_RPC_URL_FALLBACK || 'https://eth-sepolia.g.alchemy.com/v2/demo',
  ```
- Rollback: `git checkout -- src/config/bridgeConfig.ts`

**Step 3:** Fix the race condition in `bridgeProviders.ts`

- File: `src/services/bridgeProviders.ts`
- Change: Add a validation promise that `getSepoliaProvider` consumers can await. Export an async `getValidatedSepoliaProvider()` function. Keep the sync getter for backward compat but log a warning.
- Key changes:
  - Store the validation promise in a module-level variable
  - Export `ensureSepoliaProviderReady(): Promise<void>` that consumers can await
  - Have `getSepoliaProvider()` return the current provider (may be primary or fallback)
  - Consumer hooks call `await ensureSepoliaProviderReady()` before using the provider
- Rollback: `git checkout -- src/services/bridgeProviders.ts`

**Step 4:** Update `useMigrationData.ts` to await provider readiness

- File: `src/hooks/migration/useMigrationData.ts:150`
- Change: Import and await `ensureSepoliaProviderReady()` before calling `getReadonlyProvider()`
- Rollback: `git checkout -- src/hooks/migration/useMigrationData.ts`

### Phase 4 - Validate

1. Run the full test suite: `npx react-scripts test --watchAll=false`
2. Build the project: `yarn build`
3. Manual verification: Open `http://localhost:3000/#/migrate` and confirm no CORS errors

### Phase 5 - Deploy

1. Push to `feat/migrate` branch
2. Vercel auto-deploys from the branch
3. Verify at `https://goliath-slingshot.vercel.app/#/migrate`
4. Check browser console for absence of CORS errors

### Phase 6 - Rollback Plan

**Triggers:** If Migrate page still shows errors, or if Bridge tab breaks
**Procedure:**
- Code: `git revert <commit>` and push to trigger Vercel redeploy
- If urgent: Revert `.env` changes and force-rebuild on Vercel

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds (`yarn build`)
- [ ] No CORS errors on `https://goliath-slingshot.vercel.app/#/migrate`
- [ ] No CORS errors on `https://goliath-slingshot.vercel.app/#/bridge`
- [ ] `useMigrationData` fetches staking snapshot without errors
- [ ] `useBridgeBalances` fetches Sepolia balances without errors
- [ ] Fallback mechanism switches to Alchemy if PublicNode ever fails
- [ ] Code review completed

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 13:39 | Tested Alchemy RPC with Vercel origin | HTTP 429 - monthly limit exceeded | Root cause confirmed |
| 2026-02-25 13:39 | Tested PublicNode RPC | Working (200), CORS `*` | Confirmed viable as primary |
| 2026-02-25 13:39 | Tested Alchemy CORS preflight | Returns CORS headers but 429 on data requests | CORS passes but data requests fail |

### Failed Attempts

(None yet - issue in report-only mode)

### Final State

- Changes made: None (report only)
- Tests passing: TO RECORD
- Deployment status: Not deployed
- Remaining risks / follow-ups: See Section 12

---

## 12) FOLLOW-UPS

- [ ] Upgrade Alchemy plan or obtain a new API key with higher monthly limits
- [ ] Add monitoring/alerting for RPC provider failures (e.g., log metrics on fallback activation)
- [ ] Consider adding a third RPC endpoint (e.g., Infura Sepolia) as a secondary fallback
- [ ] Audit other code paths that directly use the Alchemy URL (search for hardcoded references)
- [ ] Remove the Alchemy API key from committed `.env` (it's a secret embedded in the JS bundle)
