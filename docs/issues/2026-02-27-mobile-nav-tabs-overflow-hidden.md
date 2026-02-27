# Mobile Navigation Tabs Overflow — Swap and Yield Hidden on Phone

**Project:** CoolSwap-interface
**Type:** Code Bug
**Priority:** P1
**Risk level:** Low
**Requires deployment?:** Yes
**Requires network freeze?:** N/A
**Owner:** Goliath Engineering
**Date created:** 2026-02-27
**Related docs / prior issues:** None — first report of this UI bug

---

## 1) GOAL / SUCCESS CRITERIA

**What "fixed" means:**

All five navigation tabs (Swap, Pool, Bridge, Migrate, Yield) are fully visible and tappable on mobile screens without horizontal scrolling or clipping. Tabs are arranged in two centered rows on small screens: **Row 1: Swap, Pool** | **Row 2: Bridge, Migrate, Yield**.

**Must-have outcomes**

- [ ] All 5 nav tabs visible on phones (viewport width <= 720px)
- [ ] Two-row layout: Swap + Pool on top, Bridge + Migrate + Yield on bottom
- [ ] No horizontal overflow or clipping
- [ ] Active tab styling preserved in both rows
- [ ] Desktop/tablet layout unchanged (single row)

**Acceptance criteria (TDD)**

- [ ] Test A: On viewport <= 720px, `HeaderLinks` renders as `flex-wrap: wrap` with centered content
- [ ] Test B: First row contains exactly Swap and Pool; second row contains Bridge, Migrate, Yield
- [ ] Test C: All 5 tabs are visible (none clipped by overflow) at 360px viewport width
- [ ] Test D: Desktop layout (> 720px) remains a single horizontal row

**Non-goals**

- Redesigning the bottom navigation bar (home/swap/etc. system nav)
- Changing the tab order on desktop
- Adding new tabs or removing existing ones

---

## 2) ENVIRONMENT

### Project Details

- **Repository path:** `~/goliath/CoolSwap-interface`
- **Language/stack:** React, TypeScript, styled-components
- **Entry point:** `src/index.tsx`
- **Build command:** `npm run build`
- **Test command:** `npm test`

### Key Files

| File | Purpose |
|------|---------|
| `src/components/Header/index.tsx` | Main header with navigation tabs |
| `src/theme/index.tsx` | Media query breakpoints and theme |
| `src/theme/styled.d.ts` | Theme type definitions |

### Breakpoints

| Name | Max-width |
|------|-----------|
| `upToExtraSmall` | 540px |
| `upToSmall` | 720px |
| `upToMedium` | 960px |
| `upToLarge` | 1480px |

---

## 3) CONSTRAINTS

### Hard Safety Constraints

- [ ] Do NOT delete `.pces` files (consensus loss risk)
- [ ] Do NOT flush iptables on remote servers
- [ ] Do NOT expose private keys or secrets in issue files
- [ ] Do NOT modify consensus-affecting config via rolling restart without freeze

### Code Change Constraints

- [ ] All changes must pass existing tests
- [ ] Desktop and tablet layouts must remain unaffected
- [ ] RTL (Arabic) layout support must be preserved
- [ ] Active tab styling must work correctly in both rows

### Operational Constraints

- Allowed downtime: None (frontend-only change, static deploy)
- Blast radius: Visual layout of navigation on mobile only

---

## 4) ISSUE ANALYSIS

### 4.1 Symptoms

- On mobile phones (viewport ~360-400px), the navigation tabs overflow horizontally
- The **Swap** tab (leftmost) and **Yield** tab (rightmost) are clipped/hidden off-screen
- Only Pool, Bridge, and Migrate are partially visible (see screenshot)
- Users cannot tap Swap or Yield on mobile without guessing they exist

### 4.2 Impact

- **User impact:** Mobile users cannot access Swap (the primary feature) or Yield pages via the navigation tabs. Critical UX regression for a DeFi app where mobile is a primary form factor.
- **System impact:** No data risk. Purely visual/UX degradation.
- **Scope:** `src/components/Header/index.tsx` — `HeaderLinks` and `StyledNavLink` styled-components

