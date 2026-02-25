import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ThemeProvider } from 'styled-components';
import { theme } from '../../../theme';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('react-feather', () => {
  const React = require('react');
  const createIcon = (testId: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement('span', { 'data-testid': testId, ref, ...props })
    );
  return {
    Clock: createIcon('icon-clock'),
    ExternalLink: createIcon('icon-external-link'),
    ChevronDown: createIcon('icon-chevron-down'),
    ChevronUp: createIcon('icon-chevron-up'),
    AlertCircle: createIcon('icon-alert-circle'),
    CheckCircle: createIcon('icon-check-circle'),
    XCircle: createIcon('icon-x-circle'),
    Loader: createIcon('icon-loader'),
    X: createIcon('icon-x'),
    ArrowLeft: createIcon('icon-arrow-left'),
    Trash: createIcon('icon-trash'),
  };
});

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

const mockMigrationConfig = {
  historyEnabled: true,
  migrationEnabled: true,
  claimEnabled: true,
  statsEnabled: false,
  sepoliaXcnAddress: '0x0',
  sepoliaStakingContract: '0x0',
  migrationDeadline: undefined,
  statsPollMs: 60000,
  statusPollMs: 3000,
};

jest.mock('../../../config/migrationConfig', () => ({
  get migrationConfig() {
    return mockMigrationConfig;
  },
}));

let mockUseHistoryReturn: any = { data: null, loading: false, error: null, loadMore: jest.fn() };

jest.mock('../../../hooks/migration/useMigrationApi', () => ({
  useHistory: () => mockUseHistoryReturn,
}));

let mockAccount: string | null = '0xTestAccount';

jest.mock('../../../hooks', () => ({
  useActiveWeb3React: () => ({ account: mockAccount, chainId: 11155111, library: null }),
}));

import MigrationHistoryPanel from '../MigrationHistoryPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testTheme = theme(true);

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  mockAccount = '0xTestAccount';
  mockMigrationConfig.historyEnabled = true;
  mockUseHistoryReturn = { data: null, loading: false, error: null, loadMore: jest.fn() };
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

function renderComponent() {
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <MigrationHistoryPanel />
      </ThemeProvider>,
      container
    );
  });
}

