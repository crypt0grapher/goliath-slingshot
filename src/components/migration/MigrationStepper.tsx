import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, Inbox } from 'react-feather';
import { MigrationStep, StepExecutionStatus } from '../../constants/migration';
import { StepExecution } from '../../state/migration/types';
import { useMigrationFlow } from '../../hooks/migration/useMigrationFlow';
import MigrationStepItem from './MigrationStepItem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationStepperProps {
  /** Execution callbacks for each step, provided by useMigrationTransactions. */
  executeClaim: () => Promise<void>;
  executeApprove: () => Promise<void>;
  executeUnstake: () => Promise<void>;
  executeBridge: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Step metadata mapping
// ---------------------------------------------------------------------------

interface StepMeta {
  titleKey: string;
  descriptionKey: string;
}

const STEP_META: Record<MigrationStep, StepMeta> = {
  [MigrationStep.CLAIM_REWARDS]: {
    titleKey: 'migration.step.claimRewards.title',
    descriptionKey: 'migration.step.claimRewards.description',
  },
  [MigrationStep.APPROVE]: {
    titleKey: 'migration.step.approve.title',
    descriptionKey: 'migration.step.approve.description',
  },
  [MigrationStep.UNSTAKE]: {
    titleKey: 'migration.step.unstake.title',
    descriptionKey: 'migration.step.unstake.description',
  },
  [MigrationStep.BRIDGE]: {
    titleKey: 'migration.step.bridge.title',
    descriptionKey: 'migration.step.bridge.description',
  },
};

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ---------------------------------------------------------------------------
// Styled Components
// ---------------------------------------------------------------------------

const StepperContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 500px;
  animation: ${fadeIn} 0.3s ease-out;
`;

const StepperTitle = styled.h3`
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

const AutomationIntro = styled.p`
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.bg3};
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text2};
  font-size: 13px;
  line-height: 1.5;
  text-align: center;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
    padding: 10px 12px;
  `}
`;

const AutomationButton = styled.button`
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  background: ${({ theme }) => theme.primary1};
  color: ${({ theme }) => theme.white};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
  margin-bottom: 12px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
    margin-bottom: 10px;
  `}
`;

const AutomationError = styled.div`
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.red1 + '40'};
  background: ${({ theme }) => theme.red1 + '10'};
  color: ${({ theme }) => theme.red1};
  font-size: 12px;
  line-height: 1.4;
`;

const StepsList = styled.div`
  display: flex;
  flex-direction: column;
`;

const StepWrapper = styled.div<{ showConnector: boolean; connectorActive: boolean }>`
  position: relative;
  padding-bottom: ${({ showConnector }) => (showConnector ? '0' : '0')};

  /* Vertical connector line between steps */
  ${({ showConnector, connectorActive, theme }) =>
    showConnector &&
    `
    &::after {
      content: '';
      position: absolute;
      left: 34px;
      top: 100%;
      width: 2px;
      height: 12px;
      background-color: ${connectorActive ? theme.green1 : theme.bg3};
      transition: background-color 0.3s ease;
    }
  `}

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    &::after {
      left: 28px;
    }
  `}
`;

const StepSpacing = styled.div`
  height: 12px;
`;

const ResumeHint = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.primary1};
  background-color: ${({ theme }) => theme.primary1 + '10'};
  border: 1px solid ${({ theme }) => theme.primary1 + '30'};
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  line-height: 1.4;
  text-align: center;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 12px;
    padding: 10px 12px;
    margin-bottom: 12px;
  `}
`;

// ---------------------------------------------------------------------------
// Completion State
// ---------------------------------------------------------------------------

const CompletionContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  margin-top: 16px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.green1 + '10'};
  border: 1px solid ${({ theme }) => theme.green1 + '30'};
  animation: ${fadeIn} 0.3s ease-out;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 16px 12px;
    margin-top: 12px;
  `}
`;

const CompletionIcon = styled.div`
  color: ${({ theme }) => theme.green1};
`;

const CompletionMessage = styled.div`
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  text-align: center;
  line-height: 1.4;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
  `}
`;

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 20px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg3};
  text-align: center;
  animation: ${fadeIn} 0.3s ease-out;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 24px 16px;
    gap: 12px;
  `}
`;

