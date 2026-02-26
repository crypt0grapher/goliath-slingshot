import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

const DEFAULT_SEPOLIA_RPC_TIMEOUT_MS = 4000;
const DEFAULT_GOLIATH_RPC_TIMEOUT_MS = 4000;
const TIMEOUT_ERROR_CODE = 'TIMEOUT_ERROR';

function parseRpcTimeoutMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sepoliaRpcTimeoutMs = parseRpcTimeoutMs(
  process.env.REACT_APP_SEPOLIA_RPC_TIMEOUT_MS,
  DEFAULT_SEPOLIA_RPC_TIMEOUT_MS
);

const goliathRpcTimeoutMs = parseRpcTimeoutMs(
  process.env.REACT_APP_GOLIATH_RPC_TIMEOUT_MS,
  DEFAULT_GOLIATH_RPC_TIMEOUT_MS
);

/**
 * Read-only providers for both chains (lazy-loaded).
 * Used for balance queries and tx monitoring independent of wallet connection.
 *
 * Sepolia provider includes automatic fallback: if the primary RPC returns a
 * rate-limit (HTTP 429) or network error on first use, it switches to the
 * fallback RPC endpoint transparently.
 *
 * Consumers MUST call `await ensureSepoliaProviderReady()` before using the
 * Sepolia provider to avoid a race condition where the provider is returned
 * before validation completes.
 */
let _sepoliaProvider: ethers.providers.JsonRpcProvider | null = null;
let _goliathProvider: ethers.providers.JsonRpcProvider | null = null;
let _sepoliaValidated = false;
let _goliathValidated = false;
let _validationPromise: Promise<void> | null = null;
let _goliathValidationPromise: Promise<void> | null = null;

function createTimeoutError(operation: string, timeoutMs: number): Error & { code: string } {
  const err = new Error(`${operation} timed out after ${timeoutMs}ms`) as Error & { code: string };
  err.code = TIMEOUT_ERROR_CODE;
  return err;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(createTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

async function runSepoliaRpcCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  return withTimeout(call(), sepoliaRpcTimeoutMs, operation);
}

async function runGoliathRpcCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  return withTimeout(call(), goliathRpcTimeoutMs, operation);
}

function createSepoliaProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  console.log('[BridgeProviders] Creating Sepolia provider:', rpcUrl);
  return new ethers.providers.JsonRpcProvider(
    rpcUrl,
    { chainId: bridgeConfig.sepolia.chainId, name: 'sepolia' }
  );
}

function getSepoliaFallbackRpcUrls(): string[] {
  const candidates = [bridgeConfig.sepolia.rpcUrlFallback, ...bridgeConfig.sepolia.rpcUrlFallbacks]
    .filter(Boolean)
    .filter((url) => url !== bridgeConfig.sepolia.rpcUrl);
  return [...new Set(candidates)];
}

/**
 * Validates the Sepolia provider by calling getBlockNumber().
 * If the primary RPC fails, transparently switches to the fallback.
 */
async function validateSepoliaProvider(): Promise<void> {
  if (_sepoliaValidated) return;

  if (!_sepoliaProvider) {
    _sepoliaProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrl);
  }

  try {
    await runSepoliaRpcCall('Sepolia primary RPC validation', () => _sepoliaProvider!.getBlockNumber());
    _sepoliaValidated = true;
    return;
  } catch (err) {
    if (!isRpcFailure(err)) throw err;

    const fallbackRpcUrls = getSepoliaFallbackRpcUrls();
    if (!fallbackRpcUrls.length) throw err;

    let lastRpcFailure = err;
    for (const fallbackRpcUrl of fallbackRpcUrls) {
      console.warn(
        '[BridgeProviders] Primary Sepolia RPC failed, switching to fallback:',
        fallbackRpcUrl
      );
      const fallbackProvider = createSepoliaProvider(fallbackRpcUrl);
      _sepoliaProvider = fallbackProvider;
      try {
        await runSepoliaRpcCall('Sepolia fallback RPC validation', () => fallbackProvider.getBlockNumber());
        _sepoliaValidated = true;
        return;
      } catch (fallbackErr) {
        if (!isRpcFailure(fallbackErr)) throw fallbackErr;
        lastRpcFailure = fallbackErr;
      }
    }

    throw lastRpcFailure;
  }
}

/**
 * Ensures the Sepolia provider has been validated (and potentially switched to
 * fallback) before returning. Multiple concurrent callers share the same
 * validation promise to avoid duplicate RPC calls.
 *
 * All async consumers of the Sepolia provider should await this before
 * calling getSepoliaProvider() or readonlyProviders[SEPOLIA].
 */
