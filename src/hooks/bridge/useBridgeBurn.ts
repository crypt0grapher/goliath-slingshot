import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useProviderReady } from '../useProviderReady';
import { useDispatch } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { BRIDGE_GOLIATH_ABI } from '../../constants/bridge/abis';
import { parseAmount } from '../../utils/bridge/amounts';

// Configuration for retry behavior
const BURN_RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 500, // ms
  shouldRetry: (error: any): boolean => {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
      return false;
    }
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('nonce') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('provider') ||
      errorMessage.includes('unexpected')
    );
  },
};

// Timeout for tx.wait() to prevent indefinite hanging
const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Wait for transaction with timeout to prevent indefinite hanging
const waitForTxWithTimeout = async (
  tx: ethers.ContractTransaction,
  timeoutMs: number
): Promise<ethers.ContractReceipt> => {
  return Promise.race([
    tx.wait(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(i18n.t('errorTransactionTakingLong'))),
        timeoutMs
      )
    ),
  ]);
};

// Check for pending transactions that could block new ones
const checkPendingTransactions = async (
  provider: { getTransactionCount: (address: string, blockTag: string) => Promise<number> },
  account: string
): Promise<void> => {
  try {
    const [pendingNonce, confirmedNonce] = await Promise.all([
      provider.getTransactionCount(account, 'pending'),
      provider.getTransactionCount(account, 'latest'),
    ]);

    if (pendingNonce > confirmedNonce) {
      const pendingCount = pendingNonce - confirmedNonce;
      throw new Error(
        pendingCount > 1
          ? i18n.t('errorPendingTransactions', { count: pendingCount })
          : i18n.t('errorPendingTransactionSingle')
      );
    }
  } catch (err: any) {
    // If the error is our pending tx warning, rethrow it
    if (err.message?.includes('pending transaction')) {
      throw err;
    }
    // Otherwise log and continue - don't block on nonce check failures
    console.debug('Bridge: Could not check pending transactions:', err.message);
  }
};

interface UseBurnReturn {
  burn: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeBurn(): UseBurnReturn {
  const { t } = useTranslation();
  const { account, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const burn = useCallback(
    async (token: BridgeTokenSymbol, amountHuman: string, recipient: string): Promise<string> => {
      if (!account || !library) {
        throw new Error(t('errorWalletNotConnected'));
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      try {
        // If provider is not ready, wait a moment and recheck
        if (!providerReady) {
          console.debug('Bridge: Provider not ready, waiting before burn...');
          recheckProvider();
          await wait(300);
        }

        // Check for pending transactions that could block this one
        await checkPendingTransactions(library, account);

        const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.GOLIATH);
        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.GOLIATH);
        const bridgeAddress = getBridgeContractAddress(BridgeNetwork.GOLIATH);

        // Debug: log amount conversion
        console.log('[Bridge] Amount conversion:', {
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          token,
          decimals: tokenConfig.decimals,
        });

        if (tokenConfig.isNative) {
          throw new Error(t('errorNativeBurnNotSupported'));
        }

        // Core burn execution logic
        const executeBurn = async (): Promise<ethers.ContractTransaction> => {
          const signer = library.getSigner(account);
          const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_GOLIATH_ABI, signer as any);
          return bridgeContract.burn(tokenConfig.address, amountAtomic.toString(), recipient);
        };

        let tx: ethers.ContractTransaction;
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= BURN_RETRY_CONFIG.maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              console.debug(`Bridge: Burn retry attempt ${attempt}/${BURN_RETRY_CONFIG.maxRetries}`);
              recheckProvider();
              await wait(BURN_RETRY_CONFIG.retryDelay);
            }

            tx = await executeBurn();
            break; // Success
          } catch (err: any) {
            lastError = err;

            if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
              console.debug('Bridge: User rejected burn transaction');
              throw err;
            }

            if (!BURN_RETRY_CONFIG.shouldRetry(err) || attempt === BURN_RETRY_CONFIG.maxRetries) {
              throw err;
            }

            console.debug(`Bridge: Burn attempt ${attempt + 1} failed, will retry:`, err.message);
          }
        }

        if (!tx!) {
          throw lastError || new Error(t('errorBurnFailedRetry'));
        }

        // Create operation record
        const operationId = uuidv4();
        const operation = {
          id: operationId,
          direction: 'GOLIATH_TO_SEPOLIA' as const,
          token,
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          sender: account,
          recipient,
          originChainId: 8901,
          destinationChainId: 11155111,
          originTxHash: tx.hash,
          destinationTxHash: null,
          depositId: null,
          withdrawId: null,
          status: 'PENDING_ORIGIN_TX' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originConfirmations: 0,
          requiredConfirmations: 0,
          errorMessage: null,
          estimatedCompletionTime: null,
        };

        dispatch(bridgeActions.addOperation(operation));
        dispatch(bridgeActions.closeConfirmModal());
        dispatch(bridgeActions.openStatusModal(operationId));

        // Wait for tx to be mined with timeout to prevent indefinite hanging
        let receipt: ethers.ContractReceipt;
        try {
          receipt = await waitForTxWithTimeout(tx, TX_WAIT_TIMEOUT_MS);
        } catch (timeoutErr: any) {
          // Transaction timed out but may still complete - mark as DELAYED, not FAILED
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'DELAYED',
              errorMessage: timeoutErr.message,
            })
          );
          // Don't throw - the operation is still tracked and will be polled
          return operationId;
        }

        if (receipt.status === 0) {
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'FAILED',
              errorMessage: t('errorTransactionReverted'),
            })
          );
          throw new Error(t('errorTransactionReverted'));
        }

        // Update status to confirming
        dispatch(
          bridgeActions.updateOperationStatus({
            id: operationId,
            status: 'CONFIRMING',
            originConfirmations: 1,
          })
        );

        return operationId;
      } catch (err: any) {
        const message = err?.message || 'Burn failed';
        setError(message);
        dispatch(bridgeActions.setError(message));
        throw err;
      } finally {
        setIsLoading(false);
        dispatch(bridgeActions.setSubmitting(false));
      }
    },
    [t, account, library, dispatch, providerReady, recheckProvider]
  );

  return { burn, isLoading, error };
}
