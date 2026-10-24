// SPDX-License-Identifier: Apache-2.0
// Header is outside the page provider. It shares the same prompt owner and source-only guard.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { selectBridgeForm } from '../../state/bridge/selectors';
import { normalizeBridgeSelection } from '../../constants/bridge/registry';
import { NETWORK_METADATA } from '../../constants/bridge/networks';
import { RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';
import { useBridgeNetworkSwitch } from './useBridgeNetworkSwitch';
import { acquireWalletAction, StaleBridgeIntent, subscribeWalletActions, walletActionBusy } from './walletIntent';
export function useBridgeSourceSwitch(active: boolean) {
  const raw = useSelector(selectBridgeForm),
    store = useStore<{ bridge: { form: unknown } }>();
  const selection = normalizeBridgeSelection(raw, RH_TESTNET_BRIDGE_ENABLED);
  const { account, library } = useActiveWeb3React();
  const network = useBridgeNetworkSwitch();
  const [busy, setBusy] = useState(walletActionBusy);
  useEffect(() => subscribeWalletActions(() => setBusy(walletActionBusy())), []);
  const mounted = useRef(true);
  useLayoutEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const frame = useRef({ source: selection.originNetwork, account, library, active, generation: 0 });
  if (
    frame.current.source !== selection.originNetwork ||
    frame.current.account !== account ||
    frame.current.library !== library ||
    frame.current.active !== active
  )
    frame.current = {
      source: selection.originNetwork,
      account,
      library,
      active,
      generation: frame.current.generation + 1,
    };
  useLayoutEffect(
    () =>
      store.subscribe(() => {
        const source = normalizeBridgeSelection(store.getState().bridge.form, RH_TESTNET_BRIDGE_ENABLED).originNetwork;
        if (source !== frame.current.source) {
          frame.current.source = source;
          frame.current.generation++;
        }
      }),
    [store]
  );
  const generation = frame.current.generation;
  return {
    source: NETWORK_METADATA[selection.originNetwork],
    busy: busy || network.isLoading,
    switchToSource: async () => {
      if (!active || !account) return;
      const owner = acquireWalletAction();
      if (!owner) return;
      try {
        await network.switchNetwork(selection.originNetwork, {
          expectedAccount: account,
          assertCurrent() {
            if (
              !mounted.current ||
              !owner.isOwner() ||
              frame.current.generation !== generation ||
              normalizeBridgeSelection(store.getState().bridge.form, RH_TESTNET_BRIDGE_ENABLED).originNetwork !==
                selection.originNetwork
            )
              throw new StaleBridgeIntent();
          },
        });
      } finally {
        owner.release();
      }
    },
  };
}
