// SPDX-License-Identifier: Apache-2.0
// Context-only imports must not initialize transaction engines in history/status consumers.
import { createContext, useContext } from 'react';
import type { BridgeSession } from './BridgeSession';

export const BridgeSessionContext = createContext<BridgeSession | null>(null);
export const useOptionalBridgeSession = () => useContext(BridgeSessionContext);
export function useBridgeSession(): BridgeSession {
  const session = useOptionalBridgeSession();
  if (!session) throw new Error('BRIDGE_SESSION_REQUIRED');
  return session;
}
