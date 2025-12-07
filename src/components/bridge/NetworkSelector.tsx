import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';

const SelectorContainer = styled.div<{ disabled: boolean }>`
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

const DropdownMenu = styled.div<{ isOpen: boolean }>`
  display: ${({ isOpen }) => (isOpen ? 'block' : 'none')};
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
}

export default function NetworkSelector({
  selectedNetwork,
  onSelect,
  label,
  disabled = false,
}: NetworkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
      <SelectorContainer onClick={handleToggle} disabled={disabled}>
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

      <DropdownMenu isOpen={isOpen}>
        {Object.values(BridgeNetwork).map((network) => {
          const netMetadata = NETWORK_METADATA[network];
          return (
            <DropdownItem
              key={network}
              selected={network === selectedNetwork}
              onClick={() => handleSelect(network)}
            >
              <NetworkIconPlaceholder>{netMetadata.shortName.charAt(0)}</NetworkIconPlaceholder>
              <NetworkName>{netMetadata.displayName}</NetworkName>
            </DropdownItem>
          );
        })}
      </DropdownMenu>
    </DropdownContainer>
  );
}
