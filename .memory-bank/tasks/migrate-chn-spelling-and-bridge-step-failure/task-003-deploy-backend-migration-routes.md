# Deploy Backend Migration Routes to Testnet

## Context
The bridge backend at `~/goliath/goliath-bridge-backend` has migration API routes implemented:
- `POST /api/v1/migration/stake-preference` (signed intent creation)
- `POST /api/v1/migration/stake-preference/bind-origin` (bind origin tx hash)
- `GET /api/v1/migration/stats`
- `GET /api/v1/migration/history`

These routes are registered in `src/api/server.ts` and implemented in `src/api/routes/migration.ts`. However, the live deployment at `https://testnet.mirrornode.goliath.net/bridge/` appears to be running an older version that does not include these routes, causing `net::ERR_FAILED` when the frontend POSTs to `/migration/stake-preference`.

The existing bridge routes (`/api/v1/bridge/*`) work correctly at this URL.

- Backend repo: `~/goliath/goliath-bridge-backend`
- Live URL: `https://testnet.mirrornode.goliath.net/bridge/api/v1`
- Frontend expects: `POST .../migration/stake-preference` to return JSON

## Task
Deploy the current `goliath-bridge-backend` code to the testnet environment so that the migration routes become accessible.

1. Verify migration routes work locally (if local dev environment available)
2. Run the Prisma migration to add `StakeIntent` table if not already applied
3. Deploy the backend to the testnet environment
4. Verify the endpoint is reachable

## Blockers
No blockers (code is already implemented and tested).

## Acceptance Checklist
- [ ] `curl -X POST https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stake-preference -H 'Content-Type: application/json' -d '{}' -v` returns a JSON error response (400 VALIDATION_ERROR), NOT `net::ERR_FAILED`
- [ ] `GET https://testnet.mirrornode.goliath.net/bridge/api/v1/migration/stats` returns a JSON response
- [ ] CORS headers allow requests from the CoolSwap frontend origin
- [ ] Existing bridge routes (`/api/v1/bridge/status`, `/api/v1/bridge/history`) continue to work after deployment
- [ ] Prisma migration for `stake_intents` table is applied
