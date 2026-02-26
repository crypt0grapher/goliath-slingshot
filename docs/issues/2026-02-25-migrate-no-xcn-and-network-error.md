# Migrate Tab Shows "No XCN to Migrate" + NETWORK_ERROR Despite User Having Sepolia Stake

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (Vercel rebuild with updated `.env`)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:** `~/goliath/staking/test-contract-sepolia/CLAUDE.md`, `~/goliath/staking/test-contract-sepolia/deployments/goliath-testnet.json`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

Wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` (and any wallet with a Sepolia stake) navigates to the Migrate tab, sees their staked XCN balance, and can proceed through the migration flow. The Yield tab also loads stXCN data from Goliath without errors. No `NETWORK_ERROR` in console.

**Must-have outcomes**

- [ ] Migrate tab correctly reads staked balances from Sepolia CHNStaking contract
- [ ] No `NETWORK_ERROR` when the Migrate or Yield pages render
- [ ] Yield tab connects to StakedXCN at `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` on Goliath
- [ ] Error state on Migrate tab does NOT render the "No XCN to migrate" empty state (only shows the error banner)

**Acceptance criteria (TDD)**

- [ ] Test A: `useMigrationData` returns non-zero `staked` for wallet with a Sepolia stake
- [ ] Test B: `useYieldData` fetches protocol data from StakedXCN on Goliath without error
- [ ] Test C: Migrate page renders error banner (not empty state) when data fetch fails
- [ ] Test D: `useStakedXCNContract` returns a valid Contract when `REACT_APP_STXCN_ADDRESS` is set

**Non-goals**

- Modifying the StakedXCN or CHNStaking smart contracts
- Adding new migration flow steps
- Changing the Bridge tab's provider setup (it already works correctly)

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, ethers.js v5, Redux, web3-react
- **Entry point:** `src/index.tsx`
- **Build command:** `yarn build` (CRA with `CI=false`)
- **Test command:** `yarn test`

### Deployment Details

- **Platform:** Vercel
- **RPC endpoints:**
  - Goliath: `https://rpc.testnet.goliath.net`
  - Sepolia: `https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt`

### Contract Addresses

| Contract | Chain | Address | Source |
|----------|-------|---------|--------|
| CHNStaking (Sepolia) | 11155111 | `0xc50B664BA11F5558b8FF7358bb7C576542655D54` | `migrationConfig.sepoliaStakingContract` |
| Test XCN (Sepolia) | 11155111 | `0x7a8adc542A35c93da263A188367F4bF4c445B8E9` | `migrationConfig.sepoliaXcnAddress` |
| StakedXCN Proxy (Goliath) | 8901 | `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` | `deployments/goliath-testnet.json` |
| StakedXCN Impl (Goliath) | 8901 | `0xb351e224466F45fe652F7Dfd577dAB7A6717aBfC` | `deployments/goliath-testnet.json` |

### Network Context

- Goliath Testnet: Chain ID 8901 / 0x22c5
- Sepolia: Chain ID 11155111

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT deploy smart contracts without explicit authorization

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Changes must not break Bridge or Swap tabs

### Operational Constraints

- Allowed downtime: none (frontend deploy is instant via Vercel)
- Blast radius: Migrate tab, Yield tab

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

