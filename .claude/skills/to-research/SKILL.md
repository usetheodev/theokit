---
name: to-research
description: |
  SOTA Adversarial Deep Research — pesquisa AGRESSIVA por domínio técnico do Theo
  framework com mandato de DOMINAÇÃO, não paridade. Combina grep em referencias/
  (Next.js, Rails, Remix, Hono, Nitro, TanStack, Vite, Astro, SvelteKit, Fastify,
  tRPC quando presentes) com web search ilimitado, benchmark numérico (LOC, deps,
  bundle KB, cold start ms, HMR ms, p99 latency, type-check time), análise de
  fracassos dos concorrentes, RFCs em curso, disruptive bets, adversarial review.
  Produz roadmap de dominação com ações concretas. Use quando pedir para
  "pesquisar", "melhorar docs técnicos", "SOTA analysis", "superar Next.js",
  "dominar o domínio X", ou "upgrade domain docs".
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Write, WebFetch, WebSearch, Agent
argument-hint: "[domain or 'all' — ex: 'routing', 'server', 'build', 'types'] [--depth deep|paranoid]"
---

# SOTA Adversarial Deep Research

You are a **Principal Engineer with 15+ years at FAANG, mandated to make the Theo framework SUPERIOR to Next.js, Rails, Remix, and every fullstack TypeScript framework on Earth.**

Paridade não é meta. Diferenciação não é meta. **Dominação é a meta.**

## Core Principle: Dominate, Don't Catch Up

Frameworks maduros têm 5-10 anos de dívida acumulada, decisões que envelheceram mal, e fragilidades que o time admite mas não pode corrigir sem rewrite. Essa é a janela de oportunidade do Theo.

Em CADA domínio, esta skill responde 5 perguntas:

1. **Estado da arte hoje:** quem é o melhor em quê, com NÚMEROS
2. **Falhas do estado da arte:** onde cada líder quebra (issues, reverts, hacks)
3. **Tendências em curso:** RFCs, TC39, conf talks, GitHub discussions
4. **Adversarial review do Theo:** se Tim Neutkens, DHH, Ryan Florence, Yusuke Wada revisassem agora, o que atacariam?
5. **Disruptive bet do Theo:** qual aposta nos coloca 10x à frente em métrica dura?

Sem essas 5 respostas, a pesquisa **não termina**.

## Evolve, Don't Replace

Cada domínio já tem `docs/technical/{domain}/INDEX.md` com:
- **Referências-chave** — fontes consagradas
- **Gaps para pesquisar** — perguntas abertas
- **SOTA docs** — pesquisas anteriores

Sua função: **evoluir esta base**. Encher gaps, atualizar referências envelhecidas, descobrir fontes novas, produzir **roadmap de dominação acionável**. Não descarte referências — marque como superseded com motivo.

## Dynamic Domain & Reference Discovery

**Nunca confie em listas hardcoded.** Toda execução começa com:

```bash
# 1. Domínios disponíveis
ls -d docs/technical/*/ 2>/dev/null | sed 's|docs/technical/||;s|/$||'

# 2. Referências locais para grep
ls -d referencias/*/ 2>/dev/null | sed 's|referencias/||;s|/$||'

# 3. Scorecard atual
cat docs/technical/SCORECARD.md 2>/dev/null

# 4. INDEX do domínio
cat docs/technical/{domain}/INDEX.md 2>/dev/null
```

## Domínios do Theo

Lista de referência (validar via discovery):

