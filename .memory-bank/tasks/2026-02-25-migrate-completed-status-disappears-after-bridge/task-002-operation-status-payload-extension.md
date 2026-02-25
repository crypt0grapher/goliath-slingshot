# Extend Migration Operation Status Payload

## Context
What you need to know to complete this task:
- Backend `/bridge/status` already returns `destinationTxHash`, `timestamps.completedAt`, and `stakeOnGoliath`.
- Frontend migration operation state currently stores only `status`, `stakingTxHash`, and `stakingError`.
- Missing fields prevent terminal UI from showing completion verification details.

## Task
Extend migration state and polling plumbing so operation/status state carries destination tx hash, completion timestamp, and stake preference truth from backend responses.

## Blockers
- `task-001-regression-tests-terminal-status-view.md` — establishes expected behavior before state refactor

## Acceptance Checklist
- [ ] `MigrationOperation` type includes terminal metadata needed by UI.
- [ ] `migration/updateOperationStatus` supports new metadata fields without breaking existing behavior.
- [ ] `useMigrationStatusPolling` maps metadata from `getMigrationStatus` response and dispatches it.
- [ ] Related unit tests for reducer/polling are updated and passing.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
