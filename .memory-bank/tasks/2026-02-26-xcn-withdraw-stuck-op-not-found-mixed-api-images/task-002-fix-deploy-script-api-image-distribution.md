# Fix deploy script API image distribution to all schedulable nodes

## Context
What you need to know to complete this task:
- `scripts/deploy-k8s.sh` currently transfers `bridge-api` image only to node `lon`.
- `bridge-api` deployment uses 2 replicas with anti-affinity and can schedule on both `lon` and `lon-3`.
- With `imagePullPolicy: Never`, missing image imports on one node cause stale image reuse and mixed runtime behavior.

## Task
Patch `scripts/deploy-k8s.sh` so API images are imported on every node where `bridge-api` can run (currently `lon` and `lon-3`), and ensure deployment logs clearly show both imports.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Script imports `bridge-api` image on both `lon` and `lon-3`
- [ ] Script output explicitly reports success/failure per node import
- [ ] Running `./scripts/deploy-k8s.sh all` does not leave mixed API imageIDs
- [ ] Existing relayer image transfer behavior remains correct
- [ ] Tests are written and passing
- [ ] Code follows the project's style
