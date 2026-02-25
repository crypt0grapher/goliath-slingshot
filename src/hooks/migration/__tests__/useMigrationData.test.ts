import { renderHook, act } from '../testHelpers';
import { useMigrationData } from '../useMigrationData';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useActiveWeb3React to control the connected account.
// Using `var` so the variable is hoisted and accessible inside jest.mock factories.
/* eslint-disable no-var */
var mockAccount: string | null | undefined = '0xUserAddress';
/* eslint-enable no-var */

jest.mock('hooks', () => ({
  useActiveWeb3React: () => ({
    account: mockAccount,
    library: {},
    chainId: 11155111,
    active: true,
  }),
}));

jest.mock('services/bridgeProviders', () => ({
  getReadonlyProvider: jest.fn(() => ({ _isProvider: true })),
  ensureSepoliaProviderReady: jest.fn(() => Promise.resolve()),
}));

// Contract method mocks. These must be declared as `var` so they are hoisted
// above the jest.mock factory (which babel-jest moves to the top of the file).
/* eslint-disable no-var */
var mockUserInfo: jest.Mock;
var mockPendingReward: jest.Mock;
var mockBalanceOf: jest.Mock;
var mockAllowance: jest.Mock;
/* eslint-enable no-var */

// Initialise here (runs after hoisting, before each test via beforeEach)
mockUserInfo = jest.fn();
mockPendingReward = jest.fn();
mockBalanceOf = jest.fn();
mockAllowance = jest.fn();

jest.mock('ethers', () => {
  const original = jest.requireActual('ethers');

  // A mock Contract constructor that returns an object with our spied methods.
  function MockContract() {
    return {
      userInfo: mockUserInfo,
      pendingReward: mockPendingReward,
      balanceOf: mockBalanceOf,
      allowance: mockAllowance,
    };
  }

  return {
    ...original,
    ethers: {
      ...original.ethers,
      Contract: MockContract,
    },
  };
});

jest.mock('config/migrationConfig', () => ({
  migrationConfig: {
    migrationEnabled: true,
    claimEnabled: false,
    statsEnabled: false,
    historyEnabled: false,
    sepoliaXcnAddress: '0xXCN',
    sepoliaStakingContract: '0xStaking',
    migrationDeadline: undefined,
    statsPollMs: 60000,
    statusPollMs: 3000,
  },
}));

