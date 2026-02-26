# XCN Withdraw Stuck on "Releasing on Sepolia": Mixed API Images Cause Intermittent XCN Route 404s and OPERATION_NOT_FOUND

**Project:** CoolSwap-interface (integration with goliath-bridge-backend)
**Type:** Integration
**Priority:** P0
**Risk level:** High
**Requires deployment?:** Yes
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-25-bridge-cors-blocks-stake-preference.md`
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/tasks/bridge-cors-blocks-stake-preference/task-002-verify-migration-routes-deployed.md`
- User-provided deliverable summary (frontend `24ff2af`, backend `698da69`, reported 2026-02-26)

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

Goliath->Sepolia XCN withdraws no longer get stuck in UI status polling with `{"error":"OPERATION_NOT_FOUND"}` after users have already sent native XCN to the relayer. Every bridge-api replica must expose the same XCN routes, bind-origin must reliably succeed, and `/bridge/status?originTxHash=...` must return a real operation for valid origin txs.

**Must-have outcomes**

- [ ] All `bridge-api` pods return the same root endpoint contract (including `xcnWithdrawIntent` and `xcnWithdrawBindOrigin`)
- [ ] `POST /api/v1/bridge/xcn-withdraw-intent` and `POST /api/v1/bridge/xcn-withdraw-intent/bind-origin` never return route-level 404
- [ ] For new XCN withdraws, DB receives bound intent + created `bridge_operations` row and status endpoint resolves
- [ ] Existing stuck txs are recovered or explicitly marked with support-safe resolution steps

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: Per-pod route parity check fails pre-fix (mixed pods) and passes post-fix (all pods expose XCN routes)
- [ ] Test B: 40 repeated calls to each XCN route produce only validation/domain responses, never `Route ... not found`
- [ ] Test C: Simulated bind-origin outage in frontend transitions to explicit FAILED/recovery state (no indefinite "Releasing" spinner)

**Non-goals**

- Smart contract changes
- Rewriting bridge status lifecycle semantics
- Consensus node/network configuration changes

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux
- **Entry point:** `src/pages/Bridge/BridgeStatusModal.tsx`, `src/hooks/bridge/useBridgeXcnWithdraw.ts`
- **Build command:** `npm run build`
- **Test command:** `npm test -- --runInBand bridge`

### Related Backend Details

- **Repository path:** `~/goliath/goliath-bridge-backend`
- **Language/stack:** Fastify, TypeScript, Prisma, Kubernetes
- **Entry point:** `src/api/server.ts`, `src/worker/relayer.ts`
- **Build command:** `npm run build`
- **Test command:** `npx vitest`

### Deployment Details

- **Kubernetes namespace:** `bridge-backend`
- **Deployment name:** `bridge-api` (2 replicas), `bridge-relayer` (1 replica)
- **Docker image:** `docker.io/library/bridge-api:latest` (`imagePullPolicy: Never`)
- **RPC endpoints:** `https://rpc.testnet.goliath.net`, Sepolia provider(s)
- **Public API endpoint:** `https://testnet.mirrornode.goliath.net/bridge/api/v1`

### Network Context

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Server: `lon` (104.238.187.163)

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
- [ ] Breaking API changes must be documented
- [ ] Keep XCN route contract backward-compatible

### Operational Constraints

- Allowed downtime: none (rolling restart only)
- Blast radius: bridge-api deployment/image management, XCN withdraw flow reliability

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Bridge UI remains on **"Releasing on Sepolia"** for Goliath->Sepolia XCN withdraws.
- Browser/network calls show:
  - `GET /bridge/status?originTxHash=0xe14ebe...73b` -> `{"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}`
- Users already sent native XCN txs to relayer address, but no backend operation appears.
- Endpoint behavior is inconsistent across requests (sometimes XCN routes exist, sometimes route-level 404).

### 4.2 Impact

