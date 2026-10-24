// Durable RH lane operation history. Reads and writes ONLY RH_HISTORY_KEY; it never
// reads, modifies or clears bridge:operations:v2, migration or redux-localstorage keys.
// An intent is persisted BEFORE every wallet prompt and its hash attached afterwards,
// so a reload or provider loss can be recovered without ever re-sending.
// Stored rows that fail validation (tampered or foreign) are ignored for display and
// actions but preserved byte-for-byte on every write; nothing is ever cleared.
import { LaneBinding, RH_STALE_PENDING_MS } from '../../config/rhBridge';
import { chainPair, RH_HISTORY_KEY, RhDirection } from '../../constants/rhBridge';
import type { Binding } from '../../services/rhBridge/v2-types';
import { parseV2 } from '../../services/rhBridge/v2-schema';

export const HISTORY_KEY = RH_HISTORY_KEY;
export const MAX_RECORDS = 100;

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type Step = 'APPROVE' | 'BRIDGE';
export type Stage =
  | 'WALLET_PROMPT' // signature requested; intent stored, no hash yet
  | 'SOURCE_PENDING' // hash known; waiting for the receipt and bridge finality
  | 'APPROVED' // exact approval confirmed; waiting for the user's bridge click
  | 'SOURCE_FINAL' // API: source event finalized and recorded (AWAITING_EXECUTION)
  | 'RELAY_PENDING' // API: destination transaction in flight (EXECUTING)
  | 'DELIVERED' // API: COMPLETED, destination hash recorded
  | 'HELD' // API: HELD
  | 'FAILED' // rejected, refused before signing, or reverted
  | 'UNCERTAIN' // prompt interrupted, ambiguous wallet error, or replaced/dropped; may have been broadcast
  | 'DISMISSED'; // the user deliberately closed a failed/uncertain/approved/long-pending record

export const STAGES: readonly Stage[] = [
  'WALLET_PROMPT',
  'SOURCE_PENDING',
  'APPROVED',
  'SOURCE_FINAL',
  'RELAY_PENDING',
  'DELIVERED',
  'HELD',
  'FAILED',
  'UNCERTAIN',
  'DISMISSED',
];
const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  WALLET_PROMPT: ['SOURCE_PENDING', 'FAILED', 'UNCERTAIN'],
  // UNCERTAIN: replaced or dropped (nonce consumed, no receipt); DISMISSED: long pending, no receipt.
  SOURCE_PENDING: [
    'APPROVED',
    'FAILED',
    'SOURCE_FINAL',
    'RELAY_PENDING',
    'DELIVERED',
    'HELD',
    'UNCERTAIN',
    'DISMISSED',
  ],
  APPROVED: ['WALLET_PROMPT', 'DISMISSED'],
  SOURCE_FINAL: ['RELAY_PENDING', 'DELIVERED', 'HELD'],
  RELAY_PENDING: ['SOURCE_FINAL', 'DELIVERED', 'HELD'],
  HELD: ['SOURCE_FINAL', 'RELAY_PENDING', 'DELIVERED'],
  // FAILED only for a definitive user rejection of the same interrupted prompt (second tab).
  UNCERTAIN: ['SOURCE_PENDING', 'APPROVED', 'DISMISSED', 'FAILED'],
  FAILED: ['DISMISSED'],
  DELIVERED: [],
  DISMISSED: [],
};
// Stages in which this browser still owes the user an outcome.
export const isOpen = (stage: Stage): boolean => !['DELIVERED', 'DISMISSED'].includes(stage);

