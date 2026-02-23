# ISSUE-001: addLiquidityETH Reverts with INSUFFICIENT_B_AMOUNT

**Status**: Open
**Priority**: High
**Component**: AddLiquidity / Router Integration
**Affected Pairs**: BTC-WXCN (and potentially other low-decimal token pairs)
**Date Reported**: 2026-01-03

---

## Executive Summary

Users attempting to add liquidity with XCN (native) and BTC experience transaction reverts with `INSUFFICIENT_B_AMOUNT` error. The root cause is a **slippage tolerance failure** caused by the user's input ratio deviating from the pool's actual ratio by more than the allowed slippage percentage.

---

## Failed Transaction Details

| Field | Value |
|-------|-------|
| **TX Hash** | `0x32c30021188db5cbb752c261f4379b593a539ba70ac7e9d64747de8e5baa3789` |
| **Router** | `0xC47483b7eE4728c7006001f372bFbd8519210654` |
| **Pair** | BTC-WXCN at `0xd14d29eb6c3b58a9a04b7e15daf35ed75651a2e4` |
| **User** | `0xE598654Ea5618b544F1ceCd9e2d498951Ec3293A` |
| **Block** | 1855635 |
| **Gas Used** | 352,000 (100% of limit) |
| **Status** | FAILED (Reverted) |

### Decoded Transaction Input

```
Method: addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline)

Parameters:
  token:              0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E (BTC)
  amountTokenDesired: 258 (0.00000258 BTC)
  amountTokenMin:     256 (0.00000256 BTC)
  amountETHMin:       49750000000000000000 (49.75 XCN in 18-dec WXCN format)
  to:                 0xE598654Ea5618b544F1ceCd9e2d498951Ec3293A
  deadline:           1767386455 (2026-01-02T20:40:55.000Z)

msg.value: 50 XCN (native, 8-dec format)
```

---

## Pool State at Time of Failure

| Asset | Reserve (raw) | Human-readable |
|-------|---------------|----------------|
| WXCN | 706,599,133,884,491,752,244,888 | 706,599.13 XCN |
| BTC | 3,872,438 | 0.03872438 BTC |

**Pool Price**: 1 BTC = 18,246,880.49 XCN

---

## Root Cause Analysis

### Step-by-Step Router Execution Trace

The router's `addLiquidityETH` function processes as follows:

```solidity
// 1. Scale native XCN to WXCN format
uint256 wxcnDesired = msg.value * SCALE;  // 50e8 * 1e10 = 50e18

// 2. Call _addLiquidity
(amountToken, amountETH) = _addLiquidity(
    BTC,                    // token
    WXCN,                   // WETH
    258,                    // amountTokenDesired (BTC)
    50e18,                  // wxcnDesired (scaled from msg.value)
    256,                    // amountTokenMin
    49.75e18                // amountETHMin
);
```

### Inside `_addLiquidity`:

```solidity
// Step 1: Calculate optimal WXCN for 258 satoshi BTC
amountBOptimal = quote(258, reserveBTC, reserveWXCN)
               = 258 × 706,599,133,884,491,752,244,888 / 3,872,438
               = 47,076,951,662,544,080,003
               = 47.08 XCN

// Step 2: Check if amountBOptimal <= amountBDesired
47.08e18 <= 50e18  ✓ TRUE

// Step 3: SLIPPAGE CHECK (THIS FAILS!)
require(amountBOptimal >= amountBMin)
require(47.08e18 >= 49.75e18)  ✗ FALSE → REVERT
```

**Revert Location**: `UniswapV2Router02_WXCN.sol:63`
```solidity
require(amountBOptimal >= amountBMin, 'UniswapV2Router: INSUFFICIENT_B_AMOUNT');
```

### Price Deviation Analysis

| Metric | Value |
|--------|-------|
| Pool Price | 1 BTC = 18,246,880 XCN |
| User's Implied Price | 1 BTC = 19,379,845 XCN (50 XCN / 258 sat) |
| **Price Deviation** | **6.21%** |
| User's Slippage Tolerance | 0.50% (amountETHMin = 49.75 XCN) |
| **Required Tolerance** | **> 6.21%** |

The user's input ratio is 6.21% off from the pool's actual ratio, but they only allowed 0.5% slippage.

---

## Why the Ratio Mismatch Occurred

### Investigation Findings

1. **SDK Calculation is Correct**: The Uniswap SDK correctly calculates 274 satoshi for 50 XCN using JSBI BigInt math with full precision.

2. **Display Precision is Adequate**: `toSignificant(7)` correctly displays `0.00000274` for 274 satoshi.

