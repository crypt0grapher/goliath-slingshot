# End-to-End Verification of XCN Bridge and Regression Testing

## Context
After deploying the backend (task-002), recovering the stuck operation (task-003), and optionally hardening the frontend RPCs (task-004), we need to verify the full XCN bridge works end-to-end and that existing ETH bridging is not regressed.

## Task
1. **XCN Goliath -> Sepolia (new flow):**
   - Open Bridge tab, select XCN token
   - Switch wallet to Goliath network (chain ID 8901)
   - Enter a small amount (e.g., 1 XCN)
   - Submit bridge transaction
   - Verify:
     - Intent registered via `POST /bridge/xcn-withdraw-intent`
     - Native XCN sent to relayer wallet
     - Origin tx hash bound via `POST /bridge/xcn-withdraw-intent/bind-origin`
     - Status polling shows progression: PENDING -> CONFIRMING -> AWAITING_RELAY -> PROCESSING_DESTINATION -> COMPLETED
     - Destination tx hash is displayed
     - ERC-20 XCN balance on Sepolia increased

2. **XCN Sepolia -> Goliath (existing flow):**
   - Switch to Sepolia network
   - Approve XCN ERC-20 for bridge contract (if not already approved)
   - Deposit XCN via BridgeSepolia.deposit()
   - Verify COMPLETED with native XCN received on Goliath

3. **ETH Sepolia -> Goliath (regression):**
   - Bridge a small amount of ETH
   - Verify COMPLETED with wrapped ETH received on Goliath

4. **Console monitoring:**
   - No 429 (Too Many Requests) errors under normal operation
   - No timeout errors
   - Balance updates work for all tokens on both chains

5. **Bridge history:**
   - Verify new XCN operations appear in bridge history
   - Verify old operations still visible

## Blockers
- `task-002-deploy-backend.md` — backend must be deployed
- `task-003-recover-stuck-operation.md` — stuck operation should be resolved first

## Acceptance Checklist
- [ ] XCN Goliath -> Sepolia bridge completes end-to-end
- [ ] XCN Sepolia -> Goliath bridge completes end-to-end
- [ ] ETH bridging works (no regression)
- [ ] Status polling shows correct progression for all token types
- [ ] No excessive RPC errors in browser console
- [ ] Bridge history displays all operations correctly
- [ ] Balances update correctly after bridge completions
