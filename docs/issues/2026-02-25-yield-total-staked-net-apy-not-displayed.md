# Yield Tab Hides Total Staked and Net APY Behind Wallet/Network Gates

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P2
**Risk level:** Medium
**Requires deployment?:** Yes
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md`
- `src/pages/Yield/index.tsx`
- `src/pages/Yield/ProtocolStats.tsx`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

On `/yield`, the protocol-level stats (`Total Staked`, `Net APY`) are visible for users in all states (disconnected, wrong network, connected) while stake/unstake actions remain gated to connected wallets on Goliath Testnet.

**Must-have outcomes**

- [ ] `Total Staked` and `Net APY` are rendered on Yield even when wallet is disconnected
- [ ] `Total Staked` and `Net APY` are rendered on Yield when wallet is connected to non-Goliath chains
- [ ] Stake/Unstake transaction actions remain blocked unless wallet is connected to chain `8901`

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: Yield page renders `Total Staked` and `Net APY` in disconnected state
- [ ] Test B: Yield page renders `Total Staked` and `Net APY` in wrong-network state (with switch CTA still visible)
- [ ] Test C: Yield page renders stake/unstake forms only when connected to Goliath Testnet
- [ ] Test D: Existing `ProtocolStats` unit tests continue to pass

**Non-goals**

- Changing StakedXCN smart contract logic or deployment
- Changing APY math formula
- Adding new staking features beyond visibility/layout correction

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js v5
- **Entry point:** `src/pages/Yield/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test -- --watch=false --runInBand`

### Deployment Details (if applicable)

- **Kubernetes namespace:** N/A (frontend static deployment)
- **Deployment name:** CoolSwap frontend
- **Docker image:** N/A
- **RPC endpoints:** `https://rpc.testnet.goliath.net`
- **Contract addresses:** stXCN proxy via `REACT_APP_STXCN_ADDRESS` (currently `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` in local `.env`)

### Network Context (if relevant)

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: 104.238.187.163 (hostname: `lon`)

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

- Allowed downtime: none expected (frontend-only deployment)
- Blast radius: Yield page UI/layout and Yield page tests

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User report: on Yield tab, `Total Staked` and `Net APY` are not displayed.
- The Yield page has early returns for disconnected and wrong-network states.
- `ProtocolStats` exists and renders those rows, but only inside the connected + correct-chain branch.

### 4.2 Impact

- **User impact:** Users cannot view core protocol metrics unless they are connected and on chain `8901`.
- **System impact:** Reduced visibility/trust in yield product metrics and support friction (“metrics missing”).
- **Scope:** Yield page rendering logic, test coverage for page-level visibility states.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Yield/index.tsx:95` | `Yield` | Early return for disconnected wallets exits before `ProtocolStats` render path |
| `src/pages/Yield/index.tsx:115` | `Yield` | Early return for wrong network exits before `ProtocolStats` render path |
| `src/pages/Yield/index.tsx:165` | `Yield` | `ProtocolStats` only rendered in connected + correct-network branch |
| `src/pages/Yield/ProtocolStats.tsx:41` | `ProtocolStats` | Component itself includes `Total Staked` + `Net APY`; not inherently broken |
| `src/__tests__/yield/components.test.tsx` | ProtocolStats tests | Tests cover presentational component only; no page-level gate behavior coverage |

### 4.4 Evidence

**Evidence 1: Gate returns in Yield page prevent stats rendering**

`src/pages/Yield/index.tsx`:
```tsx
if (!isConnected) {
  return (...connect wallet gate...)
}

if (!isCorrectChain) {
  return (...switch network gate...)
}

return (
  ...
  <ProtocolStats ... />
)
```

**Evidence 2: Stats component itself renders the two rows**

`src/pages/Yield/ProtocolStats.tsx`:
```tsx
<StatRow>
  <StatLabel>Total Staked</StatLabel>
  <StatValue>{totalSupply ? ... : '--'}</StatValue>
</StatRow>
<StatRow>
  <StatLabel>Net APY</StatLabel>
  <StatValue>{computeNetAPY(rewardRateRay, feePercentBps)}</StatValue>
</StatRow>
```

**Evidence 3: Protocol reads are available from chain RPC**

Manual verification script output (local, 2026-02-25):
```text
totalSupply 105007761796476445669
getRewardRate 278000000000000000000000000
getFeePercent 1000
paused false
```

**Evidence 4: Existing tests pass but do not cover this failure mode**

`npm test -- --watch=false --runInBand src/__tests__/yield/components.test.tsx ...`
```text
Test Suites: 5 passed, 5 total
Tests: 33 passed, 33 total
```

### 4.5 Tasks
List of task files generated to solve the issue:
- `.memory-bank/tasks/2026-02-25-yield-total-staked-net-apy-not-displayed/task-001-add-failing-yield-page-visibility-tests.md`
- `.memory-bank/tasks/2026-02-25-yield-total-staked-net-apy-not-displayed/task-002-refactor-yield-layout-to-always-show-protocol-stats.md`
- `.memory-bank/tasks/2026-02-25-yield-total-staked-net-apy-not-displayed/task-003-add-protocol-stats-loading-and-error-state-coverage.md`
- `.memory-bank/tasks/2026-02-25-yield-total-staked-net-apy-not-displayed/task-004-regression-qa-and-release-validation.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

