# Migrate Tab: Completed Goliath Step Drops Into Empty State and Hides Staking Completion

**Project:** CoolSwap-interface
**Type:** Integration
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend, optional backend validation)
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-completed-status-disappears-after-bridge.md`
- `docs/issues/2026-02-25-migrate-staked-xcn-single-button-flow.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

After migration reaches the Goliath completion stage, `/migrate` must keep showing a terminal success state (including tx references) until the user explicitly starts a new migration. It must never immediately fall back to `No XCN to migrate` for the just-completed flow.

The staking phase must continue to execute with Yield-equivalent staking semantics (native XCN value sent into staking), and this behavior must be explicitly validated.

**Must-have outcomes**

- [ ] Completed migration (`status=COMPLETED`) remains visible in status UI until explicit user reset.
- [ ] UI does not return to empty-state immediately after completion when Sepolia balances are zero.
- [ ] Terminal status section shows available completion metadata (origin/destination/staking tx hashes and completion time where provided).
- [ ] Staking path remains aligned with Yield semantics: native-value staking call (`stake{value}`), including bridge adapter path validation.

**Acceptance criteria (TDD)**

Tests that must fail before fix and pass after fix:

- [ ] Test A: `deriveSteps()` keeps `isStatusView=true` when an `operation` exists with `status=COMPLETED` (until `clearOperation`).
- [ ] Test B: Migrate page regression test shows `MigrationStatusPanel` (not empty state) with `snapshot.staked=0`, `snapshot.walletXcn=0`, and terminal operation.
- [ ] Test C: `useMigrationStatusPolling` propagates destination/completion metadata needed by status panel (`destinationTxHash`, `timestamps.completedAt`, `stakeOnGoliath`, `stakingTxHash`, `stakingError`).
- [ ] Test D: backend staking path test confirms staking branch is executed when `stakeOnGoliath=true`, producing `stakingTxHash` and no fallback transfer on success.
- [ ] Test E: adapter-level test confirms bridge staking call still resolves to `stXCN.stake{value}` semantics.

**Non-goals**

- Contract redeployments.
- Consensus / infra changes.
- Rewriting bridge history UX from scratch.

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `CI=true npm test -- --watchAll=false`

### Deployment Details (if applicable)

- **Related backend repository:** `~/goliath/goliath-bridge-backend`
- **Bridge status API:** `REACT_APP_BRIDGE_STATUS_API_URL` (`.env:41`)
- **Migration status endpoint used by frontend:** `GET /bridge/status?originTxHash=...`
- **Migration history endpoint:** `GET /migration/history?address=...`
- **Staking adapter contract (backend):** `config.staking.contract` (called via `stakeFor`)

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Sepolia source chain for migrate flow

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
- [ ] Keep backward compatibility with existing migration state shape where possible
- [ ] Do not break current bridge/yield behavior

### Operational Constraints

- Allowed downtime: none expected
- Blast radius: migration UI state derivation, status polling mapping, optional backend staking-path validation tests

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- On migrate flow, after the Goliath step reaches completion, the status process view drops and the screen returns to `No XCN to migrate`.
- User interprets this as migration/staking not executed even when backend completed.
- Status panel cannot show destination tx in current page wiring because `destinationTxHash` is passed as `null`.
- History panel exists and is implemented, but in this environment it is disabled (`REACT_APP_MIGRATION_HISTORY_ENABLED=false`), so it cannot serve as completion fallback.

### 4.2 Impact

