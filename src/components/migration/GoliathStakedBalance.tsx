import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useActiveWeb3React } from '../../hooks';
import { useGoliathStakedBalance } from '../../hooks/migration/useGoliathStakedBalance';

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

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg3};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
  `}
`;

const Label = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

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
// Component
// ---------------------------------------------------------------------------

/**
 * Displays the user's stXCN balance on Goliath.
 * Renders nothing when wallet is not connected or balance is zero.
 */
export default function GoliathStakedBalance() {
  const { t } = useTranslation();
  const { account } = useActiveWeb3React();
  const { balance, loading } = useGoliathStakedBalance(account);

  // Hide when not connected
  if (!account) return null;

  // Hide when balance is zero (and not loading)
  const isZero = !loading && (balance === '0' || balance === '0.0000' || parseFloat(balance) === 0);
  if (isZero) return null;

  return (
    <Container>
      <Label>{t('migration.goliathBalance.title')}</Label>
      {loading ? (
        <SkeletonBar aria-label={t('loading')} />
      ) : (
        <Value>{balance} stXCN</Value>
      )}
    </Container>
  );
}
