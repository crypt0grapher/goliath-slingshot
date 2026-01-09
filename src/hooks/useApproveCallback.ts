import { MaxUint256 } from '@ethersproject/constants';
import { TransactionResponse } from '@ethersproject/providers';
import { Trade, TokenAmount, CurrencyAmount, ETHER } from '@uniswap/sdk';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTER_ADDRESS } from '../constants';
import { useTokenAllowance } from '../data/Allowances';
import { Field } from '../state/swap/actions';
import { useTransactionAdder, useHasPendingApproval } from '../state/transactions/hooks';
import { computeSlippageAdjustedAmounts } from '../utils/prices';
import { calculateGasMargin } from '../utils';
import { useTokenContract } from './useContract';
import { useActiveWeb3React } from './index';
import { useProviderReady } from './useProviderReady';

// Configuration for retry behavior
const APPROVE_RETRY_CONFIG = {
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
      errorMessage.includes('unexpected');
    return isTransientError;
  },
};

// Helper function to wait for a specified time
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export enum ApprovalState {
  UNKNOWN,
  NOT_APPROVED,
  PENDING,
  APPROVED,
}

// returns a variable indicating the state of the approval and a function which approves if necessary or early returns
export function useApproveCallback(
  amountToApprove?: CurrencyAmount,
  spender?: string
): [ApprovalState, () => Promise<void>] {
  const { t } = useTranslation();
  const { account } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const token = amountToApprove instanceof TokenAmount ? amountToApprove.token : undefined;
  const currentAllowance = useTokenAllowance(token, account ?? undefined, spender);
  const pendingApproval = useHasPendingApproval(token?.address, spender);

  // check the current approval status
  const approvalState: ApprovalState = useMemo(() => {
    if (!amountToApprove || !spender) return ApprovalState.UNKNOWN;
    if (amountToApprove.currency === ETHER) return ApprovalState.APPROVED;
    // we might not have enough data to know whether or not we need to approve
    if (!currentAllowance) return ApprovalState.UNKNOWN;

    // amountToApprove will be defined if currentAllowance is
    return currentAllowance.lessThan(amountToApprove)
      ? pendingApproval
        ? ApprovalState.PENDING
        : ApprovalState.NOT_APPROVED
      : ApprovalState.APPROVED;
  }, [amountToApprove, currentAllowance, pendingApproval, spender]);

  const tokenContract = useTokenContract(token?.address);
  const addTransaction = useTransactionAdder();

  const approve = useCallback(async (): Promise<void> => {
    if (approvalState !== ApprovalState.NOT_APPROVED) {
      console.error('approve was called unnecessarily');
      return;
    }
    if (!token) {
      console.error('no token');
      return;
    }

    if (!tokenContract) {
      console.error('tokenContract is null');
      return;
    }

    if (!amountToApprove) {
      console.error('missing amount to approve');
      return;
    }

    if (!spender) {
      console.error('no spender');
      return;
    }

    // Core approval execution logic
    const executeApproval = async (): Promise<void> => {
      let useExact = false;
      const estimatedGas = await tokenContract.estimateGas.approve(spender, MaxUint256).catch(() => {
        // general fallback for tokens who restrict approval amounts
        useExact = true;
        return tokenContract.estimateGas.approve(spender, amountToApprove.raw.toString());
      });

      return tokenContract
        .approve(spender, useExact ? amountToApprove.raw.toString() : MaxUint256, {
          gasLimit: calculateGasMargin(estimatedGas),
        })
        .then((response: TransactionResponse) => {
          addTransaction(response, {
            summary: 'Approve ' + amountToApprove.currency.symbol,
            approval: { tokenAddress: token.address, spender: spender },
          });
        });
    };

    // If provider is not ready, wait a moment and recheck
    if (!providerReady) {
      console.debug('Provider not ready, waiting before approval...');
      recheckProvider();
      await wait(300);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= APPROVE_RETRY_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.debug(`Approval retry attempt ${attempt}/${APPROVE_RETRY_CONFIG.maxRetries}`);
          // Wait before retry and recheck provider
          recheckProvider();
          await wait(APPROVE_RETRY_CONFIG.retryDelay);
        }

        await executeApproval();
        return; // Success, exit the loop
      } catch (error: any) {
        lastError = error;

        // User rejected the transaction - don't retry
        if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
          console.debug('User rejected token approval');
          return;
        }

        // Don't retry if it's not a transient error
        if (!APPROVE_RETRY_CONFIG.shouldRetry(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === APPROVE_RETRY_CONFIG.maxRetries) {
          break;
        }

        console.debug(`Approval attempt ${attempt + 1} failed, will retry:`, error.message);
      }
    }

    // If we get here, all retries failed
    console.debug('Failed to approve token after retries', lastError);
    throw lastError || new Error(t('errorApprovalFailedRetry'));
  }, [t, approvalState, token, tokenContract, amountToApprove, spender, addTransaction, providerReady, recheckProvider]);

  return [approvalState, approve];
}

// wraps useApproveCallback in the context of a swap
export function useApproveCallbackFromTrade(trade?: Trade, allowedSlippage = 0) {
  const amountToApprove = useMemo(
    () => (trade ? computeSlippageAdjustedAmounts(trade, allowedSlippage)[Field.INPUT] : undefined),
    [trade, allowedSlippage]
  );

  return useApproveCallback(amountToApprove, ROUTER_ADDRESS);
}
