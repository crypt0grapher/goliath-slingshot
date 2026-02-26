# Bridge: XCN Goliath->Sepolia Stuck on "Releasing on Sepolia" (Runtime Route Drift Recurrence)

**Project:** CoolSwap-interface (primary) + goliath-bridge-backend
**Type:** Integration
**Priority:** P0
**Risk level:** High
**Requires deployment?:** Yes (backend required, frontend hardening recommended)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `/Users/alex/goliath/CoolSwap-interface/docs/issues/2026-02-26-bridge-xcn-goliath-to-sepolia-release-stuck.md` (earlier draft for same symptom)
- `/Users/alex/goliath/CoolSwap-interface/docs/issues/2026-02-26-bridge-two-way-xcn-bridging.md` (feature design this flow depends on)
- `/Users/alex/goliath/CoolSwap-interface/docs/issues/2026-02-25-migrate-chn-spelling-and-bridge-step-failure.md` (prior deployment-route mismatch pattern)
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-25-bridge-cors-blocks-stake-preference.md` (live config/runtime drift)
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-25-stake-preference-signature-mismatch-recurrence.md` (migration path hardening lessons)
- `/Users/alex/goliath/goliath-bridge-backend/docs/issues/2026-02-20-user-report-stuck-txs-and-double-execution.md` (historical stuck-tx investigation baseline)

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

For XCN Goliath->Sepolia, the bridge no longer stalls at "Releasing on Sepolia": the backend accepts intent/bind API calls, creates a `BridgeOperation`, relays to Sepolia, and frontend status polling reaches terminal state (`COMPLETED` or explicit failure with reason).

**Must-have outcomes**

- [ ] Live backend exposes `POST /api/v1/bridge/xcn-withdraw-intent` and `POST /api/v1/bridge/xcn-withdraw-intent/bind-origin`
- [ ] `GET /api/v1/bridge/status?originTxHash=<hash>` returns non-404 for new XCN withdrawals after bind
- [ ] Existing stuck tx (`0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa`) has a defined recovery path
- [ ] Frontend blocks or degrades safely if backend XCN routes are unavailable (no silent funds transfer + infinite polling)

**Acceptance criteria (TDD)**

Tests expected to fail before fix and pass after:

- [ ] Test A (backend integration): root route contract check includes `xcnWithdrawIntent` and `xcnWithdrawBindOrigin` in service endpoint map.
- [ ] Test B (backend integration): `POST /api/v1/bridge/xcn-withdraw-intent` responds `200` or `400` validation error (never route 404).
- [ ] Test C (backend integration): register intent -> bind origin -> processor creates `BridgeOperation` retrievable by `/bridge/status`.
- [ ] Test D (frontend unit): if capability probe fails, Goliath->Sepolia XCN submit path is blocked and user sees actionable error.
- [ ] Test E (frontend unit/integration): repeated status 404 transitions operation to explicit degraded state with support guidance instead of indefinite spinner.

**Non-goals**

- Smart-contract redeployments or bridge contract address changes.
- Redesigning two-way XCN architecture.
- Modifying consensus/node infra.

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface` (detected from current CWD)
- **Related backend repo:** `~/goliath/goliath-bridge-backend`
- **Language/stack:** React + TypeScript (frontend), Fastify + TypeScript + Prisma + ethers (backend)
- **Frontend bridge entry points:**
  - `src/hooks/bridge/useBridgeXcnWithdraw.ts`
  - `src/hooks/bridge/useBridgeStatusPolling.ts`
- **Backend route entry point (source):** `src/api/server.ts`
- **Backend XCN route module (source):** `src/api/routes/xcnWithdraw.ts`
- **Build commands:**
  - Frontend: `npm run build`
  - Backend: `npm run build`
- **Test commands:**
  - Frontend: `npm test`
  - Backend: `npm test`

### Deployment Details

- **Kubernetes namespace:** `bridge-backend`
- **API deployment:** `bridge-api`
- **Relayer deployment:** `bridge-relayer`
- **Public API base:** `https://testnet.mirrornode.goliath.net/bridge/api/v1`
- **Public root (service metadata):** `https://testnet.mirrornode.goliath.net/bridge/`

### Network Context

- Chain ID: 8901 / `0x22c5`
- Goliath Testnet
- Server: `104.238.187.163` (`lon`)

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys, mnemonics, kubeconfigs, or secrets
- [ ] Do NOT perform consensus-affecting rolling changes without freeze gate

