# Task 002: Add XCN Withdraw Intent API Routes

## Context
The bridge backend needs two new API endpoints for the reverse XCN bridge flow (Goliath -> Sepolia). These mirror the existing migration stake-preference API (`src/api/routes/migration.ts`) but are for the general Bridge tab.

The flow:
1. Frontend calls `POST /bridge/xcn-withdraw-intent` with a signed intent
2. User sends native XCN to relayer wallet on Goliath
3. Frontend calls `POST /bridge/xcn-withdraw-intent/bind-origin` to link the tx hash

**Project:** `~/goliath/goliath-bridge-backend`
**Reference:** `src/api/routes/migration.ts` (existing stake-preference API)

## Task
1. Create new route file: `src/api/routes/xcnWithdraw.ts`

2. **POST /api/v1/bridge/xcn-withdraw-intent**
   - Request body: `{ senderAddress, recipientAddress, amountAtomic, idempotencyKey, deadline, nonce, signature }`
   - Validate EIP-712 signature (same domain/types pattern as migration)
   - Validate deadline not expired
   - Validate sender address matches recovered signer
   - Check idempotency key uniqueness
   - Create XcnWithdrawIntent record (state=PENDING, expiresAt=now+TTL)
   - Response: `{ intentId, relayerWalletAddress, expiresAt }`
   - Return `relayerWalletAddress` so frontend knows where to send native XCN
   - Rate limit per sender address

3. **POST /api/v1/bridge/xcn-withdraw-intent/bind-origin**
   - Request body: `{ intentId, senderAddress, originTxHash }`
   - Verify sender owns the intent
   - Verify intent is still PENDING and not expired
   - Reject if originTxHash already bound to another intent
   - Set `boundOriginTxHash = originTxHash`
   - Response: `{ intentId, originTxHash }`

4. Register routes in `src/api/server.ts`

5. Write tests for both endpoints covering:
   - Happy path
   - Invalid/expired signature
   - Duplicate idempotency key
   - Wrong sender for bind-origin
   - Expired intent

## Blockers
- `task-001-backend-xcn-withdraw-intent-model.md` — Prisma model must exist

## Acceptance Checklist
- [ ] POST /bridge/xcn-withdraw-intent creates intent with validation
- [ ] POST /bridge/xcn-withdraw-intent/bind-origin binds origin tx hash
- [ ] EIP-712 signature verification works
- [ ] Idempotency key prevents duplicate intents
- [ ] Expired intents rejected
- [ ] Response includes relayerWalletAddress
- [ ] Routes registered in server.ts
- [ ] Tests written and passing
- [ ] Existing migration routes unaffected
