# Migrate Unstake Reverts After Signed Transaction (`withdraw: not good`)

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:** `docs/issues/2026-02-25-migrate-staked-xcn-single-button-flow.md`, `docs/issues/2026-02-25-migrate-chn-spelling-and-bridge-step-failure.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The migration flow must not submit an invalid second `withdraw(0, amount)` after an unstake has already succeeded, and users must be able to continue to bridge without getting stuck in `CALL_EXCEPTION` / `UNPREDICTABLE_GAS_LIMIT` loops.

**Must-have outcomes**

- [ ] `UNSTAKE` is idempotent against on-chain state (`already unstaked` path)
- [ ] Clicking `Continue migration` after a stale/reverted unstake does not re-send invalid withdraw tx
- [ ] Flow auto-recovers to bridge path once staked amount is zero on-chain

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `executeUnstake` skips tx and refreshes state when on-chain `userInfo(0, account).amount == 0`
- [ ] Test B: `executeUnstake` handles `withdraw: not good` by refetching snapshot and transitioning to post-unstake flow
- [ ] Test C: Stepper `Continue` does not invoke `executeUnstake` again when refreshed snapshot indicates `staked=0`

**Non-goals**

- Smart contract changes to Sepolia `CHNStaking`
- Backend bridge API changes
- Any chain/network infrastructure changes

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux, ethers.js v5
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test -- --watchAll=false`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A
- **Deployment name:** CoolSwap web frontend
- **Docker image:** N/A
- **RPC endpoints:**
  - Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
  - Goliath: `https://rpc.testnet.goliath.net`
- **Contract addresses:**
  - Sepolia CHNStaking: `0xc50B664BA11F5558b8FF7358bb7C576542655D54`
  - Sepolia XCN: `0x7a8adc542A35c93da263A188367F4bF4c445B8E9`
  - Sepolia Bridge: `0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092`

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: 104.238.187.163 (hostname: `lon`)

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [x] Do NOT delete `.pces` files (consensus loss risk)
- [x] Do NOT flush iptables on remote servers
- [x] Do NOT expose private keys or secrets in issue files
- [x] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Smart contract changes require careful review of upgrade path
- [ ] Breaking API changes must be documented

### Operational Constraints

- Allowed downtime: none
- Blast radius: Migration frontend flow (`Migrate` page only), Sepolia unstake step behavior

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User signs migration tx, then receives:
  - `transaction failed ... code=CALL_EXCEPTION`
- Pressing `Continue migration` then shows:
  - `cannot estimate gas ... execution reverted: withdraw: not good ... code=UNPREDICTABLE_GAS_LIMIT`
- Flow remains stuck retrying unstake semantics instead of progressing.

### 4.2 Impact

- **User impact:** Migration users get blocked on unstake and cannot reliably proceed to bridge.
- **System impact:** No fund loss observed; high friction and repeated failed tx attempts.
- **Scope:** `UNSTAKE` transaction path, step retry orchestration, and stale snapshot recovery.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationTransactions.ts` | `executeUnstake` | Uses `snapshot.staked` directly for `withdraw` and does not preflight latest on-chain `user.amount`; no recovery refresh on revert path |
| `src/hooks/migration/useMigrationTransactions.ts` | `executeWithLifecycle` caller behavior | On revert, step marked `FAILED` and returns without a state resync |
| `src/components/migration/MigrationStepper.tsx` | `runAutomation` | `Continue` re-runs failed step without forcing state reconciliation |
| `src/hooks/migration/__tests__/` | (missing file) | No unit tests for transaction hook idempotency / duplicate submission recovery |

### 4.4 Evidence

Observed runtime/on-chain evidence:

```text
User error:
- CALL_EXCEPTION for tx 0xa99a1726ec58214d9e87c859c51fd5347b97c524aa1d6eada27c51710eaf1e57
- UNPREDICTABLE_GAS_LIMIT with revert reason: "withdraw: not good"

On-chain block audit (Sepolia block 10335796):
- tx nonce 10: 0xbfbf179222b0773bada962ace5b639a990f855a23304e97012421d7383feb81f
  - to CHNStaking, selector 0x441a3e70, decoded withdraw(0, 100e18)
  - receipt status: 1 (success)
