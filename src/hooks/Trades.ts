import { isTradeBetter } from 'utils/trades';
import { Currency, CurrencyAmount, Pair, Token, Trade } from '@uniswap/sdk';
import flatMap from 'lodash.flatmap';
import { useMemo } from 'react';

import { BASES_TO_CHECK_TRADES_AGAINST, CUSTOM_BASES, BETTER_TRADE_LESS_HOPS_THRESHOLD } from '../constants';
import { PairState, usePairs } from '../data/Reserves';
import { wrappedCurrency } from '../utils/wrappedCurrency';

import { useActiveWeb3React } from './index';
import { useUserSingleHopOnly } from 'state/user/hooks';

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

  // only pass along valid pairs, non-duplicated pairs
  return useMemo(
    () =>
      Object.values(
        allPairs
          // filter out invalid pairs
          .filter((result): result is [PairState.EXISTS, Pair] => Boolean(result[0] === PairState.EXISTS && result[1]))
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
 * Returns the best trade for the exact amount of tokens in to the given token out
 */
export function useTradeExactIn(currencyAmountIn?: CurrencyAmount, currencyOut?: Currency): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyAmountIn?.currency, currencyOut);

  const [singleHopOnly] = useUserSingleHopOnly();

  return useMemo(() => {
    if (currencyAmountIn && currencyOut && allowedPairs.length > 0) {
      // Find the direct pair if it exists
      const directPair = allowedPairs.find(p => {
        const tokens = [p.token0.symbol, p.token1.symbol];
        return tokens.includes(currencyAmountIn.currency.symbol || '') &&
               tokens.includes(currencyOut.symbol || '');
      });

      console.log('DEBUG: Computing trade exactIn', {
        inputCurrency: currencyAmountIn.currency.symbol,
        inputDecimals: currencyAmountIn.currency.decimals,
        inputAmount: currencyAmountIn.toExact(),
        inputAmountRaw: currencyAmountIn.raw.toString(),
        outputCurrency: currencyOut.symbol,
        outputDecimals: currencyOut.decimals,
        pairsCount: allowedPairs.length,
        pairs: allowedPairs.map(p => `${p.token0.symbol}/${p.token1.symbol}`),
        directPairExists: !!directPair,
        directPairDetails: directPair ? {
          token0: directPair.token0.symbol,
          token1: directPair.token1.symbol,
          reserve0: directPair.reserve0.toExact(),
          reserve1: directPair.reserve1.toExact(),
          pairAddress: directPair.liquidityToken.address
        } : null
      });

      if (singleHopOnly) {
        const trades = Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: 1, maxNumResults: 1 });
        const trade = trades[0] ?? null;
        if (trade) {
          console.log('DEBUG: Trade found (single hop)', {
            inputAmount: trade.inputAmount.toExact(),
            outputAmount: trade.outputAmount.toExact(),
            inputAmountRaw: trade.inputAmount.raw.toString(),
            outputAmountRaw: trade.outputAmount.raw.toString(),
            executionPrice: trade.executionPrice.toSignificant(6),
            priceImpact: trade.priceImpact.toSignificant(2),
            route: trade.route.path.map(t => t.symbol).join(' -> ')
          });
        }
        return trade;
      }
      // search through trades with varying hops, find best trade out of them
      let bestTradeSoFar: Trade | null = null;
      for (let i = 1; i <= MAX_HOPS; i++) {
        const currentTrade: Trade | null =
          Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: i, maxNumResults: 1 })[0] ??
          null;

        // Debug logging for each hop level
        console.log(`DEBUG: Hop ${i} trade:`, currentTrade ? {
          hops: currentTrade.route.path.length - 1,
          route: currentTrade.route.path.map(t => t.symbol).join(' -> '),
          outputAmount: currentTrade.outputAmount.toExact(),
          executionPrice: currentTrade.executionPrice.toSignificant(8),
          priceImpact: currentTrade.priceImpact.toSignificant(4) + '%'
        } : 'NO TRADE FOUND');

        // Compare with best trade so far
        const isBetter = isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD);
        console.log(`DEBUG: Is hop ${i} trade better than current best?`, {
          isBetter,
          threshold: BETTER_TRADE_LESS_HOPS_THRESHOLD.toSignificant(4) + '%',
          bestSoFar: bestTradeSoFar ? {
            hops: bestTradeSoFar.route.path.length - 1,
            route: bestTradeSoFar.route.path.map(t => t.symbol).join(' -> '),
            outputAmount: bestTradeSoFar.outputAmount.toExact(),
            executionPrice: bestTradeSoFar.executionPrice.toSignificant(8)
          } : 'NONE'
        });

        // if current trade is best yet, save it
        if (isBetter) {
          bestTradeSoFar = currentTrade;
        }
      }

      if (bestTradeSoFar) {
        console.log('DEBUG: Best trade found (multi-hop)', {
          inputAmount: bestTradeSoFar.inputAmount.toExact(),
          outputAmount: bestTradeSoFar.outputAmount.toExact(),
          inputAmountRaw: bestTradeSoFar.inputAmount.raw.toString(),
          outputAmountRaw: bestTradeSoFar.outputAmount.raw.toString(),
          executionPrice: bestTradeSoFar.executionPrice.toSignificant(6),
          priceImpact: bestTradeSoFar.priceImpact.toSignificant(2),
          route: bestTradeSoFar.route.path.map(t => t.symbol).join(' -> ')
        });
      }

      return bestTradeSoFar;
    }

    return null;
  }, [allowedPairs, currencyAmountIn, currencyOut, singleHopOnly]);
}

/**
 * Returns the best trade for the token in to the exact amount of token out
 */
export function useTradeExactOut(currencyIn?: Currency, currencyAmountOut?: CurrencyAmount): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyIn, currencyAmountOut?.currency);

  const [singleHopOnly] = useUserSingleHopOnly();

  return useMemo(() => {
    if (currencyIn && currencyAmountOut && allowedPairs.length > 0) {
      if (singleHopOnly) {
        return (
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: 1, maxNumResults: 1 })[0] ??
          null
        );
      }
      // search through trades with varying hops, find best trade out of them
      let bestTradeSoFar: Trade | null = null;
      for (let i = 1; i <= MAX_HOPS; i++) {
        const currentTrade =
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: i, maxNumResults: 1 })[0] ??
          null;
        if (isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD)) {
          bestTradeSoFar = currentTrade;
        }
      }
      return bestTradeSoFar;
    }
    return null;
  }, [currencyIn, currencyAmountOut, allowedPairs, singleHopOnly]);
}
