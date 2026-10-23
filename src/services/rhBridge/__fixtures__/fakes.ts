// In-memory fakes for the RH lane tests: a chain reader that answers the lane's eth_calls,
// a scripted EIP-1193 wallet and a fixture-backed API transport. No network, no keys.
import { RH_LANE } from '../../../config/rhBridge';
import deployment from '../../../config/rhBridge/deployment.json';
import { ChainReader, Receipt } from '../chainReads';
import { createRhApiClient, RhApiClient } from '../httpApi';
import { computeExitFee, LANE_ABI } from '../lane';
import { jsonResponse, liveRoutes } from './index';

export interface FakeChainState {
  balances: Record<string, string>; // `${chainId}:${token}:${owner}`
  allowances: Record<string, string>; // `${chainId}:${token}:${owner}:${spender}`
  native: Record<string, string>; // `${chainId}:${owner}`
  restricted: Record<string, boolean>; // `${chainId}:${contract}`
  holders: Record<string, boolean>; // `${chainId}:${contract}:${holder}`
  receipts: Record<string, Receipt | null>; // `${chainId}:${hash}`
  txs: Record<string, { nonce: number; from: string }>; // `${chainId}:${hash}` (eth_getTransactionByHash)
  nonces: Record<string, number>; // `${chainId}:${account}` latest (and pending) nonce
  decimals: number;
  failCalls: boolean;
  // Minter registry entry and on-chain governance (task 008 manifest values by default).
  registry: {
    perTxMax: string;
    mint24hCap: string;
    outstandingCap: string;
    feeBps: string;
    minFee: string;
    minExit: string;
    maxMinFee: string;
  };
  maxFeeBps: string;
  feeOverride: string | null; // feeFor() answer override (a minter that disagrees with the API)
  mintUsage: string;
  outstanding: string;
  custodyCap: string;
  releaseCap: string;
  totalCustodied: string;
  releaseUsage: string;
}

export function fakeChains(initial: Partial<FakeChainState> = {}) {
  const e = deployment.minterEntry;
  const state: FakeChainState = {
    balances: {},
    allowances: {},
    native: {},
    restricted: {},
    holders: {},
    receipts: {},
    txs: {},
    nonces: {},
    decimals: 18,
    failCalls: false,
    registry: {
      perTxMax: e.perTxMax,
      mint24hCap: '2800000000000000000',
      outstandingCap: '5600000000000000000',
      feeBps: e.feeBps,
      minFee: e.minFee,
      minExit: e.minExit,
      maxMinFee: e.maxMinFee,
    },
    maxFeeBps: deployment.maxFeeBps,
    feeOverride: null,
    mintUsage: '0',
    outstanding: '1000000000000000000',
    custodyCap: '5600000000000000000',
    releaseCap: '2800000000000000000',
    totalCustodied: '0',
    releaseUsage: '0',
    ...initial,
  };
  const encode = (method: string, values: unknown[]) => LANE_ABI.encodeFunctionResult(method, values);
  const calls: { chainId: number; to: string; method: string }[] = [];
  const reader: ChainReader = {
    async call(chainId, to, data) {
      if (state.failCalls) throw new Error('RH_RPC_UNREACHABLE');
      const tx = LANE_ABI.parseTransaction({ data });
      const key = (...parts: unknown[]) => [chainId, to, ...parts].map((p) => String(p).toLowerCase()).join(':');
      calls.push({ chainId, to, method: tx.name });
      const r = state.registry;
      switch (tx.name) {
        case 'balanceOf':
          return encode('balanceOf', [state.balances[key(tx.args[0])] || '0']);
        case 'allowance':
          return encode('allowance', [state.allowances[key(tx.args[0], tx.args[1])] || '0']);
        case 'decimals':
          return encode('decimals', [String(state.decimals)]);
        case 'restrictedMode':
          return encode('restrictedMode', [state.restricted[key()] ?? true]);
        case 'allowedHolder':
          return encode('allowedHolder', [state.holders[key(tx.args[0])] ?? false]);
        case 'feeFor':
          return encode('feeFor', [
            state.feeOverride ?? computeExitFee(tx.args[1].toString(), Number(r.feeBps), r.minFee),
          ]);
        case 'MAX_FEE_BPS':
          return encode('MAX_FEE_BPS', [state.maxFeeBps]);
        case 'registry':
          return encode('registry', [
            [
              RH_LANE.wrapper,
              RH_LANE.token,
              true,
              r.perTxMax,
              r.mint24hCap,
              r.outstandingCap,
              r.feeBps,
              r.minFee,
              r.minExit,
              r.maxMinFee,
            ],
          ]);
        case 'mintUsage':
          return encode('mintUsage', [state.mintUsage]);
        case 'outstanding':
          return encode('outstanding', [state.outstanding]);
        case 'tokenConfig':
          return encode('tokenConfig', [
            true,
            true,
            deployment.escrowMapping.perTxMax,
            state.releaseCap,
            state.custodyCap,
          ]);
        case 'totalCustodied':
          return encode('totalCustodied', [state.totalCustodied]);
        case 'releaseUsage':
          return encode('releaseUsage', [state.releaseUsage]);
        default:
          throw new Error('unexpected call ' + tx.name);
      }
    },
    async getBalance(chainId, address) {
      if (state.failCalls) throw new Error('RH_RPC_UNREACHABLE');
      return state.native[`${chainId}:${address.toLowerCase()}`] ?? '0';
    },
    async getReceipt(chainId, hash) {
      return state.receipts[`${chainId}:${hash}`] ?? null;
    },
    async getTransaction(chainId, hash) {
      return state.txs[`${chainId}:${hash}`] ?? null;
    },
    async getTransactionCount(chainId, address) {
      return state.nonces[`${chainId}:${address.toLowerCase()}`] ?? 0;
    },
  };
  return { reader, state, calls };
}

