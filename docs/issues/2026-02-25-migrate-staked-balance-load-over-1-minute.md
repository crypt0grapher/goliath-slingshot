# Migrate Tab Staked Balance Load Time > 1 Minute (Sepolia RPC Slow-Path Without Timeout Failover)

**Project:** CoolSwap-interface
**Type:** Performance
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend rebuild/redeploy)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-alchemy-cors-429-migrate-page.md`
- `docs/issues/2026-02-25-migrate-slow-xcn-detection-shows-empty-state.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

Opening `/#/migrate` with a connected Sepolia wallet shows staked XCN data (or a clear actionable error) within an acceptable SLO, instead of staying in loading state for 60-120 seconds.

**Must-have outcomes**

- [ ] First meaningful migrate data (staked/rewards/wallet/allowance) resolves in <= 5 seconds on healthy RPC
- [ ] If primary RPC is slow, app fails over quickly to fallback (without waiting 30-120s)
- [ ] Loading skeleton does not persist indefinitely; timeout error message is surfaced when both RPCs are unhealthy
- [ ] Regression tests fail before fix and pass after fix for slow-success primary RPC scenario

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `ensureSepoliaProviderReady` switches to fallback when primary validation call exceeds timeout budget
- [ ] Test B: `useMigrationData` resolves snapshot using fallback when primary is slow (mocked)
- [ ] Test C: `useMigrationData` exits loading state with deterministic error when both primary and fallback exceed timeout
- [ ] Test D: provider latency regression test enforces `NFR-001` expectation (`<= 3s` on healthy path)

**Non-goals**

- Contract changes
- Backend migration API changes
- Wallet connector deprecation cleanup (`ethereum.send`, `networkChanged`, `close`) in this issue

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Project detection:** Detected from CWD `/Users/alex/goliath/CoolSwap-interface`
- **Language/stack:** React 17, TypeScript, ethers.js v5.3, Redux Toolkit, web3-react
- **Entry point:** `src/pages/Migrate/index.tsx` (feature path), `src/hooks/migration/useMigrationData.ts` (data path)
- **Build command:** `npm run build`
- **Test command:** `CI=true npm test -- --watchAll=false`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A (frontend)
- **Deployment name:** N/A (frontend)
- **Docker image:** N/A
- **RPC endpoints:**
  - Sepolia primary (current): `https://ethereum-sepolia.core.chainstack.com/<redacted>`
  - Sepolia fallback: `https://ethereum-sepolia-rpc.publicnode.com`
- **Contract addresses:**
  - Sepolia XCN: `0x7a8adc542A35c93da263A188367F4bF4c445B8E9`
  - Sepolia staking: `0xc50B664BA11F5558b8FF7358bb7C576542655D54`

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Sepolia Chain ID: 11155111

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files (consensus loss risk)
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Smart contract changes require careful review of upgrade path
- [ ] Breaking API changes must be documented

### Operational Constraints

- Allowed downtime: None required (frontend deployment)
- Blast radius: Migrate + Bridge consumers of `src/services/bridgeProviders.ts`

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Migrate tab loading remains active for >1 minute before staked balance appears
- Console during loading includes:
  - `[BridgeProviders] Creating Sepolia provider: https://ethereum-sepolia.core.chainstack.com/...`
  - `Wallet eager connect timed out, proceeding without wallet` (3s safety timeout; not primary blocker)
- No immediate fallback to fast endpoint despite configured fallback

### 4.2 Impact

- **User impact:** Users perceive migration as frozen/broken; high abandonment risk
- **System impact:** Feature is functionally available but operationally unusable under slow primary RPC
- **Scope:** Migrate data fetch path, shared provider failover logic, tests missing slow-success coverage

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationData.ts` | `fetchData` / `fetchMigrationSnapshot` | Sequential wait pattern (`ensureSepoliaProviderReady` then 4 RPC reads) amplifies slow primary latency |
| `src/services/bridgeProviders.ts` | `validateSepoliaProvider` / `ensureSepoliaProviderReady` | Fallback only on explicit error; no timeout or latency threshold failover |
| `src/services/bridgeProviders.ts` | `validateSepoliaProvider` | `await _sepoliaProvider.getBlockNumber()` can block for tens of seconds |
| `src/services/__tests__/bridgeProviders.test.ts` | provider readiness tests | No test for slow-success primary (> timeout) path |
| `src/hooks/migration/__tests__/useMigrationData.test.ts` | hook tests | No timeout/fallback latency regression assertion |

### 4.4 Evidence

**User-provided runtime evidence (console):**

```text
[BridgeProviders] Creating Sepolia provider: https://ethereum-sepolia.core.chainstack.com/...
Wallet eager connect timed out, proceeding without wallet
```

**Measured endpoint latency from local environment (`2026-02-25`):**

```bash
# Primary (3 attempts)
http_code=200 start_transfer=39.667984s total=39.668471s
http_code=200 start_transfer=39.176183s total=39.176679s
http_code=200 start_transfer=39.378278s total=39.378770s

