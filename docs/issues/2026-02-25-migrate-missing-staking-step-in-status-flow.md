# Migrate Tab: Staking Step Missing During Active Migration Status Flow

**Project:** CoolSwap-interface
**Type:** Integration
**Priority:** P1
**Risk level:** High
**Requires deployment?:** Yes (frontend; optional backend follow-up)
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-missing-completion-feedback-and-history.md`
- `docs/issues/2026-02-25-migrate-staked-xcn-single-button-flow.md`
- User report: `"staking step is missed during migration process on the migrate tab"`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

During an in-flight migration on `/migrate`, the status timeline must always include the staking step when the migration intent requires staking. The UI must not skip directly from `Delivering on Goliath` to `Migration Complete` unless staking is truly not required.

**Must-have outcomes**

- [ ] Staking step is visible for stake-intent migrations from first status render through completion.
- [ ] `Migration Complete` is not shown as terminal success until staking is confirmed when `stakeOnGoliath=true`.
- [ ] A transient backend `stakeOnGoliath=false` or unlinked intent state cannot downgrade a known local `true` stake intent.

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: Migrate preference resolution keeps `stakeOnGoliath=true` when operation has `true` and polled data temporarily returns `false`.
- [ ] Test B: `MigrationStatusPanel` renders `stakingOnGoliath` step when effective stake intent is true.
- [ ] Test C: `MigrationStatusPanel` keeps `migrationComplete` pending while bridge is `COMPLETED` but client staking is not `confirmed`.
- [ ] Test D: Slice/polling merge test ensures `updateOperationStatus` does not downgrade `stakeOnGoliath` from `true` to `false` for the active operation.
- [ ] Test E: Integration regression reproduces `CONFIRMING -> AWAITING_RELAY -> COMPLETED` with temporary `stakeOnGoliath=false` and verifies staking step remains present.

**Non-goals**

- Smart contract changes or redeployments.
- Consensus, infra, or network-level changes.
- Full redesign of migration UI copy/layout.

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `CI=true npm test -- --watchAll=false`

### Deployment Details (if applicable)

- **Frontend:** CoolSwap interface deployment
- **Status API:** `GET /bridge/status?originTxHash=...`
- **Intent endpoints:**
  - `POST /migration/stake-preference`
  - `POST /migration/stake-preference/bind-origin`
- **Related backend repo (for option B):** `~/goliath/goliath-bridge-backend`

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Sepolia source chain for migration origin tx

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
- [ ] No breaking API contract changes without explicit backend alignment
- [ ] Preserve current successful migrate flows

### Operational Constraints

- Allowed downtime: none expected
- Blast radius: migration status view, stake-intent state merge, migration polling behavior

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User observes status timeline:
  - `Deposit Confirmed (0xc267...1541)`
  - `Waiting for Confirmations`
  - `Delivering on Goliath (0x9c2e...24ed)`
  - `Migration Complete`
- Expected intermediate staking step is missing in the same flow.
- The flow appears finished even though stake-intent migrations should require post-bridge staking.

### 4.2 Impact

- **User impact:** Users may believe staking happened when it did not, or may not see required staking action.
- **System impact:** Increased support load, inconsistent migration semantics, and possible unstaked funds on Goliath after bridge completion.
- **Scope:** Migrate page state resolution, status panel step construction, polling-to-store merge, intent-bind timing.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Migrate/index.tsx:143` | `resolvedStakeOnGoliath` | Polled `migrationFields.stakeOnGoliath` has higher precedence than local operation intent |
| `src/components/migration/MigrationStatusPanel.tsx:426-440` | `buildSteps` | Staking step only included when `stakeOnGoliath` is true |
| `src/components/migration/MigrationStatusPanel.tsx:653` | `isFullyCompleted` | Marks terminal success immediately when `stakeOnGoliath` is false |
| `src/hooks/migration/useMigrationStatusPolling.ts:124-126,150` | `pollStatus` | Persists backend `stakeOnGoliath` directly into UI fields/state each poll |
| `src/hooks/migration/useMigrationTransactions.ts:650-673` | `executeBridge` bind path | Intent binding is async fire-and-forget; failures are non-blocking and may leave backend association lagging |

### 4.4 Evidence

