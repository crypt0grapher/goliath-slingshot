# Verify On-Chain Sepolia Staking State for Test Wallet

## Context
The user reports that wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` has staked XCN on Sepolia via the CHNStaking contract at `0xc50B664BA11F5558b8FF7358bb7C576542655D54`. Before concluding the fix is complete, we need to confirm the on-chain state matches expectations.

The Sepolia contract addresses configured in the web app match the staking repo:
- CHNStaking: `0xc50B664BA11F5558b8FF7358bb7C576542655D54`
- Test XCN: `0x7a8adc542A35c93da263A188367F4bF4c445B8E9`

## Task
Run the following verification commands using `cast` (Foundry CLI) or `curl`:

1. Check staked amount:
```bash
cast call --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
  0xc50B664BA11F5558b8FF7358bb7C576542655D54 \
  "userInfo(uint256,address)" 0 0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d
```

2. Check pending rewards:
```bash
cast call --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
  0xc50B664BA11F5558b8FF7358bb7C576542655D54 \
  "pendingReward(uint256,address)" 0 0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d
```

3. Check XCN wallet balance:
```bash
cast call --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
  0x7a8adc542A35c93da263A188367F4bF4c445B8E9 \
  "balanceOf(address)" 0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d
```

4. Verify Alchemy RPC is responsive:
```bash
cast block-number --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt"
```

Document the results. If staked amount is 0, investigate whether the user staked on a different pool ID or contract.

## Blockers
No blockers (this is a verification task, independent of code changes).

## Acceptance Checklist
- [ ] Alchemy Sepolia RPC responds to `eth_blockNumber`
- [ ] `userInfo(0, wallet)` returns non-zero staked amount (confirms user's report)
- [ ] Results documented in the issue implementation log
- [ ] If staked amount is zero, root cause identified (wrong pool ID, wrong contract, different wallet, etc.)
