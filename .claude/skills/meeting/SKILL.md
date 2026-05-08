---
name: meeting
description: Framework Design Meeting — evidence-driven technical decision framework with persona-based review. Use when making architectural decisions, resolving trade-offs, or evaluating design options.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "<topic> [--scope frontend|backend|tooling|types|dx|security|full]"
---

# Framework Design Meeting Protocol

## Evidence-Driven Technical Decision Framework

> Toda reunião existe para reduzir incerteza. Se não reduz incerteza, não deveria existir.

## Arguments

- First part = topic (e.g., "file router design", "action validation strategy")
- `--scope` (optional) = determines which personas participate

## Default Personas by Scope

| Scope | Personas |
|---|---|
| `frontend` | frontend-runtime-architect, type-system-architect, dx-lead |
| `backend` | backend-runtime-architect, type-system-architect, security-reliability-engineer |
| `tooling` | tooling-compiler-architect, dx-lead, testing-release-engineer |
| `types` | type-system-architect, frontend-runtime-architect, backend-runtime-architect |
| `dx` | dx-lead, frontend-runtime-architect, testing-release-engineer |
| `security` | security-reliability-engineer, backend-runtime-architect |
| `full` | All 8 core personas |

## Process

### Phase 1 — Context
```
PROBLEM: [objective description]
CAUSE: [why this is a problem]
IMPACT: [what happens if not resolved]
SCOPE: [what's in and out of this decision]
```

### Phase 2 — Evidence
Each persona contributes evidence from their perspective. Research how Next.js, Remix, Nitro, Hono, TanStack, tRPC solve this.

### Phase 3 — Options
For EACH option: description, evidence, pros, contras, cost, risk.

### Phase 4 — Tensions
Personas MUST disagree. Common tensions:
- Performance vs Type-Safety (Tooling vs Types)
- Simplicity vs Completeness (DX vs Backend)
- Security vs Ergonomics (Security vs DX)
- Explicitness vs Convention (Product vs Frontend)

### Phase 5 — Decision
One of: ADR Approved, Experiment Defined, Rejection, or Blocker.

**NEVER:** "vamos vendo", "depois pensamos", decision without evidence.

### Phase 6 — Record
Save to `.claude/meetings/YYYYMMDD-{topic-slug}.md`

## Valid Outcomes

| Type | Expected Result |
|---|---|
| Architecture | ADR approved or rejected |
| API Design | API signature frozen |
| Performance | Bottleneck identified with numbers |
| Scope | Feature approved/rejected for MVP |
| Security | Risk classified with severity |
