# Update and Add Formatting Tests

## Context
After changing decimal formatting from 4/6 to 1 across Yield and Migrate pages, existing tests in `src/__tests__/yield/` may need updating, and new tests should verify the 1-decimal behavior.

Known test files:
- `src/__tests__/yield/utils.test.ts` — may test `formatTokenAmount`
- `src/__tests__/yield/xcnBalanceNormalization.test.ts` — balance normalization tests

## Task
1. **Check existing tests** in `src/__tests__/yield/utils.test.ts` and `src/__tests__/yield/xcnBalanceNormalization.test.ts`:
   - Update any assertions that expect 4 or 6 decimal places to expect 1 decimal
   - Update any assertions that expect comma-separated output to expect plain numbers

2. **Create `src/__tests__/yield/formatting.test.ts`** with tests for:
   - `formatTokenAmount('130549770400000000000000', 1, false)` → `'130549.7'`
   - `formatTokenAmount('1000000000000000000', 1, false)` → `'1.0'`
   - `formatTokenAmount('0', 1, false)` → `'0'`
   - `formatTokenAmount(null, 1, false)` → `'0'`
   - `formatTokenAmount('500000000000000000', 1, false)` → `'0.5'`
   - Verify no commas appear in output when `addCommas=false`
   - Verify commas still work when `addCommas=true` (backward compat if needed)

3. **Verify all tests pass**: `npm test`

## Blockers
- `task-001-reduce-decimals-formatting-utilities.md` — formatting changes must be in place
- `task-003-update-migrate-formatting.md` — migrate changes must be in place

## Acceptance Checklist
- [ ] Existing tests updated for 1-decimal expectations
- [ ] New formatting test file created with comprehensive cases
- [ ] All tests pass: `npm test`
- [ ] No test regressions
- [ ] Code follows the project's test conventions
