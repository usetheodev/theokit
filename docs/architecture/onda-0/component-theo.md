# Component Diagram — Package `theo` (Onda 0 BEFORE)

**Date:** 2026-05-08
**State:** Pre-implementation (greenfield)

## Overview

O pacote `theo` é o coração do framework. Na Onda 0, contém apenas contratos (identity functions) e validação. Nenhum runtime.

## Component Diagram (Planned)

```mermaid
C4Component
    title Component Diagram — Package theo (Planned for Onda 0)

    Container_Boundary(theo, "packages/theo/") {
        Component(config_schema, "config/schema.ts", "Zod", "theoConfigSchema + TheoConfig type")
        Component(config_define, "config/define-config.ts", "TypeScript", "defineConfig() identity function")
        Component(config_load, "config/load-config.ts", "TypeScript", "loadConfig() — find, import, validate")
        Component(config_errors, "config/errors.ts", "TypeScript", "TheoConfigError class")
        
        Component(server_route, "server/define-route.ts", "TypeScript", "defineRoute() identity + RouteConfig generics")
        Component(server_action, "server/define-action.ts", "TypeScript", "defineAction() identity + ActionConfig generics")
        Component(server_middleware, "server/define-middleware.ts", "TypeScript", "defineMiddleware() identity + MiddlewareHandler type")
        
        Component(core_validate, "core/validate-structure.ts", "TypeScript", "validateProjectStructure()")
        Component(core_errors, "core/errors.ts", "TypeScript", "TheoProjectError class")
        
        Component(index, "index.ts", "TypeScript", "Barrel: re-exports config + core")
        Component(server_index, "server/index.ts", "TypeScript", "Barrel: re-exports server contracts")
    }

    System_Ext(zod, "Zod", "Runtime validation")
    System_Ext(node_fs, "node:fs", "File system access")

    Rel(config_load, config_schema, "Validates with")
    Rel(config_load, config_errors, "Throws")
    Rel(config_define, config_schema, "Uses type only")
    Rel(core_validate, core_errors, "Throws")
    Rel(core_validate, node_fs, "existsSync")
    Rel(config_load, node_fs, "existsSync")
    Rel(config_schema, zod, "z.object()")
    Rel(index, config_define, "Re-exports")
    Rel(index, config_load, "Re-exports")
    Rel(index, core_validate, "Re-exports")
    Rel(server_index, server_route, "Re-exports")
    Rel(server_index, server_action, "Re-exports")
    Rel(server_index, server_middleware, "Re-exports")
```

## Components (Planned)

### Config Module (`src/config/`)

| Component | File | Responsibility | Dependencies |
|-----------|------|----------------|--------------|
| Schema | `schema.ts` | Zod schema + TheoConfig type + defaults | `zod` |
| DefineConfig | `define-config.ts` | Identity function for type inference | `schema.ts` (type only) |
| LoadConfig | `load-config.ts` | Find, import, validate config file | `schema.ts`, `errors.ts`, `node:fs` |
| Errors | `errors.ts` | TheoConfigError class | — |

### Server Module (`src/server/`)

| Component | File | Responsibility | Dependencies |
|-----------|------|----------------|--------------|
| DefineRoute | `define-route.ts` | Identity + RouteConfig generics | `zod` (type only) |
| DefineAction | `define-action.ts` | Identity + ActionConfig generics | `zod` (type only) |
| DefineMiddleware | `define-middleware.ts` | Identity + MiddlewareHandler type | Web API globals |

### Core Module (`src/core/`)

| Component | File | Responsibility | Dependencies |
|-----------|------|----------------|--------------|
| ValidateStructure | `validate-structure.ts` | Validate required dirs/files | `errors.ts`, `node:fs` |
| Errors | `errors.ts` | TheoProjectError class | — |

## Data Flow

```
Developer writes theo.config.ts
    → imports defineConfig from 'theo' (type inference)
    → CLI calls loadConfig(dir)
        → finds theo.config.ts
        → dynamic import
        → theoConfigSchema.safeParse()
        → TheoConfig | TheoConfigError

Developer creates project structure
    → CLI calls validateProjectStructure(dir)
        → checks required dirs (app/)
        → checks required files (theo.config.ts, package.json)
        → void | TheoProjectError
```
