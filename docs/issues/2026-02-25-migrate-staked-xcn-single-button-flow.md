# Migrate Staked XCN: One-Button Automated Flow with Tracked Steps

**Project:** CoolSwap-interface
**Type:** Feature
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:** `docs/issues/2026-02-25-migrate-chn-spelling-and-bridge-step-failure.md`, `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The Migrate UX uses a single start button for the full migration sequence, tracks step progress automatically, and clearly explains that the process moves staked XCN from Ethereum (Sepolia) to Goliath while collecting wallet signatures at each required transaction.

**Must-have outcomes**

- [x] Remove step-by-step user choice actions and use one orchestrated CTA
- [x] Keep tracked step visibility (waiting signature, pending, confirmed, failed)
- [x] Rename page header to `Migrate Staked XCN`

**Acceptance criteria (TDD)**

Tests expected to fail before and pass after:

- [x] `MigrationStepper` renders one automation button and no per-step action buttons
- [x] `MigrationStepper` runs steps sequentially from one click and halts on failure
- [x] Existing migration integration suite remains green

**Non-goals**

- Implementing gasless / batch-signature architecture (EIP-4337/session keys)
- Backend bridge protocol redesign

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux, ethers.js
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test -- --watchAll=false <test-file>`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A
- **Deployment name:** Frontend web app
- **Docker image:** N/A
- **RPC endpoints:** Sepolia + Goliath endpoints from frontend config
- **Contract addresses:** From `migrationConfig` and `bridgeConfig`

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: 104.238.187.163 (`lon`)

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [x] Do NOT delete `.pces` files (consensus loss risk)
- [x] Do NOT flush iptables on remote servers
- [x] Do NOT expose private keys or secrets in issue files
- [x] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [x] All changes must pass existing tests
- [x] New functionality must include tests
- [x] Smart contract changes require careful review of upgrade path
- [x] Breaking API changes must be documented

### Operational Constraints

- Allowed downtime: none
- Blast radius: Migrate page UI + migration transaction orchestration logic

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Migrate flow exposed step-level actions that felt like manual choices rather than one guided process.
- Requested UX requires one-button orchestration with tracked step status.
- Potential stale-balance edge case exists when bridging immediately after unstake.

### 4.2 Impact

- **User impact:** More clicks and ambiguity around required sequence; higher chance of incorrect timing between unstake and bridge.
- **System impact:** No data loss, but increased UX friction and increased failure probability from stale snapshot timing.
- **Scope:** Migrate page UI, stepper interaction model, bridge amount resolution path.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/components/migration/MigrationStepper.tsx` | `MigrationStepper` | Manual per-step controls instead of one-button orchestrator |
| `src/components/migration/MigrationStepItem.tsx` | `MigrationStepItem` | Action-oriented rendering needed tracking-only mode |
| `src/hooks/migration/useMigrationTransactions.ts` | `executeBridge` | Could rely on stale `snapshot.walletXcn` right after unstake |
| `src/pages/Migrate/index.tsx` | `Migrate` | Header/copy did not explain automated process explicitly |
| `public/locales/en.json` | migration i18n keys | Missing one-button and process explanation text |

### 4.4 Evidence

- Stepper now renders one CTA (`migration.stepper.automationStart/Continue`) and tracks statuses.
- `executeBridge` now falls back to live `balanceOf` read if snapshot balance is zero.
- Regression tests passed:
  - `src/components/migration/__tests__/MigrationStepper.test.tsx`
  - `src/components/migration/__tests__/MigrationStepItem.test.tsx`
  - `src/__tests__/migration-integration.test.ts`

### 4.5 Tasks

Task files generated:

- `.memory-bank/tasks/2026-02-25-migrate-staked-xcn-single-button-flow/task-001-migrate-header-and-automation-copy.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-xcn-single-button-flow/task-002-single-button-tracked-stepper.md`
- `.memory-bank/tasks/2026-02-25-migrate-staked-xcn-single-button-flow/task-003-bridge-balance-fallback-and-tests.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The Migrate UI evolved around step-level transaction handlers but lacked a higher-level orchestrator and explicit UX framing for the end-to-end automated migration intent.

### 5.2 Supporting Evidence

- Existing transaction handlers were already deterministic and sequenced, but invoked manually by per-step buttons.
- Step state model already supported tracking; missing piece was orchestration layer.
- Bridge amount depended on snapshot state that may lag immediately after unstake/refetch.

### 5.3 Gaps / Items to Verify

- TO VERIFY: user acceptance in live wallet UX with real signature prompts on Sepolia.
- TO VERIFY: telemetry on drop-off reduction after one-button flow release.

### 5.4 Root Cause (final)

- **Root cause:** UI interaction model required per-step user execution rather than orchestrating existing step handlers from a single trigger.
- **Contributing factors:** No explicit “signature constraints” explanation; bridge step coupled to potentially stale in-memory balance.

---

## 6) SOLUTIONS (compare options)

### Option A - One-button orchestrator with tracking-only steps (implemented)

**Changes required**
- `src/components/migration/MigrationStepper.tsx` - Add orchestration loop + single CTA + global error
- `src/components/migration/MigrationStepItem.tsx` - Add `actionMode="tracking"` behavior
- `src/hooks/migration/useMigrationTransactions.ts` - Add live balance fallback before bridge
- `src/pages/Migrate/index.tsx` + `styleds.tsx` - Add process explanation card + header rename
- `public/locales/en.json` - Add new copy keys

