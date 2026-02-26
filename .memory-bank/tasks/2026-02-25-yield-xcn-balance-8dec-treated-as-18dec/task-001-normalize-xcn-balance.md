# Normalize native XCN balance from 8-dec to 18-dec in Yield page

## Context
On Goliath chain (ID 8901), native XCN uses 8 decimals (tinyXCN) at the EVM level. The `useCurrencyBalance(account, ETHER)` hook returns this 8-decimal raw value via the multicall's `getEthBalance()` (which calls `address.balance` in Solidity). The Yield page currently passes this 8-decimal value directly to `StakeForm`, which treats it as 18-decimal. This causes:

1. Balance display shows 10^10x too small ("0.0000" instead of "1,000.0000")
2. Balance comparison blocks normal staking amounts (compares 18-dec input with 8-dec balance)
3. Max button always produces "0" (subtracts 18-dec gas reserve from 8-dec balance)

The utility `normalizeNativeBalanceToWad()` already exists in `src/constants/staking.ts` but is unused in the display path.

## Task
In `src/pages/Yield/index.tsx`, normalize the `xcnBalance` variable from 8-decimal tinyXCN to 18-decimal WAD using the existing `normalizeNativeBalanceToWad()` function before passing it to `StakeForm`.

**Current code (lines 57-58):**
```typescript
const xcnCurrencyBalance = useCurrencyBalance(account ?? undefined, ETHER);
const xcnBalance = xcnCurrencyBalance ? xcnCurrencyBalance.raw.toString() : null;
```

**Target code:**
```typescript
const xcnCurrencyBalance = useCurrencyBalance(account ?? undefined, ETHER);
const xcnBalance = xcnCurrencyBalance
  ? normalizeNativeBalanceToWad(BigNumber.from(xcnCurrencyBalance.raw.toString()), chainId).toString()
  : null;
```

This requires importing `normalizeNativeBalanceToWad` from `../../constants/staking` and `BigNumber` from `@ethersproject/bignumber`.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] `xcnBalance` is normalized to 18-dec WAD for chain 8901
- [ ] Balance display in StakeForm shows correct human-readable XCN amount
- [ ] Staking 1 XCN works when actual balance >= 1 XCN (no false "Insufficient" error)
- [ ] Max button fills a correct amount (balance minus gas reserve, both in 18-dec)
- [ ] `npm run build` succeeds
- [ ] Existing tests pass
- [ ] Code follows the project's style
