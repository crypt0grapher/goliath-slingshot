// Framework-free engine of the RH lane page: API and chain reads, the two wallet actions
// (exact approval, then deposit/burn) and read-only status recovery. Each wallet prompt
// is preceded by a persisted intent and a fresh account/chain confirmation; nothing is
// ever retried or re-sent automatically.
import { LaneBinding, RH_MANIFEST_FEE_CEILING, RH_LANE } from '../../config/rhBridge';
import { chainPair, RhDirection } from '../../constants/rhBridge';
import {
  createIntent,
  HistoryStorage,
  HistoryView,
  isOpen,
  isStalePending,
  markInterruptedPrompts,
  readHistory,
  RecordPatch,
  RhRecord,
  sameBindings,
  updateRecord,
} from '../../state/rhBridge/history';
import { fetchAssets, fetchEffectiveState, fetchFeeQuote, fetchHealth, fetchLimits } from '../../services/rhBridge/api';
import {
  ChainReader,
  readAllowance,
  readAllowedHolder,
  readDecimals,
  readOnchainFee,
  readRemainingCapacity,
  readRestricted,
  readTokenBalance,
} from '../../services/rhBridge/chainReads';
import { RhApiClient } from '../../services/rhBridge/httpApi';
import {
  approvalTarget,
  buildApproval,
  buildBridgeCall,
  LaneCall,
  OnchainFee,
  parseUnits,
  validateFeeQuote,
  validateOnchainFee,
} from '../../services/rhBridge/lane';
import { FeeQuote } from '../../services/rhBridge/schema';
import { trackRecord, operationClaim } from '../../services/rhBridge/tracker';
import { Eip1193, sendLaneTransaction, switchWalletChain } from '../../services/rhBridge/wallet';
import { chainKey, deriveView, LaneSnapshot, WalletState } from './view';
import type { ProfileCatalog } from '../../config/rhBridge/profiles';
import { profileLane, legacyTslaProfile } from '../../config/rhBridge/profiles';
import type { V2ApiClient } from '../../services/rhBridge/v2-api';
import { readV2 } from '../../services/rhBridge/v2-api';
import { validateQuote } from '../../services/rhBridge/v2-schema';
import type * as V2 from '../../services/rhBridge/v2-types';
import type { WalletIntentGuard } from '../bridge/walletIntent';
import { StaleBridgeIntent } from '../bridge/walletIntent';
import { qualifyLaneSide, readProfileSnapshot, startQualifiedBalances } from './v2';
import type { V2Snapshot } from './v2';
import {
  SameCycleCoordinator,
  contradictsAuthority,
  createBalanceChannel,
  reduceBalanceChannel,
  shareChainReader,
} from '../../services/rhBridge/balanceObservations';
import type { BalanceChannelState, BalanceEvent, QualifyResult } from '../../services/rhBridge/balanceObservations';
import {
  balanceDelay,
  canStartManualRefresh,
  receiptCheckOffsets,
  RECEIPT_WINDOW_MS,
} from '../../services/rhBridge/balanceSchedule';

export interface ControllerDeps {
  api: RhApiClient | null;
  chains: ChainReader;
  storage: HistoryStorage | null;
  lane: LaneBinding;
  now: () => number;
  randomHex: () => string;
  v2?: { api: V2ApiClient; catalog: ProfileCatalog };
}

type Listener = (snapshot: LaneSnapshot) => void;

const ONCHAIN_FEE_MESSAGES: Record<string, string> = {
  RH_ONCHAIN_FEE_MISMATCH: "The quoted fee does not match the minter's on-chain fee. Exits stay disabled.",
  RH_MAX_FEE_ABOVE_CEILING: 'The quoted maxFee is above the on-chain fee ceiling. Exits stay disabled.',
};
const onchainFeeMessage = (error: unknown): string =>
  ONCHAIN_FEE_MESSAGES[error instanceof Error ? error.message : ''] ||
  'The on-chain fee could not be read. Exits stay disabled.';

const EMPTY_HISTORY: HistoryView = { status: 'READY', records: [], invalidRows: 0 };

export class RhLaneController {
  private snapshot: LaneSnapshot;
  private listeners = new Set<Listener>();
  private provider: Eip1193 | null = null;
  private generation = 0;
  private actionLock = false;
  private tracking = false;
  private disposed = false;
  private selectedAsset: string | null = null;
  private v2Reading: { generation: number; cycle: number; promise: Promise<void> } | null = null;
  private balanceEpoch = 0;
  private providerEpoch = 0;
  private readCycle = 0;
  private latchId = 0;
  private recoveredId = 0;
  private authorityCycle = -1;
  private lastManualAt: number | null = null;
  private balanceFailures = { source: 0, destination: 0 };
  private nextBalanceAt = { source: 0, destination: 0 };
  private sideFlight: Partial<Record<'source' | 'destination', Promise<void>>> = {};
  private receiptTimers: ReturnType<typeof setTimeout>[] = [];
  /** Balance publication held until the in-flight snapshot lands, so an age tick cannot mint a new intent. */
  private heldChannel: BalanceChannelState | null = null;
  private heldCycle = -1;
  private readonly balanceCoordinator = new SameCycleCoordinator(() => this.deps.now());

