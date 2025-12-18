import React, { Component, ErrorInfo, ReactNode } from 'react';
import styled from 'styled-components';

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.red1};
`;

const ErrorMessage = styled.p`
  color: ${({ theme }) => theme.red1};
  font-size: 14px;
  margin: 0;
  text-align: center;
`;

const RetryButton = styled.button`
  margin-top: 12px;
  padding: 8px 16px;
  background-color: ${({ theme }) => theme.primary1};
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;

  :hover {
    opacity: 0.8;
  }
`;

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component to catch rendering errors and prevent white screen crashes
 * Particularly useful for wrapping currency input components that may fail with edge case values
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorContainer>
          <ErrorMessage>
            {this.props.fallbackMessage || 'Something went wrong with this input.'}
          </ErrorMessage>
          <RetryButton onClick={this.handleReset}>Try Again</RetryButton>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

/**
 * A simpler error boundary specifically for currency input panels
 * Shows a minimal error state that doesn't disrupt the page layout
 */
export class CurrencyInputErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CurrencyInputErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorContainer style={{ padding: '12px', minHeight: '70px' }}>
          <ErrorMessage style={{ fontSize: '12px' }}>
            {this.props.fallbackMessage || 'Input error - please refresh'}
          </ErrorMessage>
          <RetryButton style={{ padding: '4px 12px', fontSize: '12px' }} onClick={this.handleReset}>
            Reset
          </RetryButton>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
