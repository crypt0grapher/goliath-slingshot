// #/bridge/robinhood-testnet — Robinhood Chain testnet <-> Onyx testnet TSLA lane.
// Uses the app's web3-react injected connector (46630 supported); other connectors are
// shown a clear "injected wallets only" state and never get a live action.
import React, { useMemo } from 'react';
import { injected } from '../../connectors';
import { RH_API_ORIGIN, RH_LANE, RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';
import { useActiveWeb3React } from '../../hooks';
import { ControllerDeps } from '../../hooks/rhBridge/controller';
import { useRhBridge } from '../../hooks/rhBridge/useRhBridge';
import { WalletState } from '../../hooks/rhBridge/view';
import { useWalletModalToggle } from '../../state/application/hooks';
import { createChainReader } from '../../services/rhBridge/chainReads';
import { createBrowserRhApiClient, RhApiClient } from '../../services/rhBridge/httpApi';
import { Eip1193, isEip1193 } from '../../services/rhBridge/wallet';
import { HistoryStorage } from '../../state/rhBridge/history';
import RhBridgeView from './RhBridgeView';

export { RhBridgeEntryLink } from './EntryLink';

function browserStorage(): HistoryStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
function browserApi(): RhApiClient | null {
  try {
    return createBrowserRhApiClient(RH_API_ORIGIN);
  } catch {
    return null;
  }
}
function randomHex(): string {
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function createBrowserDeps(): ControllerDeps {
  return {
    api: browserApi(),
    chains: createChainReader(window.fetch.bind(window)),
    storage: browserStorage(),
    lane: RH_LANE,
    now: () => Date.now(),
    randomHex,
  };
}

function RhBridgeLive() {
  const { account, chainId, connector, library, active } = useActiveWeb3React();
  const toggleWalletModal = useWalletModalToggle();
  const deps = useMemo(createBrowserDeps, []);
  const isInjected = active && connector === injected;
  const provider: Eip1193 | null =
    isInjected && library && isEip1193(library.provider) ? (library.provider as Eip1193) : null;
  const wallet: WalletState = {
    account: active && account ? account.toLowerCase() : null,
    chainId: active && typeof chainId === 'number' ? chainId : null,
    isInjected,
    hasProvider: provider !== null,
  };
  const hook = useRhBridge(deps, wallet, provider);
  return <RhBridgeView hook={hook} lane={RH_LANE} onConnect={toggleWalletModal} />;
}

export default function RhBridgePage({ enabled = RH_TESTNET_BRIDGE_ENABLED }: { enabled?: boolean }) {
  return enabled ? <RhBridgeLive /> : null;
}
