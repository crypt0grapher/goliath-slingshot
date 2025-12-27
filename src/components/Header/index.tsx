import { ChainId } from '@uniswap/sdk';
import React from 'react';
import { Text } from 'rebass';
import { NavLink } from 'react-router-dom';
import { darken } from 'polished';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { useActiveWeb3React } from '../../hooks';
import { useNetworkSwitch, GOLIATH_TESTNET_CHAIN_ID } from '../../hooks/useNetworkSwitch';
import { useDarkModeManager } from '../../state/user/hooks';
import { useETHBalances } from '../../state/wallet/hooks';

import { LightCard } from '../Card';
import { Moon, Sun } from 'react-feather';
import Row, { RowFixed } from '../Row';
import Web3Status from '../Web3Status';

const HeaderFrame = styled.div`
  width: 100vw;
  margin: 0.8rem auto;
  padding: 0.8rem 1.6rem;
  z-index: 2;
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  justify-content: space-between;
  align-items: center;
  flex-direction: row;

  ${({ theme }) => theme.mediaWidth.upToLarge`
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 0.5rem;
  `};

  ${({ theme }) => theme.mediaWidth.upToSmall`
    grid-template-columns: 60px 1fr;
    grid-template-rows: auto;
  `};

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    padding: 0.5rem 1rem;
  `}
`;

const HeaderControls = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-self: flex-end;

  ${({ theme }) => theme.mediaWidth.upToLarge`
    grid-row: 1;
  `};
`;

const HeaderElement = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderElementWrap = styled.div`
  display: flex;
  align-items: center;
`;

const HeaderRow = styled(RowFixed)`
  display: flex;
  align-items: center;

  ${({ theme }) => theme.mediaWidth.upToLarge`
    width: auto;
    grid-row: 1;
  `};

  ${({ theme }) => theme.mediaWidth.upToSmall`
    overflow: hidden;
    min-width: 0;
  `};
`;

const HeaderLinks = styled(Row)`
  width: auto;
  margin: 0 auto;
  padding: 0.3rem;
  justify-content: center;
  border-radius: 0.8rem;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;
  background-color: ${({ theme }) => theme.bg1};

  ${({ theme }) => theme.mediaWidth.upToLarge`
    grid-column: 1 / -1;
    grid-row: 2;
    margin: 0 auto;
    width: fit-content;
  `};

  ${({ theme }) => theme.mediaWidth.upToSmall`
    position: fixed;
    bottom: 0;
    padding: .5rem;
    width: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 0;
    border-top: 1px solid ${({ theme }) => theme.bg3};
    grid-column: auto;
    grid-row: auto;
  `};
`;

const AccountElement = styled.div<{ active: boolean }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme, active }) => (!active ? theme.bg1 : theme.bg3)};
  border-radius: 0.8rem;
  white-space: nowrap;
  width: 100%;
  cursor: pointer;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;

  :focus {
    border: 1px solid blue;
  }
`;

const HideSmall = styled.span`
  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    display: none;
  `};
`;

const NetworkCard = styled(LightCard)`
  border-radius: 0.8rem;
  padding: 8px 12px;
  white-space: nowrap;
  min-width: 120px;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    margin: 0;
    margin-right: 0.5rem;
    width: initial;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
  `};
`;

const WrongNetworkButton = styled.button`
  border-radius: 0.8rem;
  padding: 8px 12px;
  white-space: nowrap;
  min-width: 120px;
  background-color: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};
  color: ${({ theme }) => theme.text1};
  font-weight: 500;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  ${({ theme }) => theme.mediaWidth.upToSmall`
    margin: 0;
    margin-right: 0.5rem;
    width: initial;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
  `};
`;

const BalanceText = styled(Text)`
  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    display: none;
  `};
`;

const Title = styled.a`
  display: flex;
  align-items: center;
  pointer-events: auto;
  justify-self: flex-start;
  margin-right: 12px;
  ${({ theme }) => theme.mediaWidth.upToSmall`
    justify-self: center;
  `};
  :hover {
    cursor: pointer;
  }
`;

const Icon = styled.div`
  transition: transform 0.3s ease;
  :hover {
    transform: scale(1.1);
  }
`;

const LogoImg = styled.img<{ invert?: boolean }>`
  ${({ invert }) => invert && `filter: invert(1);`}

  ${({ theme }) => theme.mediaWidth.upToSmall`
    max-width: 60px;
    height: auto;
  `};
`;

const activeClassName = 'ACTIVE';

const StyledNavLink = styled(NavLink).attrs({
  activeClassName,
})`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: left;
  border-radius: 12px;
  outline: none;
  cursor: pointer;
  text-decoration: none;
  color: ${({ theme }) => theme.text2};
  font-size: 0.9rem;
  width: fit-content;
  padding: 0.3rem 0.6rem;
  font-weight: 500;
  transition: 0.3s;

  &:not(:last-child) {
    margin-right: 0.16rem;
  }

  &.${activeClassName} {
    color: ${({ theme }) => theme.text1};
    background-color: ${({ theme }) => theme.bg3};
  }

  :hover,
  :focus {
    color: ${({ theme }) => darken(0.1, theme.text1)};
  }

  ${({ theme }) => theme.mediaWidth.upToSmall`
    border-radius: 8px;
    padding: 0.3rem 7%;
    border: 1px solid ${({ theme }) => theme.bg3};

    &:not(:last-child) {
      margin-right: 2%;
    }
  `};
`;