function makeOperation(overrides: any = {}) {
  return {
    operationId: 'op-1',
    direction: 'SEPOLIA_TO_GOLIATH',
    status: 'COMPLETED',
    token: 'XCN',
    amount: '1000000000000000000',
    amountFormatted: '1.0',
    sender: '0xTestAccount',
    recipient: '0xTestAccount',
    originChainId: 11155111,
    destinationChainId: 8901,
    originTxHash: '0xorigin1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    destinationTxHash: '0xdest001234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    originConfirmations: 3,
    requiredConfirmations: 3,
    timestamps: {
      depositedAt: '2026-02-25T10:00:00Z',
      finalizedAt: '2026-02-25T10:01:00Z',
      destinationSubmittedAt: '2026-02-25T10:02:00Z',
      completedAt: '2026-02-25T10:03:00Z',
    },
    estimatedCompletionTime: null,
    error: null,
    isSameWallet: true,
    stakeOnGoliath: true,
    stakingTxHash: '0xstake01234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    stakingError: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MigrationHistoryPanel', () => {
  describe('collapsible behavior', () => {
    it('renders nothing when no operations and not loading', () => {
      mockUseHistoryReturn = {
        data: { operations: [], pagination: { total: 0, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      expect(container.textContent).toBe('');
    });

    it('renders nothing when feature flag is off', () => {
      mockMigrationConfig.historyEnabled = false;
      mockUseHistoryReturn = {
        data: { operations: [makeOperation()], pagination: { total: 1, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      expect(container.textContent).toBe('');
    });

    it('renders nothing when wallet is not connected', () => {
      mockAccount = null;
      mockUseHistoryReturn = {
        data: { operations: [makeOperation()], pagination: { total: 1, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      expect(container.textContent).toBe('');
    });

    it('renders collapsed by default with header and chevron-down', () => {
      mockUseHistoryReturn = {
        data: { operations: [makeOperation()], pagination: { total: 1, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      expect(container.textContent).toContain('migration.history.recentMigrations');
      expect(container.querySelector('[data-testid="icon-chevron-down"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="icon-chevron-up"]')).toBeNull();
    });

    it('shows count badge with number of operations', () => {
      mockUseHistoryReturn = {
        data: {
          operations: [makeOperation(), makeOperation({ operationId: 'op-2' })],
          pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
        },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      expect(container.textContent).toContain('(2)');
    });

    it('toggles open on header click and shows chevron-up', () => {
      mockUseHistoryReturn = {
        data: { operations: [makeOperation()], pagination: { total: 1, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();

      const header = container.querySelector('[role="button"]') as HTMLElement;
      expect(header).not.toBeNull();

      act(() => { header.click(); });

      expect(container.querySelector('[data-testid="icon-chevron-up"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="icon-chevron-down"]')).toBeNull();
      // Content should now be visible
      expect(container.textContent).toContain('1.0 XCN');
    });

    it('toggles closed on second header click', () => {
      mockUseHistoryReturn = {
        data: { operations: [makeOperation()], pagination: { total: 1, limit: 10, offset: 0, hasMore: false } },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();

      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); }); // open
      act(() => { header.click(); }); // close

      expect(container.querySelector('[data-testid="icon-chevron-down"]')).not.toBeNull();
    });
  });

  describe('per-step explorer links', () => {
    beforeEach(() => {
      mockUseHistoryReturn = {
        data: {
          operations: [makeOperation()],
          pagination: { total: 1, limit: 10, offset: 0, hasMore: false },
        },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
    });

    it('renders Sepolia Explorer link for originTxHash', () => {
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      const links = Array.from(container.querySelectorAll('a'));
      const sepoliaLink = links.find((a) =>
        a.getAttribute('href')?.includes('sepolia.etherscan.io')
      );
      expect(sepoliaLink).toBeDefined();
      expect(sepoliaLink!.getAttribute('href')).toContain('0xorigin');
    });

    it('renders Goliath Explorer link for destinationTxHash', () => {
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      const links = Array.from(container.querySelectorAll('a'));
      const goliathLink = links.find((a) =>
        a.getAttribute('href')?.includes('explorer.goliath.test') &&
        a.getAttribute('href')?.includes('0xdest00')
      );
      expect(goliathLink).toBeDefined();
    });

    it('renders Goliath Explorer link for stakingTxHash', () => {
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      const links = Array.from(container.querySelectorAll('a'));
      const stakeLink = links.find((a) =>
        a.getAttribute('href')?.includes('explorer.goliath.test') &&
        a.getAttribute('href')?.includes('0xstake0')
      );
      expect(stakeLink).toBeDefined();
    });

    it('renders labels for each link type', () => {
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      expect(container.textContent).toContain('migration.history.sepoliaExplorer');
      expect(container.textContent).toContain('migration.history.goliathExplorer');
      expect(container.textContent).toContain('migration.history.stakeTx');
    });

    it('omits links for null tx hashes', () => {
      mockUseHistoryReturn = {
        data: {
          operations: [makeOperation({
            originTxHash: null,
            destinationTxHash: null,
            stakingTxHash: null,
          })],
          pagination: { total: 1, limit: 10, offset: 0, hasMore: false },
        },
        loading: false,
        error: null,
        loadMore: jest.fn(),
      };
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      const links = Array.from(container.querySelectorAll('a'));
      expect(links.length).toBe(0);
    });

    it('all links open in new tab with noopener noreferrer', () => {
      renderComponent();
      const header = container.querySelector('[role="button"]') as HTMLElement;
      act(() => { header.click(); });

      const links = Array.from(container.querySelectorAll('a'));
      links.forEach((link) => {
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      });
    });
  });
});
