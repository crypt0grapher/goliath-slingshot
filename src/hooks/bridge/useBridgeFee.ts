// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useRef, useCallback } from 'react';
import { BridgeApiClient, FeeQuoteResponse } from '../../services/bridgeApi';
import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeDirection } from '../../state/bridge/types';
import { isValidAmountString, isPositiveAmount, parseAmount } from '../../utils/bridge/amounts';
import { BridgeNetwork } from '../../constants/bridge/networks';
import type { BridgeTokenSymbol } from '../../constants/bridge/tokens';

interface UseBridgeFeeParams {
  amount: string;
  token: string;
  direction: BridgeDirection;
  enabled?: boolean;
}
export function useBridgeFee({ amount, token, direction, enabled = true }: UseBridgeFeeParams) {
  const key = `${direction}|${token}|${amount}|${enabled}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    quote?: FeeQuoteResponse;
    error?: string;
    expiresAt?: number;
  }>({ key: '' });
  const client = useRef(new BridgeApiClient(bridgeConfig.statusApiBaseUrl));
  const [revision, setRevision] = useState(0);
  const refetch = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!enabled || !amount || !isValidAmountString(amount) || !isPositiveAmount(amount)) return;
    let stopped = false;
    const timer = setTimeout(
      async () => {
        try {
          if (!['ETH', 'XCN', 'USDC'].includes(token)) throw new Error('LEGACY_QUOTE_TOKEN');
          const source = direction === 'SEPOLIA_TO_GOLIATH' ? BridgeNetwork.SEPOLIA : BridgeNetwork.GOLIATH;
          const symbol = token as BridgeTokenSymbol;
          const gross = parseAmount(amount, symbol, source).toString();
          const quote =
            direction === 'SEPOLIA_TO_GOLIATH'
              ? {
                  inputAmount: gross,
                  inputFormatted: amount,
                  feeAmount: '0',
                  feeFormatted: '0',
                  feeBps: 0,
                  outputAmount: gross,
                  outputFormatted: amount,
                  token,
                }
              : await client.current.getFeeQuote({ amount, token, direction });
          const raw = /^(0|[1-9][0-9]{0,77})$/;
          if (
            quote.token !== token ||
            quote.inputAmount !== gross ||
            !raw.test(quote.feeAmount) ||
            !raw.test(quote.outputAmount) ||
            BigInt(quote.feeAmount) >= BigInt(gross) ||
            BigInt(quote.outputAmount) !== BigInt(gross) - BigInt(quote.feeAmount) ||
            parseAmount(quote.feeFormatted, symbol, source).toString() !== quote.feeAmount ||
            parseAmount(quote.outputFormatted, symbol, source).toString() !== quote.outputAmount ||
            parseAmount(quote.inputFormatted, symbol, source).toString() !== gross
          )
            throw new Error('LEGACY_QUOTE_BINDING');
          if (!stopped) setSnapshot({ key, quote, expiresAt: Date.now() + 30000 });
        } catch {
          if (!stopped) setSnapshot({ key, error: 'Fee unavailable' });
        }
      },
      direction === 'SEPOLIA_TO_GOLIATH' ? 0 : 300
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [amount, direction, enabled, key, revision, token]);
  useEffect(() => {
    if (!snapshot.quote) return;
    const timer = setTimeout(
      () => setSnapshot((current) => (current === snapshot ? { key: snapshot.key, error: 'Quote expired' } : current)),
      Math.max(0, (snapshot.expiresAt ?? 0) - Date.now())
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  const current = snapshot.key === key ? snapshot : undefined;
  return {
    feeQuote: current?.quote ?? null,
    isLoading: enabled && !!amount && !current,
    error: current?.error ?? null,
    isStale: current?.error === 'Quote expired',
    refetch,
    expiresAt: current?.expiresAt,
  };
}
