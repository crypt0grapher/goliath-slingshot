# XCN Multi-Step Swap Fix

## Problem Summary

The CoolSwap interface could not perform direct XCN ↔ USDC swaps. Two errors occurred:

1. **XCN → USDC**: `UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT`
2. **USDC → XCN**: `WXCN: non-integer native amount`

## Root Cause

### Goliath Network Decimal Architecture

| Layer | Decimals | Format |
|-------|----------|--------|
| JSON-RPC | 18 | weibar (what frontend sees) |
| EVM/Solidity | 8 | tinyXCN (actual msg.value) |
| SCALE Factor | 10^10 | Conversion between layers |

### The Bug

When the frontend sends a transaction with `value: 1e18` (1 XCN):
- The RPC layer converts this to `1e8` tinyXCN for the EVM
- The original router used `msg.value` directly for calculations
- `getAmountsOut(1e8, path)` treated this as `0.0000000001 WXCN` (since WXCN uses 18 decimals)
- Result: Near-zero output → fails minimum output check

For USDC → XCN swaps:
- WXCN.withdraw() requires amounts divisible by 10^10
- Swap outputs with "dust" (not aligned to SCALE) caused withdrawal failures

## Solution

### 1. Router Contract Fix

Updated `/Users/alex/goliath/wXCN/contracts/uniswap-v2/periphery/UniswapV2Router02_WXCN.sol`:

**ETH Input Functions (XCN → Token):**
- `swapExactETHForTokens`: Scales `msg.value * SCALE` before calculations
- `swapETHForExactTokens`: Converts WXCN amounts to native for comparison
- `swapExactETHForTokensSupportingFeeOnTransferTokens`: Same scaling fix
- `addLiquidityETH`: Scales input for liquidity calculations

**ETH Output Functions (Token → XCN):**
- `swapExactTokensForETH`: Rounds withdrawal to 10^10 multiples
- `swapTokensForExactETH`: Rounds up requested output
- `removeLiquidityETH`: Handles dust as WXCN
- All fee-on-transfer variants

### 2. Frontend Changes

**`src/pages/Swap/index.tsx`:**
- Removed manual XCN swap blocking that forced two-step process
- Removed `isXCNToToken` and `isTokenToXCN` checks
- Removed `handleXCNSwap` callback and related state

**`src/constants/index.ts`:**
- Updated `ROUTER_ADDRESS` to the new fixed router

## Deployed Contracts

| Contract | Address |
|----------|---------|
| UniswapV2Router02_WXCN (NEW) | `0x896565988a9A344E9bF3143901dE0c3C5C20C5d2` |
| WXCN | `0xd319Df5FA3efb42B5fe4c5f873A7049f65428877` |
| UniswapV2Factory | `0x698Ba06870312aEd129fC2e48dc3d002d981aB8E` |
| USDC | `0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E` |

## How It Works Now

### XCN → USDC Swap Flow
1. User enters amount (e.g., 1 XCN)
2. Frontend sends transaction with `value: 1e18` wei
3. RPC converts to `msg.value = 1e8` tinyXCN in EVM
4. Router calculates: `wxcnAmount = msg.value * SCALE = 1e18`
5. Correct pool calculation with 18-decimal WXCN amount
6. USDC transferred to user

### USDC → XCN Swap Flow
1. User enters USDC amount
2. Router swaps USDC → WXCN
3. Router rounds WXCN to nearest 10^10 for withdrawal
4. Native XCN sent to user
5. Any dust (< 10^10) returned as WXCN tokens

## Verification

```bash
# Router verified at:
https://testnet.explorer.goliath.net/address/0x896565988a9A344E9bF3143901dE0c3C5C20C5d2#code
```

## Files Modified

1. `src/constants/index.ts` - Router address update
2. `src/pages/Swap/index.tsx` - Removed manual XCN swap blocking
3. `/Users/alex/goliath/wXCN/contracts/uniswap-v2/periphery/UniswapV2Router02_WXCN.sol` - Decimal scaling fixes

## Additional Fix: safeTransferETH Amount Bug (2025-11-27)

### Problem
USDC → XCN swaps failed with error: `TransferHelper::safeTransferETH: ETH transfer failed`

### Root Cause
After calling `WXCN.withdraw(roundedAmount)`, the router tried to send `roundedAmount` (18 decimals WXCN units) via `safeTransferETH`, but:
- `WXCN.withdraw()` converts WXCN (18 dec) to tinyXCN (8 dec) internally
- Router only receives `roundedAmount / SCALE` native tinyXCN
- `safeTransferETH(to, roundedAmount)` tried to send 10^10x more than available

### Fix
All `safeTransferETH` calls after `WXCN.withdraw()` now divide by SCALE:

```solidity
// Before (BUG):
IWETH(WETH).withdraw(roundedAmount);
TransferHelper.safeTransferETH(to, roundedAmount);

// After (FIXED):
IWETH(WETH).withdraw(roundedAmount);
TransferHelper.safeTransferETH(to, roundedAmount / SCALE);
```

### Functions Fixed
1. `swapExactTokensForETH` - line 399
2. `swapTokensForExactETH` - line 369
3. `removeLiquidityETH` - line 179
4. `removeLiquidityETHSupportingFeeOnTransferTokens` - line 246
5. `swapExactTokensForETHSupportingFeeOnTransferTokens` - line 543

### Note
Refund logic in `addLiquidityETH` and `swapETHForExactTokens` was already correct (both operands in tinyXCN).

## Date

2024-11-27 (initial fix)
2025-11-27 (safeTransferETH fix)
