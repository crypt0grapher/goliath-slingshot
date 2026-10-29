// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { useWalletModalToggle } from '../../state/application/hooks';
import { bridgeActions } from '../../state/bridge/reducer';
import { selectBridgeForm, selectIsConfirmModalOpen } from '../../state/bridge/selectors';
import type { BridgeSelection } from '../../constants/bridge/registry';
import { BRIDGE_ASSETS, normalizeBridgeSelection, routeFor } from '../../constants/bridge/registry';
import { NETWORK_METADATA } from '../../constants/bridge/networks';
import { bridgeConfig } from '../../config/bridgeConfig';
import { RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';
import { useBridgeForm } from './useBridgeForm';
import { useBridgeApprove } from './useBridgeApprove';
import { useBridgeDeposit } from './useBridgeDeposit';
import { useBridgeBurn } from './useBridgeBurn';
import { useBridgeXcnWithdraw } from './useBridgeXcnWithdraw';
import { useBridgeNetworkSwitch } from './useBridgeNetworkSwitch';
import { getStaticEtaEstimate } from '../../utils/bridge/eta';
import { BridgeSessionContext } from './BridgeSessionContext';
import type { WalletIntentGuard, WalletActionOwner } from './walletIntent';
import {
  acquireWalletAction,
  beforeWalletPrompt,
  isStaleBridgeIntent,
  StaleBridgeIntent,
  subscribeWalletActions,
  walletActionBusy,
} from './walletIntent';
import { presentBlocker } from '../../components/bridge/actionBlocker';
export { useOptionalBridgeSession, useBridgeSession } from './BridgeSessionContext';

export interface BridgeObservation {
  status: 'loading' | 'ready' | 'refreshing' | 'unavailable' | 'stale' | 'error' | 'disconnected';
  value?: string;
  observedAt?: number;
}
export interface BridgeAuthority {
  fresh: boolean;
  sourceBalanceAtomic?: string;
  perTxMaxAtomic?: string;
  remainingCapacityAtomic?: string;
  maxAmountAtomic?: string;
  validUntil?: number;
}
export const unavailable = (): BridgeObservation => ({ status: 'unavailable' });
export const observed = (value: string): BridgeObservation => ({ status: 'ready', value });
// UB-06 supplies the real profile-aware RH adapter. No fixture, token label or remote metadata enables RH here.
export interface BridgeAdapter {
  selectionKey: string;
  binding: { assetId: string; profileSha256: string; profileVersion: number; abiVersion: string };
  fee: BridgeObservation;
  net: BridgeObservation;
  eta: BridgeObservation;
  perTxMax: BridgeObservation;
  remainingCapacity: BridgeObservation;
  sourceBalance: BridgeObservation;
  destinationBalance: BridgeObservation;
  maxAmount?: string;
  canApprove: boolean;
  canConfirm: boolean;
  busy: boolean;
  notice?: string;
  validUntil?: number;
  authority?: BridgeAuthority;
  checking?: boolean;
  approve: (guard?: WalletIntentGuard) => Promise<void>;
  confirm: (guard?: WalletIntentGuard) => Promise<void>;
  refresh: () => void;
  refreshBalances?: () => void;
  refreshAfterReceipt?: () => void;
}
export const selectionKey = (s: BridgeSelection, account?: string | null, walletChain?: number | null): string =>
  [
    s.originNetwork,
    s.destinationNetwork,
    s.selectedAssetKey,
    s.inputAmount,
    s.recipient || account || '',
    account || '',
    walletChain || '',
  ].join('|');

function maximumReady(adapter: BridgeAdapter | undefined, assetKey: string, now: number): boolean {
  if (
    !adapter ||
    adapter.binding.assetId !== assetKey ||
    !/^[0-9a-f]{64}$/.test(adapter.binding.profileSha256) ||
    adapter.binding.profileVersion !== (assetKey === 'RH_ETH' ? 2 : 1) ||
    typeof adapter.binding.abiVersion !== 'string' ||
    !adapter.binding.abiVersion.length ||
    adapter.binding.abiVersion.length > 128
  )
    return false;
  if (adapter.authority) {
    if (!adapter.authority.fresh) return false;
    if (
      adapter.authority.validUntil !== undefined &&
      (!Number.isFinite(adapter.authority.validUntil) || now >= adapter.authority.validUntil)
    )
      return false;
    try {
      const max = BigInt(adapter.authority.maxAmountAtomic ?? '');
      const bounds = [
        adapter.authority.perTxMaxAtomic,
        adapter.authority.remainingCapacityAtomic,
        adapter.authority.sourceBalanceAtomic,
      ].map((value) => BigInt(value ?? ''));
      return max > BigInt(0) && bounds.every((bound) => max <= bound);
    } catch {
      return false;
    }
  }
  if (adapter.validUntil !== undefined && (!Number.isFinite(adapter.validUntil) || now >= adapter.validUntil))
    return false;
  if (
    ![adapter.perTxMax, adapter.remainingCapacity, adapter.sourceBalance].every(
      (o) => o.status === 'ready' && o.value !== undefined
    )
  )
    return false;
  try {
    const values = [
      adapter.maxAmount,
      adapter.perTxMax.value,
      adapter.remainingCapacity.value,
      adapter.sourceBalance.value,
    ].map((value) => {
      if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value))
        throw new Error('MAX_UNAVAILABLE');
      const [whole, fraction = ''] = value.split('.'),
        raw = BigInt(whole + fraction.padEnd(18, '0'));
      if (raw >= BigInt(1) << BigInt(256)) throw new Error('MAX_UNAVAILABLE');
      return raw;
    });
    return values[0] > BigInt(0) && values.slice(1).every((bound) => values[0] <= bound);
  } catch {
    return false;
  }
}