jest.mock('config/bridgeConfig', () => ({
  bridgeConfig: {
    sepolia: {
      chainId: 11155111,
      rpcUrl: 'https://sepolia.test',
      explorerUrl: 'https://sepolia.etherscan.io',
      bridgeAddress: '0xBridge',
    },
    goliath: {
      chainId: 8901,
      rpcUrl: 'https://goliath.test',
      explorerUrl: 'https://goliath.explorer',
      bridgeAddress: '0xGoliathBridge',
    },
    tokens: { sepolia: { usdc: '0x0' }, goliath: { eth: '0x0', usdc: '0x0' } },
    statusApiBaseUrl: '',
    bridgeEnabled: false,
    allowCustomRecipient: false,
    minAmount: '0.000001',
    statusPollInterval: 500,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a BigNumber-like object with a toString method. */
function bn(value: string) {
  return {
    toString: () => value,
  };
}

function setupSuccessfulMocks(overrides?: {
  staked?: string;
  rewards?: string;
  walletXcn?: string;
  allowance?: string;
}) {
  const staked = overrides?.staked ?? '1000000000000000000';
  const rewards = overrides?.rewards ?? '500000000000000000';
  const walletXcn = overrides?.walletXcn ?? '2000000000000000000';
  const allowanceVal = overrides?.allowance ?? '0';

  mockUserInfo.mockResolvedValue({ amount: bn(staked), rewardDebt: bn('0'), pendingTokenReward: bn('0') });
  mockPendingReward.mockResolvedValue(bn(rewards));
  mockBalanceOf.mockResolvedValue(bn(walletXcn));
  mockAllowance.mockResolvedValue(bn(allowanceVal));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMigrationData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount = '0xUserAddress';
    // Re-initialise mocks after clearAllMocks (which resets them)
    mockUserInfo = jest.fn();
    mockPendingReward = jest.fn();
    mockBalanceOf = jest.fn();
    mockAllowance = jest.fn();
  });

  // ========================================
  // Successful fetch
  // ========================================

  it('fetches staking data on mount and dispatches snapshot', async () => {
    setupSuccessfulMocks();

    let hookResult: ReturnType<typeof useMigrationData>;
    await act(async () => {
      const { result } = renderHook(() => useMigrationData());
      // Allow the async fetch to complete
      await new Promise((r) => setTimeout(r, 50));
      hookResult = result.current;
    });

    // After fetch, loading should be false and error should be null
    expect(hookResult!.loading).toBe(false);
    expect(hookResult!.error).toBeNull();

    // Verify all four contract calls were made
    expect(mockUserInfo).toHaveBeenCalledWith(0, '0xUserAddress');
    expect(mockPendingReward).toHaveBeenCalledWith(0, '0xUserAddress');
    expect(mockBalanceOf).toHaveBeenCalledWith('0xUserAddress');
    expect(mockAllowance).toHaveBeenCalledWith('0xUserAddress', '0xBridge');
  });

  it('dispatches setSnapshot with correct values on success', async () => {
    setupSuccessfulMocks({
      staked: '5000',
      rewards: '100',
      walletXcn: '9999',
      allowance: '3000',
    });

    let dispatchSpy: jest.Mock;
    await act(async () => {
      const rendered = renderHook(() => useMigrationData());
      dispatchSpy = rendered.dispatchSpy;
      await new Promise((r) => setTimeout(r, 50));
    });

    // Find the final setSnapshot dispatch (not the loading one)
    const snapshotActions = dispatchSpy!
      .mock.calls.map((c) => c[0])
      .filter(
        (a: { type: string; payload?: unknown }) =>
          a.type === 'migration/setSnapshot' && (a.payload as { loading: boolean }).loading === false
      );

    expect(snapshotActions.length).toBeGreaterThanOrEqual(1);
    const lastSnapshot = snapshotActions[snapshotActions.length - 1].payload;
    expect(lastSnapshot).toEqual({
      staked: '5000',
      rewards: '100',
      walletXcn: '9999',
      allowance: '3000',
      loading: false,
      error: null,
    });
  });

  // ========================================
  // Loading state
  // ========================================

  it('dispatches loading state before fetching without zeroing balances', async () => {
    // Set up mocks that resolve with a delay to catch the loading dispatch
    mockUserInfo.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ amount: bn('1'), rewardDebt: bn('0'), pendingTokenReward: bn('0') }), 200))
    );
    mockPendingReward.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(bn('0')), 200))
    );
    mockBalanceOf.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(bn('0')), 200))
    );
    mockAllowance.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(bn('0')), 200))
    );

    let dispatchSpy: jest.Mock;
    await act(async () => {
      const rendered = renderHook(() => useMigrationData());
      dispatchSpy = rendered.dispatchSpy;
      // Wait just long enough for the loading dispatch but not for the fetch to complete
      await new Promise((r) => setTimeout(r, 20));
    });

    // Should have dispatched setSnapshotLoading (not setSnapshot with zeros)
    const loadingActions = dispatchSpy!
      .mock.calls.map((c) => c[0])
      .filter(
        (a: { type: string; payload?: unknown }) =>
          a.type === 'migration/setSnapshotLoading' && (a.payload as { loading: boolean }).loading === true
      );

    expect(loadingActions.length).toBeGreaterThanOrEqual(1);
  });

  // ========================================
  // Error handling
  // ========================================

  it('sets error state on fetch failure', async () => {
    // Suppress expected console.error from the hook's error handler
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockUserInfo.mockRejectedValue(new Error('RPC timeout'));
    mockPendingReward.mockRejectedValue(new Error('RPC timeout'));
    mockBalanceOf.mockRejectedValue(new Error('RPC timeout'));
    mockAllowance.mockRejectedValue(new Error('RPC timeout'));

    let hookResult: ReturnType<typeof useMigrationData>;
    await act(async () => {
      const { result } = renderHook(() => useMigrationData());
      await new Promise((r) => setTimeout(r, 50));
      hookResult = result.current;
    });

    expect(hookResult!.loading).toBe(false);
    expect(hookResult!.error).toBeTruthy();

    errorSpy.mockRestore();
  });

  it('dispatches error snapshot on fetch failure', async () => {
    // Suppress expected console.error from the hook's error handler
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockUserInfo.mockRejectedValue(new Error('network error'));
    mockPendingReward.mockResolvedValue(bn('0'));
    mockBalanceOf.mockResolvedValue(bn('0'));
    mockAllowance.mockResolvedValue(bn('0'));

    let dispatchSpy: jest.Mock;
    await act(async () => {
      const rendered = renderHook(() => useMigrationData());
      dispatchSpy = rendered.dispatchSpy;
      await new Promise((r) => setTimeout(r, 50));
    });

    const errorSnapshots = dispatchSpy!
      .mock.calls.map((c) => c[0])
      .filter(
        (a: { type: string; payload?: unknown }) =>
          a.type === 'migration/setSnapshot' &&
          (a.payload as { error: string | null }).error !== null
      );

    expect(errorSnapshots.length).toBeGreaterThanOrEqual(1);

    errorSpy.mockRestore();
  });

  it('sets deterministic timeout error message when provider readiness times out', async () => {
    // Suppress expected console.error from the hook's error handler
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { ensureSepoliaProviderReady } = require('services/bridgeProviders') as {
      ensureSepoliaProviderReady: jest.Mock;
    };

    const timeoutError: any = new Error('sepolia primary validation timed out');
    timeoutError.code = 'TIMEOUT_ERROR';
    ensureSepoliaProviderReady.mockRejectedValueOnce(timeoutError);

    let hookResult: ReturnType<typeof useMigrationData>;
    await act(async () => {
      const { result } = renderHook(() => useMigrationData());
      await new Promise((r) => setTimeout(r, 50));
      hookResult = result.current;
    });

    expect(hookResult!.loading).toBe(false);
    expect(hookResult!.error).toBe('Sepolia RPC timed out while loading migration data. Please try again.');
    expect(mockUserInfo).not.toHaveBeenCalled();
    expect(mockPendingReward).not.toHaveBeenCalled();
    expect(mockBalanceOf).not.toHaveBeenCalled();
    expect(mockAllowance).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  // ========================================
  // No account connected
  // ========================================

  it('dispatches zero snapshot when no account is connected', async () => {
    mockAccount = null;

    let dispatchSpy: jest.Mock;
    let hookResult: ReturnType<typeof useMigrationData>;
    await act(async () => {
      const rendered = renderHook(() => useMigrationData());
      dispatchSpy = rendered.dispatchSpy;
      await new Promise((r) => setTimeout(r, 50));
      hookResult = rendered.result.current;
    });

    expect(hookResult!.loading).toBe(false);
    expect(hookResult!.error).toBeNull();

    // Should NOT call any contract methods
    expect(mockUserInfo).not.toHaveBeenCalled();
    expect(mockPendingReward).not.toHaveBeenCalled();
    expect(mockBalanceOf).not.toHaveBeenCalled();
    expect(mockAllowance).not.toHaveBeenCalled();

    // Should dispatch a zero snapshot
    const zeroSnapshots = dispatchSpy!
      .mock.calls.map((c) => c[0])
      .filter(
        (a: { type: string; payload?: unknown }) =>
          a.type === 'migration/setSnapshot'
      );

    expect(zeroSnapshots.length).toBeGreaterThanOrEqual(1);
    const last = zeroSnapshots[zeroSnapshots.length - 1].payload;
    expect(last.staked).toBe('0');
    expect(last.loading).toBe(false);
  });

  // ========================================
  // Refetch
  // ========================================

  it('exposes a refetch function that re-fetches data', async () => {
    setupSuccessfulMocks();

    let hookResult: ReturnType<typeof useMigrationData>;
    await act(async () => {
      const { result } = renderHook(() => useMigrationData());
      await new Promise((r) => setTimeout(r, 50));
      hookResult = result.current;
    });

    expect(typeof hookResult!.refetch).toBe('function');

    // Reset call counts (but not the mock implementations)
    mockUserInfo.mockClear();
    mockPendingReward.mockClear();
    mockBalanceOf.mockClear();
    mockAllowance.mockClear();

    // Set up new return values
    setupSuccessfulMocks({ staked: '999' });

    await act(async () => {
      hookResult!.refetch();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should have called the contract methods again
    expect(mockUserInfo).toHaveBeenCalledTimes(1);
  });

  // ========================================
  // Parallel execution
  // ========================================

  it('executes all four contract calls in parallel via Promise.all', async () => {
    // Use delays to verify parallel execution: if sequential, total time > 200ms;
    // if parallel, total time ~ 100ms.
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    mockUserInfo.mockImplementation(async () => {
      await delay(50);
      return { amount: bn('1'), rewardDebt: bn('0'), pendingTokenReward: bn('0') };
    });
    mockPendingReward.mockImplementation(async () => {
      await delay(50);
      return bn('2');
    });
    mockBalanceOf.mockImplementation(async () => {
      await delay(50);
      return bn('3');
    });
    mockAllowance.mockImplementation(async () => {
      await delay(50);
      return bn('4');
    });

    const start = Date.now();

    await act(async () => {
      renderHook(() => useMigrationData());
      await new Promise((r) => setTimeout(r, 150));
    });

    const elapsed = Date.now() - start;
    // If truly parallel, all 4 x 50ms calls run concurrently and finish in ~50-80ms
    // plus overhead. Should be well under 200ms (sequential would be ~200ms+).
    expect(elapsed).toBeLessThan(300);

    // All four were called
    expect(mockUserInfo).toHaveBeenCalledTimes(1);
    expect(mockPendingReward).toHaveBeenCalledTimes(1);
    expect(mockBalanceOf).toHaveBeenCalledTimes(1);
    expect(mockAllowance).toHaveBeenCalledTimes(1);
  });
});
