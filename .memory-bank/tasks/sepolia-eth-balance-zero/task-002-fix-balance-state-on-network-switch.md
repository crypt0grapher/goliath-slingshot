# Verify Balance State Reset on Network Switch

## Context
Users report that when switching from Goliath to Sepolia and back, the Goliath balance appears where the Sepolia balance should be. This could be caused by stale Redux multicall state persisting across chain switches.

The multicall state in Redux is keyed by `chainId` (see `src/state/multicall/hooks.ts:99` — `callResults[chainId]?.[toCallKey(call)]`), so in theory the state should not bleed across chains. However, the issue before task-001's fix is:

1. On Goliath: multicall works → balance cached in `callResults[8901]`
2. Switch to Sepolia: multicall contract is null → no new fetch → the hook may briefly render stale data during the transition

After task-001 is applied (Sepolia has a multicall address), this should self-resolve because:
- On Sepolia: multicall contract exists → new fetch triggers → `callResults[11155111]` populated
- The `useCallsData` hook reads from `callResults[chainId]`, which is the correct chain

This task is to verify that no additional state management changes are needed after task-001.

## Task
After applying task-001's fix, manually test and/or write a test that confirms:
1. Connect to Goliath → balance shows correctly
2. Switch to Sepolia → balance updates to Sepolia value (not Goliath's)
3. Switch back to Goliath → balance reverts to Goliath value

If the balance still carries over incorrectly, investigate whether the `Updater` component or `useCallsData` has a timing issue during the chainId transition and add a guard to reset displayed balance when chainId changes.

## Blockers
- `task-001-add-sepolia-multicall-address.md` — must be completed first because without the Sepolia multicall address, we can't test correct Sepolia balance fetching

## Acceptance Checklist
- [ ] Switching from Goliath to Sepolia shows the correct Sepolia native balance (not Goliath's)
- [ ] Switching from Sepolia to Goliath shows the correct Goliath native balance
- [ ] No stale/cached balance from a previous chain is displayed during network transitions
- [ ] Tests are written and passing
