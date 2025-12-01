import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { ChevronDown, ChevronUp } from 'react-feather';
import { useSelector, useDispatch } from 'react-redux';
import { selectRecentOperations } from '../../state/bridge/selectors';
import { bridgeActions } from '../../state/bridge/reducer';
import BridgeHistoryItem from './BridgeHistoryItem';

const PanelContainer = styled.div`
  max-width: 500px;
  width: 100%;
  margin-top: 16px;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: ${({ theme }) => theme.bg1};
  border-radius: 12px;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }
`;

const HeaderTitle = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

const HeaderCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
  margin-left: 8px;
`;

const PanelContent = styled.div<{ isOpen: boolean }>`
  display: ${({ isOpen }) => (isOpen ? 'flex' : 'none')};
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
`;

const EmptyState = styled.div`
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.text3};
  font-size: 14px;
`;

interface BridgeHistoryPanelProps {
  maxItems?: number;
}

export default function BridgeHistoryPanel({ maxItems = 5 }: BridgeHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const operations = useSelector(selectRecentOperations);

  const displayedOperations = operations.slice(0, maxItems);
  const hasOperations = displayedOperations.length > 0;

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleItemClick = useCallback(
    (operationId: string) => {
      dispatch(bridgeActions.openStatusModal(operationId));
    },
    [dispatch]
  );

  if (!hasOperations) {
    return null;
  }

  return (
    <PanelContainer>
      <PanelHeader onClick={toggleOpen}>
        <div>
          <HeaderTitle>Recent Transactions</HeaderTitle>
          <HeaderCount>({displayedOperations.length})</HeaderCount>
        </div>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </PanelHeader>

      <PanelContent isOpen={isOpen}>
        {displayedOperations.length === 0 ? (
          <EmptyState>No recent bridge transactions</EmptyState>
        ) : (
          displayedOperations.map((operation) => (
            <BridgeHistoryItem
              key={operation.id}
              operation={operation}
              onClick={() => handleItemClick(operation.id)}
            />
          ))
        )}
      </PanelContent>
    </PanelContainer>
  );
}
