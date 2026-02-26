# Integration Test: Full Bridge Step Flow

## Context
After fixing the i18n spelling (task-001), aligning the EIP-712 schema (task-002), and deploying the backend (task-003), the full bridge step flow needs to be validated end-to-end.

The bridge step flow is:
1. Lock the stake toggle preference
2. Sign EIP-712 typed intent via wallet
3. POST `/migration/stake-preference` with signed payload
4. Call `bridge.deposit()` on-chain (Sepolia)
5. POST `/migration/stake-preference/bind-origin` with intentId + originTxHash
6. Save pending operation to localStorage
7. Transition to status tracking view

- Hook: `src/hooks/migration/useMigrationTransactions.ts` (`executeBridge`)
- API client: `src/services/migrationApi.ts` (`submitStakePreference`, `bindOriginTxHash`)
- Config: `src/config/migrationConfig.ts`, `src/config/bridgeConfig.ts`

## Task
Verify the full bridge step works correctly with the aligned EIP-712 schema and deployed backend:

1. Connect a test wallet on Sepolia with XCN balance
2. Navigate to the Migrate tab
3. Complete prerequisite steps (approve, unstake if applicable)
4. Execute the bridge step
5. Verify the EIP-712 signature prompt appears with correct data
6. Verify `POST /migration/stake-preference` returns 200 with `intentId`
7. Verify the bridge deposit transaction is submitted
8. Verify `POST /migration/stake-preference/bind-origin` is called
9. Verify the UI transitions to status tracking view

Also verify:
- i18n strings show "XCN" not "CHN" in the bridge step and toggle
- The existing `/bridge` tab continues to work for ETH/USDC

## Blockers
- `task-001-fix-chn-to-xcn-spelling.md` -- spelling fix must be applied
- `task-002-align-eip712-frontend-to-backend.md` -- EIP-712 schema must be aligned
- `task-003-deploy-backend-migration-routes.md` -- backend must be deployed

## Acceptance Checklist
- [ ] Bridge step does not show "Failed" immediately
- [ ] EIP-712 signature prompt shows `GoliathBridge` as domain name
- [ ] `POST /migration/stake-preference` returns 200 (not `net::ERR_FAILED`)
- [ ] Bridge deposit transaction is submitted on-chain
- [ ] Status tracking view appears after deposit submission
- [ ] i18n shows "XCN" everywhere, no "CHN"
- [ ] Existing `/bridge` tab works unchanged for ETH/USDC
- [ ] No console errors related to signature mismatch
