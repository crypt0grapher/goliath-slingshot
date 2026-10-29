// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';
import type { BridgeObservation } from '../../hooks/bridge/BridgeSession';
import { isBlankOrZeroAmount } from './presentation';

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
const pulse = keyframes`
  50% { opacity: 0.4; }
`;
const LoadingLine = styled.span`
  display: inline-block;
  width: 88px;
  height: 12px;
  vertical-align: middle;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.bg3};
  animation: ${pulse} 1.4s ease-in-out infinite;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
export function observationText(value: BridgeObservation, symbol = ''): string {
  const suffix = symbol ? ` ${symbol}` : '';
  if (value.status === 'ready' && value.value !== undefined) return value.value + suffix;
  if (value.status === 'refreshing' && value.value !== undefined) return `${value.value}${suffix} · Refreshing`;
  if (value.status === 'stale' && value.value !== undefined) return `${value.value}${suffix} · Stale — refreshing`;
  return value.status === 'loading'
    ? 'Loading…'
    : value.status === 'disconnected'
    ? 'Connect wallet'
    : value.status === 'stale'
    ? 'Stale — refreshing'
    : 'Not available';
}
export function receiveAmountText(value: BridgeObservation, symbol: string, inputAmount?: string): string {
  return isBlankOrZeroAmount(inputAmount) ? `0.0 ${symbol}` : observationText(value, symbol);
}
export function ObservationValue({
  value,
  symbol = '',
  inputAmount,
}: {
  value: BridgeObservation;
  symbol?: string;
  inputAmount?: string;
}) {
  if (isBlankOrZeroAmount(inputAmount)) return <>{`0.0 ${symbol}`}</>;
  return value.status === 'loading' ? (
    <LoadingLine role="status" aria-label="Loading bridge detail" aria-busy="true" />
  ) : (
    <>{observationText(value, symbol)}</>
  );
}
interface BridgeSummaryProps {
  symbol: string;
  inputAmount?: string;
  fee: BridgeObservation;
  net: BridgeObservation;
  eta: BridgeObservation;
  perTxMax: BridgeObservation;
  remainingCapacity: BridgeObservation;
  recipient?: string;
  showRecipient?: boolean;
}
export default function BridgeSummary({
  symbol,
  inputAmount,
  fee,
  net,
  eta,
  perTxMax,
  remainingCapacity,
  recipient,
  showRecipient = false,
}: BridgeSummaryProps) {
  const { t } = useTranslation();
  const rows: Array<[string, React.ReactNode]> = [
    [
      t('bridgeFee'),
      fee.status === 'ready' && /^(0|0\.0+)$/.test(fee.value || '') ? (
        t('free')
      ) : (
        <ObservationValue value={fee} symbol={symbol} />
      ),
    ],
    [t('bridgeYouReceive'), <ObservationValue value={net} symbol={symbol} inputAmount={inputAmount} />],
    [t('estimatedTime'), <ObservationValue value={eta} />],
    ...(showRecipient ? ([[t('recipient'), recipient || 'Connect wallet']] as Array<[string, React.ReactNode]>) : []),
    [
      t('bridgePerTransactionMax', { defaultValue: 'Per-transaction max' }),
      <ObservationValue value={perTxMax} symbol={symbol} />,
    ],
    [
      t('bridgeRemainingCapacity', { defaultValue: 'Remaining capacity' }),
      <ObservationValue value={remainingCapacity} symbol={symbol} />,
    ],
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
