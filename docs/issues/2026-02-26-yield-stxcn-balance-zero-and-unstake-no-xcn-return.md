# Yield Tab: stXCN Balance Shows 0 & User Reports No XCN Returned After Unstaking

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend rebuild + deploy)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `docs/issues/2026-02-25-yield-xcn-balance-double-scaled-after-rpc-18dec.md`
- `docs/issues/2026-02-25-yield-xcn-balance-8dec-treated-as-18dec.md`
- `docs/issues/2026-02-25-yield-total-staked-net-apy-not-displayed.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The Yield tab correctly displays the user's stXCN balance read from the StakedXCN contract, and after unstaking, the returned native XCN is reflected in the user's displayed balance.

**Must-have outcomes**

- [ ] stXCN balance on the Yield tab matches `contract.balanceOf(account)` for connected users
- [ ] After a successful unstake, the user's XCN balance visibly increases
- [ ] Balance reads use resilient RPC connectivity with error surfacing (not silent swallowing)

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `useYieldData` dispatches non-null `userBalance` when contract read succeeds
- [ ] Test B: `useYieldData` surfaces a user-visible error when the Goliath RPC is unreachable (instead of showing 0)
- [ ] Test C: AnimatedBalance displays the formatted stXCN amount (not "0.000000") when `userBalance` is a valid 18-dec string
- [ ] Test D: After unstake tx confirmation, `refetch()` is called to update both stXCN and XCN balances

**Non-goals**

- Changing the StakedXCN smart contract (on-chain logic is correct)
- Fixing the Blockscout internal transaction tracing (explorer-side issue)
- Modifying the JSON-RPC relay's wei/tinybar conversion

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, ethers.js v5, Redux Toolkit
- **Entry point:** `src/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

### Deployment Details

- **RPC endpoint:** `https://rpc.testnet.goliath.net` (Goliath Testnet, chain 8901)
- **StakedXCN contract:** `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE`
- **Explorer:** `https://testnet.explorer.goliath.net`

### Decimal Model (confirmed from wXCN + StakedXCN contracts)

| Layer | Decimals | Term | Example (50 XCN) |
|-------|----------|------|-------------------|
| EVM native (`msg.value`, `address.balance`) | 8 | tinyXCN | `5,000,000,000` |
| RPC response (`eth_getBalance`, multicall3) | 18 | wei (simulated) | `50,000,000,000,000,000,000` |
| stXCN token (`balanceOf`) | 18 | WAD | `50,000,000,000,000,000,000` |
| Interest index (`getCumulativeIndex`) | 27 | RAY | `1,001,397,398,258,535,803,702,731,192` |
| Scaling factor (NATIVE_SCALE) | -- | -- | `10,000,000,000` (1e10) |

The JSON-RPC relay transparently converts between 8-dec (EVM) and 18-dec (RPC) for both reads and writes. The StakedXCN contract handles the 8↔18 conversion internally using `NATIVE_SCALE = 1e10`.

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [x] Do NOT delete `.pces` files
- [x] Do NOT flush iptables on remote servers
- [x] Do NOT expose private keys or secrets
- [x] Do NOT modify the StakedXCN contract

### Code Change Constraints

- [x] All changes must pass existing tests
- [x] New functionality must include tests
- [x] Frontend-only changes — no smart contract modifications

### Operational Constraints

- Allowed downtime: None (frontend redeploy is seamless)
- Blast radius: Yield tab only

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

**Symptom A — AnimatedBalance shows "0.000000 stXCN" but UnstakeForm shows correct balance:**
User `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` has stXCN on-chain. The UnstakeForm correctly displays "Balance: 150.0037 stXCN", but the main AnimatedBalance header shows "Your stXCN Balance: 0.000000 stXCN". This proves `userBalance` IS populated in Redux — the bug is isolated to the `useAnimatedBalance` hook receiving null `rewardRateRay` or `feePercentBps` from a failed `fetchProtocolData()`.

**Symptom B — "Didn't get 50 XCN back" after unstaking:**
User submitted `unstake(50000000000000000000)` (50 stXCN). Transaction succeeded (tx `0x7a2121d0...`), 50 stXCN was burned, Unstaked event emitted with `xcnReturned = 50e18`, but user reports not seeing the 50 XCN in their balance.

