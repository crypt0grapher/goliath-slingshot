// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import type { BridgeObservation } from '../../hooks/bridge/BridgeSession';

const SummaryContainer = styled.dl`
  padding: 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  margin: 8px 0 0;
`;
const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  font-size: 14px;
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  dt {
    color: ${({ theme }) => theme.text2};
  }
`;
export function observationText(value: BridgeObservation, symbol = ''): string {
  if (value.status === 'ready' && value.value !== undefined) return value.value + (symbol ? ` ${symbol}` : '');
  return value.status === 'loading'
    ? 'Loading…'
    : value.status === 'disconnected'
    ? 'Connect wallet'
    : value.status === 'stale'
    ? 'Stale — refreshing'
    : 'Not available';
}
interface BridgeSummaryProps {
  symbol: string;
  fee: BridgeObservation;
  net: BridgeObservation;
  eta: BridgeObservation;
  perTxMax: BridgeObservation;
  remainingCapacity: BridgeObservation;
  recipient: string;
}
export default function BridgeSummary({
  symbol,
  fee,
  net,
  eta,
  perTxMax,
  remainingCapacity,
  recipient,
}: BridgeSummaryProps) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [
      t('bridgeFee'),
      fee.status === 'ready' && /^(0|0\.0+)$/.test(fee.value || '') ? t('free') : observationText(fee, symbol),
    ],
    [t('bridgeYouReceive'), observationText(net, symbol)],
    [t('estimatedTime'), observationText(eta)],
    [t('recipient'), recipient || 'Connect wallet'],
    [t('bridgePerTransactionMax', { defaultValue: 'Per-transaction max' }), observationText(perTxMax, symbol)],
    [t('bridgeRemainingCapacity', { defaultValue: 'Remaining capacity' }), observationText(remainingCapacity, symbol)],
  ];
  return (
    <SummaryContainer aria-label="Bridge summary">
      {rows.map(([label, value]) => (
        <Row key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Row>
      ))}
    </SummaryContainer>
  );
}
