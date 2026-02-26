# Yield Protocol Data Fails to Load — uint40 toNumber() Crash in fetchProtocolData

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Low
**Requires deployment?:** Yes
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `docs/issues/2026-02-25-yield-total-staked-net-apy-not-displayed.md` (layout issue — resolved)
- `src/hooks/yield/useYieldData.ts`
- `src/abis/StakedXCN.ts`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

On `/yield`, the protocol stats (`Total Staked`, `Net APY`) display actual on-chain values instead of `--` dashes, in all wallet/network states.

**Must-have outcomes**

- [ ] `Total Staked` renders the formatted XCN amount from the stXCN contract
- [ ] `Net APY` renders a computed percentage from `rewardRate` and `feePercent`
- [ ] Protocol data loads regardless of wallet connection or network state
- [ ] No runtime crash in `fetchProtocolData`

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `fetchProtocolData` succeeds when `getLastUpdateTimestamp()` returns a plain JS number (uint40)
- [ ] Test B: Yield page renders actual `Total Staked` and `Net APY` values when protocol data loads
- [ ] Test C: Existing ProtocolStats and page visibility tests continue to pass

**Non-goals**

- Changing the StakedXCN smart contract or its ABI on-chain
- Modifying APY calculation formula
- Adding new staking features

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js v5
- **Entry point:** `src/hooks/yield/useYieldData.ts`
- **Build command:** `npm run build`
- **Test command:** `npm test -- --watchAll=false --runInBand`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A (frontend static deployment)
- **Deployment name:** CoolSwap frontend
- **RPC endpoints:** `https://rpc.testnet.goliath.net`
- **Contract addresses:** stXCN proxy `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` (chain 8901)

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: 104.238.187.163 (hostname: `lon`)

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
- [ ] No smart contract changes (frontend-only fix)

### Operational Constraints

- Allowed downtime: none expected (frontend-only deployment)
- Blast radius: `useYieldData` hook, Yield page data display

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User sees `Total Staked --` and `Net APY --` on the Yield tab.
- Both values are permanently stuck at `--`; they never populate with data.
- No visible error banner (error banner is only shown in the `canStake` branch).
- Browser console shows: `Failed to fetch protocol data: TypeError: lastTimestamp.toNumber is not a function`.

### 4.2 Impact

- **User impact:** All users see placeholder dashes instead of protocol metrics. Yield tab appears broken/empty.
- **System impact:** Degraded trust in staking product. No data risk (read-only display issue).
- **Scope:** Single hook (`useYieldData.ts`) and its ABI type handling.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/yield/useYieldData.ts:31` | `fetchProtocolData` | `lastTimestamp.toNumber()` crashes when ethers.js returns `uint40` as plain JS `number` |
| `src/abis/StakedXCN.ts:71` | ABI definition | `getLastUpdateTimestamp` output type is `uint40`, which ethers.js v5 decodes as `number` (not BigNumber) |

### 4.4 Evidence

**Evidence 1: ethers.js v5 returns `uint40` as plain JS number**

ethers.js v5 ABI decoder returns types ≤48 bits (`uint8`..`uint48`) as JavaScript `number`, not `BigNumber`. The `getLastUpdateTimestamp()` function returns `uint40`:

```
$ node -e "..." // using exact app ABI
typeof: number
value: 1772062973
has toNumber: undefined
toNumber() error: val.toNumber is not a function
```

**Evidence 2: The crash kills the entire dispatch**

`src/hooks/yield/useYieldData.ts:17-34`:
```typescript
const [totalSupply, cumulativeIndex, rewardRate, feePercent, lastTimestamp, isPaused] =
  await Promise.all([...]);  // ✅ All 6 calls succeed
