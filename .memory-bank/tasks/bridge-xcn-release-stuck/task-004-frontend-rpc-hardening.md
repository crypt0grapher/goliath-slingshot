# Harden Frontend Sepolia RPC: Sequential RPC List with Chainstack Primary

## Context
The CoolSwap-interface bridge uses free-tier Sepolia RPCs that get rate-limited (429) under the bridge's polling load:
- Current primary: Alchemy demo key (`https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt`)
- Current fallback: PublicNode (`https://ethereum-sepolia-rpc.publicnode.com`)

The backend already uses the paid Chainstack RPC (`https://ethereum-sepolia.core.chainstack.com/994184e51c801ad4cdcaee72e84c28ed`) but the frontend doesn't use it at all.

**Solution:** Replace the single primary + single fallback model with a sequential RPC list, ordered by reliability. Chainstack (paid, no rate limits) goes first. On failure, cycle to the next RPC in the list.

Key files:
- `src/config/bridgeConfig.ts` — RPC configuration (currently `rpcUrl` + `rpcUrlFallback`)
- `src/services/bridgeProviders.ts` — Provider creation with fallback logic
- `src/hooks/bridge/useBridgeBalances.ts` — Balance polling intervals
- `src/hooks/bridge/useBridgeStatusPolling.ts` — Status polling intervals
- `.env` — Environment variables

## Task

### 1. Update `bridgeConfig.ts` to support a sequential RPC list

Replace the `rpcUrl` + `rpcUrlFallback` pair with `rpcUrls: string[]`:

```typescript
// bridgeConfig.ts
sepolia: {
  chainId: 11155111 as const,
  rpcUrls: parseRpcUrls(
    process.env.REACT_APP_SEPOLIA_RPC_URLS ||
    process.env.REACT_APP_SEPOLIA_RPC_URL ||
    'https://ethereum-sepolia.core.chainstack.com/994184e51c801ad4cdcaee72e84c28ed'
  ),
  // ... rest unchanged
}
```

Where `parseRpcUrls` splits a comma-separated string:
```typescript
function parseRpcUrls(raw: string): string[] {
  return raw.split(',').map(u => u.trim()).filter(Boolean);
}
```

Keep `rpcUrl` and `rpcUrlFallback` as computed getters for backwards compatibility:
```typescript
get rpcUrl() { return this.rpcUrls[0]; }
get rpcUrlFallback() { return this.rpcUrls[1] || ''; }
```

### 2. Update `.env` with ordered RPC sequence

```env
REACT_APP_SEPOLIA_RPC_URLS="https://ethereum-sepolia.core.chainstack.com/994184e51c801ad4cdcaee72e84c28ed,https://eth-sepolia.g.alchemy.com/v2/KFAOxpXlOpyh5fM-e-M08pDV8thw0CDt,https://ethereum-sepolia-rpc.publicnode.com"
```

Order:
1. **Chainstack** (paid, reliable, no rate limits) — primary
2. **Alchemy** (has key, moderate limits) — first fallback
3. **PublicNode** (free, rate limited) — last resort

### 3. Update `bridgeProviders.ts` to cycle through the RPC list

Replace the binary primary/fallback switch with a sequential cycle:

```typescript
let _currentRpcIndex = 0;

async function validateSepoliaProvider(): Promise<void> {
  const rpcUrls = bridgeConfig.sepolia.rpcUrls;

  for (let i = _currentRpcIndex; i < rpcUrls.length; i++) {
    try {
      _sepoliaProvider = createSepoliaProvider(rpcUrls[i]);
      await _sepoliaProvider.getBlockNumber();
      _currentRpcIndex = i;
      _sepoliaValidated = true;
      if (i > 0) {
        console.warn(`[BridgeProviders] Using Sepolia RPC #${i}: ${rpcUrls[i]}`);
      }
      return;
    } catch (err: any) {
      console.warn(`[BridgeProviders] Sepolia RPC #${i} failed:`, rpcUrls[i], err?.message);
      continue;
    }
  }
  // All RPCs failed — use the last one anyway and let individual calls handle errors
  _sepoliaProvider = createSepoliaProvider(rpcUrls[rpcUrls.length - 1]);
  _currentRpcIndex = rpcUrls.length - 1;
  _sepoliaValidated = true;
}
```

On RPC failure in `getNativeBalance`/`getTokenBalance`/`getTokenAllowance`:
- Increment `_currentRpcIndex` and revalidate (try the next RPC in sequence)
- Retry the call once with the new provider
- If already on the last RPC, throw

Add a **5-minute cooldown** to periodically retry higher-priority RPCs:
```typescript
let _lastPromotionCheck = 0;
const PROMOTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function maybePromotePrimaryRpc(): Promise<void> {
  if (_currentRpcIndex === 0) return; // Already on primary
  if (Date.now() - _lastPromotionCheck < PROMOTION_COOLDOWN_MS) return;
  _lastPromotionCheck = Date.now();

  try {
    const testProvider = createSepoliaProvider(bridgeConfig.sepolia.rpcUrls[0]);
    await testProvider.getBlockNumber();
    // Primary is back — switch to it
    _sepoliaProvider = testProvider;
    _currentRpcIndex = 0;
    console.log('[BridgeProviders] Promoted back to primary Sepolia RPC');
  } catch {
    // Primary still down, stay on current
  }
}
```

Call `maybePromotePrimaryRpc()` inside `getNativeBalance`/`getTokenBalance` on successful calls.

### 4. Reduce polling intervals

In `useBridgeBalances.ts`:
- Normal polling: 2000ms → 5000ms
- Aggressive polling: 500ms → 2000ms
- Aggressive duration: 15s → 10s
- Add error-based skip: if last fetch threw, skip the next cycle

In `useBridgeStatusPolling.ts`:
- Add exponential back-off on consecutive 404 responses:
  - Start at configured interval (default 5000ms from .env)
  - Double on each consecutive null (404) response
  - Cap at 30000ms
  - Reset to base interval on any successful response
- Log back-off interval for debugging

## Blockers
- No blockers (independent of backend deployment)

## Acceptance Checklist
- [ ] `bridgeConfig.ts` supports `rpcUrls` as comma-separated list
- [ ] `.env` updated: Chainstack first, Alchemy second, PublicNode third
- [ ] `bridgeProviders.ts` cycles through RPC list sequentially on failure
- [ ] 5-minute cooldown promotes back to primary when it recovers
- [ ] Backwards compatible — `rpcUrl` / `rpcUrlFallback` still accessible
- [ ] Balance polling intervals reduced (5000ms normal, 2000ms aggressive)
- [ ] Status polling uses exponential back-off on 404
- [ ] No 429 errors under normal bridge operation
- [ ] Balance display still updates within ~5 seconds of a bridge transaction
- [ ] Status transitions (PENDING → CONFIRMING → COMPLETED) still detected promptly
- [ ] Tests are written and passing
- [ ] Code follows the project's style
