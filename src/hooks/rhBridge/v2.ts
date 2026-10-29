// SPDX-License-Identifier: Apache-2.0
// Read/view adapter only. RhLaneController retains the sole persistence, prompt and recovery pipeline.
import { keccak256 } from 'ethers/lib/utils';
import type { ProfileCatalog, ReviewedProfile } from '../../config/rhBridge/profiles';
import { bindRegistry, profileLane, profileLimits } from '../../config/rhBridge/profiles';
import type { V2ApiClient } from '../../services/rhBridge/v2-api';
import { readV2 } from '../../services/rhBridge/v2-api';
import type * as V2 from '../../services/rhBridge/v2-types';
import { freshObservation, sameBinding, timeMs, validateQuote } from '../../services/rhBridge/v2-schema';
import { buildApproval, buildBridgeCall, parseUnits, validateRecipient } from '../../services/rhBridge/lane';
import { readAllowance, readOnchainFee } from '../../services/rhBridge/chainReads';
import type { ChainReader } from '../../services/rhBridge/chainReads';
import { qualifyChainBalance } from '../../services/rhBridge/balanceObservations';
import type { QualifyResult } from '../../services/rhBridge/balanceObservations';
import type { LaneSnapshot, LaneView } from './view';
import { sameBindings } from '../../state/rhBridge/history';
export interface V2Snapshot {
  profile: ReviewedProfile;
  limits: V2.Limits;
  state: V2.EffectiveState;
  capacity: V2.Capacity;
  health: V2.Health;
  quote?: V2.FeeQuote;
  gross?: string;
  sourceBalance?: string;
  destinationBalance?: string;
  nativeBalance?: string;
  allowance?: string;
  gasReserve?: string;
  maxRaw?: string;
  validUntil: number;
}
const min = (...v: bigint[]) => v.reduce((a, b) => (a < b ? a : b));
export interface SnapshotReadOptions {
  providerEpoch?: number;
  prefetch?: { source: Promise<QualifyResult>; destination: Promise<QualifyResult> } | null;
  onBalance?: (side: 'source' | 'destination', result: QualifyResult) => void;
  onRegistry?: (ok: boolean) => void;
}
function assertQualified(result: QualifyResult): asserts result is Extract<QualifyResult, { kind: 'qualified' }> {
  if (result.kind === 'qualified') return;
  if (result.kind === 'mismatch' && result.code === 'DECIMALS') throw new Error('RH_DECIMALS_MISMATCH');
  if (result.kind === 'mismatch' && (result.code === 'GENESIS' || result.code === 'CHAIN'))
    throw new Error('RH_CHAIN_MISMATCH');
  if (result.kind === 'mismatch') throw new Error('RH_CODE_MISMATCH');
  throw new Error('RH_RPC_UNREACHABLE');
}
export function qualifyLaneSide(
  profile: ReviewedProfile,
  chains: ChainReader,
  s: LaneSnapshot,
  now: () => number,
  side: 'source' | 'destination',
  providerEpoch = 0
): Promise<QualifyResult> | null {
  const account = s.wallet.account;
  if (!account) return null;
  const asset = profile.descriptor;
  const chain: 'rh' | 'onyx' =
    side === 'source' ? (s.direction === 'RH_TO_ONYX' ? 'rh' : 'onyx') : s.direction === 'RH_TO_ONYX' ? 'onyx' : 'rh';
  return qualifyChainBalance({
    reader: chains,
    now,
    account,
    providerEpoch,
    profileSha256: asset.binding.profileSha256,
    assetId: asset.binding.assetId,
    chainId: chain === 'rh' ? 46630 : 8901,
    kind: chain === 'onyx' || asset.kind === 'ERC20' ? 'erc20' : 'native',
    token: chain === 'onyx' ? asset.wrapper.address : asset.kind === 'ERC20' ? asset.token : null,
    expectedCodeKeccak256:
      chain === 'onyx'
        ? asset.wrapper.runtimeCodeKeccak256
        : asset.kind === 'ERC20'
        ? asset.tokenRuntimeCodeKeccak256 ?? undefined
        : undefined,
  });
}
export function startQualifiedBalances(
  profile: ReviewedProfile,
  chains: ChainReader,
  s: LaneSnapshot,
  now: () => number,
  providerEpoch = 0
): { source: Promise<QualifyResult>; destination: Promise<QualifyResult> } | null {
  const source = qualifyLaneSide(profile, chains, s, now, 'source', providerEpoch);
  const destination = qualifyLaneSide(profile, chains, s, now, 'destination', providerEpoch);
  return source && destination ? { source, destination } : null;
}
export async function readProfileSnapshot(
  api: V2ApiClient,
  catalog: ProfileCatalog,
  profile: ReviewedProfile,
  chains: ChainReader,
  s: LaneSnapshot,
  now: () => number,
  options?: SnapshotReadOptions
): Promise<V2Snapshot> {
  const a = profile.descriptor,
    b = a.binding,
    lane = profileLane(profile),
    direction = s.direction,
    source = direction === 'RH_TO_ONYX' ? 46630 : 8901;
  let recipient: string | undefined;
  try {
    recipient = validateRecipient(s.recipientText || s.wallet.account || '', lane);
  } catch {
    /* Invalid recipient keeps actions closed. */
  }
  const observations = async () => {
    const [limits, state, capacity, health] = await Promise.all([
      readV2<V2.Limits>(api, { kind: 'limits', binding: b }, 'Limits'),
      readV2<V2.EffectiveState>(
        api,
        { kind: 'effectiveState', binding: b, sender: s.wallet.account ?? undefined, recipient },
        'EffectiveState'
      ),
      readV2<V2.Capacity>(api, { kind: 'capacity', binding: b, direction }, 'Capacity'),
      readV2<V2.Health>(api, { kind: 'health' }, 'Health'),
    ]);
    if (![limits, state, capacity].every((x) => sameBinding(x.binding, b)) || capacity.direction !== direction)
      throw new Error('RH_V2_BINDING');
    const pinned = profileLimits(profile);
    for (const key of ['deposit', 'exit', 'caps', 'fee'] as const)
      for (const [name, value] of Object.entries(pinned[key]))
        if ((limits[key] as any)[name] !== value) throw new Error('RH_PARAMETERS_MISMATCH');
    let validUntil = Math.min(
      freshObservation(limits.observation, 30000, now()),
      freshObservation(state.observation, 30000, now()),
      freshObservation(capacity.observation, 15000, now())
    );
    const healthAt = timeMs(health.observedAt);
    if (
      healthAt > now() + 5000 ||
      now() - healthAt > 30000 ||
      !health.assets.some((x) => sameBinding(x.binding, b) && x.status === 'ok' && x.consumersReady)
    )
      throw new Error('RH_V2_HEALTH');
    validUntil = Math.min(validUntil, healthAt + 30000);
    if (now() >= validUntil) throw new Error('RH_V2_STALE');
    return { limits, state, capacity, health, validUntil };
  };
  const account = s.wallet.account;
  if (account && (!chains.getCode || !chains.getChainId || !chains.genesisHash)) throw new Error('RH_CODE_UNAVAILABLE');
  const nativeDeposit = a.kind === 'NATIVE' && direction === 'RH_TO_ONYX';
  const sides = account
    ? options?.prefetch ?? startQualifiedBalances(profile, chains, s, now, options?.providerEpoch ?? 0)
    : null;
  if (sides && options?.onBalance) {
    sides.source.then(
      (result) => options.onBalance!('source', result),
      () => undefined
    );
    sides.destination.then(
      (result) => options.onBalance!('destination', result),
      () => undefined
    );
  }
  // Wrapper and token code start inside the side reads. These three keep the full authority set at four
  // concurrent getCode calls for a native asset, before capacity is requested.
  const authorityContracts = [a.escrow, a.minter, a.implementation];
  const codesPromise = account
    ? Promise.all(authorityContracts.map((contract) => chains.getCode!(contract.chainId, contract.address)))
    : null;
  const assets = await readV2<V2.Assets>(api, { kind: 'assets' }, 'Assets');
  try {
    bindRegistry(assets, catalog);
    options?.onRegistry?.(true);
  } catch (error) {
    options?.onRegistry?.(false);
    throw error;
  }
  if (!account || !sides || !codesPromise) return { profile, ...(await observations()) };
  const [sourceResult, destinationResult, codes, allowance, gasBalance] = await Promise.all([
    sides.source,
    sides.destination,
    codesPromise,
    nativeDeposit
      ? Promise.resolve(undefined)
      : readAllowance(
          chains,
          source,
          direction === 'RH_TO_ONYX' ? a.token! : a.wrapper.address,
          account,
          direction === 'RH_TO_ONYX' ? a.escrow.address : a.minter.address
        ),
    nativeDeposit ? Promise.resolve(undefined) : chains.getBalance(source, account),
  ]);
  assertQualified(sourceResult);
  assertQualified(destinationResult);
  for (const [index, contract] of authorityContracts.entries())
    if (keccak256(codes[index]) !== contract.runtimeCodeKeccak256) throw new Error('RH_CODE_MISMATCH');
  const rhBalance = direction === 'RH_TO_ONYX' ? sourceResult.valueAtomic : destinationResult.valueAtomic;
  // Dynamic observations arrive after independent RPC qualification, retaining every original expiry.
  const { limits, state, capacity, health, validUntil } = await observations();
  const result: V2Snapshot = { profile, limits, state, capacity, health, validUntil, allowance };
  result.sourceBalance = sourceResult.valueAtomic;
  result.destinationBalance = destinationResult.valueAtomic;
  result.nativeBalance = nativeDeposit ? rhBalance : gasBalance;
  const freshResult = () => {
    if (now() >= result.validUntil) throw new Error('RH_V2_STALE');
    return result;
  };
  let gross: string | undefined;
  try {
    if (s.amountText) gross = parseUnits(s.amountText, 18);
  } catch {
    /* Keep balances/MAX available for invalid input. */
  }
  const maximum = min(
    BigInt(result.sourceBalance),
    BigInt(capacity.remainingCapacity),
    BigInt(capacity.perTxMax),
    BigInt(direction === 'RH_TO_ONYX' ? limits.deposit.perTxMax : limits.exit.perTxMax)
  );
  const candidate = gross ?? maximum.toString();
  if (BigInt(candidate) > BigInt(0)) {
    let quote: V2.FeeQuote;
    try {
      quote = await readV2<V2.FeeQuote>(api, { kind: 'feeQuote', binding: b, direction, gross: candidate }, 'FeeQuote');
      result.validUntil = Math.min(result.validUntil, validateQuote(quote, b, direction, candidate, limits, now()));
      if (direction === 'ONYX_TO_RH') {
        const onchain = await readOnchainFee(chains, lane, candidate);
        if (
          onchain.fee !== quote.fee ||
          limits.fee.maxFeeBps !== onchain.maxFeeBps ||
          limits.fee.maxMinFee !== onchain.maxMinFee
        )
          throw new Error('RH_FEE_MISMATCH');
      }
    } catch {
      return freshResult();
    }
    result.quote = quote;
    result.gross = candidate;
    if (chains.estimateGas && chains.gasPrice && recipient) {
      try {
        const price = BigInt(await chains.gasPrice(source));
        const estimate = async (amount: string) => {
          const needApproval = !nativeDeposit && BigInt(result.allowance ?? '0') < BigInt(amount);
          const call = needApproval
            ? buildApproval(direction, lane, amount)
            : buildBridgeCall(direction, lane, {
                gross: amount,
                recipient: recipient!,
                maxFee: direction === 'ONYX_TO_RH' ? quote.suggestedMaxFee : undefined,
              });
          const gas = BigInt(
            await chains.estimateGas!(source, {
              from: account,
              to: call.to,
              data: call.data,
              value: '0x' + BigInt(call.value ?? '0').toString(16),
            })
          );
          if (gas === BigInt(0) || price === BigInt(0)) throw new Error('RH_GAS_UNKNOWN');
          return ((gas * BigInt(120) + BigInt(99)) / BigInt(100)) * price;
        };
        let reserve = await estimate(nativeDeposit ? '1' : candidate);
        if (nativeDeposit) {
          let max = BigInt(rhBalance) > reserve ? min(maximum, BigInt(rhBalance) - reserve) : BigInt(0);
          if (max > BigInt(0)) {
            reserve = await estimate(max.toString());
            max = BigInt(rhBalance) > reserve ? min(maximum, BigInt(rhBalance) - reserve) : BigInt(0);
          }
          result.maxRaw = max.toString();
        } else result.maxRaw = maximum.toString();
        if (gross && nativeDeposit) reserve = await estimate(gross);
        result.gasReserve = reserve.toString();
      } catch {
        result.maxRaw = undefined;
        result.gasReserve = undefined;
      }
    }
  }
  return freshResult();
}
export function deriveV2View(s: LaneSnapshot, lane: ReturnType<typeof profileLane>, now: number): LaneView {
  const x = s.v2,
    source = s.direction === 'RH_TO_ONYX' ? 46630 : 8901,
    destination = source === 46630 ? 8901 : 46630;
  const view: LaneView = {
    gate: { open: false, reasons: ['API_UNAVAILABLE'] },
    sourceChainId: source,
    destinationChainId: destination,
    needsApproval: false,
    canApprove: false,
    canBridge: false,
  };
  if (!s.wallet.account) view.walletBlocker = 'NOT_CONNECTED';
  else if (!s.wallet.isInjected || !s.wallet.hasProvider) view.walletBlocker = 'NOT_INJECTED';
  else if (s.wallet.chainId !== source) view.walletBlocker = 'WRONG_CHAIN';
  try {
    if (s.amountText) view.grossRaw = parseUnits(s.amountText, 18);
  } catch {
    view.amountError = 'Enter a valid amount.';
  }
  try {
    view.recipient = validateRecipient(s.recipientText || s.wallet.account || '', lane);
  } catch {
    view.recipientError = 'Enter a valid recipient.';
  }
  if (!x || x.profile.descriptor.binding.assetId !== lane.assetId) return view;
  const state = x.state,
    r = state.readiness,
    native = lane.kind === 'NATIVE';
  const held = r.globalHeld || r.assetHeld || (s.direction === 'RH_TO_ONYX' ? r.depositsHeld : r.exitsHeld);
  const permitted =
    ['CANARY', 'OPEN'].includes(r.effectiveAdmission) &&
    r.parametersMatchProfile === true &&
    r.manifestVerified &&
    r.consumersReady &&
    r.sourceAndDestinationHealthy &&
    !held &&
    state.upgradePending === false;
  const pause =
    state.paused.escrow === false &&
    state.paused.minter === false &&
    state.paused.wrapper === false &&
    (native
      ? state.paused.token === null && state.issuer === 'NOT_APPLICABLE'
      : state.paused.token === false && state.issuer === 'OPEN');
  // depositsOpen/exitsOpen also fold in this wallet's allowlist result. A denied wallet is not a closed asset.
  const directionOpen = s.direction === 'RH_TO_ONYX' ? r.depositGateOpen === true : state.collector === 'OPEN';
  view.gate = {
    open: now < x.validUntil && x.health.status === 'ok' && permitted && pause && directionOpen,
    reasons: [],
  };
  if (!view.gate.open) view.gate.reasons = ['DIRECTION_CLOSED'];
  if (
    state.eligibility.status !== 'ALLOWED' ||
    state.eligibility.sender !== s.wallet.account ||
    state.eligibility.recipient !== view.recipient
  )
    view.allowlistBlocker = 'ALLOWLIST_UNKNOWN';
  const ours = s.history.records.filter(
    (record) =>
      record.account === s.wallet.account &&
      record.direction === s.direction &&
      sameBindings(record.bindings, lane) &&
      (!record.assetBinding || sameBinding(record.assetBinding, x.profile.descriptor.binding))
  );
  view.pendingRecord = ours.find(
    (record) =>
      (record.stage === 'WALLET_PROMPT' && !s.busy) ||
      (record.stage === 'SOURCE_PENDING' && record.step === 'APPROVE') ||
      (record.stage === 'UNCERTAIN' && record.step === 'BRIDGE')
  );
  view.approvedRecord = ours.find(
    (record) => record.stage === 'APPROVED' && record.grossRaw === view.grossRaw && record.recipient === view.recipient
  );
  if (view.grossRaw) {
    const gross = BigInt(view.grossRaw),
      perTx = BigInt(s.direction === 'RH_TO_ONYX' ? x.limits.deposit.perTxMax : x.limits.exit.perTxMax),
      minimum = BigInt(s.direction === 'RH_TO_ONYX' ? x.limits.deposit.minAmount : x.limits.exit.minExit);
    if (gross < minimum || gross > perTx || gross > BigInt(x.capacity.perTxMax))
      view.amountError = 'Amount is outside the per-transaction bounds.';
    if (x.sourceBalance === undefined || x.nativeBalance === undefined || x.gasReserve === undefined)
      view.balanceError = 'BALANCE_UNKNOWN';
    else if (gross > BigInt(x.sourceBalance)) view.balanceError = 'INSUFFICIENT_BALANCE';
    else if (
      BigInt(x.nativeBalance) <
      BigInt(x.gasReserve) + (native && s.direction === 'RH_TO_ONYX' ? gross : BigInt(0))
    )
      view.balanceError = 'NO_GAS';
    if (gross > BigInt(x.capacity.remainingCapacity) || !x.capacity.admissionAllowsNewSource)
      view.capacityError = 'ABOVE_CAPACITY';
    if (!x.quote || x.gross !== view.grossRaw) view.quoteError = 'Refresh the fee quote.';
    // The allowance field can still be the pre-approval read after the receipt is mined.
    view.needsApproval =
      !(native && s.direction === 'RH_TO_ONYX') && BigInt(x.allowance ?? '0') < gross && !view.approvedRecord;
  }
  // The matching owner blocks duplicate actions; persisting its own pre-prompt record is not an intent change.
  const ready =
    view.gate.open &&
    !view.walletBlocker &&
    !!view.grossRaw &&
    !view.amountError &&
    !!view.recipient &&
    !view.recipientError &&
    !view.allowlistBlocker &&
    !view.balanceError &&
    !view.capacityError &&
    !view.quoteError &&
    !view.pendingRecord &&
    s.history.status === 'READY';
  view.canApprove = ready && view.needsApproval;
  view.canBridge = ready && !view.needsApproval;
  return view;
}
