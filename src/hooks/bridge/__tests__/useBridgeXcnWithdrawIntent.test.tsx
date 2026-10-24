// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useBridgeXcnWithdraw } from '../useBridgeXcnWithdraw';
import { StaleBridgeIntent } from '../walletIntent';

const ACCOUNT = '0x7dbe71b743e3e9f542324dd032d080e9fa1a243a';
const mockSign = jest.fn();
const mockTransfer = jest.fn();
const mockRegister = jest.fn();
jest.mock('../../index', () => ({
  useActiveWeb3React: () => ({
    account: ACCOUNT,
    chainId: 8901,
    library: {
      provider: {
        request: async ({ method }: { method: string }) => (method === 'eth_accounts' ? [ACCOUNT] : '0x22c5'),
      },
      getSigner: () => ({ _signTypedData: mockSign, sendTransaction: mockTransfer }),
    },
  }),
}));
jest.mock('../../useProviderReady', () => ({
  useProviderReady: () => ({ isReady: true, recheckProvider: jest.fn() }),
}));
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('uuid', () => ({ v4: () => 'captured-intent' }));
jest.mock('../../../services/bridgeApi', () => ({
  BridgeApiClient: jest.fn().mockImplementation(() => ({
    checkXcnWithdrawCapability: async () => true,
    registerXcnWithdrawIntent: mockRegister,
  })),
}));

test('an issued XCN signature may finish for the original intent but cannot cause a later stale transfer prompt', async () => {
  require('../../../services/bridgeApi').BridgeApiClient.mockImplementation(() => ({
    checkXcnWithdrawCapability: async () => true,
    registerXcnWithdrawIntent: mockRegister,
  }));
  let releaseSignature!: (signature: string) => void;
  mockSign.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        releaseSignature = resolve;
      })
  );
  mockRegister.mockResolvedValue({ intentId: 'captured-intent', relayerWalletAddress: ACCOUNT, expiresAt: '' });
  let valid = true;
  let current: ReturnType<typeof useBridgeXcnWithdraw>;
  function Harness() {
    current = useBridgeXcnWithdraw();
    return null;
  }
  const container = document.createElement('div');
  try {
    act(() => {
      ReactDOM.render(<Harness />, container);
    });
    let action!: Promise<string>;
    await act(async () => {
      action = current!.withdraw('XCN', '0.01', ACCOUNT, {
        expectedAccount: ACCOUNT,
        expectedChainId: 8901,
        assertCurrent() {
          if (!valid) throw new StaleBridgeIntent();
        },
      });
    });
    expect(mockSign).toHaveBeenCalledTimes(1);
    await act(async () => {
      valid = false;
      releaseSignature('captured-signature');
      await expect(action).rejects.toMatchObject({ code: 'STALE_BRIDGE_INTENT' });
    });
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: ACCOUNT,
        recipientAddress: ACCOUNT,
        amountAtomic: '10000000000000000',
        signature: 'captured-signature',
      })
    );
    expect(mockTransfer).not.toHaveBeenCalled();
  } finally {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
  }
});
