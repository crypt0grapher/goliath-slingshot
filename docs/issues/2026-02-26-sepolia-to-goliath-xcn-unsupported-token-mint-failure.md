# Sepolia->Goliath XCN Bridging Fails at "Minting on Goliath" With Unsupported Destination Token

**Project:** CoolSwap-interface (primary affected backend: goliath-bridge-backend)
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-06-bridge-eth-amount-mismatch-and-mint-failures.md`
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-26-xcn-status-autorecovery-hotfix.md`
- `/Users/alex/goliath/CoolSwap-interface/docs/issues/2026-02-26-xcn-withdraw-stuck-op-not-found-mixed-api-images.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

`SEPOLIA_TO_GOLIATH` XCN operations no longer fail in relayer with `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN`; they progress from `AWAITING_RELAY` to `COMPLETED` through the native XCN delivery/staking branch.

**Must-have outcomes**

- [ ] XCN deposits from Sepolia do not fail at the "Minting on Goliath" step.
- [ ] Relayer handles `SEPOLIA_TO_GOLIATH` XCN without requiring a destination ERC-20 token address.
- [ ] USDC/ETH bridging behavior remains unchanged.

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `submitDestinationTx` uses native send/stake path for `SEPOLIA_TO_GOLIATH + XCN` and does not hit unsupported-token error.
- [ ] Test B: Existing USDC/ETH regression tests still pass for both directions.
- [ ] Test C: Integration/status flow for XCN no longer records `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN` in `errorMessage`.

**Non-goals**

- Changing bridge contract ABI or redeploying bridge contracts.
- Reworking XCN withdraw (`GOLIATH_TO_SEPOLIA`) recovery logic.
- Altering queue fairness policy.

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface` (report workspace)
- **Primary affected repository path:** `~/goliath/goliath-bridge-backend`
- **Language/stack:** TypeScript, Fastify, Prisma, ethers.js, Kubernetes
- **Entry point:** `src/worker/relayer.ts` (`npm run start:relayer`)
- **Build command:** `cd /Users/alex/goliath/goliath-bridge-backend && npm run build`
- **Test command:** `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`

### Deployment Details (if applicable)

- **Kubernetes namespace:** `bridge-backend`
- **Deployment name:** `bridge-relayer` (replicas: 1, nodeSelector `lon-3`), `bridge-api` (replicas: 2)
- **Docker image:** `docker.io/library/bridge-relayer:latest`, `docker.io/library/bridge-api:latest` (`imagePullPolicy: Never`)
- **RPC endpoints:**
  - Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
  - Goliath: `http://relay-internal.kubernetes.svc.cluster.local:7546`
- **Contract addresses:**
  - `BRIDGE_SEPOLIA_ADDRESS=0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092`
  - `BRIDGE_GOLIATH_ADDRESS=0x2c1d218B5a97a26D144ffd12d5C813590f93FFEB`
- **Deployment script:** `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh`

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

- Allowed downtime: None (rolling restart of relayer acceptable)
- Blast radius: `bridge-relayer` XCN deposit path (`SEPOLIA_TO_GOLIATH`)

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User flow fails at UI step "Minting on Goliath" for Sepolia->Goliath XCN bridge.
- Status endpoint returns terminal failure:
  - `error: "Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN"`
  - example hash: `0x41978f6d50e50637c3f7d0eb289392f22ea066ed2bbc635372e5d1eea37e96a4`
- Failure reproduces in relayer unit tests for XCN submitter path.

### 4.2 Impact

