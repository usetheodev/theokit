# Container Diagram — Theo Framework (Onda 0 BEFORE)

**Date:** 2026-05-08
**State:** Pre-implementation (greenfield)

## Overview

Nenhum container (package, app, service) existe ainda. Este diagrama mostra a estrutura **planejada** pela Onda 0.

## Container Diagram (Planned)

```mermaid
C4Container
    title Container Diagram — Theo Framework (Planned for Onda 0)

    Person(dev, "Developer", "Constrói apps com Theo")

    System_Boundary(mono, "theo-agents monorepo") {
        Container(theo, "theo", "TypeScript package", "Pacote principal: defineConfig, defineRoute, defineAction, defineMiddleware, loadConfig, validateProjectStructure")
        Container(create, "create-theo", "TypeScript package", "CLI de scaffolding (stub na Onda 0)")
        Container(fixtures, "fixtures/", "Test data", "Projetos Theo mínimos para validação")
        Container(tests, "tests/", "Vitest", "Unit tests + type tests")
    }

    System_Ext(zod, "Zod", "Schema validation")
    System_Ext(vitest, "Vitest", "Test runner")

    Rel(dev, theo, "import { defineConfig } from 'theo'")
    Rel(dev, theo, "import { defineRoute } from 'theo/server'")
    Rel(theo, zod, "peerDependency")
    Rel(tests, theo, "Tests contracts")
    Rel(tests, fixtures, "References fixtures")
    Rel(tests, vitest, "Runs via Vitest")
```

## Containers (Current State: NONE)

| Container | Exists? | Planned Location | Purpose |
|-----------|---------|------------------|---------|
| `theo` | ❌ | `packages/theo/` | Pacote principal com contratos |
| `create-theo` | ❌ | `packages/create-theo/` | CLI scaffolding (stub) |
| `fixtures/` | ❌ | `fixtures/` | Dados de teste |
| `tests/` | ❌ | `tests/` | Unit + type tests |

## Subpath Exports (Planned)

| Import | Maps to | Content |
|--------|---------|---------|
| `theo` | `packages/theo/src/index.ts` | defineConfig, loadConfig, theoConfigSchema, TheoConfigError, validateProjectStructure, TheoProjectError |
| `theo/server` | `packages/theo/src/server/index.ts` | defineRoute, defineAction, defineMiddleware + types |
