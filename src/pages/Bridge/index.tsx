import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import AppBody from '../AppBody';
import { SwapPoolBridgeTabs } from '../../components/NavigationTabs';
import BridgeForm from './BridgeForm';
import BridgeConfirmModal from './BridgeConfirmModal';
import BridgeStatusModal from './BridgeStatusModal';
import { BridgeHistoryPanel } from '../../components/bridge';
import { loadOperationsFromStorage, saveOperationsToStorage } from '../../state/bridge/localStorage';
import { bridgeActions } from '../../state/bridge/reducer';
import { selectOperations, selectOperationIds } from '../../state/bridge/selectors';
import { BridgeHeader, BridgeTitle } from './styleds';
import Settings from '../../components/Settings';
import type { BridgeAdapter } from '../../hooks/bridge/BridgeSession';
import { BridgeSessionProvider } from '../../hooks/bridge/BridgeSession';
import { useUnifiedRhBridge } from '../../hooks/rhBridge/useUnifiedRhBridge';
import type { ControllerDeps } from '../../hooks/rhBridge/controller';
import { selectBridgeForm } from '../../state/bridge/selectors';
import { normalizeBridgeSelection } from '../../constants/bridge/registry';
import { RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';
import UnifiedRhHistory from '../RhBridge/UnifiedHistory';

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

function BridgeContent() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const operations = useSelector(selectOperations);
  const operationIds = useSelector(selectOperationIds);

  // Reset stuck loading states on mount - these should never persist across page loads
  // This fixes the "Bridging..." stuck button issue when localStorage persists isSubmitting: true
  useEffect(() => {
    dispatch(bridgeActions.setSubmitting(false));
    dispatch(bridgeActions.setApproving(false));
  }, [dispatch]);

  // Load operations from localStorage on mount
  useEffect(() => {
    const stored = loadOperationsFromStorage();
    if (stored.operationIds.length > 0) {
      dispatch(bridgeActions.loadOperations({ operations: stored.operations, operationIds: stored.operationIds }));
    }
  }, [dispatch]);

  // Save operations to localStorage whenever they change
  useEffect(() => {
    if (operationIds.length > 0) {
      saveOperationsToStorage(operations, operationIds);
    }
  }, [operations, operationIds]);

  return (
    <PageWrapper>
      <SwapPoolBridgeTabs active="bridge" />
      <AppBody>
        <BridgeHeader>
          <BridgeTitle>{t('bridge')}</BridgeTitle>
          <Settings />
        </BridgeHeader>
        <BridgeForm />
      </AppBody>
      <BridgeHistoryPanel />
      <BridgeConfirmModal />
      <BridgeStatusModal />
    </PageWrapper>
  );
}

export default function Bridge({
  rhEnabled = RH_TESTNET_BRIDGE_ENABLED,
  rhAdapter,
  rhDeps,
}: {
  rhEnabled?: boolean;
  rhAdapter?: BridgeAdapter;
  rhDeps?: ControllerDeps;
}) {
  const form = useSelector(selectBridgeForm);
  const runtime = useUnifiedRhBridge(normalizeBridgeSelection(form, rhEnabled), rhEnabled && !rhAdapter, rhDeps);
  return (
    <BridgeSessionProvider rhEnabled={rhEnabled} rhAdapter={rhAdapter ?? runtime.adapter}>
      <BridgeContent />
      <UnifiedRhHistory
        controller={runtime.controller}
        history={runtime.snapshot.history}
        catalog={rhDeps?.v2?.catalog}
      />
    </BridgeSessionProvider>
  );
}
