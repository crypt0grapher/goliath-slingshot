// Bridge configuration types
export interface BridgeConfig {
  sepolia: {
    chainId: 11155111;
    rpcUrls: string[];
    /** @deprecated Use rpcUrls[0] — kept for backwards compatibility */
    rpcUrl: string;
    /** @deprecated Use rpcUrls[1] — kept for backwards compatibility */
    rpcUrlFallback: string;
    /** @deprecated Use rpcUrls.slice(1) — kept for backwards compatibility */
    rpcUrlFallbacks: string[];
    explorerUrl: string;
    bridgeAddress: string;
  };
  goliath: {
    chainId: 8901;
    rpcUrl: string;
    explorerUrl: string;
    bridgeAddress: string;
  };
  tokens: {
    sepolia: {
      usdc: string;
      xcn: string;
    };
    goliath: {
      eth: string;
      usdc: string;
    };
  };
  relayerWalletAddress: string;
  statusApiBaseUrl: string;
  bridgeEnabled: boolean;
  allowCustomRecipient: boolean;
  minAmount: string;
  statusPollInterval: number;
}

const DEFAULT_SEPOLIA_RPC_URLS = [
  'https://ethereum-sepolia.core.chainstack.com/994184e51c801ad4cdcaee72e84c28ed',
  'https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt',
  'https://ethereum-sepolia-rpc.publicnode.com',
];

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadBridgeConfig(): BridgeConfig {
  const sepoliaRpcUrls = uniqueNonEmpty([
    ...parseCsv(process.env.REACT_APP_SEPOLIA_RPC_URLS),
    process.env.REACT_APP_SEPOLIA_RPC_URL || '',
    process.env.REACT_APP_SEPOLIA_RPC_URL_FALLBACK || '',
    ...parseCsv(process.env.REACT_APP_SEPOLIA_RPC_URL_FALLBACKS),
    ...DEFAULT_SEPOLIA_RPC_URLS,
  ]);

  return {
    sepolia: {
      chainId: 11155111 as const,
      rpcUrls: sepoliaRpcUrls,
      get rpcUrl() {
        return this.rpcUrls[0];
      },
      get rpcUrlFallback() {
        return this.rpcUrls[1] || '';
      },
      get rpcUrlFallbacks() {
        return this.rpcUrls.slice(1);
      },
      explorerUrl: process.env.REACT_APP_SEPOLIA_EXPLORER_URL || 'https://sepolia.etherscan.io',
      bridgeAddress: process.env.REACT_APP_BRIDGE_SEPOLIA_ADDRESS || '0x0000000000000000000000000000000000000000',
    },
    goliath: {
      chainId: 8901 as const,
      rpcUrl: process.env.REACT_APP_NETWORK_URL || 'https://rpc.testnet.goliath.net',
      explorerUrl: process.env.REACT_APP_EXPLORER_URL || 'https://testnet.explorer.goliath.net',
      bridgeAddress: process.env.REACT_APP_BRIDGE_GOLIATH_ADDRESS || '0x0000000000000000000000000000000000000000',
    },
    tokens: {
      sepolia: {
        usdc: process.env.REACT_APP_SEPOLIA_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        xcn: process.env.REACT_APP_SEPOLIA_XCN_ADDRESS || '0x7a8adc542A35c93da263A188367F4bF4c445B8E9',
      },
      goliath: {
        eth: process.env.REACT_APP_ETH_TOKEN_ADDRESS || '0xEd02AA7dd3f105EDab8702D859781CAfF111324b',
        usdc: process.env.REACT_APP_USDC_ADDRESS || '0x4BE65Dce1D79B8728485B759eE06cC8053E824F4',
      },
    },
    relayerWalletAddress: process.env.REACT_APP_BRIDGE_RELAYER_WALLET || '0xE708B75F7b6914479E63D3897bEF9e0dedcA3640',
    statusApiBaseUrl: process.env.REACT_APP_BRIDGE_STATUS_API_URL || 'https://testnet.mirrornode.goliath.net/bridge/api/v1',
    bridgeEnabled: process.env.REACT_APP_BRIDGE_ENABLED === 'true',
    allowCustomRecipient: process.env.REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT === 'true',
    minAmount: process.env.REACT_APP_BRIDGE_MIN_AMOUNT || '0.000001',
    statusPollInterval: parseInt(process.env.REACT_APP_BRIDGE_STATUS_POLL_INTERVAL || '500', 10),
  };
}

export const bridgeConfig = loadBridgeConfig();
