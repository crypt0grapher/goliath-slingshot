# Refactor Yield Hooks to Use Readonly Goliath Provider

## Context
The Yield/Staking hooks (`useStakedXCNContract`, `useYieldData`, `useStakingEvents`) use the wallet's `library` provider from `useActiveWeb3React()` to make read-only contract calls. This causes `NETWORK_ERROR` when the wallet is connected to Sepolia (chain 11155111) instead of Goliath (chain 8901), because the wallet's provider cannot detect the Goliath network.

The Bridge tab solves this correctly by using explicit readonly providers created via `src/services/bridgeProviders.ts`:
```typescript
new ethers.providers.JsonRpcProvider(rpcUrl, { chainId, name })
```
This pattern passes explicit network metadata, skipping ethers v5's auto-detection.

The Yield hooks should follow the same pattern for read calls, while keeping the wallet's `library` for write/signer operations (stake, unstake).

This is in `~/goliath/CoolSwap-interface`.

## Task
Refactor `src/hooks/yield/useStakedXCNContract.ts` to:
1. Export two hooks or one hook with a mode parameter:
   - **Read-only mode**: Creates contract with `getReadonlyProvider(BridgeNetwork.GOLIATH)` from `src/services/bridgeProviders.ts`
   - **Signer mode**: Creates contract with wallet's `library` provider (existing behavior, used for `stake()` and `unstake()` transactions)
2. Update `src/hooks/yield/useYieldData.ts` to use the read-only contract
3. Update `src/hooks/yield/useStakingEvents.ts` to use the read-only contract
4. Keep write operations (in Yield page transaction handlers) using the signer contract

## Blockers
- `task-001-set-stxcn-address.md` — address must be set before the provider can create a valid contract

## Acceptance Checklist
- [ ] Read-only yield hooks use `getReadonlyProvider(BridgeNetwork.GOLIATH)` with explicit network metadata
- [ ] Write/signer hooks still use wallet's `library` provider for transactions
- [ ] No `NETWORK_ERROR` when wallet is on Sepolia and Yield page loads
- [ ] `useYieldData` successfully fetches protocol data (totalSupply, rewardRate, etc.)
- [ ] Tests are written and passing
- [ ] Code follows the project's style (matches Bridge provider pattern)
