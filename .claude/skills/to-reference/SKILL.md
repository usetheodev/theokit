---
name: to-reference
description: "Pesquisa nas implementações de referência (Next.js, Rails, e outras) como resolvem um problema específico. Retorna comparação estruturada com file paths e line numbers. Use ANTES de decisões arquiteturais para aprender com frameworks maduros."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "<topic> [--impl nextjs|rails|all]"
---

# Research Reference: Como Outros Frameworks Resolvem Isso?

Pesquisa nas implementações de referência em `referencias/` como cada uma resolve um problema específico. Retorna comparação estruturada com file paths, line numbers e padrões encontrados.

## Arguments

- `$ARGUMENTS` primeira parte = tópico para pesquisar (e.g., "routing", "middleware", "error handling", "server actions", "streaming", "build pipeline", "HMR", "layouts", "loading states")
- `--impl <name>` (opcional) = escopo para implementação específica, separado por vírgula

## Implementações Disponíveis

| Name | Path | Language | Strength |
|---|---|---|---|
| `nextjs` | `referencias/next.js/` | Rust+TypeScript | App Router, Server Components, file-based routing, streaming SSR, middleware, Server Actions, build (Turbopack), HMR |
| `rails` | `referencias/rails/` | Ruby | Convention over configuration, MVC, middleware stack, routing DSL, error handling, migrations, generators, testing patterns |

## Áreas de Pesquisa por Framework

### Next.js — O que aprender

| Área | Onde procurar | O que extrair |
|---|---|---|
| File-system routing | `packages/next/src/build/` | Como scan de arquivos vira rotas |
| App Router | `packages/next/src/server/app-render/` | Como app/ funciona internamente |
| Layouts | `packages/next/src/server/app-render/` | Como layouts persistem e compõem |
| Loading/Error | `packages/next/src/client/components/` | Como Suspense boundaries funcionam |
| Server Actions | `packages/next/src/server/app-render/action-handler.ts` | Como actions são processadas |
| Middleware | `packages/next/src/server/web/` | Como middleware executa |
| Build | `packages/next/src/build/` | Pipeline de build, code splitting |
| HMR | `packages/next/src/client/components/react-dev-overlay/` | Hot module replacement |
| Streaming | `packages/next/src/server/stream-utils/` | Streaming SSR |
| Error handling | `packages/next/src/client/components/error-boundary.tsx` | Error boundaries |
| Config | `packages/next/src/server/config*.ts` | next.config.js processing |

### Rails — O que aprender

| Área | Onde procurar | O que extrair |
|---|---|---|
| Routing | `actionpack/lib/action_dispatch/routing/` | DSL de rotas, matching, constraints |
| Middleware | `actionpack/lib/action_dispatch/middleware/` | Stack de middleware composável |
| Error handling | `actionpack/lib/action_dispatch/middleware/exception_wrapper.rb` | Error page rendering |
| Generators | `railties/lib/rails/generators/` | Scaffolding automático |
| Testing | `activesupport/lib/active_support/testing/` | Test helpers, fixtures |
| Convention | `railties/lib/rails/application/` | Convention over configuration |
| Config | `railties/lib/rails/application/configuration.rb` | Sistema de configuração |
| Request lifecycle | `actionpack/lib/action_controller/metal.rb` | Middleware → Controller → View |

## Processo

### Passo 1 — Parse o Tópico

Extrair tópico de `$ARGUMENTS`. Se `--impl` especificado, filtrar implementações.

### Passo 2 — Verificar Cross-Validations Existentes

Antes de pesquisar do zero, verificar se já existe análise:

```bash
# Procurar análises existentes
ls referencias/CROSS_VALIDATION_*.md 2>/dev/null
grep -rl "$TOPIC" referencias/*.md 2>/dev/null
```

### Passo 3 — Pesquisar em Cada Implementação

Para cada implementação (ou as selecionadas):

```bash
# 1. Encontrar arquivos relevantes
grep -rn "$TOPIC" referencias/next.js/ --include='*.ts' --include='*.tsx' --include='*.rs' -l | head -20
grep -rn "$TOPIC" referencias/rails/ --include='*.rb' -l | head -20

# 2. Buscar por padrões relacionados ao tópico
# Exemplo para "routing":
grep -rn 'route\|router\|Route\|Router' referencias/next.js/packages/next/src/ --include='*.ts' -l | head -15

# 3. Ler trechos relevantes
# Usar Read tool nos arquivos mais promissores
```

