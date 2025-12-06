// Bridge Contract ABIs

export const BRIDGE_SEPOLIA_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'destinationAddress', type: 'address' },
    ],
    name: 'deposit',
    outputs: [{ name: 'depositId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'destinationAddress', type: 'address' }],
    name: 'depositNative',
    outputs: [{ name: 'depositId', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'depositId', type: 'bytes32' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'destinationAddress', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint64' },
      { indexed: false, name: 'sourceChainId', type: 'uint64' },
    ],
    name: 'Deposit',
    type: 'event',
  },
];

export const BRIDGE_GOLIATH_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'destinationAddress', type: 'address' },
    ],
    name: 'burn',
    outputs: [{ name: 'withdrawId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'withdrawId', type: 'bytes32' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'destinationAddress', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint64' },
      { indexed: false, name: 'sourceChainId', type: 'uint64' },
    ],
    name: 'Withdraw',
    type: 'event',
  },
];

// Standard ERC-20 ABI for approval and balance checking
export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: 'remaining', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: 'success', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
];
