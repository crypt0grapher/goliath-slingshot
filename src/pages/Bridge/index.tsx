import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
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

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export default function Bridge() {
  const dispatch = useDispatch();
  const operations = useSelector(selectOperations);
  const operationIds = useSelector(selectOperationIds);

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
          <BridgeTitle>Bridge</BridgeTitle>
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
