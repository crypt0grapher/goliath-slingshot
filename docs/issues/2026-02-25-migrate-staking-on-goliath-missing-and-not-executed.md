# Migration: "Staking on Goliath" Step Disappears and Tokens Are Not Staked

**Project:** CoolSwap-interface
**Type:** Code Bug + Feature
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend only)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-yield-total-staked-net-apy-not-displayed.md`
- `docs/issues/2026-02-25-migrate-missing-completion-feedback-and-history.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

After a bridge COMPLETED status is reached, the "Staking on Goliath" step remains visible in the Migration Status panel and the frontend executes an on-chain staking transaction on Goliath (reusing the Yield tab's `stakedXCN.stake()` contract call), so tokens are actually staked — not just minted.

**Must-have outcomes**

- [ ] "Staking on Goliath" step never disappears from the MigrationStatusPanel when `stakeOnGoliath` was opted
- [ ] `operation.stakeOnGoliath` is persisted correctly in Redux (both on initial bridge and on resume from localStorage)
- [ ] After bridge COMPLETED, the frontend prompts the user to switch to Goliath network if needed
- [ ] The frontend calls `stakedXCN.stake({ value: mintedAmount })` on the Goliath StakedXCN contract (same contract as Yield tab)
- [ ] Staking transaction progress is tracked and displayed in the "Staking on Goliath" step
- [ ] On staking success, `stakingTxHash` is stored in the operation and the step shows as completed
- [ ] On staking failure/rejection, the step shows an error state with retry capability

**Acceptance criteria (TDD)**

- [ ] Test A: `operation.stakeOnGoliath` is `true` in Redux after `setOperation` dispatch during bridge execution
- [ ] Test B: `operation.stakeOnGoliath` is `true` in Redux after resume from localStorage (when it was `true` in persistence)
- [ ] Test C: `buildSteps(true)` always includes `STAKING_ON_GOLIATH` step
- [ ] Test D: When `operationStatus === 'COMPLETED'` and `stakeOnGoliath === true`, staking step shows as "active" (not "completed") until client-side staking tx is confirmed
- [ ] Test E: Client-side staking calls `stakedXCN.stake({ value: amount })` with the bridged amount
- [ ] Test F: Staking step transitions: active → TX_PENDING → completed on success, active → error on failure

**Non-goals**

- Not changing the backend bridge logic (staking is now client-side)
- Not modifying the Yield tab's staking implementation
- Not adding support for partial staking (always stakes the full bridged amount)

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, ethers.js, Redux Toolkit
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

### Network Context

- Source chain: Sepolia (Chain ID: 11155111)
- Destination chain: Goliath Testnet (Chain ID: 8901)
- StakedXCN contract address: env `REACT_APP_STXCN_ADDRESS` (config: `src/config/stakingConfig.ts`)
- StakedXCN ABI: `src/abis/StakedXCN.ts` — `stake()` is payable, sends native XCN
- Existing staking hook: `src/hooks/yield/useStake.ts`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT deploy smart contracts without explicit authorization

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Reuse the existing `StakedXCN` ABI and contract hook from the Yield tab
- [ ] Do not modify the Yield tab's existing staking logic

### Operational Constraints

- Allowed downtime: none (frontend-only change)
- Blast radius: Migration page only; Yield tab unaffected

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. **"Staking on Goliath" step disappears** from the MigrationStatusPanel after the "Deposit Confirmed" step is completed. The user sees only: Deposit Confirmed → Waiting for Confirmations → Delivering on Goliath → Migration Complete.
2. **Tokens are minted but NOT staked** on Goliath. The XCN arrives in the wallet but is never deposited into the StakedXCN contract.

### 4.2 Impact

- **User impact:** Users expect their tokens to be auto-staked after migration. Instead, they must manually go to the Yield tab and stake — a broken UX promise.
- **System impact:** The migration flow advertises staking but doesn't deliver it. The status panel inconsistently shows/hides the staking step.
- **Scope:** Migration page, status panel, polling hook, operation state management.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationTransactions.ts:683-689` | `executeBridge` → `setOperation` | Missing `stakeOnGoliath` field in dispatched operation |
| `src/pages/Migrate/index.tsx:82-88` | Resume effect | Missing `stakeOnGoliath: pending.stakeOnGoliath` when creating operation from localStorage |
| `src/components/migration/MigrationStatusPanel.tsx:398-425` | `mapStatusToActiveStep` | `COMPLETED` maps directly to `MIGRATION_COMPLETE`, skipping staking step |
| `src/components/migration/MigrationStatusPanel.tsx:431-455` | `inferStakingStatus` | Returns `'completed'` when `backendStatus === 'COMPLETED'` even though no staking occurred |
| (missing) | Client-side staking execution | No hook/logic exists to execute staking on Goliath after bridge completion |

### 4.4 Evidence

**Bug 1: `stakeOnGoliath` not passed to `setOperation`**

In `useMigrationTransactions.ts:683-689`:
```typescript
dispatch(
  migrationActions.setOperation({
    originTxHash: depositTx.hash,
    intentId,
    status: 'PENDING_ORIGIN_TX',
    // BUG: stakeOnGoliath is NOT included here
    // Should be: stakeOnGoliath: frozenStakePreference
  })
);
```

In `Migrate/index.tsx:82-88`:
```typescript
dispatch(
  migrationActions.setOperation({
    originTxHash: pending.originTxHash,
    intentId: pending.intentId,
    status: 'PENDING_ORIGIN_TX',
    // BUG: stakeOnGoliath from persistence is NOT forwarded
    // Should be: stakeOnGoliath: pending.stakeOnGoliath
  })
);
```

`operation.stakeOnGoliath` is always `undefined` in Redux, so the status panel prop depends entirely on `migrationFields?.stakeOnGoliath` from the backend. If the backend returns `false` or omits it, the step disappears.

**Bug 2: `inferStakingStatus` short-circuits on COMPLETED**

In `MigrationStatusPanel.tsx:440`:
```typescript
if (backendStatus === 'COMPLETED') return 'completed';
```

This marks staking as "completed" as soon as the bridge is done, even though no staking transaction was ever executed.

**Bug 3: No client-side staking logic exists**

The migration flow currently relies entirely on the backend to stake tokens. The backend's `stakeOnGoliath` preference is submitted, but the backend does not execute staking. No frontend fallback exists.

### 4.5 Tasks

- `task-001-fix-operation-stakeOnGoliath.md`
- `task-002-add-client-side-staking-hook.md`
- `task-003-update-status-panel-staking-step.md`
- `task-004-integrate-staking-into-migration-flow.md`
- `task-005-add-network-switch-for-goliath-staking.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The "Staking on Goliath" step disappears because `operation.stakeOnGoliath` is never set in Redux (both `setOperation` call sites omit it), making the visibility depend on the backend's `stakeOnGoliath` field — which either returns `false` or is absent. Additionally, no client-side staking logic exists; the system assumed the backend would handle staking, but it doesn't.

### 5.2 Supporting Evidence

- `savePendingMigration` in `persistence.ts:46-49` correctly saves `stakeOnGoliath`, proving the preference IS captured — just never forwarded to Redux on `setOperation`.
- `loadPendingMigration` returns a `PendingMigration` with `stakeOnGoliath: boolean`, but the resume effect in `Migrate/index.tsx:82-88` ignores it.
- `inferStakingStatus` returns `'completed'` when `backendStatus === 'COMPLETED'`, regardless of whether any staking transaction was executed.
- The Yield tab successfully stakes using `stakedXCN.stake({ value: amount })` — the contract and ABI are already available.

### 5.3 Gaps / Items to Verify

- TO VERIFY: Confirm what the backend returns for `stakeOnGoliath` field when polling. Run a test migration and log the raw polling response.
- TO VERIFY: Confirm the StakedXCN contract on Goliath accepts native XCN from freshly minted bridged tokens (no additional approval needed since it's a payable function receiving native XCN).

### 5.4 Root Cause (final)

- **Root cause (UI):** `stakeOnGoliath` is omitted from both `setOperation` dispatch sites, leaving `operation.stakeOnGoliath` as `undefined`. The status panel falls back to backend data, which doesn't reliably return `true`.
- **Root cause (Functional):** No client-side staking execution exists. The backend was expected to stake but doesn't. The `inferStakingStatus` function falsely marks staking as "completed" when the bridge completes.
- **Contributing factors:** Optional typing of `stakeOnGoliath` in `MigrationOperation` type allows the omission to go unnoticed. No integration test covers the end-to-end flow including staking.

---

## 6) SOLUTIONS (compare options)

### Option A — Client-Side Staking After Bridge Completion (Recommended)

Add a new hook `useMigrationStaking` that triggers after polling detects `COMPLETED` status and `stakeOnGoliath === true`. It:
1. Prompts network switch to Goliath (chain 8901)
2. Calls `stakedXCN.stake({ value: bridgedAmount })` (same as Yield tab)
3. Tracks the staking tx in the operation state
4. Updates the status panel step to reflect progress

Also fix the two `setOperation` sites to include `stakeOnGoliath`.

**Changes required**
- `src/hooks/migration/useMigrationTransactions.ts:687` — add `stakeOnGoliath: frozenStakePreference` to `setOperation`
- `src/pages/Migrate/index.tsx:83` — add `stakeOnGoliath: pending.stakeOnGoliath` to `setOperation`
- `src/hooks/migration/useMigrationStaking.ts` (new) — client-side staking hook reusing `StakedXCN` contract
- `src/components/migration/MigrationStatusPanel.tsx:440` — update `inferStakingStatus` to not short-circuit on COMPLETED
- `src/pages/Migrate/index.tsx` — integrate staking hook and pass staking callbacks to status panel

**Pros**
- Reuses the proven Yield tab staking contract (`stakedXCN.stake()`)
- No backend changes needed
- User sees staking progress in real-time
- Consistent with the existing staking UX

**Cons / risks**
- Requires user to switch networks (Sepolia → Goliath) mid-flow
- If user closes the browser after bridge but before staking, they must revisit to complete staking

**Complexity:** Medium
**Rollback:** Easy — `git revert`, frontend-only change

---

### Option B — Backend-Side Staking Fix

Fix the bridge backend to actually execute staking when `stakeOnGoliath: true` is set on the intent. The frontend would only need the UI bug fixes (pass `stakeOnGoliath` to operation).

**Pros**
- No network switch needed
- Fully automated

**Cons / risks**
- Requires backend changes (separate repo, separate deploy)
- Backend needs a funded hot wallet or relayer to submit Goliath transactions
- Higher security risk (backend managing user staking)
- Longer timeline

**Complexity:** High
**Rollback:** Moderate (backend + frontend coordination)

---

### Decision

**Chosen option:** A — Client-Side Staking After Bridge Completion
**Justification:** Reuses existing proven contract interaction from the Yield tab, requires no backend changes, and keeps the user in control of their staking transaction. The network switch is a minor UX friction that's well-established in cross-chain flows.
**Accepted tradeoffs:** User must be present to complete staking (can't close browser mid-flow). Users on mobile wallets may experience a slightly clunky network switch.

---

## 7) DELIVERABLES

- [ ] Code changes: Fix `stakeOnGoliath` in `setOperation` (2 sites)
- [ ] Code changes: New `useMigrationStaking` hook
- [ ] Code changes: Update `MigrationStatusPanel` staking step logic
- [ ] Code changes: Integrate staking into `Migrate/index.tsx`
- [ ] Code changes: Add network switch trigger for Goliath
- [ ] Tests: Unit tests for `useMigrationStaking` hook
- [ ] Tests: Unit tests for updated `inferStakingStatus`
- [ ] Tests: Update `MigrationStatusPanel` tests for staking flow
- [ ] Tests: Integration test for operation.stakeOnGoliath persistence

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/`, `src/components/migration/__tests__/`
- **Run command:** `npm test`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `setOperation` dispatch includes `stakeOnGoliath: true` during bridge execution
- [ ] `setOperation` dispatch includes `stakeOnGoliath` from localStorage on resume
- [ ] `useMigrationStaking` calls `stakedXCN.stake({ value: amount })` when conditions met
- [ ] `useMigrationStaking` does NOT call stake when `stakeOnGoliath === false`
- [ ] `useMigrationStaking` handles user rejection (resets to idle, allows retry)
- [ ] `useMigrationStaking` handles tx failure (shows error, allows retry)
- [ ] `inferStakingStatus` returns `'active'` (not `'completed'`) when `COMPLETED` and no stakingTxHash
- [ ] `buildSteps(true)` includes `STAKING_ON_GOLIATH`
- [ ] `buildSteps(false)` excludes `STAKING_ON_GOLIATH`

**Integration tests (if applicable)**
- [ ] Full migration flow: bridge COMPLETED → staking step becomes active → staking tx → completed

### 8.3 Baseline

- Test run before fix: RECORD RESULTS HERE

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` to record current state
2. Ensure on branch `fix/yeild-total-staked-display` or create `fix/migrate-staking-on-goliath`
3. Run `npm test` to establish baseline

### Phase 1 — Fix `stakeOnGoliath` Omission (Bug Fix)

- **Step 1:** Add `stakeOnGoliath: frozenStakePreference` to `setOperation` in `useMigrationTransactions.ts:687`
  - File: `src/hooks/migration/useMigrationTransactions.ts:683-689`
  - Rollback: `git checkout -- src/hooks/migration/useMigrationTransactions.ts`

- **Step 2:** Add `stakeOnGoliath: pending.stakeOnGoliath` to `setOperation` in resume effect
  - File: `src/pages/Migrate/index.tsx:82-88`
  - Rollback: `git checkout -- src/pages/Migrate/index.tsx`

### Phase 2 — Update Status Panel Staking Logic

- **Step 3:** Update `inferStakingStatus` to return `'active'` (not `'completed'`) when `backendStatus === 'COMPLETED'` and no `stakingTxHash` exists and no `stakingError`
  - File: `src/components/migration/MigrationStatusPanel.tsx:440`
  - Current: `if (backendStatus === 'COMPLETED') return 'completed';`
  - New: Check if `stakingTxHash` is present before returning `'completed'`

- **Step 4:** Add staking operation state fields to `MigrationOperation` type
  - File: `src/state/migration/types.ts`
  - Add: `clientStakingStatus?: 'idle' | 'switching_network' | 'pending_signature' | 'tx_pending' | 'confirmed' | 'failed'`

### Phase 3 — Create Client-Side Staking Hook

- **Step 5:** Create `src/hooks/migration/useMigrationStaking.ts`
  - Reuses `STAKED_XCN_ABI` from `src/abis/StakedXCN.ts`
  - Reuses `STAKED_XCN_ADDRESS` from `src/constants/staking.ts`
  - Uses `useActiveWeb3React` for wallet/signer
  - Accepts bridged amount and stakeOnGoliath flag
  - Returns `{ executeStake, stakingStatus, stakingTxHash, stakingError, retry }`
  - Contract call: `stakedXCN.stake({ value: BigNumber.from(amount) })`

### Phase 4 — Add Network Switch Support

- **Step 6:** In `useMigrationStaking`, check if wallet is on Goliath (chain 8901)
  - If not, use existing `useBridgeNetworkSwitch` to prompt switch to Goliath
  - Only proceed with staking after network is confirmed as Goliath

### Phase 5 — Integrate Into Migration Flow

- **Step 7:** In `Migrate/index.tsx`, instantiate `useMigrationStaking` hook
  - Trigger staking when `operationStatus === 'COMPLETED'` and `stakeOnGoliath === true`
  - Pass staking state to `MigrationStatusPanel`

- **Step 8:** Update `MigrationStatusPanel` to show staking progress
  - Use `clientStakingStatus` to render appropriate UI in the staking step
  - Show "Switch to Goliath" prompt, spinner during tx, success/error states

### Phase 6 — Validate

1. Run `npm test` — all tests should pass
2. Run `npm run build` — build should succeed
3. Manual testing: execute a full migration with staking opted in

### Phase 7 — Rollback Plan

**Triggers:** Staking transactions fail consistently, or network switch causes UX issues
**Procedure:**
- Code: `git revert <commit>` for the feature; keep the `stakeOnGoliath` bug fixes
- The bug fixes (passing stakeOnGoliath to setOperation) are safe to keep regardless

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] `stakeOnGoliath` persists in operation Redux state
- [ ] "Staking on Goliath" step visible throughout migration when opted
- [ ] Client-side staking executes after bridge COMPLETED
- [ ] Network switch to Goliath works before staking
- [ ] Staking step shows progress (pending → confirmed)
- [ ] Staking failure shows error with retry option
- [ ] Yield tab staking still works independently
- [ ] No regressions in existing migration flow

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: TBD
- Tests passing: TBD
- Deployment status: TBD
- Remaining risks / follow-ups: TBD

---

## 12) FOLLOW-UPS

- [ ] Add monitoring for client-side staking success/failure rates
- [ ] Consider persisting staking state to localStorage so it survives page refresh after bridge COMPLETED
- [ ] Evaluate adding a "Stake Later" option for users who want to stake manually from the Yield tab
- [ ] Audit backend to understand why `stakeOnGoliath` field may return `false` in polling responses
