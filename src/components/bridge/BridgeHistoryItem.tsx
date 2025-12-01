import React from 'react';
import styled from 'styled-components';
import { ExternalLink } from 'react-feather';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { BridgeNetwork, getExplorerTxUrl } from '../../constants/bridge/networks';

const ItemContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg2};
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.bg3};
  }
`;

const LeftSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TokenInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Amount = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
`;

const Direction = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
`;

const RightSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;

const StatusBadge = styled.span<{ status: BridgeStatus }>`
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 8px;
  background-color: ${({ status, theme }) => {
    switch (status) {
      case 'COMPLETED':
        return theme.green1 + '20';
      case 'FAILED':
      case 'EXPIRED':
        return theme.red1 + '20';
      case 'DELAYED':
        return theme.yellow1 + '20';
      default:
        return theme.primary1 + '20';
    }
  }};
  color: ${({ status, theme }) => {
    switch (status) {
      case 'COMPLETED':
        return theme.green1;
      case 'FAILED':
      case 'EXPIRED':
        return theme.red1;
      case 'DELAYED':
        return theme.yellow1;
      default:
        return theme.primary1;
    }
  }};
`;

const TimeInfo = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
`;

const ExplorerLink = styled.a`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

function getStatusLabel(status: BridgeStatus): string {
  switch (status) {
    case 'PENDING_ORIGIN_TX':
      return 'Pending';
    case 'CONFIRMING':
      return 'Confirming';
    case 'AWAITING_RELAY':
      return 'Processing';
    case 'PROCESSING_DESTINATION':
      return 'Processing';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'EXPIRED':
      return 'Expired';
    case 'DELAYED':
      return 'Delayed';
    default:
      return 'Unknown';
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'Just now';
}

interface BridgeHistoryItemProps {
  operation: BridgeOperation;
  onClick: () => void;
}

export default function BridgeHistoryItem({ operation, onClick }: BridgeHistoryItemProps) {
  const directionText =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? 'Sepolia → Goliath' : 'Goliath → Sepolia';

  const originNetwork =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;

  const explorerUrl = operation.originTxHash
    ? getExplorerTxUrl(originNetwork, operation.originTxHash)
    : null;

  return (
    <ItemContainer onClick={onClick}>
      <LeftSection>
        <TokenInfo>
          <Amount>
            {operation.amountHuman} {operation.token}
          </Amount>
        </TokenInfo>
        <Direction>{directionText}</Direction>
      </LeftSection>
      <RightSection>
        <StatusBadge status={operation.status}>{getStatusLabel(operation.status)}</StatusBadge>
        <TimeInfo>{formatTimeAgo(operation.createdAt)}</TimeInfo>
        {explorerUrl && (
          <ExplorerLink
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            View <ExternalLink size={12} />
          </ExplorerLink>
        )}
      </RightSection>
    </ItemContainer>
  );
}
