/**
 * Tests for bridgeProviders module.
 *
 * Uses jest.resetModules() to get fresh module instances per test,
 * with mocks configured via require() to avoid hoisting issues.
 */

jest.mock('../../constants/bridge/networks', () => ({
  BridgeNetwork: {
    SEPOLIA: 'sepolia',
    GOLIATH: 'goliath',
  },
}));

describe('bridgeProviders', () => {
  const mockGetBalance = jest.fn();
  const mockGetBlockNumber = jest.fn().mockResolvedValue(100);
  const mockBalanceOf = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockGetBalance.mockReset();
    mockGetBlockNumber.mockReset().mockResolvedValue(100);
    mockBalanceOf.mockReset();

    jest.doMock('../../config/bridgeConfig', () => ({
      bridgeConfig: {
        sepolia: {
          chainId: 11155111,
          rpcUrl: 'https://primary-rpc.example.com',
          rpcUrlFallback: 'https://fallback-rpc.example.com',
        },
        goliath: {
          chainId: 8901,
          rpcUrl: 'https://goliath-rpc.example.com',
        },
      },
    }));

    jest.doMock('ethers', () => ({
      ethers: {
        providers: {
          JsonRpcProvider: jest.fn().mockImplementation(() => ({
            getBalance: mockGetBalance,
            getBlockNumber: mockGetBlockNumber,
          })),
        },
        Contract: jest.fn().mockImplementation(() => ({
          balanceOf: mockBalanceOf,
        })),
      },
    }));
  });

  describe('getReadonlyProvider', () => {
    it('returns a provider for Sepolia', () => {
      const { getReadonlyProvider } = require('../bridgeProviders');
      const provider = getReadonlyProvider('sepolia');
      expect(provider).toBeDefined();
      expect(typeof provider.getBalance).toBe('function');
    });

    it('returns a provider for Goliath', () => {
      const { getReadonlyProvider } = require('../bridgeProviders');
      const provider = getReadonlyProvider('goliath');
      expect(provider).toBeDefined();
      expect(typeof provider.getBalance).toBe('function');
    });
  });

  describe('getNativeBalance', () => {
    it('returns balance as bigint on success', async () => {
      const mockBigNumber = { toBigInt: () => BigInt('1000000000000000000') };
      mockGetBalance.mockResolvedValue(mockBigNumber);

      const { getNativeBalance } = require('../bridgeProviders');
      const balance = await getNativeBalance(
        '0x1234567890abcdef1234567890abcdef12345678',
        'goliath'
      );
      expect(balance).toBe(BigInt('1000000000000000000'));
    });

    it('retries with fallback on 429 error for Sepolia', async () => {
      const error429: any = new Error('rate limited');
      error429.code = 429;
      const mockBigNumber = { toBigInt: () => BigInt('500') };

      mockGetBalance
        .mockRejectedValueOnce(error429)
        .mockResolvedValue(mockBigNumber);

      const { getNativeBalance } = require('../bridgeProviders');
      const balance = await getNativeBalance(
        '0x1234567890abcdef1234567890abcdef12345678',
        'sepolia'
      );
      expect(balance).toBe(BigInt('500'));
      expect(mockGetBalance).toHaveBeenCalledTimes(2);
    });

    it('retries on NETWORK_ERROR for Sepolia', async () => {
      const networkErr: any = new Error('network error');
      networkErr.code = 'NETWORK_ERROR';
      const mockBigNumber = { toBigInt: () => BigInt('999') };

      mockGetBalance
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValue(mockBigNumber);

      const { getNativeBalance } = require('../bridgeProviders');
      const balance = await getNativeBalance(
        '0x1234567890abcdef1234567890abcdef12345678',
        'sepolia'
      );
      expect(balance).toBe(BigInt('999'));
    });

    it('throws non-RPC errors without retry', async () => {
      mockGetBalance.mockRejectedValue(new Error('invalid argument'));

      const { getNativeBalance } = require('../bridgeProviders');
      await expect(
        getNativeBalance(
          '0x1234567890abcdef1234567890abcdef12345678',
          'goliath'
        )
      ).rejects.toThrow('invalid argument');
      expect(mockGetBalance).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTokenBalance', () => {
    it('returns ERC20 balance as bigint', async () => {
      const mockBigNumber = { toBigInt: () => BigInt('2000000') };
      mockBalanceOf.mockResolvedValue(mockBigNumber);

      const { getTokenBalance } = require('../bridgeProviders');
      const balance = await getTokenBalance(
        '0xTokenAddress1234567890abcdef1234567890ab',
        '0x1234567890abcdef1234567890abcdef12345678',
        'sepolia'
      );
      expect(balance).toBe(BigInt('2000000'));
    });

    it('retries on 429 error for token balance', async () => {
      const error429: any = new Error('rate limited');
      error429.code = 429;
      const mockBigNumber = { toBigInt: () => BigInt('3000') };

      mockBalanceOf
        .mockRejectedValueOnce(error429)
        .mockResolvedValue(mockBigNumber);

      const { getTokenBalance } = require('../bridgeProviders');
      const balance = await getTokenBalance(
        '0xTokenAddress1234567890abcdef1234567890ab',
        '0x1234567890abcdef1234567890abcdef12345678',
        'sepolia'
      );
      expect(balance).toBe(BigInt('3000'));
    });
  });
});
