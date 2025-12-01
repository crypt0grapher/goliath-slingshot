import React from 'react';
import styled from 'styled-components';
import { ArrowDown } from 'react-feather';

const SwapButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.bg1};
  border: 4px solid ${({ theme }) => theme.bg2};
  cursor: pointer;
  margin: -14px auto;
  position: relative;
  z-index: 2;
  transition: transform 0.2s ease;

  &:hover {
    transform: rotate(180deg);
  }

  svg {
    color: ${({ theme }) => theme.text1};
  }
`;

interface DirectionSwapButtonProps {
  onClick: () => void;
}

export default function DirectionSwapButton({ onClick }: DirectionSwapButtonProps) {
  return (
    <SwapButton onClick={onClick} type="button">
      <ArrowDown size={18} />
    </SwapButton>
  );
}
