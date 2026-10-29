import { RH_LANE } from '../../../config/rhBridge';
import { RhRecord } from '../../../state/rhBridge/history';
import { alignToManifest, loadFixture } from '../__fixtures__';
import { fakeApi, fakeChains } from '../__fixtures__/fakes';
import { createChainReader, readAllowedHolder } from '../chainReads';
import { parseOperation } from '../schema';
import { operationMatches, stageFromOperation, trackRecord } from '../tracker';

const ACCOUNT = '0x5555555555555555555555555555555555555555';
const RECIPIENT = '0x6666666666666666666666666666666666666666';
const SOURCE = '0x4e7faab3c2bd0f1954c6aaef63333db0dd1894b244a038bd295c634085dc60ce';

const op = (name = 'getStatus.200.executing-deposit') =>
  parseOperation(alignToManifest(loadFixture(name).response.body));
const record = (over: Partial<RhRecord> = {}): RhRecord => ({
  schemaVersion: 1,
  id: 'rh-1-00000000',
  direction: 'RH_TO_ONYX',
  account: ACCOUNT,
  recipient: RECIPIENT,
  grossRaw: '1000000000000000001',
  feeRaw: '0',
  maxFeeRaw: null,
  bindings: { token: RH_LANE.token, escrow: RH_LANE.escrow, wrapper: RH_LANE.wrapper, minter: RH_LANE.minter },
  step: 'BRIDGE',
  stage: 'SOURCE_PENDING',
  approveTxHash: null,
  sourceTxHash: SOURCE,
  sourceBlock: 1,
  txNonce: null,
  replacedTxHash: null,
  operationId: null,
  destinationTxHash: null,
  holdCategory: null,
  failure: null,
  createdAtMs: 0,
  updatedAtMs: 0,
  ...over,
});

test('API status maps to the distinct UI stages', () => {
  expect(stageFromOperation(op('getStatus.200.awaiting-deposit')).stage).toBe('SOURCE_FINAL');
  expect(stageFromOperation(op('getStatus.200.executing-deposit')).stage).toBe('RELAY_PENDING');
  expect(stageFromOperation(op('getStatus.200.held-exit')).stage).toBe('HELD');
  expect(stageFromOperation(op('getStatus.200.completed-exit')).stage).toBe('DELIVERED');
});

test('an operation only matches its own record', () => {
  const o = op();
  expect(operationMatches(record(), o)).toBe(true);
  expect(operationMatches(record({ account: RECIPIENT }), o)).toBe(false);
  expect(operationMatches(record({ recipient: ACCOUNT }), o)).toBe(false);
  expect(operationMatches(record({ grossRaw: '1000000000000000000' }), o)).toBe(false);
  expect(operationMatches(record({ sourceTxHash: '0x' + '1'.repeat(64) }), o)).toBe(false);
  expect(operationMatches(record({ direction: 'ONYX_TO_RH' }), o)).toBe(false);
  expect(operationMatches(record({ operationId: 'RH_TO_ONYX:0x' + '2'.repeat(64) }), o)).toBe(false);
});

test('uncertain recovery never claims a hash another record already owns', async () => {
  const item = op();
  const api = fakeApi({
    [`/api/v1/rh/history?address=${ACCOUNT}&limit=50`]: {
      status: 200,
      body: { items: [loadFixture('getStatus.200.executing-deposit').response.body], nextCursor: null },
    },
  });
  const chains = fakeChains();
  const uncertain = record({
    stage: 'UNCERTAIN',
    sourceTxHash: null,
    sourceBlock: null,
    createdAtMs: item.createdAtMs,
  });
  const lane = { ...RH_LANE };
  await expect(
    trackRecord(uncertain, { api: api.client, chains: chains.reader, lane, nowMs: 0, claimedHashes: [SOURCE] })
  ).resolves.toEqual([]);
  const patches = await trackRecord(uncertain, {
    api: api.client,
    chains: chains.reader,
    lane,
    nowMs: 0,
    claimedHashes: [],
  });
  expect(patches[0]).toEqual({ stage: 'SOURCE_PENDING', sourceTxHash: SOURCE, failure: null });
  // Older than the recovery window relative to the intent: not adopted.
  const late = record({
    stage: 'UNCERTAIN',
    sourceTxHash: null,
    sourceBlock: null,
    createdAtMs: item.createdAtMs + 11 * 60 * 1000,
  });
  await expect(
    trackRecord(late, { api: api.client, chains: chains.reader, lane, nowMs: 0, claimedHashes: [] })
  ).resolves.toEqual([]);
});

describe('chain reader', () => {
  const rpc = (result: unknown, error?: unknown) =>
    jest.fn(
      async (_url: string, init: RequestInit) =>
        ({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: JSON.parse(String(init.body)).id,
            ...(error ? { error } : { result }),
          }),
        } as unknown as Response)
    );

  test('posts JSON-RPC to the keyless public URL of the requested chain only', async () => {
    const fetchImpl = rpc('0x' + '0'.repeat(63) + '1');
    const reader = createChainReader(fetchImpl as any);
    await expect(readAllowedHolder(reader, 46630, RH_LANE.escrow, ACCOUNT)).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://rpc.testnet.chain.robinhood.com');
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'eth_call',
      params: [{ to: RH_LANE.escrow }, 'latest'],
    });
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' });
    await createChainReader(fetchImpl as any).getBalance(8901, ACCOUNT);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://rpc.testnet.onyx.org');
  });

  test('receipts, quantities and RPC errors', async () => {
    await expect(
      createChainReader(rpc({ status: '0x1', blockNumber: '0x10' }) as any).getReceipt(8901, SOURCE)
    ).resolves.toEqual({ status: 1, blockNumber: 16 });
    await expect(
      createChainReader(rpc({ status: '0x0', blockNumber: '0x10' }) as any).getReceipt(8901, SOURCE)
    ).resolves.toEqual({ status: 0, blockNumber: 16 });
    await expect(createChainReader(rpc(null) as any).getReceipt(8901, SOURCE)).resolves.toBeNull();
    await expect(createChainReader(rpc('12') as any).getBalance(8901, ACCOUNT)).rejects.toThrow('RH_RPC_INVALID');
    await expect(
      createChainReader(rpc(undefined, { code: -32000, message: 'execution reverted' }) as any).call(
        46630,
        RH_LANE.escrow,
        '0x'
      )
    ).rejects.toThrow('RH_RPC_ERROR');
    await expect(createChainReader(rpc('0x0') as any).call(327 as any, RH_LANE.escrow, '0x')).rejects.toThrow(
      'RH_RPC_UNKNOWN_CHAIN'
    );
  });
});
