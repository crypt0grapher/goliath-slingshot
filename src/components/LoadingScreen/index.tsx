import React from 'react';
import styled, { keyframes } from 'styled-components';

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #1d1f24;
`;

const Logo = styled.div`
  font-size: 2rem;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 1.5rem;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.div`
  margin-top: 1rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
`;

/**
 * Loading screen shown during app initialization
 * Prevents white screen while i18n, wallet connection, and other async ops complete
 */
export default function LoadingScreen() {
  return (
    <Container>
      <Logo>Slingshot</Logo>
      <Spinner />
      <LoadingText>Loading...</LoadingText>
    </Container>
  );
}
