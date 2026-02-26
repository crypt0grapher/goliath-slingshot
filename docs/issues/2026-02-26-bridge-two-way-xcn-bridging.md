# Bridge: Add Two-Way XCN Bridging (Sepolia ERC-20 <-> Goliath Native)

**Project:** CoolSwap-interface + goliath-bridge-backend
**Type:** Feature
**Priority:** P1
**Risk level:** Low
**Requires deployment?:** Yes (backend + frontend only, NO smart contract changes)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:**
- `~/goliath/staking/.memory-bank/TID-XCN-Bridge-Backend.md` (v1.2 - one-way XCN design)
- `~/goliath/staking/.memory-bank/tasks/migration-backend/` (original task breakdown)
- `~/goliath/CoolSwap-interface/docs/issues/` (existing bridge/migrate issues)

---

## 1) GOAL / SUCCESS CRITERIA

**What "done" means:**

The Bridge tab in CoolSwap-interface allows users to bridge XCN in both directions:
- **Sepolia -> Goliath**: Lock ERC-20 XCN on Sepolia via `BridgeSepolia.deposit()`, relayer delivers native XCN on Goliath (existing backend path)
- **Goliath -> Sepolia**: User sends native XCN to relayer wallet via API-first intent flow, relayer releases ERC-20 XCN on Sepolia via `BridgeSepolia.release()`

XCN appears in the Bridge token dropdown alongside ETH, and both directions work end-to-end.

**Must-have outcomes**

- [ ] XCN appears in the Bridge tab token selector dropdown
- [ ] Sepolia -> Goliath XCN bridging works (deposit ERC-20 XCN -> receive native XCN)
- [ ] Goliath -> Sepolia XCN bridging works (send native XCN to relayer -> receive ERC-20 XCN)
- [ ] Bridge status tracking/polling works for XCN in both directions
- [ ] Balance display and approval flow correct for XCN on both chains
- [ ] Backend relayer processes XCN reverse bridging (Goliath -> Sepolia)

**Acceptance criteria (TDD)**

- [ ] Test: Backend XCN withdraw intent API validates and stores intents correctly
- [ ] Test: Backend verifies on-chain native XCN transfer to relayer wallet
- [ ] Test: Backend TransactionSubmitter handles XCN GOLIATH_TO_SEPOLIA by calling `bridgeSepolia.release()`
- [ ] Test: Frontend deposit hook calls `deposit()` for XCN on Sepolia (ERC-20 path)
- [ ] Test: Frontend sends native XCN to relayer wallet for Goliath -> Sepolia direction
- [ ] Test: Token selector shows XCN with correct logos and balance for both directions
- [ ] Test: Gas buffer applied when bridging native XCN from Goliath (MAX button)

**Non-goals**

- Smart contract changes (BridgeGoliath stays unchanged at `0x2c1d218B5a97a26D144ffd12d5C813590f93FFEB`)
- Migrate tab changes (separate feature, stays on feat/migrate branch)
- Staking integration from Bridge tab (Migrate-specific)
- USDC bridging in the dropdown (future work)
- Custom recipient addresses (v1 limitation)

---

## 2) ENVIRONMENT

### Project Details

| Project | Path | Stack | Role |
|---------|------|-------|------|
| goliath-bridge-backend | `~/goliath/goliath-bridge-backend` | TypeScript, ethers v6, Prisma, Fastify | Relayer + API |
| CoolSwap-interface | `~/goliath/CoolSwap-interface` | React, TypeScript, ethers v5, Redux | Frontend |

### Contract Addresses (UNCHANGED)

| Contract | Network | Address |
|----------|---------|---------|
| BridgeSepolia | Sepolia (11155111) | `0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092` |
| BridgeGoliath | Goliath (8901) | `0x2c1d218B5a97a26D144ffd12d5C813590f93FFEB` (NOT changing) |
| XCN ERC-20 | Sepolia | `0x7a8adc542A35c93da263A188367F4bF4c445B8E9` |
| XCN | Goliath | Native token (no address) |
| Relayer Wallet | Both | `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640` |

