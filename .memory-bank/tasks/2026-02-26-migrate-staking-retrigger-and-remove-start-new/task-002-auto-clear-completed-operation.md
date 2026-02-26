# Auto-Clear Fully Completed Operation on Unmount

## Context
After migration completes (bridge COMPLETED + staking confirmed), the Redux `operation` persists indefinitely. The only way to clear it is via the "Start New Migration" button. When the user navigates away and returns, the operation is still in Redux, causing the status view to reappear and potentially re-trigger staking (addressed in task-001).

The Migrate page component is at `src/pages/Migrate/index.tsx`. The `handleStartNewMigration` callback at line 155-160 shows the cleanup logic: `clearOperation()` + `setUiFlags`.

## Task
Add a cleanup `useEffect` in the Migrate page component that auto-clears the operation from Redux when the component unmounts, but ONLY if the migration is fully completed:

1. Add a `useEffect` that runs cleanup on unmount.
2. In the cleanup function, check if the operation is fully completed:
   - Bridge status is `COMPLETED` AND either:
     - `stakeOnGoliath` is `false` (no staking step), OR
     - `clientStakingStatus` is `'confirmed'` (staking done)
3. If fully completed, dispatch `migrationActions.clearOperation()`.
4. Do NOT clear for in-progress, failed, or expired operations — those should persist for resume/display.
5. Use refs to capture the latest values for the cleanup function (since useEffect cleanup captures stale closures).

This replaces the "Start New Migration" button as the mechanism for cleaning up completed operations.

## Blockers
- `task-001-init-staking-from-redux.md` — staking status must be correctly hydrated for the completion check to work on remount

## Acceptance Checklist
- [ ] Fully completed operations (COMPLETED + staking confirmed) are cleared from Redux on unmount
- [ ] Fully completed operations (COMPLETED + no staking) are cleared from Redux on unmount
- [ ] In-progress operations are NOT cleared on unmount
- [ ] Failed/expired operations are NOT cleared on unmount
- [ ] After unmount + remount, the Migrate page shows the normal stepper/empty state (not status view)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
