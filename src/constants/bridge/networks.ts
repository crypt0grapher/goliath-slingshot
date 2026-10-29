import { bridgeConfig } from '../../config/bridgeConfig';

export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
  ROBINHOOD = 'ROBINHOOD',
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
  [BridgeNetwork.ROBINHOOD]: {
    chainId: 46630,
    displayName: 'Robinhood Chain Testnet',
    shortName: 'Robinhood',
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
    blockTime: 1,
    finalityBlocks: 0,
    iconUrl: '/images/chains/ethereum.svg',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  [BridgeNetwork.SEPOLIA]: {
    chainId: 11155111,
    displayName: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    rpcUrl: bridgeConfig.sepolia.rpcUrl,
    explorerUrl: bridgeConfig.sepolia.explorerUrl,
    blockTime: 12,
    finalityBlocks: 3,
    iconUrl: '/images/chains/ethereum.svg',
    nativeCurrency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  [BridgeNetwork.GOLIATH]: {
    chainId: 8901,
    displayName: 'Onyx Testnet',
    shortName: 'Onyx',
    rpcUrl: bridgeConfig.goliath.rpcUrl,
    explorerUrl: bridgeConfig.goliath.explorerUrl,
    blockTime: 2,
    finalityBlocks: 0,
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
  if (chainId === 46630) return BridgeNetwork.ROBINHOOD;
  return null;
}

export function getOppositeNetwork(network: BridgeNetwork): BridgeNetwork {
  return network === BridgeNetwork.SEPOLIA ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;
}

// Hedera-SDK deliveries (bridge GOLIATH_TX_MODE=hedera) record a consensus timestamp
// ("<sec>.<nanos>") or a Hedera tx id ("<shard>.<realm>.<num>@<sec>.<nanos>"), not a 0x hash.
// Blockscout cannot resolve those; the Hiero validators explorer can.
const GOLIATH_NATIVE_TX_EXPLORER_URL = 'https://validators.testnet.onyx.org/testnet/transaction';
const GOLIATH_NATIVE_TX_ID = /^(\d+\.\d+\.\d+@)?\d+\.\d+$/;

export function getExplorerTxUrl(network: BridgeNetwork, txHash: string): string {
  if (network === BridgeNetwork.GOLIATH && GOLIATH_NATIVE_TX_ID.test(txHash)) {
    return `${GOLIATH_NATIVE_TX_EXPLORER_URL}/${txHash}`;
  }
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(network: BridgeNetwork, address: string): string {
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/address/${address}`;
}
