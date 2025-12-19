import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

/**
 * Read-only providers for both chains (lazy-loaded)
 * Used for balance queries and tx monitoring independent of wallet connection
 */
let _sepoliaProvider: ethers.providers.JsonRpcProvider | null = null;
let _goliathProvider: ethers.providers.JsonRpcProvider | null = null;

function getSepoliaProvider(): ethers.providers.JsonRpcProvider {
  if (!_sepoliaProvider) {
    console.log('[BridgeProviders] Creating Sepolia provider:', bridgeConfig.sepolia.rpcUrl);
    _sepoliaProvider = new ethers.providers.JsonRpcProvider(bridgeConfig.sepolia.rpcUrl);
  }
  return _sepoliaProvider;
}

function getGoliathProvider(): ethers.providers.JsonRpcProvider {
  if (!_goliathProvider) {
    console.log('[BridgeProviders] Creating Goliath provider:', bridgeConfig.goliath.rpcUrl);
    _goliathProvider = new ethers.providers.JsonRpcProvider(bridgeConfig.goliath.rpcUrl);
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
 * Get balance for an address on a specific network
 */
export async function getNativeBalance(address: string, network: BridgeNetwork): Promise<bigint> {
  const provider = readonlyProviders[network];
  const balance = await provider.getBalance(address);
  return balance.toBigInt();
}

/**
 * Get ERC-20 token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  const provider = readonlyProviders[network];

  // Debug: verify provider network
  try {
    const providerNetwork = await provider.getNetwork();
    console.log('[BridgeProviders] getTokenBalance - provider chainId:', providerNetwork.chainId, 'expected:', network);
  } catch (e) {
    console.error('[BridgeProviders] Failed to get provider network:', e);
  }

  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const balance = await contract.balanceOf(ownerAddress);
  return balance.toBigInt();
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
 * Get token allowance
 */
export async function getTokenAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  const provider = readonlyProviders[network];
  const erc20Abi = ['function allowance(address owner, address spender) view returns (uint256)'];
  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const allowance = await contract.allowance(ownerAddress, spenderAddress);
  return allowance.toBigInt();
}
