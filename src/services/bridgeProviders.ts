import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

/**
 * Read-only providers for both chains
 * Used for balance queries and tx monitoring independent of wallet connection
 */
export const readonlyProviders: Record<BridgeNetwork, ethers.providers.JsonRpcProvider> = {
  [BridgeNetwork.SEPOLIA]: new ethers.providers.JsonRpcProvider(bridgeConfig.sepolia.rpcUrl),
  [BridgeNetwork.GOLIATH]: new ethers.providers.JsonRpcProvider(bridgeConfig.goliath.rpcUrl),
};

/**
 * Get provider for a specific network
 */
export function getReadonlyProvider(network: BridgeNetwork): ethers.providers.JsonRpcProvider {
  return readonlyProviders[network];
}

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
