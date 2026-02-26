# Task 001: Add XcnWithdrawIntent Prisma Model

## Context
The bridge backend at `~/goliath/goliath-bridge-backend` needs a new database model to track XCN reverse bridge intents (Goliath native XCN -> Sepolia ERC-20 XCN). This follows the same pattern as the existing `StakeIntent` model used for migration.

The intent lifecycle is:
1. Frontend registers intent via API (PENDING)
2. Frontend binds an origin tx hash (still PENDING, but boundOriginTxHash set)
3. Backend verifies on-chain transfer and creates BridgeOperation (CONSUMED)
4. Intents without binding expire after TTL (EXPIRED)

**Project:** `~/goliath/goliath-bridge-backend`

## Task
1. Add `XcnWithdrawIntent` model to `prisma/schema.prisma` with fields:
   - `id` (UUID, primary key)
   - `senderAddress` (String - Goliath address sending XCN)
   - `recipientAddress` (String - Sepolia address to receive ERC-20 XCN)
   - `amountAtomic` (String - amount in wei/atomic units)
   - `state` (reuse existing `StakeIntentState` enum or create shared `IntentState`: PENDING, CONSUMED, EXPIRED)
   - `expiresAt` (DateTime - TTL, default 900 seconds from creation)
   - `idempotencyKey` (String? @unique - replay protection)
   - `signatureDigest` (String? - EIP-712 recovered signer)
   - `boundOriginTxHash` (String? @unique - linked to user's native XCN transfer tx)
   - `consumedAt` (DateTime?)
   - `consumedByOperationId` (String? - which BridgeOperation consumed this)
   - `createdAt`, `updatedAt` (DateTime)
   - Indexes: `[senderAddress, state, createdAt]`, `[expiresAt, state]`, `[boundOriginTxHash]`

2. Run `npx prisma migrate dev --name add-xcn-withdraw-intent`
3. Verify generated client types

Check existing `StakeIntent` model in the schema for reference - the structure should be nearly identical.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] XcnWithdrawIntent model added to Prisma schema
- [ ] Migration runs successfully
- [ ] Prisma client generates correct TypeScript types
- [ ] Indexes created for query performance
- [ ] Existing StakeIntent and BridgeOperation models unaffected
- [ ] `npx prisma validate` passes
