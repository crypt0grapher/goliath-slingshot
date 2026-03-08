# Yield (Staking) Page Not Translated + Missing i18n Keys Across All Locales

**Project:** CoolSwap-interface
**Type:** Feature
**Priority:** P1
**Risk level:** Low
**Requires deployment?:** Yes
**Requires network freeze?:** No
**Owner:** Goliath Engineering
**Date created:** 2026-03-08
**Related docs / prior issues:**
- `docs/issues/2026-02-25-migrate-chn-spelling-and-bridge-step-failure.md` (prior i18n fix for CHN→XCN)
- Commit `7c1f26b` — `feat(i18n): add migration translations for all 21 locales`
- Commit `7a5de4f` — `fix(i18n): translate missing hardcoded strings across interface`

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

The entire Yield (staking) page renders in the user's selected language with zero English text leaking through. All 21 non-English locales display fully translated UI. Two globally missing translation keys (`errorBridgeApiUnavailable`, `errorSignatureFailed`) and two migration hardcoded strings (`Sufficient`/`Insufficient`) are also translated.

**Must-have outcomes**

- [ ] All 35+ hardcoded English strings in the Yield page components replaced with `t()` calls
- [ ] New `yield.*` translation keys added to `en.json` and all 21 non-English locale files
- [ ] `errorBridgeApiUnavailable` and `errorSignatureFailed` translated in all 21 locales
- [ ] `Sufficient` / `Insufficient` in `MigrationSummary.tsx` replaced with `t()` calls and translated
- [ ] Date formatting in `TransactionHistory.tsx` uses locale-aware formatting instead of hardcoded `'en-US'`
- [ ] App displays zero English strings when set to Russian (or any other non-English locale)

**Acceptance criteria (TDD)**

Tests that must pass after the fix and are expected to fail before:

- [ ] Test A: All keys in `en.json` exist in every locale file (key parity check)
- [ ] Test B: Yield page components import `useTranslation` and call `t()` for all user-visible strings
- [ ] Test C: Rendering Yield page with `i18n.language = 'ru'` produces zero English-only text nodes
- [ ] Test D: `TransactionHistory` date formatting respects the active locale

**Non-goals**

- Redesigning the Yield page UI
- Changing any staking/yield business logic
- Adding new locales beyond the existing 21

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, i18next, react-i18next
- **i18n config:** `src/i18n.ts` — i18next with XHR backend, flat key structure (`keySeparator: false`)
- **Translation files:** `public/locales/{locale}.json` (22 files: en + 21 non-English)
- **Build command:** `npm run build`
- **Test command:** `npm test`

### Supported Locales (21 non-English)

ar, az, de, es, es-AR, es-US, fr, id, it-IT, iw, ja, ko, nl, pt-BR, pt-PT, ro, ru, tr, vi, zh-CN, zh-TW

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files (consensus loss risk)
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] New translation keys must follow the existing flat key convention (no nested separators)
- [ ] Token symbols (XCN, stXCN) should remain untranslated as they are brand/protocol names
- [ ] Interpolation variables use `{{variable}}` syntax per i18next convention

### Operational Constraints

- Allowed downtime: none (static frontend — deploy is atomic)
- Blast radius: UI text only — no logic changes

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- When the display language is set to any non-English locale (e.g., Russian), the entire Yield (staking) page renders in English
- The Yield page tab in the header correctly shows "Доход" (Russian) via `t('yield')`, but clicking through to the page reveals all-English content
- Two bridge error messages (`errorBridgeApiUnavailable`, `errorSignatureFailed`) fall back to English in all locales
- `MigrationSummary.tsx` shows hardcoded "Sufficient" / "Insufficient" in English regardless of locale
- `TransactionHistory.tsx` formats dates using hardcoded `'en-US'` locale

### 4.2 Impact