export interface Bindings {
  token: string;
  escrow: string;
  wrapper: string;
  minter: string;
}
export interface RhRecord {
  schemaVersion: 1 | 2;
  assetBinding?: Binding;
  assetKind?: 'ERC20' | 'NATIVE';
  id: string;
  direction: RhDirection;
  account: string;
  recipient: string;
  grossRaw: string;
  feeRaw: string;
  maxFeeRaw: string | null;
  bindings: Bindings;
  step: Step;
  stage: Stage;
  approveTxHash: string | null;
  sourceTxHash: string | null;
  sourceBlock: number | null;
  // Nonce of the current step's transaction: the exact nonce once the RPC has seen the
  // transaction, otherwise the account's pending nonce read just before the prompt.
  txNonce: number | null;
  // Hash of a transaction that was replaced or dropped (nonce consumed without a receipt).
  replacedTxHash: string | null;
  operationId: string | null;
  destinationTxHash: string | null;
  holdCategory: string | null;
  failure: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

const KEYS: (keyof RhRecord)[] = [
  'schemaVersion',
  'id',
  'direction',
  'account',
  'recipient',
  'grossRaw',
  'feeRaw',
  'maxFeeRaw',
  'bindings',
  'step',
  'stage',
  'approveTxHash',
  'sourceTxHash',
  'sourceBlock',
  'txNonce',
  'replacedTxHash',
  'operationId',
  'destinationTxHash',
  'holdCategory',
  'failure',
  'createdAtMs',
  'updatedAtMs',
];
const ADDRESS = /^0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const RAW = /^(0|[1-9][0-9]{0,77})$/;
const invalid = (): never => {
  throw new Error('RH_HISTORY_INVALID');
};
const nullable = (value: unknown, test: (v: unknown) => boolean) => value === null || test(value);
const matches = (pattern: RegExp) => (v: unknown) => typeof v === 'string' && pattern.test(v);
const safeInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
// Safe integers can exceed JavaScript's Date range; stored timestamps must also render safely.
const timestamp = (v: unknown) => safeInt(v) && (v as number) <= 8.64e15;

export function validateRecord(value: unknown): RhRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  const expected = row.schemaVersion === 2 ? [...KEYS, 'assetBinding', 'assetKind'] : KEYS;
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) return invalid();
  if (row.schemaVersion === 2) {
    parseV2('Binding', row.assetBinding);
    if (row.assetKind !== 'ERC20' && row.assetKind !== 'NATIVE') return invalid();
  }
  const b = row.bindings as Record<string, unknown>;
  if (
    !b ||
    typeof b !== 'object' ||
    Array.isArray(b) ||
    Object.keys(b).sort().join() !== 'escrow,minter,token,wrapper'
  ) {
    return invalid();
  }
  const checks: boolean[] = [
    row.schemaVersion === 1 || row.schemaVersion === 2,
    matches(/^rh-[0-9]{1,16}-[0-9a-f]{8}$/)(row.id),
    row.direction === 'RH_TO_ONYX' || row.direction === 'ONYX_TO_RH',
    matches(ADDRESS)(row.account),
    matches(ADDRESS)(row.recipient),
    matches(RAW)(row.grossRaw) && row.grossRaw !== '0',
    matches(RAW)(row.feeRaw),
    nullable(row.maxFeeRaw, matches(RAW)),
    ['token', 'escrow', 'wrapper', 'minter'].every((k) => matches(ADDRESS)(b[k])),
    row.step === 'APPROVE' || row.step === 'BRIDGE',
    STAGES.includes(row.stage as Stage),
    nullable(row.approveTxHash, matches(HASH)),
    nullable(row.sourceTxHash, matches(HASH)),
    nullable(row.sourceBlock, safeInt),
    nullable(row.txNonce, safeInt),
    nullable(row.replacedTxHash, matches(HASH)),
    nullable(row.operationId, matches(/^(RH_TO_ONYX|ONYX_TO_RH):0x[0-9a-f]{64}$/)),
    nullable(row.destinationTxHash, matches(/^(0x[0-9a-f]{64}|(\d+\.\d+\.\d+@)?\d+\.\d+)$/)),
    nullable(row.holdCategory, matches(/^[A-Z_]{1,32}$/)),
    nullable(row.failure, matches(/^[A-Z0-9_]{1,64}$/)),
    timestamp(row.createdAtMs),
    timestamp(row.updatedAtMs) && (row.updatedAtMs as number) >= (row.createdAtMs as number),
  ];
  if (checks.some((ok) => !ok)) return invalid();
  // Amounts: 0 <= fee < gross, and a recorded maxFee covers the fee and stays below gross.
  const gross = BigInt(row.grossRaw as string);
  const fee = BigInt(row.feeRaw as string);
  if (fee >= gross) return invalid();
  if (row.maxFeeRaw !== null && (BigInt(row.maxFeeRaw as string) < fee || BigInt(row.maxFeeRaw as string) >= gross)) {
    return invalid();
  }
  if (row.direction === 'RH_TO_ONYX' && (row.feeRaw !== '0' || row.maxFeeRaw !== null)) return invalid();
  // A hash belongs to the step that produced it; a bridge-stage record has a source hash.
  const stage = row.stage as Stage;
  if (
    ['SOURCE_FINAL', 'RELAY_PENDING', 'DELIVERED', 'HELD'].includes(stage) &&
    (row.step !== 'BRIDGE' || !row.sourceTxHash)
  ) {
    return invalid();
  }
  if (stage === 'APPROVED' && row.step !== 'APPROVE') return invalid();
  if (stage === 'SOURCE_PENDING' && !(row.step === 'APPROVE' ? row.approveTxHash : row.sourceTxHash)) return invalid();
  if (row.step === 'APPROVE' && row.sourceTxHash) return invalid();
  if (row.operationId && !(row.operationId as string).startsWith((row.direction as string) + ':')) return invalid();
  return row as unknown as RhRecord;
}