export async function ensureSepoliaProviderReady(): Promise<void> {
  if (_sepoliaValidated) return;

  if (!_validationPromise) {
    _validationPromise = validateSepoliaProvider()
      .catch((err) => {
        // If validation fails entirely (e.g., both RPCs down), log and
        // reset so the next caller can retry.
        console.error('[BridgeProviders] Sepolia provider validation failed:', err);
        _sepoliaValidated = false;
        throw err;
      })
      .finally(() => {
        _validationPromise = null;
      });
  }

  await _validationPromise;
}

// Kick off validation eagerly (non-blocking) — consumers still await via ensureSepoliaProviderReady()
ensureSepoliaProviderReady().catch(() => {
  // Intentionally ignored; consumers call ensureSepoliaProviderReady() and
  // will surface failures in their own error handling paths.
});

function getSepoliaProvider(): ethers.providers.JsonRpcProvider {
  if (!_sepoliaProvider) {
    _sepoliaProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrl);
  }
  return _sepoliaProvider;
}

function createGoliathProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  console.log('[BridgeProviders] Creating Goliath provider:', rpcUrl);
  return new ethers.providers.JsonRpcProvider(
    rpcUrl,
    { chainId: bridgeConfig.goliath.chainId, name: 'goliath' }
  );
}

/**
 * Validates the Goliath provider by calling getBlockNumber().
 * If the primary RPC fails and a fallback URL is configured, switches to it.
 */
async function validateGoliathProvider(): Promise<void> {
  if (_goliathValidated) return;

  if (!_goliathProvider) {
    _goliathProvider = createGoliathProvider(bridgeConfig.goliath.rpcUrl);
  }

  try {
    await runGoliathRpcCall('Goliath primary RPC validation', () => _goliathProvider!.getBlockNumber());
    _goliathValidated = true;
    return;
  } catch (err) {
    if (!isRpcFailure(err)) throw err;

    const fallbackUrl = process.env.REACT_APP_GOLIATH_RPC_URL_FALLBACK;
    if (!fallbackUrl || fallbackUrl === bridgeConfig.goliath.rpcUrl) throw err;

    console.warn('[BridgeProviders] Primary Goliath RPC failed, switching to fallback:', fallbackUrl);
    const fallbackProvider = createGoliathProvider(fallbackUrl);
    _goliathProvider = fallbackProvider;
    try {
      await runGoliathRpcCall('Goliath fallback RPC validation', () => fallbackProvider.getBlockNumber());
      _goliathValidated = true;
    } catch (fallbackErr) {
      throw isRpcFailure(fallbackErr) ? fallbackErr : fallbackErr;
    }
  }
}

/**
 * Ensures the Goliath provider has been validated before returning.
 * Multiple concurrent callers share the same validation promise.
 */
export async function ensureGoliathProviderReady(): Promise<void> {
  if (_goliathValidated) return;

  if (!_goliathValidationPromise) {
    _goliathValidationPromise = validateGoliathProvider()
      .catch((err) => {
        console.error('[BridgeProviders] Goliath provider validation failed:', err);
        _goliathValidated = false;
        throw err;
      })
      .finally(() => {
        _goliathValidationPromise = null;
      });
  }

  await _goliathValidationPromise;
}

// Kick off Goliath validation eagerly (non-blocking)
ensureGoliathProviderReady().catch(() => {});

function getGoliathProvider(): ethers.providers.JsonRpcProvider {
  if (!_goliathProvider) {
    _goliathProvider = createGoliathProvider(bridgeConfig.goliath.rpcUrl);
  }
  return _goliathProvider;
}

/**
 * Get provider for a specific network
 */
export function getReadonlyProvider(network: BridgeNetwork): ethers.providers.JsonRpcProvider {
  return network === BridgeNetwork.SEPOLIA ? getSepoliaProvider() : getGoliathProvider();
}

// For backwards compatibility
export const readonlyProviders = {
  get [BridgeNetwork.SEPOLIA]() { return getSepoliaProvider(); },
  get [BridgeNetwork.GOLIATH]() { return getGoliathProvider(); },
};

/**
 * Check if an error looks like an RPC rate-limit or transient network failure.
 */
function isRpcFailure(err: any): boolean {
  return (
    err?.code === 429 ||
    err?.error?.code === 429 ||
    err?.message?.includes('429') ||
    err?.message?.includes('capacity limit') ||
    err?.message?.toLowerCase?.().includes('timed out') ||
    err?.code === TIMEOUT_ERROR_CODE ||
    err?.code === 'NETWORK_ERROR' ||
    err?.code === 'SERVER_ERROR'
  );
}

/**
 * Re-validate the Sepolia provider (switch to fallback if needed).
 * Only applicable when the network is Sepolia.
 */