- tx nonce 11: 0xa99a1726ec58214d9e87c859c51fd5347b97c524aa1d6eada27c51710eaf1e57
  - decoded withdraw(0, 100e18)
  - receipt status: 0 (revert)

Historical contract state (`userInfo(0, user)`):
- block 10335795: amount=100e18
- block 10335796: amount=0

Contract guard:
- /Users/alex/goliath/staking/test-contract-sepolia/src/EthStaking.sol:1319
  require(user.amount >= _amount, "withdraw: not good");
```

Test baseline captured during investigation:

```text
PASS src/components/migration/__tests__/MigrationStepper.test.tsx
PASS src/hooks/migration/__tests__/useMigrationData.test.ts
PASS src/hooks/migration/__tests__/useMigrationFlow.test.ts

3 passed, 0 failed
```

Coverage gap: no `useMigrationTransactions` tests validating duplicate/ stale-amount unstake behavior.

### 4.5 Tasks

List of task files generated to solve the issue:

- `.memory-bank/tasks/2026-02-25-migrate-unstake-duplicate-withdraw-revert/task-001-add-regression-tests-for-unstake-idempotency.md`
- `.memory-bank/tasks/2026-02-25-migrate-unstake-duplicate-withdraw-revert/task-002-make-executeunstake-idempotent.md`
- `.memory-bank/tasks/2026-02-25-migrate-unstake-duplicate-withdraw-revert/task-003-harden-stepper-retry-after-unstake-failure.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The frontend reuses stale snapshot stake amount for `withdraw` and lacks idempotent preflight/recovery, so a second unstake submission after a successful unstake reverts with `withdraw: not good` and traps the flow in retry failures.

### 5.2 Supporting Evidence

- On-chain sequence proves two identical `withdraw(0,100e18)` txs from same wallet in same block; first succeeds, second reverts.
- Contract logic explicitly reverts when `_amount` exceeds current `user.amount`.
- `executeUnstake` sends `withdraw(POOL_ID, snapshot.staked)` without re-reading `userInfo` at send time.
- On unstake failure, flow does not force refresh/resync before allowing retry.
- Existing tests do not cover this scenario.

### 5.3 Gaps / Items to Verify

- TO VERIFY: whether duplicate tx submission is caused by rapid repeat UI trigger, remount race, or external wallet/manual duplicate action.
- TO VERIFY: reproduce with deterministic mocked provider timing where two unstake attempts are initiated before first snapshot refresh.
- TO VERIFY: confirm desired UX when unstake is already complete (`mark UNSTAKE confirmed` vs `skip to BRIDGE with info banner`).

### 5.4 Root Cause (final)

- **Root cause:** `executeUnstake` depends on stale client snapshot amount and lacks on-chain idempotency checks + post-failure state reconciliation.
- **Contributing factors:** Missing transaction-hook regression tests, retry path that can reattempt failed unstake unchanged, and no specific handling for `withdraw: not good` semantic revert.

---

## 6) SOLUTIONS (compare options)

### Option A - Idempotent Unstake with On-Chain Preflight (Recommended)

**Changes required**

- `src/hooks/migration/useMigrationTransactions.ts`
  - Before `withdraw`, read latest `userInfo(POOL_ID, signerAddress)`.
  - If on-chain amount is `0`, skip tx and trigger `refetch()` + state transition.
  - If snapshot amount is stale-high, clamp/replace amount with on-chain amount.
  - On `withdraw: not good` error, force refresh and re-derive flow.
- Add tests in `src/hooks/migration/__tests__/useMigrationTransactions.test.ts`.

**Pros**

- Prevents invalid tx before wallet prompt.
- Makes step idempotent under stale state and retries.
- Minimizes user-facing failure loops.

**Cons / risks**

- Adds one extra RPC read before unstake.
- Requires new unit-test scaffolding for hook/provider mocks.

**Complexity:** Medium
**Rollback:** Easy

---

### Option B - Retry Recovery Only (Refresh + Flow Re-Derive)

**Changes required**

