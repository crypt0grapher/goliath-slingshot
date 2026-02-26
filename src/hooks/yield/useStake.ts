import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { formatUnits } from '@ethersproject/units';
import { useActiveWeb3React } from '../index';
import { useStakedXCNContract } from './useStakedXCNContract';
import { useTransactionAdder } from '../../state/transactions/hooks';
import { yieldActions } from '../../state/yield/slice';
import { STAKED_XCN_ADDRESS } from '../../constants/staking';

export function parseTransactionError(err: any): string {
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') return 'Transaction rejected by user';
  if (err?.reason) return err.reason;
  if (err?.data?.message) return err.data.message;
  if (err?.message) return err.message.slice(0, 200);
  return 'Transaction failed';
}

function suggestStXCNToken(): void {
  try {
    const address = STAKED_XCN_ADDRESS[8901];
    if (!address) return;
    const ethereum = window.ethereum as any;
    if (!ethereum?.request) return;
    ethereum
      .request({
        method: 'wallet_watchAsset',
        params: { type: 'ERC20', options: { address, symbol: 'stXCN', decimals: 18 } },
      })
      .catch(() => {});
  } catch {
    // silently ignore
  }
}

export function useStake(
  refetch?: () => void
): { stake: (amountWad: string) => Promise<void>; isLoading: boolean } {
  const contract = useStakedXCNContract(true);
  const { account, chainId } = useActiveWeb3React();
  const addTransaction = useTransactionAdder();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const stake = useCallback(
    async (amountWad: string) => {
      if (!contract || !account || !chainId) return;
      setIsLoading(true);
      dispatch(yieldActions.clearError());
      try {
        const amount = BigNumber.from(amountWad);
        if (amount.isZero()) throw new Error('Amount too small');

        const formattedAmount = formatUnits(amountWad, 18);
        const tx = await contract.stake({ value: amount });
        addTransaction(tx, { summary: `Stake ${parseFloat(formattedAmount).toFixed(4)} XCN` });
        dispatch(yieldActions.setPendingTxHash(tx.hash));
        await tx.wait();
        refetch?.();
        dispatch(yieldActions.setStakeInput(''));
        dispatch(yieldActions.closeConfirmModal());
        suggestStXCNToken();
      } catch (err: any) {
        dispatch(yieldActions.setError(parseTransactionError(err)));
      } finally {
        setIsLoading(false);
      }
    },
    [contract, account, chainId, addTransaction, dispatch, refetch]
  );

  return { stake, isLoading };
}
