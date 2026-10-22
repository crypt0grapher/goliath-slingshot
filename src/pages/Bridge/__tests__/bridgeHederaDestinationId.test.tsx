/**
 * Hedera-mode destination ids (bridge backend GOLIATH_TX_MODE=hedera).
 *
 * When the relayer delivers Ethereum -> Goliath through the Hedera SDK
 * (TransferTransaction for XCN, ContractExecuteTransaction for ETH/USDC mint),
 * the backend stores a NON-0x `destinationTxHash`:
 *   - the mirror-resolved consensus timestamp, e.g. "1792692633.044636000"
 *     (normal path), or
 *   - the raw Hedera transaction id, e.g. "0.0.1083@1792692627.221703344"
 *     (fallback when the single mirror lookup misses).
 * Blockscout rejects both (`/api/v2/transactions/<id>` -> 422, expects 0x+64 hex),
 * so a Blockscout `/tx/<id>` link is broken. The link must point at the Hiero
 * validators explorer (which accepts both forms) or be omitted.
 *
 * Fixtures mirror `formatOperationResponse` in goliath-bridge-backend
 * (src/api/routes/bridge.ts) at a84f8f340f3ef2cee78aa853f560afe5e05f1b72.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { DefaultTheme, ThemeProvider } from 'styled-components';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { network?: string }) => (opts && opts.network ? `${key}:${opts.network}` : key),
  }),
}));

// Real deployed defaults (no .env): explorer = https://testnet.explorer.goliath.net.
// Only the API base and poll interval are overridden for the test.
jest.mock('../../../config/bridgeConfig', () => {
  const actual = jest.requireActual('../../../config/bridgeConfig');
  return {
    bridgeConfig: {
      ...actual.bridgeConfig,
      statusApiBaseUrl: 'https://bridgeapi.testnet.onyx.org/api/v1',
      statusPollInterval: 10,
    },
  };
});

jest.mock('../../../components/Modal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? React.createElement('div', { 'data-testid': 'modal' }, children) : null,
  };
});

jest.mock('../../../hooks/bridge', () => ({
  useBridgeStatusPolling: jest.requireActual('../../../hooks/bridge/useBridgeStatusPolling').useBridgeStatusPolling,
  useBridgeForm: () => ({ triggerBalanceRefresh: () => undefined }),
}));

// Buttons and the full theme pull in the web3 connector graph (needs REACT_APP_NETWORK_URL);
// neither is under test here, so use plain buttons and a minimal theme.
jest.mock('../../../components/Button', () => {
  const React = require('react');
  const Btn = (props: { onClick?: () => void; children?: React.ReactNode }) =>
    React.createElement('button', { onClick: props.onClick }, props.children);
  return { ButtonPrimary: Btn, ButtonOutlined: Btn };
});

jest.mock('../../../components/bridge', () => ({
  BridgeStatusStepper: jest.requireActual('../../../components/bridge/BridgeStatusStepper').default,
}));

/* eslint-disable import/first */
import bridgeReducer, { bridgeActions } from '../../../state/bridge/reducer';
import { BridgeOperation } from '../../../state/bridge/types';
import { BridgeApiClient, BridgeStatusResponse } from '../../../services/bridgeApi';
import { BridgeNetwork, getExplorerTxUrl } from '../../../constants/bridge/networks';
import BridgeStatusModal from '../BridgeStatusModal';
/* eslint-enable import/first */

// ---------------------------------------------------------------------------
// Fixtures (public /api/v1/bridge/status and /history shape)
// ---------------------------------------------------------------------------

const BLOCKSCOUT = 'https://testnet.explorer.goliath.net';
const VALIDATORS_TX = 'https://validators.testnet.onyx.org/testnet/transaction';
const ETHERSCAN = 'https://sepolia.etherscan.io';
const USER = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

type ApiOp = BridgeStatusResponse & Record<string, unknown>;

function apiOp(overrides: Partial<ApiOp>): ApiOp {
  return {
    operationId: 'op',
    direction: 'ETHEREUM_TO_GOLIATH' as any,
    status: 'COMPLETED',
    token: 'XCN',
    amount: '25000000000000000000',
    amountFormatted: '25',
    fee: null,
    outputAmount: '25000000000000000000',
    outputAmountFormatted: '25',
    sender: USER,
    recipient: USER,
    originChainId: 11155111,
    destinationChainId: 8901,
    originTxHash: `0x${'a1'.repeat(32)}`,
    destinationTxHash: null,
    originConfirmations: 3,
    requiredConfirmations: 3,
    timestamps: {
      depositedAt: '2026-10-22T12:23:30.000Z',
      finalizedAt: '2026-10-22T12:24:06.000Z',
      destinationSubmittedAt: '2026-10-22T12:24:07.000Z',
      completedAt: '2026-10-22T12:24:14.000Z',
    },
    estimatedCompletionTime: null,
    holdUntil: null,
    error: null,
    isSameWallet: true,
    stakeOnGoliath: false,
    stakingTxHash: null,
    stakingError: null,
    settlement: null,
    ...overrides,
  } as ApiOp;
}

