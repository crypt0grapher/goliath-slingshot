# Refactor Yield Layout to Always Show Protocol Stats

## Context
`src/pages/Yield/index.tsx` currently returns early for disconnected and wrong-network states, which prevents `ProtocolStats` from rendering. The goal is to keep read-only protocol metrics visible while preserving staking action gates.

## Task
Refactor the Yield page into a shared layout where protocol-level sections (header and stats) are always mounted. Keep stake/unstake forms and transaction actions conditionally rendered only for connected wallets on chain 8901.

Avoid duplicating `ProtocolStats` markup in multiple return branches.

## Blockers
- `task-001-add-failing-yield-page-visibility-tests.md` — ensures regression is captured before refactor

## Acceptance Checklist
- [ ] `Total Staked` and `Net APY` render in disconnected state
- [ ] `Total Staked` and `Net APY` render in wrong-network state
- [ ] Stake/Unstake interactions remain gated to connected wallet on Goliath
- [ ] No duplicated stats JSX across multiple return branches
- [ ] Tests are written and passing
- [ ] Code follows the project's style
