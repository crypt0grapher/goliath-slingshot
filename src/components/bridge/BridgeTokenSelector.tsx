import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { BridgeTokenSymbol, BRIDGE_TOKENS, BRIDGE_TOKEN_LIST } from '../../constants/bridge/tokens';
import EthereumLogo from '../../assets/images/ethereum-logo.png';

const SelectorButton = styled.button`
  display: flex;
  align-items: center;
  height: 2.2rem;
  padding: 0 0.5rem;
  background-color: ${({ theme }) => theme.bg3};
  border: none;
  border-radius: 12px;
  cursor: pointer;
  color: ${({ theme }) => theme.text1};
  font-size: 20px;
  font-weight: 500;
  outline: none;
  user-select: none;
  transition: 0.2s;

  &:hover {
    background-color: ${({ theme }) => theme.bg4};
  }
`;

const TokenIcon = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-right: 6px;
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
`;

// Token logo URLs
const TOKEN_LOGOS: Record<BridgeTokenSymbol, string> = {
  ETH: EthereumLogo,
  USDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
};

const TokenSymbol = styled.span`
  margin-right: 4px;
`;

const DropdownContainer = styled.div`
  position: relative;
`;

const DropdownMenu = styled.div<{ isOpen: boolean }>`
  display: ${({ isOpen }) => (isOpen ? 'block' : 'none')};
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  z-index: 100;
  overflow: hidden;
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.1);
`;

const DropdownItem = styled.div<{ selected: boolean }>`
  padding: 12px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: ${({ selected, theme }) => (selected ? theme.bg3 : 'transparent')};

  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }
`;

const TokenName = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-left: 8px;
`;

const ItemSymbol = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin-left: 8px;
`;

interface BridgeTokenSelectorProps {
  selectedToken: BridgeTokenSymbol;
  onSelect: (token: BridgeTokenSymbol) => void;
}

export default function BridgeTokenSelector({ selectedToken, onSelect }: BridgeTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasMultipleTokens = BRIDGE_TOKEN_LIST.length > 1;

  const handleToggle = useCallback(() => {
    if (hasMultipleTokens) {
      setIsOpen((prev) => !prev);
    }
  }, [hasMultipleTokens]);

  const handleSelect = useCallback(
    (token: BridgeTokenSymbol) => {
      onSelect(token);
      setIsOpen(false);
    },
    [onSelect]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <DropdownContainer ref={dropdownRef}>
      <SelectorButton onClick={handleToggle} style={{ cursor: hasMultipleTokens ? 'pointer' : 'default' }}>
        <TokenIcon src={TOKEN_LOGOS[selectedToken]} alt={selectedToken} />
        <TokenSymbol>{selectedToken}</TokenSymbol>
        {hasMultipleTokens && <ChevronDown size={16} />}
      </SelectorButton>

      <DropdownMenu isOpen={isOpen}>
        {BRIDGE_TOKEN_LIST.map((symbol) => {
          const config = BRIDGE_TOKENS[symbol];
          return (
            <DropdownItem
              key={symbol}
              selected={symbol === selectedToken}
              onClick={() => handleSelect(symbol)}
            >
              <TokenIcon src={TOKEN_LOGOS[symbol]} alt={symbol} style={{ marginRight: 0 }} />
              <ItemSymbol>{symbol}</ItemSymbol>
              <TokenName>{config.name}</TokenName>
            </DropdownItem>
          );
        })}
      </DropdownMenu>
    </DropdownContainer>
  );
}
