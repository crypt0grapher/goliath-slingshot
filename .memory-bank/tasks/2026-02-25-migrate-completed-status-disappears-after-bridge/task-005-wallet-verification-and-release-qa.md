# Verify Wallet Scenario And Release Readiness

## Context
What you need to know to complete this task:
- User-reported wallet is `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`.
- Backend shows completed migration operations for this wallet with completion timestamps.
- We need confidence that migrate+yield integration UX is correct and does not regress bridge/yield tabs.

## Task
Execute focused QA on staging/local build to validate terminal migration UX for the reported wallet pattern and confirm readiness for rollout.

## Blockers
- `task-003-terminal-status-ui-persistence.md` — core status persistence must be implemented first
- `task-004-completion-details-and-history-visibility.md` — verification details/fallback must be in place

## Acceptance Checklist
- [ ] Repro case no longer ends in ambiguous empty state after completed migration.
- [ ] Completion details are visible and verifiable from `/migrate` (time + tx link + status).
- [ ] Manual checks confirm no regressions on `/bridge` and `/yield` pages.
- [ ] Release notes/runbook updated with env flag expectations.
- [ ] Tests are written and passing
- [ ] Code follows the project's style
