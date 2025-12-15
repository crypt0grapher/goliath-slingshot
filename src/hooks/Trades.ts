import { isTradeBetter } from 'utils/trades';
import { Currency, CurrencyAmount, JSBI, Pair, Token, Trade } from '@uniswap/sdk';
import flatMap from 'lodash.flatmap';
import { useMemo } from 'react';

import {
  BASES_TO_CHECK_TRADES_AGAINST,
  CUSTOM_BASES,
  BETTER_TRADE_LESS_HOPS_THRESHOLD,
  MIN_RESERVE_TOKENS,
  MAX_PRICE_IMPACT_FOR_ROUTE,
} from '../constants';
import { PairState, usePairs } from '../data/Reserves';
import { wrappedCurrency } from '../utils/wrappedCurrency';

import { useActiveWeb3React } from './index';
import { useUserSingleHopOnly } from 'state/user/hooks';

/**
 * Check if a pair has sufficient liquidity to be included in routing.
 * Uses decimal-adjusted minimum reserve threshold to handle tokens with different decimals.
 *
 * Example: MIN_RESERVE_TOKENS = 0.001
 * - For 18-decimal token (like WXCN): min = 0.001 * 10^18 = 1e15 raw
 * - For 8-decimal token (like BTC): min = 0.001 * 10^8 = 1e5 raw
 *
 * The WXCN/BTC pair with 0.0002 BTC (2e4 raw) would be filtered because 2e4 < 1e5
 */
function hasSufficientLiquidity(pair: Pair): boolean {
  const token0 = pair.token0;
  const token1 = pair.token1;

  // Calculate minimum reserve in raw units based on each token's decimals
  const minReserve0Raw = JSBI.BigInt(Math.floor(MIN_RESERVE_TOKENS * Math.pow(10, token0.decimals)));
  const minReserve1Raw = JSBI.BigInt(Math.floor(MIN_RESERVE_TOKENS * Math.pow(10, token1.decimals)));

  // Both reserves must exceed their respective minimums
  const hasEnoughReserve0 = JSBI.greaterThanOrEqual(pair.reserve0.raw, minReserve0Raw);
  const hasEnoughReserve1 = JSBI.greaterThanOrEqual(pair.reserve1.raw, minReserve1Raw);

  return hasEnoughReserve0 && hasEnoughReserve1;
}

/**
 * Check if a trade's price impact is within acceptable bounds.
 * Returns true if the trade should be used, false if it should be filtered out.
 */
function hasAcceptablePriceImpact(trade: Trade | null): boolean {
  if (!trade) return false;
  // Filter out trades where price impact exceeds the maximum allowed for routing
  // This prevents offering routes that would have unacceptable slippage
  return trade.priceImpact.lessThan(MAX_PRICE_IMPACT_FOR_ROUTE);
}

