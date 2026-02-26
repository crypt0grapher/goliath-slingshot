# Yield Tab: Native XCN Balance (8-dec) Treated as 18-dec — Breaks Display, Staking Limits, and Max Button

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P0
**Risk level:** High
**Requires deployment?:** Yes (frontend rebuild)
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-02-25
**Related docs / prior issues:** StakedXCN contract (`~/goliath/staking/test-contract-sepolia/src/StakedXCN.sol`), WXCN contract (`~/goliath/wXCN/contracts/WXCN.sol`)

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The Yield tab correctly displays the user's native XCN balance, allows staking normal amounts, and the Max button works. All amounts use consistent 18-decimal (WAD) representation internally.

**Must-have outcomes**

- [ ] XCN balance on the Stake form shows the correct human-readable value (e.g., "1,000.0000 XCN" for 1000 XCN)
- [ ] Users can stake any amount up to their actual balance (not limited to tiny fractions)
- [ ] Max button fills the correct maximum stakeable amount
- [ ] Balance comparison correctly prevents overspending without false "Insufficient balance" errors

**Acceptance criteria (TDD)**

- [ ] Test A: `normalizeNativeBalanceToWad(BigNumber.from("100000000"), 8901)` returns `BigNumber("1000000000000000000")` (1 XCN: 10^8 → 10^18)
- [ ] Test B: StakeForm displays "1,000.0000 XCN" when xcnBalance is `10^13` tinyXCN (1000 XCN)
- [ ] Test C: StakeForm allows staking "100" XCN when balance is 1000 XCN (no "Insufficient" error)
- [ ] Test D: Max button fills the correct amount (balance minus gas reserve, both in 18-dec)
- [ ] Test E: `formatTokenAmount` for 18-dec normalized balance matches expected display

**Non-goals**

- Changing the StakedXCN smart contract (events already emit WAD values — correct)
- Fixing swap page native XCN balance (separate issue if broken; user reports swap works)
- Changing stXCN display (already 18-dec from `contract.balanceOf` — correct)

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, ethers.js v5, Redux Toolkit
- **Entry point:** `src/pages/Yield/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

### Network Context

- Chain ID: 8901 / 0x22c5
- Goliath Testnet
- Native XCN: **8 decimals** (tinyXCN) at EVM level
- stXCN ERC-20: **18 decimals** (WAD)
- WXCN ERC-20: **18 decimals** (WAD)
- `NATIVE_SCALE = 10^10` bridges 8→18 decimal gap
- Reference transaction: `https://testnet.explorer.goliath.net/tx/0x8a49648b25650269ebee819ba9f0b1d80d2e6a515ca5f9d00a0dcb6b9cf7fbe9`

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT modify the StakedXCN smart contract
- [ ] Do NOT expose private keys or secrets
- [ ] All changes must pass existing tests

### Code Change Constraints

- [ ] New functionality must include tests
- [ ] Reuse existing `normalizeNativeBalanceToWad()` from `src/constants/staking.ts`
- [ ] Follow the decimal handling pattern used by bridge (`parseAmount`/`formatAmount` with explicit decimals)

### Operational Constraints

- Allowed downtime: None (frontend-only change)
- Blast radius: Yield/Stake tab only

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- Yield tab Stake form shows **"Balance: 0.0000 XCN"** even when user has substantial XCN
- Users can only stake extremely tiny amounts (e.g., 0.0000001 XCN); normal amounts trigger "Insufficient XCN balance"
- Max button always sets amount to "0"
- Staking preview shows "minting 0.0000001 stXCN" because only tiny inputs pass the broken balance check
- Transaction history correctly shows the WAD amounts (events emit 18-dec)

### 4.2 Impact

