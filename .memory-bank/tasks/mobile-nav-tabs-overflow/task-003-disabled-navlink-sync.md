# Sync DisabledNavLink mobile styles with StyledNavLink

## Context
The `DisabledNavLink` styled-component in `src/components/Header/index.tsx` (lines 270-297) has identical mobile styles to `StyledNavLink` but is used for disabled tabs (e.g., Yield when staking is disabled). Its mobile padding and margins must match the changes made to `StyledNavLink` in task-002 to maintain visual consistency.

## Task
Modify the `DisabledNavLink` styled-component's `upToSmall` media query (lines 288-296):
- Change `padding: 0.3rem 7%` to `padding: 0.3rem 0.75rem`
- Change `margin-inline-end: 2%` to `margin-inline-end: 0`

## Blockers
- `task-001-headerlinks-flex-wrap.md` — parent gap must be in place
- `task-002-navlink-mobile-padding.md` — should match StyledNavLink values

## Acceptance Checklist
- [ ] `DisabledNavLink` mobile padding changed from `7%` to `0.75rem`
- [ ] `DisabledNavLink` mobile `margin-inline-end` set to `0`
- [ ] Disabled styling (opacity, cursor, color) unchanged
- [ ] Visual appearance matches `StyledNavLink` in size/spacing
- [ ] `npm run build` passes without errors
