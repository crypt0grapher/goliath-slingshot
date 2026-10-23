// Strict validators for the frozen RH public API v1 (public-api.v1.json, task 005).
// Responses are untrusted JSON: every object is closed (additionalProperties: false),
// every field is type/pattern checked, and anything else throws RH_SCHEMA_<NAME>.
import { RhDirection } from '../../constants/rhBridge';

const RAW = /^(0|[1-9][0-9]{0,77})$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;
const ASSET_ID = /^[A-Z][A-Z0-9_]{0,63}$/;
const OPERATION_ID = /^(RH_TO_ONYX|ONYX_TO_RH):0x[0-9a-f]{64}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,128}$/;
const EXPLORER_BASE = /^https:\/\/[^?#]+[^/?#]$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

type Json = Record<string, unknown>;
const fail = (name: string): never => {
  throw new Error('RH_SCHEMA_' + name);
};

function object(value: unknown, name: string, required: string[], optional: string[] = []): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(name);
  const keys = Object.keys(value as Json);
  const allowed = required.concat(optional);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) return fail(name);
  return value as Json;
}
const str = (value: unknown, pattern: RegExp, name: string): string =>
  typeof value === 'string' && pattern.test(value) ? value : fail(name);
const raw = (value: unknown, name: string): string => str(value, RAW, name);
const address = (value: unknown, name: string): string => str(value, ADDRESS, name);
const bool = (value: unknown, name: string): boolean => (typeof value === 'boolean' ? value : fail(name));
const nullableBool = (value: unknown, name: string): boolean | null => (value === null ? null : bool(value, name));
function int(value: unknown, name: string, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fail(name);
}
const nullableInt = (value: unknown, name: string): number | null =>
  value === null ? null : int(value, name, 0, Number.MAX_SAFE_INTEGER);
function timestamp(value: unknown, name: string): number {
  if (typeof value !== 'string' || !ISO.test(value)) return fail(name);
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : fail(name);
}
function text(value: unknown, name: string, max: number): string {
  return typeof value === 'string' && value.length >= 1 && value.length <= max ? value : fail(name);
}
function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fail(name);
}

// ---------------------------------------------------------------- Error

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_AMOUNT',
  'INVALID_ADDRESS',
  'INVALID_CURSOR',
  'AMOUNT_BELOW_MIN_EXIT',
  'AMOUNT_ABOVE_PER_TX_MAX',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CORS_ORIGIN_DENIED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = typeof ERROR_CODES[number];
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}
export function parseError(value: unknown): ApiError {
  const outer = object(value, 'ERROR', ['error']);
  const inner = object(outer.error, 'ERROR', ['code', 'message'], ['requestId']);
  if (inner.requestId !== undefined) str(inner.requestId, /^[A-Za-z0-9_-]{8,64}$/, 'ERROR');
  const message = text(inner.message, 'ERROR', 200);
  if (!/^[ -~]+$/.test(message)) fail('ERROR');
  return { code: oneOf(inner.code, ERROR_CODES, 'ERROR'), message };
}

// ---------------------------------------------------------------- Assets

