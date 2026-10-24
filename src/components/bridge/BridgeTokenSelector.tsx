import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { BridgeAssetKey, BRIDGE_ASSETS } from '../../constants/bridge/registry';
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
  flex-shrink: 0;
  white-space: nowrap;

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

const DropdownItem = styled.button<{ selected: boolean }>`
  width: 100%;
  border: 0;
  font: inherit;
  color: inherit;
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
  selectedAssetKey: BridgeAssetKey;
  assetKeys: readonly BridgeAssetKey[];
  onSelect: (key: BridgeAssetKey) => void;
}
export default function BridgeTokenSelector({ selectedAssetKey, assetKeys, onSelect }: BridgeTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = BRIDGE_ASSETS[selectedAssetKey];
  const hasMultipleTokens = assetKeys.length > 1;
  const handleSelect = useCallback(
    (key: BridgeAssetKey) => {
      onSelect(key);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onSelect]
  );
  useEffect(() => {
    if (isOpen) dropdownRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [isOpen]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  const icon = (key: BridgeAssetKey) => (BRIDGE_ASSETS[key].symbol === 'ETH' ? EthereumLogo : BRIDGE_ASSETS[key].logo);
  return (
    <DropdownContainer ref={dropdownRef}>
      <SelectorButton
        ref={triggerRef}
        type="button"
        aria-label="Select bridge token"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => hasMultipleTokens && setIsOpen((v) => !v)}
      >
        <TokenIcon
          src={icon(selectedAssetKey)}
          alt=""
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <TokenSymbol>{selected.symbol}</TokenSymbol>
        {hasMultipleTokens && <ChevronDown size={16} />}
      </SelectorButton>
      {isOpen && (
        <DropdownMenu
          isOpen
          role="listbox"
          aria-label="Bridge tokens"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              triggerRef.current?.focus();
              return;
            }
            const items = Array.from(dropdownRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || []);
            const at = items.indexOf(document.activeElement as HTMLElement);
            const next =
              e.key === 'ArrowDown'
                ? (at + 1) % items.length
                : e.key === 'ArrowUp'
                ? (at - 1 + items.length) % items.length
                : -1;
            if (next >= 0) {
              e.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          {assetKeys.map((key) => (
            <DropdownItem
              key={key}
              type="button"
              role="option"
              aria-selected={key === selectedAssetKey}
              selected={key === selectedAssetKey}
              onClick={() => handleSelect(key)}
            >
              <TokenIcon
                src={icon(key)}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
              <ItemSymbol>{BRIDGE_ASSETS[key].symbol}</ItemSymbol>
              <TokenName>{BRIDGE_ASSETS[key].name}</TokenName>
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </DropdownContainer>
  );
}
