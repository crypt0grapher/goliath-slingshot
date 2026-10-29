// SPDX-License-Identifier: Apache-2.0
import { useLayoutEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';
export default function CompatibilityRedirect() {
  const dispatch = useDispatch(),
    history = useHistory(),
    done = useRef(false);
  useLayoutEffect(() => {
    if (done.current) return;
    done.current = true;
    dispatch(
      bridgeActions.hydrateForm({
        originNetwork: RH_TESTNET_BRIDGE_ENABLED ? BridgeNetwork.ROBINHOOD : BridgeNetwork.SEPOLIA,
        destinationNetwork: BridgeNetwork.GOLIATH,
        selectedAssetKey: RH_TESTNET_BRIDGE_ENABLED ? 'TSLA' : 'SEPOLIA_ETH',
        inputAmount: '',
        recipient: null,
      })
    );
    history.replace('/bridge');
  }, [dispatch, history]);
  return null;
}