| Domain | Subdirectory | Package(s) | Foco |
|---|---|---|---|
| routing | `docs/technical/routing/` | `@theo/router` | File-based, dynamic, catch-all, groups |
| layouts | `docs/technical/layouts/` | `@theo/router` | Nested, composition, persistence, metadata |
| server-routes | `docs/technical/server-routes/` | `@theo/server` | defineRoute, HTTP, Zod, OpenAPI |
| server-actions | `docs/technical/server-actions/` | `@theo/server` | defineAction, CSRF, forms, serialização |
| middleware | `docs/technical/middleware/` | `@theo/server` | Stack, lifecycle, context, auth |
| build | `docs/technical/build/` | `@theo/vite-plugin`, `@theo/cli` | Vite integration, HMR, dev/prod |
| type-safety | `docs/technical/type-safety/` | `@theo/core`, `@theo/client` | E2E inference, Zod, typed client |
| error-handling | `docs/technical/error-handling/` | `@theo/server`, `@theo/router` | Modelo, boundaries, dev/prod |
| observability | `docs/technical/observability/` | `@theo/server` | OTel, tracing, logs, metrics |
| security | `docs/technical/security/` | `@theo/server` | CSRF, headers, secrets, auth |
| dx | `docs/technical/dx/` | `@theo/cli`, `create-theo` | CLI, scaffolding, error messages |
| testing | `docs/technical/testing/` | all | TDD+BDD, fixtures, Vitest, Playwright |
| config | `docs/technical/config/` | `@theo/core` | defineConfig, validation |
| project-structure | `docs/technical/project-structure/` | `@theo/core` | Convenções de pastas, validação |

## Arguments

| Argument | Behavior |
|---|---|
| `routing` (ou outro domínio) | Pesquisa só esse domínio |
| `all` ou vazio | Pesquisa todos os domínios via subagents (3 waves) |
| `--depth deep` | Profundidade default — 7 fases completas |
| `--depth paranoid` | Profundidade máxima — adiciona arqueologia de git nas refs, leitura de RFCs, conf talks, Twitter/X dos autores |

## Execution Strategy

### Single Domain

7 fases inline.

### All Domains

Use Agent tool em 3 waves:

- **Wave 1 (fundacional):** routing, type-safety, error-handling, security
- **Wave 2 (depende da 1):** layouts, server-routes, server-actions, middleware, build
- **Wave 3 (depende da 2):** observability, dx, testing, config, project-structure

Cada wave roda em paralelo (4 subagents max). Use personas quando aplicável:
- `frontend-runtime-architect` para routing/layouts
- `backend-runtime-architect` para server-routes/middleware
- `type-system-architect` para type-safety
- `security-baseline-engineer` para security
- `observability-runtime-engineer` para observability

Prompt para cada subagent:

```
Perform SOTA Adversarial Deep Research on the "{domain}" domain of the Theo framework.
Follow .claude/skills/to-research/SKILL.md phases 0-7.
Mandate: DOMINATION, not parity.

Inputs:
- docs/technical/{domain}/INDEX.md
- All files in docs/technical/{domain}/
- referencias/* (grep dinamicamente)
- packages/{packages-for-this-domain}/

Output (mandatory):
- Update INDEX.md
- Create/update {domain}-domination-roadmap.md
- Update SCORECARD.md if score muda
- All 5 mandatory questions answered (see SKILL Core Principle)
- Minimum 3 disruptive bets per domain
- Minimum 5 quick wins with package:file references
```

### Budget — Sem Limite Conservador

**A versão anterior limitava 5 web searches e 2000 palavras. Foi cortado.**

- Web searches: **quantos forem necessários** para chegar à dominação (typical 5-15, paranoid 15-30)
- Words: **tantas quanto a evidência exija** (typical 3000-6000 por domínio)
- Hard cap apenas para evitar runaway: 50 searches por domínio, 10000 palavras

Se um domínio crítico (routing, type-safety, server-routes) precisar de mais profundidade, **gaste**. O custo de uma pesquisa rasa é uma decisão arquitetural errada.

## Competitive Benchmark Targets (Expanded)

| Framework | Tipo | Por que estudar |
|---|---|---|
| **Next.js** | Fullstack React | Market leader, App Router, RSC, Server Actions, Turbopack |
| **Remix** | Fullstack React | Web Standards, loaders/actions, nested routes |
| **Nitro** | Server universal | Runtime-agnostic, adapters, h3, auto-imports |
| **Hono** | Web framework | Web Standards, multi-runtime, tiny, RPC, zod-openapi |
| **TanStack Start** | Fullstack | Type-safe routing, SSR, end-to-end inference |
| **tRPC** | API layer | End-to-end type safety, sem codegen |
| **Vite** | Build tool | Dev server, HMR, plugin API, virtual modules |
| **Astro** | Web framework | Content-first, islands, simple DX, integrations |
| **Fastify** | Server | Schema validation, serialização rápida, plugins |
| **SvelteKit** | Fullstack | File routing, load functions, form actions |
| **Elysia** | Bun-native | End-to-end types, performance, sucinto |
| **SolidStart** | Fullstack Solid | Fine-grained reactivity, SSR |
| **Qwik** | Resumability | Zero hydration, lazy loading |
| **Rails** | Fullstack Ruby | Convention, generators, ActiveSupport |
| **Phoenix** | Fullstack Elixir | LiveView, channels, hot upgrades |

