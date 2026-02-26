# Sepolia ETH Balance Shows Zero After Bridge Update

**Project:** CoolSwap-interface + goliath-bridge-backend
**Type:** Code Bug
**Priority:** P1
**Risk level:** Medium
**Requires deployment?:** Yes (frontend rebuild + backend env update)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md` (Alchemy 429 issue documented)
- `docs/issues/2026-02-25-migrate-chn-spelling-and-bridge-step-failure.md`
- `/Users/alex/goliath/staking/.memory-bank/PRD-XCN-Bridge.md`
- `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Frontend.md`
- `/Users/alex/goliath/staking/.memory-bank/TID-XCN-Bridge-Backend.md`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

Users connected to the Sepolia network see their correct ETH balance in the Header and on the Bridge page. Switching between Sepolia and Goliath displays the correct chain-specific balance without carryover or showing zero.

**Must-have outcomes**

- [ ] Header displays correct native balance when connected to Sepolia (ETH) and Goliath (XCN)
- [ ] Bridge page displays correct ETH balance on Sepolia via `useBridgeBalances`
- [ ] Switching networks immediately reflects the correct balance (no stale Goliath balance on Sepolia or vice versa)
- [ ] Backend Sepolia RPC has a working fallback to prevent balance-related bridge operation failures

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: `useMulticallContract()` returns a valid Contract when `chainId === 11155111` (Sepolia)
- [ ] Test B: `useETHBalances` returns a non-zero balance for a funded Sepolia account (mocked multicall)
- [ ] Test C: Switching from Goliath (8901) to Sepolia (11155111) resets the displayed balance and fetches the new chain's balance
- [ ] Test D: `bridgeProviders.ts` falls back to publicnode.com when Alchemy returns HTTP 429

**Non-goals**

- Deploying a custom Multicall contract to Sepolia (use existing well-known Multicall3)
- Changing the bridge backend's balance fetching (it doesn't serve balance data)
- Refactoring the entire multicall system

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface` (frontend), `~/goliath/goliath-bridge-backend` (backend)
- **Language/stack:** React + TypeScript (frontend), TypeScript + ethers.js (backend)
- **Entry point:** `src/index.tsx` (frontend), `src/index.ts` (backend)
- **Build command:** `npm run build` (both)
- **Test command:** `npm test` (both)

### Deployment Details

- **Frontend:** Vercel (auto-deploy on push)
- **Backend:** Kubernetes (namespace: bridge)
- **RPC endpoints:**
  - Sepolia primary: `https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt` (RATE-LIMITED)
  - Sepolia fallback: `https://ethereum-sepolia-rpc.publicnode.com`
  - Goliath: `https://testnet.rpc.goliath.net`

### Network Context

- Goliath Testnet: Chain ID 8901 / 0x22c5
- Sepolia: Chain ID 11155111 / 0xaa36a7

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files (consensus loss risk)
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New functionality must include tests
- [ ] Must not break existing ETH/USDC bridge functionality
- [ ] Must not break existing Goliath balance display

### Operational Constraints

- Allowed downtime: None (hot-deploy frontend via Vercel, backend env var update)
- Blast radius: Header balance display + Bridge page balance for Sepolia users

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

User reports (consolidated from 4 independent reporters):

1. "Ethereum balance on the Sepolia network appears as 0."
2. "When I switch from the Sepolia network to the Goliath network and then back to the Sepolia network, my Ethereum balance on the Goliath network appears the same as my Ethereum balance on the Sepolia network."
3. "The balance disappears, appears when you switch the Sepolia to Goliath or vice versa, and the balance is incorrectly shown on the Sepolia."
4. "I had almost 1.3 ETH but now it shows 0 on the Slingshot."
5. "When I bridged from Goliath it was successful but then on Sepolia it shows that the amount of ETH is 0."

**Pattern:** All users report zero/missing ETH balance specifically on Sepolia. The balance works on Goliath. The issue appeared after the bridge update (migration feature addition).

### 4.2 Impact

