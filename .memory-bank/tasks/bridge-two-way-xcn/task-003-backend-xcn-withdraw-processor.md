# Task 003: Add XcnWithdrawProcessor Worker

## Context
After a user sends native XCN to the relayer wallet on Goliath and the frontend binds the origin tx hash to the intent, the backend needs a worker that:
1. Polls for bound intents (state=PENDING, boundOriginTxHash != null)
2. Verifies the on-chain transfer on Goliath
3. Creates a BridgeOperation for the TransactionSubmitter to process

This worker bridges the gap between the API-based intent and the existing TransactionSubmitter pipeline.

**Project:** `~/goliath/goliath-bridge-backend`
**Key files:**
- `src/worker/relayer.ts` (main orchestrator - add new worker here)
- `src/chains/providers.ts` (goliathProvider for on-chain verification)
- `src/db/operations.ts` (createBridgeOperation)
- Relayer wallet address: `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640` (from config)

## Task
1. Create `src/worker/xcnWithdrawProcessor.ts`

2. **Polling loop:**
   - Poll every 6 seconds (match eventWatcher interval)
   - Query: `XcnWithdrawIntent WHERE state=PENDING AND boundOriginTxHash IS NOT NULL AND expiresAt > now()`
   - For each intent, verify the on-chain transfer

3. **On-chain verification:**
   - Call `goliathProvider.getTransactionReceipt(boundOriginTxHash)`
   - Verify:
     - `receipt.status === 1` (transaction succeeded)
     - Transaction `to` address === relayer wallet address (case-insensitive)
     - Transaction `value` === intent.amountAtomic (or use `getTransaction()` for value)
     - Transaction `from` === intent.senderAddress (case-insensitive)
   - If receipt not found yet: skip (will retry next poll)
   - If receipt found but verification fails: log error, mark intent as EXPIRED with error

4. **On successful verification:**
   - Generate deterministic withdrawId: `keccak256(abi.encodePacked(intent.id, boundOriginTxHash))`
     - Use ethers v6: `ethers.keccak256(ethers.solidityPacked(['string', 'string'], [intentId, originTxHash]))`
   - Create BridgeOperation:
     ```
     direction: GOLIATH_TO_SEPOLIA
     tokenSymbol: 'XCN'
     amountAtomic: intent.amountAtomic
     sender: intent.senderAddress
     recipient: intent.recipientAddress
     originTxHash: intent.boundOriginTxHash
     depositId: null
     withdrawId: generated withdrawId
     status: AWAITING_RELAY (skip CONFIRMING - Goliath has 0 finality blocks)
     originConfirmations: 0
     requiredConfirmations: 0
     ```
   - Update intent: `state=CONSUMED, consumedAt=now(), consumedByOperationId=operation.id`

5. **Expiry cleanup:**
   - Periodically mark expired intents: `WHERE state=PENDING AND expiresAt < now()` -> set `state=EXPIRED`

6. **Integrate into relayer.ts:**
   - Start XcnWithdrawProcessor alongside EventWatcher, FinalityTracker, TransactionSubmitter
   - Add stop() method for clean shutdown

7. **Write tests:**
   - Happy path: bound intent -> verified on-chain -> BridgeOperation created
   - Pending tx: receipt not found -> skipped, retried later
   - Wrong recipient: tx to wrong address -> rejected
   - Wrong amount: tx value mismatch -> rejected
   - Expired intent: not processed
   - Duplicate processing: already-consumed intent skipped

## Blockers
- `task-001-backend-xcn-withdraw-intent-model.md` — Prisma model must exist
- `task-002-backend-xcn-withdraw-api.md` — API must create intents for processor to consume

## Acceptance Checklist
- [ ] XcnWithdrawProcessor polls for bound intents
- [ ] On-chain verification checks recipient, amount, sender, status
- [ ] Successful verification creates BridgeOperation with AWAITING_RELAY status
- [ ] Intent marked CONSUMED after processing
- [ ] Expired intents cleaned up
- [ ] No double-processing (consumed intents skipped)
- [ ] Integrated into relayer.ts startup/shutdown
- [ ] Tests written and passing
- [ ] Logging covers all verification outcomes
