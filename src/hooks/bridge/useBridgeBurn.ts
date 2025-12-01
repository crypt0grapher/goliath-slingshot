import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useDispatch } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { BRIDGE_GOLIATH_ABI } from '../../constants/bridge/abis';
import { parseAmount } from '../../utils/bridge/amounts';

interface UseBurnReturn {
  burn: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeBurn(): UseBurnReturn {
  const { account, library } = useActiveWeb3React();
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

      try {
        const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.GOLIATH);
        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.GOLIATH);
        const bridgeAddress = getBridgeContractAddress(BridgeNetwork.GOLIATH);

        const signer = library.getSigner(account);
        const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_GOLIATH_ABI, signer as any);

        let tx: ethers.ContractTransaction;

        if (tokenConfig.isNative) {
          // Native XCN burn
          tx = await bridgeContract.burnNative(recipient, {
            value: amountAtomic.toString(),
          });
        } else {
          // ERC-20 burn
          tx = await bridgeContract.burn(tokenConfig.address, amountAtomic.toString(), recipient);
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
          requiredConfirmations: 6, // Goliath finality
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
    [account, library, dispatch]
  );

  return { burn, isLoading, error };
}