1. **Staking step is conditional and can disappear entirely when effective flag is false**

```ts
function buildSteps(stakeOnGoliath: boolean): StepConfig[] {
  const steps: StepConfig[] = [
    { id: StatusStep.DEPOSIT_CONFIRMED, labelKey: 'migration.status.depositConfirmed' },
    { id: StatusStep.WAITING_CONFIRMATIONS, labelKey: 'migration.status.waitingForConfirmations' },
    { id: StatusStep.DELIVERING_ON_GOLIATH, labelKey: 'migration.status.deliveringOnGoliath' },
  ];

  if (stakeOnGoliath) {
    steps.push({ id: StatusStep.STAKING_ON_GOLIATH, labelKey: 'migration.status.stakingOnGoliath' });
  }

  steps.push({ id: StatusStep.MIGRATION_COMPLETE, labelKey: 'migration.status.migrationComplete' });
  return steps;
}
```

Source: `src/components/migration/MigrationStatusPanel.tsx:426-443`

2. **Polled stake flag currently overrides local operation stake flag**

```ts
const resolvedStakeOnGoliath = migrationFields?.stakeOnGoliath ?? operation?.stakeOnGoliath ?? true;
```

Source: `src/pages/Migrate/index.tsx:143`

3. **Backend value is written into state on every successful poll (including `false`)**

```ts
if (response.stakeOnGoliath !== undefined) {
  fields.stakeOnGoliath = response.stakeOnGoliath;
}
...
dispatch(migrationActions.updateOperationStatus({
  ...,
  stakeOnGoliath: response.stakeOnGoliath,
  ...
}));
```

Source: `src/hooks/migration/useMigrationStatusPolling.ts:124-126,145-155`

4. **Intent-to-origin bind is asynchronous and non-blocking**

```ts
const bindPromise = retryBindOriginTxHash(intentId, signerAddress, depositTx.hash);
bindPromise.then(success => {
  if (!success) {
    ... // warning only
  }
});
```

Source: `src/hooks/migration/useMigrationTransactions.ts:652-673`

5. **Current tests pass for polling behavior but there is no direct regression coverage for status-panel stake-step omission**

- Command run: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
- Result: `PASS` (29/29)
- Search evidence: `rg -n "MigrationStatusPanel|resolvedStakeOnGoliath" src --glob "**/*test*"` returns no dedicated `MigrationStatusPanel` regression test.

### 4.5 Tasks

