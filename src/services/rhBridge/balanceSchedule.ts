// SPDX-License-Identifier: Apache-2.0
// Display-only balance scheduling. It never signs, approves, or refreshes action authority.
export const BALANCE_POLL_MS = 10_000;
export const MANUAL_COOLDOWN_MS = 2_000;
export const RECEIPT_CHECK_COUNT = 5;
export const RECEIPT_WINDOW_MS = 10_000;

export function balanceDelay(failures: number): number {
  if (failures <= 0) return BALANCE_POLL_MS;
  return Math.min(60_000, BALANCE_POLL_MS * 2 ** (failures - 1));
}

export function canStartManualRefresh(lastStartedAtMs: number | null, nowMs: number, inFlight: boolean): boolean {
  if (inFlight) return false;
  if (lastStartedAtMs === null) return true;
  return nowMs - lastStartedAtMs >= MANUAL_COOLDOWN_MS;
}

/** Five lightweight checks whose last start is still inside the ten-second window. */
export function receiptCheckOffsets(): readonly number[] {
  return [0, 2_000, 4_000, 6_000, 8_000];
}

export function shouldPollBalances(documentVisible: boolean): boolean {
  return documentVisible;
}
