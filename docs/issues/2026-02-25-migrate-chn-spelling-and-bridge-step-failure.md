# Migrate Tab: CHN Spelling Errors + Bridge Step Always Fails

**Project:** CoolSwap-interface (+ goliath-bridge-backend deployment)
**Type:** Code Bug
**Priority:** P0
**Risk level:** Medium
**Requires deployment?:** Yes (backend migration routes to testnet)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- TID Backend: `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Backend.md`
- TID Frontend: `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Frontend.md`
- Prior issue: `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The Migrate tab correctly refers to XCN everywhere (no CHN references), and the Bridge step completes successfully: the EIP-712 stake-preference intent is signed, submitted to the backend, and the on-chain bridge deposit proceeds.

**Must-have outcomes**

- [ ] All user-visible text says "XCN" instead of "CHN"
- [ ] `POST /migration/stake-preference` succeeds (no `net::ERR_FAILED`)
- [ ] EIP-712 signature verification passes on the backend (no `SIGNATURE_MISMATCH`)
- [ ] Full migration flow completes: sign intent -> submit preference -> deposit -> bind origin -> status tracking

**Acceptance criteria (TDD)**

- [ ] Test A: i18n key `migration.step.bridge.description` contains "XCN" not "CHN"
- [ ] Test B: i18n key `migration.toggle.autoStakeDescription` contains "XCN" not "CHN"
- [ ] Test C: Frontend EIP-712 domain/types match backend domain/types exactly
- [ ] Test D: `submitStakePreference` API call returns 200 with valid `intentId` (integration)
- [ ] Test E: End-to-end bridge step completes without FAILED status

**Non-goals**

- Changing the existing `/bridge` page behavior
- Implementing phase-2 stats/history features
- Changing the claim step (remains disabled via feature flag)

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface` (frontend), `~/goliath/goliath-bridge-backend` (backend)
- **Language/stack:** React, TypeScript, ethers.js v5 (frontend); Fastify, TypeScript, ethers.js v6 (backend)
- **Entry point:** `src/pages/Migrate/index.tsx` (frontend); `src/api/server.ts` (backend)
- **Build command:** `npm run build` (frontend)
- **Test command:** `npx react-scripts test` (frontend)

### Network Context

- Frontend API base: `https://testnet.mirrornode.goliath.net/bridge/api/v1`
- Backend route prefix: `/api/v1/migration`
- Chain ID: Sepolia 11155111
- Bridge contract (Sepolia): `0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] No regression on existing `/bridge`, `/swap`, `/pool` pages

### Operational Constraints

- Allowed downtime: none
- Blast radius: Migrate tab only; existing bridge unaffected

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. **Spelling:** The bridge step card says "Bridge your XCN tokens to the Goliath network to receive CHN." and the toggle says "Auto-stake CHN tokens after migration." There is no CHN token; the token is XCN on both chains.

2. **Bridge step always fails:** When the user clicks "Execute" on the Bridge step, it immediately shows "Failed". On retry, MetaMask prompts for an EIP-712 signature, then the console shows:
   ```
   migrationApi.ts:133  POST https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stake-preference net::ERR_FAILED
   ```

### 4.2 Impact

- **User impact:** 100% of migrate users are blocked -- the bridge step is completely non-functional
- **System impact:** Migration feature is unusable despite being enabled (`REACT_APP_MIGRATION_ENABLED=true`)
- **Scope:** Frontend i18n + frontend EIP-712 signing + backend deployment

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `public/locales/en.json:343` | i18n key `migration.step.bridge.description` | Says "CHN" instead of "XCN" |
| `public/locales/en.json:346` | i18n key `migration.toggle.autoStakeDescription` | Says "CHN" instead of "XCN" |
| `src/hooks/migration/useMigrationTransactions.ts:483-516` | `executeBridge` EIP-712 domain/types | Domain name, fields, and type schema differ from backend |
| `src/services/migrationApi.ts:133` | `MigrationApiClient.fetch()` | `net::ERR_FAILED` -- backend endpoint unreachable |
| Backend: `src/api/routes/migration.ts:16-31` | `EIP712_DOMAIN` / `EIP712_TYPES` | Defines the backend signature verification schema |

### 4.4 Evidence

**CHN spelling (en.json lines 343, 346):**
```json
"migration.step.bridge.description": "Bridge your XCN tokens to the Goliath network to receive CHN.",
"migration.toggle.autoStakeDescription": "Auto-stake CHN tokens after migration",
```

**EIP-712 Domain Mismatch:**

| Field | Frontend (`useMigrationTransactions.ts`) | Backend (`migration.ts`) |
|-------|------------------------------------------|--------------------------|
| `name` | `'CoolSwap Migration'` | `'GoliathBridge'` |
| `version` | `'1'` | `'1'` |
| `chainId` | `11155111` | *(not included)* |
| `verifyingContract` | `bridgeConfig.sepolia.bridgeAddress` | *(not included)* |

**EIP-712 Type Mismatch:**

| Frontend field | Frontend type | Backend field | Backend type |
|----------------|---------------|---------------|--------------|
| `sender` | `address` | `senderAddress` | `address` |
| `recipient` | `address` | `recipientAddress` | `address` |
| `amount` | `uint256` | `amountAtomic` | `string` |
| `stakeOnGoliath` | `bool` | `stakeOnGoliath` | `bool` |
| `idempotencyKey` | `string` | `idempotencyKey` | `string` |
| `deadline` | `uint256` | `deadline` | `uint256` |
| `nonce` | `uint256` | `nonce` | `string` |

**Console error:**
```
migrationApi.ts:133  POST https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stake-preference net::ERR_FAILED
```

### 4.5 Tasks

- `task-001-fix-chn-to-xcn-spelling.md`
- `task-002-align-eip712-frontend-to-backend.md`
- `task-003-deploy-backend-migration-routes.md`
- `task-004-integration-test-bridge-step.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The bridge step fails due to two compounding issues: (1) the backend migration routes are not deployed to the live testnet environment, causing `net::ERR_FAILED`, and (2) even if deployed, the EIP-712 typed data domain and field names differ between frontend and backend, which would cause `SIGNATURE_MISMATCH` errors.

