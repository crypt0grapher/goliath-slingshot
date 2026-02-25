# Add Completion Details And Verification Fallback

## Context
What you need to know to complete this task:
- `MigrationStatusPanel` terminal UI currently lacks completion timestamp output.
- `Migrate/index.tsx` hardcodes `stakeOnGoliath = true` and passes `destinationTxHash={null}`.
- History panel exists but is disabled by `REACT_APP_MIGRATION_HISTORY_ENABLED=false` in current env.

## Task
Render truthful completion details (stake mode, destination tx, completed time) in terminal status UI and define the environment strategy for enabling per-wallet history fallback where appropriate.

## Blockers
- `task-002-operation-status-payload-extension.md` — requires metadata flow from backend

## Acceptance Checklist
- [ ] `stakeOnGoliath` displayed in terminal UI reflects backend operation truth, not hardcoded value.
- [ ] Terminal UI includes completion timestamp and destination verification link when available.
- [ ] History fallback behavior is documented and configured for target environments.
- [ ] UI copy remains aligned with migration + yield integration expectations.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
