// Bridge configuration types
export interface BridgeConfig {
  sepolia: {
    chainId: 11155111;
    rpcUrl: string;
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
    };
    goliath: {
      eth: string;
      usdc: string;
    };
  };
  statusApiBaseUrl: string;
  bridgeEnabled: boolean;
  allowCustomRecipient: boolean;
  minAmount: string;
  statusPollInterval: number;
}

function loadBridgeConfig(): BridgeConfig {
  return {
    sepolia: {
      chainId: 11155111 as const,
      rpcUrl: process.env.REACT_APP_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
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
      },
      goliath: {
        eth: process.env.REACT_APP_ETH_TOKEN_ADDRESS || '0x9d318b851a6AF920D467bC5dC9882b5DFD36D65e',
        usdc: process.env.REACT_APP_USDC_ADDRESS || '0xEf2B9f754405f52c80B5A67656f14672a00d23b4',
      },
    },
    statusApiBaseUrl: process.env.REACT_APP_BRIDGE_STATUS_API_URL || 'https://testnet.mirrornode.goliath.net/bridge/api/v1',
    bridgeEnabled: process.env.REACT_APP_BRIDGE_ENABLED === 'true',
    allowCustomRecipient: process.env.REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT === 'true',
    minAmount: process.env.REACT_APP_BRIDGE_MIN_AMOUNT || '0.000001',
    statusPollInterval: parseInt(process.env.REACT_APP_BRIDGE_STATUS_POLL_INTERVAL || '5000', 10),
  };
}

export const bridgeConfig = loadBridgeConfig();
