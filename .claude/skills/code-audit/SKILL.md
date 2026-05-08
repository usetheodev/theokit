---
name: code-audit
description: "Run code-audit techniques against the Theo framework — TypeScript strict check, lint, architecture boundaries, any/ts-ignore, bundle analysis, test coverage, dependency hygiene, wiring. Pass a technique name or `all`."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "[types|lint|arch|any|boundary|bundle|tests|deps|wiring|all] [package-name]"
---

# Code Audit

Run static code-audit techniques on the Theo framework workspace.

## Arguments

| Arg | Command | Technique |
|---|---|---|
| `types` | `npx tsc --noEmit` | TypeScript strict check |
| `lint` | `npm run lint` | ESLint with warnings-as-errors |
| `arch` | grep dependency analysis | Package dependency direction |
| `any` | grep for `any`/`ts-ignore` | Type safety violations |
| `boundary` | grep for server imports in client | Client/server boundary |
| `bundle` | build + analyze output | Bundle size and leaks |
| `tests` | `npm test` + coverage | Test coverage |
| `deps` | npm audit + license check | Dependency hygiene |
| `wiring` | grep for unused exports | Orphaned public APIs |
| `scope` | grep for agents/AI | MVP scope violations |
| `all` | all techniques in sequence | Full audit |
| *(no arg)* | same as `all` | Full audit |

## Execution for `all`

```bash
# 1. TypeScript check
npx tsc --noEmit 2>&1

# 2. Lint
npm run lint 2>&1

# 3. Architecture — dependency direction
for pkg in packages/*/package.json; do
  echo "=== $pkg ===" && cat "$pkg" | jq '.dependencies // {} | keys[]' 2>/dev/null | grep '@theo'
done

# 4. Type safety — any/ts-ignore in production
grep -rn '\bany\b' packages/ --include='*.ts' --include='*.tsx' | grep -v test | grep -v '.d.ts' | grep -v node_modules
grep -rn '@ts-ignore\|@ts-expect-error' packages/ --include='*.ts' --include='*.tsx' | grep -v test

# 5. Client/server boundary
grep -rn "from '.*server/" app/ --include='*.ts' --include='*.tsx'
grep -rn "from '.*\.env\b" app/ --include='*.ts' --include='*.tsx'

# 6. Tests
npm test 2>&1

# 7. Dependency hygiene
npm audit 2>&1

# 8. Wiring — unused exports
# (scan for export functions/classes referenced in only 1 file)

# 9. MVP scope — no agents/AI
grep -rn 'agents\|openai\|anthropic\|langchain\|@ai\|llm\|mcp\|memory.*store' packages/ --include='*.ts' | grep -v node_modules | grep -v test
```

## Scoping by Package

When a package name is provided (e.g., `/code-audit types core`):
- TypeScript: `npx tsc --noEmit --project packages/{name}/tsconfig.json`
- Lint: `npm run lint -- --scope packages/{name}`
- All grep-based: scope to `packages/{name}/`

## Consolidated Report

```
THEO FRAMEWORK — CODE AUDIT REPORT
====================================
Date:   <YYYY-MM-DD HH:MM>
Commit: <git rev-parse --short HEAD>

TECHNIQUE              VERDICT   DETAILS
---------              -------   -------
TypeScript (strict)    PASS|FAIL  N errors
Lint (eslint)          PASS|FAIL  N warnings
Architecture           PASS|FAIL  N boundary violations
Type Safety (any)      PASS|FAIL  N violations
Client/Server Boundary PASS|FAIL  N leaks
Tests                  PASS|FAIL  N pass / M fail
Dependency Hygiene     PASS|FAIL  N vulnerabilities
Wiring                 PASS|FAIL  N orphaned exports
MVP Scope              PASS|FAIL  N scope violations

OVERALL: PASS | FAIL
(FAIL if ANY technique is FAIL)
```

## Rules

- Read-only. This skill never edits files.
- If fixes are needed, tell the user what to fix.
- For `all`, expect 1-3 minutes depending on workspace state.
