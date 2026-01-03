import { Currency, CurrencyAmount, ETHER, JSBI, Pair, Percent, Price, TokenAmount } from '@uniswap/sdk';
import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PairState, usePair } from '../../data/Reserves';
import { useTotalSupply } from '../../data/TotalSupply';

import { useActiveWeb3React } from '../../hooks';
import { wrappedCurrency, wrappedCurrencyAmount } from '../../utils/wrappedCurrency';
import { AppDispatch, AppState } from '../index';
import { tryParseAmount } from '../swap/hooks';
import { useCurrencyBalances } from '../wallet/hooks';
import { Field, typeInput } from './actions';

const ZERO = JSBI.BigInt(0);

export function useMintState(): AppState['mint'] {
  return useSelector<AppState, AppState['mint']>((state) => state.mint);
}

export function useMintActionHandlers(noLiquidity: boolean | undefined): {
  onFieldAInput: (typedValue: string) => void;
  onFieldBInput: (typedValue: string) => void;
} {
  const dispatch = useDispatch<AppDispatch>();

  const onFieldAInput = useCallback(
    (typedValue: string) => {
      dispatch(typeInput({ field: Field.CURRENCY_A, typedValue, noLiquidity: noLiquidity === true }));
    },
    [dispatch, noLiquidity]
  );
  const onFieldBInput = useCallback(
    (typedValue: string) => {
      dispatch(typeInput({ field: Field.CURRENCY_B, typedValue, noLiquidity: noLiquidity === true }));
    },
    [dispatch, noLiquidity]
  );

  return {
    onFieldAInput,
    onFieldBInput,
  };
}

