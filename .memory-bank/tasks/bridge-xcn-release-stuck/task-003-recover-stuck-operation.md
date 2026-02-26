# Recover Stuck XCN Bridge Operation

## Context
A user's XCN Goliath->Sepolia bridge is stuck on "Releasing on Sepolia". The native XCN was sent to the relayer wallet (tx `0x96daadde...`) but no `BridgeOperation` was created because the backend wasn't deployed.

After backend deployment (task-002), the `XcnWithdrawProcessor` is running but may not have a matching `XcnWithdrawIntent` for the stuck transaction (the intent registration may have failed when the old API didn't have the endpoint).

- Stuck tx: `0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031`
- Sender: `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`
- Relayer wallet: `0xE708B75F7b6914479E63D3897bEF9e0dedcA3640`

## Task
1. Check if an `XcnWithdrawIntent` exists for the stuck tx:
   ```sql
   SELECT * FROM "XcnWithdrawIntent" WHERE "boundOriginTxHash" = '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031';
   ```
2. Check if a `BridgeOperation` was already created:
   ```sql
   SELECT * FROM "BridgeOperation" WHERE "originTxHash" = '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031';
   ```
3. If neither exists, verify the on-chain transaction:
   - Get receipt from Goliath RPC
   - Confirm `to` = relayer wallet, `status` = success, extract `value` (XCN amount)
4. If the tx is confirmed but no intent exists, manually insert an `XcnWithdrawIntent`:
   ```sql
   INSERT INTO "XcnWithdrawIntent" (
     id, "senderAddress", "recipientAddress", "amountAtomic", state,
     "expiresAt", "boundOriginTxHash", "createdAt", "updatedAt"
   ) VALUES (
     gen_random_uuid(),
     '0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d',
     '0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d',
     '<EXACT_AMOUNT_FROM_TX_VALUE>',
     'PENDING',
     NOW() + INTERVAL '30 minutes',
     '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031',
     NOW(), NOW()
   );
   ```
5. Wait for `XcnWithdrawProcessor` to pick up the intent (polls every 6 seconds)
6. Verify `BridgeOperation` was created:
   ```sql
   SELECT id, status, "destinationTxHash" FROM "BridgeOperation" WHERE "originTxHash" = '0x96daadde569dfdbbc3252f035245fab7c562f66b1b07f4fe1fc8925458ad2031';
   ```
7. Monitor until status reaches `COMPLETED` with a destination tx hash
8. Verify on Sepolia Etherscan that the ERC-20 XCN was released to the user

## Blockers
- `task-002-deploy-backend.md` — backend must be deployed with XcnWithdrawProcessor running

## Acceptance Checklist
- [ ] On-chain transaction verified (sender, recipient, amount, status)
- [ ] XcnWithdrawIntent exists (either found or manually created)
- [ ] BridgeOperation created by XcnWithdrawProcessor
- [ ] TransactionSubmitter submits release tx on Sepolia
- [ ] Operation reaches COMPLETED status with destination tx hash
- [ ] User's ERC-20 XCN balance on Sepolia increased
- [ ] Frontend status polling shows COMPLETED (user can see success)
