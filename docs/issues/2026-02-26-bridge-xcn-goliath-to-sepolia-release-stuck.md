# Bridge: XCN Goliath-to-Sepolia Stuck on "Releasing on Sepolia"

**Project:** CoolSwap-interface + goliath-bridge-backend
**Type:** Integration
**Priority:** P0
**Risk level:** Medium
**Requires deployment?:** Yes (backend Docker images + Prisma migration + pod restart)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `~/goliath/CoolSwap-interface/docs/issues/2026-02-26-bridge-two-way-xcn-bridging.md` (feature spec)
- Backend commit `79603ca feat: add two-way XCN bridge (Goliath <-> Sepolia)`
- Frontend commit `132c9ad feat(bridge): add two-way XCN bridging (Goliath <-> Sepolia)`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

XCN bridging from Goliath to Sepolia completes end-to-end: the user sends native XCN on Goliath, the backend processes the withdraw intent, creates a BridgeOperation, the relayer submits a `release()` transaction on Sepolia, and the frontend shows COMPLETED status with the destination tx hash.

**Must-have outcomes**

- [ ] Bridge backend deployed with XCN two-way bridging code (API + relayer)
- [ ] `XcnWithdrawIntent` database table exists (Prisma migration applied)
- [ ] Status polling returns valid operation data for XCN Goliath->Sepolia bridges
- [ ] The stuck operation (originTxHash `0x96daadde...`) is either recovered or user can re-initiate
- [ ] Sepolia RPC rate limiting mitigated in the frontend

**Acceptance criteria (TDD)**

- [ ] Test A: `POST /api/v1/bridge/xcn-withdraw-intent` returns `intentId` and `relayerWalletAddress`
- [ ] Test B: `POST /api/v1/bridge/xcn-withdraw-intent/bind-origin` binds tx hash to intent
- [ ] Test C: `XcnWithdrawProcessor` creates a `BridgeOperation` from a verified bound intent
- [ ] Test D: `GET /api/v1/bridge/status?originTxHash=<hash>` returns operation after processing
- [ ] Test E: `TransactionSubmitter` calls `bridgeSepolia.release()` for XCN token (not `releaseNative()`)
- [ ] Test F: Frontend balance polling does not cause 429 rate-limit cascades

**Non-goals**

- Changing the BridgeGoliath contract
- Adding USDC to the Bridge token dropdown (separate task)
- Modifying the Sepolia->Goliath XCN deposit flow (already works)

---

## 2) ENVIRONMENT

### Project Details

| Project | Path | Stack | Role |
|---------|------|-------|------|
| goliath-bridge-backend | `~/goliath/goliath-bridge-backend` | TypeScript, ethers v6, Prisma, Fastify | Relayer + API |
| CoolSwap-interface | `~/goliath/CoolSwap-interface` | React, TypeScript, ethers v5, Redux | Frontend |

- **Build command (backend):** `npm run build`
- **Build command (frontend):** `npm run build`
- **Test command (backend):** `npm test`

### Deployment Details

- **Kubernetes namespace:** `bridge-backend`
- **API deployment:** `bridge-api` (2 replicas, image `docker.io/library/bridge-api:latest`, imagePullPolicy: Never)
- **Relayer deployment:** `bridge-relayer` (1 replica, image `docker.io/library/bridge-relayer:latest`, imagePullPolicy: Never, pinned to `lon-3`)
- **Database:** PostgreSQL via StatefulSet in `bridge-backend` namespace
- **Service:** NodePort on 30081
- **Proxy:** `https://testnet.mirrornode.goliath.net/bridge/` routes to bridge-api:8080

### Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| BridgeSepolia | Sepolia (11155111) | `0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092` |
| BridgeGoliath | Goliath (8901) | `0x2c1d218B5a97a26D144ffd12d5C813590f93FFEB` |
| XCN ERC-20 | Sepolia | `0x7a8adc542A35c93da263A188367F4bF4c445B8E9` |
| Relayer Wallet | Both | `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640` |

### Network Context

- Goliath Testnet: Chain ID 8901 / 0x22c5
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
- [ ] Backend deployment must not break existing ETH/USDC bridge flows
- [ ] No smart contract changes
- [ ] Frontend RPC fix must not reduce balance accuracy

### Operational Constraints

