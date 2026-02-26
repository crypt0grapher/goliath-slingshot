import React from 'react';
import { ExternalLink } from 'react-feather';
import { StakingEvent } from '../../state/yield/types';
import { BLOCKSCOUT_BASE_URL } from '../../constants/staking';
import Loader from '../../components/Loader';
import {
  formatTokenAmount,
  HistoryContainer,
  HistoryItem,
  HistoryType,
  HistoryAmount,
  HistoryTimestamp,
  HistoryLink,
} from './styleds';

function formatDate(timestamp: number | null, blockNumber: number): string {
  if (timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return `Block #${blockNumber}`;
}

interface TransactionHistoryProps {
  events: StakingEvent[];
  isLoading: boolean;
}

export default function TransactionHistory({ events, isLoading }: TransactionHistoryProps) {
  if (isLoading) {
    return (
      <HistoryContainer>
        <div style={{ textAlign: 'center', padding: '16px' }}>
          <Loader size="24px" />
        </div>
      </HistoryContainer>
    );
  }

  if (events.length === 0) {
    return (
      <HistoryContainer>
        <div style={{ textAlign: 'center', padding: '16px', color: '#888', fontSize: '14px' }}>
          No transactions yet
        </div>
      </HistoryContainer>
    );
  }

  return (
    <HistoryContainer>
      <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>Transaction History</div>
      {events.map((event) => (
        <HistoryItem key={event.txHash}>
          <HistoryType type={event.type}>
            {event.type === 'stake' ? 'Staked' : 'Unstaked'}
          </HistoryType>
          <HistoryAmount>{formatTokenAmount(event.xcnAmount)} XCN</HistoryAmount>
          <HistoryTimestamp>{formatDate(event.timestamp, event.blockNumber)}</HistoryTimestamp>
          <HistoryLink
            href={`${BLOCKSCOUT_BASE_URL}/tx/${event.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
          </HistoryLink>
        </HistoryItem>
      ))}
    </HistoryContainer>
  );
}
