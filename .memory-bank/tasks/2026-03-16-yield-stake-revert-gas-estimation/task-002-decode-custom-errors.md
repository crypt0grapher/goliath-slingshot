# Task 002: Decode Custom Solidity Error Selectors in Error Messages

## Context
The StakedXCN contract uses custom Solidity errors (ZeroAmount, InsufficientBalance, InsufficientContractBalance, TransferFailed) instead of require() strings. The Hiero relay returns these as `CONTRACT_REVERT_EXECUTED` with the error selector in the `data` field. The current `parseTransactionError()` function in `src/hooks/yield/useStake.ts` does not decode custom errors — it falls through to showing the raw relay message like `[Request ID: ...] execution reverted: CONTRACT_REVERT_EXECUTED`.

The error selectors are:
- `0x1f2a2005` → ZeroAmount()
- `0xcf479181` → InsufficientBalance(uint256,uint256)
- `0xf51b158c` → InsufficientContractBalance(uint256,uint256)
- `0x3204506f` → TransferFailed()

The relay wraps all errors with `[Request ID: <uuid>] ` prefix.

## Task

1. Add an error selector map to `src/constants/staking.ts`:
   ```
   STAKING_ERROR_SELECTORS: Record<string, string>
   ```
   Map each 4-byte selector (lowercase, with 0x prefix) to a user-friendly i18n key or English string.

2. Rewrite `parseTransactionError()` in `src/hooks/yield/useStake.ts`:
   - First, strip the `[Request ID: <uuid>]` prefix from `err.message` using a regex
   - Check `err.data` (string) or `err.error?.data` (nested, common in ethers.js v5) for a hex string starting with a known selector
   - If a known selector is found, return the mapped human-readable message
   - If `err.reason` exists and is not `"execution reverted: CONTRACT_REVERT_EXECUTED"`, use it (preserves behavior for require() strings)
   - If `err.code === 4001` or `ACTION_REJECTED`, return "Transaction rejected by user" (preserve existing)
   - Otherwise, return the cleaned message (without Request ID prefix), truncated to 200 chars

3. Add i18n keys for error messages (English + Russian at minimum):
   - `yield.errorZeroAmount` → "Amount must be greater than zero" / "Сумма должна быть больше нуля"
   - `yield.errorInsufficientBalance` → "Insufficient stXCN balance" / "Недостаточный баланс stXCN"
   - `yield.errorInsufficientContractBalance` → "Insufficient contract balance — try a smaller amount" / "Недостаточный баланс контракта — попробуйте меньшую сумму"
   - `yield.errorTransferFailed` → "Transfer failed" / "Перевод не удался"

## Blockers
- No blockers (can be done in parallel with task-001)

## Acceptance Checklist
- [ ] `STAKING_ERROR_SELECTORS` map exported from constants
- [ ] `parseTransactionError` decodes `0x1f2a2005` → user-friendly "Amount must be greater than zero"
- [ ] `parseTransactionError` decodes `0xcf479181` → "Insufficient stXCN balance"
- [ ] `parseTransactionError` strips `[Request ID: uuid]` prefix from all messages
- [ ] `parseTransactionError` preserves existing behavior for user rejection (code 4001)
- [ ] `parseTransactionError` preserves existing behavior for require() reason strings
- [ ] i18n keys added for English and Russian
- [ ] Unit tests cover all 4 custom error selectors
- [ ] Unit tests cover Request ID stripping
- [ ] Unit tests cover fallback to generic message for unknown selectors
- [ ] Existing tests still pass
