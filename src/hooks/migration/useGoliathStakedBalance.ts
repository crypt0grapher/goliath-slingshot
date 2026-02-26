import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getReadonlyProvider } from '../../services/bridgeProviders';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { stakingConfig } from '../../config/stakingConfig';
import { STXCN_DECIMALS } from '../../constants/staking';

const POLL_INTERVAL_MS = 30_000;
const DISPLAY_DECIMALS = 1;

const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)'];

function formatBalance(wei: ethers.BigNumber): string {
  const formatted = ethers.utils.formatUnits(wei, STXCN_DECIMALS);
  const parts = formatted.split('.');
  if (parts.length === 2 && parts[1].length > DISPLAY_DECIMALS) {
    return `${parts[0]}.${parts[1].slice(0, DISPLAY_DECIMALS)}`;
  }
  return formatted;
}

export interface UseGoliathStakedBalanceResult {
  balance: string;
  loading: boolean;
}

/**
 * Fetches the user's stXCN balance on Goliath using a read-only provider.
 * Works regardless of which chain the user's wallet is connected to.
 */
export function useGoliathStakedBalance(
  account: string | null | undefined
): UseGoliathStakedBalanceResult {
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchBalance = useCallback(async () => {
    if (!account || !stakingConfig.stxcnAddress) {
      setBalance('0');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const provider = getReadonlyProvider(BridgeNetwork.GOLIATH);
      const contract = new ethers.Contract(stakingConfig.stxcnAddress, BALANCE_OF_ABI, provider);
      const raw: ethers.BigNumber = await contract.balanceOf(account);

      if (mountedRef.current) {
        setBalance(formatBalance(raw));
      }
    } catch (err) {
      console.error('[useGoliathStakedBalance] Failed to fetch stXCN balance:', err);
      if (mountedRef.current) {
        setBalance('0');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [account]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBalance();
    const id = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchBalance]);

  return { balance, loading };
}
