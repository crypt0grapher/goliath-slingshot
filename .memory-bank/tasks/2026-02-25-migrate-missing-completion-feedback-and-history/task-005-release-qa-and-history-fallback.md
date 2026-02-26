# Run QA And Release Checks For Completion UX

## Context
What you need to know to complete this task:
- Problem: terminal completion behavior and staking execution feedback need end-to-end verification, not just unit tests.
- Location: `/migrate` runtime flow, migration history feature flag, bridge status API responses.
- Related components/modules: `MigrationStatusPanel`, `MigrationHistoryPanel`, environment flags (`REACT_APP_MIGRATION_HISTORY_ENABLED`).

## Task
Execute release QA for completed migration flows: verify terminal status persistence, tx links, and post-reset behavior. Validate whether history flag remains disabled or should be enabled after fix. Record outcomes in the implementation log.

## Blockers
- `task-002-persist-status-panel-after-terminal-state.md` — terminal persistence must exist before QA
- `task-003-propagate-completion-metadata-to-ui.md` — metadata wiring needed for full verification

## Acceptance Checklist
- [ ] Manual flow: unstake -> bridge -> stake reaches persistent completed panel
- [ ] UI does not auto-drop to empty-state immediately after completion
- [ ] `Start New Migration` cleanly resets UI
- [ ] History-flag decision documented (`enabled` vs `disabled`) with rationale
- [ ] Release checklist and risks captured in issue implementation log
- [ ] Tests are written and passing
- [ ] Code follows the project's style