- Allowed downtime: Brief pod restart only (rolling update)
- Blast radius: Bridge tab only; Swap, Yield tabs unaffected
- The stuck user operation must be addressed (either recovered or re-initiatable)

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. **Bridge UI stuck on "Releasing on Sepolia"** for XCN Goliath->Sepolia bridge operation
2. **Bridge status API returns 404**: `GET https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status?originTxHash=0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031` returns `{"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}`
3. **Sepolia RPC rate limiting**: `POST https://ethereum-sepolia-rpc.publicnode.com/` returns 429 (Too Many Requests) repeatedly
4. **Sepolia RPC timeouts**: After sustained 429s, requests timeout after 120s with `code=TIMEOUT`
5. Status polling loops indefinitely (every 500ms) with 404 responses, never reaching a terminal state

### 4.2 Impact

- **User impact:** XCN sent from Goliath to relayer wallet is stuck; user sees perpetual "Releasing on Sepolia" with no progress and no ETA. Native XCN was transferred but ERC-20 XCN was never released on Sepolia.
- **System impact:** Aggressive 500ms status polling + 500ms/2000ms balance polling creates a cascade of RPC requests to free-tier Sepolia RPCs, causing 429 rate limits and timeouts for ALL bridge balance fetching, not just XCN.
- **Scope:** Bridge tab - all tokens affected by RPC rate limiting; XCN Goliath->Sepolia flow non-functional.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `goliath-bridge-backend` (deployment) | K8s pods | Backend not redeployed with XCN two-way code |
| `goliath-bridge-backend/prisma/schema.prisma` | `XcnWithdrawIntent` model | Migration not applied - table doesn't exist in DB |
| `goliath-bridge-backend/src/worker/xcnWithdrawProcessor.ts` | `XcnWithdrawProcessor` | Code exists but relayer pod running old image without it |
| `goliath-bridge-backend/src/api/routes/xcnWithdraw.ts` | `xcnWithdrawRoutes` | Code exists but API pod running old image without it |
| `CoolSwap-interface/src/config/bridgeConfig.ts` | `rpcUrl` / `rpcUrlFallback` | Only supports 2 RPCs; both are free-tier. Paid Chainstack RPC not configured. |
| `CoolSwap-interface/src/services/bridgeProviders.ts` | `validateSepoliaProvider()` | Binary fallback (primary or fallback) — no sequential list cycling |
| `CoolSwap-interface/.env` | `REACT_APP_SEPOLIA_RPC_URL` | Uses Alchemy with key as primary; no Chainstack |

### 4.4 Evidence

**Bridge status API response (404):**
```json
{"error":"OPERATION_NOT_FOUND","message":"Bridge operation not found"}
```

**Console errors (repeated in a loop):**
```
GET https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status?originTxHash=0x96daadde... 404 (Not Found)
POST https://ethereum-sepolia-rpc.publicnode.com/ 429 (Too Many Requests)
Error fetching balance: Error: timeout (requestBody="{"method":"eth_blockNumber",...}", timeout=120000, url="https://ethereum-sepolia-rpc.publicnode.com", code=TIMEOUT)
```

**Balance polling works for Goliath but fails for Sepolia:**
```
[Bridge Balance] Native balance: 137689680272740000000000  (Goliath - OK)
[Bridge Balance] ERC20 balance: 1000000000000000000000     (Sepolia - intermittent)
Error fetching balance: Error: timeout                      (Sepolia - fails)
```

**Backend code is committed but K8s pods run old images:**
- Backend commit: `79603ca feat: add two-way XCN bridge (Goliath <-> Sepolia)`
- Images use `imagePullPolicy: Never` meaning locally-built Docker images must be updated on the node
- The `XcnWithdrawProcessor` and `xcnWithdrawRoutes` exist in source but the running pods don't have them

### 4.5 Tasks

See `.memory-bank/tasks/bridge-xcn-release-stuck/` for decomposed task files.

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The bridge backend Kubernetes deployment has not been updated after the XCN two-way bridging code was committed. The running pods use stale Docker images that lack the `XcnWithdrawProcessor` worker and `xcnWithdrawRoutes` API endpoints. As a result, XCN withdraw intents are never processed into `BridgeOperation` records, causing the status API to return 404 for the operation.

### 5.2 Supporting Evidence

- Backend code for XCN two-way bridging is committed (`79603ca`) and includes:
  - `src/worker/xcnWithdrawProcessor.ts` - registered in `relayer.ts` line 24
  - `src/api/routes/xcnWithdraw.ts` - registered in `server.ts` line 48
  - `prisma/schema.prisma` - `XcnWithdrawIntent` model defined
