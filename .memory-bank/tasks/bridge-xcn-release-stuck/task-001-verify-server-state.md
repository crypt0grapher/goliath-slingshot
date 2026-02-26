# Verify Server State and Diagnose Deployment Gap

## Context
XCN Goliath->Sepolia bridging is stuck because the bridge backend has not been redeployed with XCN two-way bridging code. Before fixing, we need to confirm the exact state of the K8s deployment, database, and the stuck transaction.

- Server: 104.238.187.163 (hostname: `lon`)
- K8s namespace: `bridge-backend`
- Deployments: `bridge-api` (2 replicas), `bridge-relayer` (1 replica)

## Task
SSH to server `lon` and verify:
1. Current pod status: `kubectl -n bridge-backend get pods -o wide`
2. Current image hashes: `kubectl -n bridge-backend get pods -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[0].imageID}{"\n"}{end}'`
3. Whether `XcnWithdrawIntent` table exists: `kubectl -n bridge-backend exec -it bridge-db-0 -- psql -U bridge_user -d bridge_db -c "\dt"`
4. Relayer logs for XcnWithdrawProcessor: `kubectl -n bridge-backend logs deploy/bridge-relayer --since=1h | grep -i 'xcn\|withdraw'`
5. API root endpoint to check registered routes: `curl -s localhost:30081/api/v1/ | jq`
6. The stuck transaction receipt on Goliath RPC to verify the native XCN transfer

Record all outputs in the issue implementation log.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Pod status recorded
- [ ] Image hashes recorded (to compare after rebuild)
- [ ] Database table list confirmed (XcnWithdrawIntent present or absent)
- [ ] Relayer logs checked for XcnWithdrawProcessor references
- [ ] API routes confirmed (xcn-withdraw-intent present or absent)
- [ ] Stuck transaction receipt verified (to/from/value/status)
