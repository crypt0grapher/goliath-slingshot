import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import AppBody from '../AppBody';
import { SwapPoolBridgeTabs } from '../../components/NavigationTabs';
import BridgeForm from './BridgeForm';
import BridgeConfirmModal from './BridgeConfirmModal';
import BridgeStatusModal from './BridgeStatusModal';
import { BridgeHistoryPanel } from '../../components/bridge';
import { loadOperationsFromStorage } from '../../state/bridge/localStorage';
import { bridgeActions } from '../../state/bridge/reducer';
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

  // Load operations from localStorage on mount
  useEffect(() => {
    const { operations, operationIds } = loadOperationsFromStorage();
    if (operationIds.length > 0) {
      dispatch(bridgeActions.loadOperations({ operations, operationIds }));
    }
  }, [dispatch]);

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
