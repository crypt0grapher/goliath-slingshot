import React from 'react';
import { useTranslation } from 'react-i18next';
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

function formatDate(timestamp: number | null, blockNumber: number, locale: string): string {
  if (timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString(locale, {
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
  const { t, i18n } = useTranslation();
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
          {t('yield.noTransactions')}
        </div>
      </HistoryContainer>
    );
  }

  return (
    <HistoryContainer>
      <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>{t('yield.transactionHistory')}</div>
      {events.map((event) => (
        <HistoryItem key={event.txHash}>
          <HistoryType type={event.type}>
            {event.type === 'stake' ? t('yield.eventStaked') : t('yield.eventUnstaked')}
          </HistoryType>
          <HistoryAmount>{formatTokenAmount(event.xcnAmount)} XCN</HistoryAmount>
          <HistoryTimestamp>{formatDate(event.timestamp, event.blockNumber, i18n.language)}</HistoryTimestamp>
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
