import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Check, Loader, AlertCircle, ExternalLink } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { darken } from 'polished';
import { MigrationStep, StepExecutionStatus } from '../../constants/migration';
import { BridgeNetwork, getExplorerTxUrl } from '../../constants/bridge/networks';

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const SpinningLoader = styled(Loader)`
  animation: ${spin} 1s linear infinite;
`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const StepContainer = styled.div<{ isActive: boolean; isFailed: boolean; isCompleted: boolean }>`
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg2};
  opacity: ${({ isActive, isCompleted, isFailed }) => (isActive || isCompleted || isFailed ? 1 : 0.5)};
  border: 1px solid
    ${({ theme, isFailed, isCompleted }) =>
      isFailed ? theme.red1 + '40' : isCompleted ? theme.green1 + '40' : theme.bg3};
  transition: opacity 0.2s ease, border-color 0.2s ease;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 12px;
  `}
`;

const StepNumberCircle = styled.div<{ status: StepExecutionStatus; isActive: boolean }>`
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
  background-color: ${({ status, isActive, theme }) => {
    switch (status) {
      case StepExecutionStatus.CONFIRMED:
        return theme.green1;
      case StepExecutionStatus.FAILED:
        return theme.red1;
      case StepExecutionStatus.WAITING_SIGNATURE:
      case StepExecutionStatus.TX_PENDING:
        return theme.primary1;
      default:
        return isActive ? theme.primary1 : theme.bg3;
    }
  }};
  color: ${({ status, isActive, theme }) => {
    if (status === StepExecutionStatus.IDLE && !isActive) {
      return theme.text3;
    }
    return theme.white;
  }};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    width: 32px;
    height: 32px;
    min-width: 32px;
    font-size: 13px;
  `}
`;

const ContentSection = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  margin-left: 12px;
  min-width: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    margin-left: 10px;
  `}
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Title = styled.span<{ isActive: boolean }>`
  font-size: 15px;
  font-weight: 500;
  color: ${({ isActive, theme }) => (isActive ? theme.text1 : theme.text2)};
  line-height: 1.3;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
  `}
`;

const Description = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.text3};
  margin-top: 4px;
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
  `}
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
`;

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const ActionButton = styled.button<{ variant?: 'primary' | 'error' }>`
  padding: 8px 20px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease;
  white-space: nowrap;

  background-color: ${({ variant, theme }) =>
    variant === 'error' ? theme.red1 : theme.primary1};
  color: ${({ theme }) => theme.white};

  &:hover:not(:disabled) {
    background-color: ${({ variant, theme }) =>
      darken(0.05, variant === 'error' ? theme.red1 : theme.primary1)};
  }

  &:active:not(:disabled) {
    background-color: ${({ variant, theme }) =>
      darken(0.1, variant === 'error' ? theme.red1 : theme.primary1)};
  }

  &:disabled {
    background-color: ${({ theme }) => theme.bg3};
    color: ${({ theme }) => theme.text3};
    cursor: not-allowed;
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.primary1};
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 8px 16px;
    font-size: 13px;
    width: 100%;
  `}
`;

// ---------------------------------------------------------------------------
// Status indicators
// ---------------------------------------------------------------------------

const StatusLabel = styled.div<{ color?: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ color, theme }) => color || theme.text2};
`;

const TxLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
`;

const CompletedBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.green1};
`;

const ErrorMessage = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.red1};
  margin-top: 4px;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the correct explorer network for a given migration step.
 * Bridge destination tx is on Goliath; all other steps are on Sepolia.
 */
function getStepNetwork(step: MigrationStep): BridgeNetwork {
  return step === MigrationStep.BRIDGE ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;
}

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MigrationStepItemProps {
  stepNumber: number;
  step: MigrationStep;
  title: string;
  description: string;
  status: StepExecutionStatus;
  isActive: boolean;
  onAction?: () => void;
  actionMode?: 'manual' | 'tracking';
  txHash?: string;
}

