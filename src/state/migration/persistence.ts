import { getMigrationStorageKey } from 'constants/migration';

/**
 * Shape of the minimal data persisted to localStorage for resuming
 * a pending migration after page refresh. Only raw identifiers are
 * stored -- never derived step state (per ADR-2).
 */
export interface PendingMigration {
  originTxHash: string;
  intentId: string;
  stakeOnGoliath: boolean;
  timestamp: number;
}

/** Default staleness threshold: 48 hours in milliseconds. */
export const STALENESS_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Type-guard that validates a parsed value has the expected shape of
 * a PendingMigration. Returns false for any malformed or incomplete data.
 */
function isPendingMigration(value: unknown): value is PendingMigration {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.originTxHash === 'string' &&
    typeof obj.intentId === 'string' &&
    typeof obj.stakeOnGoliath === 'boolean' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Persist a pending migration entry for the given wallet address.
 * The current timestamp is automatically appended.
 *
 * @param address  Ethereum address (will be lowercased for the storage key)
 * @param data     Migration identifiers to persist (timestamp is added automatically)
 */
export function savePendingMigration(
  address: string,
  data: Omit<PendingMigration, 'timestamp'>
): void {
  try {
    const key = getMigrationStorageKey(address);
    const entry: PendingMigration = {
      originTxHash: data.originTxHash,
      intentId: data.intentId,
      stakeOnGoliath: data.stakeOnGoliath,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage may be full or unavailable (e.g. private browsing).
    // Fail silently -- the migration flow can still work, it just won't
    // survive a page refresh.
  }
}

/**
 * Load a previously saved pending migration for the given wallet address.
 *
 * Returns `null` when:
 * - No entry exists for this address
 * - The stored JSON is malformed or missing required fields
 * - The entry is older than `stalenessMs` (auto-cleared)
 * - localStorage is unavailable
 *
 * @param address     Ethereum address (will be lowercased for the storage key)
 * @param stalenessMs Optional staleness threshold in ms (default 48 hours)
 */
export function loadPendingMigration(
  address: string,
  stalenessMs: number = STALENESS_THRESHOLD_MS
): PendingMigration | null {
  try {
    const key = getMigrationStorageKey(address);
    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isPendingMigration(parsed)) return null;

    // Staleness check: if the entry is older than the threshold, discard it.
    const age = Date.now() - parsed.timestamp;
    if (age > stalenessMs) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Remove the pending migration entry for the given wallet address.
 *
 * @param address  Ethereum address (will be lowercased for the storage key)
 */
export function clearPendingMigration(address: string): void {
  try {
    const key = getMigrationStorageKey(address);
    localStorage.removeItem(key);
  } catch {
    // Fail silently when localStorage is unavailable.
  }
}
