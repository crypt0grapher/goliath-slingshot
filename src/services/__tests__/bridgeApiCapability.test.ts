/**
 * Test D (from issue): if capability probe fails, Goliath->Sepolia XCN
 * submit path is blocked and user sees actionable error.
 *
 * Tests the BridgeApiClient.checkXcnWithdrawCapability() method.
 */

import { BridgeApiClient } from '../bridgeApi';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const BASE_URL = 'https://testnet.mirrornode.goliath.net/bridge/api/v1';

describe('BridgeApiClient.checkXcnWithdrawCapability', () => {
  let client: BridgeApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new BridgeApiClient(BASE_URL);
  });

  it('returns true when backend root includes both XCN endpoint keys', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: 'goliath-bridge-backend',
        version: '1.0.0',
        endpoints: {
          status: '/api/v1/bridge/status',
          history: '/api/v1/bridge/history',
          stakePreference: '/api/v1/migration/stake-preference',
          bindOrigin: '/api/v1/migration/stake-preference/bind-origin',
          xcnWithdrawIntent: '/api/v1/bridge/xcn-withdraw-intent',
          xcnWithdrawBindOrigin: '/api/v1/bridge/xcn-withdraw-intent/bind-origin',
          health: '/api/v1/health',
          metrics: '/metrics',
        },
      }),
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(true);

    // Verify it calls the root URL (one level up from /api/v1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://testnet.mirrornode.goliath.net/bridge/',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('returns false when xcnWithdrawIntent key is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: 'goliath-bridge-backend',
        endpoints: {
          status: '/api/v1/bridge/status',
          history: '/api/v1/bridge/history',
          health: '/api/v1/health',
          // XCN keys missing — this is the drift scenario
        },
      }),
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });

  it('returns false when xcnWithdrawBindOrigin key is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        service: 'goliath-bridge-backend',
        endpoints: {
          xcnWithdrawIntent: '/api/v1/bridge/xcn-withdraw-intent',
          // xcnWithdrawBindOrigin missing
        },
      }),
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });

  it('returns false when fetch fails (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });

  it('returns false when response is not ok (500)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });

  it('returns false when response has no endpoints field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ service: 'goliath-bridge-backend' }),
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });

  it('returns false when endpoint values are not strings', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        endpoints: {
          xcnWithdrawIntent: null,
          xcnWithdrawBindOrigin: 123,
        },
      }),
    });

    const result = await client.checkXcnWithdrawCapability();
    expect(result).toBe(false);
  });
});