### 4.2 Impact

- **User impact:** Users cannot see their stXCN balance, making the Yield tab appear broken. Users believe unstaking does not return XCN, eroding trust.
- **System impact:** Core staking UX is broken. Users cannot make informed staking/unstaking decisions.
- **Scope:** Yield tab balance display and post-transaction refresh.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/yield/useAnimatedBalance.ts:20` | `useAnimatedBalance` | **PRIMARY BUG**: Shows "0.000000" when `rewardRateRay` is null or `feePercentBps` is null, even when `balance` IS available. Should fall back to static balance display. |
| `src/hooks/yield/useYieldData.ts:14-37` | `fetchProtocolData` | Makes 6 concurrent contract calls in `Promise.all`; if any fails, ALL protocol data stays null (rewardRateRay, feePercentBps). Error is caught and logged to console only — no Redux error dispatch. |
| `src/hooks/yield/useUnstake.ts:18-41` | `unstake` | No `refetch()` call after successful unstake to refresh balances |
| `src/services/bridgeProviders.ts:162-171` | `getGoliathProvider` | No validation, no retry, no fallback (unlike Sepolia provider) — underlying cause of `fetchProtocolData` failures |

### 4.4 Evidence

**On-chain transaction analysis (tx 0x7a2121d0...):**

```
Block:           947,855
Status:          Success
From:            0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d
To:              0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE (StakedXCN)
Method:          unstake(uint256)
Input:           50,000,000,000,000,000,000 (50 stXCN, 18-dec)

Events emitted:
  1. RewardsAccrued  → newIndex = 1,001,397,398,258,535,803,702,731,192
  2. FeeCollected    → treasury receives 0.000382 stXCN (fee accrual)
  3. Transfer (mint) → 382,489,187,570,258 stXCN to treasury
  4. Unstaked        → stXCNBurned = 50e18, xcnReturned = 50e18
  5. Transfer (burn) → 50e18 stXCN burned from user

Internal transactions: EMPTY (explorer does not trace Goliath native transfers)
```

**Contract logic verification** (`StakedXCN.sol:145-189`):
```solidity
// Line 169: xcnToReturnWad = stXCNAmount = 50e18
// Line 172: tinyXCNToReturn = 50e18 / NATIVE_SCALE = 50e18 / 1e10 = 5e9
// Line 188: msg.sender.call{value: 5e9}("") → transfers 50 XCN (in tinyXCN)
// Transaction did NOT revert → transfer succeeded
```

**Conclusion:** The on-chain unstake is correct. 50 XCN (5e9 tinyXCN) was transferred to the user. The issue is purely a **frontend display problem**.

**Frontend flow analysis — why AnimatedBalance shows 0 while UnstakeForm is correct:**

The user confirmed: UnstakeForm shows "Balance: 150.0037 stXCN" (correct), but AnimatedBalance shows "0.000000 stXCN". Both read from the same Redux selector (`selectUserBalance`). This proves `userBalance` IS populated.

The difference: `UnstakeForm` only uses `stXCNBalance` (which is `userBalance`), while `AnimatedBalance` passes it through `useAnimatedBalance(balance, rewardRateRay, feePercentBps)` which checks ALL three params:

```
useAnimatedBalance.ts line 20:
  if (!balance || balance === '0' || !rewardRateRay || feePercentBps === null) {
      setDisplayValue('0.000000');  ← THIS IS THE BUG
  }
```

Root flow:
```
fetchProtocolData() → 6 concurrent calls via Promise.all
  ↓
One or more calls fail (Goliath RPC rate-limiting or timeout)
  ↓
ENTIRE Promise.all rejects → caught at line 34 → console.error only
  ↓
rewardRateRay stays null, feePercentBps stays null (Redux initial state)
  ↓
useAnimatedBalance(balance="150003...", rewardRateRay=null, feePercentBps=null)
  ↓
!rewardRateRay → true → setDisplayValue('0.000000')
  ↓
UI: "Your stXCN Balance: 0.000000 stXCN"

