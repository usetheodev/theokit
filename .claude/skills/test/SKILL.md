---
name: test
description: Run tests for the workspace or specific package. Use when asked to test, run tests, or validate.
user-invocable: true
allowed-tools: Bash(npm *), Bash(npx *)
argument-hint: "[package|unit|integration|e2e|types|all]"
---

Run tests for the Theo framework.

## Arguments

- No args: `npm test` (all tests)
- `unit`: `npx vitest run tests/unit/`
- `integration`: `npx vitest run tests/integration/`
- `e2e`: `npx playwright test`
- `types`: `npx vitest typecheck`
- Package name: `npx vitest run --project packages/$ARGUMENTS`
- `all`: unit + integration + e2e + types + lint

## Steps

1. Run the appropriate test command
2. Analyze failures — root cause, not symptoms
3. Report results with file:line for failures
4. Check TDD compliance (untested code, empty assertions)

## Report Format

```
PASS: X tests passed (Xms)
FAIL: Y tests failed
  - test_name — root cause
SKIP: Z tests skipped

TDD: X new functions, Y without tests
```
