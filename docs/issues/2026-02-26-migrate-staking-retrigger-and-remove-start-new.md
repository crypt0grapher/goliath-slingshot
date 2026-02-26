# Migrate: Staking Re-Triggers on Tab Switch & Remove "Start New Migration" Button

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-missing-completion-feedback-and-history.md`
- `docs/issues/2026-02-25-migrate-staked-xcn-single-button-flow.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

After a migration completes (bridge + staking confirmed), navigating away from the Migrate tab and returning must NOT re-prompt the user to sign a staking transaction. The "Start New Migration" button is removed since migration is a one-time procedure; completed operations auto-clear when the user leaves the page.

**Must-have outcomes**

- [ ] Completed migration does not re-trigger staking when switching tabs
- [ ] "Start New Migration" button is removed from the UI
- [ ] Completed operations auto-clear from Redux when the user navigates away
- [ ] Failed/expired operations still show their error state and allow retry via page refresh

**Acceptance criteria (TDD)**

- [ ] Test: `useMigrationStaking` initializes with `confirmed` status when Redux `operation.clientStakingStatus` is `confirmed`, does not auto-trigger `executeStake`
- [ ] Test: `useMigrationStaking` initializes with `idle` when no prior staking status exists (new migration)
- [ ] Test: Migrate page auto-clears a fully-completed operation on unmount
- [ ] Test: `MigrationStatusPanel` renders no "Start New Migration" button on success
- [ ] Test: Failed operations are NOT auto-cleared on unmount

**Non-goals**

- Changing the staking contract interaction itself
- Modifying bridge polling behavior
- Adding migration history tracking (separate feature)

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] No breaking changes to Redux state shape (additive only)

### Operational Constraints

- Allowed downtime: none (frontend deploy)
- Blast radius: Migrate page only

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

**Bug 1 — Staking re-triggers on tab switch:**
1. User completes full migration (bridge 100 XCN + stake on Goliath) for wallet `0xeDEBE078E6813469d66ffDc7Bde4b54749EFE0cF`.
2. "Migration Complete" screen with "Start New Migration" button is shown.
3. User switches to the "Yield" tab, then back to "Migrate".
4. A staking transaction signing prompt appears again for the same amount.
5. Pressing "Start New Migration" resets correctly — proving the operation cleanup logic works, it just doesn't run on tab switch.

**Bug 2 — UX: "Start New Migration" is misleading:**
- Migration is a one-time procedure per wallet. The "Start New Migration" button implies it's a recurring action. The button should be removed, and the completed state should auto-clear.

### 4.2 Impact

- **User impact:** Users are prompted to sign duplicate staking transactions after already completing migration. If they approve, the transaction will likely revert (funds already staked), wasting gas. Confusing UX.
- **System impact:** No data loss risk, but unnecessary on-chain transactions.
- **Scope:** Migrate page, `useMigrationStaking` hook, `MigrationStatusPanel` component.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationStaking.ts:80` | `useMigrationStaking` | `useState<ClientStakingStatus>('idle')` — always initializes to `idle`, ignoring Redux `operation.clientStakingStatus` |
| `src/hooks/migration/useMigrationStaking.ts:223-241` | auto-trigger `useEffect` | Fires because `stakingStatus === 'idle'` even though Redux knows staking is `confirmed` |
| `src/pages/Migrate/index.tsx:155-160` | `handleStartNewMigration` | Only way to clear a completed operation — no auto-clear on unmount |
| `src/components/migration/MigrationStatusPanel.tsx:830-835` | Terminal success UI | Renders "Start New Migration" button — should be removed |

### 4.4 Evidence

**Root cause trace for Bug 1:**

1. Migration completes: bridge `COMPLETED`, staking `confirmed` in Redux `operation.clientStakingStatus`.
2. Polling hook calls `clearPendingMigration()` — localStorage is cleared (`useMigrationStatusPolling.ts:184-185`).
3. User navigates away — Migrate component unmounts. Redux `operation` persists in-memory.
4. User navigates back — Migrate component remounts.
5. `loadPendingMigration()` returns `null` (localStorage cleared) — no overwrite from line 82-97.
6. Redux `operation` still exists with `status: 'COMPLETED'`, so `useMigrationFlow` returns `isStatusView: true`.
7. Polling restarts, returns `COMPLETED` → `isBridgeCompleted = true`.
8. **Critical:** `useMigrationStaking` initializes with `useState('idle')` — it does NOT read `operation.clientStakingStatus` from Redux.
9. `hasAutoTriggeredRef.current = false` (new ref on remount).
10. Auto-trigger effect fires: `idle && isReadyToStake && isNetworkCorrect && stakeOnGoliath && !hasAutoTriggered` → `executeStake()` called.
11. User sees staking signature prompt again.

```typescript
// useMigrationStaking.ts:80 — always starts at 'idle', ignoring Redux state
const [stakingStatus, setStakingStatus] = useState<ClientStakingStatus>('idle');

