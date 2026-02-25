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
    X: createIcon('icon-x'),
    ArrowLeft: createIcon('icon-arrow-left'),
    ExternalLink: createIcon('icon-external-link'),
    Trash: createIcon('icon-trash'),
  };
});

let mockAccount: string | null = '0xTestAccount';

jest.mock('../../../hooks', () => ({
  useActiveWeb3React: () => ({ account: mockAccount, chainId: 11155111, library: null }),
}));

let mockBalanceReturn = { balance: '0', loading: false };

jest.mock('../../../hooks/migration/useGoliathStakedBalance', () => ({
  useGoliathStakedBalance: () => mockBalanceReturn,
}));

import GoliathStakedBalance from '../GoliathStakedBalance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testTheme = theme(true);

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  mockAccount = '0xTestAccount';
  mockBalanceReturn = { balance: '0', loading: false };
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

function renderComponent() {
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <GoliathStakedBalance />
      </ThemeProvider>,
      container
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoliathStakedBalance', () => {
  it('renders nothing when wallet is not connected', () => {
    mockAccount = null;
    mockBalanceReturn = { balance: '100.0', loading: false };
    renderComponent();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when balance is zero', () => {
    mockBalanceReturn = { balance: '0', loading: false };
    renderComponent();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when balance is "0.0000"', () => {
    mockBalanceReturn = { balance: '0.0000', loading: false };
    renderComponent();
    expect(container.textContent).toBe('');
  });

  it('renders formatted balance when balance > 0', () => {
    mockBalanceReturn = { balance: '152.3456', loading: false };
    renderComponent();
    expect(container.textContent).toContain('152.3456 stXCN');
    expect(container.textContent).toContain('migration.goliathBalance.title');
  });

  it('renders loading skeleton while loading', () => {
    mockBalanceReturn = { balance: '0', loading: true };
    renderComponent();
    // Should render the label and a skeleton, not the balance value
    expect(container.textContent).toContain('migration.goliathBalance.title');
    expect(container.textContent).not.toContain('stXCN');
  });

  it('renders with non-zero balance after loading completes', () => {
    mockBalanceReturn = { balance: '50.1234', loading: false };
    renderComponent();
    expect(container.textContent).toContain('50.1234 stXCN');
  });
});
