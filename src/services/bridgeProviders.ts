import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

/**
 * Read-only providers for both chains (lazy-loaded).
 * Used for balance queries and tx monitoring independent of wallet connection.
 *
 * Sepolia provider cycles through a sequential RPC list on failure.
 * A 5-minute promotion cooldown periodically re-checks higher-priority RPCs.
 */
let _sepoliaProvider: ethers.providers.JsonRpcProvider | null = null;
let _goliathProvider: ethers.providers.JsonRpcProvider | null = null;
let _sepoliaValidated = false;
let _currentRpcIndex = 0;
let _lastPromotionCheck = 0;
const PROMOTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function createSepoliaProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  console.log('[BridgeProviders] Creating Sepolia provider:', rpcUrl);
  return new ethers.providers.JsonRpcProvider(
    rpcUrl,
    { chainId: bridgeConfig.sepolia.chainId, name: 'sepolia' }
  );
}

/**
 * Validate Sepolia provider by cycling through the RPC list sequentially.
 * Starts from _currentRpcIndex, tries each URL until one succeeds.
 */
async function validateSepoliaProvider(): Promise<void> {
  if (_sepoliaValidated) return;

  const rpcUrls = bridgeConfig.sepolia.rpcUrls;

  for (let i = _currentRpcIndex; i < rpcUrls.length; i++) {
    try {
      _sepoliaProvider = createSepoliaProvider(rpcUrls[i]);
      await _sepoliaProvider.getBlockNumber();
      _currentRpcIndex = i;
      _sepoliaValidated = true;
      if (i > 0) {
        console.warn(`[BridgeProviders] Using Sepolia RPC #${i}: ${rpcUrls[i]}`);
      }
      return;
    } catch (err: any) {
      console.warn(`[BridgeProviders] Sepolia RPC #${i} failed:`, rpcUrls[i], err?.message);
      continue;
    }
  }

  // All RPCs failed — use the last one anyway and let individual calls handle errors
  _sepoliaProvider = createSepoliaProvider(rpcUrls[rpcUrls.length - 1]);
  _currentRpcIndex = rpcUrls.length - 1;
  _sepoliaValidated = true;
}

// Kick off validation eagerly (non-blocking)
validateSepoliaProvider().catch(() => {});

function getSepoliaProvider(): ethers.providers.JsonRpcProvider {
  if (!_sepoliaProvider) {
    _sepoliaProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrls[_currentRpcIndex]);
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
    err?.code === 'SERVER_ERROR' ||
    err?.code === 'TIMEOUT'
  );
}

/**
 * Advance to the next RPC in the sequence and revalidate.
 * Returns true if a new RPC was successfully validated, false if already on the last one.
 */
async function advanceSepoliaRpc(): Promise<boolean> {
  const rpcUrls = bridgeConfig.sepolia.rpcUrls;
  if (_currentRpcIndex >= rpcUrls.length - 1) return false;

  _currentRpcIndex++;
  _sepoliaValidated = false;
  await validateSepoliaProvider();
  return true;
}

/**
 * Periodically re-check higher-priority RPCs and promote back if available.
 */
async function maybePromotePrimaryRpc(): Promise<void> {
  if (_currentRpcIndex === 0) return;
  if (Date.now() - _lastPromotionCheck < PROMOTION_COOLDOWN_MS) return;
  _lastPromotionCheck = Date.now();

  try {
    const testProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrls[0]);
    await testProvider.getBlockNumber();
    // Primary is back — switch to it
    _sepoliaProvider = testProvider;
    _currentRpcIndex = 0;
    console.log('[BridgeProviders] Promoted back to primary Sepolia RPC');
  } catch {
    // Primary still down, stay on current
  }
}

/**
 * Get balance for an address on a specific network.
 * Retries once with the next RPC in sequence if the current one fails.
 */
export async function getNativeBalance(address: string, network: BridgeNetwork): Promise<bigint> {
  try {
    const provider = readonlyProviders[network];
    const balance = await provider.getBalance(address);
    if (network === BridgeNetwork.SEPOLIA) await maybePromotePrimaryRpc();
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err) && network === BridgeNetwork.SEPOLIA) {
      const advanced = await advanceSepoliaRpc();
      if (advanced) {
        const provider = readonlyProviders[network];
        const balance = await provider.getBalance(address);
        return balance.toBigInt();
      }
    }
    throw err;
  }
}

/**
 * Get ERC-20 token balance.
 * Retries once with the next RPC in sequence if the current one fails.
 */
export async function getTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const balance = await contract.balanceOf(ownerAddress);
    if (network === BridgeNetwork.SEPOLIA) await maybePromotePrimaryRpc();
    return balance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err) && network === BridgeNetwork.SEPOLIA) {
      const advanced = await advanceSepoliaRpc();
      if (advanced) {
        const provider = readonlyProviders[network];
        const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
        const balance = await contract.balanceOf(ownerAddress);
        return balance.toBigInt();
      }
    }
    throw err;
  }
}

/**
 * Get current block number for a network
 */
export async function getBlockNumber(network: BridgeNetwork): Promise<number> {
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
 * Retries once with the next RPC in sequence if the current one fails.
 */
export async function getTokenAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  try {
    const provider = readonlyProviders[network];
    const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const allowance = await contract.allowance(ownerAddress, spenderAddress);
    if (network === BridgeNetwork.SEPOLIA) await maybePromotePrimaryRpc();
    return allowance.toBigInt();
  } catch (err) {
    if (isRpcFailure(err) && network === BridgeNetwork.SEPOLIA) {
      const advanced = await advanceSepoliaRpc();
      if (advanced) {
        const provider = readonlyProviders[network];
        const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
        const allowance = await contract.allowance(ownerAddress, spenderAddress);
        return allowance.toBigInt();
      }
    }
    throw err;
  }
}
