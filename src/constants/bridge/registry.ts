// SPDX-License-Identifier: Apache-2.0
// Selection identities are local, origin-qualified metadata; they never authorize a transaction.
import { BridgeNetwork } from './networks';
import type { BridgeTokenSymbol } from './tokens';

export type BridgeAssetKey = 'SEPOLIA_ETH' | 'SEPOLIA_XCN' | 'SEPOLIA_USDC' | 'TSLA' | 'RH_ETH';
export type BridgeRouteId = 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA' | 'RH_TO_ONYX' | 'ONYX_TO_RH';
export interface BridgeAsset {
  key: BridgeAssetKey;
  symbol: string;
  name: string;
  originChainId: number;
  decimals: number;
  logo: string;
  legacyToken?: BridgeTokenSymbol;
}
export const BRIDGE_ASSETS: Record<BridgeAssetKey, BridgeAsset> = {
  SEPOLIA_ETH: {
    key: 'SEPOLIA_ETH',
    symbol: 'ETH',
    name: 'Ether · Sepolia origin',
    originChainId: 11155111,
    decimals: 18,
    logo: '/images/tokens/eth.svg',
    legacyToken: 'ETH',
  },
  SEPOLIA_XCN: {
    key: 'SEPOLIA_XCN',
    symbol: 'XCN',
    name: 'Onyxcoin',
    originChainId: 11155111,
    decimals: 18,
    logo: '/images/tokens/xcn.png',
    legacyToken: 'XCN',
  },
  SEPOLIA_USDC: {
    key: 'SEPOLIA_USDC',
    symbol: 'USDC',
    name: 'USD Coin',
    originChainId: 11155111,
    decimals: 6,
    logo: '/images/tokens/usdc.svg',
    legacyToken: 'USDC',
  },
  TSLA: {
    key: 'TSLA',
    symbol: 'TSLA',
    name: 'Tesla',
    originChainId: 46630,
    decimals: 18,
    logo: '/images/tokens/tsla.png',
  },
  RH_ETH: {
    key: 'RH_ETH',
    symbol: 'ETH',
    name: 'Ether · Robinhood origin',
    originChainId: 46630,
    decimals: 18,
    logo: '/images/tokens/eth.svg',
  },
};
export interface BridgeRoute {
  id: BridgeRouteId;
  source: BridgeNetwork;
  destination: BridgeNetwork;
  engine: 'LEGACY' | 'RH';
  assets: readonly BridgeAssetKey[];
}
export const BRIDGE_ROUTES: readonly BridgeRoute[] = [
  {
    id: 'SEPOLIA_TO_GOLIATH',
    source: BridgeNetwork.SEPOLIA,
    destination: BridgeNetwork.GOLIATH,
    engine: 'LEGACY',
    assets: ['SEPOLIA_ETH', 'SEPOLIA_XCN'],
  },
  {
    id: 'GOLIATH_TO_SEPOLIA',
    source: BridgeNetwork.GOLIATH,
    destination: BridgeNetwork.SEPOLIA,
    engine: 'LEGACY',
    assets: ['SEPOLIA_ETH', 'SEPOLIA_XCN'],
  },
  {
    id: 'RH_TO_ONYX',
    source: BridgeNetwork.ROBINHOOD,
    destination: BridgeNetwork.GOLIATH,
    engine: 'RH',
    assets: ['TSLA', 'RH_ETH'],
  },
  {
    id: 'ONYX_TO_RH',
    source: BridgeNetwork.GOLIATH,
    destination: BridgeNetwork.ROBINHOOD,
    engine: 'RH',
    assets: ['TSLA', 'RH_ETH'],
  },
];
export interface BridgeSelection {
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedAssetKey: BridgeAssetKey;
  inputAmount: string;
  recipient: string | null;
}
export const DEFAULT_BRIDGE_SELECTION: BridgeSelection = {
  originNetwork: BridgeNetwork.SEPOLIA,
  destinationNetwork: BridgeNetwork.GOLIATH,
  selectedAssetKey: 'SEPOLIA_ETH',
  inputAmount: '',
  recipient: null,
};
export const routeFor = (source: unknown, destination: unknown, rhEnabled = true): BridgeRoute | undefined =>
  BRIDGE_ROUTES.find(
    (r) => r.source === source && r.destination === destination && (rhEnabled || r.engine === 'LEGACY')
  );
export const networksForSource = (source: BridgeNetwork, rhEnabled: boolean): BridgeNetwork[] =>
  BRIDGE_ROUTES.filter((r) => r.source === source && (rhEnabled || r.engine === 'LEGACY')).map((r) => r.destination);
export const legacyAssetKey = (token: unknown): BridgeAssetKey | undefined =>
  token === 'ETH' ? 'SEPOLIA_ETH' : token === 'XCN' ? 'SEPOLIA_XCN' : token === 'USDC' ? 'SEPOLIA_USDC' : undefined;

// The Redux slice is hydrated from storage. Never let unchecked stored endpoints reach an engine.
export function normalizeBridgeSelection(value: unknown, rhEnabled = true): BridgeSelection {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BRIDGE_SELECTION };
  const row = value as Partial<BridgeSelection> & { selectedToken?: unknown };
  const route = routeFor(row.originNetwork, row.destinationNetwork, rhEnabled);
  const key = row.selectedAssetKey ?? legacyAssetKey(row.selectedToken);
  if (!route || !key || !route.assets.includes(key)) return { ...DEFAULT_BRIDGE_SELECTION };
  return {
    originNetwork: route.source,
    destinationNetwork: route.destination,
    selectedAssetKey: key,
    inputAmount: typeof row.inputAmount === 'string' ? row.inputAmount : '',
    recipient: typeof row.recipient === 'string' ? row.recipient : null,
  };
}
export function changeBridgePair(
  form: BridgeSelection,
  source: BridgeNetwork,
  destination: BridgeNetwork
): BridgeSelection {
  const route = routeFor(source, destination);
  if (!route) return form;
  const selectedAssetKey = route.assets.includes(form.selectedAssetKey) ? form.selectedAssetKey : route.assets[0];
  return {
    ...form,
    originNetwork: source,
    destinationNetwork: destination,
    selectedAssetKey,
    inputAmount: selectedAssetKey === form.selectedAssetKey ? form.inputAmount : '',
  };
}
