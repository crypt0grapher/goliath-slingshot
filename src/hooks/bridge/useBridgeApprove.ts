import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { ERC20_ABI } from '../../constants/bridge/abis';

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

    try {
      const signer = library.getSigner(account);
      const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, signer as any);
      const bridgeAddress = getBridgeContractAddress(network);

      // Approve max uint256 for unlimited approval
      const tx = await tokenContract.approve(bridgeAddress, ethers.constants.MaxUint256);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error('Approval transaction failed');
      }

      return true;
    } catch (err: any) {
      const message = err?.message || 'Approval failed';
      setError(message);
      console.error('Approval error:', err);
      return false;
    } finally {
      setIsLoading(false);
      dispatch(bridgeActions.setApproving(false));
    }
  }, [account, library, token, network, dispatch]);

  return {
    approve,
    isLoading,
    error,
  };
}
