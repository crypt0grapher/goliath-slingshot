import React from 'react';
import styled from 'styled-components';
import { RH_ROUTE, RH_TESTNET_BRIDGE_ENABLED } from '../../config/rhBridge';

const Link = styled.a`
  display: block;
  margin: 0.75rem 1rem 0;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  font-size: 13px;
  text-decoration: none;
  color: ${({ theme }) => theme.text1};
  background: ${({ theme }) => theme.bg2};
`;

// Shown on #/bridge only when REACT_APP_RH_TESTNET_BRIDGE_ENABLED=true (default off).
export function RhBridgeEntryLink({ enabled = RH_TESTNET_BRIDGE_ENABLED }: { enabled?: boolean }) {
  return enabled ? (
    <Link href={'#' + RH_ROUTE}>New: bridge TSLA between Robinhood Chain Testnet and Onyx Testnet →</Link>
  ) : null;
}