// Funded, allowlisted holder on both chains (deployment holders).
export function fundedChains(account: string, opts: { tsla?: string; wrapped?: string; allowlisted?: boolean } = {}) {
  const a = account.toLowerCase();
  const allowed = opts.allowlisted ?? true;
  return fakeChains({
    balances: {
      [`46630:${RH_LANE.token}:${a}`]: opts.tsla ?? '2000000000000000000',
      [`8901:${RH_LANE.wrapper}:${a}`]: opts.wrapped ?? '500000000000000000',
    },
    native: { [`46630:${a}`]: '20000000000000000', [`8901:${a}`]: '100000000000000000000' },
    holders: {
      [`46630:${RH_LANE.escrow}:${a}`]: allowed,
      [`8901:${RH_LANE.minter}:${a}`]: allowed,
    },
  });
}

export type Route = { status: number; body: unknown };
export function fakeApi(routes: Record<string, Route>): {
  client: RhApiClient;
  requests: string[];
  routes: Record<string, Route>;
} {
  const requests: string[] = [];
  const client = createRhApiClient('https://bridgeapi.testnet.onyx.org', async (url: string) => {
    const path = url.replace('https://bridgeapi.testnet.onyx.org', '');
    requests.push(path);
    const route = routes[path] || routes[path.split('?')[0]];
    if (!route) throw new TypeError('Failed to fetch');
    return jsonResponse(url, route.status, route.body);
  });
  return { client, requests, routes };
}
export const liveApi = (nowMs: number, extra: Record<string, Route> = {}) =>
  fakeApi({ ...liveRoutes(nowMs), ...extra });

export interface WalletScript {
  chainId: number;
  accounts: string[];
  onSend?: (tx: Record<string, string>, call: number) => unknown;
  onSwitch?: (chainIdHex: string) => unknown;
}
// Scripted injected wallet; records every request and the RH history at send time.
export function fakeWallet(script: WalletScript, readHistoryAtSend?: () => unknown) {
  const requests: { method: string; params?: unknown[] }[] = [];
  const historyAtSend: unknown[] = [];
  let sends = 0;
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      requests.push({ method, params });
      if (method === 'eth_chainId') return '0x' + script.chainId.toString(16);
      if (method === 'eth_accounts') return script.accounts;
      if (method === 'wallet_switchEthereumChain') {
        const hex = (params as { chainId: string }[])[0].chainId;
        if (script.onSwitch) return script.onSwitch(hex);
        script.chainId = parseInt(hex, 16);
        return null;
      }
      if (method === 'eth_sendTransaction') {
        sends++;
        if (readHistoryAtSend) historyAtSend.push(readHistoryAtSend());
        const tx = (params as Record<string, string>[])[0];
        if (script.onSend) return script.onSend(tx, sends);
        return '0x' + sends.toString(16).padStart(64, '0');
      }
      throw Object.assign(new Error('unsupported'), { code: 4200 });
    },
  };
  return { provider, requests, historyAtSend, script, sends: () => sends };
}