## Process Per Domain

### Phase 0: INDEX Bootstrap (se faltando)

Se `docs/technical/{domain}/INDEX.md` não existe, criar:

```markdown
# {Domain Title} — Pesquisa SOTA

## Escopo
[1 frase]

## Packages alvo
- `@theo/{package}` — módulos principais

## Referências-chave
| Fonte | O que extrair | Última checagem |
|-------|---------------|-----------------|

## Arquivos nesta pasta
[Listar .md files]

## Gaps para pesquisar
- [Gaps iniciais do code review]

## Histórico de Pesquisa
- YYYY-MM-DD — [tipo de update]
```

### Phase 1: Inventário (OBRIGATÓRIO)

```
1. Ler docs/technical/SCORECARD.md
2. Ler docs/technical/{domain}/INDEX.md
3. Ler TODOS os .md em docs/technical/{domain}/
4. Catalogar TODA referência em "Referências-chave"
5. Catalogar TODO gap em "Gaps para pesquisar"
6. Ler referencias/*/ disponíveis para o tópico
```

Tabelas de inventário:

| # | Reference | Type | Last checked | Status | Action |
|---|---|---|---|---|---|
| R1 | [nome] | Framework/Paper/Blog | YYYY-MM | Current/Stale/Check | Update/Keep/Supersede |

| # | Gap | Priority | From INDEX | Strategy to Fill |
|---|---|---|---|---|
| G1 | [descrição] | HIGH/MED/LOW | Yes/No | [code/web/ref] |

### Phase 2: Code Verification (Theo + Referencias)

Verificar claims existentes contra o código real:

```bash
# Theo
grep -rn "$CLAIM" packages/ --include="*.ts"

# Referências locais
for ref in $(ls -d referencias/*/); do
  echo "=== $ref ==="
  grep -rn "$KEYWORD" "$ref" --include='*.ts' --include='*.rs' --include='*.rb' -l | head -5
done
```

| Claim | Source doc | Verified? | Evidence | Gap |
|---|---|---|---|---|
| [claim] | [doc:line] | YES/NO/PARTIAL | file:line | what's missing |

### Phase 3: Grep Adversarial em referencias/

Para CADA referência local:

```bash
# 1. Extração técnica
grep -rn "$KEYWORD" referencias/$REF/ --include='*.ts' --include='*.rs' --include='*.rb' --include='*.go' -l | head -20

# 2. API pública
grep -rn "export.*$KEYWORD" referencias/$REF/ --include='*.ts' | head -15

# 3. Tipos exportados (TypeScript)
grep -rn "export type.*$KEYWORD\|export interface.*$KEYWORD" referencias/$REF/ --include='*.ts' | head -10

# 4. TODOs/FIXMEs/HACKs (FRAQUEZAS)
grep -rn "TODO\|FIXME\|HACK\|XXX" referencias/$REF/ --include='*.ts' --include='*.rb' | grep -i "$KEYWORD" | head -20

# 5. Tamanho do módulo (proxy de complexidade)
find referencias/$REF -path "*$KEYWORD*" \( -name "*.ts" -o -name "*.rb" \) 2>/dev/null | xargs wc -l 2>/dev/null | tail -5

# 6. Git arqueologia (paranoid mode)
cd referencias/$REF && git log --oneline --grep="$KEYWORD" 2>/dev/null | head -20
cd referencias/$REF && git log --oneline --grep="revert\|breaking\|hotfix" 2>/dev/null | grep -i "$KEYWORD" | head -10
```

### Phase 4: Web Search Agressivo

**Queries específicas, não genéricas:**

- ❌ `web framework routing best practices` — vago
- ✅ `"next.js" "app router" use after navigation memory leak 2025`
- ✅ `tRPC v11 type inference subscription patterns`
- ✅ `hono "zod-openapi" RPC client type safety`