- **User impact:** High confusion and loss of confidence in migration completion.
- **System impact:** Increased support load and potential duplicate user attempts.
- **Scope:** Migration flow derivation + status rendering + status metadata mapping.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationFlow.ts:59-66,131-137` | `deriveSteps` | `isStatusView` only true for non-terminal statuses; terminal statuses immediately fall back to snapshot-driven empty/stepper flow |
| `src/pages/Migrate/index.tsx:233-267` | `Migrate` render conditions | Empty-state branch wins when `!isStatusView && isEmpty`; status panel is hidden after terminal transition |
| `src/pages/Migrate/index.tsx:72,262` | `Migrate` props wiring | `stakeOnGoliath` hardcoded `true`; `destinationTxHash` always `null` when rendering status panel |
| `src/hooks/migration/useMigrationStatusPolling.ts:119-139` | `pollStatus` field extraction | Does not map/persist destination/completion metadata into migration fields/operation state |
| `src/hooks/yield/useStake.ts:53` | Yield staking execution | Canonical Yield staking call is `contract.stake({ value: amount })` |
| `~/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts:321-343` | relayer staking path | Bridge staking uses `stakeFor(recipient, { value })`; staking tx hash persisted on success |
| `~/goliath/staking/test-contract-sepolia/src/BridgeStakingAdapter.sol:31-37` | adapter implementation | `stakeFor` internally calls `stXCN.stake{value: msg.value}()` (same underlying staking semantics as Yield) |

### 4.4 Evidence

1. **Terminal status explicitly exits status view in frontend flow derivation**

```ts
if (operation && !TERMINAL_STATUSES.has(operation.status)) {
  return { isStatusView: true, ... };
}
...
return { isEmpty: true, isStatusView: false };
```

Source: `src/hooks/migration/useMigrationFlow.ts:59-66,131-137`

2. **Migrate page falls back to empty state and hides status panel**

- Empty branch: `!isLoading && !isStatusView && isEmpty && !dataError`
- Status branch: `isStatusView && operation`

Source: `src/pages/Migrate/index.tsx:233-267`

3. **Status panel is not given destination tx hash from page**

```tsx
destinationTxHash={null}
```

Source: `src/pages/Migrate/index.tsx:262`

4. **Current tests lock in the buggy behavior**

- `should NOT return isStatusView when operation has terminal status COMPLETED`
- `should derive steps from snapshot when operation is COMPLETED`

Source: `src/hooks/migration/__tests__/useMigrationFlow.test.ts:100-109,537-549`

5. **Targeted verification command confirms this test currently passes**

Command run:
`CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationFlow.test.ts -t "should NOT return isStatusView when operation has terminal status COMPLETED"`

Observed result: `PASS` (1 passed, 37 skipped)

6. **History fallback disabled in current environment**

- `.env:61` -> `REACT_APP_MIGRATION_HISTORY_ENABLED=false`
- `MigrationHistoryPanel` returns `null` when flag is off

Source: `.env:61`, `src/components/migration/MigrationHistoryPanel.tsx:447-450`

7. **Staking-call parity note (requested): backend path currently uses adapter but underlying call semantics match Yield**

- Yield call: `contract.stake({ value: amount })`
- Bridge backend call: `stakingGoliath.stakeFor(recipient, { value: ... })`
- Adapter internals: `stXCN.stake{value: msg.value}()`

Sources: `src/hooks/yield/useStake.ts:53`, `~/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts:335-338`, `~/goliath/staking/test-contract-sepolia/src/BridgeStakingAdapter.sol:35-37`

### 4.5 Tasks

- `.memory-bank/tasks/2026-02-25-migrate-missing-completion-feedback-and-history/task-001-regression-tests-terminal-completion-state.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-completion-feedback-and-history/task-002-persist-status-panel-after-terminal-state.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-completion-feedback-and-history/task-003-propagate-completion-metadata-to-ui.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-completion-feedback-and-history/task-004-lock-staking-call-parity-with-yield.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-completion-feedback-and-history/task-005-release-qa-and-history-fallback.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The migration flow logic treats terminal statuses as no longer status-view eligible, so successful completion immediately reverts to balance-derived UI (often empty-state), masking completion/staking feedback.

### 5.2 Supporting Evidence

- `deriveSteps` only enters status view for non-terminal operations.
- Existing tests assert this behavior as correct.
- Migrate page rendering gates status panel behind `isStatusView`.
- Environment disables history panel, removing secondary verification path.

### 5.3 Gaps / Items to Verify

