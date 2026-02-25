# Guard Polling Overwrite of stakeOnGoliath in Redux

## Context
The migration status polling hook (`src/hooks/migration/useMigrationStatusPolling.ts`) dispatches `updateOperationStatus` on every successful poll. This dispatch includes `stakeOnGoliath: response.stakeOnGoliath`, which unconditionally overwrites the locally-set `operation.stakeOnGoliath` in Redux.

When the backend returns `stakeOnGoliath: false` (because `bindOriginTxHash` hasn't completed yet), this overwrites the user's local preference of `true`. Even after the priority fix in task-001, if `operation.stakeOnGoliath` gets overwritten to `false` in Redux, it becomes the resolved value.

The fix should ensure that polling never downgrades `stakeOnGoliath` from `true` to `false` — it should only upgrade from `undefined`/`false` to `true`.

## Task
In `src/hooks/migration/useMigrationStatusPolling.ts`, modify the `updateOperationStatus` dispatch (around line 145-156) to only include `stakeOnGoliath` in the payload when the polled value is `true`. When the polled value is `false` or `undefined`, omit it from the dispatch to preserve the existing Redux value.

**Before (line 150):**
```typescript
stakeOnGoliath: response.stakeOnGoliath,
```

**After:**
```typescript
...(response.stakeOnGoliath === true ? { stakeOnGoliath: true } : {}),
```

This ensures that `updateOperationStatus` only sets `stakeOnGoliath` when the backend confirms it as `true`, never downgrading the local state.

## Blockers
- `task-001-fix-resolved-stake-preference-priority.md` — should be completed first to establish the correct priority order, though this task is independently valid

## Acceptance Checklist
- [ ] When polling returns `stakeOnGoliath: false`, Redux `operation.stakeOnGoliath` retains its previous value
- [ ] When polling returns `stakeOnGoliath: undefined`, Redux `operation.stakeOnGoliath` retains its previous value
- [ ] When polling returns `stakeOnGoliath: true`, Redux `operation.stakeOnGoliath` is set to `true`
- [ ] The `MigrationFields` local state in the hook still correctly reflects `response.stakeOnGoliath` (for informational display only)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