async function revalidateSepoliaIfNeeded(network: BridgeNetwork): Promise<void> {
  if (network !== BridgeNetwork.SEPOLIA) return;
  _sepoliaValidated = false;
  _validationPromise = null;
  await ensureSepoliaProviderReady();
}

async function revalidateGoliathIfNeeded(network: BridgeNetwork): Promise<void> {
  if (network !== BridgeNetwork.GOLIATH) return;
  _goliathValidated = false;
  _goliathValidationPromise = null;
  await ensureGoliathProviderReady();
}

async function revalidateIfNeeded(network: BridgeNetwork): Promise<void> {
  if (network === BridgeNetwork.SEPOLIA) return revalidateSepoliaIfNeeded(network);
  return revalidateGoliathIfNeeded(network);
}

/**
 * Get balance for an address on a specific network.
 * Retries once with fallback provider if the primary RPC fails.
 */
export async function getNativeBalance(address: string, network: BridgeNetwork): Promise<bigint> {
  if (network === BridgeNetwork.SEPOLIA) await ensureSepoliaProviderReady();
  else await ensureGoliathProviderReady();

  try {
    const provider = readonlyProviders[network];
    const balance = network === BridgeNetwork.SEPOLIA
      ? await runSepoliaRpcCall('Sepolia getBalance', () => provider.getBalance(address))
      : await runGoliathRpcCall('Goliath getBalance', () => provider.getBalance(address));
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateIfNeeded(network);
      const provider = readonlyProviders[network];
      const balance = network === BridgeNetwork.SEPOLIA
        ? await runSepoliaRpcCall('Sepolia getBalance retry', () => provider.getBalance(address))
        : await runGoliathRpcCall('Goliath getBalance retry', () => provider.getBalance(address));
      return balance.toBigInt();
    }
    throw err;
  }
}

/**
 * Get ERC-20 token balance.
 * Retries once with fallback provider if the primary RPC fails.
 */
export async function getTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  if (network === BridgeNetwork.SEPOLIA) await ensureSepoliaProviderReady();
  else await ensureGoliathProviderReady();

  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const balance: ethers.BigNumber = network === BridgeNetwork.SEPOLIA
      ? await runSepoliaRpcCall('Sepolia balanceOf', () => contract.balanceOf(ownerAddress))
      : await runGoliathRpcCall('Goliath balanceOf', () => contract.balanceOf(ownerAddress));
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateIfNeeded(network);
      const provider = readonlyProviders[network];
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const balance: ethers.BigNumber = network === BridgeNetwork.SEPOLIA
        ? await runSepoliaRpcCall('Sepolia balanceOf retry', () => contract.balanceOf(ownerAddress))
        : await runGoliathRpcCall('Goliath balanceOf retry', () => contract.balanceOf(ownerAddress));
      return balance.toBigInt();
    }
    throw err;
  }
}

/**
 * Get current block number for a network
 */
export async function getBlockNumber(network: BridgeNetwork): Promise<number> {
  if (network === BridgeNetwork.SEPOLIA) await ensureSepoliaProviderReady();
  else await ensureGoliathProviderReady();
  const provider = readonlyProviders[network];
  return network === BridgeNetwork.SEPOLIA
    ? runSepoliaRpcCall('Sepolia getBlockNumber', () => provider.getBlockNumber())
    : runGoliathRpcCall('Goliath getBlockNumber', () => provider.getBlockNumber());
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  txHash: string,
  network: BridgeNetwork,
  confirmations: number = 1
): Promise<ethers.providers.TransactionReceipt> {
  const provider = readonlyProviders[network];
  return provider.waitForTransaction(txHash, confirmations);
}

/**
 * Get token allowance.
 * Retries once with fallback provider if the primary RPC fails.
 */
export async function getTokenAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  if (network === BridgeNetwork.SEPOLIA) await ensureSepoliaProviderReady();
  else await ensureGoliathProviderReady();

  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const allowance: ethers.BigNumber = network === BridgeNetwork.SEPOLIA
      ? await runSepoliaRpcCall(
        'Sepolia allowance',
        () => contract.allowance(ownerAddress, spenderAddress)
      )
      : await runGoliathRpcCall(
        'Goliath allowance',
        () => contract.allowance(ownerAddress, spenderAddress)
      );
    return allowance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateIfNeeded(network);
      const provider = readonlyProviders[network];
      const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const allowance: ethers.BigNumber = network === BridgeNetwork.SEPOLIA
        ? await runSepoliaRpcCall(
          'Sepolia allowance retry',
          () => contract.allowance(ownerAddress, spenderAddress)
        )
        : await runGoliathRpcCall(
          'Goliath allowance retry',
          () => contract.allowance(ownerAddress, spenderAddress)
        );
      return allowance.toBigInt();
    }
    throw err;
  }
}