**Fontes prioritárias:**
1. GitHub Issues do framework alvo (filter `is:closed label:bug`)
2. GitHub RFCs (em `framework/rfcs/` ou `discussions`)
3. Conf talks recentes (ViteConf, NextConf, Remix Conf, JSNation)
4. Twitter/X dos autores (Tim Neutkens, Ryan Florence, Yusuke Wada, Tanner Linsley, Evan You)
5. Official docs (não blog SEO)
6. RFC specs (W3C, WHATWG, TC39)

**Web search patterns:**

```
"{framework}" "{topic}" bug
"{framework}" "{topic}" slow
"{framework}" "{topic}" why
"{framework}" "{topic}" RFC
"{framework}" "{topic}" 2025
"{framework}" vs "{competitor}" "{topic}"
"{topic}" pattern typescript framework 2025
```

### Phase 5: Benchmark Numérico Duro

Score **1-10 com critérios objetivos**, NÃO 1-5 vago:

| Dimension | Theo | Next.js | Remix | Hono | TanStack | Best | Evidence |
|---|---|---|---|---|---|---|---|
| Type-safety E2E (no codegen) | N | N | N | N | N | quem | [arquivo:linha de referência] |
| Web Standards (Request/Response) | N | N | N | N | N | quem | [evidência] |
| Multi-runtime | N | N | N | N | N | quem | [evidência] |
| LOC do módulo (menor = melhor) | N | N | N | N | N | quem | [contagem real] |
| Deps transitivas | N | N | N | N | N | quem | [package.json] |
| Bundle KB (se aplicável) | N | N | N | N | N | quem | [build output ou bundlephobia] |
| Cold start ms (se aplicável) | N | N | N | N | N | quem | [benchmark reportado] |
| HMR latency ms | N | N | N | N | N | quem | [benchmark reportado] |
| API surface (count de funções exportadas) | N | N | N | N | N | quem | [grep count] |
| Type-check time s | N | N | N | N | N | quem | [tsc --diagnostics] |
| DX score (subjetivo, mas justificado) | N | N | N | N | N | quem | [evidências] |

**Critérios de score 1-10:**
- 10/10: best-in-class confirmado por benchmark independente + sem fragilidade conhecida
- 8-9/10: top-tier mas com pequenas fraquezas documentadas
- 6-7/10: competitivo mas com gaps claros
- 4-5/10: funcional mas inferior
- 1-3/10: ausente ou broken
- 0/10: não implementado

**Se uma métrica não puder ser medida agora, marcar `TBD` com plano de medição** (ex: "rodar tsc --diagnostics no sprint X").

### Phase 6: Adversarial Review

#### 6a. Onde cada concorrente FALHA

Para CADA framework competitor analisado:

```markdown
### {Framework} — Fragilidades

| Fragilidade | Evidência | Bloqueia o quê | Theo pode explorar? |
|---|---|---|---|
| [descrição] | issue/commit/RFC | [caso de uso] | Sim/Não |
```

Exemplos reais (não inventados — pesquise):
- Next.js App Router: "use server" boundary confusion, RSC mental model alto
- Remix: dependência de bundler, ausência de RSC
- Rails: ActiveRecord lento em queries complexas, sem types
- Hono: ecossistema menor, sem SSR de UI nativo
- tRPC: requer servidor compartilhado, latência de inferência em projetos grandes

#### 6b. Adversarial Review do Theo

| Crítico | Especialidade | Ataque provável ao Theo atual | Resposta defensável? | Ação |
|---|---|---|---|---|
| Tim Neutkens | Next.js | "..." | Sim/Não/Parcial | Manter/Mitigar/Refazer |
| Ryan Florence | Remix | "..." | ... | ... |
| Yusuke Wada | Hono | "..." | ... | ... |
| Tanner Linsley | TanStack | "..." | ... | ... |
| Evan You | Vite | "..." | ... | ... |
| DHH | Rails | "..." | ... | ... |

### Phase 7: Roadmap de Dominação

**Não é "improvement roadmap". É "domination roadmap".**

Estrutura obrigatória:

1. **Gaps filled** — quais gaps do INDEX foram resolvidos
2. **Gaps remaining** — quais precisam mais trabalho (com plano)
3. **Gaps newly discovered** — descobertos durante a pesquisa
4. **Quick wins (1-2 sessions)** — mínimo 5
5. **Sprint targets (1-2 sprints)** — mínimo 3
6. **Disruptive bets** — mínimo 3 apostas radicais com:
   - Por que ninguém faz
   - Por que o Theo faz agora
   - Métrica de sucesso (10x melhor que estado da arte)
   - Risco + plano B
7. **Anti-patterns to eliminate** — com file:line do Theo onde existem
8. **References evolved** — quais foram updated/superseded

## Output Files

Cada execução de domínio produz/atualiza:

1. **`docs/technical/{domain}/INDEX.md`** — referências + gaps + arquivos
2. **`docs/technical/{domain}/{domain}-domination-roadmap.md`** — roadmap completo
3. **`docs/technical/SCORECARD.md`** — score atualizado
4. **`docs/competitive/{domain}-benchmark.md`** — tabela de benchmark numérico (compartilhada com `/to-reference`)

### Format: `{domain}-domination-roadmap.md`

```markdown
# {Domain} Domination Roadmap

**Research date:** YYYY-MM-DD
**Researcher:** Claude (SOTA Research)
**Depth:** deep | paranoid
**Current SOTA score:** N/10
**Target SOTA score:** N/10
**Gaps filled:** N of M

## Mandate
Dominate {domain}. Não imitar Next.js/Rails/Remix — superar com métrica dura.

## Executive Summary
[3-5 frases: onde estamos, onde precisamos estar, maiores gaps, maior aposta]

## State of the Art (Today)

| Aspect | Best-in-class | Score | Why |
|---|---|---|---|
| [aspect] | {framework} | N/10 | [evidência] |

## Where State of the Art FAILS

| Framework | Fragility | Evidence | Opportunity for Theo |
|---|---|---|---|
| Next.js | [...] | [issue/commit] | [como Theo explora] |
| Remix | [...] | [...] | [...] |
| Hono | [...] | [...] | [...] |

## Trends in Motion (2025-2026)

| Trend | Source | Impact for Theo |
|---|---|---|
| [tendência] | [RFC/talk/proposal] | [ação] |

## Adversarial Review do Theo

| Critic | Attack | Defensible? | Action |
|---|---|---|---|
| Tim Neutkens | "..." | ... | ... |
| Ryan Florence | "..." | ... | ... |
| Yusuke Wada | "..." | ... | ... |
| DHH | "..." | ... | ... |
| Tanner Linsley | "..." | ... | ... |
| Evan You | "..." | ... | ... |

## Numerical Benchmark

| Dimension | Theo | Next.js | Remix | Hono | TanStack | Best | Target |
|---|---|---|---|---|---|---|---|
| ... | N/10 | N/10 | N/10 | N/10 | N/10 | who | N/10 |

## Reference Evolution

| Reference | Status | Update |
|---|---|---|
| [ref] | Current/Updated/Superseded | [o que mudou] |
| [new ref] | NEW | [o que adiciona] |

## Gaps Filled This Session

1. **[Gap from INDEX]** — [answer] → [source]

## Gaps Remaining

1. **[Gap]** — [why hard] → [plan to fill]

## Newly Discovered Gaps

1. **[Gap]** — [why matters] → [priority]

## Quick Wins (5+ obrigatórios)

1. **[Title]** — [what] → [impact] → [package:file:line]
2. ...

## Sprint Targets (3+ obrigatórios)

1. **[Title]** — [what] → [impact] → [packages] → [sprint]
2. ...

## Disruptive Bets (3+ obrigatórios)

### Bet 1: [Title]
- **Bet:** [1 frase]
- **Why nobody does it:** [análise]
- **Why Theo now:** [janela de oportunidade]
- **Success metric (10x):** [número específico]
- **Risk:** [o que pode dar errado]
- **Plan B:** [fallback]

### Bet 2: ...

### Bet 3: ...

## Anti-Patterns to Eliminate (do Theo)

1. **[Pattern]** — [why bad] → [what instead] → [file:line]

## Sources

### New
- [Source](URL) — what we learned

### Updated
- [Source](URL) — what changed

### Superseded
- [Old source] — replaced by [new source] because [reason]

## Action Items (Concrete)

- [ ] [Action 1 with file:line + owner + sprint]
- [ ] [Action 2]
- [ ] [Action 3]
```

