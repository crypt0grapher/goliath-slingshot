// Explicit public configuration for the Robinhood testnet <-> Onyx testnet TSLA lane.
// Only the feature flag is read from the build environment; every address, chain id,
// RPC, explorer and API origin below is a reviewed public constant (task 008 manifest
// and task 005 frozen API v1), never an implicit .env value.
import deployment from './deployment.json';
import { ONYX_TESTNET_CHAIN_ID, RH_TESTNET_CHAIN_ID } from '../../constants/rhBridge';

export const RH_ROUTE = '/bridge/robinhood-testnet';
export const featureEnabled = (value?: string): boolean => value === 'true';
export const RH_TESTNET_BRIDGE_ENABLED = featureEnabled(process.env.REACT_APP_RH_TESTNET_BRIDGE_ENABLED);

// Frozen API v1: configure the ORIGIN only; the client appends /api/v1/rh/... itself
// (frontend-path-map.v1.json "convention").
export const RH_API_ORIGIN = 'https://bridgeapi.testnet.onyx.org';
export const RH_API_CONTRACT_VERSION = '1.0.0';
// rh-stock-bridge-abi-<escrow ABI sha256[0:6]><minter ABI sha256[0:6]> (contracts/abi/provenance.json).
export const RH_ABI_VERSION = 'rh-stock-bridge-abi-12fc53612bcf';
export const RH_ASSET_ID = 'TSLA';

export interface LaneBinding {
  readonly rhChainId: typeof RH_TESTNET_CHAIN_ID;
  readonly onyxChainId: typeof ONYX_TESTNET_CHAIN_ID;
  readonly assetId: string;
  readonly symbol: string;
  readonly decimals: number;
  // Lowercase 0x addresses.
  readonly token: string;
  readonly escrow: string;
  readonly wrapper: string;
  readonly minter: string;
  readonly kind?: 'ERC20' | 'NATIVE';
  readonly binding?: { readonly assetId: string; readonly profileSha256: string; readonly profileVersion: 1 | 2; readonly abiVersion: string };
}

if (
  deployment.chains.robinhood.chainId !== RH_TESTNET_CHAIN_ID ||
  deployment.chains.onyx.chainId !== ONYX_TESTNET_CHAIN_ID
) {
  throw new Error('RH_DEPLOYMENT_CHAIN_MISMATCH');
}

export const RH_LANE: LaneBinding = Object.freeze({
  rhChainId: RH_TESTNET_CHAIN_ID,
  onyxChainId: ONYX_TESTNET_CHAIN_ID,
  assetId: RH_ASSET_ID,
  symbol: deployment.token.symbol,
  decimals: deployment.token.decimals,
  token: deployment.token.address.toLowerCase(),
  escrow: deployment.escrow.address.toLowerCase(),
  wrapper: deployment.wrapper.address.toLowerCase(),
  minter: deployment.minter.address.toLowerCase(),
});

// Keyless public RPCs (read-only use in the browser) and explorers.
export const RH_RPC_URLS: Readonly<Record<number, string>> = Object.freeze({
  [RH_TESTNET_CHAIN_ID]: deployment.chains.robinhood.rpc,
  [ONYX_TESTNET_CHAIN_ID]: deployment.chains.onyx.rpc,
});
export const RH_EXPLORERS: Readonly<Record<number, string>> = Object.freeze({
  [RH_TESTNET_CHAIN_ID]: deployment.chains.robinhood.explorer,
  [ONYX_TESTNET_CHAIN_ID]: deployment.chains.onyx.explorer,
});
// Hedera-native Onyx transaction ids resolve only on the validators explorer
// (same rule as getExplorerTxUrl in constants/bridge/networks.ts).
export const ONYX_NATIVE_TX_EXPLORER = 'https://validators.testnet.onyx.org/testnet/transaction';

// EIP-3085 metadata for wallet_addEthereumChain after a 4902 switch error.
export interface AddChainParameter {
  readonly chainId: string;
  readonly chainName: string;
  readonly nativeCurrency: Readonly<{ name: string; symbol: string; decimals: number }>;
  readonly rpcUrls: readonly string[];
  readonly blockExplorerUrls: readonly string[];
}
export const RH_WALLET_NETWORKS: Readonly<Record<number, AddChainParameter>> = Object.freeze({
  [RH_TESTNET_CHAIN_ID]: Object.freeze({
    chainId: '0xb626',
    chainName: 'Robinhood Chain Testnet',
    nativeCurrency: Object.freeze({ name: 'Ether', symbol: 'ETH', decimals: 18 }),
    rpcUrls: Object.freeze([deployment.chains.robinhood.rpc]),
    blockExplorerUrls: Object.freeze([deployment.chains.robinhood.explorer]),
  }),
  [ONYX_TESTNET_CHAIN_ID]: Object.freeze({
    chainId: '0x22c5',
    chainName: 'Onyx Testnet',
    nativeCurrency: Object.freeze({ name: 'Onyxcoin', symbol: 'XCN', decimals: 18 }),
    rpcUrls: Object.freeze([deployment.chains.onyx.rpc]),
    blockExplorerUrls: Object.freeze([deployment.chains.onyx.explorer]),
  }),
});

// Spenders that must never receive an RH-lane approval: the wrapper itself and the
// legacy Sepolia-lane BridgeMint on Onyx (public REACT_APP_BRIDGE_GOLIATH_ADDRESS).
export const RH_FORBIDDEN_SPENDERS: readonly string[] = Object.freeze([
  RH_LANE.wrapper,
  '0x2c1d218b5a97a26d144ffd12d5c813590f93ffeb',
]);

// Polling and freshness bounds for API state.
export const RH_POLL_MS = 10000;
export const RH_POLL_BACKOFF_MS = 30000;
export const RH_STATE_MAX_AGE_MS = 120000;
export const RH_CLOCK_SKEW_MS = 60000;
// A pending transaction whose nonce was consumed without a receipt is treated as replaced or
// dropped only after this grace period (RPC propagation).
export const RH_REPLACEMENT_GRACE_MS = 120000;
// A pending record without any receipt may be dismissed by the user after this long.
export const RH_STALE_PENDING_MS = 30 * 60 * 1000;
// Governance ceiling on the exit fee from the task 008 manifest (maxFeeBps, minterEntry.maxMinFee).
export const RH_MANIFEST_FEE_CEILING = Object.freeze({
  maxFeeBps: Number(deployment.maxFeeBps),
  maxMinFee: deployment.minterEntry.maxMinFee,
});
