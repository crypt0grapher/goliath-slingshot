import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ThemeProvider } from 'styled-components';
import { MigrationStep, StepExecutionStatus } from '../../../constants/migration';
import { theme } from '../../../theme';
import MigrationStepItem, { MigrationStepItemProps } from '../MigrationStepItem';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock react-i18next — t() returns the key as-is for deterministic assertions
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// Mock react-feather icons so we can find them without DOM queries on SVGs.
// Must include all icons used transitively (theme/components.tsx uses X, ArrowLeft, etc.)
jest.mock('react-feather', () => {
  const React = require('react');
  const createIcon = (testId: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement('span', { 'data-testid': testId, ref, ...props })
    );
  return {
    Check: createIcon('icon-check'),
    Loader: createIcon('icon-loader'),
    AlertCircle: createIcon('icon-alert-circle'),
    ExternalLink: createIcon('icon-external-link'),
    X: createIcon('icon-x'),
    ArrowLeft: createIcon('icon-arrow-left'),
    Trash: createIcon('icon-trash'),
  };
});

// Mock bridgeConfig so the explorer URL is deterministic
jest.mock('../../../config/bridgeConfig', () => ({
  bridgeConfig: {
    sepolia: {
      chainId: 11155111,
      rpcUrl: 'https://rpc.test',
      explorerUrl: 'https://sepolia.etherscan.io',
      bridgeAddress: '0x0000000000000000000000000000000000000000',
    },
    goliath: {
      chainId: 8901,
      rpcUrl: 'https://rpc.goliath.test',
      explorerUrl: 'https://explorer.goliath.test',
      bridgeAddress: '0x0000000000000000000000000000000000000000',
    },
    tokens: { sepolia: { usdc: '0x0' }, goliath: { eth: '0x0', usdc: '0x0' } },
    statusApiBaseUrl: 'https://api.test',
    bridgeEnabled: true,
    allowCustomRecipient: false,
    minAmount: '0.000001',
    statusPollInterval: 500,
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const testTheme = theme(true); // dark mode theme

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

function renderComponent(props: Partial<MigrationStepItemProps> = {}) {
  const defaultProps: MigrationStepItemProps = {
    stepNumber: 1,
    step: MigrationStep.APPROVE,
    title: 'Approve XCN',
    description: 'Approve the staking contract to spend your XCN tokens.',
    status: StepExecutionStatus.IDLE,
    isActive: false,
    onAction: jest.fn(),
    ...props,
  };

  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <MigrationStepItem {...defaultProps} />
      </ThemeProvider>,
      container
    );
  });

  return {
    props: defaultProps,
    getByRole: (role: string) => container.querySelector(`[role="${role}"]`),
    getByText: (text: string) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent?.includes(text)) {
          return walker.currentNode.parentElement;
        }
      }
      return null;
    },
    getByTestId: (id: string) => container.querySelector(`[data-testid="${id}"]`),
    getByAriaLabel: (label: string) => container.querySelector(`[aria-label="${label}"]`),
    getAllButtons: () => Array.from(container.querySelectorAll('button')),
    getAllLinks: () => Array.from(container.querySelectorAll('a')),
    getContainer: () => container,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MigrationStepItem', () => {
  // ========================================================================
  // Basic rendering
  // ========================================================================

  describe('basic rendering', () => {
    it('renders the title', () => {
      const { getByText } = renderComponent({ title: 'Approve XCN' });
      expect(getByText('Approve XCN')).not.toBeNull();
    });

    it('renders the description', () => {
      const { getByText } = renderComponent({
        description: 'Approve the staking contract to spend your XCN tokens.',
      });
      expect(getByText('Approve the staking contract')).not.toBeNull();
    });

    it('renders with role="listitem"', () => {
      const { getByRole } = renderComponent();
      expect(getByRole('listitem')).not.toBeNull();
    });

    it('renders the step number in the circle when IDLE', () => {
      renderComponent({ stepNumber: 3, status: StepExecutionStatus.IDLE });
      // The step number should appear as text content
      const text = container.textContent;
      expect(text).toContain('3');
    });
  });

  // ========================================================================
  // IDLE + isActive — renders enabled action button
  // ========================================================================

  describe('IDLE + isActive', () => {
    it('renders an enabled action button with the step title', () => {
      const onAction = jest.fn();
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: true,
        title: 'Approve XCN',
        onAction,
      });

      const buttons = getAllButtons();
      const actionButton = buttons.find((b) => b.textContent?.includes('Approve XCN'));
      expect(actionButton).toBeDefined();
      expect(actionButton!.disabled).toBe(false);
    });

    it('fires onAction when the button is clicked', () => {
      const onAction = jest.fn();
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: true,
        title: 'Approve XCN',
        onAction,
      });

      const actionButton = getAllButtons().find((b) => b.textContent?.includes('Approve XCN'));
      act(() => {
        actionButton!.click();
      });
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('sets aria-current="step" on the container', () => {
      renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: true,
      });

      const listitem = container.querySelector('[role="listitem"]');
      expect(listitem?.getAttribute('aria-current')).toBe('step');
    });

    it('does not render the error message', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: true,
      });
      expect(getByText('migration.action.failed')).toBeNull();
    });

    it('renders the step number (not a spinner or check)', () => {
      const { getByTestId } = renderComponent({
        stepNumber: 2,
        status: StepExecutionStatus.IDLE,
        isActive: true,
      });
      expect(getByTestId('icon-check')).toBeNull();
      expect(getByTestId('icon-loader')).toBeNull();
      expect(container.textContent).toContain('2');
    });
  });

  // ========================================================================
  // IDLE + !isActive — renders greyed out / disabled state
  // ========================================================================

  describe('IDLE + !isActive (inactive)', () => {
    it('does not render an action button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: false,
        title: 'Approve XCN',
      });
      const actionButton = getAllButtons().find((b) => b.textContent?.includes('Approve XCN'));
      expect(actionButton).toBeUndefined();
    });

    it('shows "waiting for previous" label', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: false,
      });
      expect(getByText('migration.action.waitingForPrevious')).not.toBeNull();
    });

    it('does not set aria-current="step"', () => {
      renderComponent({
        status: StepExecutionStatus.IDLE,
        isActive: false,
      });
      const listitem = container.querySelector('[role="listitem"]');
      expect(listitem?.getAttribute('aria-current')).toBeNull();
    });

    it('renders the step number', () => {
      renderComponent({
        stepNumber: 4,
        status: StepExecutionStatus.IDLE,
        isActive: false,
      });
      expect(container.textContent).toContain('4');
    });
  });

  // ========================================================================
  // WAITING_SIGNATURE — shows "Waiting for wallet..." + spinner
  // ========================================================================

  describe('WAITING_SIGNATURE', () => {
    it('shows "Waiting for wallet" text', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: true,
      });
      expect(getByText('migration.action.waitingForWallet')).not.toBeNull();
    });

    it('renders a disabled button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: true,
      });
      const disabledButtons = getAllButtons().filter((b) => b.disabled);
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    it('renders a spinner (Loader icon) in the step circle', () => {
      renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: true,
      });
      // The SpinningLoader is rendered inside the step number circle
      const loaders = container.querySelectorAll('[data-testid="icon-loader"]');
      expect(loaders.length).toBeGreaterThan(0);
    });

    it('does not fire onAction when the disabled button is clicked', () => {
      const onAction = jest.fn();
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: true,
        onAction,
      });
      const btn = getAllButtons()[0];
      act(() => {
        btn.click();
      });
      expect(onAction).not.toHaveBeenCalled();
    });

    it('does not show error message', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: true,
      });
      expect(getByText('migration.action.failed')).toBeNull();
    });
  });

  // ========================================================================
  // TX_PENDING — shows "Transaction pending..." + spinner + tx hash link
  // ========================================================================

  describe('TX_PENDING', () => {
    const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    it('shows "Transaction pending" text', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      expect(getByText('migration.action.txPending')).not.toBeNull();
    });

    it('renders a disabled button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      const disabledButtons = getAllButtons().filter((b) => b.disabled);
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    it('renders a spinner (Loader icon) in the step circle', () => {
      renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      const loaders = container.querySelectorAll('[data-testid="icon-loader"]');
      expect(loaders.length).toBeGreaterThan(0);
    });

    it('renders a tx hash link when txHash is provided', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      const links = getAllLinks();
      expect(links.length).toBeGreaterThan(0);
      const txLink = links.find((a) => a.getAttribute('href')?.includes(txHash));
      expect(txLink).toBeDefined();
      expect(txLink!.getAttribute('href')).toBe(`https://sepolia.etherscan.io/tx/${txHash}`);
    });

    it('tx link opens in a new tab with noopener noreferrer', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      const txLink = getAllLinks().find((a) => a.getAttribute('href')?.includes(txHash));
      expect(txLink!.getAttribute('target')).toBe('_blank');
      expect(txLink!.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders truncated tx hash text', () => {
      renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      // truncateTxHash: first 6 chars + "..." + last 4 chars
      const truncated = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
      expect(container.textContent).toContain(truncated);
    });

    it('does not render tx link when txHash is undefined', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash: undefined,
      });
      const txLinks = getAllLinks().filter((a) =>
        a.getAttribute('href')?.includes('etherscan')
      );
      expect(txLinks.length).toBe(0);
    });

    it('does not show error message', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      expect(getByText('migration.action.failed')).toBeNull();
    });
  });

  // ========================================================================
  // CONFIRMED — shows checkmark + "Completed" + tx hash link
  // ========================================================================

  describe('CONFIRMED', () => {
    const txHash = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeee0001';

    it('shows "Completed" text', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      expect(getByText('migration.action.completed')).not.toBeNull();
    });

    it('renders check icons (circle indicator + completed badge)', () => {
      renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      const checks = container.querySelectorAll('[data-testid="icon-check"]');
      // One in the step number circle, one in the CompletedBadge
      expect(checks.length).toBe(2);
    });

    it('does not render a spinner', () => {
      const { getByTestId } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      // There should be no Loader icon in the step circle
      // (there may be none at all or none visible)
      const loaders = container.querySelectorAll('[data-testid="icon-loader"]');
      expect(loaders.length).toBe(0);
    });

    it('renders a tx hash link when txHash is provided', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      const txLink = getAllLinks().find((a) => a.getAttribute('href')?.includes(txHash));
      expect(txLink).toBeDefined();
      expect(txLink!.getAttribute('href')).toBe(`https://sepolia.etherscan.io/tx/${txHash}`);
    });

    it('does not render tx link when txHash is undefined', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash: undefined,
      });
      const txLinks = getAllLinks().filter((a) =>
        a.getAttribute('href')?.includes('etherscan')
      );
      expect(txLinks.length).toBe(0);
    });

    it('does not render an action button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      expect(getAllButtons().length).toBe(0);
    });

    it('does not show error message', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      expect(getByText('migration.action.failed')).toBeNull();
    });

    it('renders truncated tx hash text', () => {
      renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: false,
        txHash,
      });
      const truncated = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
      expect(container.textContent).toContain(truncated);
    });
  });

  // ========================================================================
  // FAILED — shows error styling + "Retry" button
  // ========================================================================

  describe('FAILED', () => {
    const txHash = '0xfail222233334444555566667777888899990000aaaabbbbccccddddeeee0001';

    it('shows error message text', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      expect(getByText('migration.action.failed')).not.toBeNull();
    });

    it('renders a "Retry" button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      const retryBtn = getAllButtons().find((b) =>
        b.textContent?.includes('migration.action.retry')
      );
      expect(retryBtn).toBeDefined();
      expect(retryBtn!.disabled).toBe(false);
    });

    it('retry button has aria-label for accessibility', () => {
      const { getByAriaLabel } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      const retryBtn = getByAriaLabel('migration.action.retry');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn!.tagName.toLowerCase()).toBe('button');
    });

    it('fires onAction when retry button is clicked', () => {
      const onAction = jest.fn();
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
        onAction,
      });
      const retryBtn = getAllButtons().find((b) =>
        b.textContent?.includes('migration.action.retry')
      );
      act(() => {
        retryBtn!.click();
      });
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('renders an AlertCircle icon in the step circle', () => {
      renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      const alertIcons = container.querySelectorAll('[data-testid="icon-alert-circle"]');
      expect(alertIcons.length).toBeGreaterThan(0);
    });

    it('renders a tx hash link when txHash is provided', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      const txLink = getAllLinks().find((a) => a.getAttribute('href')?.includes(txHash));
      expect(txLink).toBeDefined();
      expect(txLink!.getAttribute('href')).toBe(`https://sepolia.etherscan.io/tx/${txHash}`);
    });

    it('does not render tx link when txHash is undefined', () => {
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash: undefined,
      });
      const txLinks = getAllLinks().filter((a) =>
        a.getAttribute('href')?.includes('etherscan')
      );
      expect(txLinks.length).toBe(0);
    });

    it('does not render a check icon', () => {
      renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: true,
        txHash,
      });
      const checks = container.querySelectorAll('[data-testid="icon-check"]');
      expect(checks.length).toBe(0);
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('different MigrationStep types render correctly', () => {
      const steps = [
        MigrationStep.CLAIM_REWARDS,
        MigrationStep.APPROVE,
        MigrationStep.UNSTAKE,
        MigrationStep.BRIDGE,
      ];
      steps.forEach((step, index) => {
        const { getByText } = renderComponent({
          step,
          stepNumber: index + 1,
          title: `Step ${step}`,
          status: StepExecutionStatus.IDLE,
          isActive: true,
        });
        expect(getByText(`Step ${step}`)).not.toBeNull();
      });
    });

    it('CONFIRMED with isActive=true still renders completed badge (not action button)', () => {
      const { getByText, getAllButtons } = renderComponent({
        status: StepExecutionStatus.CONFIRMED,
        isActive: true,
      });
      expect(getByText('migration.action.completed')).not.toBeNull();
      expect(getAllButtons().length).toBe(0);
    });

    it('FAILED with isActive=false still renders retry button', () => {
      const { getAllButtons } = renderComponent({
        status: StepExecutionStatus.FAILED,
        isActive: false,
      });
      const retryBtn = getAllButtons().find((b) =>
        b.textContent?.includes('migration.action.retry')
      );
      expect(retryBtn).toBeDefined();
    });

    it('WAITING_SIGNATURE with isActive=false still renders waiting state', () => {
      const { getByText } = renderComponent({
        status: StepExecutionStatus.WAITING_SIGNATURE,
        isActive: false,
      });
      expect(getByText('migration.action.waitingForWallet')).not.toBeNull();
    });

    it('tx hash link has correct aria-label including truncated hash', () => {
      const txHash = '0xaabbccdd11223344556677889900aabbccdd11223344556677889900aabbccdd';
      const { getAllLinks } = renderComponent({
        status: StepExecutionStatus.TX_PENDING,
        isActive: true,
        txHash,
      });
      const txLink = getAllLinks().find((a) => a.getAttribute('href')?.includes(txHash));
      const truncated = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
      expect(txLink!.getAttribute('aria-label')).toBe(
        `migration.action.viewTransaction ${truncated}`
      );
    });
  });
});
