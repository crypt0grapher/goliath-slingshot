Here’s a pair of TIDs, one for the frontend and one for the backend, aligned with your PRD and your extra constraints (TypeScript everywhere, two repos, env-based config, Linux + systemd, XCN decimal weirdness, Sepolia ETH native, same-wallet only, status + ETA API). 

I’ll also give a concrete *bridge ETA model* in the backend section, so the system can actually “estimate arrival time and let you know”.

---

# TID 1 — Frontend (TypeScript)

**Project:** Goliath Slingshot / CoolSwap Interface – Bridge UI
**Repo:** `goliath-bridge-frontend` (new repo, or fork of existing DEX UI)

---

## 1. Purpose and Scope

Implement the cross-chain bridge UI in the Slingshot frontend (React + TypeScript), talking to:

* Ethereum Sepolia (11155111) and Goliath Testnet (8901)
* Bridge smart contracts (already specified in PRD)
* New backend Status API (`/api/v1/bridge/...`)

Front-end responsibilities:

* Bridge page (`/bridge`) with swap-like UX
* Wallet + network handling (Sepolia native ETH, Goliath tokens/ETH ERC‑20)
* Same-wallet-only bridging (no custom recipient in this version)
* Amount and balance UI with correct decimals, including **XCN’s 8/18 dual-decimal behaviour on Goliath**
* Calling backend to fetch operation status, confirmations, and ETA
* Persist bridge operations locally for UX recovery

---

## 2. Tech Stack & Core Dependencies

* **Language:** TypeScript (strict mode)
* **Framework:** React 18 (FC + hooks)
* **State management:** Redux Toolkit (or existing app’s state system)
* **Web3:**

  * `ethers@^6` (or current web3 abstraction used in Slingshot)
  * Wallet connection via existing connectors (MetaMask, WalletConnect, CoinbaseWallet)
* **Build tooling:** existing (Webpack/Vite) — assume CRA-like env naming: `REACT_APP_*`
* **Testing:** Jest + React Testing Library

---

## 3. Repository & Directory Layout

Proposed incremental structure inside existing app (or equivalent):

```txt
src/
  pages/
    Bridge/
      BridgePage.tsx
      BridgeForm.tsx
      NetworkSelector.tsx
      TokenSelector.tsx
      AmountInput.tsx
      BridgeSummary.tsx
      BridgeStatusStepper.tsx
      BridgeHistoryPanel.tsx
  state/
    bridge/
      bridgeSlice.ts
      bridgeSelectors.ts
      bridgeThunks.ts
      types.ts
      localStorage.ts
  services/
    bridgeStatusApi.ts      // calls backend /bridge/status, /bridge/history
    chainProviders.ts       // read-only providers for Sepolia + Goliath
  constants/
    bridgeTokens.ts         // token mappings, decimals, directions
    networks.ts             // chain metadata (names, IDs, RPC, explorers)
  hooks/
    useBridgeForm.ts
    useBridgeAllowance.ts
    useBridgeDeposit.ts
    useBridgeBurn.ts
    useBridgeStatusPolling.ts
    useBridgeHistory.ts
  utils/
    amount.ts               // generic amount utilities
    xcnDecimals.ts          // *frontend* helpers for XCN
    eta.ts                  // optional client-side ETA fallback
  abis/
    BridgeSepolia.json
    BridgeGoliath.json
    Erc20.json
```

---

## 4. Configuration & `.env` Handling

All chain/contract/token configuration is driven by env variables and static maps.

### 4.1 `.env` Schema (frontend)

Example `.env`:

```bash
# Networks
REACT_APP_SEPOLIA_CHAIN_ID=11155111
REACT_APP_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/XXX
REACT_APP_SEPOLIA_EXPLORER_URL=https://sepolia.etherscan.io

REACT_APP_GOLIATH_CHAIN_ID=8901
REACT_APP_GOLIATH_RPC_URL=https://testnet-rpc.goliath.net
REACT_APP_GOLIATH_EXPLORER_URL=https://testnet.explorer.goliath.net

# Bridge contracts
REACT_APP_BRIDGE_SEPOLIA_ADDRESS=0x...
REACT_APP_BRIDGE_GOLIATH_ADDRESS=0x...

# Backend status API
REACT_APP_BRIDGE_STATUS_API_URL=https://bridge-api-testnet.goliath.network/api/v1

# Behaviour flags
REACT_APP_BRIDGE_ENABLED=true
REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT=false  # <-- same-wallet only
REACT_APP_BRIDGE_MIN_AMOUNT=0.000001

# XCN decimals behaviour (doc-based, informational)
REACT_APP_XCN_EVM_DECIMALS=8
REACT_APP_XCN_RPC_DECIMALS=18

# ETH behaviour
REACT_APP_SEPOLIA_ETH_NATIVE=true     # ETH is native on Sepolia
REACT_APP_GOLIATH_ETH_ERC20=true      # ETH is ERC20 on Goliath
```

