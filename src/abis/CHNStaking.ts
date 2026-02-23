/**
 * Minimal ABI for the CHNStaking contract.
 * Covers only the functions needed by the migration feature:
 *   - userInfo:         read staked balance and reward accounting per user/pool
 *   - pendingReward:    read outstanding unclaimed rewards
 *   - withdraw:         unstake tokens from a pool
 *   - getStakingAmount: convenience read for a user's staked amount
 *
 * Source contract: CHNStaking (EthStaking.sol)
 */
export const CHN_STAKING_ABI = [
  // userInfo(uint256 pid, address user) -> (uint256 amount, uint256 rewardDebt, uint256 pendingTokenReward)
  {
    inputs: [
      { name: 'pid', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    name: 'userInfo',
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'rewardDebt', type: 'uint256' },
      { name: 'pendingTokenReward', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // pendingReward(uint256 pid, address user) -> uint256
  {
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_user', type: 'address' },
    ],
    name: 'pendingReward',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // withdraw(uint256 pid, uint256 amount)
  {
    inputs: [
      { name: '_pid', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // getStakingAmount(uint256 pid, address user) -> uint256
  {
    inputs: [
      { name: 'pid', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    name: 'getStakingAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
