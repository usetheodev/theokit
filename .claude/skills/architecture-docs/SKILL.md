---
name: architecture-docs
description: "Generate C4 Model architecture documentation — System Context, Container, Component diagrams in Mermaid, plus deep-dive narratives. Use when asked to document architecture, C4 diagram, system context, container diagram, or architecture deep dive."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: "<domain> [context|container|component <module>|deep-dive]"
---

# Architecture Docs

Software Architect skill: generates C4 Model documentation with diagrams and deep-dive narratives from the actual codebase.

## Quick start

```
/architecture-docs <domain>                    # Full C4 suite for a domain
/architecture-docs <domain> context            # System Context only
/architecture-docs <domain> container          # Container Diagram only
/architecture-docs <domain> component <module> # Component Diagram
/architecture-docs <domain> deep-dive          # Deep narrative
```

Examples:
```
/architecture-docs frontend
/architecture-docs backend container
/architecture-docs tooling component vite-plugin
/architecture-docs server deep-dive
```

## Workflows

### 1. Full C4 Suite

1. **Analyze** — read project structure, dependencies, entry points, external integrations
2. **Level 1: System Context** — the system as a black box, actors, external systems
3. **Level 2: Container** — runtime containers (packages, apps, services)
4. **Level 3: Component** — internal components of each container
5. **Deep Dive** — narrative with decisions, trade-offs, data flows
6. **Write** — output to `docs/architecture/{domain}/`

### 2. Output Format

All diagrams use **Mermaid**. Output structure:

```
docs/architecture/{domain}/
├── system-context.md
├── container-diagram.md
├── component-{name}.md
└── deep-dive.md
```

### 3. Diff Mode

When invoked as part of `/to-plan` post-implementation:

```
docs/architecture/{domain}/diff/
├── system-context.md
├── container-diagram.md
├── component-{name}.md
└── deep-dive.md
```

After generating diff, ask user to approve replacement of main docs.

## Diagram Conventions

See [REFERENCE.md](REFERENCE.md) for C4 notation, Mermaid syntax, and examples.

## Review Checklist

- [ ] Every external system shown is real (verified in code)
- [ ] Every container actually exists as a package/deployable
- [ ] Component boundaries match package boundaries in code
- [ ] No speculative elements — only what exists TODAY
- [ ] Diagrams render correctly in Mermaid
- [ ] Narrative references concrete files/modules