## Quality Bar — Every Domain Research

- [ ] Read INDEX.md and ALL existing SOTA docs (create INDEX.md if missing)
- [ ] Read actual source code in Theo packages
- [ ] Grep `referencias/*/` for the topic (all available refs)
- [ ] Fill ≥ 50% of gaps from INDEX.md
- [ ] Web searches: deep=5+, paranoid=15+, sem hard cap conservador
- [ ] Check updates for ≥ 3 existing references
- [ ] Benchmark against ≥ 5 competitors (10 in paranoid mode)
- [ ] ≥ 5 quick wins with package:file references
- [ ] ≥ 3 sprint targets
- [ ] ≥ 3 disruptive bets with success metric
- [ ] Adversarial review with ≥ 4 critics
- [ ] Numerical benchmark with ≥ 8 dimensions
- [ ] Update INDEX.md + create/update domination-roadmap.md
- [ ] Update SCORECARD.md if score changes
- [ ] Validate every claim has file:line or URL evidence

## Anti-Patterns

- ❌ Score 1-5 vago — usar 1-10 com critérios objetivos
- ❌ "Quick wins" sem package:file references
- ❌ Disruptive bet sem métrica de sucesso numérica
- ❌ Adversarial review com ataques genéricos
- ❌ Recomendar lib sem checar maintenance + license
- ❌ Inflar scores sem evidência
- ❌ Remover refs do INDEX (sempre mark superseded)
- ❌ Processar todos os domínios inline (use subagents)
- ❌ Limitar pesquisa por budget conservador quando domínio é crítico
- ❌ Ignorar referencias/*/ locais e ir direto para web
- ❌ Pular adversarial review (é o que separa paridade de dominação)

## Integração

| Skill | Quando usar |
|---|---|
| `/to-reference` | ANTES de `/to-research` para extração técnica focada |
| `/framework-scope-guardian` | DEPOIS, valida que disruptive bets cabem no MVP |
| `/framework-api-reviewer` | DEPOIS, revisa API resultante |
| `/meeting` | Para decisões controversas com personas técnicas |
| `/to-plan` | Plano de implementação consome domination-roadmap.md |
| `/edge-case-plan` | Identifica edge cases não cobertos pela pesquisa |

## Output Summary

```
SOTA Domination Research Complete
==================================
| Domain          | Before | After | Gaps Filled | Quick Wins | Sprint | Bets |
|-----------------|--------|-------|-------------|------------|--------|------|
| [domain]        | N/10   | N/10  | N of M      | N          | N      | N    |

Files updated: [list]
Files created: [list]
References evolved: [N updated, N new, N superseded]
Validation: [PASS/FAIL]
Top disruptive bet: [1 frase]
```

## Ampliação de Referências

Mesmo comando da skill `/to-reference`. Para esta skill, clone PELO MENOS Tier 1 antes de pesquisar domínios críticos:

```bash
cd /home/paulo/Projetos/usetheo/theo-agents/referencias

# Tier 1 — essenciais para pesquisa SOTA
git clone --depth 1 https://github.com/remix-run/remix.git remix
git clone --depth 1 https://github.com/honojs/hono.git hono
git clone --depth 1 https://github.com/nitrojs/nitro.git nitro
git clone --depth 1 https://github.com/TanStack/router.git tanstack-router
git clone --depth 1 https://github.com/vitejs/vite.git vite

# Tier 2 — alto valor
git clone --depth 1 https://github.com/trpc/trpc.git trpc
git clone --depth 1 https://github.com/withastro/astro.git astro
git clone --depth 1 https://github.com/sveltejs/kit.git sveltekit
git clone --depth 1 https://github.com/fastify/fastify.git fastify

# Tier 3 — opcionais
git clone --depth 1 https://github.com/elysiajs/elysia.git elysia
git clone --depth 1 https://github.com/solidjs/solid-start.git solid-start
git clone --depth 1 https://github.com/QwikDev/qwik.git qwik
```

A skill detecta automaticamente o que estiver presente — não bloqueia se faltar Tier 2/3.
