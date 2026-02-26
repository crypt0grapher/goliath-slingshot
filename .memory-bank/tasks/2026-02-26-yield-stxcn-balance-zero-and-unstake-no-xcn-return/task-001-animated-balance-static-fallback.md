# Fix AnimatedBalance to Show Static Balance When Animation Params Are Missing

## Context
What you need to know to complete this task:
- The Yield tab's main balance display (`AnimatedBalance`) shows "0.000000 stXCN" even when the user HAS a stXCN balance
- The UnstakeForm correctly shows the balance (e.g., "Balance: 150.0037 stXCN") because it only uses `userBalance` from Redux
- Both components read from the same Redux selector (`selectUserBalance`)
- The difference: `AnimatedBalance` passes the balance through `useAnimatedBalance(balance, rewardRateRay, feePercentBps)`, which at line 20 checks ALL three params and shows "0.000000" if ANY is missing
- The protocol data (`rewardRateRay`, `feePercentBps`) may be null when `fetchProtocolData()` fails, but the balance is valid
- File: `src/hooks/yield/useAnimatedBalance.ts`

## Task
Modify `useAnimatedBalance` to display the user's balance as a **static formatted number** when animation parameters (`rewardRateRay` or `feePercentBps`) are not available, instead of showing "0.000000".

The key change is at line 20:
```typescript
// BEFORE (buggy):
if (!balance || balance === '0' || !rewardRateRay || feePercentBps === null) {
    setDisplayValue('0.000000');
    setIsAnimating(false);
    return;
}

// AFTER (fixed):
if (!balance || balance === '0') {
    setDisplayValue('0.000000');
    setIsAnimating(false);
    return;
}

// Show static balance if animation params are missing
if (!rewardRateRay || feePercentBps === null) {
    const balanceFloat = parseFloat(formatUnits(balance, 18));
    setDisplayValue(balanceFloat > 0 ? formatStaticBalance(balanceFloat) : '0.000000');
    setIsAnimating(false);
    return;
}
```

The static balance formatting should match the animated format (locale-formatted integer part + decimal places).

## Blockers
No blockers — this task can be started immediately.

## Acceptance Checklist
- [ ] When `balance` is a valid non-zero string but `rewardRateRay` is null, `useAnimatedBalance` returns the formatted balance (not "0.000000")
- [ ] When `balance` is a valid non-zero string but `feePercentBps` is null, same as above
- [ ] When `balance` is null or "0", "0.000000" is still displayed (existing behavior preserved)
- [ ] When all three params are available, animation works as before (existing behavior preserved)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
