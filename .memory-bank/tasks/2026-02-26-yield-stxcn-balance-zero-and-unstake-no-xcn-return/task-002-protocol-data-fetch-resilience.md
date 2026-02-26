# Make fetchProtocolData More Resilient

## Context
What you need to know to complete this task:
- `useYieldData` hook fetches protocol data via `fetchProtocolData()` — a 6-call `Promise.all` batch
- If ANY of the 6 contract calls fails, the entire batch rejects, and ALL protocol data stays null
- The error is caught and logged to console only (line 34-36) — no Redux error state dispatched
- Protocol data includes: `totalSupply`, `cumulativeIndex`, `rewardRate`, `feePercent`, `lastTimestamp`, `isPaused`
- Missing protocol data causes AnimatedBalance to show "0.000000" (task-001 fixes the immediate symptom, this task fixes the underlying data reliability)
- File: `src/hooks/yield/useYieldData.ts`
- Related: `src/state/yield/slice.ts` (yieldActions)

## Task
1. Add a retry mechanism to `fetchProtocolData` — if the `Promise.all` batch fails, retry once after a short delay (e.g., 2 seconds)
2. Dispatch a user-visible error to Redux when protocol data fetch fails after retries, so the UI can show an appropriate message
3. Consider splitting the 6-call batch into smaller groups (e.g., critical params first: rewardRate + feePercent, then secondary: totalSupply + others) to increase partial success likelihood

The error dispatch should use the existing `yieldActions.setError()` reducer with a message like "Unable to load protocol data. Please check your connection."

## Blockers
No blockers — this task can be started immediately (but ideally task-001 is done first so the static fallback handles the transition period).

## Acceptance Checklist
- [ ] `fetchProtocolData` retries once on failure before giving up
- [ ] On final failure, `yieldActions.setError()` is dispatched with a user-friendly message
- [ ] On subsequent successful fetch, the error is cleared
- [ ] Protocol data polling continues to work at the configured interval (30s)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
