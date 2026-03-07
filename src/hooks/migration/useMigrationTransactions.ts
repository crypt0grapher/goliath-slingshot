import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { useActiveWeb3React } from 'hooks';
import { useProviderReady } from 'hooks/useProviderReady';
import { migrationConfig } from 'config/migrationConfig';
import { bridgeConfig } from 'config/bridgeConfig';
import { CHN_STAKING_ABI } from 'abis/CHNStaking';
import { ERC20_ABI } from 'abis/ERC20';
import { BRIDGE_SEPOLIA_ABI } from 'constants/bridge/abis';
import { calculateGasMargin } from 'utils';
import { MigrationStep, StepExecutionStatus } from 'constants/migration';
import { migrationActions } from 'state/migration/slice';
import { selectStakingSnapshot } from 'state/migration/selectors';
import { StepExecution } from 'state/migration/types';
import {
  migrationApiClient,
  SubmitStakePreferenceRequest,
} from 'services/migrationApi';
import { savePendingMigration } from 'state/migration/persistence';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pool ID for the primary staking pool. */
const POOL_ID = 0;

/** Timeout for tx.wait() to prevent indefinite hanging (5 minutes). */
const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/** Short delay for provider readiness recheck. */
const PROVIDER_WAIT_MS = 300;

/** Max retries for the bind-origin API call. */
const BIND_RETRY_MAX = 5;

/** Base delay for exponential backoff on bind-origin retries (ms). */
const BIND_RETRY_BASE_DELAY_MS = 2000;

/** EIP-712 domain name for migration intent signing. */
const EIP712_DOMAIN_NAME = 'GoliathBridge';

/** EIP-712 domain version. */
const EIP712_DOMAIN_VERSION = '1';

/** Deadline for signed intent: 30 minutes from now. */
const INTENT_DEADLINE_MINUTES = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMigrationTransactionsResult {
  executeClaim: () => Promise<void>;
  executeApprove: () => Promise<void>;
  executeUnstake: () => Promise<void>;
  executeBridge: (refetch: () => void) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for a transaction receipt with a timeout to prevent indefinite hanging.
 */
function waitForTxWithTimeout(
  tx: ethers.ContractTransaction,
  timeoutMs: number
): Promise<ethers.ContractReceipt> {
  return Promise.race([
    tx.wait(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Transaction confirmation is taking longer than expected')), timeoutMs)
    ),
  ]);
}

/**
 * Determines whether an error represents a user rejection (wallet signature denied).
 */
function isUserRejection(error: any): boolean {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return true;
  }
  const msg = error?.message?.toLowerCase() || '';
  return msg.includes('user denied') || msg.includes('user rejected');
}

/**
 * Extracts a human-readable error message from an unknown error.
 */
function extractErrorMessage(error: any, fallback: string): string {
  if (typeof error?.reason === 'string') return error.reason;
  if (typeof error?.message === 'string') return error.message;
  return fallback;
}

/**
 * Attempts to call bindOriginTxHash with exponential backoff retries.
 * Returns true if the bind succeeded, false if all retries were exhausted.
 */
