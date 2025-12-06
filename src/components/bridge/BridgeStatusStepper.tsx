import React from 'react';
import styled from 'styled-components';
import { Check, Clock, AlertCircle, Loader } from 'react-feather';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { getStepDescription } from '../../utils/bridge/eta';

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
  label: string;
  stepIndex: number;
}

const SEPOLIA_TO_GOLIATH_STEPS: StepConfig[] = [
  { label: 'Deposit on Sepolia', stepIndex: 0 },
  { label: 'Waiting for confirmations', stepIndex: 1 },
  { label: 'Minting on Goliath', stepIndex: 2 },
  { label: 'Complete', stepIndex: 3 },
];

const GOLIATH_TO_SEPOLIA_STEPS: StepConfig[] = [
  { label: 'Burn on Goliath', stepIndex: 0 },
  { label: 'Waiting for finality', stepIndex: 1 },
  { label: 'Releasing on Sepolia', stepIndex: 2 },
  { label: 'Complete', stepIndex: 3 },
];

function getStepStatus(
  stepIndex: number,
  operationStatus: BridgeStatus
): 'pending' | 'active' | 'completed' | 'error' {
  const statusToStep: Record<BridgeStatus, number> = {
    PENDING_ORIGIN_TX: 0,
    CONFIRMING: 1,
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
      return <Loader size={16} className="spin" />;
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
  const steps =
    operation.direction === 'SEPOLIA_TO_GOLIATH' ? SEPOLIA_TO_GOLIATH_STEPS : GOLIATH_TO_SEPOLIA_STEPS;

  return (
    <StepperContainer>
      {steps.map((step, index) => {
        const status = getStepStatus(step.stepIndex, operation.status);
        const isLast = index === steps.length - 1;
        const description = getStepDescription(step.stepIndex, operation);

        return (
          <StepRow key={step.stepIndex} showLine={!isLast} lineActive={status === 'completed'}>
            <StepIconContainer status={status}>
              <StepIcon status={status} />
            </StepIconContainer>
            <StepContent>
              <StepLabel active={status === 'active' || status === 'completed'}>
                {step.label}
              </StepLabel>
              {description && <StepDescription>{description}</StepDescription>}
            </StepContent>
          </StepRow>
        );
      })}
    </StepperContainer>
  );
}
