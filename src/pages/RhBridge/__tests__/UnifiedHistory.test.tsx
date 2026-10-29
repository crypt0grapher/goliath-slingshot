// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ThemeProvider } from 'styled-components';
import type { DefaultTheme } from 'styled-components';
import type { RhRecord } from '../../../state/rhBridge/history';
import UnifiedRhHistory from '../UnifiedHistory';

const bindings: RhRecord['bindings'] = {
  token: '0x0000000000000000000000000000000000000001',
  escrow: '0x0000000000000000000000000000000000000002',
  wrapper: '0x0000000000000000000000000000000000000003',
  minter: '0x0000000000000000000000000000000000000004',
};
const account = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';

function record(patch: Partial<RhRecord> & Pick<RhRecord, 'id' | 'stage' | 'step'>): RhRecord {
  return {
    schemaVersion: 1,
    direction: 'RH_TO_ONYX',
    account,
    recipient,
    grossRaw: '500000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    bindings,
    approveTxHash: null,
    sourceTxHash: null,
    sourceBlock: null,
    txNonce: 1,
    replacedTxHash: null,
    operationId: null,
    destinationTxHash: null,
    holdCategory: null,
    failure: null,
    createdAtMs: 1_000_000,
    updatedAtMs: 1_000_000,
    ...patch,
  };
}

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(container);
  });
  container.remove();
});

function render(records: RhRecord[], nowMs = 1_000_000) {
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={{ bg1: '#fff', bg2: '#eee', bg3: '#ddd', text1: '#111', text2: '#555' } as DefaultTheme}>
        <UnifiedRhHistory
          history={{ status: 'READY', records, invalidRows: 0 }}
          etaSeconds={{ RH_TO_ONYX: 14 * 60 + 18, ONYX_TO_RH: 15 }}
          nowMs={nowMs}
        />
      </ThemeProvider>,
      container
    );
  });
}

test('one bridge hides the dismissed approval and shows time left', () => {
  render([
    record({ id: 'approval', stage: 'DISMISSED', step: 'APPROVE' }),
    record({
      id: 'bridge',
      stage: 'SOURCE_PENDING',
      step: 'BRIDGE',
      sourceTxHash: '0x' + 'ab'.repeat(32),
    }),
  ]);
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).not.toContain('DISMISSED');
  expect(container.textContent).not.toContain('SOURCE_PENDING');
  expect(container.textContent).not.toContain('Dismiss record');
  expect(container.textContent).toContain('Waiting for confirmation');
  expect(container.textContent).toContain('Record started just now');
  expect(container.textContent).not.toContain('About 14 minutes');
  expect(container.textContent).not.toContain('Any moment now');
  expect(container.querySelector('h4')?.textContent).toContain('Unrecognized profile');
  expect(container.querySelectorAll('dt')).toHaveLength(3);
  expect(container.textContent).toContain('Source transaction · Robinhood');
});

test('elapsed time uses the record start and does not count down a route estimate', () => {
  render(
    [
      record({
        id: 'bridge',
        stage: 'SOURCE_PENDING',
        step: 'BRIDGE',
        sourceTxHash: '0x' + 'cd'.repeat(32),
        createdAtMs: 1_000_000,
      }),
    ],
    1_000_000 + 2 * 60 * 1000
  );
  expect(container.textContent).toContain('Waiting for confirmation');
  expect(container.textContent).toContain('Record started 2 minutes ago');
  expect(container.textContent).not.toContain('12 minutes');
  expect(container.textContent).not.toContain('Any moment now');
});

test('an equal amount without a shared approval hash stays a separate card', () => {
  render([
    record({ id: 'approval', stage: 'APPROVED', step: 'APPROVE' }),
    record({
      id: 'bridge',
      stage: 'SOURCE_PENDING',
      step: 'BRIDGE',
      sourceTxHash: '0x' + 'ef'.repeat(32),
    }),
  ]);
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Approved');
  expect(container.textContent).toContain('Waiting for confirmation');
});

test('a bridge that records the approval hash groups that approval into one card', () => {
  const approvalHash = '0x' + 'ab'.repeat(32);
  render([
    record({ id: 'approval', stage: 'APPROVED', step: 'APPROVE', sourceTxHash: approvalHash }),
    record({
      id: 'bridge',
      stage: 'SOURCE_PENDING',
      step: 'BRIDGE',
      sourceTxHash: '0x' + 'ef'.repeat(32),
      approveTxHash: approvalHash,
    }),
  ]);
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.textContent).not.toContain('Approved');
});

const robinhoodExplorer = 'https://explorer.testnet.chain.robinhood.com';
const onyxExplorer = 'https://testnet.explorer.goliath.net';
const sourceHash = '0x' + '70'.repeat(32);
const destinationHash = '0x' + '31'.repeat(32);

