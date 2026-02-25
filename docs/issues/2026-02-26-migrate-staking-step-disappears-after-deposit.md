# Migration: "Staking on Goliath" Step Disappears After Deposit Confirmed — Backend Data Overrides Local Preference

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend only)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-staking-on-goliath-missing-and-not-executed.md` (original issue — partially fixed)

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

After the bridge deposit is confirmed and status polling begins, the "Staking on Goliath" step remains visible in the MigrationStatusPanel at all times when the user opted to stake. The staking auto-executes when the bridge reaches COMPLETED status and the wallet is on Goliath, without requiring a manual button click.

**Must-have outcomes**

- [ ] `resolvedStakeOnGoliath` never downgrades from `true` to `false` due to backend polling data
- [ ] `operation.stakeOnGoliath` in Redux is never overwritten from `true` to `false` by polled data
- [ ] Staking auto-triggers when bridge status is `COMPLETED`, user is on Goliath, and `stakeOnGoliath === true`
- [ ] "Staking on Goliath" step stays visible throughout the entire post-bridge flow

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: When `operation.stakeOnGoliath === true` and polling returns `stakeOnGoliath: false`, `resolvedStakeOnGoliath` remains `true`
- [ ] Test B: When polling dispatches `updateOperationStatus` with `stakeOnGoliath: false`, Redux `operation.stakeOnGoliath` stays `true`
- [ ] Test C: When `isReadyToStake` becomes `true` and `isNetworkCorrect === true` and `stakeOnGoliath === true`, `executeStake()` is called automatically
- [ ] Test D: `buildSteps(true)` always includes `STAKING_ON_GOLIATH` regardless of polling data

**Non-goals**

- Not modifying the backend bridge or staking logic
- Not changing the initial migration flow (stepper steps)
- Not adding new staking UI outside the status panel

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
- StakedXCN contract: `src/constants/staking.ts` → `STAKED_XCN_ADDRESS[8901]`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT deploy smart contracts without explicit authorization

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Do not modify the Yield tab's existing staking logic
- [ ] Do not modify backend polling response format

### Operational Constraints

- Allowed downtime: none (frontend-only change)
- Blast radius: Migration page only; Yield tab unaffected

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. After "Deposit Confirmed", the "Staking on Goliath" step disappears from the status panel step list
2. The staking transaction is never performed — tokens arrive on Goliath but are not staked
3. The status panel jumps from "Delivering on Goliath" directly to "Migration Complete"

### 4.2 Impact

- **User impact:** Users who opted to stake see their tokens minted but not staked. They must manually visit the Yield tab to stake. The migration flow breaks its UX promise.
- **System impact:** Inconsistent state — the local preference says stake, but the UI hides the staking step and never executes the staking transaction.
- **Scope:** `Migrate/index.tsx` (resolution logic), `useMigrationStatusPolling.ts` (Redux overwrite), `useMigrationStaking.ts` (missing auto-trigger)

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Migrate/index.tsx:143` | `resolvedStakeOnGoliath` | Backend polling data (`migrationFields?.stakeOnGoliath`) takes precedence over local operation state; can return `false` |
| `src/hooks/migration/useMigrationStatusPolling.ts:150` | `pollStatus` → `updateOperationStatus` dispatch | Dispatches `stakeOnGoliath: response.stakeOnGoliath` which overwrites local `operation.stakeOnGoliath` with backend value |
| `src/hooks/migration/useMigrationStaking.ts` | `useMigrationStaking` | No auto-trigger effect — staking only auto-triggers on network change, not on initial `isReadyToStake=true` |

### 4.4 Evidence

**Bug 1: Priority inversion in `resolvedStakeOnGoliath`**

`src/pages/Migrate/index.tsx:143`:
```typescript
const resolvedStakeOnGoliath = migrationFields?.stakeOnGoliath ?? operation?.stakeOnGoliath ?? true;
```

