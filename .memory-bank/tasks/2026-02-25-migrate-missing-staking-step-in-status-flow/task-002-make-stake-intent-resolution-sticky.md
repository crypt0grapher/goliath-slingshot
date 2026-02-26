# Make Stake Intent Resolution Sticky

## Context
What you need to know to complete this task:
- What problem we're solving
  `resolvedStakeOnGoliath` currently prioritizes polled backend data over local operation intent.
- Where in the project this is located
  `src/pages/Migrate/index.tsx`.
- Related components/modules
  `useMigrationStaking`, `MigrationStatusPanel`, operation state from Redux.

## Task
Adjust stake-intent resolution so active operation intent remains authoritative during migration tracking. Ensure the effective value cannot be temporarily downgraded by contradictory polled fields.

## Blockers
- `task-001-add-regression-tests-for-stake-step-visibility.md` — tests must exist first to validate behavior change

## Acceptance Checklist
- [ ] Effective stake intent uses stable precedence for active operations
- [ ] Staking step no longer disappears in race/lag scenarios
- [ ] Existing status view behavior remains intact for non-staking operations
- [ ] Tests are written and passing
- [ ] Code follows the project's style