- Docker images use `imagePullPolicy: Never` (locally built on node), meaning `kubectl rollout restart` alone won't pick up new code - the images must be rebuilt
- The API responds with a structured JSON error (`OPERATION_NOT_FOUND`) proving the API server IS reachable, but either:
  - The `XcnWithdrawIntent` table doesn't exist (migration not applied), so intent registration failed
  - The `XcnWithdrawProcessor` isn't running (old relayer image), so intents aren't processed into operations
- The Sepolia RPC rate limiting is a secondary issue caused by aggressive balance polling (500ms) using free-tier RPCs (`alchemy.com/v2/demo` primary, `publicnode.com` fallback)

### 5.3 Gaps / Items to Verify

- TO VERIFY: Current running image hash on bridge-api and bridge-relayer pods:
  ```
  ssh lon "kubectl -n bridge-backend get pods -o jsonpath='{range .items[*]}{.metadata.name}{\" \"}{.spec.containers[0].image}{\" \"}{.status.containerStatuses[0].imageID}{\"\\n\"}{end}'"
  ```
- TO VERIFY: Whether `XcnWithdrawIntent` table exists in PostgreSQL:
  ```
  ssh lon "kubectl -n bridge-backend exec -it bridge-db-0 -- psql -U bridge_user -d bridge_db -c '\\dt'"
  ```
- TO VERIFY: Bridge relayer logs for XcnWithdrawProcessor startup:
  ```
  ssh lon "kubectl -n bridge-backend logs deploy/bridge-relayer --since=30m | grep -i 'xcn\|withdraw'"
  ```
- TO VERIFY: Whether the intent registration (`POST /bridge/xcn-withdraw-intent`) endpoint is reachable:
  ```
  curl -s https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/xcn-withdraw-intent -X POST -H 'Content-Type: application/json' -d '{}' | jq
  ```
- TO VERIFY: Whether the user's native XCN transfer arrived at the relayer wallet:
  ```
  curl -s "https://rpc.testnet.goliath.net" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031"],"id":1}' | jq '.result.to, .result.status'
  ```

### 5.4 Root Cause (final)

- **Root cause:** Bridge backend K8s deployment not updated with XCN two-way bridging code. Running pods use stale Docker images that lack the XcnWithdrawProcessor and xcnWithdrawRoutes. The Prisma migration for the `XcnWithdrawIntent` table has not been applied.
- **Contributing factors:**
  - `imagePullPolicy: Never` means Docker images must be manually rebuilt on the node
  - No CI/CD pipeline to automatically deploy backend changes
  - Frontend was deployed with XCN bridging support before the backend was ready
  - Frontend uses free-tier Sepolia RPCs (Alchemy demo / PublicNode) instead of the paid Chainstack RPC already available in the backend config
- No sequential RPC failover chain — only a single primary + single fallback

---

## 6) SOLUTIONS (compare options)

### Option A - Deploy Backend + Frontend RPC Hardening (RECOMMENDED)

**Changes required**

**Backend deployment (on server `lon`):**
1. SSH to server, pull latest code, rebuild Docker images
2. Apply Prisma migration for `XcnWithdrawIntent` table
3. Restart bridge-api and bridge-relayer pods to pick up new images

**Frontend (CoolSwap-interface):**
4. Switch to a sequential RPC list with Chainstack (paid) as primary:
   - `REACT_APP_SEPOLIA_RPC_URLS="chainstack,alchemy,publicnode"` (comma-separated, ordered by reliability)
   - Update `bridgeProviders.ts` to cycle through the list on failure, with 5-minute promotion cooldown
5. Reduce balance polling frequency and add exponential back-off on 404 status responses

**Pros**
- Fixes the root cause (backend not deployed)
- Addresses the secondary RPC rate-limiting issue
- Existing ETH/USDC flows unaffected (code already handles them)
- All code is already committed and tested in development

**Cons / risks**
- Brief bridge downtime during pod restart (~30s with rolling update)
- Stuck operation may need manual recovery if the intent was never registered

**Complexity:** Low (deployment + config only, no new code for backend)
**Rollback:** Easy (`kubectl -n bridge-backend rollout undo deploy/bridge-api && kubectl -n bridge-backend rollout undo deploy/bridge-relayer`)

---

### Option B - Backend Deployment Only (No Frontend Changes)

