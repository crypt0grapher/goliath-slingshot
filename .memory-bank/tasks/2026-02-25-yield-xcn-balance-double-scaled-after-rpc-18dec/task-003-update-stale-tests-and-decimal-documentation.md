# Update Stale Tests and Decimal Documentation

## Context
What you need to know to complete this task:
- Existing Yield comments/tests describe chain 8901 as always returning raw 8-dec balance values in frontend hooks.
- Current deployment uses RPC/multicall values aligned to 18-dec external units.
- Conflicting comments increase risk of future regressions.

## Task
Refresh documentation-in-code and test names/descriptions to reflect current runtime behavior:
- update outdated comments in Yield/staking constants
- remove or deprecate misleading helper naming that implies mandatory 8→18 normalization
- ensure tests communicate correct assumptions explicitly

## Blockers
- `task-002-fix-yield-balance-and-stake-value-scaling.md` — docs/tests should describe finalized implementation

## Acceptance Checklist
- [ ] Yield comments accurately describe current unit semantics
- [ ] Test descriptions no longer claim multicall returns raw 8-dec values in this frontend path
- [ ] Any retained conversion helper is clearly scoped and non-default
- [ ] Tests are written and passing
- [ ] Code follows the project's style
