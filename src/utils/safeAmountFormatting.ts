import { CurrencyAmount, TokenAmount, Price } from '@uniswap/sdk';

/**
 * Minimum threshold for displaying amounts - values below this are considered "dust"
 * 1e-12 is approximately the smallest value that makes sense for most tokens
 */
export const DUST_THRESHOLD = 1e-12;

/**
 * Display string for dust amounts that are too small to show meaningfully
 */
export const DUST_DISPLAY = '< 0.000000000001';

/**
 * Checks if a currency amount is considered "dust" (too small to be meaningful)
 * @param amount The currency amount to check
 * @returns true if the amount is below the dust threshold
 */
export function isDustAmount(amount: CurrencyAmount | TokenAmount | undefined): boolean {
  if (!amount) return true;

  try {
    const exactValue = amount.toExact();
    const numValue = parseFloat(exactValue);
    return !isFinite(numValue) || isNaN(numValue) || numValue < DUST_THRESHOLD;
  } catch {
    return true;
  }
}

/**
 * Safely formats a currency amount using toSignificant
 * Handles edge cases like extremely small values, NaN, and exceptions
 * @param amount The currency amount to format
 * @param sigFigs Number of significant figures (default: 6)
 * @param fallback Fallback string if formatting fails (default: '0')
 * @returns Formatted string representation of the amount
 */
export function safeToSignificant(
  amount: CurrencyAmount | TokenAmount | Price | undefined | null,
  sigFigs: number = 6,
  fallback: string = '0'
): string {
  if (!amount) return fallback;

  try {
    // For CurrencyAmount/TokenAmount, check for dust first
    if (amount instanceof CurrencyAmount || (amount as any)?.raw) {
      const exactValue = (amount as CurrencyAmount).toExact();
      const numValue = parseFloat(exactValue);

      // Handle NaN, Infinity, and negative values
      if (!isFinite(numValue) || isNaN(numValue) || numValue < 0) {
        return fallback;
      }

      // Handle dust amounts
      if (numValue < DUST_THRESHOLD && numValue > 0) {
        return DUST_DISPLAY;
      }

      // Handle zero
      if (numValue === 0) {
        return '0';
      }
    }

    const result = amount.toSignificant(sigFigs);

    // Validate the result doesn't contain scientific notation
    if (result.includes('e') || result.includes('E')) {
      const numValue = parseFloat(result);
      if (numValue < DUST_THRESHOLD && numValue > 0) {
        return DUST_DISPLAY;
      }
      // Convert scientific notation to decimal string
      return formatScientificNotation(result, sigFigs);
    }

    return result;
  } catch (error) {
    console.warn('safeToSignificant failed:', error);
    return fallback;
  }
}

/**
 * Safely formats a currency amount using toExact
 * Handles edge cases like extremely small values that produce scientific notation
 * @param amount The currency amount to format
 * @param fallback Fallback string if formatting fails (default: '0')
 * @returns Exact string representation of the amount, or fallback
 */
export function safeToExact(
  amount: CurrencyAmount | TokenAmount | undefined | null,
  fallback: string = '0'
): string {
  if (!amount) return fallback;

  try {
    const exactValue = amount.toExact();
    const numValue = parseFloat(exactValue);

    // Handle NaN, Infinity, and negative values
    if (!isFinite(numValue) || isNaN(numValue) || numValue < 0) {
      return fallback;
    }

    // Handle dust amounts - return 0 instead of the tiny value
    if (numValue < DUST_THRESHOLD && numValue > 0) {
      return fallback;
    }

    // Check for scientific notation and convert if needed
    if (exactValue.includes('e') || exactValue.includes('E')) {
      // Don't use values that are too small
      if (numValue < DUST_THRESHOLD) {
        return fallback;
      }
      return formatScientificNotation(exactValue, 18);
    }

    return exactValue;
  } catch (error) {
    console.warn('safeToExact failed:', error);
    return fallback;
  }
}

/**
 * Safely formats a currency amount for display with balance prefix
 * @param amount The currency amount to format
 * @param prefix The prefix string (default: 'Balance: ')
 * @param sigFigs Number of significant figures (default: 7)
 * @returns Formatted balance string
 */
export function safeBalanceDisplay(
  amount: CurrencyAmount | TokenAmount | undefined | null,
  prefix: string = 'Balance: ',
  sigFigs: number = 7
): string {
  if (!amount) return ' -';
  return prefix + safeToSignificant(amount, sigFigs, '0');
}

/**
 * Converts a scientific notation string to decimal notation
 * @param value The value string (may be in scientific notation)
 * @param maxDecimals Maximum decimal places to include
 * @returns Decimal string representation
 */
function formatScientificNotation(value: string, maxDecimals: number): string {
  try {
    const num = parseFloat(value);
    if (!isFinite(num) || isNaN(num)) {
      return '0';
    }

    // For very small numbers, return dust display
    if (num < DUST_THRESHOLD && num > 0) {
      return DUST_DISPLAY;
    }

    // Convert to fixed decimal notation
    const fixed = num.toFixed(maxDecimals);

    // Remove trailing zeros and unnecessary decimal point
    let result = fixed.replace(/\.?0+$/, '');

    // If we stripped everything after the decimal, just return the integer part
    if (result === '' || result === '-') {
      return '0';
    }

    return result;
  } catch {
    return '0';
  }
}

/**
 * Validates if a string value is safe to use as input
 * Returns false for scientific notation, NaN, Infinity, etc.
 * @param value The string value to validate
 * @returns true if the value is safe for input
 */
export function isValidInputValue(value: string): boolean {
  if (!value || value === '') return true;

  // Reject scientific notation
  if (value.includes('e') || value.includes('E')) {
    return false;
  }

  // Check if it's a valid decimal number
  const numValue = parseFloat(value);
  if (!isFinite(numValue) || isNaN(numValue)) {
    return false;
  }

  // Reject extremely long decimal strings (more than 20 decimals)
  const parts = value.split('.');
  if (parts.length === 2 && parts[1].length > 20) {
    return false;
  }

  return true;
}

/**
 * Sanitizes an input value by handling edge cases
 * Converts scientific notation to decimal, truncates long decimals
 * @param value The input value to sanitize
 * @param maxDecimals Maximum decimal places (default: 18)
 * @returns Sanitized value string
 */
export function sanitizeInputValue(value: string, maxDecimals: number = 18): string {
  if (!value || value === '') return '';

  // Handle scientific notation
  if (value.includes('e') || value.includes('E')) {
    const numValue = parseFloat(value);
    if (!isFinite(numValue) || isNaN(numValue)) {
      return '0';
    }
    if (numValue < DUST_THRESHOLD) {
      return '0';
    }
    return formatScientificNotation(value, maxDecimals);
  }

  // Truncate excessive decimals
  const parts = value.split('.');
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    return `${parts[0]}.${parts[1].substring(0, maxDecimals)}`;
  }

  return value;
}