- Keep unstake tx path unchanged.
- On unstake failure/revert, immediately `refetch()` and rebuild flow before enabling `Continue`.
- If refreshed `staked=0`, skip unstake and proceed to bridge path.

**Pros**

- Smaller code delta.
- Handles post-failure stuck state quickly.

**Cons / risks**

- Still allows first invalid tx submission.
- Depends on RPC freshness after failure.

**Complexity:** Low-Medium
**Rollback:** Easy

---

### Decision

**Chosen option:** Option A
**Justification:** Preventing invalid tx submission is safer than handling failure after the fact; it directly addresses user pain and reduces failed wallet interactions.
**Accepted tradeoffs:** One additional read call and slightly more transaction-hook complexity.

---

## 7) DELIVERABLES

- [ ] Code changes: `src/hooks/migration/useMigrationTransactions.ts`, `src/components/migration/MigrationStepper.tsx` (if retry UX adjustment needed)
- [ ] Tests: new `src/hooks/migration/__tests__/useMigrationTransactions.test.ts`, update `src/components/migration/__tests__/MigrationStepper.test.tsx`
- [ ] Config changes: none expected
- [ ] Documentation: this issue file + task files
- [ ] Deployment: frontend deployment required
- [ ] Monitoring/alerts: client-side error telemetry for `withdraw: not good` occurrences

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
- **Run command:** `npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
- **Framework:** Jest + React hooks testing patterns + mocked ethers contracts

### 8.2 Required Tests

**Unit tests**

- [ ] `executeUnstake` uses on-chain amount when snapshot is stale
- [ ] `executeUnstake` skips tx when on-chain amount is zero and triggers refetch
- [ ] `executeUnstake` handles `withdraw: not good` by refreshing and not leaving retry-loop state

**Integration tests (if applicable)**

- [ ] Add scenario in `src/__tests__/migration-integration.test.ts` where first unstake succeeds then stale retry is prevented

**E2E tests (if applicable)**

- [ ] Manual wallet scenario on Sepolia: confirm one unstake tx only, then bridge proceeds

**Contract tests (if smart contract)**

- [ ] N/A (frontend-only fix)

### 8.3 Baseline

- Test run before fix: existing migration suites pass, but no test exists for duplicate unstake/idempotency path.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state.
   - Command: `git status --short`
   - Expected output: current modified/untracked file list.
   - Failure modes: none significant.
   - Rollback: N/A (read-only).
2. Confirm dependencies for tests.
   - Command: `npm -v && node -v`
   - Expected output: version numbers.
   - Failure modes: missing runtime tooling.
   - Rollback: N/A.
3. Create working branch.
   - Command: `git checkout -b codex/migrate-unstake-idempotency`
   - Expected output: switched to new branch.
   - Failure modes: branch exists.
   - Rollback: `git checkout <previous-branch>`.

### Phase 1 - Backup / Safety (if any risk)

1. Capture baseline failing scenario in tests first.
   - Command: `npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
   - Expected output: new tests fail before fix.
   - Failure modes: test file missing until created.
   - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationTransactions.test.ts`.

### Phase 2 - Write Tests First

- **Step 1:** Create regression tests for stale snapshot + already-unstaked path
  - File: `src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
  - Run: `npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationTransactions.test.ts`
  - Expected: FAIL before implementation
  - Failure modes: mock wiring for ethers contracts/providers incorrect
  - Rollback: `git checkout -- src/hooks/migration/__tests__/useMigrationTransactions.test.ts`

- **Step 2:** Extend stepper retry test for stale-unstake recovery
  - File: `src/components/migration/__tests__/MigrationStepper.test.tsx`
  - Run: `npm test -- --watchAll=false src/components/migration/__tests__/MigrationStepper.test.tsx`
  - Expected: FAIL before implementation
  - Failure modes: brittle timing assumptions in async polling
  - Rollback: `git checkout -- src/components/migration/__tests__/MigrationStepper.test.tsx`

### Phase 3 - Implement the Fix