- **User impact:** Users cannot stake meaningful amounts of XCN. The Yield tab is effectively broken for normal use.
- **System impact:** No data corruption — the staking contract itself works correctly. Pure frontend display/validation bug.
- **Scope:** `src/pages/Yield/index.tsx`, `src/pages/Yield/StakeForm.tsx` — the `xcnBalance` variable

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Yield/index.tsx:57-58` | `Yield` component | `xcnBalance` sourced as 8-dec tinyXCN, passed as-is to StakeForm |
| `src/pages/Yield/StakeForm.tsx:87` | Balance display | `formatTokenAmount(xcnBalance)` assumes 18-dec |
| `src/pages/Yield/StakeForm.tsx:50` | Balance comparison | `wad.gt(BigNumber.from(xcnBalance))` compares 18-dec with 8-dec |
| `src/pages/Yield/StakeForm.tsx:31-33` | Max button | `bal.sub(MIN_GAS_RESERVE)` subtracts 18-dec from 8-dec |

### 4.4 Evidence

**On-chain proof that native XCN is 8-decimal at EVM level:**

From `StakedXCN.sol:15`:
```
///      Native XCN on Goliath is 8 decimals (tinyXCN) at EVM level.
```

From `StakedXCN.sol:35-36`:
```solidity
/// @dev Conversion factor: tinyXCN (8-dec) * NATIVE_SCALE = wad (18-dec)
/// Proven by WXCN.sol: msg.value is tinyXCN on Goliath EVM.
```

From `WXCN.sol:42`:
```solidity
// msg.value is in tinyXCN (8-dec)
uint256 tinyAmount = msg.value;
```

**Balance source in the frontend — returns 8-dec:**

`src/state/wallet/hooks.ts:29-41`:
```typescript
// multicall.getEthBalance(addr) → calls addr.balance in Solidity
// On Goliath EVM, addr.balance returns tinyXCN (8 decimals)
const results = useSingleContractMultipleData(multicallContract, 'getEthBalance', ...);
// ...
const rawValue = value.toString(); // 8-dec tinyXCN
memo[address] = CurrencyAmount.ether(JSBI.BigInt(rawValue));
```

**Yield page consumes it WITHOUT normalization:**

`src/pages/Yield/index.tsx:57-58`:
```typescript
const xcnCurrencyBalance = useCurrencyBalance(account ?? undefined, ETHER);
const xcnBalance = xcnCurrencyBalance ? xcnCurrencyBalance.raw.toString() : null;
// xcnBalance is 8-dec tinyXCN, e.g. "100000000" for 1 XCN
```

**formatTokenAmount assumes 18-dec (hardcoded):**

`src/pages/Yield/styleds.tsx:267`:
```typescript
const formatted = formatUnits(weiString, 18); // ALWAYS 18 decimals
```

**Numeric trace for 1 XCN balance:**
- `getEthBalance` → `10^8` (1 XCN in 8-dec tinyXCN)
- `xcnBalance = "100000000"`
- `formatTokenAmount("100000000")` → `formatUnits("100000000", 18)` → `"0.0000000001"`
- Display: **"Balance: 0.0000 XCN"** (truncated to 4 decimals)

**Numeric trace for balance comparison when staking 1 XCN:**
- `wad = parseUnits("1", 18)` → `10^18`
- `xcnBalance = "100000000"` (10^8)
- `wad.gt(BigNumber.from(xcnBalance))` → `10^18 > 10^8` → `true`
- Result: **"Insufficient XCN balance"** — falsely blocks the stake

**Numeric trace for Max button with 1000 XCN:**
- `bal = BigNumber.from("100000000000")` (10^11, i.e. 1000 XCN in 8-dec)
- `MIN_GAS_RESERVE = parseUnits("0.01", 18)` = `10^16`
- `max = 10^11 - 10^16` → **negative** → sets input to "0"

**How bridge/swap handle it correctly (reference patterns):**

Bridge uses explicit decimal config per token/chain:
```typescript
// src/utils/bridge/amounts.ts
const config = getTokenConfigForChain(token, network);
const formatted = ethers.utils.formatUnits(atomic.toString(), config.decimals);
```

Staking constants already have the normalization utility (UNUSED in display path):
```typescript
// src/constants/staking.ts
export function normalizeNativeBalanceToWad(rawNativeBalance: BigNumber, chainId?: number): BigNumber {
  if (chainId === 8901) {
    return rawNativeBalance.mul(NATIVE_SCALE); // 8-dec * 10^10 = 18-dec
  }
  return rawNativeBalance;
}
```

**What IS correct (no bugs here):**

- Event `Staked(user, xcnAmount, stXCNMinted)` emits `wadAmount` (18-dec) — verified in `StakedXCN.sol:353`
- Event `Unstaked(user, stXCNBurned, xcnReturned)` emits WAD values — verified in `StakedXCN.sol:184`
- `formatTokenAmount(event.xcnAmount)` for transaction history → correct (18-dec events, 18-dec formatter)
- `contract.balanceOf(account)` returns stXCN in 18-dec → correct for AnimatedBalance and UnstakeForm
- `useStake` correctly divides by `NATIVE_SCALE` before sending tx value → correct
- Rewards calculation `userBalance - totalPrincipal` → both accumulated from WAD event values → correct

### 4.5 Tasks

- `task-001-normalize-xcn-balance.md` — Normalize xcnBalance from 8-dec to 18-dec in Yield page
- `task-002-fix-min-gas-reserve-scale.md` — Fix MIN_GAS_RESERVE to work with normalized balance
- `task-003-add-unit-tests.md` — Add tests for normalization and display

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The `xcnBalance` variable in the Yield page is sourced from `useCurrencyBalance(account, ETHER).raw.toString()`, which returns the native balance from the multicall's `getEthBalance()`. On Goliath's EVM, `address.balance` returns tinyXCN (8 decimals). This 8-decimal value is passed directly to `formatTokenAmount()` which hardcodes `formatUnits(x, 18)`, and to BigNumber comparisons against 18-decimal parsed user inputs.

### 5.2 Supporting Evidence

- `StakedXCN.sol` and `WXCN.sol` both document `msg.value` as 8-decimal tinyXCN
- `address.balance` must use same denomination as `msg.value` (EVM invariant)
- `normalizeNativeBalanceToWad()` exists but is NOT called in the Yield balance path
- Numeric traces show 10^10x error in display and false "insufficient" in comparisons
- Bridge avoids this by using its own balance hooks with explicit decimals config

### 5.3 Gaps / Items to Verify

- TO VERIFY: Confirm the exact tinyXCN value from the reference tx: `cast call --rpc-url <goliath-rpc> <multicall-addr> "getEthBalance(address)(uint256)" <user-addr>` and compare with `eth_getBalance` RPC output
- TO VERIFY: Whether the swap page has the same bug for native XCN (it may not surface because users trade WXCN, not native XCN)

### 5.4 Root Cause (final)

- **Root cause:** `xcnBalance` in `Yield/index.tsx` is 8-decimal tinyXCN but consumed by `StakeForm` as if it were 18-decimal WAD. The `normalizeNativeBalanceToWad()` utility exists but was never integrated into the Yield balance path.
- **Contributing factors:** `formatTokenAmount()` hardcodes 18 decimals; no per-token decimal awareness; no unit test for native balance display on Goliath chain.

---

## 6) SOLUTIONS (compare options)

### Option A — Normalize at source (in `Yield/index.tsx`)

**Changes required**
- `src/pages/Yield/index.tsx:57-58` — Import `normalizeNativeBalanceToWad` and `BigNumber`, apply normalization to `xcnBalance` before passing to StakeForm
- `src/pages/Yield/StakeForm.tsx:12` — Update `MIN_GAS_RESERVE` to match (it's already 18-dec, so no change needed if balance is now 18-dec too)

```typescript
// Before:
const xcnBalance = xcnCurrencyBalance ? xcnCurrencyBalance.raw.toString() : null;

