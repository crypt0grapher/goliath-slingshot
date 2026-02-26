# Task 007: Verify XCN Deposit (Sepolia -> Goliath) and Balance Display

## Context
For Sepolia -> Goliath XCN bridging, the existing deposit hook should already work since XCN is ERC-20 on Sepolia. This task verifies correctness and ensures balance display works for both chains.

**Project:** `~/goliath/CoolSwap-interface`

## Task
1. **Verify deposit hook** (`src/hooks/bridge/useBridgeDeposit.ts`):
   - When token='XCN' and origin=Sepolia: `tokenConfig.isNative` is `false`
   - Uses `deposit(tokenConfig.address, amountAtomic, recipient)` path (correct for ERC-20)
   - No code changes expected — just verify

2. **Verify approval hooks**:
   - `useBridgeApprove.ts`: approves BridgeSepolia for XCN spending (ERC-20 on Sepolia)
   - `useBridgeAllowance.ts`: checks XCN allowance against BridgeSepolia
   - Both should work without changes since XCN is ERC-20 on Sepolia

3. **Verify balance hook** (`src/hooks/bridge/useBridgeBalances.ts`):
   - XCN on Sepolia: uses `getTokenBalance()` (ERC-20 balance)
   - XCN on Goliath: uses `getNativeBalance()` (native balance)
   - Both paths should work based on `isNative` flag in token config
   - Verify balance polling works for both

4. **Verify gas buffer**:
   - XCN on Goliath is native -> MAX button should reserve 0.01 XCN for gas
   - XCN on Sepolia is ERC-20 -> MAX button uses full balance (no gas reserve for token)

5. **Fix any issues found** and document changes.

## Blockers
- `task-005-frontend-xcn-token-config.md` — XCN must be in token config

## Acceptance Checklist
- [ ] Deposit hook uses deposit() for XCN on Sepolia
- [ ] Approval flow works for XCN on Sepolia
- [ ] Allowance checking works for XCN
- [ ] Balance displays ERC-20 XCN on Sepolia correctly
- [ ] Balance displays native XCN on Goliath correctly
- [ ] Gas buffer applied for native XCN MAX button on Goliath
- [ ] No gas buffer for ERC-20 XCN MAX on Sepolia
- [ ] No regressions in ETH flows
