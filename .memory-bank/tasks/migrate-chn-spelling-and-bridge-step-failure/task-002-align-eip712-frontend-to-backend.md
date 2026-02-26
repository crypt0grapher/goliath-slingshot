# Align Frontend EIP-712 Schema to Match Backend

## Context
The bridge step in the Migrate tab requires an EIP-712 typed data signature. The frontend signs with one domain/type schema, but the backend (`goliath-bridge-backend`) verifies with a different schema. This mismatch causes `SIGNATURE_MISMATCH` errors when the backend `verifyTypedData` call recovers a different address than expected.

The backend schema is the source of truth (already deployed and tested). The frontend must be updated to match.

- Frontend file: `src/hooks/migration/useMigrationTransactions.ts` (lines 483-516)
- Backend file: `~/goliath/goliath-bridge-backend/src/api/routes/migration.ts` (lines 16-31)

### Backend EIP-712 Schema (target)

**Domain:**
```js
{ name: 'GoliathBridge', version: '1' }
```
No `chainId`, no `verifyingContract`.

**Types:**
```js
StakePreference: [
  { name: 'senderAddress', type: 'address' },
  { name: 'recipientAddress', type: 'address' },
  { name: 'amountAtomic', type: 'string' },
  { name: 'stakeOnGoliath', type: 'bool' },
  { name: 'idempotencyKey', type: 'string' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'string' },
]
```

### Current Frontend EIP-712 Schema (broken)

**Domain:**
```js
{ name: 'CoolSwap Migration', version: '1', chainId: 11155111, verifyingContract: '0xA9FD...' }
```

**Types (differences):**
- `sender` (should be `senderAddress`)
- `recipient` (should be `recipientAddress`)
- `amount` with type `uint256` (should be `amountAtomic` with type `string`)
- `nonce` with type `uint256` (should be type `string`)
- Includes `EIP712Domain` in types array (should be omitted; `eth_signTypedData_v4` handles domain separately)

## Task
Update `src/hooks/migration/useMigrationTransactions.ts` to align the EIP-712 typed data with the backend:

1. **Domain** (around line 483): Change to `{ name: 'GoliathBridge', version: '1' }`. Remove `chainId` and `verifyingContract`.

2. **Types** (around line 490): Remove the `EIP712Domain` entry. Update `StakePreference` fields:
   - `sender` -> `senderAddress`
   - `recipient` -> `recipientAddress`
   - `amount` (uint256) -> `amountAtomic` (string)
   - `nonce` (uint256) -> `nonce` (string)

3. **Message** (around line 508): Update the message object keys to match new field names:
   - `sender: account` -> `senderAddress: account`
   - `recipient: account` -> `recipientAddress: account`
   - `amount: bridgeAmount` -> `amountAtomic: bridgeAmount`
   - `nonce: nonce` -> `nonce: String(nonce)` (convert number to string)

4. **EIP712 constants** (lines 42-45): Update `EIP712_DOMAIN_NAME` from `'CoolSwap Migration'` to `'GoliathBridge'`.

5. Verify the `eth_signTypedData_v4` call at line 527 still works with the updated schema (it should; the format is standard).

## Blockers
No blockers (can be done independently of backend deployment).

## Acceptance Checklist
- [ ] EIP-712 domain uses `name: 'GoliathBridge'`, `version: '1'` only
- [ ] EIP-712 types use field names `senderAddress`, `recipientAddress`, `amountAtomic`
- [ ] EIP-712 `nonce` type is `string`, not `uint256`
- [ ] `EIP712Domain` is NOT included in the types object (wallet handles it via domain param)
- [ ] Message object keys match the type field names exactly
- [ ] The `eth_signTypedData_v4` JSON payload serializes correctly
- [ ] Project builds without errors
- [ ] Existing tests pass
- [ ] Code follows the project's style