export default function MigrationStepItem({
  stepNumber,
  step,
  title,
  description,
  status,
  isActive,
  onAction,
  actionMode = 'manual',
  txHash,
}: MigrationStepItemProps) {
  const { t } = useTranslation();

  const isCompleted = status === StepExecutionStatus.CONFIRMED;
  const isFailed = status === StepExecutionStatus.FAILED;
  const isPending = status === StepExecutionStatus.TX_PENDING;
  const isWaitingSignature = status === StepExecutionStatus.WAITING_SIGNATURE;
  const isIdle = status === StepExecutionStatus.IDLE;

  // Determine what the step number circle renders
  const renderStepIndicator = () => {
    if (isCompleted) return <Check size={16} aria-hidden="true" />;
    if (isFailed) return <AlertCircle size={16} aria-hidden="true" />;
    if (isPending || isWaitingSignature) return <SpinningLoader size={16} aria-hidden="true" />;
    return stepNumber;
  };

  const isTrackingMode = actionMode === 'tracking';

  // Determine the action area content
  const renderActionArea = () => {
    if (isTrackingMode) {
      if (isIdle && isActive) {
        return (
          <StatusLabel color={undefined}>
            {t('migration.action.ready')}
          </StatusLabel>
        );
      }

      if (isIdle && !isActive) {
        return (
          <StatusLabel color={undefined}>
            {t('migration.action.waitingForPrevious')}
          </StatusLabel>
        );
      }

      if (isWaitingSignature) {
        return (
          <StatusLabel>
            <SpinningLoader size={14} aria-hidden="true" />
            {t('migration.action.waitingForWallet')}
          </StatusLabel>
        );
      }

      if (isPending) {
        return (
          <>
            <StatusLabel>
              <SpinningLoader size={14} aria-hidden="true" />
              {t('migration.action.txPending')}
            </StatusLabel>
            {txHash && (
              <TxLink
                href={getExplorerTxUrl(getStepNetwork(step), txHash)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('migration.action.viewTransaction')} ${truncateTxHash(txHash)}`}
              >
                {truncateTxHash(txHash)} <ExternalLink size={12} aria-hidden="true" />
              </TxLink>
            )}
          </>
        );
      }

      if (isCompleted) {
        return (
          <>
            <CompletedBadge>
              <Check size={14} aria-hidden="true" />
              {t('migration.action.completed')}
            </CompletedBadge>
            {txHash && (
              <TxLink
                href={getExplorerTxUrl(getStepNetwork(step), txHash)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('migration.action.viewTransaction')} ${truncateTxHash(txHash)}`}
              >
                {truncateTxHash(txHash)} <ExternalLink size={12} aria-hidden="true" />
              </TxLink>
            )}
          </>
        );
      }

      if (isFailed) {
        return (
          <StatusLabel color={undefined}>
            {t('migration.action.failed')}
          </StatusLabel>
        );
      }

      return null;
    }

    // IDLE + active: show enabled action button
    if (isIdle && isActive) {
      return (
        <ActionButton onClick={onAction} type="button" aria-label={title} disabled={!onAction}>
          {title}
        </ActionButton>
      );
    }

    // IDLE + not active: show disabled state
    if (isIdle && !isActive) {
      return (
        <StatusLabel color={undefined}>
          {t('migration.action.waitingForPrevious')}
        </StatusLabel>
      );
    }

    // WAITING_SIGNATURE: disabled button with spinner text
    if (isWaitingSignature) {
      return (
        <ActionButton disabled type="button">
          <StatusLabel>
            <SpinningLoader size={14} aria-hidden="true" />
            {t('migration.action.waitingForWallet')}
          </StatusLabel>
        </ActionButton>
      );
    }

    // TX_PENDING: disabled button with spinner + optional tx link
    if (isPending) {
      return (
        <>
          <ActionButton disabled type="button">
            <StatusLabel>
              <SpinningLoader size={14} aria-hidden="true" />
              {t('migration.action.txPending')}
            </StatusLabel>
          </ActionButton>
          {txHash && (
            <TxLink
              href={getExplorerTxUrl(getStepNetwork(step), txHash)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('migration.action.viewTransaction')} ${truncateTxHash(txHash)}`}
            >
              {truncateTxHash(txHash)} <ExternalLink size={12} aria-hidden="true" />
            </TxLink>
          )}
        </>
      );
    }

    // CONFIRMED: success badge + optional tx link
    if (isCompleted) {
      return (
        <>
          <CompletedBadge>
            <Check size={14} aria-hidden="true" />
            {t('migration.action.completed')}
          </CompletedBadge>
          {txHash && (
            <TxLink
              href={getExplorerTxUrl(getStepNetwork(step), txHash)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('migration.action.viewTransaction')} ${truncateTxHash(txHash)}`}
            >
              {truncateTxHash(txHash)} <ExternalLink size={12} aria-hidden="true" />
            </TxLink>
          )}
        </>
      );
    }

    // FAILED: error message + retry button
    if (isFailed) {
      return (
        <>
          <ActionButton variant="error" onClick={onAction} type="button" aria-label={t('migration.action.retry')}>
            {t('migration.action.retry')}
          </ActionButton>
          {txHash && (
            <TxLink
              href={getExplorerTxUrl(getStepNetwork(step), txHash)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t('migration.action.viewTransaction')} ${truncateTxHash(txHash)}`}
            >
              {truncateTxHash(txHash)} <ExternalLink size={12} aria-hidden="true" />
            </TxLink>
          )}
        </>
      );
    }

    return null;
  };

  return (
    <StepContainer
      isActive={isActive || !isIdle}
      isFailed={isFailed}
      isCompleted={isCompleted}
      role="listitem"
      aria-current={isActive && isIdle ? 'step' : undefined}
    >
      <StepNumberCircle status={status} isActive={isActive} aria-hidden="true">
        {renderStepIndicator()}
      </StepNumberCircle>
      <ContentSection>
        <TitleRow>
          <Title isActive={isActive || !isIdle}>{title}</Title>
        </TitleRow>
        <Description>{description}</Description>
        {isFailed && <ErrorMessage>{t('migration.action.failed')}</ErrorMessage>}
        <ActionRow>{renderActionArea()}</ActionRow>
      </ContentSection>
    </StepContainer>
  );
}
