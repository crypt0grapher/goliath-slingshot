# Add Backend Sepolia RPC Fallback URLs

## Context
The bridge backend (`goliath-bridge-backend`) uses the same Alchemy Sepolia API key as the frontend. This key has exceeded its monthly capacity (HTTP 429). The backend's provider setup in `src/chains/providers.ts` supports a `FallbackProvider` pattern with `SEPOLIA_RPC_URLS` (comma-separated fallback URLs), but this environment variable is not currently configured.

Key files:
- `goliath-bridge-backend/.env` — currently only has `SEPOLIA_RPC_URL` (Alchemy), no `SEPOLIA_RPC_URLS`
- `goliath-bridge-backend/src/chains/providers.ts:33-87` — `createSepoliaProvider()` with FallbackProvider support
- `goliath-bridge-backend/src/config/index.ts` — config schema with `rpcUrls` (from `SEPOLIA_RPC_URLS`)

The backend does NOT serve balance data to the frontend, but it uses the Sepolia provider for:
- Event watching (deposit events on Sepolia bridge contract)
- Transaction status checking
- Health checks (`/api/v1/health`)

If the Sepolia RPC is down, bridge operations stall.

## Task
Add `SEPOLIA_RPC_URLS=https://ethereum-sepolia-rpc.publicnode.com` to the backend's `.env` file (and equivalent production config). This activates the existing `FallbackProvider` logic in `createSepoliaProvider()`.

Optionally, add additional public Sepolia RPC endpoints for redundancy:
- `https://rpc.sepolia.org`
- `https://sepolia.drpc.org`

## Blockers
No blockers (independent of frontend fixes).

## Acceptance Checklist
- [ ] `SEPOLIA_RPC_URLS` is set in the backend's environment configuration
- [ ] Backend starts successfully with the new configuration
- [ ] `/api/v1/health` endpoint returns healthy status for both Sepolia and Goliath providers
- [ ] If primary Alchemy RPC fails, the FallbackProvider switches to publicnode.com transparently
- [ ] Event watcher continues to function during RPC failover