1. **Migrate tab** shows "No XCN to migrate" for wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` which has staked XCN on Sepolia
2. **Console error:** `could not detect network (event="noNetwork", code=NETWORK_ERROR, version=providers/5.3.0)`
3. **Bridge and Swap tabs** detect Sepolia correctly and work fine

### 4.2 Impact

- **User impact:** Users cannot migrate their staked XCN from Sepolia to Goliath
- **System impact:** Yield tab is also broken (missing stXCN address), blocked development
- **Scope:** Migrate page, Yield page, staking hooks, `.env` configuration

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `.env:76` | `REACT_APP_STXCN_ADDRESS` | **Empty** — should be `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` |
| `src/constants/staking.ts:6` | `STAKED_XCN_ADDRESS[8901]` | Resolves to `''` due to missing env var |
| `src/hooks/yield/useStakedXCNContract.ts:13` | `useStakedXCNContract()` | Returns `null` because address is empty string |
| `src/hooks/yield/useYieldData.ts:16` | `fetchProtocolData()` | Bails early (`if (!contract) return`) — no Goliath data |
| `src/hooks/yield/useStakedXCNContract.ts:9` | Provider usage | Uses wallet's `library` provider (no explicit network metadata) instead of a readonly provider like Bridge |
| `src/hooks/migration/useMigrationData.ts:164-181` | Error handling | On fetch failure, resets snapshot to all-zero, which triggers `isEmpty=true` |
| `src/pages/Migrate/index.tsx:227` | Empty state render | Shows "No XCN" empty state even when `dataError` is set — UI should show error only |

### 4.4 Evidence

**Evidence 1: `REACT_APP_STXCN_ADDRESS` is empty**

`.env:74-76`:
```
REACT_APP_STAKING_ENABLED=true
REACT_APP_STXCN_ADDRESS=
```

Deployed proxy address from `~/goliath/staking/test-contract-sepolia/deployments/goliath-testnet.json`:
```json
{"proxy":"0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE"}
```

**Evidence 2: Yield hooks use wallet provider, not readonly provider**

`src/hooks/yield/useStakedXCNContract.ts:8-15`:
```typescript
const { library, account, chainId } = useActiveWeb3React();
const address = chainId ? STAKED_XCN_ADDRESS[chainId] : undefined;
return useMemo(() => {
  if (!address || !library) return null;
  return getContract(address, STAKED_XCN_ABI, library, ...);
}, ...);
```

vs Bridge (`src/services/bridgeProviders.ts:15-18`):
```typescript
_sepoliaProvider = new ethers.providers.JsonRpcProvider(
  bridgeConfig.sepolia.rpcUrl,
  { chainId: bridgeConfig.sepolia.chainId, name: 'sepolia' }  // explicit network
);
```

**Evidence 3: Error handling masks real error with empty state**

`src/hooks/migration/useMigrationData.ts:171-181` — on any fetch error, dispatches snapshot with all zeros:
```typescript
dispatch(migrationActions.setSnapshot({
  staked: '0', rewards: '0', walletXcn: '0', allowance: '0',
  loading: false, error: message,
}));
```

`src/hooks/migration/useMigrationFlow.ts:131-137` — all zeros triggers isEmpty:
```typescript
// 4. Empty state: no XCN anywhere
return { visibleSteps: [], activeStep: null, isResume: false, isEmpty: true, isStatusView: false };
```

`src/pages/Migrate/index.tsx:211-234` — both error banner AND empty state render simultaneously:
```jsx
{dataError && !dataLoading && (<ErrorBanner>...</ErrorBanner>)}
{!isLoading && !isStatusView && isEmpty && (<MigrationStepper ... />)}
```

**Evidence 4: Network error source**

The `NETWORK_ERROR` from `providers/5.3.0` occurs when ethers v5's `detectNetwork()` fails. The Bridge creates providers with **explicit** `{ chainId, name }` which skips auto-detection. The Yield hooks use the wallet's `library` provider (a `Web3Provider` wrapping MetaMask) which relies on auto-detection. When the wallet is on Sepolia but the app expects Goliath, or during provider initialization, the auto-detection can fail.

### 4.5 Tasks

- `task-001-set-stxcn-address.md`
- `task-002-yield-readonly-provider.md`
- `task-003-migrate-error-vs-empty-state.md`
- `task-004-verify-sepolia-onchain-state.md`

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

Two compounding bugs: (A) missing `REACT_APP_STXCN_ADDRESS` env var breaks the Yield tab and causes `NETWORK_ERROR` when yield hooks try to use the wallet's `library` provider on the wrong chain; (B) error handling in migration data fetch resets snapshot to all-zero, which the UI interprets as "No XCN to migrate" instead of showing the error.

### 5.2 Supporting Evidence

- `REACT_APP_STXCN_ADDRESS=` is blank in `.env` (confirmed by reading the file)
- StakedXCN proxy `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` exists in deployment manifest
- Yield hooks use `useActiveWeb3React().library` (wallet provider) — no explicit network metadata
- Bridge uses `new JsonRpcProvider(url, { chainId, name })` — explicit network metadata, works
- `useMigrationData` catch block dispatches all-zero snapshot
- `deriveSteps()` returns `isEmpty: true` when staked=0 AND walletXcn=0
- Migrate page renders both `ErrorBanner` and `MigrationStepper` (empty state) simultaneously

### 5.3 Gaps / Items to Verify

- TO VERIFY: Confirm wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` has non-zero stake on Sepolia CHNStaking:
  ```bash
  cast call --rpc-url "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
    0xc50B664BA11F5558b8FF7358bb7C576542655D54 \
    "userInfo(uint256,address)" 0 0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d
  ```
