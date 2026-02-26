# Deploy Bridge Backend with XCN Two-Way Bridging Code

## Context
The bridge backend code for XCN two-way bridging is committed (commit `79603ca`) but the K8s pods are running stale Docker images. The backend uses `imagePullPolicy: Never`, meaning Docker images must be rebuilt locally on the server.

- Server: `lon` (104.238.187.163)
- Backend repo: `~/goliath/goliath-bridge-backend`
- K8s namespace: `bridge-backend`
- Docker images: `bridge-api:latest`, `bridge-relayer:latest` (built locally)

## Task
On server `lon`:
1. Pull latest code: `cd ~/goliath/goliath-bridge-backend && git pull origin master`
2. Install dependencies: `npm ci`
3. Build TypeScript: `npm run build` (verify `dist/` has compiled output)
4. Apply Prisma migration: `npx prisma migrate deploy` (creates `XcnWithdrawIntent` table)
5. Rebuild API Docker image: `docker build -t bridge-api:latest .`
6. Rebuild relayer Docker image: `docker build -t bridge-relayer:latest -f Dockerfile.relayer .`
7. Restart API pods: `kubectl -n bridge-backend rollout restart deploy/bridge-api`
8. Restart relayer pod: `kubectl -n bridge-backend rollout restart deploy/bridge-relayer`
9. Wait for rollout: `kubectl -n bridge-backend rollout status deploy/bridge-api && kubectl -n bridge-backend rollout status deploy/bridge-relayer`
10. Verify API health: `curl -s localhost:30081/api/v1/live`
11. Verify relayer started XcnWithdrawProcessor: `kubectl -n bridge-backend logs deploy/bridge-relayer --since=2m | grep -i 'xcn\|withdraw\|started'`
12. Verify API routes: `curl -s localhost:30081/api/v1/ | jq` should list `xcnWithdrawIntent` endpoint

## Blockers
- `task-001-verify-server-state.md` — need to know current state before deploying

## Acceptance Checklist
- [ ] Code pulled to latest commit (`79603ca` or newer)
- [ ] TypeScript build succeeds
- [ ] Prisma migration applied (XcnWithdrawIntent table exists)
- [ ] Docker images rebuilt (bridge-api:latest, bridge-relayer:latest)
- [ ] bridge-api pods running and healthy (readiness probe passing)
- [ ] bridge-relayer pod running and XcnWithdrawProcessor started
- [ ] API root endpoint lists xcnWithdrawIntent routes
- [ ] Existing ETH/USDC bridge operations still work (no regression)
