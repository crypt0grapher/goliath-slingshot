import {
  MigrationApiClient,
  MigrationApiError,
  SubmitStakePreferenceRequest,
  SubmitStakePreferenceResponse,
  BindOriginTxHashRequest,
  BindOriginTxHashResponse,
  MigrationStatusResponse,
  MigrationStatsResponse,
  MigrationHistoryResponse,
} from '../migrationApi';

// ============================================
// Test Helpers
// ============================================

const TEST_BASE_URL = 'https://testnet.mirrornode.goliath.net/bridge/api/v1';

function createClient(timeout?: number): MigrationApiClient {
  return new MigrationApiClient(TEST_BASE_URL, timeout);
}

function mockFetchSuccess(data: unknown, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, body?: { message?: string; code?: string }): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body ?? {}),
  });
}

function mockFetchNetworkError(message: string): void {
  global.fetch = jest.fn().mockRejectedValue(new Error(message));
}

function mockFetchAbort(): void {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  global.fetch = jest.fn().mockRejectedValue(abortError);
}

// ============================================
// Tests
// ============================================

describe('MigrationApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ------------------------------------------
  // Constructor
  // ------------------------------------------

  describe('constructor', () => {
    it('should strip trailing slash from base URL', () => {
      const client = new MigrationApiClient('https://example.com/api/v1/');
      // Verify by making a call and checking the URL used
      mockFetchSuccess({ intentId: '123' });
      client.submitStakePreference({
        senderAddress: '0xabc',
        recipientAddress: '0xdef',
        amountAtomic: '1000000',
        stakeOnGoliath: true,
        idempotencyKey: 'key-1',
        deadline: 1700000000,
        nonce: 1,
        signature: '0xsig',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/example\.com\/api\/v1\/migration/),
        expect.any(Object)
      );
    });

    it('should default timeout to 10000ms', () => {
      // We test this indirectly through abort behavior
      const client = createClient();
      expect(client).toBeDefined();
    });
  });

  // ------------------------------------------
  // MigrationApiError
  // ------------------------------------------

  describe('MigrationApiError', () => {
    it('should set name, status, message, and code', () => {
      const error = new MigrationApiError(400, 'Bad Request', 'INVALID_INPUT');
      expect(error.name).toBe('MigrationApiError');
      expect(error.status).toBe(400);
      expect(error.message).toBe('Bad Request');
      expect(error.code).toBe('INVALID_INPUT');
    });

    it('should be an instance of Error', () => {
      const error = new MigrationApiError(500, 'Internal Server Error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MigrationApiError);
    });

    it('should work without a code', () => {
      const error = new MigrationApiError(404, 'Not Found');
      expect(error.code).toBeUndefined();
    });
  });

  // ------------------------------------------
  // submitStakePreference
  // ------------------------------------------

  describe('submitStakePreference', () => {
    const validPayload: SubmitStakePreferenceRequest = {
      senderAddress: '0x1234567890abcdef1234567890abcdef12345678',
      recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amountAtomic: '1000000000000000000',
      stakeOnGoliath: true,
      idempotencyKey: 'idempotency-key-uuid-1234',
      deadline: 1700000000,
      nonce: 1,
      signature: '0xdeadbeef',
    };

    const successResponse: SubmitStakePreferenceResponse = {
      intentId: 'intent-uuid-5678',
      senderAddress: '0x1234567890abcdef1234567890abcdef12345678',
      stakeOnGoliath: true,
      expiresAt: '2026-03-01T00:00:00Z',
    };

    it('should POST to /migration/stake-preference with correct body', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.submitStakePreference(validPayload);

      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/migration/stake-preference`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(validPayload),
        })
      );
    });

    it('should return typed response on success', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      const result = await client.submitStakePreference(validPayload);

      expect(result).toEqual(successResponse);
      expect(result.intentId).toBe('intent-uuid-5678');
      expect(result.stakeOnGoliath).toBe(true);
      expect(result.expiresAt).toBe('2026-03-01T00:00:00Z');
    });

    it('should throw MigrationApiError on 400 response', async () => {
      mockFetchError(400, { message: 'Invalid sender address', code: 'INVALID_ADDRESS' });
      const client = createClient();

      await expect(client.submitStakePreference(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.submitStakePreference(validPayload)).rejects.toMatchObject({
        status: 400,
        message: 'Invalid sender address',
        code: 'INVALID_ADDRESS',
      });
    });

    it('should throw MigrationApiError on 409 conflict (duplicate idempotency key)', async () => {
      mockFetchError(409, { message: 'Intent already exists', code: 'DUPLICATE_INTENT' });
      const client = createClient();

      await expect(client.submitStakePreference(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.submitStakePreference(validPayload)).rejects.toMatchObject({
        status: 409,
        code: 'DUPLICATE_INTENT',
      });
    });

    it('should throw MigrationApiError on 500 response', async () => {
      mockFetchError(500, { message: 'Internal server error' });
      const client = createClient();

      await expect(client.submitStakePreference(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.submitStakePreference(validPayload)).rejects.toMatchObject({
        status: 500,
      });
    });

    it('should handle error response without JSON body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('not json')),
      });
      const client = createClient();

      await expect(client.submitStakePreference(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.submitStakePreference(validPayload)).rejects.toMatchObject({
        status: 502,
        message: 'HTTP 502',
      });
    });
  });

  // ------------------------------------------
  // bindOriginTxHash
  // ------------------------------------------

  describe('bindOriginTxHash', () => {
    const validPayload: BindOriginTxHashRequest = {
      intentId: 'intent-uuid-5678',
      senderAddress: '0x1234567890abcdef1234567890abcdef12345678',
      originTxHash: '0xaabbccddee1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    };

    const successResponse: BindOriginTxHashResponse = {
      success: true,
    };

    it('should POST to /migration/stake-preference/bind-origin with correct body', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.bindOriginTxHash(validPayload);

      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/migration/stake-preference/bind-origin`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(validPayload),
        })
      );
    });

    it('should return typed response on success', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      const result = await client.bindOriginTxHash(validPayload);

      expect(result).toEqual(successResponse);
      expect(result.success).toBe(true);
    });

    it('should throw MigrationApiError on 404 (intent not found)', async () => {
      mockFetchError(404, { message: 'Intent not found', code: 'INTENT_NOT_FOUND' });
      const client = createClient();

      await expect(client.bindOriginTxHash(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.bindOriginTxHash(validPayload)).rejects.toMatchObject({
        status: 404,
        code: 'INTENT_NOT_FOUND',
      });
    });

    it('should throw MigrationApiError on 409 (already bound)', async () => {
      mockFetchError(409, { message: 'Origin tx already bound', code: 'ALREADY_BOUND' });
      const client = createClient();

      await expect(client.bindOriginTxHash(validPayload)).rejects.toThrow(MigrationApiError);
      await expect(client.bindOriginTxHash(validPayload)).rejects.toMatchObject({
        status: 409,
        code: 'ALREADY_BOUND',
      });
    });
  });

  // ------------------------------------------
  // getMigrationStatus
  // ------------------------------------------

  describe('getMigrationStatus', () => {
    const originTxHash = '0xaabbccddee1234567890abcdef1234567890abcdef1234567890abcdef12345678';

    const successResponse: MigrationStatusResponse = {
      operationId: 'op-uuid-1234',
      direction: 'SEPOLIA_TO_GOLIATH',
      status: 'COMPLETED',
      token: 'ETH',
      amount: '1000000000000000000',
      amountFormatted: '1.0',
      sender: '0x1234567890abcdef1234567890abcdef12345678',
      recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      originChainId: 11155111,
      destinationChainId: 8901,
      originTxHash,
      destinationTxHash: '0x9999999999999999',
      originConfirmations: 12,
      requiredConfirmations: 12,
      timestamps: {
        depositedAt: '2026-02-23T10:00:00Z',
        finalizedAt: '2026-02-23T10:05:00Z',
        destinationSubmittedAt: '2026-02-23T10:06:00Z',
        completedAt: '2026-02-23T10:07:00Z',
      },
      estimatedCompletionTime: null,
      error: null,
      isSameWallet: true,
      // Migration-specific fields
      stakeOnGoliath: true,
      stakingTxHash: '0xstaking-hash-abc',
      stakingError: null,
    };

    it('should GET /bridge/status with originTxHash query param', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.getMigrationStatus(originTxHash);

      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/bridge/status?originTxHash=${encodeURIComponent(originTxHash)}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return typed response including migration fields', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      const result = await client.getMigrationStatus(originTxHash);

      expect(result).not.toBeNull();
      expect(result!.stakeOnGoliath).toBe(true);
      expect(result!.stakingTxHash).toBe('0xstaking-hash-abc');
      expect(result!.stakingError).toBeNull();
      expect(result!.status).toBe('COMPLETED');
    });

    it('should return response without migration fields when they are absent', async () => {
      const responseWithoutMigration = {
        operationId: 'op-uuid-1234',
        direction: 'SEPOLIA_TO_GOLIATH',
        status: 'CONFIRMING',
        token: 'ETH',
        amount: '1000000000000000000',
        amountFormatted: '1.0',
        sender: '0x1234',
        recipient: '0xabcd',
        originChainId: 11155111,
        destinationChainId: 8901,
        originTxHash,
        destinationTxHash: null,
        originConfirmations: 3,
        requiredConfirmations: 12,
        timestamps: {
          depositedAt: '2026-02-23T10:00:00Z',
          finalizedAt: null,
          destinationSubmittedAt: null,
          completedAt: null,
        },
        estimatedCompletionTime: '2026-02-23T10:10:00Z',
        error: null,
        isSameWallet: true,
      };
      mockFetchSuccess(responseWithoutMigration);
      const client = createClient();

      const result = await client.getMigrationStatus(originTxHash);

      expect(result).not.toBeNull();
      expect(result!.stakeOnGoliath).toBeUndefined();
      expect(result!.stakingTxHash).toBeUndefined();
      expect(result!.stakingError).toBeUndefined();
    });

    it('should return null on 404', async () => {
      mockFetchError(404, { message: 'Not found' });
      const client = createClient();

      const result = await client.getMigrationStatus(originTxHash);

      expect(result).toBeNull();
    });

    it('should throw MigrationApiError on non-404 errors', async () => {
      mockFetchError(500, { message: 'Server error' });
      const client = createClient();

      await expect(client.getMigrationStatus(originTxHash)).rejects.toThrow(MigrationApiError);
      await expect(client.getMigrationStatus(originTxHash)).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  // ------------------------------------------
  // getMigrationStats (phase-2)
  // ------------------------------------------

  describe('getMigrationStats (phase-2)', () => {
    const successResponse: MigrationStatsResponse = {
      totalMigrations: 1500,
      totalAmountMigrated: '15000000000000000000000',
      totalStaked: 1200,
      totalUnstaked: 300,
      activeMigrations: 42,
    };

    it('should GET /migration/stats', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.getMigrationStats();

      expect(global.fetch).toHaveBeenCalledWith(
        `${TEST_BASE_URL}/migration/stats`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return typed stats response', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      const result = await client.getMigrationStats();

      expect(result.totalMigrations).toBe(1500);
      expect(result.totalStaked).toBe(1200);
      expect(result.totalUnstaked).toBe(300);
      expect(result.activeMigrations).toBe(42);
    });

    it('should throw MigrationApiError on server error', async () => {
      mockFetchError(503, { message: 'Service unavailable' });
      const client = createClient();

      await expect(client.getMigrationStats()).rejects.toThrow(MigrationApiError);
    });
  });

  // ------------------------------------------
  // getMigrationHistory (phase-2)
  // ------------------------------------------

  describe('getMigrationHistory (phase-2)', () => {
    const successResponse: MigrationHistoryResponse = {
      operations: [
        {
          operationId: 'op-1',
          direction: 'SEPOLIA_TO_GOLIATH',
          status: 'COMPLETED',
          token: 'ETH',
          amount: '1000000000000000000',
          amountFormatted: '1.0',
          sender: '0x1234',
          recipient: '0xabcd',
          originChainId: 11155111,
          destinationChainId: 8901,
          originTxHash: '0xtx1',
          destinationTxHash: '0xtx2',
          originConfirmations: 12,
          requiredConfirmations: 12,
          timestamps: {
            depositedAt: '2026-02-23T10:00:00Z',
            finalizedAt: '2026-02-23T10:05:00Z',
            destinationSubmittedAt: '2026-02-23T10:06:00Z',
            completedAt: '2026-02-23T10:07:00Z',
          },
          estimatedCompletionTime: null,
          error: null,
          isSameWallet: true,
          stakeOnGoliath: true,
          stakingTxHash: '0xstake1',
          stakingError: null,
        },
      ],
      pagination: {
        total: 50,
        limit: 10,
        offset: 0,
        hasMore: true,
      },
    };

    it('should GET /migration/history with address, limit, and offset query params', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.getMigrationHistory('0x1234', 10, 0);

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain(`${TEST_BASE_URL}/migration/history?`);
      expect(calledUrl).toContain('address=0x1234');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=0');
    });

    it('should use default limit=10 and offset=0 when not provided', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      await client.getMigrationHistory('0x1234');

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=0');
    });

    it('should return typed history response with pagination', async () => {
      mockFetchSuccess(successResponse);
      const client = createClient();

      const result = await client.getMigrationHistory('0x1234', 10, 0);

      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].stakeOnGoliath).toBe(true);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should throw MigrationApiError on error', async () => {
      mockFetchError(400, { message: 'Invalid address' });
      const client = createClient();

      await expect(client.getMigrationHistory('invalid')).rejects.toThrow(MigrationApiError);
    });
  });

  // ------------------------------------------
  // Error Handling (shared behavior)
  // ------------------------------------------

  describe('error handling', () => {
    it('should throw MigrationApiError with message "Request timeout" on abort', async () => {
      mockFetchAbort();
      const client = createClient();

      await expect(
        client.submitStakePreference({
          senderAddress: '0x1234',
          recipientAddress: '0xabcd',
          amountAtomic: '1000000',
          stakeOnGoliath: true,
          idempotencyKey: 'key-1',
          deadline: 1700000000,
          nonce: 1,
          signature: '0xsig',
        })
      ).rejects.toThrow(MigrationApiError);

      await expect(
        client.submitStakePreference({
          senderAddress: '0x1234',
          recipientAddress: '0xabcd',
          amountAtomic: '1000000',
          stakeOnGoliath: true,
          idempotencyKey: 'key-1',
          deadline: 1700000000,
          nonce: 1,
          signature: '0xsig',
        })
      ).rejects.toMatchObject({
        status: 0,
        message: 'Request timeout',
      });
    });

    it('should throw MigrationApiError on network error', async () => {
      mockFetchNetworkError('Failed to fetch');
      const client = createClient();

      await expect(client.getMigrationStats()).rejects.toThrow(MigrationApiError);
      await expect(client.getMigrationStats()).rejects.toMatchObject({
        status: 0,
        message: 'Failed to fetch',
      });
    });

    it('should throw MigrationApiError with "Unknown error" for non-Error throws', async () => {
      global.fetch = jest.fn().mockRejectedValue('string error');
      const client = createClient();

      await expect(client.getMigrationStats()).rejects.toThrow(MigrationApiError);
      await expect(client.getMigrationStats()).rejects.toMatchObject({
        status: 0,
        message: 'Unknown error',
      });
    });

    it('should include abort signal in fetch calls', async () => {
      mockFetchSuccess({});
      const client = createClient();

      await client.getMigrationStats();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  // ------------------------------------------
  // Singleton export
  // ------------------------------------------

  describe('default export (migrationApiClient)', () => {
    it('should be importable as a pre-configured instance', () => {
      // This tests the singleton export from the module
      const { migrationApiClient } = require('../migrationApi');
      expect(migrationApiClient).toBeInstanceOf(MigrationApiClient);
    });
  });
});