Meanwhile:
fetchUserData() → only 2 calls (balanceOf, scaledBalanceOf) → SUCCEEDS
  ↓
userBalance = "150003700000000000000" (populated in Redux)
  ↓
UnstakeForm reads selectUserBalance → formatTokenAmount() → "150.0037 stXCN" ✓
```

The Goliath read-only provider (unlike Sepolia's) has:
- No validation on creation
- No timeout handling
- No retry/fallback logic
- Silent failure mode (catch → console.error only)

The 6-call `fetchProtocolData` batch is more likely to fail than the 2-call `fetchUserData` batch when the RPC is under load.

### 4.5 Tasks

- `task-001-animated-balance-static-fallback.md` — Fix primary bug: show static balance when animation params missing
- `task-002-protocol-data-fetch-resilience.md` — Make fetchProtocolData more resilient (retry, error dispatch)
- `task-003-goliath-provider-validation.md` — Add Goliath provider validation/timeout/fallback
- `task-004-post-unstake-balance-refresh.md` — Call refetch() after successful unstake

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The AnimatedBalance component displays "0.000000" because `fetchProtocolData()` fails (6 concurrent RPC calls in a single `Promise.all` batch), leaving `rewardRateRay` and `feePercentBps` at their initial `null` values. The `useAnimatedBalance` hook treats missing animation parameters as a "show zero" condition rather than falling back to a static balance display. User data fetching (2 calls) succeeds, which is why UnstakeForm shows the correct balance.

### 5.2 Supporting Evidence

1. **User confirmation: UnstakeForm shows 150.0037 stXCN, AnimatedBalance shows 0.000000** — Both read from the same Redux selector (`selectUserBalance`). The difference is `useAnimatedBalance` also requires `rewardRateRay` and `feePercentBps` to display anything.

2. **`useAnimatedBalance` conflates "missing params" with "zero balance"** — `useAnimatedBalance.ts:20`: The condition `!rewardRateRay || feePercentBps === null` triggers the same "0.000000" display as `!balance`. A valid balance with missing animation params should display as a static number, not zero.

3. **`fetchProtocolData` is a fragile 6-call batch** — `useYieldData.ts:17-23`: Uses `Promise.all([totalSupply, cumulativeIndex, rewardRate, feePercent, lastTimestamp, paused])`. If any single call fails, ALL protocol data stays null. No retry logic.

4. **Silent failure path** — `useYieldData.ts:34-36`: `catch (err) { console.error(...) }` swallows the error without dispatching any error state to Redux.

5. **Goliath provider has no resilience** — `bridgeProviders.ts:162-171`: `getGoliathProvider()` does zero validation (unlike `validateSepoliaProvider()` at line 82 which validates, retries, and falls back).

6. **No post-unstake refresh** — `useUnstake.ts:28-33`: After `await tx.wait()`, the hook clears the input and closes the modal but does NOT call `refetch()` from `useYieldData` to update balances.

7. **Write path works** — User successfully submitted `unstake(50e18)` via wallet signer provider. Contract is deployed and functional. Only the read path is unreliable.

### 5.3 Gaps / Items to Verify

- TO VERIFY: Check browser console for `"Failed to fetch user data"` or `"Failed to fetch protocol data"` errors to confirm the RPC is failing.
- TO VERIFY: Test the read-only Goliath RPC directly:
  ```bash
  curl -X POST https://rpc.testnet.goliath.net -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE","data":"0x70a082310000000000000000000000000xe3596d206be5DE55bA8D774F131d9E3f31FaA78d"},"latest"],"id":1}'
  ```
  Expected: non-zero result (user's stXCN balance in hex).
- TO VERIFY: Check if the Goliath RPC URL is reachable and responsive from the deployment environment.

### 5.4 Root Cause (final)

- **Root cause:** `useAnimatedBalance.ts:20` treats missing protocol data (`rewardRateRay === null || feePercentBps === null`) identically to a zero balance, displaying "0.000000" even when the user's balance IS available. The protocol data is null because `fetchProtocolData()` fails silently — its 6-call `Promise.all` batch is fragile against Goliath RPC instability.
- **Contributing factors:**
  - `useAnimatedBalance` conflates "can't animate" with "balance is zero" — should fall back to static display.
  - `fetchProtocolData` has no retry logic and fails atomically (all-or-nothing).
  - Goliath provider has no validation, timeout, or fallback (asymmetric with Sepolia).
  - `fetchProtocolData` error is caught and logged to console only — no Redux error dispatch.
  - No post-unstake `refetch()` call to update balances after transaction.

---

## 6) SOLUTIONS (compare options)

### Option A — Add Goliath Provider Resilience + Error Surfacing + Post-Tx Refresh

**Changes required:**
1. `src/services/bridgeProviders.ts` — Add Goliath provider validation with configurable timeout and an optional fallback RPC URL.
2. `src/hooks/yield/useYieldData.ts` — Dispatch an error state to Redux when contract reads fail; return `refetch` function.
3. `src/hooks/yield/useUnstake.ts` — Accept and call `refetch()` after successful unstake.
4. `src/pages/Yield/index.tsx` — Pass `refetch` from `useYieldData` to unstake handler.
5. `src/pages/Yield/AnimatedBalance.tsx` — Show loading spinner or error state instead of "0.000000" when balance is null and not in error.

**Pros**
- Fixes both symptoms (stXCN=0 and no-XCN-after-unstake)
- Adds visibility into RPC failures
- Patterns already proven by Sepolia provider implementation

**Cons / risks**
- Requires adding a Goliath fallback RPC URL env var (or using wallet provider as fallback)
- Moderate number of file changes

**Complexity:** Medium
**Rollback:** Easy (`git revert`)

---

### Option B — Use Wallet Provider for Balance Reads When Available

**Changes required:**
1. `src/hooks/yield/useYieldData.ts` — When wallet is connected to chain 8901, use the wallet provider for `balanceOf` instead of the read-only provider.
2. `src/hooks/yield/useUnstake.ts` — Call `refetch()` after unstake.
3. `src/pages/Yield/AnimatedBalance.tsx` — Show loading/error state.

**Pros**
- Simpler change (fewer files)
- Uses the same provider that writes work on (proven working)
- No new env vars needed

**Cons / risks**
- Balance reads would fail when wallet is on a different chain (breaks cross-chain visibility that the read-only provider was designed to solve)
- Doesn't fix the underlying Goliath provider resilience problem for other consumers

**Complexity:** Low
**Rollback:** Easy (`git revert`)

---

### Decision

**Chosen option:** Option A — Add Goliath Provider Resilience + Error Surfacing + Post-Tx Refresh

**Justification:** Option A fixes the root cause (unresilient Goliath provider) rather than working around it. The pattern is already proven by the Sepolia provider implementation. It also adds error surfacing to the UI, preventing silent failures from confusing users in the future.

**Accepted tradeoffs:** Slightly more code changes, but all follow existing patterns in the codebase.

---

## 7) DELIVERABLES

- [ ] Code changes: `bridgeProviders.ts`, `useYieldData.ts`, `useUnstake.ts`, `index.tsx` (Yield), `AnimatedBalance.tsx`
- [ ] Tests: New/updated tests for Goliath provider validation, useYieldData error dispatch, post-unstake refresh
- [ ] Config changes: Optional `REACT_APP_GOLIATH_RPC_URL_FALLBACK` env var
- [ ] Documentation: None
- [ ] Deployment: Frontend rebuild + deploy
- [ ] Monitoring: Console error logs for Goliath RPC failures

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/`
- **Run command:** `npm test -- --watchAll=false`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `useYieldData` dispatches `setUserData` with correct balance when contract read succeeds
- [ ] `useYieldData` dispatches error state when contract read throws
- [ ] `useAnimatedBalance` displays "0.000000" only when balance is explicitly "0", not when null
- [ ] `useAnimatedBalance` returns a loading/error indicator when balance is null
- [ ] `useUnstake` calls `refetch()` after successful `tx.wait()`
- [ ] `formatTokenAmount` handles null, "0", and valid 18-dec strings correctly