- **User impact:** users can transfer XCN to relayer wallet but not receive Sepolia release when intent binding fails.
- **System impact:** funds/manual recovery risk and support load; bridge trust degradation.
- **Scope:** frontend bind-origin resilience + backend deployment consistency.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/useBridgeXcnWithdraw.ts` | `bindWithRetry()` | Fire-and-forget bind; failure is only console error and does not force terminal user-visible failure/recovery path |
| `/Users/alex/goliath/CoolSwap-interface/src/services/bridgeApi.ts` | `checkXcnWithdrawCapability()` | Single root metadata probe can pass even when service pool is mixed and some pods miss routes |
| `/Users/alex/goliath/goliath-bridge-backend/k8s/api/deployment.yaml` | `bridge-api` deployment | 2 replicas, `:latest`, `imagePullPolicy: Never` allows node-local image drift |
| `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh` | `transfer_images()` | Transfers `bridge-api` image to `lon` only, not `lon-3`, despite API being schedulable on both nodes |
| `/Users/alex/goliath/goliath-bridge-backend/scripts/smoke-check-routes.sh` | smoke check scope | Probes load-balanced endpoint only; cannot guarantee per-pod parity |

### 4.4 Evidence

1. **Reported failing status query (reproduced):**

```bash
curl -sS "https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status?originTxHash=0xe14ebe5ecde91e0680f769ed89e092536763804aace5cb91f8f49a873d44973b"
# => {"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}
```

2. **Origin txs exist on-chain and were sent to relayer wallet:**

```json
{"hash":"0xe14ebe...73b","from":"0xe359...a78d","to":"0xe708...3640","value":"0x13f306a2409fc0000"}
{"hash":"0xd07c41...6fa","from":"0xe359...a78d","to":"0xe708...3640","value":"0x1a055690d9db80000"}
```

3. **DB has no `bridge_operations` rows for those tx hashes:**

```sql
SELECT origin_tx_hash, status FROM bridge_operations
WHERE origin_tx_hash IN ('0xe14ebe...73b','0xd07c41...6fa');
-- (0 rows)
```

4. **DB shows recent expired, unbound XCN intents (same sender + 23/30 XCN amounts):**

```text
state=EXPIRED, bound_origin_tx_hash=NULL, amount_atomic=23000000000000000000
state=EXPIRED, bound_origin_tx_hash=NULL, amount_atomic=30000000000000000000
```

5. **Public endpoint is mixed/flaky across calls (40-sample probes):**

```text
root_has_xcn=14 root_no_xcn=26
xcn_intent_live_400=21 xcn_intent_missing_404=19
xcn_bind_live_400=22 xcn_bind_missing_404=18
```

6. **Per-pod probe confirms two different runtime variants behind one service:**

```text
bridge-api-...-vdpm9 (lon-3) imageID sha256:c2e5... -> no xcn keys, POST xcn route => 404
bridge-api-...-wxcgc (lon)   imageID sha256:22d6... -> xcn keys present, POST xcn route => 400 VALIDATION_ERROR
```

7. **Deploy script explains drift vector:**

- `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh` transfers `bridge-api` image only to `lon`.
- API deployment has 2 replicas with anti-affinity across hosts, so one replica can run stale node-local `latest`.

8. **Branch/push verification (requested by user):**

- Frontend repo: `master` at `24ff2af`, `ahead 3` vs `origin/master` (not pushed).
- Backend repo: branch is `main` (not `master`), with no configured remote in local clone (cannot verify push from this clone).

### 4.5 Tasks

Generated task files:

- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-xcn-withdraw-stuck-op-not-found-mixed-api-images/task-001-stabilize-bridge-api-runtime-images.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-xcn-withdraw-stuck-op-not-found-mixed-api-images/task-002-fix-deploy-script-api-image-distribution.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-xcn-withdraw-stuck-op-not-found-mixed-api-images/task-003-add-per-pod-route-parity-smoke-check.md`
- `/Users/alex/goliath/CoolSwap-interface/.memory-bank/tasks/2026-02-26-xcn-withdraw-stuck-op-not-found-mixed-api-images/task-004-harden-frontend-bind-origin-failure-path.md`

### 4.6 Historical Correlation (required)

- **Recent-change regression likely?:** Yes
- **Suspected introducing change:** Deployment workflow using node-local mutable `bridge-api:latest` with `imagePullPolicy: Never` + partial node import in `/scripts/deploy-k8s.sh`.
- **Key change detail:** XCN routes were added in newer image, but only one node received that image; service now alternates between old/new route contracts.
- **Fix strategy for that change:** Patch-forward deployment process (image distribution + immutable release verification), then recover stuck operations.
- **Similar prior issue/task found?:** Yes (partial)
- **Prior solution summary:** `docs/issues/2026-02-25-bridge-cors-blocks-stake-preference.md` included route deployment verification task to detect 404 drift.
- **Applicability now:** Partial. Prior task detected route availability at LB level, but did not enforce per-pod parity or image consistency.

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The XCN withdraw flow fails when requests hit a stale `bridge-api` replica lacking XCN routes, causing bind-origin to fail and leaving intents unbound, so `bridge_operations` are never created and status polling returns `OPERATION_NOT_FOUND`.

### 5.2 Supporting Evidence