# Fallback (3 attempts)
http_code=200 start_transfer=0.067764s total=0.068026s
http_code=200 start_transfer=0.051640s total=0.052752s
http_code=200 start_transfer=0.049471s total=0.049730s
```

**Direct migration path timing (same contracts/account):**

```json
{"host":"ethereum-sepolia.core.chainstack.com","validateMs":39339,"readsMs":78432,"totalMs":117771}
{"host":"ethereum-sepolia-rpc.publicnode.com","validateMs":59,"readsMs":93,"totalMs":152}
```

**Code-path evidence:**

- `useMigrationData` waits on `ensureSepoliaProviderReady()` before any reads
- `fetchMigrationSnapshot` performs 4 reads via `Promise.all`
- `bridgeProviders` only failsover on errors (`429`, `NETWORK_ERROR`, `SERVER_ERROR`), not high-latency success

### 4.5 Tasks

List of task files generated to solve the issue:

- `.memory-bank/tasks/2026-02-25-migrate-staked-balance-load-over-1-minute/task-001-add-latency-regression-tests.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-balance-load-over-1-minute/task-002-implement-timeout-aware-failover.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-balance-load-over-1-minute/task-003-promote-fast-primary-rpc-config.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-balance-load-over-1-minute/task-004-harden-usemigrationdata-timeouts.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-balance-load-over-1-minute/task-005-validate-slo-and-release.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The configured primary Sepolia RPC succeeds but is extremely slow (~39s per call), and provider failover logic does not treat high latency as failure; as a result, migration data fetch blocks for 1-2 minutes.

### 5.2 Supporting Evidence

- Primary endpoint returned HTTP 200 but consistently took ~39s per request
- Fallback endpoint returned in ~50-70ms
- Measured migrate fetch sequence using current contracts showed `117771ms` total on primary
- `bridgeProviders` failover triggers only on explicit error codes/messages, not latency
- Existing unit tests pass (`24/24`) but do not cover slow-success scenarios

### 5.3 Gaps / Items to Verify

- TO VERIFY: determine whether latency spike is regional or global
  - Command: `for i in 1 2 3; do curl -sS -o /dev/null -m 70 -w 'total=%{time_total}\n' -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$REACT_APP_SEPOLIA_RPC_URL"; done`
  - Expected output: totals consistently either low (<1s) or high (~39s) depending on region/provider condition
  - Failure modes: curl timeout (`Operation timed out`) or DNS failure
  - Rollback: N/A (read-only)

- TO VERIFY: check if production deploy uses same RPC order as local `.env`
  - Command: `rg -n "REACT_APP_SEPOLIA_RPC_URL|REACT_APP_SEPOLIA_RPC_URL_FALLBACK" .env`
  - Expected output: primary/fallback values match intended order
  - Failure modes: missing env keys
  - Rollback: N/A (read-only)

### 5.4 Root Cause (final)

- **Root cause:** `src/services/bridgeProviders.ts` assumes only explicit RPC errors should trigger fallback. The current primary Sepolia RPC is often slow-but-successful, so fallback never activates.
- **Contributing factors:**
  - No timeout budget around provider validation (`getBlockNumber`)
  - No latency-aware failover heuristic
  - Migration flow does two latency-sensitive phases on the same provider: validation + four contract reads
  - Missing regression tests for slow-success behavior

---

## 6) SOLUTIONS (compare options)

### Option A - Config-only RPC Priority Swap

**Changes required**

- `.env` / deployment envs: set fast public endpoint as primary and Chainstack as fallback
- Optional default update in `src/config/bridgeConfig.ts`

**Pros**

- Fastest mitigation
- Minimal code risk

**Cons / risks**

