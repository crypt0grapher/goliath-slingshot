import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { BridgeApiClient, FeeQuoteResponse } from '../bridgeApi';
import { bridgeConfig } from '../../config/bridgeConfig';
import { useBridgeFee } from '../../hooks/bridge/useBridgeFee';
import { BridgeDirection } from '../../state/bridge/types';

const BASE = 'https://bridgeapi.testnet.onyx.org/api/v1';
const QUOTE: FeeQuoteResponse = {
  token: 'ETH',
  inputAmount: '10000000000000000',
  inputFormatted: '0.01',
  feeAmount: '3000000000000000',
  feeFormatted: '0.003',
  feeBps: 25,
  outputAmount: '7000000000000000',
  outputFormatted: '0.007',
};
const DEPOSIT_QUOTE: FeeQuoteResponse = {
  ...QUOTE,
  feeAmount: '0',
  feeFormatted: '0',
  feeBps: 0,
  outputAmount: QUOTE.inputAmount,
  outputFormatted: QUOTE.inputFormatted,
};
const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) => {
    const direction = new URL(url).searchParams.get('direction');
    // Match the backend contract: UI-local Sepolia names must fail here.
    if (!['GOLIATH_TO_ETHEREUM', 'ETHEREUM_TO_GOLIATH'].includes(direction || '')) {
      return { ok: false, status: 400, json: async () => ({ code: 'INVALID_DIRECTION', message: 'Invalid direction' }) };
    }
    return { ok: true, json: async () => direction === 'GOLIATH_TO_ETHEREUM' ? QUOTE : DEPOSIT_QUOTE };
  });
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

test.each([
  ['GOLIATH_TO_SEPOLIA', 'GOLIATH_TO_ETHEREUM', QUOTE],
  ['SEPOLIA_TO_GOLIATH', 'ETHEREUM_TO_GOLIATH', DEPOSIT_QUOTE],
] as const)('fee request translates %s to %s and preserves the server fee/net', async (direction, apiDirection, expected) => {
  const result = await new BridgeApiClient(BASE).getFeeQuote({ token: 'ETH', amount: '0.01', direction });
  expect(fetchMock).toHaveBeenCalledWith(
    `${BASE}/bridge/fee-quote?token=ETH&amount=0.01&direction=${apiDirection}`,
    expect.objectContaining({ signal: expect.anything() })
  );
  expect(result).toEqual(expected);
  expect(result.feeFormatted).toBe(expected.feeFormatted);
  expect(result.outputFormatted).toBe(expected.outputFormatted);
});

test.each(['', 'UNKNOWN', 'GOLIATH_TO_ETHEREUM'])('unknown UI direction %s fails before any request', async (direction) => {
  await expect(new BridgeApiClient(BASE).getFeeQuote({
    token: 'ETH', amount: '0.01', direction: direction as BridgeDirection,
  })).rejects.toMatchObject({ status: 400, code: 'INVALID_DIRECTION' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the real debounced fee hook exposes the withdrawal fee and net instead of an unavailable quote', async () => {
  jest.useFakeTimers();
  const container = document.createElement('div');
  let current: ReturnType<typeof useBridgeFee> | undefined;
  function Harness() {
    current = useBridgeFee({ token: 'ETH', amount: '0.01', direction: 'GOLIATH_TO_SEPOLIA' });
    return null;
  }
  try {
    act(() => { ReactDOM.render(<Harness />, container); });
    expect(current!.isLoading).toBe(true);
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(fetchMock).toHaveBeenCalledWith(
      `${bridgeConfig.statusApiBaseUrl}/bridge/fee-quote?token=ETH&amount=0.01&direction=GOLIATH_TO_ETHEREUM`,
      expect.anything()
    );
    expect(current).toMatchObject({ isLoading: false, error: null, feeQuote: QUOTE });
    expect(current!.feeQuote!.feeFormatted).toBe('0.003');
    expect(current!.feeQuote!.outputFormatted).toBe('0.007');
  } finally {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
  }
});
