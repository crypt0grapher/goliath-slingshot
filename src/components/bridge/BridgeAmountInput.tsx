import React, { useCallback } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { BridgeAssetKey, BRIDGE_ASSETS } from '../../constants/bridge/registry';
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
  selectedAssetKey: BridgeAssetKey;
  assetKeys: readonly BridgeAssetKey[];
  onTokenSelect: (token: BridgeAssetKey) => void;
  balance: string;
  onMax: () => void;
  showMaxButton?: boolean;
  disabled?: boolean;
  minAmountFormatted?: string | null;
}

export default function BridgeAmountInput({
  value,
  onUserInput,
  selectedAssetKey,
  assetKeys,
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

  const { t } = useTranslation();
  const selectedToken = BRIDGE_ASSETS[selectedAssetKey].symbol;

  return (
    <InputContainer>
      <InputRow>
        <StyledInput
          type="text"
          aria-label="Bridge amount"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={handleInput}
          disabled={disabled}
        />
        <BridgeTokenSelector selectedAssetKey={selectedAssetKey} assetKeys={assetKeys} onSelect={onTokenSelect} />
      </InputRow>
      <BalanceRow>
        <BalanceText>
          {t('balanceLabel')} {balance} {selectedToken}
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