### 5.2 Supporting Evidence

- `net::ERR_FAILED` indicates the endpoint is unreachable (not a 4xx/5xx response)
- The regular bridge API (`/api/v1/bridge/status`) works at the same base URL, confirming the base URL is correct
- Code inspection shows the migration routes exist in the backend codebase (`src/api/routes/migration.ts`) and are registered in `server.ts`, but the live deployment at `testnet.mirrornode.goliath.net` may be running an older version without these routes
- Side-by-side comparison of frontend EIP-712 schema vs backend schema shows 6 mismatched fields (see table in 4.4)

### 5.3 Gaps / Items to Verify

- TO VERIFY: `curl -X POST https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stake-preference -H 'Content-Type: application/json' -d '{}' -v` -- confirm whether 404/CORS/connection-refused
- TO VERIFY: Check if the backend at testnet.mirrornode.goliath.net has been redeployed with the migration routes

### 5.4 Root Cause (final)

- **Root cause:** Three independent defects: (a) i18n strings contain "CHN" instead of "XCN", (b) frontend EIP-712 domain/types don't match backend expectations, (c) backend migration routes not deployed to live environment
- **Contributing factors:** Frontend and backend were developed against different TID versions of the EIP-712 spec; the frontend was merged before the backend was deployed

---

## 6) SOLUTIONS (compare options)

### Option A - Fix frontend EIP-712 to match backend + deploy backend (Recommended)

**Changes required**

Frontend:
- `public/locales/en.json:343` - Replace "CHN" with "XCN"
- `public/locales/en.json:346` - Replace "CHN" with "XCN"
- `src/hooks/migration/useMigrationTransactions.ts:483-516` - Rewrite EIP-712 domain and types to match backend:
  - Domain: `{ name: 'GoliathBridge', version: '1' }` (no chainId, no verifyingContract)
  - Types: Use `senderAddress/recipientAddress/amountAtomic` field names, `nonce` as `string`
  - Message: Map `account` -> `senderAddress`, `account` -> `recipientAddress`, `bridgeAmount` -> `amountAtomic`, `nonce` -> `String(nonce)`

Backend:
- Deploy current backend code (which already has migration routes) to testnet

**Pros**
- Backend code is already written, tested, and ready; just needs deployment
- Frontend changes are small and isolated to one hook + two i18n strings
- Backend EIP-712 field names match the API request payload field names (consistent naming)

**Cons / risks**
- Frontend loses `chainId` and `verifyingContract` from the EIP-712 domain, slightly weaker replay protection
- Requires backend deployment coordination

**Complexity:** Low
**Rollback:** Easy (revert frontend commit; rollback backend deployment)

---

### Option B - Fix backend EIP-712 to match frontend + deploy backend

**Changes required**

Backend:
- `src/api/routes/migration.ts:16-31` - Change `EIP712_DOMAIN` to `{ name: 'CoolSwap Migration', version: '1', chainId: 11155111, verifyingContract: '0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092' }`
- Change `EIP712_TYPES` field names to `sender/recipient/amount` and `nonce` to `uint256`
- Update the message construction in the verify call to match

Frontend:
- Fix CHN -> XCN in i18n (same as Option A)

**Pros**
- Frontend EIP-712 domain includes chainId and verifyingContract (stronger replay protection)

**Cons / risks**
- Requires backend code changes + new deployment (two change surfaces)
- Backend field names in EIP-712 types (`sender/recipient/amount`) would diverge from API request field names (`senderAddress/recipientAddress/amountAtomic`), creating confusion
- Higher risk of introducing new bugs in the backend

**Complexity:** Medium
**Rollback:** Moderate (backend rollback + frontend rollback)

---

### Decision

