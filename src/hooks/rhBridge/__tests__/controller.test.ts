import { RH_LANE } from '../../../config/rhBridge';
import {
  createIntent,
  HISTORY_KEY,
  HistoryStorage,
  markInterruptedPrompts,
  readHistory,
} from '../../../state/rhBridge/history';
import {
  alignToManifest,
  atTime,
  liveRoutes,
  loadFixture,
  manifestFeeQuote,
} from '../../../services/rhBridge/__fixtures__';
import { fakeApi, fakeWallet, fundedChains, liveApi, Route } from '../../../services/rhBridge/__fixtures__/fakes';
import { LANE_ABI } from '../../../services/rhBridge/lane';
import { RhLaneController } from '../controller';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const OTHER_HOLDER = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
const STRANGER = '0x1234567890123456789012345678901234567890';
const GROSS = '100000000000000000'; // 0.1 TSLA
const EXIT_FEE = '2800000000000000'; // max(0.0028, 0.1 * 25 bps)
const T0 = Date.parse('2026-10-23T12:00:00.000Z');

function memoryStorage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  const store: HistoryStorage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
  return { store, data };
}

function operation(
  status: 'AWAITING_EXECUTION' | 'EXECUTING' | 'HELD' | 'COMPLETED',
  direction: 'RH_TO_ONYX' | 'ONYX_TO_RH',
  sourceHash: string,
  over: Record<string, unknown> = {}
) {
  const base = atTime(alignToManifest(loadFixture('getStatus.200.executing-deposit').response.body), T0) as any;
  const deposit = direction === 'RH_TO_ONYX';
  return {
    ...base,
    operationId: `${direction}:0x${(deposit ? 'e1' : 'e2').repeat(32)}`,
    direction,
    status,
    holdCategory: status === 'HELD' ? 'UNDER_REVIEW' : null,
    sender: ACCOUNT,
    recipient: ACCOUNT,
    grossAmount: GROSS,
    fee: deposit ? '0' : EXIT_FEE,
    netAmount: deposit ? GROSS : (BigInt(GROSS) - BigInt(EXIT_FEE)).toString(),
    source: { ...base.source, chainId: deposit ? 46630 : 8901, txHash: sourceHash, final: true },
    destination: {
      ...base.destination,
      chainId: deposit ? 8901 : 46630,
      txHash: status === 'AWAITING_EXECUTION' || status === 'HELD' ? null : '0x' + 'f0'.repeat(32),
      final: status === 'COMPLETED',
    },
    completedAt: status === 'COMPLETED' ? new Date(T0).toISOString() : null,
    ...over,
  };
}

function setup(
  opts: {
    chainId?: number;
    account?: string;
    routes?: Record<string, Route>;
    seed?: Record<string, string>;
    api?: ReturnType<typeof fakeApi>;
  } = {}
) {
  const clock = { now: T0 };
  const { store, data } = memoryStorage(opts.seed);
  const api = opts.api ?? liveApi(T0, opts.routes);
  const chains = fundedChains(opts.account ?? ACCOUNT);
  const wallet = fakeWallet({ chainId: opts.chainId ?? 46630, accounts: [opts.account ?? ACCOUNT] }, () =>
    readHistory(store).records.map((r) => ({ ...r }))
  );
  let n = 0;
  const controller = new RhLaneController({
    api: api.client,
    chains: chains.reader,
    storage: store,
    lane: RH_LANE,
    now: () => clock.now,
    randomHex: () => (++n).toString(16).padStart(8, '0'),
  });
  const connect = (chainId = wallet.script.chainId, account = opts.account ?? ACCOUNT) =>
    controller.setWallet({ account, chainId, isInjected: true, hasProvider: true }, wallet.provider);
  connect();
  return { controller, api, chains, wallet, store, data, clock, connect };
}
const records = (store: HistoryStorage) => readHistory(store).records;
const sends = (wallet: ReturnType<typeof fakeWallet>) =>
  wallet.requests.filter((r) => r.method === 'eth_sendTransaction');

async function ready(t: ReturnType<typeof setup>, amount = '0.1', recipient = '') {
  await t.controller.refreshLane();
  t.controller.setAmount(amount);
  t.controller.setRecipient(recipient);
  await t.controller.refreshChain();
  if (t.controller.state.direction === 'ONYX_TO_RH') await t.controller.refreshQuote();
}

