# Fix Migrate Page: Don't Show Empty State When Data Error Exists

## Context
When the migration data fetch fails (due to network error, RPC failure, etc.), `useMigrationData` dispatches a snapshot with all-zero values AND sets an error. The `useMigrationFlow` hook sees all-zero values and sets `isEmpty: true`. The Migrate page then renders BOTH the error banner AND the "No XCN to migrate" empty state, which is misleading.

The empty state should only appear when the data fetch succeeds and genuinely returns zero staked/wallet balances. When there's an error, only the error banner should be shown.

This is in `~/goliath/CoolSwap-interface`.

## Task
In `src/pages/Migrate/index.tsx`, modify the empty state render condition (line ~227) to exclude the case when `dataError` is truthy:

Current:
```jsx
{!isLoading && !isStatusView && isEmpty && (
  <MigrationStepper ... />
)}
```

Should be:
```jsx
{!isLoading && !isStatusView && isEmpty && !dataError && (
  <MigrationStepper ... />
)}
```

## Blockers
No blockers.

## Acceptance Checklist
- [ ] When `dataError` is set and `isEmpty` is true, only the ErrorBanner renders (not MigrationStepper)
- [ ] When `dataError` is null and `isEmpty` is true, MigrationStepper renders (genuine empty state)
- [ ] When `dataError` is null and `isEmpty` is false, MigrationSummary + MigrationStepper render (normal flow)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
