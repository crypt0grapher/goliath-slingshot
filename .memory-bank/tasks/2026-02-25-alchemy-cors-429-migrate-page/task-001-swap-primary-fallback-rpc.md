# Swap Primary and Fallback Sepolia RPC URLs

## Context
The Alchemy Sepolia API key (`KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt`) has exceeded its monthly capacity limit, causing HTTP 429 errors for all frontend RPC requests. The PublicNode fallback (`https://ethereum-sepolia-rpc.publicnode.com`) works correctly with no rate limits and permissive CORS (`*`).

Currently Alchemy is the primary and PublicNode is the fallback. We need to swap them so PublicNode is used first, and Alchemy serves as the backup (for when/if the plan is upgraded).

Two files need changes:
- `.env` — runtime configuration (read at CRA build time)
- `src/config/bridgeConfig.ts` — hardcoded default values (used when env vars are missing)

## Task
1. In `.env` (lines 28-29), swap the values:
   - `REACT_APP_SEPOLIA_RPC_URL` → set to `https://ethereum-sepolia-rpc.publicnode.com`
   - `REACT_APP_SEPOLIA_RPC_URL_FALLBACK` → set to `https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt`

2. In `src/config/bridgeConfig.ts` (lines 36-37), swap the hardcoded defaults:
   - `rpcUrl` default → `'https://ethereum-sepolia-rpc.publicnode.com'`
   - `rpcUrlFallback` default → `'https://eth-sepolia.g.alchemy.com/v2/demo'`

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `.env` has PublicNode as `REACT_APP_SEPOLIA_RPC_URL`
- [ ] `.env` has Alchemy as `REACT_APP_SEPOLIA_RPC_URL_FALLBACK`
- [ ] `bridgeConfig.ts` default for `rpcUrl` is PublicNode
- [ ] `bridgeConfig.ts` default for `rpcUrlFallback` is Alchemy demo
- [ ] `yarn build` succeeds
- [ ] No other files reference the old primary/fallback order in a way that would break