- Two running `bridge-api` pods have different `imageID`s under the same `bridge-api:latest` tag.
- Pod on `lon-3` returns route-level 404 for XCN endpoints; pod on `lon` returns expected validation response.
- Public endpoint behavior fluctuates between route-present and route-missing responses.
- Affected origin tx hashes exist on-chain and target relayer wallet, but DB has no corresponding operations.
- Recent intents for same sender are `EXPIRED` with `bound_origin_tx_hash=NULL`.
- Deploy script only imports API image on `lon`, while deployment can schedule API pods on `lon` and `lon-3`.

### 5.3 Gaps / Items to Verify

- TO VERIFY: exact commit SHA baked into each image digest.
  - Command: `ssh lon "kubectl -n bridge-backend exec deploy/bridge-api -- node -e 'console.log(process.env.GIT_SHA||\"unset\")'"`
- TO VERIFY: whether all reported stuck tx hashes in the last 24h follow same unbound-intent pattern.
  - Command: DB query by sender/amount/time window over `xcn_withdraw_intents` and `bridge_operations`.
- TO VERIFY: server-side logs for final bind-origin attempt failures in affected sessions.
  - Command: `ssh lon "kubectl -n bridge-backend logs -l app=bridge-api --since=6h | rg 'xcn-withdraw-intent/bind-origin|Route POST|INTENT_NOT_FOUND'"`

### 5.4 Root Cause (final)

- **Root cause:** Mixed `bridge-api` runtime images across cluster nodes due mutable tag + partial image distribution (`latest` + `Never` + deploy script imports API image to one node only), causing intermittent missing XCN routes.
- **Contributing factors:**
  - Frontend bind-origin is non-blocking and failure does not immediately stop/resolve the operation.
  - Smoke checks validate load-balanced endpoint, not each pod.
  - Local frontend/backend git state indicates branch/push hygiene was incomplete for the reported delivery (`master ahead 3`, backend on `main` with no local remote).

---

## 6) SOLUTIONS (compare options)

### Option A - Fix deployment consistency + per-pod verification (Recommended)

**Changes required**

- `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh`:
  - Import `bridge-api` image to **all** nodes where API may schedule (`lon` and `lon-3`), not only `lon`.
  - Add explicit post-deploy image parity check.
- `/Users/alex/goliath/goliath-bridge-backend/scripts/smoke-check-routes.sh`:
  - Add per-pod probes (not only LB endpoint).
- Operational rollout:
  - Rebuild/import/restart API deployment and verify both pods share same image digest and route contract.

**Pros**

- Fixes real root cause immediately.
- No API contract changes required.
- Removes intermittent behavior for all users.

**Cons / risks**

- Requires deployment access and careful rollout verification.
- Existing stuck txs still need recovery workflow.

**Complexity:** Medium
**Rollback:** Easy (rollout undo to previous deployment + restore previous script version)

---

### Option B - Frontend hardening of bind-origin failure path

**Changes required**

- `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/useBridgeXcnWithdraw.ts`:
  - Make bind-origin result observable and terminal if retries fail (status `FAILED` + recovery instructions).
  - Persist bind retry metadata for recovery/reporting.
- `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/__tests__/useBridgeXcnWithdraw.test.ts`:
  - Add tests for repeated bind 404/5xx and deterministic failure UI state.

**Pros**

- Reduces silent failure mode and improves user safety.
- Improves supportability with explicit error state.

**Cons / risks**

- Does not solve backend route inconsistency itself.
- Users can still send tx before bind confirmation unless flow is redesigned.

**Complexity:** Medium
**Rollback:** Easy (frontend revert)

---

### Decision