The `??` chain gives `migrationFields?.stakeOnGoliath` (from backend polling) **first priority**. When the backend returns `stakeOnGoliath: false` (because `bindOriginTxHash` hasn't completed yet and the intent isn't linked to the deposit), the resolved value becomes `false`.

This `false` is passed to `MigrationStatusPanel` as the `stakeOnGoliath` prop, which:
- Causes `buildSteps(false)` to exclude `STAKING_ON_GOLIATH` from the step list (line 433)
- Causes `useMigrationStaking` to receive `stakeOnGoliath=false`, disabling staking

**Bug 2: Polling overwrites Redux operation state**

`src/hooks/migration/useMigrationStatusPolling.ts:144-156`:
```typescript
dispatch(
  migrationActions.updateOperationStatus({
    status,
    // ...
    stakeOnGoliath: response.stakeOnGoliath, // ← Overwrites local true with backend false/undefined
    // ...
  })
);
```

The `updateOperationStatus` reducer (slice.ts:147-149) unconditionally overwrites:
```typescript
if (stakeOnGoliath !== undefined) {
  state.operation.stakeOnGoliath = stakeOnGoliath;
}
```

When `response.stakeOnGoliath` is `false`, this overwrites the locally-set `operation.stakeOnGoliath = true`. Once overwritten in Redux, even if `migrationFields` is later corrected, `operation?.stakeOnGoliath` is now `false` too.

**Bug 3: Missing auto-trigger for staking**

`src/hooks/migration/useMigrationStaking.ts:207-217`:
```typescript
// Auto-trigger staking when network becomes correct after awaiting
useEffect(() => {
  if (
    stakingStatus === 'awaiting_network' &&
    isNetworkCorrect &&
    isReadyToStake &&
    stakeOnGoliath
  ) {
    executeStake();
  }
}, [stakingStatus, isNetworkCorrect, isReadyToStake, stakeOnGoliath, executeStake]);
```

This effect ONLY triggers when `stakingStatus === 'awaiting_network'`. There is **no effect** for the common case:
- `isReadyToStake` transitions from `false` → `true` (bridge COMPLETED)
- User is already on Goliath (`isNetworkCorrect === true`)
- `stakingStatus` is `'idle'`

In this scenario, staking never starts automatically. The user sees a "Stake Now" button but the system doesn't act on its own.

### 4.5 Tasks