### Passo 4 — Extrair Padrões

Para cada implementação, extrair:
- **Approach**: como resolvem o problema
- **Key file**: arquivo principal
- **Lines**: linhas relevantes
- **Pattern**: padrão de design usado
- **Trade-offs**: prós e contras da abordagem

### Passo 5 — Produzir Comparação

## Report Format

```markdown
# Reference Research: {topic}

**Data:** YYYY-MM-DD
**Implementações pesquisadas:** [lista]
**Tópico:** {topic}

## Resumo Executivo

{1-3 frases sobre como cada framework resolve o problema e qual padrão se repete}

## Comparação

| Framework | Approach | Key File | Lines | Pattern | Notes |
|---|---|---|---|---|---|
| Next.js | ... | packages/next/src/... | 320-329 | ... | ... |
| Rails | ... | actionpack/lib/... | 162-174 | ... | ... |

## Padrões Encontrados

### Padrão 1: {nome}
**Usado por:** [frameworks]
**Como funciona:**
{descrição técnica com código}

**Trade-offs:**
- Pro: ...
- Con: ...

### Padrão 2: {nome}
...

## O Que Cada Framework Faz Melhor

| Aspecto | Melhor em | Por quê |
|---|---|---|
| ... | Next.js / Rails | ... |

## O Que Cada Framework Faz Pior (Anti-patterns a Evitar)

| Anti-pattern | Framework | Por quê evitar |
|---|---|---|
| ... | ... | ... |

## Recomendação para o Theo

Baseado na pesquisa:

1. **Adotar de {framework}:** {o que copiar e por quê}
2. **Evitar de {framework}:** {o que não copiar e por quê}
3. **Inovar em:** {onde o Theo pode fazer melhor que ambos}

## Impacto em ADRs

{Se a pesquisa afeta decisões arquiteturais já tomadas, listar quais ADRs devem ser revisados}
```

## Tópicos Comuns de Pesquisa

| Tópico | O que pesquisar | Keywords |
|---|---|---|
| `routing` | File-based routing, dynamic segments, catch-all | route, router, path, segment, param |
| `layouts` | Nested layouts, persistence, composition | layout, template, wrapper, children |
| `middleware` | Request lifecycle, stack, order, short-circuit | middleware, before_action, interceptor |
| `error-handling` | Error boundaries, error pages, dev vs prod | error, boundary, exception, rescue |
| `server-actions` | Mutations, forms, CSRF, serialization | action, mutation, form, csrf |
| `streaming` | SSR streaming, Suspense, progressive rendering | stream, pipe, suspense, flush |
| `build` | Bundling, code splitting, tree-shaking | build, bundle, chunk, split, webpack, turbopack |
| `hmr` | Hot module replacement, fast refresh | hmr, hot, reload, refresh, update |
| `config` | Configuration system, defaults, validation | config, configuration, option, setting |
| `testing` | Test helpers, fixtures, test runner | test, spec, fixture, helper, assert |
| `generators` | Scaffolding, project creation, templates | generator, scaffold, create, template |
| `validation` | Input validation, schema, error formatting | validate, schema, coerce, parse |
| `auth` | Authentication, session, middleware | auth, session, token, login, protect |
| `static-assets` | Public files, hashing, cache headers | public, static, asset, hash, cache |
| `env-vars` | Environment, .env, public/private separation | env, environment, dotenv, config |
| `openapi` | API documentation, schema generation | openapi, swagger, schema, doc |
| `cli` | Command design, help, error messages | cli, command, arg, flag, help |
| `context` | Request context, dependency injection | context, ctx, request, scope |

## Integração

- Use esta skill **ANTES** de decisões arquiteturais
- Use `/framework-scope-guardian` DEPOIS para validar que a decisão cabe no MVP
- Use `/framework-api-reviewer` para validar a API resultante
- Resultados alimentam ADRs nos planos via `/to-plan`

## Anti-Patterns

1. **Copiar cegamente** — Entenda POR QUE o framework faz assim, não apenas COMO
2. **Ignorar trade-offs** — Next.js fez escolhas para Vercel. Rails fez para monolitos. O Theo tem constraints diferentes.
3. **Pesquisar sem agir** — Toda pesquisa deve gerar recomendação concreta
4. **Pesquisar demais** — 30 minutos de pesquisa máximo. Se não achou, o problema é diferente.
