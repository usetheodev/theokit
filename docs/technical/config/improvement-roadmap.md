# Config System — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 3/5 (após Onda 0)
**Gaps filled this session:** 0 of 6 (pesquisa inicial)

## Executive Summary

O sistema de configuração do Theo (`defineConfig` + `theo.config.ts`) é a primeira coisa que o usuário toca. Precisa ser type-safe, validado com Zod, e com mensagens de erro excelentes. O padrão `defineConfig()` é universalmente adotado (Vite, Nuxt, Nitro, Astro) como identity function para type inference.

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js config-schema.ts | NEW | Zod validation com `z.strictObject()`, 800+ linhas de schema |
| Next.js config-shared.ts | NEW | `Object.freeze(defaultConfig)` com 40+ defaults, deep merge |
| Next.js config.ts | NEW | `loadConfig()`: find → transpile (.ts) → normalize → validate |
| Vite defineConfig | NEW | Identity function pura para type inference |
| Nitro defineNitroConfig | NEW | `compatibilityDate`, typed config |

## Competitive Position

| Dimensão | Theo (target) | Next.js | Vite | Nitro | Best-in-class |
|----------|---------------|---------|------|-------|---------------|
| Type inference | 4/5 | 3/5 | 5/5 | 4/5 | Vite (identity fn) |
| Runtime validation | 4/5 | 5/5 | 1/5 | 2/5 | Next.js (Zod strict) |
| Error messages | 4/5 | 4/5 | 2/5 | 2/5 | Next.js (fatal vs warning) |
| Defaults handling | 4/5 | 5/5 | 3/5 | 3/5 | Next.js (deep merge + freeze) |
| Config reload (dev) | 3/5 | 3/5 | 5/5 | 3/5 | Vite (native HMR) |

## Decisões Arquiteturais para Onda 0

### D1: `defineConfig()` como identity function + Zod validation

```typescript
// theo.config.ts
import { defineConfig } from 'theo'

export default defineConfig({
  // Type inference via Zod schema
})
```

**Implementação recomendada:**

```typescript
// packages/theo/src/config/define-config.ts
import { z } from 'zod'

export const theoConfigSchema = z.object({
  // Onda 0: minimal
  appDir: z.string().default('app'),
  serverDir: z.string().default('server'),
  port: z.number().int().min(1).max(65535).default(3000),
  
  // Reservado para futuro (não implementar agora)
  // defaultModel: z.string().optional(), // Onda 11
})

export type TheoConfig = z.infer<typeof theoConfigSchema>

export function defineConfig(config: Partial<TheoConfig> = {}): TheoConfig {
  return theoConfigSchema.parse(config)
}
```

**Justificativa:**
- Vite provou que `defineConfig` como identity function é o padrão de DX esperado
- Next.js provou que Zod validation com `z.strictObject()` pega erros cedo
- Theo combina os dois: inference de Vite + validation de Next.js

### D2: Config loading via import dinâmico

```typescript
// packages/theo/src/config/load-config.ts
const CONFIG_FILES = ['theo.config.ts', 'theo.config.js', 'theo.config.mjs']

async function loadConfig(dir: string): Promise<TheoConfig> {
  const configPath = findConfigFile(dir, CONFIG_FILES)
  if (!configPath) {
    return theoConfigSchema.parse({}) // defaults
  }
  
  const userConfig = await importConfig(configPath)
  const result = theoConfigSchema.safeParse(userConfig)
  
  if (!result.success) {
    throw new TheoConfigError(result.error, configPath)
  }
  
  return result.data
}
```

### D3: Error messages DX-friendly

Seguindo Next.js, classificar erros em:
- **Fatal**: config inválida que impede o framework de funcionar
- **Warning**: config não-ótima mas funcional

```
✗ Invalid theo.config.ts

  Error: Expected number for "port", received string "abc"
  
  File: /my-app/theo.config.ts
  
  Fix: port must be a number between 1 and 65535
  
  Docs: https://theo.dev/docs/configuration
```

## Quick Wins (1-2 sessões cada)

1. **Criar `theoConfigSchema` com Zod** — schema mínimo para Onda 0 → `packages/theo/src/config/schema.ts`
2. **Criar `defineConfig()` function** — identity + validation → `packages/theo/src/config/define-config.ts`
3. **Criar `loadConfig()` function** — find file, import, validate → `packages/theo/src/config/load-config.ts`
4. **Criar fixture `fixtures/basic-valid-app/theo.config.ts`** — config válida mínima

## Sprint Targets (Onda 0)

1. **Config schema Zod** — campos mínimos validados
2. **Config loading** — find, import, validate com erros claros
3. **Config defaults** — deep merge com Object.freeze
4. **Teste: config válida** — fixture passa
5. **Teste: config inválida** — erro claro com path e sugestão
6. **Teste: config ausente** — defaults aplicados

## Anti-Patterns to Eliminate

1. **Config sem validação runtime** — TypeScript não protege em runtime → usar Zod always
2. **Mensagens genéricas** — "Invalid config" sem dizer o quê/onde/como corrigir
3. **Config monolítica** — não misturar config de build com config de runtime

## Sources

- [Next.js config-schema.ts](referencias/next.js/packages/next/src/server/config-schema.ts) — Zod schema completo
- [Next.js config.ts](referencias/next.js/packages/next/src/server/config.ts) — loadConfig flow
- [Next.js config-shared.ts](referencias/next.js/packages/next/src/server/config-shared.ts) — defaults
- [Vite defineConfig](https://vite.dev/config/) — identity function pattern
- [Nitro Config](https://nitro.build/config) — compatibilityDate pattern
