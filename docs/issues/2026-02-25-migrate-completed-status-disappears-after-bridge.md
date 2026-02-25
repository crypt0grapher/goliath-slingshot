# Migrate Tab Drops Completed Bridge Into Empty State ("No XCN to migrate")

**Project:** CoolSwap-interface
**Type:** Integration
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend)
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `/Users/alex/goliath/staking/.memory-bank/PRD-XCN-Bridge.md`
- `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Frontend.md`
- `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Backend.md`
- `/Users/alex/goliath/staking/.memory-bank/PRD-stXCN-Liquid-Staking.md`
- `/Users/alex/goliath/staking/.memory-bank/TID-stXCN-Frontend.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

After a migration bridge reaches `COMPLETED`, `/migrate` must continue showing a clear terminal status state (success + explorer links + completion time) instead of falling to "No XCN to migrate," so users can verify completion and safely continue.

**Must-have outcomes**

- [ ] Completed migration for a connected wallet remains visible in a status/success panel on `/migrate` until user explicitly starts a new migration.
- [ ] UI shows when migration completed (`timestamps.completedAt`) and destination verification details.
- [ ] UX matches bridge-status expectations from PRD FR-030..FR-034 (status tracking parity and explicit completion state).

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `deriveSteps()` keeps `isStatusView=true` for terminal operations that still exist in migration operation state (until explicit clear).
- [ ] Test B: `useMigrationStatusPolling` captures and propagates destination/completion metadata (`destinationTxHash`, `completedAt`, `stakeOnGoliath`) needed by the terminal UI.
- [ ] Test C: `/migrate` renders completed status panel (not empty state) for a wallet with `snapshot.staked=0`, `snapshot.walletXcn=0`, and operation status `COMPLETED`.

**Non-goals**

- Changing relayer settlement behavior on backend.
- Contract deployment or staking contract upgrades.
- Refactoring legacy `/bridge` UX flows beyond compatibility checks.

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
- **Backend API base (from frontend env):** `https://testnet.mirrornode.goliath.net/bridge/api/v1`
- **Migration endpoints used:**
  - `GET /bridge/status?originTxHash=...`
  - `GET /migration/history?address=...&limit=...&offset=...`
- **Contract addresses (frontend env):**
  - Sepolia XCN: `0x7a8adc542A35c93da263A188367F4bF4c445B8E9`
  - Sepolia staking: `0xc50B664BA11F5558b8FF7358bb7C576542655D54`

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

- Allowed downtime: none expected
- Blast radius: migration UI (`/migrate`), migration state/hooks, migration i18n copy, optional env flag behavior

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User completes `Bridge to Goliath` on `/migrate`, then UI disappears from status context and shows "No XCN to migrate."
- User cannot verify completion details from same tab and interprets this as an error-like state.
- No obvious way to confirm completion timestamp and destination transaction from migration page in current config.

### 4.2 Impact

