# Add Network Switch Prompt for Goliath Staking

## Context
The migration flow starts on Sepolia (chain 11155111). After the bridge completes, the user's wallet is still connected to Sepolia. To stake on Goliath (chain 8901), the user must switch networks. The existing `useBridgeNetworkSwitch` hook from `src/hooks/bridge/useBridgeNetworkSwitch.ts` already supports switching to Goliath.

The status panel needs to show a clear prompt to the user when network switching is required, and the staking should auto-proceed once the correct network is detected.

### Existing infrastructure
- `useBridgeNetworkSwitch` hook: `src/hooks/bridge/useBridgeNetworkSwitch.ts`
- `BridgeNetwork.GOLIATH` constant
- The Yield tab works on Goliath network — same chain the staking contract is on

## Task
1. In the `useMigrationStaking` hook (from task-002), add network awareness:
   - Read `chainId` from `useActiveWeb3React()`
   - Compare against Goliath chain ID (`8901`)
   - If `chainId !== 8901`, set staking status to `'awaiting_network'`
   - Provide a `switchToGoliath()` function that calls `switchNetwork(BridgeNetwork.GOLIATH)`

2. In the `MigrationStatusPanel` staking step (from task-003), when status is `'awaiting_network'`:
   - Show message: "Switch to Goliath network to stake your XCN"
   - Show a "Switch Network" button that calls `switchToGoliath()`
   - Show a spinner while the switch is in progress

3. Add a `useEffect` in the staking hook that auto-triggers `executeStake()` when:
   - `chainId === 8901` (correct network)
   - `stakingStatus === 'awaiting_network'` (was waiting for network)
   - `stakeOnGoliath === true`
   This provides a smooth flow: user clicks "Switch Network" → wallet prompts → after switch → staking auto-starts.

4. Add a localization key for the network switch prompt: `migration.panel.switchToGoliathForStaking`

## Blockers
- `task-002-add-client-side-staking-hook.md` — network check is part of the hook
- `task-003-update-status-panel-staking-step.md` — UI rendering for the network switch state

## Acceptance Checklist
- [ ] Staking hook detects when wallet is not on Goliath (chain 8901)
- [ ] Status is `'awaiting_network'` when network switch is needed
- [ ] "Switch Network" button rendered in staking step
- [ ] `switchNetwork(BridgeNetwork.GOLIATH)` is called on button click
- [ ] Staking auto-starts after successful network switch
- [ ] Localization key added for the prompt message
- [ ] Edge case: user manually switches to Goliath → staking proceeds
- [ ] Edge case: user rejects network switch → status stays at `'awaiting_network'`
- [ ] Tests cover network detection and auto-trigger logic
- [ ] Tests are written and passing
- [ ] Code follows the project's style
