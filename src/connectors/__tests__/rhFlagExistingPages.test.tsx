/**
 * M2: existing pages with a wallet on Robinhood Chain Testnet (46630).
 *  - Flag off (live behaviour): 46630 is an unsupported chain, rendered exactly like another
 *    unsupported chain (137), and the WalletModal switches the wallet to Onyx Testnet.
 *  - Flag on: 46630 is a supported non-Onyx chain, rendered exactly like Sepolia (11155111),
 *    and the WalletModal connects without switching.
 * Header, Swap and WalletModal (inside Header's Web3Status) are rendered with the real store, web3-react
 * roots and injected connector; only translations, the modal shell, identicon and content-hash
 * decoding are stubbed. A test-only byte conversion lets web3-utils hash Node Buffers in jsdom.
 */
const ACCOUNT = '0x7dBe71B743e3e9f542324Dd032D080e9fA1A243A';
const FLAG = 'REACT_APP_RH_TESTNET_BRIDGE_ENABLED';

// jsdom has no TextEncoder/TextDecoder. These minimal UTF-8 versions return byte arrays from the
// test realm, which the hashing dependencies check with instanceof Uint8Array.
class RealmTextEncoder {
  encode(text = ''): Uint8Array {
    const bytes = Buffer.from(text, 'utf8');
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out;
  }
}
class RealmTextDecoder {
  decode(bytes?: ArrayBufferView | ArrayBuffer): string {
    if (!bytes) return '';
    const view =
      bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Buffer.from(view).toString('utf8');
  }
}
Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, writable: true, value: RealmTextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, writable: true, value: RealmTextDecoder });

// web3-utils passes a Node-realm Buffer to noble's browser-realm Uint8Array check. Preserve
// the real hash calculation, converting only the input bytes into this test's realm.
jest.mock('web3-utils/node_modules/ethereum-cryptography/keccak.js', () => {
  const actual = jest.requireActual('web3-utils/node_modules/ethereum-cryptography/keccak.js');
  return {
    ...actual,
    keccak256: Object.assign((bytes: Uint8Array) => actual.keccak256(new Uint8Array(bytes)), actual.keccak256),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: () => undefined } }),
  Trans: ({ children }: { children: unknown }) => children,
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
// ENS content-hash decoding (multihashes/cids) is ESM-only under Jest and unrelated to chain handling.
jest.mock('../../utils/contenthashToUri', () => ({ __esModule: true, default: () => '' }));
// Jazzicon draws with Raphael SVG APIs that jsdom does not implement.
jest.mock('../../components/Identicon', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/Modal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ isOpen, children }: { isOpen: boolean; children: unknown }) =>
      isOpen ? React.createElement('div', { 'data-testid': 'modal' }, children) : null,
  };
});

// A fresh module registry per render, with the flag set as at build time (the connector reads it
// at import). Lazy requires made while rendering resolve in this same registry.
function load(flag: boolean) {
  const previous = process.env[FLAG];
  let m: any;
  jest.resetModules();
  if (flag) process.env[FLAG] = 'true';
  else delete process.env[FLAG];
  m = {
    React: require('react'),
    ReactDOM: require('react-dom'),
    act: require('react-dom/test-utils').act,
    core: require('@web3-react/core'),
    Web3Provider: require('@ethersproject/providers').Web3Provider,
    Provider: require('react-redux').Provider,
    ThemeProvider: require('styled-components').ThemeProvider,
    theme: require('../../theme').theme,
    MemoryRouter: require('react-router-dom').MemoryRouter,
    store: require('../../state').default,
    application: require('../../state/application/actions'),
    NetworkContextName: require('../../constants').NetworkContextName,
    injected: require('../index').injected,
    network: require('../index').network,
    Header: require('../../components/Header').default,
    Swap: require('../../pages/Swap').default,
    walletHooks: require('../../state/wallet/hooks'),
  };
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
  return m;
}

function installEthereum(chainId: number) {
  const wallet = { chainId, requests: [] as string[] };
  const answer = (method: string, params?: any[]) => {
    wallet.requests.push(method);
    if (method === 'eth_chainId') return '0x' + wallet.chainId.toString(16);
    if (method === 'net_version') return String(wallet.chainId);
    if (method === 'eth_blockNumber') return '0x10';
    if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCOUNT];
    if (method === 'wallet_switchEthereumChain') {
      wallet.chainId = parseInt(params![0].chainId, 16);
      return null;
    }
    throw Object.assign(new Error('unsupported ' + method), { code: 4200 });
  };
  (window as any).ethereum = {
    isMetaMask: true,
    send: async (method: string | { method: string }, params?: any[]) => ({
      result: answer(typeof method === 'string' ? method : method.method, params),
    }),
    request: async ({ method, params }: { method: string; params?: any[] }) => answer(method, params),
    on: () => undefined,
    removeListener: () => undefined,
  };
  return wallet;
}