**Chosen option:** A -- Fix frontend EIP-712 to match backend + deploy backend
**Justification:** The backend code is already deployed-ready with its EIP-712 schema. Changing the frontend to match is a minimal, isolated change. The backend's field naming (`senderAddress`, `recipientAddress`, `amountAtomic`) is consistent with the API payload, reducing cognitive load.
**Accepted tradeoffs:** Slightly simpler EIP-712 domain (no chainId/verifyingContract), but the intent TTL and idempotency key provide sufficient replay protection for this use case.

---

## 7) DELIVERABLES

- [ ] Code changes: `public/locales/en.json`, `src/hooks/migration/useMigrationTransactions.ts`
- [ ] Tests: Update existing migration tests to validate aligned EIP-712 schema
- [ ] Config changes: None
- [ ] Documentation: This issue file
- [ ] Deployment: Backend migration routes to testnet
- [ ] Monitoring/alerts: Verify `POST /migration/stake-preference` returns 200 after deployment

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/hooks/migration/__tests__/`, `src/services/__tests__/`, `src/constants/migration/__tests__/`
- **Run command:** `npx react-scripts test --watchAll=false`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] Verify i18n `migration.step.bridge.description` does not contain "CHN"
- [ ] Verify i18n `migration.toggle.autoStakeDescription` does not contain "CHN"
- [ ] Verify EIP-712 domain matches backend expectations (`name: 'GoliathBridge'`, `version: '1'`, no extra fields)
- [ ] Verify EIP-712 types use backend field names (`senderAddress`, `recipientAddress`, `amountAtomic`, `nonce` as string)

**Integration tests**
- [ ] Mock `migrationApiClient.submitStakePreference` to succeed, verify bridge flow proceeds to deposit

### 8.3 Baseline

- Test run before fix: RECORD RESULTS HERE

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. `git status` to verify clean working state on `feat/staking` branch
2. Verify backend migration routes exist locally at `~/goliath/goliath-bridge-backend/src/api/routes/migration.ts`

### Phase 1 - Fix CHN -> XCN in i18n

- **Step 1:** Edit `public/locales/en.json` line 343
  - Change: `"receive CHN"` -> `"receive XCN"`
  - Rollback: `git checkout -- public/locales/en.json`

- **Step 2:** Edit `public/locales/en.json` line 346
  - Change: `"Auto-stake CHN tokens"` -> `"Auto-stake XCN tokens"`

### Phase 2 - Align Frontend EIP-712 Schema to Backend

- **Step 3:** Edit `src/hooks/migration/useMigrationTransactions.ts`
  - Lines 483-488 (domain): Change to `{ name: 'GoliathBridge', version: '1' }` -- remove `chainId` and `verifyingContract`
  - Lines 490-506 (types): Remove `EIP712Domain` entry. Rename fields: `sender` -> `senderAddress`, `recipient` -> `recipientAddress`, `amount` -> `amountAtomic` (type `string`), `nonce` type `uint256` -> `string`
  - Lines 508-516 (message): Rename keys to match new field names, convert `nonce` to `String(nonce)`, use `bridgeAmount` as-is for `amountAtomic`
  - Build: `npm run build`
  - Expected: Build succeeds
  - Rollback: `git checkout -- src/hooks/migration/useMigrationTransactions.ts`

### Phase 3 - Deploy Backend

- **Step 4:** Deploy current `goliath-bridge-backend` code to testnet (includes migration routes)
  - TO VERIFY: deployment command for the backend at `testnet.mirrornode.goliath.net`
  - Expected: `POST /bridge/api/v1/migration/stake-preference` returns a parseable JSON response (not `net::ERR_FAILED`)
  - Verify: `curl -X POST https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stake-preference -H 'Content-Type: application/json' -d '{}' -v`
  - Expected response: `400` with `VALIDATION_ERROR` (not `net::ERR_FAILED` or connection error)

### Phase 4 - Validate

1. Run the full test suite: `npx react-scripts test --watchAll=false`
2. Build the project: `npm run build`
3. Manual verification: Connect wallet on Sepolia, navigate to Migrate tab, verify:
   - Bridge step description says "XCN" not "CHN"
   - Toggle description says "XCN" not "CHN"
   - Bridge step proceeds through: sign intent -> submit preference -> deposit -> status tracking

### Phase 5 - Rollback Plan

**Triggers:** Bridge step still fails after fix, or regression in existing bridge
**Procedure:**
- Code: `git revert` the frontend commit
- Backend: Redeploy previous backend version if migration routes cause issues

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing `/bridge`, `/swap`, `/pool`
- [ ] i18n strings show "XCN" not "CHN"
- [ ] Bridge step completes successfully in manual testing
- [ ] Backend `POST /migration/stake-preference` returns valid response
- [ ] EIP-712 signature verifies correctly on backend

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: pending
- Tests passing: pending
- Deployment status: pending

---

## 12) FOLLOW-UPS

- [ ] Audit other locale files for any "CHN" references (currently only in `en.json`)
- [ ] Consider adding `chainId` to backend EIP-712 domain for stronger replay protection in production
- [ ] Monitor `POST /migration/stake-preference` success rate after deployment
- [ ] Test full E2E migration flow with testnet XCN tokens