- Does not fix architectural gap (future slow primary on any provider will regress)
- Depends on operator keeping env ordering correct

**Complexity:** Low
**Rollback:** Easy

---

### Option B - Timeout-aware Provider Validation + Latency Failover

**Changes required**

- `src/services/bridgeProviders.ts`
  - Add timeout wrapper for validation/read calls
  - Treat timeout/high-latency as retryable RPC failure
  - Switch to fallback when validation exceeds threshold
- Add tests in `src/services/__tests__/bridgeProviders.test.ts`

**Pros**

- Durable fix independent of specific provider vendor
- Enforces deterministic upper bound for loading

**Cons / risks**

- More code change than config-only swap
- Requires careful timeout tuning to avoid false positives

**Complexity:** Medium
**Rollback:** Moderate

---

### Option C - Hybrid: A + B (recommended)

**Changes required**

- Implement Option B code fix
- Also set fast endpoint as primary in env/defaults for immediate relief

**Pros**

- Immediate UX improvement + long-term resilience
- Reduces dependence on one provider behavior

**Cons / risks**

- Slightly larger blast radius (config + provider module)

**Complexity:** Medium
**Rollback:** Moderate

---

### Decision

**Chosen option:** C
**Justification:** Meets urgent performance need now while preventing recurrence from any slow-success RPC endpoint.
**Accepted tradeoffs:** Slightly broader test/update surface in exchange for predictable load latency.

---

## 7) DELIVERABLES

- [x] Code changes:
  - `src/services/bridgeProviders.ts`
  - `src/hooks/migration/useMigrationData.ts`
  - `src/services/__tests__/bridgeProviders.test.ts`
  - `src/hooks/migration/__tests__/useMigrationData.test.ts`
- [x] Tests:
  - `src/services/__tests__/bridgeProviders.test.ts`
  - `src/hooks/migration/__tests__/useMigrationData.test.ts`
- [x] Config changes:
  - Sepolia primary/fallback ordering (runtime env)
- [x] Documentation:
  - Add/update issue notes and runbook guidance in `docs/issues/`
- [ ] Deployment:
  - Frontend redeploy after merge
- [ ] Monitoring/alerts:
  - Add latency log/metric for primary and fallback validation durations

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:**
  - `src/services/__tests__/bridgeProviders.test.ts`
  - `src/hooks/migration/__tests__/useMigrationData.test.ts`
- **Run command:** `CI=true npm test -- --watchAll=false --runInBand src/services/__tests__/bridgeProviders.test.ts src/hooks/migration/__tests__/useMigrationData.test.ts`
- **Framework:** Jest + React Testing Library hook helpers

### 8.2 Required Tests

**Unit tests**

- [x] `ensureSepoliaProviderReady` falls back when primary validation exceeds timeout budget
- [x] `getNativeBalance` retries on timeout error and succeeds via fallback
- [ ] `getTokenBalance` retries on timeout error and succeeds via fallback

**Integration tests (if applicable)**

- [ ] `useMigrationData` returns snapshot within bounded time when primary is slow and fallback is healthy
- [x] `useMigrationData` sets deterministic timeout error when both providers are slow/unavailable

**E2E tests (if applicable)**

- [ ] Manual: open `/migrate` with funded/staked wallet and verify staked summary appears <= 5s

**Contract tests (if smart contract)**

- [ ] N/A

### 8.3 Baseline

- Test run before fix:
  - `src/services/__tests__/bridgeProviders.test.ts`: PASS
  - `src/hooks/migration/__tests__/useMigrationData.test.ts`: PASS
  - Total: 24 tests passing, but no latency-failover regression coverage
- Runtime latency baseline before fix:
  - Primary path measured total: `117771ms`
  - Fallback path measured total: `152ms`

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current repository and env state.
   - Command: `git status --short`
   - Expected output: current modified/untracked files listed
   - Failure modes: not a git repo, permission issues
   - Rollback: N/A (read-only)

2. Verify current Sepolia RPC ordering.
   - Command: `rg -n "REACT_APP_SEPOLIA_RPC_URL|REACT_APP_SEPOLIA_RPC_URL_FALLBACK" .env`
   - Expected output: shows current primary as Chainstack and fallback as PublicNode
   - Failure modes: missing `.env` or missing keys
   - Rollback: N/A (read-only)

