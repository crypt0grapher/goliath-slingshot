# Task 006: Create Frontend XCN Withdraw Hook (Goliath -> Sepolia)

## Context
For bridging native XCN from Goliath to Sepolia, the frontend cannot use the existing `useBridgeBurn` hook because:
1. BridgeGoliath has no `burnNative()` function
2. The existing `burn()` only works for ERC-20 tokens
3. Instead, users send native XCN directly to the relayer wallet via an API-first intent pattern

The flow mirrors the migration stake-preference pattern (`src/hooks/migration/useMigrationTransactions.ts` `executeBridge()`):
1. Sign EIP-712 intent
2. Register intent via API
3. Send native XCN to relayer wallet
4. Bind origin tx hash

**Project:** `~/goliath/CoolSwap-interface`
**Reference:** `src/hooks/migration/useMigrationTransactions.ts` (executeBridge function)

## Task
1. **Create API client methods** (`src/services/bridgeApi.ts`):
   ```typescript
   async registerXcnWithdrawIntent(params: {
     senderAddress: string; recipientAddress: string; amountAtomic: string;
     idempotencyKey: string; deadline: number; nonce: number; signature: string;
   }): Promise<{ intentId: string; relayerWalletAddress: string; expiresAt: string }>

   async bindXcnWithdrawOrigin(params: {
     intentId: string; senderAddress: string; originTxHash: string;
   }): Promise<{ intentId: string; originTxHash: string }>
   ```

2. **Create hook** (`src/hooks/bridge/useBridgeXcnWithdraw.ts`):
   - Export `useBridgeXcnWithdraw()` returning `{ withdraw, isLoading, error }`
   - The `withdraw(amountHuman: string, recipient: string)` function:
     a. Generate UUID for idempotency key
     b. Build EIP-712 typed data (XcnWithdrawIntent domain + types)
     c. Request wallet signature via `signer._signTypedData()`
     d. Call `registerXcnWithdrawIntent()` API
     e. On API failure: set error, STOP (don't send XCN)
     f. Send native XCN to relayer wallet: `signer.sendTransaction({ to: relayerWalletAddress, value: amountAtomic })`
     g. Call `bindXcnWithdrawOrigin()` with origin tx hash (with retry on failure)
     h. Create BridgeOperation in Redux (direction=GOLIATH_TO_SEPOLIA, token=XCN)
     i. Open status modal for the operation
     j. Wait for tx mining with 5-minute timeout
     k. Update operation status

3. **Integrate with bridge form** (`src/pages/Bridge/BridgeConfirmModal.tsx` or equivalent):
   - When direction is GOLIATH_TO_SEPOLIA and token is XCN, call `withdraw()` instead of `burn()`
   - The bridge form should detect this case and use the appropriate hook

4. **Update useBridgeBurn** (`src/hooks/bridge/useBridgeBurn.ts`):
   - Change the native asset error to indicate XCN should use the XCN withdraw flow
   - Or: the BridgeConfirmModal can conditionally call the right hook based on token/direction

## Blockers
- `task-005-frontend-xcn-token-config.md` — XCN must be in token config
- `task-002-backend-xcn-withdraw-api.md` — Backend API must exist for intent registration

## Acceptance Checklist
- [ ] API client methods for intent registration and origin binding work
- [ ] EIP-712 signature created and sent correctly
- [ ] Native XCN sent to relayer wallet address (not bridge contract)
- [ ] Origin tx hash bound to intent after transfer
- [ ] BridgeOperation created in Redux for status tracking
- [ ] Status modal opens and shows progress
- [ ] User rejection (code 4001) handled gracefully
- [ ] API failure before transfer prevents XCN from being sent
- [ ] Existing ETH burn flow unaffected
- [ ] TypeScript compiles without errors
