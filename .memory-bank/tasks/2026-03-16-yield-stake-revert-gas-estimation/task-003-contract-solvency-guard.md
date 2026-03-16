# Task 003: Add Contract Solvency Warning to Yield Page

## Context
The StakedXCN contract has a reward deficit: total rebased stXCN supply (15,572,937 XCN equivalent) exceeds the contract's native XCN balance (15,379,795 XCN) by ~193,142 XCN. This means if all stXCN holders tried to unstake simultaneously, the last ~193K XCN worth of unstakes would revert with `InsufficientContractBalance`.

The contract owner must call `fund()` periodically to cover accrued rewards. Meanwhile, users should be warned when the contract balance is low relative to what they're trying to unstake.

The relevant data is already available:
- `totalSupply()` is polled by `useYieldData`
- Contract native balance can be fetched via `eth_getBalance` on the contract address

## Task

1. Add contract balance polling to `useYieldData` (or a new dedicated hook):
   - Fetch `provider.getBalance(STAKED_XCN_ADDRESS)` during protocol data polling
   - Store as `contractBalance` in Redux yield slice (new field)
   - Use the read-only Goliath provider (not wallet provider) for this call

2. Add a solvency check to `UnstakeForm`:
   - Compare `contractBalance` (in wad) with the user's `parsedAmount` for unstake
   - If `parsedAmount / NATIVE_SCALE > contractBalance` (i.e., the unstake would exceed contract balance in tinybar), show a warning banner:
     - "Contract balance is low. Your withdrawal may fail. Try a smaller amount or wait for the contract to be refunded."
     - Russian: "Баланс контракта недостаточен. Вывод может не пройти. Попробуйте меньшую сумму или подождите пополнения контракта."
   - This is a WARNING only — do not disable the button (the check is approximate due to NATIVE_SCALE rounding)

3. Add a global solvency indicator to `ProtocolStats`:
   - Show "Contract Health: OK" when `contractBalance >= totalSupply / NATIVE_SCALE`
   - Show "Contract Health: Low Reserves" (with warning color) when deficit > 5%

## Blockers
- `task-001-add-gas-limit-overrides.md` — must be done first so the decoded `InsufficientContractBalance` error is also properly displayed
- `task-002-decode-custom-errors.md` — the error decoder should handle InsufficientContractBalance before this guard is added, so users get a clear message if the guard doesn't prevent the attempt

## Acceptance Checklist
- [ ] `contractBalance` field added to yield Redux slice
- [ ] `useYieldData` (or new hook) polls contract native balance alongside protocol data
- [ ] UnstakeForm shows warning banner when unstake amount exceeds estimated contract capacity
- [ ] ProtocolStats shows contract health indicator
- [ ] Warning does NOT disable the unstake button (advisory only)
- [ ] i18n keys added for warning messages (English + Russian)
- [ ] Tests cover solvency warning display logic
- [ ] Tests cover contract balance polling
- [ ] Code follows project's component style