async function retryBindOriginTxHash(
  intentId: string,
  senderAddress: string,
  originTxHash: string
): Promise<boolean> {
  for (let attempt = 0; attempt < BIND_RETRY_MAX; attempt++) {
    try {
      await migrationApiClient.bindOriginTxHash({
        intentId,
        senderAddress,
        originTxHash,
      });
      return true;
    } catch (err) {
      console.warn(
        `[Migration] bindOriginTxHash attempt ${attempt + 1}/${BIND_RETRY_MAX} failed:`,
        err
      );
      if (attempt < BIND_RETRY_MAX - 1) {
        const delay = BIND_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await wait(delay);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook providing the four migration step execution functions:
 * executeClaim, executeApprove, executeUnstake, and executeBridge.
 *
 * Each function follows a shared transaction lifecycle pattern:
 *   IDLE -> WAITING_SIGNATURE -> TX_PENDING -> CONFIRMED | FAILED
 *
 * Redux step execution status is updated at each state transition so the UI
 * can display progress indicators and error states.
 *
 * The bridge step is the most complex, involving a multi-phase sequence:
 *   1. Lock the toggle preference
 *   2. Sign a typed intent (EIP-712)
 *   3. Submit stake preference to the API
 *   4. Submit bridge deposit on-chain
 *   5. Bind the origin tx hash to the intent
 *   6. Save pending operation to localStorage
 *   7. Transition to the status tracking view
 */
export function useMigrationTransactions(
  refetch: () => void
): UseMigrationTransactionsResult {
  const dispatch = useDispatch();
  const { account, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const snapshot = useSelector(selectStakingSnapshot);

  // Ref to prevent concurrent execution of the same step
  const executingRef = useRef<Record<string, boolean>>({});

  // ------------------------------------------------------------------
  // Internal: shared transaction lifecycle helper
  // ------------------------------------------------------------------

  /**
   * Wraps a transaction-producing callback with the standard lifecycle:
   * 1. Dispatch WAITING_SIGNATURE
   * 2. Call txProducer to get the ContractTransaction (user signs here)
   * 3. Dispatch TX_PENDING with the tx hash
   * 4. Wait for confirmation
   * 5. Dispatch CONFIRMED or FAILED
   *
   * Returns the receipt on success, or throws on failure.
   */
  const executeWithLifecycle = useCallback(
    async (
      step: MigrationStep,
      txProducer: () => Promise<ethers.ContractTransaction>
    ): Promise<ethers.ContractReceipt> => {
      // Guard: require wallet
      if (!account || !library) {
        throw new Error('Wallet not connected');
      }

      // Ensure provider is ready
      if (!providerReady) {
        recheckProvider();
        await wait(PROVIDER_WAIT_MS);
      }

      // WAITING_SIGNATURE
      const waitingExecution: StepExecution = {
        status: StepExecutionStatus.WAITING_SIGNATURE,
      };
      dispatch(
        migrationActions.updateStepExecution({ step, execution: waitingExecution })
      );

      let tx: ethers.ContractTransaction;
      try {
        tx = await txProducer();
      } catch (err: any) {
        // User rejected the signature
        if (isUserRejection(err)) {
          dispatch(
            migrationActions.updateStepExecution({
              step,
              execution: { status: StepExecutionStatus.IDLE, error: 'Transaction rejected by user' },
            })
          );
          throw err;
        }
        // Other error during signing/submission
        dispatch(
          migrationActions.updateStepExecution({
            step,
            execution: {
              status: StepExecutionStatus.FAILED,
              error: extractErrorMessage(err, 'Transaction submission failed'),
            },
          })
        );
        throw err;
      }

      // TX_PENDING
      dispatch(
        migrationActions.updateStepExecution({
          step,
          execution: { status: StepExecutionStatus.TX_PENDING, txHash: tx.hash },
        })
      );

      // Wait for confirmation
      let receipt: ethers.ContractReceipt;
      try {
        receipt = await waitForTxWithTimeout(tx, TX_WAIT_TIMEOUT_MS);
      } catch (err: any) {
        dispatch(
          migrationActions.updateStepExecution({
            step,
            execution: {
              status: StepExecutionStatus.FAILED,
              txHash: tx.hash,
              error: extractErrorMessage(err, 'Transaction confirmation failed'),
            },
          })
        );
        throw err;
      }

      // Check receipt status (0 = reverted)
      if (receipt.status === 0) {
        dispatch(
          migrationActions.updateStepExecution({
            step,
            execution: {
              status: StepExecutionStatus.FAILED,
              txHash: tx.hash,
              error: 'Transaction reverted',
            },
          })
        );
        throw new Error('Transaction reverted');
      }

      // CONFIRMED
      dispatch(
        migrationActions.updateStepExecution({
          step,
          execution: { status: StepExecutionStatus.CONFIRMED, txHash: tx.hash },
        })
      );

      return receipt;
    },
    [account, library, providerReady, recheckProvider, dispatch]
  );

  // ------------------------------------------------------------------
  // executeClaim
  // ------------------------------------------------------------------

  /**
   * Claims pending staking rewards by calling withdraw(0, 0) on the staking
   * contract. This triggers reward accumulation without unstaking any tokens.
   *
   * Feature-gated: only available when migrationConfig.claimEnabled is true.
   */
  const executeClaim = useCallback(async (): Promise<void> => {
    if (!migrationConfig.claimEnabled) {
      console.warn('[Migration] Claim is not enabled');
      return;
    }

    if (executingRef.current[MigrationStep.CLAIM_REWARDS]) return;
    executingRef.current[MigrationStep.CLAIM_REWARDS] = true;

    try {
      await executeWithLifecycle(MigrationStep.CLAIM_REWARDS, async () => {
        const signer = library!.getSigner(account!);
        const stakingContract = new ethers.Contract(
          migrationConfig.sepoliaStakingContract,
          CHN_STAKING_ABI as readonly Record<string, unknown>[],
          signer as any
        );
        // withdraw(pid=0, amount=0) triggers reward claim without unstaking
        return stakingContract.withdraw(POOL_ID, 0);
      });

      // Refresh data on success
      await Promise.resolve(refetch());
    } finally {
      executingRef.current[MigrationStep.CLAIM_REWARDS] = false;
    }
  }, [account, library, executeWithLifecycle, refetch]);

  // ------------------------------------------------------------------
  // executeApprove
  // ------------------------------------------------------------------

  /**
   * Approves the bridge contract to spend MaxUint256 XCN tokens from the
   * user's wallet. This is a one-time approval for unlimited bridging.
   */
  const executeApprove = useCallback(async (): Promise<void> => {
    if (executingRef.current[MigrationStep.APPROVE]) return;
    executingRef.current[MigrationStep.APPROVE] = true;

    try {
      await executeWithLifecycle(MigrationStep.APPROVE, async () => {
        const signer = library!.getSigner(account!);
        const xcnContract = new ethers.Contract(
          migrationConfig.sepoliaXcnAddress,
          ERC20_ABI as readonly Record<string, unknown>[],
          signer as any
        );
        const bridgeAddress = bridgeConfig.sepolia.bridgeAddress;

        // Estimate gas explicitly with fallback to exact amount
        let useExact = false;
        const fallbackAmount = snapshot.walletXcn || snapshot.staked || '0';
        const estimatedGas = await xcnContract.estimateGas
          .approve(bridgeAddress, ethers.constants.MaxUint256)
          .catch(() => {
            useExact = true;
            return xcnContract.estimateGas.approve(bridgeAddress, fallbackAmount);
          });

        return xcnContract.approve(
          bridgeAddress,
          useExact ? fallbackAmount : ethers.constants.MaxUint256,
          { gasLimit: calculateGasMargin(estimatedGas) }
        );
      });

      // Refresh allowance data on success
      await Promise.resolve(refetch());
    } finally {
      executingRef.current[MigrationStep.APPROVE] = false;
    }
  }, [account, library, executeWithLifecycle, refetch]);

  // ------------------------------------------------------------------
  // executeUnstake
  // ------------------------------------------------------------------

  /**
   * Unstakes the full staked amount from the staking contract by calling
   * withdraw(pid=0, fullStakedAmount). The staked amount is read from the
   * Redux snapshot at the time of execution.
   */
  const executeUnstake = useCallback(async (): Promise<void> => {
    if (executingRef.current[MigrationStep.UNSTAKE]) return;
    executingRef.current[MigrationStep.UNSTAKE] = true;

    try {
      // Read staked amount from snapshot
      const stakedAmount = snapshot.staked;
      if (!stakedAmount || stakedAmount === '0') {
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.UNSTAKE,
            execution: {
              status: StepExecutionStatus.FAILED,
              error: 'No tokens staked',
            },
          })
        );
        return;
      }

      await executeWithLifecycle(MigrationStep.UNSTAKE, async () => {
        const signer = library!.getSigner(account!);
        const stakingContract = new ethers.Contract(
          migrationConfig.sepoliaStakingContract,
          CHN_STAKING_ABI as readonly Record<string, unknown>[],
          signer as any
        );
        return stakingContract.withdraw(POOL_ID, stakedAmount);
      });

      // Refresh data on success (staked should become 0, walletXcn should increase)
      await Promise.resolve(refetch());
    } finally {
      executingRef.current[MigrationStep.UNSTAKE] = false;
    }
  }, [account, library, snapshot.staked, executeWithLifecycle, refetch, dispatch]);

  // ------------------------------------------------------------------
  // executeBridge (critical path -- TID 11.4)
  // ------------------------------------------------------------------

  /**
   * Executes the full bridge sequence with strict ordering (ADR-3):
   *
   * 1. Lock the stake toggle preference in Redux
   * 2. Generate an idempotency key (UUID)
   * 3. Build EIP-712 typed intent payload and sign via wallet
   * 4. Submit the stake preference to the migration API
   * 5. If API fails: unlock toggle, set error, DO NOT proceed to deposit
   * 6. Submit bridge.deposit() on-chain
   * 7. On deposit tx hash: bind origin tx hash to the intent
   * 8. If bind fails: set warning, retry in background with backoff
   * 9. Save pending operation to localStorage
   * 10. Set operation in Redux and transition to status view
   *
   * The refetch parameter is accepted here to allow a final data refresh
   * callback (passed through from the parent useMigrationData hook).
   */
  const executeBridge = useCallback(
    async (bridgeRefetch: () => void): Promise<void> => {
      if (executingRef.current[MigrationStep.BRIDGE]) return;
      executingRef.current[MigrationStep.BRIDGE] = true;

      // Guard: require wallet
      if (!account || !library) {
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.BRIDGE,
            execution: { status: StepExecutionStatus.FAILED, error: 'Wallet not connected' },
          })
        );
        executingRef.current[MigrationStep.BRIDGE] = false;
        return;
      }

      // Determine the amount to bridge from the latest available state.
      // Use snapshot first; if stale/zero (common right after unstake), read
      // directly from the token contract as a fallback.
      let bridgeAmount = snapshot.walletXcn;
      if (!bridgeAmount || bridgeAmount === '0') {
        try {
          const signer = library.getSigner(account);
          const signerAddress = await signer.getAddress();
          const xcnContract = new ethers.Contract(
            migrationConfig.sepoliaXcnAddress,
            ERC20_ABI as readonly Record<string, unknown>[],
            signer as any
          );
          const freshBalance = await xcnContract.balanceOf(signerAddress);
          bridgeAmount = freshBalance.toString();
        } catch (balanceErr) {
          console.warn('[Migration] Unable to resolve live XCN balance for bridge step:', balanceErr);
        }
      }

      if (!bridgeAmount || bridgeAmount === '0') {
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.BRIDGE,
            execution: { status: StepExecutionStatus.FAILED, error: 'No XCN to bridge' },
          })
        );
        executingRef.current[MigrationStep.BRIDGE] = false;
        return;
      }

      // ---- Step 1: Lock toggle ----
      // Migration now enforces post-bridge staking by default to align with Yield.
      const frozenStakePreference = true;
      dispatch(migrationActions.lockToggle());

      // ---- Dispatch WAITING_SIGNATURE ----
      dispatch(
        migrationActions.updateStepExecution({
          step: MigrationStep.BRIDGE,
          execution: { status: StepExecutionStatus.WAITING_SIGNATURE },
        })
      );

      try {
        // Ensure provider readiness
        if (!providerReady) {
          recheckProvider();
          await wait(PROVIDER_WAIT_MS);
        }

        // ---- Step 2: Generate idempotency key ----
        const idempotencyKey = uuidv4();

        // ---- Step 3: Resolve canonical signer identity ----
        const signer = library.getSigner();
        const signerAddress = ethers.utils.getAddress(await signer.getAddress());
        const { chainId } = await library.getNetwork();

        // ---- Step 4: Build EIP-712 typed data and sign ----
        const deadline = Math.floor(Date.now() / 1000) + INTENT_DEADLINE_MINUTES * 60;
        const nonce = Date.now(); // Use timestamp as nonce for uniqueness

        const domain = {
          name: EIP712_DOMAIN_NAME,
          version: EIP712_DOMAIN_VERSION,
          chainId, // Use active wallet chain to avoid provider/account drift issues
        };

        const types = {
          StakePreference: [
            { name: 'senderAddress', type: 'address' },
            { name: 'recipientAddress', type: 'address' },
            { name: 'amountAtomic', type: 'string' },
            { name: 'stakeOnGoliath', type: 'bool' },
            { name: 'idempotencyKey', type: 'string' },
            { name: 'deadline', type: 'uint256' },
            { name: 'nonce', type: 'string' },
          ],
        };

        const message = {
          senderAddress: signerAddress,
          recipientAddress: signerAddress, // Same wallet on Goliath
          amountAtomic: bridgeAmount,
          stakeOnGoliath: frozenStakePreference,
          idempotencyKey,
          deadline,
          nonce: String(nonce),
        };

        let signature: string;
        try {
          signature = await signer._signTypedData(domain, types, message);
        } catch (err: any) {
          if (isUserRejection(err)) {
            // User rejected: reset to IDLE, do NOT unlock toggle (per spec, toggle stays locked once bridge started)
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.IDLE,
                  error: 'Signature rejected by user',
                },
              })
            );
          } else {
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.FAILED,
                  error: extractErrorMessage(err, 'Failed to sign intent'),
                },
              })
            );
          }
          executingRef.current[MigrationStep.BRIDGE] = false;
          return;
        }

        // ---- Step 5: Submit stake preference to API ----
        const stakePreferencePayload: SubmitStakePreferenceRequest = {
          senderAddress: signerAddress,
          recipientAddress: signerAddress,
          amountAtomic: bridgeAmount,
          stakeOnGoliath: frozenStakePreference,
          idempotencyKey,
          deadline,
          nonce: String(nonce),
          signature,
        };

        let intentId: string;
        try {
          const response = await migrationApiClient.submitStakePreference(stakePreferencePayload);
          intentId = response.intentId;
        } catch (err: any) {
        // ---- Step 6: API failure -- do NOT proceed to deposit ----
          // Note: We do NOT unlock the toggle here. Per spec, once the bridge flow
          // has started the toggle stays locked to prevent inconsistency.
          dispatch(
            migrationActions.updateStepExecution({
              step: MigrationStep.BRIDGE,
              execution: {
                status: StepExecutionStatus.FAILED,
                error: extractErrorMessage(err, 'Failed to register stake preference'),
              },
            })
          );
          executingRef.current[MigrationStep.BRIDGE] = false;
          return;
        }

        // ---- Step 7: Submit bridge deposit on-chain ----
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.BRIDGE,
            execution: { status: StepExecutionStatus.WAITING_SIGNATURE },
          })
        );

        let depositTx: ethers.ContractTransaction;
        try {
          const bridgeContract = new ethers.Contract(
            bridgeConfig.sepolia.bridgeAddress,
            BRIDGE_SEPOLIA_ABI,
            signer as any
          );

          depositTx = await bridgeContract.deposit(
            migrationConfig.sepoliaXcnAddress,
            bridgeAmount,
            signerAddress // destination address = same wallet
          );
        } catch (err: any) {
          if (isUserRejection(err)) {
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.IDLE,
                  error: 'Deposit transaction rejected by user',
                },
              })
            );
          } else {
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.FAILED,
                  error: extractErrorMessage(err, 'Bridge deposit failed'),
                },
              })
            );
          }
          executingRef.current[MigrationStep.BRIDGE] = false;
          return;
        }

        // TX_PENDING -- deposit submitted
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.BRIDGE,
            execution: { status: StepExecutionStatus.TX_PENDING, txHash: depositTx.hash },
          })
        );

        // ---- Step 8: Bind origin tx hash to intent ----
        // Fire-and-forget with background retry. Non-blocking for the user.
        const bindPromise = retryBindOriginTxHash(intentId, signerAddress, depositTx.hash);

        // Handle bind result asynchronously -- set warning if all retries fail
        bindPromise.then(success => {
          if (!success) {
            console.error(
              '[Migration] All bindOriginTxHash retries exhausted. Manual intervention may be needed.'
            );
            // Set a warning on the step execution. The operation is still tracked
            // by the backend via the intent, so this is non-terminal.
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.TX_PENDING,
                  txHash: depositTx.hash,
                  error: 'Warning: Failed to link transaction to intent. The operation will still be processed.',
                },
              })
            );
          }
        });

        // ---- Step 9: Save pending operation to localStorage ----
        savePendingMigration(signerAddress, {
          originTxHash: depositTx.hash,
          intentId,
          stakeOnGoliath: frozenStakePreference,
        });

        // ---- Step 10: Set operation in Redux ----
        dispatch(
          migrationActions.setOperation({
            originTxHash: depositTx.hash,
            intentId,
            status: 'PENDING_ORIGIN_TX',
            stakeOnGoliath: frozenStakePreference,
            amount: bridgeAmount,
          })
        );

        // ---- Wait for deposit confirmation ----
        try {
          const receipt = await waitForTxWithTimeout(depositTx, TX_WAIT_TIMEOUT_MS);

          if (receipt.status === 0) {
            dispatch(
              migrationActions.updateStepExecution({
                step: MigrationStep.BRIDGE,
                execution: {
                  status: StepExecutionStatus.FAILED,
                  txHash: depositTx.hash,
                  error: 'Bridge deposit transaction reverted',
                },
              })
            );
            dispatch(
              migrationActions.updateOperationStatus({
                status: 'FAILED',
              })
            );
            return;
          }

          // CONFIRMED
          dispatch(
            migrationActions.updateStepExecution({
              step: MigrationStep.BRIDGE,
              execution: { status: StepExecutionStatus.CONFIRMED, txHash: depositTx.hash },
            })
          );

          // Update operation status
          dispatch(
            migrationActions.updateOperationStatus({
              status: 'CONFIRMING',
            })
          );
        } catch (err: any) {
          // Timeout or other wait error -- operation may still be processing
          // Mark as a warning but keep the operation tracked
          dispatch(
            migrationActions.updateStepExecution({
              step: MigrationStep.BRIDGE,
              execution: {
                status: StepExecutionStatus.TX_PENDING,
                txHash: depositTx.hash,
                error: extractErrorMessage(err, 'Waiting for confirmation timed out'),
              },
            })
          );
          // Keep the operation in a pending state -- the status polling hook will track it
        }

        // ---- Step 11: Transition to status view ----
        dispatch(migrationActions.setUiFlags({ isStatusView: true }));

        // Refresh data
        bridgeRefetch();
      } catch (err: any) {
        // Catch-all for unexpected errors
        dispatch(
          migrationActions.updateStepExecution({
            step: MigrationStep.BRIDGE,
            execution: {
              status: StepExecutionStatus.FAILED,
              error: extractErrorMessage(err, 'Bridge operation failed'),
            },
          })
        );
      } finally {
        executingRef.current[MigrationStep.BRIDGE] = false;
      }
    },
    [
      account,
      library,
      snapshot.walletXcn,
      providerReady,
      recheckProvider,
      dispatch,
    ]
  );

  return {
    executeClaim,
    executeApprove,
    executeUnstake,
    executeBridge,
  };
}