test.each([
  ['RH_TO_ONYX', robinhoodExplorer, onyxExplorer, 'Robinhood', 'Onyx'],
  ['ONYX_TO_RH', onyxExplorer, robinhoodExplorer, 'Onyx', 'Robinhood'],
] as const)(
  'links each address and transaction to its own chain for %s',
  (direction, source, destination, from, to) => {
    render([
      record({
        id: 'delivered',
        stage: 'DELIVERED',
        step: 'BRIDGE',
        direction,
        sourceTxHash: sourceHash,
        destinationTxHash: destinationHash,
      }),
    ]);
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(container.textContent).toContain('Delivered');
    expect(container.textContent).toContain(`${from} → ${to}`);
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `${source}/address/${account}`,
      `${destination}/address/${recipient}`,
      `${source}/tx/${sourceHash}`,
      `${destination}/tx/${destinationHash}`,
    ]);
    expect(links.map((link) => link.textContent)).toEqual([account, recipient, sourceHash, destinationHash]);
    expect(container.textContent).toContain(`Source transaction · ${from}`);
    expect(container.textContent).toContain(`Destination transaction · ${to}`);
    links.forEach((link) => {
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
      expect(link.getAttribute('aria-label')).toContain('opens explorer in a new tab');
    });
  }
);

test('retains the native Onyx transaction explorer and does not invent a missing destination', () => {
  const nativeId = '0.0.1006@1793180000.123456789';
  render([
    record({ id: 'native', stage: 'SOURCE_PENDING', step: 'BRIDGE', direction: 'ONYX_TO_RH', sourceTxHash: nativeId }),
  ]);
  expect(container.querySelectorAll('a')[2].href).toBe(
    `https://validators.testnet.onyx.org/testnet/transaction/${nativeId}`
  );
  expect(container.textContent).not.toContain('Destination transaction');
});

test('unknown transaction formats remain readable without unsafe links', () => {
  render([
    record({
      id: 'unknown',
      stage: 'FAILED',
      step: 'BRIDGE',
      sourceTxHash: 'unknown-transaction',
      failure: 'Transfer failed',
    }),
  ]);
  expect(container.textContent).toContain('unknown-transaction');
  expect(container.textContent).toContain('Transfer failed');
  expect(container.querySelectorAll('a')).toHaveLength(2);
  expect(container.textContent).not.toContain('Resend');
  expect(container.textContent).not.toContain('Dismiss');
});

test('a status lookup miss is not shown as a transfer failure', () => {
  render([
    record({
      id: 'lookup-miss',
      stage: 'SOURCE_PENDING',
      step: 'BRIDGE',
      sourceTxHash: '0x' + 'cd'.repeat(32),
      failure: 'HTTP 404 NOT_FOUND',
    }),
  ]);
  expect(container.textContent).toContain('Waiting for confirmation');
  expect(container.textContent).not.toContain('404');
  expect(container.textContent).not.toContain('NOT_FOUND');
  expect(container.textContent).not.toContain('Transfer failed');
});

test('an uncertain record tells the reader to check the wallet and does not offer a resend', () => {
  render([
    record({
      id: 'uncertain',
      stage: 'UNCERTAIN',
      step: 'BRIDGE',
      sourceTxHash: '0x' + 'ef'.repeat(32),
      failure: 'status unknown',
    }),
  ]);
  expect(container.textContent).toContain('Check wallet / view source transaction / refresh status');
  expect(container.textContent).not.toContain('status unknown');
  expect(container.textContent).not.toContain('Resend');
  expect(container.textContent).not.toContain('Dismiss');
});

test('copy reports the full value or a failure without leaving the history card', async () => {
  const sourceHash = '0x' + 'ab'.repeat(32);
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render([record({ id: 'copy', stage: 'SOURCE_PENDING', step: 'BRIDGE', sourceTxHash: sourceHash })]);
  const button = container.querySelector(`button[aria-label="Copy ${sourceHash}"]`) as HTMLButtonElement;
  expect(button.textContent).toBe('Copy');
  expect(button.closest('a')).toBeNull();
  await act(async () => {
    button.click();
  });
  expect(writeText).toHaveBeenCalledWith(sourceHash);
  expect(button.nextElementSibling?.textContent).toBe('Copied');

  writeText.mockRejectedValueOnce(new Error('denied'));
  await act(async () => {
    button.click();
  });
  expect(button.nextElementSibling?.textContent).toBe('Copy failed');

  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await act(async () => {
    button.click();
  });
  expect(button.nextElementSibling?.textContent).toBe('Copy failed');
});