describe('deposit RH -> Onyx', () => {
  test('exact approve to the escrow, deposit, then source/relay/destination tracking; intents precede every prompt', async () => {
    const t = setup();
    await ready(t);
    expect(t.controller.view()).toMatchObject({ canApprove: true, canBridge: false, needsApproval: true });

    await t.controller.approve();
    expect(sends(t.wallet)).toHaveLength(1);
    const approveTx = sends(t.wallet)[0].params![0] as Record<string, string>;
    expect(approveTx).toMatchObject({ from: ACCOUNT, to: RH_LANE.token, value: '0x0', chainId: '0xb626' });
    const decoded = LANE_ABI.decodeFunctionData('approve', approveTx.data);
    expect([decoded[0].toLowerCase(), decoded[1].toString()]).toEqual([RH_LANE.escrow, GROSS]);
    // The intent was stored before the wallet saw the request.
    expect(t.wallet.historyAtSend[0]).toEqual([
      expect.objectContaining({ stage: 'WALLET_PROMPT', step: 'APPROVE', approveTxHash: null }),
    ]);
    const approveHash = '0x' + '1'.padStart(64, '0');
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', step: 'APPROVE', approveTxHash: approveHash });

    // Still pending: no second approval can be requested.
    expect(t.controller.view().canApprove).toBe(false);
    t.chains.state.receipts[`46630:${approveHash}`] = { status: 1, blockNumber: 100 };
    await t.controller.trackOnce();
    expect(records(t.store)[0].stage).toBe('APPROVED');
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    expect(t.controller.view()).toMatchObject({ canBridge: true, needsApproval: false });

    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(2);
    const depositTx = sends(t.wallet)[1].params![0] as Record<string, string>;
    expect(depositTx).toMatchObject({ from: ACCOUNT, to: RH_LANE.escrow, chainId: '0xb626', value: '0x0' });
    const d = LANE_ABI.decodeFunctionData('deposit', depositTx.data);
    expect([d[0].toLowerCase(), d[1].toString(), d[2].toLowerCase()]).toEqual([RH_LANE.token, GROSS, ACCOUNT]);
    expect(t.wallet.historyAtSend[1]).toEqual([
      expect.objectContaining({ stage: 'WALLET_PROMPT', step: 'BRIDGE', sourceTxHash: null }),
    ]);
    const sourceHash = '0x' + '2'.padStart(64, '0');
    expect(records(t.store)[0]).toMatchObject({
      stage: 'SOURCE_PENDING',
      step: 'BRIDGE',
      sourceTxHash: sourceHash,
      approveTxHash: approveHash,
    });

    // Receipt not yet available, then mined; by-tx 404 until finality: stays pending, never resends.
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', sourceBlock: null });
    t.chains.state.receipts[`46630:${sourceHash}`] = { status: 1, blockNumber: 141020000 };
    t.api.routes[`/api/v1/rh/status/by-tx/${sourceHash}`] = loadFixture('getStatusByTx.404').response;
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', sourceBlock: 141020000 });

    t.api.routes[`/api/v1/rh/status/by-tx/${sourceHash}`] = {
      status: 200,
      body: { items: [operation('AWAITING_EXECUTION', 'RH_TO_ONYX', sourceHash)] },
    };
    await t.controller.trackOnce();
    const opId = 'RH_TO_ONYX:0x' + 'e1'.repeat(32);
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_FINAL', operationId: opId });

    const statusPath = '/api/v1/rh/status/' + encodeURIComponent(opId);
    t.api.routes[statusPath] = { status: 200, body: operation('EXECUTING', 'RH_TO_ONYX', sourceHash) };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'RELAY_PENDING', destinationTxHash: '0x' + 'f0'.repeat(32) });

    t.api.routes[statusPath] = { status: 200, body: operation('COMPLETED', 'RH_TO_ONYX', sourceHash) };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'DELIVERED', destinationTxHash: '0x' + 'f0'.repeat(32) });
    expect(t.api.requests).toContain(statusPath);
    expect(sends(t.wallet)).toHaveLength(2);
  });

  test('allowance already covering gross skips the approval', async () => {
    const t = setup();
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    expect(t.controller.view()).toMatchObject({ canApprove: false, canBridge: true, needsApproval: false });
  });

  test('a reverted source transaction is FAILED, not retried', async () => {
    const t = setup();
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    await t.controller.bridge();
    const hash = records(t.store)[0].sourceTxHash!;
    t.chains.state.receipts[`46630:${hash}`] = { status: 0, blockNumber: 1 };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'FAILED', failure: 'SOURCE_REVERTED' });
    await t.controller.trackOnce();
    expect(sends(t.wallet)).toHaveLength(1);
  });

  test('HELD operations are shown with their category', async () => {
    const t = setup();
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    await t.controller.bridge();
    const hash = records(t.store)[0].sourceTxHash!;
    t.chains.state.receipts[`46630:${hash}`] = { status: 1, blockNumber: 1 };
    t.api.routes[`/api/v1/rh/status/by-tx/${hash}`] = {
      status: 200,
      body: { items: [operation('HELD', 'RH_TO_ONYX', hash)] },
    };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'HELD', holdCategory: 'UNDER_REVIEW' });
  });

  test('a recipient that is not allowlisted blocks the deposit; so does a non-holder sender', async () => {
    const t = setup();
    await ready(t, '0.1', STRANGER);
    expect(t.controller.view()).toMatchObject({
      allowlistBlocker: 'RECIPIENT_NOT_ALLOWLISTED',
      canApprove: false,
      canBridge: false,
    });
    t.chains.state.holders[`46630:${RH_LANE.escrow}:${OTHER_HOLDER}`] = true;
    t.chains.state.holders[`8901:${RH_LANE.minter}:${OTHER_HOLDER}`] = true;
    t.controller.setRecipient(OTHER_HOLDER);
    await t.controller.refreshChain();
    expect(t.controller.view().allowlistBlocker).toBeUndefined();
    expect(t.controller.view().canApprove).toBe(true);

    const s = setup({ account: STRANGER });
    s.chains.state.holders = {};
    await ready(s);
    expect(s.controller.view()).toMatchObject({ allowlistBlocker: 'SENDER_NOT_ALLOWLISTED', canApprove: false });
    await s.controller.approve();
    expect(sends(s.wallet)).toHaveLength(0);
  });
});