**Chosen option:** A (immediate), with B as follow-up hardening.
**Justification:** The observed production failure is primarily deployment/runtime drift, not solely frontend logic. Stabilizing backend replicas removes the intermittent 404 source that strands operations.
**Accepted tradeoffs:** Operational rollout work is required now; frontend hardening can be delivered in a second patch.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh`
  - `/Users/alex/goliath/goliath-bridge-backend/scripts/smoke-check-routes.sh`
  - `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/useBridgeXcnWithdraw.ts` (follow-up)
- [ ] Tests:
  - Backend deploy/smoke coverage for per-pod parity
  - Frontend bind-origin failure-path tests
- [ ] Config changes: optional image tag hygiene (immutable tag recommendation)
- [ ] Documentation: update deployment runbook to require per-pod route parity checks
- [ ] Deployment: backend rollout + stuck tx recovery
- [ ] Monitoring/alerts: add alert on sudden route-level 404 rate for XCN endpoints

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Backend test location:** `/Users/alex/goliath/goliath-bridge-backend/src/__tests__/integration/`
- **Frontend test location:** `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/__tests__/`
- **Run commands:**
  - `cd /Users/alex/goliath/goliath-bridge-backend && npx vitest run src/__tests__/integration/routeContract.test.ts src/__tests__/integration/xcnWithdrawRouteFlow.test.ts`
  - `cd /Users/alex/goliath/CoolSwap-interface && npm test -- --runInBand src/hooks/bridge/__tests__/useBridgeXcnWithdraw.test.ts src/hooks/bridge/__tests__/useBridgeStatusPolling.test.ts`
- **Framework:** Vitest (backend), Jest (frontend)

### 8.2 Required Tests

**Unit tests**

- [ ] `useBridgeXcnWithdraw` marks operation FAILED when bind-origin retries exhaust with route-level 404/5xx
- [ ] `checkXcnWithdrawCapability` supports quorum/per-endpoint verification (or explicit degraded detection)

**Integration tests (if applicable)**

- [ ] Deployment verification script detects mixed imageIDs and fails
- [ ] Per-pod route probes assert XCN endpoints exist on every `bridge-api` pod

**E2E tests (if applicable)**

- [ ] Manual XCN withdraw from Goliath->Sepolia creates bridge operation and reaches `COMPLETED`
- [ ] Repeated 40x probes to XCN endpoints show 0 route-level 404 after rollout

**Contract tests (if smart contract)**

- [ ] N/A

### 8.3 Baseline

- Before fix (captured):
  - `root_has_xcn=14 root_no_xcn=26` (40 probes)
  - `xcn_intent_live_400=21 xcn_intent_missing_404=19`
  - `xcn_bind_live_400=22 xcn_bind_missing_404=18`
  - `smoke-check-routes.sh` failed in 5/5 runs with 1-4 failures each

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record git and deployment state.
- Run:
  - `cd /Users/alex/goliath/CoolSwap-interface && git rev-parse --abbrev-ref HEAD && git status -sb`
  - `cd /Users/alex/goliath/goliath-bridge-backend && git rev-parse --abbrev-ref HEAD && git status -sb`
  - `ssh lon "kubectl -n bridge-backend get pods -l app=bridge-api -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IMAGEID:.status.containerStatuses[0].imageID --no-headers"`
- Expected output: branch and image drift clearly visible.
- Failure modes: SSH/kubectl access issue.
- Rollback: N/A (read-only).

2. Confirm route inconsistency baseline.
- Run: 40-sample probe loop for root + XCN intent + bind-origin.
- Expected output: mixed `400`/`404` before fix.
- Failure modes: transient network timeout.
- Rollback: N/A.

### Phase 1 - Backup / Safety

1. Capture current manifests and deployment revisions.
- Run:
  - `ssh lon "kubectl -n bridge-backend get deploy bridge-api -o yaml > /tmp/bridge-api-deploy-pre-fix.yaml"`
  - `ssh lon "kubectl -n bridge-backend rollout history deploy/bridge-api"`
- Expected output: stored baseline deployment and revision history.
- Failure modes: permission denied.
- Rollback: use saved manifest and `kubectl apply`/`rollout undo`.

### Phase 2 - Write Tests First

1. Add backend test/script assertions for per-pod parity.
- File: `/Users/alex/goliath/goliath-bridge-backend/scripts/smoke-check-routes.sh` + integration harness.
- Run: smoke/parity script against current deployment.
- Expected: FAIL before fix when pods differ.
- Failure modes: script cannot resolve pod IPs.
- Rollback: revert script edits.

2. Add frontend bind failure-path tests.
- File: `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/__tests__/useBridgeXcnWithdraw.test.ts`
- Run: Jest targeted suite.
- Expected: FAIL before hook changes.
- Failure modes: async timing flakes.
- Rollback: revert test file.

### Phase 3 - Implement the Fix

1. Patch API deployment workflow to import API image to all schedulable nodes.
- File: `/Users/alex/goliath/goliath-bridge-backend/scripts/deploy-k8s.sh`
- Change: extend `transfer_images()` to copy `bridge-api` image to `lon` and `lon-3`.
- Build: `cd /Users/alex/goliath/goliath-bridge-backend && npm run build`
- Expected: script includes both node imports for API image.
- Verify: dry run/log output confirms both imports.
- Rollback: `git checkout -- scripts/deploy-k8s.sh`

2. Strengthen smoke checks with per-pod route validation.
- File: `/Users/alex/goliath/goliath-bridge-backend/scripts/smoke-check-routes.sh`
- Change: enumerate `bridge-api` pods and probe each pod directly for root + XCN routes.
- Run: `./scripts/smoke-check-routes.sh https://testnet.mirrornode.goliath.net/bridge`
- Expected: deterministic pass only when all pods are correct.
- Verify: per-pod output includes pod names and status.
- Rollback: `git checkout -- scripts/smoke-check-routes.sh`