- **User impact:** XCN migrations/deposits from Sepolia to Goliath fail after confirmation; users do not receive destination value.
- **System impact:** Operations enter retry loop then `FAILED`, increasing queue pressure.
- **Scope:** Relayer submitter decision path for destination token resolution vs native XCN handling.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts` | `submitDestinationTx()` | Computes `destTokenAddress` before branch selection, forcing unsupported-token throw for XCN deposits |
| `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts` | `getDestinationTokenAddress()` | For `SEPOLIA_TO_GOLIATH`, explicitly supports only `ETH`/`USDC` and throws for `XCN` |
| `/Users/alex/goliath/goliath-bridge-backend/src/config/schema.ts` | `tokens.xcn` schema | `xcn.goliath` is explicitly `null` (native on Goliath), so destination ERC-20 lookup is invalid by design |
| `/Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts` | XCN submitter tests | Baseline shows 10 failures, confirming runtime path mismatch |

### 4.4 Evidence

**User status response (excerpt):**

```json
{
  "direction": "SEPOLIA_TO_GOLIATH",
  "status": "FAILED",
  "token": "XCN",
  "originTxHash": "0x41978f6d50e50637c3f7d0eb289392f22ea066ed2bbc635372e5d1eea37e96a4",
  "destinationTxHash": null,
  "error": "Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN"
}
```

**Throw site + early call path:**

- `src/worker/transactionSubmitter.ts:288-291` calls `this.getDestinationTokenAddress(tokenSymbol, direction)` unconditionally.
- `src/worker/transactionSubmitter.ts:675` throws for XCN in `SEPOLIA_TO_GOLIATH`.
- XCN native path exists at `src/worker/transactionSubmitter.ts:295-381`, but is never reached because of the earlier throw.

**Config contract confirms XCN is native on destination:**

- `src/config/schema.ts:45-50` defines `tokens.xcn.goliath` as `null`.

**Local baseline test run (before fix):**

- Command: `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`
- Result: `13 tests | 10 failed`, with failures across XCN native/staking branches (no send/stake call observed).

**Recent introducing commit correlation:**

- `git show 79603ca -- src/worker/transactionSubmitter.ts`
- Commit date: 2026-02-26
- Change added strict throw for unsupported destination token symbols, including XCN on Sepolia->Goliath path.

### 4.5 Tasks

Task files generated for implementation:

- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-sepolia-to-goliath-xcn-unsupported-token-mint-failure/task-001-reproduce-and-lock-regression-test.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-sepolia-to-goliath-xcn-unsupported-token-mint-failure/task-002-fix-destination-token-resolution-order.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-sepolia-to-goliath-xcn-unsupported-token-mint-failure/task-003-validate-relayer-regression-suite.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-sepolia-to-goliath-xcn-unsupported-token-mint-failure/task-004-rollout-relayer-and-verify-operations.md`

### 4.6 Historical Correlation (required)

- **Recent-change regression likely?:** Yes
- **Suspected introducing change:** `79603caa31752e01cc238175c6803fee14766adf` (`feat: add two-way XCN bridge (Goliath <-> Sepolia)`, 2026-02-26)
- **Key change detail:** Method `getDestinationTokenAddress()` was tightened to throw for unsupported symbols in each direction, but `submitDestinationTx()` still resolves destination token before entering the XCN-native branch.
- **Fix strategy for that change:** Patch-forward in submitter control flow (defer destination token lookup to only branches that need ERC-20 destination token address).
- **Similar prior issue/task found?:** Yes (partial)
- **Prior solution summary:**
  - `2026-02-06-bridge-eth-amount-mismatch-and-mint-failures.md` fixed relayer destination submission logic bugs and emphasized submitter regression coverage.
  - `2026-02-26-xcn-status-autorecovery-hotfix.md` fixed XCN withdraw status reconstruction (`GOLIATH_TO_SEPOLIA`) and deployment consistency.
- **Applicability now:** Partial. Prior relayer bug fix pattern (patch submitter logic + tests) applies directly; XCN status recovery fix addresses different direction/phase.

**Historical search commands used:**

- `rg -n "Unsupported token|SEPOLIA_TO_GOLIATH|XCN|Minting on Goliath|destination" /Users/alex/goliath/goliath-bridge-backend/docs/issues /Users/alex/goliath/goliath-bridge-backend/docs/tasks /Users/alex/goliath/goliath-bridge-backend/.memory-bank -S`
- `rg -n "Unsupported token|SEPOLIA_TO_GOLIATH|XCN|Minting on Goliath|destination" /Users/alex/goliath/CoolSwap-interface/docs /Users/alex/goliath/CoolSwap-interface/.memory-bank -S`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