3. **Possible Causes of 258 vs 274 Mismatch**:

   a. **User Manual Override**: If the user clicked into the BTC input field and typed a value, it becomes the "independent" field and overwrites the auto-calculated amount.

   b. **Stale Quote**: Pool state changed between when the UI displayed the quote and when the transaction was submitted.

   c. **Frontend Display Issue**: Although SDK calculation is correct, the displayed value may have been entered/copied incorrectly.

---

## Goliath Chain Decimal Architecture Reference

Understanding the decimal handling is critical for this codebase:

| Asset | Decimals | Context |
|-------|----------|---------|
| Native XCN | 8 | EVM msg.value, RPC balance queries (tinyXCN) |
| WXCN ERC20 | 18 | Pools, internal router calculations |
| BTC ERC20 | 8 | Token amounts |
| SCALE | 10^10 | Conversion factor (18 - 8 = 10) |

### Router Decimal Handling (Correct)

```solidity
// addLiquidityETH receives msg.value in 8 decimals (tinyXCN)
// Scales UP to 18 decimals for pool calculations
uint256 wxcnDesired = msg.value * SCALE;

// amountETHMin must be provided in 18-decimal WXCN format
// This is correctly done by the frontend
```

---

## Recommended Fixes

### 1. Increase Display Precision

Even though the SDK handles precision correctly, increase display digits for better user clarity and to prevent copy/paste errors.

#### File: `src/pages/AddLiquidity/index.tsx`

**Line 124** - Dependent field display:
```typescript
// BEFORE:
[dependentField]: noLiquidity ? otherTypedValue : parsedAmounts[dependentField]?.toSignificant(7) ?? '',

// AFTER:
[dependentField]: noLiquidity ? otherTypedValue : parsedAmounts[dependentField]?.toSignificant(10) ?? '',
```

**Line 262** - Transaction summary:
```typescript
// BEFORE:
summary: `Add ${parsedAmountA.toSignificant(3)} ${symbolA} and ${parsedAmountB.toSignificant(3)} ${symbolB}`,

// AFTER:
summary: `Add ${parsedAmountA.toSignificant(6)} ${symbolA} and ${parsedAmountB.toSignificant(6)} ${symbolB}`,
```

#### File: `src/pages/AddLiquidity/ConfirmAddModalBottom.tsx`

**Lines 49 and 56** - Confirmation modal amounts:
```typescript
// BEFORE:
<TYPE.body>{parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)}</TYPE.body>
<TYPE.body>{parsedAmounts[Field.CURRENCY_B]?.toSignificant(6)}</TYPE.body>

// AFTER:
<TYPE.body>{parsedAmounts[Field.CURRENCY_A]?.toSignificant(10)}</TYPE.body>
<TYPE.body>{parsedAmounts[Field.CURRENCY_B]?.toSignificant(10)}</TYPE.body>
```

#### File: `src/pages/AddLiquidity/PoolPriceBar.tsx`

**Lines 45 and 51** - Pool price display:
```typescript
// BEFORE:
<TYPE.black>{price?.toSignificant(6) ?? '-'}</TYPE.black>
<TYPE.black>{price?.invert()?.toSignificant(6) ?? '-'}</TYPE.black>

// AFTER:
<TYPE.black>{price?.toSignificant(10) ?? '-'}</TYPE.black>
<TYPE.black>{price?.invert()?.toSignificant(10) ?? '-'}</TYPE.black>
```

---

### 2. Add Ratio Deviation Warning

Add a warning when the user's input ratio deviates significantly from the pool's current ratio.

#### File: `src/state/mint/hooks.ts`

Add new return value for ratio deviation:

```typescript
// Add to useDerivedMintInfo return type and calculation:

// Calculate ratio deviation percentage
const ratioDeviation = useMemo(() => {
  if (noLiquidity || !pair || !parsedAmounts[Field.CURRENCY_A] || !parsedAmounts[Field.CURRENCY_B]) {
    return undefined;
  }

  try {
    const userRatio = JSBI.divide(
      parsedAmounts[Field.CURRENCY_A].raw,
      parsedAmounts[Field.CURRENCY_B].raw
    );

    const poolRatio = JSBI.divide(
      pair.reserve0.raw,
      pair.reserve1.raw
    );

    // Calculate percentage deviation
    const deviation = Math.abs(
      (Number(userRatio) - Number(poolRatio)) / Number(poolRatio)
    ) * 100;

    return deviation;
  } catch {
    return undefined;
  }
}, [noLiquidity, pair, parsedAmounts]);

// Add to return object:
return {
  // ... existing returns
  ratioDeviation,
};
```

