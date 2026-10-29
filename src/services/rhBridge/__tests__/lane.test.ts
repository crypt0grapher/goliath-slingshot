import { RH_ABI_VERSION, RH_LANE } from '../../../config/rhBridge';
import deployment from '../../../config/rhBridge/deployment.json';
import { alignToManifest, atTime, loadFixture, manifestFeeQuote, manifestLimits } from '../__fixtures__';
import {
  approvalTarget,
  assertApproval,
  bindAssets,
  buildApproval,
  buildBridgeCall,
  computeExitFee,
  previewTransferAmounts,
  exitFeeCeiling,
  formatUnits,
  LANE_ABI,
  laneGate,
  parseUnits,
  validateAmount,
  validateFeeQuote,
  validateOnchainFee,
  validateRecipient,
} from '../lane';
import { laneTxUrl } from '../explorer';
import { parseAssets, parseEffectiveState, parseFeeQuote, parseHealth, parseLimits } from '../schema';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const HOLDER = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const OTHER = '0xaa91057c8f98af30c44bb8708399bf4daa188a81';
const LEGACY_BRIDGE_MINT = '0x2c1d218b5a97a26d144ffd12d5c813590f93ffeb';
const E18 = '000000000000000000';

const assets = () => parseAssets(alignToManifest(loadFixture('getAssets.200').response.body));
const limits = () => parseLimits(manifestLimits(NOW));
const health = () => parseHealth(atTime(loadFixture('getHealth.200.ok').response.body, NOW));
const state = (mutate: (s: any) => void = () => undefined) => {
  const body = atTime(loadFixture('getEffectiveState.200.open').response.body, NOW) as any;
  mutate(body);
  return parseEffectiveState(body);
};

describe('manifest binding', () => {
  test('compiled lane equals the task 008 manifest', () => {
    expect(RH_LANE).toEqual({
      rhChainId: 46630,
      onyxChainId: 8901,
      assetId: 'TSLA',
      symbol: 'TSLA',
      decimals: 18,
      token: '0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e',
      escrow: '0x4de29616f7be2bc44d9dff23abc5fcb5804df8b9',
      wrapper: '0x9ff95cc4e7189cba6d398fbdbf9aee1d84cb233d',
      minter: '0x3abf85db57b9052e20204543777c5165a2a47559',
    });
    expect(deployment.chains.robinhood.rpc).toBe('https://rpc.testnet.chain.robinhood.com');
    expect(deployment.chains.onyx.rpc).toBe('https://rpc.testnet.onyx.org');
  });

  test('manifest-aligned assets bind; the synthetic 005 fixture does not', () => {
    expect(bindAssets(assets(), RH_LANE).assetId).toBe('TSLA');
    expect(() => bindAssets(parseAssets(loadFixture('getAssets.200').response.body), RH_LANE)).toThrow(
      'RH_BINDING_TOKEN'
    );
  });

  test.each([
    ['contractVersion (schema const)', (a: any) => (a.contractVersion = '1.0.1'), 'RH_SCHEMA_ASSETS'],
    ['abiVersion', (a: any) => (a.abiVersion = 'rh-stock-bridge-abi-000000000000'), 'RH_BINDING_ABI_VERSION'],
    ['second asset', (a: any) => a.assets.push({ ...a.assets[0], assetId: 'AAPL' }), 'RH_BINDING_ASSET'],
    ['decimals', (a: any) => (a.assets[0].decimals = 8), 'RH_BINDING_DECIMALS'],
    ['rh chain', (a: any) => (a.assets[0].robinhood.chainId = 46631), 'RH_BINDING_CHAIN'],
    ['onyx mainnet', (a: any) => (a.assets[0].onyx.chainId = 327), 'RH_BINDING_CHAIN'],
    ['token', (a: any) => (a.assets[0].robinhood.token = '0x' + 'a'.repeat(40)), 'RH_BINDING_TOKEN'],
    ['escrow', (a: any) => (a.assets[0].robinhood.escrow = '0x' + 'a'.repeat(40)), 'RH_BINDING_ESCROW'],
    ['wrapper', (a: any) => (a.assets[0].onyx.wrapper = '0x' + 'a'.repeat(40)), 'RH_BINDING_WRAPPER'],
    ['minter = legacy BridgeMint', (a: any) => (a.assets[0].onyx.minter = LEGACY_BRIDGE_MINT), 'RH_BINDING_MINTER'],
  ])('binding rejects a changed %s', (_name, mutate, code) => {
    const body = JSON.parse(JSON.stringify(alignToManifest(loadFixture('getAssets.200').response.body)));
    mutate(body);
    expect(() => bindAssets(parseAssets(body), RH_LANE)).toThrow(code);
  });

  test('abiVersion is derived from the vendored ABI hashes', () => {
    expect(RH_ABI_VERSION).toBe(
      'rh-stock-bridge-abi-' + '12fc534194026fa1'.slice(0, 6) + '612bcf89eaadffd8'.slice(0, 6)
    );
  });
});

