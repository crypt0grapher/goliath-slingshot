import { bridgeConfig } from '../../config/bridgeConfig';

export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
}

export interface NetworkMetadata {
  chainId: number;
  displayName: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  blockTime: number; // seconds
  finalityBlocks: number;
  iconUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const NETWORK_METADATA: Record<BridgeNetwork, NetworkMetadata> = {
  [BridgeNetwork.SEPOLIA]: {
    chainId: 11155111,
    displayName: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    rpcUrl: bridgeConfig.sepolia.rpcUrl,
    explorerUrl: bridgeConfig.sepolia.explorerUrl,
    blockTime: 12,
    finalityBlocks: 12,
    iconUrl: '/images/chains/ethereum.svg',
    nativeCurrency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  [BridgeNetwork.GOLIATH]: {
    chainId: 8901,
    displayName: 'Goliath Testnet',
    shortName: 'Goliath',
    rpcUrl: bridgeConfig.goliath.rpcUrl,
    explorerUrl: bridgeConfig.goliath.explorerUrl,
    blockTime: 2,
    finalityBlocks: 6,
    iconUrl: '/images/chains/goliath.svg',
    nativeCurrency: {
      name: 'XCN',
      symbol: 'XCN',
      decimals: 18, // RPC decimals
    },
  },
};

export function getNetworkByChainId(chainId: number): BridgeNetwork | null {
  if (chainId === 11155111) return BridgeNetwork.SEPOLIA;
  if (chainId === 8901) return BridgeNetwork.GOLIATH;
  return null;
}

export function getOppositeNetwork(network: BridgeNetwork): BridgeNetwork {
  return network === BridgeNetwork.SEPOLIA ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;
}

export function getExplorerTxUrl(network: BridgeNetwork, txHash: string): string {
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(network: BridgeNetwork, address: string): string {
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/address/${address}`;
}
