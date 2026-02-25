# Fix resolvedStakeOnGoliath Priority Order

## Context
The migration status panel uses `resolvedStakeOnGoliath` to determine whether to show the "Staking on Goliath" step. This value is resolved in `src/pages/Migrate/index.tsx:143` using a `??` chain that gives backend polling data (`migrationFields?.stakeOnGoliath`) priority over the local operation state (`operation?.stakeOnGoliath`).

When the `bindOriginTxHash` API call hasn't completed yet (it's fire-and-forget with retries), the backend doesn't know about the user's stake preference and may return `stakeOnGoliath: false`. This causes the staking step to disappear from the UI.

The local operation state is the source of truth — it's set during `executeBridge` with `frozenStakePreference = true` and persisted to localStorage. It should always take precedence.

## Task
In `src/pages/Migrate/index.tsx:143`, swap the priority order so that `operation?.stakeOnGoliath` is checked first, before `migrationFields?.stakeOnGoliath`.

**Before:**
```typescript
const resolvedStakeOnGoliath = migrationFields?.stakeOnGoliath ?? operation?.stakeOnGoliath ?? true;
```

**After:**
```typescript
const resolvedStakeOnGoliath = operation?.stakeOnGoliath ?? migrationFields?.stakeOnGoliath ?? true;
```

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `resolvedStakeOnGoliath` returns `true` when `operation.stakeOnGoliath=true` and `migrationFields.stakeOnGoliath=false`
- [ ] `resolvedStakeOnGoliath` returns `true` when `operation.stakeOnGoliath=true` and `migrationFields.stakeOnGoliath=undefined`
- [ ] `resolvedStakeOnGoliath` falls back to `migrationFields.stakeOnGoliath` when `operation.stakeOnGoliath` is `undefined`
- [ ] `resolvedStakeOnGoliath` defaults to `true` when both sources are `undefined`
- [ ] Build succeeds
- [ ] Code follows the project's style
