# Task 005: Add XCN to Frontend Bridge Token Configuration

## Context
The CoolSwap-interface bridge tab at `~/goliath/CoolSwap-interface` currently only supports ETH. XCN needs to be added as a bridgeable token. On Sepolia it's ERC-20, on Goliath it's native.

Also needs the relayer wallet address in config so the frontend knows where to send native XCN for reverse bridging.

**IMPORTANT:** This work targets the `master` branch after `feat/migrate` is merged. Design to minimize merge conflicts.

**Project:** `~/goliath/CoolSwap-interface`

## Task
1. **Update bridge config** (`src/config/bridgeConfig.ts`):
   - Add `xcn: string` to `tokens.sepolia` in `BridgeConfig` interface
   - Add `relayerWalletAddress: string` to root `BridgeConfig`
   - Load from env:
     ```typescript
     xcn: process.env.REACT_APP_SEPOLIA_XCN_ADDRESS || '0x7a8adc542A35c93da263A188367F4bF4c445B8E9'
     relayerWalletAddress: process.env.REACT_APP_BRIDGE_RELAYER_WALLET || '0xE708B75F7b6914479E63D3897bEF9e0dedcA3640'
     ```

2. **Update token types and config** (`src/constants/bridge/tokens.ts`):
   - Expand `BridgeTokenSymbol` type: `'USDC' | 'ETH' | 'XCN'`
   - Add XCN to `BRIDGE_TOKENS`:
     ```typescript
     XCN: {
       symbol: 'XCN', name: 'Chain', logoUrl: '/images/tokens/xcn.svg',
       sepolia: { address: bridgeConfig.tokens.sepolia.xcn, decimals: 18, isNative: false },
       goliath: { address: null, decimals: 18, isNative: true }
     }
     ```
   - Update `BRIDGE_TOKEN_LIST`: `['ETH', 'XCN']`

3. **Verify XCN logo exists** at `public/images/tokens/xcn.svg`
   - Check what the Migrate tab uses for XCN logo and reuse it

4. **Update .env files** (`.env`, `.env.example`):
   - Add `REACT_APP_SEPOLIA_XCN_ADDRESS=0x7a8adc542A35c93da263A188367F4bF4c445B8E9`
   - Add `REACT_APP_BRIDGE_RELAYER_WALLET=0xE708B75F7b6914479E63D3897bEF9e0dedcA3640`

5. **Verify helper functions** work correctly:
   - `getTokenConfigForChain('XCN', SEPOLIA)` -> ERC-20 config
   - `getTokenConfigForChain('XCN', GOLIATH)` -> native config
   - `tokenRequiresApproval('XCN', SEPOLIA)` -> true
   - `tokenRequiresApproval('XCN', GOLIATH)` -> false
   - `getGasBuffer('XCN', GOLIATH)` -> '0.01' (native needs gas reserve)

## Blockers
- No blockers (parallel with backend tasks)

## Acceptance Checklist
- [ ] BridgeTokenSymbol type includes 'XCN'
- [ ] XCN config added to BRIDGE_TOKENS with correct per-chain settings
- [ ] XCN added to BRIDGE_TOKEN_LIST
- [ ] bridgeConfig loads XCN Sepolia address and relayer wallet from env
- [ ] XCN logo path resolves correctly
- [ ] Helper functions return correct values for XCN
- [ ] TypeScript compiles without errors
- [ ] No breaking changes to existing ETH config