- `.memory-bank/tasks/2026-02-25-migrate-missing-staking-step-in-status-flow/task-001-add-regression-tests-for-stake-step-visibility.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-staking-step-in-status-flow/task-002-make-stake-intent-resolution-sticky.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-staking-step-in-status-flow/task-003-prevent-polling-downgrade-of-stake-flag.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-staking-step-in-status-flow/task-004-validate-status-panel-terminal-logic.md`
- `.memory-bank/tasks/2026-02-25-migrate-missing-staking-step-in-status-flow/task-005-qa-release-and-observability-checks.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

A state precedence bug allows polled backend `stakeOnGoliath` values to override the local signed migration intent, so the UI can treat stake-required operations as non-staking and omit the staking step.

### 5.2 Supporting Evidence

- Bridge flow sets local operation stake preference to `true` at creation time (`frozenStakePreference=true`).
- Polling logic merges backend `stakeOnGoliath` directly into both local fields and operation state.
- Migrate page resolves preference from `migrationFields` before `operation`.
- Status panel completely removes staking step when effective preference is false.
- Bind-origin is async non-blocking, so backend intent linkage can lag or fail while status polling continues.

### 5.3 Gaps / Items to Verify

- TO VERIFY: whether backend `/bridge/status` returns transient `stakeOnGoliath=false` during intent-link lag for affected hashes.
  - Command: `curl "$REACT_APP_BRIDGE_STATUS_API_URL/bridge/status?originTxHash=<originTxHash>" | jq '{status, stakeOnGoliath, stakingTxHash, stakingError}'`
  - Expected output: for stake-intent ops, `stakeOnGoliath` should be `true` (or omitted while unknown), never persistent false.
  - Failure modes: API unavailable, 404 before indexer catches up, missing `jq`.
  - Rollback: N/A (read-only command).

- TO VERIFY: whether bind-origin attempts are failing/retrying for affected operations.
  - Command: `kubectl -n <bridge-namespace> logs deploy/<bridge-deployment> --since=60m | rg -n "bind-origin|stake-preference|originTxHash"`
  - Expected output: successful bind events for each intent/origin pair in affected window.
  - Failure modes: missing kube context, insufficient RBAC, deployment name mismatch.
  - Rollback: N/A (read-only command).

- TO VERIFY: history API consistency for completed stake-intent operations.
  - Command: `curl "$REACT_APP_BRIDGE_STATUS_API_URL/migration/history?address=<wallet>&limit=10" | jq '.operations[] | {originTxHash,status,stakeOnGoliath,stakingTxHash,stakingError}'`
  - Expected output: completed stake-intent rows show `stakeOnGoliath=true` and non-null `stakingTxHash` (or explicit `stakingError`).
  - Failure modes: wallet has no matching operations, API pagination omissions.
  - Rollback: N/A (read-only command).

### 5.4 Root Cause (final)

- **Root cause:** Stake-intent source-of-truth is not sticky; backend polling can downgrade the flag used by the UI, and status rendering logic then drops the staking step and prematurely allows migration completion.
- **Contributing factors:**
  - Async non-blocking intent bind introduces a window where backend status may not yet reflect stake intent.
  - Missing regression tests for stake-step visibility and downgrade-prevention.
  - Status panel logic is strictly flag-driven and has no guard against contradictory state.

---

## 6) SOLUTIONS (compare options)

### Option A - Frontend Sticky Stake Intent (Recommended)

**Changes required**

- `src/pages/Migrate/index.tsx`
  - Resolve `stakeOnGoliath` from operation-first precedence (`operation` before `migrationFields`) for active operations.
- `src/state/migration/slice.ts`
  - Guard `updateOperationStatus` so an existing `stakeOnGoliath=true` is not downgraded to `false` by polling for the same operation.
- `src/components/migration/MigrationStatusPanel.tsx`
  - Keep current step rendering but rely on corrected effective flag.
- Tests:
  - Add `MigrationStatusPanel` regression tests.
  - Add Migrate/slice regression tests for downgrade prevention.

**Pros**

- Fastest fix in current repo.
- Eliminates user-visible step loss without waiting on backend release.
- Keeps behavior aligned with current frontend bridge flow (`frozenStakePreference=true`).

**Cons / risks**

- If backend intentionally returns `false` for some historical operations, frontend may keep local `true` until reset.
- Does not fix backend data contract inconsistency by itself.

**Complexity:** Medium
**Rollback:** Easy (frontend revert)

---

### Option B - Backend Contract Hardening for Status API

**Changes required**

- `~/goliath/goliath-bridge-backend`
  - Ensure `/bridge/status` does not default unknown stake intent to `false`.
  - Return `stakeOnGoliath` only when intent linkage is authoritative (or add explicit `intentLinked` field).
  - Add bind-origin observability and retry outcome metrics.
- `CoolSwap-interface`
  - Consume refined status contract (optional, minimal).

**Pros**

- Fixes source-of-truth at system boundary.
- Benefits all clients consuming status API.

**Cons / risks**

- Cross-repo coordination and deployment needed.
- Slower time-to-fix for frontend users.

**Complexity:** High
**Rollback:** Moderate

---

### Decision

**Chosen option:** A (Frontend Sticky Stake Intent), with Option B as follow-up hardening.

**Justification:**

Option A resolves the reported user-facing bug immediately inside `CoolSwap-interface`, with low deployment risk and clear test coverage additions. It directly addresses the precedence issue that allows staking-step omission.

**Accepted tradeoffs:**

- Frontend may temporarily prioritize local intent over contradictory backend `false` values.
- Backend data-contract cleanup remains a separate follow-up.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `src/pages/Migrate/index.tsx`
  - `src/state/migration/slice.ts`
  - `src/components/migration/MigrationStatusPanel.tsx` (only if needed for edge-case guard)
- [ ] Tests:
  - `src/components/migration/__tests__/MigrationStatusPanel.test.tsx` (new)
  - `src/state/migration/__tests__/slice.test.ts` (extend)
  - `src/__tests__/migration-integration.test.ts` (extend)
  - Optional: `src/pages/Migrate/__tests__/...` for resolution precedence
- [ ] Config changes: none expected
- [ ] Documentation: update this issue file during implementation
- [ ] Deployment: frontend release
- [ ] Monitoring/alerts: add/validate bind-origin and stake-intent mismatch logs

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:**
  - `src/components/migration/__tests__/MigrationStatusPanel.test.tsx`
  - `src/state/migration/__tests__/slice.test.ts`
  - `src/__tests__/migration-integration.test.ts`
- **Run command:** `CI=true npm test -- --watchAll=false --runInBand`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**

- [ ] Reducer test: preserve `operation.stakeOnGoliath=true` when polling payload has `stakeOnGoliath=false`.
- [ ] Status panel test: staking step visible when effective stake intent is true.
- [ ] Status panel test: `Migration Complete` stays pending until staking confirmation when stake intent is true.

**Integration tests (if applicable)**

- [ ] Migration integration test simulating temporary backend false and asserting no staking-step drop.

**E2E tests (if applicable)**

- [ ] Manual flow: run migration, confirm timeline includes staking stage between delivery and completion.

**Contract tests (if smart contract)**

- [ ] N/A (frontend issue)

### 8.3 Baseline

- Test run before fix: `CI=true npm test -- --watchAll=false --runInBand src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
  - Result: `PASS` (`29 passed, 0 failed`)
  - Note: no direct `MigrationStatusPanel` stake-step regression test exists yet.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state.
   - Command: `git status --short`
   - Expected output: existing dirty tree visible; no accidental reverts.
   - Failure modes: none significant.
   - Rollback: N/A (read-only).
