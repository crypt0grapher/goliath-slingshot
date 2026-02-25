import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { ethers } from 'ethers';
import { useActiveWeb3React } from 'hooks';
import { getReadonlyProvider, ensureSepoliaProviderReady } from 'services/bridgeProviders';
import { BridgeNetwork } from 'constants/bridge/networks';
import { migrationConfig } from 'config/migrationConfig';
import { bridgeConfig } from 'config/bridgeConfig';
import { CHN_STAKING_ABI } from 'abis/CHNStaking';
import { ERC20_ABI } from 'abis/ERC20';
import { migrationActions } from 'state/migration/slice';
import { StakingSnapshot } from 'state/migration/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMigrationDataResult {
  /** Whether data is currently being fetched. */
  loading: boolean;
  /** Error message from the most recent fetch attempt, or null. */
  error: string | null;
  /** Manually trigger a data refetch. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Pool ID for the primary staking pool. */
const POOL_ID = 0;
const MIGRATION_TIMEOUT_ERROR = 'Sepolia RPC timed out while loading migration data. Please try again.';

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybeErr = err as { code?: unknown; message?: unknown };
  const message = typeof maybeErr.message === 'string' ? maybeErr.message.toLowerCase() : '';
  return maybeErr.code === 'TIMEOUT_ERROR' || message.includes('timed out');
}

/**
 * Fetches all migration-relevant on-chain data from Sepolia in parallel.
 *
 * Calls:
 *  - CHNStaking.userInfo(0, address)    -> staked amount
 *  - CHNStaking.pendingReward(0, address) -> pending rewards
 *  - XCN.balanceOf(address)             -> wallet XCN balance
 *  - XCN.allowance(address, bridge)     -> bridge allowance
 *
 * Returns stringified wei values to stay Redux-serializable.
 */
async function fetchMigrationSnapshot(
  address: string,
  provider: ethers.providers.JsonRpcProvider
): Promise<Pick<StakingSnapshot, 'staked' | 'rewards' | 'walletXcn' | 'allowance'>> {
  const stakingContract = new ethers.Contract(
    migrationConfig.sepoliaStakingContract,
    CHN_STAKING_ABI as readonly Record<string, unknown>[],
    provider
  );

  const xcnContract = new ethers.Contract(
    migrationConfig.sepoliaXcnAddress,
    ERC20_ABI as readonly Record<string, unknown>[],
    provider
  );

  const bridgeSepoliaAddress = bridgeConfig.sepolia.bridgeAddress;

  // Execute all four read calls in parallel for performance (NFR-001: <= 3s).
  const [userInfoResult, pendingRewardResult, balanceResult, allowanceResult] = await Promise.all([
    stakingContract.userInfo(POOL_ID, address),
    stakingContract.pendingReward(POOL_ID, address),
    xcnContract.balanceOf(address),
    xcnContract.allowance(address, bridgeSepoliaAddress),
  ]);

  // userInfo returns a tuple: (amount, rewardDebt, pendingTokenReward)
  // The staked amount is the first element.
  const staked: ethers.BigNumber = userInfoResult.amount ?? userInfoResult[0];

  return {
    staked: staked.toString(),
    rewards: pendingRewardResult.toString(),
    walletXcn: balanceResult.toString(),
    allowance: allowanceResult.toString(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches migration-relevant on-chain data from Sepolia and dispatches it as a
 * StakingSnapshot to the migration Redux slice.
 *
 * Behaviour:
 * - Uses a read-only Sepolia provider (from bridgeProviders) -- no wallet/signer required.
 * - Executes all four contract calls in parallel.
 * - Auto-fetches when the connected wallet address changes.
 * - Exposes `loading`, `error`, and `refetch` for consumer components.
 */
export function useMigrationData(): UseMigrationDataResult {
  const dispatch = useDispatch();
  const { account } = useActiveWeb3React();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the account that was last fetched to detect changes and avoid stale responses.
  // Use a unique sentinel so the first render always triggers a fetch (even when account is null/undefined).
  const lastAccountRef = useRef<string | null | undefined>('__SENTINEL_INITIAL__');
  // Track mount state to prevent setState after unmount.
  const mountedRef = useRef(true);
  // Track in-flight fetch to prevent concurrent requests.
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!account) {
      // No connected wallet -- reset snapshot to defaults.
      dispatch(
        migrationActions.setSnapshot({
          staked: '0',
          rewards: '0',
          walletXcn: '0',
          allowance: '0',
          loading: false,
          error: null,
        })
      );
      setLoading(false);
      setError(null);
      return;
    }

    // Increment fetch ID so stale responses from previous calls are ignored.
    fetchIdRef.current += 1;
    const currentFetchId = fetchIdRef.current;

    setLoading(true);
    setError(null);

    // Mark snapshot as loading without zeroing balance values.
    // Zeroing the snapshot here caused deriveSteps() to compute isEmpty=true,
    // which made the UI show "No XCN to migrate" instead of a loading skeleton.
    dispatch(migrationActions.setSnapshotLoading({ loading: true, error: null }));

    try {
      await ensureSepoliaProviderReady();
      const provider = getReadonlyProvider(BridgeNetwork.SEPOLIA);
      const data = await fetchMigrationSnapshot(account, provider);

      // Guard: component unmounted or a newer fetch was triggered.
      if (!mountedRef.current || currentFetchId !== fetchIdRef.current) return;

      const snapshot: StakingSnapshot = {
        ...data,
        loading: false,
        error: null,
      };

      dispatch(migrationActions.setSnapshot(snapshot));
      setError(null);
    } catch (err) {
      // Guard against setState after unmount or stale fetch.
      if (!mountedRef.current || currentFetchId !== fetchIdRef.current) return;

      const message = isTimeoutError(err)
        ? MIGRATION_TIMEOUT_ERROR
        : err instanceof Error
          ? err.message
          : 'Failed to fetch migration data';
      console.error('[useMigrationData] Fetch error:', err);

      dispatch(
        migrationActions.setSnapshot({
          staked: '0',
          rewards: '0',
          walletXcn: '0',
          allowance: '0',
          loading: false,
          error: message,
        })
      );
      setError(message);
    } finally {
      if (mountedRef.current && currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [account, dispatch]);

  // Auto-fetch when the connected wallet address changes.
  useEffect(() => {
    if (account !== lastAccountRef.current) {
      lastAccountRef.current = account;
      fetchData();
    }
  }, [account, fetchData]);

  // Cleanup: mark unmounted.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    loading,
    error,
    refetch: fetchData,
  };
}