describe('exit Onyx -> RH', () => {
  const quoteRoute = (fee?: string) => ({
    status: 200,
    body: manifestFeeQuote(
      GROSS,
      T0,
      fee ? { fee, suggestedMaxFee: fee, net: (BigInt(GROSS) - BigInt(fee)).toString() } : {}
    ),
  });

  test('approve wrapper GROSS to the minter, then burn with the fresh quote maxFee', async () => {
    const t = setup({ chainId: 8901, routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: quoteRoute() } });
    t.controller.setDirection('ONYX_TO_RH');
    await ready(t);
    expect(t.controller.state.quote.value).toMatchObject({ fee: EXIT_FEE, suggestedMaxFee: EXIT_FEE });
    expect(t.controller.view().quoteError).toBeUndefined();
    expect(t.controller.view().canApprove).toBe(true);

    await t.controller.approve();
    const approveTx = sends(t.wallet)[0].params![0] as Record<string, string>;
    expect(approveTx).toMatchObject({ to: RH_LANE.wrapper, chainId: '0x22c5' });
    const a = LANE_ABI.decodeFunctionData('approve', approveTx.data);
    expect([a[0].toLowerCase(), a[1].toString()]).toEqual([RH_LANE.minter, GROSS]);
    expect(a[0].toLowerCase()).not.toBe(RH_LANE.wrapper);

    t.chains.state.receipts[`8901:${records(t.store)[0].approveTxHash}`] = { status: 1, blockNumber: 1 };
    await t.controller.trackOnce();
    t.chains.state.allowances[`8901:${RH_LANE.wrapper}:${ACCOUNT}:${RH_LANE.minter}`] = GROSS;
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(2);
    const burnTx = sends(t.wallet)[1].params![0] as Record<string, string>;
    expect(burnTx).toMatchObject({ to: RH_LANE.minter, chainId: '0x22c5' });
    const b = LANE_ABI.decodeFunctionData('burn', burnTx.data);
    expect([b[0].toLowerCase(), b[1].toString(), b[2].toLowerCase(), b[3].toString()]).toEqual([
      RH_LANE.wrapper,
      GROSS,
      ACCOUNT,
      EXIT_FEE,
    ]);
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', feeRaw: EXIT_FEE, maxFeeRaw: EXIT_FEE });
  });

  test('a changed fee at click time stops without sending; the user must click again', async () => {
    const t = setup({ chainId: 8901, routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: quoteRoute() } });
    t.controller.setDirection('ONYX_TO_RH');
    t.chains.state.allowances[`8901:${RH_LANE.wrapper}:${ACCOUNT}:${RH_LANE.minter}`] = GROSS;
    await ready(t);
    expect(t.controller.view().canBridge).toBe(true);
    // Fee parameters changed on chain (minFee raised) between display and click.
    t.chains.state.registry = { ...t.chains.state.registry, minFee: '3000000000000000' };
    const limits = t.api.routes['/api/v1/rh/limits'].body as any;
    t.api.routes['/api/v1/rh/limits'] = {
      status: 200,
      body: { ...limits, fee: { ...limits.fee, minFee: '3000000000000000' } },
    };
    t.api.routes[`/api/v1/rh/fee-quote?gross=${GROSS}`] = {
      status: 200,
      body: manifestFeeQuote(GROSS, T0, {
        fee: '3000000000000000',
        suggestedMaxFee: '3000000000000000',
        net: '97000000000000000',
        minFee: '3000000000000000',
      }),
    };
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(records(t.store)).toHaveLength(0);
    expect(t.controller.state.notice).toBe('The fee changed. Review the new quote and click again. Nothing was sent.');
    expect(t.controller.state.quote.value).toMatchObject({ fee: '3000000000000000' });
    // The deliberate second click uses the new maxFee.
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(1);
    const b = LANE_ABI.decodeFunctionData('burn', (sends(t.wallet)[0].params![0] as Record<string, string>).data);
    expect(b[3].toString()).toBe('3000000000000000');
  });

  test('a fresh quote that fails validation stops without sending', async () => {
    const t = setup({ chainId: 8901, routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: quoteRoute() } });
    t.controller.setDirection('ONYX_TO_RH');
    t.chains.state.allowances[`8901:${RH_LANE.wrapper}:${ACCOUNT}:${RH_LANE.minter}`] = GROSS;
    await ready(t);
    t.api.routes[`/api/v1/rh/fee-quote?gross=${GROSS}`] = quoteRoute('2700000000000000'); // below minFee: off-formula
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(t.controller.state.notice).toBe('The fresh fee quote failed validation. Nothing was sent.');
  });

  test('an expired quote disables the burn until it is refreshed deliberately', async () => {
    const t = setup({ chainId: 8901, routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: quoteRoute() } });
    t.controller.setDirection('ONYX_TO_RH');
    t.chains.state.allowances[`8901:${RH_LANE.wrapper}:${ACCOUNT}:${RH_LANE.minter}`] = GROSS;
    await ready(t);
    t.clock.now = T0 + 61000;
    expect(t.controller.view()).toMatchObject({ canBridge: false, quoteError: 'Quote expired. Refresh the quote.' });
  });

  test('below minimum exit is rejected locally', async () => {
    const t = setup({ chainId: 8901 });
    t.controller.setDirection('ONYX_TO_RH');
    await ready(t, '0.011');
    expect(t.controller.view()).toMatchObject({
      amountError: 'Below the minimum exit amount.',
      canApprove: false,
      canBridge: false,
    });
  });
});

