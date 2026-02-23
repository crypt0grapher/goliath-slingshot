import React, { useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { Clock, ExternalLink, ChevronDown, AlertCircle, CheckCircle, XCircle, Loader } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { migrationConfig } from '../../config/migrationConfig';
import { useHistory } from '../../hooks/migration/useMigrationApi';
import { useActiveWeb3React } from '../../hooks';
import { MigrationStatusResponse } from '../../services/migrationApi';
import { BridgeNetwork, getExplorerTxUrl } from '../../constants/bridge/networks';

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

// ---------------------------------------------------------------------------
// Styled Components
// ---------------------------------------------------------------------------

const PanelContainer = styled.div`
  width: 100%;
  padding: 20px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg3};
  animation: ${fadeIn} 0.3s ease-out;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 16px 12px;
  `}
`;

const PanelTitle = styled.h3`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 15px;
    margin-bottom: 12px;
  `}
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg2};
  gap: 12px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
    flex-wrap: wrap;
    gap: 8px;
  `}
`;

const ItemLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
`;

const ItemAmount = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const ItemDate = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 11px;
  `}
`;

const ItemRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
`;

const StatusBadge = styled.span<{ statusColor: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ statusColor }) => statusColor};
  padding: 2px 8px;
  border-radius: 6px;
  background-color: ${({ statusColor }) => statusColor + '15'};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 11px;
    padding: 2px 6px;
  `}
`;

const TxLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primary1};
    outline-offset: 2px;
    border-radius: 2px;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 11px;
  `}
`;

const LoadMoreButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.bg3};
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text2};
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primary1};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
    padding: 8px;
  `}
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
`;

const EmptyText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text3};
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.red1 + '15'};
  border: 1px solid ${({ theme }) => theme.red1 + '40'};
  font-size: 13px;
  color: ${({ theme }) => theme.red1};
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
    font-size: 12px;
  `}
`;

const SkeletonItem = styled.div`
  height: 52px;
  width: 100%;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.bg3} 25%,
    ${({ theme }) => theme.bg2} 50%,
    ${({ theme }) => theme.bg3} 75%
  );
  background-size: 400px 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const SpinningLoader = styled(Loader)`
  animation: ${spin} 1s linear infinite;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HistoryEntryProps {
  operation: MigrationStatusResponse;
}

function HistoryEntry({ operation }: HistoryEntryProps) {
  const { t } = useTranslation();

  // We need theme colors for status display. Use styled-components
  // ThemeContext access via a wrapper that passes theme props.
  // For simplicity, we use CSS variables via the StatusBadge's statusColor prop.
  // The color values are resolved inline here from the theme using the
  // status mapping function with hardcoded defaults as fallback.
  const statusColor = useMemo(() => {
    switch (operation.status) {
      case 'COMPLETED':
        return '#27AE60';
      case 'FAILED':
      case 'EXPIRED':
        return '#FF6871';
      case 'DELAYED':
      case 'PENDING_ORIGIN_TX':
      case 'CONFIRMING':
      case 'AWAITING_RELAY':
      case 'PROCESSING_DESTINATION':
        return '#F3841E';
      default:
        return '#888D9B';
    }
  }, [operation.status]);

  const statusLabel = useMemo(() => {
    switch (operation.status) {
      case 'COMPLETED':
        return t('statusCompleted');
      case 'FAILED':
        return t('statusFailed');
      case 'EXPIRED':
        return t('statusExpired');
      case 'DELAYED':
        return t('statusDelayed');
      case 'PENDING_ORIGIN_TX':
      case 'CONFIRMING':
      case 'AWAITING_RELAY':
      case 'PROCESSING_DESTINATION':
        return t('statusProcessing');
      default:
        return t('statusUnknown');
    }
  }, [operation.status, t]);

  const statusIcon = useMemo(() => {
    switch (operation.status) {
      case 'COMPLETED':
        return <CheckCircle size={12} aria-hidden="true" />;
      case 'FAILED':
      case 'EXPIRED':
        return <XCircle size={12} aria-hidden="true" />;
      case 'PENDING_ORIGIN_TX':
      case 'CONFIRMING':
      case 'AWAITING_RELAY':
      case 'PROCESSING_DESTINATION':
        return <SpinningLoader size={12} aria-hidden="true" />;
      case 'DELAYED':
        return <Clock size={12} aria-hidden="true" />;
      default:
        return <Clock size={12} aria-hidden="true" />;
    }
  }, [operation.status]);

  // Determine the best date to display
  const displayDate = operation.timestamps.completedAt
    ?? operation.timestamps.depositedAt
    ?? null;

  // Determine the best tx hash for the explorer link
  const txHash = operation.originTxHash ?? operation.destinationTxHash;
  const txNetwork = operation.originTxHash ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;

  return (
    <HistoryItem>
      <ItemLeft>
        <ItemAmount>
          {operation.amountFormatted} {operation.token}
        </ItemAmount>
        <ItemDate>{formatDate(displayDate)}</ItemDate>
      </ItemLeft>
      <ItemRight>
        <StatusBadge statusColor={statusColor}>
          {statusIcon}
          {statusLabel}
        </StatusBadge>
        {txHash && (
          <TxLink
            href={getExplorerTxUrl(txNetwork, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t('migration.history.viewTx')} ${truncateTxHash(txHash)}`}
          >
            {truncateTxHash(txHash)}
            <ExternalLink size={11} aria-hidden="true" />
          </TxLink>
        )}
      </ItemRight>
    </HistoryItem>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationHistoryPanel() {
  const { t } = useTranslation();
  const { account } = useActiveWeb3React();
  const { data, loading, error, loadMore } = useHistory(account);

  // Gate: render nothing when feature flag is off
  if (!migrationConfig.historyEnabled) {
    return null;
  }

  // Don't render when wallet is not connected
  if (!account) {
    return null;
  }

  const hasOperations = data && data.operations.length > 0;
  const hasMore = data?.pagination.hasMore ?? false;

  return (
    <PanelContainer role="region" aria-label={t('migration.history.title')}>
      <PanelTitle>
        <Clock size={16} aria-hidden="true" />
        {t('migration.history.title')}
      </PanelTitle>

      {/* Error state */}
      {error && !data && (
        <ErrorBanner role="alert">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>{t('migration.history.errorLoading')}</span>
        </ErrorBanner>
      )}

      {/* Loading state (initial) */}
      {loading && !data && (
        <HistoryList>
          <SkeletonItem aria-label={t('loading')} />
          <SkeletonItem aria-label={t('loading')} />
          <SkeletonItem aria-label={t('loading')} />
        </HistoryList>
      )}

      {/* Empty state */}
      {!loading && !error && data && !hasOperations && (
        <EmptyState>
          <Clock size={32} color="#888D9B" aria-hidden="true" />
          <EmptyText>{t('migration.history.empty')}</EmptyText>
        </EmptyState>
      )}

      {/* Operation list */}
      {hasOperations && (
        <HistoryList role="list" aria-label={t('migration.history.title')}>
          {data.operations.map((op) => (
            <HistoryEntry key={op.operationId} operation={op} />
          ))}
        </HistoryList>
      )}

      {/* Load more button */}
      {hasOperations && hasMore && (
        <LoadMoreButton
          onClick={loadMore}
          disabled={loading}
          type="button"
          aria-label={t('migration.history.loadMore')}
        >
          {loading ? (
            <SpinningLoader size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
          {t('migration.history.loadMore')}
        </LoadMoreButton>
      )}
    </PanelContainer>
  );
}