### Why NOT changing BridgeGoliath

BridgeGoliath is **not upgradeable** (plain contract, no proxy). Redeploying would require:
- Transferring USDC and ETH token ownership (they're owned by BridgeGoliath)
- Updating address in **5+ projects**: faucet, bridge-backend, CoolSwap (bridge + migrate), wXCN scripts, docs
- High blast radius, high risk

Instead, the reverse XCN bridge uses a **direct relayer wallet transfer** with an API-first intent pattern (similar to the migration stake-preference flow).

### Deployment

- Bridge backend: K8s namespace `bridge-migration-backend` on server `104.238.187.163` (lon)
- Frontend: Static build, targets `master` branch (after `feat/migrate` merge)

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT change BridgeGoliath contract address
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] BridgeSepolia must have sufficient locked XCN balance to fund reverse releases
- [ ] Existing ETH/USDC bridging must NOT be affected

### Code Change Constraints

- [ ] Frontend changes target `master` branch (after `feat/migrate` merge, design to minimize conflicts)
- [ ] Backend changes must not break existing ETH/USDC bridge flows
- [ ] No smart contract changes
- [ ] All changes must pass existing tests + new tests

### Operational Constraints

- Allowed downtime: Brief (backend restart only)
- Blast radius: Bridge tab only; Swap, Yield, Migrate tabs unaffected
- Liquidity: Reverse bridging limited by ERC-20 XCN locked in BridgeSepolia contract

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Bridge tab only shows ETH in the token dropdown
- No way to bridge XCN via the Bridge tab (only via Migrate tab, one-way Sepolia -> Goliath)
- Users who want to move XCN from Goliath back to Sepolia have no mechanism

### 4.2 Impact

- **User impact:** Users cannot bridge XCN in either direction via the standard Bridge UI, and cannot reverse-bridge XCN at all
- **System impact:** Bridge underutilized; XCN bridging locked to Migrate tab's one-way flow
- **Scope:** 2 projects affected (backend, frontend) - no contract changes

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `goliath-bridge-backend/src/worker/transactionSubmitter.ts` | `getDestinationTokenAddress()` | No XCN case in GOLIATH_TO_SEPOLIA direction (falls through to USDC) |
| `goliath-bridge-backend/src/api/routes/` | (missing) | No API for XCN withdraw intent registration |
| `CoolSwap-interface/src/constants/bridge/tokens.ts` | `BRIDGE_TOKEN_LIST` | Only contains `['ETH']`, XCN not listed |
| `CoolSwap-interface/src/hooks/bridge/useBridgeBurn.ts` | `burn()` line 133 | Throws `errorNativeBurnNotSupported` for native assets |
| `CoolSwap-interface/src/config/bridgeConfig.ts` | `tokens.sepolia` | No XCN address in Sepolia token config |

### 4.4 Evidence

**useBridgeBurn.ts** - Explicitly blocks native burns:
```typescript
// Line 133-135: Cannot handle native XCN on Goliath
if (tokenConfig.isNative) {
    throw new Error(t('errorNativeBurnNotSupported'));
}
```

**TransactionSubmitter `getDestinationTokenAddress()`** - XCN falls through to USDC:
```typescript
// Line 668-683: XCN not handled, returns USDC address (wrong)
} else { // GOLIATH_TO_SEPOLIA
    if (tokenSymbol === 'ETH') return '0x0000000000000000000000000000000000000000';
    return config.tokens.usdc.sepolia; // BUG: XCN would get USDC address
}
```

**BridgeGoliath contract** - Only has `burn()` for ERC-20, no way to accept native XCN:
```solidity
// burn() uses transferFrom which only works for ERC-20 tokens
function burn(address token, uint256 amount, address destinationAddress) external returns (bytes32) {
    bool success = IMintableToken(token).transferFrom(msg.sender, relayer, amount);
}
```