describe('gating, races and recovery', () => {
  test('API unreachable: no live action is possible', async () => {
    const t = setup({ api: fakeApi({}) });
    await ready(t);
    expect(t.controller.state.api.failure).toBe('UNREACHABLE');
    expect(t.controller.view()).toMatchObject({
      canApprove: false,
      canBridge: false,
      gate: { open: false, reasons: ['API_UNAVAILABLE'] },
    });
    await t.controller.approve();
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
  });

  test('an unaligned (synthetic 005) assets response keeps actions disabled', async () => {
    const t = setup({ routes: { '/api/v1/rh/assets': loadFixture('getAssets.200').response } });
    await ready(t);
    expect(t.controller.view().gate.reasons).toEqual(['BINDING_MISMATCH']);
    expect(t.controller.view().canApprove).toBe(false);
  });

  test('chain race: the wallet switches after the click; nothing is prompted and the intent fails safely', async () => {
    const t = setup();
    await ready(t);
    expect(t.controller.view().canApprove).toBe(true);
    t.wallet.script.chainId = 8901; // wallet changed, the page has not been told yet
    await t.controller.approve();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(records(t.store)[0]).toMatchObject({ stage: 'FAILED', failure: 'CONTEXT_CHANGED' });
  });

  test('account race: an account change during the pre-send checks cancels the stale action', async () => {
    const t = setup();
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    const original = t.chains.reader.call.bind(t.chains.reader);
    t.chains.reader.call = async (...args) => {
      t.connect(46630, OTHER_HOLDER); // accountsChanged arrives while the allowance is being re-read
      return original(...args);
    };
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(t.controller.state.notice).toMatch(/changed/);
  });

  test('non-injected connectors and wrong chains are blocked with a reason', async () => {
    const t = setup();
    await ready(t);
    t.controller.setWallet({ account: ACCOUNT, chainId: 46630, isInjected: false, hasProvider: false }, null);
    expect(t.controller.view()).toMatchObject({ walletBlocker: 'NOT_INJECTED', canApprove: false });
    t.connect(8901);
    await t.controller.refreshChain();
    expect(t.controller.view()).toMatchObject({ walletBlocker: 'WRONG_CHAIN', canApprove: false });
    await t.controller.switchToSource();
    expect(t.wallet.requests.filter((r) => r.method === 'wallet_switchEthereumChain')[0].params).toEqual([
      { chainId: '0xb626' },
    ]);
  });

  test('user rejection fails the intent; a later attempt needs a new deliberate click', async () => {
    const t = setup();
    t.wallet.script.onSend = () => {
      throw Object.assign(new Error('User denied'), { code: 4001 });
    };
    await ready(t);
    await t.controller.approve();
    expect(records(t.store)[0]).toMatchObject({ stage: 'FAILED', failure: 'USER_REJECTED' });
    expect(t.controller.view().canApprove).toBe(true); // not blocking; nothing was sent
    expect(sends(t.wallet)).toHaveLength(1);
  });

  test('ambiguous wallet error: UNCERTAIN, blocks new sends, never re-sent by tracking, dismissible', async () => {
    const t = setup();
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    t.wallet.script.onSend = () => {
      throw Object.assign(new Error('Internal JSON-RPC error'), { code: -32603 });
    };
    t.api.routes[`/api/v1/rh/history?address=${ACCOUNT}&limit=50`] = loadFixture('getHistory.200.empty').response;
    await ready(t);
    await t.controller.bridge();
    expect(records(t.store)[0]).toMatchObject({ stage: 'UNCERTAIN', failure: 'WALLET_ERROR' });
    expect(t.controller.view()).toMatchObject({
      canBridge: false,
      pendingRecord: expect.objectContaining({ stage: 'UNCERTAIN' }),
    });
    await t.controller.trackOnce();
    await t.controller.trackOnce();
    expect(sends(t.wallet)).toHaveLength(1);
    t.controller.dismiss(records(t.store)[0].id);
    expect(records(t.store)[0].stage).toBe('DISMISSED');
    expect(t.controller.view().canBridge).toBe(true);
  });

  test('reload with an open prompt: UNCERTAIN, then recovered from API history by intent, no send', async () => {
    const seed = memoryStorage();
    createIntent(seed.store, {
      direction: 'RH_TO_ONYX',
      account: ACCOUNT,
      recipient: ACCOUNT,
      grossRaw: GROSS,
      feeRaw: '0',
      maxFeeRaw: null,
      step: 'BRIDGE',
      lane: RH_LANE,
      nowMs: T0 - 1000,
      randomHex: 'abcdef01',
    });
    const recovered = '0x' + '9a'.repeat(32);
    const t = setup({
      seed: seed.data,
      routes: {
        [`/api/v1/rh/history?address=${ACCOUNT}&limit=50`]: {
          status: 200,
          body: { items: [operation('COMPLETED', 'RH_TO_ONYX', recovered)], nextCursor: null },
        },
      },
    });
    expect(records(t.store)[0]).toMatchObject({ stage: 'UNCERTAIN', failure: 'PROMPT_INTERRUPTED' });
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({
      stage: 'DELIVERED',
      sourceTxHash: recovered,
      failure: null,
      destinationTxHash: '0x' + 'f0'.repeat(32),
    });
    expect(sends(t.wallet)).toHaveLength(0);
  });

  test('reload with an interrupted approval: recovered from the on-chain allowance', async () => {
    const seed = memoryStorage();
    createIntent(seed.store, {
      direction: 'RH_TO_ONYX',
      account: ACCOUNT,
      recipient: ACCOUNT,
      grossRaw: GROSS,
      feeRaw: '0',
      maxFeeRaw: null,
      step: 'APPROVE',
      lane: RH_LANE,
      nowMs: T0 - 1000,
      randomHex: 'abcdef02',
    });
    const t = setup({ seed: seed.data });
    await t.controller.trackOnce();
    expect(records(t.store)[0].stage).toBe('UNCERTAIN');
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await t.controller.trackOnce();
    expect(records(t.store)[0].stage).toBe('APPROVED');
    expect(sends(t.wallet)).toHaveLength(0);
  });

  test('records of another lane deployment are neither tracked nor blocking', async () => {
    const seed = memoryStorage();
    createIntent(seed.store, {
      direction: 'RH_TO_ONYX',
      account: ACCOUNT,
      recipient: ACCOUNT,
      grossRaw: GROSS,
      feeRaw: '0',
      maxFeeRaw: null,
      step: 'BRIDGE',
      lane: { ...RH_LANE, escrow: '0x' + '1'.repeat(40) },
      nowMs: T0 - 1000,
      randomHex: 'abcdef03',
    });
    const t = setup({ seed: seed.data });
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    const before = t.api.requests.length;
    await t.controller.trackOnce();
    expect(t.api.requests.length).toBe(before);
    expect(t.controller.view()).toMatchObject({ pendingRecord: undefined, canBridge: true });
  });

  test('legacy bridge store and other keys are untouched by a full flow', async () => {
    const legacy = JSON.stringify({ operations: {}, operationIds: [] });
    const t = setup({ seed: { 'bridge:operations:v2': legacy, other: 'x' } });
    t.chains.state.allowances[`46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`] = GROSS;
    await ready(t);
    await t.controller.bridge();
    expect(t.data['bridge:operations:v2']).toBe(legacy);
    expect(t.data.other).toBe('x');
    expect(Object.keys(t.data).sort()).toEqual([HISTORY_KEY, 'bridge:operations:v2', 'other'].sort());
  });

  test('chain read failure keeps actions disabled', async () => {
    const t = setup();
    t.chains.state.failCalls = true;
    await ready(t);
    expect(t.controller.state.chain.failure).toBeDefined();
    expect(t.controller.view()).toMatchObject({ canApprove: false, canBridge: false });
  });

  test('decimals mismatch on chain keeps actions disabled', async () => {
    const t = setup();
    t.chains.state.decimals = 6;
    await ready(t);
    expect(t.controller.view()).toMatchObject({ balanceError: 'DECIMALS_MISMATCH', canApprove: false });
  });

  test('insufficient balance and missing gas block', async () => {
    const t = setup();
    await ready(t, '1.5');
    expect(t.controller.view().amountError).toBe('Above the per-transaction maximum.');
    t.chains.state.balances[`46630:${RH_LANE.token}:${ACCOUNT}`] = '1';
    await ready(t, '0.1');
    expect(t.controller.view().balanceError).toBe('INSUFFICIENT_BALANCE');
    t.chains.state.balances[`46630:${RH_LANE.token}:${ACCOUNT}`] = GROSS;
    t.chains.state.native[`46630:${ACCOUNT}`] = '0';
    await t.controller.refreshChain();
    expect(t.controller.view().balanceError).toBe('NO_GAS');
  });
});

