# C4 Model Reference

## C4 Levels Overview

| Level | Shows | Audience | Detail |
|---|---|---|---|
| 1. System Context | System + actors + external systems | Everyone | Highest abstraction |
| 2. Container | Packages/services inside the system | Technical stakeholders | Runtime boundaries |
| 3. Component | Internal structure of a package | Developers | Module level |
| 4. Code (optional) | Class/interface diagrams | Implementers | Lowest abstraction |

## Mermaid C4 Syntax

### System Context (Level 1)

```mermaid
C4Context
    title System Context — Theo Framework

    Person(dev, "Developer", "Builds web apps with Theo")

    System(theo, "Theo Framework", "Fullstack TypeScript framework")

    System_Ext(npm, "npm Registry", "Package distribution")
    System_Ext(vite, "Vite", "Dev server and build tool")
    System_Ext(react, "React", "UI rendering")

    Rel(dev, theo, "Uses", "CLI + API")
    Rel(theo, vite, "Integrates", "Plugin API")
    Rel(theo, react, "Renders with", "SSR + Client")
    Rel(theo, npm, "Published to", "npm publish")
```

### Container Diagram (Level 2)

```mermaid
C4Container
    title Container Diagram — Theo Framework

    Person(dev, "Developer", "")

    System_Boundary(theo, "Theo Framework") {
        Container(core, "@theo/core", "TypeScript", "Pure types and definitions")
        Container(router, "@theo/router", "TypeScript", "File-system routing")
        Container(server, "@theo/server", "TypeScript", "Routes, actions, middleware")
        Container(client, "@theo/client", "TypeScript", "Typed API client")
        Container(vite_plugin, "@theo/vite-plugin", "TypeScript", "Vite integration")
        Container(cli, "@theo/cli", "TypeScript", "theo dev/build/start")
        Container(create, "create-theo", "TypeScript", "Project scaffolding")
    }

    System_Ext(vite, "Vite", "")
    System_Ext(react, "React", "")

    Rel(dev, cli, "Uses", "Terminal")
    Rel(dev, create, "Scaffolds with", "npx")
    Rel(cli, vite_plugin, "Starts", "Vite dev/build")
    Rel(vite_plugin, router, "Scans routes")
    Rel(vite_plugin, vite, "Extends", "Plugin API")
    Rel(server, core, "Implements")
    Rel(router, core, "Uses types")
    Rel(client, core, "Uses types")
```

### Component Diagram (Level 3)

```mermaid
C4Component
    title Component Diagram — @theo/server

    Container_Boundary(server, "@theo/server") {
        Component(routes, "Route Handler", "defineRoute, HTTP routing, Zod validation")
        Component(actions, "Action Handler", "defineAction, CSRF, serialization")
        Component(middleware, "Middleware Engine", "Composable middleware stack")
        Component(context, "Context Factory", "Per-request context creation")
        Component(errors, "Error Model", "Typed errors, HTTP mapping")
        Component(openapi, "OpenAPI Generator", "Zod-to-OpenAPI spec")
    }

    Container(core, "@theo/core", "Types")

    Rel(routes, context, "Uses ctx")
    Rel(actions, context, "Uses ctx")
    Rel(middleware, context, "Populates ctx")
    Rel(routes, errors, "Throws typed errors")
    Rel(actions, errors, "Throws typed errors")
    Rel(openapi, routes, "Reads schemas from")
    Rel(routes, core, "Implements types")
```

## Writing Rules

### System Context (Level 1)
- MAX 10 elements
- System is ONE box — no internal detail
- Every arrow has verb + protocol
- Ask: "Who uses this? What does it depend on externally?"

### Container (Level 2)
- Show RUNTIME/PACKAGE boundaries
- A container = npm package or deployable unit
- Technology labels mandatory
- Ask: "What are the packages and how do they relate?"

### Component (Level 3)
- Zoom into ONE package at a time
- Components = modules within the package
- Show only public interfaces
- Ask: "What are the top-level modules and their interactions?"

### Deep Dive Narrative
- Start with the PROBLEM, not the solution
- Follow with constraints
- Then key decisions (link ADRs)
- Then data flow (request lifecycle)
- End with trade-offs and limitations
- Be HONEST about what's missing

## Anti-Patterns

| Anti-Pattern | Do Instead |
|---|---|
| Mixing levels | One diagram per level |
| Speculative elements | Only document what EXISTS |
| Too many elements | Max 10-15 per diagram |
| Missing tech labels | Always label |
| Arrows without verbs | Every Rel has action |
| No narrative | Pair diagrams with prose |

## File Header Template

```markdown
# [Diagram Type] — [System/Package Name]

> Generated: YYYY-MM-DD | Source: [git SHA]
> Scope: [what this covers]
> Audience: [who reads this]

## Overview
[1-3 sentences]

## Diagram
[Mermaid block]

## Key Decisions
- **[Decision]** — [rationale]

## Notes
- [Assumptions, limitations, gaps]
```