### 4.3 Affected Code

| File | Function/Component | Issue |
|------|-------------------|-------|
| `src/components/Header/index.tsx:85-114` | `HeaderLinks` styled-component | Uses `Row` (flex-row nowrap) — all 5 tabs forced into single row; no `flex-wrap`; `width: 100%` on mobile but children overflow |
| `src/components/Header/index.tsx:229-268` | `StyledNavLink` styled-component | Uses `padding: 0.3rem 7%` on mobile — percentage padding on 5 items exceeds 100% of container width |
| `src/components/Header/index.tsx:270-297` | `DisabledNavLink` styled-component | Same mobile padding issue as `StyledNavLink` |

### 4.4 Evidence

**Root cause in code — `HeaderLinks` (lines 85-114):**

```tsx
const HeaderLinks = styled(Row)`    // Row = flex-row nowrap
  width: auto;
  padding: 0.3rem;
  justify-content: center;
  // ...
  ${({ theme }) => theme.mediaWidth.upToSmall`
    position: fixed;
    bottom: 0;
    padding: .5rem;
    width: 100%;           // ← full width on mobile
    left: 50%;
    transform: translateX(-50%);
    border-radius: 0;
    border-top: 1px solid ${({ theme }) => theme.bg3};
  `};
```

**`Row` inherits `flexRowNoWrap` from theme (line 109-112 of theme/index.tsx):**

```tsx
flexRowNoWrap: css`
  display: flex;
  flex-flow: row nowrap;   // ← nowrap prevents wrapping
`,
```

**`StyledNavLink` mobile padding (lines 259-267):**

```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  border-radius: 8px;
  padding: 0.3rem 7%;     // ← 7% × 5 items = 35% + text = overflow
  border: 1px solid ${({ theme }) => theme.bg3};
  &:not(:last-child) {
    margin-inline-end: 2%;  // ← 2% × 4 gaps = 8% additional
  }
`};
```

**Math:** 5 tabs × 7% padding × 2 sides = 70% just for padding, plus 4 × 2% margins = 8%, plus text content width. Total exceeds 100% of viewport width. Since `flex-flow: row nowrap` is set, the items overflow instead of wrapping.

**Screenshot evidence:** User-provided screenshot shows Swap tab cut off on the left, Yield tab invisible on the right. Only Pool, Bridge, Migrate visible in the horizontal strip.

### 4.5 Tasks

- `.memory-bank/tasks/mobile-nav-tabs-overflow/task-001-headerlinks-flex-wrap.md`
- `.memory-bank/tasks/mobile-nav-tabs-overflow/task-002-navlink-mobile-padding.md`
- `.memory-bank/tasks/mobile-nav-tabs-overflow/task-003-disabled-navlink-sync.md`

### 4.6 Historical Context

**Prior issues searched:** `docs/issues/`, `.memory-bank/`

**Regression from recent changes?**
- No — this is a pre-existing layout bug. The `flex-flow: row nowrap` has been in place since the Row component was created. The issue became more visible after Migrate and Yield tabs were added (commits `7b09b73` and `c3628f8`), increasing the tab count from 3 to 5.

**Similar prior issues found?**
- No prior issues about mobile nav overflow.

---

## 5) ROOT CAUSE ANALYSIS

### 5.1 Hypothesis

The `HeaderLinks` container inherits `flex-flow: row nowrap` from the `Row` base component and never overrides it for mobile viewports, causing all 5 navigation tabs to render in a single non-wrapping row that overflows the screen width on phones.

### 5.2 Supporting Evidence

- `Row` component uses `flexRowNoWrap` → `flex-flow: row nowrap`
- `HeaderLinks` `upToSmall` media query sets `width: 100%` but does not add `flex-wrap: wrap`
- `StyledNavLink` uses percentage-based padding (`7%`) that compounds across 5 items
- Screenshot confirms horizontal overflow with Swap and Yield clipped

### 5.3 Gaps / Items to Verify

- None — the root cause is clear from code inspection and the screenshot.

### 5.4 Root Cause (final)