// ------------------------------------------------------------------------------------------
// Fix loop: replacement/drop recovery (M1), on-chain fee guard (L1), second-tab rejection (L2),
// on-chain capacity (L3), partial allowance and the exit tracked to delivery.

const hashN = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const DEPOSIT_ALLOWANCE = `46630:${RH_LANE.token}:${ACCOUNT}:${RH_LANE.escrow}`;
const EXIT_ALLOWANCE = `8901:${RH_LANE.wrapper}:${ACCOUNT}:${RH_LANE.minter}`;
// Move the clock and keep the API answers fresh at the new time.
async function advance(t: ReturnType<typeof setup>, ms: number) {
  t.clock.now += ms;
  Object.assign(t.api.routes, liveRoutes(t.clock.now));
  await t.controller.refreshLane();
}

describe('M1: replaced or dropped transactions never lock the user out and are never resent', () => {
  test('approval replaced (speed-up): nonce consumed without receipt, allowance on chain -> APPROVED', async () => {
    const t = setup();
    await ready(t);
    await t.controller.approve();
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', approveTxHash: hashN(1), txNonce: 0 });
    t.chains.state.nonces[`46630:${ACCOUNT}`] = 1; // the replacement used nonce 0
    await t.controller.trackOnce();
    expect(records(t.store)[0].stage).toBe('SOURCE_PENDING'); // propagation grace
    await advance(t, 121000);
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS; // the replacement approval landed
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({
      stage: 'APPROVED',
      approveTxHash: null,
      replacedTxHash: hashN(1),
      failure: null,
    });
    expect(t.controller.view()).toMatchObject({ canBridge: true, pendingRecord: undefined });
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(2); // one approval prompt, one deposit prompt; nothing resent
  });

  test('approval dropped (cancelled): allowance not on chain -> UNCERTAIN, not blocking; the user may approve again deliberately', async () => {
    const t = setup();
    await ready(t);
    await t.controller.approve();
    expect(t.controller.view().canApprove).toBe(false); // pending approval blocks a second prompt
    await advance(t, 121000);
    t.chains.state.nonces[`46630:${ACCOUNT}`] = 1;
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({
      stage: 'UNCERTAIN',
      failure: 'REPLACED_OR_DROPPED',
      replacedTxHash: hashN(1),
    });
    await t.controller.trackOnce();
    expect(sends(t.wallet)).toHaveLength(1); // tracking never prompts
    await t.controller.refreshChain();
    expect(t.controller.view()).toMatchObject({ canApprove: true, pendingRecord: undefined });
    await t.controller.approve();
    expect(sends(t.wallet)).toHaveLength(2);
    expect(records(t.store).map((r) => r.stage)).toEqual(['UNCERTAIN', 'SOURCE_PENDING']);
    expect(t.controller.canDismiss(records(t.store)[0])).toBe(true);
  });

  test('deposit replaced: the replacement is found by history lookup and tracked; the original is kept as replaced', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    await ready(t);
    await t.controller.bridge();
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', sourceTxHash: hashN(1), txNonce: 0 });
    // The RPC knows the transaction: its exact nonce is recorded.
    t.chains.state.txs[`46630:${hashN(1)}`] = { nonce: 0, from: ACCOUNT };
    await advance(t, 121000);
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', txNonce: 0 });
    // Sped up: nonce 0 consumed by another hash; the API knows the replacement.
    delete t.chains.state.txs[`46630:${hashN(1)}`];
    t.chains.state.nonces[`46630:${ACCOUNT}`] = 1;
    const replacement = '0x' + 'ab'.repeat(32);
    t.api.routes[`/api/v1/rh/history?address=${ACCOUNT}&limit=50`] = {
      status: 200,
      body: {
        items: [operation('EXECUTING', 'RH_TO_ONYX', replacement, { createdAt: new Date(t.clock.now).toISOString() })],
        nextCursor: null,
      },
    };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({
      stage: 'RELAY_PENDING',
      sourceTxHash: replacement,
      replacedTxHash: hashN(1),
      failure: null,
    });
    expect(sends(t.wallet)).toHaveLength(1);
  });

  test('deposit dropped: UNCERTAIN blocks new deposits until it resolves or the user dismisses it', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    t.api.routes[`/api/v1/rh/history?address=${ACCOUNT}&limit=50`] = loadFixture('getHistory.200.empty').response;
    await ready(t);
    await t.controller.bridge();
    await advance(t, 121000);
    t.chains.state.nonces[`46630:${ACCOUNT}`] = 1;
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({
      stage: 'UNCERTAIN',
      failure: 'REPLACED_OR_DROPPED',
      sourceTxHash: null,
    });
    await t.controller.refreshChain();
    expect(t.controller.view()).toMatchObject({
      canBridge: false,
      pendingRecord: expect.objectContaining({ stage: 'UNCERTAIN' }),
    });
    t.controller.dismiss(records(t.store)[0].id);
    expect(t.controller.view().canBridge).toBe(true);
    expect(sends(t.wallet)).toHaveLength(1);
  });

  test('a long-pending record without receipt can be dismissed after 30 minutes, never before, never once mined', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    await ready(t);
    await t.controller.bridge();
    const id = records(t.store)[0].id;
    await advance(t, 29 * 60 * 1000);
    await t.controller.trackOnce(); // nonce not consumed: still pending
    expect(t.controller.canDismiss(records(t.store)[0])).toBe(false);
    t.controller.dismiss(id);
    expect(records(t.store)[0].stage).toBe('SOURCE_PENDING');
    await advance(t, 60 * 1000);
    expect(t.controller.canDismiss(records(t.store)[0])).toBe(true);
    t.controller.dismiss(id);
    expect(records(t.store)[0].stage).toBe('DISMISSED');
    expect(sends(t.wallet)).toHaveLength(1);

    const m = setup();
    m.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    await ready(m);
    await m.controller.bridge();
    m.chains.state.receipts[`46630:${hashN(1)}`] = { status: 1, blockNumber: 5 };
    await m.controller.trackOnce();
    await advance(m, 31 * 60 * 1000);
    expect(records(m.store)[0]).toMatchObject({ stage: 'SOURCE_PENDING', sourceBlock: 5 });
    expect(m.controller.canDismiss(records(m.store)[0])).toBe(false);
  });
});

