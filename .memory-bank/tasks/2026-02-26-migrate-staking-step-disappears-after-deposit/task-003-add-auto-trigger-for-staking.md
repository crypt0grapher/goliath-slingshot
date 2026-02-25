# Add Auto-Trigger for Staking When Bridge Completes

## Context
The `useMigrationStaking` hook (`src/hooks/migration/useMigrationStaking.ts`) provides the `executeStake` function and tracks staking status. Currently, it only auto-triggers staking in one scenario: when the user switches networks from the wrong chain to Goliath (`stakingStatus === 'awaiting_network'` → `isNetworkCorrect` becomes `true`).

There is no auto-trigger for the common case: the bridge reaches `COMPLETED` status (`isReadyToStake` becomes `true`) and the user is already on Goliath (`isNetworkCorrect === true`). In this case, `stakingStatus` remains `'idle'` and the user must manually click "Stake Now".

Since the user already opted in to staking during the bridge flow (and the preference is locked), staking should auto-execute when conditions are met.

## Task
Add a new `useEffect` in `src/hooks/migration/useMigrationStaking.ts` that auto-triggers `executeStake()` when all conditions are met for the first time:
- `stakingStatus === 'idle'`
- `isReadyToStake === true`
- `isNetworkCorrect === true`
- `stakeOnGoliath === true`
- `!executingRef.current`

Use a `hasAutoTriggeredRef` (or similar) to prevent the effect from re-firing after a user rejection (which resets `stakingStatus` back to `'idle'`). The ref should be reset when `isReadyToStake` changes to `false` (new operation).

Place this effect after the existing network-change auto-trigger effect (after line 217).

## Blockers
- `task-001-fix-resolved-stake-preference-priority.md` — the `stakeOnGoliath` value passed to the hook must be correct for auto-trigger to work
- `task-002-guard-polling-overwrite-of-stake-preference.md` — the Redux state must not be corrupted for the resolved value to stay `true`

## Acceptance Checklist
- [ ] When `isReadyToStake` transitions to `true` and user is on Goliath and `stakeOnGoliath=true`, `executeStake()` is called automatically
- [ ] Auto-trigger does NOT fire when `stakeOnGoliath=false`
- [ ] Auto-trigger does NOT fire when `isNetworkCorrect=false` (falls through to existing `executeStake` which sets `awaiting_network`)
- [ ] After user rejects the wallet prompt (stakingStatus resets to `idle`), auto-trigger does NOT re-fire
- [ ] User can still manually click "Stake Now" / "Retry" if auto-trigger didn't fire or was rejected
- [ ] The `hasAutoTriggeredRef` resets when a new operation starts (`isReadyToStake` goes back to `false`)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
