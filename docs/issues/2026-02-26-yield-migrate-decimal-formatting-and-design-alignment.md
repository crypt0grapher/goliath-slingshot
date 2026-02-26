# Yield & Migrate Pages: Reduce XCN Decimals and Align Design to Swap Page

**Project:** CoolSwap-interface
**Type:** Feature
**Priority:** P2
**Risk level:** Low
**Requires deployment?:** Yes
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-26
**Related docs / prior issues:** None

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

All XCN/stXCN balances across Yield and Migrate pages display with 1 decimal place maximum (matching the low USD value of XCN at ~$0.0054). The Yield page's balance line, font, and alignment match the Swap page's visual style exactly.

**Must-have outcomes**

- [ ] XCN amounts on Yield page show at most 1 decimal place (e.g., `130549.7` not `130,549.7704`)
- [ ] XCN amounts on Migrate page show at most 1 decimal place
- [ ] Animated stXCN balance shows at most 1 decimal place
- [ ] Balance line on Yield page uses same font size (14px), weight (500), and style as Swap page
- [ ] Balance text on Yield page is right-aligned (matching Swap), not left-aligned
- [ ] No comma separators in balance numbers (matching Swap's `130549.7` format)

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `formatTokenAmount('130549770400000000000000', 1)` returns `'130549.7'` (no commas, 1 decimal)
- [ ] Test B: Animated balance `formatStatic` produces output with 1 decimal place
- [ ] Test C: Migrate page `formatWeiToDisplay` returns values with 1 decimal place
- [ ] Test D: PreviewRow balance text is right-aligned in rendered Yield components

**Non-goals**

- Changing Swap page formatting
- Changing APY percentage formatting (already correct at 2 decimals)
- Modifying transaction amounts in input fields

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, styled-components
- **Entry point:** `src/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files (consensus loss risk)
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] No breaking changes to shared utilities used by other pages

### Operational Constraints

- Allowed downtime: none
- Blast radius: Yield page, Migrate page, formatting utilities

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. **Excessive decimals:** Yield page shows balances like `130,549.7704` (4 decimals + comma separators) while Swap shows `130549.7` (1 decimal-like via 7 significant figures, no commas)
2. **Animated balance:** stXCN animated balance shows 6 decimal places (`ANIMATION_DECIMAL_PLACES = 6`)
3. **Font mismatch:** Yield balance line uses `font-size: 14px` in `PreviewRow` but the text is plain `<span>` without matching Swap's `TYPE.body` component with `fontWeight: 500, fontSize: 14`
4. **Alignment mismatch:** Yield's `PreviewRow` uses `justify-content: space-between` but only has one `<span>` child, so it appears left-aligned. Swap's balance label is inside `RowBetween` with the balance value explicitly on the right side via `TYPE.body`
5. **Migrate page:** `MigrationSummary` uses `DISPLAY_DECIMALS = 4`, `useGoliathStakedBalance` uses `DISPLAY_DECIMALS = 4`

### 4.2 Impact

- **User impact:** Users see inconsistent formatting across pages; too many decimals for a low-value token adds visual noise
- **System impact:** No functional impact, purely cosmetic
- **Scope:** Yield page, Migrate page, animated balance hook, formatting utilities

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Yield/styleds.tsx:264` | `formatTokenAmount()` | Default 4 decimals, adds commas via `toLocaleString` |
| `src/hooks/yield/useAnimatedBalance.ts:5-9` | `formatStatic()` | Uses `ANIMATION_DECIMAL_PLACES = 6`, adds commas |
| `src/constants/staking.ts` | `ANIMATION_DECIMAL_PLACES` | Set to 6, should be 1 |
| `src/pages/Yield/StakeForm.tsx:80` | Balance display | Left-aligned `<span>` in `PreviewRow` |
| `src/pages/Yield/UnstakeForm.tsx:77` | Balance display | Left-aligned `<span>` in `PreviewRow` |
| `src/pages/Yield/StakeForm.tsx:84` | Preview display | Uses 8 decimals for stXCN preview |
| `src/pages/Yield/ProtocolStats.tsx:26,44` | Stats display | Uses 4 decimals for rewards, 2 for total staked |
| `src/pages/Yield/TransactionHistory.tsx:61` | History amounts | Uses 4 decimals |
| `src/components/migration/MigrationSummary.tsx:18,194` | `formatWeiToDisplay()` | `DISPLAY_DECIMALS = 4` |
| `src/hooks/migration/useGoliathStakedBalance.ts:9,13` | `formatBalance()` | `DISPLAY_DECIMALS = 4` |
| `src/components/migration/MigrationStatsBanner.tsx:132` | `formatAmount()` | Uses `maximumFractionDigits: 2` |

### 4.4 Evidence

**Swap page balance display** (`CurrencyInputPanel/index.tsx:188-189`):
```tsx
(customBalanceText ?? t('balanceLabel') + ' ') + safeToSignificant(selectedCurrencyBalance, 7)
```
Uses `safeToSignificant` with 7 significant figures. For `130549.77...`, this yields `130549.7` — no commas, effectively 1 decimal for large XCN balances.

The balance is rendered via `TYPE.body` with `fontWeight={500}`, `fontSize={14}`, right-aligned inside `RowBetween`.

**Yield page balance display** (`StakeForm.tsx:80`):
```tsx
<PreviewRow>
  <span>Balance: {formatTokenAmount(xcnBalance)} XCN</span>
</PreviewRow>
```
Uses `formatTokenAmount` defaulting to 4 decimals + comma separators. Single `<span>` inside flex `space-between` container = left-aligned.

### 4.5 Tasks

- `task-001-reduce-decimals-formatting-utilities.md`
- `task-002-align-yield-balance-styling.md`
- `task-003-update-migrate-formatting.md`
- `task-004-update-tests.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The Yield and Migrate pages were developed independently from Swap and used their own formatting conventions (4-6 decimals with comma separators) instead of matching Swap's formatting pattern (significant figures, no commas).

### 5.2 Supporting Evidence

- `formatTokenAmount()` in `styleds.tsx` was written specifically for Yield with hardcoded defaults (4 decimals, `toLocaleString`)
- `formatWeiToDisplay()` in `MigrationSummary.tsx` independently implements the same pattern
- `ANIMATION_DECIMAL_PLACES = 6` in `constants/staking.ts` was chosen for visual animation effect, not for consistency with Swap
- Swap uses the SDK's `toSignificant()` method which naturally limits display precision

### 5.3 Gaps / Items to Verify

- None — all code paths have been identified

### 5.4 Root Cause (final)

- **Root cause:** Independent formatting implementations across pages with no shared standard for XCN display precision
- **Contributing factors:** No design system spec for number formatting; animated balance prioritized visual effect over consistency

---

## 6) SOLUTIONS (compare options)

### Option A — Reduce decimals in existing formatters + fix alignment in-place

**Changes required**
- `src/pages/Yield/styleds.tsx:264` — Change default `decimals` from `4` to `1`, remove commas (`addCommas` default to `false`)
- `src/constants/staking.ts` — Change `ANIMATION_DECIMAL_PLACES` from `6` to `1`
- `src/hooks/yield/useAnimatedBalance.ts:8` — Remove `toLocaleString` call, use plain `intPart`
- `src/pages/Yield/StakeForm.tsx:80,84` — Explicitly pass `decimals=1`, right-align balance
- `src/pages/Yield/UnstakeForm.tsx:77,81` — Explicitly pass `decimals=1`, right-align balance
- `src/pages/Yield/ProtocolStats.tsx:26,44` — Change to 1 decimal
- `src/pages/Yield/TransactionHistory.tsx:61` — Change to 1 decimal
- `src/components/migration/MigrationSummary.tsx:18` — Change `DISPLAY_DECIMALS` to `1`
- `src/hooks/migration/useGoliathStakedBalance.ts:9` — Change `DISPLAY_DECIMALS` to `1`
- `src/components/migration/MigrationStatsBanner.tsx:132` — Change `maximumFractionDigits` to `1`
- `src/pages/Yield/styleds.tsx` — Update `PreviewRow` to right-align content

**Pros**
- Minimal code changes, all localized
- No new abstractions needed
- Direct and simple

**Cons / risks**
- Formatting logic stays duplicated across files (but acceptable for now)

**Complexity:** Low
**Rollback:** Easy — `git revert`

---

### Option B — Create a shared `formatXcnAmount()` utility and use it everywhere

**Changes required**
- Create `src/utils/formatXcnAmount.ts` with unified formatting (1 decimal, no commas)
- Replace all `formatTokenAmount`, `formatWeiToDisplay`, `formatBalance` calls with the shared utility
- Same alignment/styling fixes as Option A

**Pros**
- Single source of truth for XCN formatting
- Easier to change globally in the future

**Cons / risks**
- More files touched
- Over-engineering for a simple decimal change
- Risk of regression from refactoring multiple independent formatters

**Complexity:** Medium
**Rollback:** Moderate

---

### Decision

**Chosen option:** A — Reduce decimals in existing formatters + fix alignment in-place
**Justification:** Minimal blast radius. Each formatter is simple and self-contained. The change is straightforward (replace constants). A shared utility can be introduced later if more formatting consistency issues arise.
**Accepted tradeoffs:** Some formatting code duplication remains across Yield and Migrate.

---

## 7) DELIVERABLES

- [ ] Code changes: Update decimal constants and formatting functions in 10 files
- [ ] Code changes: Fix balance line alignment and font in Yield StakeForm/UnstakeForm
- [ ] Tests: Update/add formatting tests
- [ ] Config changes: None
- [ ] Documentation: None
- [ ] Deployment: Standard frontend deploy

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/formatting.test.ts` (new)
- **Run command:** `npm test -- --testPathPattern=formatting`
- **Framework:** Jest

### 8.2 Required Tests

**Unit tests**
- [ ] `formatTokenAmount` returns 1 decimal, no commas for typical XCN balance
- [ ] `formatTokenAmount` with explicit `decimals=1` truncates correctly
- [ ] `formatTokenAmount` returns `'0'` for null/zero input
- [ ] `formatStatic` (animated balance) produces 1 decimal, no commas
- [ ] Migrate `formatWeiToDisplay` returns 1 decimal

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 - Preflight

1. Record current state: `git status`
2. Create working branch: `git checkout -b fix/yield-migrate-decimals-alignment`

### Phase 1 - Write Tests First

- **Step 1:** Create `src/__tests__/yield/formatting.test.ts` with tests for 1-decimal formatting
  - Run: `npm test -- --testPathPattern=formatting`
  - Expected: FAIL (formatters still use 4/6 decimals)

### Phase 2 - Implement Changes

- **Step 2:** Update `src/constants/staking.ts`
  - Change: `ANIMATION_DECIMAL_PLACES = 6` → `ANIMATION_DECIMAL_PLACES = 1`

- **Step 3:** Update `src/pages/Yield/styleds.tsx:264`
  - Change: Default `decimals = 4` → `decimals = 1`
  - Change: Default `addCommas = true` → `addCommas = false`

- **Step 4:** Update `src/hooks/yield/useAnimatedBalance.ts`
  - Remove `toLocaleString('en-US')` from `formatStatic` and the RAF loop
  - Use plain `intPart` instead of `Number(intPart).toLocaleString('en-US')`

- **Step 5:** Update `src/pages/Yield/StakeForm.tsx`
  - Line 80: Change balance to right-aligned, explicitly `formatTokenAmount(xcnBalance, 1, false)`
  - Line 84: Change stXCN preview from 8 decimals to 1: `formatTokenAmount(preview.toString(), 1, false)`

- **Step 6:** Update `src/pages/Yield/UnstakeForm.tsx`
  - Line 77: Right-align balance, `formatTokenAmount(stXCNBalance, 1, false)`
  - Line 81: Change from 4 to 1: `formatTokenAmount(parsedAmount.toString(), 1, false)`

- **Step 7:** Update `src/pages/Yield/ProtocolStats.tsx`
  - Line 26: Change rewards from 4 to 1 decimal
  - Line 44: Change total staked from 2 to 1 decimal

- **Step 8:** Update `src/pages/Yield/TransactionHistory.tsx`
  - Line 61: Change from 4 to 1 decimal

- **Step 9:** Update `src/pages/Yield/styleds.tsx` — `PreviewRow`
  - Change `PreviewRow` to right-align the balance text (add `justify-content: flex-end` or restructure to match Swap's layout)

- **Step 10:** Update `src/components/migration/MigrationSummary.tsx`
  - Line 18: Change `DISPLAY_DECIMALS = 4` → `1`

- **Step 11:** Update `src/hooks/migration/useGoliathStakedBalance.ts`
  - Line 9: Change `DISPLAY_DECIMALS = 4` → `1`

- **Step 12:** Update `src/components/migration/MigrationStatsBanner.tsx`
  - Line 132: Change `maximumFractionDigits: 2` → `1`

### Phase 3 - Validate

1. Run `npm test` — all tests pass
2. Run `npm run build` — build succeeds
3. Visual verification in browser: Yield and Migrate pages show 1 decimal, right-aligned balance, matching Swap font

### Phase 4 - Rollback Plan

**Triggers:** Visual regression, user complaints about lost precision
**Procedure:** `git revert <commit>`

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing functionality
- [ ] Yield page balance shows `130549.7` format (1 decimal, no commas, right-aligned)
- [ ] Migrate page balances show 1 decimal
- [ ] Animated stXCN balance shows 1 decimal
- [ ] Transaction history shows 1 decimal
- [ ] Protocol stats show 1 decimal
- [ ] Font and alignment on Yield match Swap page

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made (diff summary): pending
- Tests passing: pending
- Deployment status: pending

---

## 12) FOLLOW-UPS

- [ ] Consider creating a shared `formatXcnAmount()` utility if more formatting consistency issues arise
- [ ] Audit other pages/components for similar decimal/formatting inconsistencies
