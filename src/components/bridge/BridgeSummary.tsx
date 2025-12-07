import React from 'react';
import styled from 'styled-components';
import { BridgeDirection } from '../../state/bridge/types';
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
`;

const Label = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const Value = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};

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

interface BridgeSummaryProps {
  direction: BridgeDirection;
  recipient: string | null;
  account: string | null | undefined;
}

export default function BridgeSummary({ direction, recipient, account }: BridgeSummaryProps) {
  const eta = getStaticEtaEstimate(direction);
  const displayRecipient = recipient || account;

  const truncateAddress = (address: string | null | undefined) => {
    if (!address) return 'Connect wallet';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <SummaryContainer>
      <SummaryRow>
        <Label>Bridge Fee</Label>
        <FreeLabel>Free</FreeLabel>
      </SummaryRow>
      <SummaryRow>
        <Label>Estimated Time</Label>
        <Value>{eta}</Value>
      </SummaryRow>
      <SummaryRow>
        <Label>Recipient</Label>
        <Value>{truncateAddress(displayRecipient)}</Value>
      </SummaryRow>
    </SummaryContainer>
  );
}