#### File: `src/pages/AddLiquidity/index.tsx`

Display warning when deviation exceeds slippage:

```typescript
// Add to destructured values from useDerivedMintInfo:
const { /* existing */, ratioDeviation } = useDerivedMintInfo(...);

// Add warning display (after PoolPriceBar, before buttons):
{ratioDeviation !== undefined && ratioDeviation > (allowedSlippage / 100) && (
  <ErrorCard>
    <ErrorText>
      <AlertTriangle size={16} />
      {t('ratioDeviationWarning', {
        deviation: ratioDeviation.toFixed(2),
        slippage: (allowedSlippage / 100).toFixed(2)
      })}
    </ErrorText>
  </ErrorCard>
)}
```

Add translation key:
```json
"ratioDeviationWarning": "Your input ratio deviates {{deviation}}% from the pool. Your slippage tolerance is {{slippage}}%. Transaction may fail."
```

---

### 3. Refresh Reserves Before Transaction

Re-fetch pool reserves immediately before constructing the transaction to minimize stale data issues.

#### File: `src/pages/AddLiquidity/index.tsx`

In the `onAdd` function, add reserve refresh:

```typescript
async function onAdd() {
  if (!chainId || !library || !account) return;

  // Clear any previous error
  setTxError(null);

  // TODO: Consider adding a reserve refresh mechanism here
  // This would involve calling the pair contract directly to get
  // latest reserves before constructing the transaction

  const router = getRouterContract(chainId, library, account);
  // ... rest of function
}
```

**Note**: Full implementation requires adding a `useRefreshPairReserves` hook that invalidates the multicall cache and refetches reserves.

---

### 4. Consider Dynamic Slippage Based on Token Decimals

For tokens with fewer decimals (like BTC with 8), small amounts can have higher relative precision impact.

#### File: `src/state/user/hooks.tsx`

Add helper function:

```typescript
export function useRecommendedSlippage(
  currencyA: Currency | undefined,
  currencyB: Currency | undefined
): number {
  return useMemo(() => {
    const decimalsA = currencyA?.decimals ?? 18;
    const decimalsB = currencyB?.decimals ?? 18;
    const minDecimals = Math.min(decimalsA, decimalsB);

    // For low-decimal tokens, recommend higher slippage
    if (minDecimals <= 8) {
      return 100; // 1%
    }
    return 50; // 0.5% default
  }, [currencyA, currencyB]);
}
```

---

## Testing Checklist

After implementing fixes, verify:

- [ ] Adding liquidity with XCN-BTC pair works with correct amounts
- [ ] Display shows full precision for small BTC amounts (e.g., 0.00000274)
- [ ] Ratio deviation warning appears when user input deviates > slippage %
- [ ] Transaction summary shows adequate precision
- [ ] Confirmation modal shows full precision
- [ ] Pool price bar shows adequate precision
- [ ] Swap functionality still works correctly (regression test)
- [ ] XCN-USDC pair still works (regression test)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/AddLiquidity/index.tsx` | Increase toSignificant, add ratio warning |
| `src/pages/AddLiquidity/ConfirmAddModalBottom.tsx` | Increase toSignificant |
| `src/pages/AddLiquidity/PoolPriceBar.tsx` | Increase toSignificant |
| `src/state/mint/hooks.ts` | Add ratioDeviation calculation |
| `src/locales/en.json` | Add warning translation |
| `src/locales/*.json` | Add warning translation for all locales |

---

## Related Documentation

- Router Contract: `/Users/alex/goliath/wXCN/contracts/uniswap-v2/periphery/UniswapV2Router02_WXCN.sol`
- WXCN Contract: `/Users/alex/goliath/wXCN/contracts/WXCN.sol`
- Native Units Library: `/Users/alex/goliath/wXCN/contracts/NativeUnits.sol`
- Deployment Config: `/Users/alex/goliath/wXCN/deployments/testnet-uniswap-v2.json`

---

## Appendix: Contract Addresses (Testnet)

| Contract | Address |
|----------|---------|
| WXCN | `0xec6Cd1441201e36F7289f0B2729a97d091AcB5b7` |
| BTC | `0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E` |
| UniswapV2Factory | `0x698Ba06870312aEd129fC2e48dc3d002d981aB8E` |
| UniswapV2Router02 | `0xC47483b7eE4728c7006001f372bFbd8519210654` |
| BTC-WXCN Pair | `0xd14d29eb6c3b58a9a04b7e15daf35ed75651a2e4` |