- **Step 3:** Add on-chain preflight/idempotency in `executeUnstake`
  - File: `src/hooks/migration/useMigrationTransactions.ts`
  - Change: resolve signer address, fetch current `userInfo(POOL_ID, signerAddress)`, compute safe withdraw amount, skip tx when amount is zero, trigger refetch on semantic revert.
  - Build: `npm run build`
  - Expected: build succeeds.
  - Verify: duplicate unstake test passes; no second tx sent in simulation.
  - Failure modes: extra RPC call latency, type mismatches in mocked contract tuple typing.
  - Rollback: `git checkout -- src/hooks/migration/useMigrationTransactions.ts`

- **Step 4:** Harden retry path UX after unstake failure
  - File: `src/components/migration/MigrationStepper.tsx` (if needed)
  - Change: ensure retry path depends on refreshed state, not stale failed step alone.
  - Build: `npm run build`
  - Expected: build succeeds.
  - Verify: `Continue` does not call `executeUnstake` when staked is zero.
  - Failure modes: flow state desync with Redux selectors.
  - Rollback: `git checkout -- src/components/migration/MigrationStepper.tsx`

### Phase 4 - Validate

1. Run focused tests.
   - Command: `npm test -- --watchAll=false src/hooks/migration/__tests__/useMigrationTransactions.test.ts src/components/migration/__tests__/MigrationStepper.test.tsx`
   - Expected output: all relevant tests pass.
   - Failure modes: flaky async timing in stepper tests.
   - Rollback: revert latest code changes by file.
2. Run migration integration suite.
   - Command: `npm test -- --watchAll=false src/__tests__/migration-integration.test.ts`
   - Expected output: pass.
   - Failure modes: unrelated brittle integration assertions.
   - Rollback: revert offending commit/files.
3. Build app.
   - Command: `npm run build`
   - Expected output: successful production build.
   - Failure modes: type/lint regressions.
   - Rollback: `git checkout -- <changed-files>`.

### Phase 5 - Deploy (if applicable)

1. Deploy frontend using standard CoolSwap pipeline.
2. Post-deploy verification:
   - Trigger migration path with test wallet on Sepolia.
   - Confirm only one unstake tx is required.
3. Monitor for 15 minutes for recurrence of `withdraw: not good` in client logs.

### Phase 6 - Rollback Plan

**Triggers:** increased unstake failures, inability to progress to bridge, new migration regressions.

**Procedure:**

- Code: `git revert <commit>`
- Deployment: redeploy previous known-good frontend artifact
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
| 2026-02-25 19:40 | Inspected migration tx flow (`useMigrationTransactions`, `MigrationStepper`) | Success | Found unstake uses snapshot amount directly |
| 2026-02-25 19:47 | Queried Sepolia on-chain state for affected wallet | Success | Confirmed `userInfo(0).amount` became `0` after block 10335796 |
| 2026-02-25 19:49 | Audited block 10335796 txs from wallet | Success | Found nonce 10 success + nonce 11 revert, same withdraw amount |
| 2026-02-25 19:52 | Located contract revert guard in `EthStaking.sol` | Success | `require(user.amount >= _amount, "withdraw: not good")` |
| 2026-02-25 19:55 | Ran migration baseline tests | Success | 3/3 suites passed; no unstake-idempotency coverage |

### Failed Attempts

- Attempt 1: Infer root cause from frontend code only
  - Why it failed: insufficient to prove whether unstake amount mismatch was on-chain or UI-only
  - What we learned: direct on-chain audit was required to confirm duplicate withdraw sequence

### Final State

- Changes made (diff summary): issue report + task decomposition files only (report-only mode)
- Tests passing: baseline migration subset passes (`MigrationStepper`, `useMigrationData`, `useMigrationFlow`)
- Deployment status: not deployed
- Remaining risks / follow-ups: duplicate trigger mechanism (UI race vs user action) still needs deterministic reproduction test

---

## 12) FOLLOW-UPS

- [ ] Add regression tests for "already unstaked" semantic path
- [ ] Update migration UX copy for already-completed unstake case
- [ ] Add client telemetry around unstake error reasons (`withdraw: not good`)
- [ ] Audit bridge step for similar stale snapshot/duplicate submission patterns
