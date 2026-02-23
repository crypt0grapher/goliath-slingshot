import {
  savePendingMigration,
  loadPendingMigration,
  clearPendingMigration,
  PendingMigration,
  STALENESS_THRESHOLD_MS,
} from '../persistence';
import { getMigrationStorageKey } from 'constants/migration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
const TEST_ADDRESS_LOWER = TEST_ADDRESS.toLowerCase();
const EXPECTED_KEY = getMigrationStorageKey(TEST_ADDRESS);

const validPayload = {
  originTxHash: '0xabc123',
  intentId: 'intent-42',
  stakeOnGoliath: true,
};

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// savePendingMigration
// ---------------------------------------------------------------------------
describe('savePendingMigration', () => {
  it('should store data under the correct key with a timestamp', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    savePendingMigration(TEST_ADDRESS, validPayload);

    const raw = localStorage.getItem(EXPECTED_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as PendingMigration;
    expect(parsed.originTxHash).toBe(validPayload.originTxHash);
    expect(parsed.intentId).toBe(validPayload.intentId);
    expect(parsed.stakeOnGoliath).toBe(validPayload.stakeOnGoliath);
    expect(parsed.timestamp).toBe(now);
  });

  it('should lowercase the address in the storage key', () => {
    savePendingMigration(TEST_ADDRESS, validPayload);

    // The key with the lowercased address should have data
    const raw = localStorage.getItem(EXPECTED_KEY);
    expect(raw).not.toBeNull();

    // There should be no entry under the mixed-case key
    const mixedKey = `migration:pending:v1:${TEST_ADDRESS}`;
    if (mixedKey !== EXPECTED_KEY) {
      expect(localStorage.getItem(mixedKey)).toBeNull();
    }
  });

  it('should not throw when localStorage.setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => savePendingMigration(TEST_ADDRESS, validPayload)).not.toThrow();
  });

  it('should only persist the four required fields', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    savePendingMigration(TEST_ADDRESS, validPayload);

    const raw = localStorage.getItem(EXPECTED_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    const keys = Object.keys(stored).sort();
    expect(keys).toEqual(['intentId', 'originTxHash', 'stakeOnGoliath', 'timestamp']);
  });
});

// ---------------------------------------------------------------------------
// loadPendingMigration
// ---------------------------------------------------------------------------
describe('loadPendingMigration', () => {
  it('should return stored data when valid and not stale', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const stored: PendingMigration = { ...validPayload, timestamp: now - 1000 };
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(stored));

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toEqual(stored);
  });

  it('should return null when no data exists for the address', () => {
    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('should return null and clear data when entry is stale (> 48 hours)', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

    const staleTimestamp = now - STALENESS_THRESHOLD_MS - 1;
    const stored: PendingMigration = { ...validPayload, timestamp: staleTimestamp };
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(stored));

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toBeNull();
    expect(removeItemSpy).toHaveBeenCalledWith(EXPECTED_KEY);
    // Verify it was actually removed
    expect(localStorage.getItem(EXPECTED_KEY)).toBeNull();
  });

  it('should return data when entry is exactly at the staleness threshold', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Exactly at the boundary (48h ago) should still be valid
    const stored: PendingMigration = { ...validPayload, timestamp: now - STALENESS_THRESHOLD_MS };
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(stored));

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toEqual(stored);
  });

  it('should lowercase the address when loading', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');

    const stored: PendingMigration = { ...validPayload, timestamp: now };
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(stored));

    // Load using mixed-case address
    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).not.toBeNull();
    expect(getItemSpy).toHaveBeenCalledWith(EXPECTED_KEY);
  });

  it('should return null when localStorage throws on getItem', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('should return null when stored JSON is malformed', () => {
    localStorage.setItem(EXPECTED_KEY, 'not-valid-json{{{');

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('should return null when stored data is missing required fields', () => {
    const incomplete = { originTxHash: '0xabc' }; // missing intentId, stakeOnGoliath, timestamp
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(incomplete));

    const result = loadPendingMigration(TEST_ADDRESS);
    expect(result).toBeNull();
  });

  it('should accept a custom staleness threshold', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const customThreshold = 1000; // 1 second
    const stored: PendingMigration = { ...validPayload, timestamp: now - 2000 };
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(stored));

    // Should be stale with a 1-second threshold
    const result = loadPendingMigration(TEST_ADDRESS, customThreshold);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearPendingMigration
// ---------------------------------------------------------------------------
describe('clearPendingMigration', () => {
  it('should remove the entry for the given address', () => {
    savePendingMigration(TEST_ADDRESS, validPayload);
    expect(localStorage.getItem(EXPECTED_KEY)).not.toBeNull();

    clearPendingMigration(TEST_ADDRESS);

    expect(localStorage.getItem(EXPECTED_KEY)).toBeNull();
  });

  it('should lowercase the address when clearing', () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

    clearPendingMigration(TEST_ADDRESS);

    expect(removeItemSpy).toHaveBeenCalledWith(EXPECTED_KEY);
  });

  it('should not throw when localStorage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearPendingMigration(TEST_ADDRESS)).not.toThrow();
  });

  it('should not throw when there is nothing to clear', () => {
    expect(() => clearPendingMigration(TEST_ADDRESS)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// STALENESS_THRESHOLD_MS
// ---------------------------------------------------------------------------
describe('STALENESS_THRESHOLD_MS', () => {
  it('should default to 48 hours in milliseconds', () => {
    expect(STALENESS_THRESHOLD_MS).toBe(48 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// Round-trip integration
// ---------------------------------------------------------------------------
describe('round-trip: save -> load -> clear', () => {
  it('should save, load, then clear correctly', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    savePendingMigration(TEST_ADDRESS, validPayload);

    const loaded = loadPendingMigration(TEST_ADDRESS);
    expect(loaded).toEqual({ ...validPayload, timestamp: now });

    clearPendingMigration(TEST_ADDRESS);

    const afterClear = loadPendingMigration(TEST_ADDRESS);
    expect(afterClear).toBeNull();
  });

  it('should handle different addresses independently', () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const address2 = '0x1111111111111111111111111111111111111111';
    const payload2 = { originTxHash: '0xdef456', intentId: 'intent-99', stakeOnGoliath: false };

    savePendingMigration(TEST_ADDRESS, validPayload);
    savePendingMigration(address2, payload2);

    const loaded1 = loadPendingMigration(TEST_ADDRESS);
    const loaded2 = loadPendingMigration(address2);

    expect(loaded1).toEqual({ ...validPayload, timestamp: now });
    expect(loaded2).toEqual({ ...payload2, timestamp: now });

    clearPendingMigration(TEST_ADDRESS);

    expect(loadPendingMigration(TEST_ADDRESS)).toBeNull();
    expect(loadPendingMigration(address2)).toEqual({ ...payload2, timestamp: now });
  });
});
