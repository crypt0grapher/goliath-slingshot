# Fix CHN -> XCN Spelling in i18n Strings

## Context
The Migrate tab displays "CHN" in two places, but there is no CHN token. The token is XCN on both Sepolia (ERC-20) and Goliath (native). Two i18n translation keys in the English locale file reference "CHN" incorrectly.

- Project: `~/goliath/CoolSwap-interface`
- File: `public/locales/en.json`
- Related components: `MigrationStepper` (reads `migration.step.bridge.description`), `StakeOnGoliathToggle` (reads `migration.toggle.autoStakeDescription`)

## Task
Replace "CHN" with "XCN" in two i18n translation strings:

1. Line 343: `"migration.step.bridge.description"` -- change `"Bridge your XCN tokens to the Goliath network to receive CHN."` to `"Bridge your XCN tokens to the Goliath network."` (or `"...to receive XCN."` -- the token received on Goliath is native XCN).
2. Line 346: `"migration.toggle.autoStakeDescription"` -- change `"Auto-stake CHN tokens after migration"` to `"Auto-stake XCN tokens after migration"`.

No other locale files contain "CHN" (verified via grep).

## Blockers
No blockers.

## Acceptance Checklist
- [ ] `public/locales/en.json` key `migration.step.bridge.description` does not contain "CHN"
- [ ] `public/locales/en.json` key `migration.toggle.autoStakeDescription` does not contain "CHN"
- [ ] Both keys reference "XCN" correctly
- [ ] Project builds without errors (`npm run build`)
- [ ] Existing tests pass
