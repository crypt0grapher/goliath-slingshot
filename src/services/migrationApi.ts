import { BridgeDirection, BridgeStatus, BridgeTokenSymbol } from '../state/bridge/types';
import { bridgeConfig } from '../config/bridgeConfig';

// ============================================
// Request Types
// ============================================

export interface SubmitStakePreferenceRequest {
  senderAddress: string;
  recipientAddress: string;
  amountAtomic: string;
  stakeOnGoliath: boolean;
  idempotencyKey: string;
  deadline: number;
  nonce: number;
  signature: string;
}

export interface BindOriginTxHashRequest {
  intentId: string;
  senderAddress: string;
  originTxHash: string;
}

// ============================================
// Response Types
// ============================================

export interface SubmitStakePreferenceResponse {
  intentId: string;
  senderAddress: string;
  stakeOnGoliath: boolean;
  expiresAt: string;
}

export interface BindOriginTxHashResponse {
  success: boolean;
}

/**
 * Migration status response extends the standard bridge status response
 * with optional migration-specific fields. These fields are present only
 * when the operation has an associated stake-intent.
 */
export interface MigrationStatusResponse {
  operationId: string;
  direction: BridgeDirection;
  status: BridgeStatus;
  token: BridgeTokenSymbol;
  amount: string;
  amountFormatted: string;
  sender: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originTxHash: string | null;
  destinationTxHash: string | null;
  originConfirmations: number;
  requiredConfirmations: number;
  timestamps: {
    depositedAt: string | null;
    finalizedAt: string | null;
    destinationSubmittedAt: string | null;
    completedAt: string | null;
  };
  estimatedCompletionTime: string | null;
  error: string | null;
  isSameWallet: boolean;
  // Migration-specific optional fields
  stakeOnGoliath?: boolean;
  stakingTxHash?: string | null;
  stakingError?: string | null;
}

/**
 * Phase-2: Aggregate migration statistics.
 */
export interface MigrationStatsResponse {
  totalMigrations: number;
  totalAmountMigrated: string;
  totalStaked: number;
  totalUnstaked: number;
  activeMigrations: number;
}

/**
 * Phase-2: Paginated migration history for a given address.
 */
export interface MigrationHistoryResponse {
  operations: MigrationStatusResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================
// Error Class
// ============================================

export class MigrationApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'MigrationApiError';
    this.status = status;
    this.code = code;
  }
}

// ============================================
// API Client
// ============================================

export class MigrationApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 10000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new MigrationApiError(
          response.status,
          errorData.message || `HTTP ${response.status}`,
          errorData.code
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MigrationApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new MigrationApiError(0, 'Request timeout');
        }
        throw new MigrationApiError(0, error.message);
      }

      throw new MigrationApiError(0, 'Unknown error');
    }
  }

  /**
   * Submit a stake preference (intent) to the migration backend.
   * The backend records the user's preference to stake (or not) on Goliath
   * after their tokens are bridged.
   *
   * POST /migration/stake-preference
   */
  async submitStakePreference(
    payload: SubmitStakePreferenceRequest
  ): Promise<SubmitStakePreferenceResponse> {
    return this.fetch<SubmitStakePreferenceResponse>('/migration/stake-preference', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Bind an origin transaction hash to an existing stake-intent.
   * Called after the user's bridge deposit transaction is submitted on-chain.
   *
   * POST /migration/stake-preference/bind-origin
   */
  async bindOriginTxHash(payload: BindOriginTxHashRequest): Promise<BindOriginTxHashResponse> {
    return this.fetch<BindOriginTxHashResponse>('/migration/stake-preference/bind-origin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get the status of a migration operation by its origin transaction hash.
   * Uses the standard bridge status endpoint which returns additional migration
   * fields (stakeOnGoliath, stakingTxHash, stakingError) when a stake-intent
   * is associated with the operation.
   *
   * Returns null if the operation is not found (404).
   *
   * GET /bridge/status?originTxHash=...
   */
  async getMigrationStatus(originTxHash: string): Promise<MigrationStatusResponse | null> {
    const queryParams = new URLSearchParams();
    queryParams.set('originTxHash', originTxHash);

    try {
      return await this.fetch<MigrationStatusResponse>(
        `/bridge/status?${queryParams.toString()}`
      );
    } catch (error) {
      if (error instanceof MigrationApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Phase-2: Get aggregate migration statistics.
   *
   * GET /migration/stats
   */
  async getMigrationStats(): Promise<MigrationStatsResponse> {
    return this.fetch<MigrationStatsResponse>('/migration/stats');
  }

  /**
   * Phase-2: Get paginated migration history for a specific address.
   *
   * GET /migration/history?address=...&limit=...&offset=...
   */
  async getMigrationHistory(
    address: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<MigrationHistoryResponse> {
    const queryParams = new URLSearchParams({
      address,
      limit: String(limit),
      offset: String(offset),
    });

    return this.fetch<MigrationHistoryResponse>(`/migration/history?${queryParams.toString()}`);
  }
}

// ============================================
// Pre-configured singleton instance
// ============================================

export const migrationApiClient = new MigrationApiClient(bridgeConfig.statusApiBaseUrl);
