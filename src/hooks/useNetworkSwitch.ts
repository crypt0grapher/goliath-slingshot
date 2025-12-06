import { useCallback, useState } from 'react';
import { useActiveWeb3React } from './index';

export const GOLIATH_TESTNET_CHAIN_ID = 8901;

const GOLIATH_NETWORK_CONFIG = {
  chainId: `0x${GOLIATH_TESTNET_CHAIN_ID.toString(16)}`,
  chainName: 'Goliath Testnet',
  nativeCurrency: {
    name: 'Onyxcoin',
    symbol: 'XCN',
    decimals: 18,
  },
  rpcUrls: ['https://testnet.rpc.goliath.net'],
  blockExplorerUrls: ['https://testnet.explorer.goliath.net'],
};

interface UseNetworkSwitchReturn {
  switchToGoliath: () => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  isOnGoliath: boolean;
}

export function useNetworkSwitch(): UseNetworkSwitchReturn {
  const { library, chainId } = useActiveWeb3React();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOnGoliath = chainId === GOLIATH_TESTNET_CHAIN_ID;

  const switchToGoliath = useCallback(async (): Promise<boolean> => {
    if (!library?.provider?.request) {
      setError('Wallet does not support network switching');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Try to switch to Goliath Testnet
      await library.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: GOLIATH_NETWORK_CONFIG.chainId }],
      });
      return true;
    } catch (switchError: any) {
      // If the network is not added (error code 4902), try to add it
      if (switchError.code === 4902) {
        try {
          await library.provider.request({
            method: 'wallet_addEthereumChain',
            params: [GOLIATH_NETWORK_CONFIG],
          });
          return true;
        } catch (addError: any) {
          setError(addError.message || 'Failed to add Goliath network');
          return false;
        }
      } else {
        setError(switchError.message || 'Failed to switch network');
        return false;
      }
    } finally {
      setIsLoading(false);
    }
  }, [library]);

  return {
    switchToGoliath,
    isLoading,
    error,
    isOnGoliath,
  };
}