- TO VERIFY: backend deployed config still points `config.staking.contract` to intended adapter/staking contract for the active environment.
  - Command: `rg -n "STAKING_|staking\.contract|XCN_RELAY_MODE" /Users/alex/goliath/goliath-bridge-backend/.env*`
  - Expected output: staking contract/env flags present and environment-specific values visible.
  - Failure modes: missing env file, stale env, wrong deployment target.
  - Rollback: no code changes; revert to previous known-good env during deploy.

- TO VERIFY: completed migration with `stakeOnGoliath=true` consistently produces `stakingTxHash` in `/migration/history`.
  - Command: `curl "$REACT_APP_BRIDGE_STATUS_API_URL/migration/history?address=<wallet>&limit=5" | jq '.operations[] | {status, stakeOnGoliath, stakingTxHash, stakingError}'`
  - Expected output: for completed staked operations, `stakeOnGoliath=true` and non-null `stakingTxHash`.
  - Failure modes: API unavailable, wallet has no recent staked migrations, intent bind failures.
  - Rollback: N/A (read-only check).

### 5.4 Root Cause (final)

- **Root cause:** Terminal completion is intentionally excluded from status-view derivation, causing immediate UI fallback to empty-state after successful completion when source balances are zero.
- **Contributing factors:**
  - Regression tests codify the terminal fallback behavior.
  - Page wiring does not pass destination metadata into status panel.
  - History fallback is disabled by environment flag.
  - Staking execution success is not explicitly surfaced in persistent terminal UX.

---

## 6) SOLUTIONS (compare options)

### Option A - Keep Status View Until Explicit Reset (Recommended)

**Changes required**

- `src/hooks/migration/useMigrationFlow.ts`
  - Keep `isStatusView=true` whenever `operation` exists, including terminal statuses, until `clearOperation`.
- `src/hooks/migration/useMigrationStatusPolling.ts`
  - Propagate destination/completion metadata and stake fields needed by terminal UI.
- `src/state/migration/types.ts` + `src/state/migration/slice.ts`
  - Extend operation state to store completion metadata.
- `src/pages/Migrate/index.tsx`
  - Stop hardcoding stake flag; pass resolved metadata and destination tx hash to status panel.

**Pros**

- Directly fixes the observed UX drop.
- Keeps user in completion context.
- Minimal behavior ambiguity.

**Cons / risks**

- Requires changing existing tests and assumptions.
- Slightly broader state shape updates.

**Complexity:** Medium
**Rollback:** Easy (frontend revert)

---

### Option B - Keep Current Flow Derivation, Add Dedicated "Last Completed" Card

**Changes required**

- Keep terminal fallback behavior.
- Add a completion card sourced from operation/history data when empty-state is shown.
- Requires history flag enabled or alternate persisted operation cache.

**Pros**

- Smaller change to `deriveSteps` internals.
- Can coexist with current stepper logic.

**Cons / risks**

- Still allows abrupt status panel disappearance.
- Depends on history availability/feature flags.
- Weaker UX than continuous status mode.

**Complexity:** Medium
**Rollback:** Easy

---

### Decision

**Chosen option:** A

**Justification:** User-reported bug is exactly the terminal drop in active flow; Option A addresses the root with deterministic behavior and does not depend on history enablement.

**Accepted tradeoffs:** migration flow tests and operation shape need updates.

**Staking parity note (required):** preserve Yield-equivalent staking semantics. Current backend adapter path (`stakeFor`) is acceptable only because it internally executes `stXCN.stake{value}`. Add tests to lock this behavior.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `src/hooks/migration/useMigrationFlow.ts`
  - `src/hooks/migration/useMigrationStatusPolling.ts`
  - `src/state/migration/types.ts`
  - `src/state/migration/slice.ts`
  - `src/pages/Migrate/index.tsx`
  - `src/components/migration/MigrationStatusPanel.tsx` (if terminal metadata rendering is expanded)
