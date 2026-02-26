# Migrate Tab Shows "No XCN to Migrate" During Slow Token Detection

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Low
**Requires deployment?:** Yes (frontend rebuild)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:** `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

When navigating to the Migrate tab with a wallet that has staked XCN on Sepolia (e.g., `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d`), the user sees a loading skeleton while on-chain data is being fetched — never a misleading "No XCN to migrate" message.

**Must-have outcomes**

- [x] Loading skeleton displays during initial data fetch
- [x] "No XCN to migrate" only shows after fetch completes with zero balances
- [x] Refetch after transactions preserves previous snapshot values (no flash)

**Acceptance criteria (TDD)**

- [x] Test: `dispatches loading state before fetching without zeroing balances` — verifies `setSnapshotLoading` dispatched instead of zero-snapshot
- [x] All 286 migration tests pass
- [x] TypeScript compilation succeeds

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, Redux Toolkit, ethers.js
- **Entry point:** `src/pages/Migrate/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npx react-scripts test --watchAll=false --testPathPattern=migration`

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- User `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` sees "No XCN to migrate" for several seconds on the Migrate tab
- After the RPC calls complete, the correct staking data and stepper appear
- The Sepolia RPC (Chainstack primary, PublicNode fallback) has noticeable latency

### 4.2 Impact

- **User impact:** Confusing UX — users with staked XCN believe they have nothing to migrate
- **System impact:** No data risk, purely a UI race condition
- **Scope:** `useMigrationData.ts`, `Migrate/index.tsx`, `migration/slice.ts`

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/hooks/migration/useMigrationData.ts:138-147` | `fetchData()` | Zeros snapshot balances when starting fetch |
| `src/pages/Migrate/index.tsx:149` | `Migrate` component | `isLoading` depends on `!isEmpty`, which is false when snapshot is zeroed |
| `src/state/migration/slice.ts` | Redux slice | Missing granular loading action |

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

Two interacting bugs cause the empty state to render during loading:

1. `useMigrationData.fetchData()` dispatches `setSnapshot({staked:'0', walletXcn:'0', ...})` when starting a fetch, which zeros all balances in Redux.
2. `deriveSteps()` sees all-zero balances and returns `isEmpty: true`.
3. The Migrate page computes `isLoading = dataLoading && !isEmpty && ...` — since `isEmpty` is true, `isLoading` is false.
4. The empty state condition `!isLoading && isEmpty` evaluates to true, rendering "No XCN to migrate".

### 5.2 Root Cause (final)

- **Root cause:** Snapshot was zeroed during loading, causing `deriveSteps()` to compute `isEmpty=true`, and the `isLoading` guard depended on `!isEmpty` which masked the loading state.
- **Contributing factors:** Sepolia RPC latency makes the window visible for several seconds.

---

## 6) SOLUTIONS

### Option A - Preserve snapshot during loading + fix isLoading guard (CHOSEN)

**Changes required**
- `src/state/migration/slice.ts` — Add `setSnapshotLoading` reducer that only updates `loading`/`error` flags
- `src/hooks/migration/useMigrationData.ts` — Use `setSnapshotLoading` instead of zeroed `setSnapshot`
- `src/pages/Migrate/index.tsx` — Remove `!isEmpty` from `isLoading` computation

**Pros:** Fixes both initial load and refetch scenarios; minimal blast radius
**Cons:** None significant
**Complexity:** Low
**Rollback:** `git revert`

### Option B - Guard deriveSteps with snapshot.loading

**Changes required**
- Modify `deriveSteps()` to return a "loading" result when `snapshot.loading === true`

**Pros:** Single-point fix
**Cons:** Couples step derivation to loading state; doesn't fix the isLoading guard
**Complexity:** Low
**Rollback:** `git revert`

### Decision

**Chosen option:** A
**Justification:** Addresses both root causes independently; cleaner separation of concerns.

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 | Added `setSnapshotLoading` to slice | Success | New reducer preserves balance values |
| 2026-02-25 | Updated `useMigrationData` to use new reducer | Success | No more zeroing on fetch start |
| 2026-02-25 | Removed `!isEmpty` from `isLoading` in Migrate page | Success | Skeleton now shows during initial load |
| 2026-02-25 | Updated test assertion for new action type | Success | 286/286 tests pass |
| 2026-02-25 | Pushed to `feat/migrate` | Success | Commit `9f09db6` |

### Final State

- **Changes made:** 4 files (slice, hook, page, test)
- **Tests passing:** 286/286 migration tests
- **TypeScript:** Clean compilation (no new errors)
- **Commit:** `9f09db6` on `feat/migrate`, pushed to origin
