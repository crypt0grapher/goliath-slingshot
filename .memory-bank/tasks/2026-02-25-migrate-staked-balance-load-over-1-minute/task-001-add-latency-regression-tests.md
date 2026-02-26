# Add Latency Regression Tests for Sepolia Provider and Migration Fetch

## Context
What you need to know to complete this task:
- We are fixing a performance bug where migrate staked balance takes 60-120s to load.
- The slowdown path is in `src/services/bridgeProviders.ts` and `src/hooks/migration/useMigrationData.ts`.
- Existing tests cover explicit RPC failures but do not cover slow-success primary RPC responses.

## Task
Write failing tests first for slow-success behavior:
- In `src/services/__tests__/bridgeProviders.test.ts`, add a case where primary `getBlockNumber` resolves too slowly and should trigger fallback.
- In `src/hooks/migration/__tests__/useMigrationData.test.ts`, add a case where migration fetch must complete via fallback within bounded time.
- Ensure these tests fail against current implementation before any production code change.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] New provider timeout/fallback regression test exists and fails pre-fix
- [ ] New `useMigrationData` latency regression test exists and fails pre-fix
- [ ] Tests are deterministic (no flaky wall-clock assumptions)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
