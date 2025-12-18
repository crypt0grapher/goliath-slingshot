import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useProviderReady } from '../useProviderReady';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { ERC20_ABI } from '../../constants/bridge/abis';

// Configuration for retry behavior (matches useApproveCallback)
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

interface UseBridgeApproveReturn {
  approve: () => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeApprove(
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): UseBridgeApproveReturn {
  const { account, library } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useCallback(async (): Promise<boolean> => {
    if (!account || !library) {
      setError('Wallet not connected');
      return false;
    }

    const tokenConfig = getTokenConfigForChain(token, network);
    if (tokenConfig.isNative || !tokenConfig.address) {
      // Native assets don't need approval
      return true;
    }

    setIsLoading(true);
    setError(null);
    dispatch(bridgeActions.setApproving(true));

    // Core approval execution logic
    const executeApproval = async (): Promise<boolean> => {
      const signer = library.getSigner(account);
      const tokenContract = new ethers.Contract(tokenConfig.address!, ERC20_ABI, signer as any);
      const bridgeAddress = getBridgeContractAddress(network);

      // Approve max uint256 for unlimited approval
      const tx = await tokenContract.approve(bridgeAddress, ethers.constants.MaxUint256);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error('Approval transaction failed');
      }

      return true;
    };

    try {
      // If provider is not ready, wait a moment and recheck
      if (!providerReady) {
        console.debug('Bridge: Provider not ready, waiting before approval...');
        recheckProvider();
        await wait(300);
      }

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= APPROVE_RETRY_CONFIG.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.debug(`Bridge: Approval retry attempt ${attempt}/${APPROVE_RETRY_CONFIG.maxRetries}`);
            // Wait before retry and recheck provider
            recheckProvider();
            await wait(APPROVE_RETRY_CONFIG.retryDelay);
          }

          const success = await executeApproval();
          return success;
        } catch (err: any) {
          lastError = err;

          // User rejected the transaction - don't retry
          if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
            console.debug('Bridge: User rejected token approval');
            setError('User rejected approval');
            return false;
          }

          // Don't retry if it's not a transient error
          if (!APPROVE_RETRY_CONFIG.shouldRetry(err)) {
            throw err;
          }

          // Don't retry on last attempt
          if (attempt === APPROVE_RETRY_CONFIG.maxRetries) {
            break;
          }

          console.debug(`Bridge: Approval attempt ${attempt + 1} failed, will retry:`, err.message);
        }
      }

      // If we get here, all retries failed
      throw lastError || new Error('Approval failed after multiple attempts');
    } catch (err: any) {
      const message = err?.message || 'Approval failed';
      setError(message);
      console.error('Bridge approval error:', err);
      return false;
    } finally {
      setIsLoading(false);
      dispatch(bridgeActions.setApproving(false));
    }
  }, [account, library, token, network, dispatch, providerReady, recheckProvider]);

  return {
    approve,
    isLoading,
    error,
  };
}