3. Roll out fixed backend image and verify parity.
- Run:
  - `cd /Users/alex/goliath/goliath-bridge-backend && ./scripts/deploy-k8s.sh all`
  - `ssh lon "kubectl -n bridge-backend rollout status deploy/bridge-api"`
  - `ssh lon "kubectl -n bridge-backend get pods -l app=bridge-api -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,IMAGEID:.status.containerStatuses[0].imageID --no-headers"`
- Expected: all `bridge-api` pods share identical `imageID`.
- Failure modes: import/deploy script failure on one node.
- Rollback: `ssh lon "kubectl -n bridge-backend rollout undo deploy/bridge-api"`

4. (Follow-up) Frontend bind-origin hard failure path.
- File: `/Users/alex/goliath/CoolSwap-interface/src/hooks/bridge/useBridgeXcnWithdraw.ts`
- Change: if bind cannot be confirmed after bounded retries, set explicit FAILED status + support message.
- Build: `cd /Users/alex/goliath/CoolSwap-interface && npm run build`
- Expected: no silent bind loss.
- Verify: forced bind 404 in test/mocks transitions operation to FAILED.
- Rollback: `git checkout -- src/hooks/bridge/useBridgeXcnWithdraw.ts`

### Phase 4 - Validate

1. Run backend smoke checks repeatedly (5x).
2. Re-run 40-sample route probes (expect zero 404 route-missing).
3. Run targeted backend + frontend tests.
4. Manually execute small XCN withdraw and confirm `COMPLETED`.

### Phase 5 - Deploy

1. Backend first (images + manifests + rollout).
2. Confirm route parity and relayer health.
3. Recover existing stuck txs using approved recovery process after route parity is stable.
4. Frontend deployment only after backend stability is confirmed.

### Phase 6 - Rollback Plan

**Triggers:** any route regression, pod crash loops, or increased XCN route 404s.

**Procedure:**

- Code rollback:
  - `cd /Users/alex/goliath/goliath-bridge-backend && git revert <fix-commit>`
  - `cd /Users/alex/goliath/CoolSwap-interface && git revert <fix-commit>`
- Deployment rollback:
  - `ssh lon "kubectl -n bridge-backend rollout undo deploy/bridge-api"`
  - `ssh lon "kubectl -n bridge-backend rollout undo deploy/bridge-relayer"`
- Verification:
  - rerun smoke checks and health endpoints

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing bridge flows
- [ ] Per-pod route parity confirmed
- [ ] Stuck XCN tx recovery executed/validated
- [ ] Monitoring/logs show no route-level XCN 404s

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-26 | Verified repo state/branches | Completed | Frontend `master` ahead 3; backend on `main` |
| 2026-02-26 | Reproduced status failure for reported tx | Completed | `OPERATION_NOT_FOUND` confirmed |
| 2026-02-26 | Probed public endpoints repeatedly | Completed | Intermittent root/XCN route availability observed |
| 2026-02-26 | Probed per-pod route behavior | Completed | `lon-3` pod missing XCN routes; `lon` pod has them |
| 2026-02-26 | Checked pod image IDs | Completed | Two different `imageID`s under `bridge-api:latest` |
| 2026-02-26 | Queried DB for operations/intents | Completed | No operation rows for affected txs; unbound expired intents present |

### Failed Attempts

- Attempt 1: Assume issue was only frontend polling state.
  - Why it failed: backend per-pod route mismatch reproduced directly.
  - What we learned: primary break is runtime deployment drift.

### Final State

- Changes made (diff summary): report + task decomposition only (no code fix yet).
- Tests passing: N/A for fix (investigation mode).
- Deployment status: currently inconsistent across API replicas.
- Remaining risks / follow-ups:
  - New XCN withdraws may still intermittently fail until backend image parity is fixed.
  - Existing stuck txs require explicit recovery after route stabilization.

---

## 12) FOLLOW-UPS

- [ ] Enforce immutable image tags (avoid mutable `latest` in production-like deployments)
- [ ] Add CI gate that fails if deployment scripts do not distribute images to all schedulable nodes
- [ ] Add frontend telemetry for bind-origin retries/failures
- [ ] Add operational alert for XCN route-level 404 spikes
