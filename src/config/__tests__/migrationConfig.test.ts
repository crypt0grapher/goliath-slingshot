// Tests for migrationConfig
// Validates typed accessors, boolean parsing, numeric parsing, and fallback defaults

describe('migrationConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module registry so each test gets a fresh config load
    jest.resetModules();
    // Clone the original env to avoid cross-test contamination
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('default values (no env vars set)', () => {
    beforeEach(() => {
      // Clear all migration-related env vars
      delete process.env.REACT_APP_MIGRATION_ENABLED;
      delete process.env.REACT_APP_MIGRATION_CLAIM_ENABLED;
      delete process.env.REACT_APP_MIGRATION_STATS_ENABLED;
      delete process.env.REACT_APP_MIGRATION_HISTORY_ENABLED;
      delete process.env.REACT_APP_SEPOLIA_XCN_ADDRESS;
      delete process.env.REACT_APP_SEPOLIA_STAKING_CONTRACT;
      delete process.env.REACT_APP_MIGRATION_DEADLINE;
      delete process.env.REACT_APP_MIGRATION_STATS_POLL_MS;
      delete process.env.REACT_APP_MIGRATION_STATUS_POLL_MS;
    });

    it('should default all feature flags to false', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationEnabled).toBe(false);
      expect(migrationConfig.claimEnabled).toBe(false);
      expect(migrationConfig.statsEnabled).toBe(false);
      expect(migrationConfig.historyEnabled).toBe(false);
    });

    it('should provide default Sepolia XCN address', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.sepoliaXcnAddress).toBe('0x7a8adc542A35c93da263A188367F4bF4c445B8E9');
    });

    it('should provide default Sepolia staking contract address', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.sepoliaStakingContract).toBe('0xc50B664BA11F5558b8FF7358bb7C576542655D54');
    });

    it('should default migrationDeadline to undefined when not set', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationDeadline).toBeUndefined();
    });

    it('should default statsPollMs to 60000', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.statsPollMs).toBe(60000);
    });

    it('should default statusPollMs to 3000', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.statusPollMs).toBe(3000);
    });
  });

  describe('boolean parsing', () => {
    it('should parse "true" string to boolean true for all flags', () => {
      process.env.REACT_APP_MIGRATION_ENABLED = 'true';
      process.env.REACT_APP_MIGRATION_CLAIM_ENABLED = 'true';
      process.env.REACT_APP_MIGRATION_STATS_ENABLED = 'true';
      process.env.REACT_APP_MIGRATION_HISTORY_ENABLED = 'true';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationEnabled).toBe(true);
      expect(migrationConfig.claimEnabled).toBe(true);
      expect(migrationConfig.statsEnabled).toBe(true);
      expect(migrationConfig.historyEnabled).toBe(true);
    });

    it('should parse "false" string to boolean false', () => {
      process.env.REACT_APP_MIGRATION_ENABLED = 'false';
      process.env.REACT_APP_MIGRATION_CLAIM_ENABLED = 'false';
      process.env.REACT_APP_MIGRATION_STATS_ENABLED = 'false';
      process.env.REACT_APP_MIGRATION_HISTORY_ENABLED = 'false';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationEnabled).toBe(false);
      expect(migrationConfig.claimEnabled).toBe(false);
      expect(migrationConfig.statsEnabled).toBe(false);
      expect(migrationConfig.historyEnabled).toBe(false);
    });

    it('should treat any non-"true" string as false', () => {
      process.env.REACT_APP_MIGRATION_ENABLED = 'yes';
      process.env.REACT_APP_MIGRATION_CLAIM_ENABLED = '1';
      process.env.REACT_APP_MIGRATION_STATS_ENABLED = 'TRUE';
      process.env.REACT_APP_MIGRATION_HISTORY_ENABLED = '';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationEnabled).toBe(false);
      expect(migrationConfig.claimEnabled).toBe(false);
      expect(migrationConfig.statsEnabled).toBe(false);
      expect(migrationConfig.historyEnabled).toBe(false);
    });
  });

  describe('address overrides', () => {
    it('should use custom Sepolia XCN address from env', () => {
      process.env.REACT_APP_SEPOLIA_XCN_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.sepoliaXcnAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });

    it('should use custom Sepolia staking contract from env', () => {
      process.env.REACT_APP_SEPOLIA_STAKING_CONTRACT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.sepoliaStakingContract).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    });
  });

  describe('migration deadline', () => {
    it('should parse a valid ISO date string', () => {
      process.env.REACT_APP_MIGRATION_DEADLINE = '2026-06-30T23:59:59Z';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationDeadline).toBe('2026-06-30T23:59:59Z');
    });

    it('should return undefined for empty string', () => {
      process.env.REACT_APP_MIGRATION_DEADLINE = '';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.migrationDeadline).toBeUndefined();
    });
  });

  describe('numeric parsing', () => {
    it('should parse custom statsPollMs from env', () => {
      process.env.REACT_APP_MIGRATION_STATS_POLL_MS = '30000';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.statsPollMs).toBe(30000);
    });

    it('should parse custom statusPollMs from env', () => {
      process.env.REACT_APP_MIGRATION_STATUS_POLL_MS = '5000';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.statusPollMs).toBe(5000);
    });

    it('should fall back to defaults for non-numeric strings', () => {
      process.env.REACT_APP_MIGRATION_STATS_POLL_MS = 'not-a-number';
      process.env.REACT_APP_MIGRATION_STATUS_POLL_MS = 'abc';

      const { migrationConfig } = require('../migrationConfig');
      expect(migrationConfig.statsPollMs).toBe(60000);
      expect(migrationConfig.statusPollMs).toBe(3000);
    });
  });

  describe('type safety', () => {
    it('should export all expected keys', () => {
      const { migrationConfig } = require('../migrationConfig');
      const expectedKeys = [
        'migrationEnabled',
        'claimEnabled',
        'statsEnabled',
        'historyEnabled',
        'sepoliaXcnAddress',
        'sepoliaStakingContract',
        'migrationDeadline',
        'statsPollMs',
        'statusPollMs',
      ];
      expectedKeys.forEach((key) => {
        expect(migrationConfig).toHaveProperty(key);
      });
    });

    it('should return correct types for all fields', () => {
      const { migrationConfig } = require('../migrationConfig');
      expect(typeof migrationConfig.migrationEnabled).toBe('boolean');
      expect(typeof migrationConfig.claimEnabled).toBe('boolean');
      expect(typeof migrationConfig.statsEnabled).toBe('boolean');
      expect(typeof migrationConfig.historyEnabled).toBe('boolean');
      expect(typeof migrationConfig.sepoliaXcnAddress).toBe('string');
      expect(typeof migrationConfig.sepoliaStakingContract).toBe('string');
      expect(typeof migrationConfig.statsPollMs).toBe('number');
      expect(typeof migrationConfig.statusPollMs).toBe('number');
    });
  });
});
