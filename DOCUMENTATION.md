# CoolSwap Interface - Technical Documentation

**Application Name:** Goliath Slingshot (CoolSwap Interface)
**Version:** Based on Uniswap V2 Fork
**Target Network:** Goliath Testnet (Chain ID: 8901)
**License:** GPL-3.0-or-later

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Configuration](#configuration)
5. [Smart Contract Integration](#smart-contract-integration)
6. [Bridge Feature](#bridge-feature)
7. [State Management](#state-management)
8. [UI Components](#ui-components)
9. [User Flows](#user-flows)
10. [Blockchain Specifics](#blockchain-specifics)
11. [Deployment](#deployment)
12. [Enhancement Opportunities](#enhancement-opportunities)
13. [Troubleshooting](#troubleshooting)

---

## Overview

CoolSwap Interface (branded as "Goliath Slingshot") is a decentralized exchange (DEX) frontend built on top of the Uniswap V2 protocol. It has been customized to run on the **Goliath Testnet**, a custom EVM-compatible blockchain that uses **XCN** as its native currency (analogous to ETH on Ethereum).

### Key Features

- **Token Swapping**: Exchange tokens using automated market maker (AMM) liquidity pools
- **Liquidity Provision**: Add and remove liquidity from trading pairs
- **Pool Management**: View and manage liquidity positions
- **Wallet Integration**: MetaMask, WalletConnect, Coinbase Wallet support
- **Multi-language Support**: Internationalization with 11+ languages
- **Dark/Light Mode**: Theme toggling with persistent user preferences

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 17.0.2, TypeScript 4.9.5 |
| Styling | styled-components 5.3.0 |
| State | Redux Toolkit 1.6.0 |
| Blockchain | ethers.js 5.3.0, web3-react |
| AMM Logic | Uniswap SDK (forked) |
| Build | react-app-rewired, Webpack |
| Routing | react-router-dom 5.2.0 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          React App                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Pages   │  │Components│  │  Hooks   │  │  State (Redux)   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
│       └─────────────┴─────────────┴──────────────────┘           │
│                              │                                    │
├──────────────────────────────┼────────────────────────────────────┤
│                    ┌─────────▼─────────┐                         │
│                    │  Uniswap SDK      │                         │
│                    │  (Forked)         │                         │
│                    └─────────┬─────────┘                         │
├──────────────────────────────┼────────────────────────────────────┤
│                    ┌─────────▼─────────┐                         │
│                    │  Web3 Provider    │                         │
│                    │  (ethers.js)      │                         │
│                    └─────────┬─────────┘                         │
├──────────────────────────────┼────────────────────────────────────┤
│                    ┌─────────▼─────────┐                         │
│                    │  Goliath Testnet  │                         │
│                    │  (Chain ID: 8901) │                         │
│                    └───────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Hierarchy

The application uses a layered provider structure (`src/index.tsx`):

```
StrictMode
└── FixedGlobalStyle
    └── Web3ReactProvider (user wallet)
        └── Web3ProviderNetwork (fallback RPC)
            └── Redux Provider
                └── Updaters (background sync)
                    └── ThemeProvider
                        └── HashRouter
                            └── App
```

---

## Directory Structure

```
CoolSwap-interface/
├── public/                    # Static assets
│   ├── index.html             # HTML entry point
│   ├── favicon.svg            # Application icon
│   ├── manifest.json          # PWA manifest
│   ├── images/                # App icons (192x192, 512x512)
│   └── locales/               # i18n translation files (11 languages)
│
├── src/                       # Application source code
│   ├── index.tsx              # Entry point & providers setup
│   ├── i18n.ts                # Internationalization config
│   ├── react-app-env.d.ts     # TypeScript environment declarations
│   │
│   ├── assets/                # Static assets (images, SVGs)
│   │   ├── images/            # UI icons, wallet icons
│   │   └── svg/               # SVG assets
│   │
│   ├── components/            # Reusable UI components
│   │   ├── Header/            # Navigation header, network indicator
│   │   ├── WalletModal/       # Wallet connection modal
│   │   ├── CurrencyInputPanel/# Token amount input
│   │   ├── SearchModal/       # Token search & selection
│   │   ├── swap/              # Swap-specific components
│   │   ├── PositionCard/      # Liquidity position display
│   │   ├── Button/            # Button variants
│   │   ├── Modal/             # Base modal component
│   │   ├── Popups/            # Notification popups
│   │   ├── Settings/          # Slippage/deadline settings
│   │   └── [...]              # Many more UI components
│   │
│   ├── connectors/            # Web3 wallet connectors
│   │   ├── index.ts           # Connector exports & network config
│   │   ├── NetworkConnector.ts# Fallback RPC connector
│   │   └── Fortmatic.ts       # Fortmatic connector (disabled)
│   │
│   ├── constants/             # Application constants
│   │   ├── index.ts           # Tokens, addresses, config
│   │   ├── lists.ts           # Default token lists
│   │   ├── multicall/         # Multicall contract config
│   │   └── abis/              # Contract ABIs
│   │
│   ├── data/                  # Blockchain data fetching
│   │   ├── Reserves.ts        # Pair reserves fetching
│   │   ├── Allowances.ts      # Token allowance checks
│   │   └── TotalSupply.ts     # Token supply queries
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── index.ts           # useActiveWeb3React
│   │   ├── useSwapCallback.ts # Swap execution logic
│   │   ├── useWrapCallback.ts # XCN wrap/unwrap logic
│   │   ├── useApproveCallback.ts # Token approval
│   │   ├── useContract.ts     # Contract instantiation
│   │   ├── Trades.ts          # Trade computation
│   │   ├── Tokens.ts          # Token resolution
│   │   └── [...]              # Many utility hooks
│   │
│   ├── pages/                 # Route pages
│   │   ├── App.tsx            # Main app router
│   │   ├── AppBody.tsx        # Page wrapper component
│   │   ├── Swap/              # Token swap page
│   │   ├── Pool/              # Liquidity overview page
│   │   ├── AddLiquidity/      # Add liquidity page
│   │   ├── RemoveLiquidity/   # Remove liquidity page
│   │   └── PoolFinder/        # Manual pool finder
│   │
│   ├── state/                 # Redux state management
│   │   ├── index.ts           # Store configuration
│   │   ├── application/       # App-wide state (modals, popups)
│   │   ├── user/              # User preferences
│   │   ├── swap/              # Swap form state
│   │   ├── mint/              # Add liquidity state
│   │   ├── burn/              # Remove liquidity state
│   │   ├── transactions/      # Transaction tracking
│   │   ├── lists/             # Token lists
│   │   ├── multicall/         # Multicall batching
│   │   ├── wallet/            # Wallet balances
│   │   └── stake/             # Staking (unused)
│   │
│   ├── theme/                 # Styling system
│   │   ├── index.tsx          # Theme provider & colors
│   │   ├── styled.d.ts        # TypeScript theme types
│   │   ├── components.tsx     # Styled primitives
│   │   └── DarkModeQueryParamReader.tsx
│   │
│   └── utils/                 # Utility functions
│       ├── index.ts           # Core utilities
│       ├── prices.ts          # Price calculations
│       ├── wrappedCurrency.ts # Currency wrapping
│       ├── maxAmountSpend.ts  # Max amount calculations
│       └── [...]              # Various helpers
│
├── forks/                     # Forked dependencies
│   └── @uniswap/sdk/          # Modified Uniswap SDK
│       ├── package.json       # SDK metadata
│       └── dist/              # Compiled SDK
│
├── test/                      # Test files
├── build/                     # Production build output
├── .env                       # Environment variables
├── config-overrides.js        # Webpack config overrides
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Original readme
```

### Key Directory Responsibilities

| Directory | Responsibility |
|-----------|----------------|
| `src/pages/` | Route-level components that compose the main views |
| `src/components/` | Reusable UI building blocks |
| `src/hooks/` | Business logic and blockchain interactions |
| `src/state/` | Redux slices for application state |
| `src/constants/` | Static configuration (addresses, tokens) |
| `src/connectors/` | Wallet connection adapters |
| `src/data/` | On-chain data fetching utilities |
| `forks/@uniswap/sdk/` | **Critical**: Modified SDK with Goliath support |

---

## Configuration

### Environment Variables (.env)

```bash
# Network Configuration
REACT_APP_NETWORK_URL="https://rpc.testnet.goliath.net"
REACT_APP_CHAIN_ID="8901"

# Smart Contract Addresses
REACT_APP_ROUTER_ADDRESS="0x47e948B9583637806c4043aE54041321BD31E017"
REACT_APP_FACTORY_ADDRESS="0x698Ba06870312aEd129fC2e48dc3d002d981aB8E"
REACT_APP_MULTICALL_ADDRESS="0x407A137fcdE44E03142f5EE83c32519A3dc0f54d"

# Token Addresses
REACT_APP_USDC_ADDRESS="0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E"
REACT_APP_WXCN_ADDRESS="0xec6Cd1441201e36F7289f0B2729a97d091AcB5b7"
REACT_APP_ETH_TOKEN_ADDRESS="0xF22914De280D7B60255859bA6933831598fB5DD6"
REACT_APP_BTC_TOKEN_ADDRESS="0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10"

# Factory Init Code Hash (for pair address computation)
REACT_APP_INIT_CODE_HASH="0xcf0225ce4ff2fac952bf525ad6f4c6a01584f0c9f931dfec62de0392e548fd56"

# Block Explorer
REACT_APP_EXPLORER_URL="https://testnet.explorer.goliath.net"
```

### Hardcoded Constants (src/constants/index.ts)

```typescript
// Router addresses (may differ from .env - check for consistency)
export const FACTORY_ADDRESS = '0x698Ba06870312aEd129fC2e48dc3d002d981aB8E';
export const ROUTER_ADDRESS = '0x8707F9f249ed2f4c2eBdd4e25CE4393fbfA7C5C7';

// LP Token Configuration
export const LP_TOKEN_NAME = 'Swap-LP-Token';
export const LP_TOKEN_SYMBOL = 'SWAP-LP';

// Goliath Testnet Tokens
const GOLIATH_CHAIN_ID = 8901;
export const USDC_GOLIATH = new Token(GOLIATH_CHAIN_ID, '0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E', 6, 'USDC', 'USD Coin');
export const WXCN = new Token(GOLIATH_CHAIN_ID, '0xd319Df5FA3efb42B5fe4c5f873A7049f65428877', 18, 'WXCN', 'Wrapped Onyxcoin');
export const ETH_GOLIATH = new Token(GOLIATH_CHAIN_ID, '0xF22914De280D7B60255859bA6933831598fB5DD6', 18, 'ETH', 'Ethereum');
export const BTC_GOLIATH = new Token(GOLIATH_CHAIN_ID, '0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10', 8, 'BTC', 'Bitcoin');

// Default Settings
export const INITIAL_ALLOWED_SLIPPAGE = 50;        // 0.5% in basis points
export const DEFAULT_DEADLINE_FROM_NOW = 60 * 20;  // 20 minutes
```

### Multicall Configuration

Located in `src/constants/multicall/index.ts`:

```typescript
const MULTICALL_NETWORKS: { [chainId: number]: string } = {
  // ... other networks
  8901: '0xE1a0f8343cB72DBB0A82943343519435E618101B', // Goliath Testnet
};
```

---

## Smart Contract Integration

### Core Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **Factory** | `0x698Ba06870312aEd129fC2e48dc3d002d981aB8E` | Creates and tracks liquidity pairs |
| **Router V2** | `0x8707F9f249ed2f4c2eBdd4e25CE4393fbfA7C5C7` | Executes swaps and liquidity operations |
| **Multicall** | `0xE1a0f8343cB72DBB0A82943343519435E618101B` | Batches multiple contract calls |
| **WXCN** | `0xd319Df5FA3efb42B5fe4c5f873A7049f65428877` | Wrapped XCN (WETH equivalent) |

### Token Contracts

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E` | 6 |
| ETH | `0xF22914De280D7B60255859bA6933831598fB5DD6` | 18 |
| BTC | `0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10` | 8 |
| WXCN | `0xd319Df5FA3efb42B5fe4c5f873A7049f65428877` | 18 |

### Contract ABIs Used

Located in `src/constants/abis/`:

- `erc20.json` - Standard ERC20 interface
- `weth.json` - WETH/WXCN interface (deposit/withdraw)
- `ens-registrar.json` - ENS resolution
- `argent-wallet-detector.ts` - Argent wallet detection

External ABIs imported from:
- `@uniswap/v2-periphery/build/IUniswapV2Router02.json`
- `@uniswap/v2-core/build/IUniswapV2Pair.json`
- `@uniswap/liquidity-staker/build/StakingRewards.json`

### Key Contract Interactions

#### Swap Execution (`src/hooks/useSwapCallback.ts`)

```typescript
// Uses Router.swapCallParameters from SDK to generate:
// - methodName: swapExactETHForTokens, swapExactTokensForETH, etc.
// - args: amounts, path, recipient, deadline
// - value: native currency amount (for XCN swaps)

const swapParams = Router.swapCallParameters(trade, {
  feeOnTransfer: false,
  allowedSlippage: new Percent(JSBI.BigInt(allowedSlippage), BIPS_BASE),
  recipient,
  deadline: deadline.toNumber(),
});
```

#### Token Approval (`src/hooks/useApproveCallback.ts`)

```typescript
// Approves router to spend tokens before swapping
const tokenContract = useTokenContract(token.address);
await tokenContract.approve(ROUTER_ADDRESS, MaxUint256);
```

#### Wrap/Unwrap XCN (`src/hooks/useWrapCallback.ts`)

```typescript
// Wrap: XCN → WXCN
await wethContract.deposit({ value: hexValue });

// Unwrap: WXCN → XCN
await wethContract.withdraw(hexValue);
```

---

## Bridge Feature

The Bridge feature enables cross-chain transfers between **Sepolia (Ethereum testnet)** and **Goliath Testnet**. It allows users to bridge ETH from Sepolia to Goliath (as wrapped ETH token) and vice versa.

### Bridge Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│                          (CoolSwap Interface)                                │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ BridgeForm   │    │ Status Modal │    │ Bridge API Client            │   │
│  │ - Amount     │    │ - Progress   │    │ - Poll status                │   │
│  │ - Direction  │    │ - Confirms   │    │ - Fetch history              │   │
│  │ - Approve    │    │ - TX links   │    │ - Health check               │   │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┬───────────────┘   │
│         │                   │                           │                    │
└─────────┼───────────────────┼───────────────────────────┼────────────────────┘
          │                   │                           │
          ▼                   ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BLOCKCHAIN LAYER                                     │
│                                                                              │
│  ┌─────────────────────────┐         ┌─────────────────────────────────┐    │
│  │      SEPOLIA            │         │         GOLIATH                 │    │
│  │  (Chain ID: 11155111)   │         │     (Chain ID: 8901)            │    │
│  │                         │         │                                 │    │
│  │  BridgeSepolia Contract │◄───────►│  BridgeGoliath Contract         │    │
│  │  - depositNative()      │         │  - mint()                       │    │
│  │  - deposit()            │         │  - burn()                       │    │
│  │  - releaseNative()      │         │                                 │    │
│  │  - release()            │         │  ETH Token (ERC-20)             │    │
│  └─────────────────────────┘         └─────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
          ▲                                               ▲
          │              BRIDGE BACKEND                   │
          │         (goliath-bridge-backend)              │
          │                                               │
┌─────────┴───────────────────────────────────────────────┴────────────────────┐
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Event        │  │ Finality     │  │ Transaction  │  │ REST API         │ │
│  │ Watcher      │  │ Tracker      │  │ Submitter    │  │ Server           │ │
│  │              │  │              │  │ (Relayer)    │  │                  │ │
│  │ Polls for    │  │ Waits for    │  │              │  │ /api/v1/bridge/  │ │
│  │ Deposit/     │  │ required     │  │ Mints on     │  │   status         │ │
│  │ Withdraw     │  │ block        │  │ Goliath or   │  │   history        │ │
│  │ events       │  │ confirmations│  │ releases on  │  │ /api/v1/health   │ │
│  │              │  │              │  │ Sepolia      │  │                  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                 │                    │           │
│         └─────────────────┴─────────────────┴────────────────────┘           │
│                                   │                                          │
│                          ┌────────▼────────┐                                 │
│                          │   PostgreSQL    │                                 │
│                          │   Database      │                                 │
│                          └─────────────────┘                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Bridge Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| **BridgeSepolia** | Sepolia (11155111) | `0xA9FD64B5095d626F5A3A67e6DB7FB766345F8092` |
| **BridgeGoliath** | Goliath (8901) | `0xB4139A33Ae5DfaB4fE0339b20C254b00179a951d` |
| **ETH Token** | Goliath (8901) | `0x9d318b851a6AF920D467bC5dC9882b5DFD36D65e` |

### Bridge Backend

The bridge backend is located at: **`~/goliath/goliath-bridge-backend`**

It is a Node.js/TypeScript application using:
- **Fastify** - REST API server
- **Prisma** - Database ORM
- **PostgreSQL** - Persistent storage
- **ethers.js** - Blockchain interactions

### Bridge Process Flow

#### Sepolia → Goliath (Deposit Flow)

```
1. USER: Initiates bridge on UI
   ├── Approves ETH spending (if ERC-20)
   └── Calls BridgeSepolia.depositNative() with ETH value

2. BLOCKCHAIN: Transaction mined on Sepolia
   └── Deposit event emitted with depositId

3. BACKEND - Event Watcher (polls every 5s):
   └── Detects Deposit event
   └── Creates operation record in database (status: PENDING_ORIGIN_TX)

4. BACKEND - Finality Tracker:
   └── Monitors block confirmations
   └── Updates status: CONFIRMING
   └── Required: 10 confirmations on Sepolia (~2.5 minutes)
   └── Updates status: AWAITING_RELAY when finalized

5. BACKEND - Transaction Submitter (Relayer):
   └── Picks up finalized operations
   └── Calls BridgeGoliath.mint(token, amount, recipient)
   └── Updates status: PROCESSING_DESTINATION

6. BLOCKCHAIN: Mint transaction confirmed on Goliath
   └── User receives wrapped ETH tokens

7. BACKEND: Updates status: COMPLETED
   └── Records destination transaction hash
```

#### Goliath → Sepolia (Withdraw Flow)

```
1. USER: Initiates bridge on UI
   ├── Approves ETH token to bridge contract
   └── Calls BridgeGoliath.burn(token, amount, recipient)

2. BLOCKCHAIN: Transaction mined on Goliath
   └── Withdraw event emitted with withdrawId

3. BACKEND - Event Watcher:
   └── Detects Withdraw event
   └── Creates operation record (status: PENDING_ORIGIN_TX)

4. BACKEND - Finality Tracker:
   └── Required: 6 confirmations on Goliath (~12 seconds)
   └── Updates status: AWAITING_RELAY when finalized

5. BACKEND - Transaction Submitter (Relayer):
   └── Calls BridgeSepolia.releaseNative(amount, recipient)
   └── Updates status: PROCESSING_DESTINATION

6. BLOCKCHAIN: Release transaction confirmed on Sepolia
   └── User receives native ETH

7. BACKEND: Updates status: COMPLETED
```

### Bridge API Endpoints

Base URL: `https://testnet.mirrornode.goliath.net/bridge/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/bridge/status` | GET | Get operation status by `originTxHash`, `depositId`, or `withdrawId` |
| `/bridge/history` | GET | Get bridge history for an address |
| `/health` | GET | Check backend health and chain connectivity |

**Note:** The proxy at `/bridge/*` routes to the backend, so full paths are:
- `https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/status`
- `https://testnet.mirrornode.goliath.net/bridge/api/v1/bridge/history`
- `https://testnet.mirrornode.goliath.net/bridge/api/v1/health`

### Backend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **Event Watcher** | `src/worker/eventWatcher.ts` | Polls both chains for Deposit/Withdraw events |
| **Finality Tracker** | `src/worker/finalityTracker.ts` | Monitors block confirmations until finality |
| **Transaction Submitter** | `src/worker/transactionSubmitter.ts` | Relayer that executes cross-chain transactions |
| **API Server** | `src/api/server.ts` | REST API for status queries |
| **Bridge Routes** | `src/api/routes/bridge.ts` | Status and history endpoints |
| **Health Routes** | `src/api/routes/health.ts` | Health check endpoint |

### Confirmation Requirements

| Chain | Required Confirmations | Estimated Time |
|-------|----------------------|----------------|
| Sepolia | 10 blocks | ~2.5 minutes |
| Goliath | 6 blocks | ~12 seconds |

### Bridge Status States

| Status | Description |
|--------|-------------|
| `PENDING_ORIGIN_TX` | User submitted transaction, waiting for mining |
| `CONFIRMING` | Origin tx mined, waiting for block confirmations |
| `AWAITING_RELAY` | Origin finalized, waiting for relayer to process |
| `PROCESSING_DESTINATION` | Relayer submitted destination transaction |
| `COMPLETED` | Destination tx confirmed, bridge complete |
| `FAILED` | Permanent failure (reverted, invalid, etc.) |
| `EXPIRED` | Timeout exceeded (60+ minutes) |
| `DELAYED` | Taking longer than expected (10+ minutes) |

### Frontend Bridge Configuration

Located in `src/config/bridgeConfig.ts`:

```typescript
export const bridgeConfig = {
  sepolia: {
    chainId: 11155111,
    bridgeAddress: process.env.REACT_APP_BRIDGE_SEPOLIA_ADDRESS,
  },
  goliath: {
    chainId: 8901,
    bridgeAddress: process.env.REACT_APP_BRIDGE_GOLIATH_ADDRESS,
  },
  tokens: {
    goliath: {
      eth: process.env.REACT_APP_ETH_TOKEN_ADDRESS,  // Wrapped ETH on Goliath
    },
  },
  statusApiBaseUrl: process.env.REACT_APP_BRIDGE_STATUS_API_URL,
};
```

### Bridge Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useBridgeForm` | `src/hooks/bridge/useBridgeForm.ts` | Form state and validation |
| `useBridgeDeposit` | `src/hooks/bridge/useBridgeDeposit.ts` | Sepolia → Goliath deposits |
| `useBridgeBurn` | `src/hooks/bridge/useBridgeBurn.ts` | Goliath → Sepolia withdrawals |
| `useBridgeApprove` | `src/hooks/bridge/useBridgeApprove.ts` | Token approval for bridge |
| `useBridgeStatusPolling` | `src/hooks/bridge/useBridgeStatusPolling.ts` | Polls API for status updates |
| `useBridgeAllowance` | `src/hooks/bridge/useBridgeAllowance.ts` | Checks token allowance |

---

## State Management

The application uses **Redux Toolkit** with persistent local storage for user preferences.

### Store Configuration (`src/state/index.ts`)

```typescript
const store = configureStore({
  reducer: {
    application,   // Modals, popups, block number
    user,          // Settings, token preferences
    transactions,  // Pending/confirmed transactions
    swap,          // Swap form state
    mint,          // Add liquidity form
    burn,          // Remove liquidity form
    multicall,     // Batched call results
    lists,         // Token lists
  },
  middleware: [...getDefaultMiddleware(), save({ states: PERSISTED_KEYS })],
  preloadedState: load({ states: PERSISTED_KEYS }),
});
```

### State Slices

#### Application State (`src/state/application/`)

| State | Type | Purpose |
|-------|------|---------|
| `blockNumber` | `{ [chainId]: number }` | Current block per chain |
| `openModal` | `ApplicationModal \| null` | Currently open modal |
| `popupList` | `PopupContent[]` | Active popup notifications |

#### User State (`src/state/user/`)

| State | Type | Purpose |
|-------|------|---------|
| `userDarkMode` | `boolean \| null` | Theme preference |
| `userSlippageTolerance` | `number` | Slippage in bips (default: 50) |
| `userDeadline` | `number` | Transaction deadline in seconds |
| `userExpertMode` | `boolean` | Expert mode enabled |
| `userSingleHopOnly` | `boolean` | Disable multi-hop routing |
| `tokens` | `{ [chainId]: { [address]: Token } }` | User-added tokens |

#### Swap State (`src/state/swap/`)

| State | Type | Purpose |
|-------|------|---------|
| `independentField` | `Field.INPUT \| Field.OUTPUT` | Which field user is typing in |
| `typedValue` | `string` | The typed amount |
| `recipient` | `string \| null` | Optional different recipient |
| `[Field.INPUT]` | `{ currencyId: string }` | Input token |
| `[Field.OUTPUT]` | `{ currencyId: string }` | Output token |

#### Transactions State (`src/state/transactions/`)

Tracks pending and confirmed transactions with summaries for UI feedback.

### Background Updaters

Located in `src/state/*/updater.tsx`:

| Updater | Responsibility |
|---------|----------------|
| `ApplicationUpdater` | Polls for new block numbers |
| `ListsUpdater` | Fetches and updates token lists |
| `MulticallUpdater` | Batches and executes contract calls |
| `TransactionUpdater` | Monitors pending transaction status |
| `UserUpdater` | Syncs user preferences |

---

## UI Components

### Core Component Hierarchy

```
App
├── Header
│   ├── Logo
│   ├── Navigation Links (Swap, Pool, Bridge*, Yield*)
│   ├── Network Card
│   ├── Account Element (balance + Web3Status)
│   └── Dark Mode Toggle
│
├── Popups (notifications)
├── Polling (block number indicator)
│
└── Page Content (via Router)
    ├── Swap Page
    ├── Pool Page
    ├── AddLiquidity Page
    ├── RemoveLiquidity Page
    └── PoolFinder Page
```

*Bridge and Yield are currently disabled/placeholder features

### Key Components

#### Header (`src/components/Header/index.tsx`)

- Displays network name (e.g., "Goliath Testnet")
- Shows user's XCN balance when connected
- Contains navigation between Swap/Pool
- Dark/Light mode toggle (Moon/Sun icons)
- Responsive design with mobile bottom navigation

#### CurrencyInputPanel (`src/components/CurrencyInputPanel/index.tsx`)

The primary input component for token amounts:

- Numerical input field with decimal validation
- Token selector button (opens CurrencySearchModal)
- Balance display with clickable MAX button
- Handles XCN symbol display on Goliath network

#### WalletModal (`src/components/WalletModal/index.tsx`)

Wallet connection interface:

- Supported wallets:
  - MetaMask (injected)
  - WalletConnect
  - Coinbase Wallet (WalletLink)
- Error handling for wrong network (prompts Goliath Testnet)
- Account details view when connected

#### ConfirmSwapModal (`src/components/swap/ConfirmSwapModal.tsx`)

Transaction confirmation dialog:

- Price summary
- Minimum received amount
- Price impact warning
- Slippage tolerance display
- Transaction status tracking

#### Settings (`src/components/Settings/index.tsx`)

User preference configuration:

- Slippage tolerance (0.1%, 0.5%, 1%, or custom)
- Transaction deadline
- Expert mode toggle
- Multi-hop toggle

### Styled Component Patterns

The application uses styled-components with a consistent theme system:

```typescript
// Theme access pattern
const StyledComponent = styled.div`
  background-color: ${({ theme }) => theme.bg1};
  color: ${({ theme }) => theme.text1};
  ${({ theme }) => theme.mediaWidth.upToSmall`
    // Mobile styles
  `}
`;
```

### Theme Colors

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `bg1` | `#fafafa` | `#1d1f24` |
| `bg2` | `#ededed` | `#27292e` |
| `text1` | `#000000` | `#FFFFFF` |
| `primary1` | `#2d2d2d` | `#2d2d2d` |

---

## User Flows

### 1. Wallet Connection Flow

```
User clicks "Connect Wallet"
    ↓
WalletModal opens
    ↓
User selects wallet type (MetaMask, WalletConnect, etc.)
    ↓
Wallet prompts for connection
    ↓
If wrong network → Show "Wrong Network" error with Goliath Testnet prompt
    ↓
If correct network → Show connected account, close modal
```

### 2. Token Swap Flow

```
1. User enters amount in "From" field
    ↓
2. System fetches pair reserves via Multicall
    ↓
3. Trade route computed (checks WXCN pairs for XCN swaps)
    ↓
4. Output amount displayed with price impact
    ↓
5. If token needs approval → Show "Approve [TOKEN]" button
    ↓
6. User approves token spending
    ↓
7. User clicks "Swap"
    ↓
8. ConfirmSwapModal shows trade details
    ↓
9. User confirms → Transaction sent to router
    ↓
10. Transaction tracked in pending state
    ↓
11. Success/failure popup notification
```

### 3. XCN Wrap/Unwrap Flow

When swapping between XCN (native) and WXCN (wrapped):

```
User selects XCN → WXCN (or reverse)
    ↓
System detects wrap/unwrap scenario
    ↓
"Wrap" or "Unwrap" button displayed instead of "Swap"
    ↓
User clicks wrap/unwrap
    ↓
WXCN contract deposit() or withdraw() called
    ↓
Transaction confirmed
```

### 4. Add Liquidity Flow

```
1. User navigates to Pool → Add Liquidity
    ↓
2. Selects two tokens
    ↓
3. Enters amounts (second auto-calculated based on pool ratio)
    ↓
4. Approves both tokens if needed
    ↓
5. Clicks "Supply"
    ↓
6. Confirms in modal
    ↓
7. Router.addLiquidity() or addLiquidityETH() called
    ↓
8. LP tokens received
```

### 5. Remove Liquidity Flow

```
1. User navigates to Pool page
    ↓
2. Selects existing position
    ↓
3. Clicks "Remove"
    ↓
4. Selects percentage to remove (25%, 50%, 75%, 100% or slider)
    ↓
5. Approves LP token or signs permit
    ↓
6. Confirms removal
    ↓
7. Router.removeLiquidity() called
    ↓
8. Underlying tokens returned
```

---

## Blockchain Specifics

### Goliath Testnet Configuration

| Property | Value |
|----------|-------|
| Chain ID | 8901 |
| Native Currency | XCN (Onyxcoin) |
| Currency Decimals | 18 (same as ETH) |
| RPC URL | `https://rpc.testnet.goliath.net` |
| Block Explorer | `https://testnet.explorer.goliath.net` |

### XCN vs ETH Naming

Throughout the codebase, the Uniswap SDK's `ETHER` constant represents XCN on Goliath:

```typescript
// The native currency is displayed as "XCN" instead of "ETH"
{currency === ETHER && isGoliath ? 'XCN' : currency?.symbol}
```

### WXCN (Wrapped XCN)

Analogous to WETH on Ethereum:

- Address: `0xd319Df5FA3efb42B5fe4c5f873A7049f65428877`
- Decimals: 18
- Required for liquidity pairs involving native XCN

### Forked Uniswap SDK

The SDK in `forks/@uniswap/sdk/` has been modified to:

1. Add Goliath Testnet as `ChainId.GOLIATH_TESTNET` (8901)
2. Configure WETH mapping for Goliath to point to WXCN
3. Set the correct factory address and init code hash

**Important:** After `npm install`, a postinstall script copies the forked SDK:
```json
"postinstall": "rm -rf ./node_modules/@uniswap/sdk; cp -r ./forks/@uniswap/sdk ./node_modules/@uniswap/sdk"
```

### Router Considerations

The router has been updated to handle XCN decimal scaling:

```typescript
// Comment from constants/index.ts:
// Updated router with WXCN decimal scaling fixes for XCN ↔ Token swaps
// v2: Fixed safeTransferETH to use native tinyXCN (8 dec) instead of WXCN (18 dec)
```

This indicates potential decimal handling issues were resolved in the router contract.

---

## Deployment

### Development

```bash
# Install dependencies
npm install

# Start development server (accessible on 0.0.0.0)
npm start
```

### Production Build

```bash
# Create optimized production build
npm run build

# Deploy to GitHub Pages
npm run deploy
```

### Build Output

The `build/` directory contains the production-ready static files that can be hosted on any static file server.

### Webpack Configuration

The `config-overrides.js` file provides necessary polyfills for Node.js modules in the browser:

```javascript
fallback: {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  assert: require.resolve('assert'),
  http: require.resolve('stream-http'),
  https: require.resolve('https-browserify'),
  os: require.resolve('os-browserify'),
  url: require.resolve('url'),
  zlib: require.resolve('browserify-zlib'),
  util: require.resolve('util'),
}
```

### Hosting Considerations

1. **Hash Router**: The app uses `HashRouter` for client-side routing, making it compatible with static hosting without server-side configuration
2. **RPC Dependency**: The app requires access to the Goliath RPC endpoint
3. **CORS**: Ensure RPC endpoints allow cross-origin requests

---

## Enhancement Opportunities

### Immediate Improvements

1. **Remove Debug Console Logs**
   - Multiple `console.log('DEBUG:...')` statements throughout the codebase should be removed or replaced with a proper logging utility

2. **Environment Variable Consistency**
   - Router address differs between `.env` and hardcoded constants
   - Consolidate to use environment variables consistently

3. **Enable Disabled Features**
   - Bridge functionality (currently disabled NavLink)
   - Yield/Staking functionality (currently disabled NavLink)
   - Fortmatic and Portis wallet connectors (commented out)

4. **Error Handling**
   - Add more user-friendly error messages for common failures
   - Implement retry logic for RPC failures

### Feature Additions

1. **Token Import by Address**
   - Allow users to paste contract addresses to add custom tokens

2. **Price Charts**
   - Integrate price history charts for token pairs

3. **Transaction History**
   - Persist and display user's transaction history

4. **Limit Orders**
   - Implement limit order functionality via a separate contract

5. **Mobile Optimization**
   - Further optimize mobile experience
   - Add PWA install prompts

### Technical Debt

1. **Update Dependencies**
   - Several dependencies are outdated (React 17 → 18)
   - TypeScript could be updated to latest

2. **Testing**
   - Expand test coverage (currently minimal)
   - Add E2E tests with Cypress

3. **Type Safety**
   - Replace `any` types with proper interfaces
   - Add stricter TypeScript configuration

4. **SDK Maintenance**
   - Document all SDK modifications clearly
   - Consider publishing as a separate package

---

## Troubleshooting

### Common Issues

#### "Wrong Network" Error

**Cause:** User's wallet is connected to a different network than Goliath Testnet.

**Solution:** Add Goliath Testnet to wallet:
- Network Name: Goliath Testnet
- RPC URL: `https://rpc.testnet.goliath.net`
- Chain ID: 8901
- Currency Symbol: XCN
- Explorer: `https://testnet.explorer.goliath.net`

#### Swap Fails with "INSUFFICIENT_OUTPUT_AMOUNT"

**Cause:** Price moved significantly between quote and execution.

**Solution:** Increase slippage tolerance in Settings (try 1-2%).

#### Token Not Found

**Cause:** Token not in default list and not added by user.

**Solution:**
1. Navigate to token selection modal
2. Paste the token contract address
3. Import the token

#### "No Liquidity" Error

**Cause:** No liquidity pool exists for the selected pair.

**Solution:**
1. Try routing through WXCN (add intermediate hop)
2. Create a new liquidity pool via Add Liquidity

#### Transaction Stuck Pending

**Cause:** Low gas price or network congestion.

**Solution:**
1. Wait for network confirmation
2. Speed up transaction in wallet if available
3. Cancel and retry with higher gas

### Debug Mode

Enable detailed logging by checking browser console for `DEBUG:` prefixed messages. These provide insight into:

- Trade computations
- Pair reserves
- Swap parameters
- Gas estimations

### Support Contacts

- Block Explorer: https://testnet.explorer.goliath.net
- RPC Health: Check RPC endpoint availability
- Contract Verification: Verify contracts on block explorer

---

## Appendix

### A. Complete Route Map

| Route | Component | Description |
|-------|-----------|-------------|
| `/swap` | `Swap` | Token swap interface |
| `/pool` | `Pool` | Liquidity positions overview |
| `/find` | `PoolFinder` | Manual pool discovery |
| `/add` | `AddLiquidity` | Add liquidity to pool |
| `/add/:currencyIdA` | `AddLiquidity` | Add liquidity with token A |
| `/add/:currencyIdA/:currencyIdB` | `AddLiquidity` | Add liquidity to specific pair |
| `/create` | `AddLiquidity` | Create new pool |
| `/remove/:currencyIdA/:currencyIdB` | `RemoveLiquidity` | Remove liquidity |
| `/claim` | Redirect | UNI claim (redirects to swap) |
| `*` | Redirect | All others redirect to `/swap` |

### B. Supported Wallets

| Wallet | Status | Mobile |
|--------|--------|--------|
| MetaMask | Active | No |
| WalletConnect | Active | Yes |
| Coinbase Wallet | Active | No |
| Fortmatic | Disabled | Yes |
| Portis | Disabled | Yes |

### C. Supported Languages

Located in `public/locales/`:

- English (en)
- German (de)
- Spanish AR (es-AR)
- Spanish US (es-US)
- Italian (it-IT)
- Hebrew (iw)
- Romanian (ro)
- Russian (ru)
- Vietnamese (vi)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)

---

*Document generated for CoolSwap Interface maintenance and support purposes.*
*Last updated: December 2025*
