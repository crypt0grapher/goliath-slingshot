# Fix stakeOnGoliath Omission in setOperation Dispatches

## Context
When the bridge step executes or resumes from localStorage, the `setOperation` Redux action is dispatched WITHOUT the `stakeOnGoliath` field. This causes `operation.stakeOnGoliath` to be `undefined` in the Redux store, which makes the MigrationStatusPanel's prop `stakeOnGoliath` depend entirely on the backend response. If the backend omits or returns `false`, the "Staking on Goliath" step disappears from the status panel.

The `stakeOnGoliath` preference IS correctly saved to localStorage via `savePendingMigration` (in `persistence.ts:46-49`), and the value is available as `frozenStakePreference` in `useMigrationTransactions.ts` and `pending.stakeOnGoliath` in `Migrate/index.tsx` — it just isn't forwarded to the Redux operation.

### Affected files
- `src/hooks/migration/useMigrationTransactions.ts` — line ~687, `setOperation` dispatch
- `src/pages/Migrate/index.tsx` — line ~83, resume effect `setOperation` dispatch

## Task
Fix both `setOperation` dispatch sites to include the `stakeOnGoliath` field:

1. In `useMigrationTransactions.ts` (~line 683-689), add `stakeOnGoliath: frozenStakePreference` to the `setOperation` payload. The `frozenStakePreference` variable is already defined earlier in the function (line 474) as `true`.

2. In `Migrate/index.tsx` (~line 82-88), add `stakeOnGoliath: pending.stakeOnGoliath` to the `setOperation` payload. The `pending` object from `loadPendingMigration` already contains `stakeOnGoliath: boolean`.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `setOperation` in `useMigrationTransactions.ts` includes `stakeOnGoliath: frozenStakePreference`
- [ ] `setOperation` in `Migrate/index.tsx` resume effect includes `stakeOnGoliath: pending.stakeOnGoliath`
- [ ] After bridge execution, `state.migration.operation.stakeOnGoliath` is `true` in Redux
- [ ] After resume from localStorage, `state.migration.operation.stakeOnGoliath` matches the persisted value
- [ ] Unit test: verify `setOperation` dispatch includes `stakeOnGoliath` in both code paths
- [ ] Existing tests still pass
- [ ] Code follows the project's style