  constructor(private readonly deps: ControllerDeps) {
    this.snapshot = {
      direction: 'RH_TO_ONYX',
      amountText: '',
      recipientText: '',
      wallet: { account: null, chainId: null, isInjected: false, hasProvider: false },
      api: deps.api ? {} : { failure: 'NO_CLIENT' },
      quote: {},
      chain: {},
      history: deps.storage ? EMPTY_HISTORY : { status: 'INVALID', records: [], invalidRows: 0 },
      busy: null,
      notice: deps.storage ? null : 'Browser storage is unavailable, so live actions stay disabled.',
      ...(deps.v2
        ? { v2: null, v2Display: null, v2Loading: false, v2ReadFailed: false, balanceChannel: createBalanceChannel() }
        : {}),
    };
    if (deps.storage) {
      // A prompt that was open before this page load can no longer be observed.
      markInterruptedPrompts(deps.storage, deps.now());
      this.snapshot.history = readHistory(deps.storage);
    }
  }

  get state(): LaneSnapshot {
    return this.snapshot;
  }
  view() {
    return deriveView(this.snapshot, this.deps.lane, this.deps.now());
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    this.disposed = true;
    this.receiptTimers.forEach((timer) => clearTimeout(timer));
    this.listeners.clear();
  }

  private set(patch: Partial<LaneSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
  private reloadHistory(): void {
    if (this.deps.storage) this.set({ history: readHistory(this.deps.storage) });
  }
  onStorageEvent(): void {
    this.reloadHistory();
  }

  // ----------------------------------------------------------------- inputs

  setWallet(wallet: WalletState, provider: Eip1193 | null): void {
    const previous = this.snapshot.wallet;
    const providerChanged = this.provider !== provider;
    this.provider = provider;
    if (
      previous.account !== wallet.account ||
      previous.chainId !== wallet.chainId ||
      previous.isInjected !== wallet.isInjected ||
      providerChanged
    ) {
      // Any context change cancels whatever action captured the previous context.
      this.generation++;
      this.bumpBalanceContext();
      this.set({
        wallet,
        chain: {},
        ...(this.deps.v2
          ? {
              v2: null,
              v2Display: null,
              v2Loading: false,
              v2ReadFailed: false,
              balanceChannel: this.contextChannel(wallet.account),
            }
          : {}),
      });
    } else if (previous.hasProvider !== wallet.hasProvider) {
      this.set({ wallet });
    }
  }
  setDirection(direction: RhDirection): void {
    if (this.deps.v2)
      return this.setSelection(this.selectedAsset, direction, this.snapshot.amountText, this.snapshot.recipientText);
    if (direction === this.snapshot.direction) return;
    this.generation++;
    this.set({ direction, quote: {}, chain: {}, notice: null });
  }
  setAmount(amountText: string): void {
    if (this.deps.v2)
      return this.setSelection(this.selectedAsset, this.snapshot.direction, amountText, this.snapshot.recipientText);
    if (amountText !== this.snapshot.amountText) this.generation++;
    this.set({ amountText, notice: null });
  }
  setRecipient(recipientText: string): void {
    if (this.deps.v2)
      return this.setSelection(this.selectedAsset, this.snapshot.direction, this.snapshot.amountText, recipientText);
    if (recipientText !== this.snapshot.recipientText) this.generation++;
    this.set({ recipientText, notice: null });
  }

  setSelection(assetId: string | null, direction: RhDirection, amountText: string, recipientText: string): void {
    if (!this.deps.v2) return;
    if (
      this.selectedAsset === assetId &&
      this.snapshot.direction === direction &&
      this.snapshot.amountText === amountText &&
      this.snapshot.recipientText === recipientText
    )
      return;
    const identityChanged = this.selectedAsset !== assetId || this.snapshot.direction !== direction;
    this.selectedAsset = assetId;
    const profile = assetId ? this.deps.v2.catalog.current(assetId) : null;
    if (profile) this.deps.lane = profileLane(profile);
    if (!identityChanged) {
      // Typing a new amount or recipient must not wipe the figures already on screen.
      this.set({ direction, amountText, recipientText });
      return;
    }
    this.generation++;
    this.bumpBalanceContext();
    this.set({
      direction,
      amountText,
      recipientText,
      v2: null,
      v2Display: null,
      v2Loading: false,
      v2ReadFailed: false,
      balanceChannel: this.contextChannel(this.snapshot.wallet.account),
      chain: {},
      quote: {},
      notice: profile || assetId === null ? null : 'Deployment pins are not configured. Live actions stay disabled.',
    });
  }
  invalidateContext(): void {
    this.generation++;
    this.bumpBalanceContext();
    if (this.deps.v2)
      this.set({
        v2: null,
        v2Display: null,
        v2Loading: false,
        v2ReadFailed: false,
        balanceChannel: this.contextChannel(this.snapshot.wallet.account),
      });
  }

  /** Balance-only refresh. It never opens a wallet prompt or reads action authority. */
  refreshBalances(kind: 'manual' | 'focus' | 'poll' = 'manual'): void {
    if (!this.deps.v2) return;
    if (kind === 'poll') {
      if (this.laneCoversBalances()) return;
      const now = this.deps.now();
      (['source', 'destination'] as const).forEach((side) => {
        if (now >= this.nextBalanceAt[side]) void this.readSide(side);
      });
      return;
    }
    const inFlight = !!(this.sideFlight.source || this.sideFlight.destination || this.snapshot.v2Loading);
    if (kind === 'manual' && !canStartManualRefresh(this.lastManualAt, this.deps.now(), inFlight)) return;
    if (kind === 'manual') this.lastManualAt = this.deps.now();
    if (kind === 'focus' && inFlight) return;
    void this.readSide('source', true);
    void this.readSide('destination', true);
  }

  /** At most five lightweight balance checks in the ten seconds after a receipt. */
  refreshAfterReceipt(): void {
    if (!this.deps.v2) return;
    const started = this.deps.now();
    for (const offset of receiptCheckOffsets()) {
      const timer = setTimeout(() => {
        if (this.disposed || this.deps.now() - started > RECEIPT_WINDOW_MS) return;
        void this.readSide('source', true);
        void this.readSide('destination', true);
      }, offset);
      this.receiptTimers.push(timer);
    }
  }

  private bumpBalanceContext(): void {
    this.balanceEpoch += 1;
    this.providerEpoch += 1;
    this.readCycle += 1;
    this.latchId = 0;
    this.recoveredId = 0;
    this.balanceFailures = { source: 0, destination: 0 };
    this.nextBalanceAt = { source: 0, destination: 0 };
  }

  private contextChannel(account: string | null): BalanceChannelState {
    return reduceBalanceChannel(createBalanceChannel(this.balanceEpoch), {
      type: 'context',
      epoch: this.balanceEpoch,
      providerEpoch: this.providerEpoch,
      account,
      profileSha256: this.profileSha(),
    });
  }

  private profileSha(): string | null {
    const profile = this.selectedAsset && this.deps.v2 ? this.deps.v2.catalog.current(this.selectedAsset) : null;
    return profile?.descriptor.binding.profileSha256 ?? null;
  }

  private laneCoversBalances(): boolean {
    if (this.snapshot.v2Loading) return true;
    const v2 = this.snapshot.v2;
    return !!v2 && !this.snapshot.v2ReadFailed && this.deps.now() < v2.validUntil && v2.sourceBalance !== undefined;
  }

  private publishBalance(
    side: 'source' | 'destination',
    result: QualifyResult,
    cycle: number,
    stampAtStart: number,
    epochAtStart: number
  ): void {
    if (this.disposed) return;
    const revalidated = this.latchId > 0 && this.recoveredId === this.latchId && stampAtStart === this.latchId;
    const event: BalanceEvent = { type: 'result', side, epoch: epochAtStart, result, revalidated };
    this.noteBalance(side, result);
    const authoritative = side === 'source' ? this.snapshot.v2?.sourceBalance : this.snapshot.v2?.destinationBalance;
    const contradicts =
      result.kind === 'qualified' &&
      !!this.snapshot.v2 &&
      cycle !== this.authorityCycle &&
      contradictsAuthority(authoritative, result.valueAtomic);
    if (contradicts) {
      this.dropHeld(cycle);
      this.generation += 1;
      this.applyBalance(event);
      this.set({ v2: null, v2ReadFailed: true });
      return;
    }
    // The replacement snapshot is about to land. Publishing the channel now would
    // render the previous snapshot after its expiry and mint a new intent for the same values.
    if (this.snapshot.v2 && this.snapshot.v2Loading && cycle !== this.authorityCycle) {
      const base = this.heldCycle === cycle ? this.heldChannel : this.snapshot.balanceChannel;
      this.heldChannel = reduceBalanceChannel(base ?? createBalanceChannel(this.balanceEpoch), event);
      this.heldCycle = cycle;
      return;
    }
    this.applyBalance(event);
  }

  private dropHeld(cycle: number): void {
    if (this.heldCycle !== cycle) return;
    this.heldChannel = null;
    this.heldCycle = -1;
  }

  private takeHeld(cycle: number): BalanceChannelState | null {
    if (this.heldCycle !== cycle) return null;
    const channel = this.heldChannel;
    this.heldChannel = null;
    this.heldCycle = -1;
    return channel;
  }

  private noteBalance(side: 'source' | 'destination', result: QualifyResult): void {
    if (result.kind === 'qualified') {
      this.balanceFailures[side] = 0;
      this.nextBalanceAt[side] = this.deps.now() + balanceDelay(0);
      return;
    }
    if (result.kind === 'unavailable') {
      this.balanceFailures[side] += 1;
      this.nextBalanceAt[side] = this.deps.now() + balanceDelay(this.balanceFailures[side]);
    }
  }

  private applyBalance(event: BalanceEvent): void {
    const current = this.snapshot.balanceChannel ?? createBalanceChannel(this.balanceEpoch);
    this.set({ balanceChannel: reduceBalanceChannel(current, event) });
  }

  private async readSide(side: 'source' | 'destination', force = false): Promise<void> {
    if (!force && this.deps.now() < this.nextBalanceAt[side]) return;
    const existing = this.sideFlight[side];
    if (existing) return existing;
    const profile = this.selectedAsset && this.deps.v2 ? this.deps.v2.catalog.current(this.selectedAsset) : null;
    if (!profile || !this.snapshot.wallet.account) return;
    const cycle = this.readCycle;
    const stampAtStart = this.latchId;
    const epochAtStart = this.balanceEpoch;
    const work = (async () => {
      const chains = shareChainReader(this.deps.chains, this.balanceCoordinator, cycle);
      const result = await qualifyLaneSide(profile, chains, this.snapshot, this.deps.now, side, this.providerEpoch);
      if (!result || this.disposed || epochAtStart !== this.balanceEpoch) return;
      this.publishBalance(side, result, cycle, stampAtStart, epochAtStart);
    })();
    this.sideFlight[side] = work;
    try {
      await work;
    } finally {
      if (this.sideFlight[side] === work) delete this.sideFlight[side];
    }
  }

  // ----------------------------------------------------------------- reads

  async refreshLane(): Promise<void> {
    if (this.deps.v2) {
      const generation = this.generation,
        profile = this.selectedAsset ? this.deps.v2.catalog.current(this.selectedAsset) : null;
      if (!profile) return;
      const cycle = this.readCycle;
      if (this.v2Reading?.generation === generation && this.v2Reading.cycle === cycle) return this.v2Reading.promise;
      this.set({ v2Loading: true });
      const amountAtStart = this.snapshot.amountText;
      const stampAtStart = this.latchId;
      const epochAtStart = this.balanceEpoch;
      const promise = (async () => {
        try {
          const chains = shareChainReader(this.deps.chains, this.balanceCoordinator, cycle);
          const prefetch = startQualifiedBalances(profile, chains, this.snapshot, this.deps.now, this.providerEpoch);
          let v2 = await readProfileSnapshot(
            this.deps.v2!.api,
            this.deps.v2!.catalog,
            profile,
            chains,
            this.snapshot,
            this.deps.now,
            {
              providerEpoch: this.providerEpoch,
              prefetch,
              onBalance: (side, result) => this.publishBalance(side, result, cycle, stampAtStart, epochAtStart),
              onRegistry: (ok) => {
                if (ok && this.latchId > this.recoveredId) this.recoveredId = this.latchId;
              },
            }
          );
          if (generation !== this.generation || cycle !== this.readCycle) {
            this.dropHeld(cycle);
            return;
          }
          if (this.snapshot.amountText !== amountAtStart) {
            const patched = await this.quoteSnapshot(v2, this.snapshot.amountText);
            if (patched) v2 = patched;
          }
          if (generation === this.generation && cycle === this.readCycle) {
            this.authorityCycle = cycle;
            const balanceChannel = this.takeHeld(cycle);
            this.set({
              v2,
              v2Display: v2,
              notice: null,
              v2ReadFailed: false,
              ...(balanceChannel ? { balanceChannel } : {}),
            });
          }
        } catch (error) {
          if (generation !== this.generation || cycle !== this.readCycle) {
            this.dropHeld(cycle);
            return;
          }
          const code = error instanceof Error ? error.message : '';
          if (code === 'RH_REGISTRY_MISMATCH' || code === 'RH_PROFILE_MISMATCH') {
            this.latchId += 1;
            this.applyBalance({
              type: 'registry-mismatch',
              epoch: this.balanceEpoch,
              profileSha256: profile.descriptor.binding.profileSha256,
              code: code === 'RH_REGISTRY_MISMATCH' ? 'REGISTRY' : 'PROFILE',
            });
            this.dropHeld(cycle);
          }
          const balanceChannel = this.takeHeld(cycle);
          this.set({
            v2: null,
            notice: null,
            v2ReadFailed: true,
            ...(balanceChannel ? { balanceChannel } : {}),
          });
        }
      })();
      this.v2Reading = { generation, cycle, promise };
      try {
        await promise;
      } finally {
        if (this.v2Reading?.promise === promise) this.v2Reading = null;
        if (generation === this.generation) this.set({ v2Loading: false });
      }
      return;
    }
    const api = this.deps.api;
    if (!api) return;
    const [assets, limits, health, state] = await Promise.all([
      fetchAssets(api),
      fetchLimits(api),
      fetchHealth(api),
      fetchEffectiveState(api),
    ]);
    const failure = [assets, limits, health, state].find((r) => !r.ok);
    this.set({
      api: {
        assets: assets.ok ? assets.value : undefined,
        limits: limits.ok ? limits.value : undefined,
        health: health.ok ? health.value : undefined,
        state: state.ok ? state.value : undefined,
        failure: failure && !failure.ok ? failure.failure : undefined,
        updatedAtMs: this.deps.now(),
      },
    });
  }

  /** Replace only the fee quote. Leaves every other figure in place when the request fails. */
  async refreshAmountQuote(): Promise<void> {
    if (!this.deps.v2) return this.refreshQuote();
    const current = this.snapshot.v2;
    const profile = this.selectedAsset ? this.deps.v2.catalog.current(this.selectedAsset) : null;
    if (!current || !profile) return;
    const amountText = this.snapshot.amountText;
    const generation = this.generation;
    const patched = await this.quoteSnapshot(current, amountText);
    if (!patched || generation !== this.generation || this.snapshot.amountText !== amountText) return;
    this.set({ v2: patched, v2Display: patched });
  }

  private async quoteSnapshot(current: V2Snapshot, amountText: string): Promise<V2Snapshot | null> {
    const profile = this.selectedAsset ? this.deps.v2?.catalog.current(this.selectedAsset) : null;
    if (!profile || !this.deps.v2) return null;
    let gross: string;
    try {
      if (!amountText) return null;
      gross = parseUnits(amountText, 18);
    } catch {
      return null;
    }
    if (gross === '0' || (current.quote && current.gross === gross)) return current;
    try {
      const binding = profile.descriptor.binding;
      const direction = this.snapshot.direction;
      const quote = await readV2<V2.FeeQuote>(
        this.deps.v2.api,
        { kind: 'feeQuote', binding, direction, gross },
        'FeeQuote'
      );
      const quoteUntil = validateQuote(quote, binding, direction, gross, current.limits, this.deps.now());
      return { ...current, quote, gross, validUntil: Math.min(current.validUntil, quoteUntil) };
    } catch {
      return null;
    }
  }

  async refreshQuote(): Promise<void> {
    if (this.deps.v2) return this.refreshAmountQuote();
    const api = this.deps.api;
    const view = this.view();
    if (!api || this.snapshot.direction !== 'ONYX_TO_RH' || !view.grossRaw) return;
    const gross = view.grossRaw;
    const result = await fetchFeeQuote(api, gross);
    if (this.view().grossRaw !== gross) return; // the amount changed meanwhile
    if (result.ok) {
      const checked = await this.checkOnchainFee(result.value, gross);
      if (this.view().grossRaw !== gross) return;
      this.set({ quote: { forGross: gross, value: result.value, ...checked } });
    } else {
      const code = result.error?.code;
      const failure =
        code === 'AMOUNT_BELOW_MIN_EXIT'
          ? 'Below the minimum exit amount.'
          : code === 'AMOUNT_ABOVE_PER_TX_MAX'
          ? 'Above the per-transaction maximum.'
          : 'The fee quote is unavailable.';
      this.set({ quote: { forGross: gross, failure } });
    }
  }

  // L1: the API quote must equal StockBridgeMinter.feeFor() read through the keyless Onyx RPC.
  private async checkOnchainFee(
    quote: FeeQuote,
    gross: string
  ): Promise<{ onchain?: OnchainFee; onchainFailure?: string }> {
    try {
      const onchain = await readOnchainFee(this.deps.chains, this.deps.lane, gross);
      validateOnchainFee(quote, gross, onchain, RH_MANIFEST_FEE_CEILING);
      return { onchain };
    } catch (error) {
      return { onchainFailure: onchainFeeMessage(error) };
    }
  }

  async refreshChain(): Promise<void> {
    if (this.deps.v2) return this.refreshLane();
    const { chains, lane } = this.deps;
    const { direction, wallet } = this.snapshot;
    const account = wallet.account;
    const view = this.view();
    const recipient = view.recipient || null;
    const key = chainKey(account, direction, recipient);
    if (!account) {
      this.set({ chain: {} });
      return;
    }
    const { source } = chainPair(direction);
    const target = approvalTarget(direction, lane);
    const gate = direction === 'RH_TO_ONYX' ? lane.escrow : lane.minter;
    try {
      const [
        decimals,
        sourceBalance,
        rhBalance,
        onyxBalance,
        allowance,
        nativeBalance,
        restricted,
        senderAllowed,
        remainingCapacity,
      ] = await Promise.all([
        readDecimals(chains, source, target.token),
        readTokenBalance(chains, source, target.token, account),
        readTokenBalance(chains, lane.rhChainId, lane.token, account),
        readTokenBalance(chains, lane.onyxChainId, lane.wrapper, account),
        readAllowance(chains, source, target.token, account, target.spender),
        chains.getBalance(source, account),
        readRestricted(chains, source, gate),
        readAllowedHolder(chains, source, gate, account),
        readRemainingCapacity(chains, lane, direction),
      ]);
      let recipientAllowed: boolean | undefined;
      let recipientMintAllowed: boolean | undefined;
      if (direction === 'RH_TO_ONYX' && recipient && restricted) {
        // Escrow checks the recipient at deposit; the minter checks it again at mint.
        [recipientAllowed, recipientMintAllowed] = await Promise.all([
          readAllowedHolder(chains, lane.rhChainId, lane.escrow, recipient),
          readAllowedHolder(chains, lane.onyxChainId, lane.minter, recipient),
        ]);
      }
      if (chainKey(this.snapshot.wallet.account, this.snapshot.direction, this.view().recipient || null) !== key)
        return;
      this.set({
        chain: {
          key,
          decimals,
          sourceBalance,
          rhBalance,
          onyxBalance,
          allowance,
          nativeBalance,
          restricted,
          senderAllowed,
          recipientAllowed,
          recipientMintAllowed,
          remainingCapacity,
        },
      });
    } catch {
      this.set({ chain: { key, failure: 'Chain reads failed. Live actions stay disabled until they succeed.' } });
    }
  }

  // ----------------------------------------------------------------- wallet actions

  async switchToSource(): Promise<void> {
    if (!this.provider || this.actionLock) return;
    this.actionLock = true;
    this.set({ busy: 'SWITCH', notice: null });
    try {
      const outcome = await switchWalletChain(this.provider, chainPair(this.snapshot.direction).source);
      this.set({
        notice:
          outcome === 'SWITCHED'
            ? null
            : outcome === 'REJECTED'
            ? 'Network switch was rejected in the wallet.'
            : 'The wallet could not switch networks.',
      });
    } finally {
      this.actionLock = false;
      this.set({ busy: null });
    }
  }

  async approve(guard?: WalletIntentGuard): Promise<void> {
    const view = this.view();
    if (!view.canApprove || !view.grossRaw || !view.recipient || this.actionLock) return;
    if (this.deps.v2) {
      const generation = this.generation,
        lane = this.deps.lane,
        direction = this.snapshot.direction,
        gross = view.grossRaw,
        recipient = view.recipient;
      this.actionLock = true;
      this.set({ busy: 'APPROVE', notice: null });
      try {
        guard?.assertCurrent();
        this.readCycle += 1;
        await this.refreshLane();
        guard?.assertCurrent();
        const after = this.view();
        if (
          generation !== this.generation ||
          !after.canApprove ||
          after.grossRaw !== gross ||
          after.recipient !== recipient
        )
          return this.stop('The approval details changed. Review them before continuing.');
        this.actionLock = false;
        await this.prompt(
          'APPROVE',
          buildApproval(direction, lane, gross),
          gross,
          recipient,
          null,
          null,
          undefined,
          generation,
          guard
        );
        // The wallet can return after the approval is mined. Track it before the next paint
        // so Confirm Bridge does not wait for a later allowance read.
        await this.trackOnce();
      } finally {
        this.actionLock = false;
        this.set({ busy: null });
      }
      return;
    }
    const call = buildApproval(this.snapshot.direction, this.deps.lane, view.grossRaw);
    await this.prompt('APPROVE', call, view.grossRaw, view.recipient, null, null, undefined, undefined, guard);
  }

  async bridge(guard?: WalletIntentGuard): Promise<void> {
    if (this.deps.v2) {
      const before = this.view();
      if (!before.canBridge || !before.grossRaw || !before.recipient || this.actionLock) return;
      const generation = this.generation,
        lane = this.deps.lane,
        direction = this.snapshot.direction,
        gross = before.grossRaw,
        recipient = before.recipient;
      this.actionLock = true;
      this.set({ busy: 'BRIDGE', notice: null });
      try {
        guard?.assertCurrent();
        this.readCycle += 1;
        await this.refreshLane();
        guard?.assertCurrent();
        const after = this.view(),
          x = this.snapshot.v2;
        if (
          generation !== this.generation ||
          !after.canBridge ||
          after.grossRaw !== gross ||
          after.recipient !== recipient ||
          !x?.quote ||
          x.gross !== gross
        )
          return this.stop('The bridge details changed. Review them before continuing.');
        const fee = x.quote.fee,
          maxFee = direction === 'ONYX_TO_RH' ? x.quote.suggestedMaxFee : null;
        const call = buildBridgeCall(direction, lane, { gross, recipient, maxFee: maxFee ?? undefined });
        this.actionLock = false;
        await this.prompt('BRIDGE', call, gross, recipient, fee, maxFee, before.approvedRecord, generation, guard);
      } finally {
        this.actionLock = false;
        this.set({ busy: null });
      }
      return;
    }
    const before = this.view();
    if (!before.canBridge || !before.grossRaw || !before.recipient || this.actionLock) return;
    const { direction } = this.snapshot;
    const { lane, chains } = this.deps;
    const gross = before.grossRaw;
    const recipient = before.recipient;
    const generation = this.generation;
    this.actionLock = true;
    this.set({ busy: 'BRIDGE', notice: null });
    try {
      // Fresh lane state immediately before the prompt.
      await this.refreshLane();
      let maxFee: string | null = null;
      let fee = '0';
      if (direction === 'ONYX_TO_RH') {
        const shown = this.snapshot.quote.value;
        const fresh = this.deps.api ? await fetchFeeQuote(this.deps.api, gross) : null;
        if (!fresh || !fresh.ok || !this.snapshot.api.limits)
          return this.stop('The fee quote could not be refreshed. Nothing was sent.');
        try {
          validateFeeQuote(fresh.value, gross, this.snapshot.api.limits, lane, this.deps.now());
        } catch {
          return this.stop('The fresh fee quote failed validation. Nothing was sent.');
        }
        const checked = await this.checkOnchainFee(fresh.value, gross);
        this.set({ quote: { forGross: gross, value: fresh.value, ...checked } });
        if (checked.onchainFailure) return this.stop(checked.onchainFailure + ' Nothing was sent.');
        if (!shown || shown.fee !== fresh.value.fee)
          return this.stop('The fee changed. Review the new quote and click again. Nothing was sent.');
        maxFee = fresh.value.suggestedMaxFee;
        fee = fresh.value.fee;
      }
      const target = approvalTarget(direction, lane);
      const allowance = await readAllowance(
        chains,
        target.chainId,
        target.token,
        this.snapshot.wallet.account || '',
        target.spender
      );
      if (BigInt(allowance) < BigInt(gross)) return this.stop('The approval is not on chain yet. Nothing was sent.');
      let remaining: string;
      try {
        remaining = await readRemainingCapacity(chains, lane, direction);
      } catch {
        return this.stop('The on-chain bridge capacity could not be read. Nothing was sent.');
      }
      if (BigInt(gross) > BigInt(remaining))
        return this.stop('Above the remaining on-chain bridge capacity. Nothing was sent.');
      const after = this.view();
      if (
        generation !== this.generation ||
        !after.gate.open ||
        after.walletBlocker ||
        after.grossRaw !== gross ||
        after.recipient !== recipient
      ) {
        return this.stop('The lane, wallet or form changed. Review and click again. Nothing was sent.');
      }
      const call = buildBridgeCall(direction, lane, { gross, recipient, maxFee: maxFee ?? undefined });
      this.actionLock = false;
      await this.prompt('BRIDGE', call, gross, recipient, fee, maxFee, before.approvedRecord, generation);
    } finally {
      this.actionLock = false;
      if (this.snapshot.busy === 'BRIDGE') this.set({ busy: null });
    }
  }

  private stop(notice: string): void {
    this.set({ notice });
  }

  // Persist intent -> confirm context -> one wallet request -> attach outcome.
  private async prompt(
    step: 'APPROVE' | 'BRIDGE',
    call: LaneCall,
    gross: string,
    recipient: string,
    fee: string | null,
    maxFee: string | null,
    approved?: RhRecord,
    capturedGeneration?: number,
    guard?: WalletIntentGuard
  ): Promise<void> {
    const storage = this.deps.storage;
    const provider = this.provider;
    const account = this.snapshot.wallet.account;
    if (!storage || !provider || !account || this.actionLock) return;
    const generation = capturedGeneration ?? this.generation;
    this.actionLock = true;
    this.set({ busy: step, notice: null });
    let record: RhRecord | undefined;
    try {
      guard?.assertCurrent();
      const now = this.deps.now();
      try {
        if (
          approved &&
          sameBindings(approved.bindings, this.deps.lane) &&
          approved.grossRaw === gross &&
          approved.recipient === recipient
        ) {
          record = updateRecord(
            storage,
            approved.id,
            { stage: 'WALLET_PROMPT', step: 'BRIDGE', feeRaw: fee ?? '0', maxFeeRaw: maxFee },
            now
          );
        } else {
          record = createIntent(storage, {
            direction: this.snapshot.direction,
            account,
            recipient,
            grossRaw: gross,
            feeRaw: fee ?? '0',
            maxFeeRaw: maxFee,
            step,
            lane: this.deps.lane,
            nowMs: now,
            randomHex: this.deps.randomHex(),
          });
        }
      } catch {
        this.set({ notice: 'Could not record the operation in browser storage. Nothing was sent.' });
        return;
      } finally {
        this.reloadHistory();
      }
      // Pending nonce before the prompt: a floor for the transaction's nonce (replacement detection).
      let txNonce: number | null = null;
      try {
        txNonce = await this.deps.chains.getTransactionCount(call.chainId, account, 'pending');
      } catch {
        /* Without it, only an exact nonce seen later, or the stale-pending dismissal, applies. */
      }
      if (generation !== this.generation) {
        this.patch(record.id, { stage: 'FAILED', failure: 'CONTEXT_CHANGED' });
        this.set({ notice: 'The wallet account or network changed. Nothing was sent.' });
        return;
      }
      let outcome;
      try {
        const finalGuard: WalletIntentGuard | undefined = this.deps.v2
          ? {
              expectedAccount: account,
              expectedChainId: call.chainId,
              assertCurrent: () => {
                if (this.disposed || generation !== this.generation) throw new StaleBridgeIntent();
                guard?.assertCurrent();
              },
            }
          : guard;
        outcome = await sendLaneTransaction(provider, account, call, finalGuard);
      } catch {
        this.patch(record.id, { stage: 'FAILED', failure: 'CONTEXT_CHANGED' });
        this.set({ notice: 'The wallet account or network changed before signing. Nothing was sent.' });
        return;
      }
      if (outcome.kind === 'SENT') {
        this.patch(
          record.id,
          step === 'APPROVE'
            ? { stage: 'SOURCE_PENDING', approveTxHash: outcome.txHash, txNonce }
            : { stage: 'SOURCE_PENDING', sourceTxHash: outcome.txHash, txNonce }
        );
      } else if (outcome.kind === 'NOT_SENT') {
        this.patch(record.id, {
          stage: 'FAILED',
          failure: outcome.code === '4001' || outcome.code === 'ACTION_REJECTED' ? 'USER_REJECTED' : 'WALLET_REFUSED',
        });
        this.set({
          notice:
            outcome.code === '4001'
              ? 'You rejected the request in the wallet. Nothing was sent.'
              : 'The wallet refused the request. Nothing was sent.',
        });
      } else {
        this.patch(record.id, { stage: 'UNCERTAIN', failure: 'WALLET_ERROR' });
        this.set({
          notice:
            'The wallet returned an error. The transaction may or may not have been sent; it will not be resent. Check your wallet activity.',
        });
      }
    } finally {
      this.actionLock = false;
      this.set({ busy: null });
    }
  }

  private patch(id: string, patch: RecordPatch): void {
    if (!this.deps.storage) return;
    try {
      updateRecord(this.deps.storage, id, patch, this.deps.now());
    } catch {
      /* Invalid transition or unreadable storage: keep the stored record as it is. */
    }
    this.reloadHistory();
  }

  // Deliberate user action: close a failed, uncertain, unused approved, or long-pending
  // (no receipt after RH_STALE_PENDING_MS) record. Nothing is re-sent.
  canDismiss(record: RhRecord): boolean {
    return ['FAILED', 'UNCERTAIN', 'APPROVED'].includes(record.stage) || isStalePending(record, this.deps.now());
  }
  dismiss(id: string): void {
    const record = this.snapshot.history.records.find((r) => r.id === id);
    if (!record || !this.canDismiss(record)) return;
    this.patch(id, { stage: 'DISMISSED' });
  }

  // ----------------------------------------------------------------- recovery

  async trackOnce(): Promise<void> {
    const { api, chains, storage, lane } = this.deps;
    if ((!api && !this.deps.v2) || !storage || this.tracking) return;
    this.tracking = true;
    try {
      const records = readHistory(storage);
      if (records.status !== 'READY') return;
      const claimed = records.records.map((r) => r.sourceTxHash).filter((h): h is string => !!h);
      const claimedOperations = records.records.flatMap((r) =>
        r.assetBinding && r.operationId
          ? [operationClaim(r.assetBinding, r.operationId, chainPair(r.direction).source)]
          : []
      );
      for (const record of records.records) {
        if (
          !isOpen(record.stage) ||
          record.stage === 'WALLET_PROMPT' ||
          record.stage === 'APPROVED' ||
          record.stage === 'FAILED'
        )
          continue;
        const profile = this.deps.v2
          ? record.assetBinding
            ? this.deps.v2.catalog.recorded(record.assetBinding)
            : sameBindings(record.bindings, RH_LANE)
            ? legacyTslaProfile(this.deps.v2.catalog)
            : null
          : null;
        const recordedLane = profile ? profileLane(profile) : lane;
        if ((this.deps.v2 && !profile) || !sameBindings(record.bindings, recordedLane)) continue;
        let patches: RecordPatch[] = [];
        try {
          patches = await trackRecord(record, {
            api,
            chains,
            lane: recordedLane,
            nowMs: this.deps.now(),
            claimedHashes: claimed,
            claimedOperations,
            direction: record.direction,
            ...(this.deps.v2 && profile ? { v2: { api: this.deps.v2.api, binding: profile.descriptor.binding } } : {}),
          });
        } catch {
          continue; // read failure: try again next poll
        }
        for (const patch of patches) {
          try {
            updateRecord(storage, record.id, patch, this.deps.now());
            if (profile && patch.operationId)
              claimedOperations.push(
                operationClaim(profile.descriptor.binding, patch.operationId, chainPair(record.direction).source)
              );
          } catch {
            break;
          }
        }
      }
    } finally {
      this.tracking = false;
      this.reloadHistory();
    }
  }

  hasOpenRecords(): boolean {
    return this.snapshot.history.records.some((r) => isOpen(r.stage) && r.stage !== 'APPROVED');
  }
}
