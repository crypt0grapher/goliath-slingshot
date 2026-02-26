# Add Protocol Stats Loading and Error State Coverage

## Context
Even after visibility is fixed, protocol stats can still show placeholders (`--`) when fetches are delayed or fail. Current test coverage does not validate Yield page behavior for protocol loading/error transitions.

## Task
Add tests for protocol data loading/error states at the page level (or selector-driven component tests) to verify:
- Stats section remains mounted while data is loading
- Placeholder values are intentional and visible
- Error banners do not remove protocol stats

If needed, adjust UI copy or state wiring to make loading/error behavior explicit without hiding stats.

## Blockers
- `task-002-refactor-yield-layout-to-always-show-protocol-stats.md` — stats must be always-mounted first

## Acceptance Checklist
- [ ] Loading state test added for protocol stats visibility
- [ ] Error state test added for protocol stats visibility
- [ ] Placeholder behavior (`--`) is explicitly asserted
- [ ] Existing Yield tests remain green
- [ ] Tests are written and passing
- [ ] Code follows the project's style