// After:
const xcnBalance = xcnCurrencyBalance
  ? normalizeNativeBalanceToWad(BigNumber.from(xcnCurrencyBalance.raw.toString()), chainId).toString()
  : null;
```

**Pros**
- Single point of normalization — all downstream consumers (StakeForm, formatTokenAmount, balance comparison) automatically work correctly
- Reuses existing `normalizeNativeBalanceToWad()` utility
- Minimal diff (1 file changed, ~3 lines)
- No changes to `formatTokenAmount()` signature — avoids ripple effects

**Cons / risks**
- Coupling between `Yield/index.tsx` and chain-specific knowledge
- If other pages also consume native balance, they'd each need the same fix

**Complexity:** Low
**Rollback:** Easy (`git checkout -- src/pages/Yield/index.tsx`)

---

### Option B — Make `formatTokenAmount` decimal-aware

**Changes required**
- `src/pages/Yield/styleds.tsx:264` — Add `tokenDecimals` parameter to `formatTokenAmount()`
- All callers of `formatTokenAmount` — Pass correct decimals for each token type
- Balance comparison and Max button in StakeForm — Still need normalization

**Pros**
- More explicit about decimals at each call site
- Follows the bridge pattern of decimal-aware formatting

**Cons / risks**
- Larger diff (touches many files)
- Does NOT fix the balance comparison or Max button (still needs normalization there)
- `formatTokenAmount` is used in many places — risk of introducing regressions

**Complexity:** Medium
**Rollback:** Moderate

---

### Decision

**Chosen option:** A — Normalize at source
**Justification:** Single change at the data source fixes all downstream consumers. Reuses existing utility. Minimal blast radius.
**Accepted tradeoffs:** Chain-specific logic in the page component (acceptable since the utility is already centralized in `staking.ts`).

---

## 7) DELIVERABLES

- [ ] Code changes: `src/pages/Yield/index.tsx` — normalize `xcnBalance` with `normalizeNativeBalanceToWad`
- [ ] Tests: Unit test for normalization in yield context
- [ ] Config changes: None
- [ ] Documentation: None
- [ ] Deployment: Frontend rebuild & deploy
- [ ] Monitoring/alerts: None

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/yield/xcnBalanceNormalization.test.ts`
- **Run command:** `npm test -- --testPathPattern xcnBalanceNormalization`
- **Framework:** Jest

