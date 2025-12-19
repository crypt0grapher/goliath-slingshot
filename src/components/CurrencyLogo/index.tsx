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
  '0xec6Cd1441201e36F7289f0B2729a97d091AcB5b7': 'https://bridge.onyx.org/img/networks/80888.svg', // WXCN
  '0xEf2B9f754405f52c80B5A67656f14672a00d23b4': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png', // USDC
  '0x9d318b851a6AF920D467bC5dC9882b5DFD36D65e': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png', // ETH
  // BTC - local asset with CDN fallbacks for reliability
  '0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10': [
    '/images/tokens/btc-logo.svg', // Local SVG asset (always available)
    'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=040', // CDN fallback
    'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', // CoinGecko fallback
  ],
  // Onyx Metals tokens
  '0xDd18e3D481efF42F4e678FaB401dc23db0827E8f': '/images/tokens/gold.png', // XAUX (Onyx Gold)
  '0x782E7E60a5264ff4733a1949EdCe29D9b1cEa83C': '/images/tokens/silver.png', // XAGX (Onyx Silver)
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
