# Validate Status Panel Terminal Logic

## Context
What you need to know to complete this task:
- What problem we're solving
  Terminal UI can show migration complete without showing/finishing staking when stake intent was true.
- Where in the project this is located
  `src/components/migration/MigrationStatusPanel.tsx`.
- Related components/modules
  `buildSteps`, `getStepVisualStatus`, completion state rendering.

## Task
Verify and adjust status panel step/terminal logic so it remains consistent with effective stake intent after the state-merge fixes. Keep tx links and action buttons intact.

## Blockers
- `task-002-make-stake-intent-resolution-sticky.md` — panel depends on correct effective stake intent
- `task-003-prevent-polling-downgrade-of-stake-flag.md` — panel correctness depends on stable operation state

## Acceptance Checklist
- [ ] Staking row renders whenever effective stake intent is true
- [ ] Migration complete terminal state requires staking confirmation when applicable
- [ ] No regressions for failed/expired status rendering
- [ ] Tests are written and passing
- [ ] Code follows the project's style
