# Yield Tab: XCN Balance Double-Scaled After RPC/Multicall 18-dec Rollout

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** High
**Requires deployment?:** Yes (frontend release)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-yield-xcn-balance-8dec-treated-as-18dec.md`
- https://docs.goliath.net/developer-guide/decimal-handling
- `/Users/alex/goliath/wXCN/contracts/Multicall3.sol`
- `/Users/alex/goliath/wXCN/scripts/deploy-multicall3.ts`
- `/Users/alex/goliath/wXCN/deployments/goliath-multicall3.json`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

Yield uses the same native XCN unit semantics as Swap/Bridge (RPC-facing 18-decimal amounts), so displayed balances and submitted stake values match real wallet values.

**Must-have outcomes**

- [ ] Stake tab balance for `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` displays approximately `130,199.8855 XCN` (not `1,301,998,855,834,300.0 XCN`)
- [ ] `Stake XCN` sends the intended value (no hidden `/10^10` downscale)
- [ ] Swap and Bridge balance behavior remains unchanged

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: Yield native balance from `useCurrencyBalance(..., ETHER)` is treated as 18-dec on chain 8901 (no extra scaling)
- [ ] Test B: `StakeForm` shows `130,199.8855` for raw `130199885583430000000000`
- [ ] Test C: `useStake` sends `{ value: amountWad }` to `contract.stake` for `amountWad = parseUnits("100", 18)`
- [ ] Test D: regression guard proves old behavior would inflate display by exactly `10^10`
- [ ] Test E: existing swap input Max/balance flow still passes current tests

**Non-goals**

- Redeploying router/factory/WXCN/multicall contracts
- Changing bridge amount math
- Forcing a consensus/network-level decimal model change

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React + TypeScript + ethers.js + forked Uniswap SDK
- **Entry point:** `src/pages/Yield/index.tsx` and `src/hooks/yield/useStake.ts`
- **Build command:** `npm run build`
- **Test command:** `CI=true npm test -- --runInBand --watch=false`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A
- **Deployment name:** Frontend static build
- **Docker image:** N/A
- **RPC endpoints:** `https://rpc.testnet.goliath.net`
- **Contract addresses:**
  - StakedXCN proxy: `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE`
  - Multicall3: `0xF912C1ad454aaaE03A1d72C53702F3dc0B4fcb69`
  - Router: `0x1D6B8ad12C72893f89844418DC03999298D9ABF4`
  - WXCN: `0x88A07F7BBb61A2945D8Ac541461fc62efb1F4066`

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: 104.238.187.163 (`lon`)

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

- Allowed downtime: none
- Blast radius: Yield page stake flow, Yield unit tests

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Yield shows wallet balance inflated by `10^10`.
- Reported by user for `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`:
  - UI actual: `Balance: 1,301,998,855,834,300.0 XCN`
  - Expected: `Balance: 130,199.8 XCN`
- Stake transactions from this wallet are being submitted in tiny values (micro fractions of XCN).

### 4.2 Impact

- **User impact:** Incorrect displayed wealth and misleading Max/insufficient logic; users can attempt impossible stake amounts; intended stake amounts get under-sent.
- **System impact:** Financial UX is unreliable; staking principal history becomes misleading for affected tx.
- **Scope:** Yield-only paths in frontend; swap/bridge already aligned to current RPC semantics.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Yield/index.tsx` | `xcnBalance` memo | Applies `normalizeNativeBalanceToWad` on already-18-dec raw balance |
| `src/constants/staking.ts` | `normalizeNativeBalanceToWad` | Hardcoded chain 8901 multiply-by-`10^10` assumption |
| `src/hooks/yield/useStake.ts` | `stake` | Sends `amountWad / 10^10` as tx `value`, causing tiny stake submissions |
| `src/__tests__/yield/xcnBalanceNormalization.test.ts` | normalization suite | Encodes stale assumption that multicall returns 8-dec raw |
| `src/__tests__/yield/utils.test.ts` | FE-UT-011 | Locks stale 8→18 normalization behavior |

### 4.4 Evidence

1) Live RPC and multicall for the affected wallet both return 18-dec raw values:

```text
eth_getBalance raw: 130199885583430000000000
eth_getBalance as 18: 130199.88558343
multicall raw      : 130199885583430000000000
multicall as 18    : 130199.88558343
```

2) Current Yield math multiplies this by `10^10`, reproducing the exact wrong UI number:

```text
raw as 18: 130199.88558343
after normalizeNativeBalanceToWad(raw,8901) as 18: 1301998855834300.0
```

3) On-chain staking events for this user show `xcnAmount == tx.value` in 18-dec terms, and these values are tiny:

```text
event xcnAmount 18: 0.0000001
tx.value raw: 100000000000
tx.value as18: 0.0000001
tx.value as8 : 1000.0
```

This aligns with frontend behavior in `useStake.ts` dividing user input by `10^10` before submission.

4) Swap/bridge consistency evidence:
- Swap path uses `CurrencyAmount.ether` with SDK `Currency.ETHER` configured as 18 decimals in this fork.
- Bridge uses explicit decimal config and `formatUnits(..., config.decimals)` (`config.decimals = 18` for relevant native/RPC-facing flows).

5) `wXCN` evidence that multicall was intentionally updated for RPC-compatible 18-dec output:
- `wXCN/contracts/Multicall3.sol#getEthBalance`: returns `addr.balance * 10^10`
- `wXCN/scripts/deploy-multicall3.ts`: explicitly verifies `getEthBalance` ~= `eth_getBalance`
- Deployment timestamp/address: `wXCN/deployments/goliath-multicall3.json` (`0xF912...`, `2026-02-03`)