`Total Staked` and `Net APY` are hidden because `Yield/index.tsx` returns gate UIs before the branch that renders `ProtocolStats`.

### 5.2 Supporting Evidence

- `ProtocolStats` is rendered only at `src/pages/Yield/index.tsx:165` inside the main connected/correct-chain return block.
- Two gate conditions (`!isConnected`, `!isCorrectChain`) each `return` early.
- `ProtocolStats` unit tests confirm the component renders both rows when mounted.
- On-chain read calls for stXCN protocol values are functioning from local RPC checks.

### 5.3 Gaps / Items to Verify

- Need exact user reproduction state (wallet disconnected vs wrong network vs connected with stale protocol fetch).
- TO VERIFY: Reproduce with wallet disconnected:
  - `npm run start`
  - Open `/yield`
  - Confirm `Total Staked`/`Net APY` are absent in current UI
- TO VERIFY: Reproduce with wallet connected to Sepolia (`11155111`):
  - Open `/yield`
  - Confirm switch-network gate is visible and protocol stats are absent
- TO VERIFY: Browser console check for protocol fetch errors while connected to `8901`:
  - Open devtools console and refresh `/yield`

### 5.4 Root Cause (final)

- **Root cause:** Yield page layout couples read-only protocol stats to stake/unstake eligibility, so wallet/network gates hide `ProtocolStats` entirely.
- **Contributing factors:** Missing page-level tests for disconnected and wrong-network states; current tests cover only `ProtocolStats` in isolation.

---

## 6) SOLUTIONS (compare options)

### Option A - Duplicate `ProtocolStats` in each gate branch

**Changes required**
- Add `ProtocolStats` under both gate returns (`!isConnected`, `!isCorrectChain`) in `src/pages/Yield/index.tsx`.

**Pros**
- Fastest patch, minimal refactor.
- Immediately exposes protocol stats in all states.

**Cons / risks**
- Duplicated JSX across three branches increases drift risk.
- Future stats/UI updates may be missed in one branch.

**Complexity:** Low
**Rollback:** Easy

---

### Option B - Single layout with conditional action sections (recommended)

**Changes required**
- Refactor `src/pages/Yield/index.tsx` to always render shared sections (`YieldHeader`, `AnimatedBalance`, `ProtocolStats`).
- Keep stake/unstake forms and CTA controls conditionally rendered per state.
- Add page-level tests for disconnected/wrong-network/connected flows.

**Pros**
- Removes branch duplication and keeps one source of truth for stats rendering.
- Better long-term maintainability and testability.
- Aligns with UX expectation that protocol metrics are read-only and public.

**Cons / risks**
- Slightly larger refactor than option A.
- Must validate no behavior regressions in gate CTAs.

**Complexity:** Medium
**Rollback:** Moderate

---

### Decision

**Chosen option:** B
**Justification:** This fixes the bug and avoids future regressions by eliminating duplicated rendering branches.
**Accepted tradeoffs:** Slightly larger code change and broader UI regression testing scope.

---

## 7) DELIVERABLES

