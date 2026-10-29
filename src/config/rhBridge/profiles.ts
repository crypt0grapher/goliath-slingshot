// SPDX-License-Identifier: Apache-2.0
import { sha256, toUtf8Bytes } from 'ethers/lib/utils';
import reviewed from './reviewed-profiles.json';
import type { Asset, Assets, Binding } from '../../services/rhBridge/v2-types';
import { parseV2, sameBinding } from '../../services/rhBridge/v2-schema';
import type { LaneBinding } from './index';
export interface ReviewedProfile {
  readonly descriptor: Asset;
  readonly manifestUtf8: string;
  readonly profilePreimageUtf8: string;
}
export interface ProfileCatalog {
  readonly registrySha256: string;
  readonly profiles: readonly ReviewedProfile[];
  readonly known: readonly ReviewedProfile[];
  current(assetId: string): ReviewedProfile | null;
  recorded(binding: Binding): ReviewedProfile | null;
}
const digest = (s: string) => sha256(toUtf8Bytes(s)).slice(2);
function canonical(v: any): any {
  return Array.isArray(v)
    ? v.map(canonical)
    : v !== null && typeof v === 'object'
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, canonical(v[k])])
      )
    : v;
}
export function registryDigest(assets: readonly Asset[]): string {
  const ids = new Set<string>();
  for (const asset of assets) {
    parseV2<Asset>('Asset', asset);
    if (ids.has(asset.binding.assetId)) throw new Error('RH_REGISTRY_DUPLICATE');
    ids.add(asset.binding.assetId);
  }
  const sorted = [...assets].sort((a, b) =>
    a.binding.assetId < b.binding.assetId
      ? -1
      : a.binding.assetId > b.binding.assetId
      ? 1
      : a.binding.profileSha256 < b.binding.profileSha256
      ? -1
      : 1
  );
  return digest(
    'RH_PUBLIC_ASSET_REGISTRY_V2\n' +
      JSON.stringify(canonical({ contractVersion: '2.0.0', lane: 'RH_TESTNET', assets: sorted }))
  );
}
export function createProfileCatalog(
  profiles: readonly ReviewedProfile[],
  expected: string,
  historical: readonly ReviewedProfile[] = []
): ProfileCatalog {
  const descriptors = profiles.map((p) => p.descriptor);
  const known = [...profiles, ...historical];
  if (
    registryDigest(descriptors) !== expected ||
    known.some(
      (p) =>
        digest(p.manifestUtf8) !== p.descriptor.manifestSha256 ||
        digest(p.profilePreimageUtf8) !== p.descriptor.binding.profileSha256
    )
  )
    throw new Error('RH_REVIEWED_PROFILE_INVALID');
  for (const p of known) {
    parseV2('Asset', p.descriptor);
    const a = p.descriptor,
      domain = a.binding.profileVersion === 1 ? 'RH_LEDGER_CANDIDATE_V1\n' : 'RH_LEDGER_ASSET_PROFILE_V2\n';
    if (!p.profilePreimageUtf8.startsWith(domain)) throw new Error('RH_PROFILE_DOMAIN');
    const payload = JSON.parse(p.profilePreimageUtf8.slice(domain.length));
    const targets = [a.escrow.address, a.minter.address, a.wrapper.address, a.implementation.address];
    if (
      new Set(targets).size !== 4 ||
      targets.some(
        (address) =>
          address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || BigInt(address) < BigInt(1) << BigInt(64)
      ) ||
      a.escrow.chainId !== 46630 ||
      [a.minter, a.wrapper, a.implementation].some((c) => c.chainId !== 8901)
    )
      throw new Error('RH_PROFILE_TARGET');
    if (a.kind === 'NATIVE') {
      parseV2('NativeProfilePayload', payload);
      if (
        JSON.stringify(canonical(payload)) !== p.profilePreimageUtf8.slice(domain.length) ||
        payload.asset.internalId !== a.binding.assetId ||
        payload.asset.displaySymbol !== a.symbol ||
        payload.asset.wrapperSymbol !== a.wrapperSymbol ||
        payload.abiVersion !== a.binding.abiVersion
      )
        throw new Error('RH_PROFILE_PAYLOAD');
      for (const key of ['escrow', 'minter', 'wrapper', 'implementation'] as const) {
        const c = payload.contracts[key];
        if (
          c.chainId !== a[key].chainId ||
          c.address !== a[key].address ||
          c.deployBlock !== a[key].deploymentBlock ||
          c.deployTx !== a[key].deploymentTx ||
          c.onyxContractId !== a[key].onyxContractId ||
          payload.contracts.codeHashes[key] !== a[key].runtimeCodeKeccak256
        )
          throw new Error('RH_PROFILE_CONTRACT');
      }
    } else if (
      a.binding.profileVersion !== 1 ||
      a.binding.assetId !== 'TSLA' ||
      payload.asset.internalId !== a.binding.assetId ||
      payload.rh.token !== a.token ||
      payload.rh.escrow !== a.escrow.address ||
      payload.onyx.minter !== a.minter.address ||
      payload.onyx.wrapper !== a.wrapper.address
    )
      throw new Error('RH_PROFILE_CONTRACT');
  }
  return Object.freeze({
    registrySha256: expected,
    profiles: Object.freeze([...profiles]),
    known: Object.freeze(known),
    current: (id: string) => profiles.find((p) => p.descriptor.binding.assetId === id) ?? null,
    recorded: (b: Binding) => known.find((p) => sameBinding(p.descriptor.binding, b)) ?? null,
  });
}
export function profileLimits(profile: ReviewedProfile) {
  const p = JSON.parse(profile.profilePreimageUtf8.slice(profile.profilePreimageUtf8.indexOf('\n') + 1)),
    m = JSON.parse(profile.manifestUtf8),
    l = p.limits;
  return {
    deposit: {
      perTxMax: BigInt(l.escrow.perTxMax) < BigInt(l.minter.perTxMax) ? l.escrow.perTxMax : l.minter.perTxMax,
      minAmount: '1',
    },
    exit: {
      perTxMax: BigInt(l.escrow.perTxMax) < BigInt(l.minter.perTxMax) ? l.escrow.perTxMax : l.minter.perTxMax,
      minExit: l.fees.minExit,
    },
    caps: {
      escrowReleaseCap: l.escrow.releaseCap,
      escrowCustodyCap: l.escrow.custodyCap,
      mint24hCap: l.minter.mint24hCap,
      outstandingCap: l.minter.outstandingCap,
      wrapperSupplyCap: l.wrapper?.supplyCap ?? m.wrapper.supplyCap,
    },
    fee: {
      feeBps: Number(l.fees.feeBps),
      minFee: l.fees.minFee,
      minExit: l.fees.minExit,
      maxFeeBps: Number(l.fees.maxFeeBps),
      maxMinFee: l.fees.maxMinFee,
    },
  };
}
export const REVIEWED_PROFILES = createProfileCatalog(
  reviewed.profiles as ReviewedProfile[],
  reviewed.registrySha256,
  (reviewed as { historical?: ReviewedProfile[] }).historical ?? []
);
export const legacyTslaProfile = (catalog: ProfileCatalog) =>
  catalog.recorded({
    assetId: 'TSLA',
    profileSha256: '38a14bcb94536c4efb8d62d9d0a42ae702117db3e495f6884cf25839da47ee8e',
    profileVersion: 1,
    abiVersion: 'rh-stock-bridge-abi-12fc53612bcf',
  });