### 4.5 Tasks
List of task files generated to solve the issue:
- `.memory-bank/tasks/2026-02-25-yield-xcn-balance-double-scaled-after-rpc-18dec/task-001-add-failing-tests-for-current-18dec-semantics.md`
- `.memory-bank/tasks/2026-02-25-yield-xcn-balance-double-scaled-after-rpc-18dec/task-002-fix-yield-balance-and-stake-value-scaling.md`
- `.memory-bank/tasks/2026-02-25-yield-xcn-balance-double-scaled-after-rpc-18dec/task-003-update-stale-tests-and-decimal-documentation.md`
- `.memory-bank/tasks/2026-02-25-yield-xcn-balance-double-scaled-after-rpc-18dec/task-004-manual-qa-with-reference-wallet-and-regressions.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

Yield implements a legacy 8-dec native-balance model, but chain-facing reads/writes in current production are already 18-dec at RPC boundary, causing double-scaling on read and over-downscaling on stake submit.

### 5.2 Supporting Evidence

- `src/pages/Yield/index.tsx` always calls `normalizeNativeBalanceToWad(raw, chainId)`.
- `src/constants/staking.ts` multiplies by `NATIVE_SCALE = 10^10` when `chainId === 8901`.
- Live balance query for affected wallet already returns 18-dec quantity.
- `src/hooks/yield/useStake.ts` divides by `NATIVE_SCALE` before submitting tx value.
- On-chain events for the same wallet show tiny staked amounts matching this divide-down behavior.
- `wXCN` multicall rollout (2026-02-03) explicitly targeted RPC parity for 18-dec balances.

### 5.3 Gaps / Items to Verify

- Confirm verified source for deployed `StakedXCN` proxy implementation `0xb351e224466F45fe652F7Dfd577dAB7A6717aBfC` matches current runtime behavior.
- TO VERIFY: `cast call --rpc-url https://rpc.testnet.goliath.net 0xF912C1ad454aaaE03A1d72C53702F3dc0B4fcb69 "getEthBalanceRaw(address)(uint256)" 0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`
- TO VERIFY: compare `eth_getTransactionByHash` `value` vs decoded `Staked.xcnAmount` for at least 3 recent stake tx after fix.

### 5.4 Root Cause (final)

- **Root cause:** stale frontend unit assumptions (8-dec raw) survived after chain/multicall moved client-visible balances to 18-dec.
- **Contributing factors:** no integration test asserting wallet balance display against live RPC semantics; tests were updated to validate wrong assumptions and masked regression.

---

## 6) SOLUTIONS (compare options)

### Option A - Frontend unit alignment to RPC 18-dec (chosen)

**Changes required**
- `src/pages/Yield/index.tsx` — stop multiplying `xcnBalance` by `10^10` for chain 8901.
- `src/hooks/yield/useStake.ts` — submit `amountWad` directly as tx `value`.
- `src/constants/staking.ts` — remove or gate `normalizeNativeBalanceToWad` behavior to prevent default chain-8901 scaling.
- `src/__tests__/yield/xcnBalanceNormalization.test.ts` and `src/__tests__/yield/utils.test.ts` — replace stale assumptions with current 18-dec semantics.