- **User impact:** High confusion; users may retry or abandon flow despite successful delivery.
- **System impact:** Increased support burden and possible duplicate user actions.
- **Scope:** Frontend migration flow derivation, status polling data mapping, status presentation, and history visibility.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationFlow.ts` | `deriveSteps` | Terminal operation statuses intentionally exit status view, causing fallback to empty state when balances are zero. |
| `src/pages/Migrate/index.tsx` | `Migrate` render logic | Status panel only renders when `isStatusView=true`; passes `destinationTxHash={null}` and hardcodes `stakeOnGoliath=true`. |
| `src/hooks/migration/useMigrationStatusPolling.ts` | `useMigrationStatusPolling` | Polling updates only subset of migration fields and stops immediately on terminal status; does not expose completion/destination metadata to page state. |
| `src/components/migration/MigrationHistoryPanel.tsx` | `MigrationHistoryPanel` | Entire history panel is hidden when `migrationConfig.historyEnabled=false`. |
| `src/config/migrationConfig.ts` + `.env` | `historyEnabled` flag | Current environment has migration history disabled, removing persistent verification fallback. |
| `~/goliath/goliath-bridge-backend/src/api/routes/migration.ts` | `/migration/history` | Backend already provides historical completed operations including timestamps/tx hashes. |
| `~/goliath/goliath-bridge-backend/src/api/routes/bridge.ts` | `formatOperationResponse` | Backend status API already returns `timestamps.completedAt`, `destinationTxHash`, and staking metadata. |

### 4.4 Evidence

1. **Product intent requires completion-state visibility on `/migrate`**
   - PRD requires automatic status tracking and completion confirmation (`FR-030`..`FR-034`), including destination verification links and success state.
   - Source: `PRD-XCN-Bridge.md` lines 270-275.

2. **Frontend currently drops status view on terminal statuses**
   - `deriveSteps` only enables status view for non-terminal operations:
     - `if (operation && !TERMINAL_STATUSES.has(operation.status)) { ... isStatusView: true }`
     - Source: `src/hooks/migration/useMigrationFlow.ts:59-66`
   - Existing test suite codifies this behavior:
     - "should NOT return isStatusView when operation has terminal status COMPLETED"
     - Source: `src/hooks/migration/__tests__/useMigrationFlow.test.ts:100-109`

3. **`/migrate` page cannot show full terminal data even when status panel renders**
   - `stakeOnGoliath` is hardcoded (`const stakeOnGoliath = true`), not read from backend operation data.
     - Source: `src/pages/Migrate/index.tsx:70-71`
   - `destinationTxHash` is passed as `null` to `MigrationStatusPanel`.
     - Source: `src/pages/Migrate/index.tsx:258`
   - Completed state message has no completion timestamp display path in panel.
     - Source: `src/components/migration/MigrationStatusPanel.tsx:697-714`

4. **History fallback is present in code but disabled by feature flag**
   - History hook fetches only when `migrationConfig.historyEnabled=true`.
     - Source: `src/hooks/migration/useMigrationApi.ts:98-100`, `119`, `155`
   - History component returns `null` when flag is off.
     - Source: `src/components/migration/MigrationHistoryPanel.tsx:389-392`
   - Local env currently sets `REACT_APP_MIGRATION_HISTORY_ENABLED=false`.
     - Source: `.env:58-61`

5. **Backend already provides needed completion data (live evidence for target wallet)**
   - Wallet: `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`
   - `GET /migration/history?address=...` returned 2 `COMPLETED` XCN operations with full timestamps and tx hashes.
   - Latest completion:
     - `originTxHash`: `0x86521f661b3521b7efa089c71ab90f16f5db9c58253c98c7a5d5f5cab1e6f280`
     - `destinationTxHash`: `0x948fd83e08d9a16d332ee0dbe79361a42d992c87761761a8ccb4a44216922ce8`
     - `completedAt`: `2026-02-25T20:00:02.725Z`
     - `status`: `COMPLETED`
   - `GET /bridge/status?originTxHash=...` returns same completion metadata.

6. **On-chain verification confirms successful delivery**
   - Sepolia origin tx receipt (`eth_getTransactionReceipt`) status: `0x1`.
   - Goliath destination tx receipt status: `0x1`.

7. **Current tests pass while preserving buggy UX behavior**
   - `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationFlow.test.ts` → PASS (includes assertions that terminal status exits status view).

### 4.5 Tasks

Task files generated for implementation:

- `.memory-bank/tasks/2026-02-25-migrate-completed-status-disappears-after-bridge/task-001-regression-tests-terminal-status-view.md`
- `.memory-bank/tasks/2026-02-25-migrate-completed-status-disappears-after-bridge/task-002-operation-status-payload-extension.md`
- `.memory-bank/tasks/2026-02-25-migrate-completed-status-disappears-after-bridge/task-003-terminal-status-ui-persistence.md`
- `.memory-bank/tasks/2026-02-25-migrate-completed-status-disappears-after-bridge/task-004-completion-details-and-history-visibility.md`
- `.memory-bank/tasks/2026-02-25-migrate-completed-status-disappears-after-bridge/task-005-wallet-verification-and-release-qa.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

Migration UI intentionally treats terminal operations as no longer "status view" and immediately re-derives from current balances; once balances are zero after successful bridge, UI falls into empty-state branch and hides completion context.

### 5.2 Supporting Evidence

- Terminal status branch in `deriveSteps` disables status view (`useMigrationFlow.ts:59-67`).
- Migrate render shows empty-state when `!isStatusView && isEmpty` (`Migrate/index.tsx:228-236`).
- Tests explicitly validate terminal fallback behavior (`useMigrationFlow.test.ts:100-109`, `537-562`).
- Backend response includes completion metadata that frontend does not fully consume (`migrationApi.ts:56-65`, `bridge.ts:129-145`).
- History fallback is gated off in current environment (`.env:61`).

### 5.3 Gaps / Items to Verify

