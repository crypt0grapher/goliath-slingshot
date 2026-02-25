# Update MigrationStatusPanel Staking Step Logic

## Context
The `MigrationStatusPanel` component has a staking step (`StatusStep.STAKING_ON_GOLIATH`) that is conditionally rendered based on `stakeOnGoliath`. The step's visual status is inferred by `inferStakingStatus()`. Currently, this function short-circuits to `'completed'` when `backendStatus === 'COMPLETED'`, even when no client-side staking transaction has occurred.

With client-side staking (task-002), we need the staking step to accurately reflect the real staking state: idle (waiting for bridge), active (network switch / tx in progress), completed (staking confirmed), or error (staking failed).

### Affected code
- `src/components/migration/MigrationStatusPanel.tsx`
  - `inferStakingStatus()` function (lines 431-455)
  - `getStepVisualStatus()` function (lines 460-521)
  - Component render — staking step description and tx link

## Task
1. Update `inferStakingStatus` to accept a `clientStakingStatus` parameter from the new `useMigrationStaking` hook. The function should:
   - Return `'active'` when bridge is COMPLETED, `stakeOnGoliath` is true, and client staking has not yet confirmed (no `stakingTxHash` or `clientStakingStatus` is `'pending_signature'`/`'tx_pending'`/`'awaiting_network'`)
   - Return `'completed'` only when `clientStakingStatus === 'confirmed'` OR `stakingTxHash` is present and no error
   - Return `'error'` when `clientStakingStatus === 'failed'` or `stakingError` is present
   - Return `'idle'` when bridge is not yet completed

2. Add new props to `MigrationStatusPanelProps`:
   - `clientStakingStatus?: string` — status from `useMigrationStaking`
   - `clientStakingTxHash?: string` — tx hash from client-side staking
   - `onExecuteStake?: () => void` — callback to trigger staking
   - `onRetryStake?: () => void` — callback to retry failed staking

3. Update the staking step rendering to show:
   - "Switch to Goliath network to stake" when `clientStakingStatus === 'awaiting_network'`
   - "Confirm staking in your wallet" when `clientStakingStatus === 'pending_signature'`
   - Spinner + tx link when `clientStakingStatus === 'tx_pending'`
   - Completed badge + tx link when `clientStakingStatus === 'confirmed'`
   - Error message + retry button when `clientStakingStatus === 'failed'`

4. Add a "Stake Now" button in the staking step when bridge is COMPLETED and staking hasn't started yet (status is idle/awaiting_network).

## Blockers
- `task-002-add-client-side-staking-hook.md` — need the hook's status types and interface

## Acceptance Checklist
- [ ] `inferStakingStatus` no longer returns `'completed'` just because `backendStatus === 'COMPLETED'`
- [ ] Staking step shows as "active" after bridge COMPLETED until client staking is confirmed
- [ ] Staking step shows progress states: awaiting_network → pending_signature → tx_pending → confirmed
- [ ] Staking step shows error state with retry button on failure
- [ ] Staking tx hash is displayed as a link to Goliath explorer
- [ ] "Stake Now" button is rendered when staking is ready but not started
- [ ] Tests updated for new `inferStakingStatus` behavior
- [ ] Tests cover each staking status rendering
- [ ] Tests are written and passing
- [ ] Code follows the project's style
