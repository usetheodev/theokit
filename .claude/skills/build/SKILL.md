---
name: build
description: Build the workspace or specific package. Use when asked to build, compile, or check compilation.
user-invocable: true
allowed-tools: Bash(npm *), Bash(npx *)
argument-hint: "[package|check|all]"
---

Build the Theo framework workspace.

## Arguments

- No args: `npm run build` (full workspace)
- `check`: `npx tsc --noEmit` (type-check only, faster)
- Package name: `npm run build -w packages/$ARGUMENTS`
- `all`: full build + type-check + lint

## Steps

1. Run the appropriate build command
2. If errors: analyze the error, show file:line, explain the issue
3. If warnings: list them grouped by package
4. **Run tests**: `npm test` for affected package (build alone is not enough)
5. Report: PASS (build + tests clean) / PASS with N warnings / FAIL with errors

## TDD Gate

Build is NOT complete until tests pass. After a successful build:
```bash
npm test              # For full workspace builds
npx vitest run -w packages/<pkg>  # For specific package
```

If tests fail → report as FAIL even if build succeeds.