- [ ] Tests:
  - `src/hooks/migration/__tests__/useMigrationFlow.test.ts`
  - `src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
  - migration page/component regression tests
  - backend staking-path tests in `~/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`
- [ ] Config changes:
  - evaluate `REACT_APP_MIGRATION_HISTORY_ENABLED` rollout after terminal UX fix
- [ ] Documentation:
  - update issue doc + task files
- [ ] Deployment:
  - frontend deploy
  - optional backend deploy only if staking-path logic changes (not required for frontend-only fix)
- [ ] Monitoring/alerts:
  - optional metric/log check for terminal->empty transitions

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Frontend test location:** `src/hooks/migration/__tests__/`, `src/components/migration/__tests__/`, `src/pages/Migrate/__tests__/` (new if needed)
- **Backend test location:** `~/goliath/goliath-bridge-backend/src/worker/__tests__/`
- **Run command (frontend):** `CI=true npm test -- --watchAll=false --runInBand`
- **Run command (backend):** `npm test -- src/worker/__tests__/transactionSubmitter.test.ts`
- **Frameworks:** Jest (frontend), Vitest/Jest by backend setup

### 8.2 Required Tests

**Unit tests**

- [ ] `deriveSteps` keeps terminal operation in status mode until explicit clear.
- [ ] `useMigrationStatusPolling` maps destination/completion/staking fields from API response.
- [ ] reducer updates operation metadata without erasing existing fields.

**Integration tests (if applicable)**

- [ ] Migrate page with completed operation + zero balances renders status panel (not empty state).
- [ ] `Start New Migration` explicitly clears operation and returns to balance-derived flow.

**E2E / Manual tests (if applicable)**

- [ ] Complete real migration and observe terminal state persistence.
- [ ] Verify destination and staking tx links from completion UI.

**Contract/relayer tests (staking parity)**

- [ ] Backend `stakeOnGoliath=true` happy path sets `stakingTxHash` and uses staking call path.
- [ ] Adapter test confirms `stakeFor` continues to call `stXCN.stake{value}`.

### 8.3 Baseline

- Frontend baseline command executed:
  - `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationFlow.test.ts -t "should NOT return isStatusView when operation has terminal status COMPLETED"`
  - Result: PASS (current behavior reproduces terminal fallback design)

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record local state.
   - Command: `git status --short`
   - Expected output: current changed/untracked files listed.
   - Failure modes: not in repo.
   - Rollback: N/A.

2. Confirm migration env flags.
   - Command: `rg -n "REACT_APP_MIGRATION_" .env`
   - Expected output: migration flags incl. `REACT_APP_MIGRATION_HISTORY_ENABLED`.
   - Failure modes: missing `.env`, invalid key names.
   - Rollback: N/A.

### Phase 1 - Write tests first

1. Update flow tests for terminal persistence.
   - File: `src/hooks/migration/__tests__/useMigrationFlow.test.ts`
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationFlow.test.ts`
   - Expected output: FAIL before implementation.
   - Failure modes: stale mocks, wrong expected state.
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationFlow.test.ts`.

2. Add polling metadata propagation tests.
   - File: `src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Expected output: FAIL before implementation.
   - Failure modes: timer-related flakiness.
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`.

3. Add migrate page regression test.
   - File: `src/pages/Migrate/__tests__/Migrate.completion.test.tsx` (new)
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/pages/Migrate/__tests__/Migrate.completion.test.tsx`
   - Expected output: FAIL before implementation.
   - Failure modes: render/mocking complexity.
   - Rollback: `git checkout -- src/pages/Migrate/__tests__/Migrate.completion.test.tsx`.

### Phase 2 - Implement fix

1. Keep terminal operation in status view.
   - File: `src/hooks/migration/useMigrationFlow.ts`
   - Change: status view determined by existence of operation, not non-terminal check.
   - Command: `npm run build`
   - Expected output: build succeeds.
   - Failure modes: logic regressions in stepper transitions.
   - Rollback: `git checkout -- src/hooks/migration/useMigrationFlow.ts`.

