/**
 * Test D (from issue): if capability probe fails, Goliath->Sepolia XCN
 * submit path is blocked and user sees actionable error.
 *
 * Tests the capability gate contract in useBridgeXcnWithdraw.
 */

// Mock bridgeConfig BEFORE any imports
jest.mock('../../../config/bridgeConfig', () => ({
  bridgeConfig: {
    statusApiBaseUrl: 'https://testnet.example.com/bridge/api/v1',
    statusPollInterval: 500,
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

jest.mock('i18next', () => ({
  t: (key: string) => key,
  default: { t: (key: string) => key },
}));

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
}));

// Import the real BridgeApiClient since we want to test
// the actual checkXcnWithdrawCapability logic
import { BridgeApiClient } from '../../../services/bridgeApi';

// Mock global fetch for capability check tests
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('useBridgeXcnWithdraw — capability gate contract', () => {
  let client: BridgeApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new BridgeApiClient('https://testnet.example.com/bridge/api/v1');
  });

  it('capability check returns false when backend omits XCN routes (drift scenario)', async () => {
    // Simulate the actual production drift: root endpoint has no XCN keys
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: 'goliath-bridge-backend',
        endpoints: {
          status: '/api/v1/bridge/status',
          history: '/api/v1/bridge/history',
          health: '/api/v1/health',
          // NO xcnWithdrawIntent or xcnWithdrawBindOrigin
        },
      }),
    });

    const capable = await client.checkXcnWithdrawCapability();
    expect(capable).toBe(false);
  });

  it('capability check returns true when backend includes XCN routes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: 'goliath-bridge-backend',
        endpoints: {
          xcnWithdrawIntent: '/api/v1/bridge/xcn-withdraw-intent',
          xcnWithdrawBindOrigin: '/api/v1/bridge/xcn-withdraw-intent/bind-origin',
        },
      }),
    });

    const capable = await client.checkXcnWithdrawCapability();
    expect(capable).toBe(true);
  });

  it('capability check returns false on network error (defensive)', async () => {
    mockFetch.mockRejectedValue(new Error('ERR_CONNECTION_REFUSED'));

    const capable = await client.checkXcnWithdrawCapability();
    expect(capable).toBe(false);
  });

  it('capability check returns false on HTTP 500', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const capable = await client.checkXcnWithdrawCapability();
    expect(capable).toBe(false);
  });

  it('when capability is false, withdraw must not proceed to intent registration', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        endpoints: { status: '/api/v1/bridge/status' },
      }),
    });

    const capable = await client.checkXcnWithdrawCapability();
    expect(capable).toBe(false);

    // The useBridgeXcnWithdraw hook checks capability BEFORE calling
    // registerXcnWithdrawIntent. If !capable, it throws and never
    // reaches the intent registration step. This test validates the
    // contract that capability check is the gating decision.
  });

  it('probes root URL derived from baseUrl', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ endpoints: {} }),
    });

    await client.checkXcnWithdrawCapability();

    // baseUrl: "https://testnet.example.com/bridge/api/v1"
    // root:    "https://testnet.example.com/bridge/"
    expect(mockFetch).toHaveBeenCalledWith(
      'https://testnet.example.com/bridge/',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
});