describe('live-action gate', () => {
  const open = (direction: 'RH_TO_ONYX' | 'ONYX_TO_RH', s = state(), h = health()) =>
    laneGate({ direction, lane: RH_LANE, nowMs: NOW, assets: assets(), limits: limits(), health: h, state: s });

  test('healthy, bound and open API opens both directions', () => {
    expect(open('RH_TO_ONYX')).toMatchObject({ open: true, reasons: [] });
    expect(open('ONYX_TO_RH')).toMatchObject({ open: true, reasons: [] });
  });

  test('API unreachable keeps every live action disabled', () => {
    expect(laneGate({ direction: 'RH_TO_ONYX', lane: RH_LANE, nowMs: NOW })).toMatchObject({
      open: false,
      reasons: ['API_UNAVAILABLE'],
    });
    expect(
      laneGate({
        direction: 'RH_TO_ONYX',
        lane: RH_LANE,
        nowMs: NOW,
        assets: assets(),
        health: health(),
        state: state(),
      }).reasons
    ).toEqual(['API_UNAVAILABLE']);
  });

  test('synthetic (unaligned) assets fail the binding', () => {
    const gate = laneGate({
      direction: 'RH_TO_ONYX',
      lane: RH_LANE,
      nowMs: NOW,
      limits: limits(),
      health: health(),
      state: state(),
      assets: parseAssets(loadFixture('getAssets.200').response.body),
    });
    expect(gate.reasons).toEqual(['BINDING_MISMATCH']);
  });

  test('degraded or down health holds', () => {
    const degraded = parseHealth(atTime(loadFixture('getHealth.200.degraded').response.body, NOW));
    const down = parseHealth(atTime(loadFixture('getHealth.503.down').response.body, NOW));
    expect(open('RH_TO_ONYX', state(), degraded).reasons).toContain('HEALTH_NOT_OK');
    expect(open('ONYX_TO_RH', state(), down).reasons).toContain('HEALTH_NOT_OK');
  });

  test('stale or future state holds', () => {
    const stale = parseEffectiveState(atTime(loadFixture('getEffectiveState.200.open').response.body, NOW - 121000));
    const future = parseEffectiveState(atTime(loadFixture('getEffectiveState.200.open').response.body, NOW + 61000));
    expect(open('RH_TO_ONYX', stale).reasons).toEqual(['STATE_STALE']);
    expect(open('RH_TO_ONYX', future).reasons).toEqual(['STATE_STALE']);
  });

  test('exits-held fixture (collector frozen) holds exits but not deposits', () => {
    const held = parseEffectiveState(atTime(loadFixture('getEffectiveState.200.exits-held').response.body, NOW));
    expect(open('RH_TO_ONYX', held).open).toBe(true);
    expect(open('ONYX_TO_RH', held).reasons).toEqual(['DIRECTION_HELD', 'DIRECTION_CLOSED', 'COLLECTOR_NOT_OPEN']);
  });

  test.each([
    ['lane hold', (s: any) => (s.held.lane = true), 'LANE_HELD'],
    ['deposit hold', (s: any) => (s.held.deposits = true), 'DIRECTION_HELD'],
    ['deposits closed', (s: any) => (s.depositsOpen = false), 'DIRECTION_CLOSED'],
    ['admission frozen', (s: any) => (s.admission = 'FROZEN'), 'ADMISSION_CLOSED'],
    ['admission closed', (s: any) => (s.admission = 'CLOSED'), 'ADMISSION_CLOSED'],
    ['escrow paused', (s: any) => (s.paused.escrow = true), 'PAUSED'],
    ['token paused', (s: any) => (s.paused.token = true), 'PAUSED'],
    ['pause unknown', (s: any) => (s.paused.minter = null), 'PAUSE_UNKNOWN'],
    ['issuer frozen', (s: any) => (s.issuer = 'FROZEN'), 'ISSUER_NOT_OPEN'],
    ['issuer unknown', (s: any) => (s.issuer = 'UNKNOWN'), 'ISSUER_NOT_OPEN'],
    ['upgrade pending', (s: any) => (s.upgradePending = true), 'UPGRADE_PENDING'],
    ['other asset', (s: any) => (s.assetId = 'AAPL'), 'WRONG_ASSET'],
  ])('deposit holds on %s', (_n, mutate, reason) => {
    expect(open('RH_TO_ONYX', state(mutate)).reasons).toContain(reason);
  });

  test('canary admission stays open for allowlisted canary traffic', () => {
    expect(
      open(
        'RH_TO_ONYX',
        state((s) => (s.admission = 'CANARY'))
      ).open
    ).toBe(true);
  });
});

