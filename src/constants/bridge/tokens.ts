import { BridgeNetwork } from './networks';
import { bridgeConfig } from '../../config/bridgeConfig';

// v1.0: USDC and ETH. Future versions will add 'XCN' | 'BTC'
export type BridgeTokenSymbol = 'USDC' | 'ETH';

export interface ChainTokenConfig {
  address: string | null; // null = native asset
  decimals: number;
  isNative: boolean;
}

export interface BridgeTokenConfig {
  symbol: BridgeTokenSymbol;
  name: string;
  logoUrl: string;
  sepolia: ChainTokenConfig;
  goliath: ChainTokenConfig;
}

// v1.0: USDC and ETH configuration
// Token addresses are loaded from bridgeConfig (environment variables) for consistency with backend
export const BRIDGE_TOKENS: Record<BridgeTokenSymbol, BridgeTokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    logoUrl: '/images/tokens/usdc.svg',
    sepolia: {
      // Circle's official Sepolia USDC
      address: bridgeConfig.tokens.sepolia.usdc,
      decimals: 6,
      isNative: false,
    },
    goliath: {
      address: bridgeConfig.tokens.goliath.usdc,
      decimals: 6,
      isNative: false,
    },
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    logoUrl: '/images/tokens/eth.svg',
    sepolia: {
      // ETH is NATIVE on Sepolia
      address: null,
      decimals: 18,
      isNative: true,
    },
    goliath: {
      // ETH is ERC-20 on Goliath - address from env for consistency with backend
      address: bridgeConfig.tokens.goliath.eth,
      decimals: 18,
      isNative: false,
    },
  },
};

// v1.0: ETH only
export const BRIDGE_TOKEN_LIST: BridgeTokenSymbol[] = ['ETH'];

// Default token for bridge form
export const DEFAULT_BRIDGE_TOKEN: BridgeTokenSymbol = 'ETH';

/**
 * Get token config for a specific chain
 */
export function getTokenConfigForChain(
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): ChainTokenConfig {
  const config = BRIDGE_TOKENS[token];
  return network === BridgeNetwork.SEPOLIA ? config.sepolia : config.goliath;
}

/**
 * Check if token requires approval on a given chain
 * Native assets do not require approval
 */
export function tokenRequiresApproval(token: BridgeTokenSymbol, network: BridgeNetwork): boolean {
  const config = getTokenConfigForChain(token, network);
  return !config.isNative;
}

/**
 * Get gas buffer for MAX button (native assets only)
 * v1.0: ETH on Sepolia is native, needs gas buffer
 */
export function getGasBuffer(token: BridgeTokenSymbol, network: BridgeNetwork): string {
  const config = getTokenConfigForChain(token, network);
  if (!config.isNative) {
    return '0';
  }
  // Reserve 0.01 units for gas when bridging native assets
  return '0.01';
}
