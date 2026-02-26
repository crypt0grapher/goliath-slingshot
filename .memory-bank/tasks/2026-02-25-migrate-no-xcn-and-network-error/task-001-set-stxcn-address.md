# Set REACT_APP_STXCN_ADDRESS in .env

## Context
The StakedXCN contract was deployed to Goliath Testnet at proxy address `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` (recorded in `~/goliath/staking/test-contract-sepolia/deployments/goliath-testnet.json`), but the CoolSwap-interface `.env` file was never updated with this address. The env var `REACT_APP_STXCN_ADDRESS` is blank, causing all Yield/Staking hooks to return null contracts and preventing any staking functionality.

This is in `~/goliath/CoolSwap-interface`.

## Task
Set `REACT_APP_STXCN_ADDRESS=0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` in the `.env` file at line 76.

Verify that:
- `src/constants/staking.ts` resolves `STAKED_XCN_ADDRESS[8901]` to the proxy address
- `src/config/stakingConfig.ts` resolves `stxcnAddress` to the proxy address

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `.env` line 76 reads `REACT_APP_STXCN_ADDRESS=0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE`
- [ ] Address matches the proxy in `~/goliath/staking/test-contract-sepolia/deployments/goliath-testnet.json`
- [ ] `yarn build` succeeds
