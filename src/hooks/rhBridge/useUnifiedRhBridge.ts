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
import { formatUnits } from '../../services/rhBridge/lane';
import { RhLaneController } from './controller';
import type { ControllerDeps } from './controller';
import type { BridgeAdapter, BridgeObservation } from '../bridge/BridgeSession';
import { selectionKey } from '../bridge/BridgeSession';
import { formatBridgeEta } from '../../components/bridge/presentation';
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
        lastForm.current = key;
        controller.setSelection(
          enabled && routeFor(live.originNetwork, live.destinationNetwork)?.engine === 'RH'
            ? live.selectedAssetKey
            : null,
          live.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH',
          live.inputAmount,
          live.recipient || ''
        );
        bumpTransition((x) => x + 1);
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
      if (controller.hasOpenRecords()) await controller.trackOnce();
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
    selection.inputAmount,
    selection.recipient,
    account,
    chainId,
    provider,
    transitionEpoch,
    override?.now,
  ]);
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
    const checking = snapshot.v2Loading || (!snapshot.v2 && !snapshot.notice);
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
    const eta = x?.state.etaSeconds[selection.originNetwork === BridgeNetwork.ROBINHOOD ? 'RH_TO_ONYX' : 'ONYX_TO_RH'];
    return {
      selectionKey: selectionKey(selection, wallet.account, wallet.chainId),
      binding: profile.descriptor.binding,
      fee: observation(display(quote?.fee)),
      net: observation(display(quote?.net)),
      eta: observation(formatBridgeEta(eta)),
      perTxMax: observation(display(x?.capacity.perTxMax)),
      remainingCapacity: observation(display(x?.capacity.remainingCapacity)),
      sourceBalance: account ? observation(display(x?.sourceBalance)) : { status: 'disconnected' },
      destinationBalance: account ? observation(display(x?.destinationBalance)) : { status: 'disconnected' },
      maxAmount: fresh ? display(x?.maxRaw) : undefined,
      validUntil: x?.validUntil,
      canApprove: fresh && view.canApprove,
      canConfirm: fresh && view.canBridge,
      busy: snapshot.busy !== null,
      notice: snapshot.notice ?? (fresh && !view.gate.open ? 'New transfers are closed for this asset.' : undefined),
      approve: (guard) => controller.approve(guard),
      confirm: (guard) => controller.bridge(guard),
      refresh: () => void controller.refreshLane(),
    };
  })();
  return { controller, snapshot, adapter };
}