- TO VERIFY: Confirm deployed production/staging values for `REACT_APP_MIGRATION_HISTORY_ENABLED`.
  - Command: `printenv | rg "REACT_APP_MIGRATION_(ENABLED|HISTORY_ENABLED|STATUS_POLL_MS)"`
- TO VERIFY: Confirm whether wallet operations with `stakeOnGoliath=false` were initiated from `/bridge` (no intent) vs `/migrate` with failed intent binding.
  - Command (backend DB): `SELECT id, origin_tx_hash, stake_on_goliath, staking_tx_hash, staking_error, created_at FROM bridge_operations WHERE sender='0xe3596d206be5de55ba8d774f131d9e3f31faa78d' ORDER BY created_at DESC;`
  - Command (backend DB): `SELECT id, sender_address, bound_origin_tx_hash, state, consumed_at FROM stake_intents WHERE sender_address='0xe3596d206be5de55ba8d774f131d9e3f31faa78d' ORDER BY created_at DESC;`
- TO VERIFY: Confirm final UX requirement for showing terminal status after page refresh when local pending entry has already been cleared.

### 5.4 Root Cause (final)

- **Root cause:** Frontend migration flow design exits terminal status tracking too early and lacks a persistent terminal-status presentation path.
- **Contributing factors:**
  - Terminal-status behavior is encoded in unit tests (regression locked in).
  - Migration status hook does not carry all completion metadata into UI state.
  - History panel is feature-gated off in current environment.
  - `stakeOnGoliath` is hardcoded in page layer, causing possible mismatch with backend truth.

---

## 6) SOLUTIONS (compare options)

### Option A - Terminal-Status-First Flow (Recommended)

**Changes required**

- `src/hooks/migration/useMigrationFlow.ts`
  - Keep `isStatusView=true` for existing `operation` until explicit user reset (`Start New Migration`).
- `src/state/migration/types.ts` + `src/state/migration/slice.ts`
  - Extend `MigrationOperation` to include terminal UI fields (`destinationTxHash`, `completedAt`, `stakeOnGoliath`, optional `amountFormatted`).
- `src/hooks/migration/useMigrationStatusPolling.ts`
  - Map and dispatch completion metadata from `/bridge/status` response.
  - Align stop-poll semantics to avoid dropping destination hash in terminal edge timing.
- `src/pages/Migrate/index.tsx`
  - Remove hardcoded `stakeOnGoliath=true`; use backend/operation value.
  - Pass destination/completion fields to status panel.
- `src/components/migration/MigrationStatusPanel.tsx`
  - Display completed-at timestamp and destination verification link in terminal section.

**Pros**

- Directly solves user-facing confusion on same screen.
- Closest alignment with PRD FR-030..FR-034 and bridge-tab parity.
- Does not require backend changes.

**Cons / risks**

- Requires updates across multiple migration state/hook/UI files.
- Must update existing tests that currently encode terminal fallback behavior.

**Complexity:** Medium  
**Rollback:** Easy (frontend-only revert)

---

### Option B - History-First Verification Path

**Changes required**

- Enable `REACT_APP_MIGRATION_HISTORY_ENABLED=true` in target environment.
- Keep existing terminal fallback, but add explicit "Latest migration result" card sourced from `/migration/history` when no active operation is present.

**Pros**

- Smaller change to core flow logic.
- Uses existing backend phase-2 endpoint and data contract.

**Cons / risks**

- Still weaker than direct terminal status continuity (status panel disappears immediately after completion).
- Depends on env rollout discipline and history API availability.
- Less parity with existing `/bridge` status UX.

**Complexity:** Low-Medium  
**Rollback:** Easy

---

### Decision

**Chosen option:** Option A (with Option B as additive follow-up)  
**Justification:** Option A addresses the primary bug exactly where users experience it (status continuity on `/migrate`) and uses already-available backend fields. Option B alone is not sufficient for in-session continuity expectations.  
**Accepted tradeoffs:** Moderate frontend refactor and test updates in migration domain.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `src/hooks/migration/useMigrationFlow.ts`
  - `src/hooks/migration/useMigrationStatusPolling.ts`
  - `src/pages/Migrate/index.tsx`
  - `src/components/migration/MigrationStatusPanel.tsx`
  - `src/state/migration/types.ts`
  - `src/state/migration/slice.ts`
  - optional: `src/hooks/migration/useMigrationApi.ts`, env docs
