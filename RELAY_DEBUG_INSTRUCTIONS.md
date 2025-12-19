# Bridge Relay Debug Instructions

## Issue Summary

Bridge operations from Sepolia to Goliath are stuck at `AWAITING_RELAY` status. The frontend is correctly polling and receiving this status from the API, but the relay/minting step never completes.

**Affected Operation:**
- Operation ID: `7f5bd061-2ece-4919-8757-61e741ccb5c4`
- Origin TX: `0x93c215c85043d22324429d26a3c840051cfb08f2a5976d038ee14357637929fe`
- Direction: `SEPOLIA_TO_GOLIATH`
- Token: `ETH`
- Amount: `7373000000000000` (0.007373 ETH)
- Origin Confirmations: 10 (finalized)
- Status: `AWAITING_RELAY` (stuck)

## What Should Be Happening

The `TransactionSubmitter` worker in `/Users/alex/goliath/goliath-bridge-backend/src/worker/transactionSubmitter.ts` should:

1. Query operations with status `AWAITING_RELAY` (ordered by `finalizedAt ASC`)
2. Update status to `PROCESSING_DESTINATION`
3. Call `bridgeGoliath.mint(depositId, tokenAddress, recipient, amount)` on Goliath
4. Wait for receipt and update status to `COMPLETED`

## Diagnostic Steps

### 1. Check if Relayer Service is Running

```bash
sudo systemctl status bridge-relayer
```

If not running:
```bash
sudo systemctl start bridge-relayer
sudo journalctl -u bridge-relayer -f
```

### 2. Check Recent Relayer Logs

```bash
sudo journalctl -u bridge-relayer --since "1 hour ago" | grep -i "error\|failed\|exception"
```

Look for:
- Transaction submission errors
- RPC connection failures
- Database errors
- "insufficient funds" errors

### 3. Check Health Endpoint

```bash
curl -s https://testnet.mirrornode.goliath.net/bridge/api/v1/health | jq
```

Expected response:
```json
{
  "status": "healthy",
  "chains": {
    "sepolia": { "connected": true, "lag": <number> },
    "goliath": { "connected": true, "lag": <number> }
  },
  "relayer": {
    "pendingOperations": <number>,
    "lastProcessedAt": "<timestamp>"
  }
}
```

**Red flags:**
- `status: "unhealthy"`
- `connected: false` for either chain
- `lastProcessedAt` is very old (hours/days ago)
- High `pendingOperations` count with no movement

### 4. Check Relayer Wallet Balance

The relayer needs native tokens on Goliath to submit mint transactions.

```bash
# Check Goliath balance (relayer address from config)
curl -s https://rpc.testnet.goliath.net -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xE708B75F7b6914479E63D3897bEF9e0dedcA3640","latest"],"id":1}' | jq
```

If balance is low/zero, fund the relayer wallet.

### 5. Query Database for Stuck Operations

```bash
psql bridge_db -c "
SELECT
  id,
  direction,
  status,
  \"finalizedAt\",
  \"retryCount\",
  \"errorMessage\",
  \"amountAtomic\"
FROM bridge_operations
WHERE status = 'AWAITING_RELAY'
ORDER BY \"finalizedAt\" ASC
LIMIT 20;
"
```