export interface ChainContracts {
  chainId: number;
  chainName: string;
  explorerBaseUrl: string;
  token?: string;
  escrow?: string;
  wrapper?: string;
  minter?: string;
  deploymentBlock?: string;
}
export interface Asset {
  assetId: string;
  symbol: string;
  name: string;
  decimals: number;
  robinhood: ChainContracts;
  onyx: ChainContracts;
}
export interface Assets {
  contractVersion: '1.0.0';
  lane: string;
  abiVersion: string;
  assets: Asset[];
}
function chainContracts(value: unknown, required: string[]): ChainContracts {
  const row = object(
    value,
    'ASSETS',
    ['chainId', 'chainName', 'explorerBaseUrl', ...required],
    ['token', 'escrow', 'wrapper', 'minter', 'deploymentBlock'].filter((key) => !required.includes(key))
  );
  const result: ChainContracts = {
    chainId: int(row.chainId, 'ASSETS', 1, 2147483647),
    chainName: text(row.chainName, 'ASSETS', 64),
    explorerBaseUrl: str(row.explorerBaseUrl, EXPLORER_BASE, 'ASSETS'),
  };
  for (const key of ['token', 'escrow', 'wrapper', 'minter'] as const) {
    if (row[key] !== undefined) result[key] = address(row[key], 'ASSETS');
  }
  if (row.deploymentBlock !== undefined) result.deploymentBlock = raw(row.deploymentBlock, 'ASSETS');
  return result;
}
export function parseAssets(value: unknown): Assets {
  const body = object(value, 'ASSETS', ['contractVersion', 'lane', 'abiVersion', 'assets']);
  if (body.contractVersion !== '1.0.0') fail('ASSETS');
  if (!Array.isArray(body.assets) || body.assets.length < 1 || body.assets.length > 8) fail('ASSETS');
  const assets = (body.assets as unknown[]).map((item) => {
    const row = object(item, 'ASSETS', ['assetId', 'symbol', 'name', 'decimals', 'robinhood', 'onyx']);
    return {
      assetId: str(row.assetId, ASSET_ID, 'ASSETS'),
      symbol: str(row.symbol, /^[A-Z][A-Z0-9.]{0,11}$/, 'ASSETS'),
      name: text(row.name, 'ASSETS', 64),
      decimals: int(row.decimals, 'ASSETS', 0, 36),
      robinhood: chainContracts(row.robinhood, ['token', 'escrow']),
      onyx: chainContracts(row.onyx, ['wrapper', 'minter']),
    };
  });
  return {
    contractVersion: '1.0.0',
    lane: str(body.lane, /^[A-Z][A-Z0-9_]{0,31}$/, 'ASSETS'),
    abiVersion: str(body.abiVersion, /^rh-stock-bridge-abi-[0-9a-f]{12}$/, 'ASSETS'),
    assets,
  };
}

// ---------------------------------------------------------------- Limits

export interface Limits {
  assetId: string;
  decimals: number;
  deposit: { perTxMax: string; minAmount: string };
  exit: { perTxMax: string; minExit: string };
  caps: { escrowReleaseCap: string; escrowCustodyCap: string; mint24hCap: string; outstandingCap: string };
  fee: { feeBps: number; minFee: string; maxFeeBps: number; maxMinFee: string };
  observedAtMs: number;
}
export function parseLimits(value: unknown): Limits {
  const body = object(value, 'LIMITS', ['assetId', 'decimals', 'deposit', 'exit', 'caps', 'fee', 'observedAt']);
  const deposit = object(body.deposit, 'LIMITS', ['perTxMax', 'minAmount']);
  const exit = object(body.exit, 'LIMITS', ['perTxMax', 'minExit']);
  const caps = object(body.caps, 'LIMITS', ['escrowReleaseCap', 'escrowCustodyCap', 'mint24hCap', 'outstandingCap']);
  const fee = object(body.fee, 'LIMITS', ['feeBps', 'minFee', 'maxFeeBps', 'maxMinFee']);
  return {
    assetId: str(body.assetId, ASSET_ID, 'LIMITS'),
    decimals: int(body.decimals, 'LIMITS', 0, 36),
    deposit: { perTxMax: raw(deposit.perTxMax, 'LIMITS'), minAmount: raw(deposit.minAmount, 'LIMITS') },
    exit: { perTxMax: raw(exit.perTxMax, 'LIMITS'), minExit: raw(exit.minExit, 'LIMITS') },
    caps: {
      escrowReleaseCap: raw(caps.escrowReleaseCap, 'LIMITS'),
      escrowCustodyCap: raw(caps.escrowCustodyCap, 'LIMITS'),
      mint24hCap: raw(caps.mint24hCap, 'LIMITS'),
      outstandingCap: raw(caps.outstandingCap, 'LIMITS'),
    },
    fee: {
      feeBps: int(fee.feeBps, 'LIMITS', 0, 10000),
      minFee: raw(fee.minFee, 'LIMITS'),
      maxFeeBps: int(fee.maxFeeBps, 'LIMITS', 0, 10000),
      maxMinFee: raw(fee.maxMinFee, 'LIMITS'),
    },
    observedAtMs: timestamp(body.observedAt, 'LIMITS'),
  };
}