A control-flow bug in `TransactionSubmitter.submitDestinationTx()` resolves destination token address too early, causing XCN Sepolia->Goliath operations to fail before entering their native-transfer/staking path.

### 5.2 Supporting Evidence

- Runtime error string exactly matches throw in `getDestinationTokenAddress()`.
- XCN native path exists but is downstream of unconditional destination-token resolution.
- Config schema explicitly models XCN as native on Goliath (`goliath: null`), so destination token lookup is semantically invalid.
- XCN-focused submitter tests fail in current baseline (`10/13` failed).
- Blame/log points to same-day commit introducing strict throws for unsupported tokens.

### 5.3 Gaps / Items to Verify

- Validate frequency and volume in production DB:
  - TO VERIFY: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl exec -n bridge-backend bridge-db-0 -- psql -U bridge_user -d bridge_db -c \"SELECT status, direction, token_symbol, COUNT(*) FROM bridge_operations WHERE token_symbol='XCN' AND direction='SEPOLIA_TO_GOLIATH' GROUP BY status,direction,token_symbol ORDER BY status;\""`
- Confirm relayer logs for exact failure bursts:
  - TO VERIFY: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl logs -n bridge-backend -l app=bridge-relayer --since=6h | rg 'Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN'"`
- Verify no stale pods/images for relayer:
  - TO VERIFY: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl -n bridge-backend get pod -l app=bridge-relayer -o jsonpath='{.items[*].status.containerStatuses[*].imageID}'"`

### 5.4 Root Cause (final)

- **Root cause:** `submitDestinationTx()` performs `getDestinationTokenAddress()` for all operations, but `SEPOLIA_TO_GOLIATH + XCN` should bypass destination-token resolution and use native transfer/staking; the method now throws for this symbol, terminating the operation.
- **Contributing factors:**
  - Recent refactor introduced strict token throws without matching call-site control-flow update.
  - Deploy workflow does not enforce test pass gates before rollout.
  - XCN flow spans branch-specific semantics (native vs ERC-20), increasing regression risk.

---

## 6) SOLUTIONS (compare options)

### Option A - Defer destination-token resolution to branch-local paths (Recommended)

**Changes required**

- `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
  - Move `getDestinationTokenAddress()` call from pre-branch section into:
    - non-XCN `SEPOLIA_TO_GOLIATH` branch (mint path)
    - all `GOLIATH_TO_SEPOLIA` release/releaseNative paths as needed
  - Keep strict throws in `getDestinationTokenAddress()` for truly unsupported combinations.
- `/Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`
  - Ensure explicit assertion that XCN path does not require destination token address and executes native flow.

**Pros**

- Aligns code with existing domain model (`XCN` native on destination).
- Preserves strict validation for unsupported combinations.
- Minimal blast radius and low complexity.

**Cons / risks**

- Requires careful placement of destination token lookup to avoid null/undefined in non-XCN paths.

**Complexity:** Low
**Rollback:** Easy (`git revert` + relayer redeploy)

---

### Option B - Expand `getDestinationTokenAddress()` to tolerate XCN Sepolia->Goliath

**Changes required**

- `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
  - Add `if (tokenSymbol === 'XCN') return <sentinel>` for `SEPOLIA_TO_GOLIATH`.

**Pros**

- Very small diff.

**Cons / risks**

- Encodes a fake/unused token address for a path that should not use token address at all.
- Increases chance of accidental misuse in future refactors.
- Weakens type/semantic clarity.

**Complexity:** Low
**Rollback:** Easy

---

### Decision

**Chosen option:** Option A
**Justification:** Fixes the real control-flow defect while preserving strict token validation and native XCN semantics.
**Accepted tradeoffs:** Slightly broader method refactor than Option B, but much safer long-term.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
- [ ] Tests:
  - `/Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`
- [ ] Config changes: none expected
- [ ] Documentation:
  - this issue doc + deployment verification notes
- [ ] Deployment:
  - relayer image rebuild/import/restart in `bridge-backend`