### 4.5 Tasks

See `.memory-bank/tasks/bridge-two-way-xcn/` for decomposed task files.

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

XCN bridging was originally designed as one-way (Sepolia -> Goliath) for the migration use case. The BridgeGoliath contract only handles ERC-20 tokens (ETH and USDC are ERC-20 on Goliath), while XCN is native on Goliath. Since BridgeGoliath is not upgradeable and changing its address has high blast radius (5+ projects, token ownership transfer), the reverse direction requires a different approach.

### 5.2 Supporting Evidence

- BridgeGoliath is NOT upgradeable (plain contract, no proxy)
- USDC and ETH token contracts are **owned by** BridgeGoliath - changing address requires ownership transfer
- Address referenced in 5+ projects: faucet, bridge-backend, CoolSwap, wXCN, docs
- Backend already has the API-first intent pattern from migration stake-preference flow
- Relayer wallet is funded with native XCN on Goliath

### 5.3 Gaps / Items to Verify

- TO VERIFY: Current XCN balance locked in BridgeSepolia contract (determines reverse bridge liquidity):
  ```
  cast call 0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092 "getTokenBalance(address)" 0x7a8adc542A35c93da263A188367F4bF4c445B8E9 --rpc-url <sepolia-rpc>
  ```
- TO VERIFY: Relayer wallet native XCN balance on Goliath (needed for forward direction)

### 5.4 Root Cause (final)

- **Root cause:** XCN reverse bridging was out-of-scope for v1; BridgeGoliath is not upgradeable and cannot accept native assets; changing the contract address has unacceptable blast radius
- **Solution approach:** API-first intent pattern with direct relayer wallet transfer (no contract changes)

---

## 6) SOLUTIONS (compare options)

### Option A - API-First Intent + Direct Relayer Wallet Transfer (CHOSEN)

**Architecture for Goliath -> Sepolia XCN:**

```
1. Frontend: POST /api/v1/bridge/xcn-withdraw-intent
   (senderAddress, recipientAddress, amountAtomic, signature, deadline, nonce)
   -> returns { intentId, relayerWalletAddress, expiresAt }

2. Frontend: User sends native XCN to relayer wallet via signer.sendTransaction()
   -> gets originTxHash

3. Frontend: POST /api/v1/bridge/xcn-withdraw-intent/bind-origin
   (intentId, senderAddress, originTxHash)

4. Backend: XcnWithdrawProcessor verifies on-chain transfer
   (checks tx receipt: to == relayerWallet, value == amountAtomic, from == senderAddress)

5. Backend: Creates BridgeOperation (direction=GOLIATH_TO_SEPOLIA, token=XCN, status=AWAITING_RELAY)
   Generates withdrawId = keccak256(intentId + originTxHash)

6. Backend: TransactionSubmitter calls bridgeSepolia.release(withdrawId, xcnSepoliaAddr, recipient, amount)

7. Backend: Marks operation COMPLETED with destinationTxHash

8. Frontend: Polls /api/v1/bridge/status?originTxHash=... (existing endpoint)
```

**Changes required**

**Backend (goliath-bridge-backend):**
- New Prisma model: `XcnWithdrawIntent` (reuse pattern from `StakeIntent`)
- New API routes: `POST /bridge/xcn-withdraw-intent`, `POST /bridge/xcn-withdraw-intent/bind-origin`
- New worker: `XcnWithdrawProcessor` - verifies native transfers and creates BridgeOperations
- Fix `getDestinationTokenAddress()` for XCN GOLIATH_TO_SEPOLIA
- Existing TransactionSubmitter handles the release (XCN falls into `release()` path like USDC)

**Frontend (CoolSwap-interface):**
- Add XCN to `BRIDGE_TOKENS` and `BRIDGE_TOKEN_LIST`
- Add XCN Sepolia address to `bridgeConfig`
- New hook: `useBridgeXcnWithdraw` for Goliath -> Sepolia XCN (API intent + native transfer)
- Update `useBridgeBurn` to delegate to XCN-specific hook when token is native
- Add relayer wallet address to bridge config (for sending native XCN to)