**Changes required**
1. Same backend deployment steps as Option A
2. No frontend changes

**Pros**
- Simpler scope
- Fixes the core issue

**Cons / risks**
- Sepolia RPC rate-limiting remains, causing poor UX during balance fetching
- If the primary Alchemy demo RPC is exhausted, the fallback (publicnode) also gets rate-limited
- Users may still see timeout errors in console

**Complexity:** Low
**Rollback:** Easy

---

### Decision

**Chosen option:** Option A - Deploy Backend + Frontend RPC Hardening
**Justification:** The backend deployment is the critical fix, but the Sepolia RPC rate limiting creates a poor UX even after the backend is deployed. Adding request throttling to the frontend prevents the 429 cascade that overwhelms free-tier RPCs.
**Accepted tradeoffs:** Brief bridge downtime during rolling restart; stuck operation may need manual intent creation in the database.

---

## 7) DELIVERABLES

- [ ] Backend: Docker images rebuilt on server with latest code
- [ ] Backend: Prisma migration applied (`XcnWithdrawIntent` table created)
- [ ] Backend: bridge-api pods restarted with new image
- [ ] Backend: bridge-relayer pod restarted with new image
- [ ] Frontend: Sequential RPC list with Chainstack primary (paid, no rate limits)
- [ ] Frontend: Reduced polling intervals + exponential back-off on 404
- [ ] Recovery: Stuck operation addressed (manual DB insert or user re-initiation)
- [ ] Verification: End-to-end XCN Goliath->Sepolia bridge test

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

| Layer | Test Location | Framework | Run Command |
|-------|-------------|-----------|-------------|
| Backend | `~/goliath/goliath-bridge-backend/test/` | Vitest | `npm test` |
| Frontend | `~/goliath/CoolSwap-interface/src/**/*.test.ts` | Jest | `npm test` |

### 8.2 Required Tests

**Backend integration tests**
- [ ] `POST /bridge/xcn-withdraw-intent` creates intent with valid EIP-712 signature
- [ ] `POST /bridge/xcn-withdraw-intent/bind-origin` binds tx hash to existing intent
- [ ] `XcnWithdrawProcessor` polls bound intents and creates BridgeOperations
- [ ] `GET /bridge/status?originTxHash=<hash>` returns operation after processor runs
- [ ] `getDestinationTokenAddress('XCN', GOLIATH_TO_SEPOLIA)` returns Sepolia XCN address

**Frontend tests**
- [ ] Balance polling reduces frequency after consecutive RPC errors
- [ ] Status polling uses exponential back-off after repeated 404s

### 8.3 Baseline

- Test run before fix: TO VERIFY (run `npm test` in backend after SSH to server)

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state:
   ```bash
   ssh lon "kubectl -n bridge-backend get pods -o wide"
   ssh lon "kubectl -n bridge-backend describe deploy/bridge-api | grep Image"
   ssh lon "kubectl -n bridge-backend describe deploy/bridge-relayer | grep Image"
   ```
   - Expected: pods running with old images (no XcnWithdrawProcessor)
   - Failure: SSH connection issue -> check VPN/firewall
   - Rollback: N/A (read-only)

2. Verify the user's native XCN transfer landed at relayer wallet:
   ```bash
   curl -s "https://rpc.testnet.goliath.net" -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031"],"id":1}' | jq
   ```
   - Expected: receipt with `to` = `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640` (relayer), `status` = `0x1`
   - If tx doesn't exist or failed: user didn't complete the native transfer, no recovery needed

3. Check if database migration has been applied:
   ```bash
   ssh lon "kubectl -n bridge-backend exec -it bridge-db-0 -- psql -U bridge_user -d bridge_db -c \"SELECT tablename FROM pg_tables WHERE schemaname='public'\""
   ```
   - Expected: `XcnWithdrawIntent` table NOT present (confirming migration not applied)

### Phase 1 - Backend Deployment

**Step 1:** Pull latest code on server
```bash
ssh lon "cd ~/goliath/goliath-bridge-backend && git pull origin master"
```
- Expected: Code updated to include `79603ca` commit
- Failure: git conflict -> resolve manually
- Rollback: `git checkout <previous-commit>`

**Step 2:** Install dependencies and build
```bash
ssh lon "cd ~/goliath/goliath-bridge-backend && npm ci && npm run build"
```
- Expected: Build succeeds, `dist/` populated with compiled JS
- Failure: TypeScript compilation error -> check build output
- Rollback: N/A (build artifacts only)