- [ ] Tests:
  - `src/hooks/migration/__tests__/useMigrationFlow.test.ts`
  - `src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
  - add/update migrate page/component tests
- [ ] Config changes:
  - environment rollout decision for `REACT_APP_MIGRATION_HISTORY_ENABLED`
- [ ] Documentation:
  - migration runbook + env flag guidance
- [ ] Deployment:
  - frontend redeploy
- [ ] Monitoring/alerts:
  - optional frontend telemetry for status-to-empty-state transitions

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/`, migration page/component test files
- **Run command:** `CI=true npm test -- --watchAll=false`
- **Framework:** Jest (react-app-rewired)

### 8.2 Required Tests

**Unit tests**

- [ ] `deriveSteps` keeps status view for terminal operation objects until explicit clear action.
- [ ] `MigrationOperation` reducer updates include destination/completed/stake fields.
- [ ] Status panel renders completion timestamp and destination tx link when provided.

**Integration tests (if applicable)**

- [ ] `/migrate` renders completed status panel with zero balances + completed operation state.
- [ ] `Start New Migration` clears operation and returns to snapshot-derived flow.

**E2E tests (if applicable)**

- [ ] Manual: bridge via `/migrate`, wait for `COMPLETED`, verify status remains visible and shows completion time.
- [ ] Manual: refresh after completion; verify designed persistence behavior (status panel or latest-history fallback).

**Contract tests (if smart contract)**

- [ ] N/A for this issue.

### 8.3 Baseline

- Test run before fix:
  - `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationFlow.test.ts` → PASS (includes terminal fallback behavior that causes this bug).
  - `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts` → PASS.
  - Backend contract tests for status/history endpoints:
    - `npm test -- src/api/routes/__tests__/migrationHistory.test.ts src/api/routes/__tests__/migration.test.ts src/api/routes/__tests__/bridge.test.ts` → PASS in `~/goliath/goliath-bridge-backend`.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state.
   - Command: `git status --short`
   - Expected output: Dirty tree listed; no unexpected file deletions.
   - Failure modes: command fails if not in repo.
   - Rollback: N/A (read-only).

2. Confirm migration env flags and API base.
   - Command: `rg -n "REACT_APP_MIGRATION_|REACT_APP_BRIDGE_STATUS_API_URL" .env`
   - Expected output: migration flags + API base values.
   - Failure modes: missing `.env` or missing keys.
   - Rollback: N/A.

### Phase 1 - Backup / Safety

1. Create working branch.
   - Command: `git checkout -b codex/fix-migrate-terminal-status-persistence`
   - Expected output: branch created/switch success.
   - Failure modes: branch exists.
   - Rollback: `git checkout <previous-branch>` then `git branch -D codex/fix-migrate-terminal-status-persistence`.

### Phase 2 - Write Tests First

1. Update `useMigrationFlow` tests to assert terminal status stays in status view (new desired behavior).
   - File: `src/hooks/migration/__tests__/useMigrationFlow.test.ts`
   - Run: `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationFlow.test.ts`
   - Expected: FAIL before implementation.
   - Failure modes: false-positive pass indicates test not strict enough.
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationFlow.test.ts`

2. Add polling/state tests for destination/completion field propagation.
   - File: `src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Run: `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Expected: FAIL before implementation.
   - Failure modes: flaky timer assertions.
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`

3. Add migrate page/component regression test: completed op + zero balances should show status panel (not empty state).
   - File: add/update migration page/component test file.
   - Run: targeted `npm test` command for added test.
   - Expected: FAIL before implementation.
   - Failure modes: brittle mock setup.
   - Rollback: checkout changed test file(s).

### Phase 3 - Implement the Fix

1. Extend migration operation model.
   - Files:
     - `src/state/migration/types.ts`
     - `src/state/migration/slice.ts`
   - Change: Add destination/completion/stake fields and reducer updates.
   - Build: `npm run build`
   - Expected: type-safe compile.
   - Verify: reducers preserve existing behavior while accepting new payload fields.
   - Rollback: `git checkout -- <file>`

2. Wire backend status metadata through polling hook.
   - File: `src/hooks/migration/useMigrationStatusPolling.ts`
   - Change: map `destinationTxHash`, `timestamps.completedAt`, `stakeOnGoliath`; adjust terminal polling semantics if needed.
   - Build/Test: run targeted polling tests.
   - Expected: new tests pass.
   - Verify: no regressions in existing terminal stop logic for failed/expired.
   - Rollback: checkout file.

