import { LaneBinding, RH_LANE } from '../../../config/rhBridge';
import {
  applyPatch,
  isStalePending,
  createIntent,
  HISTORY_KEY,
  HistoryStorage,
  markInterruptedPrompts,
  MAX_RECORDS,
  readHistory,
  updateRecord,
  validateRecord,
} from '../history';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const HASH_A = '0x' + 'a1'.repeat(32);
const HASH_B = '0x' + 'b2'.repeat(32);

// A storage that records every key touched, pre-seeded with other stores' data.
function storage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  const reads: string[] = [];
  const writes: string[] = [];
  const store: HistoryStorage & { removeItem: jest.Mock; clear: jest.Mock } = {
    getItem: (key) => {
      reads.push(key);
      return key in data ? data[key] : null;
    },
    setItem: (key, value) => {
      writes.push(key);
      data[key] = value;
    },
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  return { store, data, reads, writes };
}
const intent = (s: HistoryStorage, over: Partial<Parameters<typeof createIntent>[1]> = {}) =>
  createIntent(s, {
    direction: 'RH_TO_ONYX',
    account: ACCOUNT,
    recipient: ACCOUNT,
    grossRaw: '10000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane: RH_LANE,
    nowMs: 1000,
    randomHex: 'deadbeef',
    ...over,
  });

test('the only key is the RH lane key', () => {
  expect(HISTORY_KEY).toBe('bridge:rh:testnet:46630:8901:operations:v1');
});

test('other stores are never read, modified or cleared (wrong-lane isolation)', () => {
  const seed = {
    'bridge:operations:v2': JSON.stringify({ operations: { x: { status: 'COMPLETED' } }, operationIds: ['x'] }),
    ['migration:pending:v1:' + ACCOUNT]: '{"keep":true}',
    redux_localstorage_simple_user: '{"userDarkMode":true}',
  };
  const { store, data, reads, writes } = storage(seed);
  const r = intent(store);
  updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH_A }, 2000);
  markInterruptedPrompts(store, 3000);
  readHistory(store);
  expect(new Set(reads)).toEqual(new Set([HISTORY_KEY]));
  expect(new Set(writes)).toEqual(new Set([HISTORY_KEY]));
  expect(store.removeItem).not.toHaveBeenCalled();
  expect(store.clear).not.toHaveBeenCalled();
  for (const [key, value] of Object.entries(seed)) expect(data[key]).toBe(value);
});

test('legacy bridge operations stored under the RH key are ignored, never adopted, and preserved', () => {
  const legacy = { id: 'x', status: 'COMPLETED', direction: 'SEPOLIA_TO_GOLIATH' };
  const { store, data } = storage({ [HISTORY_KEY]: JSON.stringify([legacy]) });
  expect(readHistory(store)).toEqual({ status: 'READY', records: [], invalidRows: 1 });
  const r = intent(store);
  const rows = JSON.parse(data[HISTORY_KEY]);
  expect(rows[0]).toEqual(legacy); // the foreign row is kept byte-for-byte
  expect(readHistory(store)).toMatchObject({
    status: 'READY',
    records: [expect.objectContaining({ id: r.id })],
    invalidRows: 1,
  });
});

test('a stored value that is not a JSON array holds: nothing is written over it', () => {
  for (const raw of ['{"operations":{}}', 'not json', JSON.stringify('x')]) {
    const { store, data } = storage({ [HISTORY_KEY]: raw });
    expect(readHistory(store)).toEqual({ status: 'INVALID', records: [], invalidRows: 0 });
    expect(() => intent(store)).toThrow('RH_HISTORY_HOLD');
    expect(markInterruptedPrompts(store, 9)).toBe(0);
    expect(data[HISTORY_KEY]).toBe(raw);
  }
});