describe('units, limits and fee', () => {
  test('parse and format exact 18-decimal units', () => {
    expect(parseUnits('0.012', 18)).toBe('12000000000000000');
    expect(parseUnits('1', 18)).toBe('1' + E18);
    expect(parseUnits('.5', 18)).toBe('500000000000000000');
    expect(parseUnits('0.000000000000000001', 18)).toBe('1');
    expect(() => parseUnits('0.0000000000000000001', 18)).toThrow('RH_TOO_MANY_DECIMALS');
    expect(() => parseUnits('1e18', 18)).toThrow('RH_INVALID_AMOUNT');
    expect(() => parseUnits('-1', 18)).toThrow('RH_INVALID_AMOUNT');
    expect(() => parseUnits('1,5', 18)).toThrow('RH_INVALID_AMOUNT');
    expect(formatUnits('12000000000000000', 18)).toBe('0.012');
    expect(formatUnits('700000000000000000', 18)).toBe('0.7');
    expect(formatUnits('0', 18)).toBe('0');
  });

  test('fee = max(minFee, ceil(gross*25/10000)) with the deployed parameters', () => {
    const minFee = '2800000000000000'; // 0.0028 TSLA
    expect(computeExitFee('12000000000000000', 25, minFee)).toBe(minFee); // 0.012 -> 0.00003 < minFee
    expect(computeExitFee('1120000000000000000', 25, minFee)).toBe('2800000000000000'); // exactly at the crossover
    expect(computeExitFee('700000000000000000', 25, minFee)).toBe(minFee); // 0.7 -> 0.00175 < 0.0028
    expect(computeExitFee('1000000000000000001', 25, '0')).toBe('2500000000000001'); // ceil, the 005 fixture
    expect(computeExitFee('4000', 25, '0')).toBe('10');
    expect(computeExitFee('4001', 25, '0')).toBe('11');
    expect(computeExitFee('1', 25, '0')).toBe('1');
    expect(previewTransferAmounts('RH_TO_ONYX', '1000000000000000000', undefined, undefined)).toEqual({
      feeRaw: '0',
      netRaw: '1000000000000000000',
    });
    expect(
      previewTransferAmounts('ONYX_TO_RH', '1000000000000000000', undefined, { feeBps: 25, minFee })
    ).toEqual({ feeRaw: minFee, netRaw: (1000000000000000000n - BigInt(minFee)).toString() });
    expect(computeExitFee('0', 25, '0')).toBe('0');
  });

  test('deposit and exit limits', () => {
    const l = limits();
    expect(() => validateAmount('ONYX_TO_RH', '11999999999999999', l)).toThrow('RH_AMOUNT_BELOW_MIN_EXIT');
    expect(() => validateAmount('ONYX_TO_RH', '12000000000000000', l)).not.toThrow();
    expect(() => validateAmount('ONYX_TO_RH', '700000000000000001', l)).toThrow('RH_AMOUNT_ABOVE_PER_TX_MAX');
    expect(() => validateAmount('RH_TO_ONYX', '700000000000000000', l)).not.toThrow();
    expect(() => validateAmount('RH_TO_ONYX', '700000000000000001', l)).toThrow('RH_AMOUNT_ABOVE_PER_TX_MAX');
    expect(() => validateAmount('RH_TO_ONYX', '0', l)).toThrow('RH_AMOUNT_ZERO');
  });

  test('fee quote must match gross, formula, maxFee, net and expiry', () => {
    const l = limits();
    const gross = '100000000000000000';
    const good = parseFeeQuote(manifestFeeQuote(gross, NOW));
    expect(() => validateFeeQuote(good, gross, l, RH_LANE, NOW)).not.toThrow();
    expect(good.suggestedMaxFee).toBe('2800000000000000');
    const bad = (o: Record<string, unknown>) => parseFeeQuote(manifestFeeQuote(gross, NOW, o));
    expect(() => validateFeeQuote(good, '100000000000000001', l, RH_LANE, NOW)).toThrow('RH_QUOTE_MISMATCH');
    expect(() =>
      validateFeeQuote(
        bad({ fee: '2799999999999999', suggestedMaxFee: '2799999999999999', net: '97200000000000001' }),
        gross,
        l,
        RH_LANE,
        NOW
      )
    ).toThrow('RH_QUOTE_FEE');
    expect(() => validateFeeQuote(bad({ suggestedMaxFee: '3000000000000000' }), gross, l, RH_LANE, NOW)).toThrow(
      'RH_QUOTE_MAX_FEE'
    );
    expect(() => validateFeeQuote(bad({ net: gross }), gross, l, RH_LANE, NOW)).toThrow('RH_QUOTE_NET');
    expect(() => validateFeeQuote(bad({ feeBps: 30 }), gross, l, RH_LANE, NOW)).toThrow('RH_QUOTE_PARAMETERS');
    expect(() => validateFeeQuote(good, gross, l, RH_LANE, NOW + 60000)).toThrow('RH_QUOTE_EXPIRED');
  });
});

