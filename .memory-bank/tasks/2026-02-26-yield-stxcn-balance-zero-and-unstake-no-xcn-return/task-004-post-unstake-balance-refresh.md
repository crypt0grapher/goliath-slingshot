# Call refetch() After Successful Unstake

## Context
What you need to know to complete this task:
- After a successful unstake transaction (`await tx.wait()`), the `useUnstake` hook clears the input and closes the modal but does NOT refresh the user's balances
- The stXCN balance update relies on the next poll cycle (15s interval), meaning the user waits up to 15 seconds to see their updated balance
- Similarly, the XCN balance shown via `useCurrencyBalance` (multicall) may be stale
- The `useYieldData` hook already returns a `refetch` function that triggers both `fetchProtocolData()` and `fetchUserData()`
- File: `src/hooks/yield/useUnstake.ts`
- Related: `src/hooks/yield/useYieldData.ts` (refetch), `src/pages/Yield/index.tsx` (wiring)
- The same pattern should also be applied to `useStake.ts` for consistency

## Task
1. Modify `useUnstake` to accept a `refetch` callback parameter
2. Call `refetch()` after `await tx.wait()` succeeds (before clearing input)
3. Wire the `refetch` function from `useYieldData()` to `useUnstake` via the Yield page (`index.tsx`)
4. Apply the same pattern to `useStake` for consistency

In `index.tsx`, the wiring:
```typescript
const { refetch } = useYieldData();
const { unstake, isLoading: isUnstaking } = useUnstake(refetch);
const { stake, isLoading: isStaking } = useStake(refetch);
```

## Blockers
No blockers — this task can be started immediately.

## Acceptance Checklist
- [ ] After a successful unstake, `refetch()` is called to immediately refresh balances
- [ ] After a successful stake, `refetch()` is called to immediately refresh balances
- [ ] The `refetch` parameter is properly typed and optional (backwards compatible)
- [ ] User sees updated stXCN balance within seconds of transaction confirmation (not waiting for next poll)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