test('the intent exists before any hash; the hash is attached once and is write-once', () => {
  const { store } = storage();
  const r = intent(store);
  expect(readHistory(store).records[0]).toMatchObject({
    id: 'rh-1000-deadbeef',
    stage: 'WALLET_PROMPT',
    sourceTxHash: null,
  });
  const sent = updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH_A }, 2000);
  expect(sent).toMatchObject({ stage: 'SOURCE_PENDING', sourceTxHash: HASH_A, updatedAtMs: 2000 });
  expect(() => updateRecord(store, r.id, { sourceTxHash: HASH_B }, 3000)).toThrow('RH_HISTORY_IDENTITY');
});

test('allowed and refused stage transitions', () => {
  const { store } = storage();
  const r = intent(store, { step: 'APPROVE' });
  expect(() => updateRecord(store, r.id, { stage: 'DELIVERED' }, 2)).toThrow();
  expect(() => updateRecord(store, r.id, { stage: 'APPROVED' }, 2)).toThrow('RH_HISTORY_TRANSITION');
  updateRecord(store, r.id, { stage: 'SOURCE_PENDING', approveTxHash: HASH_A }, 2);
  updateRecord(store, r.id, { stage: 'APPROVED' }, 3);
  // Only the deliberate bridge step may leave APPROVED, with the fresh fee.
  const prompt = updateRecord(store, r.id, { stage: 'WALLET_PROMPT', step: 'BRIDGE' }, 4);
  expect(prompt).toMatchObject({ step: 'BRIDGE', approveTxHash: HASH_A });
  updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH_B }, 5);
  updateRecord(
    store,
    r.id,
    {
      stage: 'RELAY_PENDING',
      operationId: 'RH_TO_ONYX:0x' + 'c3'.repeat(32),
      destinationTxHash: '0x' + 'd4'.repeat(32),
    },
    6
  );
  const done = updateRecord(store, r.id, { stage: 'DELIVERED' }, 7);
  expect(() => applyPatch(done, { stage: 'SOURCE_FINAL' }, 8)).toThrow('RH_HISTORY_TRANSITION');
  expect(() => applyPatch(done, { stage: 'DISMISSED' }, 8)).toThrow('RH_HISTORY_TRANSITION');
});

test('a fee cannot be changed after the prompt; deposits carry no fee', () => {
  const { store } = storage();
  const exit = intent(store, {
    direction: 'ONYX_TO_RH',
    feeRaw: '2800000000000000',
    maxFeeRaw: '2800000000000000',
    grossRaw: '12000000000000000',
  });
  expect(() => updateRecord(store, exit.id, { maxFeeRaw: '9000000000000000' }, 2)).toThrow('RH_HISTORY_TRANSITION');
  expect(() => intent(store, { feeRaw: '1', randomHex: '00000001' })).toThrow('RH_HISTORY_INVALID');
});

test('reload recovery: an open prompt becomes UNCERTAIN, never re-sent', () => {
  const { store } = storage();
  const r = intent(store);
  expect(markInterruptedPrompts(store, 5000)).toBe(1);
  const after = readHistory(store).records[0];
  expect(after).toMatchObject({ id: r.id, stage: 'UNCERTAIN', failure: 'PROMPT_INTERRUPTED', sourceTxHash: null });
  // A recovered hash may later be attached; nothing else can restart the prompt.
  expect(() => updateRecord(store, r.id, { stage: 'WALLET_PROMPT' }, 6000)).toThrow('RH_HISTORY_TRANSITION');
  expect(updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH_A, failure: null }, 7000).stage).toBe(
    'SOURCE_PENDING'
  );
  expect(markInterruptedPrompts(store, 8000)).toBe(0);
});

test('records bound to another deployment stay readable but distinct', () => {
  const { store } = storage();
  const other: LaneBinding = { ...RH_LANE, escrow: '0x' + '1'.repeat(40) };
  const r = intent(store, { lane: other });
  expect(readHistory(store).records[0].bindings.escrow).toBe('0x' + '1'.repeat(40));
  expect(r.bindings.escrow).not.toBe(RH_LANE.escrow);
});

