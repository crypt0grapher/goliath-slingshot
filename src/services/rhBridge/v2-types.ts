// SPDX-License-Identifier: Apache-2.0
// Frozen public API2 DTOs from UB01 api-profile.json. Runtime quantities remain raw strings.
export type RawAmount = string;
export type Address = string;
export type Hash32 = string;
export type Sha256 = string;
export type Timestamp = string;
export type ChainId = 46630 | 8901;
export type AssetId = string;
export type Direction = 'RH_TO_ONYX' | 'ONYX_TO_RH';
export type Admission = 'FROZEN' | 'CLOSED' | 'CANARY' | 'OPEN';
export type OperationId = string;
export type Binding = {
  readonly assetId: AssetId;
  readonly profileSha256: Sha256;
  readonly profileVersion: 1 | 2;
  readonly abiVersion: string;
};
export type Block = {
  readonly chainId: ChainId;
  readonly number: RawAmount;
  readonly hash: Hash32;
  readonly timestamp: Timestamp;
};
export type Observation = {
  readonly observedAt: Timestamp;
  readonly expiresAt: Timestamp;
  readonly freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  readonly robinhood: Block | null;
  readonly onyx: Block | null;
  readonly ledgerObservedAt: Timestamp | null;
};
export type Caps = {
  readonly escrowReleaseCap: RawAmount;
  readonly escrowCustodyCap: RawAmount;
  readonly mint24hCap: RawAmount;
  readonly outstandingCap: RawAmount;
  readonly wrapperSupplyCap: RawAmount;
};
export type Fees = {
  readonly feeBps: number;
  readonly minFee: RawAmount;
  readonly minExit: RawAmount;
  readonly maxFeeBps: number;
  readonly maxMinFee: RawAmount;
};
export type Contract = {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly runtimeCodeKeccak256: Hash32;
  readonly deploymentBlock: RawAmount;
  readonly deploymentTx: Hash32;
  readonly onyxContractId: string | null;
};
export type Asset = {
  readonly binding: Binding;
  readonly symbol: string;
  readonly wrapperSymbol: string;
  readonly name: string;
  readonly decimals: 18;
  readonly originChainId: 46630;
  readonly kind: 'ERC20' | 'NATIVE';
  readonly canonicalIdentifier: Address;
  readonly token: Address | null;
  readonly escrow: Contract;
  readonly minter: Contract;
  readonly wrapper: Contract;
  readonly implementation: Contract;
  readonly tokenRuntimeCodeKeccak256: Hash32 | null;
  readonly issuerPolicy: 'TSLA_ACCESS_CONTROLLED_REGISTRY' | 'NOT_APPLICABLE';
  readonly manifestSha256: Sha256;
};
export type Assets = {
  readonly contractVersion: '2.0.0';
  readonly lane: 'RH_TESTNET';
  readonly registrySha256: Sha256;
  readonly assets: readonly Asset[];
};
export type Limits = {
  readonly binding: Binding;
  readonly observation: Observation;
  readonly decimals: 18;
  readonly deposit: { readonly perTxMax: RawAmount; readonly minAmount: RawAmount };
  readonly exit: { readonly perTxMax: RawAmount; readonly minExit: RawAmount };
  readonly caps: Caps;
  readonly fee: Fees;
};
export type FeeQuote = {
  readonly binding: Binding;
  readonly direction: Direction;
  readonly gross: RawAmount;
  readonly fee: RawAmount;
  readonly net: RawAmount;
  readonly suggestedMaxFee: RawAmount;
  readonly feeBps: number;
  readonly minFee: RawAmount;
  readonly observation: Observation;
  readonly quotedAt: Timestamp;
  readonly expiresAt: Timestamp;
};
export type Readiness = {
  readonly globalAdmission: Admission;
  readonly assetAdmission: Admission;
  readonly effectiveAdmission: Admission;
  readonly globalHeld: boolean;
  readonly assetHeld: boolean;
  readonly depositsHeld: boolean;
  readonly exitsHeld: boolean;
  readonly depositGateOpen: boolean | null;
  readonly parametersMatchProfile: boolean | null;
  readonly manifestVerified: boolean;
  readonly consumersReady: boolean;
  readonly sourceAndDestinationHealthy: boolean;
};
export type EffectiveState = {
  readonly binding: Binding;
  readonly observation: Observation;
  readonly readiness: Readiness;
  readonly depositsOpen: boolean;
  readonly exitsOpen: boolean;
  readonly paused: {
    readonly escrow: boolean | null;
    readonly minter: boolean | null;
    readonly wrapper: boolean | null;
    readonly token: boolean | null;
  };
  readonly issuer: 'OPEN' | 'CLOSED' | 'FROZEN' | 'UNKNOWN' | 'NOT_APPLICABLE';
  readonly collector: 'OPEN' | 'CLOSED' | 'FROZEN' | 'UNKNOWN';
  readonly upgradePending: boolean | null;
  readonly lagSeconds: { readonly robinhood: number | null; readonly onyx: number | null };
  readonly etaSeconds: { readonly RH_TO_ONYX: number | null; readonly ONYX_TO_RH: number | null };
  readonly eligibility: {
    readonly sender: Address | null;
    readonly recipient: Address | null;
    readonly status: 'ALLOWED' | 'DENIED' | 'NOT_CHECKED' | 'UNKNOWN';
  };
  readonly reasonCodes: readonly string[];
};
export type Capacity = {
  readonly binding: Binding;
  readonly direction: Direction;
  readonly observation: Observation;
  readonly perTxMax: RawAmount;
  readonly remainingCapacity: RawAmount;
  readonly components: {
    readonly custodyRoom: RawAmount | null;
    readonly rollingMintRoom: RawAmount | null;
    readonly outstandingRoom: RawAmount | null;
    readonly supplyRoom: RawAmount | null;
    readonly rollingReleaseRoom: RawAmount | null;
    readonly availableCustody: RawAmount | null;
    readonly availableOutstanding: RawAmount | null;
    readonly pendingUnminted: RawAmount | null;
    readonly pendingUnreleased: RawAmount | null;
  };
  readonly admissionAllowsNewSource: boolean;
};
export type Leg = {
  readonly chainId: ChainId;
  readonly txHash: Hash32 | null;
  readonly logIndex: RawAmount | null;
  readonly blockNumber: RawAmount | null;
  readonly explorerUrl: string | null;
  readonly final: boolean;
};
export type Operation = {
  readonly binding: Binding;
  readonly operationId: OperationId;
  readonly direction: Direction;
  readonly status: 'AWAITING_EXECUTION' | 'EXECUTING' | 'HELD' | 'COMPLETED';
  readonly holdCategory: ('LANE_PAUSED' | 'UNDER_REVIEW') | null;
  readonly sender: Address;
  readonly recipient: Address;
  readonly grossAmount: RawAmount;
  readonly fee: RawAmount;
  readonly netAmount: RawAmount;
  readonly source: Leg;
  readonly destination: Leg;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  readonly completedAt: Timestamp | null;
};
export type OperationList = { readonly items: readonly Operation[] };
export type History = {
  readonly address: Address;
  readonly assetId: AssetId | null;
  readonly items: readonly Operation[];
  readonly nextCursor: string | null;
};
export type Health = {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly observedAt: Timestamp;
  readonly components: {
    readonly database: 'ok' | 'degraded' | 'down' | 'unknown';
    readonly api: 'ok' | 'degraded' | 'down' | 'unknown';
    readonly watcher: 'ok' | 'degraded' | 'down' | 'unknown';
    readonly submitter: 'ok' | 'degraded' | 'down' | 'unknown';
    readonly signer: 'ok' | 'degraded' | 'down' | 'unknown';
  };
  readonly assets: readonly {
    readonly binding: Binding;
    readonly status: 'ok' | 'degraded' | 'down' | 'unknown';
    readonly consumersReady: boolean;
  }[];
};
export type ErrorResponse = {
  readonly error: {
    readonly code:
      | 'INVALID_REQUEST'
      | 'INVALID_AMOUNT'
      | 'INVALID_ADDRESS'
      | 'INVALID_CURSOR'
      | 'ASSET_NOT_FOUND'
      | 'NOT_FOUND'
      | 'PROFILE_MISMATCH'
      | 'AMOUNT_BELOW_MIN_EXIT'
      | 'AMOUNT_ABOVE_PER_TX_MAX'
      | 'AMOUNT_ABOVE_CAPACITY'
      | 'CORS_ORIGIN_DENIED'
      | 'METHOD_NOT_ALLOWED'
      | 'RATE_LIMITED'
      | 'SERVICE_UNAVAILABLE'
      | 'PROFILE_UNAVAILABLE'
      | 'PARAMETERS_UNAVAILABLE'
      | 'CAPACITY_UNAVAILABLE'
      | 'STALE_DATA';
    readonly message: string;
    readonly requestId: string;
  };
};
export type V2ErrorCode = ErrorResponse['error']['code'];
