import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Check, Clock, AlertCircle, Loader } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { getStepDescription } from '../../utils/bridge/eta';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const SpinningLoader = styled(Loader)`
  animation: ${spin} 1s linear infinite;
`;

const StepperContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const StepRow = styled.div<{ showLine: boolean; lineActive: boolean }>`
  display: flex;
  align-items: flex-start;
  position: relative;
  padding-bottom: ${({ showLine }) => (showLine ? '24px' : '0')};

  ${({ showLine, lineActive, theme }) =>
    showLine &&
    `
    &::before {
      content: '';
      position: absolute;
      left: 15px;
      top: 32px;
      width: 2px;
      height: calc(100% - 32px);
      background-color: ${lineActive ? theme.green1 : theme.bg3};
    }
  `}
`;

const StepIconContainer = styled.div<{ status: 'pending' | 'active' | 'completed' | 'error' }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;
  background-color: ${({ status, theme }) => {
    switch (status) {
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
  color: ${({ status, theme }) => {
    switch (status) {
      case 'pending':
        return theme.text3;
      default:
        return 'white';
    }
  }};
`;

const StepContent = styled.div`
  margin-left: 12px;
`;

const StepLabel = styled.div<{ active: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${({ active, theme }) => (active ? theme.text1 : theme.text2)};
`;

const StepDescription = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text3};
  margin-top: 2px;
`;

interface StepConfig {
  labelKey: string;
  stepIndex: number;
}

const SEPOLIA_TO_GOLIATH_STEPS: StepConfig[] = [
  { labelKey: 'depositOnSepolia', stepIndex: 0 },
  { labelKey: 'waitingForConfirmations', stepIndex: 1 },
  { labelKey: 'mintingOnGoliath', stepIndex: 2 },
  { labelKey: 'complete', stepIndex: 3 },
];

// For Goliath→Sepolia with 0 required confirmations, skip the finality step
const GOLIATH_TO_SEPOLIA_STEPS: StepConfig[] = [
  { labelKey: 'burnOnGoliath', stepIndex: 0 },
  { labelKey: 'waitingForFinality', stepIndex: 1 },
  { labelKey: 'releasingOnSepolia', stepIndex: 2 },
  { labelKey: 'complete', stepIndex: 3 },
];

const GOLIATH_TO_SEPOLIA_STEPS_NO_FINALITY: StepConfig[] = [
  { labelKey: 'burnOnGoliath', stepIndex: 0 },
  { labelKey: 'releasingOnSepolia', stepIndex: 2 },
  { labelKey: 'complete', stepIndex: 3 },
];

function getStepStatus(
  stepIndex: number,
  operationStatus: BridgeStatus,
  originConfirmations: number,
  requiredConfirmations: number
): 'pending' | 'active' | 'completed' | 'error' {
  // Check if finality is reached (confirmations >= required)
  // This allows the UI to progress even if backend status hasn't updated yet
  const finalityReached = originConfirmations >= requiredConfirmations && requiredConfirmations >= 0;

  const statusToStep: Record<BridgeStatus, number> = {
    PENDING_ORIGIN_TX: 0,
    CONFIRMING: finalityReached ? 2 : 1, // Skip to step 2 if finality reached
    AWAITING_RELAY: 2,
    PROCESSING_DESTINATION: 2,
    COMPLETED: 4,
    FAILED: -1,
    EXPIRED: -1,
    DELAYED: 2,
  };

  const currentStep = statusToStep[operationStatus];

  if (operationStatus === 'FAILED' || operationStatus === 'EXPIRED') {
    return stepIndex <= currentStep ? 'error' : 'pending';
  }

  if (stepIndex < currentStep) {
    return 'completed';
  }
  if (stepIndex === currentStep) {
    return 'active';
  }
  return 'pending';
}

function StepIcon({ status }: { status: 'pending' | 'active' | 'completed' | 'error' }) {
  switch (status) {
    case 'completed':
      return <Check size={16} />;
    case 'active':
      return <SpinningLoader size={16} />;
    case 'error':
      return <AlertCircle size={16} />;
    default:
      return <Clock size={16} />;
  }
}

interface BridgeStatusStepperProps {
  operation: BridgeOperation;
}

export default function BridgeStatusStepper({ operation }: BridgeStatusStepperProps) {
  const { t } = useTranslation();
  // For Goliath→Sepolia, we don't require finality confirmations (instant finality)
  // Override requiredConfirmations to 0 regardless of what backend returns
  const effectiveRequiredConfirmations =
    operation.direction === 'GOLIATH_TO_SEPOLIA' ? 0 : operation.requiredConfirmations;

  // Choose steps based on direction - always skip finality step for Goliath→Sepolia
  const skipFinalityStep = operation.direction === 'GOLIATH_TO_SEPOLIA';

  let steps: StepConfig[];
  if (operation.direction === 'SEPOLIA_TO_GOLIATH') {
    steps = SEPOLIA_TO_GOLIATH_STEPS;
  } else if (skipFinalityStep) {
    steps = GOLIATH_TO_SEPOLIA_STEPS_NO_FINALITY;
  } else {
    steps = GOLIATH_TO_SEPOLIA_STEPS;
  }

  return (
    <StepperContainer>
      {steps.map((step, index) => {
        const status = getStepStatus(
          step.stepIndex,
          operation.status,
          operation.originConfirmations,
          effectiveRequiredConfirmations
        );
        const isLast = index === steps.length - 1;
        const description = getStepDescription(step.stepIndex, operation, t);

        return (
          <StepRow key={step.stepIndex} showLine={!isLast} lineActive={status === 'completed'}>
            <StepIconContainer status={status}>
              <StepIcon status={status} />
            </StepIconContainer>
            <StepContent>
              <StepLabel active={status === 'active' || status === 'completed'}>
                {t(step.labelKey)}
              </StepLabel>
              {description && <StepDescription>{description}</StepDescription>}
            </StepContent>
          </StepRow>
        );
      })}
    </StepperContainer>
  );
}
