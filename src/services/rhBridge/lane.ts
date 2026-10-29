// Pure decision logic for the RH TSLA lane: units, binding to the deployment manifest,
// the live-action gate, amount/recipient validation, the exit fee and exact calldata.
// Nothing here talks to a wallet, an RPC or the network.
import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import {
  LaneBinding,
  RH_ABI_VERSION,
  RH_API_CONTRACT_VERSION,
  RH_CLOCK_SKEW_MS,
  RH_FORBIDDEN_SPENDERS,
  RH_STATE_MAX_AGE_MS,
} from '../../config/rhBridge';
import { chainPair, LaneChainId, RhDirection } from '../../constants/rhBridge';
import { Asset, Assets, EffectiveState, FeeQuote, Health, Limits } from './schema';

const fail = (code: string): never => {
  throw new Error('RH_' + code);
};
const RAW = /^(0|[1-9][0-9]{0,77})$/;
const MAX_UINT256 = BigInt('0x' + 'f'.repeat(64));
const TWO_POW_64 = BigInt('18446744073709551616');

// ------------------------------------------------------------------ units

export function parseUnits(value: string, decimals: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return fail('INVALID_DECIMALS');
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(trimmed) && !/^\.[0-9]+$/.test(trimmed)) return fail('INVALID_AMOUNT');
  if (trimmed.length > 100) return fail('INVALID_AMOUNT');
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return fail('TOO_MANY_DECIMALS');
  const scaled =
    BigInt(whole || '0') * BigInt('1' + '0'.repeat(decimals)) + BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (scaled > MAX_UINT256) return fail('INVALID_AMOUNT');
  return scaled.toString();
}

export function formatUnits(raw: string, decimals: number): string {
  if (typeof raw !== 'string' || !RAW.test(raw)) return fail('INVALID_RAW');
  if (!decimals) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}

const big = (raw: string): bigint => (RAW.test(raw) ? BigInt(raw) : fail('INVALID_RAW'));

// ------------------------------------------------------------------ fee

// fee = max(minFee, ceil(gross * feeBps / 10000)) — StockBridgeMinter.feeFor.
/** Display amounts for the typed gross. A deposit fee is zero. An exit uses the minter fee rule. */
export function previewTransferAmounts(
  direction: 'RH_TO_ONYX' | 'ONYX_TO_RH',
  grossRaw: string | undefined,
  quote: { fee: string; net: string } | undefined,
  exitFee: { feeBps: number; minFee: string } | undefined
): { feeRaw: string; netRaw: string } {
  if (quote) return { feeRaw: quote.fee, netRaw: quote.net };
  if (!grossRaw || grossRaw === '0') return { feeRaw: '0', netRaw: '0' };
  if (direction === 'RH_TO_ONYX' || !exitFee) return { feeRaw: '0', netRaw: grossRaw };
  const feeRaw = computeExitFee(grossRaw, exitFee.feeBps, exitFee.minFee);
  const net = BigInt(grossRaw) - BigInt(feeRaw);
  return { feeRaw, netRaw: net > BigInt(0) ? net.toString() : '0' };
}

export function computeExitFee(gross: string, feeBps: number, minFee: string): string {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) return fail('INVALID_FEE_BPS');
  const product = big(gross) * BigInt(feeBps);
  const ceil = (product + BigInt(9999)) / BigInt(10000);
  const min = big(minFee);
  return (ceil > min ? ceil : min).toString();
}

// ------------------------------------------------------------------ binding

const same = (a: string | undefined, b: string): boolean =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

// The API's lane description must match the compiled deployment manifest exactly.
export function bindAssets(assets: Assets, lane: LaneBinding): Asset {
  if (assets.contractVersion !== RH_API_CONTRACT_VERSION) return fail('BINDING_CONTRACT_VERSION');
  if (assets.abiVersion !== RH_ABI_VERSION) return fail('BINDING_ABI_VERSION');
  const matches = assets.assets.filter((asset) => asset.assetId === lane.assetId);
  if (assets.assets.length !== 1 || matches.length !== 1) return fail('BINDING_ASSET');
  const asset = matches[0];
  if (asset.symbol !== lane.symbol || asset.decimals !== lane.decimals) return fail('BINDING_DECIMALS');
  if (asset.robinhood.chainId !== lane.rhChainId || asset.onyx.chainId !== lane.onyxChainId)
    return fail('BINDING_CHAIN');
  if (!same(asset.robinhood.token, lane.token)) return fail('BINDING_TOKEN');
  if (!same(asset.robinhood.escrow, lane.escrow)) return fail('BINDING_ESCROW');
  if (!same(asset.onyx.wrapper, lane.wrapper)) return fail('BINDING_WRAPPER');
  if (!same(asset.onyx.minter, lane.minter)) return fail('BINDING_MINTER');
  return asset;
}