- [ ] Monitoring/alerts:
  - verify no recurrence of unsupported-token error in relayer logs

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `/Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`
- **Run command:** `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`
- **Framework:** Vitest

### 8.2 Required Tests

**Unit tests**

- [ ] `SEPOLIA_TO_GOLIATH + XCN` executes native send/stake branch without unsupported-token failure.
- [ ] `SEPOLIA_TO_GOLIATH + USDC/ETH` still use `bridgeGoliath.mint()` with expected token addresses.
- [ ] `GOLIATH_TO_SEPOLIA + XCN/USDC/ETH` resolution/release behavior remains unchanged.

**Integration tests (if applicable)**

- [ ] Existing relayer integration tests touching submitter continue passing (`regression`, `emergencyModes`, `duplicateProtection` subsets).

**E2E tests (if applicable)**

- [ ] Manual bridge transaction on testnet for XCN Sepolia->Goliath reaches `COMPLETED` via `/bridge/status`.

**Contract tests (if smart contract)**

- [ ] N/A (no contract code change).

### 8.3 Baseline

- Test run before fix:
  - `npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`
  - Result: `1 failed file`, `13 tests`, `10 failed`, `3 passed`
  - Dominant failures: XCN native/staking path expectations not reached.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current backend state.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && git status --short`
- Expected output: current branch + modified/untracked files snapshot.
- Failure modes: git unavailable; wrong directory.
- Rollback: N/A (read-only).

2. Reconfirm failure signature from API.
- Command: `curl -s "https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status?originTxHash=0x41978f6d50e50637c3f7d0eb289392f22ea066ed2bbc635372e5d1eea37e96a4" | jq '.'`
- Expected output: `status=FAILED` and error `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN`.
- Failure modes: endpoint timeout; hash not found due retention.
- Rollback: N/A (read-only).

3. Create working branch.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && git checkout -b codex/fix-sepolia-xcn-destination-resolution`
- Expected output: branch switched.
- Failure modes: branch exists.
- Rollback: `git checkout <previous-branch>`.

### Phase 1 - Backup / Safety (if any risk)

1. Preserve current relayer image and rollout metadata before deploy.
- Command: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl -n bridge-backend get deploy bridge-relayer -o yaml > /tmp/bridge-relayer-prepatch.yaml"`
- Expected output: YAML snapshot file created on server.
- Failure modes: SSH failure; kubectl permissions.
- Rollback: `kubectl apply -f /tmp/bridge-relayer-prepatch.yaml`.

### Phase 2 - Write Tests First

- **Step 1:** Add/adjust XCN regression test so it fails pre-fix.
  - File: `/Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`
  - Code: assert XCN Sepolia->Goliath path reaches native send/stake behavior and does not fail early.
  - Run: `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`
  - Expected: FAIL before implementation.
  - Failure modes: unrelated test failures.
  - Rollback: `git checkout -- /Users/alex/goliath/goliath-bridge-backend/src/worker/__tests__/transactionSubmitter.test.ts`.

### Phase 3 - Implement the Fix

- **Step 2:** Refactor destination token resolution order.
  - File: `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
  - Change: remove unconditional pre-branch destination token lookup; resolve only in branches that require token address.
  - Build: `cd /Users/alex/goliath/goliath-bridge-backend && npm run build`
  - Expected: build succeeds.
  - Verify: no TypeScript errors; XCN branch reachable.
  - Failure modes: compile errors from variable scoping.
  - Rollback: `git checkout -- /Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`.

- **Step 3:** Keep strict unsupported-token guard behavior.
  - File: `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
  - Change: preserve throws in `getDestinationTokenAddress()` for invalid combinations; ensure call sites are valid.
  - Build: `npm run build`
  - Expected: no behavior change for invalid true-unsupported cases.
  - Failure modes: silent fallback for unsupported tokens.
  - Rollback: `git checkout -- /Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`.

### Phase 4 - Validate

