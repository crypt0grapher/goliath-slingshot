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
        eth: process.env.REACT_APP_ETH_TOKEN_ADDRESS || '0xF22914De280D7B60255859bA6933831598fB5DD6',
        usdc: process.env.REACT_APP_USDC_ADDRESS || '0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E',
      },
    },
    statusApiBaseUrl: process.env.REACT_APP_BRIDGE_STATUS_API_URL || 'https://bridge-api-testnet.goliath.network/api/v1',
    bridgeEnabled: process.env.REACT_APP_BRIDGE_ENABLED === 'true',
    allowCustomRecipient: process.env.REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT === 'true',
    minAmount: process.env.REACT_APP_BRIDGE_MIN_AMOUNT || '0.000001',
    statusPollInterval: parseInt(process.env.REACT_APP_BRIDGE_STATUS_POLL_INTERVAL || '5000', 10),
  };
}

export const bridgeConfig = loadBridgeConfig();