export function useDerivedMintInfo(
  currencyA: Currency | undefined,
  currencyB: Currency | undefined
): {
  dependentField: Field;
  currencies: { [field in Field]?: Currency };
  pair?: Pair | null;
  pairState: PairState;
  currencyBalances: { [field in Field]?: CurrencyAmount };
  parsedAmounts: { [field in Field]?: CurrencyAmount };
  price?: Price;
  noLiquidity?: boolean;
  liquidityMinted?: TokenAmount;
  poolTokenPercentage?: Percent;
  ratioDeviation?: number;
  error?: string;
  errorParams?: Record<string, string>;
} {
  const { account, chainId } = useActiveWeb3React();

  const { independentField, typedValue, otherTypedValue } = useMintState();

  const dependentField = independentField === Field.CURRENCY_A ? Field.CURRENCY_B : Field.CURRENCY_A;

  // tokens
  const currencies: { [field in Field]?: Currency } = useMemo(
    () => ({
      [Field.CURRENCY_A]: currencyA ?? undefined,
      [Field.CURRENCY_B]: currencyB ?? undefined,
    }),
    [currencyA, currencyB]
  );

  // pair
  const [pairState, pair] = usePair(currencies[Field.CURRENCY_A], currencies[Field.CURRENCY_B]);
  const totalSupply = useTotalSupply(pair?.liquidityToken);

  const noLiquidity: boolean =
    pairState === PairState.NOT_EXISTS || Boolean(totalSupply && JSBI.equal(totalSupply.raw, ZERO));

  // balances
  const balances = useCurrencyBalances(account ?? undefined, [
    currencies[Field.CURRENCY_A],
    currencies[Field.CURRENCY_B],
  ]);
  const currencyBalances: { [field in Field]?: CurrencyAmount } = {
    [Field.CURRENCY_A]: balances[0],
    [Field.CURRENCY_B]: balances[1],
  };

  // amounts
  const independentAmount: CurrencyAmount | undefined = tryParseAmount(typedValue, currencies[independentField]);
  const dependentAmount: CurrencyAmount | undefined = useMemo(() => {
    if (noLiquidity) {
      if (otherTypedValue && currencies[dependentField]) {
        return tryParseAmount(otherTypedValue, currencies[dependentField]);
      }
      return undefined;
    } else if (independentAmount) {
      // we wrap the currencies just to get the price in terms of the other token
      const wrappedIndependentAmount = wrappedCurrencyAmount(independentAmount, chainId);
      const [tokenA, tokenB] = [wrappedCurrency(currencyA, chainId), wrappedCurrency(currencyB, chainId)];
      if (tokenA && tokenB && wrappedIndependentAmount && pair) {
        const dependentCurrency = dependentField === Field.CURRENCY_B ? currencyB : currencyA;
        const dependentTokenAmount =
          dependentField === Field.CURRENCY_B
            ? pair.priceOf(tokenA).quote(wrappedIndependentAmount)
            : pair.priceOf(tokenB).quote(wrappedIndependentAmount);
        return dependentCurrency === ETHER ? CurrencyAmount.ether(dependentTokenAmount.raw) : dependentTokenAmount;
      }
      return undefined;
    } else {
      return undefined;
    }
  }, [
    noLiquidity,
    otherTypedValue,
    currencies,
    dependentField,
    independentAmount,
    currencyA,
    chainId,
    currencyB,
    pair,
  ]);
  const parsedAmounts: { [field in Field]: CurrencyAmount | undefined } = {
    [Field.CURRENCY_A]: independentField === Field.CURRENCY_A ? independentAmount : dependentAmount,
    [Field.CURRENCY_B]: independentField === Field.CURRENCY_A ? dependentAmount : independentAmount,
  };

  const price = useMemo(() => {
    if (noLiquidity) {
      const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts;
      if (currencyAAmount && currencyBAmount) {
        return new Price(currencyAAmount.currency, currencyBAmount.currency, currencyAAmount.raw, currencyBAmount.raw);
      }
      return undefined;
    } else {
      const wrappedCurrencyA = wrappedCurrency(currencyA, chainId);
      return pair && wrappedCurrencyA ? pair.priceOf(wrappedCurrencyA) : undefined;
    }
  }, [chainId, currencyA, noLiquidity, pair, parsedAmounts]);

  // liquidity minted
  const liquidityMinted = useMemo(() => {
    const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts;
    const [tokenAmountA, tokenAmountB] = [
      wrappedCurrencyAmount(currencyAAmount, chainId),
      wrappedCurrencyAmount(currencyBAmount, chainId),
    ];
    if (pair && totalSupply && tokenAmountA && tokenAmountB) {
      return pair.getLiquidityMinted(totalSupply, tokenAmountA, tokenAmountB);
    } else {
      return undefined;
    }
  }, [parsedAmounts, chainId, pair, totalSupply]);

  const poolTokenPercentage = useMemo(() => {
    if (liquidityMinted && totalSupply) {
      return new Percent(liquidityMinted.raw, totalSupply.add(liquidityMinted).raw);
    } else {
      return undefined;
    }
  }, [liquidityMinted, totalSupply]);

  // Calculate ratio deviation percentage between user input and pool ratio
  const ratioDeviation = useMemo(() => {
    // Only calculate for existing pools (not noLiquidity)
    if (noLiquidity || !pair || !parsedAmounts[Field.CURRENCY_A] || !parsedAmounts[Field.CURRENCY_B]) {
      return undefined;
    }

    try {
      const tokenA = wrappedCurrency(currencyA, chainId);
      const tokenB = wrappedCurrency(currencyB, chainId);
      if (!tokenA || !tokenB) return undefined;

      // Get pool reserves in correct order
      const [reserve0, reserve1] = pair.token0.equals(tokenA)
        ? [pair.reserve0, pair.reserve1]
        : [pair.reserve1, pair.reserve0];

      // User's input amounts
      const userAmountA = parsedAmounts[Field.CURRENCY_A];
      const userAmountB = parsedAmounts[Field.CURRENCY_B];

      // Calculate ratios using JSBI for precision
      // Pool ratio: reserveA / reserveB
      // User ratio: amountA / amountB
      // We use cross-multiplication to avoid division: userA * reserveB vs reserveA * userB
      const userCrossProduct = JSBI.multiply(userAmountA.raw, reserve1.raw);
      const poolCrossProduct = JSBI.multiply(reserve0.raw, userAmountB.raw);

      // Calculate percentage deviation
      // |userCross - poolCross| / poolCross * 100
      const diff = JSBI.greaterThan(userCrossProduct, poolCrossProduct)
        ? JSBI.subtract(userCrossProduct, poolCrossProduct)
        : JSBI.subtract(poolCrossProduct, userCrossProduct);

      // Convert to percentage (multiply by 100 before division for precision)
      const diffScaled = JSBI.multiply(diff, JSBI.BigInt(10000)); // Scale by 10000 for 2 decimal precision
      const deviation = JSBI.toNumber(JSBI.divide(diffScaled, poolCrossProduct)) / 100;

      return deviation;
    } catch {
      return undefined;
    }
  }, [noLiquidity, pair, parsedAmounts, currencyA, currencyB, chainId]);

  let error: string | undefined;
  let errorParams: Record<string, string> | undefined;
  if (!account) {
    error = 'connectWallet';
  }

  if (pairState === PairState.INVALID) {
    error = error ?? 'invalidPair';
  }

  if (!parsedAmounts[Field.CURRENCY_A] || !parsedAmounts[Field.CURRENCY_B]) {
    error = error ?? 'enterAnAmount';
  }

  const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts;

  if (currencyAAmount && currencyBalances?.[Field.CURRENCY_A]?.lessThan(currencyAAmount)) {
    error = 'insufficientSymbolBalance';
    errorParams = { symbol: currencies[Field.CURRENCY_A]?.symbol ?? '' };
  }

  if (currencyBAmount && currencyBalances?.[Field.CURRENCY_B]?.lessThan(currencyBAmount)) {
    error = 'insufficientSymbolBalance';
    errorParams = { symbol: currencies[Field.CURRENCY_B]?.symbol ?? '' };
  }

  return {
    dependentField,
    currencies,
    pair,
    pairState,
    currencyBalances,
    parsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    ratioDeviation,
    error,
    errorParams,
  };
}
