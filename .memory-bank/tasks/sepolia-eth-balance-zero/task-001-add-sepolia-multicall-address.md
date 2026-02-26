# Add Sepolia Multicall3 Address to MULTICALL_NETWORKS

## Context
The Header component displays native ETH/XCN balance via the `useETHBalances` hook, which relies on the Multicall contract to batch `getEthBalance` calls. The `MULTICALL_NETWORKS` map in `src/constants/multicall/index.ts` has entries for Mainnet, Ropsten, Kovan, Rinkeby, Goerli, and Goliath (8901) — but NOT Sepolia (11155111). This causes `useMulticallContract()` to return `null` on Sepolia, breaking all multicall-based balance queries.

The canonical Multicall3 contract is deployed at the same address on all EVM chains: `0xcA11bde05977b3631167028862bE2a173976CA11`. This includes Sepolia.

Key files:
- `src/constants/multicall/index.ts` — the `MULTICALL_NETWORKS` mapping
- `src/hooks/useContract.ts:83-86` — `useMulticallContract()` that looks up the address
- `src/state/multicall/updater.tsx:140-141` — the updater that bails when contract is null

## Task
Add Sepolia (chain ID `11155111`) to the `MULTICALL_NETWORKS` mapping with the canonical Multicall3 address `0xcA11bde05977b3631167028862bE2a173976CA11`.

Verify that the existing `MULTICALL_ABI` (`src/constants/multicall/abi.json`) contains the `getEthBalance(address)` function and the `aggregate` function, which are required by the updater and balance hooks. The Multicall3 contract supports both — confirm the ABI is compatible.

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `MULTICALL_NETWORKS[11155111]` returns `'0xcA11bde05977b3631167028862bE2a173976CA11'`
- [ ] `useMulticallContract()` returns a non-null Contract when `chainId === 11155111`
- [ ] The existing `MULTICALL_ABI` is verified to include `getEthBalance` and `aggregate` methods
- [ ] `npm run build` succeeds with no errors
- [ ] Existing Goliath (8901) multicall functionality is unaffected
