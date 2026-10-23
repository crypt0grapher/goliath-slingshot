// React binding of RhLaneController: subscribes to its snapshot and drives the polls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RH_POLL_BACKOFF_MS, RH_POLL_MS } from '../../config/rhBridge';
import { RH_HISTORY_KEY } from '../../constants/rhBridge';
import { Eip1193 } from '../../services/rhBridge/wallet';
import { ControllerDeps, RhLaneController } from './controller';
import { LaneSnapshot, LaneView, WalletState } from './view';

export interface RhBridgeHook {
  snapshot: LaneSnapshot;
  view: LaneView;
  controller: RhLaneController;
}

export function useRhBridge(
  deps: ControllerDeps,
  wallet: WalletState,
  provider: Eip1193 | null,
  pollMs = RH_POLL_MS
): RhBridgeHook {
  const depsRef = useRef(deps);
  const controller = useMemo(() => new RhLaneController(depsRef.current), []);
  const [snapshot, setSnapshot] = useState<LaneSnapshot>(controller.state);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    const onStorage = (event: StorageEvent) => {
      if (event.key === RH_HISTORY_KEY) controller.onStorageEvent();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    controller.setWallet(wallet, provider);
  }, [controller, wallet.account, wallet.chainId, wallet.isInjected, wallet.hasProvider, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lane state and record tracking: read-only polls with a backoff while the API is unreachable.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const loop = async () => {
      await controller.refreshLane();
      if (controller.hasOpenRecords()) await controller.trackOnce();
      if (stopped) return;
      const failing = controller.state.api.failure !== undefined;
      timer = setTimeout(loop, failing ? Math.max(RH_POLL_BACKOFF_MS, pollMs) : pollMs);
    };
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [controller, pollMs]);

  const recipientKey = snapshot.recipientText.trim() || snapshot.wallet.account || '';
  // Chain reads follow the account, direction and recipient (debounced) and refresh periodically.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      void controller.refreshChain();
      interval = setInterval(() => void controller.refreshChain(), Math.max(pollMs * 2, 10000));
    }, 300);
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [controller, snapshot.wallet.account, snapshot.wallet.chainId, snapshot.direction, recipientKey, pollMs]);

  // A displayed exit quote follows the amount (debounced). Refreshing an expired quote is a user click.
  const hasLimits = snapshot.api.limits !== undefined;
  useEffect(() => {
    if (snapshot.direction !== 'ONYX_TO_RH' || !snapshot.amountText.trim()) return;
    const timer = setTimeout(() => void controller.refreshQuote(), 400);
    return () => clearTimeout(timer);
  }, [controller, snapshot.direction, snapshot.amountText, hasLimits]);

  const view = controller.view();
  return { snapshot, view, controller };
}