// ---------------------------------------------------------------- FeeQuote

export interface FeeQuote {
  assetId: string;
  direction: 'ONYX_TO_RH';
  gross: string;
  fee: string;
  net: string;
  suggestedMaxFee: string;
  feeBps: number;
  minFee: string;
  quotedAtMs: number;
  expiresAtMs: number;
}
export function parseFeeQuote(value: unknown): FeeQuote {
  const body = object(value, 'FEE_QUOTE', [
    'assetId',
    'direction',
    'gross',
    'fee',
    'net',
    'suggestedMaxFee',
    'feeBps',
    'minFee',
    'quotedAt',
    'expiresAt',
  ]);
  if (body.direction !== 'ONYX_TO_RH') fail('FEE_QUOTE');
  return {
    assetId: str(body.assetId, ASSET_ID, 'FEE_QUOTE'),
    direction: 'ONYX_TO_RH',
    gross: raw(body.gross, 'FEE_QUOTE'),
    fee: raw(body.fee, 'FEE_QUOTE'),
    net: raw(body.net, 'FEE_QUOTE'),
    suggestedMaxFee: raw(body.suggestedMaxFee, 'FEE_QUOTE'),
    feeBps: int(body.feeBps, 'FEE_QUOTE', 0, 10000),
    minFee: raw(body.minFee, 'FEE_QUOTE'),
    quotedAtMs: timestamp(body.quotedAt, 'FEE_QUOTE'),
    expiresAtMs: timestamp(body.expiresAt, 'FEE_QUOTE'),
  };
}

// ---------------------------------------------------------------- Health

export type ComponentStatus = 'ok' | 'degraded' | 'down' | 'unknown';
const COMPONENT: readonly ComponentStatus[] = ['ok', 'degraded', 'down', 'unknown'];
export interface Lag {
  robinhood: number | null;
  onyx: number | null;
}
export interface Health {
  status: 'ok' | 'degraded' | 'down';
  checkedAtMs: number;
  components: Record<'database' | 'robinhoodWatcher' | 'onyxWatcher' | 'submitter' | 'signer', ComponentStatus>;
  lagSeconds: Lag;
}
function lag(value: unknown, name: string): Lag {
  const row = object(value, name, ['robinhood', 'onyx']);
  return { robinhood: nullableInt(row.robinhood, name), onyx: nullableInt(row.onyx, name) };
}
export function parseHealth(value: unknown): Health {
  const body = object(value, 'HEALTH', ['status', 'checkedAt', 'components', 'lagSeconds']);
  const c = object(body.components, 'HEALTH', ['database', 'robinhoodWatcher', 'onyxWatcher', 'submitter', 'signer']);
  return {
    status: oneOf(body.status, ['ok', 'degraded', 'down'] as const, 'HEALTH'),
    checkedAtMs: timestamp(body.checkedAt, 'HEALTH'),
    components: {
      database: oneOf(c.database, COMPONENT, 'HEALTH'),
      robinhoodWatcher: oneOf(c.robinhoodWatcher, COMPONENT, 'HEALTH'),
      onyxWatcher: oneOf(c.onyxWatcher, COMPONENT, 'HEALTH'),
      submitter: oneOf(c.submitter, COMPONENT, 'HEALTH'),
      signer: oneOf(c.signer, COMPONENT, 'HEALTH'),
    },
    lagSeconds: lag(body.lagSeconds, 'HEALTH'),
  };
}

// ---------------------------------------------------------------- EffectiveState

