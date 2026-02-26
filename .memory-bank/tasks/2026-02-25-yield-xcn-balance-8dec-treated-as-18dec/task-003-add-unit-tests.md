# Add unit tests for XCN balance normalization and Yield display

## Context
The Yield tab had a critical decimal mismatch bug where 8-decimal native XCN balance was treated as 18-decimal. The fix (task-001) normalizes the balance. We need tests to prevent regression and verify the full display + validation chain.

Existing test file `src/__tests__/yield/utils.test.ts` tests `normalizeNativeBalanceToWad`. New tests should verify the integration in the Yield components.

## Task
Create or extend test file(s) to cover:

1. **Normalization utility**: `normalizeNativeBalanceToWad` converts correctly for chain 8901 (8→18 dec) and is identity for other chains
2. **Balance display**: `formatTokenAmount` produces correct output for normalized 18-dec balances (e.g., "1,000.0000" for 10^21)
3. **Balance comparison**: 18-dec user input vs 18-dec normalized balance → correct insufficient/sufficient detection
4. **Max button**: 18-dec normalized balance minus 18-dec gas reserve → correct amount
5. **Edge cases**: Zero balance, very small balance (< gas reserve), very large balance

Test file: `src/__tests__/yield/xcnBalanceNormalization.test.ts`

## Blockers
- `task-001-normalize-xcn-balance.md` — normalization must be applied first for integration tests to pass

## Acceptance Checklist
- [ ] Tests cover normalization for chain 8901 and non-8901
- [ ] Tests cover balance display formatting with normalized values
- [ ] Tests cover balance comparison (sufficient / insufficient)
- [ ] Tests cover Max button calculation
- [ ] Tests cover edge cases (zero, tiny, large balances)
- [ ] All tests pass: `npm test -- --testPathPattern xcnBalanceNormalization`
- [ ] Code follows the project's test style
