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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface UseBurnReturn {
  burn: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeBurn(): UseBurnReturn {
  const { account, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const burn = useCallback(
    async (token: BridgeTokenSymbol, amountHuman: string, recipient: string): Promise<string> => {
      if (!account || !library) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      // If provider is not ready, wait a moment and recheck
      if (!providerReady) {
        console.debug('Bridge: Provider not ready, waiting before burn...');
        recheckProvider();
        await wait(300);
      }

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
        throw new Error('Native token burning is not supported. Please use wrapped token.');
      }

      // Core burn execution logic
      const executeBurn = async (): Promise<ethers.ContractTransaction> => {
        const signer = library.getSigner(account);
        const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_GOLIATH_ABI, signer as any);
        return bridgeContract.burn(tokenConfig.address, amountAtomic.toString(), recipient);
      };

      let tx: ethers.ContractTransaction;
      let lastError: Error | null = null;

      try {
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
          throw lastError || new Error('Burn failed after multiple attempts');
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
        const message = err?.message || 'Burn failed';
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

  return { burn, isLoading, error };
}
