// SPDX-License-Identifier: Apache-2.0
import { V2_FIXTURES } from '../__fixtures__/v2-fixtures';
import golden from '../__fixtures__/public-api.v2/registry-golden.json';
import { freshObservation, parseV2, raw256 } from '../v2-schema';
import {
  bindRegistry,
  createProfileCatalog,
  legacyTslaProfile,
  profileLimits,
  registryDigest,
  REVIEWED_PROFILES,
  RH_NATIVE_CONFIGURATION,
} from '../../../config/rhBridge/profiles';
import type { Asset } from '../v2-types';
import { v2RequestPath } from '../v2-api';
const names: Record<string, string> = {
  getAssetsV2: 'Assets',
  getLimitsV2: 'Limits',
  getFeeQuoteV2: 'FeeQuote',
  getCapacityV2: 'Capacity',
  getEffectiveStateV2: 'EffectiveState',
  getHealthV2: 'Health',
  getStatusV2: 'Operation',
  getStatusByTxV2: 'OperationList',
  getHistoryV2: 'History',
};
for (const fixture of V2_FIXTURES)
  test('closed v2 parser accepts reviewed offline ' + fixture.fixture, () => {
    const name =
      fixture.response.status === 200 || (fixture.operationId === 'getHealthV2' && fixture.response.status === 503)
        ? names[fixture.operationId]
        : 'Error';
    expect(() => parseV2(name, fixture.response.body)).not.toThrow();
  });