export type PartyState = 'OPEN' | 'CLOSED' | 'FROZEN' | 'UNKNOWN';
const PARTY: readonly PartyState[] = ['OPEN', 'CLOSED', 'FROZEN', 'UNKNOWN'];
export interface ChainFinality {
  finalizedBlock: string | null;
  etaSeconds: number | null;
}
export interface EffectiveState {
  assetId: string;
  observedAtMs: number;
  depositsOpen: boolean;
  exitsOpen: boolean;
  admission: 'FROZEN' | 'CLOSED' | 'CANARY' | 'OPEN';
  paused: { escrow: boolean | null; minter: boolean | null; token: boolean | null; wrapper: boolean | null };
  issuer: PartyState;
  collector: PartyState;
  held: { lane: boolean; deposits: boolean; exits: boolean; recipientHolds: number };
  upgradePending: boolean;
  lagSeconds: Lag;
  finality: { robinhood: ChainFinality; onyx: ChainFinality };
}
function finality(value: unknown): ChainFinality {
  const row = object(value, 'EFFECTIVE_STATE', ['finalizedBlock', 'etaSeconds']);
  return {
    finalizedBlock: row.finalizedBlock === null ? null : raw(row.finalizedBlock, 'EFFECTIVE_STATE'),
    etaSeconds: nullableInt(row.etaSeconds, 'EFFECTIVE_STATE'),
  };
}
export function parseEffectiveState(value: unknown): EffectiveState {
  const body = object(value, 'EFFECTIVE_STATE', [
    'assetId',
    'observedAt',
    'depositsOpen',
    'exitsOpen',
    'admission',
    'paused',
    'issuer',
    'collector',
    'held',
    'upgradePending',
    'lagSeconds',
    'finality',
  ]);
  const paused = object(body.paused, 'EFFECTIVE_STATE', ['escrow', 'minter', 'token', 'wrapper']);
  const held = object(body.held, 'EFFECTIVE_STATE', ['lane', 'deposits', 'exits', 'recipientHolds']);
  const fin = object(body.finality, 'EFFECTIVE_STATE', ['robinhood', 'onyx']);
  return {
    assetId: str(body.assetId, ASSET_ID, 'EFFECTIVE_STATE'),
    observedAtMs: timestamp(body.observedAt, 'EFFECTIVE_STATE'),
    depositsOpen: bool(body.depositsOpen, 'EFFECTIVE_STATE'),
    exitsOpen: bool(body.exitsOpen, 'EFFECTIVE_STATE'),
    admission: oneOf(body.admission, ['FROZEN', 'CLOSED', 'CANARY', 'OPEN'] as const, 'EFFECTIVE_STATE'),
    paused: {
      escrow: nullableBool(paused.escrow, 'EFFECTIVE_STATE'),
      minter: nullableBool(paused.minter, 'EFFECTIVE_STATE'),
      token: nullableBool(paused.token, 'EFFECTIVE_STATE'),
      wrapper: nullableBool(paused.wrapper, 'EFFECTIVE_STATE'),
    },
    issuer: oneOf(body.issuer, PARTY, 'EFFECTIVE_STATE'),
    collector: oneOf(body.collector, PARTY, 'EFFECTIVE_STATE'),
    held: {
      lane: bool(held.lane, 'EFFECTIVE_STATE'),
      deposits: bool(held.deposits, 'EFFECTIVE_STATE'),
      exits: bool(held.exits, 'EFFECTIVE_STATE'),
      recipientHolds: int(held.recipientHolds, 'EFFECTIVE_STATE', 0, Number.MAX_SAFE_INTEGER),
    },
    upgradePending: bool(body.upgradePending, 'EFFECTIVE_STATE'),
    lagSeconds: lag(body.lagSeconds, 'EFFECTIVE_STATE'),
    finality: { robinhood: finality(fin.robinhood), onyx: finality(fin.onyx) },
  };
}

// ---------------------------------------------------------------- Operation