- **Root cause:** `HeaderLinks` uses inherited `flex-flow: row nowrap`, preventing tab wrapping on narrow viewports. Combined with percentage-based padding on 5 tabs, the content exceeds the viewport width.
- **Contributing factors:** The navigation was designed for 2-3 tabs (Swap, Pool, Bridge) and was never updated for the mobile layout when Migrate and Yield were added.

---

## 6) SOLUTIONS (compare options)

### Option A — Flex-wrap with centered two-row layout

**Changes required**

In `HeaderLinks` `upToSmall` media query:
- Add `flex-wrap: wrap`
- Add `justify-content: center`
- Add `gap: 0.4rem` for consistent spacing between rows and items

In `StyledNavLink` and `DisabledNavLink` `upToSmall` media queries:
- Change `padding: 0.3rem 7%` → `padding: 0.3rem 0.6rem` (fixed padding instead of percentage)
- Remove `margin-inline-end` (replaced by `gap` on parent)

**Pros**
- Minimal code change (3 styled-components, ~10 lines)
- Naturally splits into 2 rows: Swap + Pool fit first row, Bridge + Migrate + Yield wrap to second row
- Degrades gracefully on any screen size
- Preserves RTL support (flex-wrap + gap is direction-agnostic)

**Cons / risks**
- Row split depends on content width — if tab text is very long in some locale, row split point may vary

**Complexity:** Low
**Rollback:** Easy — `git checkout -- src/components/Header/index.tsx`

---

### Option B — CSS Grid with explicit 2-row layout

**Changes required**

In `HeaderLinks` `upToSmall` media query:
- Switch from flex to `display: grid`
- Use `grid-template-columns` to define two rows explicitly
- First row: 2 equal columns; second row: 3 equal columns

In `StyledNavLink` / `DisabledNavLink`:
- Adjust padding and remove margins

**Pros**
- Exact control over which tabs go on which row
- Deterministic layout regardless of locale/text length

**Cons / risks**
- More complex CSS (grid-template-areas or nth-child selectors)
- Harder to maintain if tabs are added/removed
- Conditional Migrate/Yield tabs complicate grid-template definitions
- Overkill for 5 items

**Complexity:** Medium
**Rollback:** Easy — `git checkout -- src/components/Header/index.tsx`

---

### Decision

**Chosen option:** A — Flex-wrap with centered two-row layout
**Justification:** Simplest change with minimal code modification. The natural flex-wrap behavior already produces the desired 2+3 row split because Swap and Pool are short enough to fit together, and the remaining 3 items wrap to a second line. This approach is also resilient to future tab additions and works naturally with RTL.
**Accepted tradeoffs:** Row split point is content-dependent, but given the short tab labels (Swap, Pool, Bridge, Migrate, Yield), the 2+3 split is consistent across all supported locales.

---

## 7) DELIVERABLES

- [ ] Code changes: `src/components/Header/index.tsx` (modify `HeaderLinks`, `StyledNavLink`, `DisabledNavLink` styled-components)
- [ ] Tests: Visual regression verification on 360px and 720px viewports
- [ ] Config changes: None
- [ ] Documentation: None
- [ ] Deployment: Static frontend redeploy
- [ ] Monitoring/alerts: None

---

## 8) TDD: TESTS FIRST

### 8.1 Test Structure

- **Test location:** Manual visual testing + existing build verification
- **Run command:** `npm run build` (ensures no TypeScript/compile errors)
- **Framework:** styled-components (CSS-in-JS) — layout changes are best verified visually via browser DevTools

### 8.2 Required Tests

**Visual verification tests (manual)**
- [ ] At 360px width: all 5 tabs visible in 2 rows (2 + 3)
- [ ] At 720px width: all 5 tabs visible (at boundary)
- [ ] At 960px+ width: all tabs in single row (no change from current)
- [ ] RTL mode (Arabic): tabs wrap correctly, spacing mirrored
- [ ] Active tab highlighting works in both rows
- [ ] Disabled Yield tab (if staking disabled) styled correctly in wrapped layout

**Build verification**
- [ ] `npm run build` passes with no errors

---

## 9) STEP-BY-STEP IMPLEMENTATION PLAN

