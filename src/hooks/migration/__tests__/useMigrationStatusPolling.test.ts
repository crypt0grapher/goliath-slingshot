import { renderHook, act } from '../testHelpers';
import { useMigrationStatusPolling } from '../useMigrationStatusPolling';
import { migrationApiClient, MigrationStatusResponse } from 'services/migrationApi';
import { clearPendingMigration } from 'state/migration/persistence';
import { migrationConfig } from 'config/migrationConfig';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('services/migrationApi', () => ({
  migrationApiClient: {
    getMigrationStatus: jest.fn(),
  },
  MigrationApiError: class MigrationApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.name = 'MigrationApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

jest.mock('state/migration/persistence', () => ({
  clearPendingMigration: jest.fn(),
}));

jest.mock('config/migrationConfig', () => ({
  migrationConfig: {
    statusPollMs: 3000,
    migrationEnabled: true,
    claimEnabled: false,
    statsEnabled: false,
    historyEnabled: false,
    sepoliaXcnAddress: '0x0',
    sepoliaStakingContract: '0x0',
    migrationDeadline: undefined,
    statsPollMs: 60000,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getMigrationStatus = migrationApiClient.getMigrationStatus as jest.MockedFunction<
  typeof migrationApiClient.getMigrationStatus
>;

const clearPendingMigrationMock = clearPendingMigration as jest.MockedFunction<
  typeof clearPendingMigration
>;

function buildStatusResponse(overrides: Partial<MigrationStatusResponse> = {}): MigrationStatusResponse {
  return {
    operationId: 'op-1',
    direction: 'SEPOLIA_TO_GOLIATH',
    status: 'CONFIRMING',
    token: 'USDC',
    amount: '1000000',
    amountFormatted: '1.0',
    sender: '0xSender',
    recipient: '0xRecipient',
    originChainId: 11155111,
    destinationChainId: 5050,
    originTxHash: '0xabc123',
    destinationTxHash: null,
    originConfirmations: 2,
    requiredConfirmations: 12,
    timestamps: {
      depositedAt: null,
      finalizedAt: null,
      destinationSubmittedAt: null,
      completedAt: null,
    },
    estimatedCompletionTime: null,
    error: null,
    isSameWallet: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  getMigrationStatus.mockResolvedValue(buildStatusResponse());
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMigrationStatusPolling', () => {
  // ========================================
  // Basic polling lifecycle
  // ========================================

  describe('polling lifecycle', () => {
    it('should not poll when originTxHash is null', () => {
      const { result } = renderHook(() => useMigrationStatusPolling(null));

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(getMigrationStatus).not.toHaveBeenCalled();
      expect(result.current.isPolling).toBe(false);
      expect(result.current.operationStatus).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should start polling immediately when originTxHash is provided', async () => {
      renderHook(() => useMigrationStatusPolling('0xabc123'));

      // The initial poll fires immediately
      await act(async () => {
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledWith('0xabc123');
      expect(getMigrationStatus).toHaveBeenCalledTimes(1);
    });

    it('should poll at the configured interval', async () => {
      renderHook(() => useMigrationStatusPolling('0xabc123'));

      // Initial poll
      await act(async () => {
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(1);

      // Advance by one interval
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(2);

      // Advance by another interval
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(3);
    });

    it('should expose isPolling=true while actively polling', async () => {
      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);
    });

    it('should clean up interval on unmount', async () => {
      const { unmount } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(1);

      unmount();

      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs * 5);
        await Promise.resolve();
      });

      // No further calls after unmount
      expect(getMigrationStatus).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Status mapping & state updates
  // ========================================

  describe('status mapping', () => {
    it('should expose the operation status from the response', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'CONFIRMING' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('CONFIRMING');
    });

    it('should update status on subsequent polls', async () => {
      getMigrationStatus
        .mockResolvedValueOnce(buildStatusResponse({ status: 'CONFIRMING' }))
        .mockResolvedValueOnce(buildStatusResponse({ status: 'AWAITING_RELAY' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      // First poll
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.operationStatus).toBe('CONFIRMING');

      // Second poll
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });
      expect(result.current.operationStatus).toBe('AWAITING_RELAY');
    });

    it('should extract stakeOnGoliath from response', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ stakeOnGoliath: true })
      );

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.migrationFields?.stakeOnGoliath).toBe(true);
    });

    it('should extract stakingTxHash from response', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ stakingTxHash: '0xstake789' })
      );

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.migrationFields?.stakingTxHash).toBe('0xstake789');
    });

    it('should extract stakingError from response', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ stakingError: 'staking reverted' })
      );

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.migrationFields?.stakingError).toBe('staking reverted');
    });

    it('should handle null response (404 not found)', async () => {
      getMigrationStatus.mockResolvedValue(null);

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      // Should continue polling, status remains null
      expect(result.current.operationStatus).toBeNull();
      expect(result.current.isPolling).toBe(true);
    });
  });

  // ========================================
  // Terminal states
  // ========================================

  describe('terminal states', () => {
    it('should stop polling on COMPLETED status', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'COMPLETED' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('COMPLETED');
      expect(result.current.isPolling).toBe(false);

      // Should not make further calls
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs * 5);
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(1);
    });

    it('should stop polling on FAILED status', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'FAILED', error: 'bridge failed' })
      );

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('FAILED');
      expect(result.current.isPolling).toBe(false);
    });

    it('should stop polling on EXPIRED status', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'EXPIRED' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('EXPIRED');
      expect(result.current.isPolling).toBe(false);
    });

    it('should clear localStorage on COMPLETED', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'COMPLETED' }));

      renderHook(() =>
        useMigrationStatusPolling('0xabc123', { senderAddress: '0xSender' })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(clearPendingMigrationMock).toHaveBeenCalledWith('0xSender');
    });

    it('should NOT clear localStorage on FAILED', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'FAILED' }));

      renderHook(() =>
        useMigrationStatusPolling('0xabc123', { senderAddress: '0xSender' })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(clearPendingMigrationMock).not.toHaveBeenCalled();
    });

    it('should NOT clear localStorage if senderAddress is not provided', async () => {
      getMigrationStatus.mockResolvedValue(buildStatusResponse({ status: 'COMPLETED' }));

      renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(clearPendingMigrationMock).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Error handling
  // ========================================

  describe('error handling', () => {
    it('should continue polling on transient API errors', async () => {
      getMigrationStatus
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(buildStatusResponse({ status: 'CONFIRMING' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      // First poll fails
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);
      expect(result.current.error).toBeNull(); // Not yet at threshold

      // Second poll succeeds
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('CONFIRMING');
      expect(result.current.error).toBeNull();
    });

    it('should show warning after consecutive error threshold (3 failures)', async () => {
      getMigrationStatus.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      // First failure
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.error).toBeNull();

      // Second failure
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });
      expect(result.current.error).toBeNull();

      // Third failure -- threshold reached
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });
      expect(result.current.error).toBe('Unable to fetch migration status. Retrying...');
    });

    it('should clear error after a successful poll', async () => {
      getMigrationStatus
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockResolvedValueOnce(buildStatusResponse({ status: 'CONFIRMING' }));

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      // Three failures to trigger error
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });

      expect(result.current.error).toBe('Unable to fetch migration status. Retrying...');

      // Fourth call succeeds
      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs);
        await Promise.resolve();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.operationStatus).toBe('CONFIRMING');
    });

    it('should continue polling even after error threshold', async () => {
      getMigrationStatus.mockRejectedValue(new Error('persistent failure'));

      renderHook(() => useMigrationStatusPolling('0xabc123'));

      // Poll 5 times (well past the threshold of 3)
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          if (i > 0) jest.advanceTimersByTime(migrationConfig.statusPollMs);
          await Promise.resolve();
        });
      }

      // Still called all 5 times -- we don't stop on errors
      expect(getMigrationStatus).toHaveBeenCalledTimes(5);
    });
  });

  // ========================================
  // Delayed / taking-longer message
  // ========================================

  describe('taking longer than expected', () => {
    it('should set delayed warning after configured delay (5 min default)', async () => {
      // Status stays at PENDING_ORIGIN_TX for a long time
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'PENDING_ORIGIN_TX' })
      );

      const { result } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      // Initial poll
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.delayWarning).toBeFalsy();

      // Advance 5 minutes worth of polls
      const fiveMinutes = 5 * 60 * 1000;
      const pollsIn5Min = Math.ceil(fiveMinutes / migrationConfig.statusPollMs);

      for (let i = 0; i < pollsIn5Min; i++) {
        await act(async () => {
          jest.advanceTimersByTime(migrationConfig.statusPollMs);
          await Promise.resolve();
        });
      }

      expect(result.current.delayWarning).toBeTruthy();
    });
  });

  // ========================================
  // Hash changes
  // ========================================

  describe('originTxHash changes', () => {
    it('should reset state when originTxHash changes', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'CONFIRMING' })
      );

      const { result, rerender } = renderHook(
        ({ hash }: { hash: string | null }) => useMigrationStatusPolling(hash),
        { initialProps: { hash: '0xfirst' as string | null } }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('CONFIRMING');

      // Change hash
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'AWAITING_RELAY' })
      );

      rerender({ hash: '0xsecond' });

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.operationStatus).toBe('AWAITING_RELAY');
      expect(getMigrationStatus).toHaveBeenLastCalledWith('0xsecond');
    });

    it('should stop polling when originTxHash changes to null', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'CONFIRMING' })
      );

      const { result, rerender } = renderHook(
        ({ hash }: { hash: string | null }) => useMigrationStatusPolling(hash),
        { initialProps: { hash: '0xabc' as string | null } }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);

      rerender({ hash: null });

      expect(result.current.isPolling).toBe(false);

      const callCount = getMigrationStatus.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(migrationConfig.statusPollMs * 3);
        await Promise.resolve();
      });

      expect(getMigrationStatus).toHaveBeenCalledTimes(callCount);
    });
  });

  // ========================================
  // Redux dispatch integration
  // ========================================

  describe('Redux dispatch', () => {
    it('should dispatch updateOperationStatus on successful poll', async () => {
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({
          status: 'PROCESSING_DESTINATION',
          stakingTxHash: '0xstake',
        })
      );

      const { dispatchSpy } = renderHook(() => useMigrationStatusPolling('0xabc123'));

      await act(async () => {
        await Promise.resolve();
      });

      const updateCalls = dispatchSpy.mock.calls.filter(
        ([action]: [any]) => action.type === 'migration/updateOperationStatus'
      );

      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      const lastPayload = updateCalls[updateCalls.length - 1][0].payload;
      expect(lastPayload.status).toBe('PROCESSING_DESTINATION');
      expect(lastPayload.stakingTxHash).toBe('0xstake');
    });

    it('should dispatch clearOperation on terminal COMPLETED', async () => {
      // Not clearing operation on COMPLETED -- we just update the status
      // and clear localStorage. The operation stays in Redux for the UI to display.
      getMigrationStatus.mockResolvedValue(
        buildStatusResponse({ status: 'COMPLETED' })
      );

      const { dispatchSpy } = renderHook(() =>
        useMigrationStatusPolling('0xabc123', { senderAddress: '0xSender' })
      );

      await act(async () => {
        await Promise.resolve();
      });

      const updateCalls = dispatchSpy.mock.calls.filter(
        ([action]: [any]) => action.type === 'migration/updateOperationStatus'
      );

      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      expect(updateCalls[updateCalls.length - 1][0].payload.status).toBe('COMPLETED');
    });
  });
});