### 4.2 Typed Config Loader

Create `src/config/bridgeConfig.ts`:

```ts
export type ChainId = 11155111 | 8901;

export interface BridgeFrontendConfig {
  sepolia: {
    chainId: ChainId;
    rpcUrl: string;
    explorerUrl: string;
    bridgeAddress: string;
  };
  goliath: {
    chainId: ChainId;
    rpcUrl: string;
    explorerUrl: string;
    bridgeAddress: string;
  };
  statusApiBaseUrl: string;
  bridgeEnabled: boolean;
  allowCustomRecipient: boolean;
  minAmount: string; // human-readable string
  xcn: {
    evmDecimals: number; // should be 8
    rpcDecimals: number; // should be 18
  };
  eth: {
    sepoliaNative: boolean;
    goliathErc20: boolean;
  };
}
```

Load env at app startup, validate with Zod or similar, and crash early if misconfigured.

---

## 5. Networks & Token Modelling

### 5.1 Network Types

```ts
export enum BridgeNetwork {
  SEPOLIA = 'SEPOLIA',
  GOLIATH = 'GOLIATH',
}

export const NETWORK_METADATA = {
  [BridgeNetwork.SEPOLIA]: {
    chainId: 11155111,
    displayName: 'Ethereum Sepolia',
    explorerTx: (hash: string) =>
      `${process.env.REACT_APP_SEPOLIA_EXPLORER_URL}/tx/${hash}`,
  },
  [BridgeNetwork.GOLIATH]: {
    chainId: 8901,
    displayName: 'Goliath Testnet',
    explorerTx: (hash: string) =>
      `${process.env.REACT_APP_GOLIATH_EXPLORER_URL}/tx/${hash}`,
  },
} as const;
```

### 5.2 Token Mapping

Integrate PRD mapping, but with explicit **native vs ERC‑20** for ETH and XCN on each chain. 

```ts
export type BridgeTokenSymbol = 'XCN' | 'ETH' | 'BTC' | 'USDC';

export interface ChainTokenConfig {
  address: string | null;       // null => native asset on that chain
  decimals: number;             // RPC decimals
  isNative: boolean;
}

export interface BridgeTokenConfig {
  symbol: BridgeTokenSymbol;
  sepolia: ChainTokenConfig;
  goliath: ChainTokenConfig;
}

export const BRIDGE_TOKENS: Record<BridgeTokenSymbol, BridgeTokenConfig> = {
  XCN: {
    symbol: 'XCN',
    sepolia: {
      // XCN is ERC-20 on Sepolia
      address: process.env.REACT_APP_SEPOLIA_XCN_ADDRESS!,
      decimals: 18,
      isNative: false,
    },
    goliath: {
      // XCN is *native* on Goliath (no address)
      address: null,
      decimals: Number(process.env.REACT_APP_XCN_RPC_DECIMALS ?? 18),
      isNative: true,
    },
  },
  ETH: {
    symbol: 'ETH',
    sepolia: {
      // ETH is native token on Sepolia
      address: null,
      decimals: 18,
      isNative: true,
    },
    goliath: {
      // ETH is ERC20 on Goliath
      address: process.env.REACT_APP_GOLIATH_ETH_ADDRESS!,
      decimals: 18,
      isNative: false,
    },
  },
  BTC: {
    symbol: 'BTC',
    sepolia: {
      address: process.env.REACT_APP_SEPOLIA_BTC_ADDRESS!,
      decimals: 8,
      isNative: false,
    },
    goliath: {
      address: process.env.REACT_APP_GOLIATH_BTC_ADDRESS!,
      decimals: 8,
      isNative: false,
    },
  },
  USDC: {
    symbol: 'USDC',
    sepolia: {
      address: process.env.REACT_APP_SEPOLIA_USDC_ADDRESS!,
      decimals: 6,
      isNative: false,
    },
    goliath: {
      address: process.env.REACT_APP_GOLIATH_USDC_ADDRESS!,
      decimals: 6,
      isNative: false,
    },
  },
};
```

---

## 6. Wallet + Provider Architecture

### 6.1 Wallet

Reuse existing wallet integration:

* Global wallet state: currently active account + chainId
* From Bridge page:

  * If wallet not connected: primary CTA = **Connect Wallet**
  * Once connected, determine “origin network” from user selection; show **Switch Network** if wallet chainId != origin chain

### 6.2 Multi-chain Providers

Frontend needs:

* **Signer provider**: the wallet-connected provider for the *current* chain (Sepolia or Goliath)
* **Read-only providers**: JSON-RPC providers for both chains, regardless of wallet chain

`src/services/chainProviders.ts`:

```ts
import { JsonRpcProvider } from 'ethers';

export const readonlyProviders = {
  [BridgeNetwork.SEPOLIA]: new JsonRpcProvider(
    process.env.REACT_APP_SEPOLIA_RPC_URL
  ),
  [BridgeNetwork.GOLIATH]: new JsonRpcProvider(
    process.env.REACT_APP_GOLIATH_RPC_URL
  ),
};
```

