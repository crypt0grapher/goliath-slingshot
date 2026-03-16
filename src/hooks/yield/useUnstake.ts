import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { formatUnits } from '@ethersproject/units';
import { useActiveWeb3React } from '../index';
import { useStakedXCNContract } from './useStakedXCNContract';
import { useTransactionAdder } from '../../state/transactions/hooks';
import { yieldActions } from '../../state/yield/slice';
import { parseTransactionError, estimateGasWithFallback } from './useStake';
import { UNSTAKE_GAS_LIMIT } from '../../constants/staking';

export function useUnstake(
  refetch?: () => void
): { unstake: (amountWad: string) => Promise<void>; isLoading: boolean } {
  const contract = useStakedXCNContract(true);
  const { account, chainId } = useActiveWeb3React();
  const addTransaction = useTransactionAdder();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const unstake = useCallback(
    async (amountWad: string) => {
      if (!contract || !account || !chainId) return;
      setIsLoading(true);
      dispatch(yieldActions.clearError());
      try {
        const amountBN = BigNumber.from(amountWad);
        if (amountBN.isZero()) throw new Error('Amount must be greater than zero');

        const formattedAmount = formatUnits(amountWad, 18);
        const gasLimit = await estimateGasWithFallback(
          () => contract.estimateGas.unstake(amountBN),
          UNSTAKE_GAS_LIMIT
        );
        const tx = await contract.unstake(amountBN, { gasLimit });
        addTransaction(tx, { summary: `Unstake ${parseFloat(formattedAmount).toFixed(4)} stXCN` });
        dispatch(yieldActions.setPendingTxHash(tx.hash));
        await tx.wait();
        refetch?.();
        dispatch(yieldActions.setUnstakeInput(''));
        dispatch(yieldActions.closeConfirmModal());
      } catch (err: any) {
        dispatch(yieldActions.setError(parseTransactionError(err)));
      } finally {
        setIsLoading(false);
      }
    },
    [contract, account, chainId, addTransaction, dispatch, refetch]
  );

  return { unstake, isLoading };
}