export interface HistoryView {
  status: 'READY' | 'INVALID';
  records: RhRecord[];
  invalidRows: number; // stored rows ignored because they fail validation
}

interface Loaded {
  rows: unknown[];
  records: RhRecord[];
  index: Map<string, number>; // record id -> row position
}

// INVALID only when the stored value as a whole is unusable (not a JSON array, too large):
// then nothing is written, because it may hold an uncertain broadcast.
function load(storage: HistoryStorage): Loaded | null {
  try {
    const encoded = storage.getItem(HISTORY_KEY);
    if (encoded === null) return { rows: [], records: [], index: new Map() };
    if (encoded.length > 512 * 1024) return null;
    const rows = JSON.parse(encoded);
    if (!Array.isArray(rows) || rows.length > MAX_RECORDS) return null;
    const records: RhRecord[] = [];
    const index = new Map<string, number>();
    rows.forEach((row, position) => {
      try {
        const record = validateRecord(row);
        if (index.has(record.id)) return; // a duplicate id is ignored like any invalid row
        index.set(record.id, position);
        records.push(record);
      } catch {
        /* ignored and preserved */
      }
    });
    return { rows, records, index };
  } catch {
    return null;
  }
}

export function readHistory(storage: HistoryStorage): HistoryView {
  const loaded = load(storage);
  if (!loaded) return { status: 'INVALID', records: [], invalidRows: 0 };
  return { status: 'READY', records: loaded.records, invalidRows: loaded.rows.length - loaded.records.length };
}

function loadForWrite(storage: HistoryStorage): Loaded {
  const loaded = load(storage);
  if (!loaded) throw new Error('RH_HISTORY_HOLD');
  return loaded;
}

function write(storage: HistoryStorage, rows: unknown[]): void {
  // Keep the exact lexical bytes of untouched/unknown rows, rather than migrating them on append.
  const old = storage.getItem(HISTORY_KEY);
  if (old) {
    try {
      const values = JSON.parse(old),
        tokens: string[] = [];
      let start = old.indexOf('[') + 1,
        depth = 0,
        string = false,
        escape = false;
      for (let i = start; i < old.lastIndexOf(']'); i++) {
        const c = old[i];
        if (string) {
          if (escape) escape = false;
          else if (c === '\\') escape = true;
          else if (c === '"') string = false;
        } else if (c === '"') string = true;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') depth--;
        else if (c === ',' && depth === 0) {
          tokens.push(old.slice(start, i));
          start = i + 1;
        }
      }
      if (old.slice(start, old.lastIndexOf(']')).trim()) tokens.push(old.slice(start, old.lastIndexOf(']')));
      if (Array.isArray(values) && values.length === tokens.length) {
        const originals = new Map<string, string[]>();
        values.forEach((v, i) => {
          const key = JSON.stringify(v),
            list = originals.get(key) ?? [];
          list.push(tokens[i]);
          originals.set(key, list);
        });
        const encoded =
          '[' +
          rows
            .map((row) => {
              const key = JSON.stringify(row);
              return originals.get(key)?.shift() ?? key;
            })
            .join(',') +
          ']';
        storage.setItem(HISTORY_KEY, encoded);
        return;
      }
    } catch {
      /* loadForWrite already refuses malformed documents; do not repair them here. */
    }
  }
  storage.setItem(HISTORY_KEY, JSON.stringify(rows));
}

