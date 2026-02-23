// Migration configuration types
export interface MigrationConfig {
  // Feature flags
  migrationEnabled: boolean;
  claimEnabled: boolean;
  statsEnabled: boolean;
  historyEnabled: boolean;

  // Contract addresses (Sepolia testnet)
  sepoliaXcnAddress: string;
  sepoliaStakingContract: string;

  // Migration deadline (ISO date string, undefined if not set)
  migrationDeadline: string | undefined;

  // Polling intervals (milliseconds)
  statsPollMs: number;
  statusPollMs: number;
}

/**
 * Parse an integer from an env var string, returning the fallback if the value
 * is missing or not a valid integer.
 */
function parseIntWithFallback(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function loadMigrationConfig(): MigrationConfig {
  return {
    // Feature flags - only exact string "true" enables the feature
    migrationEnabled: process.env.REACT_APP_MIGRATION_ENABLED === 'true',
    claimEnabled: process.env.REACT_APP_MIGRATION_CLAIM_ENABLED === 'true',
    statsEnabled: process.env.REACT_APP_MIGRATION_STATS_ENABLED === 'true',
    historyEnabled: process.env.REACT_APP_MIGRATION_HISTORY_ENABLED === 'true',

    // Contract addresses with defaults
    sepoliaXcnAddress:
      process.env.REACT_APP_SEPOLIA_XCN_ADDRESS || '0x7a8adc542A35c93da263A188367F4bF4c445B8E9',
    sepoliaStakingContract:
      process.env.REACT_APP_SEPOLIA_STAKING_CONTRACT || '0xc50B664BA11F5558b8FF7358bb7C576542655D54',

    // Deadline - undefined when empty or not set
    migrationDeadline: process.env.REACT_APP_MIGRATION_DEADLINE || undefined,

    // Polling intervals with numeric fallbacks
    statsPollMs: parseIntWithFallback(process.env.REACT_APP_MIGRATION_STATS_POLL_MS, 60000),
    statusPollMs: parseIntWithFallback(process.env.REACT_APP_MIGRATION_STATUS_POLL_MS, 3000),
  };
}

export const migrationConfig = loadMigrationConfig();
