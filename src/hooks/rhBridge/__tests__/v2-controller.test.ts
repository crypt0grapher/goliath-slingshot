// SPDX-License-Identifier: Apache-2.0
import { v2Fixture } from '../../../services/rhBridge/__fixtures__/v2';
import { RhLaneController } from '../controller';
import { profileLane } from '../../../config/rhBridge/profiles';
import { createIntent, readHistory, updateRecord } from '../../../state/rhBridge/history';
import { operationMatches, trackRecord, operationClaim } from '../../../services/rhBridge/tracker';
import statusFixture from '../../../services/rhBridge/__fixtures__/public-api.v2/getStatusV2.200.json';
import { LANE_ABI } from '../../../services/rhBridge/lane';
const setup = async (asset = 'RH_ETH', direction: 'RH_TO_ONYX' | 'ONYX_TO_RH' = 'RH_TO_ONYX') => {
  const f = v2Fixture(),
    c = new RhLaneController(f.deps);
  f.state.chainId = direction === 'RH_TO_ONYX' ? 46630 : 8901;
  c.setWallet({ account: f.state.account, chainId: f.state.chainId, isInjected: true, hasProvider: true }, f.provider);
  c.setSelection(asset, direction, asset === 'TSLA' ? '0.05' : '0.0001', '');
  await c.refreshLane();
  return { ...f, c };
};
test('native MAX reserves estimated gas from RH ETH and all native source ERC20 probes are absent', async () => {
  const f = await setup();
  expect(f.c.state.v2?.maxRaw).toBe('974800000000000');
  expect(f.c.view().canBridge).toBe(true);
  expect(f.state.calls.filter((x) => x.chainId === 46630)).toEqual([]);
  f.state.gasUnknown = true;
  await f.c.refreshLane();
  expect(f.c.view().canBridge).toBe(false);
  expect(f.c.state.v2?.maxRaw).toBeUndefined();
  expect(f.c.state.v2?.sourceBalance).toBe('1000000000000000');
  f.state.held = true;
  await f.c.refreshLane();
  expect(f.c.state.v2?.capacity.remainingCapacity).toBe('4000000000000000');
  expect(f.c.view().canBridge).toBe(false);
});
test.each(['TSLA', 'RH_ETH'])(
  '%s Onyx exit approves exact distinct wrapper then burns gross with fresh maxFee and value zero',
  async (asset) => {
    const f = await setup(asset, 'ONYX_TO_RH'),
      profile = f.catalog.current(asset)!;
    expect(f.c.view().canApprove).toBe(true);
    await f.c.approve();
    const approve = f.state.sends[0];
    expect(approve.to).toBe(profile.descriptor.wrapper.address);
    expect(approve.value).toBe('0x0');
    const decoded = LANE_ABI.parseTransaction({ data: approve.data });
    expect(decoded.name).toBe('approve');
    expect(decoded.args[0].toLowerCase()).toBe(profile.descriptor.minter.address);
    const gross = asset === 'TSLA' ? '50000000000000000' : '100000000000000';
    expect(decoded.args[1].toString()).toBe(gross);
    f.chains.getReceipt = async () => ({ status: 1, blockNumber: 10 });
    f.state.allowance = '1000000000000000000';
    await f.c.trackOnce();
    await f.c.refreshLane();
    expect(f.c.view().canBridge).toBe(true);
    await f.c.bridge();
    expect(f.state.sends).toHaveLength(2);
    const burn = f.state.sends[1],
      call = LANE_ABI.parseTransaction({ data: burn.data });
    expect(burn.value).toBe('0x0');
    expect(burn.to).toBe(profile.descriptor.minter.address);
    expect(call.name).toBe('burn');
    expect(call.args[0].toLowerCase()).toBe(profile.descriptor.wrapper.address);
    expect(call.args[1].toString()).toBe(gross);
    expect(call.args[3].toString()).toBe(f.c.state.v2!.quote!.suggestedMaxFee);
  }
);
test('untrusted registry/code changes and global holds cannot enable native actions', async () => {
  const f = await setup();
  f.state.badRegistry = true;
  await f.c.refreshLane();
  expect(f.c.view().canBridge).toBe(false);
  f.state.badRegistry = false;
  f.state.badParameters = true;
  await f.c.refreshLane();
  expect(f.c.view().canBridge).toBe(false);
  f.state.badParameters = false;
  f.chains.getCode = async () => '0x';
  await f.c.refreshLane();
  expect(f.c.view().canBridge).toBe(false);
});
test('failed reads retain only display data with original expiry and never retain action authority', async () => {
  const f = await setup(),
    previous = f.c.state.v2!;
  f.deps.v2!.api = {
    read: async () => {
      throw new Error('Controlled read failure');
    },
  };
  await f.c.refreshLane();
  expect(f.c.state.v2).toBeNull();
  expect(f.c.state.v2Display).toBe(previous);
  expect(f.c.state.v2Display!.validUntil).toBe(previous.validUntil);
  expect(f.c.view().canBridge).toBe(false);
  expect(f.c.view().canApprove).toBe(false);
  expect(f.c.state.notice).toBe('Bridge observations are unavailable or stale. Live actions stay disabled.');
  await f.c.refreshLane();
  expect(f.c.state.v2Display).toBe(previous);
  expect(f.c.view().canBridge).toBe(false);
});
test.each([
  'asset',
  'amount',
  'recipient',
  'direction',
  'account',
  'chain',
  'provider',
  'wallet-event',
  'amount-setter',
  'recipient-setter',
  'direction-setter',
])('retained display never resurrects after an away-and-back %s context transition', async (change) => {
  const f = await setup();
  f.deps.v2!.api = {
    read: async () => {
      throw new Error('Controlled read failure');
    },
  };
  await f.c.refreshLane();
  expect(f.c.state.v2Display).not.toBeNull();
  const wallet = { account: f.state.account, chainId: 46630, isInjected: true, hasProvider: true };
  if (['asset', 'amount', 'recipient', 'direction'].includes(change)) {
    f.c.setSelection(
      change === 'asset' ? 'TSLA' : 'RH_ETH',
      change === 'direction' ? 'ONYX_TO_RH' : 'RH_TO_ONYX',
      change === 'amount' ? '0.0002' : '0.0001',
      change === 'recipient' ? '0xaa91057c8f98af30c44bb8708399bf4daa188a81' : ''
    );
    f.c.setSelection('RH_ETH', 'RH_TO_ONYX', '0.0001', '');
  } else if (change === 'wallet-event') f.c.invalidateContext();
  else if (change === 'amount-setter') {
    f.c.setAmount('0.0002');
    f.c.setAmount('0.0001');
  } else if (change === 'recipient-setter') {
    f.c.setRecipient('0xaa91057c8f98af30c44bb8708399bf4daa188a81');
    f.c.setRecipient('');
  } else if (change === 'direction-setter') {
    f.c.setDirection('ONYX_TO_RH');
    f.c.setDirection('RH_TO_ONYX');
  } else {
    f.c.setWallet(
      {
        ...wallet,
        ...(change === 'account'
          ? { account: '0xaa91057c8f98af30c44bb8708399bf4daa188a81' }
          : change === 'chain'
          ? { chainId: 8901 }
          : {}),
      },
      change === 'provider' ? { request: async () => undefined } : f.provider
    );
    f.c.setWallet(wallet, f.provider);
  }
  expect(f.c.state.v2Display).toBeNull();
  await f.c.refreshLane();
  expect(f.c.state.v2Display).toBeNull();
  expect(f.c.state.v2).toBeNull();
  expect(f.c.view().canBridge).toBe(false);
  expect(f.c.view().canApprove).toBe(false);
});
test('initial repeated failure remains unavailable; only a new successful read restores authority', async () => {
  const f = v2Fixture(),
    c = new RhLaneController(f.deps),
    api = f.deps.v2!.api;
  c.setWallet({ account: f.state.account, chainId: 46630, isInjected: true, hasProvider: true }, f.provider);
  c.setSelection('RH_ETH', 'RH_TO_ONYX', '0.0001', '');
  f.deps.v2!.api = {
    read: async () => {
      throw new Error('Controlled initial failure');
    },
  };
  await c.refreshLane();
  await c.refreshLane();
  expect(c.state.v2).toBeNull();
  expect(c.state.v2Display).toBeNull();
  expect(c.view().canBridge).toBe(false);
  f.deps.v2!.api = api;
  await c.refreshLane();
  expect(c.state.v2Display).toBe(c.state.v2);
  expect(c.view().canBridge).toBe(true);
  expect(c.state.notice).toBeNull();
});
test('independent chain/code qualification runs together and capacity is fetched only after costly reads', async () => {
  const f = v2Fixture(),
    c = new RhLaneController(f.deps),
    hold = deferred<void>(),
    started: string[] = [];
  c.setWallet({ account: f.state.account, chainId: 46630, isInjected: true, hasProvider: true }, f.provider);
  c.setSelection('RH_ETH', 'RH_TO_ONYX', '0.0001', '');
  for (const method of ['getChainId', 'genesisHash', 'getCode'] as const) {
    const original = f.chains[method]!;
    f.chains[method] = async (...args: any[]) => {
      started.push(method);
      await hold.promise;
      return (original as any)(...args);
    };
  }
  const reads: string[] = [],
    read = f.deps.v2!.api.read;
  f.deps.v2!.api = {
    read: async (request) => {
      reads.push(request.kind);
      return read(request);
    },
  };
  const first = c.refreshLane(),
    second = c.refreshLane();
  for (let i = 0; i < 100; i++) await Promise.resolve();
  expect(started.filter((x) => x === 'getChainId')).toHaveLength(2);
  expect(started.filter((x) => x === 'genesisHash')).toHaveLength(2);
  expect(started.filter((x) => x === 'getCode')).toHaveLength(4);
  expect(reads).not.toContain('capacity');
  hold.resolve();
  await Promise.all([first, second]);
  expect(reads.filter((x) => x === 'assets')).toHaveLength(1);
  expect(reads.filter((x) => x === 'capacity')).toHaveLength(1);
  expect(c.view().canBridge).toBe(true);
});
test.each(['limits', 'effectiveState', 'health', 'capacity'])(
  'a late fresh capacity never extends the original %s deadline',
  async (kind) => {
    const f = v2Fixture(),
      c = new RhLaneController(f.deps),
      hold = deferred<void>(),
      entered = deferred<void>(),
      start = f.state.now;
    c.setWallet({ account: f.state.account, chainId: 46630, isInjected: true, hasProvider: true }, f.provider);
    c.setSelection('RH_ETH', 'RH_TO_ONYX', '0.0001', '');
    const read = f.deps.v2!.api.read;
    f.deps.v2!.api = {
      read: async (request) => {
        const response = await read(request);
        if (request.kind !== kind) return response;
        const body = JSON.parse(JSON.stringify(response.body));
        if (kind === 'health') body.observedAt = new Date(start - 29000).toISOString();
        else body.observation.expiresAt = new Date(start + 1000).toISOString();
        return { ...response, body };
      },
    };
    const code = f.chains.getCode!;
    f.chains.getCode = async (...args) => {
      entered.resolve();
      await hold.promise;
      return code(...args);
    };
    const pending = c.refreshLane();
    await entered.promise;
    f.state.now += 2000;
    hold.resolve();
    await pending;
    expect(c.state.v2).toBeNull();
    expect(c.view().canBridge).toBe(false);
    expect(c.view().canApprove).toBe(false);
  }
);
test('v2 history appends preserve exact untouched v1/unknown lexical row bytes', () => {
  const f = v2Fixture(),
    old = ' { "unknown" : ["keep,\\"bytes", {"nested":true}] } ';
  const key = 'bridge:rh:testnet:46630:8901:operations:v1';
  f.storage.setItem(key, '[' + old + ']');
  const lane = profileLane(f.catalog.current('RH_ETH')!);
  createIntent(f.storage, {
    direction: 'RH_TO_ONYX',
    account: f.state.account,
    recipient: f.state.account,
    grossRaw: '100000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane,
    nowMs: f.state.now,
    randomHex: '12345678',
  });
  expect(f.storage.getItem(key)).toContain(old);
  expect(readHistory(f.storage).invalidRows).toBe(1);
  expect(readHistory(f.storage).records[0].assetBinding).toEqual(lane.binding);
});
test('one controller tracks both recorded profiles with explicit asset/chain filters independent of selection', async () => {
  const f = v2Fixture(),
    c = new RhLaneController(f.deps),
    ids: string[] = [];
  for (const asset of ['RH_ETH', 'TSLA']) {
    const lane = profileLane(f.catalog.current(asset)!),
      r = createIntent(f.storage, {
        direction: 'RH_TO_ONYX',
        account: f.state.account,
        recipient: f.state.account,
        grossRaw: asset === 'TSLA' ? '50000000000000000' : '100000000000000',
        feeRaw: '0',
        maxFeeRaw: null,
        step: 'BRIDGE',
        lane,
        nowMs: f.state.now,
        randomHex: asset === 'TSLA' ? '11111111' : '22222222',
      });
    updateRecord(f.storage, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: '0x' + 'd'.repeat(64) }, f.state.now);
    ids.push(r.id);
  }
  const requests: any[] = [];
  f.deps.v2!.api = {
    read: async (request) => {
      requests.push(request);
      const r = readHistory(f.storage).records.find(
        (r) => r.assetBinding!.assetId === ('assetId' in request ? request.assetId : undefined)
      )!;
      const op = JSON.parse(JSON.stringify(statusFixture.response.body));
      op.binding = r.assetBinding;
      op.sender = op.recipient = r.account;
      op.grossAmount = op.netAmount = r.grossRaw;
      op.source.txHash = r.sourceTxHash;
      op.operationId = 'RH_TO_ONYX:0x' + (r.assetBinding!.assetId === 'TSLA' ? '1' : '2').repeat(64);
      return { status: 200, body: { items: [op] } };
    },
  };
  f.chains.getReceipt = async () => ({ status: 1, blockNumber: 1 });
  c.setSelection(null, 'RH_TO_ONYX', '', '');
  await c.trackOnce();
  expect(requests.map((r) => [r.kind, r.chainId, r.assetId])).toEqual([
    ['statusByTx', 46630, 'RH_ETH'],
    ['statusByTx', 46630, 'TSLA'],
  ]);
  expect(readHistory(f.storage).records.map((r) => r.stage)).toEqual(['SOURCE_FINAL', 'SOURCE_FINAL']);
  const records = readHistory(f.storage).records,
    op: any = {
      binding: records[1].assetBinding,
      assetId: 'TSLA',
      direction: 'RH_TO_ONYX',
      sender: f.state.account,
      recipient: f.state.account,
      grossAmount: records[0].grossRaw,
      source: { chainId: 46630, txHash: records[0].sourceTxHash },
      operationId: records[0].operationId,
    };
  expect(operationMatches(records[0], op)).toBe(false);
  expect(ids).toHaveLength(2);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test('v2 controller generations reject an old read after a profile moves away and back', async () => {
  const f = await setup(),
    original = f.deps.v2!.api.read,
    hold = deferred<void>(),
    started = deferred<void>();
  let delayed = true;
  f.deps.v2!.api = {
    read: async (request) => {
      if (request.kind === 'limits' && delayed) {
        delayed = false;
        started.resolve();
        await hold.promise;
      }
      return original(request);
    },
  };
  const pending = f.c.refreshLane();
  await started.promise;
  f.c.setSelection('TSLA', 'RH_TO_ONYX', '0.05', '');
  f.c.setSelection('RH_ETH', 'RH_TO_ONYX', '0.0001', '');
  hold.resolve();
  await pending;
  expect(f.c.state.v2).toBeNull();
  await f.c.refreshLane();
  expect(f.c.view().canBridge).toBe(true);
});
test('controller epoch is checked after asynchronous wallet context preparation immediately before the native prompt', async () => {
  const f = await setup(),
    accounts = deferred<string[]>(),
    started = deferred<void>(),
    original = f.provider.request.getMockImplementation()!;
  let held = false;
  f.provider.request.mockImplementation(async (request) => {
    if (request.method === 'eth_accounts' && !held) {
      held = true;
      started.resolve();
      return accounts.promise;
    }
    return original(request);
  });
  const sending = f.c.bridge();
  await started.promise;
  f.c.invalidateContext();
  accounts.resolve([f.state.account]);
  await sending;
  expect(f.state.sends).toHaveLength(0);
  expect(readHistory(f.storage).records[0]).toMatchObject({
    stage: 'FAILED',
    sourceTxHash: null,
    failure: 'CONTEXT_CHANGED',
  });
});

function uncertainRecovery() {
  const f = v2Fixture(),
    profile = f.catalog.current('RH_ETH')!,
    lane = profileLane(profile);
  const initial = createIntent(f.storage, {
    direction: 'RH_TO_ONYX',
    account: f.state.account,
    recipient: f.state.account,
    grossRaw: '100000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane,
    nowMs: f.state.now,
    randomHex: 'abcdef12',
  });
  const record = updateRecord(
    f.storage,
    initial.id,
    { stage: 'UNCERTAIN', failure: 'PROMPT_INTERRUPTED' },
    f.state.now
  );
  const own: any = JSON.parse(JSON.stringify(statusFixture.response.body));
  own.binding = profile.descriptor.binding;
  own.sender = own.recipient = f.state.account;
  own.createdAt = own.updatedAt = new Date(f.state.now).toISOString();
  own.operationId = 'RH_TO_ONYX:0x' + '1'.repeat(64);
  const other = {
    ...own,
    binding: { ...own.binding, profileSha256: 'f'.repeat(64), abiVersion: own.binding.abiVersion + '-historical' },
    operationId: 'RH_TO_ONYX:0x' + '2'.repeat(64),
  };
  const recover = async (items: any[], byTx = false, claimedOperations: string[] = []) => {
    const requests: any[] = [];
    const api = {
      read: async (request: any) => {
        requests.push(request);
        return {
          status: 200,
          body:
            request.kind === 'statusByTx'
              ? { items }
              : { address: f.state.account, assetId: 'RH_ETH', items, nextCursor: null },
        };
      },
    };
    const patches = await trackRecord(byTx ? { ...record, replacedTxHash: '0x' + 'a'.repeat(64) } : record, {
      api: null,
      v2: { api, binding: profile.descriptor.binding },
      chains: f.chains,
      lane,
      nowMs: f.state.now,
      claimedHashes: [],
      claimedOperations,
      direction: record.direction,
    });
    expect(f.state.sends).toHaveLength(0);
    return { patches, requests };
  };
  return { f, record, own, other, recover };
}
test.each([false, true])(
  'exact UNCERTAIN recovery survives valid same-asset historical profiles (by-tx=%s)',
  async (byTx) => {
    const t = uncertainRecovery(),
      result = await t.recover([t.other, t.own], byTx);
    expect(result.patches).toEqual([
      { stage: 'SOURCE_PENDING', sourceTxHash: t.own.source.txHash, failure: null },
      { stage: 'SOURCE_FINAL', operationId: t.own.operationId, destinationTxHash: null, holdCategory: 'LANE_PAUSED' },
    ]);
    expect(result.requests[0]).toMatchObject(
      byTx
        ? { kind: 'statusByTx', chainId: 46630, assetId: 'RH_ETH' }
        : { kind: 'history', address: t.f.state.account, assetId: 'RH_ETH' }
    );
  }
);
test.each(['closed-schema', 'conservation', 'asset-filter', 'address-filter'])(
  'malformed unrelated profile row still aborts whole recovery: %s',
  async (kind) => {
    const t = uncertainRecovery(),
      bad = JSON.parse(JSON.stringify(t.other));
    if (kind === 'closed-schema') bad.extra = 'not allowed';
    if (kind === 'conservation') bad.netAmount = '1';
    if (kind === 'asset-filter') bad.binding.assetId = 'TSLA';
    if (kind === 'address-filter') bad.sender = bad.recipient = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
    expect((await t.recover([bad, t.own])).patches).toEqual([]);
  }
);
test('recovery preserves ambiguity and qualified claims across historical profiles without resending', async () => {
  const t = uncertainRecovery(),
    duplicate = { ...t.own, operationId: 'RH_TO_ONYX:0x' + '3'.repeat(64) };
  expect((await t.recover([t.own, duplicate])).patches).toEqual([]);
  expect((await t.recover([t.own], false, [operationClaim(t.own.binding, t.own.operationId, 46630)])).patches).toEqual(
    []
  );
  expect(
    (await t.recover([t.other, t.own], false, [operationClaim(t.other.binding, t.own.operationId, 46630)])).patches
  ).toHaveLength(2);
});