dispatch(yieldActions.setProtocolData({
  totalSupply: totalSupply.toString(),          // ✅
  rewardRateRay: rewardRate.toString(),         // ✅
  feePercentBps: feePercent.toNumber(),         // ✅ (uint256 → BigNumber)
  cumulativeIndex: cumulativeIndex.toString(),  // ✅
  lastUpdateTimestamp: lastTimestamp.toNumber(), // 💥 CRASH — lastTimestamp is number, not BigNumber
  isPaused,                                     // never reached
}));
```

The `Promise.all` succeeds (all RPC calls return valid data), but the crash occurs when building the dispatch payload. The `catch` block runs, retries once (same crash), then sets a generic error. All protocol values (`totalSupply`, `rewardRateRay`, `feePercentBps`) remain `null` in Redux.

**Evidence 3: RPC calls all succeed**

Verified via curl with correct function selectors:
```
totalSupply()            → 155013598910938952062
getRewardRate()          → 278000000000000000000000000
getFeePercent()          → 1000
getLastUpdateTimestamp() → 1772062973
getCumulativeIndex()     → 1001415091567888663153940888
paused()                 → false
```

**Evidence 4: Layout fix is already in place**

`ProtocolStats` is rendered outside gate conditionals (confirmed by passing visibility tests: `FE-UT-040` through `FE-UT-044`). The component IS mounted — it just receives `null` values and displays `--`.

### 4.5 Tasks

List of task files generated to solve the issue:
- `.memory-bank/tasks/2026-02-26-yield-protocol-data-uint40-crash/task-001-add-uint40-crash-test.md`
- `.memory-bank/tasks/2026-02-26-yield-protocol-data-uint40-crash/task-002-fix-uint40-handling-in-fetchProtocolData.md`
- `.memory-bank/tasks/2026-02-26-yield-protocol-data-uint40-crash/task-003-regression-validation.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

`fetchProtocolData()` crashes because `getLastUpdateTimestamp()` returns `uint40` which ethers.js v5 decodes as a plain JS `number`, but the code calls `.toNumber()` on it — a BigNumber-only method.

### 5.2 Supporting Evidence

- ethers.js v5 ABI decoder returns `number` for types ≤48 bits; `uint40` is 40 bits.
- Node.js verification confirms: `typeof getLastUpdateTimestamp() === 'number'`, and `.toNumber()` throws `TypeError`.
- All other contract calls succeed (verified via curl and ethers.js).
- The crash occurs in the `try` block AFTER `Promise.all` resolves, in the dispatch payload construction.
- Error is caught, retried once (same crash), then generic error is set. Protocol data stays `null`.

### 5.3 Gaps / Items to Verify

- TO VERIFY: Check browser console on live deployment for `Failed to fetch protocol data: TypeError: lastTimestamp.toNumber is not a function`
  - Open browser DevTools → Console → navigate to `/yield`
  - Expected: error appears every 30 seconds (polling interval)

### 5.4 Root Cause (final)

- **Root cause:** ethers.js v5 type coercion for `uint40` returns `number`, not `BigNumber`. The code assumes BigNumber and calls `.toNumber()`, which crashes, preventing all protocol data from being stored in Redux.
- **Contributing factors:** No integration test covering the actual ABI return types; `feePercent` (declared `uint256`) happens to work because ethers returns BigNumber for it; the `uint40` type was likely chosen for gas optimization in the contract but creates this frontend incompatibility.

---

## 6) SOLUTIONS (compare options)

### Option A - Cast `lastTimestamp` to Number safely

**Changes required**
- `src/hooks/yield/useYieldData.ts:31` — Replace `lastTimestamp.toNumber()` with `Number(lastTimestamp)`, which works for both `number` and `BigNumber` values.

**Pros**
- One-line fix, minimal risk
- `Number()` works on both JS `number` and ethers `BigNumber` (BigNumber has `valueOf()`)
- No ABI changes needed

**Cons / risks**
- Doesn't address the conceptual mismatch (other `uint40`-type returns could have the same issue)
- `Number()` on BigNumber is technically unsafe for values > `Number.MAX_SAFE_INTEGER`, but `uint40` max is 1,099,511,627,775 which is well within safe range

