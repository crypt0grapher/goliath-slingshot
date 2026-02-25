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
  const mockAllowance = jest.fn();
  let mockProviderConstructor: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockGetBalance.mockReset();
    mockGetBlockNumber.mockReset().mockResolvedValue(100);
    mockBalanceOf.mockReset();
    mockAllowance.mockReset();

    mockProviderConstructor = jest.fn().mockImplementation((rpcUrl: string) => ({
      getBalance: mockGetBalance,
      getBlockNumber: mockGetBlockNumber,
      _rpcUrl: rpcUrl, // Track which URL was used
    }));

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
          JsonRpcProvider: mockProviderConstructor,
        },
        Contract: jest.fn().mockImplementation(() => ({
          balanceOf: mockBalanceOf,
          allowance: mockAllowance,
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

  describe('ensureSepoliaProviderReady', () => {
    it('resolves when primary RPC is healthy', async () => {
      mockGetBlockNumber.mockResolvedValue(100);
      const { ensureSepoliaProviderReady, getReadonlyProvider } = require('../bridgeProviders');

      await ensureSepoliaProviderReady();
      const provider = getReadonlyProvider('sepolia');
      expect(provider).toBeDefined();
      // Primary was used (first constructor call is for Sepolia primary)
      expect(mockProviderConstructor).toHaveBeenCalledWith(
        'https://primary-rpc.example.com',
        expect.any(Object)
      );
    });

    it('switches to fallback when primary returns NETWORK_ERROR', async () => {
      const networkErr: any = new Error('could not detect network');
      networkErr.code = 'NETWORK_ERROR';
      mockGetBlockNumber.mockRejectedValueOnce(networkErr).mockResolvedValue(200);

      const { ensureSepoliaProviderReady, getReadonlyProvider } = require('../bridgeProviders');

      await ensureSepoliaProviderReady();
      const provider = getReadonlyProvider('sepolia');
      // Fallback provider was created
      expect(mockProviderConstructor).toHaveBeenCalledWith(
        'https://fallback-rpc.example.com',
        expect.any(Object)
      );
      expect(provider._rpcUrl).toBe('https://fallback-rpc.example.com');
    });

    it('switches to fallback when primary returns 429', async () => {
      const error429: any = new Error('Monthly capacity limit exceeded');
      error429.code = 429;
      mockGetBlockNumber.mockRejectedValueOnce(error429).mockResolvedValue(300);

      const { ensureSepoliaProviderReady, getReadonlyProvider } = require('../bridgeProviders');

      await ensureSepoliaProviderReady();
      const provider = getReadonlyProvider('sepolia');
      expect(provider._rpcUrl).toBe('https://fallback-rpc.example.com');
    });

    it('switches to fallback on capacity limit message', async () => {
      const capacityErr: any = new Error('capacity limit reached');
      capacityErr.code = 'SERVER_ERROR';
      mockGetBlockNumber.mockRejectedValueOnce(capacityErr).mockResolvedValue(400);

      const { ensureSepoliaProviderReady, getReadonlyProvider } = require('../bridgeProviders');

      await ensureSepoliaProviderReady();
      const provider = getReadonlyProvider('sepolia');
      expect(provider._rpcUrl).toBe('https://fallback-rpc.example.com');
    });

    it('shares the same validation promise for concurrent calls', async () => {
      mockGetBlockNumber.mockResolvedValue(100);
      const { ensureSepoliaProviderReady } = require('../bridgeProviders');

      // Call twice concurrently
      await Promise.all([
        ensureSepoliaProviderReady(),
        ensureSepoliaProviderReady(),
      ]);

      // getBlockNumber called only once (shared promise)
      expect(mockGetBlockNumber).toHaveBeenCalledTimes(1);
    });

    it('subsequent calls after validation are instant (no re-validation)', async () => {
      mockGetBlockNumber.mockResolvedValue(100);
      const { ensureSepoliaProviderReady } = require('../bridgeProviders');

      await ensureSepoliaProviderReady();
      await ensureSepoliaProviderReady();
      await ensureSepoliaProviderReady();

      // Only validated once
      expect(mockGetBlockNumber).toHaveBeenCalledTimes(1);
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

    it('awaits provider readiness before Sepolia balance fetch', async () => {
      const mockBigNumber = { toBigInt: () => BigInt('500') };
      mockGetBalance.mockResolvedValue(mockBigNumber);
      mockGetBlockNumber.mockResolvedValue(100);

      const { getNativeBalance } = require('../bridgeProviders');
      const balance = await getNativeBalance(
        '0x1234567890abcdef1234567890abcdef12345678',
        'sepolia'
      );
      expect(balance).toBe(BigInt('500'));
      // getBlockNumber was called for validation
      expect(mockGetBlockNumber).toHaveBeenCalled();
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

  describe('getTokenAllowance', () => {
    it('returns allowance as bigint', async () => {
      const mockBigNumber = { toBigInt: () => BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935') };
      mockAllowance.mockResolvedValue(mockBigNumber);

      const { getTokenAllowance } = require('../bridgeProviders');
      const allowance = await getTokenAllowance(
        '0xTokenAddress1234567890abcdef1234567890ab',
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xSpenderAddress234567890abcdef1234567890ab',
        'sepolia'
      );
      expect(allowance).toBe(BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'));
    });
  });
});
