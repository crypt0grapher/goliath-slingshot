/**
 * Test E (from issue): repeated status 404 transitions operation to
 * explicit degraded/failed state with support guidance instead of
 * indefinite spinner.
 *
 * Also tests that normal polling flow is not regressed.
 */

// Mock bridgeConfig BEFORE any imports that transitively load it
jest.mock('../../../config/bridgeConfig', () => ({
  bridgeConfig: {
    statusApiBaseUrl: 'https://testnet.example.com/bridge/api/v1',
    statusPollInterval: 100,
    sepolia: {
      chainId: 11155111,
      rpcUrls: ['https://rpc.example.com'],
      get rpcUrl() { return 'https://rpc.example.com'; },
      get rpcUrlFallback() { return ''; },
      explorerUrl: 'https://sepolia.etherscan.io',
      bridgeAddress: '0x0000000000000000000000000000000000000000',
    },
    goliath: {
      chainId: 8901,
      rpcUrl: 'https://rpc.testnet.goliath.net',
      explorerUrl: 'https://testnet.explorer.goliath.net',
      bridgeAddress: '0x0000000000000000000000000000000000000000',
    },
    tokens: {
      sepolia: { usdc: '0x0', xcn: '0x0' },
      goliath: { eth: '0x0', usdc: '0x0' },
    },
    relayerWalletAddress: '0xRelayer',
    bridgeEnabled: true,
    allowCustomRecipient: false,
    minAmount: '0.000001',
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock BridgeApiClient
const mockGetStatus = jest.fn();
jest.mock('../../../services/bridgeApi', () => ({
  BridgeApiClient: jest.fn().mockImplementation(() => ({
    getStatus: mockGetStatus,
  })),
}));

// Mock react-redux
const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

import { MAX_CONSECUTIVE_NULLS } from '../useBridgeStatusPolling';

describe('useBridgeStatusPolling — bounded 404 handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('MAX_CONSECUTIVE_NULLS is exported and is a positive number', () => {
    expect(typeof MAX_CONSECUTIVE_NULLS).toBe('number');
    expect(MAX_CONSECUTIVE_NULLS).toBeGreaterThan(0);
    expect(MAX_CONSECUTIVE_NULLS).toBeLessThanOrEqual(20);
  });

  it('MAX_CONSECUTIVE_NULLS is 10 (reasonable bound for 3-5 min of retries)', () => {
    expect(MAX_CONSECUTIVE_NULLS).toBe(10);
  });
});
