import React, { useMemo, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import { AlertCircle, RefreshCw, CheckCircle, XCircle } from 'react-feather';
import { BigNumber } from '@ethersproject/bignumber';
import { selectStakingSnapshot } from '../../state/migration/selectors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** XCN has 18 decimals. */
const XCN_DECIMALS = 18;

/** Maximum display decimals for formatted token amounts. */
const DISPLAY_DECIMALS = 1;

/** Zero threshold for allowance comparison. */
const ZERO = BigNumber.from(0);

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

// ---------------------------------------------------------------------------
// Styled Components
// ---------------------------------------------------------------------------

const SummaryCard = styled.div`
  width: 100%;
  padding: 20px;
  background-color: ${({ theme }) => theme.bg1};
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.bg3};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 16px 12px;
  `}
`;

const CardTitle = styled.h3`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0 0 16px 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 15px;
    margin-bottom: 12px;
  `}
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  gap: 8px;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.bg3};
  }
`;

const Label = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  flex-shrink: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  text-align: right;
  word-break: break-all;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const AllowanceBadge = styled.span<{ isSufficient: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ isSufficient, theme }) => (isSufficient ? theme.green1 : theme.text3)};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
  `}
`;

// ---------------------------------------------------------------------------
// Skeleton (loading placeholder)
// ---------------------------------------------------------------------------

const SkeletonBar = styled.div`
  height: 16px;
  width: 80px;
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

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

const ErrorContainer = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.red1 + '15'};
  border: 1px solid ${({ theme }) => theme.red1 + '40'};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
  `}
`;

const ErrorText = styled.span`
  flex: 1;
  font-size: 13px;
  color: ${({ theme }) => theme.red1};
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
  `}
`;

const RetryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.red1 + '60'};
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.red1};
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease;
  flex-shrink: 0;

  &:hover {
    background-color: ${({ theme }) => theme.red1 + '10'};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.red1};
    outline-offset: 2px;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
    padding: 4px 10px;
  `}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a stringified wei value to a human-readable token amount.
 * Returns a trimmed decimal string with up to `DISPLAY_DECIMALS` digits
 * after the decimal point.
 */
function formatWeiToDisplay(weiString: string): string {
  try {
    const formatted = ethers.utils.formatUnits(weiString, XCN_DECIMALS);
    const parts = formatted.split('.');
    if (parts.length === 2 && parts[1].length > DISPLAY_DECIMALS) {
      return `${parts[0]}.${parts[1].slice(0, DISPLAY_DECIMALS)}`;
    }
    return formatted;
  } catch {
    return '0.0';
  }
}

/**
 * Determines whether the current allowance is sufficient
 * (i.e., greater than zero, meaning the bridge contract has some approval).
 */
function isAllowanceSufficient(allowanceWei: string, totalNeededWei: string): boolean {
  try {
    const allowance = BigNumber.from(allowanceWei);
    const needed = BigNumber.from(totalNeededWei);
    // Sufficient if allowance >= total XCN that will be bridged (staked + wallet)
    // For simplicity, we check if allowance is non-zero and >= needed
    if (needed.lte(ZERO)) {
      // Nothing to bridge -- allowance is irrelevant
      return true;
    }
    return allowance.gte(needed);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MigrationSummaryProps {
  /** Callback invoked when the user clicks the retry button on error. */
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationSummary({ onRetry }: MigrationSummaryProps) {
  const { t } = useTranslation();
  const snapshot = useSelector(selectStakingSnapshot);

  const { staked, rewards, walletXcn, allowance, loading, error } = snapshot;

  // Memoize formatted values to avoid recalculating on every render.
  const formattedStaked = useMemo(() => formatWeiToDisplay(staked), [staked]);
  const formattedRewards = useMemo(() => formatWeiToDisplay(rewards), [rewards]);
  const formattedWalletXcn = useMemo(() => formatWeiToDisplay(walletXcn), [walletXcn]);

  // Allowance sufficiency: allowance must cover the sum of staked + wallet XCN
  // (the total amount the user might bridge).
  const allowanceSufficient = useMemo(() => {
    try {
      const totalNeeded = BigNumber.from(staked).add(BigNumber.from(walletXcn));
      return isAllowanceSufficient(allowance, totalNeeded.toString());
    } catch {
      return false;
    }
  }, [allowance, staked, walletXcn]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // ----- Error State -----
  if (error && !loading) {
    return (
      <SummaryCard role="region" aria-label={t('migration.nav.title')}>
        <CardTitle>{t('migration.nav.title')}</CardTitle>
        <ErrorContainer role="alert">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <ErrorText>{error}</ErrorText>
          {onRetry && (
            <RetryButton onClick={handleRetry} type="button" aria-label={t('migration.error.transactionFailedRetry')}>
              <RefreshCw size={12} aria-hidden="true" />
              {t('migration.error.transactionFailedRetry')}
            </RetryButton>
          )}
        </ErrorContainer>
      </SummaryCard>
    );
  }

  // ----- Normal / Loading State -----
  return (
    <SummaryCard role="region" aria-label={t('migration.nav.title')}>
      <CardTitle>{t('migration.nav.title')}</CardTitle>

      {/* Staked XCN */}
      <SummaryRow>
        <Label>{t('migration.summary.stakedXCN')}</Label>
        {loading ? (
          <SkeletonBar aria-label={t('migration.summary.stakedXCN')} />
        ) : (
          <Value>{formattedStaked} XCN</Value>
        )}
      </SummaryRow>

      {/* Pending Rewards */}
      <SummaryRow>
        <Label>{t('migration.summary.pendingRewards')}</Label>
        {loading ? (
          <SkeletonBar aria-label={t('migration.summary.pendingRewards')} />
        ) : (
          <Value>{formattedRewards} XCN</Value>
        )}
      </SummaryRow>

      {/* Wallet XCN */}
      <SummaryRow>
        <Label>{t('migration.summary.walletXCN')}</Label>
        {loading ? (
          <SkeletonBar aria-label={t('migration.summary.walletXCN')} />
        ) : (
          <Value>{formattedWalletXcn} XCN</Value>
        )}
      </SummaryRow>

      {/* Bridge Allowance */}
      <SummaryRow>
        <Label>{t('migration.summary.bridgeAllowance')}</Label>
        {loading ? (
          <SkeletonBar aria-label={t('migration.summary.bridgeAllowance')} />
        ) : (
          <AllowanceBadge isSufficient={allowanceSufficient}>
            {allowanceSufficient ? (
              <>
                <CheckCircle size={14} aria-hidden="true" />
                Sufficient
              </>
            ) : (
              <>
                <XCircle size={14} aria-hidden="true" />
                Insufficient
              </>
            )}
          </AllowanceBadge>
        )}
      </SummaryRow>
    </SummaryCard>
  );
}