function useSession(rhEnabled: boolean, rhAdapter?: BridgeAdapter) {
  const raw = useSelector(selectBridgeForm);
  const selection = normalizeBridgeSelection(raw, rhEnabled);
  const route = routeFor(selection.originNetwork, selection.destinationNetwork)!;
  const asset = BRIDGE_ASSETS[selection.selectedAssetKey];
  const dispatch = useDispatch();
  const store = useStore<{ bridge: { form: unknown } }>();
  const { account, chainId, library } = useActiveWeb3React();
  const connect = useWalletModalToggle();
  const legacy = useBridgeForm(route.engine === 'LEGACY');
  const approval = useBridgeApprove(legacy.selectedToken, legacy.originNetwork, legacy.inputAmount);
  const deposit = useBridgeDeposit();
  const burn = useBridgeBurn();
  const xcn = useBridgeXcnWithdraw();
  const network = useBridgeNetworkSwitch();
  const modalOpen = useSelector(selectIsConfirmModalOpen);
  const [busy, setBusy] = useState(false);
  const [sharedBusy, setSharedBusy] = useState(walletActionBusy);
  useEffect(() => subscribeWalletActions(() => setSharedBusy(walletActionBusy())), []);
  const actionLock = useRef(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [confirmation, setConfirmation] = useState<{
    key: string;
    generation: number;
    formGeneration: number;
    amount: string;
    recipient: string;
  } | null>(null);
  const key = selectionKey(selection, account, chainId);
  const rh = route.engine === 'RH' && rhAdapter?.selectionKey === key ? rhAdapter : undefined;
  const recipient = selection.recipient || account || '';
  const recipientEditable = route.engine === 'RH' || bridgeConfig.allowCustomRecipient;
  const recipientValid =
    /^0x[0-9a-fA-F]{40}$/.test(recipient) &&
    !/^0x0{40}$/.test(recipient) &&
    (recipientEditable || recipient.toLowerCase() === account?.toLowerCase());
  const walletMatches = !!account && chainId === NETWORK_METADATA[selection.originNetwork].chainId;
  const balance = (value: string, loading: boolean, error: string | null): BridgeObservation =>
    !account
      ? { status: 'disconnected' }
      : error
      ? { status: 'error' }
      : loading || value === '-'
      ? { status: 'loading' }
      : observed(value);
  const quoted = legacy.feeQuote;
  const fee =
    route.engine === 'RH'
      ? rh?.fee ?? unavailable()
      : legacy.isFeeLoading
      ? { status: 'loading' as const }
      : legacy.isFeeStale
      ? { status: 'stale' as const }
      : legacy.feeError
      ? { status: 'error' as const }
      : quoted
      ? observed(quoted.feeFormatted)
      : unavailable();
  const net =
    route.engine === 'RH'
      ? rh?.net ?? unavailable()
      : fee.status === 'ready' && quoted
      ? observed(quoted.outputFormatted)
      : { status: fee.status };
  const sourceBalance =
    route.engine === 'RH'
      ? rh?.sourceBalance ?? (account ? unavailable() : { status: 'disconnected' as const })
      : balance(legacy.originBalance, legacy.isBalanceLoading, legacy.balanceError);
  const destinationBalance =
    route.engine === 'RH'
      ? rh?.destinationBalance ?? (account ? unavailable() : { status: 'disconnected' as const })
      : balance(legacy.destinationBalance, legacy.isDestinationBalanceLoading, legacy.destinationBalanceError);
  const authorityFresh =
    !!rh?.authority &&
    rh.authority.fresh &&
    (rh.authority.validUntil === undefined || Date.now() < rh.authority.validUntil);
  const rhReady =
    !!rh &&
    rh.binding.assetId === asset.key &&
    /^[0-9a-f]{64}$/.test(rh.binding.profileSha256) &&
    (rh.authority
      ? [rh.fee, rh.net, rh.perTxMax, rh.remainingCapacity]
      : [rh.fee, rh.net, rh.perTxMax, rh.remainingCapacity, rh.sourceBalance]
    ).every((o) => o.status === 'ready' && o.value !== undefined) &&
    (!rh.authority || authorityFresh);
  // MAX consumes the engine's fresh gas-bounded limit, even before an amount-bound quote exists.
  const rhMaxReady = maximumReady(rh, asset.key, Date.now());
  const canApprove =
    walletMatches &&
    recipientValid &&
    (route.engine === 'RH'
      ? rhReady && !!rh?.canApprove
      : legacy.validation.isValid &&
        fee.status === 'ready' &&
        sourceBalance.status === 'ready' &&
        legacy.needsApproval &&
        !legacy.isAllowanceLoading);
  const canConfirm =
    walletMatches &&
    recipientValid &&
    (route.engine === 'RH'
      ? rhReady && !!rh?.canConfirm
      : legacy.validation.isValid &&
        sourceBalance.status === 'ready' &&
        !legacy.needsApproval &&
        !legacy.isAllowanceLoading &&
        fee.status === 'ready');
  const providerSession = useRef({ provider: library, generation: 0 });
  if (providerSession.current.provider !== library)
    providerSession.current = { provider: library, generation: providerSession.current.generation + 1 };
  const intentKey = [
    key,
    providerSession.current.generation,
    rh?.binding.profileSha256 || '',
    rh?.binding.profileVersion || '',
    rh?.binding.abiVersion || '',
    legacy.quoteExpiresAt || '',
    fee.status,
    fee.value || '',
    net.value || '',
    rh?.remainingCapacity.status || '',
    rh?.remainingCapacity.value || '',
    rh?.perTxMax.value || '',
    rh?.authority ? String(rh.authority.fresh) : sourceBalance.status,
    rh?.authority ? rh.authority.sourceBalanceAtomic || '' : sourceBalance.value || '',
    rh?.authority?.maxAmountAtomic || '',
    canApprove,
    canConfirm,
  ].join('|');
  // Generations never return to an earlier identity, even when A -> B -> A restores every value.
  const currentIntent = useRef({ key: intentKey, generation: 0 });
  if (currentIntent.current.key !== intentKey)
    currentIntent.current = { key: intentKey, generation: currentIntent.current.generation + 1 };
  const intentGeneration = currentIntent.current.generation;
  const switchKey = [selection.originNetwork, account || '', providerSession.current.generation, rhEnabled].join('|');
  const currentSwitch = useRef({ key: switchKey, generation: 0 });
  if (currentSwitch.current.key !== switchKey)
    currentSwitch.current = { key: switchKey, generation: currentSwitch.current.generation + 1 };
  const switchGeneration = currentSwitch.current.generation;
  const formTransitions = useRef({
    key: selectionKey(selection),
    source: selection.originNetwork,
    full: 0,
    sourceOnly: 0,
  });
  const observeForm = useCallback(() => {
    const live = normalizeBridgeSelection(store.getState().bridge.form, rhEnabled);
    const liveKey = selectionKey(live);
    if (formTransitions.current.key !== liveKey) {
      formTransitions.current.key = liveKey;
      formTransitions.current.full++;
    }
    if (formTransitions.current.source !== live.originNetwork) {
      formTransitions.current.source = live.originNetwork;
      formTransitions.current.sourceOnly++;
    }
  }, [store, rhEnabled]);
  observeForm();
  // Observe every dispatch synchronously, including changes batched away before React renders.
  useLayoutEffect(() => store.subscribe(observeForm), [store, observeForm]);
  const formGeneration = formTransitions.current.full;
  const sourceGeneration = formTransitions.current.sourceOnly;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const confirmationValid =
    !!confirmation &&
    confirmation.key === intentKey &&
    confirmation.generation === intentGeneration &&
    confirmation.formGeneration === formGeneration &&
    canConfirm;
  useEffect(() => {
    if (
      raw.originNetwork !== selection.originNetwork ||
      raw.destinationNetwork !== selection.destinationNetwork ||
      raw.selectedAssetKey !== selection.selectedAssetKey
    )
      dispatch(bridgeActions.hydrateForm(selection));
  }, [dispatch, raw.originNetwork, raw.destinationNetwork, raw.selectedAssetKey, selection]);
  useEffect(() => {
    if (modalOpen && !confirmationValid) dispatch(bridgeActions.closeConfirmModal());
  }, [confirmationValid, dispatch, modalOpen]);

  const run = async (action: (owner: WalletActionOwner) => Promise<void>) => {
    if (actionLock.current || rh?.busy || legacy.isSubmitting || legacy.isApproving) return;
    const owner = acquireWalletAction();
    if (!owner) return;
    actionLock.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      await action(owner);
    } catch (error) {
      setNotice(
        isStaleBridgeIntent(error)
          ? 'Bridge details changed. Review them before continuing.'
          : 'The request could not be completed. Check your wallet before trying again.'
      );
    } finally {
      owner.release();
      actionLock.current = false;
      setBusy(false);
    }
  };
  const guardFor = (owner: WalletActionOwner, transfer = true): WalletIntentGuard => {
    const capturedIntent = transfer ? intentKey : switchKey;
    const capturedGeneration = transfer ? intentGeneration : switchGeneration;
    const capturedFormGeneration = transfer ? formGeneration : sourceGeneration;
    const expiresAt = transfer
      ? route.engine === 'LEGACY'
        ? legacy.quoteExpiresAt ?? Date.now() + 30000
        : rh?.validUntil ?? Date.now() + 30000
      : Infinity;
    return {
      expectedAccount: account || '',
      expectedChainId: transfer ? NETWORK_METADATA[selection.originNetwork].chainId : undefined,
      assertCurrent() {
        const live = normalizeBridgeSelection(store.getState().bridge.form, rhEnabled);
        const sameForm = transfer
          ? selectionKey(live, account, chainId) === key
          : live.originNetwork === selection.originNetwork;
        if (
          !mounted.current ||
          !owner.isOwner() ||
          !sameForm ||
          Date.now() >= expiresAt ||
          (transfer ? currentIntent.current : currentSwitch.current).key !== capturedIntent ||
          (transfer ? currentIntent.current : currentSwitch.current).generation !== capturedGeneration ||
          (transfer ? formTransitions.current.full : formTransitions.current.sourceOnly) !== capturedFormGeneration
        )
          throw new StaleBridgeIntent();
      },
    };
  };
  const approve = async () => {
    if (!canApprove) return;
    await run(async (owner) => {
      const guard = guardFor(owner);
      guard.assertCurrent();
      if (route.engine === 'RH') await rh!.approve(guard);
      else if (await approval.approve(guard)) legacy.refetchAllowance();
    });
  };
  const confirm = async () => {
    if (!confirmationValid || !confirmation || currentIntent.current.key !== confirmation.key) return;
    const captured = confirmation;
    await run(async (owner) => {
      const guard = guardFor(owner);
      guard.assertCurrent();
      if (route.engine === 'RH') {
        await rh!.confirm(guard);
        return;
      }
      // Read the wallet again before handing the exact captured intent to the existing legacy engine.
      if (!library) return;
      await beforeWalletPrompt(guard, library);
      if (legacy.direction === 'SEPOLIA_TO_GOLIATH')
        await deposit.deposit(legacy.selectedToken, captured.amount, captured.recipient, guard);
      else if (legacy.selectedToken === 'XCN')
        await xcn.withdraw(legacy.selectedToken, captured.amount, captured.recipient, guard);
      else await burn.burn(legacy.selectedToken, captured.amount, captured.recipient, guard);
      legacy.triggerBalanceRefresh();
    });
  };
  return {
    selection,
    route,
    asset,
    rhEnabled,
    account,
    recipient,
    recipientEditable,
    fee,
    net,
    sourceBalance,
    destinationBalance,
    eta:
      route.engine === 'RH'
        ? rh?.eta ?? unavailable()
        : observed(`${getStaticEtaEstimate(legacy.direction)} (estimate)`),
    perTxMax: route.engine === 'RH' ? rh?.perTxMax ?? unavailable() : unavailable(),
    remainingCapacity: route.engine === 'RH' ? rh?.remainingCapacity ?? unavailable() : unavailable(),
    busy: busy || sharedBusy || !!rh?.busy || legacy.isSubmitting || legacy.isApproving,
    canApprove,
    canConfirm,
    confirmationValid,
    confirmation,
    notice: notice || rh?.notice || (route.engine === 'LEGACY' ? legacy.validation.errorMessage?.key : undefined),
    actionReason: (() => {
      let balance: 'ok' | 'unknown' | 'insufficient' = sourceBalance.status === 'ready' ? 'ok' : 'unknown';
      const authority = rh?.authority;
      if (authority?.sourceBalanceAtomic && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(selection.inputAmount)) {
        try {
          const [whole, fraction = ''] = selection.inputAmount.split('.');
          const raw = BigInt((whole + fraction.padEnd(18, '0')).slice(0, whole.length + 18));
          if (raw > BigInt(authority.sourceBalanceAtomic)) balance = 'insufficient';
        } catch {
          balance = 'unknown';
        }
      }
      const blocker = presentBlocker({
        connected: !!account,
        walletMatches,
        walletPrompt: false,
        inFlight: busy || sharedBusy || !!rh?.busy,
        recipientValid,
        amountValid: /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(selection.inputAmount),
        balance,
        gas: authorityFresh ? 'ok' : 'unknown',
        checking: !!rh?.checking && !authorityFresh,
        held: false,
        capacityExceeded: false,
        quoteReady: fee.status === 'ready',
        eligible: true,
        historyReady: true,
        authorityFresh: rh?.authority ? authorityFresh : sourceBalance.status === 'ready' && fee.status === 'ready',
      });
      return account && blocker && blocker.code !== 'CONNECT' ? blocker.message : undefined;
    })(),
    connect,
    approve,
    confirm,
    switchToSource: () =>
      run(async (owner) => {
        await network.switchNetwork(selection.originNetwork, guardFor(owner, false));
      }),
    openConfirm: () => {
      if (!canConfirm || actionLock.current) return;
      setConfirmation({
        key: intentKey,
        generation: intentGeneration,
        formGeneration,
        amount: selection.inputAmount,
        recipient,
      });
      dispatch(bridgeActions.openConfirmModal());
    },
    closeConfirm: () => {
      if (!actionLock.current) {
        setConfirmation(null);
        dispatch(bridgeActions.closeConfirmModal());
      }
    },
    setMax: () => {
      if (route.engine === 'RH') {
        if (
          rhMaxReady &&
          maximumReady(rh, asset.key, Date.now()) &&
          rh?.maxAmount !== undefined &&
          formTransitions.current.full === formGeneration &&
          currentIntent.current.generation === intentGeneration
        )
          dispatch(bridgeActions.setInputAmount(rh.maxAmount));
      } else legacy.setMaxAmount();
    },
    maxEnabled: route.engine === 'RH' ? rhMaxReady : sourceBalance.status === 'ready',
    refreshBalances:
      route.engine === 'RH'
        ? () => (rh?.refreshBalances ? rh.refreshBalances() : rh?.refresh())
        : legacy.triggerBalanceRefresh,
    refreshAfterReceipt:
      route.engine === 'RH'
        ? () => (rh?.refreshAfterReceipt ? rh.refreshAfterReceipt() : rh?.refreshBalances?.() ?? rh?.refresh())
        : legacy.triggerBalanceRefresh,
    refreshDetails: () => {
      if (route.engine === 'RH') rh?.refresh();
      else {
        legacy.refreshQuote();
        legacy.triggerBalanceRefresh();
      }
    },
    walletMatches,
  };
}
export type BridgeSession = ReturnType<typeof useSession>;
export function BridgeSessionProvider({
  children,
  rhEnabled = RH_TESTNET_BRIDGE_ENABLED,
  rhAdapter,
}: {
  children: React.ReactNode;
  rhEnabled?: boolean;
  rhAdapter?: BridgeAdapter;
}) {
  const session = useSession(rhEnabled, rhAdapter);
  return <BridgeSessionContext.Provider value={session}>{children}</BridgeSessionContext.Provider>;
}