Use `useActiveWeb3React()` or equivalent to get wallet signer and chainId.

---

## 7. Bridge Page & Components

### 7.1 Routing

* Add route `/bridge` (or `/#/bridge` for HashRouter)
* Enable “Bridge” nav tab and mark as active when path starts with `/bridge`

### 7.2 Component Responsibilities

* `BridgePage`

  * Wrap in `AppBody`
  * Handles layout (form, status panel, history panel)
* `BridgeForm`

  * Manages origin/destination selection, token, amount
  * Validations (amount, balance, bridge paused, etc.)
  * Ties into `bridgeSlice` for state
* `NetworkSelector`

  * Shows “From [Network]” / “To [Network]”
  * Direction swap button
* `TokenSelector`

  * Dropdown of allowed symbols for origin chain
* `AmountInput`

  * Numeric input; drives 1:1 mirrored “To” amount
* `BridgeSummary`

  * Displays fees (0 for v1), ETA (e.g. “~3–5 minutes”), and disclaimers
* `BridgeStatusStepper`

  * Renders operation status (PENDING / CONFIRMING / AWAITING_RELAY / PROCESSING_DEST / COMPLETED / FAILED / DELAYED)
* `BridgeHistoryPanel`

  * Collapsible view of last N operations for current wallet

---

## 8. State Management (Redux)

### 8.1 Data Types

Mirror PRD’s `BridgeOperation` with UI-specific fields: 

```ts
export type BridgeDirection = 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA';

export type BridgeStatus =
  | 'PENDING_ORIGIN_TX'
  | 'CONFIRMING'
  | 'AWAITING_RELAY'
  | 'PROCESSING_DESTINATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'
  | 'DELAYED';

export interface BridgeOperation {
  id: string;                  // UUID
  direction: BridgeDirection;
  token: BridgeTokenSymbol;
  amountHuman: string;         // e.g. "100.0"
  amountAtomic: string;        // stringified integer, backend-decimal-aligned
  sender: string;
  recipient: string;
  originChainId: number;
  destinationChainId: number;
  originTxHash: string | null;
  destinationTxHash: string | null;
  depositId: string | null;
  withdrawId: string | null;
  status: BridgeStatus;
  createdAt: number;
  updatedAt: number;
  originConfirmations: number;
  requiredConfirmations: number;
  errorMessage: string | null;
  etaIso: string | null;       // from backend estimatedCompletionTime
}
```

### 8.2 Local Persistence

`bridge/localStorage.ts`:

* Use `localStorage["bridge:operations:v1"]` keyed per-address
* Save after any state update
* On app load, rehydrate & reconcile against backend `/bridge/status` for non-terminal operations

---

## 9. XCN Decimal Handling – Frontend Rules

From Goliath docs:

* **Inside EVM:** XCN native uses **8 decimals** (tinyxcns)
* **JSON-RPC + ethers:** represent XCN with **18-decimal** balances (weixcns)
* `1 tinyxcn = 10^10 weixcns`

**Frontend rule:**

* When interacting with RPC (via `ethers`), **treat XCN like a normal 18-decimal native token**:

  * Use `ethers.parseEther` for user inputs like `"1.5"` XCN
  * Use `ethers.formatEther` for display
* **Do not manually apply 10^10** in frontend when directly using `provider.getBalance` or sending native XCN; ethers + node handle the conversion.

Utility module (for clarity + future reuse):

```ts
// xcnDecimals.ts
import { ethers } from 'ethers';

export const XCN = {
  // input -> weixcns (18 decimals)
  parseUserInputToRpcAtomic: (amount: string) => ethers.parseEther(amount),

  // RPC atomic -> human readable string
  formatRpcAtomicToUser: (atomic: bigint) => ethers.formatEther(atomic),

  // For compatibility with backend if it ever talks tinyxcns
  tinyToRpcAtomic: (tiny: bigint) => tiny * 10_000_000_000n, // × 10^10
  rpcAtomicToTiny: (rpc: bigint) => rpc / 10_000_000_000n,   // ÷ 10^10
};
```

Frontend will only use the tiny⇔rpc helpers if backend ever returns raw tinyxcns for native XCN amounts (e.g. from event logs). Normal flow uses 18-decimal values.

---

## 10. Bridge Flows & Contract Calls

### 10.1 Same-wallet-only Enforcement

* **UI behaviour:** `recipient` is not configurable; always equals `connectedWalletAddress`.
* Hide advanced recipient field behind feature flag; with `REACT_APP_BRIDGE_ALLOW_CUSTOM_RECIPIENT=false`, never show “custom recipient” area.

Front-end still passes `destinationAddress` to contract:

* For Sepolia→Goliath deposit: `destinationAddress = sender`
* For Goliath→Sepolia burn: `destinationAddress = sender`

### 10.2 Sepolia → Goliath

Token-specific behaviour:

* **XCN, BTC, USDC (ERC20):**

  * Step 1: Check allowance, show **Approve [TOKEN]** if needed
  * Step 2: Call `BridgeSepolia.deposit(tokenAddress, amount, recipient)`

    * `amount` in token’s atomic units (18, 8, or 6 decimals)
* **ETH (native on Sepolia):**

  * **No ERC-20 approval**; deposit is payable.
  * Two options (depends on actual contract ABI; choose one and align with backend):

    * a) Use special function `depositNative(destinationAddress)` with `msg.value = amount`
    * b) Call `deposit(address(0), amount, destinationAddress)` with `msg.value = amount`
  * Frontend amount atomic = `ethers.parseEther(userInput)`

Implementation details:

```ts
// useBridgeDeposit.ts
if (tokenConfig.sepolia.isNative) {
  // ETH case
  const value = ethers.parseEther(amountHuman);
  // Option b) sentinel 0x0 as token
  const tx = await bridgeSepolia.deposit(
    ethers.ZeroAddress,
    value,
    recipient,
    { value }
  );
} else {
  // ERC20 case
  const amountAtomic = toAtomicAmount(amountHuman, tokenConfig.sepolia.decimals);
  const tx = await bridgeSepolia.deposit(
    tokenConfig.sepolia.address,
    amountAtomic,
    recipient
  );
}
```

### 10.3 Goliath → Sepolia

Token-specific behaviour:

* **XCN (native on Goliath):**

  * Use `BridgeGoliath.burnNative(destinationAddress)` with `msg.value = amountRpcAtomic`
  * Careful: RPC uses 18-dec; EVM uses 8-dec, but RPC/EVM mapping is handled by node/VM.
* **ETH, BTC, USDC (ERC20):**

  * Standard ERC20 approval + `BridgeGoliath.burn(tokenAddress, amount, recipient)`

Gas buffer:

* For **native assets** (Sepolia ETH, Goliath XCN), MAX button should leave buffer:

  * Sepolia ETH: e.g., `0.01 ETH` reserved
  * Goliath XCN (native): `0.01 XCN` reserved (as in PRD)

---

## 11. Validation Rules (UI)

Mirror PRD table but apply to our token semantics: 

* Conditions:

  * Wallet not connected → CTA: **Connect Wallet**
  * Network mismatch → CTA: **Switch Network to [Origin Network]**
  * Amount empty / 0 → disabled, message “Enter an amount”
  * Amount > balance → disabled, “Insufficient [TOKEN] balance”
  * Amount < min → disabled, “Amount too small”
  * Bridge paused (from backend `/health` + contract flags) → disabled, “Bridge is temporarily paused”
  * Approval needed → CTA: **Approve [TOKEN]**
  * Ready → CTA: **Bridge [TOKEN]**

Validation should run on every relevant change (debounced ~300ms).

---

## 12. Status Tracking & Backend Integration

### 12.1 Status Polling Hook

`useBridgeStatusPolling`:

* Input: `originTxHash` OR `depositId` OR `withdrawId`
* Poll `/bridge/status` every `REACT_APP_BRIDGE_STATUS_POLL_INTERVAL` ms (e.g., 5000 ms)
* Map backend status → `BridgeStatus` enum
* Update Redux `BridgeOperation` (including `originConfirmations`, `requiredConfirmations`, `etaIso`)

### 12.2 Backend Status Contract

Expect backend to respond like PRD’s example: 

```ts
export interface BridgeStatusResponse {
  operationId: string;
  direction: BridgeDirection;
  status: BridgeStatus;
  token: BridgeTokenSymbol;
  amount: string;  // atomic string (backend convention)
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
    mintedAt: string | null;
    completedAt: string | null;
  };
  estimatedCompletionTime: string | null; // ISO-8601
  error: string | null;
}
```

Map `estimatedCompletionTime` to human-friendly string (“~2 minutes remaining”) based on current local time.

### 12.3 History Integration

`useBridgeHistory`:

* `GET /bridge/history?address={wallet}&limit=...`
* Render last N operations in `BridgeHistoryPanel`
* Provide “View details” to re-open status stepper for an operation

---

## 13. ETA Display (Frontend)

Frontend doesn’t compute canonical ETA; it simply:

* Uses `estimatedCompletionTime` from backend
* If backend hasn’t computed it yet:

  * Shows static copy from PRD: “Estimated time: ~3–5 minutes” 
* If ETA is in the past and status not completed:

  * Display “Taking longer than expected…” with a subtle warning.

---

## 14. Testing (Frontend)

### Unit / Integration

* `bridgeSlice` reducer tests (status transitions, localStorage read/write)
* `useBridgeDeposit` tests:

  * ETH native path vs ERC20 path
  * XCN native path vs ERC20 XCN on Sepolia
* `useBridgeStatusPolling`:

  * Correct mapping of backend statuses to UI steps
  * ETA mapping
* `BridgeForm`:

  * Validation messaging
  * MAX behaviour for native tokens (gas buffer)

### E2E