**Pros**
- No smart contract changes - BridgeGoliath address stays the same
- Zero blast radius to faucet, wXCN scripts, docs
- Reuses proven API-first intent pattern from migration stake-preference
- Single user transaction (native transfer to relayer wallet)
- EIP-712 signature verification prevents spoofing

**Cons / risks**
- More backend code (new API routes + worker) vs a simple contract function
- Relayer wallet receives native XCN directly (custodial element during processing)
- Must verify on-chain transfers carefully to prevent double-processing

**Complexity:** Medium
**Rollback:** Easy (disable XCN in token list, no contract/infra changes)

---

### Option B - Add burnNative() to BridgeGoliath (REJECTED)

**Why rejected:**
- BridgeGoliath is NOT upgradeable - requires contract redeployment
- New address would break 5+ projects: faucet (token ownership), bridge-backend, CoolSwap, wXCN, docs
- USDC/ETH token ownership must be transferred from old to new contract
- Unacceptable blast radius and risk for a testnet bridge feature

---

### Option C - Use WXCN (Wrapped XCN) + existing burn() (REJECTED)

**Why rejected:**
- Poor UX: 3 transactions (wrap + approve + burn)
- Users must understand wrapping concept
- Unnecessarily complex when direct transfer is simpler

---

### Decision

**Chosen option:** Option A - API-First Intent + Direct Relayer Wallet Transfer
**Justification:** Zero contract changes, zero blast radius to other projects, proven pattern from migration, single-transaction UX for the user.
**Accepted tradeoffs:** More backend code; temporary custodial element during processing window.

---

## 7) DELIVERABLES

- [ ] Backend: XCN withdraw intent API (register + bind-origin)
- [ ] Backend: XCN withdraw processor (verify on-chain transfers, create BridgeOperations)
- [ ] Backend: Fix `getDestinationTokenAddress()` for XCN GOLIATH_TO_SEPOLIA
- [ ] Frontend: XCN in Bridge token dropdown with correct per-chain config
- [ ] Frontend: XCN withdraw hook (API intent + native transfer to relayer)
- [ ] Frontend: Balance display, approval flow, gas buffer for XCN
- [ ] Tests: Backend API tests, processor tests, frontend integration
- [ ] Localization: Add XCN-related bridge strings to `en.json`

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

| Layer | Test Location | Framework | Run Command |
|-------|-------------|-----------|-------------|
| Backend | `~/goliath/goliath-bridge-backend/test/` | Vitest/Jest | `npm test` |
| Frontend | `~/goliath/CoolSwap-interface/src/**/*.test.ts` | Jest + RTL | `npm test` |

### 8.2 Required Tests

**Backend unit tests**
- [ ] XCN withdraw intent API validates EIP-712 signature
- [ ] XCN withdraw intent API rejects expired deadlines
- [ ] XCN withdraw intent API rejects duplicate idempotency keys
- [ ] Bind-origin API verifies sender ownership of intent
- [ ] Bind-origin API rejects duplicate origin tx hashes
- [ ] XcnWithdrawProcessor verifies native transfer on-chain (to=relayerWallet, value=amount, from=sender)
- [ ] XcnWithdrawProcessor creates BridgeOperation with correct fields
- [ ] XcnWithdrawProcessor rejects transfers to wrong address or wrong amount
- [ ] `getDestinationTokenAddress('XCN', GOLIATH_TO_SEPOLIA)` returns XCN Sepolia address
- [ ] TransactionSubmitter calls `bridgeSepolia.release()` for XCN (not `releaseNative()`)
- [ ] Fair batch selection works with XCN reverse operations

