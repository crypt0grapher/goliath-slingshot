import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { theme } from '../../../theme';
import { MigrationStep, StepExecutionStatus } from '../../../constants/migration';
import MigrationStepper from '../MigrationStepper';
import { useMigrationFlow } from '../../../hooks/migration/useMigrationFlow';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('../../../hooks/migration/useMigrationFlow', () => ({
  useMigrationFlow: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options.step === 'string') {
        return `${key}:${options.step}`;
      }
      return key;
    },
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

const mockedUseSelector = useSelector as jest.Mock;
const mockedUseMigrationFlow = useMigrationFlow as jest.Mock;
const testTheme = theme(true);

let mockStepExecutions: Record<MigrationStep, { status: StepExecutionStatus; txHash?: string }>;

function renderStepper(params: {
  executeClaim?: () => Promise<void>;
  executeApprove?: () => Promise<void>;
  executeUnstake?: () => Promise<void>;
  executeBridge?: () => Promise<void>;
}) {
  return render(
    <ThemeProvider theme={testTheme}>
      <MemoryRouter>
        <MigrationStepper
          executeClaim={params.executeClaim ?? jest.fn(async () => {})}
          executeApprove={params.executeApprove ?? jest.fn(async () => {})}
          executeUnstake={params.executeUnstake ?? jest.fn(async () => {})}
          executeBridge={params.executeBridge ?? jest.fn(async () => {})}
        />
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockStepExecutions = {
    [MigrationStep.CLAIM_REWARDS]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.APPROVE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.UNSTAKE]: { status: StepExecutionStatus.IDLE },
    [MigrationStep.BRIDGE]: { status: StepExecutionStatus.IDLE },
  };

  mockedUseSelector.mockImplementation((selector: any) =>
    selector({
      migration: {
        flow: {
          stepExecutions: mockStepExecutions,
        },
      },
    })
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MigrationStepper', () => {
  it('renders one automation button and no per-step action buttons', () => {
    mockedUseMigrationFlow.mockReturnValue({
      visibleSteps: [MigrationStep.APPROVE, MigrationStep.UNSTAKE],
      activeStep: MigrationStep.APPROVE,
      isEmpty: false,
      isResume: false,
      isStatusView: false,
    });

    renderStepper({});

    expect(
      screen.getByRole('button', { name: 'migration.stepper.automationStart' })
    ).not.toBeNull();

    const allButtons = screen.getAllByRole('button');
    expect(allButtons).toHaveLength(1);
  });

  it('runs steps sequentially from a single click', async () => {
    mockedUseMigrationFlow.mockReturnValue({
      visibleSteps: [MigrationStep.APPROVE, MigrationStep.UNSTAKE, MigrationStep.BRIDGE],
      activeStep: MigrationStep.APPROVE,
      isEmpty: false,
      isResume: false,
      isStatusView: false,
    });

    const executeApprove = jest.fn(async () => {
      mockStepExecutions[MigrationStep.APPROVE].status = StepExecutionStatus.CONFIRMED;
    });
    const executeUnstake = jest.fn(async () => {
      mockStepExecutions[MigrationStep.UNSTAKE].status = StepExecutionStatus.CONFIRMED;
    });
    const executeBridge = jest.fn(async () => {
      mockStepExecutions[MigrationStep.BRIDGE].status = StepExecutionStatus.TX_PENDING;
      mockStepExecutions[MigrationStep.BRIDGE].txHash = '0xbridge';
    });

    renderStepper({
      executeApprove,
      executeUnstake,
      executeBridge,
    });

    fireEvent.click(screen.getByRole('button', { name: 'migration.stepper.automationStart' }));

    await waitFor(() => {
      expect(executeApprove).toHaveBeenCalledTimes(1);
      expect(executeUnstake).toHaveBeenCalledTimes(1);
      expect(executeBridge).toHaveBeenCalledTimes(1);
    });

    expect(executeApprove.mock.invocationCallOrder[0]).toBeLessThan(
      executeUnstake.mock.invocationCallOrder[0]
    );
    expect(executeUnstake.mock.invocationCallOrder[0]).toBeLessThan(
      executeBridge.mock.invocationCallOrder[0]
    );
  });

  it('stops orchestration when a step does not confirm', async () => {
    mockedUseMigrationFlow.mockReturnValue({
      visibleSteps: [MigrationStep.APPROVE, MigrationStep.UNSTAKE],
      activeStep: MigrationStep.APPROVE,
      isEmpty: false,
      isResume: false,
      isStatusView: false,
    });

    const executeApprove = jest.fn(async () => {
      mockStepExecutions[MigrationStep.APPROVE].status = StepExecutionStatus.FAILED;
    });
    const executeUnstake = jest.fn(async () => {
      mockStepExecutions[MigrationStep.UNSTAKE].status = StepExecutionStatus.CONFIRMED;
    });

    renderStepper({
      executeApprove,
      executeUnstake,
    });

    fireEvent.click(screen.getByRole('button', { name: 'migration.stepper.automationStart' }));

    await waitFor(() => {
      expect(executeApprove).toHaveBeenCalledTimes(1);
    });

    expect(executeUnstake).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('migration.stepper.automationStepFailed');
  });
});