// ------------------------------------------------------------------ gate

export type GateReason =
  | 'API_UNAVAILABLE'
  | 'BINDING_MISMATCH'
  | 'HEALTH_NOT_OK'
  | 'STATE_STALE'
  | 'HEALTH_STALE'
  | 'LIMITS_STALE'
  | 'WRONG_ASSET'
  | 'LANE_HELD'
  | 'DIRECTION_HELD'
  | 'DIRECTION_CLOSED'
  | 'ADMISSION_CLOSED'
  | 'PAUSED'
  | 'PAUSE_UNKNOWN'
  | 'ISSUER_NOT_OPEN'
  | 'COLLECTOR_NOT_OPEN'
  | 'UPGRADE_PENDING'
  | 'LIMITS_MISMATCH';

export interface GateInput {
  direction: RhDirection;
  lane: LaneBinding;
  nowMs: number;
  assets?: Assets;
  health?: Health;
  state?: EffectiveState;
  limits?: Limits;
}
export interface GateResult {
  open: boolean;
  reasons: GateReason[];
  asset?: Asset;
}

export function laneGate(input: GateInput): GateResult {
  const reasons: GateReason[] = [];
  const add = (reason: GateReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const { direction, lane, nowMs, health, state, limits } = input;
  let asset: Asset | undefined;
  if (!input.assets || !health || !state || !limits) add('API_UNAVAILABLE');
  if (input.assets) {
    try {
      asset = bindAssets(input.assets, lane);
    } catch {
      add('BINDING_MISMATCH');
    }
  }
  const stale = (atMs: number) => atMs > nowMs + RH_CLOCK_SKEW_MS || nowMs - atMs > RH_STATE_MAX_AGE_MS;
  if (health && health.status !== 'ok') add('HEALTH_NOT_OK');
  if (health && stale(health.checkedAtMs)) add('HEALTH_STALE');
  if (limits && (limits.assetId !== lane.assetId || limits.decimals !== lane.decimals)) add('LIMITS_MISMATCH');
  if (limits && stale(limits.observedAtMs)) add('LIMITS_STALE');
  if (state) {
    if (stale(state.observedAtMs)) add('STATE_STALE');
    if (state.assetId !== lane.assetId) add('WRONG_ASSET');
    if (state.held.lane) add('LANE_HELD');
    if (direction === 'RH_TO_ONYX' ? state.held.deposits : state.held.exits) add('DIRECTION_HELD');
    if (!(direction === 'RH_TO_ONYX' ? state.depositsOpen : state.exitsOpen)) add('DIRECTION_CLOSED');
    if (state.admission !== 'OPEN' && state.admission !== 'CANARY') add('ADMISSION_CLOSED');
    const paused = Object.values(state.paused);
    if (paused.some((value) => value === true)) add('PAUSED');
    if (paused.some((value) => value === null)) add('PAUSE_UNKNOWN');
    if (state.issuer !== 'OPEN') add('ISSUER_NOT_OPEN');
    if (direction === 'ONYX_TO_RH' && state.collector !== 'OPEN') add('COLLECTOR_NOT_OPEN');
    if (state.upgradePending) add('UPGRADE_PENDING');
  }
  return { open: reasons.length === 0, reasons, asset };
}

export const GATE_MESSAGES: Record<GateReason, string> = {
  API_UNAVAILABLE: 'The Robinhood bridge API is not reachable. Live actions stay disabled.',
  BINDING_MISMATCH: 'The API lane description does not match the deployed contracts. Live actions stay disabled.',
  HEALTH_NOT_OK: 'The bridge pipeline reports degraded or down health.',
  STATE_STALE: 'The bridge state is stale or from the future.',
  HEALTH_STALE: 'The bridge health report is stale or from the future.',
  LIMITS_STALE: 'The bridge limits are stale or from the future.',
  WRONG_ASSET: 'The bridge state describes a different asset.',
  LANE_HELD: 'The lane is on hold.',
  DIRECTION_HELD: 'This direction is on hold.',
  DIRECTION_CLOSED: 'This direction is closed.',
  ADMISSION_CLOSED: 'Admission is closed or frozen.',
  PAUSED: 'A lane contract is paused.',
  PAUSE_UNKNOWN: 'A lane contract pause state is unknown.',
  ISSUER_NOT_OPEN: 'The token issuer state is not open.',
  COLLECTOR_NOT_OPEN: 'The fee collector state is not open, so exits hold.',
  UPGRADE_PENDING: 'A contract upgrade is pending.',
  LIMITS_MISMATCH: 'The API limits describe a different asset or decimals.',
};

// ------------------------------------------------------------------ amounts and recipient

export function validateAmount(direction: RhDirection, gross: string, limits: Limits): void {
  const value = big(gross);
  if (value === BigInt(0)) fail('AMOUNT_ZERO');
  if (direction === 'RH_TO_ONYX') {
    if (value < big(limits.deposit.minAmount)) fail('AMOUNT_BELOW_MIN');
    if (value > big(limits.deposit.perTxMax)) fail('AMOUNT_ABOVE_PER_TX_MAX');
  } else {
    if (value < big(limits.exit.minExit)) fail('AMOUNT_BELOW_MIN_EXIT');
    if (value > big(limits.exit.perTxMax)) fail('AMOUNT_ABOVE_PER_TX_MAX');
  }
}

// Returns the lowercase recipient. Rejects malformed, zero and long-zero (Hedera
// entity-number, top 96 bits zero: uint160 < 2^64) forms, and every lane contract.
export function validateRecipient(value: string, lane: LaneBinding): string {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(input)) return fail('RECIPIENT_INVALID');
  try {
    getAddress(input); // rejects a mixed-case address with a wrong checksum
  } catch {
    return fail('RECIPIENT_CHECKSUM');
  }
  const lower = input.toLowerCase();
  if (BigInt(lower) < TWO_POW_64) return fail('RECIPIENT_ZERO_OR_LONG_ZERO');
  if ([lane.token, lane.escrow, lane.wrapper, lane.minter].includes(lower) || RH_FORBIDDEN_SPENDERS.includes(lower)) {
    return fail('RECIPIENT_IS_CONTRACT');
  }
  return lower;
}