- [ ] Code changes: `src/pages/Yield/index.tsx`, optional `src/pages/Yield/styleds.tsx`
- [ ] Tests: add `src/__tests__/yield/pageVisibility.test.tsx` (or equivalent)
- [ ] Config changes: none expected
- [ ] Documentation: issue report + task files
- [ ] Deployment: frontend deploy required
- [ ] Monitoring/alerts: none required; manual post-deploy QA on `/yield`

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/pageVisibility.test.tsx`
- **Run command:** `npm test -- --watch=false --runInBand src/__tests__/yield/pageVisibility.test.tsx`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] Yield page in disconnected state shows `Total Staked` and `Net APY`
- [ ] Yield page in wrong-network state shows `Total Staked` and `Net APY`
- [ ] Yield page in connected+Goliath state shows staking controls and stats
- [ ] Existing ProtocolStats tests remain green

**Integration tests (if applicable)**
- [ ] Mock `useYieldData` protocol state transitions and ensure stats section remains mounted

**E2E tests (if applicable)**
- [ ] Manual route check on `/yield` for disconnected, wrong-network, connected scenarios

**Contract tests (if smart contract)**
- [ ] N/A

### 8.3 Baseline

- Test run before fix: Yield suite currently passes (`5 suites / 33 tests`), but lacks page-level visibility coverage for gate states.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record repository state.
   - **Command:** `git status --short`
   - **Expected output:** Current modified/untracked files listed.
   - **Failure modes:** Not a git repo, permission issues.
   - **Rollback:** N/A (read-only command).
2. Capture current Yield test baseline.
   - **Command:** `npm test -- --watch=false --runInBand src/__tests__/yield/components.test.tsx src/__tests__/yield/utils.test.ts src/__tests__/yield/useStakeValue.test.ts src/__tests__/yield/selectors.test.ts src/__tests__/yield/slice.test.ts`
   - **Expected output:** Existing Yield tests pass.
   - **Failure modes:** Jest dependency mismatch, transient test failures.
   - **Rollback:** N/A (read-only command).

### Phase 1 - Backup / Safety

1. Create branch for the fix.
   - **Command:** `git checkout -b codex/fix-yield-stats-visibility`
   - **Expected output:** New branch created and checked out.
   - **Failure modes:** Branch already exists, uncommitted conflicts.
   - **Rollback:** `git checkout <previous-branch>` and `git branch -D codex/fix-yield-stats-visibility` (only if branch is disposable).

### Phase 2 - Write Tests First

1. Add failing page-level visibility tests.
   - **File:** `src/__tests__/yield/pageVisibility.test.tsx`
   - **Command:** `npm test -- --watch=false --runInBand src/__tests__/yield/pageVisibility.test.tsx`
   - **Expected output:** FAIL before UI refactor (stats absent in gate states).
   - **Failure modes:** Mock setup issues for wallet/network hooks.
   - **Rollback:** `git checkout -- src/__tests__/yield/pageVisibility.test.tsx`.

### Phase 3 - Implement the Fix

1. Refactor Yield layout to keep protocol stats mounted across states.
   - **File:** `src/pages/Yield/index.tsx`
   - **Change:** Replace early-return gates with conditional sections inside one shared layout.
   - **Build command:** `npm run build`
   - **Expected output:** Build succeeds.
   - **Failure modes:** TS compile errors from JSX branch changes.
   - **Rollback:** `git checkout -- src/pages/Yield/index.tsx`.
2. Adjust styles only if spacing/regression appears after refactor.
   - **File:** `src/pages/Yield/styleds.tsx` (optional)
   - **Command:** `npm run build`
   - **Expected output:** No layout overflow warnings; build success.
   - **Failure modes:** CSS regressions on mobile breakpoints.
   - **Rollback:** `git checkout -- src/pages/Yield/styleds.tsx`.

### Phase 4 - Validate

1. Run focused Yield tests.
   - **Command:** `npm test -- --watch=false --runInBand src/__tests__/yield/pageVisibility.test.tsx src/__tests__/yield/components.test.tsx`
   - **Expected output:** PASS; new test confirms stats visibility in gate states.
   - **Failure modes:** Assertion mismatch due text/loading fallback updates.
   - **Rollback:** Revert last UI/test edits (`git checkout -- <file>`), then re-run.
2. Run full Yield test set and build.
   - **Command:** `npm test -- --watch=false --runInBand src/__tests__/yield && npm run build`
   - **Expected output:** Tests/build pass.
   - **Failure modes:** Hidden dependency regressions.
   - **Rollback:** `git revert <commit>` after commit, or file-level checkout pre-commit.

### Phase 5 - Deploy (if applicable)

1. Deploy frontend through standard CoolSwap release process.
   - **Command:** Project-specific deploy pipeline trigger.
   - **Expected output:** New frontend build available.
   - **Failure modes:** CI build errors, environment mismatch.
   - **Rollback:** Redeploy previous stable frontend artifact.
2. Post-deploy verification.
   - **Command:** Manual `/yield` checks in disconnected, wrong-network, connected states.
   - **Expected output:** Stats visible in all three; stake actions gated correctly.
   - **Failure modes:** Caching/CDN stale assets.
   - **Rollback:** Invalidate cache and/or rollback deployment.

### Phase 6 - Rollback Plan

**Triggers:** Missing Yield CTA behavior, broken staking flow, or rendering regressions after deployment.

**Procedure:**
- Code: `git revert <fix-commit-sha>`
- Deployment: redeploy previous frontend version
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
| 2026-02-25 22:12 | Located Yield stats render path via `rg`/file inspection | Success | `ProtocolStats` found only in connected main branch |
| 2026-02-25 22:16 | Ran Yield unit suite | Success | 5 suites / 33 tests passed |
| 2026-02-25 22:19 | Queried stXCN protocol reads via RPC | Success | `totalSupply`, `getRewardRate`, `getFeePercent` returned valid values |
| 2026-02-25 22:24 | Verified no page-level tests for gate visibility | Success | Gap confirmed in test coverage |

### Failed Attempts

- Attempt 1: Initial ad-hoc Node script used quoted RPC value without stripping quotes from `.env` parser.
  - Why it failed: Script-level parsing artifact caused `NETWORK_ERROR` (`noNetwork`).
  - What we learned: App config itself is not the issue; after stripping quotes in the script, RPC and contract reads worked.

### Final State

- Changes made (diff summary): Report-only mode; no source code modified.
- Tests passing: Existing Yield tests pass; missing page-level coverage identified.
- Deployment status: Not deployed.
- Remaining risks / follow-ups: Until layout is refactored, users in gate states will continue to miss protocol metrics.

---

## 12) FOLLOW-UPS

- [ ] Add/update tests for disconnected + wrong-network yield visibility
- [ ] Update Yield UX copy to clarify read-only stats vs write-required staking actions
- [ ] Add monitoring/alerting for repeated protocol fetch failures on Yield
- [ ] Audit other pages for early-return gates that may hide read-only protocol information