2. Propagate completion metadata.
   - Files: `src/hooks/migration/useMigrationStatusPolling.ts`, `src/state/migration/types.ts`, `src/state/migration/slice.ts`
   - Change: map + store `destinationTxHash`, `completedAt`, and related fields.
   - Command: `npm run build`
   - Expected output: type-safe compile.
   - Failure modes: state typing mismatch.
   - Rollback: `git checkout -- <file>`.

3. Wire status panel inputs correctly.
   - File: `src/pages/Migrate/index.tsx`
   - Change: remove `destinationTxHash={null}`, stop hardcoding stake flag when backend value exists.
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/pages/Migrate/__tests__/Migrate.completion.test.tsx`
   - Expected output: test passes.
   - Failure modes: undefined metadata during early polls.
   - Rollback: `git checkout -- src/pages/Migrate/index.tsx`.

4. Validate staking-call parity behavior (test-level lock).
   - Backend files: `~/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts` and/or adapter tests
   - Command: `npm test -- src/worker/__tests__/transactionSubmitter.test.ts`
   - Expected output: staking path tests pass.
   - Failure modes: env/mocks drift in backend repo.
   - Rollback: `git checkout -- <backend test file>`.

### Phase 3 - Validate

1. Run targeted frontend migration suites.
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationFlow.test.ts src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Expected output: PASS.
   - Failure modes: outdated fixtures, timer behavior.
   - Rollback: revert recent migration changes.

2. Build frontend.
   - Command: `npm run build`
   - Expected output: successful production build.
   - Failure modes: type/build regression.
   - Rollback: revert offending commits.

3. Manual QA on testnet.
   - Steps: execute migrate flow, observe terminal panel persistence, verify tx links and completion text, then press `Start New Migration` and verify reset.
   - Expected output: no immediate empty-state after completion.
   - Failure modes: backend response timing, stale pending state.
   - Rollback: frontend revert.

### Phase 4 - Rollback Plan

**Triggers:** incorrect terminal UX, missing status data, migration regressions.

**Procedure:**
- Code: `git revert <commit>` (frontend and backend separately as needed)
- Deployment: redeploy previous known-good frontend bundle
- Config: keep `REACT_APP_MIGRATION_HISTORY_ENABLED=false` until verified

---

## 10) VERIFICATION CHECKLIST

- [ ] All targeted tests pass
- [ ] Build succeeds
- [ ] No regressions in bridge/yield/migrate flows
- [ ] Completed operation remains visible until explicit reset
- [ ] Empty-state no longer replaces active completed status session
- [ ] Staking execution path parity with Yield semantics validated

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 22:26:52 UTC | Reviewed migration flow/render/status files | Completed | Verified terminal status fallback path |
| 2026-02-25 22:26:52 UTC | Verified existing history/per-step links/Goliath balance implementation | Completed | Existing file scope was outdated |
| 2026-02-25 22:26:52 UTC | Ran targeted test for terminal status behavior | Completed | Test passes, confirming current behavior keeps `isStatusView=false` on `COMPLETED` |
| 2026-02-25 22:26:52 UTC | Reviewed staking call paths (yield + backend + adapter) | Completed | Backend uses `stakeFor`, adapter internally calls `stXCN.stake{value}` |

### Failed Attempts

- Attempt 1: None (report update only).

### Final State

- Changes made (diff summary): issue report updated to reflect verified current behavior and revised fix plan.
- Tests passing: targeted terminal-behavior test command passed.
- Deployment status: not deployed.
- Remaining risks / follow-ups:
  - Terminal status persistence is still not implemented in frontend code.
  - Completion metadata wiring remains partial in current page state.

---

## 12) FOLLOW-UPS

- [ ] Add telemetry for status-panel drop events (`COMPLETED` -> empty-state) to prevent regression.
- [ ] Decide whether to enable migration history flag in environments after terminal UX fix.
- [ ] Add end-to-end migration completion test covering unstake -> bridge -> stake -> completion persistence.
