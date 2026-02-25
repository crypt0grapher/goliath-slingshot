export interface StakingConfig {
  stakingEnabled: boolean;
  stxcnAddress: string;
  balancePollMs: number;
  protocolPollMs: number;
}

function parseIntWithFallback(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export const stakingConfig: StakingConfig = {
  stakingEnabled: process.env.REACT_APP_STAKING_ENABLED === 'true',
  stxcnAddress: process.env.REACT_APP_STXCN_ADDRESS || '',
  balancePollMs: parseIntWithFallback(process.env.REACT_APP_STAKING_BALANCE_POLL_MS, 15000),
  protocolPollMs: parseIntWithFallback(process.env.REACT_APP_STAKING_PROTOCOL_POLL_MS, 30000),
};
