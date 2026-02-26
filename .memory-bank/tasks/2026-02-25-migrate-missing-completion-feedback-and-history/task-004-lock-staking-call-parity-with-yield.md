# Lock Staking Call Parity With Yield Path

## Context
What you need to know to complete this task:
- Problem: requirement is that migrate staking step follows same staking semantics as Yield (`stake` with native value).
- Location: frontend reference `src/hooks/yield/useStake.ts`; backend path `~/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts`; adapter `~/goliath/staking/test-contract-sepolia/src/BridgeStakingAdapter.sol`.
- Related components/modules: bridge worker staking branch, staking tx hash reporting.

## Task
Add/strengthen tests and documentation assertions that migration staking path preserves Yield-equivalent semantics. Specifically, ensure `stakeOnGoliath=true` path executes staking call and records `stakingTxHash`, and verify adapter still calls `stXCN.stake{value}` internally.

## Blockers
No blockers

## Acceptance Checklist
- [ ] Yield staking call reference is documented in issue/implementation notes
- [ ] Backend tests confirm staking branch executes when expected
- [ ] Adapter-level test confirms `stakeFor` delegates to `stXCN.stake{value}` semantics
- [ ] `stakingTxHash` appears in successful staking-path operation records
- [ ] Tests are written and passing
- [ ] Code follows the project's style
