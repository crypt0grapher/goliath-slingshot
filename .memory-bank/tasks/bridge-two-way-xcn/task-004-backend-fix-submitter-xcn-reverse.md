# Task 004: Fix TransactionSubmitter for XCN Reverse Bridging

## Context
The TransactionSubmitter at `src/worker/transactionSubmitter.ts` handles GOLIATH_TO_SEPOLIA operations but has no XCN case. Currently:
- `getDestinationTokenAddress()` returns USDC address for any non-ETH token in reverse direction (line 668-683)
- The GOLIATH_TO_SEPOLIA submission branch correctly uses `release()` for non-ETH tokens, which works for both USDC and XCN

The fix is minimal: just add XCN to `getDestinationTokenAddress()`.

**Project:** `~/goliath/goliath-bridge-backend`
**File:** `src/worker/transactionSubmitter.ts`

## Task
1. **Fix `getDestinationTokenAddress()`** (around line 668-683):
   ```typescript
   private getDestinationTokenAddress(tokenSymbol: string, direction: BridgeDirection): string {
       if (direction === BridgeDirection.SEPOLIA_TO_GOLIATH) {
           if (tokenSymbol === 'ETH') return config.tokens.eth.goliath;
           if (tokenSymbol === 'USDC') return config.tokens.usdc.goliath;
           // XCN is native on Goliath - no destination token address (uses wallet.sendTransaction)
           throw new Error(`Unsupported token for SEPOLIA_TO_GOLIATH destination: ${tokenSymbol}`);
       } else {
           if (tokenSymbol === 'ETH') return '0x0000000000000000000000000000000000000000';
           if (tokenSymbol === 'XCN') return config.tokens.xcn.sepolia;
           if (tokenSymbol === 'USDC') return config.tokens.usdc.sepolia;
           throw new Error(`Unsupported token for GOLIATH_TO_SEPOLIA destination: ${tokenSymbol}`);
       }
   }
   ```

2. **Verify GOLIATH_TO_SEPOLIA submission branch** (around line 409-453):
   - XCN is ERC-20 on Sepolia, so it should use `bridgeSepolia.release()` (same as USDC)
   - The existing `else` branch already calls `release()` for non-ETH tokens
   - Add explicit logging for XCN release operations

3. **Write/update tests:**
   - `getDestinationTokenAddress('XCN', GOLIATH_TO_SEPOLIA)` returns `config.tokens.xcn.sepolia`
   - `getDestinationTokenAddress('ETH', GOLIATH_TO_SEPOLIA)` still returns zero address
   - `getDestinationTokenAddress('USDC', GOLIATH_TO_SEPOLIA)` still returns USDC Sepolia address
   - Unsupported tokens throw errors

## Blockers
- No blockers (can be done in parallel with tasks 001-003)

## Acceptance Checklist
- [ ] `getDestinationTokenAddress()` returns correct XCN Sepolia address for GOLIATH_TO_SEPOLIA
- [ ] Existing ETH and USDC mappings unchanged
- [ ] Unsupported tokens throw clear errors instead of silently returning wrong address
- [ ] Backend builds without errors
- [ ] Tests written and passing