**Check for:**
- `amountAtomic` is NULL or '0' (would cause validation failure)
- `retryCount` > 0 with `errorMessage` (shows what's failing)
- Very old `finalizedAt` timestamps

### 6. Check for Failed Operations

```bash
psql bridge_db -c "
SELECT
  id,
  direction,
  \"originTxHash\",
  \"retryCount\",
  \"errorMessage\",
  \"updatedAt\"
FROM bridge_operations
WHERE status = 'FAILED'
ORDER BY \"updatedAt\" DESC
LIMIT 10;
"
```

### 7. Check Block Processing Status

```bash
psql bridge_db -c "SELECT * FROM processed_blocks;"
```

Compare these block numbers to current chain heights. If they're significantly behind, the EventWatcher may be stuck.

## Likely Root Causes

### Cause 1: TransactionSubmitter Not Running

**Symptom:** Operations reach `AWAITING_RELAY` but never progress
**Fix:** Restart the bridge-relayer service

```bash
sudo systemctl restart bridge-relayer
```

### Cause 2: Relayer Out of Gas

**Symptom:** Logs show "insufficient funds" errors
**Fix:** Send native tokens to the relayer address on Goliath

### Cause 3: RPC Rate Limiting

**Symptom:** Repeated RPC errors in logs, especially from Alchemy
**Fix:**
- Check Alchemy dashboard for rate limit hits
- Consider upgrading Alchemy plan or adding backup RPC

### Cause 4: Gas Price Too Low

**Symptom:** Transactions fail with "gas price too low" or timeout
**Location:** `src/worker/transactionSubmitter.ts` lines 93-96
**Current config:** `RELAYER_GOLIATH_GAS_GWEI=750`

**Fix:** Increase gas price in environment:
```bash
# Edit /etc/goliath-bridge/backend.env
RELAYER_GOLIATH_GAS_GWEI=1000

# Restart service
sudo systemctl restart bridge-relayer
```

### Cause 5: Contract Address Misconfiguration

**Symptom:** Transactions fail with "not a contract" or revert immediately
**Check:**
```bash
grep BRIDGE_.*_ADDRESS /etc/goliath-bridge/backend.env
```

Verify these match the deployed bridge contracts.

### Cause 6: Database Connection Issues

**Symptom:** Service logs show PostgreSQL errors
**Fix:**
```bash
sudo systemctl status postgresql
sudo systemctl restart postgresql
sudo systemctl restart bridge-relayer
```

## Manual Retry for Stuck Operation

If the service is running but a specific operation is stuck, you can manually trigger a retry:

```bash
psql bridge_db -c "
UPDATE bridge_operations
SET
  status = 'AWAITING_RELAY',
  \"retryCount\" = 0,
  \"errorMessage\" = NULL,
  \"updatedAt\" = NOW()
WHERE id = '7f5bd061-2ece-4919-8757-61e741ccb5c4';
"
```

Then monitor the logs:
```bash
sudo journalctl -u bridge-relayer -f | grep "7f5bd061"
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/worker/relayer.ts` | Main orchestrator - starts all workers |
| `src/worker/eventWatcher.ts` | Detects deposit/withdraw events |
| `src/worker/finalityTracker.ts` | Monitors confirmations |
| `src/worker/transactionSubmitter.ts` | **EXECUTES RELAY** - this is where minting happens |
| `src/config/index.ts` | Environment configuration |
| `src/db/operations.ts` | Database operations |

## Configuration Reference

Key environment variables in `/etc/goliath-bridge/backend.env`:

```
# RPC endpoints
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
GOLIATH_RPC_URL=https://rpc.testnet.goliath.net

# Bridge contracts
BRIDGE_SEPOLIA_ADDRESS=0x...
BRIDGE_GOLIATH_ADDRESS=0x...

# Relayer wallet (needs gas on both chains)
RELAYER_PRIVATE_KEY=0x...

# Gas settings
RELAYER_GOLIATH_GAS_GWEI=750
RELAYER_SEPOLIA_GAS_GWEI=20

# Finality settings
SEPOLIA_FINALITY_BLOCKS=10
GOLIATH_FINALITY_BLOCKS=6

# Retry settings
RELAYER_MAX_RETRIES=3
RELAYER_RETRY_DELAY_MS=30000
```

## Expected Resolution

After identifying and fixing the root cause:

1. The TransactionSubmitter should pick up the stuck operation
2. Status should transition: `AWAITING_RELAY` → `PROCESSING_DESTINATION` → `COMPLETED`
3. The frontend polling will detect the status change and show completion
4. User will see "Minting on Goliath" complete and "Complete" status

## Contact

If the issue persists after these steps, check:
1. Contract state on Goliath (is the bridge paused?)
2. Whether the deposit was already minted (check for duplicate processing)
3. Smart contract logs for the specific depositId
