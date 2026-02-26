# Add Failing Test for uint40 toNumber() Crash

## Context
The `fetchProtocolData()` function in `src/hooks/yield/useYieldData.ts` crashes because `getLastUpdateTimestamp()` returns a `uint40` value. ethers.js v5 decodes `uint40` as a plain JavaScript `number`, but the code calls `.toNumber()` (a BigNumber method) on it, causing a `TypeError`. This crash prevents ALL protocol data (`totalSupply`, `rewardRateRay`, `feePercentBps`) from being dispatched to Redux, resulting in `--` dashes for Total Staked and Net APY on the Yield page.

The test should mock a contract where `getLastUpdateTimestamp()` returns a plain `number` and verify that `setProtocolData` is dispatched correctly.

Related files:
- `src/hooks/yield/useYieldData.ts` (the hook with `fetchProtocolData`)
- `src/abis/StakedXCN.ts` (ABI with `uint40` return type)
- `src/state/yield/slice.ts` (Redux slice with `setProtocolData` action)

## Task
Create a test file `src/__tests__/yield/useYieldData.test.ts` that:

1. Mocks `useStakedXCNContract` to return a fake contract where all methods return expected types:
   - `totalSupply()` → BigNumber
   - `getCumulativeIndex()` → BigNumber
   - `getRewardRate()` → BigNumber
   - `getFeePercent()` → BigNumber
   - `getLastUpdateTimestamp()` → **plain `number`** (this is the uint40 behavior)
   - `paused()` → boolean
2. Mocks `useActiveWeb3React` and `dispatch`.
3. Verifies that `fetchProtocolData` succeeds and dispatches `setProtocolData` with the correct `lastUpdateTimestamp` value as a number.
4. Also tests the case where `getLastUpdateTimestamp()` returns a BigNumber (uint256 behavior) to confirm backward compatibility.
5. Tests the error path (contract call fails → error dispatched after retry).

The test should **fail** before the fix is applied (because `lastTimestamp.toNumber()` crashes on plain number).

## Blockers
No blockers.

## Acceptance Checklist
- [ ] Test file `src/__tests__/yield/useYieldData.test.ts` exists
- [ ] Test for uint40 (plain number) return type is present and expected to FAIL before fix
- [ ] Test for uint256 (BigNumber) return type is present
- [ ] Test for RPC error path is present
- [ ] Tests use proper Jest mocking patterns consistent with existing yield tests
- [ ] Tests follow project code style
