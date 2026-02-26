# Remove "Start New Migration" Button

## Context
The "Start New Migration" button appears in the `MigrationStatusPanel` component after a migration completes (success) or fails. Since migration is a one-time procedure per wallet, the button is misleading. With auto-clear on unmount (task-002), the button is also functionally unnecessary.

The button is rendered in `src/components/migration/MigrationStatusPanel.tsx` at lines 830-835 (success state) and lines 857-864 (failed state). The translation key is `migration.panel.startNewMigration` in `public/locales/en.json`.

## Task
Remove the "Start New Migration" button and its supporting code:

1. In `MigrationStatusPanel.tsx`:
   - Remove the `onStartNewMigration` prop from the `MigrationStatusPanelProps` interface.
   - Remove the `handleStartNew` callback.
   - Remove the `NewMigrationButton` from the success terminal state block.
   - Remove the `NewMigrationButton` from the failed/expired terminal state block.
   - Remove the `NewMigrationButton` styled component definition.
   - Remove the `ArrowRight` import if no longer used.

2. In `src/pages/Migrate/index.tsx`:
   - Remove the `handleStartNewMigration` callback (lines 155-160).
   - Remove the `onStartNewMigration` prop from the `<MigrationStatusPanel>` JSX.

3. Optionally in `public/locales/en.json`:
   - Remove the `migration.panel.startNewMigration` translation key.

## Blockers
- `task-002-auto-clear-completed-operation.md` — auto-clear must be in place before removing the only manual reset mechanism

## Acceptance Checklist
- [ ] No "Start New Migration" button renders in the success state
- [ ] No "Start New Migration" button renders in the failed/expired state
- [ ] `onStartNewMigration` prop removed from `MigrationStatusPanelProps`
- [ ] `handleStartNewMigration` callback removed from Migrate page
- [ ] `NewMigrationButton` styled component removed
- [ ] Build succeeds with no TypeScript errors
- [ ] Existing MigrationStatusPanel tests updated (no references to removed button)
- [ ] Tests are written and passing
- [ ] Code follows the project's style