**Integration tests (if applicable)**
- [ ] Yield page shows stXCN balance when `useYieldData` returns valid data
- [ ] Yield page shows error banner when Goliath RPC is unreachable
- [ ] After unstake, balance display refreshes

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — verify clean working directory
2. `npm ci` — ensure dependencies are installed
3. `npm test -- --watchAll=false` — baseline test run
4. `git checkout -b fix/yield-stxcn-balance-zero`

### Phase 1 — Write Tests First

**Step 1:** Write test for `useYieldData` error dispatch
- File: `src/__tests__/yield/useYieldData.test.ts`
- Expected: FAIL (error dispatch not implemented yet)

**Step 2:** Write test for `useAnimatedBalance` null vs zero handling
- File: `src/__tests__/yield/useAnimatedBalance.test.ts`
- Expected: FAIL (null currently displays as "0.000000")

**Step 3:** Write test for `useUnstake` refetch
- File: `src/__tests__/yield/useUnstake.test.ts`
- Expected: FAIL (refetch not called yet)

### Phase 2 — Implement the Fix

**Step 4:** Add Goliath provider timeout and validation
- File: `src/services/bridgeProviders.ts`
- Add `validateGoliathProvider()` similar to `validateSepoliaProvider()` with configurable timeout
- Add optional fallback RPC URL via `REACT_APP_GOLIATH_RPC_URL_FALLBACK` env var
- Rollback: `git checkout -- src/services/bridgeProviders.ts`