**Pros**
- Meets one-button UX requirement
- Keeps transparent tracked steps
- Preserves safety model (user confirms each wallet signature)

**Cons / risks**
- Still requires multiple wallet confirmations (cannot pre-sign all txs in one popup)
- Slightly more orchestration logic in client UI

**Complexity:** Medium
**Rollback:** Easy

---

### Option B - Keep manual step execution, remove only stake-auto choice

**Changes required**
- Remove stake toggle UI/copy only
- Keep current per-step execution buttons

**Pros**
- Lowest implementation risk
- Minimal code changes

**Cons / risks**
- Does not satisfy one-button UX requirement
- Keeps higher user effort and potential sequencing mistakes

**Complexity:** Low
**Rollback:** Easy

---

### Decision

**Chosen option:** A
**Justification:** Meets product requirement while staying compatible with wallet signature constraints and existing transaction pipeline.
**Accepted tradeoffs:** Multiple signatures remain unavoidable due wallet security and nonce/transaction semantics.

---

## 7) DELIVERABLES

- [x] Code changes: `MigrationStepper`, `MigrationStepItem`, `Migrate/index`, `Migrate/styleds`, `useMigrationTransactions`, locale updates
- [x] Tests: added `MigrationStepper.test.tsx`, validated existing migration suites
- [x] Config changes: none
- [x] Documentation: this issue file + task decomposition
- [ ] Deployment: pending
- [ ] Monitoring/alerts: optional post-release UX telemetry

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/components/migration/__tests__/MigrationStepper.test.tsx`
- **Run command:** `npm test -- --watchAll=false src/components/migration/__tests__/MigrationStepper.test.tsx`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [x] Single automation button rendered (no per-step action buttons)
- [x] Sequential execution order from one click
- [x] Stop on failed step and show error

**Integration tests (if applicable)**
- [x] `src/__tests__/migration-integration.test.ts` remains green

**E2E tests (if applicable)**
- [ ] Manual wallet verification on Sepolia

**Contract tests (if smart contract)**
- [ ] N/A

### 8.3 Baseline

- Test run before fix: not recorded in this cycle (assumed failing relative to new one-button expectations)

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Inspect migrate flow components and translation keys.
2. Confirm current signature and step execution model.
3. Verify project build/test commands.

### Phase 1 - Backup / Safety

1. No destructive operations; local code-only refactor.
2. Rollback via `git checkout -- <file>` for touched files.

### Phase 2 - Write Tests First

1. Add `MigrationStepper` orchestration tests.
2. Verify expected one-button behavior and fail-fast condition.

### Phase 3 - Implement the Fix

1. Add single-button orchestrator in `MigrationStepper`.
2. Convert `MigrationStepItem` to tracking mode support.
3. Add process explanation card and header rename in Migrate page.
4. Add live-balance fallback for bridge amount resolution.
5. Update i18n keys for automated flow copy.

### Phase 4 - Validate

1. `npm test -- --watchAll=false src/components/migration/__tests__/MigrationStepper.test.tsx` (pass)
2. `npm test -- --watchAll=false src/components/migration/__tests__/MigrationStepItem.test.tsx` (pass)
3. `npm test -- --watchAll=false src/__tests__/migration-integration.test.ts` (pass)
4. `npm run build` (pass with unrelated existing eslint warnings)

### Phase 5 - Deploy (if applicable)

1. Merge and release frontend build.
2. Verify one-click migration in staging/production wallet flow.

### Phase 6 - Rollback Plan

**Triggers:** Unexpected migration UX regressions or bridge step failures increase.
**Procedure:**
- Code: revert touched migration UI files and hook changes.
- Deployment: redeploy previous frontend artifact.
- Contract: N/A.

---

## 10) VERIFICATION CHECKLIST

- [x] All targeted tests pass
- [x] Build succeeds
- [x] No regressions in migration integration suite
- [x] Code reviewed/self-reviewed
- [ ] Deployed and verified
- [ ] Monitoring shows healthy state

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 | Refactored stepper to one-button orchestration | Success | Added sequential runner + status-aware gating |
| 2026-02-25 | Converted step rows to tracking mode | Success | Removed per-step execute/retry controls in migration flow |
| 2026-02-25 | Added migration process explanation and header rename | Success | Header now `Migrate Staked XCN` |
| 2026-02-25 | Added bridge live-balance fallback | Success | Handles stale snapshot case after unstake |
| 2026-02-25 | Added and ran tests/build | Success | New + existing migration tests pass |

### Failed Attempts

- Attempt 1: Use jest-dom matchers without setup in new stepper tests
  - Why it failed: matcher helpers were unavailable in this test setup
  - What we learned: switched assertions to base Jest text/null checks

### Final State

- Changes made: one-button migration orchestration with tracked statuses and explicit UX copy
- Tests passing: stepper unit tests, step item tests, migration integration tests
- Deployment status: not deployed in this task
- Remaining risks / follow-ups: live user validation for signature prompt cadence

---

## 12) FOLLOW-UPS

- [ ] Add wallet-level E2E test for full Sepolia -> Goliath migration sequence
- [ ] Track funnel metrics before/after one-button release
- [ ] Remove dead/unreferenced toggle artifacts if still not used elsewhere
- [ ] Evaluate future session-key/gasless architecture if true pre-collection UX is required
