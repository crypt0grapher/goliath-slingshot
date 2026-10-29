// SPDX-License-Identifier: Apache-2.0
import { keccak256 } from 'ethers/lib/utils';
import { LANE_ABI } from '../lane';
import type { ChainReader } from '../chainReads';
import {
  BALANCE_DISPLAY_TTL_MS,
  GENESIS,
  SameCycleCoordinator,
  acceptPublication,
  clockFor,
  createBalanceChannel,
  isAvailabilityFailure,
  qualifyChainBalance,
  reduceBalanceChannel,
} from '../balanceObservations';
import type { QualifyInput } from '../balanceObservations';
import { balanceDelay, canStartManualRefresh, receiptCheckOffsets, RECEIPT_WINDOW_MS } from '../balanceSchedule';
import { presentBlocker } from '../../../components/bridge/actionBlocker';
import type { BlockerInput } from '../../../components/bridge/actionBlocker';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const TOKEN = '0x00000000000000000000000000000000000000aa';
const CODE = '0x60016001';

function reader(
  patch: Partial<ChainReader> & { balance?: string; decimals?: number; failBalance?: boolean } = {}
): ChainReader {
  const decimalsData = LANE_ABI.encodeFunctionData('decimals', []);
  const balanceData = LANE_ABI.encodeFunctionData('balanceOf', [ACCOUNT]);
  return {
    call: async (_chain, _to, data) => {
      if (patch.failBalance && data === balanceData) throw new Error('RH_RPC_UNREACHABLE');
      if (data === decimalsData) return LANE_ABI.encodeFunctionResult('decimals', [patch.decimals ?? 18]);
      if (data === balanceData) return LANE_ABI.encodeFunctionResult('balanceOf', [patch.balance ?? '1000']);
      throw new Error('UNEXPECTED_CALL');
    },
    getBalance: async () => patch.balance ?? '1000',
    getReceipt: async () => null,
    getTransaction: async () => null,
    getTransactionCount: async () => 0,
    getCode: async () => CODE,
    getChainId: async (id) => id,
    genesisHash: async (id) => GENESIS[id],
    ...patch,
  };
}

function input(over: Partial<QualifyInput> = {}): QualifyInput {
  return {
    reader: reader(),
    now: () => 1_000,
    account: ACCOUNT,
    providerEpoch: 1,
    chainId: 46630,
    profileSha256: 'ab'.repeat(32),
    assetId: 'TSLA',
    kind: 'erc20',
    token: TOKEN,
    expectedCodeKeccak256: keccak256(CODE),
    ...over,
  };
}

const ready = (over: Partial<BlockerInput> = {}): BlockerInput => ({
  connected: true,
  walletMatches: true,
  walletPrompt: false,
  inFlight: false,
  recipientValid: true,
  amountValid: true,
  balance: 'ok',
  gas: 'ok',
  checking: false,
  held: false,
  capacityExceeded: false,
  quoteReady: true,
  eligible: true,
  historyReady: true,
  authorityFresh: true,
  ...over,
});

test('a qualified balance keeps the request start and expires 15 seconds later', async () => {
  const result = await qualifyChainBalance(input());
  expect(result.kind).toBe('qualified');
  if (result.kind !== 'qualified') return;
  expect(result.valueAtomic).toBe('1000');
  expect(result.identity.account).toBe(ACCOUNT);
  expect(result.identity.decimals).toBe(18);
  expect(result.clock).toEqual({
    requestStartedAtMs: 1_000,
    observedAtMs: 1_000,
    expiresAtMs: 1_000 + BALANCE_DISPLAY_TTL_MS,
  });
  expect(result.clock.expiresAtMs - result.clock.requestStartedAtMs).toBe(15_000);
});