function useAllCommonPairs(currencyA?: Currency, currencyB?: Currency): Pair[] {
  const { chainId } = useActiveWeb3React();

  const bases: Token[] = chainId ? BASES_TO_CHECK_TRADES_AGAINST[chainId] : [];

  const [tokenA, tokenB] = chainId
    ? [wrappedCurrency(currencyA, chainId), wrappedCurrency(currencyB, chainId)]
    : [undefined, undefined];

  const basePairs: [Token, Token][] = useMemo(
    () =>
      flatMap(bases, (base): [Token, Token][] => bases.map((otherBase) => [base, otherBase])).filter(
        ([t0, t1]) => t0.address !== t1.address
      ),
    [bases]
  );

  const allPairCombinations: [Token, Token][] = useMemo(
    () =>
      tokenA && tokenB
        ? [
            // the direct pair
            [tokenA, tokenB],
            // token A against all bases
            ...bases.map((base): [Token, Token] => [tokenA, base]),
            // token B against all bases
            ...bases.map((base): [Token, Token] => [tokenB, base]),
            // each base against all bases
            ...basePairs,
          ]
            .filter((tokens): tokens is [Token, Token] => Boolean(tokens[0] && tokens[1]))
            .filter(([t0, t1]) => t0.address !== t1.address)
            .filter(([tokenA, tokenB]) => {
              if (!chainId) return true;
              const customBases = CUSTOM_BASES[chainId];
              if (!customBases) return true;

              const customBasesA: Token[] | undefined = customBases[tokenA.address];
              const customBasesB: Token[] | undefined = customBases[tokenB.address];

              if (!customBasesA && !customBasesB) return true;

              if (customBasesA && !customBasesA.find((base) => tokenB.equals(base))) return false;
              if (customBasesB && !customBasesB.find((base) => tokenA.equals(base))) return false;

              return true;
            })
        : [],
    [tokenA, tokenB, bases, basePairs, chainId]
  );

  const allPairs = usePairs(allPairCombinations);

  // only pass along valid pairs, non-duplicated pairs, with sufficient liquidity
  return useMemo(
    () =>
      Object.values(
        allPairs
          // filter out invalid pairs
          .filter((result): result is [PairState.EXISTS, Pair] => Boolean(result[0] === PairState.EXISTS && result[1]))
          // filter out pairs with insufficient liquidity (prevents routing through dust pairs)
          .filter(([, pair]) => hasSufficientLiquidity(pair))
          // filter out duplicated pairs
          .reduce<{ [pairAddress: string]: Pair }>((memo, [, curr]) => {
            memo[curr.liquidityToken.address] = memo[curr.liquidityToken.address] ?? curr;
            return memo;
          }, {})
      ),
    [allPairs]
  );
}

const MAX_HOPS = 3;

/**
 * Returns the best trade for the exact amount of tokens in to the given token out.
 * Filters out trades with excessive price impact to prevent routing through low-liquidity pairs.
 */
export function useTradeExactIn(currencyAmountIn?: CurrencyAmount, currencyOut?: Currency): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyAmountIn?.currency, currencyOut);

  const [singleHopOnly] = useUserSingleHopOnly();

  return useMemo(() => {
    if (currencyAmountIn && currencyOut && allowedPairs.length > 0) {
      if (singleHopOnly) {
        const trade = Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: 1, maxNumResults: 1 })[0] ?? null;
        // Filter out trades with unacceptable price impact
        return hasAcceptablePriceImpact(trade) ? trade : null;
      }
      // search through trades with varying hops, find best trade out of them
      let bestTradeSoFar: Trade | null = null;
      for (let i = 1; i <= MAX_HOPS; i++) {
        const currentTrade: Trade | null =
          Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: i, maxNumResults: 1 })[0] ??
          null;
        // Only consider trades with acceptable price impact
        if (hasAcceptablePriceImpact(currentTrade) && isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD)) {
          bestTradeSoFar = currentTrade;
        }
      }
      return bestTradeSoFar;
    }

    return null;
  }, [allowedPairs, currencyAmountIn, currencyOut, singleHopOnly]);
}

/**
 * Returns the best trade for the token in to the exact amount of token out.
 * Filters out trades with excessive price impact to prevent routing through low-liquidity pairs.
 */
export function useTradeExactOut(currencyIn?: Currency, currencyAmountOut?: CurrencyAmount): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyIn, currencyAmountOut?.currency);

  const [singleHopOnly] = useUserSingleHopOnly();

  return useMemo(() => {
    if (currencyIn && currencyAmountOut && allowedPairs.length > 0) {
      if (singleHopOnly) {
        const trade = Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: 1, maxNumResults: 1 })[0] ?? null;
        // Filter out trades with unacceptable price impact
        return hasAcceptablePriceImpact(trade) ? trade : null;
      }
      // search through trades with varying hops, find best trade out of them
      let bestTradeSoFar: Trade | null = null;
      for (let i = 1; i <= MAX_HOPS; i++) {
        const currentTrade =
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: i, maxNumResults: 1 })[0] ??
          null;
        // Only consider trades with acceptable price impact
        if (hasAcceptablePriceImpact(currentTrade) && isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD)) {
          bestTradeSoFar = currentTrade;
        }
      }
      return bestTradeSoFar;
    }
    return null;
  }, [currencyIn, currencyAmountOut, allowedPairs, singleHopOnly]);
}