describe('recipient validation', () => {
  test.each([
    ['', 'RH_RECIPIENT_INVALID'],
    ['0x123', 'RH_RECIPIENT_INVALID'],
    ['7dbe71b743e3e9f542324dd032d080e9fa1a243a', 'RH_RECIPIENT_INVALID'],
    ['0x0000000000000000000000000000000000000000', 'RH_RECIPIENT_ZERO_OR_LONG_ZERO'],
    ['0x0000000000000000000000000000000000001aed', 'RH_RECIPIENT_ZERO_OR_LONG_ZERO'], // long-zero 0.0.6893
    ['0x000000000000000000000000ffffffffffffffff', 'RH_RECIPIENT_ZERO_OR_LONG_ZERO'], // 2^64 - 1
    ['0x7DBE71B743E3E9F542324DD032D080E9FA1A243a', 'RH_RECIPIENT_CHECKSUM'],
    ['0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E', 'RH_RECIPIENT_IS_CONTRACT'], // TSLA
    ['0x4de29616f7be2bc44D9dfF23abc5Fcb5804DF8B9', 'RH_RECIPIENT_IS_CONTRACT'], // escrow
    ['0x9Ff95cC4E7189cBA6D398fBDbf9Aee1D84CB233d', 'RH_RECIPIENT_IS_CONTRACT'], // wrapper
    ['0x3ABf85db57b9052E20204543777c5165a2a47559', 'RH_RECIPIENT_IS_CONTRACT'], // minter
    [LEGACY_BRIDGE_MINT, 'RH_RECIPIENT_IS_CONTRACT'],
  ])('rejects %p', (value, code) => {
    expect(() => validateRecipient(value, RH_LANE)).toThrow(code);
  });

  test('accepts checksummed, lowercase and 2^64 boundary addresses', () => {
    expect(validateRecipient('0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A', RH_LANE)).toBe(HOLDER);
    expect(validateRecipient(' ' + OTHER + ' ', RH_LANE)).toBe(OTHER);
    expect(validateRecipient('0x0000000000000000000000010000000000000000', RH_LANE)).toBe(
      '0x0000000000000000000000010000000000000000'
    );
  });
});