const flush = async (m: any) => {
  await m.act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
};

interface Mounted {
  container: HTMLDivElement;
  wallet: ReturnType<typeof installEthereum>;
  state: { chainId?: number; account?: string | null; error?: string };
  m: any;
  cleanup: () => void;
}

async function mount(
  flag: boolean,
  chainId: number,
  page: 'Header' | 'Swap',
  activate: boolean,
  pathname = '/swap',
  nativeBalance?: string
): Promise<Mounted> {
  window.localStorage.clear();
  const m = load(flag);
  if (nativeBalance !== undefined) {
    jest.spyOn(m.walletHooks, 'useETHBalances').mockReturnValue({ [ACCOUNT]: { toSignificant: () => nativeBalance } });
  }
  const wallet = installEthereum(chainId);
  const state: Mounted['state'] = {};
  const h = m.React.createElement;
  const Web3ProviderNetwork = m.core.createWeb3ReactRoot(m.NetworkContextName);
  // As Web3ReactManager does: the read-only network context is always active.
  function NetworkProbe() {
    const ctx = m.core.useWeb3React(m.NetworkContextName);
    m.React.useEffect(() => {
      ctx.activate(m.network).catch(() => undefined);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }
  // As useEagerConnect does: activate injected with throwOnError and swallow the failure.
  function Probe() {
    const ctx = m.core.useWeb3React();
    m.React.useEffect(() => {
      if (activate) ctx.activate(m.injected, undefined, true).catch(() => undefined);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    state.chainId = ctx.chainId;
    state.account = ctx.account;
    state.error = ctx.error
      ? ctx.error instanceof m.core.UnsupportedChainIdError
        ? 'UNSUPPORTED'
        : 'OTHER'
      : undefined;
    return null;
  }
  const getLibrary = (p: any) => new m.Web3Provider(p);
  const container = document.createElement('div');
  document.body.appendChild(container);
  await m.act(async () => {
    m.ReactDOM.render(
      h(
        m.Provider,
        { store: m.store },
        h(
          m.core.Web3ReactProvider,
          { getLibrary },
          h(
            Web3ProviderNetwork,
            { getLibrary },
            h(
              m.ThemeProvider,
              { theme: m.theme(false) },
              h(m.MemoryRouter, { initialEntries: [pathname] }, h(NetworkProbe), h(Probe), h(m[page]))
            )
          )
        )
      ),
      container
    );
  });
  await flush(m);
  return {
    container,
    wallet,
    state,
    m,
    cleanup: () => {
      m.act(() => {
        m.ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
      delete (window as any).ethereum;
    },
  };
}

// Visible behaviour: text and buttons, with only the chain's display label normalised.
function behaviour(view: Mounted): { text: string; buttons: string[] } {
  const norm = (s: string) => s.replace(/Sepolia|Robinhood Chain Testnet|Chain 46630|Chain 137/g, 'CHAIN');
  return {
    text: norm(view.container.textContent || ''),
    buttons: Array.from(view.container.querySelectorAll('button')).map((b) => norm(`${b.textContent}|${b.disabled}`)),
  };
}

async function render(flag: boolean, chainId: number, page: 'Header' | 'Swap') {
  const view = await mount(flag, chainId, page, true);
  const result = { ...behaviour(view), state: { ...view.state } };
  view.cleanup();
  return result;
}

describe.each(['Header', 'Swap'] as const)('%s on 46630', (page) => {
  test.each([8901, 11155111])('existing chain %i behaves identically with the flag off and on', async (chainId) => {
    expect(await render(true, chainId, page)).toEqual(await render(false, chainId, page));
  });

  test('flag on: identical to Sepolia (a supported non-Onyx chain)', async () => {
    const sepolia = await render(true, 11155111, page);
    const robinhood = await render(true, 46630, page);
    expect(sepolia.state).toMatchObject({ chainId: 11155111, account: ACCOUNT, error: undefined });
    expect(robinhood.state).toMatchObject({ chainId: 46630, account: ACCOUNT, error: undefined });
    expect(robinhood.text).toBe(sepolia.text);
    expect(robinhood.buttons).toEqual(sepolia.buttons);
  });

  test('flag off: identical to another unsupported chain (137), as in the live build', async () => {
    const other = await render(false, 137, page);
    const robinhood = await render(false, 46630, page);
    // Eager connect fails on an unsupported chain: no injected account, as in the live build.
    expect(other.state).toMatchObject({ chainId: undefined, account: undefined });
    expect(robinhood.state).toMatchObject({ chainId: undefined, account: undefined });
    expect(robinhood.text).toBe(other.text);
    expect(robinhood.buttons).toEqual(other.buttons);
  });
});

test('the test-only byte conversion preserves real checksum hashing', () => {
  expect(require('web3-utils').toChecksumAddress('0x52908400098527886e0f7030069857d2e4169ee7')).toBe(
    '0x52908400098527886E0F7030069857D2E4169EE7'
  );
});

test('Swap on 46630 with the flag on offers the same switch-to-Onyx action as Sepolia', async () => {
  const view = await mount(true, 46630, 'Swap', true);
  try {
    const switchButton = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'switchToGoliath'
    ) as HTMLButtonElement | undefined;
    expect(switchButton).toBeDefined();
    await view.m.act(async () => switchButton!.click());
    await flush(view.m);
    expect(view.wallet.requests).toContain('wallet_switchEthereumChain');
    expect(view.wallet.chainId).toBe(8901);
    expect(view.wallet.requests).not.toContain('eth_sendTransaction');
  } finally {
    view.cleanup();
  }
});

test('Header shows the switch-to-Onyx prompt on 46630 with the flag on, like on Sepolia', async () => {
  const robinhood = await render(true, 46630, 'Header');
  const sepolia = await render(true, 11155111, 'Header');
  expect(robinhood.text).toContain('CHAIN');
  expect(robinhood.text).toBe(sepolia.text);
});

test('Header names Robinhood on DEX but still offers switching to Onyx', async () => {
  const view = await mount(true, 46630, 'Header', true, '/swap', '1');
  try {
    const switcher = view.container.querySelector(
      'button[title="Connected to Robinhood Chain Testnet. Click to switch to Onyx Testnet."]'
    ) as HTMLButtonElement;
    expect(switcher).not.toBeNull();
    expect(switcher.textContent).toBe('Robinhood Chain Testnet');
    expect(view.container.textContent).toContain('1 ETH');
    await view.m.act(async () => {
      switcher.click();
    });
    expect(view.wallet.chainId).toBe(8901);
  } finally {
    view.cleanup();
  }
});

test('Header on unified bridge accepts the selected RH source and labels native balance ETH', async () => {
  const view = await mount(true, 46630, 'Header', true, '/bridge', '1');
  try {
    await view.m.act(async () => {
      view.m.store.dispatch(require('../../state/bridge/reducer').bridgeActions.setOriginNetwork('ROBINHOOD'));
    });
    expect(view.container.querySelector('[title="Robinhood Chain Testnet"]')?.textContent).toBe(
      'Robinhood Chain Testnet'
    );
    expect(view.container.querySelector('button[title*="Click to switch to Onyx"]')).toBeNull();
    expect(view.container.textContent).toContain('1 ETH');
    expect(view.container.textContent).not.toContain('1 XCN');
    expect(view.wallet.requests).not.toContain('wallet_switchEthereumChain');
    expect(view.wallet.requests).not.toContain('eth_sendTransaction');
  } finally {
    view.cleanup();
  }
});

test('Header flag off does not advertise RH and Onyx keeps its XCN balance label', async () => {
  const robinhood = await render(false, 46630, 'Header');
  expect(robinhood.text).not.toContain('Robinhood');
  const onyx = await mount(true, 8901, 'Header', true, '/swap', '1');
  try {
    expect(onyx.container.textContent).toContain('1 XCN');
  } finally {
    onyx.cleanup();
  }
});

async function connectViaWalletModal(flag: boolean, chainId: number) {
  const view = await mount(flag, chainId, 'Header', false);
  await view.m.act(async () => {
    view.m.store.dispatch(view.m.application.setOpenModal(view.m.application.ApplicationModal.WALLET));
  });
  await flush(view.m);
  const option = view.container.querySelector('#connect-METAMASK') as HTMLElement;
  expect(option).not.toBeNull();
  await view.m.act(async () => {
    option.click();
  });
  await flush(view.m);
  await flush(view.m);
  const result = {
    switchedTo: view.wallet.requests.includes('wallet_switchEthereumChain') ? view.wallet.chainId : null,
    state: { ...view.state },
  };
  view.cleanup();
  return result;
}

test('WalletModal flag on: connecting on 46630 behaves like Sepolia (no network switch)', async () => {
  const sepolia = await connectViaWalletModal(true, 11155111);
  const robinhood = await connectViaWalletModal(true, 46630);
  expect(sepolia).toEqual({ switchedTo: null, state: { chainId: 11155111, account: ACCOUNT, error: undefined } });
  expect(robinhood).toEqual({ switchedTo: null, state: { chainId: 46630, account: ACCOUNT, error: undefined } });
});

test('WalletModal flag off: connecting on 46630 switches to Onyx Testnet, like any unsupported chain (live behaviour)', async () => {
  const other = await connectViaWalletModal(false, 137);
  const robinhood = await connectViaWalletModal(false, 46630);
  expect(other).toEqual({ switchedTo: 8901, state: { chainId: 8901, account: ACCOUNT, error: undefined } });
  expect(robinhood).toEqual({ switchedTo: 8901, state: { chainId: 8901, account: ACCOUNT, error: undefined } });
});

export {};