describe('L1: the exit fee must equal the minter on-chain fee', () => {
  const quoteRoute = () => ({ status: 200, body: manifestFeeQuote(GROSS, T0) });
  const exitSetup = async () => {
    const t = setup({ chainId: 8901, routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: quoteRoute() } });
    t.controller.setDirection('ONYX_TO_RH');
    t.chains.state.allowances[EXIT_ALLOWANCE] = GROSS;
    return t;
  };

  test('matching on-chain fee enables the burn and is recorded with the quote', async () => {
    const t = await exitSetup();
    await ready(t);
    expect(t.controller.state.quote.onchain).toEqual({ fee: EXIT_FEE, maxFeeBps: 100, maxMinFee: '28000000000000000' });
    expect(t.controller.view().canBridge).toBe(true);
  });

  test('an on-chain fee that differs from the API quote disables the burn', async () => {
    const t = await exitSetup();
    t.chains.state.feeOverride = '2700000000000000';
    await ready(t);
    expect(t.controller.view()).toMatchObject({
      canBridge: false,
      quoteError: "The quoted fee does not match the minter's on-chain fee. Exits stay disabled.",
    });
  });

  test('a mismatch appearing at click time stops without sending', async () => {
    const t = await exitSetup();
    await ready(t);
    expect(t.controller.view().canBridge).toBe(true);
    t.chains.state.feeOverride = '2900000000000000';
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(t.controller.state.notice).toMatch(/does not match the minter's on-chain fee.*Nothing was sent/);
  });

  test('a maxFee above the on-chain governance ceiling is refused', async () => {
    const t = await exitSetup();
    t.chains.state.maxFeeBps = '0';
    t.chains.state.registry = { ...t.chains.state.registry, maxMinFee: '1000' };
    await ready(t);
    expect(t.controller.view()).toMatchObject({
      canBridge: false,
      quoteError: 'The quoted maxFee is above the on-chain fee ceiling. Exits stay disabled.',
    });
  });

  test('exit tracked to delivery on Robinhood', async () => {
    const t = await exitSetup();
    await ready(t);
    await t.controller.bridge();
    const source = records(t.store)[0].sourceTxHash!;
    t.chains.state.receipts[`8901:${source}`] = { status: 1, blockNumber: 6900000 };
    t.api.routes[`/api/v1/rh/status/by-tx/${source}`] = {
      status: 200,
      body: { items: [operation('AWAITING_EXECUTION', 'ONYX_TO_RH', source)] },
    };
    await t.controller.trackOnce();
    const opId = 'ONYX_TO_RH:0x' + 'e2'.repeat(32);
    expect(records(t.store)[0]).toMatchObject({
      stage: 'SOURCE_FINAL',
      operationId: opId,
      feeRaw: EXIT_FEE,
      maxFeeRaw: EXIT_FEE,
    });
    t.api.routes['/api/v1/rh/status/' + encodeURIComponent(opId)] = {
      status: 200,
      body: operation('COMPLETED', 'ONYX_TO_RH', source),
    };
    await t.controller.trackOnce();
    expect(records(t.store)[0]).toMatchObject({ stage: 'DELIVERED', destinationTxHash: '0x' + 'f0'.repeat(32) });
    expect(sends(t.wallet)).toHaveLength(1);
  });
});

