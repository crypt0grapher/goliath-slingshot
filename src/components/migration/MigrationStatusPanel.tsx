import React, { useMemo, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  Check,
  Clock,
  AlertCircle,
  Loader,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'react-feather';
import { useTranslation } from 'react-i18next';
import { darken } from 'polished';
import { BridgeStatus } from '../../state/bridge/types';
import { BridgeNetwork, getExplorerTxUrl } from '../../constants/bridge/networks';
import { MigrationFields } from '../../hooks/migration/useMigrationStatusPolling';
import { ClientStakingStatus } from '../../state/migration/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal step identifiers for the status panel. */
enum StatusStep {
  DEPOSIT_CONFIRMED = 'DEPOSIT_CONFIRMED',
  WAITING_CONFIRMATIONS = 'WAITING_CONFIRMATIONS',
  DELIVERING_ON_GOLIATH = 'DELIVERING_ON_GOLIATH',
  STAKING_ON_GOLIATH = 'STAKING_ON_GOLIATH',
  MIGRATION_COMPLETE = 'MIGRATION_COMPLETE',
}

type StepVisualStatus = 'pending' | 'active' | 'completed' | 'error';

interface StepConfig {
  id: StatusStep;
  labelKey: string;
}

export interface MigrationStatusPanelProps {
  /** Current backend status (from polling hook). */
  operationStatus: BridgeStatus | null;
  /** Whether user opted to stake on Goliath. */
  stakeOnGoliath: boolean;
  /** Migration-specific fields from the polling hook. */
  migrationFields: MigrationFields | null;
  /** Origin chain tx hash. */
  originTxHash: string | null;
  /** Destination chain tx hash (if available). */
  destinationTxHash?: string | null;
  /** Delay warning string from the polling hook. */
  delayWarning: string | null;
  /** Polling error string from the polling hook. */
  pollingError: string | null;
  /** Error message from the backend (for FAILED/EXPIRED states). */
  errorMessage?: string | null;
  /** Callback to start a new migration. */
  onStartNewMigration?: () => void;
  /** Client-side staking status from useMigrationStaking. */
  clientStakingStatus?: ClientStakingStatus;
  /** Client-side staking tx hash. */
  clientStakingTxHash?: string | null;
  /** Client-side staking error message. */
  clientStakingError?: string | null;
  /** Callback to trigger client-side staking. */
  onExecuteStake?: () => void;
  /** Callback to retry failed client-side staking. */
  onRetryStake?: () => void;
  /** Callback to switch wallet to Goliath network. */
  onSwitchToGoliath?: () => void;
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const SpinningLoader = styled(Loader)`
  animation: ${spin} 1s linear infinite;
`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 500px;
  padding: 20px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.bg1};
  animation: ${fadeIn} 0.3s ease-out;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 16px 12px;
  `}
`;

const PanelTitle = styled.h3`
  font-size: 18px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin: 0 0 20px 0;
  text-align: center;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 16px;
    margin-bottom: 16px;
  `}
`;

const StepList = styled.div`
  display: flex;
  flex-direction: column;
`;

// ---------------------------------------------------------------------------
// Step Row
// ---------------------------------------------------------------------------

const StepRow = styled.div<{ showLine: boolean; lineActive: boolean }>`
  display: flex;
  align-items: flex-start;
  position: relative;
  padding-bottom: ${({ showLine }) => (showLine ? '20px' : '0')};

  ${({ showLine, lineActive, theme }) =>
    showLine &&
    `
    &::before {
      content: '';
      position: absolute;
      left: 17px;
      top: 36px;
      width: 2px;
      height: calc(100% - 36px);
      background-color: ${lineActive ? theme.green1 : theme.bg3};
      transition: background-color 0.3s ease;
    }
  `}

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding-bottom: ${({ showLine }: { showLine: boolean }) => (showLine ? '16px' : '0')};

    &::before {
      left: 15px;
      top: 32px;
      height: calc(100% - 32px);
    }
  `}
`;

const StepIconCircle = styled.div<{ visualStatus: StepVisualStatus }>`
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
  transition: background-color 0.3s ease, color 0.3s ease;

  background-color: ${({ visualStatus, theme }) => {
    switch (visualStatus) {
      case 'completed':
        return theme.green1;
      case 'active':
        return theme.primary1;
      case 'error':
        return theme.red1;
      default:
        return theme.bg3;
    }
  }};

  color: ${({ visualStatus, theme }) => {
    switch (visualStatus) {
      case 'pending':
        return theme.text3;
      default:
        return 'white';
    }
  }};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    width: 32px;
    height: 32px;
    min-width: 32px;
  `}