test('wrong genesis, code, or decimals never produces a numeric balance', async () => {
  const genesis = await qualifyChainBalance(
    input({ reader: reader({ genesisHash: async () => '0x' + '11'.repeat(32) }) })
  );
  const code = await qualifyChainBalance(input({ reader: reader({ getCode: async () => '0x' }) }));
  const decimals = await qualifyChainBalance(input({ reader: reader({ decimals: 6 }) }));
  expect(genesis).toMatchObject({ kind: 'mismatch', code: 'GENESIS' });
  expect(code).toMatchObject({ kind: 'mismatch', code: 'CODE' });
  expect(decimals).toMatchObject({ kind: 'mismatch', code: 'DECIMALS' });
  for (const result of [genesis, code, decimals]) expect(result).not.toHaveProperty('valueAtomic');
});

test('one chain failure does not reject the peer, and a failure is not zero', async () => {
  const [source, destination] = await Promise.allSettled([
    qualifyChainBalance(input({ reader: reader({ failBalance: true }) })),
    qualifyChainBalance(input({ chainId: 8901, kind: 'native', token: null, reader: reader({ balance: '42' }) })),
  ]);
  expect(source.status).toBe('fulfilled');
  expect(destination.status).toBe('fulfilled');
  if (source.status !== 'fulfilled' || destination.status !== 'fulfilled') return;
  expect(source.value.kind).toBe('unavailable');
  expect(source.value).not.toMatchObject({ valueAtomic: '0' });
  expect(destination.value).toMatchObject({ kind: 'qualified', valueAtomic: '42' });
});

test('availability failures do not set the mismatch latch, and late balances cannot clear it', () => {
  let state = reduceBalanceChannel(createBalanceChannel(), {
    type: 'context',
    epoch: 3,
    providerEpoch: 1,
    account: ACCOUNT,
    profileSha256: 'aa',
  });
  state = reduceBalanceChannel(state, { type: 'availability' });
  expect(state.latch).toBeNull();
  expect(isAvailabilityFailure('503')).toBe(true);
  expect(isAvailabilityFailure('429')).toBe(true);
  expect(isAvailabilityFailure('TIMEOUT')).toBe(true);
  state = reduceBalanceChannel(state, { type: 'registry-mismatch', epoch: 3, profileSha256: 'aa', code: 'REGISTRY' });
  expect(state.source.status).toBe('unavailable');
  const qualified = {
    kind: 'qualified' as const,
    identity: {
      account: ACCOUNT,
      providerEpoch: 1,
      chainId: 46630,
      profileSha256: 'aa',
      assetId: 'TSLA',
      kind: 'erc20' as const,
      token: TOKEN,
      decimals: 18,
    },
    valueAtomic: '5',
    clock: clockFor(10, 12),
  };
  state = reduceBalanceChannel(state, {
    type: 'result',
    side: 'source',
    epoch: 3,
    result: qualified,
    revalidated: false,
  });
  expect(state.latch?.code).toBe('REGISTRY');
  expect(state.source.valueAtomic).toBeUndefined();
  state = reduceBalanceChannel(state, { type: 'availability' });
  expect(state.latch).not.toBeNull();
  state = reduceBalanceChannel(state, {
    type: 'result',
    side: 'source',
    epoch: 3,
    result: qualified,
    revalidated: true,
  });
  expect(state.latch).toBeNull();
  expect(state.source).toMatchObject({ status: 'ready', valueAtomic: '5' });
});

test('a retained number keeps its original clock and does not become ready again', () => {
  const clock = clockFor(0, 5);
  let state = reduceBalanceChannel(createBalanceChannel(), {
    type: 'context',
    epoch: 1,
    providerEpoch: 1,
    account: ACCOUNT,
    profileSha256: 'aa',
  });
  state = reduceBalanceChannel(state, {
    type: 'result',
    side: 'source',
    epoch: 1,
    revalidated: true,
    result: {
      kind: 'qualified',
      identity: {
        account: ACCOUNT,
        providerEpoch: 1,
        chainId: 46630,
        profileSha256: 'aa',
        assetId: 'TSLA',
        kind: 'native',
        token: null,
        decimals: 18,
      },
      valueAtomic: '9',
      clock,
    },
  });
  state = reduceBalanceChannel(state, { type: 'expire', nowMs: clock.expiresAtMs });
  expect(state.source).toMatchObject({ status: 'stale', valueAtomic: '9', clock });
  state = reduceBalanceChannel(state, { type: 'loading', side: 'source', epoch: 1, nowMs: clock.expiresAtMs + 1 });
  expect(state.source.status).not.toBe('ready');
  expect(state.source.clock).toEqual(clock);
});

