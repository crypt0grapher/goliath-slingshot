import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ThemeProvider } from 'styled-components';
import { featureEnabled, RH_LANE, RH_ROUTE } from '../../../config/rhBridge';
import { theme } from '../../../theme';
import { useRhBridge } from '../../../hooks/rhBridge/useRhBridge';
import { WalletState } from '../../../hooks/rhBridge/view';
import { createIntent, HistoryStorage, updateRecord } from '../../../state/rhBridge/history';
import { fakeApi, fakeWallet, fundedChains, liveApi } from '../../../services/rhBridge/__fixtures__/fakes';
import { alignToManifest, atTime, loadFixture } from '../../../services/rhBridge/__fixtures__';
import RhBridgeView from '../RhBridgeView';
import { RhBridgeEntryLink } from '../EntryLink';
import RhBridgePage from '../index';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const NOW = Date.now();

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

function memory(): HistoryStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

function Harness(props: {
  wallet: WalletState;
  api: ReturnType<typeof fakeApi>;
  storage: HistoryStorage;
  chains: ReturnType<typeof fundedChains>;
  provider: any;
  onConnect?: () => void;
}) {
  const [deps] = React.useState(() => ({
    api: props.api.client,
    chains: props.chains.reader,
    storage: props.storage,
    lane: RH_LANE,
    now: () => Date.now(),
    randomHex: () => '0000abcd',
  }));
  const hook = useRhBridge(deps, props.wallet, props.provider, 60000);
  return <RhBridgeView hook={hook} lane={RH_LANE} onConnect={props.onConnect || (() => undefined)} />;
}

async function render(
  over: Partial<{
    wallet: WalletState;
    api: ReturnType<typeof fakeApi>;
    storage: HistoryStorage;
    chains: ReturnType<typeof fundedChains>;
  }> = {}
) {
  const wallet = over.wallet ?? { account: ACCOUNT, chainId: 46630, isInjected: true, hasProvider: true };
  const fw = fakeWallet({ chainId: wallet.chainId || 46630, accounts: wallet.account ? [wallet.account] : [] });
  const props = {
    wallet,
    api: over.api ?? liveApi(NOW),
    storage: over.storage ?? memory(),
    chains: over.chains ?? fundedChains(ACCOUNT),
    provider: wallet.hasProvider ? fw.provider : null,
  };
  await act(async () => {
    ReactDOM.render(
      <ThemeProvider theme={theme(false)}>
        <Harness {...props} />
      </ThemeProvider>,
      container
    );
  });
  await settle();
  return { ...props, fw };
}
async function settle(ms = 450) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const text = () => container.textContent || '';
const button = (label: RegExp) =>
  Array.from(container.querySelectorAll('button')).find((b) => label.test(b.textContent || '')) as
    | HTMLButtonElement
    | undefined;
async function type(label: string, value: string) {
  const input = container.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  await act(async () => {
    Simulate.change(input, { target: { value } } as any);
  });
}

test('feature flag defaults off: no page and no entry link', () => {
  expect(featureEnabled(undefined)).toBe(false);
  expect(featureEnabled('1')).toBe(false);
  expect(featureEnabled('true')).toBe(true);
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={theme(false)}>
        <RhBridgeEntryLink enabled={false} />
        <RhBridgePage enabled={false} />
      </ThemeProvider>,
      container
    );
  });
  expect(container.innerHTML).toBe('');
});

test('entry link from #/bridge points at the RH route', () => {
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={theme(false)}>
        <RhBridgeEntryLink enabled />
      </ThemeProvider>,
      container
    );
  });
  expect(RH_ROUTE).toBe('/bridge/robinhood-testnet');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('#/bridge/robinhood-testnet');
});

test('API unreachable: live actions disabled with the reason; no wallet request', async () => {
  const { fw } = await render({ api: fakeApi({}) });
  expect(text()).toContain('Live actions disabled');
  expect(text()).toContain('The Robinhood bridge API is not reachable.');
  await type('Amount', '0.1');
  expect(button(/Approve exactly/)?.disabled).toBe(true);
  expect(button(/Live actions disabled|Deposit/)?.disabled).toBe(true);
  expect(fw.requests).toHaveLength(0);
});

