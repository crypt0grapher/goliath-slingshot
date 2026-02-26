import React from 'react';
import styled, { keyframes } from 'styled-components';
import { BarChart2, Users, TrendingUp, Activity } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { migrationConfig } from '../../config/migrationConfig';
import { useStats } from '../../hooks/migration/useMigrationApi';

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ---------------------------------------------------------------------------
// Styled Components
// ---------------------------------------------------------------------------

const BannerContainer = styled.div`
  width: 100%;
  padding: 16px 20px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    ${({ theme }) => theme.primary1 + '15'} 0%,
    ${({ theme }) => theme.primary1 + '08'} 100%
  );
  border: 1px solid ${({ theme }) => theme.primary1 + '25'};
  animation: ${fadeIn} 0.3s ease-out;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 12px 14px;
  `}
`;

const BannerTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
  margin-bottom: 12px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
    margin-bottom: 10px;
  `}
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (min-width: 480px) {
    grid-template-columns: repeat(4, 1fr);
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    gap: 8px;
  `}
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
  display: flex;
  align-items: center;
  gap: 4px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 11px;
  `}
`;

const StatValue = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
  `}
`;

const SkeletonBar = styled.div<{ width?: string }>`
  height: 18px;
  width: ${({ width }) => width ?? '60px'};
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.bg3} 25%,
    ${({ theme }) => theme.bg2} 50%,
    ${({ theme }) => theme.bg3} 75%
  );
  background-size: 400px 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const ErrorText = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.text3};
  font-style: italic;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a large number string for display. If the value parses to a number
 * larger than 1 000, apply thousands separators.
 */
function formatAmount(value: string): string {
  try {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 1, useGrouping: false });
  } catch {
    return '0';
  }
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationStatsBanner() {
  const { t } = useTranslation();
  const { data, loading, error } = useStats();

  // Gate: render nothing when feature flag is off
  if (!migrationConfig.statsEnabled) {
    return null;
  }

  // If there is an error and no cached data, show a minimal error state
  if (error && !data) {
    return (
      <BannerContainer role="region" aria-label={t('migration.stats.title')}>
        <BannerTitle>
          <BarChart2 size={16} aria-hidden="true" />
          {t('migration.stats.title')}
        </BannerTitle>
        <ErrorText>{t('migration.stats.unavailable')}</ErrorText>
      </BannerContainer>
    );
  }

  return (
    <BannerContainer role="region" aria-label={t('migration.stats.title')}>
      <BannerTitle>
        <BarChart2 size={16} aria-hidden="true" />
        {t('migration.stats.title')}
      </BannerTitle>
      <StatsGrid>
        {/* Total Migrated */}
        <StatItem>
          <StatLabel>
            <TrendingUp size={12} aria-hidden="true" />
            {t('migration.stats.totalMigrated')}
          </StatLabel>
          {loading && !data ? (
            <SkeletonBar aria-label={t('migration.stats.totalMigrated')} />
          ) : (
            <StatValue>{data ? formatAmount(data.totalAmountMigrated) : '0'} XCN</StatValue>
          )}
        </StatItem>

        {/* Total Migrations */}
        <StatItem>
          <StatLabel>
            <Users size={12} aria-hidden="true" />
            {t('migration.stats.totalCount')}
          </StatLabel>
          {loading && !data ? (
            <SkeletonBar width="40px" aria-label={t('migration.stats.totalCount')} />
          ) : (
            <StatValue>{data ? formatCount(data.totalMigrations) : '0'}</StatValue>
          )}
        </StatItem>

        {/* Total Staked */}
        <StatItem>
          <StatLabel>
            <Activity size={12} aria-hidden="true" />
            {t('migration.stats.totalStaked')}
          </StatLabel>
          {loading && !data ? (
            <SkeletonBar width="40px" aria-label={t('migration.stats.totalStaked')} />
          ) : (
            <StatValue>{data ? formatCount(data.totalStaked) : '0'}</StatValue>
          )}
        </StatItem>

        {/* Active Migrations */}
        <StatItem>
          <StatLabel>
            <Activity size={12} aria-hidden="true" />
            {t('migration.stats.activeMigrations')}
          </StatLabel>
          {loading && !data ? (
            <SkeletonBar width="40px" aria-label={t('migration.stats.activeMigrations')} />
          ) : (
            <StatValue>{data ? formatCount(data.activeMigrations) : '0'}</StatValue>
          )}
        </StatItem>
      </StatsGrid>
    </BannerContainer>
  );
}