2. Confirm relevant files and references.
   - Command: `rg -n "resolvedStakeOnGoliath|stakeOnGoliath|STAKING_ON_GOLIATH|bindOriginTxHash" src/pages/Migrate/index.tsx src/components/migration/MigrationStatusPanel.tsx src/hooks/migration/useMigrationStatusPolling.ts src/hooks/migration/useMigrationTransactions.ts src/state/migration/slice.ts`
   - Expected output: lines showing current precedence and step rendering logic.
   - Failure modes: path changes, renamed files.
   - Rollback: N/A (read-only).
3. Create branch.
   - Command: `git checkout -b codex/migrate-sticky-stake-intent`
   - Expected output: switched to new branch.
   - Failure modes: branch already exists.
   - Rollback: `git checkout -`.

### Phase 1 - Backup / Safety

1. Save patch of local modifications before touching files.
   - Command: `git diff > /tmp/coolswap-before-stake-step-fix.patch`
   - Expected output: patch file written.
   - Failure modes: disk permissions/full.
   - Rollback: restore with `git apply /tmp/coolswap-before-stake-step-fix.patch` if needed.

### Phase 2 - Write Tests First

1. Add reducer regression test for no-downgrade behavior.
   - File: `src/state/migration/__tests__/slice.test.ts`
   - Run: `CI=true npm test -- --watchAll=false --runInBand src/state/migration/__tests__/slice.test.ts -t "stakeOnGoliath downgrade"`
   - Expected: FAIL before reducer change.
   - Failure modes: test harness mismatch.
   - Rollback: `git checkout -- src/state/migration/__tests__/slice.test.ts`

2. Add status panel regression tests.
   - File: `src/components/migration/__tests__/MigrationStatusPanel.test.tsx`
   - Run: `CI=true npm test -- --watchAll=false --runInBand src/components/migration/__tests__/MigrationStatusPanel.test.tsx`
   - Expected: FAIL before logic fix.
   - Failure modes: i18n mocks/theme wrappers missing.
   - Rollback: `git checkout -- src/components/migration/__tests__/MigrationStatusPanel.test.tsx`

3. Add integration regression test for temporary backend false.
   - File: `src/__tests__/migration-integration.test.ts`
   - Run: `CI=true npm test -- --watchAll=false --runInBand src/__tests__/migration-integration.test.ts -t "temporary stakeOnGoliath false"`
   - Expected: FAIL before fix.
   - Failure modes: brittle state setup.
   - Rollback: `git checkout -- src/__tests__/migration-integration.test.ts`