test('healthy, bound lane on 46630: exact approval enabled with deposit details', async () => {
  await render();
  expect(text()).toContain('Live');
  await type('Amount', '0.1');
  await settle(50);
  const approve = button(/Approve exactly 0\.1 TSLA/);
  expect(approve).toBeDefined();
  expect(approve!.disabled).toBe(false);
  expect(button(/Deposit to Onyx/)!.disabled).toBe(true);
  expect(text()).toContain('0 TSLA (deposits carry no fee)');
  expect(text()).toContain('restricted mode · you are allowed');
  expect(text()).toContain('2 TSLA'); // RH balance
});

test('not allowlisted: clear state and every action disabled', async () => {
  const chains = fundedChains(ACCOUNT, { allowlisted: false });
  await render({ chains });
  await type('Amount', '0.1');
  await settle(50);
  expect(text()).toContain('Not allowlisted: this testnet lane runs in restricted mode');
  expect(button(/Approve exactly/)!.disabled).toBe(true);
});

test('non-injected connector: injected-only message, no actions', async () => {
  await render({ wallet: { account: ACCOUNT, chainId: 46630, isInjected: false, hasProvider: false } });
  expect(text()).toContain('supports injected browser wallets');
  await type('Amount', '0.1');
  expect(button(/Approve exactly/)!.disabled).toBe(true);
});

test('wrong chain: switch prompt for the source chain; not connected: connect button', async () => {
  await render({ wallet: { account: ACCOUNT, chainId: 8901, isInjected: true, hasProvider: true } });
  expect(button(/Switch to Robinhood Chain Testnet/)).toBeDefined();
  act(() => {
    ReactDOM.unmountComponentAtNode(container);
  });
  await render({ wallet: { account: null, chainId: null, isInjected: false, hasProvider: false } });
  expect(button(/Connect wallet/)).toBeDefined();
});

test('history shows full source and destination hashes with explorer links', async () => {
  const storage = memory();
  const r = createIntent(storage, {
    direction: 'RH_TO_ONYX',
    account: ACCOUNT,
    recipient: ACCOUNT,
    grossRaw: '100000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane: RH_LANE,
    nowMs: NOW - 5000,
    randomHex: '12345678',
  });
  const source = '0x' + 'ab'.repeat(32);
  const destination = '0x' + 'cd'.repeat(32);
  updateRecord(storage, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: source }, NOW - 4000);
  updateRecord(
    storage,
    r.id,
    { stage: 'DELIVERED', operationId: 'RH_TO_ONYX:0x' + 'ef'.repeat(32), destinationTxHash: destination },
    NOW - 1000
  );
  await render({ storage });
  expect(text()).toContain('Destination delivered');
  const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
  expect(hrefs).toContain('https://explorer.testnet.chain.robinhood.com/tx/' + source);
  expect(hrefs).toContain('https://testnet.explorer.goliath.net/tx/' + destination);
  expect(text()).toContain(source);
  expect(text()).toContain(destination);
  expect(hrefs).toContain('#/bridge');
});

