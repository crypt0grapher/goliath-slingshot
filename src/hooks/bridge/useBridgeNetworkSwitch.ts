import { useCallback, useState } from 'react';
import { useActiveWeb3React } from '../index';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';

interface UseBridgeNetworkSwitchReturn {
  switchNetwork: (network: BridgeNetwork) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeNetworkSwitch(): UseBridgeNetworkSwitchReturn {
  const { library } = useActiveWeb3React();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchNetwork = useCallback(
    async (network: BridgeNetwork): Promise<boolean> => {
      if (!library?.provider?.request) {
        setError('Wallet does not support network switching');
        return false;
      }

      setIsLoading(true);
      setError(null);

      const metadata = NETWORK_METADATA[network];
      const chainIdHex = `0x${metadata.chainId.toString(16)}`;

      try {
        // Try to switch to the network
        await library.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        return true;
      } catch (switchError: any) {
        // If the network is not added, try to add it
        if (switchError.code === 4902) {
          try {
            await library.provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: chainIdHex,
                  chainName: metadata.displayName,
                  nativeCurrency: metadata.nativeCurrency,
                  rpcUrls: [metadata.rpcUrl],
                  blockExplorerUrls: [metadata.explorerUrl],
                },
              ],
            });
            return true;
          } catch (addError: any) {
            setError(addError.message || 'Failed to add network');
            return false;
          }
        } else {
          setError(switchError.message || 'Failed to switch network');
          return false;
        }
      } finally {
        setIsLoading(false);
      }
    },
    [library]
  );

  return {
    switchNetwork,
    isLoading,
    error,
  };
}
