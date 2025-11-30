import { toChecksumAddress } from 'web3-utils';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { ChainId, Token } from '@uniswap/sdk';
import { Tags, TokenInfo, TokenList } from '@uniswap/token-lists';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { AppState } from '../index';
import sortByListPriority from 'utils/listSort';
import { WXCN, USDC_GOLIATH, ETH_GOLIATH, BTC_GOLIATH } from '../../constants';
import { useActiveWeb3React } from '../../hooks';

type TagDetails = Tags[keyof Tags];
export interface TagInfo extends TagDetails {
  id: string;
}

/**
 * Token instances created from token info.
 */
export class WrappedTokenInfo extends Token {
  public readonly tokenInfo: TokenInfo;
  public readonly tags: TagInfo[];
  constructor(tokenInfo: TokenInfo, tags: TagInfo[]) {
    super(
      tokenInfo.chainId,
      toChecksumAddress(tokenInfo.address),
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name
    );
    this.tokenInfo = tokenInfo;
    this.tags = tags;
  }
  public get logoURI(): string | undefined {
    return this.tokenInfo.logoURI;
  }
}

export type TokenAddressMap = Readonly<
  { [chainId in ChainId]: Readonly<{ [tokenAddress: string]: { token: WrappedTokenInfo; list: TokenList } }> }
>;