test('awaiting execution displays the API hold category while the lane and submitter are paused', async () => {
  const storage = memory();
  const source = '0x' + 'ab'.repeat(32);
  const r = createIntent(storage, {
    direction: 'RH_TO_ONYX',
    account: ACCOUNT,
    recipient: ACCOUNT,
    grossRaw: '100000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane: RH_LANE,
    nowMs: NOW - 5000,
    randomHex: '12345678',
  });
  updateRecord(storage, r.id, { stage: 'SOURCE_PENDING', sourceTxHash: source, sourceBlock: 123000 }, NOW - 4000);
  const pending = atTime(alignToManifest(loadFixture('getStatus.200.awaiting-deposit').response.body), NOW) as any;
  Object.assign(pending, {
    sender: ACCOUNT,
    recipient: ACCOUNT,
    grossAmount: r.grossRaw,
    netAmount: r.grossRaw,
    holdCategory: 'LANE_PAUSED',
  });
  pending.source.txHash = source;
  pending.source.explorerUrl = 'https://explorer.testnet.chain.robinhood.com/tx/' + source;
  const health = atTime(loadFixture('getHealth.200.ok').response.body, NOW) as any;
  health.status = 'degraded';
  health.components.submitter = 'degraded';
  const state = atTime(loadFixture('getEffectiveState.200.open').response.body, NOW) as any;
  state.paused.escrow = true;
  state.depositsOpen = false;
  const api = liveApi(NOW, {
    '/api/v1/rh/health': { status: 200, body: health },
    '/api/v1/rh/effective-state': { status: 200, body: state },
    [`/api/v1/rh/status/by-tx/${source}`]: { status: 200, body: { items: [pending] } },
  });
  const { fw } = await render({ storage, api });
  expect(api.requests).toContain(`/api/v1/rh/status/by-tx/${source}`);
  expect(text()).toContain('Source final; relay pending (LANE_PAUSED)');
  expect(text()).toContain('Live actions disabled');
  await type('Amount', '0.1');
  expect(button(/Approve exactly/)!.disabled).toBe(true);
  expect(fw.requests).toHaveLength(0);
});

test('tampered stored rows never break rendering: they are counted, ignored and kept', async () => {
  const storage = memory();
  const r = createIntent(storage, {
    direction: 'RH_TO_ONYX',
    account: ACCOUNT,
    recipient: ACCOUNT,
    grossRaw: '100000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'BRIDGE',
    lane: RH_LANE,
    nowMs: NOW - 5000,
    randomHex: '12345678',
  });
  const rows = JSON.parse(storage.data['bridge:rh:testnet:46630:8901:operations:v1']);
  const tampered = { ...rows[0], id: 'rh-1-00000009', direction: 'ONYX_TO_RH', feeRaw: '200000000000000000' }; // fee > gross
  const invalidDate = {
    ...rows[0],
    id: 'rh-9007199254740991-00000010',
    createdAtMs: Number.MAX_SAFE_INTEGER,
    updatedAtMs: Number.MAX_SAFE_INTEGER,
  };
  rows.push(tampered, { garbage: true }, 42, invalidDate);
  storage.data['bridge:rh:testnet:46630:8901:operations:v1'] = JSON.stringify(rows);
  await render({ storage });
  expect(text()).toContain('4 stored record(s) failed validation and are ignored');
  expect(container.querySelectorAll('[data-testid="rh-record"]')).toHaveLength(1);
  expect(text()).toContain('Robinhood → Onyx');
  expect(JSON.parse(storage.data['bridge:rh:testnet:46630:8901:operations:v1'])[1]).toEqual(tampered);
  expect(JSON.parse(storage.data['bridge:rh:testnet:46630:8901:operations:v1'])[4]).toEqual(invalidDate);
  expect(r.id).toBe('rh-' + (NOW - 5000) + '-12345678');
});

test('a replaced transaction shows its replaced hash and the replacement status', async () => {
  const storage = memory();
  const r = createIntent(storage, {
    direction: 'RH_TO_ONYX',
    account: ACCOUNT,
    recipient: ACCOUNT,
    grossRaw: '100000000000000000',
    feeRaw: '0',
    maxFeeRaw: null,
    step: 'APPROVE',
    lane: RH_LANE,
    nowMs: NOW - 5000,
    randomHex: '12345679',
  });
  const replaced = '0x' + '77'.repeat(32);
  updateRecord(storage, r.id, { stage: 'SOURCE_PENDING', approveTxHash: replaced, txNonce: 3 }, NOW - 4000);
  updateRecord(
    storage,
    r.id,
    { stage: 'UNCERTAIN', failure: 'REPLACED_OR_DROPPED', replacedTxHash: replaced, approveTxHash: null },
    NOW - 1000
  );
  await render({ storage });
  expect(text()).toContain('Approval replaced or dropped');
  expect(text()).toContain('Replaced or dropped (Robinhood Chain Testnet)');
  expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toContain(
    'https://explorer.testnet.chain.robinhood.com/tx/' + replaced
  );
  expect(button(/I checked my wallet: dismiss/)).toBeDefined();
});