**Frontend tests**
- [ ] XCN appears in token selector dropdown
- [ ] Selecting XCN shows correct balance for origin network
- [ ] XCN withdraw hook calls intent API before sending native transfer
- [ ] XCN withdraw hook sends native XCN to relayer wallet address
- [ ] XCN withdraw hook binds origin tx hash after transfer
- [ ] Deposit hook calls `deposit()` for XCN on Sepolia (ERC-20 path, already works)
- [ ] Approval required for XCN on Sepolia (ERC-20), not required on Goliath (native)
- [ ] Gas buffer applied when bridging native XCN from Goliath

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Merge `feat/migrate` to `master` in CoolSwap-interface
2. Verify XCN locked in BridgeSepolia and relayer wallet balance on Goliath
3. Create working branches in backend and frontend

### Phase 1 - Backend: XCN Withdraw Intent API

**Step 1:** Add `XcnWithdrawIntent` Prisma model
- File: `~/goliath/goliath-bridge-backend/prisma/schema.prisma`
- Reuse pattern from `StakeIntent`:
  ```prisma
  model XcnWithdrawIntent {
    id                    String   @id @default(uuid())
    senderAddress         String
    recipientAddress      String
    amountAtomic          String
    state                 IntentState @default(PENDING)
    expiresAt             DateTime
    idempotencyKey        String?  @unique
    signatureDigest       String?
    boundOriginTxHash     String?  @unique
    consumedAt            DateTime?
    consumedByOperationId String?
    createdAt             DateTime @default(now())
    updatedAt             DateTime @updatedAt

    @@index([senderAddress, state, createdAt])
    @@index([expiresAt, state])
    @@index([boundOriginTxHash])
  }
  ```
- Run: `npx prisma migrate dev --name add-xcn-withdraw-intent`

**Step 2:** Add XCN withdraw intent API routes
- File: `~/goliath/goliath-bridge-backend/src/api/routes/xcnWithdraw.ts` (new)
- `POST /api/v1/bridge/xcn-withdraw-intent`: Register intent with EIP-712 signature
- `POST /api/v1/bridge/xcn-withdraw-intent/bind-origin`: Bind origin tx hash
- Pattern: mirror `src/api/routes/migration.ts` but for bridge context

**Step 3:** Add XcnWithdrawProcessor worker
- File: `~/goliath/goliath-bridge-backend/src/worker/xcnWithdrawProcessor.ts` (new)
- Polls for bound intents (state=PENDING, boundOriginTxHash != null)
- For each: verify on-chain transfer using `goliathProvider.getTransactionReceipt(originTxHash)`
  - Check: `receipt.to == relayerWallet`, `receipt.status == 1`
  - Check: transaction value matches intent amountAtomic
  - Check: transaction from matches intent senderAddress
- On successful verification:
  - Generate withdrawId: `keccak256(abi.encodePacked(intentId, originTxHash))`
  - Create BridgeOperation with direction=GOLIATH_TO_SEPOLIA, token=XCN, status=AWAITING_RELAY
  - Consume the intent (state=CONSUMED)
- Integrate into relayer.ts startup

### Phase 2 - Backend: Fix TransactionSubmitter for XCN Reverse

**Step 4:** Fix `getDestinationTokenAddress()` for XCN
- File: `~/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`
- Add XCN case in GOLIATH_TO_SEPOLIA direction:
  ```typescript
  if (tokenSymbol === 'XCN') return config.tokens.xcn.sepolia;
  ```
- The existing `release()` path (used for USDC) works for XCN since XCN is ERC-20 on Sepolia

### Phase 3 - Frontend: XCN Token Configuration

**Step 5:** Add XCN to bridge config
- File: `src/config/bridgeConfig.ts` - add `xcn` to `tokens.sepolia`
- File: `src/constants/bridge/tokens.ts` - add XCN config, expand type, add to list

**Step 6:** Add relayer wallet address to bridge config
- File: `src/config/bridgeConfig.ts` - add `relayerWalletAddress` field
- Loaded from `REACT_APP_BRIDGE_RELAYER_WALLET` env var
- Default: `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640`