function settlement(op: ApiOp, chainName: 'goliath' | 'ethereum', tokenAddress: string | null) {
  return {
    chainId: op.destinationChainId,
    chainName,
    tokenSymbol: op.token,
    tokenAddress,
    tokenIsNative: tokenAddress === null,
    amountAtomic: op.outputAmount,
    amountFormatted: op.outputAmountFormatted,
    txHash: op.destinationTxHash,
    completedAt: op.timestamps.completedAt,
  };
}

// 1) E2G XCN via Hedera CryptoTransfer; mirror resolved the consensus timestamp.
const E2G_XCN = (() => {
  const op = apiOp({
    operationId: '6f0d2b8e-1c55-4a8b-9a3e-0e5a2d7f1c01',
    token: 'XCN',
    originTxHash: `0x${'a1'.repeat(32)}`,
    destinationTxHash: '1792692633.044636000',
  });
  return { ...op, settlement: settlement(op, 'goliath', null) };
})();

// 2) E2G USDC via Hedera ContractExecute mint(); mirror lookup missed -> raw Hedera tx id.
const E2G_USDC = (() => {
  const op = apiOp({
    operationId: '6f0d2b8e-1c55-4a8b-9a3e-0e5a2d7f1c02',
    token: 'USDC',
    amount: '15000000',
    amountFormatted: '15',
    outputAmount: '15000000',
    outputAmountFormatted: '15',
    originTxHash: `0x${'b2'.repeat(32)}`,
    destinationTxHash: '0.0.1083@1792692627.221703344',
  });
  return { ...op, settlement: settlement(op, 'goliath', '0x4BE65Dce1D79B8728485B759eE06cC8053E824F4') };
})();

// 3) G2E ETH for comparison: both legs are EVM 0x hashes.
const G2E_ETH = (() => {
  const op = apiOp({
    operationId: '6f0d2b8e-1c55-4a8b-9a3e-0e5a2d7f1c03',
    direction: 'GOLIATH_TO_ETHEREUM' as any,
    token: 'ETH',
    amount: '10000000000000000',
    amountFormatted: '0.01',
    fee: { amount: '50000000000000', formatted: '0.00005', bps: 50 },
    outputAmount: '9950000000000000',
    outputAmountFormatted: '0.00995',
    originChainId: 8901,
    destinationChainId: 11155111,
    originTxHash: `0x${'c3'.repeat(32)}`,
    destinationTxHash: `0x${'d4'.repeat(32)}`,
    originConfirmations: 1,
    requiredConfirmations: 1,
  });
  return { ...op, settlement: settlement(op, 'ethereum', null) };
})();

const FIXTURES = [
  { name: 'E2G XCN (Hedera CryptoTransfer, consensus timestamp)', api: E2G_XCN },
  { name: 'E2G USDC (Hedera ContractExecute, raw tx id fallback)', api: E2G_USDC },
  { name: 'G2E ETH (EVM 0x hashes)', api: G2E_ETH },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;

/** A link is valid when it targets an explorer that can resolve the id. */
function isValidTxLink(href: string, network: BridgeNetwork, id: string): boolean {
  if (network === BridgeNetwork.SEPOLIA) return EVM_HASH.test(id) && href === `${ETHERSCAN}/tx/${id}`;
  if (EVM_HASH.test(id)) return href === `${BLOCKSCOUT}/tx/${id}`;
  return href === `${VALIDATORS_TX}/${id}`;
}

function mockFetchSequence(bodies: unknown[]) {
  let call = 0;
  const fn = jest.fn(async (_url: string) => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
  (global as any).fetch = fn;
  return fn;
}

function toLocalOperation(api: ApiOp): BridgeOperation {
  return {
    id: `local-${api.operationId}`,
    direction: api.direction === ('ETHEREUM_TO_GOLIATH' as any) ? 'SEPOLIA_TO_GOLIATH' : 'GOLIATH_TO_SEPOLIA',
    token: api.token,
    amountHuman: api.amountFormatted,
    amountAtomic: api.amount,
    sender: api.sender,
    recipient: api.recipient,
    originChainId: api.originChainId,
    destinationChainId: api.destinationChainId,
    originTxHash: api.originTxHash,
    destinationTxHash: null,
    depositId: null,
    withdrawId: null,
    status: 'PENDING_ORIGIN_TX',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originConfirmations: 0,
    requiredConfirmations: api.requiredConfirmations,
    errorMessage: null,
    estimatedCompletionTime: null,
  };
}

const testTheme = {
  text1: '#000000',
  text2: '#565a69',
  text3: '#888d9b',
  bg2: '#f7f8fa',
  bg3: '#edeef2',
  primary1: '#ff007a',
  green1: '#27ae60',
  red1: '#ff6871',
  yellow2: '#f3841e',
} as unknown as DefaultTheme;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let container: HTMLDivElement;
const realFetch = (global as any).fetch;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  (global as any).fetch = realFetch;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hedera-mode destination ids — API client', () => {
  it.each(FIXTURES)('getStatus parses $name without altering destinationTxHash', async ({ api }) => {
    const fetchMock = mockFetchSequence([api]);
    const client = new BridgeApiClient('https://bridgeapi.testnet.onyx.org/api/v1');
    const res = await client.getStatus({ originTxHash: api.originTxHash });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://bridgeapi.testnet.onyx.org/api/v1/bridge/status?originTxHash=${api.originTxHash}`
    );
    expect(res).toEqual(api);
    expect(res?.destinationTxHash).toBe(api.destinationTxHash);
  });

  it('getHistory returns mixed native / EVM destination ids verbatim', async () => {
    const body = {
      operations: [E2G_XCN, E2G_USDC, G2E_ETH],
      pagination: { total: 3, limit: 10, offset: 0, hasMore: false },
    };
    mockFetchSequence([body]);
    const client = new BridgeApiClient('https://bridgeapi.testnet.onyx.org/api/v1');
    const res = await client.getHistory({ address: USER });
    expect(res.operations.map((o) => o.destinationTxHash)).toEqual([
      '1792692633.044636000',
      '0.0.1083@1792692627.221703344',
      `0x${'d4'.repeat(32)}`,
    ]);
  });
});

