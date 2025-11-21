import { ChainId, Currency, CurrencyAmount, ETHER, Token, TokenAmount, WETH } from '@uniswap/sdk';
import { WXCN } from '../constants';

export function wrappedCurrency(currency: Currency | undefined, chainId: ChainId | undefined): Token | undefined {
  // For Goliath testnet, use WXCN instead of WETH
  if (chainId === ChainId.GOLIATH_TESTNET && currency === ETHER) {
    return WXCN;
  }
  return chainId && currency === ETHER ? WETH[chainId] : currency instanceof Token ? currency : undefined;
}

export function wrappedCurrencyAmount(
  currencyAmount: CurrencyAmount | undefined,
  chainId: ChainId | undefined
): TokenAmount | undefined {
  const token = currencyAmount && chainId ? wrappedCurrency(currencyAmount.currency, chainId) : undefined;
  return token && currencyAmount ? new TokenAmount(token, currencyAmount.raw) : undefined;
}

export function unwrappedToken(token: Token): Currency {
  // For Goliath testnet, check if it's WXCN
  if (token.chainId === ChainId.GOLIATH_TESTNET && token.equals(WXCN)) {
    return ETHER;
  }
  // For other chains, check against WETH
  if (token.chainId !== ChainId.GOLIATH_TESTNET && WETH[token.chainId] && token.equals(WETH[token.chainId])) {
    return ETHER;
  }
  return token;
}