describe('exact allowance, spender and calldata', () => {
  const gross = '123456789012345678';

  test('deposit: approve exactly gross TSLA to the escrow on 46630, then deposit(token, gross, recipient)', () => {
    const approve = buildApproval('RH_TO_ONYX', RH_LANE, gross);
    expect(approve).toMatchObject({
      kind: 'approve',
      chainId: 46630,
      to: RH_LANE.token,
      spender: RH_LANE.escrow,
      amount: gross,
    });
    const a = LANE_ABI.decodeFunctionData('approve', approve.data);
    expect(approve.data.slice(0, 10)).toBe('0x095ea7b3');
    expect(a[0].toLowerCase()).toBe(RH_LANE.escrow);
    expect(a[1].toString()).toBe(gross);

    const deposit = buildBridgeCall('RH_TO_ONYX', RH_LANE, { gross, recipient: HOLDER });
    expect(deposit).toMatchObject({ kind: 'deposit', chainId: 46630, to: RH_LANE.escrow });
    expect(deposit.data.slice(0, 10)).toBe(LANE_ABI.getSighash('deposit'));
    const d = LANE_ABI.decodeFunctionData('deposit', deposit.data);
    expect(d[0].toLowerCase()).toBe(RH_LANE.token);
    expect(d[1].toString()).toBe(gross);
    expect(d[2].toLowerCase()).toBe(HOLDER);
  });

  test('exit: approve wrapper GROSS to the MINTER on 8901, then burn(wrapper, gross, rhRecipient, maxFee)', () => {
    const approve = buildApproval('ONYX_TO_RH', RH_LANE, gross);
    expect(approve).toMatchObject({
      kind: 'approve',
      chainId: 8901,
      to: RH_LANE.wrapper,
      spender: RH_LANE.minter,
      amount: gross,
    });
    const a = LANE_ABI.decodeFunctionData('approve', approve.data);
    expect(a[0].toLowerCase()).toBe(RH_LANE.minter);
    expect(a[1].toString()).toBe(gross);

    const burn = buildBridgeCall('ONYX_TO_RH', RH_LANE, { gross, recipient: OTHER, maxFee: '2800000000000000' });
    expect(burn).toMatchObject({ kind: 'burn', chainId: 8901, to: RH_LANE.minter });
    expect(burn.data.slice(0, 10)).toBe(LANE_ABI.getSighash('burn'));
    const b = LANE_ABI.decodeFunctionData('burn', burn.data);
    expect(b[0].toLowerCase()).toBe(RH_LANE.wrapper);
    expect(b[1].toString()).toBe(gross);
    expect(b[2].toLowerCase()).toBe(OTHER);
    expect(b[3].toString()).toBe('2800000000000000');
    expect(() => buildBridgeCall('ONYX_TO_RH', RH_LANE, { gross, recipient: OTHER })).toThrow('RH_MAX_FEE_REQUIRED');
  });

  test.each([
    ['the wrapper as spender', { spender: RH_LANE.wrapper }],
    ['the legacy BridgeMint as spender', { spender: LEGACY_BRIDGE_MINT }],
    ['the escrow as an exit spender', { spender: RH_LANE.escrow }],
    ['an approval sent to the canonical token on 8901', { to: RH_LANE.token }],
    ['an approval on the wrong chain', { chainId: 46630 }],
  ])('exit approval guard rejects %s', (_n, change: Record<string, unknown>) => {
    const call = { ...buildApproval('ONYX_TO_RH', RH_LANE, gross), ...change } as any;
    if (change.spender) call.data = LANE_ABI.encodeFunctionData('approve', [change.spender, gross]);
    expect(() => assertApproval('ONYX_TO_RH', call, RH_LANE)).toThrow(/RH_APPROVAL_(TARGET|SPENDER)/);
  });

  test('approval guard rejects calldata that does not match the declared spender or amount', () => {
    const call = buildApproval('RH_TO_ONYX', RH_LANE, gross);
    const wrongData = { ...call, data: LANE_ABI.encodeFunctionData('approve', [RH_LANE.minter, gross]) };
    const wrongAmount = { ...call, data: LANE_ABI.encodeFunctionData('approve', [RH_LANE.escrow, '1' + gross]) };
    const unlimited = {
      ...call,
      data: LANE_ABI.encodeFunctionData('approve', [RH_LANE.escrow, '0x' + 'f'.repeat(64)]),
    };
    for (const bad of [wrongData, wrongAmount, unlimited])
      expect(() => assertApproval('RH_TO_ONYX', bad, RH_LANE)).toThrow('RH_APPROVAL_CALLDATA');
    expect(approvalTarget('RH_TO_ONYX', RH_LANE).spender).toBe(RH_LANE.escrow);
    expect(approvalTarget('ONYX_TO_RH', RH_LANE).spender).toBe(RH_LANE.minter);
  });

  test('bridge calls reject invalid recipients before encoding', () => {
    expect(() => buildBridgeCall('RH_TO_ONYX', RH_LANE, { gross, recipient: '0x' + '0'.repeat(40) })).toThrow(
      'RH_RECIPIENT_ZERO_OR_LONG_ZERO'
    );
    expect(() => buildBridgeCall('ONYX_TO_RH', RH_LANE, { gross, recipient: RH_LANE.token, maxFee: '1' })).toThrow(
      'RH_RECIPIENT_IS_CONTRACT'
    );
  });
});

