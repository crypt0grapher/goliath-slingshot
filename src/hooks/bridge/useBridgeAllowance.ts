import { useState, useEffect, useCallback } from 'react';
import { useActiveWeb3React } from '../index';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getBridgeContractAddress } from '../../constants/bridge/contracts';
import { getTokenAllowance } from '../../services/bridgeProviders';
import { parseAmount } from '../../utils/bridge/amounts';

interface UseBridgeAllowanceOptions {
  skip?: boolean;
}

interface UseBridgeAllowanceReturn {
  hasAllowance: boolean;
  allowanceAtomic: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBridgeAllowance(
  token: BridgeTokenSymbol,
  network: BridgeNetwork,
  amount: string,
  options: UseBridgeAllowanceOptions = {}
): UseBridgeAllowanceReturn {
  const { account, chainId } = useActiveWeb3React();
  const [allowanceAtomic, setAllowanceAtomic] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenConfig = getTokenConfigForChain(token, network);
  const expectedChainId = NETWORK_METADATA[network].chainId;
  const shouldSkip = options.skip || tokenConfig.isNative || !tokenConfig.address;

  const fetchAllowance = useCallback(async () => {
    if (!account || shouldSkip || chainId !== expectedChainId) {
      setAllowanceAtomic(BigInt(0));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const bridgeAddress = getBridgeContractAddress(network);
      const allowance = await getTokenAllowance(
        tokenConfig.address!,
        account,
        bridgeAddress,
        network
      );
      setAllowanceAtomic(allowance);
    } catch (err) {
      console.error('Error fetching allowance:', err);
      setError('Failed to fetch allowance');
      setAllowanceAtomic(BigInt(0));
    } finally {
      setIsLoading(false);
    }
  }, [account, chainId, expectedChainId, network, shouldSkip, tokenConfig.address]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance]);

  // Check if allowance is sufficient for the amount
  let hasAllowance = false;
  if (shouldSkip) {
    // Native assets don't need approval
    hasAllowance = true;
  } else if (amount && parseFloat(amount) > 0) {
    try {
      const amountAtomic = parseAmount(amount, token, network);
      hasAllowance = allowanceAtomic >= amountAtomic;
    } catch {
      hasAllowance = false;
    }
  }

  return {
    hasAllowance,
    allowanceAtomic,
    isLoading,
    error,
    refetch: fetchAllowance,
  };
}