const DisabledNavLink = styled.span`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: left;
  border-radius: 12px;
  outline: none;
  cursor: not-allowed;
  text-decoration: none;
  color: ${({ theme }) => theme.text3};
  font-size: 0.9rem;
  width: fit-content;
  padding: 0.3rem 0.6rem;
  font-weight: 500;
  opacity: 0.5;

  &:not(:last-child) {
    margin-right: 0.16rem;
  }

  ${({ theme }) => theme.mediaWidth.upToSmall`
    border-radius: 8px;
    padding: 0.3rem 7%;
    border: 1px solid ${({ theme }) => theme.bg3};

    &:not(:last-child) {
      margin-right: 2%;
    }
  `};
`;

export const StyledMenuButton = styled.button`
  position: relative;
  width: 100%;
  height: 100%;
  border: none;
  background-color: transparent;
  margin: 0;
  padding: 0;
  height: 35px;
  background-color: ${({ theme }) => theme.bg3};
  margin-left: 8px;
  padding: 0.15rem 0.5rem;
  border-radius: 0.5rem;
  box-shadow: rgba(0, 0, 0, 0.01) 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 4px 8px, rgba(0, 0, 0, 0.04) 0px 16px 24px,
    rgba(0, 0, 0, 0.01) 0px 24px 32px;

  :hover,
  :focus {
    cursor: pointer;
    outline: none;
    background-color: ${({ theme }) => theme.bg4};
  }

  svg {
    margin-top: 2px;
  }
  > * {
    stroke: ${({ theme }) => theme.text1};
  }
`;

const NETWORK_LABELS: { [chainId: number]: string } = {
  [ChainId.RINKEBY]: 'Rinkeby',
  [ChainId.ROPSTEN]: 'Ropsten',
  [ChainId.GÖRLI]: 'Goerli',
  [ChainId.KOVAN]: 'Kovan',
  8901: 'Goliath Testnet',
  11155111: 'Sepolia',
};

export default function Header() {
  const { account, chainId } = useActiveWeb3React();
  const { t } = useTranslation();
  const userEthBalance = useETHBalances(account ? [account] : [])?.[account ?? ''];
  const [darkMode, toggleDarkMode] = useDarkModeManager();
  const { switchToGoliath, isLoading: isSwitchingNetwork } = useNetworkSwitch();

  const isWrongNetwork = account && chainId && chainId !== GOLIATH_TESTNET_CHAIN_ID;
  const networkName = chainId && NETWORK_LABELS[chainId] ? NETWORK_LABELS[chainId] : `Chain ${chainId}`;

  return (
    <HeaderFrame>
      <HeaderRow>
        <Title href=".">
          <Icon>
            <LogoImg width={'100px'} src="https://testnet.explorer.goliath.net/assets/configs/network_logo.svg" alt="logo" invert={darkMode} />
          </Icon>
        </Title>
      </HeaderRow>

      <HeaderLinks>
        <StyledNavLink id={`swap-nav-link`} to={'/swap'}>
          {t('swap')}
        </StyledNavLink>
        <StyledNavLink
          id={`pool-nav-link`}
          to={'/pool'}
          isActive={(match, { pathname }) =>
            Boolean(match) ||
            pathname.startsWith('/add') ||
            pathname.startsWith('/remove') ||
            pathname.startsWith('/create') ||
            pathname.startsWith('/find')
          }
        >
          {t('pool')}
        </StyledNavLink>
        <StyledNavLink id={`bridge-nav-link`} to={'/bridge'}>
          {t('bridge')}
        </StyledNavLink>
        <DisabledNavLink id={`yield-nav-link`}>
          {t('yield')}
        </DisabledNavLink>
      </HeaderLinks>

      <HeaderControls>
        <HeaderElement>
          <HideSmall>
            {isWrongNetwork ? (
              <WrongNetworkButton
                onClick={switchToGoliath}
                disabled={isSwitchingNetwork}
                title={`Connected to ${networkName}. Click to switch to Goliath Testnet.`}
              >
                {isSwitchingNetwork ? 'Switching...' : networkName}
              </WrongNetworkButton>
            ) : (
              chainId === GOLIATH_TESTNET_CHAIN_ID && (
                <NetworkCard title="Goliath Testnet">Goliath Testnet</NetworkCard>
              )
            )}
          </HideSmall>
          <AccountElement active={!!account} style={{ pointerEvents: 'auto' }}>
            {account && userEthBalance ? (
              <BalanceText style={{ flexShrink: 0 }} pl="0.75rem" pr="0.5rem" fontWeight={500}>
                {userEthBalance?.toSignificant(7)} XCN
              </BalanceText>
            ) : null}
            <Web3Status />
          </AccountElement>
        </HeaderElement>
        <HeaderElementWrap>
          <StyledMenuButton onClick={toggleDarkMode}>
            {darkMode ? <Moon size={20} /> : <Sun size={20} />}
          </StyledMenuButton>
        </HeaderElementWrap>
      </HeaderControls>
    </HeaderFrame>
  );
}