### Phase 4 - Frontend: XCN Withdraw Flow (Goliath -> Sepolia)

**Step 7:** Create XCN withdraw hook
- File: `src/hooks/bridge/useBridgeXcnWithdraw.ts` (new)
- Flow:
  1. Call `POST /bridge/xcn-withdraw-intent` with EIP-712 signed intent
  2. Send native XCN to relayer wallet: `signer.sendTransaction({ to: relayerWallet, value: amount })`
  3. Call `POST /bridge/xcn-withdraw-intent/bind-origin` with originTxHash
  4. Create BridgeOperation record in Redux for status tracking
  5. Enter status polling view

**Step 8:** Update burn hook to delegate for native XCN
- File: `src/hooks/bridge/useBridgeBurn.ts`
- When `tokenConfig.isNative && token === 'XCN'`, delegate to the XCN withdraw flow
- Or: the Bridge form can call the XCN withdraw hook directly when appropriate

**Step 9:** Add XCN bridge API client methods
- File: `src/services/bridgeApi.ts`
- Add: `registerXcnWithdrawIntent()`, `bindXcnWithdrawOrigin()`

### Phase 5 - Frontend: Polish

**Step 10:** Update env vars and i18n
- `.env`: Add `REACT_APP_SEPOLIA_XCN_ADDRESS`, `REACT_APP_BRIDGE_RELAYER_WALLET`
- `public/locales/en.json`: Add any needed XCN bridge strings

### Phase 6 - Validate

1. Run backend tests: `cd ~/goliath/goliath-bridge-backend && npm test`
2. Run frontend build: `cd ~/goliath/CoolSwap-interface && npm run build`
3. Manual E2E:
   - Bridge XCN: Sepolia -> Goliath (existing deposit path)
   - Bridge XCN: Goliath -> Sepolia (new intent + native transfer path)
   - Verify ETH bridging still works (regression)
4. Check bridge status polling for XCN operations

### Phase 7 - Deploy

1. Apply Prisma migration on backend
2. Build and deploy updated backend (API + relayer)
3. Deploy frontend with updated env vars
4. Monitor for 30 minutes

### Phase 8 - Rollback Plan

**Triggers:** Backend errors, failed transfers, broken ETH/USDC flows
**Procedure:**
- Backend: `kubectl -n bridge-migration-backend rollout undo deploy/bridge-relayer && kubectl -n bridge-migration-backend rollout undo deploy/bridge-api`
- Frontend: Remove XCN from `BRIDGE_TOKEN_LIST` and redeploy
- No contract changes to revert

---

## 10) VERIFICATION CHECKLIST

- [ ] Backend builds and all tests pass
- [ ] Frontend builds without errors
- [ ] XCN appears in Bridge token dropdown
- [ ] Sepolia -> Goliath XCN bridge completes end-to-end
- [ ] Goliath -> Sepolia XCN bridge completes end-to-end
- [ ] ETH bridging still works in both directions (no regression)
- [ ] Bridge status polling works for XCN operations
- [ ] Approval flow correct for XCN on Sepolia (ERC-20)
- [ ] No approval needed for XCN on Goliath (native)
- [ ] Gas buffer applied for native XCN MAX button on Goliath
- [ ] Bridge history shows XCN operations correctly
- [ ] BridgeGoliath address unchanged across all projects

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: (pending)
- Tests passing: (pending)
- Deployment status: (pending)
- Remaining risks / follow-ups: (pending)

---

## 12) FOLLOW-UPS

- [ ] Monitor reverse bridge liquidity (XCN locked in BridgeSepolia)
- [ ] Add Prometheus metrics for XCN reverse bridging
- [ ] Add USDC to BRIDGE_TOKEN_LIST (config exists, just needs enabling)
- [ ] Consider bridge liquidity display in UI
- [ ] After feat/migrate merge, verify no conflicts with Bridge XCN changes
- [ ] Consider adding BridgeGoliath upgradeability (proxy pattern) for future feature additions