### Code Change Constraints

- [ ] Keep existing ETH/USDC bridge flows intact
- [ ] New behavior must be test-covered
- [ ] API contract changes must be documented and backward-compatible where possible

### Operational Constraints

- Allowed downtime: brief rolling restarts only
- Blast radius: bridge backend API/relayer + bridge tab XCN flow

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User flow: Goliath->Sepolia XCN remains stuck on "releasing on Sepolia".
- Frontend repeatedly calls status endpoint and receives 404:
  - `GET /bridge/api/v1/bridge/status?originTxHash=0xd07c...` -> `{"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}`
- Live XCN withdraw endpoints currently return route-not-found.

### 4.2 Impact

- **User impact:** Native XCN transfer reaches relayer wallet, but no corresponding bridge operation appears; user is blocked and uncertain whether funds are recoverable.
- **System impact:** Repeated status polling for non-existent operation creates noisy error traffic and masks the real issue.
- **Scope:** XCN Goliath->Sepolia path only; indicates runtime deployment drift risk across bridge features.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/bridge/useBridgeXcnWithdraw.ts` (frontend) | `withdraw()` | Assumes backend XCN endpoints exist; bind failure is fire-and-forget and not surfaced to user state. |
| `src/hooks/bridge/useBridgeStatusPolling.ts` (frontend) | `pollStatus()` | 404 is treated as null/retry; operation can remain indefinitely non-terminal. |
| `src/api/server.ts` (backend source) | route registration | Source registers `xcnWithdrawRoutes`, but live runtime does not expose these routes, indicating deployment/image drift. |
| `src/api/routes/xcnWithdraw.ts` (backend source) | XCN intent + bind routes | Present in source, absent in live runtime responses. |

### 4.4 Evidence

1) User-reported status failure (reproduced):

```bash
curl -sS "https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status?originTxHash=0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa"
```

Observed response:

```json
{"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}
```

2) Live backend service metadata omits XCN intent endpoints:

```bash
curl -sS "https://testnet.mirrornode.goliath.net/bridge/"
```

Observed response includes only:
- `/api/v1/bridge/status`
- `/api/v1/bridge/history`
- `/api/v1/migration/stake-preference`
- `/api/v1/migration/stake-preference/bind-origin`
- `/api/v1/health`
- `/metrics`

and does **not** include:
- `/api/v1/bridge/xcn-withdraw-intent`
- `/api/v1/bridge/xcn-withdraw-intent/bind-origin`

3) Direct POST to live XCN endpoints returns route-not-found:

```bash
curl -sS -X POST "https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/xcn-withdraw-intent" -H 'content-type: application/json' --data '{}'
```

```json
{"message":"Route POST:/api/v1/bridge/xcn-withdraw-intent not found","error":"Not Found","statusCode":404}
```

```bash
curl -sS -X POST "https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/xcn-withdraw-intent/bind-origin" -H 'content-type: application/json' --data '{}'
```

```json
{"message":"Route POST:/api/v1/bridge/xcn-withdraw-intent/bind-origin not found","error":"Not Found","statusCode":404}
```

4) User origin transaction exists and succeeded on Goliath, to relayer wallet:

```bash
curl -sS https://rpc.testnet.goliath.net -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":["0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa"]}'
```

Key fields observed:
- `to`: `0xe708b75f7b6914479e63d3897bef9e0dedca3640` (relayer)
- `value`: `0x1a055690d9db80000`
- `chainId`: `0x22c5`

```bash
curl -sS https://rpc.testnet.goliath.net -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa"]}'
```

Key fields observed:
- `status`: `0x1`
- `to`: `0xe708b75f7b6914479e63d3897bef9e0dedca3640`

### 4.5 Tasks

Task files generated in:
- `.memory-bank/tasks/2026-02-26-bridge-xcn-goliath-to-sepolia-release-stuck-route-drift/`
- `task-001-verify-runtime-route-contract-and-image-drift.md`
- `task-002-rollout-backend-xcn-routes-and-processor.md`
- `task-003-recover-stuck-origin-transaction.md`
- `task-004-add-frontend-capability-gate-and-404-terminal-state.md`
- `task-005-add-regression-tests-and-runtime-smoke-checks.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The frontend XCN reverse-bridge flow is active, but the live backend runtime is not serving the required XCN intent/bind routes (deployment/image drift), so no bound intent can be processed into a `BridgeOperation`, and status polling remains 404.

### 5.2 Supporting Evidence

- Live root endpoint (`/bridge/`) omits XCN endpoints.
- Live POST to XCN endpoints returns route 404.
- Local backend source includes route registration (`src/api/server.ts`) and XCN route module (`src/api/routes/xcnWithdraw.ts`), so code/runtime mismatch exists.
- Origin transaction itself is valid and successful to relayer wallet, reducing likelihood of user-side tx failure as primary cause.

### 5.3 Gaps / Items to Verify

- TO VERIFY runtime image/version actually deployed:
  - Command: `ssh lon "kubectl -n bridge-backend get pods -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.containers[0].image}{" "}{.status.containerStatuses[0].imageID}{"\n"}{end}'"`
- TO VERIFY whether relayer pod includes XCN processor startup logs:
  - Command: `ssh lon "kubectl -n bridge-backend logs deploy/bridge-relayer --since=30m | grep -Ei 'xcn|withdraw|processor started'"`
- TO VERIFY whether existing stuck tx has corresponding intent/bound intent rows:
  - Command: `ssh lon "kubectl -n bridge-backend exec -i bridge-db-0 -- psql -U bridge_user -d bridge_db -c \"SELECT id,state,\"\"boundOriginTxHash\"\" FROM \"\"XcnWithdrawIntent\"\" WHERE \"\"boundOriginTxHash\"\"='0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa';\""`

### 5.4 Root Cause (final)

- **Root cause:** Runtime deployment drift: live bridge backend does not expose XCN withdraw routes required by the shipped frontend reverse-bridge flow.
- **Contributing factors:**
  - Prior recurring pattern of route/config drift across bridge/migration issues.
  - Missing runtime capability gate in frontend before initiating native transfer.
  - Polling logic treats persistent 404 as retriable noise rather than a hard flow-break condition.

---

## 6) SOLUTIONS (compare options)

### Option A - Backend Runtime Parity Rollout (primary fix)

**Changes required**
- Deploy backend image revision that includes `xcnWithdrawRoutes` and `XcnWithdrawProcessor`.
- Confirm database schema/migrations include `XcnWithdrawIntent` model.
- Verify live endpoint contract includes XCN route paths.

**Pros**
- Fixes production path where flow currently breaks.
- Aligns runtime with existing source architecture.

**Cons / risks**
- Requires operational rollout and validation across API + relayer.
- Existing stuck user tx may still require recovery/backfill handling.

**Complexity:** Medium
**Rollback:** Moderate (`kubectl rollout undo` both deployments)

---

### Option B - Frontend Capability Gate + Fail-Fast Degradation (defense-in-depth)

**Changes required**
- On bridge init (or before submit), probe XCN endpoint capability.
- If unsupported, disable Goliath->Sepolia XCN action and show explicit backend-unavailable message.
- Convert prolonged 404 polling into terminal degraded status with support CTA.

**Pros**
- Prevents further user funds entering a broken path when backend drifts again.
- Improves diagnosability.

**Cons / risks**
- Does not recover already stuck transactions.
- Requires frontend deployment even after backend fix.

**Complexity:** Low
**Rollback:** Easy (frontend revert)

---

### Decision

**Chosen option:** Option A + Option B combined.

**Justification:** Option A resolves the current outage; Option B prevents recurrence from the same failure mode seen in earlier issues.

**Accepted tradeoffs:** Slightly larger change scope now to reduce repeated incident cost.

---

## 7) DELIVERABLES

- [ ] Backend deployment parity restored (XCN routes live)
- [ ] Relayer runtime confirms XCN processor active
- [ ] Stuck tx recovery path executed/documented
- [ ] Frontend capability gate for XCN reverse bridge
- [ ] Frontend improved 404 terminal handling
- [ ] New/updated tests covering runtime capability assumptions

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Backend test location:** `~/goliath/goliath-bridge-backend/src/__tests__/integration/` and `src/api/routes/__tests__/`
- **Frontend test location:** `~/goliath/CoolSwap-interface/src/hooks/bridge/__tests__/` and/or `src/services/__tests__/`
- **Run command (backend):** `npm test`
- **Run command (frontend):** `npm test`
- **Framework:** Vitest (backend), Jest/RTL setup in frontend repo

### 8.2 Required Tests

**Unit tests**
- [ ] Frontend: XCN submit blocked when capability probe indicates route missing.
- [ ] Frontend: persistent status 404 transitions to explicit degraded state.

**Integration tests**
- [ ] Backend: XCN intent route exists and validates payload contract.
- [ ] Backend: bind-origin path maps domain errors correctly and non-route errors are distinguishable from route absence.
- [ ] Backend: XCN intent -> bind -> processor -> operation status retrievable by origin hash.

**E2E tests (if applicable)**
- [ ] Small-amount XCN Goliath->Sepolia manual runbook verification after rollout.

**Contract tests (if smart contract)**
- [ ] N/A (no contract changes).

### 8.3 Baseline

- Before fix (live runtime): XCN endpoint probes return route 404; status for user tx hash returns OPERATION_NOT_FOUND.

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Validate live route contract mismatch.
- Command:
  ```bash
  curl -sS https://testnet.mirrornode.goliath.net/bridge/
  ```
- Expected output: endpoint map missing XCN intent routes.
- Failure modes: proxy/network timeout.
- Rollback: N/A (read-only).

2. Validate XCN routes currently unavailable.
- Command:
  ```bash
  curl -sS -X POST https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/xcn-withdraw-intent -H 'content-type: application/json' --data '{}'
  ```
- Expected output: `Route POST:/api/v1/bridge/xcn-withdraw-intent not found`.
- Failure modes: 5xx from gateway, transient DNS errors.
- Rollback: N/A.

3. Validate user origin tx exists and succeeded.
- Command:
  ```bash
  curl -sS https://rpc.testnet.goliath.net -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa"]}'
  ```
- Expected output: receipt with `status: 0x1` and relayer `to` address.
- Failure modes: RPC unavailable.
- Rollback: N/A.

### Phase 1 - Backend Runtime Parity

4. Build and deploy backend revision with XCN routes/processor.
- Command:
  ```bash
  ssh lon "cd ~/goliath/goliath-bridge-backend && git pull && npm ci && npm run build"
  ```
- Expected output: successful build with no TypeScript errors.
- Failure modes: merge conflicts, build failure, missing deps.
- Rollback: checkout previous known-good commit on server.

5. Ensure DB schema ready.
- Command:
  ```bash
  ssh lon "cd ~/goliath/goliath-bridge-backend && npx prisma migrate deploy"
  ```
- Expected output: migration up-to-date or successfully applied.
- Failure modes: migration lock/conflict.
- Rollback: restore DB from backup snapshot if destructive migration occurred (none expected).

6. Rebuild runtime images and roll out.
- Command:
  ```bash
  ssh lon "cd ~/goliath/goliath-bridge-backend && docker build -t bridge-api:latest . && docker build -t bridge-relayer:latest -f Dockerfile.relayer . && kubectl -n bridge-backend rollout restart deploy/bridge-api && kubectl -n bridge-backend rollout restart deploy/bridge-relayer"
  ```
- Expected output: rollout completes, new pods Ready.
- Failure modes: image build fail, CrashLoopBackOff.
- Rollback: `kubectl -n bridge-backend rollout undo deploy/bridge-api && kubectl -n bridge-backend rollout undo deploy/bridge-relayer`.

7. Verify live route contract after rollout.
- Command:
  ```bash
  curl -sS https://testnet.mirrornode.goliath.net/bridge/
  ```
- Expected output: endpoint map includes XCN intent + bind-origin paths.
- Failure modes: stale pod still serving old image.
- Rollback: rollback deployments and retry controlled rollout.

### Phase 2 - Stuck Operation Recovery

8. Check for existing intent/bound-intent for stuck origin tx.
- Command:
  ```bash
  ssh lon "kubectl -n bridge-backend exec -i bridge-db-0 -- psql -U bridge_user -d bridge_db -c \"SELECT id,state,\"\"boundOriginTxHash\"\" FROM \"\"XcnWithdrawIntent\"\" WHERE \"\"boundOriginTxHash\"\"='0xd07c4132721133619c5da4e90677a0851b1e6d2438b092c7a1282fa21280a6fa';\""
  ```
- Expected output: either matching row (processable) or empty result (needs manual backfill path).
- Failure modes: SQL quoting issues, auth permissions.
- Rollback: N/A for SELECT.

9. Recover funds path.
- If intent exists but not consumed: restart/observe processor to consume and create operation.
- If intent missing: run a one-off audited recovery script (in backend repo) that creates a reconciled `BridgeOperation` from confirmed tx hash and queues release.
- Expected output: `/bridge/status?originTxHash=<hash>` stops returning 404.
- Failure modes: duplicate unique keys, malformed manual insert.
- Rollback: revert one-off script change; delete only inserted recovery row if safe and validated.

### Phase 3 - Frontend Hardening

10. Add runtime capability guard for reverse XCN flow.
- File: `src/hooks/bridge/useBridgeXcnWithdraw.ts` (and a small API capability helper)
- Change: pre-check route availability; fail with explicit UX message before native transfer.
- Build command: `npm run build`
- Expected: build success, no regression in ETH path.
- Rollback: `git checkout -- <modified frontend files>`.

11. Add terminal handling for persistent 404 status polling.
- File: `src/hooks/bridge/useBridgeStatusPolling.ts`
- Change: after bounded null responses/time window, set operation to degraded/failed with support guidance.
- Test command: `npm test -- --watch=false`
- Expected: tests for bounded behavior pass.
- Failure modes: false positives on short propagation delays.
- Rollback: revert polling change.

### Phase 4 - Validate

12. Run test suites + manual bridge verification.
- Commands:
  ```bash
  cd ~/goliath/goliath-bridge-backend && npm test
  cd ~/goliath/CoolSwap-interface && npm test && npm run build
  ```
- Expected output: tests pass; manual small XCN transfer completes and status reaches terminal state.
- Failure modes: flaky integration tests, RPC instability.
- Rollback: pause XCN reverse flow via frontend flag until stable.

### Phase 5 - Deploy

13. Deploy backend then frontend in that order.
- Expected output: backend capability available before frontend enables path.
- Failure modes: ordering reversed causing repeat incident.
- Rollback: keep frontend capability gate disabled if backend not confirmed.

### Phase 6 - Rollback Plan

**Triggers:** route probes fail, relayer errors spike, XCN operations remain non-terminal > 10 minutes.

**Procedure:**
- Code rollback: `git revert <release-commits>` (frontend/backend separately).
- Deployment rollback: `kubectl rollout undo` for affected deployments.
- Data rollback: for manual recovery rows only, perform targeted delete/update with explicit tx hash guards.

---

## 10) VERIFICATION CHECKLIST

- [ ] Live `/bridge/` endpoint includes XCN route contract
- [ ] Live XCN intent POST no longer returns route 404
- [ ] Status endpoint resolves for new XCN reverse operations
- [ ] User-reported stuck hash has documented disposition (completed/recovered/manual compensation)
- [ ] Frontend prevents initiating flow when backend capability missing
- [ ] No ETH/USDC bridge regressions

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-26 13:39:34 UTC | Reproduced status query for user tx hash | `OPERATION_NOT_FOUND` | Confirms user symptom is active |
| 2026-02-26 13:39:34 UTC | Queried live service root `/bridge/` | XCN endpoints missing | Runtime contract differs from local source expectations |
| 2026-02-26 13:39:34 UTC | Probed live XCN intent and bind-origin routes | Route 404 for both | Strong evidence of deployment/image drift |
| 2026-02-26 13:39:34 UTC | Queried Goliath RPC for tx/receipt | Tx exists, status `0x1`, recipient is relayer | User tx succeeded on origin chain |
| 2026-02-26 13:39:34 UTC | Reviewed earlier bridge/migration issues | Recurrence pattern confirmed | Deployment/runtime drift has occurred previously |

### Failed Attempts

- Attempt 1: infer issue solely as delayed processing without validating route availability.
  - Why it failed: did not explain route-not-found evidence.
  - What we learned: route contract probing must be part of bridge triage checklist.

### Final State

- Changes made (diff summary): new consolidated issue report + task decomposition files.
- Tests passing: not executed in this report-only phase.
- Deployment status: unchanged in this report-only phase.
- Remaining risks / follow-ups: runtime drift may recur unless capability gating + release checklist is enforced.

---

## 12) FOLLOW-UPS

- [ ] Add release gate: block frontend XCN reverse path unless backend capability probe passes in production.
- [ ] Add synthetic monitoring for `/bridge/` endpoint contract (alert if XCN routes disappear).
- [ ] Add playbook for recovery of txs sent to relayer when bind/intent path fails.
- [ ] Extend post-deploy smoke tests to include one full XCN Goliath->Sepolia dry run.
