import i18n from 'i18next';
import { BridgeDirection, BridgeStatus, BridgeTokenSymbol } from '../state/bridge/types';

// ============================================
// API Response Types
// ============================================

export interface FeeQuoteResponse {
  inputAmount: string;
  inputFormatted: string;
  feeAmount: string;
  feeFormatted: string;
  feeBps: number;
  outputAmount: string;
  outputFormatted: string;
  token: string;
}

export interface TokenLimits {
  minAmount: string;
  minAmountFormatted: string;
  minFee: string;
  minFeeFormatted: string;
}

export interface DirectionLimits {
  feeBps: number;
  tokens: Record<string, TokenLimits>;
}

export interface LimitsResponse {
  goliathToSepolia: DirectionLimits;
  sepoliaToGoliath: DirectionLimits;
}

export interface BridgeStatusResponse {
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
}

export interface BridgeHistoryResponse {
  operations: BridgeStatusResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface BridgeHealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  chains: {
    sepolia: {
      connected: boolean;
      lastBlock: number;
      lastProcessedBlock: number;
      lag: number;
    };
    goliath: {
      connected: boolean;
      lastBlock: number;
      lastProcessedBlock: number;
      lag: number;
    };
  };
  relayer: {
    pendingOperations: number;
    lastProcessedAt: string;
  };
}

// ============================================
// Error Class
// ============================================

export class BridgeApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'BridgeApiError';
    this.status = status;
    this.code = code;
  }
}

// ============================================
// API Client
// ============================================

export class BridgeApiClient {
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
        throw new BridgeApiError(
          response.status,
          errorData.message || `HTTP ${response.status}`,
          errorData.code
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof BridgeApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BridgeApiError(0, 'Request timeout');
        }
        throw new BridgeApiError(0, error.message);
      }

      throw new BridgeApiError(0, 'Unknown error');
    }
  }

  /**
   * Get status of a bridge operation
   */
  async getStatus(params: {
    originTxHash?: string | null;
    depositId?: string | null;
    withdrawId?: string | null;
  }): Promise<BridgeStatusResponse | null> {
    const queryParams = new URLSearchParams();

    if (params.originTxHash) {
      queryParams.set('originTxHash', params.originTxHash);
    } else if (params.depositId) {
      queryParams.set('depositId', params.depositId);
    } else if (params.withdrawId) {
      queryParams.set('withdrawId', params.withdrawId);
    } else {
      throw new Error(i18n.t('errorBridgeParamRequired'));
    }

    try {
      return await this.fetch<BridgeStatusResponse>(`/bridge/status?${queryParams.toString()}`);
    } catch (error) {
      if (error instanceof BridgeApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get bridge history for an address
   */
  async getHistory(params: {
    address: string;
    limit?: number;
    offset?: number;
    status?: BridgeStatus;
    direction?: BridgeDirection;
  }): Promise<BridgeHistoryResponse> {
    const queryParams = new URLSearchParams({
      address: params.address,
      limit: String(params.limit ?? 10),
      offset: String(params.offset ?? 0),
    });

    if (params.status) {
      queryParams.set('status', params.status);
    }
    if (params.direction) {
      queryParams.set('direction', params.direction);
    }

    return this.fetch<BridgeHistoryResponse>(`/bridge/history?${queryParams.toString()}`);
  }

  /**
   * Check bridge health status
   */
  async getHealth(): Promise<BridgeHealthResponse> {
    return this.fetch<BridgeHealthResponse>('/health');
  }

  /**
   * Register an XCN withdraw intent (Goliath -> Sepolia)
   */
  async registerXcnWithdrawIntent(params: {
    senderAddress: string;
    recipientAddress: string;
    amountAtomic: string;
    idempotencyKey: string;
    deadline: number;
    nonce: string;
    signature: string;
  }): Promise<{ intentId: string; relayerWalletAddress: string; expiresAt: string }> {
    return this.fetch('/bridge/xcn-withdraw-intent', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Bind an origin tx hash to an XCN withdraw intent
   */
  async bindXcnWithdrawOrigin(params: {
    intentId: string;
    senderAddress: string;
    originTxHash: string;
  }): Promise<{ intentId: string; originTxHash: string }> {
    return this.fetch('/bridge/xcn-withdraw-intent/bind-origin', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get fee quote for a bridge operation
   */
  async getFeeQuote(params: {
    token: string;
    amount: string;
    direction: string;
  }): Promise<FeeQuoteResponse> {
    const queryParams = new URLSearchParams({
      token: params.token,
      amount: params.amount,
      direction: params.direction,
    });
    return this.fetch<FeeQuoteResponse>(`/bridge/fee-quote?${queryParams.toString()}`);
  }

  /**
   * Get bridge limits (min amounts, fee rates)
   */
  async getLimits(): Promise<LimitsResponse> {
    return this.fetch<LimitsResponse>('/bridge/limits');
  }

  /**
   * Check if bridge is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status !== 'healthy';
    } catch {
      return true; // Assume paused if we can't reach the API
    }
  }

  /**
   * Check if the backend supports XCN withdraw (Goliath -> Sepolia) routes.
   *
   * Probes the service root endpoint and checks whether
   * `xcnWithdrawIntent` and `xcnWithdrawBindOrigin` keys appear
   * in the endpoints map. Returns false if the probe fails or
   * the required keys are absent — callers MUST NOT initiate a
   * native XCN transfer when this returns false.
   */
  async checkXcnWithdrawCapability(): Promise<boolean> {
    try {
      // The root endpoint is one level above the API base
      // e.g. baseUrl = ".../bridge/api/v1" -> root = ".../bridge/"
      const rootUrl = this.baseUrl.replace(/\/api\/v1\/?$/, '/');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(rootUrl, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) return false;

      const data = await response.json();
      const endpoints = data?.endpoints;
      if (!endpoints) return false;

      return (
        typeof endpoints.xcnWithdrawIntent === 'string' &&
        typeof endpoints.xcnWithdrawBindOrigin === 'string'
      );
    } catch {
      return false;
    }
  }
}