- **User impact:** Non-English-speaking users see a mix of translated and untranslated UI, creating a broken experience
- **System impact:** No data risk — purely cosmetic/UX
- **Scope:** 7 Yield component files + 1 migration component + all 21 locale JSON files

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/pages/Yield/index.tsx` | `Yield` | 11 hardcoded English strings, no `useTranslation` import |
| `src/pages/Yield/StakeForm.tsx` | `StakeForm` | 7 hardcoded strings (button text, balance label, preview) |
| `src/pages/Yield/UnstakeForm.tsx` | `UnstakeForm` | 7 hardcoded strings (button text, balance label, preview) |
| `src/pages/Yield/ProtocolStats.tsx` | `ProtocolStats` | 3 hardcoded stat labels |
| `src/pages/Yield/TransactionHistory.tsx` | `TransactionHistory` | 4 hardcoded strings + `en-US` date locale |
| `src/pages/Yield/AnimatedBalance.tsx` | `AnimatedBalance` | 1 hardcoded balance label |
| `src/components/migration/MigrationSummary.tsx` | allowance badge | 2 hardcoded "Sufficient"/"Insufficient" |
| `public/locales/*.json` (all 21 non-English) | — | Missing `yield.*` keys, `errorBridgeApiUnavailable`, `errorSignatureFailed` |

### 4.4 Evidence

**Yield/index.tsx — zero i18n usage:**
```bash
$ grep -c 'useTranslation\|t(' src/pages/Yield/index.tsx
0
```

**Key parity gap — all locales missing 2 keys:**
```
English keys: 422
All other locales: 420 keys each
Missing everywhere: errorBridgeApiUnavailable, errorSignatureFailed
```

**Hardcoded date locale in TransactionHistory.tsx:18:**
```tsx
return new Date(timestamp * 1000).toLocaleDateString('en-US', { ... });
```

### 4.5 Tasks

- `task-001-add-yield-i18n-keys-to-en-json.md`
- `task-002-replace-hardcoded-strings-in-yield-components.md`
- `task-003-fix-migration-summary-hardcoded-strings.md`
- `task-004-translate-all-new-keys-to-21-locales.md`
- `task-005-add-missing-global-keys-to-all-locales.md`
- `task-006-fix-date-locale-in-transaction-history.md`
- `task-007-add-i18n-completeness-test.md`

### 4.6 Historical Context

**Prior issues searched:** `docs/issues/`, `.memory-bank/tasks/`

**Regression from recent changes?**
- No. The Yield page was never internationalized — it was built with hardcoded English from the start. The migration page was properly internationalized in commit `7c1f26b` but the Yield page was not included in that effort.

**Similar prior issues found?**
- Yes: Commit `7c1f26b` — `feat(i18n): add migration translations for all 21 locales` added ~110 migration keys with translations. The same pattern should be followed for yield keys.
- Yes: Commit `7a5de4f` — `fix(i18n): translate missing hardcoded strings across interface` was a prior sweep that missed the Yield page entirely.
- Prior solution: Add keys to `en.json`, add `useTranslation()` to components, replace hardcoded strings with `t()` calls, translate keys in all locale files. **Applicable here: Yes, reuse as-is.**

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The Yield (staking) page was developed after the initial i18n sweep and was never wired up to the translation system. All user-visible strings are hardcoded English literals.

### 5.2 Supporting Evidence

- Zero imports of `useTranslation` or `react-i18next` in any Yield page component
- Only one yield-related key exists in `en.json`: `"yield": "Yield"` (used in the header nav tab)
- The migration page, built at a similar time, was properly internationalized in a dedicated commit
- The Yield page uses the same component patterns (AppBody, ButtonPrimary) as translated pages but without i18n

### 5.3 Gaps / Items to Verify

- None — all files have been read and analyzed

### 5.4 Root Cause (final)

- **Root cause:** Yield page components were implemented without i18n integration; no `yield.*` translation keys exist
- **Contributing factors:** No automated check for i18n completeness; the prior "translate missing hardcoded strings" sweep missed the Yield page

---

## 6) SOLUTIONS (compare options)

### Option A — Add yield.* keys and translate inline in components

**Changes required**
- Add ~30 new `yield.*` keys to `public/locales/en.json`
- Add `useTranslation()` to each of the 6 Yield components
- Replace all hardcoded strings with `t('yield.*')` calls
- Add translations to all 21 non-English locale files
- Fix `MigrationSummary.tsx` hardcoded strings
- Add missing `errorBridgeApiUnavailable` and `errorSignatureFailed` to all locales
- Fix date locale in `TransactionHistory.tsx`

**Pros**
- Follows existing pattern used throughout the app (flat keys, `t()` calls)
- Minimal refactoring — surgical string replacement
- Consistent with the migration translation approach from commit `7c1f26b`

**Cons / risks**
- Manual translation effort for 21 locales × ~32 new keys
- Need to verify translation quality for each locale

**Complexity:** Low
**Rollback:** Easy — `git revert`

---

### Option B — Extract all strings to a separate yield namespace file

**Changes required**
- Create separate translation namespace for yield
- Configure i18next to load yield namespace
- Refactor components to use namespace-scoped translations

**Pros**
- Better separation of concerns
- Lazy-loading of yield translations

**Cons / risks**
- Over-engineering — the app already uses a single flat namespace successfully
- Requires i18n config changes
- Inconsistent with how migration and all other features are translated

**Complexity:** Medium
**Rollback:** Moderate

---

### Decision

**Chosen option:** A — Add yield.* keys inline following existing pattern
**Justification:** Consistent with the established pattern, minimal risk, and follows the exact same approach used for migration translations. The app uses flat keys with no namespace separation, and adding ~30 keys to the existing files is straightforward.
**Accepted tradeoffs:** All translations in a single file per locale (acceptable given current file sizes of 20-36KB)

---

## 7) DELIVERABLES

- [ ] Code changes: 6 Yield components + 1 migration component (add `useTranslation`, replace hardcoded strings)
- [ ] Translation keys: ~32 new keys in `en.json` + 2 missing global keys
- [ ] Translations: All new keys translated in 21 non-English locale files (Russian first priority)
- [ ] Date fix: `TransactionHistory.tsx` locale-aware date formatting
- [ ] Tests: i18n key parity test

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** `src/__tests__/i18n/`
- **Run command:** `npm test -- --testPathPattern=i18n`
- **Framework:** Jest + React Testing Library (existing project setup)

### 8.2 Required Tests

**Unit tests**
- [ ] All keys in `en.json` exist in every locale file (automated key parity check)
- [ ] No locale file has keys not present in `en.json` (except known exceptions)
- [ ] Yield page components use `t()` for all user-visible text (snapshot or string check)

**Integration tests**
- [ ] Rendering Yield page with Russian locale shows translated text (spot check key strings)

### 8.3 Baseline

- Test run before fix: TO BE RECORDED when tests are written

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — confirm clean working tree
2. `git checkout -b feat/i18n-yield-staking-translations`

### Phase 1 — Define Translation Keys (en.json)

Add the following keys to `public/locales/en.json`:

```json
"yield.pageTitle": "Yield",
"yield.connectWalletPrompt": "Connect your wallet to start earning yield",
"yield.connectWallet": "Connect Wallet",
"yield.switchNetworkPrompt": "Please switch to Goliath Testnet to stake",
"yield.switchingNetwork": "Switching...",
"yield.switchToGoliath": "Switch to Goliath Testnet",
"yield.stakingPausedBanner": "Staking is temporarily paused",
"yield.tabStake": "Stake",
"yield.tabUnstake": "Unstake",
"yield.stakingPending": "Staking XCN...",
"yield.unstakingPending": "Unstaking stXCN...",
"yield.stakingPaused": "Staking Paused",
"yield.enterAmount": "Enter an amount",
"yield.insufficientXCN": "Insufficient XCN balance",
"yield.stakeXCN": "Stake XCN",
"yield.noStXCN": "No stXCN to unstake",
"yield.insufficientStXCN": "Insufficient stXCN balance",
"yield.unstakeStXCN": "Unstake stXCN",
"yield.max": "Max",
"yield.balanceXCN": "Balance: {{amount}} XCN",
"yield.balanceStXCN": "Balance: {{amount}} stXCN",
"yield.receiveStXCN": "You will receive ~{{amount}} stXCN",
"yield.receiveXCN": "You will receive ~{{amount}} XCN",
"yield.totalStaked": "Total Staked",
"yield.netAPY": "Net APY",
"yield.yourRewards": "Your Rewards",
"yield.transactionHistory": "Transaction History",
"yield.noTransactions": "No transactions yet",
"yield.eventStaked": "Staked",
"yield.eventUnstaked": "Unstaked",
"yield.yourStXCNBalance": "Your stXCN Balance",
"migration.summary.allowanceSufficient": "Sufficient",
"migration.summary.allowanceInsufficient": "Insufficient"
```

### Phase 2 — Update Components

For each Yield component:
1. Add `import { useTranslation } from 'react-i18next';`
2. Add `const { t } = useTranslation();` (or `const { t, i18n } = useTranslation();` where locale is needed)
3. Replace every hardcoded string with the corresponding `t('yield.*')` call

**Fix date formatting in TransactionHistory.tsx:**
```tsx
// Before:
return new Date(timestamp * 1000).toLocaleDateString('en-US', { ... });
// After:
return new Date(timestamp * 1000).toLocaleDateString(i18n.language, { ... });
```

**Fix MigrationSummary.tsx:**
```tsx
// Before:
Sufficient / Insufficient
// After:
{t('migration.summary.allowanceSufficient')} / {t('migration.summary.allowanceInsufficient')}
```

### Phase 3 — Translate to All Locales

1. **Russian (ru.json) — first priority** — add all ~32 new keys with Russian translations
2. All other 20 locales — add translations for all new keys
3. Add `errorBridgeApiUnavailable` and `errorSignatureFailed` to all 21 locales
4. Clean up 6 extra orphan keys in `it-IT.json` (optional)

### Phase 4 — Validate

1. `npm run build` — verify build succeeds
2. `npm test` — verify all existing tests pass
3. Manual verification: load app with `?lang=ru` and navigate to Yield page
4. Run key parity check script to confirm zero missing keys

### Phase 5 — Deploy

1. Standard frontend deploy (build + upload static assets)
2. Verify on testnet with Russian locale

### Phase 6 — Rollback Plan

**Triggers:** broken UI, build failure, missing translations causing crashes
**Procedure:**
- Code: `git revert <commit>`
- Deployment: redeploy previous build artifact

---

## 10) VERIFICATION CHECKLIST

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No regressions in existing functionality
- [ ] Russian locale shows fully translated Yield page
- [ ] All 21 non-English locales have key parity with en.json
- [ ] Date formatting in transaction history respects active locale
- [ ] MigrationSummary shows translated "Sufficient"/"Insufficient"

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: pending
- Tests passing: pending
- Deployment status: pending

---

## 12) FOLLOW-UPS

- [ ] Add automated CI check for i18n key parity (fail build if any locale is missing keys)
- [ ] Audit other pages for remaining hardcoded English strings
- [ ] Consider extracting translation key validation into a shared script
- [ ] Review translation quality with native speakers for all locales