test('an old epoch cannot publish over a newer context', () => {
  let state = reduceBalanceChannel(createBalanceChannel(), {
    type: 'context',
    epoch: 2,
    providerEpoch: 2,
    account: ACCOUNT,
    profileSha256: 'bb',
  });
  state = reduceBalanceChannel(state, {
    type: 'result',
    side: 'destination',
    epoch: 1,
    revalidated: true,
    result: {
      kind: 'qualified',
      identity: {
        account: '0x1111111111111111111111111111111111111111',
        providerEpoch: 1,
        chainId: 8901,
        profileSha256: 'aa',
        assetId: 'TSLA',
        kind: 'erc20',
        token: TOKEN,
        decimals: 18,
      },
      valueAtomic: '1',
      clock: clockFor(0, 1),
    },
  });
  expect(state.destination.status).toBe('loading');
  expect(state.destination.valueAtomic).toBeUndefined();
});

test('same-cycle reads share one call and a stale cycle cannot be restamped', async () => {
  let now = 0;
  let calls = 0;
  let release: (value: string) => void = () => undefined;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });
  const coordinator = new SameCycleCoordinator(() => now);
  const first = coordinator.share(1, 'balance', 15_000, () => {
    calls += 1;
    return pending;
  });
  const second = coordinator.share(1, 'balance', 15_000, async () => {
    calls += 1;
    return '8';
  });
  expect(calls).toBe(1);
  now = 15_000;
  await expect(coordinator.share(1, 'balance', 15_000, async () => '9')).rejects.toThrow('RH_READ_DEADLINE');
  expect(calls).toBe(1);
  release('7');
  await expect(Promise.all([first, second])).resolves.toEqual([
    { value: '7', startedAtMs: 0, deadlineMs: 15_000 },
    { value: '7', startedAtMs: 0, deadlineMs: 15_000 },
  ]);
  expect(acceptPublication(1, 2, 1, 15_000)).toBe(false);
  expect(acceptPublication(1, 1, 15_000, 15_000)).toBe(false);
  expect(acceptPublication(1, 1, 14_999, 15_000)).toBe(true);
  const again = await coordinator.share(2, 'balance', 15_000, async () => {
    calls += 1;
    return '9';
  });
  expect(again).toMatchObject({ value: '9', startedAtMs: 15_000 });
  expect(calls).toBe(2);
});

test('manual refresh coalesces in-flight work and then waits two seconds', () => {
  expect(canStartManualRefresh(null, 0, false)).toBe(true);
  expect(canStartManualRefresh(null, 0, true)).toBe(false);
  expect(canStartManualRefresh(1_000, 2_999, false)).toBe(false);
  expect(canStartManualRefresh(1_000, 3_000, false)).toBe(true);
  expect([0, 1, 2, 3, 4].map(balanceDelay)).toEqual([10_000, 10_000, 20_000, 40_000, 60_000]);
  expect(receiptCheckOffsets()).toHaveLength(5);
  expect(receiptCheckOffsets().every((offset) => offset < RECEIPT_WINDOW_MS)).toBe(true);
});

test('blockers use verified state and never describe missing data as a hold', () => {
  expect(presentBlocker(ready({ connected: false }))?.code).toBe('CONNECT');
  expect(presentBlocker(ready({ walletMatches: false }))?.code).toBe('WRONG_NETWORK');
  expect(presentBlocker(ready({ held: true, authorityFresh: false }))).toMatchObject({
    code: 'UNAVAILABLE',
    message: 'Bridge details are unavailable.',
  });
  expect(presentBlocker(ready({ held: true }))?.code).toBe('HELD');
  expect(presentBlocker(ready({ balance: 'insufficient' }))?.message).toBe('The wallet balance is too low.');
  expect(presentBlocker(ready())?.message).toBeUndefined();
});