**Complexity:** Low
**Rollback:** Easy

---

### Option B - Change ABI return type from `uint40` to `uint256` (recommended)

**Changes required**
- `src/abis/StakedXCN.ts:72` — Change `getLastUpdateTimestamp` output type from `uint40` to `uint256` so ethers.js always returns BigNumber.
- No contract changes needed — ABI types for decoding don't need to exactly match the storage type; `uint256` decodes the same slot correctly.

**Pros**
- Consistent type handling: all contract return values are BigNumber
- `.toNumber()` call in `fetchProtocolData` works as expected
- Eliminates the root cause class (ethers.js small-uint type coercion)
- No behavioral changes — `uint256` and `uint40` decode identically from the same ABI-encoded slot

**Cons / risks**
- Minor ABI divergence from on-chain contract declaration (documentation concern, not functional)

**Complexity:** Low
**Rollback:** Easy

---

### Decision

**Chosen option:** B
**Justification:** Changing the ABI type to `uint256` eliminates the entire class of ethers.js small-uint coercion issues. It's equally simple as Option A but prevents future developers from encountering the same trap. All other ABI return types already use `uint256`, so this makes the ABI consistent.
**Accepted tradeoffs:** Minor ABI documentation divergence from on-chain `uint40` declaration.

---

## 7) DELIVERABLES

