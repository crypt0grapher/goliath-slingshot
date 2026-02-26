# Convert Stepper to One-Button Orchestration

## Context
What you need to know to complete this task:
- The current migration stepper exposes step-level manual actions.
- Requirement is a single CTA that triggers all required steps in sequence while showing tracked status.
- Existing Redux step execution statuses already provide lifecycle states (idle, waiting signature, pending, confirmed, failed).

## Task
Refactor the migration stepper so users trigger migration with one button, and step rows become tracking-only status items without per-step action buttons.

## Blockers
- No blockers

## Acceptance Checklist
- [ ] Stepper has a single Start/Continue action button
- [ ] Per-step execute/retry controls are removed from step rows in migration flow
- [ ] Sequential execution runs in step order using existing transaction handlers
- [ ] Failure halts sequence and surfaces a clear error message
- [ ] Tests are written and passing
- [ ] Code follows the project's style
