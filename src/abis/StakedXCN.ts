/**
 * Minimal ABI for the StakedXCN (stXCN) contract.
 * Covers staking/unstaking, balance queries, and protocol data reads.
 */
export const STAKED_XCN_ABI = [
  // stake() — payable, sends native XCN to receive stXCN
  {
    inputs: [],
    name: 'stake',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // unstake(uint256 stXCNAmount) — burn stXCN to receive native XCN
  {
    inputs: [{ name: 'stXCNAmount', type: 'uint256' }],
    name: 'unstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // balanceOf(address) -> uint256
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // totalSupply() -> uint256
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // scaledBalanceOf(address) -> uint256
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'scaledBalanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getCumulativeIndex() -> uint256 (Ray, 27 decimals)
  {
    inputs: [],
    name: 'getCumulativeIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getRewardRate() -> uint256 (Ray)
  {
    inputs: [],
    name: 'getRewardRate',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getFeePercent() -> uint256 (basis points)
  {
    inputs: [],
    name: 'getFeePercent',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // getLastUpdateTimestamp() -> uint40
  {
    inputs: [],
    name: 'getLastUpdateTimestamp',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // paused() -> bool
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Staked event
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'xcnAmount', type: 'uint256' },
      { indexed: false, name: 'stXCNMinted', type: 'uint256' },
    ],
    name: 'Staked',
    type: 'event',
  },
  // Unstaked event
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'stXCNBurned', type: 'uint256' },
      { indexed: false, name: 'xcnReturned', type: 'uint256' },
    ],
    name: 'Unstaked',
    type: 'event',
  },
] as const;
