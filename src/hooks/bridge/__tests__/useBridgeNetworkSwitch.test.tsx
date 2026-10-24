// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useBridgeNetworkSwitch } from '../useBridgeNetworkSwitch';
import { BridgeNetwork } from '../../../constants/bridge/networks';
import { StaleBridgeIntent } from '../walletIntent';

const mockRequest = jest.fn();
beforeEach(() => mockRequest.mockReset());
jest.mock('../../index', () => ({ useActiveWeb3React: () => ({ library: { provider: { request: mockRequest } } }) }));
test('unknown Robinhood chain is added with public metadata and explicitly switched afterward', async () => {
  mockRequest.mockRejectedValueOnce({ code: 4902 }).mockResolvedValue(undefined);
  const container = document.createElement('div');
  let current: ReturnType<typeof useBridgeNetworkSwitch>;
  function Harness() {
    current = useBridgeNetworkSwitch();
    return null;
  }
  try {
    act(() => {
      ReactDOM.render(<Harness />, container);
    });
    await act(async () => {
      expect(await current!.switchNetwork(BridgeNetwork.ROBINHOOD)).toBe(true);
    });
    expect(mockRequest.mock.calls.map(([value]) => value.method)).toEqual([
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
    ]);
    expect(mockRequest.mock.calls[1][0].params[0]).toMatchObject({
      chainId: '0xb626',
      chainName: 'Robinhood Chain Testnet',
      nativeCurrency: { symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
    });
    expect(mockRequest.mock.calls[2][0].params).toEqual([{ chainId: '0xb626' }]);
  } finally {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
  }
});

test('changing the source selection during add-chain prevents the later switch prompt', async () => {
  let releaseAdd!: () => void;
  const added = new Promise<void>((resolve) => {
    releaseAdd = resolve;
  });
  let valid = true;
  const account = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
  mockRequest.mockImplementation(async ({ method }) => {
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('Unknown chain'), { code: 4902 });
    if (method === 'wallet_addEthereumChain') return added;
    throw new Error('Unexpected fixture RPC');
  });
  const container = document.createElement('div');
  let current: ReturnType<typeof useBridgeNetworkSwitch>;
  function Harness() {
    current = useBridgeNetworkSwitch();
    return null;
  }
  try {
    act(() => {
      ReactDOM.render(<Harness />, container);
    });
    let action!: Promise<boolean>;
    await act(async () => {
      action = current!.switchNetwork(BridgeNetwork.ROBINHOOD, {
        expectedAccount: account,
        assertCurrent() {
          if (!valid) throw new StaleBridgeIntent();
        },
      });
    });
    expect(mockRequest.mock.calls.filter(([r]) => r.method === 'wallet_addEthereumChain')).toHaveLength(1);
    await act(async () => {
      valid = false;
      releaseAdd();
      expect(await action).toBe(false);
    });
    expect(mockRequest.mock.calls.map(([r]) => r.method).filter((m) => m.startsWith('wallet_'))).toEqual([
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
    ]);
  } finally {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
  }
});
