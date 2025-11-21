import { ChainId, Currency, currencyEquals, JSBI, Price, WETH } from '@uniswap/sdk';
import { useMemo } from 'react';
import { USDC, WXCN, USDC_GOLIATH } from '../constants';
import { PairState, usePairs } from '../data/Reserves';
import { useActiveWeb3React } from '../hooks';
import { wrappedCurrency } from './wrappedCurrency';

/**
 * Returns the price in USDC of the input currency
 * @param currency currency to compute the USDC price of
 */
export default function useUSDCPrice(currency?: Currency): Price | undefined {
  const { chainId } = useActiveWeb3React();
  const wrapped = wrappedCurrency(currency, chainId);

  // Get appropriate WETH/WXCN and USDC for the chain
  const wethToken = chainId === ChainId.GOLIATH_TESTNET ? WXCN : chainId ? WETH[chainId] : undefined;
  const usdcToken = chainId === ChainId.GOLIATH_TESTNET ? USDC_GOLIATH : chainId === ChainId.MAINNET ? USDC : undefined;

  const tokenPairs: [Currency | undefined, Currency | undefined][] = useMemo(
    () => [
      [
        chainId && wrapped && wethToken && currencyEquals(wethToken, wrapped) ? undefined : currency,
        wethToken,
      ],
      [wrapped && usdcToken && wrapped.equals(usdcToken) ? undefined : wrapped, usdcToken],
      [wethToken, usdcToken],
    ],
    [chainId, currency, wrapped, wethToken, usdcToken]
  );
  const [[ethPairState, ethPair], [usdcPairState, usdcPair], [usdcEthPairState, usdcEthPair]] = usePairs(tokenPairs);

  return useMemo(() => {
    if (!currency || !wrapped || !chainId || !wethToken || !usdcToken) {
      return undefined;
    }
    // handle weth/eth (or WXCN for Goliath)
    if (wrapped.equals(wethToken)) {
      if (usdcPair) {
        const price = usdcPair.priceOf(wethToken);
        return new Price(currency, usdcToken, price.denominator, price.numerator);
      } else {
        return undefined;
      }
    }
    // handle usdc
    if (wrapped.equals(usdcToken)) {
      return new Price(usdcToken, usdcToken, '1', '1');
    }

    const ethPairETHAmount = ethPair?.reserveOf(wethToken);
    const ethPairETHUSDCValue: JSBI =
      ethPairETHAmount && usdcEthPair ? usdcEthPair.priceOf(wethToken).quote(ethPairETHAmount).raw : JSBI.BigInt(0);

    // all other tokens
    // first try the usdc pair
    if (usdcPairState === PairState.EXISTS && usdcPair && usdcPair.reserveOf(usdcToken).greaterThan(ethPairETHUSDCValue)) {
      const price = usdcPair.priceOf(wrapped);
      return new Price(currency, usdcToken, price.denominator, price.numerator);
    }
    if (ethPairState === PairState.EXISTS && ethPair && usdcEthPairState === PairState.EXISTS && usdcEthPair) {
      if (usdcEthPair.reserveOf(usdcToken).greaterThan('0') && ethPair.reserveOf(wethToken).greaterThan('0')) {
        const ethUsdcPrice = usdcEthPair.priceOf(usdcToken);
        const currencyEthPrice = ethPair.priceOf(wethToken);
        const usdcPrice = ethUsdcPrice.multiply(currencyEthPrice).invert();
        return new Price(currency, usdcToken, usdcPrice.denominator, usdcPrice.numerator);
      }
    }
    return undefined;
  }, [chainId, currency, ethPair, ethPairState, usdcEthPair, usdcEthPairState, usdcPair, usdcPairState, wrapped, wethToken, usdcToken]);
}