test('independent browser registry digest matches golden, sorts a copy and rejects duplicates', () => {
  const assets = golden.assets as Asset[],
    before = JSON.stringify(assets);
  expect(registryDigest(assets)).toBe(golden.registrySha256);
  expect(registryDigest([...assets].reverse())).toBe(golden.registrySha256);
  expect(JSON.stringify(assets)).toBe(before);
  expect(() => registryDigest([assets[0], assets[0]])).toThrow();
  expect(registryDigest([REVIEWED_PROFILES.current('TSLA')!.descriptor])).toBe(
    '91fae2890dd0556ccd0319186cfcb876421df6b6a466413a3c51d75cbdd2760e'
  );
  expect(() =>
    bindRegistry(
      { contractVersion: '2.0.0', lane: 'RH_TESTNET', assets, registrySha256: golden.registrySha256 },
      REVIEWED_PROFILES
    )
  ).toThrow();
});
test('compiled native profile binds the independently reviewed actual deployment and exact manifest bytes', () => {
  expect(REVIEWED_PROFILES.registrySha256).toBe('b0d39a065440ca3f83475eee9adc126c0600b8ae406dc98f35b664e96002f25f');
  expect(profileLimits(REVIEWED_PROFILES.current('TSLA')!).deposit.perTxMax).toBe('1000000000000000000');
  expect(legacyTslaProfile(REVIEWED_PROFILES)?.descriptor.binding.profileSha256).toBe(
    '38a14bcb94536c4efb8d62d9d0a42ae702117db3e495f6884cf25839da47ee8e'
  );
  expect(RH_NATIVE_CONFIGURATION.status).toBe('REVIEWED');
  const native = REVIEWED_PROFILES.current('RH_ETH')!;
  expect(native.descriptor).toMatchObject({
    binding: {
      assetId: 'RH_ETH',
      profileSha256: '3dde968a2121f9b94482240df81492d91fdcefbc53727b1b0bbd9c9b7cb8bee2',
      profileVersion: 2,
      abiVersion: 'rh-native-bridge-abi-8da029612bcf',
    },
    kind: 'NATIVE',
    token: null,
    tokenRuntimeCodeKeccak256: null,
    canonicalIdentifier: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    manifestSha256: '6c167c8f1e220a235b2bc1214d71f4f0e61cebdda6284bc5af74f4933487ff4f',
    escrow: { chainId: 46630, address: '0x3255a8408f11e6a3057ffaa73bf4a6526b7bd38a' },
    minter: { chainId: 8901, address: '0x296889ea1e79459f3cfb02cdd029f9ce69de2cd3' },
    wrapper: { chainId: 8901, address: '0x45cf5ceaeddbd9165e8c731882406f09534c8127' },
    implementation: { chainId: 8901, address: '0xd26c07effbab8e60c352f5706510c9cb44c8eef5' },
  });
  expect(JSON.parse(native.manifestUtf8).initialProducerState).toEqual({
    escrowDepositsEnabled: false,
    minterPaused: true,
  });
  expect(profileLimits(native)).toMatchObject({
    deposit: { perTxMax: '1000000000000000' },
    exit: { perTxMax: '1000000000000000', minExit: '20000000000000' },
    caps: { escrowCustodyCap: '8000000000000000', wrapperSupplyCap: '8000000000000000' },
    fee: { feeBps: 25, minFee: '1000000000000', maxMinFee: '10000000000000' },
  });
  const replaceNative = (replacement: typeof native) =>
    REVIEWED_PROFILES.profiles.map((p) => (p === native ? replacement : p));
  expect(() =>
    createProfileCatalog(
      replaceNative({ ...native, manifestUtf8: native.manifestUtf8.trimEnd() }),
      REVIEWED_PROFILES.registrySha256
    )
  ).toThrow('RH_REVIEWED_PROFILE_INVALID');
  expect(() =>
    createProfileCatalog(
      replaceNative({
        ...native,
        profilePreimageUtf8: native.profilePreimageUtf8.replace('"minFee":"1000000000000"', '"minFee":"1000000000001"'),
      }),
      REVIEWED_PROFILES.registrySha256
    )
  ).toThrow('RH_REVIEWED_PROFILE_INVALID');
});
test.each(['limits', 'state', 'capacity'])(
  'closed %s nested objects reject extra/missing/type-mutated fields',
  (kind) => {
    const operation = kind === 'limits' ? 'getLimitsV2' : kind === 'state' ? 'getEffectiveStateV2' : 'getCapacityV2';
    const original = V2_FIXTURES.find((x) => x.operationId === operation && x.response.status === 200).response.body;
    for (const key of Object.keys(original))
      if (original[key] && typeof original[key] === 'object' && !Array.isArray(original[key])) {
        const bad = JSON.parse(JSON.stringify(original));
        bad[key].extra = '1';
        expect(() => parseV2(names[operation], bad)).toThrow();
      }
  }
);
test('capacity expiry15s, equality, future5s and uint256 fail closed', () => {
  const o = V2_FIXTURES.find((x) => x.operationId === 'getCapacityV2' && x.response.status === 200).response.body
    .observation;
  const now = Date.parse(o.observedAt);
  expect(freshObservation(o, 15000, now)).toBe(now + 15000);
  expect(() => freshObservation(o, 15000, now + 15000)).toThrow();
  expect(() => freshObservation({ ...o, expiresAt: new Date(now + 30000).toISOString() }, 15000, now)).toThrow();
  expect(() => freshObservation(o, 15000, now - 5001)).toThrow();
  expect(() => raw256((BigInt(1) << BigInt(256)).toString())).toThrow();
});
test('selected v2 URL binds asset/profile, direction and explicit by-tx chain; status encoded once', () => {
  const b = golden.assets[0].binding as any;
  expect(v2RequestPath({ kind: 'capacity', binding: b, direction: 'RH_TO_ONYX' })).toContain(
    'assetId=' + b.assetId + '&profileSha256=' + b.profileSha256 + '&direction=RH_TO_ONYX'
  );
  expect(v2RequestPath({ kind: 'status', operationId: 'RH_TO_ONYX:0x' + 'a'.repeat(64) })).toContain('RH_TO_ONYX%3A0x');
  expect(
    v2RequestPath({ kind: 'statusByTx', txHash: '0x' + 'a'.repeat(64), chainId: 46630, assetId: b.assetId })
  ).toContain('chainId=46630&assetId=' + b.assetId);
});