3. Create working branch.
   - Command: `git checkout -b codex/fix-migrate-rpc-latency`
   - Expected output: switched to new branch
   - Failure modes: branch already exists, dirty index conflicts
   - Rollback: `git checkout -`

### Phase 1 - Backup / Safety

1. Backup env file before editing local config.
   - Command: `cp .env .env.backup.$(date +%Y%m%d%H%M%S)`
   - Expected output: backup file created
   - Failure modes: filesystem permission issue
   - Rollback: `mv .env.backup.<timestamp> .env`

### Phase 2 - Write Tests First

1. Add slow-success primary timeout regression in provider tests.
   - File: `src/services/__tests__/bridgeProviders.test.ts`
   - Run: `CI=true npm test -- --watchAll=false --runInBand src/services/__tests__/bridgeProviders.test.ts`
   - Expected: FAIL before fix (timeout/fallback behavior not implemented)
   - Failure modes: flaky timers/mocks, module reset issues
   - Rollback: `git checkout -- src/services/__tests__/bridgeProviders.test.ts`

2. Add hook-level bounded-time fallback test.
   - File: `src/hooks/migration/__tests__/useMigrationData.test.ts`
   - Run: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationData.test.ts`
   - Expected: FAIL before fix
   - Failure modes: async test race, unresolved promises
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationData.test.ts`

### Phase 3 - Implement the Fix

1. Add timeout-aware failover in provider validation.
   - File: `src/services/bridgeProviders.ts`
   - Change:
     - Introduce `RPC_VALIDATION_TIMEOUT_MS` and timeout helper
     - Classify timeout/latency-exceeded as retryable RPC failures
     - Trigger fallback on timeout/high-latency primary
   - Code (before/after sketch):

```ts
// before
await _sepoliaProvider.getBlockNumber();

// after
await withTimeout(_sepoliaProvider.getBlockNumber(), RPC_VALIDATION_TIMEOUT_MS, 'sepolia-primary-validation-timeout');
```

   - Build: `npm run build`
   - Expected: build succeeds
   - Verify: fallback selected when primary exceeds timeout in tests
   - Rollback: `git checkout -- src/services/bridgeProviders.ts`

2. Harden migrate hook timeout handling.
   - File: `src/hooks/migration/useMigrationData.ts`
   - Change:
     - Map timeout/fallback exhaustion errors to explicit user-facing message
     - Ensure loading always terminates deterministically on timeout
   - Build: `npm run build`
   - Expected: build succeeds
   - Verify: hook tests cover timeout path
   - Rollback: `git checkout -- src/hooks/migration/useMigrationData.ts`

3. Update config/default ordering (or deployment env) so fast endpoint is primary.
   - File: `src/config/bridgeConfig.ts` and/or deployment env configuration
   - Change:
     - Prefer low-latency endpoint as primary, keep slower vendor as fallback
   - Build: `npm run build`
   - Expected: build succeeds
   - Verify: runtime logs show fast endpoint selected first
   - Rollback: `git checkout -- src/config/bridgeConfig.ts` (and restore env backup)

### Phase 4 - Validate

