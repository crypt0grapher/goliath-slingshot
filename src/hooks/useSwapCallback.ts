import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { JSBI, Percent, Router, SwapParameters, Trade, TradeType } from '@uniswap/sdk';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BIPS_BASE, INITIAL_ALLOWED_SLIPPAGE } from '../constants';
import { useTransactionAdder } from '../state/transactions/hooks';
import { calculateGasMargin, getRouterContract, isAddress, shortenAddress } from '../utils';
import isZero from '../utils/isZero';
import { useActiveWeb3React } from './index';
import useTransactionDeadline from './useTransactionDeadline';
import useENS from './useENS';
import { useProviderReady } from './useProviderReady';

export enum SwapCallbackState {
  INVALID,
  LOADING,
  VALID,
}

interface SwapCall {
  contract: Contract;
  parameters: SwapParameters;
}

interface SuccessfulCall {
  call: SwapCall;
  gasEstimate: BigNumber;
}

interface FailedCall {
  call: SwapCall;
  error: Error;
}

type EstimatedSwapCall = SuccessfulCall | FailedCall;

/**
 * Returns the swap calls that can be used to make the trade
 * @param trade trade to execute
 * @param allowedSlippage user allowed slippage
 * @param recipientAddressOrName
 */
function useSwapCallArguments(
  trade: Trade | undefined, // trade to execute, required
  allowedSlippage: number = INITIAL_ALLOWED_SLIPPAGE, // in bips
  recipientAddressOrName: string | null // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
): SwapCall[] {
  const { account, chainId, library } = useActiveWeb3React();

  const { address: recipientAddress } = useENS(recipientAddressOrName);
  const recipient = recipientAddressOrName === null ? account : recipientAddress;
  const deadline = useTransactionDeadline();

  return useMemo(() => {
    if (!trade || !recipient || !library || !account || !chainId || !deadline) return [];

    const contract: Contract | null = getRouterContract(chainId, library, account);
    if (!contract) {
      return [];
    }

    const swapMethods = [];

    const swapParams = Router.swapCallParameters(trade, {
      feeOnTransfer: false,
      allowedSlippage: new Percent(JSBI.BigInt(allowedSlippage), BIPS_BASE),
      recipient,
      deadline: deadline.toNumber(),
    });

    swapMethods.push(swapParams);

    if (trade.tradeType === TradeType.EXACT_INPUT) {
      swapMethods.push(
        Router.swapCallParameters(trade, {
          feeOnTransfer: true,
          allowedSlippage: new Percent(JSBI.BigInt(allowedSlippage), BIPS_BASE),
          recipient,
          deadline: deadline.toNumber(),
        })
      );
    }

    return swapMethods.map((parameters) => ({ parameters, contract }));
  }, [account, allowedSlippage, chainId, deadline, library, recipient, trade]);
}

// Configuration for retry behavior
const SWAP_RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 500, // ms
  shouldRetry: (error: any): boolean => {
    // Don't retry user rejections
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
      return false;
    }
    // Retry on common transient errors
    const errorMessage = error?.message?.toLowerCase() || '';
    const isTransientError =
      errorMessage.includes('nonce') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('provider') ||
      errorMessage.includes('unexpected') ||
      errorMessage.includes('try again');
    return isTransientError;
  },
};

