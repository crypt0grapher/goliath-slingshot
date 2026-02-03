import { Currency, ETHER, Token } from '@uniswap/sdk';
import React, { useMemo } from 'react';
import styled from 'styled-components';

import EthereumLogo from '../../assets/images/ethereum-logo.png';
import useHttpLocations from '../../hooks/useHttpLocations';
import { WrappedTokenInfo } from '../../state/lists/hooks';
import { useActiveWeb3React } from '../../hooks';
import Logo from '../Logo';

const getTokenLogoURL = (address: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`;

// Custom logos for Goliath testnet tokens with local fallbacks
// Format: { address: [primarySource, ...fallbackSources] } or { address: singleSource }
const GOLIATH_TOKEN_LOGOS: { [address: string]: string | string[] } = {
  '0xB939d84698426855C628E45Ef02a4909b23535Fc': 'https://bridge.onyx.org/img/networks/80888.svg', // WXCN
  '0xC8410270bb53f6c99A2EFe6eD3686a8630Efe22B': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png', // USDC
  '0x88b4BC8e5bd74327B5456466F3f30143986cC1f9': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png', // USDT
  '0xa973c5626eEaF7F482439753953e9B28C6aF3674': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png', // ETH
  // BTC - local asset with CDN fallbacks for reliability
  '0x9253587505c3B7E7b9DEE118AE1AcB53eEC0E4b6': [
    '/images/tokens/btc-logo.svg', // Local SVG asset (always available)
    'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=040', // CDN fallback
    'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', // CoinGecko fallback
  ],
  // Onyx Metals tokens
  '0x4de29616f7be2bc44D9dfF23abc5Fcb5804DF8B9': '/images/tokens/gold.png', // XAUX (Onyx Gold)
  '0x086031394aD8288eC3fE7f2d7495DDfe830a7085': '/images/tokens/silver.png', // XAGX (Onyx Silver)
};

const StyledEthereumLogo = styled.img<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  border-radius: 24px;
`;

const StyledLogo = styled(Logo)<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  border-radius: ${({ size }) => size};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  background-color: ${({ theme }) => theme.white};
`;

export default function CurrencyLogo({
  currency,
  size = '24px',
  style,
}: {
  currency?: Currency;
  size?: string;
  style?: React.CSSProperties;
}) {
  const { chainId } = useActiveWeb3React();
  const uriLocations = useHttpLocations(currency instanceof WrappedTokenInfo ? currency.logoURI : undefined);

  const srcs: string[] = useMemo(() => {
    if (currency === ETHER) return [];

    if (currency instanceof Token) {
      // Check for Goliath custom logos first
      const goliathLogo = GOLIATH_TOKEN_LOGOS[currency.address];
      if (goliathLogo) {
        // Handle both single string and array of fallback sources
        return Array.isArray(goliathLogo) ? goliathLogo : [goliathLogo];
      }

      if (currency instanceof WrappedTokenInfo) {
        return [...uriLocations, getTokenLogoURL(currency.address)];
      }

      return [getTokenLogoURL(currency.address)];
    }
    return [];
  }, [currency, uriLocations]);

  // For Goliath network, use XCN logo for native token
  if (currency === ETHER) {
    const isGoliath = chainId === (8901 as any);
    const logoSrc = isGoliath ? 'https://bridge.onyx.org/img/networks/80888.svg' : EthereumLogo;
    return <StyledEthereumLogo src={logoSrc} size={size} style={style} />;
  }

  return <StyledLogo size={size} srcs={srcs} alt={`${currency?.symbol ?? 'token'} logo`} style={style} />;
}
