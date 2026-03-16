# Task 001: Add Gas Estimation Fallback to Stake/Unstake Hooks

## Context
The Yield page's stake() and unstake() calls rely on eth_estimateGas, which fails for payable functions when the Hiero JSON-RPC relay doesn't forward msg.value during gas simulation. This causes a ZeroAmount() revert (error selector 0x1f2a2005) that prevents users from staking.

The fix: try gas estimation first, and if it fails, fall back to a hardcoded gasLimit. This ensures transactions always submit regardless of relay gas estimation behavior.

Affected files:
- `src/hooks/yield/useStake.ts` — stake() call at line 55
- `src/hooks/yield/useUnstake.ts` — unstake() call at line 30
- `src/constants/staking.ts` — new gas limit constants

On-chain gas data (from mirror node):
- stake() consistently uses ~73,752 gas
- unstake() consistently uses ~81,265 gas

## Task

1. Add gas limit constants to `src/constants/staking.ts`:
   - `STAKE_GAS_LIMIT = 150_000` (2x headroom over observed 73,752)
   - `UNSTAKE_GAS_LIMIT = 200_000` (2.5x headroom over observed 81,265)

2. In `src/hooks/yield/useStake.ts`, before `contract.stake({ value: amount })`:
   - Try `contract.estimateGas.stake({ value: amount })`
   - If estimation succeeds, use estimated gas * 1.2 (20% buffer)
   - If estimation throws (any error), use `STAKE_GAS_LIMIT` as fallback
   - Pass the resolved `gasLimit` as a transaction override: `contract.stake({ value: amount, gasLimit })`

3. In `src/hooks/yield/useUnstake.ts`, before `contract.unstake(amountBN)`:
   - Try `contract.estimateGas.unstake(amountBN)`
   - If estimation succeeds, use estimated gas * 1.2
   - If estimation throws, use `UNSTAKE_GAS_LIMIT` as fallback
   - Pass the resolved `gasLimit` as override: `contract.unstake(amountBN, { gasLimit })`

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `STAKE_GAS_LIMIT` and `UNSTAKE_GAS_LIMIT` constants exported from `src/constants/staking.ts`
- [ ] `useStake` hook always passes explicit `gasLimit` to `contract.stake()`
- [ ] `useUnstake` hook always passes explicit `gasLimit` to `contract.unstake()`
- [ ] When gas estimation succeeds, the estimated value (with buffer) is used
- [ ] When gas estimation fails, the fallback constant is used (no error thrown)
- [ ] Existing tests still pass
- [ ] New test: mocked gas estimation failure results in fallback gasLimit being used
- [ ] Build succeeds with no TypeScript errors
