import { Contract } from '@ethersproject/contracts';
import { useMemo } from 'react';
import { useActiveWeb3React } from '../index';
import { getContract } from '../../utils';
import { STAKED_XCN_ADDRESS } from '../../constants/staking';
import { STAKED_XCN_ABI } from '../../abis/StakedXCN';
import { getReadonlyProvider } from '../../services/bridgeProviders';
import { BridgeNetwork } from '../../constants/bridge/networks';

/**
 * Returns a StakedXCN contract instance.
 *
 * - `withSignerIfPossible = true` (default): uses the wallet's provider/signer
 *   for write operations (stake, unstake). Requires wallet connected to Goliath.
 * - `withSignerIfPossible = false`: uses the read-only Goliath provider with
 *   explicit network metadata, avoiding NETWORK_ERROR when the wallet is on a
 *   different chain (e.g. Sepolia). Used by useYieldData and useStakingEvents.
 */
export function useStakedXCNContract(withSignerIfPossible = true): Contract | null {
  const { library, account, chainId } = useActiveWeb3React();

  // For read-only mode, always use the Goliath address (chain 8901).
  // For signer mode, use the connected chain's address.
  const address = withSignerIfPossible
    ? (chainId ? STAKED_XCN_ADDRESS[chainId] : undefined)
    : STAKED_XCN_ADDRESS[8901];

  return useMemo(() => {
    if (!address) return null;

    try {
      if (withSignerIfPossible) {
        // Write mode: wallet provider + signer (existing behavior)
        if (!library) return null;
        return getContract(address, STAKED_XCN_ABI, library, account ? account : undefined);
      }

      // Read-only mode: explicit Goliath provider (same pattern as Bridge)
      const readonlyProvider = getReadonlyProvider(BridgeNetwork.GOLIATH);
      return new Contract(address, STAKED_XCN_ABI, readonlyProvider);
    } catch (error) {
      console.error('Failed to get StakedXCN contract', error);
      return null;
    }
  }, [address, library, withSignerIfPossible, account]);
}
