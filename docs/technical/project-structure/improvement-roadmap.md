# Project Structure — Improvement Roadmap

**Research date:** 2026-05-08
**Researcher:** Claude (SOTA Research Skill)
**Current SOTA score:** 1/5
**Target SOTA score:** 3/5 (após Onda 0)
**Gaps filled this session:** 0 of 6 (pesquisa inicial)

## Executive Summary

A estrutura de projeto do Theo é opinativa: `app/` para frontend, `server/` para backend, `theo.config.ts` para config. Validação eager no startup (fail fast) com mensagens DX-friendly. Inspiração: Next.js (required directories), Rails (convention over configuration), Nuxt (auto-discovery).

## Reference Evolution

| Reference | Status | Update |
|-----------|--------|--------|
| Next.js find-pages-dir.ts | NEW | app/ OR pages/ required, src/ fallback, same-parent rule |
| Next.js find-config.ts | NEW | Discovery chain: package.json → rc → config files |
| Next.js config.ts (unsupported) | NEW | Block unsupported extensions com mensagens claras |
| Rails application.rb | NEW | Root detection via config.ru, lazy discovery |
| Nuxt directory structure | NEW | app/, server/, components/, composables/, layouts/, pages/ |

## Competitive Position

| Dimensão | Theo (target) | Next.js | Nuxt | SvelteKit | Best-in-class |
|----------|---------------|---------|------|-----------|---------------|
| Convention clarity | 5/5 | 3/5 | 5/5 | 4/5 | Nuxt/Theo |
| Validation on startup | 5/5 | 4/5 | 3/5 | 2/5 | Theo |
| Error messages | 5/5 | 4/5 | 3/5 | 3/5 | Next.js |
| Flexibility | 2/5 | 4/5 | 3/5 | 3/5 | Next.js |

## Decisões Arquiteturais para Onda 0

### D1: Diretórios required vs optional

| Diretório | Status | Validação |
|-----------|--------|-----------|
| `app/` | **REQUIRED** | Falhar com mensagem clara se ausente |
| `app/page.tsx` | **REQUIRED** | Falhar se app/ existe mas sem page.tsx raiz |
| `theo.config.ts` | **REQUIRED** | Falhar se ausente (defaults não bastam) |
| `server/` | OPTIONAL | Backend opt-in |
| `server/routes/` | OPTIONAL | Presente se server/ existe |
| `server/actions/` | OPTIONAL | Presente se server/ existe |
| `components/` | OPTIONAL | Sem validação |
| `lib/` | OPTIONAL | Sem validação |
| `public/` | OPTIONAL | Sem validação |
| `package.json` | **REQUIRED** | Validar que existe e tem `theo` como dependency |

### D2: Validação eager no startup

```typescript
// packages/theo/src/core/validate-structure.ts
export function validateProjectStructure(rootDir: string): void {
  const errors: string[] = []
  
  // Required files
  if (!existsSync(join(rootDir, 'theo.config.ts'))) {
    errors.push('Missing required file: theo.config.ts')
  }
  
  // Required directories
  if (!existsSync(join(rootDir, 'app'))) {
    errors.push('Missing required directory: app/')
  } else if (!findPageFile(join(rootDir, 'app'))) {
    errors.push('Missing required file: app/page.tsx (root page)')
  }
  
  if (errors.length > 0) {
    throw new TheoProjectError(errors, rootDir)
  }
}
```

### D3: Mensagens de erro DX-friendly

```
✗ Invalid Theo project structure

  Missing required directory: app/
  
  The app/ directory contains your pages and is required.
  Create it with: mkdir app && touch app/page.tsx
  
  Docs: https://theo.dev/docs/project-structure
```

### D4: Sem suporte a `src/` prefix

**Decisão:** Theo NÃO suporta `src/` prefix (diferente de Next.js).

**Justificativa:**
- Convention over configuration: um jeito só
- Simplicidade: sem ambiguidade sobre onde os arquivos vão
- Rails approach: diretórios no root, sem wrapper

### D5: Extensões suportadas

```
.tsx, .ts, .jsx, .js
```

Priority order: `.tsx` > `.ts` > `.jsx` > `.js`
TypeScript é o default e recomendado.

## Quick Wins (1-2 sessões cada)

1. **Criar `validateProjectStructure()`** → `packages/theo/src/core/validate-structure.ts`
2. **Criar `TheoProjectError`** com formatting → `packages/theo/src/core/errors.ts`
3. **Criar fixture `fixtures/basic-valid-app/`** com estrutura mínima
4. **Criar fixture `fixtures/invalid-no-app/`** sem app/ para testar erro

## Testes Obrigatórios (Onda 0)

```typescript
// tests/unit/validate-structure.test.ts
describe('validateProjectStructure', () => {
  it('should accept valid project with app/ and theo.config.ts', () => {
    // fixtures/basic-valid-app/
    expect(() => validateProjectStructure(validAppDir)).not.toThrow()
  })
  
  it('should reject project without app/', () => {
    // fixtures/invalid-no-app/
    expect(() => validateProjectStructure(noAppDir))
      .toThrow('Missing required directory: app/')
  })
  
  it('should reject project with invalid theo.config.ts', () => {
    // fixtures/invalid-config/
    // Teste 2 da Onda 0
  })
})
```

## Anti-Patterns to Eliminate

1. **Lazy validation** — falhar tarde = debugging difícil. Validar no startup.
2. **Mensagem sem ação** — todo erro deve dizer o que fazer para corrigir
3. **Flexibilidade excessiva** — `src/` prefix, custom paths = mais decisões pro dev

## Sources

- [Next.js find-pages-dir.ts](referencias/next.js/packages/next/src/lib/find-pages-dir.ts)
- [Next.js find-config.ts](referencias/next.js/packages/next/src/lib/find-config.ts)
- [Rails application.rb](referencias/rails/railties/lib/rails/application.rb)
- [SvelteKit project structure](https://svelte.dev/docs/kit/project-structure)
