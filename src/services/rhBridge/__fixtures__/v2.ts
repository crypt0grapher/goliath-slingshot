// SPDX-License-Identifier: Apache-2.0
// OFFLINE TEST DEPENDENCIES ONLY. Fake bytecodes/pins never enter the production catalog.
import { keccak256, sha256, toUtf8Bytes } from 'ethers/lib/utils';
import assetsFixture from './public-api.v2/getAssetsV2.200.json';
import limitsFixture from './public-api.v2/getLimitsV2.200.json';
import capacityFixture from './public-api.v2/getCapacityV2.200.json';
import tslaCapacityFixture from './public-api.v2/getCapacityV2.200.tsla.json';
import stateFixture from './public-api.v2/getEffectiveStateV2.200.json';
import healthFixture from './public-api.v2/getHealthV2.200.json';
import golden from './public-api.v2/registry-golden.json';
import reviewed from '../../../config/rhBridge/reviewed-profiles.json';
import { createProfileCatalog, registryDigest } from '../../../config/rhBridge/profiles';
import type { Asset, FeeQuote } from '../v2-types';
import type { ControllerDeps } from '../../../hooks/rhBridge/controller';
import type { ChainReader } from '../chainReads';
import { createV2ApiClient } from '../v2-api';
import { LANE_ABI } from '../lane';
import { RH_LANE } from '../../../config/rhBridge';
import { jsonResponse } from './index';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const GENESIS: Record<number, string> = {
  46630: '0x829a42e6d68c872aafcef3abb2123fe371138fc415dd8b44381bbbf23049dd32',
  8901: '0xdc7a820f4bc825abbfec84107c41d2f84ea9aea2e4af78af511f05e20eb18e32',
};
export function v2Fixture() {
  const code: Record<string, string> = {},
    assets = clone(assetsFixture.response.body.assets) as { -readonly [K in keyof Asset]: Asset[K] }[];
  const profiles = assets.map((a) => {
    for (const [index, key] of (['escrow', 'minter', 'wrapper', 'implementation'] as const).entries()) {
      code[a[key].address] = '0x600' + index + '600' + index;
      a[key] = { ...a[key], runtimeCodeKeccak256: keccak256(code[a[key].address]) };
    }
    if (a.token) {
      code[a.token] = '0x60046004';
      a.tokenRuntimeCodeKeccak256 = keccak256(code[a.token]);
    }
    a.name = 'OFFLINE TEST ' + a.symbol;
    let payload: any, profilePreimageUtf8: string;
    const canonical = (v: any): any =>
      Array.isArray(v)
        ? v.map(canonical)
        : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])])
          )
        : v;
    if (a.kind === 'NATIVE') {
      payload = JSON.parse(golden.manifestUtf8).payload;
      for (const key of ['escrow', 'minter', 'wrapper', 'implementation'] as const)
        payload.contracts.codeHashes[key] = a[key].runtimeCodeKeccak256;
      profilePreimageUtf8 = 'RH_LEDGER_ASSET_PROFILE_V2\n' + JSON.stringify(canonical(payload));
      a.binding = { ...a.binding, profileSha256: sha256(toUtf8Bytes(profilePreimageUtf8)).slice(2) };
    } else {
      const historical =
        (reviewed as { historical?: { profilePreimageUtf8: string; descriptor: { binding: { profileSha256: string } } }[] })
          .historical ?? [];
      const match = historical.find((p) => p.descriptor.binding.profileSha256 === a.binding.profileSha256);
      profilePreimageUtf8 = (match ?? reviewed.profiles[0]).profilePreimageUtf8;
      payload = JSON.parse(profilePreimageUtf8.slice(profilePreimageUtf8.indexOf('\n') + 1));
    }
    const manifestUtf8 = JSON.stringify({
      classification: 'SYNTHETIC_TEST_ONLY',
      payload,
      wrapper: { supplyCap: '5600000000000000000' },
    });
    a.manifestSha256 = sha256(toUtf8Bytes(manifestUtf8)).slice(2);
    return { descriptor: a, manifestUtf8, profilePreimageUtf8 };
  });
  const catalog = createProfileCatalog(profiles, registryDigest(assets));
  const state = {
    now: Date.now(),
    account: ACCOUNT,
    chainId: 46630,
    nativeBalance: '1000000000000000',
    allowance: '0',
    gasUnknown: false,
    held: false,
    badRegistry: false,
    badParameters: false,
    nonce: undefined as Promise<number> | undefined,
    walletResult: undefined as Promise<string> | undefined,
    sends: [] as any[],
    calls: [] as { chainId: number; to: string; method: string }[],
    requests: [] as string[],
  };
  const observation = () => ({
    observedAt: new Date(state.now).toISOString(),
    expiresAt: new Date(state.now + 15000).toISOString(),
    freshness: 'FRESH' as const,
    robinhood: {
      chainId: 46630 as const,
      number: '1000',
      hash: '0x' + 'a'.repeat(64),
      timestamp: new Date(state.now - 1000).toISOString(),
    },
    onyx: {
      chainId: 8901 as const,
      number: '2000',
      hash: '0x' + 'b'.repeat(64),
      timestamp: new Date(state.now - 1000).toISOString(),
    },
    ledgerObservedAt: new Date(state.now).toISOString(),
  });
  function limits(a: Asset) {
    const dto = clone(limitsFixture.response.body);
    dto.binding = a.binding as typeof dto.binding;
    dto.observation = observation();
    if (a.binding.assetId === 'TSLA') {
      dto.deposit.perTxMax = dto.exit.perTxMax = '700000000000000000';
      dto.exit.minExit = dto.fee.minExit = '12000000000000000';
      dto.fee.minFee = '2800000000000000';
      dto.fee.maxMinFee = '28000000000000000';
      dto.caps = {
        escrowReleaseCap: '2800000000000000000',
        escrowCustodyCap: '5600000000000000000',
        mint24hCap: '2800000000000000000',
        outstandingCap: '5600000000000000000',
        wrapperSupplyCap: '5600000000000000000',
      };
    }
    if (state.badParameters) dto.fee.feeBps = 26;
    return dto;
  }
  const transport = jest.fn(async (url: any) => {
    const u = new URL(String(url));
    state.requests.push(u.pathname + u.search);
    const name = u.pathname.slice('/api/v1/rh/v2/'.length),
      asset = catalog.current(u.searchParams.get('assetId') ?? 'TSLA')?.descriptor;
    let body: any;
    if (name === 'assets')
      body = {
        contractVersion: '2.0.0',
        lane: 'RH_TESTNET',
        registrySha256: state.badRegistry ? '0'.repeat(64) : catalog.registrySha256,
        assets,
      };
    else if (name === 'health') {
      body = clone(healthFixture.response.body);
      body.observedAt = new Date(state.now).toISOString();
      body.status = 'ok';
      for (const k of Object.keys(body.components)) body.components[k] = 'ok';
      body.assets = assets.map((a) => ({ binding: a.binding, status: 'ok', consumersReady: true }));
    } else if (!asset || u.searchParams.get('profileSha256') !== asset.binding.profileSha256)
      throw new Error('Fixture request omitted selected profile');
    else if (name === 'limits') body = limits(asset);
    else if (name === 'capacity') {
      body = clone(
        asset.binding.assetId === 'TSLA' ? tslaCapacityFixture.response.body : capacityFixture.response.body
      );
      body.binding = asset.binding;
      body.direction = u.searchParams.get('direction');
      body.observation = observation();
      body.admissionAllowsNewSource = !state.held;
    } else if (name === 'effective-state') {
      body = clone(stateFixture.response.body);
      body.binding = asset.binding;
      body.observation = observation();
      body.readiness = {
        globalAdmission: 'OPEN',
        assetAdmission: 'CANARY',
        effectiveAdmission: 'CANARY',
        globalHeld: state.held,
        assetHeld: false,
        depositsHeld: false,
        exitsHeld: false,
        depositGateOpen: true,
        parametersMatchProfile: true,
        manifestVerified: true,
        consumersReady: true,
        sourceAndDestinationHealthy: true,
      };
      body.depositsOpen = body.exitsOpen = !state.held;
      body.paused = { escrow: false, minter: false, wrapper: false, token: asset.kind === 'NATIVE' ? null : false };
      body.issuer = asset.kind === 'NATIVE' ? 'NOT_APPLICABLE' : 'OPEN';
      body.eligibility = {
        sender: u.searchParams.get('sender'),
        recipient: u.searchParams.get('recipient'),
        status: u.searchParams.has('sender') && u.searchParams.has('recipient') ? 'ALLOWED' : 'NOT_CHECKED',
      };
      body.reasonCodes = [];
    } else if (name === 'fee-quote') {
      const l = limits(asset),
        gross = u.searchParams.get('gross')!,
        direction = u.searchParams.get('direction')!,
        computed = (BigInt(gross) * BigInt(l.fee.feeBps) + BigInt(9999)) / BigInt(10000),
        minimum = BigInt(l.fee.minFee),
        fee = direction === 'RH_TO_ONYX' ? BigInt(0) : computed > minimum ? computed : minimum;
      body = {
        binding: asset.binding,
        direction,
        gross,
        fee: fee.toString(),
        net: (BigInt(gross) - fee).toString(),
        suggestedMaxFee: fee.toString(),
        feeBps: direction === 'RH_TO_ONYX' ? 0 : l.fee.feeBps,
        minFee: direction === 'RH_TO_ONYX' ? '0' : l.fee.minFee,
        observation: observation(),
        quotedAt: new Date(state.now).toISOString(),
        expiresAt: new Date(state.now + 15000).toISOString(),
      } as FeeQuote;
    } else throw new Error('Unexpected fixture route ' + name);
    return jsonResponse(String(url), 200, body);
  });
  const chains: ChainReader = {
    call: jest.fn(async (chainId, to, data) => {
      const tx = LANE_ABI.parseTransaction({ data });
      state.calls.push({ chainId, to, method: tx.name });
      const a = assets.find((a) => a.wrapper.address === to || a.token === to || a.minter.address === to)!;
      const l = limits(a);
      if (tx.name === 'balanceOf') return LANE_ABI.encodeFunctionResult(tx.name, ['1000000000000000000']);
      if (tx.name === 'allowance') return LANE_ABI.encodeFunctionResult(tx.name, [state.allowance]);
      if (tx.name === 'decimals') return LANE_ABI.encodeFunctionResult(tx.name, [18]);
      if (tx.name === 'MAX_FEE_BPS') return LANE_ABI.encodeFunctionResult(tx.name, [l.fee.maxFeeBps]);
      if (tx.name === 'registry')
        return LANE_ABI.encodeFunctionResult(tx.name, [
          [
            a.wrapper.address,
            a.canonicalIdentifier,
            true,
            l.exit.perTxMax,
            '8000000000000000000',
            '8000000000000000000',
            l.fee.feeBps,
            l.fee.minFee,
            l.fee.minExit,
            l.fee.maxMinFee,
          ],
        ]);
      if (tx.name === 'feeFor') {
        const g = BigInt(tx.args[1].toString()),
          f = (g * BigInt(l.fee.feeBps) + BigInt(9999)) / BigInt(10000),
          m = BigInt(l.fee.minFee);
        return LANE_ABI.encodeFunctionResult(tx.name, [(f > m ? f : m).toString()]);
      }
      throw new Error('Unexpected fixture eth_call ' + tx.name);
    }),
    getBalance: jest.fn(async (chainId) => (chainId === 46630 ? state.nativeBalance : '1000000000000000000')),
    getReceipt: async () => null,
    getTransaction: async () => null,
    getTransactionCount: jest.fn(async () => state.nonce ?? 0),
    getCode: async (_chainId, address) => code[address] ?? '0x',
    getChainId: async (id) => id,
    genesisHash: async (id) => GENESIS[id],
    gasPrice: async () => {
      if (state.gasUnknown) throw new Error('Unavailable gas');
      return '1000000000';
    },
    estimateGas: async () => {
      if (state.gasUnknown) throw new Error('Unavailable gas');
      return '21000';
    },
  };
  const provider = {
    request: jest.fn(async ({ method, params }: any) => {
      if (method === 'eth_accounts') return [state.account];
      if (method === 'eth_chainId') return '0x' + state.chainId.toString(16);
      if (method === 'eth_sendTransaction') {
        state.sends.push(params[0]);
        return state.walletResult ?? '0x' + 'd'.repeat(64);
      }
      if (method === 'wallet_switchEthereumChain') {
        state.chainId = Number(params[0].chainId);
        return undefined;
      }
      throw new Error('Unexpected fixture wallet ' + method);
    }),
  };
  const storageData = new Map<string, string>(),
    storage = {
      getItem: (key: string) => storageData.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageData.set(key, value);
      },
    };
  const deps: ControllerDeps = {
    api: null,
    chains,
    storage,
    lane: RH_LANE,
    now: () => state.now,
    randomHex: () => String(storageData.size + state.sends.length).padStart(8, '0'),
    v2: { api: createV2ApiClient('https://bridgeapi.testnet.onyx.org', transport as any), catalog },
  };
  return { state, assets, catalog, chains, provider, storage, storageData, deps, transport };
}
export const TEST_ACCOUNT = ACCOUNT;