### Phase 0 — Preflight

1. `git status` — confirm clean working tree
2. `git checkout -b fix/mobile-nav-tabs-overflow`

### Phase 1 — Implement the Fix

**Step 1: Update `HeaderLinks` mobile styles**

- File: `src/components/Header/index.tsx:102-113`
- Change: Add `flex-wrap: wrap`, `gap`, and `justify-content: center` to the `upToSmall` media query

Before:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  position: fixed;
  bottom: 0;
  padding: .5rem;
  width: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 0;
  border-top: 1px solid ${({ theme }) => theme.bg3};
  grid-column: auto;
  grid-row: auto;
`};
```

After:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  position: fixed;
  bottom: 0;
  padding: .5rem;
  width: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 0;
  border-top: 1px solid ${({ theme }) => theme.bg3};
  grid-column: auto;
  grid-row: auto;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
`};
```

- Build: `npm run build`
- Expected: Build succeeds
- Rollback: `git checkout -- src/components/Header/index.tsx`

**Step 2: Update `StyledNavLink` mobile padding**

- File: `src/components/Header/index.tsx:259-267`
- Change: Replace percentage padding with fixed padding, remove margin (gap handles spacing)

Before:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  border-radius: 8px;
  padding: 0.3rem 7%;
  border: 1px solid ${({ theme }) => theme.bg3};

  &:not(:last-child) {
    margin-inline-end: 2%;
  }
`};
```

After:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  border-radius: 8px;
  padding: 0.3rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.bg3};

  &:not(:last-child) {
    margin-inline-end: 0;
  }
`};
```

- Build: `npm run build`
- Expected: Build succeeds
- Rollback: `git checkout -- src/components/Header/index.tsx`

**Step 3: Update `DisabledNavLink` mobile padding (keep consistent)**

- File: `src/components/Header/index.tsx:288-296`
- Change: Same padding/margin changes as `StyledNavLink`

Before:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  border-radius: 8px;
  padding: 0.3rem 7%;
  border: 1px solid ${({ theme }) => theme.bg3};

  &:not(:last-child) {
    margin-inline-end: 2%;
  }
`};
```

After:
```tsx
${({ theme }) => theme.mediaWidth.upToSmall`
  border-radius: 8px;
  padding: 0.3rem 0.75rem;
  border: 1px solid ${({ theme }) => theme.bg3};

  &:not(:last-child) {
    margin-inline-end: 0;
  }
`};
```

- Build: `npm run build`
- Expected: Build succeeds
- Rollback: `git checkout -- src/components/Header/index.tsx`

### Phase 2 — Validate

1. `npm run build` — must pass
2. Open in browser, resize to 360px width → verify 2-row layout
3. Resize to 960px+ → verify single-row layout unchanged
4. Toggle RTL → verify correct wrapping direction

### Phase 3 — Deploy

1. Static frontend rebuild and deploy
2. Verify on actual mobile device

### Phase 4 — Rollback Plan

**Triggers:** Layout broken on desktop, tabs not visible, build failure
**Procedure:** `git revert <commit>` → redeploy

---

## 10) VERIFICATION CHECKLIST

- [ ] Build succeeds (`npm run build`)
- [ ] All 5 tabs visible on 360px viewport
- [ ] Two-row layout: Swap + Pool on row 1, Bridge + Migrate + Yield on row 2
- [ ] Single-row layout preserved on desktop (> 720px)
- [ ] Active tab styling works in both rows
- [ ] RTL layout works correctly
- [ ] No regressions on tablet breakpoint

---

## 11) IMPLEMENTATION LOG

### Actions Taken

| Time (UTC) | Action | Result | Notes |
|------------|--------|--------|-------|
| | | | |

### Final State

- Changes made: Pending
- Tests passing: Pending
- Deployment status: Not started

---

## 12) FOLLOW-UPS

- [ ] Consider adding a horizontal scroll fallback for extremely narrow viewports (< 320px)
- [ ] Audit other components using `Row` near mobile breakpoints for similar overflow issues
- [ ] Add visual regression tests (e.g., Chromatic/Percy) for mobile layout