* Happy path Sepolia→Goliath for each token
* Happy path Goliath→Sepolia for each token
* Same-wallet only: ensure there is **no** option for different recipient
* Network mismatch flows (Switch network CTAs)

---

# TID 2 — Backend (TypeScript Node.js)

**Project:** Goliath Bridge Status API & Relayer
**Repo:** `goliath-bridge-backend`

---

## 1. Purpose and Scope

Backend service suite that:

1. Tracks bridge operations between Sepolia and Goliath by reading events from bridge contracts.
2. Exposes a **Status API** and **History API** for the frontend:

   * Operation status
   * Confirmation counts
   * Chain tx hashes
   * **Estimated arrival time**
3. Provides a **Health API** for infra monitoring.
4. Runs on a **Linux server**, managed via **systemd**.
5. Implements token/decimal rules:

   * XCN’s EVM 8-dec vs JSON-RPC 18-dec behaviour on Goliath.
   * Sepolia ETH is native token; Goliath ETH is ERC20.
6. Enforces / surfaces **same-wallet semantics** (sender == recipient) for operations originating from the UI.

> Note: Per PRD, this backend *does not initiate* bridge transactions; it observes contracts and computes state. Frontend still sends txs via user wallets. 

---

## 2. High-Level Architecture

Single codebase, two logical processes:

* **API server** (`bridge-api`):

  * HTTP REST API (status, history, health, metrics)
  * Stateless; horizontally scalable
* **Worker / Relayer** (`bridge-relayer`):

  * Listens to `Deposit` (Sepolia) and `Withdraw` (Goliath) events
  * Waits for finality
  * Submits `mint` / `release` txs (if you also want relayer implementation here per PRD)
  * Updates DB with operation statuses + timestamps

Both share:

* PostgreSQL database
* Optional Redis (for job queue / locks)

---

## 3. Tech Stack

* **Runtime:** Node.js 20+
* **Language:** TypeScript (strict)
* **HTTP:** Fastify or Express (choose one; below assumes Fastify)
* **ORM:** Prisma or TypeORM (assume Prisma)
* **Web3:** `ethers@^6`
* **Background jobs:**

  * Simple mode: worker loop + DB locks
  * More advanced: `bullmq` + Redis
* **Config:** dotenv + typed config module
* **Metrics:** Prometheus-style /metrics endpoint using `prom-client`

---

## 4. `.env` and Configuration

### 4.1 `.env` Example

```bash
# General
NODE_ENV=production
PORT=8080

# Database
DATABASE_URL=postgresql://bridge_user:xxxx@localhost:5432/bridge_db

# Redis (optional for queue)
REDIS_URL=redis://localhost:6379

# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/XXX
GOLIATH_RPC_URL=https://testnet-rpc.goliath.net

# Chains
SEPOLIA_CHAIN_ID=11155111
GOLIATH_CHAIN_ID=8901

# Bridge contracts
BRIDGE_SEPOLIA_ADDRESS=0x...
BRIDGE_GOLIATH_ADDRESS=0x...

# Token addresses (match frontend)
SEPOLIA_XCN_ADDRESS=0x...
SEPOLIA_BTC_ADDRESS=0x...
SEPOLIA_USDC_ADDRESS=0x...

GOLIATH_WXCN_ADDRESS=0xd319Df5FA3efb42B5fe4c5f873A7049f65428877
GOLIATH_ETH_ADDRESS=0xF22914De280D7B60255859bA6933831598fB5DD6
GOLIATH_BTC_ADDRESS=0x3658049f0e9be1D2019652BfBe4EEBB42246Ea10
GOLIATH_USDC_ADDRESS=0xF568bE1D688353d2813810aA6DaF1cB1dCe38D7E

# Decimals (consistent with PRD + docs)
XCN_EVM_DECIMALS=8
XCN_RPC_DECIMALS=18
ETH_DECIMALS=18
BTC_DECIMALS=8
USDC_DECIMALS=6

# Finality thresholds
SEPOLIA_FINALITY_BLOCKS=12
GOLIATH_FINALITY_BLOCKS=6

# ETA configuration (seconds)
ETA_SEPOLIA_FINALITY_SEC=144     # 12 * 12s
ETA_GOLIATH_FINALITY_SEC=12      # 6 * 2s
ETA_RELAYER_BASE_SEC=30
ETA_MARGIN_SEC=120               # safety buffer

# Relayer signer (if relayer included)
RELAYER_PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RELAYER_MAX_GAS_GWEI=30

# Security / CORS
CORS_ALLOWED_ORIGINS=https://slingshot.goliath.net
```

### 4.2 Config Loader

`src/config.ts`:

* Use Zod to parse env and produce typed config:

  * `db`, `redis`, `chains`, `bridgeContracts`, `tokens`, `finality`, `eta`, `relayer`, `cors`

---

## 5. Data Model (PostgreSQL)

### 5.1 Tables

#### `bridge_operations`