export function bindingsOf(lane: LaneBinding): Bindings {
  return { token: lane.token, escrow: lane.escrow, wrapper: lane.wrapper, minter: lane.minter };
}
export const sameBindings = (a: Bindings, lane: LaneBinding): boolean =>
  a.token === lane.token && a.escrow === lane.escrow && a.wrapper === lane.wrapper && a.minter === lane.minter;

export interface IntentInput {
  direction: RhDirection;
  account: string;
  recipient: string;
  grossRaw: string;
  feeRaw: string;
  maxFeeRaw: string | null;
  step: Step;
  lane: LaneBinding;
  nowMs: number;
  randomHex: string; // 8 lowercase hex chars
}

// Persist an intent BEFORE the wallet prompt.
export function createIntent(storage: HistoryStorage, input: IntentInput): RhRecord {
  chainPair(input.direction);
  const record = validateRecord({
    schemaVersion: input.lane.binding ? 2 : 1,
    ...(input.lane.binding ? { assetBinding: input.lane.binding, assetKind: input.lane.kind ?? 'ERC20' } : {}),
    id: `rh-${input.nowMs}-${input.randomHex}`,
    direction: input.direction,
    account: input.account.toLowerCase(),
    recipient: input.recipient.toLowerCase(),
    grossRaw: input.grossRaw,
    feeRaw: input.feeRaw,
    maxFeeRaw: input.maxFeeRaw,
    bindings: bindingsOf(input.lane),
    step: input.step,
    stage: 'WALLET_PROMPT',
    approveTxHash: null,
    sourceTxHash: null,
    sourceBlock: null,
    txNonce: null,
    replacedTxHash: null,
    operationId: null,
    destinationTxHash: null,
    holdCategory: null,
    failure: null,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
  });
  const { rows, records, index } = loadForWrite(storage);
  if (index.has(record.id)) throw new Error('RH_HISTORY_DUPLICATE');
  let next = rows.concat(record);
  if (next.length > MAX_RECORDS) {
    // Only finished valid records may make room; open or unreadable rows are never dropped.
    const removable = records.find((r) => r.stage === 'DELIVERED' || r.stage === 'DISMISSED');
    if (!removable) throw new Error('RH_HISTORY_FULL');
    const position = index.get(removable.id);
    next = next.filter((_, i) => i !== position);
  }
  write(storage, next);
  return record;
}

export type RecordPatch = Partial<
  Pick<
    RhRecord,
    | 'stage'
    | 'step'
    | 'approveTxHash'
    | 'sourceTxHash'
    | 'sourceBlock'
    | 'txNonce'
    | 'replacedTxHash'
    | 'operationId'
    | 'destinationTxHash'
    | 'holdCategory'
    | 'failure'
    | 'feeRaw'
    | 'maxFeeRaw'
  >
>;

const stepHashKey = (record: RhRecord): 'approveTxHash' | 'sourceTxHash' =>
  record.step === 'APPROVE' ? 'approveTxHash' : 'sourceTxHash';

// Whether a pending record may be closed by the user: no receipt was ever seen and it has
// been pending for at least RH_STALE_PENDING_MS. Nothing is re-sent either way.
export function isStalePending(record: RhRecord, nowMs: number): boolean {
  return (
    record.stage === 'SOURCE_PENDING' &&
    (record.step === 'APPROVE' || record.sourceBlock === null) &&
    nowMs - record.updatedAtMs >= RH_STALE_PENDING_MS
  );
}