**Pros**
- Fast, no contract deployment required.
- Matches working swap/bridge behavior.
- Fixes both UI inflation and tiny-stake submit bug.

**Cons / risks**
- If network semantics change again, hardcoded assumptions can drift again.

**Complexity:** Medium
**Rollback:** Easy

---

### Option B - Contract/network rollback to old 8-dec client semantics

**Changes required**
- Redeploy/reconfigure multicall/router and potentially staking interaction contracts/interfaces to present 8-dec externally.
- Rework swap/bridge/frontend SDK assumptions.

**Pros**
- Makes frontend mirror raw EVM units directly.

**Cons / risks**
- Very high blast radius; likely breaks currently working Swap/Bridge behavior.
- Requires coordinated on-chain deployments and client migrations.
- Unnecessary for this Yield-specific discrepancy.

**Complexity:** High
**Rollback:** Hard

---

### Decision

**Chosen option:** A
**Justification:** The discrepancy is introduced entirely by Yield-side scaling logic that is now out of sync with current RPC/multicall semantics; swap/bridge and deployed DEX contracts are functioning under the current model.
**Accepted tradeoffs:** Keep chain semantics in frontend config/tests and add regression guards to avoid future drift.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `src/pages/Yield/index.tsx`
  - `src/hooks/yield/useStake.ts`
  - `src/constants/staking.ts`
  - `src/pages/Yield/StakeForm.tsx` (if preview precision logic needs update)
- [ ] Tests:
  - `src/__tests__/yield/xcnBalanceNormalization.test.ts`
  - `src/__tests__/yield/utils.test.ts`
  - add a unit test for `useStake` tx value wiring
- [ ] Config changes: none required
- [ ] Documentation:
  - update comments/docs mentioning 8-dec raw multicall return in Yield path
- [ ] Deployment:
  - frontend build/release only
