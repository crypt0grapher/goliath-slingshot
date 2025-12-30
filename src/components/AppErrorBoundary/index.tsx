import React, { Component, ErrorInfo, ReactNode } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #1d1f24;
  padding: 2rem;
  text-align: center;
`;

const Title = styled.h1`
  color: #ffffff;
  font-size: 1.5rem;
  margin-bottom: 1rem;
`;

const Message = styled.p`
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  margin-bottom: 2rem;
  max-width: 400px;
`;

const ReloadButton = styled.button`
  background-color: #2d2d2d;
  color: #ffffff;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #3a3a3a;
  }
`;

const ErrorDetails = styled.details`
  margin-top: 2rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  max-width: 600px;
  text-align: left;

  summary {
    cursor: pointer;
    margin-bottom: 0.5rem;
  }

  pre {
    background-color: rgba(0, 0, 0, 0.3);
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Root-level error boundary to catch critical errors and prevent white screen crashes
 * Shows a user-friendly error page with reload option
 */
export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App crashed with error:', error);
    console.error('Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    // Clear any cached state that might be causing issues
    try {
      localStorage.removeItem('redux_localstorage_simple_user');
      localStorage.removeItem('redux_localstorage_simple_lists');
    } catch (e) {
      // Ignore storage errors
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Container>
          <Title>Something went wrong</Title>
          <Message>
            The app encountered an unexpected error. This might be due to network issues or a temporary problem.
            Try reloading the page.
          </Message>
          <ReloadButton onClick={this.handleReload}>Reload App</ReloadButton>
          {this.state.error && (
            <ErrorDetails>
              <summary>Technical Details</summary>
              <pre>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </ErrorDetails>
          )}
        </Container>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
