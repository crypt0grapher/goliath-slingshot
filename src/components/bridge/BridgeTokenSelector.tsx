import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { BridgeTokenSymbol, BRIDGE_TOKENS, BRIDGE_TOKEN_LIST } from '../../constants/bridge/tokens';

const SelectorButton = styled.button`
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background-color: ${({ theme }) => theme.primary1};
  border: none;
  border-radius: 16px;
  cursor: pointer;
  color: white;
  font-size: 16px;
  font-weight: 500;

  &:hover {
    background-color: ${({ theme }) => theme.primary2};
  }
`;

const TokenIconPlaceholder = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.bg3};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
  margin-right: 6px;
`;

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

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

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
      <SelectorButton onClick={handleToggle}>
        <TokenIconPlaceholder>{selectedToken.charAt(0)}</TokenIconPlaceholder>
        <TokenSymbol>{selectedToken}</TokenSymbol>
        <ChevronDown size={16} />
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
              <TokenIconPlaceholder>{symbol.charAt(0)}</TokenIconPlaceholder>
              <ItemSymbol>{symbol}</ItemSymbol>
              <TokenName>{config.name}</TokenName>
            </DropdownItem>
          );
        })}
      </DropdownMenu>
    </DropdownContainer>
  );
}