1. Run targeted regression tests.
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/services/__tests__/bridgeProviders.test.ts src/hooks/migration/__tests__/useMigrationData.test.ts`
   - Expected output: PASS with new timeout/fallback tests
   - Failure modes: flaky async/time-based assertions
   - Rollback: revert recent test or implementation changes per file

2. Build the project.
   - Command: `npm run build`
   - Expected output: CRA build completes without errors
   - Failure modes: TypeScript or linting errors
   - Rollback: `git checkout -- <failing files>` and re-run

3. Manual verification.
   - Command: `npm start`
   - Expected output: local app loads; `/migrate` shows staked summary <= 5s on healthy provider or clear timeout fallback behavior
   - Failure modes: local env mismatch, wallet connection issues
   - Rollback: restore `.env` backup or revert branch changes

### Phase 5 - Deploy (if applicable)

1. Merge and deploy frontend branch.
2. Validate `/migrate` in production-like environment.
3. Monitor logs for provider timeout/fallback activation for 30 minutes.

### Phase 6 - Rollback Plan

**Triggers:**

- Increased migrate error rate
- Bridge-related balance regressions
- Unexpected provider flapping

**Procedure:**

- Code: `git revert <commit>` and redeploy prior stable build
- Deployment: rollback to previous frontend deployment revision
- Config: revert primary/fallback ordering to prior values

---

## 10) VERIFICATION CHECKLIST

- [x] All tests pass
- [x] Build succeeds
- [x] No regressions in existing functionality
- [x] Code review completed (or self-reviewed)
- [ ] Deployed and verified (if applicable)
- [ ] Monitoring shows healthy state (if applicable)

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 19:11 | Inspected migrate/provider code paths (`useMigrationData`, `bridgeProviders`) | Success | Identified no timeout-based fallback |
| 2026-02-25 19:11 | Measured RPC latencies via JSON-RPC curl probes | Success | Primary ~39s, fallback ~0.05s |
| 2026-02-25 19:12 | Measured end-to-end migration fetch sequence via Node/ethers script | Success | Primary total ~117.8s, fallback total ~0.152s |
| 2026-02-25 19:12 | Ran targeted existing test suites | Success | 24/24 pass; latency gap untested |
| 2026-02-25 19:13 | Generated report + task decomposition files | Success | Report-only mode, no code fix applied |
| 2026-02-25 19:16 | Added failing TDD cases for timeout failover in provider + migration hook tests | Success | 4 new tests fail pre-fix as expected |
| 2026-02-25 19:20 | Implemented timeout-aware failover and timeout classification in `bridgeProviders.ts` | Success | Added bounded validation/read calls + retryability for timeout |
| 2026-02-25 19:21 | Added deterministic timeout user message in `useMigrationData.ts` | Success | Prevents raw/internal timeout strings in UI |
| 2026-02-25 19:22 | Re-ran targeted tests after implementation | Success | 28/28 tests passing |
| 2026-02-25 19:23 | Built production bundle (`npm run build`) | Success with pre-existing warnings | No compile errors |
| 2026-02-25 19:31 | Applied option 2 runtime ordering: PublicNode primary, Chainstack fallback | Success | Reduced primary-path latency on localhost |
| 2026-02-25 19:31 | Added Alchemy endpoint as additional Sepolia fallback | Success | New env var `REACT_APP_SEPOLIA_RPC_URL_FALLBACKS` |
| 2026-02-25 19:34 | Extended provider failover to iterate fallback list + added second-fallback test | Success | Supports fallback chain including Alchemy |
| 2026-02-25 19:35 | Re-ran targeted tests and production build | Success with pre-existing warnings | 29/29 tests passing |

### Failed Attempts

- Attempt 1: Rely on existing provider/migration tests to detect latency regression.
  - Why it failed: current tests only cover explicit errors (`429`, `NETWORK_ERROR`) and happy path, not slow-success timeout behavior.
  - What we learned: a dedicated latency/fallback test is required to prevent recurrence.

### Final State

- Changes made (diff summary):
  - `src/services/bridgeProviders.ts`: added timeout-aware validation/read wrappers and fallback on timeout
  - `src/config/bridgeConfig.ts`: added multi-fallback parsing via `REACT_APP_SEPOLIA_RPC_URL_FALLBACKS`
  - `src/hooks/migration/useMigrationData.ts`: added timeout error normalization for user-facing message
  - `src/services/__tests__/bridgeProviders.test.ts`: added slow-success timeout failover, timeout retry, and second-fallback selection tests
  - `src/hooks/migration/__tests__/useMigrationData.test.ts`: added deterministic timeout-message test
  - `.env`: set fast-first endpoint order and included provided Alchemy endpoint in fallback list
- Tests passing:
  - `CI=true npm test -- --watchAll=false --runInBand src/services/__tests__/bridgeProviders.test.ts src/hooks/migration/__tests__/useMigrationData.test.ts`
  - Result: `29 passed, 29 total`
- Build status:
  - `npm run build` succeeded
  - Existing unrelated ESLint warnings remain in repository
- Deployment status: Not deployed from this session
- Remaining risks / follow-ups:
  - Production RPC latency may vary by geography
  - Runtime env ordering still points primary to Chainstack in local `.env`; timeout failover now mitigates but does not remove dependency on fallback health

---

## 12) FOLLOW-UPS

- [ ] Add timeout/latency metrics to frontend observability (provider validation + migration snapshot duration)
- [ ] Add automated smoke check for `/migrate` SLO in CI (mocked provider latency profile)
- [ ] Audit other Sepolia reads (`Bridge`, `Yield`) for same slow-success failover gap
- [ ] Document RPC provider quality requirements (max latency, timeout, fallback order)
