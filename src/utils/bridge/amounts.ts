import { ethers } from 'ethers';
import {
  BridgeTokenSymbol,
  getTokenConfigForChain,
  getGasBuffer,
} from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';

/**
 * Parse human-readable amount to atomic units for a token
 */
export function parseAmount(
  amount: string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): bigint {
  const config = getTokenConfigForChain(token, network);
  const parsed = ethers.utils.parseUnits(amount, config.decimals);
  return parsed.toBigInt();
}

/**
 * Format atomic units to human-readable string
 */
export function formatAmount(
  atomic: bigint | string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork,
  displayDecimals: number = 6
): string {
  const config = getTokenConfigForChain(token, network);
  const formatted = ethers.utils.formatUnits(atomic.toString(), config.decimals);

  // Limit display decimals
  const parts = formatted.split('.');
  if (parts.length === 2 && parts[1].length > displayDecimals) {
    return `${parts[0]}.${parts[1].slice(0, displayDecimals)}`;
  }
  return formatted;
}

/**
 * Calculate max spendable amount (balance minus gas buffer for native assets)
 */
export function calculateMaxSpendable(
  balance: bigint,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): bigint {
  const gasBuffer = getGasBuffer(token, network);
  if (gasBuffer === '0') {
    return balance;
  }

  const config = getTokenConfigForChain(token, network);
  const bufferAtomic = ethers.utils.parseUnits(gasBuffer, config.decimals).toBigInt();

  const maxSpendable = balance - bufferAtomic;
  return maxSpendable > BigInt(0) ? maxSpendable : BigInt(0);
}

/**
 * Validate amount string is a valid number
 */
export function isValidAmountString(amount: string): boolean {
  if (!amount || amount.trim() === '') return false;

  // Check for valid decimal number format (accepting both dot and comma as decimal separator)
  const regex = /^\d*[.,]?\d*$/;
  if (!regex.test(amount)) return false;

  // Ensure it's not just a dot or comma
  if (amount === '.' || amount === ',') return false;

  // Ensure there's at least one digit
  if (!/\d/.test(amount)) return false;

  return true;
}

/**
 * Compare two amounts (returns -1, 0, or 1)
 */
export function compareAmounts(
  a: string,
  b: string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): number {
  const aAtomic = parseAmount(a || '0', token, network);
  const bAtomic = parseAmount(b || '0', token, network);

  if (aAtomic < bAtomic) return -1;
  if (aAtomic > bAtomic) return 1;
  return 0;
}

/**
 * Check if amount is greater than zero
 */
export function isPositiveAmount(amount: string): boolean {
  if (!isValidAmountString(amount)) return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

/**
 * Sanitize amount input string
 */
export function sanitizeAmountInput(input: string): string {
  // Convert commas to dots (for locales using comma as decimal separator)
  let sanitized = input.replace(/,/g, '.');

  // Remove any non-numeric characters except decimal point
  sanitized = sanitized.replace(/[^0-9.]/g, '');

  // Ensure only one decimal point
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('');
  }

  return sanitized;
}
