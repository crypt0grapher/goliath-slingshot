# Liquidity Filtering Settings for Chained/Multi-Hop Swaps

This document describes the filtering parameters used by the arbitrage bot to prevent routing through low-liquidity pairs that could result in poor execution or failed transactions.

## Problem Statement

The WXCN/BTC pair has extremely low liquidity:
- WXCN reserve: 0.008395 WXCN (~$0.00003)
- BTC reserve: 0.0002 BTC (~$17.20)
- Total liquidity: ~$17.20

This creates artificially extreme prices (1 WXCN = $2,049 via BTC vs $0.0036 direct) that cannot actually be executed profitably at any meaningful size.

## Filtering Parameters

### 1. Minimum Pair Liquidity (USD)
```
MIN_LIQUIDITY_USD = 100
```
**Purpose:** Filter out pairs with total USD value below this threshold.

**Calculation:**
```
totalLiquidityUSD = (reserve0 * price0USD) + (reserve1 * price1USD)
if (totalLiquidityUSD < MIN_LIQUIDITY_USD) => exclude pair
```

**Recommendation for Slingshot UI:** Set between $100-$1000 depending on expected trade sizes.

### 2. Maximum Reserve Ratio
```
MAX_RESERVE_RATIO = 0.3 (30%)
```
**Purpose:** Limit trade size to a percentage of the smallest reserve in the path.

**Calculation:**
```
maxTradeSize = minReserveInPath * MAX_RESERVE_RATIO
```

**Impact:** Prevents large slippage from depleting small reserves.

### 3. Minimum Trade Size (USD)
```
MIN_TRADE_SIZE_USD = 10 (or lower for testnet)
```
**Purpose:** Don't route trades below this value through multi-hop paths.

**Note:** For the arbitrage bot, this was set very low (0.000001) because the bot calculates in token units, not USD. For a UI, use actual USD value.

### 4. Maximum Trade Size (USD)
```
MAX_TRADE_SIZE_USD = 10000
```
**Purpose:** Cap maximum trade to prevent excessive slippage on large orders.

## Implementation for Slingshot UI

### Pair Filtering Logic
```typescript
interface PairFilter {
  minLiquidityUsd: number;      // e.g., 100
  minReserve0: bigint;          // Minimum reserve for token0
  minReserve1: bigint;          // Minimum reserve for token1
}

function shouldIncludePair(
  reserve0: bigint,
  reserve1: bigint,
  token0PriceUsd: number,
  token1PriceUsd: number,
  token0Decimals: number,
  token1Decimals: number,
  filter: PairFilter
): boolean {
  // Calculate USD liquidity
  const reserve0Usd = (Number(reserve0) / 10**token0Decimals) * token0PriceUsd;
  const reserve1Usd = (Number(reserve1) / 10**token1Decimals) * token1PriceUsd;
  const totalLiquidityUsd = reserve0Usd + reserve1Usd;

  // Filter by minimum liquidity
  if (totalLiquidityUsd < filter.minLiquidityUsd) {
    return false;
  }

  // Filter by minimum reserves (prevent dust pairs)
  if (reserve0 < filter.minReserve0 || reserve1 < filter.minReserve1) {
    return false;
  }

  return true;
}
```

### Route Filtering Logic
```typescript
interface RouteFilter {
  maxReserveRatio: number;      // e.g., 0.3
  minTradeUsd: number;          // e.g., 10
  maxTradeUsd: number;          // e.g., 10000
}

function getMaxTradeForRoute(
  route: Route,
  reserves: Map<string, ReserveData>,
  filter: RouteFilter
): bigint {
  // Find minimum reserve across all hops
  let minReserve = BigInt(Number.MAX_SAFE_INTEGER);

  for (const hop of route.hops) {
    const pairReserves = reserves.get(hop.pairAddress);
    const reserveIn = hop.direction === 0 ? pairReserves.reserve0 : pairReserves.reserve1;
    if (reserveIn < minReserve) {
      minReserve = reserveIn;
    }
  }

  // Apply reserve ratio limit
  return BigInt(Math.floor(Number(minReserve) * filter.maxReserveRatio));
}
```

### Price Impact Warning
```typescript
function calculatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  // Price before swap
  const priceBefore = Number(reserveOut) / Number(reserveIn);

  // Calculate output
  const amountInWithFee = amountIn * 997n;
  const numerator = reserveOut * amountInWithFee;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;

  // Price after swap
  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;
  const priceAfter = Number(newReserveOut) / Number(newReserveIn);

  // Impact percentage
  return ((priceBefore - priceAfter) / priceBefore) * 100;
}

// Warn user if impact > 5%, block if > 15%
const HIGH_IMPACT_WARNING = 5;
const HIGH_IMPACT_BLOCK = 15;
```

## Recommended Settings by Network Type

### Mainnet (Production)
```
MIN_LIQUIDITY_USD = 1000
MAX_RESERVE_RATIO = 0.2
MIN_TRADE_SIZE_USD = 50
MAX_TRADE_SIZE_USD = 100000
HIGH_IMPACT_WARNING = 3%
HIGH_IMPACT_BLOCK = 10%
```

### Testnet (Goliath)
```
MIN_LIQUIDITY_USD = 100
MAX_RESERVE_RATIO = 0.3
MIN_TRADE_SIZE_USD = 1
MAX_TRADE_SIZE_USD = 10000
HIGH_IMPACT_WARNING = 5%
HIGH_IMPACT_BLOCK = 15%
```

## Current Goliath Testnet Pair Status

| Pair | Token0 Reserve | Token1 Reserve | Est. USD | Status |
|------|----------------|----------------|----------|--------|
| WXCN/USDC | 64.2M WXCN | 233.5K USDC | ~$467K | OK |
| WXCN/BTC | 0.008 WXCN | 0.0002 BTC | ~$17 | **FILTER** |
| BTC/USDC | 622 BTC | 53.5M USDC | ~$107M | OK |
| ETH/USDC | varies | varies | check | OK |
| ETH/WXCN | varies | varies | check | OK |
| ETH/BTC | varies | varies | check | OK |

## UI Recommendations

1. **Hide pairs below MIN_LIQUIDITY_USD** from the routing algorithm
2. **Show warning** when a multi-hop route includes any pair with < $1000 liquidity
3. **Display price impact** prominently for all trades
4. **Disable swap button** if total route price impact > HIGH_IMPACT_BLOCK
5. **Show "Low liquidity route" badge** for routes using smaller pairs

## References

- Arbitrage bot config: `/Users/alex/goliath/arbitrage/k8s/configmap.yaml`
- Profit calculator: `/Users/alex/goliath/arbitrage/src/domain/arbitrage/profit-calculator.ts`
- Opportunity detector: `/Users/alex/goliath/arbitrage/src/domain/arbitrage/opportunity-detector.ts`