- `task-001-fix-resolved-stake-preference-priority.md`
- `task-002-guard-polling-overwrite-of-stake-preference.md`
- `task-003-add-auto-trigger-for-staking.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The staking step disappears because backend polling data overrides the local `stakeOnGoliath=true` preference through two channels: (1) the `resolvedStakeOnGoliath` expression gives polling data priority over local state, and (2) the polling dispatch overwrites `operation.stakeOnGoliath` in Redux. Additionally, even if the step were visible, staking wouldn't auto-execute because the hook lacks a trigger for the initial `isReadyToStake=true` event.

### 5.2 Supporting Evidence

- `executeBridge` in `useMigrationTransactions.ts:474` hardcodes `frozenStakePreference = true` and correctly saves it to both localStorage (line 676-680) and Redux (line 683-691) — proving the local state is correct at the start.
- The `bindOriginTxHash` call is fire-and-forget (line 652) — the backend may not know about the stake preference for several seconds, during which polling returns stale data.
- `buildSteps(false)` (line 426-443) excludes `STAKING_ON_GOLIATH` entirely — a single `false` value causes the step to vanish from the DOM.
- The `useMigrationStaking` hook's only auto-trigger is gated by `stakingStatus === 'awaiting_network'` (line 209) — it never triggers from the initial `'idle'` state.

### 5.3 Gaps / Items to Verify

- TO VERIFY: Backend polling response for `stakeOnGoliath` field — does it return `false`, `undefined`, or omit the field entirely before `bindOriginTxHash` completes?
  - Command: Add `console.log('[Poll]', response)` in `useMigrationStatusPolling.ts:118` and run a test migration.

### 5.4 Root Cause (final)

- **Root cause:** Priority inversion in `resolvedStakeOnGoliath` allows transient backend polling data to override the locally-established user preference, causing the staking step to disappear from the UI and the staking hook to be disabled.
- **Contributing factors:**
  - Polling Redux dispatch unconditionally overwrites `operation.stakeOnGoliath` with backend data
  - Missing auto-trigger effect in `useMigrationStaking` for the initial ready-to-stake state
  - `bindOriginTxHash` is fire-and-forget, creating a window where backend doesn't know the stake preference

---

## 6) SOLUTIONS (compare options)

### Option A — Fix Priority + Guard + Auto-Trigger (Recommended)

Three targeted fixes:

1. **Invert priority** in `resolvedStakeOnGoliath` — local `operation.stakeOnGoliath` takes precedence over `migrationFields.stakeOnGoliath`
2. **Guard Redux overwrite** — polling should never downgrade `stakeOnGoliath` from `true` to `false` in the Redux operation state
3. **Add auto-trigger effect** — new `useEffect` in `useMigrationStaking` that fires `executeStake()` when `isReadyToStake && isNetworkCorrect && stakeOnGoliath && stakingStatus === 'idle'`

**Changes required**
- `src/pages/Migrate/index.tsx:143` — swap priority order: `operation?.stakeOnGoliath ?? migrationFields?.stakeOnGoliath ?? true`
- `src/hooks/migration/useMigrationStatusPolling.ts:150` — guard: only set `stakeOnGoliath` if it's `true` (never downgrade from true to false)
- `src/hooks/migration/useMigrationStaking.ts` — add `useEffect` for auto-trigger on initial ready state

**Pros**
- Minimal code change (3 files, ~15 lines total)
- No architectural changes
- Each fix is independently verifiable
- Local state (user's intent) always wins

**Cons / risks**
- If backend eventually returns `stakeOnGoliath: true`, it's redundant but harmless
- Auto-trigger could fire if user doesn't expect it (mitigated: they opted in)

**Complexity:** Low
**Rollback:** Easy — `git revert`, each fix is independent

---

### Option B — Single Source of Truth via Preferences Slice

Instead of resolving `stakeOnGoliath` from multiple sources, read it exclusively from `preferences.stakeOnGoliath` (which is set during bridge execution and locked). Remove `stakeOnGoliath` from polling and operation entirely.

**Pros**
- Eliminates the multi-source ambiguity entirely
- Clean separation of concerns

**Cons / risks**
- Larger refactor — must update the status panel, polling hook, operation type, and persistence layer
- Breaks backward compatibility with existing persisted operations in localStorage
- Risk of regression in other flows that read `operation.stakeOnGoliath`

**Complexity:** Medium
**Rollback:** Moderate — touches more files

---

### Decision

**Chosen option:** A — Fix Priority + Guard + Auto-Trigger
**Justification:** Three small, targeted, independently verifiable fixes that address each root cause directly. Low risk, easy rollback, no architectural changes needed.
**Accepted tradeoffs:** Multiple sources of truth remain, but with correct priority ordering and guarded writes, the local preference always wins.

---

## 7) DELIVERABLES

- [ ] Code changes: Fix `resolvedStakeOnGoliath` priority in `Migrate/index.tsx`
- [ ] Code changes: Guard `stakeOnGoliath` overwrite in `useMigrationStatusPolling.ts`
- [ ] Code changes: Add auto-trigger effect in `useMigrationStaking.ts`
- [ ] Tests: Unit test for priority ordering
- [ ] Tests: Unit test for guard behavior
- [ ] Tests: Unit test for auto-trigger behavior

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/`, `src/pages/Migrate/__tests__/`
- **Run command:** `npm test`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `resolvedStakeOnGoliath` returns `true` when `operation.stakeOnGoliath=true` and `migrationFields.stakeOnGoliath=false`
- [ ] `resolvedStakeOnGoliath` returns `true` when `operation.stakeOnGoliath=true` and `migrationFields.stakeOnGoliath=undefined`
- [ ] Polling `updateOperationStatus` does not overwrite `stakeOnGoliath=true` when response returns `false`
- [ ] `useMigrationStaking` calls `executeStake()` when `isReadyToStake` transitions to `true` and `isNetworkCorrect=true`
- [ ] `useMigrationStaking` does NOT auto-trigger when `stakeOnGoliath=false`