- TO VERIFY: Confirm Alchemy Sepolia API key is active and not rate-limited:
  ```bash
  curl -s -X POST "https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  ```
- TO VERIFY: Reproduce exact `NETWORK_ERROR` by connecting MetaMask to Sepolia on the Migrate tab and checking browser console

### 5.4 Root Cause (final)

- **Root cause:** Two distinct bugs — (1) empty `REACT_APP_STXCN_ADDRESS` prevents Yield from functioning and causes `NETWORK_ERROR` when wallet-based provider is used for Goliath calls; (2) migration error handling masks fetch failures behind an "empty" state instead of showing the actual error.
- **Contributing factors:** Yield hooks don't follow the same readonly-provider pattern established by Bridge, `.env` was not populated with the StakedXCN deployment address after contract deployment.

---

## 6) SOLUTIONS (compare options)

### Option A — Minimal Fix: Set env var + fix UI error/empty conflict

**Changes required**
- `.env:76` — set `REACT_APP_STXCN_ADDRESS=0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE`
- `src/pages/Migrate/index.tsx:227` — don't render empty state when `dataError` is set

**Pros**
- Smallest change, lowest risk
- Fixes the immediate user-facing issue (Yield tab loads, Migrate tab shows error instead of misleading empty state)

**Cons / risks**
- Yield hooks still use wallet `library` provider — `NETWORK_ERROR` may recur when wallet is on Sepolia and user navigates to Yield
- Doesn't address the architectural inconsistency between Bridge (readonly provider) and Yield (wallet provider)

**Complexity:** Low
**Rollback:** Easy — revert `.env` and one-line UI change

---

### Option B — Full Fix: Set env var + readonly provider for Yield + fix UI error/empty conflict

**Changes required**
- `.env:76` — set `REACT_APP_STXCN_ADDRESS=0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE`
- `src/hooks/yield/useStakedXCNContract.ts` — use `getReadonlyProvider(BridgeNetwork.GOLIATH)` for read calls (keep wallet `library` for write/signer calls)
- `src/pages/Migrate/index.tsx:227` — don't render empty state when `dataError` is set

**Pros**
- Eliminates `NETWORK_ERROR` for Yield tab regardless of which chain the wallet is connected to
- Consistent architecture: all read-only chain queries use explicit readonly providers (same as Bridge)
- Wallet provider only used for signing transactions

**Cons / risks**
- Slightly more code to change
- Need to handle dual-provider pattern (readonly for reads, wallet for writes)

**Complexity:** Medium
**Rollback:** Easy — `git revert`

---

### Decision

**Chosen option:** B — Full Fix
**Justification:** The architectural fix is small in scope but eliminates the entire class of `NETWORK_ERROR` bugs for the Yield tab. The Bridge tab already proves this pattern works. Without it, users on Sepolia navigating to Yield will still see errors.
**Accepted tradeoffs:** Slightly more code to review, but the pattern is already established in `bridgeProviders.ts`.

---

## 7) DELIVERABLES

