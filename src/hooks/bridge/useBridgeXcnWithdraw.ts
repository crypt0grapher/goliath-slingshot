import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useProviderReady } from '../useProviderReady';
import { useDispatch } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { parseAmount } from '../../utils/bridge/amounts';
import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeApiClient } from '../../services/bridgeApi';

const TX_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const BIND_RETRY_MAX = 5;
const BIND_RETRY_BASE_DELAY_MS = 2000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitForTxWithTimeout = async (
  tx: ethers.providers.TransactionResponse,
  timeoutMs: number
): Promise<ethers.providers.TransactionReceipt> => {
  return Promise.race([
    tx.wait(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(i18n.t('errorTransactionTakingLong'))),
        timeoutMs
      )
    ),
  ]);
};

// EIP-712 domain for XCN withdraw intents (signed on Goliath)
const EIP712_DOMAIN = {
  name: 'GoliathBridge',
  version: '1',
  chainId: 8901,
};

const EIP712_TYPES = {
  XcnWithdrawIntent: [
    { name: 'senderAddress', type: 'address' },
    { name: 'recipientAddress', type: 'address' },
    { name: 'amountAtomic', type: 'string' },
    { name: 'idempotencyKey', type: 'string' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'string' },
  ],
};

interface UseXcnWithdrawReturn {
  withdraw: (token: BridgeTokenSymbol, amountHuman: string, recipient: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

export function useBridgeXcnWithdraw(): UseXcnWithdrawReturn {
  const { t } = useTranslation();
  const { account, library, chainId } = useActiveWeb3React();
  const { isReady: providerReady, recheckProvider } = useProviderReady();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
    async (token: BridgeTokenSymbol, amountHuman: string, recipient: string): Promise<string> => {
      if (!account || !library) {
        throw new Error(t('errorWalletNotConnected'));
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      try {
        if (!providerReady) {
          recheckProvider();
          await wait(300);
        }

        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.GOLIATH);
        const signer = library.getSigner(account);

        // 1. Build and sign EIP-712 intent
        const idempotencyKey = uuidv4();
        const deadline = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes
        const nonce = Date.now().toString();

        const message = {
          senderAddress: account,
          recipientAddress: recipient,
          amountAtomic: amountAtomic.toString(),
          idempotencyKey,
          deadline,
          nonce,
        };

        let signature: string;
        try {
          signature = await (signer as any)._signTypedData(
            EIP712_DOMAIN,
            EIP712_TYPES,
            message
          );
        } catch (err: any) {
          if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
            throw err;
          }
          throw new Error(t('errorSignatureFailed') || 'Failed to sign intent');
        }

        // 2. Register intent with backend
        const apiClient = new BridgeApiClient(bridgeConfig.statusApiBaseUrl);
        let intentResponse: { intentId: string; relayerWalletAddress: string; expiresAt: string };
        try {
          intentResponse = await apiClient.registerXcnWithdrawIntent({
            senderAddress: account,
            recipientAddress: recipient,
            amountAtomic: amountAtomic.toString(),
            idempotencyKey,
            deadline,
            nonce,
            signature,
          });
        } catch (err: any) {
          throw new Error(err?.message || t('errorBridgeApiUnavailable') || 'Failed to register withdraw intent');
        }

        // 3. Send native XCN to relayer wallet
        let tx: ethers.providers.TransactionResponse;
        try {
          tx = await signer.sendTransaction({
            to: intentResponse.relayerWalletAddress,
            value: amountAtomic,
          });
        } catch (err: any) {
          if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
            throw err;
          }
          throw new Error(err?.message || 'Failed to send XCN to bridge');
        }

        // 4. Create operation record immediately
        const operationId = uuidv4();
        const operation = {
          id: operationId,
          direction: 'GOLIATH_TO_SEPOLIA' as const,
          token: token,
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          sender: account,
          recipient,
          originChainId: 8901,
          destinationChainId: 11155111,
          originTxHash: tx.hash,
          destinationTxHash: null,
          depositId: null,
          withdrawId: null,
          status: 'PENDING_ORIGIN_TX' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originConfirmations: 0,
          requiredConfirmations: 0,
          errorMessage: null,
          estimatedCompletionTime: null,
        };

        dispatch(bridgeActions.addOperation(operation));
        dispatch(bridgeActions.closeConfirmModal());
        dispatch(bridgeActions.openStatusModal(operationId));

        // 5. Bind origin tx hash (with retry, background - don't block UI)
        const bindWithRetry = async () => {
          for (let attempt = 0; attempt < BIND_RETRY_MAX; attempt++) {
            try {
              await apiClient.bindXcnWithdrawOrigin({
                intentId: intentResponse.intentId,
                senderAddress: account,
                originTxHash: tx.hash,
              });
              return;
            } catch (err) {
              if (attempt < BIND_RETRY_MAX - 1) {
                await wait(BIND_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
              } else {
                console.error('Failed to bind XCN withdraw origin after retries:', err);
              }
            }
          }
        };
        // Fire-and-forget bind (don't block the user)
        bindWithRetry();

        // 6. Wait for tx to be mined
        try {
          const receipt = await waitForTxWithTimeout(tx, TX_WAIT_TIMEOUT_MS);
          if (receipt.status === 0) {
            dispatch(
              bridgeActions.updateOperationStatus({
                id: operationId,
                status: 'FAILED',
                errorMessage: t('errorTransactionReverted'),
              })
            );
            throw new Error(t('errorTransactionReverted'));
          }

          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'CONFIRMING',
              originConfirmations: 1,
            })
          );
        } catch (timeoutErr: any) {
          if (timeoutErr.message === t('errorTransactionReverted')) {
            throw timeoutErr;
          }
          // Timeout - mark as delayed but don't fail
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'DELAYED',
              errorMessage: timeoutErr.message,
            })
          );
          return operationId;
        }

        return operationId;
      } catch (err: any) {
        const message = err?.message || 'XCN withdraw failed';
        setError(message);
        dispatch(bridgeActions.setError(message));
        throw err;
      } finally {
        setIsLoading(false);
        dispatch(bridgeActions.setSubmitting(false));
      }
    },
    [t, account, library, chainId, dispatch, providerReady, recheckProvider]
  );

  return { withdraw, isLoading, error };
}