// useMigrationStaking.ts:223-241 — auto-trigger fires on 'idle'
useEffect(() => {
  if (
    stakingStatus === 'idle' &&
    isReadyToStake &&
    isNetworkCorrect &&
    stakeOnGoliath &&
    !executingRef.current &&
    !hasAutoTriggeredRef.current
  ) {
    hasAutoTriggeredRef.current = true;
    executeStake();
  }
}, [stakingStatus, isReadyToStake, isNetworkCorrect, stakeOnGoliath, executeStake]);
```

### 4.5 Tasks

- `.memory-bank/tasks/2026-02-26-migrate-staking-retrigger-and-remove-start-new/task-001-init-staking-from-redux.md`
- `.memory-bank/tasks/2026-02-26-migrate-staking-retrigger-and-remove-start-new/task-002-auto-clear-completed-operation.md`
- `.memory-bank/tasks/2026-02-26-migrate-staking-retrigger-and-remove-start-new/task-003-remove-start-new-migration-button.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

`useMigrationStaking` uses local `useState('idle')` for staking status, discarding the confirmed status stored in Redux `operation.clientStakingStatus` when the component remounts after tab navigation. This causes the auto-trigger effect to fire again.

### 5.2 Supporting Evidence

- `useState<ClientStakingStatus>('idle')` at `useMigrationStaking.ts:80` — hardcoded initial value.
- `hasAutoTriggeredRef.current = false` on each mount — new ref instance, no memory of prior trigger.
- Redux `operation.clientStakingStatus: 'confirmed'` is available via `selectOperation` but never read by the staking hook.
- "Start New Migration" works because `clearOperation()` removes the operation from Redux, breaking the auto-trigger chain.

### 5.3 Gaps / Items to Verify

- None — root cause is confirmed from code analysis.

### 5.4 Root Cause (final)

- **Root cause:** `useMigrationStaking` does not hydrate its local state from the Redux operation's `clientStakingStatus` on mount. Combined with `hasAutoTriggeredRef` resetting on remount, the auto-trigger fires for already-completed staking.
- **Contributing factors:** No auto-cleanup of completed operations on unmount; "Start New Migration" button is the only way to reset, but the user shouldn't need to press it.

---

## 6) SOLUTIONS (compare options)

### Option A — Hydrate staking status from Redux + auto-clear on unmount

**Changes required:**
1. `useMigrationStaking.ts` — Read `operation.clientStakingStatus` from Redux via `useSelector`. Initialize `useState` with that value (or `'idle'` if absent). Also initialize `hasAutoTriggeredRef` to `true` if status is already `confirmed`.
2. `Migrate/index.tsx` — Add a cleanup `useEffect` that auto-clears the Redux operation when the component unmounts IF the migration is fully completed (bridge COMPLETED + staking confirmed).
3. `MigrationStatusPanel.tsx` — Remove the "Start New Migration" button from the success state. Show only the success message.

**Pros**
- Minimal changes: 3 files
- Directly addresses root cause (staking hook ignores Redux state)
- Auto-clear on unmount provides clean UX — user sees success, navigates away, comes back to clean state
- No behavior change for in-progress or failed operations

**Cons / risks**
- If user navigates away quickly after staking confirms, they might miss the success message. Acceptable since staking is confirmed on-chain.

**Complexity:** Low
**Rollback:** Easy — revert 3 files

---

### Option B — Persist staking completion to localStorage

**Changes required:**
1. Create a new localStorage key to track staking completion per operation (e.g., `goliath_staking_done_<txHash>`).
2. `useMigrationStaking.ts` — Check localStorage on init; skip auto-trigger if staking was already done for this operation.
3. `Migrate/index.tsx` — Save to localStorage when staking confirms; clean up stale entries.

**Pros**
- Survives page refresh (full F5 reload)

**Cons / risks**
- Adds another localStorage entry to manage and clean up
- More complex — dual source of truth (Redux + localStorage)
- Staking completion already doesn't survive page refresh (Redux is cleared), so this solves a non-problem
- "Start New Migration" button still needs separate removal

**Complexity:** Medium
**Rollback:** Moderate — need to clean up localStorage entries

---

### Decision

**Chosen option:** A — Hydrate from Redux + auto-clear on unmount
**Justification:** Simplest fix that directly addresses the root cause. The Redux store already holds `clientStakingStatus` — we just need to read it. Auto-clearing on unmount eliminates the need for "Start New Migration" and prevents stale state.
**Accepted tradeoffs:** Staking status doesn't survive full page refresh, but this is already the case and is acceptable since the polling hook re-fetches bridge status anyway.

---

## 7) DELIVERABLES