test('a full history drops only finished records, never open ones', () => {
  const { store } = storage();
  for (let i = 0; i < MAX_RECORDS; i++) intent(store, { nowMs: 1000 + i, randomHex: i.toString(16).padStart(8, '0') });
  expect(() => intent(store, { nowMs: 5000, randomHex: 'ffffffff' })).toThrow('RH_HISTORY_FULL');
  const first = readHistory(store).records[0];
  updateRecord(store, first.id, { stage: 'FAILED', failure: 'USER_REJECTED' }, 6000);
  updateRecord(store, first.id, { stage: 'DISMISSED' }, 6001);
  intent(store, { nowMs: 7000, randomHex: 'fffffffe' });
  const records = readHistory(store).records;
  expect(records).toHaveLength(MAX_RECORDS);
  expect(records.some((x) => x.id === first.id)).toBe(false);
});

test.each([
  ['recipient shape', (r: any) => (r.recipient = '0x' + '0'.repeat(24) + '1'.repeat(16) + 'X')],
  ['fee equal to gross', (r: any) => Object.assign(r, { direction: 'ONYX_TO_RH', feeRaw: r.grossRaw })],
  ['fee above gross', (r: any) => Object.assign(r, { direction: 'ONYX_TO_RH', feeRaw: '1' + r.grossRaw })],
  ['maxFee below fee', (r: any) => Object.assign(r, { direction: 'ONYX_TO_RH', feeRaw: '10', maxFeeRaw: '9' })],
  ['maxFee at gross', (r: any) => Object.assign(r, { direction: 'ONYX_TO_RH', maxFeeRaw: r.grossRaw })],
  ['deposit with a maxFee', (r: any) => (r.maxFeeRaw = '1')],
  ['negative nonce', (r: any) => (r.txNonce = -1)],
  ['created timestamp outside Date range', (r: any) => (r.createdAtMs = Number.MAX_SAFE_INTEGER)],
  ['updated timestamp outside Date range', (r: any) => (r.updatedAtMs = Number.MAX_SAFE_INTEGER)],
  [
    'both timestamps outside Date range',
    (r: any) => Object.assign(r, { createdAtMs: Number.MAX_SAFE_INTEGER, updatedAtMs: Number.MAX_SAFE_INTEGER }),
  ],
  ['bindings array', (r: any) => (r.bindings = [])],
  ['extra key', (r: any) => (r.extra = 1)],
  ['duplicate id', (r: any, rows: any[]) => rows.push({ ...rows[1] })],
])('a tampered row (%s) is ignored while valid rows keep working and the row is kept', (name, tamper) => {
  const { store, data } = storage();
  intent(store, { randomHex: '00000001' });
  intent(store, { randomHex: '00000002', nowMs: 2000 });
  const rows = JSON.parse(data[HISTORY_KEY]);
  tamper(rows[0], rows);
  data[HISTORY_KEY] = JSON.stringify(rows);
  const index = name === 'duplicate id' ? 2 : 0;
  const tampered = JSON.stringify(rows[index]);
  const view = readHistory(store);
  expect(view.status).toBe('READY');
  expect(view.invalidRows).toBeGreaterThanOrEqual(1);
  expect(view.records.map((x) => x.id)).toContain('rh-2000-00000002');
  expect(markInterruptedPrompts(store, 9000)).toBe(view.records.length);
  expect(JSON.stringify(JSON.parse(data[HISTORY_KEY])[index])).toBe(tampered);
});

test('timestamps accept the Date range boundary; nonce and block checks keep their safe-integer range', () => {
  const { store } = storage();
  const r = intent(store);
  expect(
    validateRecord({
      ...r,
      createdAtMs: 8.64e15,
      updatedAtMs: 8.64e15,
      sourceBlock: Number.MAX_SAFE_INTEGER,
      txNonce: Number.MAX_SAFE_INTEGER,
    })
  ).toMatchObject({ createdAtMs: 8.64e15, updatedAtMs: 8.64e15 });
  expect(() => validateRecord({ ...r, createdAtMs: 8.64e15 + 1, updatedAtMs: 8.64e15 + 1 })).toThrow(
    'RH_HISTORY_INVALID'
  );
});