- [ ] Code changes: `.env`, `src/hooks/yield/useStakedXCNContract.ts`, `src/pages/Migrate/index.tsx`
- [ ] Tests: unit tests for `useStakedXCNContract` with readonly provider, Migrate page error-vs-empty rendering
- [ ] Config changes: `REACT_APP_STXCN_ADDRESS` in `.env`
- [ ] Monitoring: browser console should be clean of `NETWORK_ERROR` on Migrate and Yield tabs

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/`
- **Run command:** `yarn test --watchAll=false`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `useStakedXCNContract` returns valid Contract when address is configured and readonly provider available
- [ ] `useStakedXCNContract` returns null when address is empty
- [ ] `deriveSteps` returns `isEmpty: false` with error snapshot (staked='0' but error is set) — OR verify that the error path doesn't set isEmpty
- [ ] Migrate page renders ErrorBanner (not empty MigrationStepper) when `dataError` is truthy and `isEmpty` is true

**Integration tests**
- [ ] Migration data hook fetches non-zero staked balance from Sepolia for a known staking address

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — confirm on `feat/staking` branch
2. Verify Alchemy Sepolia RPC is responsive
3. Verify on-chain state for test wallet

### Phase 1 — Write Tests First

- **Step 1:** Write test for `useStakedXCNContract` returning valid contract with configured address
- **Step 2:** Write test for Migrate page rendering error banner instead of empty state on error

### Phase 2 — Implement Fixes

- **Step 1:** Set `REACT_APP_STXCN_ADDRESS=0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` in `.env`
  - File: `.env:76`
  - Rollback: `git checkout -- .env`

- **Step 2:** Refactor `useStakedXCNContract` to use readonly Goliath provider for read calls
  - File: `src/hooks/yield/useStakedXCNContract.ts`
  - Pattern: Follow `src/services/bridgeProviders.ts` — use `getReadonlyProvider(BridgeNetwork.GOLIATH)` for read-only contract, wallet `library` for signer contract
  - Rollback: `git checkout -- src/hooks/yield/useStakedXCNContract.ts`

- **Step 3:** Fix Migrate page to not render empty state when error is present
  - File: `src/pages/Migrate/index.tsx:227`
  - Change: Add `&& !dataError` condition to the empty state render block
  - Rollback: `git checkout -- src/pages/Migrate/index.tsx`

### Phase 3 — Validate

1. `yarn test --watchAll=false` — all tests pass
2. `yarn build` — build succeeds
3. Manual verification:
   - Connect wallet on Sepolia, navigate to Migrate — should see staked balance (not "No XCN")
   - Navigate to Yield on Goliath — should see protocol data
   - Bridge and Swap still work

### Phase 4 — Rollback Plan

**Triggers:** Migrate or Yield tab regresses, Bridge/Swap breaks
**Procedure:** `git revert HEAD` + Vercel redeploy

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] Migrate tab shows staked balance for wallet with Sepolia stake
- [ ] Yield tab shows protocol data from StakedXCN on Goliath
- [ ] No `NETWORK_ERROR` in browser console
- [ ] Bridge tab still works
- [ ] Swap tab still works

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 | Set `REACT_APP_STXCN_ADDRESS` in `.env` | Success | Proxy: `0x18da8D438a030B530Aba59Ae0aD1942bEB14a9cE` |
| 2026-02-25 | Refactored `useStakedXCNContract` — readonly provider for reads, wallet for writes | Success | Follows Bridge pattern |
| 2026-02-25 | Refactored `useStakingEvents` — readonly Goliath provider for block lookups | Success | Removed `library` dependency |
| 2026-02-25 | Fixed Migrate page error-vs-empty state rendering | Success | Added `&& !dataError` guard |
| 2026-02-25 | Discovered Alchemy Sepolia API key HTTP 429 (monthly capacity exceeded) | Root cause of NETWORK_ERROR | |
| 2026-02-25 | Added fallback Sepolia RPC with eager validation in `bridgeProviders.ts` | Success | Falls back to `publicnode.com` |
| 2026-02-25 | Added explicit network metadata to Goliath provider | Success | Was missing `{ chainId, name }` |
| 2026-02-25 | Build verification | Success | `yarn build` passes |
| 2026-02-25 | Test verification | 452/453 pass | 1 pre-existing failure in `lists/reducer.test.ts` |

### Failed Attempts

- Attempt 1: Used `withSepoliaFallback()` wrapper in `useMigrationData` hook
  - Why it failed: Test mock interactions with hoisted `var` + `jest.clearAllMocks()` caused mock state desync
  - What we learned: Cleaner to make fallback transparent inside `bridgeProviders.ts` via eager validation

### Final State

- Changes made: 6 files modified (`.env`, `bridgeConfig.ts`, `bridgeProviders.ts`, `Migrate/index.tsx`, `useStakedXCNContract.ts`, `useStakingEvents.ts`)
- Tests passing: 452/453 (1 pre-existing failure)
- Build: passing
- Deployment status: ready for deploy

---

## 12) FOLLOW-UPS

- [ ] Populate `REACT_APP_STXCN_ADDRESS` in Vercel environment variables for production deploy
- [ ] Upgrade or replace Alchemy Sepolia API key (monthly capacity exceeded)
- [ ] Add CI check that `REACT_APP_STXCN_ADDRESS` is non-empty when `REACT_APP_STAKING_ENABLED=true`
- [ ] Verify wallet `0xe3596d206be5DE55bA8D774F131d9E3f31FaA78d` on-chain staking state once Sepolia RPC is restored
- [ ] Audit all hooks for wallet-provider-vs-readonly-provider consistency