`;

const StepContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  margin-left: 12px;
  min-width: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    margin-left: 10px;
  `}
`;

const StepLabel = styled.div<{ isHighlighted: boolean }>`
  font-size: 15px;
  font-weight: 500;
  color: ${({ isHighlighted, theme }) => (isHighlighted ? theme.text1 : theme.text2)};
  line-height: 1.3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 7px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
    padding-top: 5px;
  `}
`;

const StepDescription = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
  margin-top: 4px;
  line-height: 1.4;
`;

// ---------------------------------------------------------------------------
// Tx Links
// ---------------------------------------------------------------------------

const TxLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;
  margin-top: 4px;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primary1};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

// ---------------------------------------------------------------------------
// Warning / Error Banners
// ---------------------------------------------------------------------------

const WarningBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-top: 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.yellow1 + '15'};
  border: 1px solid ${({ theme }) => theme.yellow1 + '40'};
  font-size: 13px;
  color: ${({ theme }) => theme.yellow2 ?? theme.yellow1};
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 12px;
    font-size: 12px;
  `}
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  margin-top: 16px;
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

// ---------------------------------------------------------------------------
// Success / Failure States
// ---------------------------------------------------------------------------

const TerminalStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 0 4px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 16px 0 4px;
  `}
`;

const TerminalIcon = styled.div<{ isSuccess: boolean }>`
  color: ${({ isSuccess, theme }) => (isSuccess ? theme.green1 : theme.red1)};
`;

const TerminalMessage = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  text-align: center;
  line-height: 1.5;
`;

const NewMigrationButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 20px;
  margin-top: 8px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: background-color 0.2s ease;
  background-color: ${({ theme }) => theme.primary1};
  color: ${({ theme }) => theme.white};

  &:hover {
    background-color: ${({ theme }) => darken(0.05, theme.primary1)};
  }

  &:active {
    background-color: ${({ theme }) => darken(0.1, theme.primary1)};
  }

  &:focus-visible {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.primary1};
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 10px 16px;
    font-size: 14px;
  `}
`;

const PollingErrorText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.yellow2 ?? theme.yellow1};
  text-align: center;
  margin-top: 8px;
`;

const StakingActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  background-color: ${({ theme }) => theme.primary1};
  color: ${({ theme }) => theme.white};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => darken(0.05, theme.primary1)};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
    padding: 6px 12px;
  `}
`;