3. Keep terminal operations in status view until explicit clear.
   - File: `src/hooks/migration/useMigrationFlow.ts`
   - Change: status-view derivation to avoid immediate fallback for terminal operation object.
   - Test: run `useMigrationFlow` test suite.
   - Expected: new desired assertions pass.
   - Verify: non-terminal and null-operation paths unchanged.
   - Rollback: checkout file.

4. Update migrate page wiring and terminal display details.
   - Files:
     - `src/pages/Migrate/index.tsx`
     - `src/components/migration/MigrationStatusPanel.tsx`
   - Change: remove hardcoded `stakeOnGoliath=true`; pass operation/polling metadata; render completion date/time + destination tx link.
   - Test: run migration component/page tests.
   - Expected: status panel renders with completion metadata.
   - Rollback: checkout files.

5. Optional fallback enhancement (recommended phase-2 hardening).
   - Files: `src/hooks/migration/useMigrationApi.ts`, `src/components/migration/MigrationHistoryPanel.tsx`, env docs.
   - Change: ensure visible verification path when no active operation remains.
   - Verify: history entries render with date/status/tx links.
   - Rollback: checkout files and revert env toggle.

### Phase 4 - Validate

1. Run migration-focused tests.
   - Command: `CI=true npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationFlow.test.ts src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Expected output: PASS with updated expectations.
   - Failure modes: mock drift, timing flakiness.
   - Rollback: revert offending changes and re-run.

2. Run build.
   - Command: `npm run build`
   - Expected output: successful production build.
   - Failure modes: TS errors, lint-level compile errors.
   - Rollback: revert recent code edits and rerun.

3. Manual verification with provided wallet.
   - Steps:
     - Connect wallet `0xe359...` on Sepolia.
     - Open `/migrate` and confirm completed operation visibility.
     - Verify completion timestamp and explorer links.
   - Expected: no immediate drop to empty-only state after completion.
   - Failure modes: stale localStorage, wrong network.
   - Rollback: clear migration localStorage entry and retry.

### Phase 5 - Deploy (if applicable)

1. Deploy frontend build to staging.
2. Validate with live `/bridge/status` and `/migration/history` responses.
3. Promote to production after QA signoff.

### Phase 6 - Rollback Plan

**Triggers:**
- Migration page fails to load, terminal statuses mis-render, or regressions on bridge/yield tabs.

**Procedure:**
- Code: `git revert <commit>` (or revert deployment artifact).
- Deployment: redeploy previous known-good frontend build.
- Config: set `REACT_APP_MIGRATION_HISTORY_ENABLED=false` if history rollout causes issues.

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
| 2026-02-25 20:18:17 UTC | Inspected migration flow/state/status code paths in frontend | Completed | Confirmed terminal fallback behavior and missing completion metadata wiring |
| 2026-02-25 20:18:17 UTC | Queried live migration API for wallet `0xe359...` | Completed | Two completed operations returned with `completedAt` and tx hashes |
| 2026-02-25 20:18:17 UTC | Queried `/bridge/status` by origin hash | Completed | Backend response includes required status/timestamp fields |
| 2026-02-25 20:18:17 UTC | Verified origin/destination tx receipts on Sepolia/Goliath | Completed | Both receipts show `status: 0x1` |
| 2026-02-25 20:18:17 UTC | Ran targeted frontend migration tests | Completed | Existing tests pass and currently encode terminal fallback behavior |
| 2026-02-25 20:18:17 UTC | Ran targeted backend migration/bridge route tests | Completed | Endpoint contracts validated by test suite |

### Failed Attempts

- Attempt 1: None (report-only investigation).

### Final State

- Changes made (diff summary): Report-only; no product code changed.
- Tests passing: Confirmed for targeted frontend and backend suites listed above.
- Deployment status: Not deployed.
- Remaining risks / follow-ups:
  - Terminal status UX remains unresolved until implementation plan is executed.
  - `stakeOnGoliath=false` for investigated wallet operations needs backend intent-path verification.

---

## 12) FOLLOW-UPS

- [ ] Add/update tests for terminal status persistence and completion metadata rendering.
- [ ] Decide and document history flag rollout strategy per environment.
- [ ] Add lightweight telemetry for migrate terminal-state transitions and empty-state fallthrough.
- [ ] Audit migration/yield integration path for `stakeOnGoliath` truth propagation.
