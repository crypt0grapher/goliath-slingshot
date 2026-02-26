# Regression Validation and Verification

## Context
After fixing the `uint40` crash in `fetchProtocolData`, we need to verify that:
1. All existing Yield tests still pass
2. The full build succeeds
3. Protocol data loads correctly in the running app
4. No other ABI definitions have the same `uint40`/small-uint issue

Related files:
- `src/__tests__/yield/` — all yield test files
- `src/abis/StakedXCN.ts` — the modified ABI
- `src/hooks/yield/useYieldData.ts` — the modified hook

## Task
1. Run the full Yield test suite:
   - `npm test -- --watchAll=false --runInBand src/__tests__/yield/`
   - All tests must pass (existing + new from task-001)

2. Run the full project build:
   - `npm run build`
   - Must succeed with no errors

3. Audit ABI file for other small-uint types:
   - Check `src/abis/StakedXCN.ts` for any remaining `uint8`..`uint48` output types
   - If found, evaluate whether they need the same `uint256` treatment

4. Verify the ethers.js contract call works correctly with updated ABI:
   - Run verification: `node -e "..."` with the updated ABI (uint256 for getLastUpdateTimestamp)
   - Confirm `getLastUpdateTimestamp()` now returns BigNumber with `.toNumber()` available

5. Manual verification checklist (for post-deploy):
   - Open `/yield` without wallet connected → `Total Staked` and `Net APY` show actual values
   - Connect wallet on wrong network → values persist, switch-network CTA visible
   - Connect wallet on Goliath → values persist, staking controls appear
   - Check browser console → no `Failed to fetch protocol data` errors

## Blockers
- `task-002-fix-uint40-handling-in-fetchProtocolData.md` — Fix must be applied first

## Acceptance Checklist
- [ ] All Yield tests pass (`npm test -- --watchAll=false --runInBand src/__tests__/yield/`)
- [ ] Project builds successfully (`npm run build`)
- [ ] No other small-uint ABI types found (or documented if found)
- [ ] ethers.js verification confirms BigNumber return for updated ABI
- [ ] Tests are written and passing
- [ ] Code follows the project's style
