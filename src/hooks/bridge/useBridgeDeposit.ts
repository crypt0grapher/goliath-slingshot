import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useDispatch } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { BRIDGE_SEPOLIA_ABI } from '../../constants/bridge/abis';
import { parseAmount } from '../../utils/bridge/amounts';

interface UseDepositReturn {
  deposit: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeDeposit(): UseDepositReturn {
  const { account, library } = useActiveWeb3React();
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

      try {
        const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.SEPOLIA);
        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.SEPOLIA);
        const bridgeAddress = getBridgeContractAddress(BridgeNetwork.SEPOLIA);

        const signer = library.getSigner(account);
        const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_SEPOLIA_ABI, signer as any);

        let tx: ethers.ContractTransaction;

        if (tokenConfig.isNative) {
          // Native ETH deposit - use depositNative function
          tx = await bridgeContract.depositNative(recipient, {
            value: amountAtomic.toString(),
          });
        } else {
          // ERC-20 deposit
          tx = await bridgeContract.deposit(tokenConfig.address, amountAtomic.toString(), recipient);
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
          requiredConfirmations: 10,
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
    [account, library, dispatch]
  );

  return { deposit, isLoading, error };
}
