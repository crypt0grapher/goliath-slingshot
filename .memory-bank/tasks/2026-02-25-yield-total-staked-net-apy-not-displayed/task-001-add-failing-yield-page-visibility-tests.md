# Add Failing Yield Page Visibility Tests

## Context
We are fixing a Yield UI bug where protocol stats (`Total Staked`, `Net APY`) are hidden by early wallet/network gate returns. Current tests validate `ProtocolStats` in isolation, but do not test the full `Yield` page behavior for disconnected and wrong-network states.

This work is in `~/goliath/CoolSwap-interface`, primarily around `src/pages/Yield/index.tsx` and `src/__tests__/yield/`.

## Task
Create page-level tests that mount the `Yield` page with mocked wallet/network states and assert:
- Disconnected state still shows `Total Staked` and `Net APY`
- Wrong-network state still shows `Total Staked` and `Net APY`
- Connected + Goliath state still shows staking controls and protocol stats

These tests should fail before the layout refactor and pass after.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] New test file is added under `src/__tests__/yield/`
- [ ] Tests cover disconnected, wrong-network, and connected+Goliath states
- [ ] At least one test fails before implementation changes
- [ ] Existing Yield component tests still run
- [ ] Tests are written and passing
- [ ] Code follows the project's style