export type OperationStatus = 'AWAITING_EXECUTION' | 'EXECUTING' | 'HELD' | 'COMPLETED';
export interface Leg {
  chainId: number;
  txHash: string | null;
  logIndex?: string;
  blockNumber: string | null;
  explorerUrl: string | null;
  final: boolean;
}
export interface Operation {
  operationId: string;
  direction: RhDirection;
  status: OperationStatus;
  holdCategory: 'LANE_PAUSED' | 'UNDER_REVIEW' | null;
  assetId: string;
  sender: string;
  recipient: string;
  grossAmount: string;
  fee: string;
  netAmount: string;
  source: Leg;
  destination: Leg;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs: number | null;
}
function leg(value: unknown, isSource: boolean): Leg {
  const row = object(
    value,
    'OPERATION',
    ['chainId', 'txHash', 'blockNumber', 'explorerUrl', 'final', ...(isSource ? ['logIndex'] : [])],
    isSource ? [] : ['logIndex']
  );
  const result: Leg = {
    chainId: int(row.chainId, 'OPERATION', 1, 2147483647),
    txHash: row.txHash === null ? null : str(row.txHash, TX_HASH, 'OPERATION'),
    blockNumber: row.blockNumber === null ? null : raw(row.blockNumber, 'OPERATION'),
    explorerUrl: row.explorerUrl === null ? null : str(row.explorerUrl, /^https:\/\/\S+$/, 'OPERATION'),
    final: bool(row.final, 'OPERATION'),
  };
  if (row.logIndex !== undefined) result.logIndex = raw(row.logIndex, 'OPERATION');
  if (isSource && result.final !== true) fail('OPERATION');
  return result;
}
export function parseOperation(value: unknown): Operation {
  const body = object(value, 'OPERATION', [
    'operationId',
    'direction',
    'status',
    'holdCategory',
    'assetId',
    'sender',
    'recipient',
    'grossAmount',
    'fee',
    'netAmount',
    'source',
    'destination',
    'createdAt',
    'updatedAt',
    'completedAt',
  ]);
  const operationId = str(body.operationId, OPERATION_ID, 'OPERATION');
  const direction = oneOf(body.direction, ['RH_TO_ONYX', 'ONYX_TO_RH'] as const, 'OPERATION');
  if (!operationId.startsWith(direction + ':')) fail('OPERATION');
  return {
    operationId,
    direction,
    status: oneOf(body.status, ['AWAITING_EXECUTION', 'EXECUTING', 'HELD', 'COMPLETED'] as const, 'OPERATION'),
    holdCategory:
      body.holdCategory === null
        ? null
        : oneOf(body.holdCategory, ['LANE_PAUSED', 'UNDER_REVIEW'] as const, 'OPERATION'),
    assetId: str(body.assetId, ASSET_ID, 'OPERATION'),
    sender: address(body.sender, 'OPERATION'),
    recipient: address(body.recipient, 'OPERATION'),
    grossAmount: raw(body.grossAmount, 'OPERATION'),
    fee: raw(body.fee, 'OPERATION'),
    netAmount: raw(body.netAmount, 'OPERATION'),
    source: leg(body.source, true),
    destination: leg(body.destination, false),
    createdAtMs: timestamp(body.createdAt, 'OPERATION'),
    updatedAtMs: timestamp(body.updatedAt, 'OPERATION'),
    completedAtMs: body.completedAt === null ? null : timestamp(body.completedAt, 'OPERATION'),
  };
}
export function parseOperationList(value: unknown): Operation[] {
  const body = object(value, 'OPERATION_LIST', ['items']);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) fail('OPERATION_LIST');
  return (body.items as unknown[]).map(parseOperation);
}
export interface History {
  items: Operation[];
  nextCursor: string | null;
}
export function parseHistory(value: unknown): History {
  const body = object(value, 'HISTORY', ['items', 'nextCursor']);
  if (!Array.isArray(body.items) || body.items.length > 50) fail('HISTORY');
  return {
    items: (body.items as unknown[]).map(parseOperation),
    nextCursor: body.nextCursor === null ? null : str(body.nextCursor, CURSOR, 'HISTORY'),
  };
}
