// ============================================
// Enums
// ============================================

export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
}

export type BridgeDirection = 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA';

// v1.0: USDC and ETH. Future versions will add 'XCN' | 'BTC'
export type BridgeTokenSymbol = 'USDC' | 'ETH';

export type BridgeStatus =
  | 'PENDING_ORIGIN_TX' // User submitted tx, waiting for mining
  | 'CONFIRMING' // Origin tx mined, waiting for confirmations
  | 'AWAITING_RELAY' // Origin finalized, waiting for relayer
  | 'PROCESSING_DESTINATION' // Relayer submitted destination tx
  | 'COMPLETED' // Destination tx confirmed
  | 'FAILED' // Permanent failure
  | 'EXPIRED' // Timeout exceeded (60+ minutes)
  | 'DELAYED'; // Taking longer than expected (10+ minutes)

// ============================================
// Core Data Types
// ============================================

export interface BridgeOperation {
  id: string; // UUID v4
  direction: BridgeDirection;
  token: BridgeTokenSymbol;
  amountHuman: string; // Human-readable (e.g., "100.5")
  amountAtomic: string; // Stringified BigInt in token decimals
  sender: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originTxHash: string | null;
  destinationTxHash: string | null;
  depositId: string | null; // From contract event
  withdrawId: string | null; // From contract event
  status: BridgeStatus;
  createdAt: number; // Unix timestamp (ms)
  updatedAt: number; // Unix timestamp (ms)
  originConfirmations: number;
  requiredConfirmations: number;
  errorMessage: string | null;
  estimatedCompletionTime: string | null; // ISO 8601 from backend
}

// ============================================
// Form State
// ============================================

export interface BridgeFormState {
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string; // User input string
  recipient: string | null; // null = same as sender (v1 default)
}

// ============================================
// Redux State
// ============================================

export interface BridgeState {
  // Form state
  form: BridgeFormState;

  // Operations
  operations: Record<string, BridgeOperation>;
  operationIds: string[]; // Ordered by createdAt desc

  // Active operation (currently showing in modal)
  activeOperationId: string | null;

  // UI state
  isConfirmModalOpen: boolean;
  isStatusModalOpen: boolean;

  // Loading states
  isSubmitting: boolean;
  isApproving: boolean;

  // Error state
  error: string | null;

  // Polling error (transient, for status polling failures)
  pollingError: string | null;
}
