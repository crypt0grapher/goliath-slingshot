# Verify and fix MIN_GAS_RESERVE scale in StakeForm

## Context
`StakeForm.tsx` defines `MIN_GAS_RESERVE = parseUnits('0.01', 18)` = 10^16. After task-001 normalizes `xcnBalance` to 18-dec, the subtraction `bal.sub(MIN_GAS_RESERVE)` becomes: 18-dec minus 18-dec, which is correct.

However, the actual gas cost on Goliath is paid in 8-decimal tinyXCN. The staking transaction sends `value = amountWad / NATIVE_SCALE` (8-dec). The gas reserve of 0.01 XCN (= 10^16 in 18-dec) should be appropriate, but needs verification.

## Task
After task-001 is applied, verify that:

1. `MIN_GAS_RESERVE` = `parseUnits('0.01', 18)` is appropriate for Goliath gas costs
2. The Max button correctly computes: `normalizedBalance (18-dec) - MIN_GAS_RESERVE (18-dec)` → positive for reasonable balances
3. The resulting max value, when divided by `NATIVE_SCALE` for the stake tx, doesn't leave the user unable to pay gas

No code change may be needed — this is a verification task. Only change `MIN_GAS_RESERVE` if the value is inappropriate.

## Blockers
- `task-001-normalize-xcn-balance.md` — balance must be 18-dec first for the subtraction to be meaningful

## Acceptance Checklist
- [ ] Max button produces a reasonable amount for a user with 100 XCN
- [ ] Max button produces "0" only when balance is genuinely too low for gas
- [ ] The gas reserve is sufficient for a typical stake transaction on Goliath
- [ ] Tests verify Max button behavior with normalized balance
- [ ] Code follows the project's style
