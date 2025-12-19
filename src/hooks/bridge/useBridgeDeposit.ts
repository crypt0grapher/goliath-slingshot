import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useProviderReady } from '../useProviderReady';
import { useDispatch } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { BRIDGE_SEPOLIA_ABI } from '../../constants/bridge/abis';
import { parseAmount } from '../../utils/bridge/amounts';

// Configuration for retry behavior
const DEPOSIT_RETRY_CONFIG = {
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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface UseDepositReturn {
  deposit: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeDeposit(): UseDepositReturn {
  const { account, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (token: BridgeTokenSymbol, amountHuman: string, recipient: string): Promise<string> => {
      if (!account || !library) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      // If provider is not ready, wait a moment and recheck
      if (!providerReady) {
        console.debug('Bridge: Provider not ready, waiting before deposit...');
        recheckProvider();
        await wait(300);
      }

      const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.SEPOLIA);
      const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.SEPOLIA);
      const bridgeAddress = getBridgeContractAddress(BridgeNetwork.SEPOLIA);

      // Core deposit execution logic
      const executeDeposit = async (): Promise<ethers.ContractTransaction> => {
        const signer = library.getSigner(account);
        const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_SEPOLIA_ABI, signer as any);

        if (tokenConfig.isNative) {
          // Native ETH deposit - use depositNative function
          return bridgeContract.depositNative(recipient, {
            value: amountAtomic.toString(),
          });
        } else {
          // ERC-20 deposit
          return bridgeContract.deposit(tokenConfig.address, amountAtomic.toString(), recipient);
        }
      };

      let tx: ethers.ContractTransaction;
      let lastError: Error | null = null;

      try {
        for (let attempt = 0; attempt <= DEPOSIT_RETRY_CONFIG.maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              console.debug(`Bridge: Deposit retry attempt ${attempt}/${DEPOSIT_RETRY_CONFIG.maxRetries}`);
              recheckProvider();
              await wait(DEPOSIT_RETRY_CONFIG.retryDelay);
            }

            tx = await executeDeposit();
            break; // Success
          } catch (err: any) {
            lastError = err;

            if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
              console.debug('Bridge: User rejected deposit transaction');
              throw err;
            }

            if (!DEPOSIT_RETRY_CONFIG.shouldRetry(err) || attempt === DEPOSIT_RETRY_CONFIG.maxRetries) {
              throw err;
            }

            console.debug(`Bridge: Deposit attempt ${attempt + 1} failed, will retry:`, err.message);
          }
        }

        if (!tx!) {
          throw lastError || new Error('Deposit failed after multiple attempts');
        }

        // Create operation record
        const operationId = uuidv4();
        const operation = {
          id: operationId,
          direction: 'SEPOLIA_TO_GOLIATH' as const,
          token,
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          sender: account,
          recipient,
          originChainId: 11155111,
          destinationChainId: 8901,
          originTxHash: tx.hash,
          destinationTxHash: null,
          depositId: null,
          withdrawId: null,
          status: 'PENDING_ORIGIN_TX' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originConfirmations: 0,
          requiredConfirmations: 3,
          errorMessage: null,
          estimatedCompletionTime: null,
        };

        dispatch(bridgeActions.addOperation(operation));
        dispatch(bridgeActions.closeConfirmModal());
        dispatch(bridgeActions.openStatusModal(operationId));

        // Wait for tx to be mined
        const receipt = await tx.wait();

        if (receipt.status === 0) {
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'FAILED',
              errorMessage: 'Transaction reverted',
            })
          );
          throw new Error('Transaction reverted');
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
        const message = err?.message || 'Deposit failed';
        setError(message);
        dispatch(bridgeActions.setError(message));
        throw err;
      } finally {
        setIsLoading(false);
        dispatch(bridgeActions.setSubmitting(false));
      }
    },
    [account, library, dispatch, providerReady, recheckProvider]
  );

  return { deposit, isLoading, error };
}