describe('L2: a definitive rejection of a prompt that another tab marked uncertain', () => {
  test('user rejection turns the uncertain record into FAILED (USER_REJECTED)', async () => {
    const t = setup();
    await ready(t);
    t.wallet.script.onSend = () => {
      markInterruptedPrompts(t.store, t.clock.now); // a second tab loads while the prompt is open
      throw Object.assign(new Error('User denied'), { code: 4001 });
    };
    await t.controller.approve();
    expect(records(t.store)[0]).toMatchObject({ stage: 'FAILED', failure: 'USER_REJECTED' });
  });

  test('an ambiguous error in the same situation stays UNCERTAIN', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    await ready(t);
    t.wallet.script.onSend = () => {
      markInterruptedPrompts(t.store, t.clock.now);
      throw Object.assign(new Error('Internal'), { code: -32603 });
    };
    await t.controller.bridge();
    expect(records(t.store)[0].stage).toBe('UNCERTAIN');
  });
});

describe('L3: on-chain capacity and partial allowance', () => {
  test('a deposit above the remaining rolling 24 h mint capacity is refused', async () => {
    const t = setup();
    t.chains.state.mintUsage = (BigInt(t.chains.state.registry.mint24hCap) - BigInt('50000000000000000')).toString();
    await ready(t);
    expect(t.chains.state.mintUsage).toBe('2750000000000000000');
    expect(t.controller.view()).toMatchObject({ capacityError: 'ABOVE_CAPACITY', canApprove: false, canBridge: false });
    await ready(t, '0.05');
    expect(t.controller.view().capacityError).toBeUndefined();
  });

  test('a deposit above the remaining escrow custody room is refused; capacity is re-read at click time', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = GROSS;
    await ready(t);
    expect(t.controller.view().canBridge).toBe(true);
    t.chains.state.totalCustodied = '5550000000000000000'; // 0.05 TSLA room left
    await t.controller.bridge();
    expect(sends(t.wallet)).toHaveLength(0);
    expect(t.controller.state.notice).toBe('Above the remaining on-chain bridge capacity. Nothing was sent.');
  });

  test('an exit above the outstanding bridged supply is refused', async () => {
    const t = setup({
      chainId: 8901,
      routes: { [`/api/v1/rh/fee-quote?gross=${GROSS}`]: { status: 200, body: manifestFeeQuote(GROSS, T0) } },
    });
    t.controller.setDirection('ONYX_TO_RH');
    t.chains.state.outstanding = '50000000000000000';
    await ready(t);
    expect(t.controller.view()).toMatchObject({ capacityError: 'ABOVE_CAPACITY', canApprove: false });
  });

  test('a partial existing allowance still approves exactly the gross amount (not the difference)', async () => {
    const t = setup();
    t.chains.state.allowances[DEPOSIT_ALLOWANCE] = '40000000000000000';
    await ready(t);
    expect(t.controller.view()).toMatchObject({ needsApproval: true, canApprove: true, canBridge: false });
    await t.controller.approve();
    const decoded = LANE_ABI.decodeFunctionData(
      'approve',
      (sends(t.wallet)[0].params![0] as Record<string, string>).data
    );
    expect([decoded[0].toLowerCase(), decoded[1].toString()]).toEqual([RH_LANE.escrow, GROSS]);
  });
});
