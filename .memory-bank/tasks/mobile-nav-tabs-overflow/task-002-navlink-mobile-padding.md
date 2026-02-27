# Fix StyledNavLink mobile padding from percentage to fixed

## Context
The `StyledNavLink` styled-component in `src/components/Header/index.tsx` (lines 229-268) uses `padding: 0.3rem 7%` and `margin-inline-end: 2%` on mobile. With 5 tabs, percentage padding causes overflow (5 × 14% padding + 4 × 2% margins = 78% just for spacing). After task-001 adds `flex-wrap` and `gap` to the parent, child margins should be zeroed out so `gap` controls spacing.

## Task
Modify the `StyledNavLink` styled-component's `upToSmall` media query (lines 259-267):
- Change `padding: 0.3rem 7%` to `padding: 0.3rem 0.75rem` (fixed padding)
- Change `margin-inline-end: 2%` to `margin-inline-end: 0` (gap on parent handles spacing)

## Blockers
- `task-001-headerlinks-flex-wrap.md` — the gap property on the parent must be in place before removing child margins

## Acceptance Checklist
- [ ] `StyledNavLink` mobile padding changed from `7%` to `0.75rem`
- [ ] `StyledNavLink` mobile `margin-inline-end` set to `0`
- [ ] Desktop styles are unchanged
- [ ] Active tab styling (`.ACTIVE` class) still works
- [ ] RTL direction support preserved (no hardcoded left/right margins)
- [ ] `npm run build` passes without errors
