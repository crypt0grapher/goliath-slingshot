import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeNetwork } from './networks';

export const BRIDGE_CONTRACT_ADDRESSES: Record<BridgeNetwork, string> = {
  [BridgeNetwork.SEPOLIA]: bridgeConfig.sepolia.bridgeAddress,
  [BridgeNetwork.GOLIATH]: bridgeConfig.goliath.bridgeAddress,
};

export function getBridgeContractAddress(network: BridgeNetwork): string {
  return BRIDGE_CONTRACT_ADDRESSES[network];
}