```sql
CREATE TABLE bridge_operations (
  id UUID PRIMARY KEY,
  direction VARCHAR(32) NOT NULL, -- 'SEPOLIA_TO_GOLIATH' | 'GOLIATH_TO_SEPOLIA'
  token_symbol VARCHAR(16) NOT NULL, -- 'XCN' | 'ETH' | ...
  amount_atomic NUMERIC(78, 0) NOT NULL, -- canonical atomic units (see decimals section)
  sender VARCHAR(64) NOT NULL,
  recipient VARCHAR(64) NOT NULL,
  origin_chain_id BIGINT NOT NULL,
  destination_chain_id BIGINT NOT NULL,

  origin_tx_hash VARCHAR(80),
  destination_tx_hash VARCHAR(80),
  deposit_id VARCHAR(80),
  withdraw_id VARCHAR(80),

  status VARCHAR(32) NOT NULL,
  origin_block_number BIGINT,
  destination_block_number BIGINT,
  origin_confirmations INT DEFAULT 0,
  required_confirmations INT NOT NULL,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  deposited_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  destination_submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  estimated_completion_at TIMESTAMPTZ,
  is_same_wallet BOOLEAN NOT NULL DEFAULT TRUE  -- sender == recipient
);
```

#### `bridge_eta_stats` (optional, for dynamic ETA)

```sql
CREATE TABLE bridge_eta_stats (
  id SERIAL PRIMARY KEY,
  direction VARCHAR(32) NOT NULL,
  token_symbol VARCHAR(16) NOT NULL,
  duration_seconds INT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. Amount & Decimal Handling (Backend)

### 6.1 Canonical Internal Representation

To keep things sane:

* Store **all amounts in a canonical “token-atomic units”** representation.

  * For ERC-20 tokens: 10^decimals (from token contract)
  * For native tokens:

    * Sepolia ETH: use **wei** (10^18)
    * Goliath XCN: we have two systems:

      * EVM internal = 10^8 tinyxcns
      * JSON-RPC = 10^18 weixcns

**Backend canonical rule:**

* For tokens (including native XCN / ETH) we adopt the **RPC atomic decimals**:

  * XCN: 18-dec (“weixcns”)
  * ETH: 18-dec
  * BTC: 8-dec
  * USDC: 6-dec

This keeps backend aligned with frontend (which always deals in RPC units) and allows direct use of `ethers.parseUnits` / `formatUnits`.

### 6.2 Conversions for Goliath XCN Event Data

If Goliath bridge contracts emit events in **tinyxcns** for native XCN (likely, per doc examples):

* When parsing event `amount` for XCN on Goliath:

  * Let `amountTiny: bigint` = event.amount
  * Convert to RPC atomic: `amountRpc = amountTiny * 10n ** 10n` (× 10¹⁰)
* When verifying invariants that involve amounts from RPC calls (like `eth_getBalance` in weixcns), you will already have 18-dec values; no conversion needed.

Utility module:

```ts
// xcnDecimals.ts (backend)
export const XCN_DECIMALS_EVM = BigInt(process.env.XCN_EVM_DECIMALS ?? '8');   // 8
export const XCN_DECIMALS_RPC = BigInt(process.env.XCN_RPC_DECIMALS ?? '18'); // 18
const FACTOR = 10n ** (XCN_DECIMALS_RPC - XCN_DECIMALS_EVM);                  // 10^10

export const xcnTinyToRpcAtomic = (tiny: bigint) => tiny * FACTOR;
export const xcnRpcAtomicToTiny = (rpc: bigint) => rpc / FACTOR;
```

### 6.3 Sepolia ETH

* Native ETH on Sepolia uses standard ETH semantics:

  * `msg.value` and `eth_getBalance` both in wei (18 decimals)
* No special conversion necessary.

---

## 7. Chain Clients & Event Subscribers

### 7.1 Chain Clients

`src/chains/providers.ts`:

```ts
import { JsonRpcProvider, Wallet } from 'ethers';

export const sepoliaProvider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
export const goliathProvider = new JsonRpcProvider(process.env.GOLIATH_RPC_URL);