1. Run focused submitter tests.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/worker/__tests__/transactionSubmitter.test.ts`
- Expected output: all tests pass.
- Failure modes: remaining XCN path failures.
- Rollback: revert patch commit.

2. Run related integration coverage.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && npm test -- run src/__tests__/emergencyModes.test.ts src/__tests__/integration/regression.test.ts`
- Expected output: pass for touched flows.
- Failure modes: unrelated flaky network-mocked tests.
- Rollback: revert code/tests changes.

3. Build and type sanity.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && npm run build`
- Expected output: TypeScript build success.
- Failure modes: TS compile errors.
- Rollback: revert patch.

### Phase 5 - Deploy (if applicable)

1. Build and transfer images.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && ./scripts/deploy-k8s.sh build && ./scripts/deploy-k8s.sh transfer`
- Expected output: `bridge-relayer` image imported to `lon-3` and API image imported to schedulable nodes.
- Failure modes: SSH key missing, image import failure.
- Rollback: redeploy prior known-good image + rollout undo.

2. Restart relayer deployment.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && ./scripts/deploy-k8s.sh restart`
- Expected output: new relayer pod ready in `bridge-backend`.
- Failure modes: CrashLoopBackOff.
- Rollback: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl rollout undo deployment/bridge-relayer -n bridge-backend"`.

3. Post-deploy verification.
- Command: `ssh -i ~/.ssh/id_ed25519_vultr root@104.238.187.163 "kubectl -n bridge-backend logs -l app=bridge-relayer --since=20m | rg 'Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN'"`
- Expected output: no matches.
- Failure modes: recurring error indicates patch not active.
- Rollback: rollout undo + revert commit.

4. External functional check.
- Command: `cd /Users/alex/goliath/goliath-bridge-backend && ./scripts/smoke-check-routes.sh https://testnet.mirrornode.goliath.net/bridge`
- Expected output: smoke checks pass.
- Failure modes: route parity failures; unrelated API issues.
- Rollback: stop rollout progression and restore previous deployment.

### Phase 6 - Rollback Plan

**Triggers:**
- Relayer pod fails readiness/liveness repeatedly.
- New XCN operations still fail with same unsupported-token error.
- Regression on USDC/ETH path observed.

**Procedure:**
- Code: `git revert <patch-commit-sha>` in `goliath-bridge-backend`.
- Deployment: `kubectl rollout undo deployment/bridge-relayer -n bridge-backend`.
- Data: no schema/data migration rollback needed.

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
| 2026-02-26 17:20 | Traced runtime throw site in relayer submitter | Completed | Throw confirmed at `transactionSubmitter.ts:675` |
| 2026-02-26 17:24 | Validated token model (`xcn.goliath = null`) | Completed | Confirms native-delivery semantics |
| 2026-02-26 17:32 | Ran targeted submitter tests | Failed (expected baseline) | `13 tests`, `10 failed`, all XCN path expectations |
| 2026-02-26 17:35 | Correlated with recent commit history | Completed | Commit `79603ca` likely introduced regression |
| 2026-02-26 17:40 | Collected deployment script and manifest rules | Completed | `deploy-k8s.sh`, `k8s/configmap.yaml`, `k8s/*/deployment.yaml` reviewed |

### Failed Attempts

- Attempt 1: `npm test -- src/worker/__tests__/transactionSubmitter.test.ts --runInBand`
  - Why it failed: `--runInBand` is Jest-only; Vitest rejects this option.
  - What we learned: Use `npm test -- run <file>` for deterministic single-run output.

### Final State

- Changes made (diff summary): Report-only investigation complete; no production code changed in this mode.
- Tests passing: Baseline failing reproduced (pre-fix state documented).
- Deployment status: No deployment performed in this mode.
- Remaining risks / follow-ups:
  - Continued user-facing failures for XCN Sepolia->Goliath until patch is deployed.
  - Backlog growth possible if retries continue.

---

## 12) FOLLOW-UPS

- [ ] Implement Option A in backend and deploy relayer patch.
- [ ] Add CI gate requiring XCN submitter tests before relayer image build.
- [ ] Add relayer alert on repeated `Unsupported token for SEPOLIA_TO_GOLIATH destination: XCN`.
- [ ] Audit other pre-branch helper calls for branch-specific token semantics.
