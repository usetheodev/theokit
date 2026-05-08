---
name: review
description: Review code changes for quality, architecture, type-safety, and compliance. Use before commits or PRs.
user-invocable: true
context: fork
agent: code-reviewer
argument-hint: "[staged|branch|file|package]"
---

Review code in the Theo framework workspace.

## Mode Selection

| Argument | Mode | What it does |
|---|---|---|
| `staged` or no args | Diff review | Reviews `git diff --cached` |
| `branch` | Diff review | Reviews all commits on current branch vs main |
| `file path/to/file.ts` | Diff review | Reviews specific file changes |
| `package-name` | Deep review | Full package audit |

## Compliance Checks

1. **TDD** — Every changed function has test
2. **Architecture** — Dependency direction respected
3. **Type Safety** — No any, no ts-ignore, Zod as source of truth
4. **Error Handling** — No swallowed errors, typed errors
5. **Code Quality** — No god-files, descriptive names
6. **Security** — No hardcoded secrets, CSRF protected
7. **Scope** — No agents/AI in MVP code

## Severity

| Level | Meaning |
|---|---|
| BLOCKER | Bug, security vuln, missing test for business logic |
| CRITICAL | Architecture violation, any in prod, error swallowing |
| WARNING | Code smell, naming, minor DRY |
| INFO | Suggestion, style preference |

## Verdict

- Any BLOCKER → REJECT
- Any CRITICAL → REQUEST_CHANGES
- All clean → APPROVE