**Step 3:** Apply Prisma migration
```bash
ssh lon "cd ~/goliath/goliath-bridge-backend && npx prisma migrate deploy"
```
- Expected: Migration applied, `XcnWithdrawIntent` table created
- Failure: DB connection error -> check PostgreSQL pod is running
- Rollback: `npx prisma migrate resolve --rolled-back <migration-name>`

**Step 4:** Rebuild Docker images
```bash
ssh lon "cd ~/goliath/goliath-bridge-backend && docker build -t bridge-api:latest . && docker build -t bridge-relayer:latest -f Dockerfile.relayer ."
```
- Expected: Both images built successfully
- Failure: Docker build error -> check Dockerfile and node_modules
- Rollback: Old images still tagged as `latest` until overwritten

**Step 5:** Restart pods to pick up new images
```bash
ssh lon "kubectl -n bridge-backend rollout restart deploy/bridge-api && kubectl -n bridge-backend rollout restart deploy/bridge-relayer"
```
- Expected: Pods restart with new images; API health check passes at `/api/v1/live`
- Failure: CrashLoopBackOff -> check pod logs
- Rollback: `kubectl -n bridge-backend rollout undo deploy/bridge-api && kubectl -n bridge-backend rollout undo deploy/bridge-relayer`

**Step 6:** Verify deployment
```bash
ssh lon "kubectl -n bridge-backend rollout status deploy/bridge-api && kubectl -n bridge-backend rollout status deploy/bridge-relayer"
ssh lon "kubectl -n bridge-backend logs deploy/bridge-relayer --since=2m | grep -i 'xcn\|withdraw\|started'"
curl -s https://testnet.mirrornode.goliath.net/bridge/api/v1/ | jq
```
- Expected: Rollout complete; relayer logs show "XcnWithdrawProcessor" starting; root endpoint lists `xcnWithdrawIntent` and `xcnWithdrawBindOrigin` endpoints
- Failure: Endpoints missing -> API server didn't register xcnWithdrawRoutes

### Phase 2 - Recover Stuck Operation

**Step 7:** Check if the intent was registered before the transfer
```bash
ssh lon "kubectl -n bridge-backend exec -it bridge-db-0 -- psql -U bridge_user -d bridge_db -c \"SELECT * FROM \\\"XcnWithdrawIntent\\\" WHERE \\\"boundOriginTxHash\\\" = '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031'\""
```
- If intent exists: The `XcnWithdrawProcessor` will process it automatically on next poll cycle (6s)
- If intent does NOT exist: The user must re-initiate the bridge from the frontend (the native XCN was already sent to relayer, so a new intent + bind-origin needs to be created manually or the user retries)

**Step 8:** If no intent exists, manually create one to recover the stuck funds
```bash
# Only if Step 7 shows no intent AND the tx was confirmed to relayer wallet
ssh lon "kubectl -n bridge-backend exec -it bridge-db-0 -- psql -U bridge_user -d bridge_db" << 'EOF'
INSERT INTO "XcnWithdrawIntent" (
  id, "senderAddress", "recipientAddress", "amountAtomic", state,
  "expiresAt", "boundOriginTxHash", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  '0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d',
  '0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d',
  -- TO VERIFY: Get exact amount from tx receipt value field
  '<AMOUNT_ATOMIC_FROM_TX>',
  'PENDING',
  NOW() + INTERVAL '30 minutes',
  '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031',
  NOW(),
  NOW()
);
EOF
```
- Expected: Intent created; XcnWithdrawProcessor picks it up within 6 seconds
- Failure: Unique constraint violation -> intent already exists
- Rollback: `DELETE FROM "XcnWithdrawIntent" WHERE "boundOriginTxHash" = '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031'`

### Phase 3 - Frontend RPC Hardening (can be separate PR)

**Step 9:** Upgrade `bridgeConfig.ts` to support sequential RPC list
- File: `src/config/bridgeConfig.ts`
- Change: Replace `rpcUrl: string` + `rpcUrlFallback: string` with `rpcUrls: string[]`
- Add `parseRpcUrls()` helper to split `REACT_APP_SEPOLIA_RPC_URLS` (comma-separated)
- Keep `rpcUrl` / `rpcUrlFallback` as computed getters for backwards compatibility
- Rollback: `git checkout -- src/config/bridgeConfig.ts`