export const relayerWalletSepolia = new Wallet(
  process.env.RELAYER_PRIVATE_KEY!,
  sepoliaProvider
);
export const relayerWalletGoliath = new Wallet(
  process.env.RELAYER_PRIVATE_KEY!,
  goliathProvider
);
```

### 7.2 Event Watchers

Worker service responsibilities:

* **Sepolia watcher**:

  * Subscribe to `BridgeSepolia` `Deposit` events
  * On event:

    * Derive direction = `SEPOLIA_TO_GOLIATH`
    * Lookup token from `event.token`
    * Convert `amount` to canonical atomic units
    * Create `bridge_operations` row with:

      * status = `PENDING_ORIGIN_TX`
      * `deposited_at` = block timestamp
      * `origin_tx_hash` = log transaction hash
      * `sender`, `destinationAddress`
      * `is_same_wallet = (sender == destinationAddress)`
* **Goliath watcher**:

  * Subscribe to `BridgeGoliath` `Withdraw` events
  * On event:

    * direction = `GOLIATH_TO_SEPOLIA`
    * Convert amount (including XCN tiny→rpc conversion if needed)
    * Insert operation row analogous to above

### 7.3 Confirmations & Finality

Periodic job (e.g. every 5 seconds):

* For operations with `status` in:

  * `PENDING_ORIGIN_TX` or `CONFIRMING`:

    * Fetch origin tx receipt
    * Compute `origin_confirmations = latestBlock - origin_block_number + 1`
    * Once confirmations ≥ `required_confirmations`:

      * Set `status = AWAITING_RELAY`
      * Set `finalized_at = now()`

---

## 8. Relayer Logic (Optional / If included)

Per PRD, relayer service:

* For operations in `AWAITING_RELAY`:

  * Construct message hash with fields:

    * sourceChainId, destChainId, operationId, token, recipient, amount, nonce
  * Sign message with validator keys
  * Submit `mint` (Goliath) or `release` (Sepolia) tx:

    * For Sepolia→Goliath: call `BridgeGoliath.mint(...)`
    * For Goliath→Sepolia: call `BridgeSepolia.release(...)`
  * On tx submission:

    * Set `status = PROCESSING_DESTINATION`
    * `destination_submitted_at = now()`
    * Save `destination_tx_hash`
  * On confirmation:

    * Set `status = COMPLETED`
    * `completed_at = now()`

Retries:

* If tx stuck or fails:

  * Retry up to configured max with increasingly higher gas
  * On permanent failure: set `status = FAILED`, `error_message = reason`

---

## 9. ETA Calculation Model

This is what powers “estimate arrival time and let know”.

### 9.1 Static Baseline

From PRD performance targets: P95 completion ≤ 5 minutes, P99 ≤ 10 minutes. 

We create baseline ETA for each direction:

```ts
interface EtaBaselineConfig {
  finalitySecondsOrigin: number;
  finalitySecondsDest: number;   // mostly negligible for UX
  relayerBaseSeconds: number;
  marginSeconds: number;
}

const etaConfig: Record<BridgeDirection, EtaBaselineConfig> = {
  SEPOLIA_TO_GOLIATH: {
    finalitySecondsOrigin: Number(process.env.ETA_SEPOLIA_FINALITY_SEC ?? 144),
    finalitySecondsDest: Number(process.env.ETA_GOLIATH_FINALITY_SEC ?? 12),
    relayerBaseSeconds: Number(process.env.ETA_RELAYER_BASE_SEC ?? 30),
    marginSeconds: Number(process.env.ETA_MARGIN_SEC ?? 120),
  },
  GOLIATH_TO_SEPOLIA: {
    finalitySecondsOrigin: Number(process.env.ETA_GOLIATH_FINALITY_SEC ?? 12),
    finalitySecondsDest: Number(process.env.ETA_SEPOLIA_FINALITY_SEC ?? 144),
    relayerBaseSeconds: Number(process.env.ETA_RELAYER_BASE_SEC ?? 30),
    marginSeconds: Number(process.env.ETA_MARGIN_SEC ?? 120),
  },
};
```

### 9.2 Dynamic Adjustment

Optionally use `bridge_eta_stats`:

* On every completed operation, compute `duration_seconds = completed_at - deposited_at`

* Insert into `bridge_eta_stats`

* For ETA computation, read latest N (e.g. 100) durations per direction & token and compute:

* `p50`, `p90`

* Then clamp between min and max allowed to avoid weird outliers.

### 9.3 Algorithm

When a new operation is created (on first event ingestion):

```ts
function computeInitialEta(direction: BridgeDirection, now: Date): Date {
  const cfg = etaConfig[direction];
  const base =
    cfg.finalitySecondsOrigin +
    cfg.relayerBaseSeconds +
    cfg.marginSeconds;
  return new Date(now.getTime() + base * 1000);
}
```

As operation progresses:

* While status `PENDING_ORIGIN_TX` / `CONFIRMING`:

  * Recompute ETA based on:

    * Remaining confirmations:

      * `remaining = requiredConfirmations - originConfirmations`
      * `estRemainingFinality = remaining * avgBlockTime`
    * plus `relayerBaseSeconds + marginSeconds`
* After `AWAITING_RELAY`:

  * ETA = `now + relayerBaseSeconds + marginSeconds` (if not already set)
* After `PROCESSING_DESTINATION`:

  * ETA = `destination_submitted_at + marginSeconds` (if not completed yet)

If current time > ETA and still not completed:

* Mark status as `DELAYED` (if >10 min) or `EXPIRED` (>60 min), as per PRD. 

---

## 10. HTTP API Design

Base path: `/api/v1`

### 10.1 `GET /bridge/status`

Query params:

* `originTxHash` OR `depositId` OR `withdrawId` (exactly one must be present)

Operation:

* Resolve to `bridge_operations` row (join on matching field)
* Return JSON:

```ts
interface BridgeStatusApiResponse {
  operationId: string;
  direction: BridgeDirection;
  status: BridgeStatus;
  token: BridgeTokenSymbol;
  amount: string;                 // atomic (string)
  amountFormatted: string;        // human-readable (using token decimals)
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
  estimatedCompletionTime: string | null; // ISO 8601
  error: string | null;
  isSameWallet: boolean;
}
```

HTTP codes:

* 200 – operation found
* 404 – `OPERATION_NOT_FOUND`
* 400 – validation errors
* 500 – internal errors

### 10.2 `GET /bridge/history`

Query params:

* `address`: required
* `limit`: optional (default 10, max 100)
* `offset`: optional (default 0)
* `status`: optional filter
* `direction`: optional filter

Response:

```ts
interface BridgeHistoryApiResponse {
  operations: BridgeStatusApiResponse[]; // same shape as single status
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

### 10.3 `GET /health`

Return:

* Service status (`healthy` / `unhealthy`)
* Chain connectivity + lag
* Relayer queue depth
* Latest processed blocks

Example payload as in PRD. 

### 10.4 `GET /metrics`

* Prometheus text

