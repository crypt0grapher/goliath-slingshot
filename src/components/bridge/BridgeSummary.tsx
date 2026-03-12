import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { BridgeDirection } from '../../state/bridge/types';
import { FeeQuoteResponse } from '../../services/bridgeApi';
import { getStaticEtaEstimate } from '../../utils/bridge/eta';

const SummaryContainer = styled.div`
  padding: 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  margin-top: 8px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.75rem;
  `}
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
`;

const Label = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  flex-shrink: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  text-align: right;
  word-break: break-all;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const FreeLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.green1};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid ${({ theme }) => theme.text3};
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
  vertical-align: middle;
`;

interface BridgeSummaryProps {
  direction: BridgeDirection;
  recipient: string | null;
  account: string | null | undefined;
  token: string;
  inputAmount: string;
  feeQuote: FeeQuoteResponse | null;
  isFeeLoading: boolean;
  feeError: string | null;
}

export default function BridgeSummary({
  direction,
  recipient,
  account,
  token,
  inputAmount,
  feeQuote,
  isFeeLoading,
  feeError,
}: BridgeSummaryProps) {
  const { t } = useTranslation();
  const eta = getStaticEtaEstimate(direction);
  const displayRecipient = recipient || account;

  const truncateAddress = (address: string | null | undefined) => {
    if (!address) return t('connectWalletShort');
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isWithdrawal = direction === 'GOLIATH_TO_SEPOLIA';

  // Determine fee display
  const renderFeeValue = () => {
    if (!isWithdrawal) {
      return <FreeLabel>{t('free')}</FreeLabel>;
    }
    if (isFeeLoading) {
      return <Spinner />;
    }
    if (feeError && !feeQuote) {
      return <Value>{t('bridgeFeeUnavailable')}</Value>;
    }
    if (feeQuote && feeQuote.feeBps > 0) {
      const percent = (feeQuote.feeBps / 100).toFixed(feeQuote.feeBps % 100 === 0 ? 0 : 2);
      return (
        <Value>
          {feeQuote.feeFormatted} {token} ({percent}%)
        </Value>
      );
    }
    return <FreeLabel>{t('free')}</FreeLabel>;
  };

  // Determine "You receive" display
  const renderReceiveValue = () => {
    if (!isWithdrawal) {
      return (
        <Value>
          {inputAmount || '0'} {token}
        </Value>
      );
    }
    if (isFeeLoading && !feeQuote) {
      return <Spinner />;
    }
    if (feeQuote) {
      return (
        <Value>
          {feeQuote.outputFormatted} {token}
        </Value>
      );
    }
    return (
      <Value>
        {inputAmount || '0'} {token}
      </Value>
    );
  };

  return (
    <SummaryContainer>
      <SummaryRow>
        <Label>{t('bridgeFee')}</Label>
        {renderFeeValue()}
      </SummaryRow>
      <SummaryRow>
        <Label>{t('bridgeYouReceive')}</Label>
        {renderReceiveValue()}
      </SummaryRow>
      <SummaryRow>
        <Label>{t('estimatedTime')}</Label>
        <Value>{eta}</Value>
      </SummaryRow>
      <SummaryRow>
        <Label>{t('recipient')}</Label>
        <Value>{truncateAddress(displayRecipient)}</Value>
      </SummaryRow>
    </SummaryContainer>
  );
}