const StakingRetryButton = styled(StakingActionButton)`
  background-color: ${({ theme }) => theme.red1};

  &:hover:not(:disabled) {
    background-color: ${({ theme }) => darken(0.05, theme.red1)};
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateTxHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/**
 * Builds the ordered list of step configs, conditionally including the staking step.
 */
function buildSteps(stakeOnGoliath: boolean): StepConfig[] {
  const steps: StepConfig[] = [
    { id: StatusStep.DEPOSIT_CONFIRMED, labelKey: 'migration.status.depositConfirmed' },
    { id: StatusStep.WAITING_CONFIRMATIONS, labelKey: 'migration.status.waitingForConfirmations' },
    { id: StatusStep.DELIVERING_ON_GOLIATH, labelKey: 'migration.status.deliveringOnGoliath' },
  ];

  if (stakeOnGoliath) {
    steps.push({
      id: StatusStep.STAKING_ON_GOLIATH,
      labelKey: 'migration.status.stakingOnGoliath',
    });
  }

  steps.push({ id: StatusStep.MIGRATION_COMPLETE, labelKey: 'migration.status.migrationComplete' });

  return steps;
}

/**
 * Maps a backend BridgeStatus (and optional migration fields) to the current
 * active StatusStep. Returns null if the status is not mappable.
 */
function mapStatusToActiveStep(
  status: BridgeStatus | null,
  stakeOnGoliath: boolean,
  migrationFields: MigrationFields | null,
  clientStakingStatus?: ClientStakingStatus
): StatusStep | null {
  if (!status) return null;

  switch (status) {
    case 'PENDING_ORIGIN_TX':
    case 'CONFIRMING':
      return StatusStep.WAITING_CONFIRMATIONS;
    case 'AWAITING_RELAY':
    case 'PROCESSING_DESTINATION':
    case 'DELAYED':
      return StatusStep.DELIVERING_ON_GOLIATH;
    case 'COMPLETED': {
      // If user opted to stake and client-side staking is not yet confirmed,
      // the active step is STAKING_ON_GOLIATH.
      if (stakeOnGoliath && clientStakingStatus && clientStakingStatus !== 'confirmed') {
        return StatusStep.STAKING_ON_GOLIATH;
      }
      return StatusStep.MIGRATION_COMPLETE;
    }
    case 'FAILED':
    case 'EXPIRED':
      return null; // Handled separately as error state
    default:
      return null;
  }
}

/**
 * Infer staking step visual status from client-side staking state.
 * Uses the clientStakingStatus from the useMigrationStaking hook as the
 * primary source of truth, falling back to backend fields.
 */
function inferStakingStatus(
  backendStatus: BridgeStatus | null,
  migrationFields: MigrationFields | null,
  stakeOnGoliath: boolean,
  clientStakingStatus?: ClientStakingStatus
): 'idle' | 'active' | 'completed' | 'error' {
  if (!stakeOnGoliath) return 'idle';

  // Client-side staking status takes priority when bridge is COMPLETED.
  if (backendStatus === 'COMPLETED' && clientStakingStatus) {
    switch (clientStakingStatus) {
      case 'confirmed':
        return 'completed';
      case 'failed':
        return 'error';
      case 'pending_signature':
      case 'tx_pending':
      case 'awaiting_network':
        return 'active';
      case 'idle':
        // Bridge completed, staking not started yet — show as active (waiting for user)
        return 'active';
      default:
        return 'active';
    }
  }

  // Bridge completed but no client staking status yet — show as active
  if (backendStatus === 'COMPLETED') return 'active';

  if (!migrationFields) return 'idle';

  // If there is a staking error, show error
  if (migrationFields.stakingError) return 'error';

  // If staking tx hash exists but not completed, staking is active
  if (migrationFields.stakingTxHash) return 'active';

  // Bridge still in progress — staking is pending
  return 'idle';
}

/**
 * Determines the visual status for each step in the list.
 */
function getStepVisualStatus(
  stepId: StatusStep,
  activeStep: StatusStep | null,
  backendStatus: BridgeStatus | null,
  stakeOnGoliath: boolean,
  migrationFields: MigrationFields | null,
  clientStakingStatus?: ClientStakingStatus
): StepVisualStatus {
  const isFailed = backendStatus === 'FAILED' || backendStatus === 'EXPIRED';

  // Define ordering for comparison
  const stepOrder: StatusStep[] = [
    StatusStep.DEPOSIT_CONFIRMED,
    StatusStep.WAITING_CONFIRMATIONS,
    StatusStep.DELIVERING_ON_GOLIATH,
    ...(stakeOnGoliath ? [StatusStep.STAKING_ON_GOLIATH] : []),
    StatusStep.MIGRATION_COMPLETE,
  ];

  const stepIndex = stepOrder.indexOf(stepId);
  const activeIndex = activeStep ? stepOrder.indexOf(activeStep) : -1;

  // Special handling for staking step — uses client-side staking status
  if (stepId === StatusStep.STAKING_ON_GOLIATH) {
    const stakingInferred = inferStakingStatus(backendStatus, migrationFields, stakeOnGoliath, clientStakingStatus);
    if (stakingInferred === 'error') return 'error';
    if (stakingInferred === 'active') return 'active';
    if (stakingInferred === 'completed') return 'completed';
    // For idle: check if steps before staking are done
    if (activeIndex >= 0 && stepIndex <= activeIndex) {
      return 'completed';
    }
    if (isFailed) return 'error';
    return 'pending';
  }

  // MIGRATION_COMPLETE: only mark as completed when staking is also done (if opted)
  if (stepId === StatusStep.MIGRATION_COMPLETE && stakeOnGoliath && backendStatus === 'COMPLETED') {
    if (!clientStakingStatus || clientStakingStatus !== 'confirmed') {
      return 'pending';
    }
  }

  // FAILED / EXPIRED: mark the step that was active as error, completed steps stay completed
  if (isFailed) {
    if (activeIndex < 0) {
      // No active step determined -- mark all as error
      return stepIndex === 0 ? 'error' : 'pending';
    }
    if (stepIndex < activeIndex) return 'completed';
    if (stepIndex === activeIndex) return 'error';
    return 'pending';
  }

  // Normal flow
  if (activeIndex < 0) {
    // No active step yet (null status or unmapped)
    return stepIndex === 0 ? 'active' : 'pending';
  }

  if (stepIndex < activeIndex) return 'completed';
  if (stepIndex === activeIndex) {
    // The MIGRATION_COMPLETE step when active means the operation is done
    if (stepId === StatusStep.MIGRATION_COMPLETE) return 'completed';
    return 'active';
  }
  return 'pending';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIcon({ visualStatus }: { visualStatus: StepVisualStatus }) {
  switch (visualStatus) {
    case 'completed':
      return <Check size={16} aria-hidden="true" />;
    case 'active':
      return <SpinningLoader size={16} aria-hidden="true" />;
    case 'error':
      return <AlertCircle size={16} aria-hidden="true" />;
    default:
      return <Clock size={16} aria-hidden="true" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationStatusPanel({
  operationStatus,
  stakeOnGoliath,
  migrationFields,
  originTxHash,
  destinationTxHash,
  delayWarning,
  pollingError,
  errorMessage,
  onStartNewMigration,
  clientStakingStatus,
  clientStakingTxHash,
  clientStakingError,
  onExecuteStake,
  onRetryStake,
  onSwitchToGoliath,
}: MigrationStatusPanelProps) {
  const { t } = useTranslation();

  // Build step list
  const steps = useMemo(() => buildSteps(stakeOnGoliath), [stakeOnGoliath]);

  // Determine active step from backend status
  const activeStep = useMemo(
    () => mapStatusToActiveStep(operationStatus, stakeOnGoliath, migrationFields, clientStakingStatus),
    [operationStatus, stakeOnGoliath, migrationFields, clientStakingStatus]
  );

  const isFailed = operationStatus === 'FAILED' || operationStatus === 'EXPIRED';
  const isCompleted = operationStatus === 'COMPLETED';

  // The entire migration (including staking) is fully done
  const isFullyCompleted = isCompleted && (!stakeOnGoliath || clientStakingStatus === 'confirmed');
  const isTerminal = isFailed || isFullyCompleted;

  // Determine staking tx hash: prefer client-side, fallback to backend
  const stakingTxHash = clientStakingTxHash ?? migrationFields?.stakingTxHash ?? null;
  const stakingError = clientStakingError ?? migrationFields?.stakingError ?? null;

  const handleStartNew = useCallback(() => {
    onStartNewMigration?.();
  }, [onStartNewMigration]);

  return (
    <PanelContainer role="region" aria-label={t('migration.panel.title')}>
      <PanelTitle>{t('migration.panel.title')}</PanelTitle>

      {/* Step List */}
      <StepList role="list" aria-label={t('migration.panel.title')}>
        {steps.map((step, index) => {
          const visualStatus = getStepVisualStatus(
            step.id,
            activeStep,
            operationStatus,
            stakeOnGoliath,
            migrationFields,
            clientStakingStatus
          );
          const isLast = index === steps.length - 1;
          const isHighlighted = visualStatus === 'active' || visualStatus === 'completed';
          const lineActive = visualStatus === 'completed';

          // Determine which tx link to show for this step
          let txLinkElement: React.ReactNode = null;

          if (step.id === StatusStep.DEPOSIT_CONFIRMED && originTxHash) {
            const url = getExplorerTxUrl(BridgeNetwork.SEPOLIA, originTxHash);
            txLinkElement = (
              <TxLink
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('migration.panel.originTx')} ${truncateTxHash(originTxHash)}`}
              >
                {truncateTxHash(originTxHash)} <ExternalLink size={12} aria-hidden="true" />
              </TxLink>
            );
          }

          if (step.id === StatusStep.DELIVERING_ON_GOLIATH && destinationTxHash) {
            const url = getExplorerTxUrl(BridgeNetwork.GOLIATH, destinationTxHash);
            txLinkElement = (
              <TxLink
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('migration.panel.destinationTx')} ${truncateTxHash(destinationTxHash)}`}
              >
                {truncateTxHash(destinationTxHash)} <ExternalLink size={12} aria-hidden="true" />
              </TxLink>
            );
          }

          if (step.id === StatusStep.STAKING_ON_GOLIATH && stakingTxHash) {
            const url = getExplorerTxUrl(BridgeNetwork.GOLIATH, stakingTxHash);
            txLinkElement = (
              <TxLink
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('migration.panel.stakingTx')} ${truncateTxHash(stakingTxHash)}`}
              >
                {truncateTxHash(stakingTxHash)} <ExternalLink size={12} aria-hidden="true" />
              </TxLink>
            );
          }

          // Extra description and actions for staking step
          let stepDescription: React.ReactNode = null;
          let stepAction: React.ReactNode = null;

          if (step.id === StatusStep.STAKING_ON_GOLIATH && isCompleted) {
            if (clientStakingStatus === 'awaiting_network') {
              stepDescription = (
                <StepDescription>{t('migration.panel.switchToGoliathForStaking')}</StepDescription>
              );
              if (onSwitchToGoliath) {
                stepAction = (
                  <StakingActionButton onClick={onSwitchToGoliath} type="button">
                    {t('migration.panel.switchNetwork')}
                  </StakingActionButton>
                );
              }
            } else if (clientStakingStatus === 'pending_signature') {
              stepDescription = (
                <StepDescription>{t('migration.panel.confirmStakingInWallet')}</StepDescription>
              );
            } else if (clientStakingStatus === 'tx_pending') {
              stepDescription = (
                <StepDescription>{t('migration.panel.stakingInProgress')}</StepDescription>
              );
            } else if (clientStakingStatus === 'confirmed') {
              stepDescription = null; // Completed badge is enough
            } else if (clientStakingStatus === 'failed') {
              stepDescription = (
                <StepDescription style={{ color: 'inherit' }}>
                  {stakingError || t('migration.panel.stakingFailedGeneric')}
                </StepDescription>
              );
              if (onRetryStake) {
                stepAction = (
                  <StakingRetryButton onClick={onRetryStake} type="button">
                    {t('migration.action.retry')}
                  </StakingRetryButton>
                );
              }
            } else if (clientStakingStatus === 'idle' || !clientStakingStatus) {
              stepDescription = (
                <StepDescription>{t('migration.panel.readyToStake')}</StepDescription>
              );
              if (onExecuteStake) {
                stepAction = (
                  <StakingActionButton onClick={onExecuteStake} type="button">
                    {t('migration.panel.stakeNow')}
                  </StakingActionButton>
                );
              }
            }
          } else if (step.id === StatusStep.STAKING_ON_GOLIATH && !isCompleted) {
            // Bridge not yet completed — show pending description
            stepDescription = null;
          }

          return (
            <StepRow
              key={step.id}
              showLine={!isLast}
              lineActive={lineActive}
              role="listitem"
              aria-current={visualStatus === 'active' ? 'step' : undefined}
            >
              <StepIconCircle visualStatus={visualStatus}>
                <StepIcon visualStatus={visualStatus} />
              </StepIconCircle>
              <StepContent>
                <StepLabel isHighlighted={isHighlighted}>{t(step.labelKey)}</StepLabel>
                {stepDescription}
                {txLinkElement}
                {stepAction}
              </StepContent>
            </StepRow>
          );
        })}
      </StepList>

      {/* Delay Warning */}
      {delayWarning && !isTerminal && (
        <WarningBanner role="alert">
          <AlertTriangle size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>{t('migration.panel.delayWarning')}</span>
        </WarningBanner>
      )}

      {/* Polling Error */}
      {pollingError && !isTerminal && (
        <PollingErrorText role="alert">{t('migration.panel.pollingError')}</PollingErrorText>
      )}

      {/* Completed State — only shown when staking is also done (if opted) */}
      {isFullyCompleted && (
        <TerminalStateContainer>
          <TerminalIcon isSuccess>
            <CheckCircle size={40} aria-hidden="true" />
          </TerminalIcon>
          <TerminalMessage>
            {stakeOnGoliath
              ? t('migration.panel.successWithStaking')
              : t('migration.panel.successMessage')}
          </TerminalMessage>
          {onStartNewMigration && (
            <NewMigrationButton onClick={handleStartNew} type="button">
              {t('migration.panel.startNewMigration')}
              <ArrowRight size={16} aria-hidden="true" />
            </NewMigrationButton>
          )}
        </TerminalStateContainer>
      )}

      {/* Failed / Expired State */}
      {isFailed && (
        <>
          <ErrorBanner role="alert">
            <XCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <div>
              <div>
                {operationStatus === 'EXPIRED'
                  ? t('migration.panel.expiredMessage')
                  : t('migration.panel.failedMessage')}
              </div>
              {errorMessage && (
                <div style={{ marginTop: 4, opacity: 0.85 }}>
                  {t('migration.panel.errorDetails', { message: errorMessage })}
                </div>
              )}
            </div>
          </ErrorBanner>
          {onStartNewMigration && (
            <TerminalStateContainer>
              <NewMigrationButton onClick={handleStartNew} type="button">
                {t('migration.panel.startNewMigration')}
                <ArrowRight size={16} aria-hidden="true" />
              </NewMigrationButton>
            </TerminalStateContainer>
          )}
        </>
      )}
    </PanelContainer>
  );
}