const EmptyIcon = styled.div`
  color: ${({ theme }) => theme.text3};
`;

const EmptyTitle = styled.div`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text2};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 15px;
  `}
`;

const BridgeLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;
  transition: opacity 0.2s ease;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.primary1};
    outline-offset: 2px;
    border-radius: 4px;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const STEP_STATUS_SETTLE_TIMEOUT_MS = 2000;
const STEP_STATUS_POLL_MS = 100;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helper: read step execution from Redux using the selector
// ---------------------------------------------------------------------------

/**
 * Mini-hook that reads all step executions for visible steps via the Redux
 * selector. We call useSelector once per step in a sub-component to keep
 * the rules of hooks satisfied (constant number of hook calls per component).
 * However, since visibleSteps can vary in length, we read the full
 * stepExecutions record instead and index into it.
 */
function useStepExecutions(): Record<MigrationStep, StepExecution> {
  return useSelector(
    (state: { migration: { flow: { stepExecutions: Record<MigrationStep, StepExecution> } } }) =>
      state.migration.flow.stepExecutions
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MigrationStepper({
  executeClaim,
  executeApprove,
  executeUnstake,
  executeBridge,
}: MigrationStepperProps) {
  const { t } = useTranslation();
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  // Read flow state from the hook (which also syncs to Redux)
  const { visibleSteps, activeStep, isEmpty, isResume } = useMigrationFlow();

  // Read step executions from Redux
  const stepExecutions = useStepExecutions();

  const mountedRef = useRef(true);
  const visibleStepsRef = useRef<MigrationStep[]>(visibleSteps);
  const stepExecutionsRef = useRef(stepExecutions);

  // Build the callback lookup
  const callbacks = useMemo<Record<MigrationStep, () => Promise<void>>>(
    () => ({
      [MigrationStep.CLAIM_REWARDS]: executeClaim,
      [MigrationStep.APPROVE]: executeApprove,
      [MigrationStep.UNSTAKE]: executeUnstake,
      [MigrationStep.BRIDGE]: executeBridge,
    }),
    [executeClaim, executeApprove, executeUnstake, executeBridge]
  );
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    visibleStepsRef.current = visibleSteps;
  }, [visibleSteps]);

  useEffect(() => {
    stepExecutionsRef.current = stepExecutions;
  }, [stepExecutions]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Determine if all visible steps are confirmed (flow complete)
  const allConfirmed = useMemo(() => {
    if (visibleSteps.length === 0) return false;
    return visibleSteps.every(
      (step) => stepExecutions[step]?.status === StepExecutionStatus.CONFIRMED
    );
  }, [visibleSteps, stepExecutions]);

  const hasInFlightStep = useMemo(
    () =>
      visibleSteps.some((step) => {
        const status = stepExecutions[step]?.status;
        return (
          status === StepExecutionStatus.WAITING_SIGNATURE ||
          status === StepExecutionStatus.TX_PENDING
        );
      }),
    [visibleSteps, stepExecutions]
  );

  const hasFailedStep = useMemo(
    () =>
      visibleSteps.some((step) => {
        const status = stepExecutions[step]?.status;
        return status === StepExecutionStatus.FAILED;
      }),
    [visibleSteps, stepExecutions]
  );

  const canRunAutomation = !isAutomating && !hasInFlightStep && !allConfirmed && visibleSteps.length > 0;

  const getButtonLabel = () => {
    if (isAutomating || hasInFlightStep) return t('migration.stepper.automationRunning');
    if (hasFailedStep || isResume) return t('migration.stepper.automationContinue');
    return t('migration.stepper.automationStart');
  };

  const waitForStepStatus = useCallback(
    async (step: MigrationStep): Promise<StepExecutionStatus> => {
      const started = Date.now();

      while (Date.now() - started < STEP_STATUS_SETTLE_TIMEOUT_MS) {
        const status = stepExecutionsRef.current[step]?.status ?? StepExecutionStatus.IDLE;
        if (status === StepExecutionStatus.WAITING_SIGNATURE) {
          await wait(STEP_STATUS_POLL_MS);
          continue;
        }
        return status;
      }

      return stepExecutionsRef.current[step]?.status ?? StepExecutionStatus.IDLE;
    },
    []
  );

  const runAutomation = useCallback(async () => {
    if (!canRunAutomation) return;

    setAutomationError(null);
    setIsAutomating(true);

    try {
      for (const step of visibleStepsRef.current) {
        const currentStatus = stepExecutionsRef.current[step]?.status ?? StepExecutionStatus.IDLE;

        if (currentStatus === StepExecutionStatus.CONFIRMED) {
          continue;
        }

        const execute = callbacksRef.current[step];
        await execute();

        const finalStatus = await waitForStepStatus(step);
        const stepLabel = t(STEP_META[step].titleKey);

        if (step === MigrationStep.BRIDGE) {
          if (
            finalStatus !== StepExecutionStatus.CONFIRMED &&
            finalStatus !== StepExecutionStatus.TX_PENDING
          ) {
            throw new Error(t('migration.stepper.automationStepFailed', { step: stepLabel }));
          }
          continue;
        }

        if (finalStatus !== StepExecutionStatus.CONFIRMED) {
          throw new Error(t('migration.stepper.automationStepFailed', { step: stepLabel }));
        }
      }
    } catch (error: any) {
      const message =
        typeof error?.message === 'string' && error.message.length > 0
          ? error.message
          : t('migration.stepper.automationFailed');

      if (mountedRef.current) {
        setAutomationError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsAutomating(false);
      }
    }
  }, [canRunAutomation, t, waitForStepStatus]);

  // ---- Empty State: no XCN to migrate ----
  if (isEmpty) {
    return (
      <EmptyContainer role="region" aria-label={t('migration.empty.noXCNToMigrate')}>
        <EmptyIcon>
          <Inbox size={40} aria-hidden="true" />
        </EmptyIcon>
        <EmptyTitle>{t('migration.empty.noXCNToMigrate')}</EmptyTitle>
        <BridgeLink to="/bridge">
          {t('migration.empty.bridgeLinkText')}
          <ArrowRight size={14} aria-hidden="true" />
        </BridgeLink>
      </EmptyContainer>
    );
  }

  // ---- Stepper ----
  return (
    <StepperContainer role="region" aria-label={t('migration.stepper.title')}>
      <StepperTitle>{t('migration.stepper.title')}</StepperTitle>
      <AutomationIntro>{t('migration.stepper.automationDescription')}</AutomationIntro>

      {/* Resume hint for wallet-only path */}
      {isResume && (
        <ResumeHint role="status">{t('migration.resumeHint')}</ResumeHint>
      )}

      {!allConfirmed && (
        <>
          <AutomationButton onClick={runAutomation} disabled={!canRunAutomation} type="button">
            {getButtonLabel()}
          </AutomationButton>
          {automationError && <AutomationError role="alert">{automationError}</AutomationError>}
        </>
      )}

      {/* Step list */}
      <StepsList role="list" aria-label={t('migration.stepper.title')}>
        {visibleSteps.map((step, index) => {
          const meta = STEP_META[step];
          const execution = stepExecutions[step];
          const isActive = step === activeStep;
          const isLast = index === visibleSteps.length - 1;
          const stepNumber = index + 1;

          // Connector is "active" (green) when the current step is confirmed
          const connectorActive = execution?.status === StepExecutionStatus.CONFIRMED;

          return (
            <React.Fragment key={step}>
              <StepWrapper showConnector={!isLast} connectorActive={connectorActive}>
                <MigrationStepItem
                  stepNumber={stepNumber}
                  step={step}
                  title={t(meta.titleKey)}
                  description={t(meta.descriptionKey)}
                  status={execution?.status ?? StepExecutionStatus.IDLE}
                  isActive={isActive}
                  actionMode="tracking"
                  txHash={execution?.txHash}
                />
              </StepWrapper>

              {/* Spacing between steps (not after the last step) */}
              {!isLast && <StepSpacing />}
            </React.Fragment>
          );
        })}
      </StepsList>

      {/* Completion message when all steps are confirmed */}
      {allConfirmed && (
        <CompletionContainer role="status" aria-live="polite">
          <CompletionIcon>
            <CheckCircle size={36} aria-hidden="true" />
          </CompletionIcon>
          <CompletionMessage>
            {t('migration.stepper.completionMessage')}
          </CompletionMessage>
        </CompletionContainer>
      )}
    </StepperContainer>
  );
}