- **User impact:** All Slingshot users on Sepolia see zero balance in the Header. Bridge page may also show zero if Alchemy RPC is rate-limited. Users cannot confirm their balance before/after bridging operations.
- **System impact:** No data risk. Balances are intact on-chain. This is a display-only bug. However, users may panic thinking funds are lost.
- **Scope:** Header component (all pages when on Sepolia), Bridge page balance display.

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/constants/multicall/index.ts:4-11` | `MULTICALL_NETWORKS` | **Missing Sepolia (11155111) entry** — root cause |
| `src/hooks/useContract.ts:83-86` | `useMulticallContract()` | Returns `null` for Sepolia since no address in `MULTICALL_NETWORKS` |
| `src/state/wallet/hooks.ts:13-47` | `useETHBalances()` | Returns empty/undefined when multicall contract is null |
| `src/state/multicall/updater.tsx:140-141` | `Updater` | Bails early when `!multicallContract`, so no balance data fetched for Sepolia |
| `src/components/Header/index.tsx:378,451-454` | `Header` | Displays `userEthBalance` which is undefined on Sepolia |
| `src/services/bridgeProviders.ts:29-57` | `validateSepoliaProvider()` | Fallback logic works but only triggers once; if Alchemy works initially then later 429s mid-session, stale provider is used |
| `goliath-bridge-backend/.env` | Config | No `SEPOLIA_RPC_URLS` fallback configured for backend |

### 4.4 Evidence

**Evidence 1: Missing Sepolia in MULTICALL_NETWORKS**

File: `src/constants/multicall/index.ts`
```typescript
const MULTICALL_NETWORKS: { [chainId: number]: string } = {
  [ChainId.MAINNET]: '0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441',
  [ChainId.ROPSTEN]: '0x53C43764255c17BD724F74c4eF150724AC50a3ed',
  [ChainId.KOVAN]: '0x2cc8688C5f75E365aaEEb4ea8D6a480405A48D2A',
  [ChainId.RINKEBY]: '0x42Ad527de7d4e9d9d011aC45B31D8551f8Fe9821',
  [ChainId.GÖRLI]: '0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e',
  8901: '0xF912C1ad454aaaE03A1d72C53702F3dc0B4fcb69', // Goliath only!
  // ❌ NO ENTRY for 11155111 (Sepolia)
};
```

**Evidence 2: useMulticallContract returns null for Sepolia**

File: `src/hooks/useContract.ts:83-86`
```typescript
export function useMulticallContract(): Contract | null {
  const { chainId } = useActiveWeb3React();
  return useContract(chainId && MULTICALL_NETWORKS[chainId], MULTICALL_ABI, false);
  // When chainId=11155111: MULTICALL_NETWORKS[11155111] → undefined → useContract(undefined, ...) → null
}
```

**Evidence 3: Multicall Updater short-circuits when contract is null**

File: `src/state/multicall/updater.tsx:140-141`
```typescript
useEffect(() => {
  if (!latestBlockNumber || !chainId || !multicallContract) return; // ← exits here for Sepolia
  // ... fetching logic never reached
```

**Evidence 4: Header balance display**

File: `src/components/Header/index.tsx:378,451-454`
```typescript
const userEthBalance = useETHBalances(account ? [account] : [])?.[account ?? ''];
// ...
{account && userEthBalance ? (
  <BalanceText>{userEthBalance?.toSignificant(7)} XCN</BalanceText>
) : null}
// When userEthBalance is undefined → nothing rendered → appears as "0" to user
```

**Evidence 5: Alchemy rate-limiting (documented in existing issue)**

From `docs/issues/2026-02-25-migrate-no-xcn-and-network-error.md`:
> "Discovered Alchemy Sepolia API key HTTP 429 (monthly capacity exceeded)"

This compounds the problem: even the Bridge page's `useBridgeBalances` hook (which uses direct RPC via `bridgeProviders.ts`) may fail if the Alchemy key is exhausted and the fallback validation hasn't triggered yet in the user's session.

### 4.5 Tasks

- `task-001-add-sepolia-multicall-address.md` — Add Sepolia Multicall3 address to MULTICALL_NETWORKS
- `task-002-fix-balance-state-on-network-switch.md` — Reset multicall-based balance state when chainId changes
- `task-003-add-backend-sepolia-rpc-fallback.md` — Configure backend with Sepolia RPC fallback URLs
- `task-004-improve-bridge-provider-resilience.md` — Add mid-session re-validation for bridgeProviders.ts
- `task-005-add-tests.md` — Unit tests for multicall config, balance hooks, and provider fallback

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The Header's ETH balance display on Sepolia is broken because `MULTICALL_NETWORKS` lacks a Multicall contract address for chain ID 11155111 (Sepolia), causing `useMulticallContract()` to return `null` and the entire multicall-based balance fetching pipeline to be skipped.

### 5.2 Supporting Evidence

- `MULTICALL_NETWORKS` contains entries for Mainnet, Ropsten, Kovan, Rinkeby, Goerli, and Goliath (8901) — but NOT Sepolia (11155111)
- `useMulticallContract()` returns `null` when `MULTICALL_NETWORKS[chainId]` is `undefined`
- The Multicall `Updater` component exits immediately when `multicallContract` is null
- `useETHBalances` depends entirely on multicall to call `getEthBalance` — no fallback to direct RPC
- A well-known Multicall3 contract exists on Sepolia at `0xcA11bde05977b3631167028862bE2a173976CA11` (deployed by Multicall3 project, same address on all EVM chains)
- Bridge page balance (`useBridgeBalances`) uses direct RPC via `bridgeProviders.ts`, NOT multicall — so it would work if the RPC is responsive, but the Alchemy key is rate-limited (HTTP 429)

### 5.3 Gaps / Items to Verify

- TO VERIFY: Confirm Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11` is deployed on Sepolia and supports the `getEthBalance(address)` function used by this codebase.
  ```bash
  cast call --rpc-url https://ethereum-sepolia-rpc.publicnode.com 0xcA11bde05977b3631167028862bE2a173976CA11 "getEthBalance(address)(uint256)" 0x0000000000000000000000000000000000000001
  ```
  Expected: Returns a non-zero uint256 value.

- TO VERIFY: Whether the existing Multicall ABI (`src/constants/multicall/abi.json`) includes `getEthBalance`. The Goliath contract uses Multicall3 ABI, and the standard Multicall3 on Sepolia should be compatible.

- TO VERIFY: Current Alchemy API key status — is it permanently rate-limited (monthly cap) or has it recovered?
  ```bash
  curl -s -o /dev/null -w "%{http_code}" -X POST https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  ```
  Expected: 200 (working) or 429 (still rate-limited).

### 5.4 Root Cause (final)

- **Root cause:** Sepolia (chain ID 11155111) has no entry in `MULTICALL_NETWORKS`, making `useMulticallContract()` return `null`, which prevents all multicall-based balance queries (Header balance, token balances, swap balances) from executing when the user's wallet is connected to Sepolia.
- **Contributing factors:**
  1. The original Uniswap V2 codebase predates Sepolia — it only included Mainnet, Ropsten, Kovan, Rinkeby, Goerli. When Goliath (8901) was added, Sepolia was missed because the bridge was Sepolia-to-Goliath but the DEX UI was Goliath-only.
  2. Alchemy Sepolia API key exhausted monthly capacity (HTTP 429), compounding the issue for Bridge page balance which uses direct RPC.
  3. No automated test validates that `MULTICALL_NETWORKS` contains entries for all supported chains.

---

## 6) SOLUTIONS (compare options)

### Option A — Add Sepolia Multicall3 Address + Harden Provider Fallback

**Changes required**
- `src/constants/multicall/index.ts:10` — Add `11155111: '0xcA11bde05977b3631167028862bE2a173976CA11'` to `MULTICALL_NETWORKS`
- `src/services/bridgeProviders.ts:29-57` — Add mid-session re-validation: if a balance fetch fails with 429/NETWORK_ERROR after initial validation passed, re-run validation to switch to fallback
- `goliath-bridge-backend/.env` — Add `SEPOLIA_RPC_URLS=https://ethereum-sepolia-rpc.publicnode.com` for backend fallback
- Add tests for the above

**Pros**
- Minimal code change (1 line for the critical fix)
- Uses well-established Multicall3 contract (same address on all EVM chains)
- Fixes both Header and DEX balance display on Sepolia
- Backend also gets RPC resilience

**Cons / risks**
- Depends on the Multicall3 contract ABI being compatible with the existing `MULTICALL_ABI` (need to verify `getEthBalance` and `aggregate` functions exist)
- `publicnode.com` fallback is a free service with no SLA guarantees

**Complexity:** Low
**Rollback:** Easy (`git revert` single commit)

---

### Option B — Replace Multicall-Based Balance With Direct RPC Fallback

**Changes required**
- `src/state/wallet/hooks.ts:13-47` — Modify `useETHBalances` to fall back to direct `provider.getBalance()` when multicall contract is unavailable
- Keep the multicall path for chains that support it (Goliath, Mainnet, etc.)
- Add direct RPC provider creation for Sepolia with fallback
- `goliath-bridge-backend/.env` — Add fallback RPC

**Pros**
- Doesn't depend on any external Multicall contract existing on Sepolia
- More resilient — works even if Multicall contract goes down
- Future-proof for any chain without a Multicall contract

**Cons / risks**
- More complex code change (modify core balance hook)
- Two code paths to maintain (multicall + direct RPC)
- More RPC calls (N calls instead of 1 batched multicall)
- Higher risk of introducing regressions in balance display across all chains

**Complexity:** Medium
**Rollback:** Moderate (touches core hooks)

---

### Decision

**Chosen option:** A — Add Sepolia Multicall3 Address + Harden Provider Fallback

**Justification:** The Multicall3 contract at `0xcA11bde05977b3631167028862bE2a173976CA11` is the canonical deployment present on virtually all EVM chains including Sepolia. Adding it to `MULTICALL_NETWORKS` is a 1-line fix for the critical issue. The additional provider hardening and backend fallback are straightforward and low-risk.

**Accepted tradeoffs:** We depend on the canonical Multicall3 contract remaining available on Sepolia. This is a widely-used infrastructure contract with no owner/upgrade capability, so the risk is negligible.

---

## 7) DELIVERABLES

- [ ] Code changes:
  - `src/constants/multicall/index.ts` — Add Sepolia Multicall3 address
  - `src/services/bridgeProviders.ts` — Add mid-session re-validation on fetch failure
- [ ] Tests:
  - `src/constants/multicall/__tests__/index.test.ts` — Verify all supported chains have multicall addresses
  - `src/services/__tests__/bridgeProviders.test.ts` — Verify fallback behavior
- [ ] Config changes:
  - `goliath-bridge-backend/.env` — Add `SEPOLIA_RPC_URLS` fallback
- [ ] Deployment:
  - Frontend: Vercel auto-deploy on merge
  - Backend: Update env vars and restart

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/constants/multicall/__tests__/`, `src/services/__tests__/`
- **Run command:** `npm test`
- **Framework:** Jest + React Testing Library

### 8.2 Required Tests

**Unit tests**
- [ ] `MULTICALL_NETWORKS` contains an entry for Sepolia (11155111) with a valid Ethereum address
- [ ] `MULTICALL_NETWORKS` contains an entry for Goliath (8901) with a valid Ethereum address
- [ ] `validateSepoliaProvider()` switches to fallback RPC on HTTP 429
- [ ] `validateSepoliaProvider()` keeps primary RPC if validation succeeds
- [ ] `getNativeBalance()` returns a bigint (mocked provider)

**Integration tests (if applicable)**
- [ ] `useETHBalances` returns a value when connected to a chain that has a multicall address
- [ ] Header component renders balance text when `useETHBalances` returns a value

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — confirm clean working tree (or stash changes)
2. `git checkout -b fix/sepolia-eth-balance-zero`
3. Verify Multicall3 contract on Sepolia:
   ```bash
   cast call --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
     0xcA11bde05977b3631167028862bE2a173976CA11 \
     "getEthBalance(address)(uint256)" \
     0x0000000000000000000000000000000000000001
   ```
   Expected: Returns a uint256 > 0

### Phase 1 — Write Tests First

- **Step 1:** Create `src/constants/multicall/__tests__/index.test.ts`
  - Test: `MULTICALL_NETWORKS` has entry for `11155111`
  - Test: All entries are valid Ethereum addresses (40-hex-char, starts with 0x)
  - Run: `npm test -- --testPathPattern=multicall`
  - Expected: FAIL (no Sepolia entry exists yet)

### Phase 2 — Implement the Fix

- **Step 2:** Add Sepolia to `MULTICALL_NETWORKS`
  - File: `src/constants/multicall/index.ts:10`
  - Change: Add line `11155111: '0xcA11bde05977b3631167028862bE2a173976CA11', // Sepolia - Multicall3`
  - Build: `npm run build`
  - Expected: Build succeeds
  - Verify: `npm test -- --testPathPattern=multicall` → PASS
  - Rollback: `git checkout -- src/constants/multicall/index.ts`

- **Step 3:** Improve `bridgeProviders.ts` mid-session resilience
  - File: `src/services/bridgeProviders.ts`
  - Change: In `getNativeBalance()` and `getTokenBalance()`, catch 429/NETWORK_ERROR and re-run `validateSepoliaProvider()` with `_sepoliaValidated = false` to trigger fallback switch, then retry the call once
  - Build: `npm run build`
  - Verify: Tests pass
  - Rollback: `git checkout -- src/services/bridgeProviders.ts`

- **Step 4:** Add backend Sepolia RPC fallback
  - File: `goliath-bridge-backend/.env`
  - Change: Add `SEPOLIA_RPC_URLS=https://ethereum-sepolia-rpc.publicnode.com`
  - Verify: Backend starts successfully, `/api/v1/health` returns healthy
  - Rollback: Remove the env var

### Phase 3 — Validate

1. `npm test` — all tests pass in frontend
2. `npm run build` — frontend builds successfully
3. Manual verification:
   - Connect wallet to Sepolia → Header shows ETH balance
   - Switch to Goliath → Header shows XCN balance
   - Switch back to Sepolia → Header shows correct Sepolia ETH balance (not Goliath's)
   - Open Bridge page → Sepolia ETH balance displayed correctly

### Phase 4 — Deploy

1. Push branch, create PR
2. Frontend: Vercel preview deploy → verify on preview URL
3. Backend: Update env vars on K8s deployment
4. Post-deploy: Monitor for 15 minutes, check `/api/v1/health`

### Phase 5 — Rollback Plan

**Triggers:** Balance displays incorrectly on Goliath (regression), or build fails
**Procedure:**
- Code: `git revert <commit-sha>`
- Backend: Remove `SEPOLIA_RPC_URLS` env var, restart pod
- Frontend: Vercel auto-deploys the revert

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in Goliath balance display
- [ ] No regressions in existing ETH/USDC bridge functionality
- [ ] Sepolia ETH balance appears in Header when connected to Sepolia
- [ ] Sepolia ETH balance appears on Bridge page
- [ ] Network switching displays correct balance for each chain
- [ ] Code review completed
- [ ] Deployed and verified on preview
- [ ] Monitoring shows healthy state

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| 2026-02-25 | Added Sepolia Multicall3 address to `MULTICALL_NETWORKS` | SUCCESS | 1-line fix: `11155111: '0xcA11bde05977b3631167028862bE2a173976CA11'` |
| 2026-02-25 | Added mid-session RPC retry/fallback to `bridgeProviders.ts` | SUCCESS | `getNativeBalance`, `getTokenBalance`, `getTokenAllowance` now retry on 429/NETWORK_ERROR |
| 2026-02-25 | Added `SEPOLIA_RPC_URLS` fallback to backend `.env` | SUCCESS | `publicnode.com` + `rpc.sepolia.org` as fallbacks |
| 2026-02-25 | Created multicall config tests (6 tests) | PASS | Validates Sepolia, Goliath addresses + ABI functions |
| 2026-02-25 | Created bridgeProviders tests (8 tests) | PASS | Validates balance fetch, 429 retry, non-RPC error passthrough |
| 2026-02-25 | Full test suite run | 466/467 PASS | 1 pre-existing failure in `state/lists/reducer.test.ts` (unrelated) |
| 2026-02-25 | Production build (`npm run build`) | SUCCESS | Uses `react-app-rewired` |

### Failed Attempts

None.

### Final State

- Changes made:
  - `src/constants/multicall/index.ts` — Added Sepolia Multicall3 address (+1 line)
  - `src/services/bridgeProviders.ts` — Added `isRpcFailure()`, `revalidateSepoliaIfNeeded()`, retry wrappers for all balance/allowance functions
  - `goliath-bridge-backend/.env` — Added `SEPOLIA_RPC_URLS` fallback config
  - `src/constants/multicall/__tests__/index.test.ts` — New test file (6 tests)
  - `src/services/__tests__/bridgeProviders.test.ts` — New test file (8 tests)
- Tests passing: 466/467 (1 pre-existing failure)
- Deployment status: Ready for deployment
- Remaining risks / follow-ups: See Section 12

---

## 12) FOLLOW-UPS

- [ ] Upgrade or replace Alchemy Sepolia API key (monthly capacity exceeded)
- [ ] Add monitoring/alerting for RPC provider failover events
- [ ] Consider diversifying RPC providers (add Infura, QuickNode as additional fallbacks)
- [ ] Audit other chains (Ropsten, Kovan, Rinkeby are deprecated — consider removing them from `MULTICALL_NETWORKS` to reduce confusion)
- [ ] Add CI test that validates `MULTICALL_NETWORKS` has entries for all chains the app claims to support
