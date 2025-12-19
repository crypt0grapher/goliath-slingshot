# Technical Implementation Document (TID)
# Goliath Slingshot Cross-Chain Bridge - Frontend

| Metadata | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Status** | Implementation Ready |
| **Last Updated** | 2025-12-01 |
| **Repository** | CoolSwap-interface |
| **Target Framework** | React 17 + TypeScript |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack and Dependencies](#2-tech-stack-and-dependencies)
3. [Repository Structure](#3-repository-structure)
4. [Environment Configuration](#4-environment-configuration)
5. [Component Architecture](#5-component-architecture)
6. [State Management](#6-state-management)
7. [Token and Network Modeling](#7-token-and-network-modeling)
8. [Bridge Flow Implementation](#8-bridge-flow-implementation)
9. [Hooks Design](#9-hooks-design)
10. [Backend API Integration](#10-backend-api-integration)
11. [Validation Rules](#11-validation-rules)
12. [ETA Display Logic](#12-eta-display-logic)
13. [Testing Strategy](#13-testing-strategy)
14. [Security Considerations](#14-security-considerations)
15. [Implementation Phases](#15-implementation-phases)

---

## 1. Executive Summary

### 1.1 Purpose

This document provides a complete, implementation-ready specification for the frontend components of the Goliath Slingshot Cross-Chain Bridge. The bridge enables bi-directional asset transfers between Ethereum Sepolia (Chain ID 11155111) and Goliath Testnet (Chain ID 8901).

### 1.2 Scope

- Frontend implementation ONLY within the existing CoolSwap-interface React/TypeScript codebase
- Integration with existing wallet connectors, theme system, and UI components
- New Bridge page, state management, hooks, and API integration layer
- **Phase 1 (v1.0): USDC and ETH bridging** between Sepolia and Goliath
- Future phases will add XCN, BTC support

### 1.3 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Reuse existing AppBody/CurrencyInputPanel** | Maintains UI consistency with Swap page; reduces implementation time |
| **Redux Toolkit for state** | Already in use (`@reduxjs/toolkit@1.6.0`); familiar patterns |
| **ethers@5.x (existing)** | Codebase already uses ethers@5.3.0; upgrade to v6 deferred |
| **LocalStorage persistence** | Enables operation recovery across page refreshes; simple implementation |
| **5-second polling for status** | Balance between responsiveness and API load |
| **Same-wallet-only in v1** | Reduces security surface; simplifies UX |

### 1.4 Critical Constraints

1. **USDC and ETH in v1.0**: Initial release supports USDC and ETH bridging.
2. **Token Addresses**:
   - **USDC**:
     - Sepolia: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Circle's official test USDC)
     - Goliath: `0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E`
   - **ETH**:
     - Sepolia: **Native asset** (no contract address)
     - Goliath: `0xF22914De280D7B60255859bA6933831598fB5DD6` (ERC-20 wrapped ETH)
3. **Native Asset Handling**: ETH is native on Sepolia, requiring:
   - No approval step for Sepolia → Goliath (use `msg.value`)
   - Gas buffer (0.01 ETH) when using MAX button on Sepolia
   - Standard ERC-20 approval for Goliath → Sepolia
4. **Same-Wallet-Only**: No custom recipient address in v1.0 - sender and recipient are always the same wallet.

> **Future Phases**: XCN (with dual-decimal behavior) and BTC will be added in subsequent releases.

---

## 2. Tech Stack and Dependencies

### 2.1 Existing Dependencies (No Changes Required)

```json
{
  "react": "17.0.2",
  "react-dom": "17.0.2",
  "react-router-dom": "5.2.0",
  "react-redux": "7.2.4",
  "@reduxjs/toolkit": "1.6.0",
  "redux-localstorage-simple": "2.4.1",
  "ethers": "5.3.0",
  "styled-components": "5.3.0",
  "@web3-react/core": "6.1.9",
  "@web3-react/injected-connector": "6.0.7",
  "@web3-react/walletconnect-connector": "6.1.4",
  "@web3-react/walletlink-connector": "6.2.0",
  "i18next": "20.3.1",
  "react-feather": "2.0.9"
}
```

### 2.2 New Dependencies Required

```json
{
  "zod": "^3.22.4",
  "uuid": "^9.0.0",
  "@types/uuid": "^9.0.0"
}
```

**Installation Command:**
```bash
npm install zod uuid @types/uuid
```

### 2.3 TypeScript Configuration

The project uses TypeScript 4.9.5. Ensure `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

## 3. Repository Structure

### 3.1 New Directory Layout

```
src/
  pages/
    Bridge/
      index.tsx                    # BridgePage - main page component
      BridgeForm.tsx               # Form container with validation
      BridgeConfirmModal.tsx       # Confirmation modal before tx
      BridgeStatusModal.tsx        # Status stepper modal during/after tx
      styleds.tsx                  # Bridge-specific styled components

  components/
    bridge/
      NetworkSelector.tsx          # Origin/destination network dropdown
      BridgeTokenSelector.tsx      # Token selection for bridge
      BridgeAmountInput.tsx        # Amount input with balance display
      BridgeSummary.tsx            # Fee, ETA, recipient display
      BridgeStatusStepper.tsx      # Multi-step progress indicator
      BridgeHistoryPanel.tsx       # Collapsible history view
      BridgeHistoryItem.tsx        # Single history entry row
      DirectionSwapButton.tsx      # Button to swap origin/destination

  state/
    bridge/
      reducer.ts                   # bridgeSlice definition
      actions.ts                   # Action creators
      selectors.ts                 # Memoized selectors
      thunks.ts                    # Async thunks for API calls
      types.ts                     # TypeScript interfaces
      localStorage.ts              # Persistence helpers

  hooks/
    bridge/
      useBridgeForm.ts             # Form state management
      useBridgeAllowance.ts        # Token allowance checking
      useBridgeApprove.ts          # Approval transaction
      useBridgeDeposit.ts          # Sepolia deposit transaction
      useBridgeBurn.ts             # Goliath burn transaction
      useBridgeStatusPolling.ts    # Status API polling
      useBridgeHistory.ts          # History API fetching
      useBridgeBalances.ts         # Multi-chain balance fetching
      useBridgeNetworkSwitch.ts    # Network switching logic

  services/
    bridgeApi.ts                   # Backend API client
    bridgeProviders.ts             # Read-only providers for both chains

  constants/
    bridge/
      index.ts                     # Re-exports
      tokens.ts                    # Token mappings and configs
      networks.ts                  # Network metadata
      contracts.ts                 # Contract addresses
      abis.ts                      # ABI imports

  utils/
    bridge/
      amounts.ts                   # Amount conversion utilities
      xcnDecimals.ts               # XCN decimal handling
      validation.ts                # Input validation helpers
      eta.ts                       # ETA formatting

  abis/
    BridgeSepolia.json             # Sepolia bridge contract ABI
    BridgeGoliath.json             # Goliath bridge contract ABI
```

### 3.2 File Responsibilities Matrix

| File | Primary Responsibility | Key Exports |
|------|----------------------|-------------|
| `pages/Bridge/index.tsx` | Page layout, routing integration | `default` (BridgePage) |
| `state/bridge/reducer.ts` | Redux slice, actions, initial state | `bridgeSlice`, `bridgeActions` |
| `hooks/bridge/useBridgeForm.ts` | Form validation, field management | `useBridgeForm` |
| `services/bridgeApi.ts` | HTTP calls to status API | `BridgeApiClient` |
| `constants/bridge/tokens.ts` | Token configs with addresses | `BRIDGE_TOKENS`, `BridgeTokenConfig` |

---

## 4. Environment Configuration

### 4.1 New Environment Variables

Add to `.env`:

```bash
# ===========================================
# BRIDGE CONFIGURATION
# ===========================================

# Sepolia Network
REACT_APP_SEPOLIA_CHAIN_ID=11155111
REACT_APP_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt
REACT_APP_SEPOLIA_EXPLORER_URL=https://sepolia.etherscan.io

# Bridge Contracts
REACT_APP_BRIDGE_SEPOLIA_ADDRESS=0x0000000000000000000000000000000000000000
REACT_APP_BRIDGE_GOLIATH_ADDRESS=0x0000000000000000000000000000000000000000

# Sepolia Token Addresses (v1.0: USDC + ETH)
REACT_APP_SEPOLIA_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
# Note: ETH is native on Sepolia, no address needed

# Goliath Token Addresses (for ETH which is ERC-20 on Goliath)
REACT_APP_GOLIATH_ETH_ADDRESS=0xF22914De280D7B60255859bA6933831598fB5DD6

# Future tokens (not used in v1.0)
# REACT_APP_SEPOLIA_XCN_ADDRESS=0x...
# REACT_APP_SEPOLIA_BTC_ADDRESS=0x...

# Backend Status API
REACT_APP_BRIDGE_STATUS_API_URL=https://bridge-api-testnet.goliath.network/api/v1

# Feature Flags
REACT_APP_BRIDGE_ENABLED=true
REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT=false
REACT_APP_BRIDGE_MIN_AMOUNT=0.000001

# Polling Configuration
REACT_APP_BRIDGE_STATUS_POLL_INTERVAL=5000
```

### 4.2 Typed Configuration Module

**File: `src/config/bridgeConfig.ts`**

```typescript
import { z } from 'zod';

// Validation schema
const BridgeConfigSchema = z.object({
  sepolia: z.object({
    chainId: z.literal(11155111),
    rpcUrl: z.string().url(),
    explorerUrl: z.string().url(),
    bridgeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
  goliath: z.object({
    chainId: z.literal(8901),
    rpcUrl: z.string().url(),
    explorerUrl: z.string().url(),
    bridgeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
  tokens: z.object({
    sepolia: z.object({
      xcn: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      btc: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      usdc: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    }),
    goliath: z.object({
      eth: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      btc: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      usdc: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      wxcn: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    }),
  }),
  statusApiBaseUrl: z.string().url(),
  bridgeEnabled: z.boolean(),
  allowCustomRecipient: z.boolean(),
  minAmount: z.string(),
  statusPollInterval: z.number().min(1000).max(60000),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

function loadBridgeConfig(): BridgeConfig {
  const config = {
    sepolia: {
      chainId: 11155111 as const,
      rpcUrl: process.env.REACT_APP_SEPOLIA_RPC_URL!,
      explorerUrl: process.env.REACT_APP_SEPOLIA_EXPLORER_URL!,
      bridgeAddress: process.env.REACT_APP_BRIDGE_SEPOLIA_ADDRESS!,
    },
    goliath: {
      chainId: 8901 as const,
      rpcUrl: process.env.REACT_APP_NETWORK_URL!,
      explorerUrl: process.env.REACT_APP_EXPLORER_URL!,
      bridgeAddress: process.env.REACT_APP_BRIDGE_GOLIATH_ADDRESS!,
    },
    tokens: {
      sepolia: {
        xcn: process.env.REACT_APP_SEPOLIA_XCN_ADDRESS!,
        btc: process.env.REACT_APP_SEPOLIA_BTC_ADDRESS!,
        usdc: process.env.REACT_APP_SEPOLIA_USDC_ADDRESS!,
      },
      goliath: {
        eth: process.env.REACT_APP_ETH_TOKEN_ADDRESS!,
        btc: process.env.REACT_APP_BTC_TOKEN_ADDRESS!,
        usdc: process.env.REACT_APP_USDC_ADDRESS!,
        wxcn: process.env.REACT_APP_WXCN_ADDRESS!,
      },
    },
    statusApiBaseUrl: process.env.REACT_APP_BRIDGE_STATUS_API_URL!,
    bridgeEnabled: process.env.REACT_APP_BRIDGE_ENABLED === 'true',
    allowCustomRecipient: process.env.REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT === 'true',
    minAmount: process.env.REACT_APP_BRIDGE_MIN_AMOUNT ?? '0.000001',
    statusPollInterval: parseInt(process.env.REACT_APP_BRIDGE_STATUS_POLL_INTERVAL ?? '5000', 10),
  };

  // Validate and throw early if misconfigured
  const result = BridgeConfigSchema.safeParse(config);
  if (!result.success) {
    console.error('Bridge configuration validation failed:', result.error.format());
    throw new Error(`Invalid bridge configuration: ${result.error.message}`);
  }

  return result.data;
}

export const bridgeConfig = loadBridgeConfig();
```

---

## 5. Component Architecture

### 5.1 Component Hierarchy

```
BridgePage
├── SwapPoolBridgeTabs (modified NavigationTabs)
├── AppBody
│   ├── BridgeHeader
│   │   └── Settings (gear icon, links to TransactionSettings)
│   ├── BridgeForm
│   │   ├── NetworkSelector (origin)
│   │   ├── BridgeAmountInput
│   │   │   ├── BridgeTokenSelector
│   │   │   ├── NumericalInput (existing)
│   │   │   └── BalanceDisplay + MAX button
│   │   ├── DirectionSwapButton
│   │   ├── NetworkSelector (destination, read-only display)
│   │   ├── BridgeAmountOutput (read-only mirror)
│   │   └── BridgeSummary
│   │       ├── FeeDisplay (0 for v1)
│   │       ├── ETADisplay
│   │       └── RecipientDisplay
│   ├── ActionButton (Connect/Switch/Approve/Bridge)
│   └── BridgeHistoryPanel (collapsible)
│       └── BridgeHistoryItem[]
├── BridgeConfirmModal
│   ├── ConfirmationDetails
│   └── ConfirmButton
└── BridgeStatusModal
    ├── BridgeStatusStepper
    │   └── StatusStep[]
    └── ActionButtons (View Explorer, Bridge More, Switch Network)
```

### 5.2 Component Specifications

#### 5.2.1 BridgePage

**File: `src/pages/Bridge/index.tsx`**

**Props Interface:**
```typescript
// No props - page component
```

**Responsibilities:**
1. Initialize bridge form state via `useBridgeForm`
2. Handle route mounting/unmounting
3. Coordinate modal visibility
4. Resume polling for pending operations on mount

**Key Implementation Details:**
```typescript
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import AppBody from '../AppBody';
import { SwapPoolBridgeTabs } from '../../components/NavigationTabs';
import BridgeForm from './BridgeForm';
import BridgeConfirmModal from './BridgeConfirmModal';
import BridgeStatusModal from './BridgeStatusModal';
import BridgeHistoryPanel from '../../components/bridge/BridgeHistoryPanel';
import { useBridgeForm } from '../../hooks/bridge/useBridgeForm';
import { selectPendingOperations } from '../../state/bridge/selectors';
import { resumeStatusPolling } from '../../state/bridge/thunks';

export default function Bridge() {
  const dispatch = useDispatch();
  const pendingOperations = useSelector(selectPendingOperations);
  const bridgeForm = useBridgeForm();

  // Resume polling for pending operations on mount
  useEffect(() => {
    pendingOperations.forEach(op => {
      dispatch(resumeStatusPolling(op.id));
    });
  }, []); // Only on mount

  return (
    <>
      <SwapPoolBridgeTabs active="bridge" />
      <AppBody>
        <BridgeForm {...bridgeForm} />
      </AppBody>
      <BridgeHistoryPanel />
      <BridgeConfirmModal />
      <BridgeStatusModal />
    </>
  );
}
```

#### 5.2.2 NetworkSelector

**File: `src/components/bridge/NetworkSelector.tsx`**

**Props Interface:**
```typescript
interface NetworkSelectorProps {
  selectedNetwork: BridgeNetwork;
  onSelect: (network: BridgeNetwork) => void;
  label: 'From' | 'To';
  disabled?: boolean;
}
```

**Responsibilities:**
1. Display network name and icon
2. Dropdown for origin network selection
3. Read-only display for destination network

**Implementation:**
```typescript
import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'react-feather';
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';

const SelectorContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: ${({ theme }) => theme.bg2};
  border-radius: 12px;
  cursor: pointer;

  &:hover {
    background-color: ${({ theme }) => theme.bg3};
  }
`;

const NetworkLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.text2};
`;

const NetworkName = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.text1};
  margin-left: 8px;
`;

const NetworkIcon = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 50%;
`;

const DropdownMenu = styled.div<{ isOpen: boolean }>`
  display: ${({ isOpen }) => (isOpen ? 'block' : 'none')};
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  margin-top: 4px;
  z-index: 100;
  overflow: hidden;
`;

const DropdownItem = styled.div<{ selected: boolean }>`
  padding: 12px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: ${({ selected, theme }) => (selected ? theme.bg3 : 'transparent')};

  &:hover {
    background-color: ${({ theme }) => theme.bg2};
  }
`;

export default function NetworkSelector({
  selectedNetwork,
  onSelect,
  label,
  disabled = false,
}: NetworkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const metadata = NETWORK_METADATA[selectedNetwork];

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (network: BridgeNetwork) => {
      onSelect(network);
      setIsOpen(false);
    },
    [onSelect]
  );

  return (
    <div style={{ position: 'relative' }}>
      <SelectorContainer onClick={handleToggle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <NetworkLabel>{label}:</NetworkLabel>
          <NetworkIcon src={metadata.iconUrl} alt={metadata.displayName} />
          <NetworkName>{metadata.displayName}</NetworkName>
        </div>
        {!disabled && <ChevronDown size={20} />}
      </SelectorContainer>

      <DropdownMenu isOpen={isOpen}>
        {Object.values(BridgeNetwork).map(network => (
          <DropdownItem
            key={network}
            selected={network === selectedNetwork}
            onClick={() => handleSelect(network)}
          >
            <NetworkIcon
              src={NETWORK_METADATA[network].iconUrl}
              alt={NETWORK_METADATA[network].displayName}
            />
            <NetworkName>{NETWORK_METADATA[network].displayName}</NetworkName>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </div>
  );
}
```

#### 5.2.3 BridgeTokenSelector

**File: `src/components/bridge/BridgeTokenSelector.tsx`**

**Props Interface:**
```typescript
interface BridgeTokenSelectorProps {
  selectedToken: BridgeTokenSymbol;
  onSelect: (token: BridgeTokenSymbol) => void;
  originNetwork: BridgeNetwork;
}
```

**Responsibilities:**
1. Display available tokens for selected origin network
2. Show token logo and symbol
3. Filter tokens based on bridge support

#### 5.2.4 BridgeStatusStepper

**File: `src/components/bridge/BridgeStatusStepper.tsx`**

**Props Interface:**
```typescript
interface BridgeStatusStepperProps {
  operation: BridgeOperation;
  direction: BridgeDirection;
}

interface StepConfig {
  label: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}
```

**Responsibilities:**
1. Display 4-step progress: Submitted -> Confirming -> Processing -> Completed
2. Show confirmation count (e.g., "8/12 confirmations")
3. Display explorer links for transaction hashes
4. Handle error states with appropriate messaging

**Step Configurations:**

| Direction | Step 1 | Step 2 | Step 3 | Step 4 |
|-----------|--------|--------|--------|--------|
| Sepolia -> Goliath | Deposit submitted | Waiting for confirmations (X/12) | Minting on Goliath | Completed |
| Goliath -> Sepolia | Burn submitted | Waiting for finality (X/6) | Releasing on Sepolia | Completed |

#### 5.2.5 BridgeHistoryPanel

**File: `src/components/bridge/BridgeHistoryPanel.tsx`**

**Props Interface:**
```typescript
interface BridgeHistoryPanelProps {
  maxItems?: number; // Default: 5
}
```

**Responsibilities:**
1. Display recent bridge operations for connected wallet
2. Collapsible/expandable UI
3. Show status badges (Pending, Completed, Failed)
4. Clickable items open status modal

---

## 6. State Management

### 6.1 Redux Slice Structure

**File: `src/state/bridge/types.ts`**

```typescript
import { Address } from '../../types';

// ============================================
// Enums
// ============================================

export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
}

export type BridgeDirection = 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA';

export type BridgeTokenSymbol = 'XCN' | 'ETH' | 'BTC' | 'USDC';

export type BridgeStatus =
  | 'PENDING_ORIGIN_TX'      // User submitted tx, waiting for mining
  | 'CONFIRMING'             // Origin tx mined, waiting for confirmations
  | 'AWAITING_RELAY'         // Origin finalized, waiting for relayer
  | 'PROCESSING_DESTINATION' // Relayer submitted destination tx
  | 'COMPLETED'              // Destination tx confirmed
  | 'FAILED'                 // Permanent failure
  | 'EXPIRED'                // Timeout exceeded (60+ minutes)
  | 'DELAYED';               // Taking longer than expected (10+ minutes)

// ============================================
// Core Data Types
// ============================================

export interface BridgeOperation {
  id: string;                          // UUID v4
  direction: BridgeDirection;
  token: BridgeTokenSymbol;
  amountHuman: string;                 // Human-readable (e.g., "100.5")
  amountAtomic: string;                // Stringified BigInt in token decimals
  sender: Address;
  recipient: Address;
  originChainId: number;
  destinationChainId: number;
  originTxHash: string | null;
  destinationTxHash: string | null;
  depositId: string | null;            // From contract event
  withdrawId: string | null;           // From contract event
  status: BridgeStatus;
  createdAt: number;                   // Unix timestamp (ms)
  updatedAt: number;                   // Unix timestamp (ms)
  originConfirmations: number;
  requiredConfirmations: number;
  errorMessage: string | null;
  estimatedCompletionTime: string | null; // ISO 8601 from backend
}

// ============================================
// Form State
// ============================================

export interface BridgeFormState {
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;                 // User input string
  recipient: Address | null;           // null = same as sender (v1 default)
}

// ============================================
// Redux State
// ============================================

export interface BridgeState {
  // Form state
  form: BridgeFormState;

  // Operations
  operations: Record<string, BridgeOperation>;
  operationIds: string[];              // Ordered by createdAt desc

  // Active operation (currently showing in modal)
  activeOperationId: string | null;

  // UI state
  isConfirmModalOpen: boolean;
  isStatusModalOpen: boolean;

  // Loading states
  isSubmitting: boolean;
  isApproving: boolean;

  // Error state
  error: string | null;
}
```

### 6.2 Redux Slice Definition

**File: `src/state/bridge/reducer.ts`**

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  BridgeState,
  BridgeFormState,
  BridgeOperation,
  BridgeNetwork,
  BridgeTokenSymbol,
  BridgeStatus,
} from './types';

const initialFormState: BridgeFormState = {
  originNetwork: BridgeNetwork.SEPOLIA,
  destinationNetwork: BridgeNetwork.GOLIATH,
  selectedToken: 'XCN',
  inputAmount: '',
  recipient: null,
};

const initialState: BridgeState = {
  form: initialFormState,
  operations: {},
  operationIds: [],
  activeOperationId: null,
  isConfirmModalOpen: false,
  isStatusModalOpen: false,
  isSubmitting: false,
  isApproving: false,
  error: null,
};

const bridgeSlice = createSlice({
  name: 'bridge',
  initialState,
  reducers: {
    // ========================================
    // Form Actions
    // ========================================
    setOriginNetwork(state, action: PayloadAction<BridgeNetwork>) {
      state.form.originNetwork = action.payload;
      state.form.destinationNetwork =
        action.payload === BridgeNetwork.SEPOLIA
          ? BridgeNetwork.GOLIATH
          : BridgeNetwork.SEPOLIA;
      state.error = null;
    },

    swapDirection(state) {
      const temp = state.form.originNetwork;
      state.form.originNetwork = state.form.destinationNetwork;
      state.form.destinationNetwork = temp;
      state.error = null;
    },

    setSelectedToken(state, action: PayloadAction<BridgeTokenSymbol>) {
      state.form.selectedToken = action.payload;
      state.error = null;
    },

    setInputAmount(state, action: PayloadAction<string>) {
      state.form.inputAmount = action.payload;
      state.error = null;
    },

    setRecipient(state, action: PayloadAction<string | null>) {
      state.form.recipient = action.payload;
    },

    resetForm(state) {
      state.form = initialFormState;
      state.error = null;
    },

    // ========================================
    // Operation Actions
    // ========================================
    addOperation(state, action: PayloadAction<BridgeOperation>) {
      const op = action.payload;
      state.operations[op.id] = op;
      state.operationIds.unshift(op.id); // Add to beginning (newest first)
      state.activeOperationId = op.id;
    },

    updateOperation(
      state,
      action: PayloadAction<{ id: string; updates: Partial<BridgeOperation> }>
    ) {
      const { id, updates } = action.payload;
      if (state.operations[id]) {
        state.operations[id] = {
          ...state.operations[id],
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },

    updateOperationStatus(
      state,
      action: PayloadAction<{
        id: string;
        status: BridgeStatus;
        originConfirmations?: number;
        destinationTxHash?: string;
        errorMessage?: string;
        estimatedCompletionTime?: string;
      }>
    ) {
      const { id, ...updates } = action.payload;
      if (state.operations[id]) {
        state.operations[id] = {
          ...state.operations[id],
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },

    removeOperation(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.operations[id];
      state.operationIds = state.operationIds.filter(opId => opId !== id);
      if (state.activeOperationId === id) {
        state.activeOperationId = null;
      }
    },

    // ========================================
    // Modal Actions
    // ========================================
    openConfirmModal(state) {
      state.isConfirmModalOpen = true;
    },

    closeConfirmModal(state) {
      state.isConfirmModalOpen = false;
    },

    openStatusModal(state, action: PayloadAction<string>) {
      state.activeOperationId = action.payload;
      state.isStatusModalOpen = true;
    },

    closeStatusModal(state) {
      state.isStatusModalOpen = false;
    },

    // ========================================
    // Loading States
    // ========================================
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },

    setApproving(state, action: PayloadAction<boolean>) {
      state.isApproving = action.payload;
    },

    // ========================================
    // Error Handling
    // ========================================
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    clearError(state) {
      state.error = null;
    },
  },
});

export const bridgeActions = bridgeSlice.actions;
export default bridgeSlice.reducer;
```

### 6.3 Selectors

**File: `src/state/bridge/selectors.ts`**

```typescript
import { createSelector } from '@reduxjs/toolkit';
import { AppState } from '../index';
import { BridgeOperation, BridgeStatus } from './types';

// Base selectors
export const selectBridgeState = (state: AppState) => state.bridge;
export const selectBridgeForm = (state: AppState) => state.bridge.form;
export const selectOperations = (state: AppState) => state.bridge.operations;
export const selectOperationIds = (state: AppState) => state.bridge.operationIds;
export const selectActiveOperationId = (state: AppState) => state.bridge.activeOperationId;

// Derived selectors
export const selectActiveOperation = createSelector(
  [selectOperations, selectActiveOperationId],
  (operations, activeId): BridgeOperation | null => {
    return activeId ? operations[activeId] ?? null : null;
  }
);

export const selectAllOperations = createSelector(
  [selectOperations, selectOperationIds],
  (operations, ids): BridgeOperation[] => {
    return ids.map(id => operations[id]).filter(Boolean);
  }
);

export const selectPendingOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    const pendingStatuses: BridgeStatus[] = [
      'PENDING_ORIGIN_TX',
      'CONFIRMING',
      'AWAITING_RELAY',
      'PROCESSING_DESTINATION',
      'DELAYED',
    ];
    return operations.filter(op => pendingStatuses.includes(op.status));
  }
);

export const selectCompletedOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.filter(op => op.status === 'COMPLETED');
  }
);

export const selectFailedOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.filter(op => op.status === 'FAILED' || op.status === 'EXPIRED');
  }
);

export const selectRecentOperations = createSelector(
  [selectAllOperations],
  (operations): BridgeOperation[] => {
    return operations.slice(0, 10); // Last 10 operations
  }
);

export const selectOperationsByAddress = createSelector(
  [selectAllOperations, (_state: AppState, address: string) => address],
  (operations, address): BridgeOperation[] => {
    const normalizedAddress = address.toLowerCase();
    return operations.filter(
      op =>
        op.sender.toLowerCase() === normalizedAddress ||
        op.recipient.toLowerCase() === normalizedAddress
    );
  }
);

export const selectDirection = createSelector([selectBridgeForm], form => {
  return form.originNetwork === 'SEPOLIA' ? 'SEPOLIA_TO_GOLIATH' : 'GOLIATH_TO_SEPOLIA';
});

export const selectIsSubmitting = (state: AppState) => state.bridge.isSubmitting;
export const selectIsApproving = (state: AppState) => state.bridge.isApproving;
export const selectBridgeError = (state: AppState) => state.bridge.error;
export const selectIsConfirmModalOpen = (state: AppState) => state.bridge.isConfirmModalOpen;
export const selectIsStatusModalOpen = (state: AppState) => state.bridge.isStatusModalOpen;
```

### 6.4 LocalStorage Persistence

**File: `src/state/bridge/localStorage.ts`**

```typescript
import { BridgeOperation, BridgeStatus } from './types';

const STORAGE_KEY = 'bridge:operations:v1';
const MAX_STORED_OPERATIONS = 100;
const EXPIRY_DAYS = 30;

interface StoredData {
  version: number;
  operations: Record<string, BridgeOperation>;
  operationIds: string[];
  lastUpdated: number;
}

/**
 * Load operations from localStorage
 */
export function loadOperationsFromStorage(): {
  operations: Record<string, BridgeOperation>;
  operationIds: string[];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { operations: {}, operationIds: [] };
    }

    const data: StoredData = JSON.parse(raw);

    // Filter out expired operations
    const expiryThreshold = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const validOperationIds = data.operationIds.filter(id => {
      const op = data.operations[id];
      return op && op.createdAt > expiryThreshold;
    });

    const validOperations: Record<string, BridgeOperation> = {};
    validOperationIds.forEach(id => {
      validOperations[id] = data.operations[id];
    });

    return {
      operations: validOperations,
      operationIds: validOperationIds,
    };
  } catch (error) {
    console.error('Failed to load bridge operations from storage:', error);
    return { operations: {}, operationIds: [] };
  }
}

/**
 * Save operations to localStorage
 */
export function saveOperationsToStorage(
  operations: Record<string, BridgeOperation>,
  operationIds: string[]
): void {
  try {
    // Limit stored operations
    const limitedIds = operationIds.slice(0, MAX_STORED_OPERATIONS);
    const limitedOperations: Record<string, BridgeOperation> = {};
    limitedIds.forEach(id => {
      if (operations[id]) {
        limitedOperations[id] = operations[id];
      }
    });

    const data: StoredData = {
      version: 1,
      operations: limitedOperations,
      operationIds: limitedIds,
      lastUpdated: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save bridge operations to storage:', error);
  }
}

/**
 * Clear all stored operations
 */
export function clearStoredOperations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear bridge operations from storage:', error);
  }
}

/**
 * Determine if an operation needs status polling
 */
export function operationNeedsPolling(status: BridgeStatus): boolean {
  const terminalStatuses: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];
  return !terminalStatuses.includes(status);
}
```

### 6.5 Store Integration

**Modify: `src/state/index.ts`**

```typescript
import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit';
import { save, load } from 'redux-localstorage-simple';

import application from './application/reducer';
import { updateVersion } from './global/actions';
import user from './user/reducer';
import transactions from './transactions/reducer';
import swap from './swap/reducer';
import mint from './mint/reducer';
import lists from './lists/reducer';
import burn from './burn/reducer';
import multicall from './multicall/reducer';
import bridge from './bridge/reducer'; // NEW

const PERSISTED_KEYS: string[] = ['user', 'transactions', 'lists', 'bridge']; // ADD 'bridge'

const store = configureStore({
  reducer: {
    application,
    user,
    transactions,
    swap,
    mint,
    burn,
    multicall,
    lists,
    bridge, // NEW
  },
  middleware: [
    ...getDefaultMiddleware({ immutableCheck: false, thunk: true, serializableCheck: false }), // Enable thunk
    save({ states: PERSISTED_KEYS }),
  ],
  preloadedState: load({ states: PERSISTED_KEYS }),
});

store.dispatch(updateVersion());

export default store;
export type AppState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

## 7. Token and Network Modeling

### 7.1 Network Configuration

**File: `src/constants/bridge/networks.ts`**

```typescript
import { bridgeConfig } from '../../config/bridgeConfig';

export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
}

export interface NetworkMetadata {
  chainId: number;
  displayName: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  blockTime: number;        // seconds
  finalityBlocks: number;
  iconUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const NETWORK_METADATA: Record<BridgeNetwork, NetworkMetadata> = {
  [BridgeNetwork.SEPOLIA]: {
    chainId: 11155111,
    displayName: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    rpcUrl: bridgeConfig.sepolia.rpcUrl,
    explorerUrl: bridgeConfig.sepolia.explorerUrl,
    blockTime: 12,
    finalityBlocks: 12,
    iconUrl: '/images/chains/ethereum.svg',
    nativeCurrency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  [BridgeNetwork.GOLIATH]: {
    chainId: 8901,
    displayName: 'Goliath Testnet',
    shortName: 'Goliath',
    rpcUrl: bridgeConfig.goliath.rpcUrl,
    explorerUrl: bridgeConfig.goliath.explorerUrl,
    blockTime: 2,
    finalityBlocks: 6,
    iconUrl: '/images/chains/goliath.svg',
    nativeCurrency: {
      name: 'XCN',
      symbol: 'XCN',
      decimals: 18, // RPC decimals
    },
  },
};

export function getNetworkByChainId(chainId: number): BridgeNetwork | null {
  if (chainId === 11155111) return BridgeNetwork.SEPOLIA;
  if (chainId === 8901) return BridgeNetwork.GOLIATH;
  return null;
}

export function getOppositeNetwork(network: BridgeNetwork): BridgeNetwork {
  return network === BridgeNetwork.SEPOLIA
    ? BridgeNetwork.GOLIATH
    : BridgeNetwork.SEPOLIA;
}

export function getExplorerTxUrl(network: BridgeNetwork, txHash: string): string {
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(network: BridgeNetwork, address: string): string {
  const metadata = NETWORK_METADATA[network];
  return `${metadata.explorerUrl}/address/${address}`;
}
```

### 7.2 Token Configuration

**File: `src/constants/bridge/tokens.ts`**

```typescript
import { bridgeConfig } from '../../config/bridgeConfig';
import { BridgeNetwork } from './networks';

// v1.0: USDC and ETH. Future versions will add 'XCN' | 'BTC'
export type BridgeTokenSymbol = 'USDC' | 'ETH';

export interface ChainTokenConfig {
  address: string | null;  // null = native asset
  decimals: number;
  isNative: boolean;
}

export interface BridgeTokenConfig {
  symbol: BridgeTokenSymbol;
  name: string;
  logoUrl: string;
  sepolia: ChainTokenConfig;
  goliath: ChainTokenConfig;
}

// v1.0: USDC and ETH configuration
export const BRIDGE_TOKENS: Record<BridgeTokenSymbol, BridgeTokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    logoUrl: '/images/tokens/usdc.svg',
    sepolia: {
      // Circle's official Sepolia USDC
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6,
      isNative: false,
    },
    goliath: {
      address: '0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E',
      decimals: 6,
      isNative: false,
    },
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    logoUrl: '/images/tokens/eth.svg',
    sepolia: {
      // ETH is NATIVE on Sepolia
      address: null,
      decimals: 18,
      isNative: true,
    },
    goliath: {
      // ETH is ERC-20 on Goliath
      address: '0xF22914De280D7B60255859bA6933831598fB5DD6',
      decimals: 18,
      isNative: false,
    },
  },
};

// v1.0: USDC and ETH available
export const BRIDGE_TOKEN_LIST: BridgeTokenSymbol[] = ['USDC', 'ETH'];

// Default token for bridge form
export const DEFAULT_BRIDGE_TOKEN: BridgeTokenSymbol = 'USDC';

/**
 * Get token config for a specific chain
 */
export function getTokenConfigForChain(
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): ChainTokenConfig {
  const config = BRIDGE_TOKENS[token];
  return network === BridgeNetwork.SEPOLIA ? config.sepolia : config.goliath;
}

/**
 * Check if token requires approval on a given chain
 * Native assets do not require approval
 */
export function tokenRequiresApproval(
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): boolean {
  const config = getTokenConfigForChain(token, network);
  return !config.isNative;
}

/**
 * Get gas buffer for MAX button (native assets only)
 * v1.0: ETH on Sepolia is native, needs gas buffer
 */
export function getGasBuffer(token: BridgeTokenSymbol, network: BridgeNetwork): string {
  const config = getTokenConfigForChain(token, network);
  if (!config.isNative) {
    return '0';
  }
  // Reserve 0.01 units for gas when bridging native assets
  return '0.01';
}
```

### 7.3 XCN Decimal Utilities (Future - Not Used in v1.0)

> **Note**: This section is included for future reference when XCN support is added.
> **v1.0 uses USDC only** which has standard 6 decimals on both chains.

**File: `src/utils/bridge/xcnDecimals.ts`**

```typescript
import { ethers } from 'ethers';

/**
 * XCN Decimal Behavior on Goliath (FOR FUTURE USE):
 * - EVM internal: 8 decimals (tinyxcns)
 * - JSON-RPC: 18 decimals (weixcns)
 * - Conversion factor: 1 tinyxcn = 10^10 weixcns
 *
 * FRONTEND RULE:
 * Always use 18-decimal values when interacting via ethers.
 * The node handles the EVM<->RPC conversion automatically.
 */

const XCN_EVM_DECIMALS = 8;
const XCN_RPC_DECIMALS = 18;
const CONVERSION_FACTOR = BigInt(10) ** BigInt(XCN_RPC_DECIMALS - XCN_EVM_DECIMALS); // 10^10

export const XCN = {
  /**
   * Parse user input (e.g., "1.5") to RPC atomic units (18 decimals)
   */
  parseUserInputToRpcAtomic(amount: string): bigint {
    return ethers.utils.parseEther(amount).toBigInt();
  },

  /**
   * Format RPC atomic units to human-readable string
   */
  formatRpcAtomicToUser(atomic: bigint): string {
    return ethers.utils.formatEther(atomic);
  },

  /**
   * Convert tinyxcns (8 dec) to weixcns (18 dec)
   * Use when parsing EVM event data that uses 8 decimals
   */
  tinyToRpcAtomic(tiny: bigint): bigint {
    return tiny * CONVERSION_FACTOR;
  },

  /**
   * Convert weixcns (18 dec) to tinyxcns (8 dec)
   * Use when preparing data for EVM that expects 8 decimals
   */
  rpcAtomicToTiny(rpc: bigint): bigint {
    return rpc / CONVERSION_FACTOR;
  },

  /** EVM decimals constant */
  EVM_DECIMALS: XCN_EVM_DECIMALS,

  /** RPC decimals constant */
  RPC_DECIMALS: XCN_RPC_DECIMALS,

  /** Conversion factor (10^10) */
  CONVERSION_FACTOR,
};
```

### 7.4 Amount Utilities

**File: `src/utils/bridge/amounts.ts`**

```typescript
import { ethers } from 'ethers';
import { BridgeTokenSymbol, BRIDGE_TOKENS, getTokenConfigForChain, getGasBuffer } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';

/**
 * Parse human-readable amount to atomic units for a token
 */
export function parseAmount(
  amount: string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): bigint {
  const config = getTokenConfigForChain(token, network);
  return ethers.utils.parseUnits(amount, config.decimals).toBigInt();
}

/**
 * Format atomic units to human-readable string
 */
export function formatAmount(
  atomic: bigint | string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork,
  displayDecimals: number = 6
): string {
  const config = getTokenConfigForChain(token, network);
  const formatted = ethers.utils.formatUnits(atomic.toString(), config.decimals);

  // Limit display decimals
  const parts = formatted.split('.');
  if (parts.length === 2 && parts[1].length > displayDecimals) {
    return `${parts[0]}.${parts[1].slice(0, displayDecimals)}`;
  }
  return formatted;
}

/**
 * Calculate max spendable amount (balance minus gas buffer for native assets)
 */
export function calculateMaxSpendable(
  balance: bigint,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): bigint {
  const gasBuffer = getGasBuffer(token, network);
  if (gasBuffer === '0') {
    return balance;
  }

  const config = getTokenConfigForChain(token, network);
  const bufferAtomic = ethers.utils.parseUnits(gasBuffer, config.decimals).toBigInt();

  const maxSpendable = balance - bufferAtomic;
  return maxSpendable > 0n ? maxSpendable : 0n;
}

/**
 * Validate amount string is a valid number
 */
export function isValidAmountString(amount: string): boolean {
  if (!amount || amount.trim() === '') return false;

  // Check for valid decimal number format
  const regex = /^\d*\.?\d*$/;
  if (!regex.test(amount)) return false;

  // Ensure it's not just a dot
  if (amount === '.') return false;

  // Ensure there's at least one digit
  if (!/\d/.test(amount)) return false;

  return true;
}

/**
 * Compare two amounts (returns -1, 0, or 1)
 */
export function compareAmounts(
  a: string,
  b: string,
  token: BridgeTokenSymbol,
  network: BridgeNetwork
): number {
  const aAtomic = parseAmount(a || '0', token, network);
  const bAtomic = parseAmount(b || '0', token, network);

  if (aAtomic < bAtomic) return -1;
  if (aAtomic > bAtomic) return 1;
  return 0;
}

/**
 * Check if amount is greater than zero
 */
export function isPositiveAmount(amount: string): boolean {
  if (!isValidAmountString(amount)) return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}
```

---

## 8. Bridge Flow Implementation

### 8.1 Flow Overview

```
                    ┌─────────────────────┐
                    │   User enters       │
                    │   amount & token    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Validation        │
                    │   (amount, balance) │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌───────────────┐     ┌───────────────┐
            │ Native Asset  │     │   ERC-20      │
            │ (no approval) │     │ (check allow) │
            └───────┬───────┘     └───────┬───────┘
                    │                     │
                    │             ┌───────┴───────┐
                    │             ▼               ▼
                    │     ┌───────────┐   ┌───────────┐
                    │     │ Approved  │   │ Not       │
                    │     │           │   │ Approved  │
                    │     └─────┬─────┘   └─────┬─────┘
                    │           │               │
                    │           │               ▼
                    │           │       ┌───────────────┐
                    │           │       │ Approve TX    │
                    │           │       └───────┬───────┘
                    │           │               │
                    └───────────┼───────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │ Confirmation Modal  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Bridge Transaction  │
                    │ (deposit or burn)   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Status Polling      │
                    │ (5-second interval) │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Completion Modal    │
                    └─────────────────────┘
```

### 8.2 Sepolia to Goliath (Lock-Mint)

**Contract Call Patterns:**

```typescript
// ERC-20 Tokens (XCN, BTC, USDC on Sepolia)
// Step 1: Approve (if needed)
await tokenContract.approve(bridgeSepoliaAddress, amount);

// Step 2: Deposit
const tx = await bridgeSepolia.deposit(
  tokenAddress,  // ERC-20 token address
  amount,        // Atomic units
  recipient      // Destination address (same as sender in v1)
);

// Native ETH on Sepolia
// No approval needed, use payable function
const tx = await bridgeSepolia.deposit(
  ethers.constants.AddressZero,  // Sentinel for native ETH
  amount,
  recipient,
  { value: amount }              // Send ETH with transaction
);
```

**Hook Implementation:**

**File: `src/hooks/bridge/useBridgeDeposit.ts`**

```typescript
import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useBridgeSepoliaContract } from './useContracts';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { parseAmount } from '../../utils/bridge/amounts';
import { v4 as uuidv4 } from 'uuid';

interface UseDepositReturn {
  deposit: (
    token: BridgeTokenSymbol,
    amountHuman: string,
    recipient: string
  ) => Promise<string>; // Returns operation ID
  isLoading: boolean;
  error: string | null;
}

export function useBridgeDeposit(): UseDepositReturn {
  const { account, library } = useActiveWeb3React();
  const bridgeContract = useBridgeSepoliaContract();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(
    async (
      token: BridgeTokenSymbol,
      amountHuman: string,
      recipient: string
    ): Promise<string> => {
      if (!account || !library || !bridgeContract) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      try {
        const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.SEPOLIA);
        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.SEPOLIA);

        let tx: ethers.ContractTransaction;

        if (tokenConfig.isNative) {
          // Native ETH deposit
          tx = await bridgeContract.deposit(
            ethers.constants.AddressZero,
            amountAtomic.toString(),
            recipient,
            { value: amountAtomic.toString() }
          );
        } else {
          // ERC-20 deposit
          tx = await bridgeContract.deposit(
            tokenConfig.address,
            amountAtomic.toString(),
            recipient
          );
        }

        // Create operation record
        const operationId = uuidv4();
        const operation = {
          id: operationId,
          direction: 'SEPOLIA_TO_GOLIATH' as const,
          token,
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          sender: account,
          recipient,
          originChainId: 11155111,
          destinationChainId: 8901,
          originTxHash: tx.hash,
          destinationTxHash: null,
          depositId: null,
          withdrawId: null,
          status: 'PENDING_ORIGIN_TX' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originConfirmations: 0,
          requiredConfirmations: 12,
          errorMessage: null,
          estimatedCompletionTime: null,
        };

        dispatch(bridgeActions.addOperation(operation));
        dispatch(bridgeActions.closeConfirmModal());
        dispatch(bridgeActions.openStatusModal(operationId));

        // Wait for tx to be mined
        const receipt = await tx.wait();

        if (receipt.status === 0) {
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'FAILED',
              errorMessage: 'Transaction reverted',
            })
          );
          throw new Error('Transaction reverted');
        }

        // Update status to confirming
        dispatch(
          bridgeActions.updateOperationStatus({
            id: operationId,
            status: 'CONFIRMING',
            originConfirmations: 1,
          })
        );

        return operationId;
      } catch (err: any) {
        const message = err?.message || 'Deposit failed';
        setError(message);
        dispatch(bridgeActions.setError(message));
        throw err;
      } finally {
        setIsLoading(false);
        dispatch(bridgeActions.setSubmitting(false));
      }
    },
    [account, library, bridgeContract, dispatch]
  );

  return { deposit, isLoading, error };
}
```

### 8.3 Goliath to Sepolia (Burn-Release)

**Contract Call Patterns:**

```typescript
// ERC-20 Tokens (ETH, BTC, USDC on Goliath)
// Step 1: Approve (if needed)
await tokenContract.approve(bridgeGoliathAddress, amount);

// Step 2: Burn
const tx = await bridgeGoliath.burn(
  tokenAddress,  // ERC-20 token address
  amount,        // Atomic units
  recipient      // Destination address on Sepolia
);

// Native XCN on Goliath
// No approval needed, use payable burnNative function
const tx = await bridgeGoliath.burnNative(
  recipient,
  { value: amount }  // Send XCN with transaction (18-decimal RPC value)
);
```

**Hook Implementation:**

**File: `src/hooks/bridge/useBridgeBurn.ts`**

```typescript
import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useActiveWeb3React } from '../index';
import { useBridgeGoliathContract } from './useContracts';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeTokenSymbol, getTokenConfigForChain } from '../../constants/bridge/tokens';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { parseAmount } from '../../utils/bridge/amounts';
import { v4 as uuidv4 } from 'uuid';

interface UseBurnReturn {
  burn: (
    token: BridgeTokenSymbol,
    amountHuman: string,
    recipient: string
  ) => Promise<string>; // Returns operation ID
  isLoading: boolean;
  error: string | null;
}

export function useBridgeBurn(): UseBurnReturn {
  const { account, library } = useActiveWeb3React();
  const bridgeContract = useBridgeGoliathContract();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const burn = useCallback(
    async (
      token: BridgeTokenSymbol,
      amountHuman: string,
      recipient: string
    ): Promise<string> => {
      if (!account || !library || !bridgeContract) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);
      dispatch(bridgeActions.setSubmitting(true));

      try {
        const tokenConfig = getTokenConfigForChain(token, BridgeNetwork.GOLIATH);
        const amountAtomic = parseAmount(amountHuman, token, BridgeNetwork.GOLIATH);

        let tx: ethers.ContractTransaction;

        if (tokenConfig.isNative) {
          // Native XCN burn
          // Note: amountAtomic is in 18-decimal RPC units
          tx = await bridgeContract.burnNative(recipient, {
            value: amountAtomic.toString(),
          });
        } else {
          // ERC-20 burn
          tx = await bridgeContract.burn(
            tokenConfig.address,
            amountAtomic.toString(),
            recipient
          );
        }

        // Create operation record
        const operationId = uuidv4();
        const operation = {
          id: operationId,
          direction: 'GOLIATH_TO_SEPOLIA' as const,
          token,
          amountHuman,
          amountAtomic: amountAtomic.toString(),
          sender: account,
          recipient,
          originChainId: 8901,
          destinationChainId: 11155111,
          originTxHash: tx.hash,
          destinationTxHash: null,
          depositId: null,
          withdrawId: null,
          status: 'PENDING_ORIGIN_TX' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originConfirmations: 0,
          requiredConfirmations: 6, // Goliath finality
          errorMessage: null,
          estimatedCompletionTime: null,
        };

        dispatch(bridgeActions.addOperation(operation));
        dispatch(bridgeActions.closeConfirmModal());
        dispatch(bridgeActions.openStatusModal(operationId));

        // Wait for tx to be mined
        const receipt = await tx.wait();

        if (receipt.status === 0) {
          dispatch(
            bridgeActions.updateOperationStatus({
              id: operationId,
              status: 'FAILED',
              errorMessage: 'Transaction reverted',
            })
          );
          throw new Error('Transaction reverted');
        }

        // Update status to confirming
        dispatch(
          bridgeActions.updateOperationStatus({
            id: operationId,
            status: 'CONFIRMING',
            originConfirmations: 1,
          })
        );

        return operationId;
      } catch (err: any) {
        const message = err?.message || 'Burn failed';
        setError(message);
        dispatch(bridgeActions.setError(message));
        throw err;
      } finally {
        setIsLoading(false);
        dispatch(bridgeActions.setSubmitting(false));
      }
    },
    [account, library, bridgeContract, dispatch]
  );

  return { burn, isLoading, error };
}
```

### 8.4 Same-Wallet Enforcement

```typescript
// In BridgeForm.tsx or useBridgeForm.ts

// V1: Recipient is ALWAYS the connected wallet address
const recipient = account; // No custom recipient option

// Hide recipient input field
// The recipient field in BridgeOperation will always equal sender
```

---

## 9. Hooks Design

### 9.1 Hook Index

| Hook | Purpose | Key Dependencies |
|------|---------|------------------|
| `useBridgeForm` | Form state, validation, action handlers | Redux, useActiveWeb3React |
| `useBridgeAllowance` | Check token allowance | useTokenContract |
| `useBridgeApprove` | Execute approval transaction | useTokenContract |
| `useBridgeDeposit` | Execute Sepolia deposit | useBridgeSepoliaContract |
| `useBridgeBurn` | Execute Goliath burn | useBridgeGoliathContract |
| `useBridgeStatusPolling` | Poll status API | bridgeApi |
| `useBridgeHistory` | Fetch user history | bridgeApi |
| `useBridgeBalances` | Fetch multi-chain balances | chainProviders |
| `useBridgeNetworkSwitch` | Handle network switching | useActiveWeb3React |

### 9.2 useBridgeForm

**File: `src/hooks/bridge/useBridgeForm.ts`**

```typescript
import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useActiveWeb3React } from '../index';
import { bridgeActions } from '../../state/bridge/reducer';
import {
  selectBridgeForm,
  selectIsSubmitting,
  selectIsApproving,
  selectDirection,
} from '../../state/bridge/selectors';
import { useBridgeAllowance } from './useBridgeAllowance';
import { useBridgeBalances } from './useBridgeBalances';
import { validateBridgeInput, ValidationResult } from '../../utils/bridge/validation';
import { BridgeNetwork } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, tokenRequiresApproval } from '../../constants/bridge/tokens';
import { bridgeConfig } from '../../config/bridgeConfig';

export interface UseBridgeFormReturn {
  // Form values
  originNetwork: BridgeNetwork;
  destinationNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;

  // Derived values
  direction: 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA';
  outputAmount: string; // Same as input (1:1 bridge)

  // Balances
  originBalance: string;
  isBalanceLoading: boolean;

  // Allowance
  hasAllowance: boolean;
  isAllowanceLoading: boolean;
  needsApproval: boolean;

  // Validation
  validation: ValidationResult;

  // Loading states
  isSubmitting: boolean;
  isApproving: boolean;

  // Actions
  setOriginNetwork: (network: BridgeNetwork) => void;
  swapDirection: () => void;
  setSelectedToken: (token: BridgeTokenSymbol) => void;
  setInputAmount: (amount: string) => void;
  setMaxAmount: () => void;
  resetForm: () => void;
}

export function useBridgeForm(): UseBridgeFormReturn {
  const dispatch = useDispatch();
  const { account, chainId } = useActiveWeb3React();

  // Redux state
  const form = useSelector(selectBridgeForm);
  const direction = useSelector(selectDirection);
  const isSubmitting = useSelector(selectIsSubmitting);
  const isApproving = useSelector(selectIsApproving);

  // Balances
  const { balance: originBalance, isLoading: isBalanceLoading } = useBridgeBalances(
    form.selectedToken,
    form.originNetwork
  );

  // Allowance (only for ERC-20 tokens)
  const needsApprovalCheck = tokenRequiresApproval(form.selectedToken, form.originNetwork);
  const { hasAllowance, isLoading: isAllowanceLoading } = useBridgeAllowance(
    form.selectedToken,
    form.originNetwork,
    form.inputAmount,
    { skip: !needsApprovalCheck }
  );

  // Validation
  const validation = useMemo(() => {
    return validateBridgeInput({
      account,
      chainId,
      originNetwork: form.originNetwork,
      selectedToken: form.selectedToken,
      inputAmount: form.inputAmount,
      originBalance,
      minAmount: bridgeConfig.minAmount,
      bridgeEnabled: bridgeConfig.bridgeEnabled,
    });
  }, [account, chainId, form, originBalance]);

  // Derived: needs approval
  const needsApproval = useMemo(() => {
    if (!needsApprovalCheck) return false;
    if (isAllowanceLoading) return false;
    return !hasAllowance;
  }, [needsApprovalCheck, hasAllowance, isAllowanceLoading]);

  // Actions
  const setOriginNetwork = useCallback(
    (network: BridgeNetwork) => {
      dispatch(bridgeActions.setOriginNetwork(network));
    },
    [dispatch]
  );

  const swapDirection = useCallback(() => {
    dispatch(bridgeActions.swapDirection());
  }, [dispatch]);

  const setSelectedToken = useCallback(
    (token: BridgeTokenSymbol) => {
      dispatch(bridgeActions.setSelectedToken(token));
    },
    [dispatch]
  );

  const setInputAmount = useCallback(
    (amount: string) => {
      dispatch(bridgeActions.setInputAmount(amount));
    },
    [dispatch]
  );

  const setMaxAmount = useCallback(() => {
    if (originBalance) {
      // calculateMaxSpendable handles gas buffer for native assets
      dispatch(bridgeActions.setInputAmount(originBalance));
    }
  }, [originBalance, dispatch]);

  const resetForm = useCallback(() => {
    dispatch(bridgeActions.resetForm());
  }, [dispatch]);

  return {
    // Form values
    originNetwork: form.originNetwork,
    destinationNetwork: form.destinationNetwork,
    selectedToken: form.selectedToken,
    inputAmount: form.inputAmount,

    // Derived
    direction,
    outputAmount: form.inputAmount, // 1:1 bridge

    // Balances
    originBalance,
    isBalanceLoading,

    // Allowance
    hasAllowance,
    isAllowanceLoading,
    needsApproval,

    // Validation
    validation,

    // Loading
    isSubmitting,
    isApproving,

    // Actions
    setOriginNetwork,
    swapDirection,
    setSelectedToken,
    setInputAmount,
    setMaxAmount,
    resetForm,
  };
}
```

### 9.3 useBridgeStatusPolling

**File: `src/hooks/bridge/useBridgeStatusPolling.ts`**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { bridgeActions } from '../../state/bridge/reducer';
import { BridgeApiClient } from '../../services/bridgeApi';
import { BridgeOperation, BridgeStatus } from '../../state/bridge/types';
import { bridgeConfig } from '../../config/bridgeConfig';

const TERMINAL_STATUSES: BridgeStatus[] = ['COMPLETED', 'FAILED', 'EXPIRED'];

export function useBridgeStatusPolling(operation: BridgeOperation | null) {
  const dispatch = useDispatch();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiClient = useRef(new BridgeApiClient(bridgeConfig.statusApiBaseUrl));

  const pollStatus = useCallback(async () => {
    if (!operation) return;
    if (TERMINAL_STATUSES.includes(operation.status)) return;

    try {
      const response = await apiClient.current.getStatus({
        originTxHash: operation.originTxHash,
      });

      if (response) {
        dispatch(
          bridgeActions.updateOperationStatus({
            id: operation.id,
            status: response.status,
            originConfirmations: response.originConfirmations,
            destinationTxHash: response.destinationTxHash ?? undefined,
            estimatedCompletionTime: response.estimatedCompletionTime ?? undefined,
            errorMessage: response.error ?? undefined,
          })
        );
      }
    } catch (error) {
      console.error('Status polling error:', error);
      // Don't update state on error - will retry next interval
    }
  }, [operation, dispatch]);

  // Start/stop polling based on operation state
  useEffect(() => {
    if (!operation) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (TERMINAL_STATUSES.includes(operation.status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial poll
    pollStatus();

    // Set up interval
    intervalRef.current = setInterval(pollStatus, bridgeConfig.statusPollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [operation?.id, operation?.status, pollStatus]);
}
```

---

## 10. Backend API Integration

### 10.1 API Client

**File: `src/services/bridgeApi.ts`**

```typescript
import { BridgeDirection, BridgeStatus, BridgeTokenSymbol } from '../state/bridge/types';

// ============================================
// API Response Types
// ============================================

export interface BridgeStatusResponse {
  operationId: string;
  direction: BridgeDirection;
  status: BridgeStatus;
  token: BridgeTokenSymbol;
  amount: string;
  amountFormatted: string;
  sender: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originTxHash: string | null;
  destinationTxHash: string | null;
  originConfirmations: number;
  requiredConfirmations: number;
  timestamps: {
    depositedAt: string | null;
    finalizedAt: string | null;
    destinationSubmittedAt: string | null;
    completedAt: string | null;
  };
  estimatedCompletionTime: string | null;
  error: string | null;
  isSameWallet: boolean;
}

export interface BridgeHistoryResponse {
  operations: BridgeStatusResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface BridgeHealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  chains: {
    sepolia: {
      connected: boolean;
      lastBlock: number;
      lastProcessedBlock: number;
      lag: number;
    };
    goliath: {
      connected: boolean;
      lastBlock: number;
      lastProcessedBlock: number;
      lag: number;
    };
  };
  relayer: {
    pendingOperations: number;
    lastProcessedAt: string;
  };
}

// ============================================
// API Client
// ============================================

export class BridgeApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 10000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new BridgeApiError(
          response.status,
          errorData.message || `HTTP ${response.status}`,
          errorData.code
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof BridgeApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BridgeApiError(0, 'Request timeout');
        }
        throw new BridgeApiError(0, error.message);
      }

      throw new BridgeApiError(0, 'Unknown error');
    }
  }

  /**
   * Get status of a bridge operation
   */
  async getStatus(params: {
    originTxHash?: string | null;
    depositId?: string | null;
    withdrawId?: string | null;
  }): Promise<BridgeStatusResponse | null> {
    const queryParams = new URLSearchParams();

    if (params.originTxHash) {
      queryParams.set('originTxHash', params.originTxHash);
    } else if (params.depositId) {
      queryParams.set('depositId', params.depositId);
    } else if (params.withdrawId) {
      queryParams.set('withdrawId', params.withdrawId);
    } else {
      throw new Error('One of originTxHash, depositId, or withdrawId is required');
    }

    try {
      return await this.fetch<BridgeStatusResponse>(
        `/bridge/status?${queryParams.toString()}`
      );
    } catch (error) {
      if (error instanceof BridgeApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get bridge history for an address
   */
  async getHistory(params: {
    address: string;
    limit?: number;
    offset?: number;
    status?: BridgeStatus;
    direction?: BridgeDirection;
  }): Promise<BridgeHistoryResponse> {
    const queryParams = new URLSearchParams({
      address: params.address,
      limit: String(params.limit ?? 10),
      offset: String(params.offset ?? 0),
    });

    if (params.status) {
      queryParams.set('status', params.status);
    }
    if (params.direction) {
      queryParams.set('direction', params.direction);
    }

    return this.fetch<BridgeHistoryResponse>(
      `/bridge/history?${queryParams.toString()}`
    );
  }

  /**
   * Check bridge health status
   */
  async getHealth(): Promise<BridgeHealthResponse> {
    return this.fetch<BridgeHealthResponse>('/health');
  }

  /**
   * Check if bridge is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status !== 'healthy';
    } catch {
      return true; // Assume paused if we can't reach the API
    }
  }
}

// ============================================
// Error Class
// ============================================

export class BridgeApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'BridgeApiError';
    this.status = status;
    this.code = code;
  }
}
```

### 10.2 Chain Providers

**File: `src/services/bridgeProviders.ts`**

```typescript
import { ethers } from 'ethers';
import { bridgeConfig } from '../config/bridgeConfig';
import { BridgeNetwork } from '../constants/bridge/networks';

/**
 * Read-only providers for both chains
 * Used for balance queries and tx monitoring independent of wallet connection
 */
export const readonlyProviders: Record<BridgeNetwork, ethers.providers.JsonRpcProvider> = {
  [BridgeNetwork.SEPOLIA]: new ethers.providers.JsonRpcProvider(
    bridgeConfig.sepolia.rpcUrl
  ),
  [BridgeNetwork.GOLIATH]: new ethers.providers.JsonRpcProvider(
    bridgeConfig.goliath.rpcUrl
  ),
};

/**
 * Get provider for a specific network
 */
export function getReadonlyProvider(
  network: BridgeNetwork
): ethers.providers.JsonRpcProvider {
  return readonlyProviders[network];
}

/**
 * Get balance for an address on a specific network
 */
export async function getNativeBalance(
  address: string,
  network: BridgeNetwork
): Promise<bigint> {
  const provider = readonlyProviders[network];
  const balance = await provider.getBalance(address);
  return balance.toBigInt();
}

/**
 * Get ERC-20 token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  network: BridgeNetwork
): Promise<bigint> {
  const provider = readonlyProviders[network];
  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const balance = await contract.balanceOf(ownerAddress);
  return balance.toBigInt();
}

/**
 * Get current block number for a network
 */
export async function getBlockNumber(network: BridgeNetwork): Promise<number> {
  const provider = readonlyProviders[network];
  return provider.getBlockNumber();
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  txHash: string,
  network: BridgeNetwork,
  confirmations: number = 1
): Promise<ethers.providers.TransactionReceipt> {
  const provider = readonlyProviders[network];
  return provider.waitForTransaction(txHash, confirmations);
}
```

---

## 11. Validation Rules

### 11.1 Validation State Machine

**File: `src/utils/bridge/validation.ts`**

```typescript
import { BridgeNetwork, NETWORK_METADATA } from '../../constants/bridge/networks';
import { BridgeTokenSymbol, BRIDGE_TOKENS } from '../../constants/bridge/tokens';
import { isValidAmountString, isPositiveAmount, compareAmounts } from './amounts';

// ============================================
// Validation Result Types
// ============================================

export type ValidationState =
  | 'NOT_CONNECTED'
  | 'WRONG_NETWORK'
  | 'EMPTY_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_TOO_SMALL'
  | 'INSUFFICIENT_BALANCE'
  | 'BRIDGE_PAUSED'
  | 'BRIDGE_UNAVAILABLE'
  | 'NEEDS_APPROVAL'
  | 'READY';

export interface ValidationResult {
  state: ValidationState;
  isValid: boolean;
  buttonText: string;
  errorMessage: string | null;
  disableButton: boolean;
}

export interface ValidationInput {
  account: string | null | undefined;
  chainId: number | undefined;
  originNetwork: BridgeNetwork;
  selectedToken: BridgeTokenSymbol;
  inputAmount: string;
  originBalance: string;
  minAmount: string;
  bridgeEnabled: boolean;
}

// ============================================
// Validation Logic
// ============================================

export function validateBridgeInput(input: ValidationInput): ValidationResult {
  const {
    account,
    chainId,
    originNetwork,
    selectedToken,
    inputAmount,
    originBalance,
    minAmount,
    bridgeEnabled,
  } = input;

  // 1. Wallet not connected
  if (!account) {
    return {
      state: 'NOT_CONNECTED',
      isValid: false,
      buttonText: 'Connect Wallet',
      errorMessage: null,
      disableButton: false,
    };
  }

  // 2. Bridge disabled
  if (!bridgeEnabled) {
    return {
      state: 'BRIDGE_UNAVAILABLE',
      isValid: false,
      buttonText: 'Bridge Unavailable',
      errorMessage: 'Bridge is temporarily unavailable',
      disableButton: true,
    };
  }

  // 3. Wrong network
  const expectedChainId = NETWORK_METADATA[originNetwork].chainId;
  if (chainId !== expectedChainId) {
    return {
      state: 'WRONG_NETWORK',
      isValid: false,
      buttonText: `Switch Network to ${NETWORK_METADATA[originNetwork].shortName}`,
      errorMessage: null,
      disableButton: false,
    };
  }

  // 4. Empty amount
  if (!inputAmount || inputAmount.trim() === '') {
    return {
      state: 'EMPTY_AMOUNT',
      isValid: false,
      buttonText: 'Enter an amount',
      errorMessage: null,
      disableButton: true,
    };
  }

  // 5. Invalid amount format
  if (!isValidAmountString(inputAmount)) {
    return {
      state: 'INVALID_AMOUNT',
      isValid: false,
      buttonText: 'Invalid amount',
      errorMessage: 'Please enter a valid number',
      disableButton: true,
    };
  }

  // 6. Zero amount
  if (!isPositiveAmount(inputAmount)) {
    return {
      state: 'EMPTY_AMOUNT',
      isValid: false,
      buttonText: 'Enter an amount',
      errorMessage: null,
      disableButton: true,
    };
  }

  // 7. Amount too small
  if (compareAmounts(inputAmount, minAmount, selectedToken, originNetwork) < 0) {
    return {
      state: 'AMOUNT_TOO_SMALL',
      isValid: false,
      buttonText: 'Amount too small',
      errorMessage: `Minimum amount is ${minAmount} ${selectedToken}`,
      disableButton: true,
    };
  }

  // 8. Insufficient balance
  if (compareAmounts(inputAmount, originBalance, selectedToken, originNetwork) > 0) {
    return {
      state: 'INSUFFICIENT_BALANCE',
      isValid: false,
      buttonText: `Insufficient ${selectedToken} balance`,
      errorMessage: null,
      disableButton: true,
    };
  }

  // 9. All checks passed
  return {
    state: 'READY',
    isValid: true,
    buttonText: `Bridge ${selectedToken}`,
    errorMessage: null,
    disableButton: false,
  };
}

// ============================================
// Button State Derivation
// ============================================

export function getButtonState(
  validation: ValidationResult,
  needsApproval: boolean,
  isApproving: boolean,
  isSubmitting: boolean,
  selectedToken: BridgeTokenSymbol
): { text: string; disabled: boolean; variant: 'primary' | 'error' | 'secondary' } {
  // Loading states
  if (isApproving) {
    return {
      text: `Approving ${selectedToken}...`,
      disabled: true,
      variant: 'primary',
    };
  }

  if (isSubmitting) {
    return {
      text: 'Bridging...',
      disabled: true,
      variant: 'primary',
    };
  }

  // Special states from validation
  if (validation.state === 'NOT_CONNECTED') {
    return {
      text: 'Connect Wallet',
      disabled: false,
      variant: 'primary',
    };
  }

  if (validation.state === 'WRONG_NETWORK') {
    return {
      text: validation.buttonText,
      disabled: false,
      variant: 'secondary',
    };
  }

  // Approval needed
  if (validation.isValid && needsApproval) {
    return {
      text: `Approve ${selectedToken}`,
      disabled: false,
      variant: 'primary',
    };
  }

  // Default to validation result
  return {
    text: validation.buttonText,
    disabled: validation.disableButton,
    variant: validation.isValid ? 'primary' : 'error',
  };
}
```

### 11.2 Validation Priority Order

| Priority | Condition | Button State | Error Message |
|----------|-----------|--------------|---------------|
| 1 | Wallet not connected | "Connect Wallet" (enabled) | - |
| 2 | Bridge disabled/paused | "Bridge Unavailable" (disabled) | "Bridge is temporarily paused" |
| 3 | Network mismatch | "Switch Network to [X]" (enabled) | - |
| 4 | Amount empty | "Enter an amount" (disabled) | - |
| 5 | Invalid amount format | "Invalid amount" (disabled) | "Please enter a valid number" |
| 6 | Amount is 0 | "Enter an amount" (disabled) | - |
| 7 | Amount < minimum | "Amount too small" (disabled) | "Minimum amount is X" |
| 8 | Amount > balance | "Insufficient [TOKEN] balance" (disabled) | - |
| 9 | Approval needed | "Approve [TOKEN]" (enabled) | - |
| 10 | Ready | "Bridge [TOKEN]" (enabled) | - |

---

## 12. ETA Display Logic

### 12.1 ETA Utilities

**File: `src/utils/bridge/eta.ts`**

```typescript
import { BridgeOperation, BridgeDirection, BridgeStatus } from '../../state/bridge/types';

// ============================================
// Static Fallback Estimates
// ============================================

const STATIC_ESTIMATES: Record<BridgeDirection, { min: number; max: number }> = {
  SEPOLIA_TO_GOLIATH: { min: 3, max: 5 },    // 3-5 minutes
  GOLIATH_TO_SEPOLIA: { min: 3, max: 5 },    // 3-5 minutes
};

// ============================================
// ETA Formatting Functions
// ============================================

/**
 * Format ETA for display in UI
 */
export function formatEta(operation: BridgeOperation): string {
  const { status, estimatedCompletionTime, direction, createdAt } = operation;

  // Terminal states
  if (status === 'COMPLETED') {
    return 'Completed';
  }
  if (status === 'FAILED') {
    return 'Failed';
  }
  if (status === 'EXPIRED') {
    return 'Expired';
  }

  // Use backend ETA if available
  if (estimatedCompletionTime) {
    return formatRelativeEta(estimatedCompletionTime, status);
  }

  // Fallback to static estimate
  const estimate = STATIC_ESTIMATES[direction];
  return `~${estimate.min}-${estimate.max} minutes`;
}

/**
 * Format relative ETA from ISO timestamp
 */
function formatRelativeEta(isoTimestamp: string, status: BridgeStatus): string {
  const eta = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = eta.getTime() - now.getTime();

  // ETA is in the past but not completed
  if (diffMs < 0) {
    if (status === 'DELAYED') {
      return 'Taking longer than expected...';
    }
    return 'Processing...';
  }

  const diffMinutes = Math.ceil(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'Less than 1 minute';
  }
  if (diffMinutes === 1) {
    return '~1 minute remaining';
  }
  if (diffMinutes < 60) {
    return `~${diffMinutes} minutes remaining`;
  }

  const diffHours = Math.ceil(diffMinutes / 60);
  return `~${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
}

/**
 * Get status step description with ETA context
 */
export function getStepDescription(
  stepIndex: number,
  operation: BridgeOperation
): string {
  const { status, originConfirmations, requiredConfirmations, direction } = operation;

  switch (stepIndex) {
    case 0: // Origin tx submitted
      if (status === 'PENDING_ORIGIN_TX') {
        return 'Waiting for transaction to be mined...';
      }
      return 'Transaction submitted';

    case 1: // Confirmations
      if (status === 'CONFIRMING') {
        return `${originConfirmations}/${requiredConfirmations} confirmations`;
      }
      if (['AWAITING_RELAY', 'PROCESSING_DESTINATION', 'COMPLETED'].includes(status)) {
        return `${requiredConfirmations}/${requiredConfirmations} confirmations`;
      }
      return 'Waiting for confirmations';

    case 2: // Processing on destination
      if (status === 'AWAITING_RELAY') {
        return 'Waiting for relayer...';
      }
      if (status === 'PROCESSING_DESTINATION') {
        const action = direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting' : 'Releasing';
        return `${action} on destination chain...`;
      }
      if (status === 'COMPLETED') {
        const action = direction === 'SEPOLIA_TO_GOLIATH' ? 'Minted' : 'Released';
        return `${action} successfully`;
      }
      return direction === 'SEPOLIA_TO_GOLIATH' ? 'Minting' : 'Releasing';

    case 3: // Completed
      if (status === 'COMPLETED') {
        return 'Bridge complete!';
      }
      return 'Pending completion';

    default:
      return '';
  }
}

/**
 * Check if operation is taking longer than expected
 */
export function isDelayed(operation: BridgeOperation): boolean {
  if (operation.status === 'DELAYED') return true;

  if (operation.estimatedCompletionTime) {
    const eta = new Date(operation.estimatedCompletionTime);
    const now = new Date();
    // If ETA is more than 5 minutes in the past
    if (now.getTime() - eta.getTime() > 5 * 60 * 1000) {
      return true;
    }
  }

  // If operation has been pending for more than 10 minutes
  const elapsed = Date.now() - operation.createdAt;
  if (elapsed > 10 * 60 * 1000 && operation.status !== 'COMPLETED') {
    return true;
  }

  return false;
}
```

---

## 13. Testing Strategy

### 13.1 Test Categories

| Category | Focus | Coverage Target |
|----------|-------|-----------------|
| Unit Tests | Redux reducers, selectors, utilities | 90% |
| Hook Tests | Custom hooks with mock providers | 80% |
| Component Tests | Component rendering and interactions | 75% |
| Integration Tests | Full form flows with mock API | 70% |
| E2E Tests | Critical paths on testnet | Key flows |

### 13.2 Unit Test Examples

**File: `src/state/bridge/reducer.test.ts`**

```typescript
import reducer, { bridgeActions } from './reducer';
import { BridgeState, BridgeNetwork, BridgeOperation } from './types';

describe('bridgeSlice', () => {
  const initialState: BridgeState = {
    form: {
      originNetwork: 'SEPOLIA',
      destinationNetwork: 'GOLIATH',
      selectedToken: 'XCN',
      inputAmount: '',
      recipient: null,
    },
    operations: {},
    operationIds: [],
    activeOperationId: null,
    isConfirmModalOpen: false,
    isStatusModalOpen: false,
    isSubmitting: false,
    isApproving: false,
    error: null,
  };

  describe('form actions', () => {
    it('should set origin network and auto-set destination', () => {
      const nextState = reducer(
        initialState,
        bridgeActions.setOriginNetwork(BridgeNetwork.GOLIATH)
      );
      expect(nextState.form.originNetwork).toBe('GOLIATH');
      expect(nextState.form.destinationNetwork).toBe('SEPOLIA');
    });

    it('should swap direction', () => {
      const nextState = reducer(initialState, bridgeActions.swapDirection());
      expect(nextState.form.originNetwork).toBe('GOLIATH');
      expect(nextState.form.destinationNetwork).toBe('SEPOLIA');
    });

    it('should set input amount', () => {
      const nextState = reducer(
        initialState,
        bridgeActions.setInputAmount('100.5')
      );
      expect(nextState.form.inputAmount).toBe('100.5');
    });

    it('should clear error when form changes', () => {
      const stateWithError = { ...initialState, error: 'Some error' };
      const nextState = reducer(
        stateWithError,
        bridgeActions.setInputAmount('50')
      );
      expect(nextState.error).toBeNull();
    });
  });

  describe('operation actions', () => {
    const mockOperation: BridgeOperation = {
      id: 'test-id-123',
      direction: 'SEPOLIA_TO_GOLIATH',
      token: 'USDC',
      amountHuman: '100',
      amountAtomic: '100000000',
      sender: '0x123',
      recipient: '0x123',
      originChainId: 11155111,
      destinationChainId: 8901,
      originTxHash: '0xabc',
      destinationTxHash: null,
      depositId: null,
      withdrawId: null,
      status: 'PENDING_ORIGIN_TX',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      originConfirmations: 0,
      requiredConfirmations: 12,
      errorMessage: null,
      estimatedCompletionTime: null,
    };

    it('should add operation', () => {
      const nextState = reducer(
        initialState,
        bridgeActions.addOperation(mockOperation)
      );
      expect(nextState.operations['test-id-123']).toEqual(mockOperation);
      expect(nextState.operationIds).toContain('test-id-123');
      expect(nextState.activeOperationId).toBe('test-id-123');
    });

    it('should update operation status', () => {
      const stateWithOp = reducer(
        initialState,
        bridgeActions.addOperation(mockOperation)
      );
      const nextState = reducer(
        stateWithOp,
        bridgeActions.updateOperationStatus({
          id: 'test-id-123',
          status: 'CONFIRMING',
          originConfirmations: 5,
        })
      );
      expect(nextState.operations['test-id-123'].status).toBe('CONFIRMING');
      expect(nextState.operations['test-id-123'].originConfirmations).toBe(5);
    });
  });
});
```

**File: `src/utils/bridge/validation.test.ts`**

```typescript
import { validateBridgeInput, ValidationState } from './validation';
import { BridgeNetwork } from '../../constants/bridge/networks';

describe('validateBridgeInput', () => {
  const baseInput = {
    account: '0x1234567890123456789012345678901234567890',
    chainId: 11155111,
    originNetwork: BridgeNetwork.SEPOLIA,
    selectedToken: 'USDC' as const,
    inputAmount: '100',
    originBalance: '500',
    minAmount: '0.000001',
    bridgeEnabled: true,
  };

  it('should return NOT_CONNECTED when account is null', () => {
    const result = validateBridgeInput({ ...baseInput, account: null });
    expect(result.state).toBe('NOT_CONNECTED');
    expect(result.buttonText).toBe('Connect Wallet');
  });

  it('should return WRONG_NETWORK when chainId does not match', () => {
    const result = validateBridgeInput({ ...baseInput, chainId: 8901 });
    expect(result.state).toBe('WRONG_NETWORK');
    expect(result.buttonText).toContain('Switch Network');
  });

  it('should return EMPTY_AMOUNT when inputAmount is empty', () => {
    const result = validateBridgeInput({ ...baseInput, inputAmount: '' });
    expect(result.state).toBe('EMPTY_AMOUNT');
  });

  it('should return INSUFFICIENT_BALANCE when amount exceeds balance', () => {
    const result = validateBridgeInput({ ...baseInput, inputAmount: '1000' });
    expect(result.state).toBe('INSUFFICIENT_BALANCE');
  });

  it('should return READY when all validations pass', () => {
    const result = validateBridgeInput(baseInput);
    expect(result.state).toBe('READY');
    expect(result.isValid).toBe(true);
    expect(result.buttonText).toBe('Bridge USDC');
  });
});
```

### 13.3 E2E Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| **S2G Happy Path** | 1. Connect wallet (Sepolia) 2. Select XCN, 100 units 3. Approve 4. Bridge 5. Wait for completion | Status shows COMPLETED, Goliath balance increases |
| **G2S Happy Path** | 1. Connect wallet (Goliath) 2. Select ETH, 0.5 units 3. Approve 4. Bridge 5. Wait for completion | Status shows COMPLETED, Sepolia balance increases |
| **Network Switch** | 1. Connect on wrong network 2. Click "Switch Network" 3. Approve network switch | Wallet switches, form updates |
| **MAX Button** | 1. Connect wallet 2. Select native XCN on Goliath 3. Click MAX | Amount = balance - 0.01 |
| **Status Recovery** | 1. Start bridge 2. Refresh page 3. Check status | Operation appears in history, polling resumes |

---

## 14. Security Considerations

### 14.1 Input Sanitization

```typescript
// All amount inputs must be sanitized
function sanitizeAmountInput(input: string): string {
  // Remove any non-numeric characters except decimal point
  let sanitized = input.replace(/[^0-9.]/g, '');

  // Ensure only one decimal point
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('');
  }

  // Limit decimal places based on token (handled in parseAmount)
  return sanitized;
}

// All address inputs must be validated
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
```

### 14.2 XSS Prevention

- All user inputs are sanitized before display
- React's default escaping is used for all text content
- No `dangerouslySetInnerHTML` usage
- External URLs opened with `rel="noopener noreferrer"`

### 14.3 Secure RPC Handling

```typescript
// Never log sensitive data
function logTransaction(tx: TransactionResponse) {
  console.log('Transaction submitted:', {
    hash: tx.hash,
    to: tx.to,
    // DO NOT log: tx.data, private keys, etc.
  });
}

// Validate RPC responses
function validateStatusResponse(response: unknown): response is BridgeStatusResponse {
  // Use zod schema validation
  return BridgeStatusResponseSchema.safeParse(response).success;
}
```

### 14.4 Rate Limiting Awareness

```typescript
// Implement exponential backoff for API retries
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }
  throw new Error('Max retries exceeded');
};
```

---

## 15. Implementation Phases

### Phase 1: Foundation (Week 1)

**Objective:** Set up infrastructure and core state management

**Deliverables:**
1. Environment configuration with Zod validation
2. Bridge Redux slice (reducer, actions, selectors)
3. LocalStorage persistence layer
4. Type definitions for all bridge entities
5. Token and network configuration constants

**Acceptance Criteria:**
- [ ] `npm start` runs without errors
- [ ] Redux DevTools shows bridge slice
- [ ] Config validation fails gracefully on missing env vars

### Phase 2: API Integration (Week 1-2)

**Objective:** Implement backend communication layer

**Deliverables:**
1. BridgeApiClient with all endpoints
2. Chain providers for Sepolia and Goliath
3. Status polling hook
4. History fetching hook
5. Error handling and retry logic

**Acceptance Criteria:**
- [ ] Status API returns mock data correctly
- [ ] Polling starts/stops based on operation state
- [ ] Network errors handled gracefully

### Phase 3: UI Components (Week 2-3)

**Objective:** Build all bridge UI components

**Deliverables:**
1. BridgePage layout
2. NetworkSelector component
3. BridgeTokenSelector component
4. BridgeAmountInput with MAX button
5. BridgeSummary component
6. BridgeStatusStepper component
7. BridgeHistoryPanel component
8. Navigation tab activation

**Acceptance Criteria:**
- [ ] All components render without errors
- [ ] Theme (light/dark) works correctly
- [ ] Mobile responsive layout
- [ ] Accessibility audit passes

### Phase 4: Transaction Hooks (Week 3)

**Objective:** Implement transaction execution

**Deliverables:**
1. useBridgeAllowance hook
2. useBridgeApprove hook
3. useBridgeDeposit hook (Sepolia deposits)
4. useBridgeBurn hook (Goliath burns)
5. useBridgeNetworkSwitch hook

**Acceptance Criteria:**
- [ ] Approval flow works for ERC-20 tokens
- [ ] Native asset deposits work (ETH on Sepolia)
- [ ] Native asset burns work (XCN on Goliath)
- [ ] Network switching prompts wallet correctly

### Phase 5: Form Integration (Week 3-4)

**Objective:** Connect components and implement full flow

**Deliverables:**
1. useBridgeForm hook with validation
2. Confirmation modal integration
3. Status modal integration
4. Form reset on completion
5. Error state handling

**Acceptance Criteria:**
- [ ] Full Sepolia -> Goliath flow works
- [ ] Full Goliath -> Sepolia flow works
- [ ] Validation prevents invalid submissions
- [ ] Error messages display correctly

### Phase 6: Testing & Polish (Week 4)

**Objective:** Ensure quality and reliability

**Deliverables:**
1. Unit tests for reducers (90% coverage)
2. Unit tests for utilities (90% coverage)
3. Hook tests with mock providers
4. Component tests for critical paths
5. E2E test suite for happy paths
6. Performance optimization

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Coverage targets met
- [ ] No console errors in production build
- [ ] Lighthouse performance score > 80

---

## Appendix A: Contract ABIs

### BridgeSepolia ABI (Partial)

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
    "stateMutability": "payable",
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
  }
]
```

### BridgeGoliath ABI (Partial)

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
  }
]
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Origin Chain** | The blockchain from which assets are being bridged |
| **Destination Chain** | The blockchain to which assets are being bridged |
| **Deposit** | Lock assets on Sepolia (Sepolia -> Goliath direction) |
| **Burn** | Destroy wrapped assets on Goliath (Goliath -> Sepolia direction) |
| **Mint** | Create wrapped assets on Goliath after Sepolia deposit |
| **Release** | Unlock assets on Sepolia after Goliath burn |
| **Finality** | Number of block confirmations required for transaction security |
| **Atomic Units** | Smallest divisible unit of a token (e.g., wei for ETH) |
| **Human Units** | Human-readable token amount (e.g., "1.5 ETH") |
| **RPC Decimals** | Decimal places used in JSON-RPC communication (18 for XCN) |
| **EVM Decimals** | Decimal places used in EVM internal representation (8 for XCN) |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-01 | TID Architect | Initial comprehensive frontend TID |

---

**End of Document**