- [ ] Code changes: `useMigrationStaking.ts`, `Migrate/index.tsx`, `MigrationStatusPanel.tsx`
- [ ] Tests: `useMigrationStaking.test.ts` (new/updated), `MigrationStatusPanel.test.tsx` (updated)
- [ ] Config changes: none
- [ ] Documentation: this issue file
- [ ] Deployment: frontend redeploy
- [ ] Monitoring/alerts: none

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/useMigrationStaking.test.ts`, `src/components/migration/__tests__/MigrationStatusPanel.test.tsx`
- **Run command:** `npm test`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `useMigrationStaking` initializes `stakingStatus` to `confirmed` when Redux `operation.clientStakingStatus` is `confirmed`
- [ ] `useMigrationStaking` initializes `stakingStatus` to `idle` when no operation exists or `clientStakingStatus` is absent
- [ ] `useMigrationStaking` does NOT call `executeStake` when initialized with `confirmed` status
- [ ] `useMigrationStaking` still auto-triggers for genuinely new migrations (`idle` + `isReadyToStake`)

**Integration tests**
- [ ] Migrate page: fully-completed operation is cleared from Redux on unmount
- [ ] Migrate page: in-progress or failed operation is NOT cleared on unmount

**Component tests**
- [ ] `MigrationStatusPanel` does NOT render "Start New Migration" button in success state
- [ ] `MigrationStatusPanel` does NOT render "Start New Migration" button in failed state

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — verify clean working tree on `feat/migrate`.
2. Create working branch: `git checkout -b fix/migrate-staking-retrigger`

### Phase 1 — Write Tests First

**Step 1:** Add test for staking hook initialization from Redux
- File: `src/hooks/migration/__tests__/useMigrationStaking.test.ts`
- Test: render hook with mocked Redux state where `operation.clientStakingStatus === 'confirmed'`, assert `stakingStatus === 'confirmed'` and `executeStake` was not called.
- Expected: FAIL (hook ignores Redux state)

**Step 2:** Add test for auto-clear on unmount
- File: `src/__tests__/migration-integration.test.ts` or new test
- Test: mount Migrate component with fully-completed operation, unmount, verify `clearOperation` was dispatched.
- Expected: FAIL (no auto-clear logic exists)

**Step 3:** Update MigrationStatusPanel test
- File: `src/components/migration/__tests__/MigrationStatusPanel.test.tsx`
- Test: render with `isFullyCompleted` props, assert no button with text "Start New Migration".
- Expected: FAIL (button still renders)

### Phase 2 — Implement the Fix

**Step 4:** Hydrate `useMigrationStaking` from Redux
- File: `src/hooks/migration/useMigrationStaking.ts`
- Changes:
  1. Add `useSelector(selectOperation)` to read `operation.clientStakingStatus`.
  2. Change `useState<ClientStakingStatus>('idle')` to initialize from Redux: `useState<ClientStakingStatus>(operation?.clientStakingStatus ?? 'idle')`.
  3. Initialize `hasAutoTriggeredRef` to `true` if initial status is `confirmed` or `tx_pending`.
  4. Also initialize `stakingTxHash` from `operation?.stakingTxHash ?? null`.
- Build: `npm run build`
- Expected: build succeeds
- Rollback: `git checkout -- src/hooks/migration/useMigrationStaking.ts`

**Step 5:** Auto-clear completed operation on unmount
- File: `src/pages/Migrate/index.tsx`
- Changes:
  1. Add a `useEffect` cleanup that checks if the operation is fully completed (bridge COMPLETED + clientStakingStatus confirmed, OR bridge COMPLETED + stakeOnGoliath false). If so, dispatch `clearOperation()` on unmount.
  2. This replaces the need for "Start New Migration" — when user navigates away and back, the operation is gone and the page shows the normal stepper/empty state.
- Build: `npm run build`
- Expected: build succeeds
- Rollback: `git checkout -- src/pages/Migrate/index.tsx`

**Step 6:** Remove "Start New Migration" button
- File: `src/components/migration/MigrationStatusPanel.tsx`
- Changes:
  1. Remove the `NewMigrationButton` from the success terminal state (lines 830-835).
  2. Remove the `NewMigrationButton` from the failed terminal state (lines 857-864).
  3. Remove `onStartNewMigration` from the props interface.
  4. Remove the `NewMigrationButton` styled component and `handleStartNew` callback.
- File: `src/pages/Migrate/index.tsx`
  1. Remove `handleStartNewMigration` callback.
  2. Remove `onStartNewMigration` prop from `<MigrationStatusPanel>`.
- Build: `npm run build`
- Expected: build succeeds
- Rollback: `git checkout -- src/components/migration/MigrationStatusPanel.tsx src/pages/Migrate/index.tsx`

### Phase 3 — Validate

1. Run `npm test` — all tests pass.
2. Run `npm run build` — build succeeds.
3. Manual verification:
   - Complete a migration flow (bridge + stake).
   - See "Migration Complete" success message (no "Start New Migration" button).
   - Switch to Yield tab and back to Migrate.
   - Verify: NO staking prompt appears. Page shows normal stepper/empty state.

### Phase 4 — Rollback Plan

**Triggers:** Staking flow broken for new migrations, or auto-clear fires prematurely during in-progress operations.
**Procedure:**
- Code: `git revert <commit>`
- Deployment: redeploy previous frontend build

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing migration flow
- [ ] Staking auto-trigger works for genuinely new migrations
- [ ] Completed migrations auto-clear on tab switch
- [ ] No "Start New Migration" button in UI
- [ ] Failed/expired operations still visible on return

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

---

## 12) FOLLOW-UPS

- [ ] Consider adding migration history panel (Phase-2 feature flag) to show past completed migrations
- [ ] Audit whether `loadPendingMigration` resume effect (line 82-97) should skip if Redux already has an operation