// Create Goliath token list
const GOLIATH_TOKEN_LIST: TokenList = {
  name: 'Goliath Default',
  timestamp: new Date().toISOString(),
  version: { major: 1, minor: 0, patch: 0 },
  tokens: [
    {
      chainId: 8901,
      address: WXCN.address,
      decimals: WXCN.decimals,
      symbol: WXCN.symbol!,
      name: WXCN.name!,
      logoURI: 'https://bridge.onyx.org/img/networks/80888.svg',
    },
    {
      chainId: 8901,
      address: USDC_GOLIATH.address,
      decimals: USDC_GOLIATH.decimals,
      symbol: USDC_GOLIATH.symbol!,
      name: USDC_GOLIATH.name!,
      logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      chainId: 8901,
      address: ETH_GOLIATH.address,
      decimals: ETH_GOLIATH.decimals,
      symbol: ETH_GOLIATH.symbol!,
      name: ETH_GOLIATH.name!,
      logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    {
      chainId: 8901,
      address: BTC_GOLIATH.address,
      decimals: BTC_GOLIATH.decimals,
      symbol: BTC_GOLIATH.symbol!,
      name: BTC_GOLIATH.name!,
      logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    },
  ],
};

/**
 * An empty result, useful as a default.
 */
const EMPTY_LIST: TokenAddressMap = {
  [ChainId.KOVAN]: {},
  [ChainId.RINKEBY]: {},
  [ChainId.ROPSTEN]: {},
  [ChainId.GÖRLI]: {},
  [ChainId.MAINNET]: {},
  [ChainId.GOLIATH_TESTNET]: {},
};

const listCache: WeakMap<TokenList, TokenAddressMap> | null =
  typeof WeakMap !== 'undefined' ? new WeakMap<TokenList, TokenAddressMap>() : null;

export function listToTokenMap(list: TokenList): TokenAddressMap {
  const result = listCache?.get(list);
  if (result) return result;

  const map = list.tokens.reduce<TokenAddressMap>(
    (tokenMap, tokenInfo) => {
      const tags: TagInfo[] =
        tokenInfo.tags
          ?.map((tagId) => {
            if (!list.tags?.[tagId]) return undefined;
            return { ...list.tags[tagId], id: tagId };
          })
          ?.filter((x): x is TagInfo => Boolean(x)) ?? [];
      const token = new WrappedTokenInfo(tokenInfo, tags);
      if (tokenMap[token.chainId][token.address] !== undefined) throw Error('Duplicate tokens.');
      return {
        ...tokenMap,
        [token.chainId]: {
          ...tokenMap[token.chainId],
          [token.address]: {
            token,
            list: list,
          },
        },
      };
    },
    { ...EMPTY_LIST }
  );
  listCache?.set(list, map);
  return map;
}

export function useAllLists(): {
  readonly [url: string]: {
    readonly current: TokenList | null;
    readonly pendingUpdate: TokenList | null;
    readonly loadingRequestId: string | null;
    readonly error: string | null;
  };
} {
  return useSelector<AppState, AppState['lists']['byUrl']>((state) => state.lists.byUrl);
}

function combineMaps(map1: TokenAddressMap, map2: TokenAddressMap): TokenAddressMap {
  return {
    [ChainId.MAINNET]: { ...map1[ChainId.MAINNET], ...map2[ChainId.MAINNET] },
    [ChainId.ROPSTEN]: { ...map1[ChainId.ROPSTEN], ...map2[ChainId.ROPSTEN] },
    [ChainId.RINKEBY]: { ...map1[ChainId.RINKEBY], ...map2[ChainId.RINKEBY] },
    [ChainId.GÖRLI]: { ...map1[ChainId.GÖRLI], ...map2[ChainId.GÖRLI] },
    [ChainId.KOVAN]: { ...map1[ChainId.KOVAN], ...map2[ChainId.KOVAN] },
    [ChainId.GOLIATH_TESTNET]: { ...map1[ChainId.GOLIATH_TESTNET], ...map2[ChainId.GOLIATH_TESTNET] },
  };
}

// merge tokens contained within lists from urls
function useCombinedTokenMapFromUrls(urls: string[] | undefined): TokenAddressMap {
  const lists = useAllLists();

  return useMemo(() => {
    if (!urls) return EMPTY_LIST;

    return (
      urls
        .slice()
        // sort by priority so top priority goes last
        .sort(sortByListPriority)
        .reduce((allTokens, currentUrl) => {
          const current = lists[currentUrl]?.current;
          if (!current) return allTokens;
          try {
            const newTokens = Object.assign(listToTokenMap(current));
            return combineMaps(allTokens, newTokens);
          } catch (error) {
            console.error('Could not show token list due to error', error);
            return allTokens;
          }
        }, EMPTY_LIST)
    );
  }, [lists, urls]);
}

// filter out unsupported lists
export function useActiveListUrls(): string[] | undefined {
  return useSelector<AppState, AppState['lists']['activeListUrls']>((state) => state.lists.activeListUrls);
}

export function useInactiveListUrls(): string[] {
  const lists = useAllLists();
  const allActiveListUrls = useActiveListUrls();
  return Object.keys(lists).filter((url) => !allActiveListUrls?.includes(url));
}

// get all the tokens from active lists, combine with local default tokens
export function useCombinedActiveList(): TokenAddressMap {
  const { chainId } = useActiveWeb3React();
  const activeListUrls = useActiveListUrls();
  const activeTokens = useCombinedTokenMapFromUrls(activeListUrls);

  // For Goliath network, only use Goliath tokens
  if (chainId === ChainId.GOLIATH_TESTNET) {
    const goliathTokenMap = listToTokenMap(GOLIATH_TOKEN_LIST);
    return goliathTokenMap;
  }

  const defaultTokenMap = listToTokenMap(DEFAULT_TOKEN_LIST);
  return combineMaps(activeTokens, defaultTokenMap);
}

// all tokens from inactive lists
export function useCombinedInactiveList(): TokenAddressMap {
  const allInactiveListUrls: string[] = useInactiveListUrls();
  return useCombinedTokenMapFromUrls(allInactiveListUrls);
}

// used to hide warnings on import for default tokens
export function useDefaultTokenList(): TokenAddressMap {
  const { chainId } = useActiveWeb3React();

  // For Goliath network, only use Goliath tokens
  if (chainId === ChainId.GOLIATH_TESTNET) {
    return listToTokenMap(GOLIATH_TOKEN_LIST);
  }

  return listToTokenMap(DEFAULT_TOKEN_LIST);
}

export function useIsListActive(url: string): boolean {
  const activeListUrls = useActiveListUrls();
  return Boolean(activeListUrls?.includes(url));
}
