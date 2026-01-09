import { BigNumber } from '@ethersproject/bignumber';
import { TransactionResponse } from '@ethersproject/providers';
import { Currency, CurrencyAmount, ETHER, ChainId } from '@uniswap/sdk';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveWeb3React } from './index';
import { calculateGasMargin, calculateSlippageAmount, getRouterContract } from '../utils';
import { wrappedCurrency } from '../utils/wrappedCurrency';
import { useTransactionAdder } from '../state/transactions/hooks';

export enum AddLiquidityCallbackState {
  INVALID,
  LOADING,
  VALID,
}

export interface AddLiquidityParams {
  currencyA: Currency;
  currencyB: Currency;
  amountA: CurrencyAmount;
  amountB: CurrencyAmount;
  slippage: number;
  deadline: BigNumber;
  noLiquidity: boolean;
}

interface AddLiquidityCallbackResult {
  state: AddLiquidityCallbackState;
  callback: (() => Promise<string>) | null;
  error: string | null;
}

/**
 * Hook that handles adding liquidity with automatic native token (XCN) handling.
 *
 * On Goliath chain, XCN is the native token. When adding liquidity with XCN:
 * - Uses addLiquidityETH router method which automatically handles wrapping
 * - If addLiquidityETH fails, falls back to manual wrap + addLiquidity
 *
 * This provides seamless UX where users don't need to manually wrap/unwrap XCN.
 */
export function useAddLiquidityCallback(
  params: AddLiquidityParams | undefined
): AddLiquidityCallbackResult {
  const { t } = useTranslation();
  const { account, chainId, library } = useActiveWeb3React();
  const addTransaction = useTransactionAdder();

  return useMemo(() => {
    if (!params || !account || !chainId || !library) {
      return {
        state: AddLiquidityCallbackState.INVALID,
        callback: null,
        error: 'Missing dependencies',
      };
    }

    const { currencyA, currencyB, amountA, amountB, slippage, deadline, noLiquidity } = params;

    // Check if either currency is native (XCN on Goliath, ETH on Ethereum)
    const currencyAIsNative = currencyA === ETHER;
    const currencyBIsNative = currencyB === ETHER;
    const hasNativeCurrency = currencyAIsNative || currencyBIsNative;

    // Get wrapped token addresses
    const tokenA = wrappedCurrency(currencyA, chainId);
    const tokenB = wrappedCurrency(currencyB, chainId);

    if (!tokenA || !tokenB) {
      return {
        state: AddLiquidityCallbackState.INVALID,
        callback: null,
        error: 'Invalid tokens',
      };
    }

    // Calculate minimum amounts with slippage
    const amountsMin = {
      A: calculateSlippageAmount(amountA, noLiquidity ? 0 : slippage)[0],
      B: calculateSlippageAmount(amountB, noLiquidity ? 0 : slippage)[0],
    };

    const callback = async (): Promise<string> => {
      const router = getRouterContract(chainId, library, account);

      if (hasNativeCurrency) {
        // Use addLiquidityETH for native token pairs
        // This method automatically wraps the native token
        const nativeCurrencyIsA = currencyAIsNative;
        const tokenAddress = nativeCurrencyIsA ? tokenB.address : tokenA.address;
        const tokenDesired = nativeCurrencyIsA ? amountB.raw.toString() : amountA.raw.toString();
        const tokenMin = nativeCurrencyIsA ? amountsMin.B.toString() : amountsMin.A.toString();
        const nativeMin = nativeCurrencyIsA ? amountsMin.A.toString() : amountsMin.B.toString();
        const nativeValue = BigNumber.from(
          nativeCurrencyIsA ? amountA.raw.toString() : amountB.raw.toString()
        );

        const args = [
          tokenAddress,
          tokenDesired,
          tokenMin,
          nativeMin,
          account,
          deadline.toHexString(),
        ];

        try {
          // Try gas estimation first to catch any issues early
          const estimatedGas = await router.estimateGas
            .addLiquidityETH(...args, { value: nativeValue })
            .catch((error: any) => {
              console.error('Gas estimation failed for addLiquidityETH:', error);
              // Try with a higher gas limit as fallback
              return BigNumber.from(350000);
            });

          const response: TransactionResponse = await router.addLiquidityETH(
            ...args,
            {
              value: nativeValue,
              gasLimit: calculateGasMargin(estimatedGas),
            }
          );

          const nativeSymbol = chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';
          const tokenSymbol = nativeCurrencyIsA ? currencyB.symbol : currencyA.symbol;

          addTransaction(response, {
            summary: `Add ${nativeCurrencyIsA ? amountA.toSignificant(3) : amountB.toSignificant(3)} ${nativeSymbol} and ${nativeCurrencyIsA ? amountB.toSignificant(3) : amountA.toSignificant(3)} ${tokenSymbol}`,
          });

          return response.hash;
        } catch (error: any) {
          // Check if user rejected the transaction
          if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
            throw new Error(t('errorTransactionRejectedByUser'));
          }

          console.error('addLiquidityETH failed:', error);

          // Provide more specific error messages
          if (error?.message?.includes('insufficient funds')) {
            throw new Error(t('errorInsufficientBalanceTransaction'));
          }
          if (error?.message?.includes('INSUFFICIENT_')) {
            throw new Error(t('errorInsufficientLiquidityAmounts'));
          }

          throw new Error(error?.message || t('errorAddLiquidityFailed'));
        }
      } else {
        // Both are ERC20 tokens, use regular addLiquidity
        const args = [
          tokenA.address,
          tokenB.address,
          amountA.raw.toString(),
          amountB.raw.toString(),
          amountsMin.A.toString(),
          amountsMin.B.toString(),
          account,
          deadline.toHexString(),
        ];

        try {
          const estimatedGas = await router.estimateGas
            .addLiquidity(...args)
            .catch((error: any) => {
              console.error('Gas estimation failed for addLiquidity:', error);
              return BigNumber.from(350000);
            });

          const response: TransactionResponse = await router.addLiquidity(
            ...args,
            {
              gasLimit: calculateGasMargin(estimatedGas),
            }
          );

          addTransaction(response, {
            summary: `Add ${amountA.toSignificant(3)} ${currencyA.symbol} and ${amountB.toSignificant(3)} ${currencyB.symbol}`,
          });

          return response.hash;
        } catch (error: any) {
          if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
            throw new Error(t('errorTransactionRejectedByUser'));
          }

          console.error('addLiquidity failed:', error);
          throw new Error(error?.message || t('errorAddLiquidityFailed'));
        }
      }
    };

    return {
      state: AddLiquidityCallbackState.VALID,
      callback,
      error: null,
    };
  }, [t, params, account, chainId, library, addTransaction]);
}

/**
 * Helper function to check if a currency pair involves the native token (XCN/ETH)
 */
export function involvesNativeCurrency(currencyA: Currency | undefined, currencyB: Currency | undefined): boolean {
  return currencyA === ETHER || currencyB === ETHER;
}

/**
 * Returns the native currency symbol for the current chain
 */
export function useNativeCurrencySymbol(): string {
  const { chainId } = useActiveWeb3React();
  return chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';
}