export function applyPatch(current: RhRecord, patch: RecordPatch, nowMs: number): RhRecord {
  const stage = patch.stage ?? current.stage;
  if (stage !== current.stage && !TRANSITIONS[current.stage].includes(stage)) throw new Error('RH_HISTORY_TRANSITION');
  const hashKey = stepHashKey(current);
  // Replaced or dropped: the step's hash moves to replacedTxHash and the record becomes UNCERTAIN.
  const replacement =
    current.stage === 'SOURCE_PENDING' &&
    stage === 'UNCERTAIN' &&
    patch.failure === 'REPLACED_OR_DROPPED' &&
    current[hashKey] !== null &&
    patch.replacedTxHash === current[hashKey] &&
    patch[hashKey] === null;
  if (current.stage === 'SOURCE_PENDING' && stage === 'UNCERTAIN' && !replacement)
    throw new Error('RH_HISTORY_TRANSITION');
  if (current.stage === 'SOURCE_PENDING' && stage === 'DISMISSED' && !isStalePending(current, nowMs)) {
    throw new Error('RH_HISTORY_TRANSITION');
  }
  if (
    current.stage === 'UNCERTAIN' &&
    stage === 'FAILED' &&
    !(patch.failure === 'USER_REJECTED' && current.failure === 'PROMPT_INTERRUPTED' && current[hashKey] === null)
  ) {
    throw new Error('RH_HISTORY_TRANSITION');
  }
  // Write-once identifiers: a hash or operation id never changes once recorded (except the
  // replacement move above).
  for (const key of ['approveTxHash', 'sourceTxHash', 'operationId', 'replacedTxHash'] as const) {
    if (replacement && (key === hashKey || key === 'replacedTxHash')) continue;
    if (patch[key] !== undefined && current[key] !== null && patch[key] !== current[key])
      throw new Error('RH_HISTORY_IDENTITY');
  }
  if (
    patch.step !== undefined &&
    patch.step !== current.step &&
    !(current.stage === 'APPROVED' && stage === 'WALLET_PROMPT' && patch.step === 'BRIDGE')
  ) {
    throw new Error('RH_HISTORY_TRANSITION');
  }
  if (
    (patch.feeRaw !== undefined || patch.maxFeeRaw !== undefined) &&
    !(stage === 'WALLET_PROMPT' && current.stage !== 'WALLET_PROMPT')
  ) {
    throw new Error('RH_HISTORY_TRANSITION');
  }
  return validateRecord({ ...current, ...patch, stage, updatedAtMs: Math.max(nowMs, current.updatedAtMs) });
}

export function updateRecord(storage: HistoryStorage, id: string, patch: RecordPatch, nowMs: number): RhRecord {
  const { rows, records, index } = loadForWrite(storage);
  const position = index.get(id);
  const current = records.find((r) => r.id === id);
  if (position === undefined || !current) throw new Error('RH_HISTORY_MISSING');
  const next = applyPatch(current, patch, nowMs);
  const copy = rows.slice();
  copy[position] = next;
  write(storage, copy);
  return next;
}

// After a reload no prompt can still be tracked: an open prompt becomes UNCERTAIN
// (the wallet may still broadcast it). Returns the number of records changed.
export function markInterruptedPrompts(
  storage: HistoryStorage,
  nowMs: number,
  activeIds: readonly string[] = []
): number {
  const loaded = load(storage);
  if (!loaded) return 0;
  let changed = 0;
  const copy = loaded.rows.slice();
  for (const record of loaded.records) {
    if (record.stage !== 'WALLET_PROMPT' || activeIds.includes(record.id)) continue;
    copy[loaded.index.get(record.id) as number] = applyPatch(
      record,
      { stage: 'UNCERTAIN', failure: 'PROMPT_INTERRUPTED' },
      nowMs
    );
    changed++;
  }
  if (changed) write(storage, copy);
  return changed;
}