### 8.3 Baseline

- Test run before fix: RECORD RESULTS HERE

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. Record current state: `git status`, `git log --oneline -5`
2. Ensure on branch `feat/migrate` or create `fix/migrate-staking-step-disappears`
3. Run `npm test` to establish baseline

### Phase 1 — Fix resolvedStakeOnGoliath Priority

- **Step 1:** Change priority order in `src/pages/Migrate/index.tsx:143`
  - Before: `migrationFields?.stakeOnGoliath ?? operation?.stakeOnGoliath ?? true`
  - After: `operation?.stakeOnGoliath ?? migrationFields?.stakeOnGoliath ?? true`
  - Verify: Build succeeds, staking step stays visible when polling returns `false`
  - Rollback: `git checkout -- src/pages/Migrate/index.tsx`

### Phase 2 — Guard Polling Redux Overwrite

- **Step 2:** In `src/hooks/migration/useMigrationStatusPolling.ts:150`, guard the `stakeOnGoliath` dispatch
  - Before: `stakeOnGoliath: response.stakeOnGoliath,`
  - After: Only include `stakeOnGoliath` in the dispatch when `response.stakeOnGoliath === true` (never downgrade)
  - Verify: Build succeeds, Redux `operation.stakeOnGoliath` stays `true` across polling cycles
  - Rollback: `git checkout -- src/hooks/migration/useMigrationStatusPolling.ts`

### Phase 3 — Add Auto-Trigger for Staking

- **Step 3:** Add a new `useEffect` in `src/hooks/migration/useMigrationStaking.ts` (after the existing network-change effect)
  - Condition: `stakingStatus === 'idle' && isReadyToStake && isNetworkCorrect && stakeOnGoliath && !executingRef.current`
  - Action: Call `executeStake()`
  - Guard: Use a `hasAutoTriggeredRef` to prevent re-firing after user rejection
  - Verify: Staking auto-starts when bridge completes and user is on Goliath
  - Rollback: `git checkout -- src/hooks/migration/useMigrationStaking.ts`

### Phase 4 — Validate

1. Run `npm test` — all tests should pass
2. Run `npm run build` — build should succeed
3. Manual testing: execute a full migration with staking opted in, verify staking step stays visible and auto-executes

### Phase 5 — Rollback Plan

**Triggers:** Auto-staking causes unexpected UX issues or double-staking
**Procedure:**
- Code: `git revert <commit>` — each fix can be reverted independently
- The priority fix (Step 1) is safe to keep in all cases

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] "Staking on Goliath" step remains visible throughout the migration flow
- [ ] Staking auto-executes when bridge COMPLETED and wallet is on Goliath
- [ ] `resolvedStakeOnGoliath` is `true` even when polling returns `false`
- [ ] `operation.stakeOnGoliath` in Redux stays `true` across polling cycles
- [ ] Staking step shows proper progress states (idle → pending → confirmed)
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

- [ ] Audit backend to confirm why `stakeOnGoliath` returns `false` before `bindOriginTxHash` completes
- [ ] Consider removing `stakeOnGoliath` from polling response entirely (single source of truth from local state)
- [ ] Add E2E test for the full migration + staking flow
- [ ] Monitor auto-trigger behavior in production — ensure no double-staking scenarios
