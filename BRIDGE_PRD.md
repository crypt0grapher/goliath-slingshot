# Product Requirements Document

## Cross-Chain Bridge for Goliath Slingshot (CoolSwap Interface)

| Metadata | Value |
|----------|-------|
| **Version** | v2.0 (Comprehensive Testnet Specification) |
| **Status** | Draft |
| **Last Updated** | 2025-12-01 |
| **Authors** | Goliath Protocol Team |
| **Reviewers** | Engineering, Security, QA |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Success Metrics](#3-goals-and-success-metrics)
4. [Target Users](#4-target-users)
5. [Product Overview](#5-product-overview)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [User Experience Flows](#8-user-experience-flows)
9. [Technical Architecture](#9-technical-architecture)
10. [Smart Contract Interfaces](#10-smart-contract-interfaces)
11. [API Specifications](#11-api-specifications)
12. [State Machine and Status Transitions](#12-state-machine-and-status-transitions)
13. [Security Requirements](#13-security-requirements)
14. [Emergency Procedures](#14-emergency-procedures)
15. [Testing Requirements](#15-testing-requirements)
16. [Operational Requirements](#16-operational-requirements)
17. [Timeline and Milestones](#17-timeline-and-milestones)
18. [Risks and Mitigations](#18-risks-and-mitigations)
19. [Glossary of Terms](#19-glossary-of-terms)
20. [Appendices](#20-appendices)

---

## 1. Executive Summary

### 1.1 Product Vision

Goliath Slingshot is a Uniswap V2-based DEX frontend running on Goliath Testnet (Chain ID 8901), currently supporting swaps and liquidity for XCN (native), WXCN, USDC, ETH, and BTC tokens exclusively on Goliath.

This project delivers a **bi-directional cross-chain bridge** enabling secure asset transfers between **Ethereum Sepolia** (Chain ID 11155111) and **Goliath Testnet** (Chain ID 8901).

### 1.2 Key Objectives

1. **Enable Cross-Chain Movement**: Users can bridge XCN, ETH, BTC, and USDC between Ethereum Sepolia and Goliath Testnet in both directions
2. **Consistent User Experience**: Bridge UI mirrors the familiar Swap interface, minimizing learning curve
3. **Supply Invariant Preservation**: Maintain strict 1:1 supply relationships between locked/minted tokens across chains
4. **Production-Ready Architecture**: Design robust enough to serve as the foundation for future mainnet deployment
5. **Transparent Status Tracking**: Provide real-time visibility into bridge operation status with clear error handling

### 1.3 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Ethereum Sepolia <-> Goliath Testnet bridging | Mainnet deployment |
| XCN, ETH, BTC, USDC tokens | Additional token support |
| Lock-mint / burn-release mechanisms | Native cross-chain messaging protocols (LayerZero, etc.) |
| Trusted relayer architecture with multisig support | Fully trustless bridge (v2 consideration) |
| Frontend integration in Slingshot | Mobile native apps |
| Status API and monitoring | Third-party bridge aggregator integration |

---

## 2. Problem Statement

### 2.1 Current State

The Slingshot application currently:
- Connects exclusively to Goliath Testnet
- Displays a disabled "Bridge" navigation item in the header
- Provides no mechanism to transfer assets between Ethereum Sepolia and Goliath Testnet
- Forces users to rely on faucets or manual airdrops to acquire test assets on Goliath

### 2.2 Core Problems

| Problem | Impact | Severity |
|---------|--------|----------|
| **Onboarding Friction** | Developers and testers cannot easily obtain test assets on Goliath, limiting protocol testing | High |
| **Liquidity Isolation** | Assets on Sepolia cannot be utilized on Goliath, preventing realistic DeFi testing scenarios | High |
| **Dead UI Affordance** | Disabled Bridge tab creates confusion and reduces user trust | Medium |
| **Ecosystem Fragmentation** | No unified entry point for cross-chain Goliath participation | Medium |

### 2.3 Opportunity

A bi-directional bridge integrated into Slingshot will:
- Enable seamless movement of standard test assets (XCN, ETH, BTC, USDC) between networks
- Position the DEX as the central entry point for the Goliath ecosystem
- Establish patterns and infrastructure reusable for mainnet deployment
- Demonstrate cross-chain capabilities to potential integrators and users

---

## 3. Goals and Success Metrics

### 3.1 Primary Goals

| Goal ID | Goal | Description |
|---------|------|-------------|
| G-1 | Enable Cross-Chain Movement | Users can bridge supported assets between Sepolia and Goliath in both directions |
| G-2 | Simple, Predictable UX | Bridge interface reuses familiar Swap patterns with clear network and token selection |
| G-3 | Safe, Invariant-Preserving Bridge | System maintains strict 1:1 supply relationships at all times |
| G-4 | Production-Ready Design | Architecture supports future mainnet deployment without fundamental redesign |

### 3.2 Success Metrics

#### 3.2.1 Functional Metrics

| Metric ID | Metric | Target | Measurement Method |
|-----------|--------|--------|-------------------|
| M-1 | Bridge Success Rate | >= 99% of valid bridge requests complete without manual intervention | Relayer logs + contract events |
| M-2 | Asset Direction Coverage | 100% of supported assets bridgeable in both directions | Manual verification |
| M-3 | Token Support | All 4 tokens (XCN, ETH, BTC, USDC) operational | Integration tests |

#### 3.2.2 Performance Metrics

| Metric ID | Metric | Target | Measurement Method |
|-----------|--------|--------|-------------------|
| M-4 | Bridge Completion Time (P95) | <= 5 minutes under normal conditions | Timestamp analysis |
| M-5 | Bridge Completion Time (P99) | <= 10 minutes under normal conditions | Timestamp analysis |
| M-6 | Status API Response Time (P95) | <= 200ms | API monitoring |
| M-7 | Relayer Processing Latency | <= 30 seconds from finality to destination tx submission | Relayer metrics |

#### 3.2.3 Reliability Metrics

| Metric ID | Metric | Target | Measurement Method |
|-----------|--------|--------|-------------------|
| M-8 | Supply Invariant Violations | 0 incidents | Automated monitoring |
| M-9 | Transaction Observability | 100% of bridge transactions logged and traceable | Log audit |
| M-10 | Relayer Uptime | >= 99.5% | Health check monitoring |
| M-11 | Data Loss Events | 0 lost/orphaned bridge operations | Reconciliation audit |

#### 3.2.4 UX Metrics

| Metric ID | Metric | Target | Measurement Method |
|-----------|--------|--------|-------------------|
| M-12 | Abandonment Rate | < 2% of bridge attempts abandoned due to UX issues | Analytics |
| M-13 | Support Tickets | < 5% of bridge operations result in support requests | Support tracking |

---

## 4. Target Users

### 4.1 User Personas

#### 4.1.1 Protocol Developer (Primary)

| Attribute | Description |
|-----------|-------------|
| **Role** | Smart contract developer building on Goliath |
| **Goals** | Move test assets to Goliath for contract testing and integration verification |
| **Pain Points** | Limited test asset availability, unclear transaction status, debugging difficulties |
| **Technical Level** | High - comfortable with blockchain explorers, contract interactions |
| **Expectations** | Clear status/debugging info, deterministic behavior, tx hashes and explorer links |

#### 4.1.2 Liquidity Provider (Primary)

| Attribute | Description |
|-----------|-------------|
| **Role** | DeFi user providing liquidity on Goliath DEX |
| **Goals** | Bridge USDC/ETH/BTC/XCN to Goliath, provide liquidity, withdraw to Sepolia |
| **Pain Points** | Complex multi-step processes, uncertainty about asset safety |
| **Technical Level** | Medium-High - familiar with DeFi operations |
| **Expectations** | Familiar AMM UI patterns, clear fee visibility, accurate time estimates |

#### 4.1.3 QA/Ecosystem Tester (Secondary)

| Attribute | Description |
|-----------|-------------|
| **Role** | Internal or external tester validating protocol functionality |
| **Goals** | Reliable, repeatable bridging for test scenario execution |
| **Pain Points** | Unclear error states, difficulty reproducing issues |
| **Technical Level** | Medium |
| **Expectations** | Understandable error messages, bridge history visibility, failure diagnostics |

### 4.2 User Needs Priority Matrix

| Need | Developer | LP | Tester | Priority |
|------|-----------|-----|--------|----------|
| Clear transaction status | High | High | High | P0 |
| Explorer links for all transactions | High | Medium | High | P0 |
| Accurate time estimates | Medium | High | Medium | P1 |
| Fee visibility | Medium | High | Low | P1 |
| Bridge history | Medium | Medium | High | P1 |
| Error recovery guidance | High | Medium | High | P0 |
| Custom recipient address | High | Low | Medium | P2 |

---

## 5. Product Overview

### 5.1 High-Level Description

The **Goliath Slingshot Bridge** is a cross-chain transfer feature integrated into the Slingshot DEX interface. Users select:

- **Origin Network**: Ethereum Sepolia or Goliath Testnet
- **Destination Network**: Automatically set to the opposite network
- **Token**: XCN, ETH, BTC, or USDC (based on origin chain availability)
- **Amount**: Quantity to bridge
- **Recipient** (Optional): Destination address if different from sender

### 5.2 Bridge Mechanism

```
Sepolia -> Goliath (Lock-Mint):
[User] --deposit--> [BridgeSepolia Contract] --locks tokens-->
[Relayer observes] --signs message--> [BridgeGoliath Contract] --mints wrapped tokens--> [User on Goliath]

Goliath -> Sepolia (Burn-Release):
[User] --burn--> [BridgeGoliath Contract] --burns wrapped tokens-->
[Relayer observes] --signs message--> [BridgeSepolia Contract] --releases tokens--> [User on Sepolia]
```

### 5.3 Token Mapping

| Token Symbol | Sepolia Address | Goliath Address | Decimals | Notes |
|--------------|-----------------|-----------------|----------|-------|
| XCN | TBD (ERC-20) | Native Currency / 0xd319Df5FA3efb42B5fe4c5f873A7049f65428877 (WXCN) | 18 | Native on Goliath, ERC-20 on Sepolia |
| ETH | TBD (ERC-20) | 0xF22914De280D7B60255859bA6933831598fB5DD6 | 18 | Wrapped on both chains |
| BTC | TBD (ERC-20) | 0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10 | 8 | Wrapped on both chains |
| USDC | TBD (ERC-20) | 0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E | 6 | Stablecoin |

---

## 6. Functional Requirements

### 6.1 Networks and Tokens

#### FR-1: Supported Networks

**Description**: The bridge feature shall support exactly two networks in v1.

**Specification**:
| Network | Chain ID | RPC Endpoint Source | Block Time | Finality Blocks |
|---------|----------|---------------------|------------|-----------------|
| Ethereum Sepolia | 11155111 | Environment variable | ~12s | 12 blocks |
| Goliath Testnet | 8901 | Environment variable | ~2s | 6 blocks |

**Acceptance Criteria**:
1. Bridge page displays both networks in network selector dropdown
2. Network switching triggers appropriate wallet prompts
3. Both networks are correctly identified by chain ID in all contract interactions
4. Network metadata (name, chain ID, RPC URL, block explorer) is configurable via environment variables

---

#### FR-2: Supported Tokens

**Description**: The bridge shall support a defined set of tokens with explicit address mappings.

**Specification**:
```typescript
interface TokenMapping {
  symbol: 'XCN' | 'ETH' | 'BTC' | 'USDC';
  sepoliaAddress: Address;      // Non-zero ERC-20 address
  goliathAddress: Address;      // ERC-20 or wrapper address
  decimals: number;             // Must match on both chains
  isNativeOnGoliath: boolean;   // True only for XCN
}
```

**Acceptance Criteria**:
1. All four tokens (XCN, ETH, BTC, USDC) appear in the token selector when on either network
2. Token mappings are defined in `src/constants/bridge.ts`
3. Each token displays correct balance on the origin network
4. Token decimals are consistent across the bridge (no precision loss)
5. Tokens without valid mapping on both chains are not selectable

---

#### FR-3: 1:1 Token Linkage

**Description**: Bridging must maintain 1:1 value correspondence for the same symbol across chains.

**Specification**:
- Destination token is always the same symbol as origin token
- User cannot modify or select destination token
- Amount entered equals amount received (minus any protocol fees, which are 0 for v1)

**Acceptance Criteria**:
1. "To" panel always displays the same token symbol as "From" panel
2. "To" amount equals "From" amount (both displayed to user)
3. Actual minted/released amount on destination equals deposited/burned amount on origin
4. No token selector appears in the "To" panel

---

### 6.2 Frontend: Navigation and Routing

#### FR-4: Bridge Tab Activation

**Description**: Enable the currently disabled Bridge navigation entry.

**Specification**:
- Remove disabled state from Bridge navigation item
- Add route handler for `/bridge` path (HashRouter compatible: `/#/bridge`)
- Bridge page component mounted at this route

**Acceptance Criteria**:
1. Bridge navigation item is visually enabled (not grayed out)
2. Bridge item is clickable and navigates to `/bridge` route
3. Direct URL access to `/#/bridge` renders the Bridge page
4. Navigation works correctly with browser back/forward buttons

---

#### FR-5: Active Route State

**Description**: Visual indication of active Bridge route in navigation.

**Specification**:
- Apply active state styling consistent with Swap/Pool tabs
- Use existing `activeClassName` pattern from NavLink components

**Acceptance Criteria**:
1. Bridge tab shows active/selected styling when on `/bridge` route
2. Styling matches existing Swap/Pool active states
3. Only one tab shows active state at any time

---

### 6.3 Frontend: Bridge Page Layout

#### FR-6: Swap-Like Layout

**Description**: Bridge page reuses existing Swap page layout components for consistency.

**Specification**:
Required Components:
- `AppBody` wrapper for consistent card styling
- `CurrencyInputPanel` for amount entry (modified for bridge context)
- Network selector component (new)
- `TransactionConfirmationModal` pattern for confirmation flow
- Settings gear for advanced options (recipient address)

Layout Structure:
```
+----------------------------------+
|  Network Selector (Origin/Dest)  |
+----------------------------------+
|  From: [Network] [Amount] [Token]|
|  Balance: X.XX  [MAX]            |
+----------------------------------+
|         [Swap Direction Icon]     |
+----------------------------------+
|  To: [Network] [Amount] [Token]  |
|  (Read-only, mirrors From)       |
+----------------------------------+
|  [Primary Action Button]          |
+----------------------------------+
|  Estimated Time: ~3-5 min        |
+----------------------------------+
```

**Acceptance Criteria**:
1. Bridge page renders within `AppBody` wrapper
2. Amount input field accepts numeric input with decimal support
3. Token selector dropdown shows only supported bridge tokens
4. MAX button sets amount to maximum spendable balance
5. Primary action button displays context-appropriate label
6. Layout is responsive and matches Swap page visual style
7. Estimated completion time is displayed below the action button

---

#### FR-7: Network Display

**Description**: Clear labeling of origin and destination networks.

**Specification**:
- From panel label format: "From [Network Name]" (e.g., "From Ethereum Sepolia")
- To panel label format: "To [Network Name]" (e.g., "To Goliath Testnet")
- Network names must match the official names used in wallet prompts

**Acceptance Criteria**:
1. From panel displays "From Ethereum Sepolia" or "From Goliath Testnet"
2. To panel displays "To Goliath Testnet" or "To Ethereum Sepolia"
3. Network names update immediately when direction is changed
4. Network icons/logos displayed alongside names (if available)

---

#### FR-8: Network Selection Behavior

**Description**: User-controlled origin network selection with automatic destination assignment.

**Specification**:
- Origin network: Dropdown with two options (Ethereum Sepolia, Goliath Testnet)
- Destination network: Automatically set to the opposite of origin
- Direction swap button: Swaps origin and destination with single click

Behavior on Origin Change:
1. Update destination to opposite network
2. Clear any pending approval state
3. Preserve entered amount if valid
4. Trigger balance refresh for new origin network
5. Clear any error messages from previous state

**Acceptance Criteria**:
1. Clicking origin network dropdown shows both network options
2. Selecting a network updates both From and To labels appropriately
3. Direction swap icon/button exchanges origin and destination
4. Amount field retains value after direction change
5. Balance updates to reflect new origin network within 2 seconds
6. Approval state resets when networks change

---

### 6.4 Wallet and Network Handling

#### FR-9: Wallet Connection

**Description**: Reuse existing wallet connection infrastructure.

**Specification**:
- Support existing wallet options: MetaMask, WalletConnect, Coinbase Wallet
- If wallet not connected, primary CTA displays "Connect Wallet"
- Clicking "Connect Wallet" opens the standard wallet modal

**Acceptance Criteria**:
1. Disconnected state shows "Connect Wallet" as primary button
2. Clicking "Connect Wallet" opens wallet selection modal
3. After connection, button updates to show next required action
4. Connected wallet address displays in header (existing behavior)
5. All supported wallet types function correctly with bridge feature

---

#### FR-10: Network Mismatch Handling

**Description**: Guide users to switch to the correct network before bridging.

**Specification**:
- Detect wallet's current chain ID
- Compare against selected origin network
- If mismatch: Display "Switch Network to [Origin Network]" button
- On click: Trigger EIP-3085 `wallet_addEthereumChain` (if needed) followed by EIP-3326 `wallet_switchEthereumChain`

Network Configuration for Wallet:
```typescript
// Goliath Testnet
{
  chainId: '0x22C5', // 8901
  chainName: 'Goliath Testnet',
  nativeCurrency: { name: 'XCN', symbol: 'XCN', decimals: 18 },
  rpcUrls: [REACT_APP_GOLIATH_RPC_URL],
  blockExplorerUrls: [REACT_APP_GOLIATH_EXPLORER_URL]
}

// Sepolia (usually pre-configured in wallets)
{
  chainId: '0xAA36A7', // 11155111
  chainName: 'Sepolia',
  nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: [REACT_APP_SEPOLIA_RPC_URL],
  blockExplorerUrls: ['https://sepolia.etherscan.io']
}
```

**Acceptance Criteria**:
1. Network mismatch is detected within 1 second of origin network change
2. "Switch Network" button displays with correct target network name
3. Clicking button prompts wallet to switch/add network
4. If user rejects switch, button remains with helpful tooltip
5. After successful switch, UI updates to show next action within 2 seconds
6. Bridge transaction cannot be initiated until networks match

---

#### FR-11: Native vs ERC-20 Handling

**Description**: Handle XCN's special nature as native currency on Goliath.

**Specification**:

For Goliath -> Sepolia (XCN):
- XCN is native currency on Goliath
- Bridge contract must accept native XCN via `payable` function
- UI must calculate gas buffer to leave minimum XCN for future transactions
- Alternatively, user may need to wrap XCN -> WXCN before bridging (TBD by contract design)

For Sepolia -> Goliath (XCN):
- XCN is ERC-20 on Sepolia
- Standard ERC-20 approval + transfer flow applies
- On Goliath, user receives either native XCN or WXCN (TBD by contract design)

**Acceptance Criteria**:
1. XCN bridging from Goliath correctly handles native currency semantics
2. Gas buffer of 0.01 XCN reserved when using MAX for native XCN
3. XCN bridging from Sepolia uses standard ERC-20 flow
4. UI clearly indicates whether user will receive XCN or WXCN on destination
5. If wrapping is required, UI guides user through the process

---

### 6.5 Amount and Validation

#### FR-12: Amount Entry

**Description**: Single amount entry with 1:1 mirroring to destination.

**Specification**:
- Amount entered in "From" field only
- "To" field displays same amount (read-only)
- Support decimal entry matching token decimals
- Amount stored internally with full precision (no rounding during entry)

**Acceptance Criteria**:
1. "From" field accepts numeric input with decimal point
2. "To" field displays same value as "From" field
3. "To" field is not editable
4. Decimal precision matches token decimals (e.g., 6 for USDC, 18 for ETH)
5. Very small amounts (< 0.000001) display correctly
6. Very large amounts display with appropriate formatting

---

#### FR-13: Balance Display

**Description**: Show user's available balance for selected token on origin network.

**Specification**:
- Display balance in "From" panel below amount input
- Format: "Balance: X.XXXX [TOKEN]"
- Refresh balance on: network change, token change, after transaction confirmation
- MAX button: Set amount to full balance minus gas buffer (for native tokens)

Gas Buffer Configuration:
| Token | Gas Buffer |
|-------|------------|
| XCN (native) | 0.01 XCN |
| All ERC-20s | 0 (no buffer needed) |

**Acceptance Criteria**:
1. Balance displays within 3 seconds of page load
2. Balance updates within 5 seconds of network/token change
3. Balance shows appropriate decimal places (max 6 displayed)
4. MAX button sets full balance for ERC-20 tokens
5. MAX button sets (balance - 0.01) for native XCN on Goliath
6. Balance refreshes after bridge transaction completes

---

#### FR-14: Validation Rules

**Description**: Comprehensive input validation with clear feedback.

**Specification**:

| Condition | Button State | Message |
|-----------|--------------|---------|
| Wallet not connected | "Connect Wallet" | N/A |
| Network mismatch | "Switch Network to [X]" | N/A |
| Amount empty | Disabled | "Enter an amount" |
| Amount is 0 | Disabled | "Enter an amount" |
| Amount > balance | Disabled | "Insufficient [TOKEN] balance" |
| Amount < minimum (0.000001) | Disabled | "Amount too small" |
| Amount > daily limit | Disabled | "Exceeds daily bridge limit" |
| Token not supported | Disabled | "Token not supported for bridging" |
| Bridge paused | Disabled | "Bridge is temporarily paused" |
| Bridge contract not configured | Disabled | "Bridge unavailable" |
| Approval needed | "Approve [TOKEN]" | N/A |
| Ready to bridge | "Bridge [TOKEN]" | N/A |

**Acceptance Criteria**:
1. Each validation condition triggers appropriate button state
2. Error messages display inline below amount field or as tooltip
3. Multiple validation failures show highest priority message
4. Validation runs on every input change (debounced 300ms)
5. Button state updates within 500ms of validation completion

---

### 6.6 Bridge Flow: Sepolia -> Goliath (Lock-Mint)

#### FR-15: Approval Step

**Description**: ERC-20 approval required before deposit.

**Specification**:
- Check current allowance: `token.allowance(user, bridgeSepoliaAddress)`
- If allowance < amount: Show "Approve [TOKEN]" button
- Approval amount: Use max uint256 (unlimited) or exact amount (user preference in settings)
- After approval tx confirms: Button changes to "Bridge [TOKEN]"

**Acceptance Criteria**:
1. Allowance check completes within 2 seconds of amount entry
2. "Approve [TOKEN]" button appears when allowance insufficient
3. Clicking Approve opens wallet confirmation
4. Approval transaction hash is displayed and tracked
5. After approval confirms, "Bridge [TOKEN]" button appears within 5 seconds
6. Approval state persists across page refresh (checked from chain)

---

#### FR-16: Deposit Transaction

**Description**: Lock tokens on Sepolia bridge contract.

**Specification**:
Contract Call:
```solidity
function deposit(
    address token,
    uint256 amount,
    address destinationAddress
) external returns (bytes32 depositId);
```

Parameters:
- `token`: ERC-20 token address on Sepolia
- `amount`: Amount in token's smallest unit (wei equivalent)
- `destinationAddress`: Recipient on Goliath (defaults to sender's address)

**Acceptance Criteria**:
1. Clicking "Bridge [TOKEN]" opens confirmation modal
2. Confirmation modal displays:
   - Origin network: Ethereum Sepolia
   - Destination network: Goliath Testnet
   - Token symbol and amount
   - Recipient address (with warning if different from sender)
   - Estimated completion time: "~3-5 minutes"
   - Link to transaction on Sepolia Etherscan
3. After user confirms in wallet, transaction hash is displayed
4. Transaction failure shows clear error message with retry option
5. Successful deposit emits trackable `Deposit` event

---

#### FR-17: Status Tracking (Sepolia -> Goliath)

**Description**: Multi-step progress indication for bridge operation.

**Specification**:
Status Stepper UI:
```
Step 1: [X] Deposit submitted on Ethereum Sepolia
        -> Tx: 0x123... [View on Etherscan]

Step 2: [X] Waiting for confirmations (12/12)
        -> Estimated: ~2 minutes

Step 3: [~] Minting on Goliath Testnet
        -> Processing...

Step 4: [ ] Completed
        -> Tx: 0xabc... [View on Explorer]
```

Status Update Sources:
1. Local transaction tracking (for origin tx)
2. Status API polling (every 5 seconds)
3. Destination chain event monitoring (optional enhancement)

**Acceptance Criteria**:
1. Stepper appears immediately after deposit tx submission
2. Step 1 shows "pending" until origin tx confirms
3. Step 2 shows confirmation count (e.g., "3/12 confirmations")
4. Step 3 activates after origin reaches finality
5. Step 4 shows success with destination tx hash
6. Each step includes timestamp
7. Explorer links open in new tab
8. Stepper state persists across page refresh

---

#### FR-18: Completion Handling

**Description**: Success state and post-completion actions.

**Specification**:
Completion Trigger: Destination mint transaction confirmed on Goliath

Success Modal Content:
- Checkmark icon with "Bridge Complete" heading
- Amount and token bridged
- Origin tx hash with explorer link
- Destination tx hash with explorer link
- "Switch to Goliath Testnet" button (if not already on Goliath)
- "Swap Tokens" button (links to /swap with bridged token pre-selected)
- "Bridge More" button (resets form)

**Acceptance Criteria**:
1. Success modal appears within 5 seconds of destination tx confirmation
2. Both transaction hashes are displayed and copyable
3. "Switch to Goliath" prompts wallet network switch
4. "Swap Tokens" navigates to /swap with correct token context
5. "Bridge More" clears form and returns to initial state
6. Bridge operation marked as "completed" in history

---

### 6.7 Bridge Flow: Goliath -> Sepolia (Burn-Release)

#### FR-19: Origin Handling (Goliath)

**Description**: Token interaction on Goliath origin.

**Specification**:
- Reuse existing Goliath token balance and allowance hooks
- For native XCN: Handle as native currency or WXCN based on contract design
- For ERC-20 tokens (ETH, BTC, USDC wrapped versions): Standard approval flow

**Acceptance Criteria**:
1. Token balances display correctly for all supported tokens
2. Approval step appears for ERC-20 tokens if needed
3. Native XCN handling works correctly (wrap if required)
4. Goliath block explorer links function correctly

---

#### FR-20: Burn Transaction

**Description**: Burn wrapped tokens on Goliath bridge contract.

**Specification**:
Contract Call:
```solidity
function burn(
    address token,
    uint256 amount,
    address destinationAddress
) external returns (bytes32 withdrawId);

// For native XCN (if supported)
function burnNative(
    address destinationAddress
) external payable returns (bytes32 withdrawId);
```

**Acceptance Criteria**:
1. "Bridge [TOKEN]" initiates burn transaction
2. Confirmation modal shows:
   - Origin: Goliath Testnet
   - Destination: Ethereum Sepolia
   - Token and amount
   - Recipient address
   - Estimated time: "~3-5 minutes"
3. Burn transaction tracked with Goliath explorer link
4. `Withdraw` event emitted on success

---

#### FR-21: Status Tracking (Goliath -> Sepolia)

**Description**: Progress indication for Goliath to Sepolia direction.

**Specification**:
Status Stepper:
```
Step 1: [X] Burn submitted on Goliath Testnet
Step 2: [X] Waiting for finality (6/6 blocks)
Step 3: [~] Releasing on Ethereum Sepolia
Step 4: [ ] Completed
```

**Acceptance Criteria**:
1. Stepper shows Goliath-specific terminology ("Burn" not "Deposit")
2. Finality blocks count: 6 for Goliath
3. Release step activates after Goliath finality
4. Completion shows Sepolia release tx hash
5. Status updates work correctly in this direction

---

#### FR-22: Completion Handling (Goliath -> Sepolia)

**Description**: Success state for Goliath to Sepolia bridges.

**Specification**:
Same structure as FR-18 but with:
- "Switch to Sepolia" button instead of Goliath
- Appropriate explorer links (Goliath for burn, Etherscan for release)

**Acceptance Criteria**:
1. Success modal shows both transaction hashes
2. Goliath explorer link for burn transaction
3. Etherscan link for release transaction
4. "Switch to Sepolia" triggers network switch prompt

---

### 6.8 Bridge Status and History

#### FR-23: Status Persistence

**Description**: Bridge operations stored for tracking and recovery.

**Specification**:
Storage Schema (Redux + LocalStorage):
```typescript
interface BridgeOperation {
  id: string;                          // UUID
  direction: 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA';
  token: string;                       // Token symbol
  amount: string;                      // Amount in smallest unit
  sender: Address;                     // User address
  recipient: Address;                  // Destination address
  originTxHash: string | null;         // Origin chain tx hash
  destinationTxHash: string | null;    // Destination chain tx hash
  depositId: string | null;            // From contract event
  status: BridgeStatus;
  createdAt: number;                   // Unix timestamp
  updatedAt: number;                   // Unix timestamp
  originConfirmations: number;         // Current confirmation count
  requiredConfirmations: number;       // Required for finality
  errorMessage: string | null;         // Error details if failed
}

type BridgeStatus =
  | 'PENDING_ORIGIN_TX'      // Waiting for origin tx to be mined
  | 'CONFIRMING'             // Origin tx mined, waiting for confirmations
  | 'AWAITING_RELAY'         // Origin finalized, waiting for relayer
  | 'PROCESSING_DESTINATION' // Relayer submitted destination tx
  | 'COMPLETED'              // Destination tx confirmed
  | 'FAILED'                 // Permanent failure
  | 'EXPIRED'                // Timeout exceeded
  | 'DELAYED';               // Taking longer than expected
```

**Acceptance Criteria**:
1. New bridge operation creates record immediately on tx submission
2. Status updates persisted to localStorage
3. Operations retrievable by user address
4. Old operations (> 30 days) can be archived/pruned
5. Data model supports all required status transitions

---

#### FR-24: Status Recovery After Reload

**Description**: Resume tracking of in-progress bridges after page refresh.

**Specification**:
On Page Load:
1. Load pending operations from localStorage
2. For each pending operation:
   a. Query origin chain for tx status
   b. Query status API for relay status
   c. Query destination chain for completion
3. Update local state with current status
4. Resume status polling for non-terminal operations

**Acceptance Criteria**:
1. In-progress bridges appear in UI within 5 seconds of page load
2. Status is accurate (reconciled with chain/API state)
3. Polling resumes automatically for pending operations
4. Completed operations show final status correctly
5. Multiple browser tabs handle concurrent updates correctly

---

#### FR-25: Failure State Handling

**Description**: Clear handling and communication of bridge failures.

**Specification**:

| Failure Type | Detection | User Message | Recovery Action |
|--------------|-----------|--------------|-----------------|
| Origin tx reverted | Tx receipt status = 0 | "Bridge transaction failed. Your funds were not transferred." | Retry button |
| Origin tx dropped | Not mined after 30 min | "Transaction not confirmed. It may have been dropped." | Retry with higher gas |
| Relay timeout | No destination tx after 60 min | "Bridge is delayed. Your funds are safe. Please wait or contact support." | Contact support link |
| Destination tx failed | Destination receipt status = 0 | "Funds locked but not received. Contact support with tx hash." | Support ticket creation |
| API unreachable | API calls fail | "Status temporarily unavailable. Tracking will resume automatically." | Auto-retry |

**Acceptance Criteria**:
1. Each failure type displays appropriate message
2. Retry button available for retriable failures
3. Support contact info provided for non-retriable failures
4. Original origin tx hash always preserved and displayable
5. "Delayed" status triggers after 60 minutes without completion
6. No data loss occurs during API outages

---

#### FR-26: Bridge History View

**Description**: List of user's past and pending bridge operations.

**Specification**:
History Panel Location: Collapsible section below bridge form or accessible via "History" tab

Display Format:
```
+------------------------------------------------+
| Bridge History                          [View All]|
+------------------------------------------------+
| [Pending] 100 USDC | Sepolia -> Goliath       |
|   Step 3/4: Minting...        3 min ago       |
+------------------------------------------------+
| [Completed] 50 ETH | Goliath -> Sepolia       |
|   2 hours ago                 [View Details]  |
+------------------------------------------------+
| [Failed] 25 BTC | Sepolia -> Goliath          |
|   Yesterday                   [Retry]         |
+------------------------------------------------+
```

**Acceptance Criteria**:
1. Shows last 5 operations in collapsed view
2. "View All" expands to show complete history
3. Pending operations show current step
4. Completed operations show elapsed time
5. Failed operations show retry option (if applicable)
6. Each entry clickable to view full details

---

### 6.9 Smart Contract Requirements

#### FR-27: Bridge Contract Deployment

**Description**: Deploy bridge contracts on both networks.

**Specification**:
- `BridgeSepolia`: Deployed on Ethereum Sepolia
- `BridgeGoliath`: Deployed on Goliath Testnet

Contract Ownership:
- Owner: Multisig address (3-of-5 recommended for testnet)
- Admin functions protected by onlyOwner modifier

**Acceptance Criteria**:
1. Both contracts deployed and verified on respective explorers
2. Contract addresses stored in environment configuration
3. Ownership transferred to multisig after deployment
4. All admin functions only callable by owner

---

#### FR-28: Deposit Events (Sepolia)

**Description**: BridgeSepolia emits trackable events on deposit.

**Specification**:
```solidity
event Deposit(
    bytes32 indexed depositId,
    address indexed token,
    address indexed sender,
    address destinationAddress,
    uint256 amount,
    uint64 timestamp,
    uint64 sourceChainId
);
```

**Acceptance Criteria**:
1. Event emitted on every successful deposit
2. depositId is unique (derived from nonce + tx hash or similar)
3. All parameters correctly indexed for efficient filtering
4. Event data sufficient for relayer to construct mint message

---

#### FR-29: Mint Function (Goliath)

**Description**: BridgeGoliath mints tokens upon relayer attestation.

**Specification**:
```solidity
function mint(
    bytes32 depositId,
    address token,
    address recipient,
    uint256 amount,
    bytes[] calldata signatures
) external;
```

Requirements:
- Validate signatures meet threshold (T of M validators)
- Verify depositId not already processed (replay protection)
- Mint correct wrapped token to recipient
- Emit `Mint` event with depositId reference

**Acceptance Criteria**:
1. Minting fails if signature threshold not met
2. Minting fails if depositId already processed
3. Correct amount minted to correct recipient
4. Mint event emitted with all relevant details
5. Token supply increases exactly by minted amount

---

#### FR-30: Burn/Withdraw Events (Goliath)

**Description**: BridgeGoliath emits events when tokens are burned.

**Specification**:
```solidity
event Withdraw(
    bytes32 indexed withdrawId,
    address indexed token,
    address indexed sender,
    address destinationAddress,
    uint256 amount,
    uint64 timestamp,
    uint64 sourceChainId
);
```

**Acceptance Criteria**:
1. Event emitted on every successful burn
2. withdrawId is unique across all burns
3. Burned tokens are actually removed from circulation
4. Event data sufficient for relayer to construct release message

---

#### FR-31: Release Function (Sepolia)

**Description**: BridgeSepolia releases locked tokens upon relayer attestation.

**Specification**:
```solidity
function release(
    bytes32 withdrawId,
    address token,
    address recipient,
    uint256 amount,
    bytes[] calldata signatures
) external;
```

Requirements:
- Validate signatures meet threshold
- Verify withdrawId not already processed
- Transfer locked tokens to recipient
- Emit `Release` event

**Acceptance Criteria**:
1. Release fails if signature threshold not met
2. Release fails if withdrawId already processed
3. Correct amount transferred to recipient
4. Release event emitted with all details
5. Contract must have sufficient locked balance

---

#### FR-32: Supply Invariants

**Description**: System must maintain supply invariants at all times.

**Specification**:
Invariant 1 (Sepolia -> Goliath):
```
totalLockedOnSepolia[token] >= totalMintedOnGoliath[token]
```

Invariant 2 (Goliath -> Sepolia):
```
totalReleasedOnSepolia[token] <= totalBurnedOnGoliath[token]
```

Monitoring:
- Automated script checks invariants every block
- Alert triggered on any violation

**Acceptance Criteria**:
1. Invariants mathematically provable from contract logic
2. No code path allows invariant violation
3. Monitoring system deployed and operational
4. Alert fires within 60 seconds of violation
5. Emergency pause triggered on invariant violation

---

#### FR-33: Rate Limits and Caps

**Description**: Configurable limits to bound risk exposure.

**Specification**:
```solidity
struct TokenLimits {
    uint256 maxPerTransaction;    // Max single bridge amount
    uint256 maxDailyVolume;       // Rolling 24h limit
    uint256 currentDailyVolume;   // Current 24h usage
    uint256 lastResetTimestamp;   // Last daily reset
    bool isPaused;                // Token-specific pause
}

mapping(address => TokenLimits) public tokenLimits;
```

Default Limits (Testnet):
| Token | Max Per Tx | Daily Volume |
|-------|------------|--------------|
| USDC | 100,000 | 1,000,000 |
| ETH | 100 | 1,000 |
| BTC | 10 | 100 |
| XCN | 1,000,000 | 10,000,000 |

**Acceptance Criteria**:
1. Transactions exceeding maxPerTransaction revert
2. Transactions exceeding remaining daily volume revert
3. Daily volume resets after 24 hours
4. Limits adjustable by owner
5. Per-token pause prevents all operations for that token
6. Frontend displays remaining daily capacity

---

#### FR-34: Global Pause Mechanism

**Description**: Emergency pause capability for entire bridge.

**Specification**:
```solidity
bool public depositsPaused;
bool public withdrawalsPaused;

modifier whenDepositsNotPaused() {
    require(!depositsPaused, "Deposits paused");
    _;
}

function pauseDeposits() external onlyOwner;
function unpauseDeposits() external onlyOwner;
function pauseWithdrawals() external onlyOwner;
function unpauseWithdrawals() external onlyOwner;
```

**Acceptance Criteria**:
1. Pause functions only callable by owner (multisig)
2. Paused state prevents new deposits/withdrawals
3. In-flight operations can still complete (mint/release not paused)
4. Pause events emitted for monitoring
5. Frontend shows pause status to users

---

### 6.10 Relayer Service Requirements

#### FR-35: Event Monitoring

**Description**: Relayer subscribes to bridge events on both chains.

**Specification**:
Event Sources:
- Sepolia: `Deposit` events from BridgeSepolia
- Goliath: `Withdraw` events from BridgeGoliath

Processing Requirements:
- Subscribe to events via WebSocket or polling
- Wait for finality before processing (12 blocks Sepolia, 6 blocks Goliath)
- Persist event data before processing
- Idempotent processing (handle restarts gracefully)

**Acceptance Criteria**:
1. Events detected within 5 seconds of emission
2. No events missed during normal operation
3. Finality wait period enforced before relay
4. Events persisted to database before processing
5. Duplicate events handled gracefully (no double processing)

---

#### FR-36: Message Signing

**Description**: Relayer signs messages for cross-chain attestation.

**Specification**:
Message Format:
```
keccak256(abi.encodePacked(
    uint256 sourceChainId,
    uint256 destChainId,
    bytes32 operationId,    // depositId or withdrawId
    address token,
    address recipient,
    uint256 amount,
    uint256 nonce           // Prevents replay
))
```

Signature Requirements:
- ECDSA signature with recovery
- Signed by authorized validator key(s)
- T-of-M threshold for multi-validator setup

**Acceptance Criteria**:
1. Message format deterministic and verifiable
2. Signature recovers to authorized validator address
3. Signature verification succeeds on destination contract
4. Replay protection via nonce/operationId
5. Chain ID included to prevent cross-chain replay

---

#### FR-37: Validator Set Management

**Description**: Support for multi-validator signing threshold.

**Specification**:
Initial Configuration (Testnet):
- Threshold: 1-of-1 (single validator for simplicity)
- Upgradeable to 2-of-3 or 3-of-5 for production

Validator Set Updates:
```solidity
function updateValidators(
    address[] calldata newValidators,
    uint256 newThreshold
) external onlyOwner;
```

**Acceptance Criteria**:
1. Validator set stored in contract
2. Threshold validation: 0 < threshold <= validators.length
3. Validator updates take effect immediately
4. Old signatures invalid after validator removal
5. Event emitted on validator set change

---

#### FR-38: Destination Transaction Submission

**Description**: Relayer submits transactions to destination chain.

**Specification**:
Submission Process:
1. Construct transaction with signed message
2. Estimate gas with buffer (20% overhead)
3. Submit transaction with appropriate gas price
4. Monitor for confirmation
5. Retry with higher gas if stuck

Retry Logic:
- Max retries: 3
- Retry delay: 30 seconds between attempts
- Gas price escalation: +20% each retry
- Final failure: Alert operations team

**Acceptance Criteria**:
1. Transactions submitted within 30 seconds of finality
2. Gas estimation prevents out-of-gas failures
3. Retry logic handles temporary network issues
4. Stuck transactions eventually resolved or escalated
5. All submission attempts logged with details

---

### 6.11 Status API Requirements

#### FR-39: Status Endpoint

**Description**: API endpoint for querying bridge operation status.

**Specification**:
```
GET /api/v1/bridge/status?originTxHash={hash}
GET /api/v1/bridge/status?depositId={id}
GET /api/v1/bridge/status?withdrawId={id}
```

Response:
```json
{
  "operationId": "0x...",
  "direction": "SEPOLIA_TO_GOLIATH",
  "status": "PROCESSING_DESTINATION",
  "token": "USDC",
  "amount": "1000000000",
  "sender": "0x...",
  "recipient": "0x...",
  "originChainId": 11155111,
  "destinationChainId": 8901,
  "originTxHash": "0x...",
  "destinationTxHash": "0x...",
  "originConfirmations": 12,
  "requiredConfirmations": 12,
  "timestamps": {
    "depositedAt": "2025-01-15T10:30:00Z",
    "finalizedAt": "2025-01-15T10:32:00Z",
    "mintedAt": null,
    "completedAt": null
  },
  "estimatedCompletionTime": "2025-01-15T10:35:00Z",
  "error": null
}
```

**Acceptance Criteria**:
1. Status retrievable by any of the three query parameters
2. Response latency < 200ms (P95)
3. Status reflects actual chain state (updated within 10 seconds)
4. All timestamps in ISO 8601 format
5. Error field populated with details on failure

---

#### FR-40: History Endpoint

**Description**: API endpoint for retrieving user's bridge history.

**Specification**:
```
GET /api/v1/bridge/history?address={userAddress}&limit={n}&offset={m}
```

Response:
```json
{
  "operations": [
    { /* operation object */ },
    { /* operation object */ }
  ],
  "pagination": {
    "total": 47,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

**Acceptance Criteria**:
1. Returns operations for specified address only
2. Ordered by timestamp descending (newest first)
3. Pagination works correctly
4. Maximum limit enforced (100)
5. Empty result returns empty array (not error)

---

#### FR-41: Health Endpoint

**Description**: API health check for monitoring.

**Specification**:
```
GET /api/v1/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "chains": {
    "sepolia": {
      "connected": true,
      "lastBlock": 4567890,
      "lastProcessedBlock": 4567888,
      "lag": 2
    },
    "goliath": {
      "connected": true,
      "lastBlock": 1234567,
      "lastProcessedBlock": 1234567,
      "lag": 0
    }
  },
  "relayer": {
    "pendingOperations": 3,
    "lastProcessedAt": "2025-01-15T10:30:00Z"
  }
}
```

**Acceptance Criteria**:
1. Returns 200 OK when healthy
2. Returns 503 Service Unavailable when unhealthy
3. Block lag triggers unhealthy if > 50 blocks
4. Chain disconnection triggers unhealthy immediately
5. Response time < 100ms

---

## 7. Non-Functional Requirements

### 7.1 Performance

#### NFR-1: Frontend Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial page load (LCP) | < 2.5 seconds | Lighthouse |
| Time to interactive | < 3.5 seconds | Lighthouse |
| Balance fetch time | < 3 seconds | API timing |
| Input response time | < 100ms | User testing |
| Status poll interval | 5 seconds | Configuration |

**Acceptance Criteria**:
1. Bridge page achieves Lighthouse performance score > 80
2. No UI jank during status updates
3. Debounced inputs prevent excessive API calls
4. Loading states prevent user confusion during async operations

---

#### NFR-2: Backend Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Event detection latency | < 5 seconds | Relayer logs |
| Relay processing time | < 30 seconds post-finality | Relayer metrics |
| API response time (P95) | < 200ms | API monitoring |
| API response time (P99) | < 500ms | API monitoring |
| Throughput capacity | > 100 operations/hour | Load testing |

**Acceptance Criteria**:
1. Relayer processes events promptly under normal load
2. API handles concurrent requests without degradation
3. Performance degrades gracefully under high load
4. Resource utilization within acceptable bounds

---

### 7.2 Scalability

#### NFR-3: Horizontal Scalability

**Specification**:
- API layer: Stateless, deployable as multiple instances behind load balancer
- Relayer: Single active instance with hot standby (leader election if needed)
- Database: PostgreSQL with read replicas for history queries

**Acceptance Criteria**:
1. API can scale to 3+ instances without code changes
2. Relayer failover completes within 60 seconds
3. Database handles 10,000+ operations without performance degradation

---

### 7.3 Reliability

#### NFR-4: Availability

| Component | Target Uptime | Allowed Downtime (Monthly) |
|-----------|---------------|---------------------------|
| Frontend | 99.5% | 3.6 hours |
| Status API | 99.5% | 3.6 hours |
| Relayer Service | 99.9% | 43 minutes |
| Bridge Contracts | 100% (blockchain) | 0 |

**Acceptance Criteria**:
1. Monitoring alerts fire within 2 minutes of outage
2. Automated recovery for transient failures
3. Manual runbook for persistent failures
4. No data loss during recovery

---

#### NFR-5: Data Durability

**Specification**:
- All bridge operations persisted to PostgreSQL before processing
- Transaction logs retained for 1 year minimum
- Database backups: Hourly for 24 hours, daily for 30 days
- Point-in-time recovery capability

**Acceptance Criteria**:
1. No operation data lost during service restarts
2. Recovery possible to any point within retention window
3. Backup verification tests pass weekly

---

### 7.4 Security

See Section 13 for detailed security requirements.

---

### 7.5 Usability

#### NFR-6: Accessibility

**Specification**:
- WCAG 2.1 Level AA compliance
- Screen reader compatibility
- Keyboard navigation support
- Color contrast ratios meeting WCAG guidelines
- Focus management for modal dialogs

**Acceptance Criteria**:
1. Automated accessibility audit passes (aXe or similar)
2. Manual screen reader testing completed
3. All interactive elements keyboard accessible
4. Error messages announced to screen readers
5. Color is not sole means of conveying information

---

#### NFR-7: Internationalization

**Specification**:
- All user-facing strings externalized for translation
- Number formatting locale-aware
- Date/time formatting locale-aware
- RTL layout support (future consideration)

**Acceptance Criteria**:
1. String extraction complete for all bridge UI text
2. No hardcoded strings in components
3. Number formatting respects user locale

---

#### NFR-8: Mobile Responsiveness

**Specification**:
- Bridge UI functional on viewports >= 320px wide
- Touch targets minimum 44x44px
- No horizontal scrolling required
- Mobile-optimized modals

**Acceptance Criteria**:
1. Bridge flow completable on mobile devices
2. All buttons/inputs easily tappable
3. Stepper visible without scrolling on mobile
4. Modal dialogs properly sized for mobile

---

### 7.6 Maintainability

#### NFR-9: Code Quality

**Specification**:
- TypeScript strict mode enabled
- ESLint configuration extended from existing project
- Prettier formatting enforced
- Test coverage > 80% for new code
- Documentation for all public APIs

**Acceptance Criteria**:
1. No ESLint errors in CI
2. All PRs require passing tests
3. Code review required before merge
4. JSDoc comments for exported functions

---

#### NFR-10: Configuration Management

**Specification**:
All bridge-specific configuration in designated locations:

```
src/constants/bridge.ts          # Token mappings, addresses, limits
.env                              # Environment-specific values
src/config/bridge.config.ts       # Runtime configuration
```

Environment Variables:
```
REACT_APP_SEPOLIA_RPC_URL         # Sepolia JSON-RPC endpoint
REACT_APP_SEPOLIA_CHAIN_ID        # 11155111
REACT_APP_BRIDGE_SEPOLIA_ADDRESS  # BridgeSepolia contract
REACT_APP_BRIDGE_GOLIATH_ADDRESS  # BridgeGoliath contract
REACT_APP_BRIDGE_STATUS_API_URL   # Status API base URL
REACT_APP_BRIDGE_MIN_AMOUNT       # Minimum bridge amount
REACT_APP_BRIDGE_RELAYER_ADDRESS  # Expected relayer address
```

**Acceptance Criteria**:
1. No hardcoded addresses in source code
2. Environment-specific configs not committed to repo
3. Configuration changes require no code changes
4. All config values documented

---

## 8. User Experience Flows

### 8.1 Primary Flow: First-Time Bridge (Sepolia to Goliath)

```
                                    User Journey
    +-------------------------------------------------------------------------+
    |                                                                         |
    |  1. DISCOVER                                                            |
    |     User clicks "Bridge" in navigation                                  |
    |     -> Bridge page loads with educational banner                        |
    |                                                                         |
    |  2. CONNECT                                                             |
    |     [If wallet disconnected]                                            |
    |     -> Click "Connect Wallet" -> Select MetaMask -> Approve connection  |
    |                                                                         |
    |  3. CONFIGURE                                                           |
    |     a. Origin defaults to current wallet network                        |
    |     b. [If on wrong network] Click "Switch to Sepolia" -> Confirm      |
    |     c. Select token (e.g., USDC) from dropdown                          |
    |     d. Enter amount (e.g., "100")                                       |
    |     e. Balance and MAX button visible                                   |
    |                                                                         |
    |  4. APPROVE (if needed)                                                 |
    |     -> Click "Approve USDC"                                             |
    |     -> Wallet popup appears                                             |
    |     -> User confirms approval tx                                        |
    |     -> Wait for confirmation (loading indicator)                        |
    |     -> "Bridge USDC" button becomes active                              |
    |                                                                         |
    |  5. INITIATE                                                            |
    |     -> Click "Bridge USDC"                                              |
    |     -> Confirmation modal appears:                                      |
    |        - "Bridging 100 USDC"                                           |
    |        - "From: Ethereum Sepolia"                                       |
    |        - "To: Goliath Testnet"                                         |
    |        - "Estimated time: ~3-5 minutes"                                 |
    |     -> Click "Confirm Bridge"                                           |
    |     -> Wallet popup for transaction                                     |
    |     -> User confirms                                                    |
    |                                                                         |
    |  6. TRACK                                                               |
    |     -> Status stepper appears:                                          |
    |        [X] Deposit submitted (tx link)                                  |
    |        [~] Waiting for confirmations (3/12)                            |
    |        [ ] Minting on Goliath                                          |
    |        [ ] Complete                                                     |
    |     -> User can close page - status recoverable                         |
    |                                                                         |
    |  7. COMPLETE                                                            |
    |     -> All steps checked                                                |
    |     -> Success modal:                                                   |
    |        - "Bridge Complete!"                                             |
    |        - Both tx hashes with links                                      |
    |        - "Switch to Goliath" button                                     |
    |        - "View in Swap" button                                          |
    |                                                                         |
    +-------------------------------------------------------------------------+
```

### 8.2 Secondary Flow: Goliath to Sepolia

Identical structure to 8.1 with:
- Origin: Goliath Testnet
- Destination: Ethereum Sepolia
- Step labels: "Burn submitted" instead of "Deposit submitted"
- Step labels: "Releasing on Sepolia" instead of "Minting on Goliath"

### 8.3 Recovery Flow: Resume Interrupted Bridge

```
    User Journey: Interrupted Bridge Recovery
    +-------------------------------------------------------------------------+
    |                                                                         |
    |  1. RETURN                                                              |
    |     User returns to Bridge page after closing browser mid-operation     |
    |                                                                         |
    |  2. DETECT                                                              |
    |     -> System detects pending operation from localStorage               |
    |     -> Banner appears: "You have a pending bridge operation"            |
    |     -> "View Status" button                                             |
    |                                                                         |
    |  3. RESUME                                                              |
    |     -> Click "View Status"                                              |
    |     -> Status stepper loads with current state                          |
    |     -> If completed: Show success state                                 |
    |     -> If in-progress: Show current step, resume polling                |
    |     -> If failed: Show error with appropriate recovery action           |
    |                                                                         |
    +-------------------------------------------------------------------------+
```

### 8.4 Edge Case Flow: Handling Errors

```
    Error Handling Flows
    +-------------------------------------------------------------------------+
    |                                                                         |
    |  SCENARIO A: Approval Transaction Fails                                 |
    |  ----------------------------------------                               |
    |  -> User sees: "Approval failed: [reason]"                              |
    |  -> "Try Again" button available                                        |
    |  -> Original amount preserved                                           |
    |                                                                         |
    |  SCENARIO B: Bridge Transaction Fails                                   |
    |  ----------------------------------------                               |
    |  -> User sees: "Bridge transaction failed: [reason]"                    |
    |  -> Funds remain in wallet (not locked)                                 |
    |  -> "Try Again" button available                                        |
    |                                                                         |
    |  SCENARIO C: Bridge Delayed (>10 min)                                   |
    |  ----------------------------------------                               |
    |  -> Status shows: "Bridge is taking longer than expected"               |
    |  -> Informational message: "Your funds are safe"                        |
    |  -> Link to support/Discord for assistance                              |
    |  -> Continue polling in background                                      |
    |                                                                         |
    |  SCENARIO D: Network Issues                                             |
    |  ----------------------------------------                               |
    |  -> Status shows: "Unable to check status. Retrying..."                 |
    |  -> Auto-retry every 15 seconds                                         |
    |  -> After 5 failures: "Please check your connection"                    |
    |  -> Origin tx hash always visible for manual verification               |
    |                                                                         |
    +-------------------------------------------------------------------------+
```

### 8.5 Admin Flow: Emergency Pause

```
    Admin: Emergency Pause Procedure
    +-------------------------------------------------------------------------+
    |                                                                         |
    |  1. DETECT                                                              |
    |     Monitoring detects anomaly or alert received                        |
    |                                                                         |
    |  2. ASSESS                                                              |
    |     Determine if pause warranted based on runbook criteria              |
    |                                                                         |
    |  3. EXECUTE                                                             |
    |     a. Access multisig wallet (3 of 5 signers required)                 |
    |     b. Submit pauseDeposits() or pauseWithdrawals() tx                  |
    |     c. Collect required signatures                                      |
    |     d. Execute transaction                                              |
    |                                                                         |
    |  4. VERIFY                                                              |
    |     a. Confirm pause state on both chains                               |
    |     b. Verify frontend shows "Bridge Paused" message                    |
    |     c. Alert team via on-call channel                                   |
    |                                                                         |
    |  5. COMMUNICATE                                                         |
    |     Post status update to status page and social channels               |
    |                                                                         |
    +-------------------------------------------------------------------------+
```

---

## 9. Technical Architecture

### 9.1 System Overview

```
+------------------+     +------------------+     +------------------+
|   User Browser   |     |   Status API     |     |   Relayer        |
|   (Frontend)     |     |   (Backend)      |     |   Service        |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         |  Wallet Interaction    |  REST API              |  Event Watch
         |                        |                        |
+--------v---------+     +--------v---------+     +--------v---------+
|   Ethereum       |     |   PostgreSQL     |     |   Message        |
|   Sepolia        |     |   Database       |     |   Queue          |
|   (Chain)        |     |                  |     |   (Redis)        |
+--------+---------+     +------------------+     +------------------+
         |
         |  BridgeSepolia Contract
         |
+--------v-----------------------------------------------------------+
|                              Relayer                                |
+--------+-----------------------------------------------------------+
         |
         |  BridgeGoliath Contract
         |
+--------v---------+
|   Goliath        |
|   Testnet        |
|   (Chain)        |
+------------------+
```

### 9.2 Component Descriptions

#### 9.2.1 Frontend (React/TypeScript)

**Location**: `src/` directory of CoolSwap-interface

**New Modules**:
```
src/
  pages/
    Bridge/
      index.tsx                 # Bridge page component
      BridgeForm.tsx            # Amount/token input form
      NetworkSelector.tsx       # Origin/destination selector
      BridgeStatusTracker.tsx   # Status stepper component
      BridgeHistory.tsx         # History list component

  state/
    bridge/
      actions.ts                # Redux actions
      reducer.ts                # Bridge state reducer
      hooks.ts                  # Custom hooks for bridge
      types.ts                  # TypeScript types

  hooks/
    useBridgeAllowance.ts       # Check/request approval
    useBridgeDeposit.ts         # Execute deposit
    useBridgeBurn.ts            # Execute burn
    useBridgeStatus.ts          # Poll status API
    useBridgeHistory.ts         # Fetch user history
    useSepoliaProvider.ts       # Sepolia chain provider

  constants/
    bridge.ts                   # Token mappings, addresses

  abis/
    BridgeSepolia.json          # Sepolia contract ABI
    BridgeGoliath.json          # Goliath contract ABI
```

#### 9.2.2 Smart Contracts (Solidity)

**Contracts**:
- `BridgeSepolia.sol`: Lock/release logic for Ethereum Sepolia
- `BridgeGoliath.sol`: Mint/burn logic for Goliath Testnet
- `IBridge.sol`: Common interface
- `BridgeToken.sol`: Wrapped token template (if needed)

**Dependencies**:
- OpenZeppelin Contracts 4.x (ERC20, Ownable, Pausable, ReentrancyGuard)

#### 9.2.3 Relayer Service (Node.js/TypeScript)

**Components**:
- Event Watcher: Subscribes to contract events
- Message Signer: Signs relay messages with validator key
- Transaction Submitter: Submits to destination chain
- Status Tracker: Updates operation status in database
- Health Monitor: Exposes health endpoints

**Infrastructure**:
- PostgreSQL: Operation persistence
- Redis: Job queue and caching
- Container: Docker with K8s deployment

#### 9.2.4 Status API (Node.js/Express or Fastify)

**Endpoints**:
- `GET /api/v1/bridge/status`: Operation status
- `GET /api/v1/bridge/history`: User history
- `GET /api/v1/health`: Health check
- `GET /api/v1/metrics`: Prometheus metrics

### 9.3 Data Flow: Sepolia to Goliath

```
1. User submits deposit tx to BridgeSepolia
   |
2. Tx included in Sepolia block
   |
3. BridgeSepolia emits Deposit event
   |
4. Relayer Event Watcher detects event
   |
5. Relayer waits for 12 block confirmations
   |
6. Relayer signs mint message
   |
7. Relayer submits mint tx to BridgeGoliath
   |
8. BridgeGoliath verifies signature
   |
9. BridgeGoliath mints tokens to recipient
   |
10. Mint event emitted
   |
11. Status API updates operation to COMPLETED
   |
12. Frontend displays success
```

### 9.4 Multi-Provider Architecture

The frontend must maintain connections to both chains simultaneously:

```typescript
// Provider Configuration
interface ChainProviders {
  goliath: {
    library: Web3Provider;      // Connected wallet (for signing)
    provider: JsonRpcProvider;  // Read-only RPC
  };
  sepolia: {
    library: Web3Provider;      // Connected wallet (when on Sepolia)
    provider: JsonRpcProvider;  // Read-only RPC
  };
}
```

**Implementation Notes**:
- Goliath provider: Reuse existing `useActiveWeb3React()` when on Goliath
- Sepolia provider: Create dedicated `JsonRpcProvider` for read operations
- Wallet interactions: Always use connected wallet's provider/signer
- Balance queries: Use read-only provider for non-connected chain

---

## 10. Smart Contract Interfaces

### 10.1 IBridge Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IBridge {
    // Events
    event Deposit(
        bytes32 indexed depositId,
        address indexed token,
        address indexed sender,
        address destinationAddress,
        uint256 amount,
        uint64 timestamp,
        uint64 sourceChainId
    );

    event Mint(
        bytes32 indexed depositId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    event Withdraw(
        bytes32 indexed withdrawId,
        address indexed token,
        address indexed sender,
        address destinationAddress,
        uint256 amount,
        uint64 timestamp,
        uint64 sourceChainId
    );

    event Release(
        bytes32 indexed withdrawId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    event ValidatorsUpdated(address[] validators, uint256 threshold);
    event TokenLimitsUpdated(address token, uint256 maxPerTx, uint256 dailyLimit);
    event Paused(bool deposits, bool withdrawals);
    event Unpaused(bool deposits, bool withdrawals);

    // Core Functions
    function deposit(
        address token,
        uint256 amount,
        address destinationAddress
    ) external returns (bytes32 depositId);

    function burn(
        address token,
        uint256 amount,
        address destinationAddress
    ) external returns (bytes32 withdrawId);

    // Relayer Functions
    function mint(
        bytes32 depositId,
        address token,
        address recipient,
        uint256 amount,
        bytes[] calldata signatures
    ) external;

    function release(
        bytes32 withdrawId,
        address token,
        address recipient,
        uint256 amount,
        bytes[] calldata signatures
    ) external;

    // View Functions
    function isProcessed(bytes32 operationId) external view returns (bool);
    function getValidators() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function getTokenLimits(address token) external view returns (
        uint256 maxPerTx,
        uint256 dailyLimit,
        uint256 currentDaily,
        bool isPaused
    );
    function depositsPaused() external view returns (bool);
    function withdrawalsPaused() external view returns (bool);

    // Admin Functions
    function updateValidators(address[] calldata validators, uint256 threshold) external;
    function setTokenLimits(address token, uint256 maxPerTx, uint256 dailyLimit) external;
    function pauseToken(address token) external;
    function unpauseToken(address token) external;
    function pauseDeposits() external;
    function unpauseDeposits() external;
    function pauseWithdrawals() external;
    function unpauseWithdrawals() external;
}
```

### 10.2 BridgeSepolia ABI (Key Functions)

```json
[
  {
    "inputs": [
      { "name": "token", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "destinationAddress", "type": "address" }
    ],
    "name": "deposit",
    "outputs": [{ "name": "depositId", "type": "bytes32" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "withdrawId", "type": "bytes32" },
      { "name": "token", "type": "address" },
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "signatures", "type": "bytes[]" }
    ],
    "name": "release",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "depositId", "type": "bytes32" },
      { "indexed": true, "name": "token", "type": "address" },
      { "indexed": true, "name": "sender", "type": "address" },
      { "indexed": false, "name": "destinationAddress", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" },
      { "indexed": false, "name": "timestamp", "type": "uint64" },
      { "indexed": false, "name": "sourceChainId", "type": "uint64" }
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "withdrawId", "type": "bytes32" },
      { "indexed": true, "name": "token", "type": "address" },
      { "indexed": true, "name": "recipient", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "name": "Release",
    "type": "event"
  }
]
```

### 10.3 BridgeGoliath ABI (Key Functions)

```json
[
  {
    "inputs": [
      { "name": "token", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "destinationAddress", "type": "address" }
    ],
    "name": "burn",
    "outputs": [{ "name": "withdrawId", "type": "bytes32" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "destinationAddress", "type": "address" }
    ],
    "name": "burnNative",
    "outputs": [{ "name": "withdrawId", "type": "bytes32" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "depositId", "type": "bytes32" },
      { "name": "token", "type": "address" },
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "signatures", "type": "bytes[]" }
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "withdrawId", "type": "bytes32" },
      { "indexed": true, "name": "token", "type": "address" },
      { "indexed": true, "name": "sender", "type": "address" },
      { "indexed": false, "name": "destinationAddress", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" },
      { "indexed": false, "name": "timestamp", "type": "uint64" },
      { "indexed": false, "name": "sourceChainId", "type": "uint64" }
    ],
    "name": "Withdraw",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "depositId", "type": "bytes32" },
      { "indexed": true, "name": "token", "type": "address" },
      { "indexed": true, "name": "recipient", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "name": "Mint",
    "type": "event"
  }
]
```

### 10.4 Signature Verification

```solidity
// Message hash construction (must match relayer)
function getMessageHash(
    bytes32 operationId,
    address token,
    address recipient,
    uint256 amount,
    uint256 sourceChainId,
    uint256 destChainId
) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        keccak256(abi.encodePacked(
            operationId,
            token,
            recipient,
            amount,
            sourceChainId,
            destChainId
        ))
    ));
}

// Verify signatures meet threshold
function verifySignatures(
    bytes32 messageHash,
    bytes[] calldata signatures
) internal view returns (bool) {
    require(signatures.length >= threshold, "Insufficient signatures");

    address lastSigner = address(0);
    for (uint i = 0; i < threshold; i++) {
        address signer = ECDSA.recover(messageHash, signatures[i]);
        require(isValidator[signer], "Invalid signer");
        require(signer > lastSigner, "Duplicate or unordered signer");
        lastSigner = signer;
    }
    return true;
}
```

---

## 11. API Specifications

### 11.1 Base Configuration

```yaml
openapi: 3.0.3
info:
  title: Goliath Bridge Status API
  version: 1.0.0
  description: API for tracking cross-chain bridge operations

servers:
  - url: https://bridge-api.goliath.network/api/v1
    description: Production
  - url: https://bridge-api-testnet.goliath.network/api/v1
    description: Testnet
```

### 11.2 Endpoints

#### GET /bridge/status

Retrieve status of a bridge operation.

**Request**:
```
GET /bridge/status?originTxHash=0x123...
GET /bridge/status?depositId=0xabc...
GET /bridge/status?withdrawId=0xdef...
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "operationId": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "type": "DEPOSIT",
    "direction": "SEPOLIA_TO_GOLIATH",
    "status": "PROCESSING_DESTINATION",
    "token": {
      "symbol": "USDC",
      "originAddress": "0x...",
      "destinationAddress": "0x...",
      "decimals": 6
    },
    "amount": "1000000000",
    "amountFormatted": "1000.000000",
    "sender": "0x1234...5678",
    "recipient": "0x1234...5678",
    "origin": {
      "chainId": 11155111,
      "chainName": "Sepolia",
      "txHash": "0x...",
      "blockNumber": 4567890,
      "confirmations": 12,
      "requiredConfirmations": 12,
      "explorerUrl": "https://sepolia.etherscan.io/tx/0x..."
    },
    "destination": {
      "chainId": 8901,
      "chainName": "Goliath Testnet",
      "txHash": null,
      "blockNumber": null,
      "explorerUrl": null
    },
    "timestamps": {
      "createdAt": "2025-01-15T10:30:00.000Z",
      "originConfirmedAt": "2025-01-15T10:32:00.000Z",
      "destinationSubmittedAt": "2025-01-15T10:32:30.000Z",
      "completedAt": null
    },
    "estimatedCompletionAt": "2025-01-15T10:35:00.000Z",
    "error": null
  }
}
```

**Response** (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": "OPERATION_NOT_FOUND",
    "message": "No bridge operation found with the provided identifier"
  }
}
```

#### GET /bridge/history

Retrieve bridge history for an address.

**Request**:
```
GET /bridge/history?address=0x1234...5678&limit=10&offset=0&status=COMPLETED
```

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| address | string | Yes | - | User wallet address |
| limit | number | No | 10 | Results per page (max 100) |
| offset | number | No | 0 | Results to skip |
| status | string | No | - | Filter by status |
| direction | string | No | - | Filter by direction |

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "operations": [
      { /* operation object */ }
    ],
    "pagination": {
      "total": 47,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

#### GET /health

Health check endpoint.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "timestamp": "2025-01-15T10:30:00.000Z",
  "chains": {
    "sepolia": {
      "connected": true,
      "latestBlock": 4567890,
      "lastProcessedBlock": 4567888,
      "blockLag": 2
    },
    "goliath": {
      "connected": true,
      "latestBlock": 1234567,
      "lastProcessedBlock": 1234567,
      "blockLag": 0
    }
  },
  "relayer": {
    "status": "running",
    "pendingOperations": 3,
    "lastProcessedAt": "2025-01-15T10:29:55.000Z"
  },
  "database": {
    "connected": true,
    "latency": 5
  }
}
```

**Response** (503 Service Unavailable):
```json
{
  "status": "unhealthy",
  "issues": [
    "Chain connection lost: sepolia",
    "Block lag exceeds threshold: 55 blocks"
  ]
}
```

#### GET /metrics

Prometheus-format metrics endpoint.

**Response**:
```
# HELP bridge_operations_total Total bridge operations
# TYPE bridge_operations_total counter
bridge_operations_total{direction="sepolia_to_goliath",status="completed"} 1234
bridge_operations_total{direction="sepolia_to_goliath",status="failed"} 5
bridge_operations_total{direction="goliath_to_sepolia",status="completed"} 987
bridge_operations_total{direction="goliath_to_sepolia",status="failed"} 2

# HELP bridge_operation_duration_seconds Bridge operation duration
# TYPE bridge_operation_duration_seconds histogram
bridge_operation_duration_seconds_bucket{le="60"} 100
bridge_operation_duration_seconds_bucket{le="120"} 500
bridge_operation_duration_seconds_bucket{le="300"} 1200
bridge_operation_duration_seconds_bucket{le="+Inf"} 1234

# HELP bridge_pending_operations Current pending operations
# TYPE bridge_pending_operations gauge
bridge_pending_operations 3

# HELP bridge_chain_block_lag Block processing lag
# TYPE bridge_chain_block_lag gauge
bridge_chain_block_lag{chain="sepolia"} 2
bridge_chain_block_lag{chain="goliath"} 0
```

### 11.3 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| OPERATION_NOT_FOUND | 404 | No operation matches query |
| INVALID_ADDRESS | 400 | Address format invalid |
| INVALID_TX_HASH | 400 | Transaction hash format invalid |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unexpected server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

### 11.4 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /bridge/status | 60 requests | 1 minute |
| /bridge/history | 30 requests | 1 minute |
| /health | 120 requests | 1 minute |

---

## 12. State Machine and Status Transitions

### 12.1 Bridge Operation States

```
                    +-----------------+
                    |  INITIATED      |
                    | (tx submitted)  |
                    +--------+--------+
                             |
                             v
                    +--------+--------+
                    | PENDING_ORIGIN  |<----+
                    | (waiting mine)  |     |
                    +--------+--------+     |
                             |              |
              +--------------+--------------+
              |                             |
              v                             |
    +---------+---------+         +---------+---------+
    | ORIGIN_CONFIRMED  |         |  ORIGIN_FAILED    |
    | (tx mined)        |         |  (tx reverted)    |
    +---------+---------+         +-------------------+
              |
              v
    +---------+---------+
    | CONFIRMING        |
    | (waiting finality)|
    +---------+---------+
              |
              v
    +---------+---------+
    | AWAITING_RELAY    |
    | (finality reached)|
    +---------+---------+
              |
              v
    +---------+---------+
    | PROCESSING_DEST   |<----+
    | (relayer working) |     |
    +---------+---------+     |
              |               |
    +---------+---------+     |
    |                   |     |
    v                   v     |
+---+-------+    +------+-----+
| COMPLETED |    |  DELAYED   |
| (success) |    | (>10 min)  |
+-----------+    +------+-----+
                        |
                        v
                 +------+-----+
                 |  EXPIRED   |
                 | (>60 min)  |
                 +------------+
```

### 12.2 State Transition Rules

| From State | To State | Trigger | Actions |
|------------|----------|---------|---------|
| INITIATED | PENDING_ORIGIN | Tx broadcast | Store tx hash |
| PENDING_ORIGIN | ORIGIN_CONFIRMED | Tx mined | Update block number |
| PENDING_ORIGIN | ORIGIN_FAILED | Tx reverted | Store error |
| ORIGIN_CONFIRMED | CONFIRMING | 1+ confirmations | Update count |
| CONFIRMING | AWAITING_RELAY | Finality reached | Notify relayer |
| AWAITING_RELAY | PROCESSING_DEST | Relayer picks up | Update timestamp |
| PROCESSING_DEST | COMPLETED | Dest tx confirmed | Store dest tx hash |
| PROCESSING_DEST | DELAYED | 10 min elapsed | Trigger alert |
| DELAYED | COMPLETED | Dest tx confirmed | Clear delay flag |
| DELAYED | EXPIRED | 60 min elapsed | Trigger escalation |

### 12.3 Terminal States

| State | User Action Available | Recovery Path |
|-------|----------------------|---------------|
| COMPLETED | View details | N/A |
| ORIGIN_FAILED | Retry bridge | Start new operation |
| EXPIRED | Contact support | Manual intervention |

---

## 13. Security Requirements

### 13.1 Smart Contract Security

#### SEC-1: Replay Attack Prevention

**Requirement**: Each operation ID must be unique and non-replayable.

**Implementation**:
```solidity
// depositId = keccak256(nonce, msg.sender, token, amount, block.timestamp, block.chainid)
// Nonce incremented per user
mapping(address => uint256) public nonces;

// Processed IDs cannot be reused
mapping(bytes32 => bool) public processedDeposits;
mapping(bytes32 => bool) public processedWithdraws;
```

**Acceptance Criteria**:
1. Same depositId cannot be minted twice
2. Same withdrawId cannot be released twice
3. Cross-chain replay not possible (chainId in signature)
4. Message cannot be reused on different recipient

---

#### SEC-2: Signature Security

**Requirement**: Signatures must be secure and unambiguous.

**Implementation**:
- Use EIP-191 signed data format
- Include chainId in signed message
- Include operationId to bind signature to specific operation
- Require sorted signer order to prevent signature reordering attacks

**Acceptance Criteria**:
1. Signatures verify only for intended message
2. Cannot extract/reuse signature components
3. Signature malleability prevented (use s-value check)

---

#### SEC-3: Access Control

**Requirement**: Admin functions protected by appropriate access control.

**Implementation**:
| Function | Access Level | Time Lock |
|----------|--------------|-----------|
| updateValidators | Owner (multisig) | Optional 24h delay |
| setTokenLimits | Owner (multisig) | None |
| pauseDeposits | Owner (multisig) | None (emergency) |
| unpauseDeposits | Owner (multisig) | Optional 1h delay |
| pauseWithdrawals | Owner (multisig) | None (emergency) |
| unpauseWithdrawals | Owner (multisig) | Optional 1h delay |

**Acceptance Criteria**:
1. All admin functions revert for non-owner
2. Owner is multisig contract
3. Time locks enforced where specified

---

#### SEC-4: Reentrancy Protection

**Requirement**: Prevent reentrancy attacks on token transfer functions.

**Implementation**:
```solidity
// Use OpenZeppelin ReentrancyGuard
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract BridgeSepolia is ReentrancyGuard {
    function deposit(...) external nonReentrant { ... }
    function release(...) external nonReentrant { ... }
}
```

**Acceptance Criteria**:
1. All state changes before external calls
2. ReentrancyGuard modifier on all transfer functions
3. No callbacks to untrusted contracts

---

#### SEC-5: Integer Overflow Protection

**Requirement**: Prevent arithmetic overflow/underflow.

**Implementation**:
- Solidity ^0.8.0 provides built-in overflow checks
- Explicit checks for edge cases

**Acceptance Criteria**:
1. No unchecked arithmetic on user-provided values
2. Amount validations prevent zero-value operations
3. Supply tracking cannot overflow

---

### 13.2 Relayer Security

#### SEC-6: Key Management

**Requirement**: Validator private keys must be securely managed.

**Implementation**:
- Production: Hardware Security Module (HSM) or cloud KMS
- Testnet: Encrypted keystore with passphrase
- Never store keys in code or config files
- Key rotation procedure documented

**Acceptance Criteria**:
1. Keys not accessible in plaintext
2. Key access audited and logged
3. Rotation possible without downtime

---

#### SEC-7: Message Validation

**Requirement**: Relayer must validate all data before signing.

**Validation Checklist**:
- [ ] Event from expected contract address
- [ ] Chain ID matches expected source chain
- [ ] Token address in approved token list
- [ ] Amount within acceptable limits
- [ ] Destination address not blacklisted
- [ ] Block number is finalized

**Acceptance Criteria**:
1. Invalid events rejected without signing
2. Validation failures logged with details
3. Repeated failures trigger alert

---

#### SEC-8: Rate Limiting

**Requirement**: Relayer implements rate limiting to prevent abuse.

**Implementation**:
| Limit Type | Threshold | Action |
|------------|-----------|--------|
| Per-address per hour | 10 operations | Delay processing |
| Total per minute | 100 operations | Pause acceptance |
| Amount per hour per token | Configurable | Reject excess |

**Acceptance Criteria**:
1. Rate limits enforced correctly
2. Legitimate high-volume users can request limit increase
3. Rate limit violations logged

---

### 13.3 Frontend Security

#### SEC-9: Input Validation

**Requirement**: All user inputs validated client-side and server-side.

**Validation Rules**:
- Amount: Numeric, positive, <= balance, >= minimum
- Address: Valid checksum address format
- Token: Must be in approved list

**Acceptance Criteria**:
1. Invalid inputs cannot be submitted
2. Clear error messages for validation failures
3. No injection vulnerabilities (XSS, etc.)

---

#### SEC-10: Transaction Simulation

**Requirement**: Simulate transactions before submission when possible.

**Implementation**:
- Use eth_call to simulate deposit/burn before sending
- Display expected outcome to user
- Warn if simulation fails

**Acceptance Criteria**:
1. Failed simulations show warning before user confirms
2. Gas estimation uses simulation result + buffer

---

### 13.4 Operational Security

#### SEC-11: Monitoring and Alerting

**Requirement**: Comprehensive monitoring for security events.

**Alerts**:
| Event | Severity | Response Time |
|-------|----------|---------------|
| Supply invariant violation | Critical | Immediate |
| Unusual volume spike (10x normal) | High | 15 minutes |
| Multiple failed validations | Medium | 1 hour |
| API authentication failures | Medium | 1 hour |
| Validator key usage anomaly | High | 15 minutes |

**Acceptance Criteria**:
1. All critical events trigger PagerDuty alert
2. Alert includes actionable information
3. Runbook linked in alert

---

#### SEC-12: Audit Requirements

**Requirement**: Security audit before mainnet deployment.

**Scope**:
- Smart contracts: Full audit by reputable firm
- Relayer: Code review and penetration testing
- Frontend: Security review for common web vulnerabilities

**Acceptance Criteria** (Testnet):
1. Internal security review completed
2. Known issues documented and tracked
3. No critical/high severity issues unresolved

**Acceptance Criteria** (Mainnet):
1. External audit completed by recognized firm
2. All critical/high findings resolved
3. Audit report published

---

## 14. Emergency Procedures

### 14.1 Emergency Pause Procedure

**Trigger Conditions**:
- Supply invariant violation detected
- Suspicious transaction pattern identified
- Validator key compromise suspected
- Critical vulnerability discovered

**Procedure**:

```
STEP 1: ASSESS (5 minutes)
  - Confirm alert validity
  - Identify scope of issue
  - Notify on-call team

STEP 2: PAUSE (10 minutes)
  - Access multisig wallet
  - Execute pauseDeposits() and pauseWithdrawals()
  - Confirm pause state on both chains

STEP 3: COMMUNICATE (15 minutes)
  - Post status update to status page
  - Notify in Discord/Telegram
  - Update social media if significant

STEP 4: INVESTIGATE (ongoing)
  - Analyze logs and chain data
  - Identify root cause
  - Determine affected operations

STEP 5: REMEDIATE (variable)
  - Fix underlying issue
  - Test fix thoroughly
  - Plan unpause

STEP 6: RESUME (after remediation)
  - Unpause via multisig
  - Monitor closely for recurrence
  - Process any stuck operations

STEP 7: POST-MORTEM (within 48 hours)
  - Document incident
  - Identify improvements
  - Update runbooks
```

### 14.2 Stuck Operation Recovery

**Scenario**: User's deposit confirmed but mint not processed after 2 hours.

**Procedure**:

```
STEP 1: IDENTIFY
  - Get originTxHash from user
  - Query chain for deposit event
  - Verify event exists and is finalized

STEP 2: DIAGNOSE
  - Check relayer logs for the depositId
  - Verify relayer is healthy
  - Check if operation is in pending queue

STEP 3: RESOLVE
  Option A: Relayer issue
    - Restart relayer service
    - Verify operation gets picked up

  Option B: Signature issue
    - Manually trigger signing
    - Submit mint transaction

  Option C: Contract issue
    - Identify revert reason
    - May require governance action

STEP 4: VERIFY
  - Confirm mint transaction successful
  - Notify user of completion
```

### 14.3 Validator Key Rotation

**Trigger**: Scheduled rotation or suspected compromise.

**Procedure**:

```
STEP 1: PREPARE
  - Generate new validator key (in secure environment)
  - Test new key signing capability
  - Prepare multisig transaction

STEP 2: EXECUTE
  - Submit updateValidators() via multisig
  - Include new key, remove old key
  - Confirm threshold maintained

STEP 3: UPDATE RELAYER
  - Update relayer configuration with new key
  - Restart relayer service
  - Verify signing works with new key

STEP 4: VERIFY
  - Process test operation end-to-end
  - Confirm old key signatures rejected

STEP 5: SECURE OLD KEY
  - Revoke access to old key
  - Securely destroy if not needed for audits
```

### 14.4 Data Recovery

**Scenario**: Database corruption or loss.

**Procedure**:

```
STEP 1: ASSESS
  - Determine extent of data loss
  - Identify last known good backup

STEP 2: RESTORE
  - Restore from backup
  - Identify gap between backup and failure

STEP 3: RECONSTRUCT
  - Query chains for all bridge events
  - Reconstruct missing operation records
  - Verify data consistency

STEP 4: RECONCILE
  - Compare reconstructed data with chain state
  - Resolve any discrepancies
  - Update operation statuses

STEP 5: RESUME
  - Restart services
  - Process any pending operations
```

---

## 15. Testing Requirements

### 15.1 Unit Testing

#### Smart Contracts

| Test Category | Coverage Target | Description |
|---------------|-----------------|-------------|
| Deposit function | 100% | All paths including validations |
| Burn function | 100% | All paths including native handling |
| Mint function | 100% | Signature verification, replay prevention |
| Release function | 100% | Signature verification, balance checks |
| Admin functions | 100% | Access control, state changes |
| View functions | 100% | Return values, edge cases |

**Framework**: Hardhat + Chai + Ethers.js

**Required Tests**:
- [ ] Deposit emits correct event
- [ ] Deposit increments user nonce
- [ ] Deposit fails with insufficient balance
- [ ] Deposit fails when paused
- [ ] Deposit fails exceeding limits
- [ ] Mint succeeds with valid signatures
- [ ] Mint fails with insufficient signatures
- [ ] Mint fails with invalid signer
- [ ] Mint fails with duplicate operationId
- [ ] Burn fails with insufficient balance
- [ ] Release fails when already processed
- [ ] Pause prevents new operations
- [ ] Validator update changes signing requirements

#### Frontend

| Test Category | Coverage Target | Description |
|---------------|-----------------|-------------|
| Redux reducers | 95% | All state transitions |
| Custom hooks | 90% | Happy path and error cases |
| Components | 80% | Rendering and interactions |
| Utilities | 100% | Pure functions |

**Framework**: Jest + React Testing Library

#### Relayer

| Test Category | Coverage Target | Description |
|---------------|-----------------|-------------|
| Event parsing | 100% | All event types |
| Message signing | 100% | Format and verification |
| Database operations | 95% | CRUD operations |
| API handlers | 90% | All endpoints |

**Framework**: Jest + Supertest

### 15.2 Integration Testing

**Test Scenarios**:

| Scenario | Description | Expected Outcome |
|----------|-------------|------------------|
| IT-1 | Full Sepolia -> Goliath bridge | Tokens appear on Goliath |
| IT-2 | Full Goliath -> Sepolia bridge | Tokens appear on Sepolia |
| IT-3 | Approval flow | Allowance set correctly |
| IT-4 | Status tracking | All steps reported |
| IT-5 | Resume after page refresh | Status recovers |
| IT-6 | Multiple concurrent bridges | All complete |
| IT-7 | Bridge at daily limit | Rejects excess |
| IT-8 | Bridge while paused | Rejects with message |

### 15.3 End-to-End Testing

**Environment**: Sepolia + Goliath Testnet (live chains)

**E2E Test Suite**:

```
Scenario: First-time bridge Sepolia to Goliath
  Given I am connected to Sepolia with 1000 USDC
  And I have never used the bridge before
  When I navigate to the Bridge page
  And I enter 100 as the amount
  And I click "Approve USDC"
  And I confirm the approval in my wallet
  And I wait for approval confirmation
  And I click "Bridge USDC"
  And I confirm the bridge in my wallet
  Then I should see the status stepper
  And all steps should complete within 10 minutes
  And I should have 100 USDC on Goliath

Scenario: Bridge back to Sepolia
  Given I am connected to Goliath with 50 USDC
  When I select "Goliath Testnet" as origin
  And I enter 50 as the amount
  And I complete the bridge flow
  Then I should have 50 USDC on Sepolia

Scenario: Handle network switch
  Given I am connected to Mainnet
  When I navigate to Bridge
  Then I should see "Switch Network to Sepolia" button
  When I click the button
  And I approve in my wallet
  Then I should be on Sepolia network
```

**Framework**: Cypress or Playwright with synpress for wallet automation

### 15.4 Security Testing

**Required Security Tests**:

| Test | Tool | Frequency |
|------|------|-----------|
| Smart contract static analysis | Slither | Every commit |
| Smart contract fuzzing | Echidna | Weekly |
| Dependency vulnerability scan | npm audit | Every build |
| API penetration testing | Manual/Burp | Before release |
| Frontend XSS testing | OWASP ZAP | Before release |

### 15.5 Performance Testing

**Load Test Scenarios**:

| Scenario | Load | Duration | Success Criteria |
|----------|------|----------|------------------|
| Normal load | 10 ops/min | 1 hour | All complete <5 min |
| Peak load | 50 ops/min | 15 min | All complete <10 min |
| Sustained load | 20 ops/min | 24 hours | No degradation |
| API load | 1000 req/min | 5 min | P95 <200ms |

---

## 16. Operational Requirements

### 16.1 Deployment

**Infrastructure**:

| Component | Environment | Hosting |
|-----------|-------------|---------|
| Frontend | Static | Vercel/Cloudflare Pages |
| Status API | Containerized | AWS ECS / GCP Cloud Run |
| Relayer | Containerized | Dedicated EC2/GCE |
| Database | Managed | AWS RDS / GCP Cloud SQL |
| Redis | Managed | AWS ElastiCache / GCP Memorystore |

**Deployment Process**:
1. All changes via GitHub PR
2. CI runs tests and security scans
3. Merge to main triggers staging deploy
4. Manual promotion to production
5. Contracts deployed via Hardhat scripts
6. Contract verification on block explorers

### 16.2 Monitoring

**Dashboards**:

1. **Bridge Overview**
   - Total operations (24h, 7d, 30d)
   - Success rate
   - Average completion time
   - Current pending operations

2. **Chain Health**
   - Block height per chain
   - Processing lag
   - RPC connection status
   - Gas prices

3. **Relayer Health**
   - Uptime
   - Queue depth
   - Processing rate
   - Error rate

4. **API Performance**
   - Request rate
   - Response times
   - Error rates
   - Cache hit ratio

**Alerting Rules**:

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|--------------|
| Relayer Down | Health check fails 3x | Critical | PagerDuty + Slack |
| High Block Lag | Lag > 50 blocks | High | Slack |
| High Error Rate | >5% errors in 5 min | High | Slack |
| Supply Invariant | Any violation | Critical | PagerDuty + Slack + Email |
| Daily Limit Near | >80% used | Low | Slack |
| API Latency High | P95 > 500ms | Medium | Slack |

### 16.3 Logging

**Log Levels**:

| Level | Use Case |
|-------|----------|
| ERROR | Unexpected failures, action required |
| WARN | Recoverable issues, should investigate |
| INFO | Normal operation events |
| DEBUG | Detailed troubleshooting info |

**Required Log Fields**:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "INFO",
  "service": "relayer",
  "correlationId": "uuid",
  "operationId": "0x...",
  "event": "deposit_processed",
  "details": { ... }
}
```

**Log Retention**:
- Production: 90 days in searchable storage
- Archive: 1 year in cold storage

### 16.4 Backup and Recovery

**Backup Schedule**:

| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Database | Hourly | 24 hourly, 30 daily | S3/GCS |
| Configuration | On change | 90 versions | Git |
| Relayer state | Hourly | 7 days | S3/GCS |

**Recovery Procedures**:
- See Section 14.4 for data recovery procedure
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 1 hour

### 16.5 Runbook Reference

**Available Runbooks**:

| Runbook | Location | Description |
|---------|----------|-------------|
| Incident Response | /runbooks/incident-response.md | General incident handling |
| Emergency Pause | /runbooks/emergency-pause.md | Pause bridge operations |
| Stuck Operation | /runbooks/stuck-operation.md | Manual intervention for stuck bridges |
| Key Rotation | /runbooks/key-rotation.md | Validator key rotation |
| Deployment | /runbooks/deployment.md | Service deployment procedure |
| Scaling | /runbooks/scaling.md | Scale up/down services |

---

## 17. Timeline and Milestones

### 17.1 Phase Overview

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Design & Planning | 1-2 weeks | Final specs, ABIs, test plan |
| Phase 2: Smart Contracts | 2-3 weeks | Deployed contracts, tests |
| Phase 3: Relayer Service | 2 weeks | Running relayer, status API |
| Phase 4: Frontend | 2-3 weeks | Complete bridge UI |
| Phase 5: Testing & QA | 2 weeks | Test coverage, bug fixes |
| Phase 6: Launch & Monitoring | Ongoing | Live on testnet |

### 17.2 Detailed Milestones

**Phase 1: Design & Planning**
- [ ] M1.1: Token address finalization for Sepolia
- [ ] M1.2: Contract ABIs frozen
- [ ] M1.3: API specification complete
- [ ] M1.4: Test plan approved
- [ ] M1.5: Security review checklist complete

**Phase 2: Smart Contracts**
- [ ] M2.1: BridgeSepolia contract implemented
- [ ] M2.2: BridgeGoliath contract implemented
- [ ] M2.3: Unit tests passing (100% coverage)
- [ ] M2.4: Contracts deployed to testnets
- [ ] M2.5: Contracts verified on explorers
- [ ] M2.6: Internal security review complete

**Phase 3: Relayer Service**
- [ ] M3.1: Event watcher operational
- [ ] M3.2: Signing service operational
- [ ] M3.3: Transaction submitter operational
- [ ] M3.4: Status API endpoints implemented
- [ ] M3.5: Health monitoring in place
- [ ] M3.6: End-to-end relay test passing

**Phase 4: Frontend**
- [ ] M4.1: Bridge page routing enabled
- [ ] M4.2: Network selector component complete
- [ ] M4.3: Bridge form with validation complete
- [ ] M4.4: Transaction flow complete (both directions)
- [ ] M4.5: Status tracking UI complete
- [ ] M4.6: History view complete
- [ ] M4.7: Error handling complete
- [ ] M4.8: Mobile responsive testing complete

**Phase 5: Testing & QA**
- [ ] M5.1: Integration tests passing
- [ ] M5.2: E2E tests passing
- [ ] M5.3: Security tests passing
- [ ] M5.4: Performance benchmarks met
- [ ] M5.5: Accessibility audit complete
- [ ] M5.6: UAT sign-off

**Phase 6: Launch**
- [ ] M6.1: Production deployment complete
- [ ] M6.2: Monitoring dashboards operational
- [ ] M6.3: Documentation published
- [ ] M6.4: Support runbooks complete
- [ ] M6.5: Launch announcement

### 17.3 Dependencies

```
Phase 1 ────────────────────────────────────────┐
                                                 │
                    ┌──────────────────────────>│
                    │                           │
Phase 2 ───────────>├── Contracts deployed ────>│
                    │                           │
                    │<─ ABIs shared ────────────┤
                    │                           │
Phase 3 ───────────>├── Relayer running ───────>│
                    │                           │
                    │<─ API available ──────────┤
                    │                           │
Phase 4 ───────────>├── Frontend complete ─────>│
                    │                           │
                    └──────────────────────────>│
                                                 │
Phase 5 ────────────────────────────────────────┤
                                                 │
Phase 6 ────────────────────────────────────────┘
```

---

## 18. Risks and Mitigations

### 18.1 Technical Risks

| Risk ID | Risk | Probability | Impact | Mitigation | Owner |
|---------|------|-------------|--------|------------|-------|
| TR-1 | Relayer compromise leads to unauthorized mints | Low | Critical | Multisig validators, rate limits, monitoring | Security |
| TR-2 | Smart contract bug causes fund loss | Medium | Critical | Extensive testing, audit, pausability | Engineering |
| TR-3 | Chain reorg causes double-spend | Low | High | Conservative finality thresholds | Engineering |
| TR-4 | Relayer downtime halts bridge | Medium | High | Redundant deployment, auto-restart, alerts | DevOps |
| TR-5 | RPC provider outage | Medium | Medium | Multiple RPC providers, fallback logic | DevOps |
| TR-6 | Database corruption | Low | High | Regular backups, point-in-time recovery | DevOps |
| TR-7 | Gas price spike prevents relay | Medium | Medium | Gas price monitoring, escalation logic | Engineering |
| TR-8 | Front-end exploit (XSS, etc.) | Low | Medium | Security headers, input sanitization, review | Security |

### 18.2 Operational Risks

| Risk ID | Risk | Probability | Impact | Mitigation | Owner |
|---------|------|-------------|--------|------------|-------|
| OR-1 | Key personnel unavailable | Medium | Medium | Documentation, cross-training, runbooks | Management |
| OR-2 | Third-party dependency failure | Medium | Medium | Backup providers, graceful degradation | Engineering |
| OR-3 | Increased support burden | High | Low | Self-service tools, FAQ, clear UI | Product |
| OR-4 | Regulatory concerns | Low | High | Legal review, compliance documentation | Legal |

### 18.3 Project Risks

| Risk ID | Risk | Probability | Impact | Mitigation | Owner |
|---------|------|-------------|--------|------------|-------|
| PR-1 | Scope creep delays launch | Medium | Medium | Strict scope control, MVP focus | Product |
| PR-2 | Resource constraints | Medium | Medium | Prioritization, phase-based delivery | Management |
| PR-3 | External dependency delays | Medium | Low | Early integration, buffer time | Engineering |

### 18.4 Assumptions

| ID | Assumption | Validation | Fallback |
|----|------------|------------|----------|
| A-1 | ERC-20 tokens exist on Sepolia | Verify before Phase 2 | Deploy test tokens |
| A-2 | Goliath testnet is stable | Monitor during development | Have backup testnet |
| A-3 | RPC endpoints are reliable | Test throughput | Multiple providers |
| A-4 | Team has required expertise | Skill assessment | Training or hire |
| A-5 | Users have test tokens | Faucet availability | Provide faucet |

### 18.5 Open Questions

| ID | Question | Status | Resolution Date | Decision |
|----|----------|--------|-----------------|----------|
| OQ-1 | Should XCN bridging use native or WXCN on Goliath? | Open | Before Phase 2 | |
| OQ-2 | What are the specific Sepolia token addresses? | Open | Before Phase 2 | |
| OQ-3 | Should we implement fee mechanism for v1? | Decided | N/A | No fees for v1 |
| OQ-4 | What multisig setup for testnet? | Open | Before Phase 2 | |
| OQ-5 | Custom recipient - enabled by default or advanced? | Open | Before Phase 4 | |

---

## 19. Glossary of Terms

| Term | Definition |
|------|------------|
| **Bridge** | Mechanism enabling asset transfer between different blockchain networks |
| **Burn** | Permanently destroying tokens on one chain, typically to enable minting on another |
| **Chain ID** | Unique numeric identifier for a blockchain network (e.g., 8901 for Goliath Testnet) |
| **Deposit** | Locking tokens in the origin chain bridge contract |
| **EIP-3085** | Ethereum Improvement Proposal for wallet_addEthereumChain RPC method |
| **EIP-3326** | Ethereum Improvement Proposal for wallet_switchEthereumChain RPC method |
| **Finality** | State where a transaction is irreversible (typically after N confirmations) |
| **Lock-Mint** | Bridge pattern: lock tokens on origin, mint wrapped tokens on destination |
| **Mint** | Creating new tokens on the destination chain, representing locked assets |
| **Multisig** | Multi-signature wallet requiring multiple approvals for transactions |
| **Origin Chain** | The blockchain from which assets are being transferred |
| **Destination Chain** | The blockchain to which assets are being transferred |
| **Relayer** | Off-chain service that monitors events and submits cross-chain transactions |
| **Release** | Unlocking previously locked tokens on the origin chain |
| **Sepolia** | Ethereum testnet used for development (Chain ID 11155111) |
| **Supply Invariant** | Rule ensuring minted tokens never exceed locked tokens |
| **Threshold Signature** | Signature scheme requiring T-of-M signers to authorize |
| **Validator** | Entity authorized to sign relay messages |
| **Wrapped Token** | Token on one chain representing an asset from another chain |
| **WXCN** | Wrapped XCN - ERC-20 representation of native XCN on Goliath |

---

## 20. Appendices

### Appendix A: Environment Variables Reference

```bash
# Network Configuration
REACT_APP_GOLIATH_CHAIN_ID=8901
REACT_APP_GOLIATH_RPC_URL=https://rpc.goliath.network
REACT_APP_GOLIATH_EXPLORER_URL=https://explorer.goliath.network

REACT_APP_SEPOLIA_CHAIN_ID=11155111
REACT_APP_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
REACT_APP_SEPOLIA_EXPLORER_URL=https://sepolia.etherscan.io

# Bridge Contract Addresses
REACT_APP_BRIDGE_SEPOLIA_ADDRESS=0x...
REACT_APP_BRIDGE_GOLIATH_ADDRESS=0x...

# Bridge API
REACT_APP_BRIDGE_STATUS_API_URL=https://bridge-api.goliath.network

# Bridge Configuration
REACT_APP_BRIDGE_MIN_AMOUNT=0.000001
REACT_APP_BRIDGE_FINALITY_BLOCKS_SEPOLIA=12
REACT_APP_BRIDGE_FINALITY_BLOCKS_GOLIATH=6
REACT_APP_BRIDGE_STATUS_POLL_INTERVAL=5000
REACT_APP_BRIDGE_TIMEOUT_WARNING_MS=600000
REACT_APP_BRIDGE_TIMEOUT_EXPIRED_MS=3600000

# Feature Flags
REACT_APP_BRIDGE_ENABLED=true
REACT_APP_BRIDGE_CUSTOM_RECIPIENT_ENABLED=true
```

### Appendix B: Token Addresses (To Be Finalized)

```typescript
// src/constants/bridge.ts

export const BRIDGE_TOKENS = {
  SEPOLIA: {
    XCN: '0x...', // TBD
    ETH: '0x...', // TBD - Wrapped ETH on Sepolia
    BTC: '0x...', // TBD - Wrapped BTC on Sepolia
    USDC: '0x...', // TBD - USDC on Sepolia
  },
  GOLIATH: {
    XCN: '0xd319Df5FA3efb42B5fe4c5f873A7049f65428877', // WXCN
    ETH: '0xF22914De280D7B60255859bA6933831598fB5DD6',
    BTC: '0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10',
    USDC: '0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E',
  },
};

export const TOKEN_DECIMALS = {
  XCN: 18,
  ETH: 18,
  BTC: 8,
  USDC: 6,
};
```

### Appendix C: Error Code Reference

| Code | HTTP | Category | Message | User Action |
|------|------|----------|---------|-------------|
| E001 | 400 | Validation | Invalid amount | Enter valid amount |
| E002 | 400 | Validation | Amount exceeds balance | Reduce amount |
| E003 | 400 | Validation | Amount below minimum | Increase amount |
| E004 | 400 | Validation | Invalid token | Select valid token |
| E005 | 400 | Validation | Invalid address | Check address |
| E010 | 403 | Authorization | Wallet not connected | Connect wallet |
| E011 | 403 | Authorization | Wrong network | Switch network |
| E020 | 503 | Bridge | Bridge paused | Try later |
| E021 | 503 | Bridge | Daily limit reached | Try tomorrow |
| E022 | 503 | Bridge | Token paused | Check status |
| E030 | 500 | Transaction | Approval failed | Retry approval |
| E031 | 500 | Transaction | Bridge failed | Check gas, retry |
| E040 | 504 | Timeout | Bridge delayed | Wait or contact support |
| E041 | 504 | Timeout | Bridge expired | Contact support |

### Appendix D: Related Documents

| Document | Location | Description |
|----------|----------|-------------|
| Smart Contract Specifications | /docs/contracts/SPECIFICATION.md | Detailed contract logic |
| API Documentation | /docs/api/README.md | Full API reference |
| Relayer Architecture | /docs/relayer/ARCHITECTURE.md | Relayer design details |
| Security Model | /docs/security/MODEL.md | Threat model and controls |
| Runbook Index | /runbooks/README.md | Operational procedures |
| Test Plan | /docs/testing/PLAN.md | Comprehensive test plan |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-15 | Initial Author | Initial draft |
| 2.0 | 2025-12-01 | Review Team | Comprehensive enhancement: Added detailed acceptance criteria, security requirements, API specifications, smart contract interfaces, state machine documentation, emergency procedures, testing requirements, operational guidelines, and glossary |

---

*This document is the authoritative specification for the Goliath Slingshot Bridge feature. All implementation work should reference this PRD. Questions or clarification requests should be directed to the product team.*
