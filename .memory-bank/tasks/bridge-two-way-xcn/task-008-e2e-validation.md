# Task 008: End-to-End Validation of Two-Way XCN Bridge

## Context
After all backend and frontend components are deployed, the full bridge flow needs end-to-end validation on the live testnet.

## Task
### Scenario 1: XCN Sepolia -> Goliath (Forward, uses existing deposit path)
1. Connect wallet on Sepolia
2. Select XCN in Bridge token dropdown
3. Enter amount (e.g., 10 XCN)
4. Approve XCN spending for BridgeSepolia (if first time)
5. Confirm deposit transaction
6. Verify status modal shows: Deposit -> Confirmations -> Delivering -> Complete
7. Verify native XCN received on Goliath
8. Verify operation in bridge history

### Scenario 2: XCN Goliath -> Sepolia (Reverse, new intent + native transfer)
1. Connect wallet on Goliath
2. Select XCN in Bridge token dropdown
3. Switch direction to Goliath -> Sepolia
4. Enter amount (e.g., 5 XCN)
5. Sign EIP-712 intent (wallet popup)
6. Confirm native XCN transfer to relayer wallet (wallet popup)
7. Verify status modal shows progress
8. Verify ERC-20 XCN received on Sepolia
9. Verify operation in bridge history

### Scenario 3: ETH Bridge Regression
1. Bridge ETH Sepolia -> Goliath
2. Bridge ETH Goliath -> Sepolia
3. Both complete successfully, no regressions

### Scenario 4: Edge Cases
1. MAX button for native XCN on Goliath reserves gas buffer
2. Switching between ETH and XCN updates balances correctly
3. User rejects wallet signature -> graceful error, no XCN sent
4. Attempt to bridge more XCN than BridgeSepolia holds -> verify backend handles gracefully

## Blockers
- All other tasks (001-007) must be complete
- Backend deployed with new API routes and processor
- Frontend deployed with XCN in Bridge tab

## Acceptance Checklist
- [ ] XCN Sepolia -> Goliath completes end-to-end
- [ ] XCN Goliath -> Sepolia completes end-to-end
- [ ] ETH bridge works in both directions (no regression)
- [ ] Status polling shows correct progress for XCN
- [ ] Balance updates after operations
- [ ] MAX button works with gas buffer for native XCN
- [ ] Bridge history shows all XCN operations
- [ ] Error handling works (user rejection, insufficient balance)
- [ ] BridgeGoliath address unchanged in all projects