// A fresh exit quote must match the request, the published fee formula and limits.
export function validateFeeQuote(
  quote: FeeQuote,
  gross: string,
  limits: Limits,
  lane: LaneBinding,
  nowMs: number
): void {
  if (quote.assetId !== lane.assetId || quote.direction !== 'ONYX_TO_RH') fail('QUOTE_MISMATCH');
  if (quote.gross !== gross) fail('QUOTE_MISMATCH');
  if (quote.feeBps !== limits.fee.feeBps || quote.minFee !== limits.fee.minFee) fail('QUOTE_PARAMETERS');
  const expected = computeExitFee(gross, quote.feeBps, quote.minFee);
  if (quote.fee !== expected) fail('QUOTE_FEE');
  if (quote.suggestedMaxFee !== quote.fee) fail('QUOTE_MAX_FEE');
  if (big(quote.fee) >= big(gross)) fail('QUOTE_NO_NET');
  if ((big(gross) - big(quote.fee)).toString() !== quote.net) fail('QUOTE_NET');
  if (
    quote.quotedAtMs > nowMs + RH_CLOCK_SKEW_MS ||
    quote.expiresAtMs <= nowMs ||
    quote.expiresAtMs <= quote.quotedAtMs
  ) {
    fail('QUOTE_EXPIRED');
  }
}

// Highest fee the minter could charge for `gross` under a governance ceiling:
// max(maxMinFee, ceil(gross * maxFeeBps / 10000)).
export function exitFeeCeiling(gross: string, maxFeeBps: number, maxMinFee: string): string {
  return computeExitFee(gross, maxFeeBps, maxMinFee);
}

export interface OnchainFee {
  fee: string; // StockBridgeMinter.feeFor(wrapper, gross)
  maxFeeBps: number; // StockBridgeMinter.MAX_FEE_BPS()
  maxMinFee: string; // registry(wrapper).maxMinFee
}

// The API quote must equal the minter's own feeFor(), and the burn maxFee must not exceed
// the ceiling implied by the on-chain governance bounds nor by the deployment manifest.
export function validateOnchainFee(
  quote: FeeQuote,
  gross: string,
  onchain: OnchainFee,
  manifest: { maxFeeBps: number; maxMinFee: string }
): void {
  if (quote.gross !== gross) fail('ONCHAIN_FEE_MISMATCH');
  if (quote.fee !== onchain.fee) fail('ONCHAIN_FEE_MISMATCH');
  const maxFee = big(quote.suggestedMaxFee);
  if (maxFee > big(exitFeeCeiling(gross, onchain.maxFeeBps, onchain.maxMinFee))) fail('MAX_FEE_ABOVE_CEILING');
  if (maxFee > big(exitFeeCeiling(gross, manifest.maxFeeBps, manifest.maxMinFee))) fail('MAX_FEE_ABOVE_CEILING');
}

