# Hydrate useMigrationStaking from Redux Operation State

## Context
When the Migrate page component unmounts (user switches tabs) and remounts, the `useMigrationStaking` hook initializes `stakingStatus` to `'idle'` via `useState`. However, the Redux store still holds `operation.clientStakingStatus: 'confirmed'` from the completed staking. This causes the auto-trigger effect to fire `executeStake()` again, prompting the user to sign a duplicate staking transaction.

The hook lives at `src/hooks/migration/useMigrationStaking.ts`. The Redux operation state is accessible via `selectOperation` from `src/state/migration/selectors.ts`.

## Task
Modify `useMigrationStaking` to read the existing `clientStakingStatus` from the Redux `operation` on initialization:

1. Import `useSelector` and `selectOperation` from the Redux selectors.
2. Read `operation?.clientStakingStatus` and `operation?.stakingTxHash`.
3. Change `useState<ClientStakingStatus>('idle')` to `useState<ClientStakingStatus>(operation?.clientStakingStatus ?? 'idle')`.
4. Change `useState<string | null>(null)` for `stakingTxHash` to `useState<string | null>(operation?.stakingTxHash ?? null)`.
5. Initialize `hasAutoTriggeredRef.current = true` if the initial `clientStakingStatus` is `'confirmed'`, `'tx_pending'`, or `'failed'` (any non-idle, non-awaiting_network state that means staking was already attempted).

This ensures that when the hook mounts with an already-confirmed staking operation, it does not re-trigger the auto-stake logic.

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `useMigrationStaking` reads `operation.clientStakingStatus` from Redux on init
- [ ] When Redux has `clientStakingStatus: 'confirmed'`, hook returns `stakingStatus: 'confirmed'` immediately
- [ ] When Redux has `clientStakingStatus: 'confirmed'`, `executeStake` is NOT auto-triggered
- [ ] When Redux has no operation or `clientStakingStatus` is absent, hook initializes to `'idle'` (existing behavior preserved)
- [ ] When a genuinely new migration reaches COMPLETED, auto-trigger still works (first-time staking)
- [ ] `stakingTxHash` is initialized from Redux `operation.stakingTxHash` if available
- [ ] Tests are written and passing
- [ ] Code follows the project's style