- [ ] Code changes: `src/abis/StakedXCN.ts` (ABI type change), optionally `src/hooks/yield/useYieldData.ts` (defensive cast)
- [ ] Tests: `src/__tests__/yield/useYieldData.test.ts` (verify protocol data loads with uint40 return)
- [ ] Config changes: none
- [ ] Documentation: this issue report
- [ ] Deployment: frontend deploy required
- [ ] Monitoring/alerts: check browser console post-deploy for protocol data errors

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/useYieldData.test.ts`
- **Run command:** `npm test -- --watchAll=false --runInBand src/__tests__/yield/useYieldData.test.ts`
- **Framework:** Jest

### 8.2 Required Tests

**Unit tests**
- [ ] `fetchProtocolData` dispatches `setProtocolData` when `getLastUpdateTimestamp` returns a plain number (uint40 behavior)
- [ ] `fetchProtocolData` dispatches `setProtocolData` when `getLastUpdateTimestamp` returns a BigNumber (uint256 behavior)
- [ ] `fetchProtocolData` handles RPC failure gracefully (existing error path still works)

**Integration tests (if applicable)**
- [ ] N/A

**E2E tests (if applicable)**
- [ ] Manual: Navigate to `/yield`, confirm `Total Staked` and `Net APY` display actual values

### 8.3 Baseline

- Test run before fix: Yield suite passes (5 suites / 33 tests), but no test exercises actual contract return type handling.
- Visibility tests pass (`FE-UT-040` through `FE-UT-044`).

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state.
   - **Command:** `git status --short`
   - **Expected output:** Current modified/untracked files.
   - **Failure modes:** Not in git repo.
   - **Rollback:** N/A (read-only).
2. Run existing Yield tests.
   - **Command:** `npm test -- --watchAll=false --runInBand src/__tests__/yield/`
   - **Expected output:** All existing tests pass.
   - **Failure modes:** Test dependency issues.
   - **Rollback:** N/A (read-only).

### Phase 1 - Backup / Safety

1. Ensure working branch.
   - **Command:** `git checkout -b fix/yield-uint40-crash` (or continue on current branch)
   - **Expected output:** Branch created or already on working branch.
   - **Failure modes:** Uncommitted changes conflict.
   - **Rollback:** `git checkout <previous-branch>`.

### Phase 2 - Write Tests First

1. Add test for uint40 return type handling.
   - **File:** `src/__tests__/yield/useYieldData.test.ts`
   - **Test:** Mock contract where `getLastUpdateTimestamp()` returns a plain JS number (not BigNumber). Verify `setProtocolData` is dispatched with correct `lastUpdateTimestamp` value.
   - **Run:** `npm test -- --watchAll=false --runInBand src/__tests__/yield/useYieldData.test.ts`
   - **Expected:** FAIL before fix (toNumber crash).

### Phase 3 - Implement the Fix

1. Change ABI return type for `getLastUpdateTimestamp`.
   - **File:** `src/abis/StakedXCN.ts:72`
   - **Change:** `{ name: '', type: 'uint40' }` → `{ name: '', type: 'uint256' }`
   - **Build:** `npm run build`
   - **Expected:** Build succeeds.
   - **Verify:** Run Node.js verification script with updated ABI.
   - **Rollback:** `git checkout -- src/abis/StakedXCN.ts`

2. (Optional defensive hardening) Add safe cast in fetchProtocolData.
   - **File:** `src/hooks/yield/useYieldData.ts:31`
   - **Change:** `lastUpdateTimestamp: lastTimestamp.toNumber()` → `lastUpdateTimestamp: typeof lastTimestamp === 'number' ? lastTimestamp : lastTimestamp.toNumber()`
   - **Build:** `npm run build`
   - **Expected:** Build succeeds.
   - **Rollback:** `git checkout -- src/hooks/yield/useYieldData.ts`

### Phase 4 - Validate

1. Run new test.
   - **Command:** `npm test -- --watchAll=false --runInBand src/__tests__/yield/useYieldData.test.ts`
   - **Expected:** PASS.
2. Run full Yield test suite.
   - **Command:** `npm test -- --watchAll=false --runInBand src/__tests__/yield/`
   - **Expected:** All tests pass (existing + new).
3. Build.
   - **Command:** `npm run build`
   - **Expected:** Build succeeds, no type errors.

### Phase 5 - Deploy (if applicable)

1. Deploy frontend through standard CoolSwap release process.
2. Post-deploy verification:
   - Navigate to `/yield` (disconnected → should see stats values, not `--`).
   - Connect wallet on Goliath → confirm stats + staking controls.
   - Check browser console for absence of `Failed to fetch protocol data` errors.

### Phase 6 - Rollback Plan

**Triggers:** ProtocolStats still shows `--`, or new rendering/data regressions.
**Procedure:**
- Code: `git revert <fix-commit-sha>`
- Deployment: redeploy previous frontend version
- Contract: N/A (no contract changes)

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing functionality
- [ ] Code review completed (or self-reviewed)
- [ ] Deployed and verified (if applicable)
- [ ] Monitoring shows healthy state (if applicable)

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-26 | Inspected Yield page layout | Success | ProtocolStats rendered outside gates (layout fix already applied) |
| 2026-02-26 | Tested RPC calls via curl | Success | All 6 contract methods return valid data |
| 2026-02-26 | Tested ethers.js contract calls | Partial | 5/6 succeed; `getLastUpdateTimestamp().toNumber()` crashes |
| 2026-02-26 | Verified uint40 return type | Success | ethers.js v5 returns `number` (not BigNumber) for uint40 |
| 2026-02-26 | Confirmed root cause | Success | `.toNumber()` on plain number throws TypeError, crashing entire fetchProtocolData |

### Failed Attempts

- None. Root cause identified on first investigation pass.

### Final State

- Changes made (diff summary): Report-only mode; no source code modified.
- Tests passing: Existing Yield tests pass (5 suites, 33 tests + 5 visibility tests).
- Deployment status: Not deployed.
- Remaining risks / follow-ups: Until ABI type is corrected, all protocol stats will remain as `--`.

---

## 12) FOLLOW-UPS

- [ ] Audit other ABI definitions for small uint types (uint8..uint48) that may hit the same ethers.js coercion
- [ ] Consider adding an integration test that calls the actual contract (or realistic mock) to catch type mismatches
- [ ] Update the 2026-02-25 issue doc to reference this as the true root cause (layout was already fixed)
- [ ] Monitor browser console post-deploy for `Failed to fetch protocol data` errors
