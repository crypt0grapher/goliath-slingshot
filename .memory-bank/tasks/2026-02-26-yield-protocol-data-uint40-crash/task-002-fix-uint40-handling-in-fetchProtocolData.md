# Fix uint40 Handling in fetchProtocolData

## Context
The StakedXCN ABI declares `getLastUpdateTimestamp()` as returning `uint40`. ethers.js v5 decodes types ≤48 bits as plain JavaScript `number` (not BigNumber). The `fetchProtocolData()` function calls `.toNumber()` on the return value, which crashes because `Number.prototype` has no `.toNumber()` method.

This one-line crash prevents all 6 protocol values from being stored in Redux, causing the entire Yield page to show `--` for Total Staked and Net APY.

Related files:
- `src/abis/StakedXCN.ts:71-72` — ABI definition for `getLastUpdateTimestamp` with `uint40` output
- `src/hooks/yield/useYieldData.ts:31` — `lastTimestamp.toNumber()` call that crashes

## Task
Apply the fix using the chosen approach (Option B from the issue document):

1. **Change ABI return type** in `src/abis/StakedXCN.ts`:
   - Line 72: Change `{ name: '', type: 'uint40' }` to `{ name: '', type: 'uint256' }`
   - This makes ethers.js return BigNumber for the timestamp, consistent with all other return values
   - No on-chain contract change needed — `uint256` decodes the same ABI-encoded slot correctly

2. **Add defensive cast** in `src/hooks/yield/useYieldData.ts` (defense-in-depth):
   - Line 31: Change `lastUpdateTimestamp: lastTimestamp.toNumber()` to:
     `lastUpdateTimestamp: typeof lastTimestamp === 'number' ? lastTimestamp : lastTimestamp.toNumber()`
   - This handles both `number` and `BigNumber` return types safely

3. Verify the build passes: `npm run build`

## Blockers
- `task-001-add-uint40-crash-test.md` — Tests should be written first (TDD)

## Acceptance Checklist
- [ ] `src/abis/StakedXCN.ts` has `uint256` for `getLastUpdateTimestamp` output type
- [ ] `src/hooks/yield/useYieldData.ts` has defensive type check for `lastTimestamp`
- [ ] `npm run build` succeeds with no type errors
- [ ] The test from task-001 now passes
- [ ] Code follows existing project style (no unnecessary abstractions)
