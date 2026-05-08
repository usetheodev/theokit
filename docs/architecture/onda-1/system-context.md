# System Context — Theo Framework (Onda 1 BEFORE)

**Date:** 2026-05-08
**State:** Onda 0 completa — contratos existem, sem CLI/runtime

```mermaid
C4Context
    title System Context — Theo Framework (BEFORE Onda 1)

    Person(dev, "Developer", "Desenvolve apps com Theo")

    System_Boundary(theo, "Theo Framework") {
        System(contracts, "Contracts (Onda 0)", "defineConfig, defineRoute, defineAction, defineMiddleware, loadConfig, validateProjectStructure")
    }

    System_Ext(npm, "npm Registry", "Not yet published")
    System_Ext(vite, "Vite", "Planned — dev server + build")
    System_Ext(zod, "Zod", "peerDependency — schema validation")
    System_Ext(react, "React", "Planned — UI framework")

    Rel(dev, contracts, "Tests contratos via Vitest")
    Rel(contracts, zod, "Uses for validation")
```

## Current State

- **Onda 0 completa:** 72 testes passing, 11 type tests, zero TS errors
- **Packages:** `theo` (contratos), `create-theo` (stub vazio)
- **CLI:** ZERO (sem bin entry, sem cac, sem Vite)
- **Dev server:** ZERO
- **Scaffolding:** ZERO (create-theo é stub)
- **Template:** ZERO
