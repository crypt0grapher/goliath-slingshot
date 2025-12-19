# Technical Implementation Document (TID)
# Goliath Slingshot Cross-Chain Bridge - Backend

| Metadata | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Status** | Implementation Ready |
| **Last Updated** | 2025-12-01 |
| **Repository** | goliath-bridge-backend (new repo) |
| **Runtime** | Node.js 20+ / TypeScript |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Environment Configuration](#5-environment-configuration)
6. [Database Schema](#6-database-schema)
7. [Amount and Decimal Handling](#7-amount-and-decimal-handling)
8. [Chain Clients and Providers](#8-chain-clients-and-providers)
9. [Event Watchers](#9-event-watchers)
10. [Relayer Logic](#10-relayer-logic)
11. [ETA Calculation Model](#11-eta-calculation-model)
12. [HTTP API Design](#12-http-api-design)
13. [Same-Wallet Semantics](#13-same-wallet-semantics)
14. [Linux Deployment](#14-linux-deployment)
15. [Security and Validation](#15-security-and-validation)
16. [Testing Strategy](#16-testing-strategy)
17. [Monitoring and Alerting](#17-monitoring-and-alerting)
18. [Implementation Phases](#18-implementation-phases)

---

## 1. Executive Summary

### 1.1 Purpose

This document provides a complete, implementation-ready specification for the backend service of the Goliath Slingshot Cross-Chain Bridge. The backend:

1. **Monitors bridge events** on both Ethereum Sepolia and Goliath Testnet
2. **Tracks operation status** with confirmation counts and ETA calculations
3. **Exposes REST APIs** for frontend status polling and history retrieval
4. **Executes relayer transactions** to complete bridge operations
5. **Provides health/metrics** endpoints for infrastructure monitoring

### 1.2 Scope

- **v1.0: USDC and ETH bridging** between Sepolia and Goliath
- Backend services deployed on Linux with systemd
- PostgreSQL database for persistence
- Optional Redis for job queue (recommended for production)

### 1.3 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Fastify for HTTP** | Better performance than Express; built-in validation with schemas |
| **Prisma ORM** | Type-safe database access; excellent TypeScript integration |
| **ethers@6.x** | Latest stable version with better BigInt support |
| **Separate API and Worker** | Independent scaling; fault isolation |
| **PostgreSQL** | Reliable, ACID-compliant; good for financial data |

### 1.4 Critical Constraints

1. **USDC and ETH in v1.0**:
   - **USDC**:
     - Sepolia: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Circle's official test USDC)
     - Goliath: `0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E`
     - Both use 6 decimals
   - **ETH**:
     - Sepolia: **Native asset** (no contract address)
     - Goliath: `0xF22914De280D7B60255859bA6933831598fB5DD6` (ERC-20 wrapped ETH)
     - Both use 18 decimals

2. **Native Asset Handling**: ETH is native on Sepolia
   - Deposit uses `msg.value` (payable function)
   - Release sends native ETH to recipient
   - Event parsing must handle native ETH differently

3. **Finality Requirements**:
   - Sepolia: 12 blocks (~144 seconds)
   - Goliath: 6 blocks (~12 seconds)

4. **Same-Wallet-Only**: sender must equal recipient in v1.0

---

## 2. High-Level Architecture

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    (CoolSwap-interface)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BRIDGE-API SERVICE                          │
│  - GET /api/v1/bridge/status                                    │
│  - GET /api/v1/bridge/history                                   │
│  - GET /api/v1/health                                           │
│  - GET /metrics                                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                                │
│                    (bridge_operations)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BRIDGE-RELAYER SERVICE                        │
│  - Event Watcher (Sepolia Deposits, Goliath Withdraws)          │
│  - Finality Tracker                                             │
│  - Transaction Submitter (mint/release)                         │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
                ▼                                 ▼
┌───────────────────────────┐     ┌───────────────────────────────┐
│     Ethereum Sepolia      │     │       Goliath Testnet         │
│     (Chain 11155111)      │     │        (Chain 8901)           │
│   ┌───────────────────┐   │     │   ┌───────────────────────┐   │
│   │  BridgeSepolia    │   │     │   │    BridgeGoliath      │   │
│   │  - deposit()      │   │     │   │    - burn()           │   │
│   │  - release()      │   │     │   │    - mint()           │   │
│   └───────────────────┘   │     │   └───────────────────────┘   │
└───────────────────────────┘     └───────────────────────────────┘
```

### 2.2 Process Model

| Process | Role | Scaling |
|---------|------|---------|
| `bridge-api` | HTTP API server, stateless | Horizontal (multiple instances) |
| `bridge-relayer` | Event watcher + tx submitter | Single active (leader election for HA) |

---

## 3. Tech Stack

### 3.1 Runtime and Language

```json
{
  "node": ">=20.0.0",
  "typescript": "^5.3.0"
}
```

### 3.2 Core Dependencies

```json
{
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.5.0",
    "@fastify/helmet": "^11.1.0",
    "prisma": "^5.7.0",
    "@prisma/client": "^5.7.0",
    "ethers": "^6.9.0",
    "zod": "^3.22.4",
    "pino": "^8.17.0",
    "prom-client": "^15.1.0",
    "dotenv": "^16.3.1",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "vitest": "^1.1.0",
    "@vitest/coverage-v8": "^1.1.0",
    "prisma": "^5.7.0"
  }
}
```

### 3.3 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 4. Repository Structure

```
goliath-bridge-backend/
├── src/
│   ├── api/
│   │   ├── server.ts              # Fastify server entry point
│   │   ├── routes/
│   │   │   ├── bridge.ts          # /bridge/status, /bridge/history
│   │   │   ├── health.ts          # /health endpoint
│   │   │   └── metrics.ts         # /metrics endpoint
│   │   ├── schemas/
│   │   │   ├── bridge.ts          # Zod schemas for bridge endpoints
│   │   │   └── common.ts          # Shared schemas
│   │   └── middleware/
│   │       ├── errorHandler.ts    # Global error handler
│   │       └── requestLogger.ts   # Request logging
│   │
│   ├── worker/
│   │   ├── relayer.ts             # Relayer entry point
│   │   ├── eventWatcher.ts        # Chain event subscription
│   │   ├── finalityTracker.ts     # Confirmation tracking
│   │   ├── transactionSubmitter.ts # Mint/release tx submission
│   │   └── etaCalculator.ts       # ETA computation
│   │
│   ├── db/
│   │   ├── prisma/
│   │   │   └── schema.prisma      # Database schema
│   │   ├── client.ts              # Prisma client singleton
│   │   └── operations.ts          # Operation CRUD helpers
│   │
│   ├── chains/
│   │   ├── providers.ts           # RPC providers for both chains
│   │   ├── contracts.ts           # Contract instances
│   │   └── abis/
│   │       ├── BridgeSepolia.json
│   │       └── BridgeGoliath.json
│   │
│   ├── config/
│   │   ├── index.ts               # Main config loader
│   │   ├── schema.ts              # Zod config validation
│   │   └── tokens.ts              # Token configuration
│   │
│   ├── types/
│   │   ├── bridge.ts              # Bridge operation types
│   │   ├── api.ts                 # API response types
│   │   └── events.ts              # Contract event types
│   │
│   └── utils/
│       ├── logger.ts              # Pino logger setup
│       ├── amounts.ts             # Amount conversion utilities
│       └── retry.ts               # Retry with backoff helper
│
├── prisma/
│   ├── schema.prisma              # Symlink or copy
│   └── migrations/                # Database migrations
│
├── scripts/
│   ├── migrate.sh                 # Run migrations
│   └── seed.ts                    # Seed test data
│
├── systemd/
│   ├── bridge-api.service         # API systemd unit
│   └── bridge-relayer.service     # Relayer systemd unit
│
├── .env.example                   # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Environment Configuration

### 5.1 Environment Variables

**File: `.env.example`**

```bash
# ===========================================
# GENERAL
# ===========================================
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

# ===========================================
# DATABASE
# ===========================================
DATABASE_URL=postgresql://bridge_user:password@localhost:5432/bridge_db

# ===========================================
# REDIS (Optional - for job queue)
# ===========================================
REDIS_URL=redis://localhost:6379

# ===========================================
# CHAIN RPC ENDPOINTS
# ===========================================
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt
GOLIATH_RPC_URL=https://testnet-rpc.goliath.net

# ===========================================
# CHAIN IDS
# ===========================================
SEPOLIA_CHAIN_ID=11155111
GOLIATH_CHAIN_ID=8901

# ===========================================
# BRIDGE CONTRACTS
# ===========================================
BRIDGE_SEPOLIA_ADDRESS=0x0000000000000000000000000000000000000000
BRIDGE_GOLIATH_ADDRESS=0x0000000000000000000000000000000000000000

# ===========================================
# TOKEN ADDRESSES (v1.0: USDC + ETH)
# ===========================================
SEPOLIA_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
GOLIATH_USDC_ADDRESS=0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E
# ETH is native on Sepolia (no address needed)
GOLIATH_ETH_ADDRESS=0xF22914De280D7B60255859bA6933831598fB5DD6

# ===========================================
# FINALITY CONFIGURATION
# ===========================================
SEPOLIA_FINALITY_BLOCKS=12
GOLIATH_FINALITY_BLOCKS=6

# ===========================================
# ETA CONFIGURATION (seconds)
# ===========================================
ETA_SEPOLIA_FINALITY_SEC=144
ETA_GOLIATH_FINALITY_SEC=12
ETA_RELAYER_BASE_SEC=30
ETA_MARGIN_SEC=60

# ===========================================
# RELAYER CONFIGURATION
# ===========================================
RELAYER_PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RELAYER_MAX_GAS_GWEI=50
RELAYER_MAX_RETRIES=3
RELAYER_RETRY_DELAY_MS=30000

# ===========================================
# SECURITY / CORS
# ===========================================
CORS_ALLOWED_ORIGINS=https://slingshot.goliath.net,http://localhost:3000

# ===========================================
# POLLING INTERVALS (ms)
# ===========================================
EVENT_POLL_INTERVAL_MS=5000
FINALITY_CHECK_INTERVAL_MS=5000
```

### 5.2 Typed Configuration Loader

**File: `src/config/index.ts`**

```typescript
import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']),
  port: z.number().min(1).max(65535),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),

  database: z.object({
    url: z.string().url(),
  }),

  redis: z.object({
    url: z.string().url().optional(),
  }),

  chains: z.object({
    sepolia: z.object({
      chainId: z.literal(11155111),
      rpcUrl: z.string().url(),
      bridgeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      finalityBlocks: z.number().min(1),
    }),
    goliath: z.object({
      chainId: z.literal(8901),
      rpcUrl: z.string().url(),
      bridgeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      finalityBlocks: z.number().min(1),
    }),
  }),

  tokens: z.object({
    usdc: z.object({
      symbol: z.literal('USDC'),
      decimals: z.literal(6),
      sepolia: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      goliath: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    }),
    eth: z.object({
      symbol: z.literal('ETH'),
      decimals: z.literal(18),
      sepolia: z.null(), // Native asset on Sepolia
      goliath: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    }),
  }),

  eta: z.object({
    sepoliaFinalitySec: z.number(),
    goliathFinalitySec: z.number(),
    relayerBaseSec: z.number(),
    marginSec: z.number(),
  }),

  relayer: z.object({
    privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    maxGasGwei: z.number().min(1),
    maxRetries: z.number().min(1),
    retryDelayMs: z.number().min(1000),
  }),

  cors: z.object({
    allowedOrigins: z.array(z.string()),
  }),

  polling: z.object({
    eventIntervalMs: z.number().min(1000),
    finalityIntervalMs: z.number().min(1000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const rawConfig = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '8080', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',

    database: {
      url: process.env.DATABASE_URL!,
    },

    redis: {
      url: process.env.REDIS_URL,
    },

    chains: {
      sepolia: {
        chainId: 11155111 as const,
        rpcUrl: process.env.SEPOLIA_RPC_URL!,
        bridgeAddress: process.env.BRIDGE_SEPOLIA_ADDRESS!,
        finalityBlocks: parseInt(process.env.SEPOLIA_FINALITY_BLOCKS ?? '12', 10),
      },
      goliath: {
        chainId: 8901 as const,
        rpcUrl: process.env.GOLIATH_RPC_URL!,
        bridgeAddress: process.env.BRIDGE_GOLIATH_ADDRESS!,
        finalityBlocks: parseInt(process.env.GOLIATH_FINALITY_BLOCKS ?? '6', 10),
      },
    },

    tokens: {
      usdc: {
        symbol: 'USDC' as const,
        decimals: 6 as const,
        sepolia: process.env.SEPOLIA_USDC_ADDRESS ?? '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        goliath: process.env.GOLIATH_USDC_ADDRESS ?? '0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E',
      },
      eth: {
        symbol: 'ETH' as const,
        decimals: 18 as const,
        sepolia: null, // Native asset on Sepolia
        goliath: process.env.GOLIATH_ETH_ADDRESS ?? '0xF22914De280D7B60255859bA6933831598fB5DD6',
      },
    },

    eta: {
      sepoliaFinalitySec: parseInt(process.env.ETA_SEPOLIA_FINALITY_SEC ?? '144', 10),
      goliathFinalitySec: parseInt(process.env.ETA_GOLIATH_FINALITY_SEC ?? '12', 10),
      relayerBaseSec: parseInt(process.env.ETA_RELAYER_BASE_SEC ?? '30', 10),
      marginSec: parseInt(process.env.ETA_MARGIN_SEC ?? '60', 10),
    },

    relayer: {
      privateKey: process.env.RELAYER_PRIVATE_KEY!,
      address: process.env.RELAYER_ADDRESS!,
      maxGasGwei: parseInt(process.env.RELAYER_MAX_GAS_GWEI ?? '50', 10),
      maxRetries: parseInt(process.env.RELAYER_MAX_RETRIES ?? '3', 10),
      retryDelayMs: parseInt(process.env.RELAYER_RETRY_DELAY_MS ?? '30000', 10),
    },

    cors: {
      allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    },

    polling: {
      eventIntervalMs: parseInt(process.env.EVENT_POLL_INTERVAL_MS ?? '5000', 10),
      finalityIntervalMs: parseInt(process.env.FINALITY_CHECK_INTERVAL_MS ?? '5000', 10),
    },
  };

  const result = ConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
```

---

## 6. Database Schema

### 6.1 Prisma Schema

**File: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum BridgeDirection {
  SEPOLIA_TO_GOLIATH
  GOLIATH_TO_SEPOLIA
}

enum BridgeStatus {
  PENDING_ORIGIN_TX
  CONFIRMING
  AWAITING_RELAY
  PROCESSING_DESTINATION
  COMPLETED
  FAILED
  EXPIRED
  DELAYED
}

model BridgeOperation {
  id                     String          @id @default(uuid())
  direction              BridgeDirection
  tokenSymbol            String          @map("token_symbol")

  // Amount stored as string to preserve precision (6 decimals for USDC)
  amountAtomic           String          @map("amount_atomic")

  // Addresses
  sender                 String
  recipient              String

  // Chain IDs
  originChainId          Int             @map("origin_chain_id")
  destinationChainId     Int             @map("destination_chain_id")

  // Transaction hashes
  originTxHash           String?         @map("origin_tx_hash")
  destinationTxHash      String?         @map("destination_tx_hash")

  // Contract identifiers
  depositId              String?         @map("deposit_id")
  withdrawId             String?         @map("withdraw_id")

  // Status tracking
  status                 BridgeStatus
  originBlockNumber      BigInt?         @map("origin_block_number")
  destinationBlockNumber BigInt?         @map("destination_block_number")
  originConfirmations    Int             @default(0) @map("origin_confirmations")
  requiredConfirmations  Int             @map("required_confirmations")

  // Error handling
  errorMessage           String?         @map("error_message")
  retryCount             Int             @default(0) @map("retry_count")

  // Timestamps
  createdAt              DateTime        @default(now()) @map("created_at")
  updatedAt              DateTime        @updatedAt @map("updated_at")
  depositedAt            DateTime?       @map("deposited_at")
  finalizedAt            DateTime?       @map("finalized_at")
  destinationSubmittedAt DateTime?       @map("destination_submitted_at")
  completedAt            DateTime?       @map("completed_at")

  // ETA
  estimatedCompletionAt  DateTime?       @map("estimated_completion_at")

  // Same-wallet flag
  isSameWallet           Boolean         @default(true) @map("is_same_wallet")

  @@map("bridge_operations")
  @@index([sender])
  @@index([recipient])
  @@index([originTxHash])
  @@index([depositId])
  @@index([withdrawId])
  @@index([status])
  @@index([createdAt])
}

model BridgeEtaStats {
  id              Int             @id @default(autoincrement())
  direction       BridgeDirection
  tokenSymbol     String          @map("token_symbol")
  durationSeconds Int             @map("duration_seconds")
  completedAt     DateTime        @default(now()) @map("completed_at")

  @@map("bridge_eta_stats")
  @@index([direction, tokenSymbol])
}

model ProcessedBlock {
  id        Int      @id @default(autoincrement())
  chainId   Int      @map("chain_id")
  blockNumber BigInt @map("block_number")
  processedAt DateTime @default(now()) @map("processed_at")

  @@unique([chainId])
  @@map("processed_blocks")
}
```

### 6.2 Migration Command

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## 7. Amount and Decimal Handling

### 7.1 Token Decimal Handling

**v1.0 supports USDC (6 decimals) and ETH (18 decimals).**

**File: `src/utils/amounts.ts`**

```typescript
import { formatUnits, parseUnits } from 'ethers';

export interface TokenInfo {
  symbol: string;
  decimals: number;
  isNativeOnSepolia: boolean;
}

export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  USDC: { symbol: 'USDC', decimals: 6, isNativeOnSepolia: false },
  ETH: { symbol: 'ETH', decimals: 18, isNativeOnSepolia: true },
};

/**
 * Parse human-readable amount to atomic units
 * @param amount Human-readable amount (e.g., "100.50")
 * @param tokenSymbol Token symbol (e.g., "USDC")
 * @returns Atomic units as string
 */
export function parseAmountToAtomic(amount: string, tokenSymbol: string): string {
  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }
  return parseUnits(amount, token.decimals).toString();
}

/**
 * Format atomic units to human-readable amount
 * @param atomicAmount Atomic units as string
 * @param tokenSymbol Token symbol
 * @returns Human-readable amount
 */
export function formatAtomicToHuman(atomicAmount: string, tokenSymbol: string): string {
  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }
  return formatUnits(BigInt(atomicAmount), token.decimals);
}

/**
 * Get token decimals
 */
export function getTokenDecimals(tokenSymbol: string): number {
  const token = SUPPORTED_TOKENS[tokenSymbol];
  if (!token) {
    throw new Error(`Unsupported token: ${tokenSymbol}`);
  }
  return token.decimals;
}
```

### 7.2 Future: XCN Decimal Handling

> **Note**: This section is for future reference when XCN support is added.

```typescript
// XCN on Goliath has dual decimals:
// - EVM internal: 8 decimals (tinyxcn)
// - JSON-RPC: 18 decimals (weixcn)
// Conversion: 1 tinyxcn = 10^10 weixcn

const XCN_EVM_DECIMALS = 8n;
const XCN_RPC_DECIMALS = 18n;
const XCN_CONVERSION_FACTOR = 10n ** (XCN_RPC_DECIMALS - XCN_EVM_DECIMALS); // 10^10

export function xcnTinyToRpc(tiny: bigint): bigint {
  return tiny * XCN_CONVERSION_FACTOR;
}

export function xcnRpcToTiny(rpc: bigint): bigint {
  return rpc / XCN_CONVERSION_FACTOR;
}
```

---

## 8. Chain Clients and Providers

**File: `src/chains/providers.ts`**

```typescript
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { config } from '../config';
import BridgeSepoliaAbi from './abis/BridgeSepolia.json';
import BridgeGoliathAbi from './abis/BridgeGoliath.json';

// Read-only providers
export const sepoliaProvider = new JsonRpcProvider(config.chains.sepolia.rpcUrl);
export const goliathProvider = new JsonRpcProvider(config.chains.goliath.rpcUrl);

// Relayer wallets (for signing transactions)
export const relayerWalletSepolia = new Wallet(
  config.relayer.privateKey,
  sepoliaProvider
);

export const relayerWalletGoliath = new Wallet(
  config.relayer.privateKey,
  goliathProvider
);

// Bridge contract instances (read-only)
export const bridgeSepoliaReadOnly = new Contract(
  config.chains.sepolia.bridgeAddress,
  BridgeSepoliaAbi,
  sepoliaProvider
);

export const bridgeGoliathReadOnly = new Contract(
  config.chains.goliath.bridgeAddress,
  BridgeGoliathAbi,
  goliathProvider
);

// Bridge contract instances (with signer for relayer)
export const bridgeSepolia = new Contract(
  config.chains.sepolia.bridgeAddress,
  BridgeSepoliaAbi,
  relayerWalletSepolia
);

export const bridgeGoliath = new Contract(
  config.chains.goliath.bridgeAddress,
  BridgeGoliathAbi,
  relayerWalletGoliath
);

/**
 * Get provider for a given chain ID
 */
export function getProvider(chainId: number): JsonRpcProvider {
  switch (chainId) {
    case config.chains.sepolia.chainId:
      return sepoliaProvider;
    case config.chains.goliath.chainId:
      return goliathProvider;
    default:
      throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

/**
 * Check provider connectivity
 */
export async function checkProviderHealth(chainId: number): Promise<{
  connected: boolean;
  lastBlock: number;
  error?: string;
}> {
  try {
    const provider = getProvider(chainId);
    const blockNumber = await provider.getBlockNumber();
    return { connected: true, lastBlock: blockNumber };
  } catch (error) {
    return {
      connected: false,
      lastBlock: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

---

## 9. Event Watchers

### 9.1 Event Watcher Implementation

**File: `src/worker/eventWatcher.ts`**

```typescript
import { Contract, EventLog, Log } from 'ethers';
import { PrismaClient, BridgeDirection, BridgeStatus } from '@prisma/client';
import { config } from '../config';
import { bridgeSepoliaReadOnly, bridgeGoliathReadOnly, sepoliaProvider, goliathProvider } from '../chains/providers';
import { logger } from '../utils/logger';
import { computeInitialEta } from './etaCalculator';

const prisma = new PrismaClient();

interface DepositEvent {
  depositId: string;
  token: string;
  sender: string;
  destinationAddress: string;
  amount: bigint;
  timestamp: bigint;
  sourceChainId: bigint;
}

interface WithdrawEvent {
  withdrawId: string;
  token: string;
  sender: string;
  destinationAddress: string;
  amount: bigint;
  timestamp: bigint;
  sourceChainId: bigint;
}

export class EventWatcher {
  private sepoliaLastBlock: number = 0;
  private goliathLastBlock: number = 0;
  private isRunning: boolean = false;

  async start(): Promise<void> {
    this.isRunning = true;

    // Load last processed blocks from database
    await this.loadLastProcessedBlocks();

    logger.info('Event watcher started', {
      sepoliaLastBlock: this.sepoliaLastBlock,
      goliathLastBlock: this.goliathLastBlock,
    });

    // Start polling loops
    this.pollSepoliaEvents();
    this.pollGoliathEvents();
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Event watcher stopped');
  }

  private async loadLastProcessedBlocks(): Promise<void> {
    const sepoliaRecord = await prisma.processedBlock.findUnique({
      where: { chainId: config.chains.sepolia.chainId },
    });
    const goliathRecord = await prisma.processedBlock.findUnique({
      where: { chainId: config.chains.goliath.chainId },
    });

    if (sepoliaRecord) {
      this.sepoliaLastBlock = Number(sepoliaRecord.blockNumber);
    } else {
      // Start from current block if no record
      this.sepoliaLastBlock = await sepoliaProvider.getBlockNumber();
    }

    if (goliathRecord) {
      this.goliathLastBlock = Number(goliathRecord.blockNumber);
    } else {
      this.goliathLastBlock = await goliathProvider.getBlockNumber();
    }
  }

  private async pollSepoliaEvents(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await sepoliaProvider.getBlockNumber();

        if (currentBlock > this.sepoliaLastBlock) {
          const fromBlock = this.sepoliaLastBlock + 1;
          const toBlock = Math.min(fromBlock + 1000, currentBlock); // Max 1000 blocks per query

          const depositFilter = bridgeSepoliaReadOnly.filters.Deposit();
          const events = await bridgeSepoliaReadOnly.queryFilter(depositFilter, fromBlock, toBlock);

          for (const event of events) {
            await this.processSepoliaDeposit(event as EventLog);
          }

          this.sepoliaLastBlock = toBlock;
          await this.saveLastProcessedBlock(config.chains.sepolia.chainId, toBlock);
        }
      } catch (error) {
        logger.error('Error polling Sepolia events', { error });
      }

      await this.sleep(config.polling.eventIntervalMs);
    }
  }

  private async pollGoliathEvents(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await goliathProvider.getBlockNumber();

        if (currentBlock > this.goliathLastBlock) {
          const fromBlock = this.goliathLastBlock + 1;
          const toBlock = Math.min(fromBlock + 1000, currentBlock);

          const withdrawFilter = bridgeGoliathReadOnly.filters.Withdraw();
          const events = await bridgeGoliathReadOnly.queryFilter(withdrawFilter, fromBlock, toBlock);

          for (const event of events) {
            await this.processGoliathWithdraw(event as EventLog);
          }

          this.goliathLastBlock = toBlock;
          await this.saveLastProcessedBlock(config.chains.goliath.chainId, toBlock);
        }
      } catch (error) {
        logger.error('Error polling Goliath events', { error });
      }

      await this.sleep(config.polling.eventIntervalMs);
    }
  }

  private async processSepoliaDeposit(event: EventLog): Promise<void> {
    const args = event.args as unknown as DepositEvent;

    // Check if already processed
    const existing = await prisma.bridgeOperation.findFirst({
      where: { depositId: args.depositId },
    });
    if (existing) {
      logger.debug('Deposit already processed', { depositId: args.depositId });
      return;
    }

    const block = await event.getBlock();
    const now = new Date();
    const eta = computeInitialEta(BridgeDirection.SEPOLIA_TO_GOLIATH, now);
    const isSameWallet = args.sender.toLowerCase() === args.destinationAddress.toLowerCase();

    // Determine token symbol from contract event token address
    const tokenSymbol = this.resolveTokenSymbol(args.token, 'sepolia');

    await prisma.bridgeOperation.create({
      data: {
        direction: BridgeDirection.SEPOLIA_TO_GOLIATH,
        tokenSymbol, // v1.0: USDC or ETH
        amountAtomic: args.amount.toString(),
        sender: args.sender,
        recipient: args.destinationAddress,
        originChainId: config.chains.sepolia.chainId,
        destinationChainId: config.chains.goliath.chainId,
        originTxHash: event.transactionHash,
        depositId: args.depositId,
        status: BridgeStatus.CONFIRMING,
        originBlockNumber: BigInt(event.blockNumber),
        originConfirmations: 0,
        requiredConfirmations: config.chains.sepolia.finalityBlocks,
        depositedAt: new Date(Number(block.timestamp) * 1000),
        estimatedCompletionAt: eta,
        isSameWallet,
      },
    });

    logger.info('Deposit event processed', {
      depositId: args.depositId,
      sender: args.sender,
      amount: args.amount.toString(),
      txHash: event.transactionHash,
    });
  }

  private async processGoliathWithdraw(event: EventLog): Promise<void> {
    const args = event.args as unknown as WithdrawEvent;

    const existing = await prisma.bridgeOperation.findFirst({
      where: { withdrawId: args.withdrawId },
    });
    if (existing) {
      logger.debug('Withdraw already processed', { withdrawId: args.withdrawId });
      return;
    }

    const block = await event.getBlock();
    const now = new Date();
    const eta = computeInitialEta(BridgeDirection.GOLIATH_TO_SEPOLIA, now);
    const isSameWallet = args.sender.toLowerCase() === args.destinationAddress.toLowerCase();

    // Determine token symbol from contract event token address
    const tokenSymbol = this.resolveTokenSymbol(args.token, 'goliath');

    await prisma.bridgeOperation.create({
      data: {
        direction: BridgeDirection.GOLIATH_TO_SEPOLIA,
        tokenSymbol, // v1.0: USDC or ETH
        amountAtomic: args.amount.toString(),
        sender: args.sender,
        recipient: args.destinationAddress,
        originChainId: config.chains.goliath.chainId,
        destinationChainId: config.chains.sepolia.chainId,
        originTxHash: event.transactionHash,
        withdrawId: args.withdrawId,
        status: BridgeStatus.CONFIRMING,
        originBlockNumber: BigInt(event.blockNumber),
        originConfirmations: 0,
        requiredConfirmations: config.chains.goliath.finalityBlocks,
        depositedAt: new Date(Number(block.timestamp) * 1000),
        estimatedCompletionAt: eta,
        isSameWallet,
      },
    });

    logger.info('Withdraw event processed', {
      withdrawId: args.withdrawId,
      sender: args.sender,
      amount: args.amount.toString(),
      txHash: event.transactionHash,
    });
  }

  private async saveLastProcessedBlock(chainId: number, blockNumber: number): Promise<void> {
    await prisma.processedBlock.upsert({
      where: { chainId },
      create: { chainId, blockNumber: BigInt(blockNumber) },
      update: { blockNumber: BigInt(blockNumber) },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resolve token symbol from contract address
   * ETH on Sepolia uses address(0) or a special sentinel
   */
  private resolveTokenSymbol(tokenAddress: string, chain: 'sepolia' | 'goliath'): string {
    const addr = tokenAddress.toLowerCase();
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    if (chain === 'sepolia') {
      // ETH is native on Sepolia - represented as address(0)
      if (addr === zeroAddress) {
        return 'ETH';
      }
      if (addr === config.tokens.usdc.sepolia.toLowerCase()) {
        return 'USDC';
      }
    } else {
      // Goliath: both are ERC-20
      if (addr === config.tokens.eth.goliath.toLowerCase()) {
        return 'ETH';
      }
      if (addr === config.tokens.usdc.goliath.toLowerCase()) {
        return 'USDC';
      }
    }

    logger.warn('Unknown token address', { tokenAddress, chain });
    return 'UNKNOWN';
  }
}
```

---

## 10. Relayer Logic

### 10.1 Finality Tracker

**File: `src/worker/finalityTracker.ts`**

```typescript
import { PrismaClient, BridgeStatus, BridgeDirection } from '@prisma/client';
import { config } from '../config';
import { sepoliaProvider, goliathProvider } from '../chains/providers';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class FinalityTracker {
  private isRunning: boolean = false;

  async start(): Promise<void> {
    this.isRunning = true;
    logger.info('Finality tracker started');
    this.trackConfirmations();
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Finality tracker stopped');
  }

  private async trackConfirmations(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.updateConfirmations();
      } catch (error) {
        logger.error('Error tracking confirmations', { error });
      }

      await this.sleep(config.polling.finalityIntervalMs);
    }
  }

  private async updateConfirmations(): Promise<void> {
    // Get all operations in CONFIRMING status
    const operations = await prisma.bridgeOperation.findMany({
      where: { status: BridgeStatus.CONFIRMING },
    });

    for (const op of operations) {
      try {
        const provider = op.direction === BridgeDirection.SEPOLIA_TO_GOLIATH
          ? sepoliaProvider
          : goliathProvider;

        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - Number(op.originBlockNumber) + 1;

        // Update confirmations
        await prisma.bridgeOperation.update({
          where: { id: op.id },
          data: { originConfirmations: confirmations },
        });

        // Check if finality reached
        if (confirmations >= op.requiredConfirmations) {
          await prisma.bridgeOperation.update({
            where: { id: op.id },
            data: {
              status: BridgeStatus.AWAITING_RELAY,
              finalizedAt: new Date(),
            },
          });

          logger.info('Operation reached finality', {
            id: op.id,
            confirmations,
            direction: op.direction,
          });
        }
      } catch (error) {
        logger.error('Error updating confirmations for operation', {
          id: op.id,
          error,
        });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 10.2 Transaction Submitter

**File: `src/worker/transactionSubmitter.ts`**

```typescript
import { PrismaClient, BridgeStatus, BridgeDirection } from '@prisma/client';
import { parseUnits } from 'ethers';
import { config } from '../config';
import { bridgeSepolia, bridgeGoliath } from '../chains/providers';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

const prisma = new PrismaClient();

export class TransactionSubmitter {
  private isRunning: boolean = false;

  async start(): Promise<void> {
    this.isRunning = true;
    logger.info('Transaction submitter started');
    this.processAwaitingRelay();
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Transaction submitter stopped');
  }

  private async processAwaitingRelay(): Promise<void> {
    while (this.isRunning) {
      try {
        const operations = await prisma.bridgeOperation.findMany({
          where: { status: BridgeStatus.AWAITING_RELAY },
          orderBy: { finalizedAt: 'asc' },
          take: 10, // Process up to 10 at a time
        });

        for (const op of operations) {
          await this.submitDestinationTx(op);
        }
      } catch (error) {
        logger.error('Error processing awaiting relay', { error });
      }

      await this.sleep(5000);
    }
  }

  private async submitDestinationTx(operation: any): Promise<void> {
    const { id, direction, depositId, withdrawId, recipient, amountAtomic, tokenSymbol } = operation;

    try {
      // Mark as processing
      await prisma.bridgeOperation.update({
        where: { id },
        data: {
          status: BridgeStatus.PROCESSING_DESTINATION,
          destinationSubmittedAt: new Date(),
        },
      });

      // Get token address for destination chain
      const destTokenAddress = this.getDestinationTokenAddress(tokenSymbol, direction);

      let tx;
      if (direction === BridgeDirection.SEPOLIA_TO_GOLIATH) {
        // Mint on Goliath (both USDC and ETH are ERC-20 on Goliath)
        tx = await retryWithBackoff(
          async () => {
            const gasPrice = parseUnits(config.relayer.maxGasGwei.toString(), 'gwei');
            return bridgeGoliath.mint(
              depositId,
              destTokenAddress,
              recipient,
              BigInt(amountAtomic),
              { gasPrice }
            );
          },
          config.relayer.maxRetries,
          config.relayer.retryDelayMs
        );
      } else {
        // Release on Sepolia
        // For ETH: use releaseNative() to send native ETH
        // For USDC: use release() to transfer ERC-20
        tx = await retryWithBackoff(
          async () => {
            const gasPrice = parseUnits(config.relayer.maxGasGwei.toString(), 'gwei');

            if (tokenSymbol === 'ETH') {
              // Release native ETH on Sepolia
              return bridgeSepolia.releaseNative(
                withdrawId,
                recipient,
                BigInt(amountAtomic),
                { gasPrice }
              );
            } else {
              // Release ERC-20 (USDC) on Sepolia
              return bridgeSepolia.release(
                withdrawId,
                destTokenAddress,
                recipient,
                BigInt(amountAtomic),
                { gasPrice }
              );
            }
          },
          config.relayer.maxRetries,
          config.relayer.retryDelayMs
        );
      }

      logger.info('Destination transaction submitted', {
        id,
        txHash: tx.hash,
        direction,
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        await prisma.bridgeOperation.update({
          where: { id },
          data: {
            status: BridgeStatus.COMPLETED,
            destinationTxHash: tx.hash,
            destinationBlockNumber: BigInt(receipt.blockNumber),
            completedAt: new Date(),
          },
        });

        logger.info('Bridge operation completed', { id, txHash: tx.hash });
      } else {
        throw new Error('Transaction reverted');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.bridgeOperation.update({
        where: { id },
        data: {
          status: BridgeStatus.FAILED,
          errorMessage,
          retryCount: { increment: 1 },
        },
      });

      logger.error('Failed to submit destination transaction', {
        id,
        error: errorMessage,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get destination token address based on token symbol and direction
   */
  private getDestinationTokenAddress(
    tokenSymbol: string,
    direction: BridgeDirection
  ): string {
    if (direction === BridgeDirection.SEPOLIA_TO_GOLIATH) {
      // Destination is Goliath - both tokens are ERC-20
      if (tokenSymbol === 'ETH') {
        return config.tokens.eth.goliath;
      }
      return config.tokens.usdc.goliath;
    } else {
      // Destination is Sepolia
      // ETH is native (handled separately), USDC is ERC-20
      if (tokenSymbol === 'ETH') {
        return '0x0000000000000000000000000000000000000000'; // Sentinel for native
      }
      return config.tokens.usdc.sepolia;
    }
  }
}
```

---

## 11. ETA Calculation Model

**File: `src/worker/etaCalculator.ts`**

```typescript
import { BridgeDirection } from '@prisma/client';
import { config } from '../config';

interface EtaConfig {
  finalitySeconds: number;
  relayerBaseSeconds: number;
  marginSeconds: number;
}

const ETA_CONFIGS: Record<BridgeDirection, EtaConfig> = {
  [BridgeDirection.SEPOLIA_TO_GOLIATH]: {
    finalitySeconds: config.eta.sepoliaFinalitySec, // ~144s (12 blocks * 12s)
    relayerBaseSeconds: config.eta.relayerBaseSec,   // ~30s
    marginSeconds: config.eta.marginSec,              // ~60s buffer
  },
  [BridgeDirection.GOLIATH_TO_SEPOLIA]: {
    finalitySeconds: config.eta.goliathFinalitySec,  // ~12s (6 blocks * 2s)
    relayerBaseSeconds: config.eta.relayerBaseSec,
    marginSeconds: config.eta.marginSec,
  },
};

/**
 * Compute initial ETA when operation is first detected
 */
export function computeInitialEta(direction: BridgeDirection, now: Date): Date {
  const cfg = ETA_CONFIGS[direction];
  const totalSeconds = cfg.finalitySeconds + cfg.relayerBaseSeconds + cfg.marginSeconds;
  return new Date(now.getTime() + totalSeconds * 1000);
}

/**
 * Recompute ETA based on current confirmation progress
 */
export function recomputeEta(
  direction: BridgeDirection,
  originConfirmations: number,
  requiredConfirmations: number,
  now: Date
): Date {
  const cfg = ETA_CONFIGS[direction];

  const remainingConfirmations = Math.max(0, requiredConfirmations - originConfirmations);
  const avgBlockTime = direction === BridgeDirection.SEPOLIA_TO_GOLIATH ? 12 : 2;
  const remainingFinalitySeconds = remainingConfirmations * avgBlockTime;

  const totalSeconds = remainingFinalitySeconds + cfg.relayerBaseSeconds + cfg.marginSeconds;
  return new Date(now.getTime() + totalSeconds * 1000);
}

/**
 * Format ETA for API response
 */
export function formatEtaForApi(eta: Date | null): string | null {
  if (!eta) return null;
  return eta.toISOString();
}

/**
 * Check if operation is delayed (past ETA but not completed)
 */
export function isDelayed(eta: Date | null, now: Date): boolean {
  if (!eta) return false;
  return now.getTime() > eta.getTime();
}

/**
 * Get human-readable ETA description
 */
export function getEtaDescription(direction: BridgeDirection): string {
  const cfg = ETA_CONFIGS[direction];
  const totalMinutes = Math.ceil((cfg.finalitySeconds + cfg.relayerBaseSeconds) / 60);
  return `~${totalMinutes}-${totalMinutes + 2} minutes`;
}
```

---

## 12. HTTP API Design

### 12.1 API Server Setup

**File: `src/api/server.ts`**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from '../config';
import { logger } from '../utils/logger';
import { bridgeRoutes } from './routes/bridge';
import { healthRoutes } from './routes/health';
import { metricsRoutes } from './routes/metrics';

const fastify = Fastify({
  logger: true,
});

async function start(): Promise<void> {
  // Register plugins
  await fastify.register(cors, {
    origin: config.cors.allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await fastify.register(helmet);

  // Register routes
  await fastify.register(bridgeRoutes, { prefix: '/api/v1/bridge' });
  await fastify.register(healthRoutes, { prefix: '/api/v1' });
  await fastify.register(metricsRoutes);

  // Start server
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`Server listening on port ${config.port}`);
  } catch (err) {
    logger.error('Error starting server', { error: err });
    process.exit(1);
  }
}

start();
```

### 12.2 Bridge Routes

**File: `src/api/routes/bridge.ts`**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { formatAtomicToHuman } from '../../utils/amounts';
import { formatEtaForApi } from '../../worker/etaCalculator';

const prisma = new PrismaClient();

// Request schemas
const StatusQuerySchema = z.object({
  originTxHash: z.string().optional(),
  depositId: z.string().optional(),
  withdrawId: z.string().optional(),
}).refine(
  data => data.originTxHash || data.depositId || data.withdrawId,
  { message: 'At least one query parameter is required' }
);

const HistoryQuerySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
  status: z.string().optional(),
  direction: z.string().optional(),
});

export async function bridgeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/bridge/status
   * Get status of a bridge operation
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = StatusQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: query.error.message,
      });
    }

    const { originTxHash, depositId, withdrawId } = query.data;

    const operation = await prisma.bridgeOperation.findFirst({
      where: {
        OR: [
          originTxHash ? { originTxHash } : {},
          depositId ? { depositId } : {},
          withdrawId ? { withdrawId } : {},
        ].filter(o => Object.keys(o).length > 0),
      },
    });

    if (!operation) {
      return reply.status(404).send({
        error: 'OPERATION_NOT_FOUND',
        message: 'Bridge operation not found',
      });
    }

    return reply.send(formatOperationResponse(operation));
  });

  /**
   * GET /api/v1/bridge/history
   * Get bridge history for an address
   */
  fastify.get('/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = HistoryQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: query.error.message,
      });
    }

    const { address, limit, offset, status, direction } = query.data;
    const addressLower = address.toLowerCase();

    const where: any = {
      AND: [
        {
          OR: [
            { sender: { equals: addressLower, mode: 'insensitive' } },
            { recipient: { equals: addressLower, mode: 'insensitive' } },
          ],
        },
        { isSameWallet: true }, // v1.0: Only show same-wallet operations
      ],
    };

    if (status) {
      where.status = status;
    }
    if (direction) {
      where.direction = direction;
    }

    const [operations, total] = await Promise.all([
      prisma.bridgeOperation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.bridgeOperation.count({ where }),
    ]);

    return reply.send({
      operations: operations.map(formatOperationResponse),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + operations.length < total,
      },
    });
  });
}

function formatOperationResponse(op: any) {
  return {
    operationId: op.id,
    direction: op.direction,
    status: op.status,
    token: op.tokenSymbol,
    amount: op.amountAtomic,
    amountFormatted: formatAtomicToHuman(op.amountAtomic, op.tokenSymbol),
    sender: op.sender,
    recipient: op.recipient,
    originChainId: op.originChainId,
    destinationChainId: op.destinationChainId,
    originTxHash: op.originTxHash,
    destinationTxHash: op.destinationTxHash,
    originConfirmations: op.originConfirmations,
    requiredConfirmations: op.requiredConfirmations,
    timestamps: {
      depositedAt: op.depositedAt?.toISOString() ?? null,
      finalizedAt: op.finalizedAt?.toISOString() ?? null,
      destinationSubmittedAt: op.destinationSubmittedAt?.toISOString() ?? null,
      completedAt: op.completedAt?.toISOString() ?? null,
    },
    estimatedCompletionTime: formatEtaForApi(op.estimatedCompletionAt),
    error: op.errorMessage,
    isSameWallet: op.isSameWallet,
  };
}
```

### 12.3 Health Routes

**File: `src/api/routes/health.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PrismaClient, BridgeStatus } from '@prisma/client';
import { config } from '../../config';
import { checkProviderHealth, sepoliaProvider, goliathProvider } from '../../chains/providers';

const prisma = new PrismaClient();

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (request, reply) => {
    const [sepoliaHealth, goliathHealth, pendingCount, latestProcessed] = await Promise.all([
      checkProviderHealth(config.chains.sepolia.chainId),
      checkProviderHealth(config.chains.goliath.chainId),
      prisma.bridgeOperation.count({
        where: {
          status: { in: [BridgeStatus.CONFIRMING, BridgeStatus.AWAITING_RELAY, BridgeStatus.PROCESSING_DESTINATION] },
        },
      }),
      prisma.bridgeOperation.findFirst({
        where: { status: BridgeStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const isHealthy = sepoliaHealth.connected && goliathHealth.connected;

    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      chains: {
        sepolia: {
          connected: sepoliaHealth.connected,
          lastBlock: sepoliaHealth.lastBlock,
          error: sepoliaHealth.error,
        },
        goliath: {
          connected: goliathHealth.connected,
          lastBlock: goliathHealth.lastBlock,
          error: goliathHealth.error,
        },
      },
      relayer: {
        pendingOperations: pendingCount,
        lastProcessedAt: latestProcessed?.completedAt?.toISOString() ?? null,
      },
    };

    return reply.status(isHealthy ? 200 : 503).send(response);
  });
}
```

### 12.4 Metrics Routes

**File: `src/api/routes/metrics.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { register, Counter, Gauge, Histogram } from 'prom-client';
import { PrismaClient, BridgeStatus, BridgeDirection } from '@prisma/client';

const prisma = new PrismaClient();

// Metrics definitions
export const bridgeOperationsTotal = new Counter({
  name: 'bridge_operations_total',
  help: 'Total number of bridge operations',
  labelNames: ['direction', 'status'],
});

export const bridgePendingOperations = new Gauge({
  name: 'bridge_pending_operations',
  help: 'Number of pending bridge operations',
  labelNames: ['direction'],
});

export const bridgeCompletionTime = new Histogram({
  name: 'bridge_completion_time_seconds',
  help: 'Time to complete bridge operations',
  labelNames: ['direction'],
  buckets: [60, 120, 180, 300, 600, 900],
});

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (request, reply) => {
    try {
      // Update gauge metrics
      const pendingCounts = await prisma.bridgeOperation.groupBy({
        by: ['direction'],
        where: {
          status: { in: [BridgeStatus.CONFIRMING, BridgeStatus.AWAITING_RELAY, BridgeStatus.PROCESSING_DESTINATION] },
        },
        _count: { id: true },
      });

      for (const dir of Object.values(BridgeDirection)) {
        const count = pendingCounts.find(p => p.direction === dir)?._count.id ?? 0;
        bridgePendingOperations.labels(dir).set(count);
      }

      reply.header('Content-Type', register.contentType);
      return reply.send(await register.metrics());
    } catch (error) {
      return reply.status(500).send('Error collecting metrics');
    }
  });
}
```

---

## 13. Same-Wallet Semantics

### 13.1 Backend Enforcement

The backend does **not reject** operations where sender != recipient (contracts may allow them), but:

1. **Stores `isSameWallet` flag**: `sender.toLowerCase() === recipient.toLowerCase()`
2. **Filters in history endpoint**: Only returns operations where `isSameWallet = true` for the given address
3. **Logs non-same-wallet operations**: For monitoring and security auditing

```typescript
// In event watcher
const isSameWallet = args.sender.toLowerCase() === args.destinationAddress.toLowerCase();

// In history query
where: {
  AND: [
    { OR: [{ sender: address }, { recipient: address }] },
    { isSameWallet: true }, // v1.0: Only show same-wallet
  ],
}
```

---

## 14. Linux Deployment

### 14.1 Build Process

```bash
# Install dependencies
npm ci

# Generate Prisma client
npx prisma generate

# Build TypeScript
npm run build
# Output: dist/api/server.js, dist/worker/relayer.js
```

### 14.2 systemd Unit Files

**File: `systemd/bridge-api.service`**

```ini
[Unit]
Description=Goliath Bridge API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=bridge
Group=bridge
WorkingDirectory=/opt/goliath-bridge-backend
ExecStart=/usr/bin/node dist/api/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bridge-api
Environment=NODE_ENV=production
EnvironmentFile=/etc/goliath-bridge/backend.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/goliath-bridge-backend/logs

[Install]
WantedBy=multi-user.target
```

**File: `systemd/bridge-relayer.service`**

```ini
[Unit]
Description=Goliath Bridge Relayer
After=network.target postgresql.service bridge-api.service
Wants=postgresql.service

[Service]
Type=simple
User=bridge
Group=bridge
WorkingDirectory=/opt/goliath-bridge-backend
ExecStart=/usr/bin/node dist/worker/relayer.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bridge-relayer
Environment=NODE_ENV=production
EnvironmentFile=/etc/goliath-bridge/backend.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/goliath-bridge-backend/logs

[Install]
WantedBy=multi-user.target
```

### 14.3 Deployment Commands

```bash
# Copy files
sudo cp systemd/*.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable bridge-api bridge-relayer

# Start services
sudo systemctl start bridge-api bridge-relayer

# Check status
sudo systemctl status bridge-api bridge-relayer

# View logs
sudo journalctl -u bridge-api -f
sudo journalctl -u bridge-relayer -f
```

---

## 15. Security and Validation

### 15.1 Input Validation

All API inputs validated with Zod schemas:

```typescript
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const TxHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
```

### 15.2 CORS Configuration

```typescript
cors: {
  origin: config.cors.allowedOrigins, // Whitelist frontend origins
  methods: ['GET', 'POST', 'OPTIONS'],
}
```

### 15.3 Private Key Protection

- Private key loaded from environment variable only
- Never logged or exposed in API responses
- Use hardware security module (HSM) in production

### 15.4 Contract Address Whitelisting

```typescript
const ALLOWED_TOKEN_ADDRESSES = {
  [config.chains.sepolia.chainId]: [config.tokens.usdc.sepolia],
  [config.chains.goliath.chainId]: [config.tokens.usdc.goliath],
};

function isAllowedToken(chainId: number, address: string): boolean {
  return ALLOWED_TOKEN_ADDRESSES[chainId]?.includes(address.toLowerCase()) ?? false;
}
```

---

## 16. Testing Strategy

### 16.1 Unit Tests

**Target: 80% code coverage**

```typescript
// Example: Amount conversion tests
describe('amounts', () => {
  it('parses USDC amount correctly', () => {
    expect(parseAmountToAtomic('100.50', 'USDC')).toBe('100500000');
  });

  it('formats USDC amount correctly', () => {
    expect(formatAtomicToHuman('100500000', 'USDC')).toBe('100.5');
  });
});

// Example: ETA calculation tests
describe('etaCalculator', () => {
  it('computes initial ETA for Sepolia to Goliath', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const eta = computeInitialEta(BridgeDirection.SEPOLIA_TO_GOLIATH, now);
    // ~144s + 30s + 60s = 234s
    expect(eta.getTime() - now.getTime()).toBeGreaterThanOrEqual(230000);
  });
});
```

### 16.2 Integration Tests

```typescript
describe('API Integration', () => {
  it('returns 404 for unknown operation', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bridge/status?depositId=unknown',
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns operation status correctly', async () => {
    // Create test operation in DB
    const op = await prisma.bridgeOperation.create({ ... });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/bridge/status?depositId=${op.depositId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('CONFIRMING');
  });
});
```

### 16.3 Load Testing

```bash
# Using k6
k6 run --vus 50 --duration 60s load-test.js
```

**Targets:**
- Status API: P95 < 200ms
- Throughput: 100+ operations/hour

---

## 17. Monitoring and Alerting

### 17.1 Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `bridge_operations_total{direction,status}` | Counter | Total operations by direction and status |
| `bridge_pending_operations{direction}` | Gauge | Current pending operations |
| `bridge_completion_time_seconds{direction}` | Histogram | Operation completion time |
| `bridge_relayer_errors_total{type}` | Counter | Relayer errors by type |
| `bridge_chain_block_lag{chain}` | Gauge | Block processing lag |

### 17.2 Alerting Rules

```yaml
groups:
  - name: bridge
    rules:
      - alert: BridgeChainDisconnected
        expr: bridge_chain_connected == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Bridge chain disconnected"

      - alert: BridgeHighPendingOperations
        expr: bridge_pending_operations > 50
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High number of pending bridge operations"

      - alert: BridgeOperationDelayed
        expr: bridge_operation_age_seconds > 600
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Bridge operation taking too long"
```

---

## 18. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Initialize repository with TypeScript/Fastify
- [ ] Set up Prisma with PostgreSQL schema
- [ ] Implement configuration loader
- [ ] Create chain providers and contract instances
- [ ] Deploy to development environment

### Phase 2: Event Watching (Week 1-2)
- [ ] Implement Sepolia Deposit event watcher
- [ ] Implement Goliath Withdraw event watcher
- [ ] Add finality tracker
- [ ] Store operations in database
- [ ] Test with mock events

### Phase 3: API Layer (Week 2)
- [ ] Implement /bridge/status endpoint
- [ ] Implement /bridge/history endpoint
- [ ] Implement /health endpoint
- [ ] Add /metrics endpoint
- [ ] Write API integration tests

### Phase 4: Relayer (Week 2-3)
- [ ] Implement transaction submitter
- [ ] Add retry logic with gas escalation
- [ ] Implement ETA calculation
- [ ] Test end-to-end bridge flow
- [ ] Add error handling and alerting

### Phase 5: Deployment (Week 3)
- [ ] Create systemd unit files
- [ ] Set up environment configuration
- [ ] Deploy to testnet server
- [ ] Configure monitoring/alerting
- [ ] Document operational procedures

### Phase 6: Integration Testing (Week 3-4)
- [ ] Test Sepolia → Goliath USDC bridge
- [ ] Test Goliath → Sepolia USDC bridge
- [ ] Test failure scenarios
- [ ] Load testing
- [ ] Security review

---

## Appendix A: Contract ABIs

### BridgeSepolia (Minimal)

```json
[
  "event Deposit(bytes32 indexed depositId, address indexed token, address indexed sender, address destinationAddress, uint256 amount, uint64 timestamp, uint64 sourceChainId)",
  "event Release(bytes32 indexed withdrawId, address indexed token, address indexed recipient, uint256 amount)",
  "function deposit(address token, uint256 amount, address destinationAddress) external returns (bytes32)",
  "function depositNative(address destinationAddress) external payable returns (bytes32)",
  "function release(bytes32 withdrawId, address token, address recipient, uint256 amount) external",
  "function releaseNative(bytes32 withdrawId, address recipient, uint256 amount) external"
]
```

> **Note**: `depositNative` accepts native ETH via `msg.value`. `releaseNative` sends native ETH to the recipient.

### BridgeGoliath (Minimal)

```json
[
  "event Withdraw(bytes32 indexed withdrawId, address indexed token, address indexed sender, address destinationAddress, uint256 amount, uint64 timestamp, uint64 sourceChainId)",
  "event Mint(bytes32 indexed depositId, address indexed token, address indexed recipient, uint256 amount)",
  "function burn(address token, uint256 amount, address destinationAddress) external returns (bytes32)",
  "function mint(bytes32 depositId, address token, address recipient, uint256 amount) external"
]
```

---

## Appendix B: API Response Examples

### GET /api/v1/bridge/status

```json
{
  "operationId": "550e8400-e29b-41d4-a716-446655440000",
  "direction": "SEPOLIA_TO_GOLIATH",
  "status": "CONFIRMING",
  "token": "USDC",
  "amount": "100000000",
  "amountFormatted": "100.0",
  "sender": "0x742d35Cc6634C0532925a3b844Bc9e7595f3dB7E",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f3dB7E",
  "originChainId": 11155111,
  "destinationChainId": 8901,
  "originTxHash": "0x1234...abcd",
  "destinationTxHash": null,
  "originConfirmations": 5,
  "requiredConfirmations": 12,
  "timestamps": {
    "depositedAt": "2025-01-15T10:30:00Z",
    "finalizedAt": null,
    "destinationSubmittedAt": null,
    "completedAt": null
  },
  "estimatedCompletionTime": "2025-01-15T10:35:00Z",
  "error": null,
  "isSameWallet": true
}
```

### GET /api/v1/health

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "chains": {
    "sepolia": {
      "connected": true,
      "lastBlock": 4567890
    },
    "goliath": {
      "connected": true,
      "lastBlock": 1234567
    }
  },
  "relayer": {
    "pendingOperations": 3,
    "lastProcessedAt": "2025-01-15T10:30:00Z"
  }
}
```

---

*End of Backend TID v1.0*
