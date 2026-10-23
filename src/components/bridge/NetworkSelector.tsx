import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { Link } from 'react-router-dom';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';

const SelectorContainer = styled.button<{ disabled: boolean }>`
  width: 100%;
  border: 0;
  font: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};

  &:hover {
    background-color: ${({ theme, disabled }) => (disabled ? theme.bg2 : theme.bg3)};
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.6rem 0.75rem;
  `}
`;

const NetworkLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
  margin-right: 8px;
  flex-shrink: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 13px;
    margin-right: 6px;
  `}
`;

const NetworkName = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin-left: 8px;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    font-size: 14px;
    margin-left: 6px;
  `}
`;

const NetworkIconPlaceholder = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.bg3};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
  flex-shrink: 0;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    width: 20px;
    height: 20px;
    font-size: 10px;
  `}
`;

const NetworkInfo = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
`;

const DropdownContainer = styled.div`
  position: relative;
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
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
  text-align: left;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: ${({ selected, theme }) => (selected ? theme.bg3 : 'transparent')};

  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }
`;

const NavigationItem = styled(Link)`
  padding: 12px 16px;
  display: flex;
  align-items: center;
  color: inherit;
  text-decoration: none;
  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }
`;

const NavigationDetail = styled.span`
  display: block;
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
`;

const ChevronWrapper = styled.div<{ isOpen: boolean }>`
  display: flex;
  align-items: center;
  transition: transform 0.2s ease;
  transform: ${({ isOpen }) => (isOpen ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

interface NetworkSelectorProps {
  selectedNetwork: BridgeNetwork;
  onSelect: (network: BridgeNetwork) => void;
  label: 'From' | 'To';
  disabled?: boolean;
  // Routes to separate bridge lanes; these are never values of the legacy BridgeNetwork store.
  navigationOptions?: readonly { label: string; to: string; description: string }[];
}

export default function NetworkSelector({
  selectedNetwork,
  onSelect,
  label,
  disabled = false,
  navigationOptions = [],
}: NetworkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const metadata = NETWORK_METADATA[selectedNetwork];

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (network: BridgeNetwork) => {
      onSelect(network);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onSelect]
  );

  useEffect(() => {
    if (isOpen) dropdownRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
  }, [isOpen]);

  const handleMenuKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const items = Array.from(dropdownRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') || []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : event.key === 'ArrowUp'
        ? (index - 1 + items.length) % items.length
        : event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? items.length - 1
        : -1;
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

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
    <DropdownContainer ref={dropdownRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
    }}>
      <SelectorContainer
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-label={`${label} network`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onKeyDown={(event) => {
          if (!disabled && event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <NetworkInfo>
          <NetworkLabel>{label}:</NetworkLabel>
          <NetworkIconPlaceholder>{metadata.shortName.charAt(0)}</NetworkIconPlaceholder>
          <NetworkName>{metadata.displayName}</NetworkName>
        </NetworkInfo>
        {!disabled && (
          <ChevronWrapper isOpen={isOpen}>
            <ChevronDown size={20} />
          </ChevronWrapper>
        )}
      </SelectorContainer>

      {isOpen && !disabled && (
        <DropdownMenu role="menu" aria-label={`${label} network choices`} onKeyDown={handleMenuKey}>
          {Object.values(BridgeNetwork).map((network) => {
            const netMetadata = NETWORK_METADATA[network];
            return (
              <DropdownItem
                key={network}
                type="button"
                role="menuitemradio"
                aria-checked={network === selectedNetwork}
                selected={network === selectedNetwork}
                onClick={() => handleSelect(network)}
              >
                <NetworkIconPlaceholder>{netMetadata.shortName.charAt(0)}</NetworkIconPlaceholder>
                <NetworkName>{netMetadata.displayName}</NetworkName>
              </DropdownItem>
            );
          })}
          {navigationOptions.map((option) => (
            <NavigationItem key={option.to} to={option.to} role="menuitem" onClick={() => setIsOpen(false)}>
              <NetworkIconPlaceholder>{option.label.charAt(0)}</NetworkIconPlaceholder>
              <NetworkName>
                {option.label}
                <NavigationDetail>{option.description}</NavigationDetail>
              </NetworkName>
            </NavigationItem>
          ))}
        </DropdownMenu>
      )}
    </DropdownContainer>
  );
}
