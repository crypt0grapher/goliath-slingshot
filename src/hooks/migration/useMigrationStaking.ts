import { useState, useCallback, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { BigNumber } from '@ethersproject/bignumber';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { STAKED_XCN_ABI } from '../../abis/StakedXCN';
import { STAKED_XCN_ADDRESS } from '../../constants/staking';
import { migrationActions } from '../../state/migration/slice';
import { ClientStakingStatus } from '../../state/migration/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Goliath testnet chain ID. */
const GOLIATH_CHAIN_ID = 8901;

/** Timeout for staking tx.wait() (5 minutes). */
const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMigrationStakingResult {
  /** Execute the staking transaction. Requires wallet on Goliath. */
  executeStake: () => Promise<void>;
  /** Current staking status. */
  stakingStatus: ClientStakingStatus;
  /** Staking transaction hash (set after tx submitted). */
  stakingTxHash: string | null;
  /** Error message on failure. */
  stakingError: string | null;
  /** Whether the wallet is on the correct network (Goliath). */
  isNetworkCorrect: boolean;
  /** Reset status to allow retry. */
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUserRejection(error: any): boolean {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') return true;
  const msg = error?.message?.toLowerCase() || '';
  return msg.includes('user denied') || msg.includes('user rejected');
}

function extractErrorMessage(error: any): string {
  if (error?.reason) return error.reason;
  if (error?.data?.message) return error.data.message;
  if (typeof error?.message === 'string') return error.message.slice(0, 200);
  return 'Staking transaction failed';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Client-side staking hook for the migration flow.
 *
 * After the bridge completes and XCN is minted on Goliath, this hook
 * executes `stakedXCN.stake({ value: amount })` — the same contract
 * call used by the Yield tab.
 *
 * @param bridgedAmount  Bridged amount in atomic units (wei string).
 * @param stakeOnGoliath Whether the user opted to stake.
 * @param isReadyToStake True when bridge status is COMPLETED.
 */
export function useMigrationStaking(
  bridgedAmount: string | undefined,
  stakeOnGoliath: boolean,
  isReadyToStake: boolean
): UseMigrationStakingResult {
  const dispatch = useDispatch();
  const { account, library, chainId } = useActiveWeb3React();

  const [stakingStatus, setStakingStatus] = useState<ClientStakingStatus>('idle');
  const [stakingTxHash, setStakingTxHash] = useState<string | null>(null);
  const [stakingError, setStakingError] = useState<string | null>(null);

  const executingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isNetworkCorrect = chainId === GOLIATH_CHAIN_ID;

  const dispatchClientStatus = useCallback(
    (status: ClientStakingStatus, txHash?: string, error?: string) => {
      dispatch(
        migrationActions.updateOperationStatus({
          status: 'COMPLETED', // bridge status stays COMPLETED
          clientStakingStatus: status,
          ...(txHash !== undefined ? { stakingTxHash: txHash } : {}),
          ...(error !== undefined ? { stakingError: error } : {}),
        })
      );
    },
    [dispatch]
  );

  const executeStake = useCallback(async () => {
    if (executingRef.current) return;
    if (!stakeOnGoliath || !isReadyToStake) return;
    if (!account || !library) return;

    // Check network
    if (!isNetworkCorrect) {
      setStakingStatus('awaiting_network');
      dispatchClientStatus('awaiting_network');
      return;
    }

    // Validate amount
    let amount: BigNumber;
    try {
      amount = bridgedAmount ? BigNumber.from(bridgedAmount) : BigNumber.from(0);
    } catch {
      amount = BigNumber.from(0);
    }
    if (amount.isZero()) {
      setStakingStatus('failed');
      setStakingError('No XCN amount available to stake');
      dispatchClientStatus('failed', undefined, 'No XCN amount available to stake');
      return;
    }

    executingRef.current = true;

    // PENDING_SIGNATURE
    setStakingStatus('pending_signature');
    setStakingError(null);
    dispatchClientStatus('pending_signature');

    try {
      const signer = library.getSigner(account);
      const address = STAKED_XCN_ADDRESS[GOLIATH_CHAIN_ID];
      if (!address) {
        throw new Error('StakedXCN contract address not configured');
      }

      const stakedXCNContract = new ethers.Contract(
        address,
        STAKED_XCN_ABI as readonly Record<string, unknown>[],
        signer as any
      );

      // stake() is payable — send native XCN as msg.value
      const tx = await stakedXCNContract.stake({ value: amount });

      if (!mountedRef.current) return;

      // TX_PENDING
      setStakingStatus('tx_pending');
      setStakingTxHash(tx.hash);
      dispatchClientStatus('tx_pending', tx.hash);

      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Staking confirmation timed out')), TX_WAIT_TIMEOUT_MS)
        ),
      ]);

      if (!mountedRef.current) return;

      if (receipt.status === 0) {
        setStakingStatus('failed');
        setStakingError('Staking transaction reverted');
        dispatchClientStatus('failed', tx.hash, 'Staking transaction reverted');
        return;
      }

      // CONFIRMED
      setStakingStatus('confirmed');
      setStakingError(null);
      dispatchClientStatus('confirmed', tx.hash);
    } catch (err: any) {
      if (!mountedRef.current) return;

      if (isUserRejection(err)) {
        setStakingStatus('idle');
        setStakingError(null);
        dispatchClientStatus('idle');
        return;
      }

      const errorMsg = extractErrorMessage(err);
      setStakingStatus('failed');
      setStakingError(errorMsg);
      dispatchClientStatus('failed', stakingTxHash ?? undefined, errorMsg);
    } finally {
      executingRef.current = false;
    }
  }, [
    stakeOnGoliath, isReadyToStake, account, library, isNetworkCorrect,
    bridgedAmount, stakingTxHash, dispatchClientStatus,
  ]);

  // Auto-trigger staking when network becomes correct after awaiting
  useEffect(() => {
    if (
      stakingStatus === 'awaiting_network' &&
      isNetworkCorrect &&
      isReadyToStake &&
      stakeOnGoliath
    ) {
      executeStake();
    }
  }, [stakingStatus, isNetworkCorrect, isReadyToStake, stakeOnGoliath, executeStake]);

  const retry = useCallback(() => {
    setStakingStatus('idle');
    setStakingError(null);
    executingRef.current = false;
  }, []);

  return {
    executeStake,
    stakingStatus,
    stakingTxHash,
    stakingError,
    isNetworkCorrect,
    retry,
  };
}
