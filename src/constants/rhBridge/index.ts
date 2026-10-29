// Robinhood Chain testnet <-> Onyx testnet TSLA lane: fixed identifiers.
// Testnet only. Chain 327 (Onyx mainnet) is deliberately absent.

export const RH_TESTNET_CHAIN_ID = 46630 as const;
export const ONYX_TESTNET_CHAIN_ID = 8901 as const;
export type LaneChainId = typeof RH_TESTNET_CHAIN_ID | typeof ONYX_TESTNET_CHAIN_ID;

// The only browser-storage key this lane reads or writes.
export const RH_HISTORY_KEY = 'bridge:rh:testnet:46630:8901:operations:v1';

// Public API v1 direction names (public-api.v1.json #/components/schemas/Direction).
export type RhDirection = 'RH_TO_ONYX' | 'ONYX_TO_RH';

export function chainPair(direction: RhDirection): { source: LaneChainId; destination: LaneChainId } {
  if (direction === 'RH_TO_ONYX') return { source: RH_TESTNET_CHAIN_ID, destination: ONYX_TESTNET_CHAIN_ID };
  if (direction === 'ONYX_TO_RH') return { source: ONYX_TESTNET_CHAIN_ID, destination: RH_TESTNET_CHAIN_ID };
  throw new Error('RH_INVALID_DIRECTION');
}

export function chainLabel(chainId: number): string {
  if (chainId === RH_TESTNET_CHAIN_ID) return 'Robinhood Chain Testnet';
  if (chainId === ONYX_TESTNET_CHAIN_ID) return 'Onyx Testnet';
  if (chainId === 11155111) return 'Ethereum Sepolia';
  return `Chain ${chainId}`;
}
