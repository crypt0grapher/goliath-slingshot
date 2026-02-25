# Integrate Client-Side Staking Into Migration Page Flow

## Context
The Migration page (`src/pages/Migrate/index.tsx`) orchestrates the entire migration flow: data loading, step derivation, transaction execution, status polling, and status display. We need to integrate the new `useMigrationStaking` hook into this flow so that:
- After bridge COMPLETED with `stakeOnGoliath === true`, staking is triggered
- Staking status is passed to the `MigrationStatusPanel`
- The "Migration Complete" terminal state only shows after staking is also completed (when opted)

### Key integration points
- After `useMigrationStatusPolling` returns `operationStatus === 'COMPLETED'`
- The `MigrationStatusPanel` receives staking-related props
- The bridged amount needs to be available for the staking call

## Task
1. In `Migrate/index.tsx`, add the `useMigrationStaking` hook:
   ```
   const {
     executeStake,
     stakingStatus,
     stakingTxHash,
     stakingError,
     isNetworkCorrect,
     retry: retryStake,
   } = useMigrationStaking(
     operation?.amount || migrationFields?.amount || '0',
     operation?.stakeOnGoliath ?? true,
     operationStatus === 'COMPLETED'
   );
   ```

2. Pass staking props to `MigrationStatusPanel`:
   - `clientStakingStatus={stakingStatus}`
   - `clientStakingTxHash={stakingTxHash}`
   - `onExecuteStake={executeStake}`
   - `onRetryStake={retryStake}`

3. Determine the bridged amount for staking:
   - The amount is available from the migration API response (in `migrationFields` or the polling response)
   - The `MigrationStatusResponse.amount` field contains the bridged amount in atomic units
   - Store this in the operation state so it's available for the staking hook

4. Update `MigrationOperation` type to include `amount?: string` field

5. Update `updateOperationStatus` reducer to store the amount from polling response

6. Update `handleStartNewMigration` to also reset staking state

## Blockers
- `task-001-fix-operation-stakeOnGoliath.md` — need reliable `stakeOnGoliath` in operation
- `task-002-add-client-side-staking-hook.md` — need the hook to be created
- `task-003-update-status-panel-staking-step.md` — need the panel to accept staking props

## Acceptance Checklist
- [ ] `useMigrationStaking` hook is instantiated in `Migrate/index.tsx`
- [ ] Bridged amount is resolved from operation state or polling fields
- [ ] Staking props passed to `MigrationStatusPanel`
- [ ] `MigrationOperation` type includes `amount?: string`
- [ ] `updateOperationStatus` stores `amount` from polling response
- [ ] Staking triggers after bridge COMPLETED when `stakeOnGoliath === true`
- [ ] "Start New Migration" resets staking state
- [ ] Full flow tested: bridge → poll → COMPLETED → staking → confirmed → done
- [ ] Tests are written and passing
- [ ] Code follows the project's style
