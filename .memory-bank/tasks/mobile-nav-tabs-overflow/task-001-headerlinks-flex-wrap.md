# Add flex-wrap to HeaderLinks on mobile

## Context
The `HeaderLinks` styled-component in `src/components/Header/index.tsx` (lines 85-114) renders 5 navigation tabs (Swap, Pool, Bridge, Migrate, Yield) in a single non-wrapping flex row. On mobile viewports (<=720px), the tabs overflow the screen because the parent `Row` component uses `flex-flow: row nowrap`. This task adds `flex-wrap: wrap` and proper spacing to the mobile media query so tabs naturally split into two rows.

## Task
Modify the `HeaderLinks` styled-component's `upToSmall` media query block (lines 102-113) to add:
- `flex-wrap: wrap` — allows tabs to wrap to a second line
- `gap: 0.4rem` — consistent spacing between rows and items (replaces child margins)
- `justify-content: center` — centers both rows horizontally

Do not modify the desktop/tablet styles (lines 85-100).

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `flex-wrap: wrap` is added to the `upToSmall` media query of `HeaderLinks`
- [ ] `gap: 0.4rem` is added to the `upToSmall` media query
- [ ] `justify-content: center` is present in the `upToSmall` media query
- [ ] Desktop styles (non-media-query) are unchanged
- [ ] `upToLarge` media query is unchanged
- [ ] `npm run build` passes without errors
- [ ] On 360px viewport, tabs render in 2 centered rows
