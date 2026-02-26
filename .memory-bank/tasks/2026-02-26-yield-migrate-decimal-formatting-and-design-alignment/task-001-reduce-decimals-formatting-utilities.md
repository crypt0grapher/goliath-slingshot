# Reduce XCN Decimal Places in All Formatting Utilities

## Context
XCN is a low-value token (~$0.0054 USD), so displaying 4-6 decimal places adds visual noise. The Swap page naturally shows ~1 decimal for large balances via `safeToSignificant(balance, 7)`. The Yield and Migrate pages use independent formatters that show 4-6 decimals with comma separators. All should be reduced to 1 decimal, no commas, to match Swap.

## Task
Update all XCN/stXCN formatting functions and constants to use 1 decimal place and no comma separators:

1. **`src/constants/staking.ts`** — Change `ANIMATION_DECIMAL_PLACES` from `6` to `1`

2. **`src/pages/Yield/styleds.tsx`** — In `formatTokenAmount()` (line 264):
   - Change default `decimals` parameter from `4` to `1`
   - Change default `addCommas` parameter from `true` to `false`

3. **`src/hooks/yield/useAnimatedBalance.ts`** — In `formatStatic()` (line 5-9) and the RAF loop (line 62-69):
   - Replace `Number(intPart).toLocaleString('en-US')` with plain `intPart` (no commas)

4. **`src/pages/Yield/ProtocolStats.tsx`**:
   - Line 25: Change rewards from `formatTokenAmount(rewards.toString(), 4)` to `formatTokenAmount(rewards.toString(), 1, false)`
   - Line 26: Same for the `+ ' stXCN'` line
   - Line 44: Change total staked from `formatTokenAmount(totalSupply, 2)` to `formatTokenAmount(totalSupply, 1, false)`

5. **`src/pages/Yield/TransactionHistory.tsx`**:
   - Line 61: Change `formatTokenAmount(event.xcnAmount, 4)` to `formatTokenAmount(event.xcnAmount, 1, false)`

6. **`src/pages/Yield/StakeForm.tsx`**:
   - Line 80: Change `formatTokenAmount(xcnBalance)` to `formatTokenAmount(xcnBalance, 1, false)`
   - Line 84: Change `formatTokenAmount(preview.toString(), 8)` to `formatTokenAmount(preview.toString(), 1, false)`

7. **`src/pages/Yield/UnstakeForm.tsx`**:
   - Line 77: Change `formatTokenAmount(stXCNBalance)` to `formatTokenAmount(stXCNBalance, 1, false)`
   - Line 81: Change `formatTokenAmount(parsedAmount.toString(), 4)` to `formatTokenAmount(parsedAmount.toString(), 1, false)`

## Blockers
No blockers

## Acceptance Checklist
- [ ] `ANIMATION_DECIMAL_PLACES` is `1`
- [ ] `formatTokenAmount` default is 1 decimal, no commas
- [ ] Animated balance displays 1 decimal, no commas
- [ ] All Yield page components pass `decimals=1, addCommas=false`
- [ ] Existing tests still pass after changes
- [ ] Build succeeds