  * Counters: `bridge_operations_total{direction,status}`, `bridge_errors_total{stage}`, etc.
  * Gauges: `bridge_pending_operations`, `bridge_chain_block_lag{chain}`, etc.

---

## 11. Same-wallet-only Semantics (Backend)

Even though restriction is enforced in the frontend, backend:

* Stores `is_same_wallet = (sender.toLowerCase() === recipient.toLowerCase())`
* **Does not** reject events with different recipient (contracts may allow them); instead:

  * Flags them as `is_same_wallet = false`
  * Optional: filter them out in `/bridge/history?address=...`:

    * Only show operations where:

      * `sender = address` **and** `is_same_wallet = true`
      * OR `recipient = address` **and** `is_same_wallet = true`

This ensures the UI only surfaces same-wallet flows, while backend still monitors all activity for safety and reconciliation.

---

## 12. Linux Deployment & systemd

### 12.1 Build Outputs

* `npm run build`:

  * Compiles TypeScript into `dist/`
* Entry points:

  * API: `dist/api/server.js`
  * Worker: `dist/worker/relayer.js`

### 12.2 systemd Unit Files

#### `bridge-api.service`

```ini
[Unit]
Description=Goliath Bridge API
After=network.target

[Service]
WorkingDirectory=/opt/goliath-bridge-backend
ExecStart=/usr/bin/node dist/api/server.js
Environment=NODE_ENV=production
EnvironmentFile=/etc/goliath-bridge-backend.env
Restart=always
RestartSec=5
User=bridge
Group=bridge

[Install]
WantedBy=multi-user.target
```

#### `bridge-relayer.service`

```ini
[Unit]
Description=Goliath Bridge Relayer
After=network.target bridge-api.service

[Service]
WorkingDirectory=/opt/goliath-bridge-backend
ExecStart=/usr/bin/node dist/worker/relayer.js
Environment=NODE_ENV=production
EnvironmentFile=/etc/goliath-bridge-backend.env
Restart=always
RestartSec=5
User=bridge
Group=bridge

[Install]
WantedBy=multi-user.target
```

Usage:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bridge-api.service bridge-relayer.service
sudo systemctl start bridge-api.service bridge-relayer.service
```

Logs via `journalctl -u bridge-api -f` etc.

---

## 13. Security & Validation

* Input validation with Zod (query params, path params)
* CORS restricted to configured frontend origin(s)
* No private keys in logs
* For relayer:

  * Enforce whitelist of bridge contract addresses
  * Validate token addresses against known list before signing / submitting
* For XCN:

  * Clearly distinguish units in internal logs:

    * `amount_rpc_atomic`, `amount_tiny` when relevant

---

## 14. Testing (Backend)

### Unit

* Decimal conversions (XCN tiny ↔ RPC 18-dec)
* ETA computation for different statuses / directions
* Status mapping from DB row → API response

### Integration

* Mock RPC providers (or point to dev chains)
* Simulate `Deposit` and `Withdraw` events
* Verify database writes & status updates
* Test API endpoints end-to-end

### Load

* Simulate ~100 ops/hour, ensure:

  * Status API P95 < 200ms
  * Worker keeps up (no long queue)

---

## 15. How Frontend & Backend Work Together

* Frontend sends user tx via wallet
* On first `Deposit`/`Withdraw` event, backend records an operation and computes an **initial ETA**.
* Frontend:

  * Immediately displays local stepper with origin tx hash
  * Starts polling `/bridge/status`
  * Shows ETA as `estimatedCompletionTime` rendered as “~N minutes”
* As confirmations increase and relayer acts, backend updates status and ETA, which the frontend reflects live.

Result: bridge UI and backend status/ETA work in lockstep, both written in TypeScript, with consistent decimals, same-wallet semantics, and Linux/systemd-friendly deployment.

