import { BigNumber } from '@ethersproject/bignumber';
import { stakingConfig } from '../config/stakingConfig';

// Contract addresses by chain
export const STAKED_XCN_ADDRESS: { [chainId: number]: string } = {
  8901: process.env.REACT_APP_STXCN_ADDRESS || '',
};

// Math constants
export const RAY = BigNumber.from(10).pow(27);
export const WAD = BigNumber.from(10).pow(18);
export const BPS_BASE = 10000;
export const SECONDS_PER_YEAR = 31536000;

// Native token decimals — RPC and multicall3 both return 18-dec values on chain 8901
// since the multicall3 rollout (2026-02-03). No frontend scaling is needed.
export const NATIVE_DECIMALS = 18;

// stXCN token metadata
export const STXCN_DECIMALS = 18;
export const STXCN_SYMBOL = 'stXCN';
export const STXCN_NAME = 'Staked XCN';

// Polling intervals (sourced from config)
export const BALANCE_POLL_INTERVAL_MS = stakingConfig.balancePollMs;
export const PROTOCOL_DATA_POLL_INTERVAL_MS = stakingConfig.protocolPollMs;

// UI constants
export const ANIMATION_DECIMAL_PLACES = 1;
export const BLOCKSCOUT_BASE_URL = 'https://testnet.explorer.goliath.net';
