# Update Migrate Page XCN Formatting to 1 Decimal

## Context
The Migrate page has its own independent formatting functions that display XCN values with 4 decimal places and comma separators. These need to match the Swap page's format of 1 decimal, no commas.

Affected files and their formatting:
- `MigrationSummary.tsx` — `formatWeiToDisplay()` uses `DISPLAY_DECIMALS = 4`
- `useGoliathStakedBalance.ts` — `formatBalance()` uses `DISPLAY_DECIMALS = 4`
- `MigrationStatsBanner.tsx` — `formatAmount()` uses `maximumFractionDigits: 2` with `toLocaleString` (adds commas)

## Task
1. **`src/components/migration/MigrationSummary.tsx`** (line 18):
   - Change `const DISPLAY_DECIMALS = 4` to `const DISPLAY_DECIMALS = 1`

2. **`src/hooks/migration/useGoliathStakedBalance.ts`** (line 9):
   - Change `const DISPLAY_DECIMALS = 4` to `const DISPLAY_DECIMALS = 1`

3. **`src/components/migration/MigrationStatsBanner.tsx`** (line 132):
   - Change `maximumFractionDigits: 2` to `maximumFractionDigits: 1`
   - Remove commas from output: change `num.toLocaleString(undefined, ...)` to `num.toFixed(1)` or equivalent that doesn't add commas
   - Alternatively, use `num.toLocaleString('en-US', { maximumFractionDigits: 1, useGrouping: false })` to explicitly disable grouping

## Blockers
No blockers (independent from Yield changes)

## Acceptance Checklist
- [ ] MigrationSummary displays staked/rewards/wallet XCN with 1 decimal
- [ ] GoliathStakedBalance hook returns formatted balance with 1 decimal
- [ ] MigrationStatsBanner "Total Migrated" shows 1 decimal, no commas
- [ ] Existing tests still pass
- [ ] Build succeeds