describe('explorer links', () => {
  const hash = '0x' + 'ab'.repeat(32);
  test('RH and Onyx EVM hashes and Hedera ids', () => {
    expect(laneTxUrl(46630, hash)).toBe('https://explorer.testnet.chain.robinhood.com/tx/' + hash);
    expect(laneTxUrl(8901, hash)).toBe('https://testnet.explorer.goliath.net/tx/' + hash);
    expect(laneTxUrl(8901, '0.0.1083@1792692627.221703344')).toBe(
      'https://validators.testnet.onyx.org/testnet/transaction/0.0.1083@1792692627.221703344'
    );
    expect(laneTxUrl(8901, '1792692633.044636000')).toBe(
      'https://validators.testnet.onyx.org/testnet/transaction/1792692633.044636000'
    );
    expect(laneTxUrl(46630, '1792692633.044636000')).toBeNull();
    expect(laneTxUrl(327, hash)).toBeNull();
  });
});

describe('fix loop: freshness, exit pauses and the on-chain fee guard', () => {
  const gate = (direction: 'RH_TO_ONYX' | 'ONYX_TO_RH', over: { health?: any; limits?: any; state?: any } = {}) =>
    laneGate({
      direction,
      lane: RH_LANE,
      nowMs: NOW,
      assets: assets(),
      limits: over.limits ?? limits(),
      health: over.health ?? health(),
      state: over.state ?? state(),
    });

  test('stale or future limits and health hold, like effective-state', () => {
    const oldLimits = parseLimits(manifestLimits(NOW - 121000));
    const futureHealth = parseHealth(atTime(loadFixture('getHealth.200.ok').response.body, NOW + 61000));
    const oldHealth = parseHealth(atTime(loadFixture('getHealth.200.ok').response.body, NOW - 121000));
    expect(gate('RH_TO_ONYX', { limits: oldLimits }).reasons).toEqual(['LIMITS_STALE']);
    expect(gate('ONYX_TO_RH', { health: futureHealth }).reasons).toEqual(['HEALTH_STALE']);
    expect(gate('ONYX_TO_RH', { health: oldHealth }).reasons).toEqual(['HEALTH_STALE']);
  });

  test.each([
    ['minter', (s: any) => (s.paused.minter = true)],
    ['wrapper', (s: any) => (s.paused.wrapper = true)],
    ['escrow (releases)', (s: any) => (s.paused.escrow = true)],
  ])('a paused %s holds exits', (_name, mutate) => {
    expect(gate('ONYX_TO_RH', { state: state(mutate) })).toMatchObject({ open: false, reasons: ['PAUSED'] });
  });

  const gross = '100000000000000000';
  const quote = (o: Record<string, unknown> = {}) => parseFeeQuote(manifestFeeQuote(gross, NOW, o));
  const onchain = { fee: '2800000000000000', maxFeeBps: 100, maxMinFee: '28000000000000000' };
  const manifest = { maxFeeBps: 100, maxMinFee: '28000000000000000' };

  test('quote.fee must equal the minter feeFor(); maxFee must stay within both ceilings', () => {
    expect(exitFeeCeiling(gross, 100, '28000000000000000')).toBe('28000000000000000');
    expect(exitFeeCeiling('7000000000000000000', 100, '28000000000000000')).toBe('70000000000000000');
    expect(() => validateOnchainFee(quote(), gross, onchain, manifest)).not.toThrow();
    expect(() => validateOnchainFee(quote(), gross, { ...onchain, fee: '2700000000000000' }, manifest)).toThrow(
      'RH_ONCHAIN_FEE_MISMATCH'
    );
    expect(() => validateOnchainFee(quote(), '200000000000000000', onchain, manifest)).toThrow(
      'RH_ONCHAIN_FEE_MISMATCH'
    );
    expect(() => validateOnchainFee(quote(), gross, { ...onchain, maxFeeBps: 0, maxMinFee: '1000' }, manifest)).toThrow(
      'RH_MAX_FEE_ABOVE_CEILING'
    );
    expect(() => validateOnchainFee(quote(), gross, onchain, { maxFeeBps: 0, maxMinFee: '1000' })).toThrow(
      'RH_MAX_FEE_ABOVE_CEILING'
    );
  });
});