- [ ] Monitoring/alerts:
  - add a smoke check for wallet balance parity vs RPC in QA checklist

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/`
- **Run command:** `CI=true npm test -- --runInBand --watch=false src/__tests__/yield/*`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `xcnBalance` from wallet hook on 8901 is interpreted as 18-dec and displayed correctly
- [ ] `useStake` passes `amountWad` directly as transaction value
- [ ] Regression test that old `* 10^10` balance scaling would fail expectations

**Integration tests (if applicable)**
- [ ] Stake flow with mock contract confirms submitted `tx.value` equals input amount in 18-dec

**E2E tests (if applicable)**
- [ ] Manual wallet test with reference address shows displayed balance matches explorer/RPC human amount

**Contract tests (if smart contract)**
- [ ] N/A (no contract changes in chosen option)

### 8.3 Baseline

- Test run before fix:
  - `CI=true npm test -- --runInBand --watch=false src/__tests__/yield/xcnBalanceNormalization.test.ts`
  - Result: **PASS (16/16)**
  - Interpretation: tests currently validate stale 8-dec assumptions and need rewrite.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state.
   - Command: `git status --short`
   - Expected output: modified/untracked files list.
   - Failure modes: git not available.
   - Rollback: N/A (read-only).
2. Confirm dependency/runtime versions.
   - Command: `node -v && npm -v`
   - Expected output: versions printed.
   - Failure modes: missing node/npm.
   - Rollback: restore previous runtime via version manager.
3. Create branch.
   - Command: `git checkout -b codex/fix-yield-xcn-rpc-18dec`
   - Expected output: switched to new branch.
   - Failure modes: branch exists, dirty constraints.
   - Rollback: `git checkout <previous-branch>`.

### Phase 1 - Backup / Safety

1. No data backup required (frontend-only changes).
   - Command: N/A
   - Expected output: N/A
   - Failure modes: N/A
   - Rollback: git revert/checkout file-level.

### Phase 2 - Write Tests First

1. Rewrite stale unit assumptions in `src/__tests__/yield/xcnBalanceNormalization.test.ts`.
   - Command: `CI=true npm test -- --runInBand --watch=false src/__tests__/yield/xcnBalanceNormalization.test.ts`
   - Expected output: FAIL before implementation.
   - Failure modes: unrelated test infra errors.
   - Rollback: `git checkout -- src/__tests__/yield/xcnBalanceNormalization.test.ts`.
2. Add `useStake` tx value wiring test.
   - Command: `CI=true npm test -- --runInBand --watch=false src/__tests__/yield/useStakeValue.test.ts`
   - Expected output: FAIL before implementation.
   - Failure modes: hook mocking errors.
   - Rollback: `git checkout -- src/__tests__/yield/useStakeValue.test.ts`.

### Phase 3 - Implement the Fix

1. Remove extra balance scaling in Yield page.
   - File: `src/pages/Yield/index.tsx`
   - Change: pass through raw balance (18-dec) from `useCurrencyBalance`.
   - Build: `npm run build`
   - Expected: build succeeds.
   - Verify: displayed balance matches `ethers.utils.formatUnits(raw, 18)`.
   - Rollback: `git checkout -- src/pages/Yield/index.tsx`.
2. Remove tx value downscaling in stake hook.
   - File: `src/hooks/yield/useStake.ts`
   - Change: send `{ value: amountWad }` instead of dividing by `NATIVE_SCALE`.
   - Build: `npm run build`
   - Expected: build succeeds.
   - Verify: stake tx value equals parsed input amount.
   - Rollback: `git checkout -- src/hooks/yield/useStake.ts`.
3. Clean/update stale constants/comments.
   - File: `src/constants/staking.ts`
   - Change: avoid unconditional 8901 `*10^10` conversion in frontend runtime path.
   - Build: `npm run build`
   - Expected: build succeeds.
   - Verify: no imports rely on removed behavior unexpectedly.
   - Rollback: `git checkout -- src/constants/staking.ts`.

### Phase 4 - Validate

1. Run focused Yield tests.
   - Command: `CI=true npm test -- --runInBand --watch=false src/__tests__/yield`
   - Expected output: all pass.
   - Failure modes: stale mocks, changed assumptions.
   - Rollback: revert last change set and re-run.
2. Run build.
   - Command: `npm run build`
   - Expected output: successful optimized build.
   - Failure modes: TS/lint errors from refactor.
   - Rollback: checkout affected files.
3. Manual verification.
   - Steps: connect wallet on 8901, open Yield, verify balance and stake 1 XCN / 100 XCN values.
   - Expected: displayed balance ~= RPC balance; tx value and event amounts align with input scale.
   - Failure modes: wallet cache or stale chain data.
   - Rollback: redeploy prior frontend bundle.

### Phase 5 - Deploy (if applicable)

1. Publish frontend build via normal release pipeline.
2. Post-deploy verification on reference wallet.
3. Monitor support and tx/event telemetry for 30 minutes.

### Phase 6 - Rollback Plan

**Triggers:** balance still inflated, or stake tx values remain unexpectedly tiny.
**Procedure:**
- Code: revert frontend commit(s) and redeploy previous build.
- Deployment: restore prior static artifact/version.
- Contract: no contract rollback required for chosen option.

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in Swap/Bridge balance behavior
- [ ] Code review completed (or self-reviewed)
- [ ] Deployed and verified (if applicable)
- [ ] Monitoring shows healthy state (if applicable)

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 22:03 | Queried `eth_getBalance` and multicall `getEthBalance` for affected wallet | Success | Both returned `130199885583430000000000` (18-dec semantics) |
| 2026-02-25 22:05 | Reproduced Yield normalization math with current raw value | Success | Produced `1301998855834300.0`, exactly matching reported wrong UI scale |
| 2026-02-25 22:08 | Queried recent `Staked` events + tx values for affected wallet | Success | Observed tiny stake amounts where event `xcnAmount == tx.value` |
| 2026-02-25 22:09 | Ran current normalization test suite | Success | Suite passes, confirming tests encode stale assumptions |

### Failed Attempts

- Attempt 1: Query `eth_getLogs` over a very large block range.
  - Why it failed: RPC enforces max 7-day timestamp window.
  - What we learned: use narrower block windows for event evidence.

### Final State

- Changes made (diff summary): Report-only; no code changes.
- Tests passing: Baseline normalization suite currently passing but semantically stale.
- Deployment status: Not applicable.
- Remaining risks / follow-ups: stale 8-dec assumptions may exist in other Yield comments/utilities and should be audited.

---

## 12) FOLLOW-UPS

- [ ] Add/update tests for edge cases (unit drift between RPC and contract comments)
- [ ] Update Yield decimal comments to reflect current runtime semantics
- [ ] Add monitoring/smoke check for balance parity vs RPC on reference wallet
- [ ] Audit other native-XCN flows for stale `NATIVE_SCALE` usage