describe('Hedera-mode destination ids — explorer link builder', () => {
  it('keeps EVM hashes on Blockscout / Etherscan', () => {
    const h = `0x${'d4'.repeat(32)}`;
    expect(getExplorerTxUrl(BridgeNetwork.GOLIATH, h)).toBe(`${BLOCKSCOUT}/tx/${h}`);
    expect(getExplorerTxUrl(BridgeNetwork.SEPOLIA, h)).toBe(`${ETHERSCAN}/tx/${h}`);
  });

  it.each(['1792692633.044636000', '0.0.1083@1792692627.221703344'])(
    'routes Goliath native id %s to the validators explorer (full id, never Blockscout)',
    (id) => {
      const url = getExplorerTxUrl(BridgeNetwork.GOLIATH, id);
      expect(url).toBe(`${VALIDATORS_TX}/${id}`);
      expect(url.startsWith(BLOCKSCOUT)).toBe(false);
    }
  );
});

describe('Hedera-mode destination ids — status modal via real polling', () => {
  it.each(FIXTURES)('$name: completes, keeps full id, renders valid-or-no link', async ({ api }) => {
    const store = configureStore({ reducer: { bridge: bridgeReducer } });
    const local = toLocalOperation(api);
    store.dispatch(bridgeActions.addOperation(local));
    store.dispatch(bridgeActions.openStatusModal(local.id));

    // CONFIRMING -> PROCESSING_DESTINATION (destination id persisted first) -> COMPLETED
    const fetchMock = mockFetchSequence([
      { ...api, status: 'CONFIRMING', destinationTxHash: null, settlement: null, originConfirmations: 1 },
      { ...api, status: 'PROCESSING_DESTINATION', settlement: null },
      api,
    ]);

    act(() => {
      ReactDOM.render(
        <Provider store={store}>
          <ThemeProvider theme={testTheme}>
            <BridgeStatusModal />
          </ThemeProvider>
        </Provider>,
        container
      );
    });

    for (let i = 0; i < 100 && store.getState().bridge.operations[local.id].status !== 'COMPLETED'; i++) {
      await act(async () => {
        await sleep(10);
      });
    }

    const op = store.getState().bridge.operations[local.id];
    expect(op.status).toBe('COMPLETED');
    expect(op.destinationTxHash).toBe(api.destinationTxHash);
    expect(store.getState().bridge.pollingError).toBeNull();
    expect(container.textContent).toContain('bridgeComplete');

    // Polling stops once COMPLETED with a destination id.
    const callsAtCompletion = fetchMock.mock.calls.length;
    await act(async () => {
      await sleep(60);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAtCompletion);

    const isE2G = local.direction === 'SEPOLIA_TO_GOLIATH';
    const originNet = isE2G ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;
    const destNet = isE2G ? BridgeNetwork.GOLIATH : BridgeNetwork.SEPOLIA;
    const label = (n: BridgeNetwork) => `viewOnExplorer:${n === BridgeNetwork.SEPOLIA ? 'Sepolia' : 'Goliath'}`;
    // BridgeStatusModal renders the origin link first, then the destination link (if any).
    const [originLink, destLink, ...extra] = Array.from(container.querySelectorAll('a'));
    expect(extra).toHaveLength(0);

    expect(originLink).toBeDefined();
    expect(originLink.textContent).toContain(label(originNet));
    expect(isValidTxLink(originLink.getAttribute('href')!, originNet, api.originTxHash!)).toBe(true);

    if (destLink) {
      expect(destLink.textContent).toContain(label(destNet));
      const href = destLink.getAttribute('href')!;
      // The full destination id is carried unmodified...
      expect(href.endsWith(`/${api.destinationTxHash}`)).toBe(true);
      // ...and the link targets an explorer that can resolve it.
      expect(isValidTxLink(href, destNet, api.destinationTxHash!)).toBe(true);
    }
  });
});