// ------------------------------------------------------------------ calldata

export const LANE_ABI = new Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function deposit(address token, uint256 amount, address onyxRecipient) returns (bytes32)',
  'function depositNative(address onyxRecipient) payable returns (bytes32)',
  'function burn(address wrapper, uint256 grossAmount, address rhRecipient, uint256 maxFee) returns (bytes32)',
  'function restrictedMode() view returns (bool)',
  'function allowedHolder(address holder) view returns (bool)',
  'function feeFor(address wrapper, uint256 grossAmount) view returns (uint256)',
  'function MAX_FEE_BPS() view returns (uint256)',
  'function registry(address wrapper) view returns (tuple(address wrapper, address canonical, bool enabled, uint256 perTxMax, uint256 mint24hCap, uint256 outstandingCap, uint256 feeBps, uint256 minFee, uint256 minExit, uint256 maxMinFee))',
  'function mintUsage(address wrapper) view returns (uint256)',
  'function outstanding(address wrapper) view returns (uint256)',
  'function tokenConfig(address token) view returns (bool registered, bool enabled, uint256 perTxMax, uint256 releaseCap, uint256 custodyCap)',
  'function totalCustodied(address token) view returns (uint256)',
  'function releaseUsage(address token) view returns (uint256)',
]);

export interface LaneCall {
  readonly kind: 'approve' | 'deposit' | 'depositNative' | 'burn';
  readonly chainId: LaneChainId;
  readonly to: string; // lowercase
  readonly data: string;
  readonly spender?: string; // approve only, lowercase
  readonly amount: string;
  readonly value?: string;
}

// The approval for a direction: TSLA -> escrow on 46630, wrapper GROSS -> minter on 8901.
export function approvalTarget(
  direction: RhDirection,
  lane: LaneBinding
): { chainId: LaneChainId; token: string; spender: string } {
  return direction === 'RH_TO_ONYX'
    ? { chainId: lane.rhChainId, token: lane.token, spender: lane.escrow }
    : { chainId: lane.onyxChainId, token: lane.wrapper, spender: lane.minter };
}

export function assertApproval(direction: RhDirection, call: LaneCall, lane: LaneBinding): void {
  const expected = approvalTarget(direction, lane);
  if (call.kind !== 'approve' || call.chainId !== expected.chainId || call.to !== expected.token)
    fail('APPROVAL_TARGET');
  if (!call.spender || call.spender !== expected.spender || RH_FORBIDDEN_SPENDERS.includes(call.spender))
    fail('APPROVAL_SPENDER');
  const decoded = LANE_ABI.decodeFunctionData('approve', call.data);
  if ((decoded[0] as string).toLowerCase() !== expected.spender || decoded[1].toString() !== call.amount)
    fail('APPROVAL_CALLDATA');
}

export function buildApproval(direction: RhDirection, lane: LaneBinding, gross: string): LaneCall {
  const amount = big(gross).toString();
  const target = approvalTarget(direction, lane);
  const call: LaneCall = Object.freeze({
    kind: 'approve',
    chainId: target.chainId,
    to: target.token,
    spender: target.spender,
    amount,
    data: LANE_ABI.encodeFunctionData('approve', [target.spender, amount]),
  });
  assertApproval(direction, call, lane);
  return call;
}

export function buildBridgeCall(
  direction: RhDirection,
  lane: LaneBinding,
  params: { gross: string; recipient: string; maxFee?: string }
): LaneCall {
  const amount = big(params.gross).toString();
  const recipient = validateRecipient(params.recipient, lane);
  const { source } = chainPair(direction);
  if (direction === 'RH_TO_ONYX') {
    if (lane.kind === 'NATIVE')
      return Object.freeze({
        kind: 'depositNative',
        chainId: source,
        to: lane.escrow,
        amount,
        value: amount,
        data: LANE_ABI.encodeFunctionData('depositNative', [recipient]),
      });
    return Object.freeze({
      kind: 'deposit',
      chainId: source,
      to: lane.escrow,
      amount,
      data: LANE_ABI.encodeFunctionData('deposit', [lane.token, amount, recipient]),
    });
  }
  if (params.maxFee === undefined) return fail('MAX_FEE_REQUIRED');
  const maxFee = big(params.maxFee).toString();
  return Object.freeze({
    kind: 'burn',
    chainId: source,
    to: lane.minter,
    amount,
    data: LANE_ABI.encodeFunctionData('burn', [lane.wrapper, amount, recipient, maxFee]),
  });
}