**Step 5:** Add error dispatch to `useYieldData`
- File: `src/hooks/yield/useYieldData.ts`
- In the `catch` block of `fetchUserData`, dispatch `yieldActions.setError(...)` with a user-friendly message
- Add `isBalanceLoading` state to distinguish "loading" from "zero balance"
- Return `refetch` function
- Rollback: `git checkout -- src/hooks/yield/useYieldData.ts`

**Step 6:** Add `refetch` call to `useUnstake`
- File: `src/hooks/yield/useUnstake.ts`
- Accept `refetch: () => void` parameter
- Call `refetch()` after `await tx.wait()` and before clearing input
- Rollback: `git checkout -- src/hooks/yield/useUnstake.ts`

**Step 7:** Wire `refetch` through Yield page
- File: `src/pages/Yield/index.tsx`
- Pass `refetch` from `useYieldData()` to the unstake handler
- Rollback: `git checkout -- src/pages/Yield/index.tsx`

**Step 8:** Add loading/error state to AnimatedBalance
- File: `src/pages/Yield/AnimatedBalance.tsx`
- Show a loading skeleton when `balance` is null and no error
- Show error indicator when balance read failed
- Rollback: `git checkout -- src/pages/Yield/AnimatedBalance.tsx`

### Phase 3 — Validate

1. Run full test suite: `npm test -- --watchAll=false`
2. Run type check: `npx tsc --noEmit`
3. Run linter: `npm run lint` (if available)
4. Build: `npm run build`
5. Manual verification: Open Yield tab, verify stXCN balance displays correctly

### Phase 4 — Deploy

1. Deploy frontend build
2. Verify on testnet with user address `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`

### Phase 5 — Rollback Plan

**Triggers:** stXCN balance still shows 0, or Yield tab becomes unresponsive
**Procedure:**
- Code: `git revert <commit-sha>`
- Deployment: Redeploy previous build

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing functionality
- [ ] stXCN balance displays correctly for user `0xe3596d...`
- [ ] After unstake, XCN balance updates
- [ ] Error state shows when Goliath RPC is unreachable (not "0.000000")

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Failed Attempts

(None yet — report-only mode)

### Final State

- Changes made: None (report only)
- Tests passing: Baseline TBD
- Deployment status: Not deployed
- Remaining risks: Goliath RPC reliability; Blockscout internal tx tracing gap

---

## 12) FOLLOW-UPS

- [ ] Add Goliath RPC health monitoring/alerting
- [ ] Investigate Blockscout internal transaction tracing for Goliath
- [ ] Audit other hooks that use the Goliath read-only provider for same silent failure pattern
- [ ] Consider adding a "Refresh Balance" button as a manual workaround
- [ ] Add E2E test for stake→unstake→balance flow
