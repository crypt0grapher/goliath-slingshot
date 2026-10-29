import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeNetwork } from './networks';

export const BRIDGE_CONTRACT_ADDRESSES: Partial<Record<BridgeNetwork, string>> = {
  [BridgeNetwork.SEPOLIA]: bridgeConfig.sepolia.bridgeAddress,
  [BridgeNetwork.GOLIATH]: bridgeConfig.goliath.bridgeAddress,
};

export function getBridgeContractAddress(network: BridgeNetwork): string {
  const address = BRIDGE_CONTRACT_ADDRESSES[network];
  if (!address) throw new Error('LEGACY_BRIDGE_NETWORK_REQUIRED');
  return address;
}
