# QA Release And Observability Checks

## Context
What you need to know to complete this task:
- What problem we're solving
  Need confidence that stake-step omission is fixed in real migrate flows and not reintroduced.
- Where in the project this is located
  Frontend migrate flow plus operational status endpoints.
- Related components/modules
  `/migrate` UI, status polling, backend status/history APIs.

## Task
Execute targeted QA for fresh and resumed migrations, verify timeline includes staking stage, and confirm logs/metrics for bind-origin and stake-intent consistency. Prepare release notes and rollback trigger conditions.

## Blockers
- `task-002-make-stake-intent-resolution-sticky.md` — must be implemented first
- `task-003-prevent-polling-downgrade-of-stake-flag.md` — must be implemented first
- `task-004-validate-status-panel-terminal-logic.md` — UI behavior must be finalized first

## Acceptance Checklist
- [ ] Manual QA proves staking step appears in affected path
- [ ] Post-fix tests and build pass in CI
- [ ] Observability checks for bind-origin and stake-intent mismatch are documented
- [ ] Tests are written and passing
- [ ] Code follows the project's style