### 8.2 Required Tests

**Unit tests**
- [ ] `normalizeNativeBalanceToWad` converts 10^8 (1 XCN) to 10^18 on chain 8901
- [ ] `normalizeNativeBalanceToWad` is identity on non-8901 chains
- [ ] `formatTokenAmount` displays normalized 18-dec balance correctly (e.g. "1,000.0000" for 10^21)
- [ ] Balance comparison: normalized 18-dec balance vs 18-dec input amount produces correct result
- [ ] Max button: normalized 18-dec balance minus 18-dec gas reserve produces correct amount

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — confirm working branch and clean state
2. `npm test` — record baseline test results
3. `npm run build` — confirm current build succeeds

### Phase 1 — Write Tests First

- **Step 1:** Create test file `src/__tests__/yield/xcnBalanceNormalization.test.ts`
  - Test `normalizeNativeBalanceToWad` for chain 8901 and others
  - Test `formatTokenAmount` with various normalized values
  - Test balance comparison logic
  - Run: `npm test -- --testPathPattern xcnBalanceNormalization`
  - Expected: FAIL (normalization not yet applied in component)

### Phase 2 — Implement the Fix

- **Step 1:** Normalize xcnBalance in `src/pages/Yield/index.tsx`
  - File: `src/pages/Yield/index.tsx:57-58`
  - Change: Import `normalizeNativeBalanceToWad` and `BigNumber`, wrap `xcnCurrencyBalance.raw.toString()` with normalization
  - Build: `npm run build`
  - Expected: Build succeeds
  - Verify: Balance displays correctly; staking normal amounts works
  - Rollback: `git checkout -- src/pages/Yield/index.tsx`

### Phase 3 — Validate

1. Run `npm test` — all tests pass
2. Run `npm run build` — build succeeds
3. Manual verification: Connect wallet on Goliath testnet, verify balance display and staking flow

### Phase 4 — Rollback Plan

**Triggers:** Balance display wrong, staking reverts, tests fail
**Procedure:**
- Code: `git checkout -- src/pages/Yield/index.tsx`
- Deployment: Redeploy previous frontend build

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] Balance display shows correct XCN amount
- [ ] Staking 1 XCN works when balance >= 1 XCN
- [ ] Max button fills a reasonable amount
- [ ] "Insufficient balance" only shows when input > actual balance
- [ ] Transaction history still shows correct amounts
- [ ] AnimatedBalance (stXCN) still works correctly
- [ ] Unstake form still works correctly (uses stXCN balance, unaffected)

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: Pending
- Tests passing: Pending
- Deployment status: Not deployed
- Remaining risks / follow-ups: Check swap page for same bug

---

## 12) FOLLOW-UPS

- [ ] Audit swap page for native XCN balance display (same `useCurrencyBalance` path)
- [ ] Consider creating a shared hook `useNativeXCNBalance()` that normalizes once for all pages
- [ ] Add integration test that verifies on-chain balance matches displayed balance
- [ ] Consider making `formatTokenAmount` optionally accept a `decimals` parameter for future flexibility