// Absence is intentional. A display symbol/sentinel cannot create a transaction target.
export const RH_NATIVE_CONFIGURATION = Object.freeze({
  assetId: 'RH_ETH',
  status: REVIEWED_PROFILES.current('RH_ETH') ? 'REVIEWED' : 'UNCONFIGURED',
  descriptor: REVIEWED_PROFILES.current('RH_ETH')?.descriptor ?? null,
});
export function bindRegistry(value: unknown, catalog: ProfileCatalog): Assets {
  const result = parseV2<Assets>('Assets', value);
  if (
    result.registrySha256 !== catalog.registrySha256 ||
    registryDigest(result.assets) !== catalog.registrySha256 ||
    result.assets.length !== catalog.profiles.length
  )
    throw new Error('RH_REGISTRY_MISMATCH');
  for (const asset of result.assets) {
    const pin = catalog.recorded(asset.binding);
    if (!pin || JSON.stringify(canonical(asset)) !== JSON.stringify(canonical(pin.descriptor)))
      throw new Error('RH_PROFILE_MISMATCH');
  }
  return result;
}
export function profileLane(profile: ReviewedProfile): LaneBinding {
  const a = profile.descriptor;
  return Object.freeze({
    rhChainId: 46630,
    onyxChainId: 8901,
    assetId: a.binding.assetId,
    symbol: a.symbol,
    decimals: a.decimals,
    token: a.canonicalIdentifier,
    escrow: a.escrow.address,
    minter: a.minter.address,
    wrapper: a.wrapper.address,
    kind: a.kind,
    binding: a.binding,
  });
}
