# Create useMigrationStaking Hook for Client-Side Staking

## Context
The migration flow currently relies on the backend to stake XCN tokens on Goliath after bridging. The backend does not actually perform this staking. We need a client-side hook that executes staking using the same StakedXCN contract that the Yield tab uses.

### Existing staking infrastructure (Yield tab)
- Contract ABI: `src/abis/StakedXCN.ts` — `STAKED_XCN_ABI` with `stake()` payable function
- Contract address: `src/constants/staking.ts` — `STAKED_XCN_ADDRESS[8901]`
- Contract hook: `src/hooks/yield/useStakedXCNContract.ts` — returns a Contract instance
- Staking call: `contract.stake({ value: amount })` — sends native XCN as msg.value
- Working example: `src/hooks/yield/useStake.ts` — full staking flow with error handling

### Key constraint
The staking contract is on Goliath (chain 8901). The user's wallet is connected to Sepolia (chain 11155111) during migration. The user must switch networks before staking can execute.

## Task
Create a new hook `src/hooks/migration/useMigrationStaking.ts` that:

1. Accepts parameters: `bridgedAmount: string`, `stakeOnGoliath: boolean`, `isReadyToStake: boolean` (true when bridge COMPLETED)
2. Returns: `{ executeStake, stakingStatus, stakingTxHash, stakingError, isNetworkCorrect, retry }`
3. Staking status enum: `'idle' | 'awaiting_network' | 'pending_signature' | 'tx_pending' | 'confirmed' | 'failed'`
4. When `executeStake()` is called:
   a. Check if wallet is on Goliath (chain 8901). If not, set status to `'awaiting_network'` and return.
   b. Get signer from `library.getSigner()`
   c. Create StakedXCN contract: `new ethers.Contract(STAKED_XCN_ADDRESS[8901], STAKED_XCN_ABI, signer)`
   d. Set status to `'pending_signature'`
   e. Call `contract.stake({ value: BigNumber.from(bridgedAmount) })`
   f. On tx submitted: set status to `'tx_pending'`, store `txHash`
   g. Await `tx.wait()`
   h. On success: set status to `'confirmed'`
   i. On user rejection: reset to `'idle'`
   j. On failure: set status to `'failed'`, store error message
5. `retry()` resets status to `'idle'` so `executeStake()` can be called again
6. Dispatch `migrationActions.updateOperationStatus` with `stakingTxHash` and `stakingError` as staking progresses

### Error handling
- Mirror the patterns from `useStake.ts:11-17` (`parseTransactionError`)
- Handle user rejection (code 4001 / ACTION_REJECTED) gracefully
- Set timeout for tx.wait() similar to `useMigrationTransactions.ts:70-80`

## Blockers
- `task-001-fix-operation-stakeOnGoliath.md` — need `operation.stakeOnGoliath` to be reliable in Redux

## Acceptance Checklist
- [ ] Hook created at `src/hooks/migration/useMigrationStaking.ts`
- [ ] Uses `STAKED_XCN_ABI` and `STAKED_XCN_ADDRESS` from existing constants
- [ ] Calls `contract.stake({ value: amount })` (same as Yield tab)
- [ ] Returns staking status, txHash, error, and executeStake/retry functions
- [ ] Handles network check (chain 8901)
- [ ] Handles user rejection → idle
- [ ] Handles tx failure → failed with error message
- [ ] Dispatches stakingTxHash to Redux operation
- [ ] Unit tests cover: success, rejection, failure, wrong network
- [ ] Tests are written and passing
- [ ] Code follows the project's style
