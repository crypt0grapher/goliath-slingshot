// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveWeb3React } from '../index';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { getNativeBalance, getTokenBalance } from '../../services/bridgeProviders';
import { formatAmount } from '../../utils/bridge/amounts';

export function useBridgeBalances(token: BridgeTokenSymbol, network: BridgeNetwork, enabled = true) {
  const { account } = useActiveWeb3React();
  const key = `${enabled ? account || '' : ''}|${network}|${token}|${enabled}`;
  const [snapshot, setSnapshot] = useState<{ key: string; raw?: bigint; error?: string }>({ key: '' });
  const [revision, setRevision] = useState(0);
  const aggressiveUntil = useRef(0);
  const refetch = useCallback(() => {
    setRevision((n) => n + 1);
  }, []);
  const triggerAggressivePolling = useCallback(() => {
    aggressiveUntil.current = Date.now() + 10000;
    refetch();
  }, [refetch]);
  useEffect(() => {
    if (!enabled || !account) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const config = getTokenConfigForChain(token, network);
        const raw = config.isNative
          ? await getNativeBalance(account, network)
          : config.address
          ? await getTokenBalance(config.address, account, network)
          : undefined;
        if (!stopped) setSnapshot(raw === undefined ? { key, error: 'Balance not available' } : { key, raw });
      } catch {
        if (!stopped) setSnapshot({ key, error: 'Balance not available' });
      }
      if (!stopped) timer = setTimeout(poll, Date.now() < aggressiveUntil.current ? 2000 : 5000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [account, enabled, key, network, revision, token]);
  const current = enabled && account && snapshot.key === key ? snapshot : undefined;
  return {
    balance: current?.raw === undefined ? '-' : formatAmount(current.raw, token, network),
    balanceAtomic: current?.raw ?? BigInt(0),
    isLoading: !!enabled && !!account && !current,
    error: current?.error ?? null,
    refetch,
    triggerAggressivePolling,
  };
}