// Helper function to wait for a specified time
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// returns a function that will execute a swap, if the parameters are all valid
// and the user has approved the slippage adjusted input amount for the trade
export function useSwapCallback(
  trade: Trade | undefined, // trade to execute, required
  allowedSlippage: number = INITIAL_ALLOWED_SLIPPAGE, // in bips
  recipientAddressOrName: string | null // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
): { state: SwapCallbackState; callback: null | (() => Promise<string>); error: string | null } {
  const { t } = useTranslation();
  const { account, chainId, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();

  const swapCalls = useSwapCallArguments(trade, allowedSlippage, recipientAddressOrName);

  const addTransaction = useTransactionAdder();

  const { address: recipientAddress } = useENS(recipientAddressOrName);
  const recipient = recipientAddressOrName === null ? account : recipientAddress;

  return useMemo(() => {
    if (!trade || !library || !account || !chainId) {
      return { state: SwapCallbackState.INVALID, callback: null, error: 'Missing dependencies' };
    }
    if (!recipient) {
      if (recipientAddressOrName !== null) {
        return { state: SwapCallbackState.INVALID, callback: null, error: 'Invalid recipient' };
      } else {
        return { state: SwapCallbackState.LOADING, callback: null, error: null };
      }
    }

    // Core swap execution logic (extracted for retry capability)
    const executeSwap = async (): Promise<string> => {
      const estimatedCalls: EstimatedSwapCall[] = await Promise.all(
        swapCalls.map((call) => {
          const {
            parameters: { methodName, args, value },
            contract,
          } = call;
          const options = !value || isZero(value) ? {} : { value };

          return contract.estimateGas[methodName](...args, options)
            .then((gasEstimate) => ({
              call,
              gasEstimate,
            }))
            .catch((gasError) => {
              console.debug('Gas estimate failed, trying eth_call to extract error', call);

              return contract.callStatic[methodName](...args, options)
                .then((result) => {
                  console.debug('Unexpected successful call after failed estimate gas', call, gasError, result);
                  return { call, error: new Error(t('errorGasEstimate')) };
                })
                .catch((callError) => {
                  console.debug('Call threw error', call, callError);
                  let errorMessage: string;
                  switch (callError.reason) {
                    case 'SwapRouterV2: INSUFFICIENT_OUTPUT_AMOUNT':
                    case 'SwapRouterV2: EXCESSIVE_INPUT_AMOUNT':
                      errorMessage = t('errorPriceMovementSlippage');
                      break;
                    default:
                      errorMessage = t('errorTransactionFailed', { reason: callError.reason });
                  }
                  return { call, error: new Error(errorMessage) };
                });
            });
        })
      );

      // a successful estimation is a bignumber gas estimate and the next call is also a bignumber gas estimate
      const successfulEstimation = estimatedCalls.find(
        (el, ix, list): el is SuccessfulCall =>
          'gasEstimate' in el && (ix === list.length - 1 || 'gasEstimate' in list[ix + 1])
      );

      if (!successfulEstimation) {
        const errorCalls = estimatedCalls.filter((call): call is FailedCall => 'error' in call);
        if (errorCalls.length > 0) throw errorCalls[errorCalls.length - 1].error;
        throw new Error(t('errorUnexpectedNoError'));
      }

      const {
        call: {
          contract,
          parameters: { methodName, args, value },
        },
        gasEstimate,
      } = successfulEstimation;

      return contract[methodName](...args, {
        gasLimit: calculateGasMargin(gasEstimate),
        ...(value && !isZero(value) ? { value, from: account } : { from: account }),
      })
        .then((response: any) => {
          const inputSymbol = trade.inputAmount.currency.symbol;
          const outputSymbol = trade.outputAmount.currency.symbol;
          const inputAmount = trade.inputAmount.toSignificant(3);
          const outputAmount = trade.outputAmount.toSignificant(3);

          const base = t('swapSummary', {
            inputAmount,
            inputSymbol,
            outputAmount,
            outputSymbol,
          });
          const withRecipient =
            recipient === account
              ? base
              : `${base} to ${
                  recipientAddressOrName && isAddress(recipientAddressOrName)
                    ? shortenAddress(recipientAddressOrName)
                    : recipientAddressOrName
                }`;

          addTransaction(response, {
            summary: withRecipient,
          });

          return response.hash;
        })
        .catch((error: any) => {
          // if the user rejected the tx, pass this along
          if (error?.code === 4001) {
            throw new Error(t('errorTransactionRejected'));
          } else {
            // otherwise, the error was unexpected and we need to convey that
            console.error(`Swap failed`, error, methodName, args, value);
            throw new Error(t('errorSwapFailed', { message: error.message }));
          }
        });
    };

    return {
      state: SwapCallbackState.VALID,
      callback: async function onSwap(): Promise<string> {
        let lastError: Error | null = null;

        // If provider is not ready, wait a moment and recheck
        if (!providerReady) {
          console.debug('Provider not ready, waiting before swap...');
          recheckProvider();
          await wait(300);
        }

        for (let attempt = 0; attempt <= SWAP_RETRY_CONFIG.maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              console.debug(`Swap retry attempt ${attempt}/${SWAP_RETRY_CONFIG.maxRetries}`);
              // Wait before retry and recheck provider
              recheckProvider();
              await wait(SWAP_RETRY_CONFIG.retryDelay);
            }

            return await executeSwap();
          } catch (error: any) {
            lastError = error;

            // Don't retry if it's a known non-retryable error
            if (!SWAP_RETRY_CONFIG.shouldRetry(error)) {
              throw error;
            }

            // Don't retry on last attempt
            if (attempt === SWAP_RETRY_CONFIG.maxRetries) {
              break;
            }

            console.debug(`Swap attempt ${attempt + 1} failed, will retry:`, error.message);
          }
        }

        // If we get here, all retries failed
        throw lastError || new Error(t('errorSwapFailedRetry'));
      },
      error: null,
    };
  }, [t, trade, library, account, chainId, recipient, recipientAddressOrName, swapCalls, addTransaction, providerReady, recheckProvider]);
}
