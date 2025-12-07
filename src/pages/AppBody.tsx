import React from 'react';
import styled from 'styled-components';

export const BodyWrapper = styled.div`
  position: relative;
  max-width: 500px;
  width: 100%;
  padding: 0.2rem;
  border-radius: 1.6rem;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;
  background: ${({ theme }) => theme.bg1};
  overflow: hidden;

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    width: calc(100% - 1rem);
    margin: 0 0.5rem;
    border-radius: 1.2rem;
  `}
`;

export default function AppBody({ children }: { children: React.ReactNode }) {
  return <BodyWrapper>{children}</BodyWrapper>;
}
