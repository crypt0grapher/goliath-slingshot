// SPDX-License-Identifier: Apache-2.0
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useStore } from 'react-redux';
import { injected } from '../../connectors';
import { useActiveWeb3React } from '../index';
import type { BridgeSelection } from '../../constants/bridge/registry';
import { routeFor, normalizeBridgeSelection } from '../../constants/bridge/registry';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { RH_API_ORIGIN, RH_LANE } from '../../config/rhBridge';
import { REVIEWED_PROFILES } from '../../config/rhBridge/profiles';
import { createChainReader } from '../../services/rhBridge/chainReads';
import { createV2ApiClient } from '../../services/rhBridge/v2-api';
import { isEip1193 } from '../../services/rhBridge/wallet';
import { formatUnits, previewTransferAmounts } from '../../services/rhBridge/lane';
import { profileLimits } from '../../config/rhBridge/profiles';
import { RhLaneController } from './controller';
import type { ControllerDeps } from './controller';
import type { BridgeAdapter, BridgeObservation } from '../bridge/BridgeSession';
import { selectionKey } from '../bridge/BridgeSession';
import { formatBridgeEta, shownObservation } from '../../components/bridge/presentation';
import type { PresentedBalance } from '../../services/rhBridge/balanceObservations';
import { shouldPollBalances } from '../../services/rhBridge/balanceSchedule';
import type { BridgeAuthority } from '../bridge/BridgeSession';
function browserDeps(): ControllerDeps {
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    /* Fail closed if durable intent storage is unavailable. */
  }
  const transport: typeof fetch = (url, init) => window.fetch(url, init);
  return {
    api: null,
    chains: createChainReader(transport),
    storage,
    lane: RH_LANE,
    now: Date.now,
    randomHex: () => {
      const bytes = new Uint8Array(4);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
    v2: { api: createV2ApiClient(RH_API_ORIGIN, transport), catalog: REVIEWED_PROFILES },
  };
}
export function useUnifiedRhBridge(selection: BridgeSelection, enabled: boolean, override?: ControllerDeps) {
  const [controller] = useState(() => new RhLaneController(override ?? browserDeps()));
  const [snapshot, setSnapshot] = useState(controller.state);
  const [, tick] = useState(0);
  const [transitionEpoch, bumpTransition] = useState(0);
  const store = useStore<{ bridge: { form: unknown } }>();
  const lastForm = useRef(selectionKey(selection));
  const shown = useRef<
    Partial<
      Record<
        'fee' | 'net' | 'eta' | 'perTxMax' | 'remainingCapacity' | 'sourceBalance' | 'destinationBalance',
        BridgeObservation
      >
    >
  >({});
  const shownIdentity = useRef('');
  const wallet = useActiveWeb3React();
  const provider =
    wallet.active && wallet.connector === injected && isEip1193(wallet.library?.provider)
      ? wallet.library!.provider
      : null;
  const account = wallet.active && wallet.account ? wallet.account.toLowerCase() : null;
  const chainId = wallet.active && typeof wallet.chainId === 'number' ? wallet.chainId : null;
  const rh = enabled && routeFor(selection.originNetwork, selection.destinationNetwork)?.engine === 'RH';
  useLayoutEffect(() => controller.subscribe(setSnapshot), [controller]);
  useLayoutEffect(
    () =>
      store.subscribe(() => {
        const live = normalizeBridgeSelection(store.getState().bridge.form, enabled),
          key = selectionKey(live);
        if (key === lastForm.current) return;
        const previous = lastForm.current.split('|');
        const next = key.split('|');
        const amountOnly =
          previous.length === next.length && next.every((part, index) => index === 3 || part === previous[index]);
        lastForm.current = key;
        controller.setSelection(
          enabled && routeFor(live.originNetwork, live.destinationNetwork)?.engine === 'RH'
            ? live.selectedAssetKey
            : null,
          live.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH',
          live.inputAmount,
          live.recipient || ''
        );
        if (!amountOnly) bumpTransition((x) => x + 1);
      }),
    [store, enabled, controller]
  );
  useEffect(() => {
    const events = provider as typeof provider & {
      on?: (event: string, handler: () => void) => void;
      removeListener?: (event: string, handler: () => void) => void;
    };
    const invalidate = () => {
      controller.invalidateContext();
      bumpTransition((x) => x + 1);
    };
    events?.on?.('accountsChanged', invalidate);
    events?.on?.('chainChanged', invalidate);
    return () => {
      events?.removeListener?.('accountsChanged', invalidate);
      events?.removeListener?.('chainChanged', invalidate);
    };
  }, [provider, controller]);
  useLayoutEffect(() => {
    controller.setWallet({ account, chainId, isInjected: provider !== null, hasProvider: provider !== null }, provider);
    controller.setSelection(
      rh ? selection.selectedAssetKey : null,
      selection.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH',
      selection.inputAmount,
      selection.recipient || ''
    );
  }, [
    controller,
    account,
    chainId,
    provider,
    rh,
    selection.originNetwork,
    selection.selectedAssetKey,
    selection.inputAmount,
    selection.recipient,
  ]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      failures = 0;
    const now = override?.now ?? Date.now;
    const loop = async () => {
      if (stopped) return;
      const started = now();
      if (rh) await controller.refreshLane();
      if (stopped) return;
      const elapsed = Math.max(0, now() - started);
      let delay = 10000;
      if (rh) {
        const current = controller.state.v2;
        if (current && now() < current.validUntil) {
          failures = 0;
          const headroom = Math.max(2000, elapsed + 1000);
          delay = Math.max(1000, 10000 - elapsed, Math.min(10000, current.validUntil - now() - headroom));
        } else {
          failures++;
          delay = Math.min(60000, 10000 * Math.pow(2, failures - 1));
        }
      }
      const nextReadAt = now() + delay;
      if (!stopped) timer = setTimeout(loop, Math.max(1000, nextReadAt - now()));
    };
    timer = setTimeout(loop, rh ? 300 : 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [
    controller,
    rh,
    selection.selectedAssetKey,
    selection.originNetwork,
    selection.destinationNetwork,
    selection.recipient,
    account,
    chainId,
    provider,
    transitionEpoch,
    override?.now,
  ]);
  useEffect(() => {
    if (!rh) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stopped) return;
      // Approval receipts are polled on their own clock so a held snapshot cannot delay them.
      if (controller.hasOpenRecords()) void controller.trackOnce();
      if (shouldPollBalances(typeof document === 'undefined' || document.visibilityState !== 'hidden'))
        controller.refreshBalances('poll');
      if (!stopped) timer = setTimeout(tick, 1000);
    };
    timer = setTimeout(tick, 1000);
    const onVisible = () => {
      if (!stopped && document.visibilityState === 'visible') controller.refreshBalances('focus');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [controller, rh]);
  useEffect(() => {
    if (!rh) return undefined;
    const timer = setTimeout(() => void controller.refreshAmountQuote(), 400);
    return () => clearTimeout(timer);
  }, [controller, rh, selection.inputAmount, selection.selectedAssetKey, selection.originNetwork]);
  useEffect(() => {
    const timer = setInterval(() => tick((x) => x + 1), 1000);
    const storage = () => controller.onStorageEvent();
    window.addEventListener('storage', storage);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', storage);
      controller.dispose();
    };
  }, [controller]);
  const adapter = ((): BridgeAdapter | undefined => {
    if (!rh) return undefined;
    const profile = (override?.v2?.catalog ?? REVIEWED_PROFILES).current(selection.selectedAssetKey);
    if (!profile) return undefined;
    const x = snapshot.v2 ?? snapshot.v2Display,
      valid = x && x.profile.descriptor.binding.profileSha256 === profile.descriptor.binding.profileSha256;
    const fresh = !!valid && x === snapshot.v2 && (override?.now ?? Date.now)() < x!.validUntil;
    const checking =
      !!snapshot.v2Loading || (!snapshot.v2 && !snapshot.v2Display && !snapshot.v2ReadFailed && !snapshot.notice);
    const observation = (value: string | undefined): BridgeObservation =>
      checking && (!valid || value === undefined)
        ? { status: 'loading' }
        : !valid
        ? { status: 'unavailable' }
        : !fresh
        ? { status: 'stale', value }
        : value === undefined
        ? { status: 'unavailable' }
        : { status: 'ready', value };
    const view = controller.view(),
      quote = view.grossRaw && x?.gross === view.grossRaw ? x.quote : undefined;
    const display = (raw: string | undefined) => (raw === undefined ? undefined : formatUnits(raw, 18));
    const direction = selection.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH';
    const amounts = previewTransferAmounts(
      direction,
      view.grossRaw,
      quote,
      x?.limits?.fee ?? profileLimits(profile).fee
    );
    const shownAmount = (raw: string): BridgeObservation => ({ status: 'ready', value: formatUnits(raw, 18) });
    const eta = x?.state.etaSeconds[selection.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH'];
    const identity = [
      selection.originNetwork,
      selection.destinationNetwork,
      selection.selectedAssetKey,
      account || '',
    ].join('|');
    if (shownIdentity.current !== identity) {
      shownIdentity.current = identity;
      shown.current = {};
    }
    const show = (
      field: 'fee' | 'net' | 'eta' | 'perTxMax' | 'remainingCapacity' | 'sourceBalance' | 'destinationBalance',
      value: BridgeObservation
    ): BridgeObservation => {
      const kept = shownObservation(value, shown.current[field]);
      if (kept.value !== undefined || kept.status === 'disconnected') shown.current[field] = kept;
      return kept;
    };
    return {
      selectionKey: selectionKey(selection, wallet.account, wallet.chainId),
      binding: profile.descriptor.binding,
      fee: show('fee', shownAmount(amounts.feeRaw)),
      net: show('net', shownAmount(amounts.netRaw)),
      eta: show('eta', observation(formatBridgeEta(eta))),
      perTxMax: show('perTxMax', observation(display(x?.capacity.perTxMax))),
      remainingCapacity: show('remainingCapacity', observation(display(x?.capacity.remainingCapacity))),
      sourceBalance: presentChannel(
        snapshot.balanceChannel?.source,
        show('sourceBalance', account ? observation(display(x?.sourceBalance)) : { status: 'disconnected' }),
        !!account,
        (override?.now ?? Date.now)()
      ),
      destinationBalance: presentChannel(
        snapshot.balanceChannel?.destination,
        show('destinationBalance', account ? observation(display(x?.destinationBalance)) : { status: 'disconnected' }),
        !!account,
        (override?.now ?? Date.now)()
      ),
      maxAmount: fresh ? display(x?.maxRaw) : undefined,
      validUntil: x?.validUntil,
      authority: authorityFrom(snapshot.v2, fresh, (override?.now ?? Date.now)()),
      checking,
      canApprove: fresh && view.canApprove,
      canConfirm: fresh && view.canBridge,
      busy: snapshot.busy !== null,
      notice: snapshot.notice ?? (fresh && !view.gate.open ? 'New transfers are closed for this asset.' : undefined),
      approve: (guard) => controller.approve(guard),
      confirm: (guard) => controller.bridge(guard),
      refresh: () => void controller.refreshLane(),
      refreshBalances: () => controller.refreshBalances('manual'),
      refreshAfterReceipt: () => controller.refreshAfterReceipt(),
    };
  })();
  return { controller, snapshot, adapter };
}

function authorityFrom(
  v2:
    | {
        sourceBalance?: string;
        capacity: { perTxMax: string; remainingCapacity: string };
        maxRaw?: string;
        validUntil: number;
      }
    | null
    | undefined,
  fresh: boolean,
  nowMs: number
): BridgeAuthority {
  return {
    fresh: !!v2 && fresh && nowMs < v2.validUntil,
    sourceBalanceAtomic: v2?.sourceBalance,
    perTxMaxAtomic: v2?.capacity.perTxMax,
    remainingCapacityAtomic: v2?.capacity.remainingCapacity,
    maxAmountAtomic: v2?.maxRaw,
    validUntil: v2?.validUntil,
  };
}

function presentChannel(
  presented: PresentedBalance | undefined,
  fallback: BridgeObservation,
  connected: boolean,
  nowMs: number
): BridgeObservation {
  if (!connected) return { status: 'disconnected' };
  if (!presented || presented.status === 'idle') return fallback;
  const value = presented.valueAtomic !== undefined ? formatUnits(presented.valueAtomic, 18) : undefined;
  const observedAt = presented.clock?.observedAtMs;
  const expired = !!presented.clock && nowMs >= presented.clock.expiresAtMs;
  if (presented.status === 'disconnected') return { status: 'disconnected' };
  if ((presented.status === 'ready' || presented.status === 'refreshing') && value !== undefined && !expired)
    return {
      status: presented.status === 'refreshing' ? 'refreshing' : 'ready',
      value,
      observedAt,
    };
  if (value !== undefined && (presented.status === 'stale' || presented.status === 'unavailable' || expired))
    return { status: presented.status === 'unavailable' ? 'unavailable' : 'stale', value, observedAt };
  if (presented.status === 'loading') return { status: 'loading' };
  return { status: 'unavailable', observedAt };
}
