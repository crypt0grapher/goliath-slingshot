# Align Yield Balance Line Styling and Alignment to Match Swap

## Context
The Swap page displays the balance label right-aligned using `RowBetween` with `TYPE.body` at `fontWeight: 500, fontSize: 14`. The Yield page's `PreviewRow` has `justify-content: space-between` but only contains a single `<span>`, so the text appears left-aligned. The font style also differs.

**Swap balance rendering** (`CurrencyInputPanel/index.tsx:181-191`):
```tsx
<TYPE.body onClick={onMax} color={theme.text2} fontWeight={500} fontSize={14}
  style={{ display: 'inline', cursor: 'pointer' }}>
  {!hideBalance && !!currency && selectedCurrencyBalance
    ? (customBalanceText ?? t('balanceLabel') + ' ') + safeToSignificant(selectedCurrencyBalance, 7)
    : ' -'}
</TYPE.body>
```
This is inside `RowBetween` which gives `justify-content: space-between`. The label "From"/"To" is on the left, "Balance: 130549.7" is on the right.

**Yield balance rendering** (`StakeForm.tsx:79-81`):
```tsx
<PreviewRow>
  <span>Balance: {formatTokenAmount(xcnBalance)} XCN</span>
</PreviewRow>
```

## Task
Update the `PreviewRow` balance line in StakeForm and UnstakeForm to right-align and match Swap's font:

1. **`src/pages/Yield/StakeForm.tsx`** (line 79-81):
   - Change the balance `<span>` to be right-aligned within `PreviewRow`
   - Use `font-weight: 500` and `font-size: 14px` matching Swap's `TYPE.body`
   - The balance text should appear on the right side of the row

2. **`src/pages/Yield/UnstakeForm.tsx`** (line 76-78):
   - Same changes as StakeForm

3. **`src/pages/Yield/styleds.tsx`** — `PreviewRow` (lines 155-162):
   - Add `justify-content: flex-end` (since there's only one child — the balance)
   - Or restructure to have label on left and balance on right (matching Swap's `RowBetween` pattern)
   - Ensure `font-size: 14px` and `font-weight: 500` match the Swap page

## Blockers
- `task-001-reduce-decimals-formatting-utilities.md` — formatting must be updated first so the balance values are correct

## Acceptance Checklist
- [ ] Balance line on Yield Stake tab is right-aligned
- [ ] Balance line on Yield Unstake tab is right-aligned
- [ ] Font size is 14px, font weight is 500 (matching Swap)
- [ ] Visual appearance matches Swap page's balance row
- [ ] Code follows the project's style
