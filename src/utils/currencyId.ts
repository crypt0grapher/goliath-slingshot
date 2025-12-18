import { ChainId, Currency, ETHER, Token } from '@uniswap/sdk';

/**
 * Returns a URL-safe identifier for a currency.
 *
 * For native tokens:
 * - On Goliath (chainId 8901): returns 'XCN' (the native token symbol)
 * - On other chains: returns 'ETH'
 *
 * For ERC20 tokens: returns the token contract address
 *
 * @param currency The currency to get an ID for
 * @param chainId Optional chain ID to determine native token symbol
 */
export function currencyId(currency: Currency, chainId?: ChainId): string {
  if (currency === ETHER) {
    // Return 'XCN' for Goliath chain, 'ETH' for others
    return chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';
  }
  if (currency instanceof Token) return currency.address;
  throw new Error('invalid currency');
}

/**
 * Legacy version that always returns 'ETH' for native currency.
 * Use currencyId() with chainId for chain-aware behavior.
 */
export function currencyIdLegacy(currency: Currency): string {
  if (currency === ETHER) return 'ETH';
  if (currency instanceof Token) return currency.address;
  throw new Error('invalid currency');
}

/**
 * Get the display symbol for a currency.
 * On Goliath, shows 'XCN' for the native token instead of 'ETH'.
 *
 * @param currency The currency to get a display symbol for
 * @param chainId The chain ID to determine native token symbol
 * @returns The symbol to display (e.g., 'XCN', 'ETH', 'USDC')
 */
export function getCurrencySymbol(currency: Currency | undefined, chainId: ChainId | undefined): string {
  if (!currency) return '';
  if (currency === ETHER) {
    return chainId === ChainId.GOLIATH_TESTNET ? 'XCN' : 'ETH';
  }
  return currency.symbol || '';
}

/**
 * Get the display name for a currency.
 * On Goliath, shows 'Onyxcoin' for the native token instead of 'Ether'.
 *
 * @param currency The currency to get a display name for
 * @param chainId The chain ID to determine native token name
 * @returns The name to display (e.g., 'Onyxcoin', 'Ether', 'USD Coin')
 */
export function getCurrencyName(currency: Currency | undefined, chainId: ChainId | undefined): string {
  if (!currency) return '';
  if (currency === ETHER) {
    return chainId === ChainId.GOLIATH_TESTNET ? 'Onyxcoin' : 'Ether';
  }
  return currency.name || '';
}
