import React, { useCallback } from 'react';
import styled from 'styled-components';
import { BridgeTokenSymbol } from '../../constants/bridge/tokens';
import BridgeTokenSelector from './BridgeTokenSelector';
import { sanitizeAmountInput } from '../../utils/bridge/amounts';

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 16px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.75rem;
    border-radius: 12px;
  `}
`;

const InputRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const StyledInput = styled.input`
  width: 0;
  flex: 1 1 auto;
  font-size: 28px;
  font-weight: 500;
  outline: none;
  border: none;
  background-color: transparent;
  color: ${({ theme }) => theme.text1};
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &::placeholder {
    color: ${({ theme }) => theme.text4};
  }

  /* Hide spin buttons for number input */
  -moz-appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 24px;
  `}
`;

const BalanceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
`;

const BalanceText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
  `}
`;

const MaxButton = styled.button`
  background-color: transparent;
  border: none;
  color: ${({ theme }) => theme.primary1};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-left: 8px;

  &:hover {
    opacity: 0.8;
  }
`;

interface BridgeAmountInputProps {
  value: string;
  onUserInput: (value: string) => void;
  selectedToken: BridgeTokenSymbol;
  onTokenSelect: (token: BridgeTokenSymbol) => void;
  balance: string;
  onMax: () => void;
  showMaxButton?: boolean;
  disabled?: boolean;
}

export default function BridgeAmountInput({
  value,
  onUserInput,
  selectedToken,
  onTokenSelect,
  balance,
  onMax,
  showMaxButton = true,
  disabled = false,
}: BridgeAmountInputProps) {
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitized = sanitizeAmountInput(e.target.value);
      onUserInput(sanitized);
    },
    [onUserInput]
  );

  return (
    <InputContainer>
      <InputRow>
        <StyledInput
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={handleInput}
          disabled={disabled}
        />
        <BridgeTokenSelector selectedToken={selectedToken} onSelect={onTokenSelect} />
      </InputRow>
      <BalanceRow>
        <BalanceText>
          Balance: {balance} {selectedToken}
        </BalanceText>
        {showMaxButton && parseFloat(balance) > 0 && (
          <MaxButton onClick={onMax} type="button">
            MAX
          </MaxButton>
        )}
      </BalanceRow>
    </InputContainer>
  );
}