### Phase 3 - Implement the Fix

1. Make stake intent resolution operation-first.
   - File: `src/pages/Migrate/index.tsx:143`
   - Change: resolve as `operation?.stakeOnGoliath ?? migrationFields?.stakeOnGoliath ?? true`.
   - Build: `npm run build`
   - Expected: build succeeds.
   - Verify: status panel keeps staking step during active operation.
   - Rollback: `git checkout -- src/pages/Migrate/index.tsx`

2. Prevent reducer downgrade from true -> false.
   - File: `src/state/migration/slice.ts:updateOperationStatus`
   - Change: apply guard when existing operation stake flag is `true`.
   - Build: `npm run build`
   - Expected: typecheck/build succeeds.
   - Verify: reducer test passes.
   - Rollback: `git checkout -- src/state/migration/slice.ts`

3. Keep polling behavior compatible with guarded state merge.
   - File: `src/hooks/migration/useMigrationStatusPolling.ts`
   - Change: optional comment/clarification only unless test reveals additional adjustment needed.
   - Build: `npm run build`
   - Expected: no behavior regression.
   - Verify: polling tests pass.
   - Rollback: `git checkout -- src/hooks/migration/useMigrationStatusPolling.ts`

### Phase 4 - Validate

1. Run targeted suites.
   - Command: `CI=true npm test -- --watchAll=false --runInBand src/state/migration/__tests__/slice.test.ts src/components/migration/__tests__/MigrationStatusPanel.test.tsx src/__tests__/migration-integration.test.ts src/hooks/migration/__tests__/useMigrationStatusPolling.test.ts`
   - Expected output: all pass.
   - Failure modes: flaky async timers, missing mocks.
   - Rollback: revert last commit or per-file checkout.

2. Run lint/build.
   - Command: `npm run build`
   - Expected output: successful build artifacts.
   - Failure modes: TS errors, unrelated existing repo issues.
   - Rollback: revert changed files.

3. Manual verification.
   - Command: `npm start` (then test `/migrate` with stake-intent flow)
   - Expected output: staking step present between delivery and completion.
   - Failure modes: wallet/network unavailable locally.
   - Rollback: stop dev server; no state mutation required.

### Phase 5 - Deploy (if applicable)

1. Ship frontend build through existing CI/CD.
2. Post-deploy verify with one fresh migration and one resumed migration.
3. Monitor for 30 minutes for stake-intent mismatch reports.

### Phase 6 - Rollback Plan

**Triggers:**
- New regressions in migrate status flow.
- Unexpected mismatch between UI and backend status records.

**Procedure:**
- Code: revert the fix commit(s) and redeploy prior frontend artifact.
- Deployment: rollback via hosting platform to previous stable release.
- Data: N/A (frontend-only).

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing migration flow
- [ ] Code review completed (or self-reviewed)
- [ ] Deployed and verified (if applicable)
- [ ] Monitoring/log checks show healthy stake-intent mapping

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 23:09:25 UTC | Inspected migrate status flow and stake-intent paths in frontend files | Success | Located precedence and conditional-render paths that can hide staking step |
| 2026-02-25 23:09:25 UTC | Ran focused baseline test suite for polling hook | Success | `useMigrationStatusPolling` suite passed (29/29), no stake-step regression coverage |
| 2026-02-25 23:09:25 UTC | Drafted issue analysis and TDD implementation plan | Success | Report-only mode, no app code changes |

### Failed Attempts

- Attempt 1: N/A (report-only investigation)
  - Why it failed: N/A
  - What we learned: N/A

### Final State

- Changes made (diff summary): Added issue report + task decomposition files only.
- Tests passing: Baseline polling suite passing (`29 passed`).
- Deployment status: Not deployed (analysis/report only).
- Remaining risks / follow-ups:
  - Backend status contract may still emit contradictory values.
  - Missing end-to-end coverage for bind-lag race until tests are added.

---

## 12) FOLLOW-UPS

- [ ] Add/update tests for race conditions around bind-origin lag
- [ ] Align backend status API semantics for unknown vs false stake intent
- [ ] Add monitoring/alerting for stake-intent mismatch (`operation=true`, polled=false)
- [ ] Audit migration history rendering for stake-intent consistency