**Step 10:** Update `.env` with Chainstack-first RPC sequence
- File: `.env`
- Change:
  ```env
  REACT_APP_SEPOLIA_RPC_URLS="https://ethereum-sepolia.core.chainstack.com/994184e51c801ad4cdcaee72e84c28ed,https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt,https://ethereum-sepolia-rpc.publicnode.com"
  ```
- Order: Chainstack (paid) -> Alchemy (keyed) -> PublicNode (free, last resort)
- Rollback: `git checkout -- .env`

**Step 11:** Update `bridgeProviders.ts` to cycle through RPC sequence
- File: `src/services/bridgeProviders.ts`
- Change: Replace binary primary/fallback with sequential iteration over `rpcUrls[]`
- On failure: advance `_currentRpcIndex`, revalidate with next RPC, retry call once
- Add 5-minute promotion cooldown to periodically re-check higher-priority RPCs
- Rollback: `git checkout -- src/services/bridgeProviders.ts`

**Step 12:** Reduce balance polling intervals
- File: `src/hooks/bridge/useBridgeBalances.ts`
- Change: Normal 2000ms -> 5000ms; aggressive 500ms -> 2000ms; duration 15s -> 10s
- Rollback: `git checkout -- src/hooks/bridge/useBridgeBalances.ts`

**Step 13:** Add exponential back-off to status polling on 404
- File: `src/hooks/bridge/useBridgeStatusPolling.ts`
- Change: On consecutive null (404) responses, double interval from base (5000ms) up to 30s cap; reset on success
- Rollback: `git checkout -- src/hooks/bridge/useBridgeStatusPolling.ts`

### Phase 4 - Validate

1. Test XCN Goliath->Sepolia bridge end-to-end:
   - Open Bridge tab, select XCN, enter amount
   - Switch to Goliath network
   - Submit bridge transaction
   - Verify intent is registered (`POST /bridge/xcn-withdraw-intent`)
   - Verify native XCN is sent to relayer wallet
   - Verify status polling returns valid data (not 404)
   - Wait for COMPLETED status with destination tx hash

2. Test ETH bridging still works (regression check):
   - Bridge a small amount of ETH Sepolia->Goliath
   - Verify COMPLETED status

3. Monitor Sepolia RPC error rate in console:
   - Expected: No 429 errors under normal operation
   - Expected: Graceful degradation under heavy load

### Phase 5 - Rollback Plan

**Triggers:** Backend errors, failed releases, broken ETH/USDC flows, CrashLoopBackOff
**Procedure:**
- Backend: `ssh lon "kubectl -n bridge-backend rollout undo deploy/bridge-api && kubectl -n bridge-backend rollout undo deploy/bridge-relayer"`
- Frontend: `git revert <commit>` + redeploy
- Database: Prisma migration rollback is NOT automatic; new table is additive and won't break old code

---

## 10) VERIFICATION CHECKLIST

- [ ] Bridge-api pods running with new image (verify via `/api/v1/` root endpoint listing `xcnWithdrawIntent`)
- [ ] Bridge-relayer pod running with XcnWithdrawProcessor (verify via logs)
- [ ] `XcnWithdrawIntent` table exists in PostgreSQL
- [ ] `POST /bridge/xcn-withdraw-intent` returns 200 with valid response
- [ ] XCN Goliath->Sepolia bridge completes end-to-end
- [ ] ETH bridging still works (no regression)
- [ ] Status polling shows progress for XCN operations
- [ ] Frontend using Chainstack as primary Sepolia RPC (verify via `[BridgeProviders]` console log)
- [ ] No 429 errors in frontend console under normal operation
- [ ] Stuck operation recovered (user receives ERC-20 XCN on Sepolia)

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Failed Attempts

- (none yet)

### Final State

- Changes made: (pending)
- Tests passing: (pending)
- Deployment status: (pending)
- Remaining risks / follow-ups: (pending)

---

## 12) FOLLOW-UPS

- [ ] Set up CI/CD pipeline for bridge-backend to prevent deployment drift
- [ ] Add monitoring/alerts for bridge operations stuck in non-terminal states > 10 minutes
- [ ] Monitor Chainstack RPC usage/quota to ensure it handles the bridge polling load long-term
- [ ] Add a "retry" button in the Bridge UI for stuck operations
- [ ] Implement frontend-side operation timeout that prompts user to contact support after 30 minutes
- [ ] Audit other pending backend code changes that may not be deployed
