# System Context — Theo Framework (Onda 0 BEFORE)

**Date:** 2026-05-08
**State:** Pre-implementation (greenfield)

## Overview

O Theo Framework é um framework fullstack TypeScript opinativo. No estado BEFORE (pré-Onda 0), o sistema existe apenas como documentação e decisões arquiteturais — não há código de implementação.

## System Context Diagram

```mermaid
C4Context
    title System Context — Theo Framework (BEFORE Onda 0)

    Person(dev, "Developer", "Desenvolve apps com Theo")
    
    System_Boundary(theo, "Theo Framework") {
        System(docs, "Documentation Only", "README, ONDAS.md, SOTA Research")
    }

    System_Ext(npm, "npm Registry", "Package distribution")
    System_Ext(vite, "Vite", "Build tool (planned)")
    System_Ext(zod, "Zod", "Schema validation (planned)")
    System_Ext(react, "React", "UI framework (planned)")

    Rel(dev, docs, "Reads documentation")
    Rel(theo, npm, "Not yet published")
    Rel(theo, vite, "Planned dependency")
    Rel(theo, zod, "Planned dependency")
    Rel(theo, react, "Planned dependency")
```

## Actors

| Actor | Description | Interaction |
|-------|-------------|-------------|
| Developer | Constrói apps com Theo | Lê docs, aguarda implementação |

## External Systems

| System | Status | Purpose |
|--------|--------|---------|
| npm | Planned | Publicação de `theo` e `create-theo` |
| Vite 6 | Planned | Build tool e dev server |
| Zod | Planned | Runtime validation + type inference |
| React | Planned | UI framework |
| Node.js | Planned | Runtime (único do MVP) |

## Current State

- **Código de implementação:** ZERO
- **Packages:** ZERO
- **Testes:** ZERO
- **Fixtures:** ZERO
- **Decisões tomadas:** 6 ADRs documentados no plano
- **API surface definida:** defineConfig, defineRoute, defineAction, defineMiddleware