describe('fix loop transitions', () => {
  const HASH = '0x' + 'a1'.repeat(32);
  test('replacement move: only SOURCE_PENDING -> UNCERTAIN(REPLACED_OR_DROPPED) may move the hash to replacedTxHash', () => {
    const { store } = storage();
    const r = intent(store);
    const pending = updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH, txNonce: 4 }, 2);
    expect(() => applyPatch(pending, { stage: 'UNCERTAIN', failure: 'WALLET_ERROR' }, 3)).toThrow(
      'RH_HISTORY_TRANSITION'
    );
    expect(() => applyPatch(pending, { sourceTxHash: null }, 3)).toThrow('RH_HISTORY_IDENTITY');
    expect(() =>
      applyPatch(
        pending,
        {
          stage: 'UNCERTAIN',
          failure: 'REPLACED_OR_DROPPED',
          replacedTxHash: '0x' + 'b2'.repeat(32),
          sourceTxHash: null,
        },
        3
      )
    ).toThrow('RH_HISTORY_TRANSITION');
    const moved = applyPatch(
      pending,
      { stage: 'UNCERTAIN', failure: 'REPLACED_OR_DROPPED', replacedTxHash: HASH, sourceTxHash: null },
      3
    );
    expect(moved).toMatchObject({ stage: 'UNCERTAIN', sourceTxHash: null, replacedTxHash: HASH });
    // The replacement hash can then be attached; replacedTxHash is write-once.
    expect(applyPatch(moved, { stage: 'SOURCE_PENDING', sourceTxHash: '0x' + 'c3'.repeat(32) }, 4).sourceTxHash).toBe(
      '0x' + 'c3'.repeat(32)
    );
    expect(() => applyPatch(moved, { replacedTxHash: '0x' + 'd4'.repeat(32) }, 4)).toThrow('RH_HISTORY_IDENTITY');
  });

  test('UNCERTAIN -> FAILED only for a user rejection of an interrupted prompt without a hash', () => {
    const { store } = storage();
    const r = intent(store);
    markInterruptedPrompts(store, 5);
    const interrupted = readHistory(store).records[0];
    expect(applyPatch(interrupted, { stage: 'FAILED', failure: 'USER_REJECTED' }, 6).stage).toBe('FAILED');
    expect(() => applyPatch(interrupted, { stage: 'FAILED', failure: 'WALLET_REFUSED' }, 6)).toThrow(
      'RH_HISTORY_TRANSITION'
    );
    const walletError = applyPatch({ ...interrupted, failure: 'WALLET_ERROR' }, {}, 6);
    expect(() => applyPatch(walletError, { stage: 'FAILED', failure: 'USER_REJECTED' }, 6)).toThrow(
      'RH_HISTORY_TRANSITION'
    );
    expect(r.id).toBe(interrupted.id);
  });

  test('SOURCE_PENDING -> DISMISSED only without receipt and after 30 minutes', () => {
    const { store } = storage();
    const r = intent(store, { nowMs: 0 });
    const pending = updateRecord(store, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: HASH }, 0);
    expect(isStalePending(pending, 30 * 60 * 1000 - 1)).toBe(false);
    expect(() => applyPatch(pending, { stage: 'DISMISSED' }, 30 * 60 * 1000 - 1)).toThrow('RH_HISTORY_TRANSITION');
    expect(applyPatch(pending, { stage: 'DISMISSED' }, 30 * 60 * 1000).stage).toBe('DISMISSED');
    const mined = applyPatch(pending, { sourceBlock: 7 }, 1);
    expect(isStalePending(mined, 10 * 60 * 60 * 1000)).toBe(false);
    expect(() => applyPatch(mined, { stage: 'DISMISSED' }, 10 * 60 * 60 * 1000)).toThrow('RH_HISTORY_TRANSITION');
  });
});
