import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

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
let _validationPromise: Promise<void> | null = null;

function createSepoliaProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  console.log('[BridgeProviders] Creating Sepolia provider:', rpcUrl);
  return new ethers.providers.JsonRpcProvider(
    rpcUrl,
    { chainId: bridgeConfig.sepolia.chainId, name: 'sepolia' }
  );
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
    await _sepoliaProvider.getBlockNumber();
    _sepoliaValidated = true;
  } catch (err: any) {
    const isRateLimited = err?.code === 429 ||
      err?.error?.code === 429 ||
      err?.message?.includes('429') ||
      err?.message?.includes('capacity limit') ||
      err?.code === 'NETWORK_ERROR' ||
      err?.code === 'SERVER_ERROR';

    if (isRateLimited && bridgeConfig.sepolia.rpcUrlFallback) {
      console.warn(
        '[BridgeProviders] Primary Sepolia RPC failed, switching to fallback:',
        bridgeConfig.sepolia.rpcUrlFallback
      );
      _sepoliaProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrlFallback);
      _sepoliaValidated = true;
    } else {
      throw err;
    }
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
        _validationPromise = null;
      });
  }

  await _validationPromise;
}

// Kick off validation eagerly (non-blocking) — consumers still await via ensureSepoliaProviderReady()
ensureSepoliaProviderReady();

function getSepoliaProvider(): ethers.providers.JsonRpcProvider {
  if (!_sepoliaProvider) {
    _sepoliaProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrl);
  }
  return _sepoliaProvider;
}

function getGoliathProvider(): ethers.providers.JsonRpcProvider {
  if (!_goliathProvider) {
    console.log('[BridgeProviders] Creating Goliath provider:', bridgeConfig.goliath.rpcUrl);
    _goliathProvider = new ethers.providers.JsonRpcProvider(
      bridgeConfig.goliath.rpcUrl,
      { chainId: bridgeConfig.goliath.chainId, name: 'goliath' }
    );
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

/**
 * Get balance for an address on a specific network.
 * Retries once with fallback provider if the primary RPC fails.
 */
export async function getNativeBalance(address: string, network: BridgeNetwork): Promise<bigint> {
  if (network === BridgeNetwork.SEPOLIA) await ensureSepoliaProviderReady();

  try {
    const provider = readonlyProviders[network];
    const balance = await provider.getBalance(address);
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateSepoliaIfNeeded(network);
      const provider = readonlyProviders[network];
      const balance = await provider.getBalance(address);
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

  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const balance = await contract.balanceOf(ownerAddress);
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateSepoliaIfNeeded(network);
      const provider = readonlyProviders[network];
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const balance = await contract.balanceOf(ownerAddress);
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
  const provider = readonlyProviders[network];
  return provider.getBlockNumber();
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

  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const allowance = await contract.allowance(ownerAddress, spenderAddress);
    return allowance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err)) {
      await revalidateSepoliaIfNeeded(network);
      const provider = readonlyProviders[network];
      const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      const allowance = await contract.allowance(ownerAddress, spenderAddress);
      return allowance.toBigInt();
    }
    throw err;
  }
}
