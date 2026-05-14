---
name: to-reference
description: "Adversarial competitive intelligence — pesquisa AGRESSIVA nas implementações de referência em referencias/ para extrair como cada framework resolve um problema, ONDE eles falham, e como o Theo pode dominar. Produz benchmark numérico, adversarial review e disruptive bets. Persiste em docs/competitive/. Use ANTES de qualquer decisão arquitetural."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "<topic> [--impl nextjs,rails,...] [--depth quick|deep|paranoid]"
---

# Adversarial Reference Research: Como Vamos Dominar?

**Não somos turistas em código alheio. Somos engenheiros adversariais buscando vantagem competitiva.**

Esta skill é o ponto de partida obrigatório antes de qualquer decisão arquitetural. Para CADA tópico pesquisado, ela responde 3 perguntas:

1. **Como cada framework resolve isso?** (extração técnica)
2. **Onde cada framework FALHA?** (análise adversarial — issues, RFCs revertidos, anti-patterns)
3. **Como o Theo faz 10x melhor?** (disruptive bet, não imitação)

Sem mandato de dominação, esta skill não roda. Comparar não basta — temos que **superar**.

## Arguments

- `$ARGUMENTS` primeira parte = tópico (ex: "routing", "server-actions", "type-safety", "HMR")
- `--impl <names>` (opcional) = subset de implementações, separado por vírgula. Default: todas em `referencias/`
- `--depth quick|deep|paranoid` (opcional, default `deep`)
  - `quick` — 15 min, 1 fluxo por framework, sem adversarial
  - `deep` — 45 min, fluxo completo + falhas conhecidas + disruptive bet (DEFAULT)
  - `paranoid` — 90 min, dissecação completa + git arqueologia + RFCs + roadmap de dominação

## Discovery Dinâmica de Referências

**NUNCA hardcode a lista de referências.** Sempre rode:

```bash
ls -d referencias/*/ 2>/dev/null | sed 's|referencias/||;s|/$||'
```

Cada subdiretório de `referencias/` é uma referência candidata. Detecte a linguagem automaticamente:

```bash
for ref in referencias/*/; do
  name=$(basename "$ref")
  langs=$(find "$ref" -maxdepth 3 -type f -name "*.ts" -o -name "*.rs" -o -name "*.rb" -o -name "*.go" -o -name "*.py" 2>/dev/null | sed 's/.*\.//' | sort -u | tr '\n' ',')
  loc=$(find "$ref" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.rs" -o -name "*.rb" -o -name "*.go" \) ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  echo "$name | langs: $langs | LOC: $loc"
done
```

## Referências Esperadas (Estado Alvo)

Para máxima cobertura, `referencias/` deve conter:

| Framework | Path | Por que importa | Status |
|---|---|---|---|
| Next.js | `referencias/next.js/` | Market leader, RSC, App Router | ✅ presente |
| Rails | `referencias/rails/` | Convention over configuration | ✅ presente |
| **Remix** | `referencias/remix/` | Web Standards, loaders/actions, nested routes | ⚠️ clonar |
| **Hono** | `referencias/hono/` | Web Standards, multi-runtime, tiny core | ⚠️ clonar |
| **Nitro** | `referencias/nitro/` | Runtime adapters, h3, auto-imports | ⚠️ clonar |
| **TanStack Start** | `referencias/tanstack-router/` | Type-safe routing, end-to-end inference | ⚠️ clonar |
| **tRPC** | `referencias/trpc/` | End-to-end type safety sem codegen | ⚠️ clonar |
| **Vite** | `referencias/vite/` | Build tool, plugin API, HMR (Theo já usa) | ⚠️ clonar |
| **Astro** | `referencias/astro/` | Islands, content-first, file routing | ⚠️ clonar |
| **SvelteKit** | `referencias/sveltekit/` | File routing, form actions, load functions | ⚠️ clonar |
| **Fastify** | `referencias/fastify/` | Schema-based serialization, plugin system | ⚠️ clonar |
| **Elysia** | `referencias/elysia/` | Bun-native, end-to-end types, sucinto | ⚠️ opcional |

Se uma referência esperada está ausente, **mencione no output** mas continue com o que houver. Não bloqueia.

## Processo

### Passo 1 — Discovery + Inventory

```bash
# 1. Listar referências disponíveis
REFS=$(ls -d referencias/*/ 2>/dev/null | sed 's|referencias/||;s|/$||')
echo "Referências disponíveis: $REFS"

# 2. Verificar análises prévias do tópico
ls docs/competitive/ 2>/dev/null | grep -i "$TOPIC"
grep -rl "$TOPIC" docs/competitive/ 2>/dev/null
grep -rl "$TOPIC" docs/technical/ 2>/dev/null

# 3. Identificar pacote do Theo afetado
grep -rl "$TOPIC" packages/ --include="*.ts" 2>/dev/null | head -10
```

### Passo 2 — Extração Técnica (Por Framework)

Para CADA framework em `--impl` (ou todos):

```bash
# Arquivos relevantes
grep -rn "$KEYWORD" referencias/$FRAMEWORK/ --include='*.ts' --include='*.rs' --include='*.rb' --include='*.go' -l | head -20

# Entrypoints do fluxo
grep -rn "export.*function $KEYWORD\|export class .*$KEYWORD\|def $KEYWORD" referencias/$FRAMEWORK/ | head -15

# Tipos públicos (TypeScript)
grep -rn "export type.*$KEYWORD\|export interface.*$KEYWORD" referencias/$FRAMEWORK/ --include='*.ts' | head -10

# Tamanho relativo do módulo
find referencias/$FRAMEWORK/ -path "*$KEYWORD*" -name "*.ts" -o -name "*.rb" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1
```

Para cada framework, extrair:

- **API pública** (assinaturas, tipos exportados)
- **Mecanismo interno** (como funciona por baixo)
- **LOC** do módulo (proxy de complexidade)
- **Dependências externas** (custo de adoção)
- **Padrão de design** (Factory, Plugin, Middleware, etc.)

### Passo 3 — Análise Adversarial (DEEP/PARANOID)

**Esta fase é OBRIGATÓRIA em modo deep e paranoid.** Onde o framework FALHA?

```bash
# 1. TODOs, FIXMEs, HACKs no código
grep -rn "TODO\|FIXME\|HACK\|XXX" referencias/$FRAMEWORK/ --include='*.ts' --include='*.rb' | grep -i "$KEYWORD" | head -20

# 2. Commits de fix/revert no tópico (arqueologia)
cd referencias/$FRAMEWORK && git log --oneline --grep="$KEYWORD" --grep="revert\|hotfix\|breaking" --all-match 2>/dev/null | head -30

# 3. Issues conhecidas (se houver CHANGELOG/RELEASE_NOTES)
find referencias/$FRAMEWORK -maxdepth 3 -name "CHANGELOG*" -o -name "RELEASES*" 2>/dev/null

# 4. Discussões públicas (use WebSearch se necessário)
# Procurar: "$FRAMEWORK $KEYWORD bug", "$FRAMEWORK $KEYWORD slow", "$FRAMEWORK $KEYWORD why"
```

Para cada framework, documentar:

- **Fragilidades** — onde falha, qual edge case quebra
- **Trade-offs ruins** — escolhas que envelheceram mal
- **Anti-patterns** — código que o próprio time admite ser ruim
- **Limitações fundamentais** — não-corrigíveis sem rewrite

### Passo 4 — Benchmark Numérico (Não Score 1-5 Vago)

Tabela obrigatória com NÚMEROS:

| Métrica | Theo | Next.js | Rails | Remix | Hono | Líder |
|---|---|---|---|---|---|---|
| LOC do módulo | N | N | N | N | N | quem |
| Deps transitivas | N | N | N | N | N | quem |
| API surface (funções exportadas) | N | N | N | N | N | quem |
| Type-safety end-to-end | sim/não/parcial | ... | ... | ... | ... | quem |
| Web Standards (Request/Response) | sim/não | ... | ... | ... | ... | quem |
| Multi-runtime | sim/não | ... | ... | ... | ... | quem |
| Bundle KB (se aplicável) | N | N | N | N | N | quem |
| Cold start ms (se aplicável) | N | N | N | N | N | quem |

Se uma métrica não for diretamente comparável, marque "N/A — explique por quê", não invente.

### Passo 5 — Adversarial Review do Theo

**Inversão do papel.** Se o autor do Next.js (Tim Neutkens), do Remix (Ryan Florence), do Hono (Yusuke Wada) e do Rails (DHH) revisassem a abordagem atual do Theo nesse tópico, **o que cada um atacaria?**

| Crítico | Ataque provável | Resposta do Theo |
|---|---|---|
| Tim Neutkens (Next.js) | "Vocês não têm RSC, perdem ganho de bundle" | (resposta defensável OU TODO real) |
| Ryan Florence (Remix) | "Server Actions REST quebram Web Standards" | ... |
| Yusuke Wada (Hono) | "Vocês acoplam a Vite, não roda em Cloudflare Workers nativo" | ... |
| DHH (Rails) | "Falta convention, gerador de scaffold real" | ... |

Cada ataque é uma **dívida visível ou um trade-off consciente**. Não invente respostas — se não há resposta, é gap real.

### Passo 6 — Disruptive Bet (10x Não Imitação)

A imitação produz paridade. A dominação exige aposta.

Para cada tópico, propor 1 disruptive bet — uma escolha radical que nenhum concorrente fez (ou que fizeram e abandonaram). Critérios:

- **Por que ninguém faz?** (custo, complexidade, contexto histórico)
- **Por que faz sentido para o Theo agora?** (constraints diferentes, oportunidade)
- **Como medimos sucesso?** (métrica dura: 10x menos LOC, 10x menos config, type-safety total, etc.)
- **Risco de fracasso e plano B**

Exemplos de disruptive bets típicos:
- "Server Actions como Web Standards Form actions + Zod schema, zero serialização customizada"
- "Routing com zero magic — exporta defineRoute, não scan de arquivo no build"
- "Type-safety end-to-end SEM codegen (estilo tRPC), inferindo direto do server"
- "HMR via Vite com zero plugin Theo — usa virtual modules para o file routing"

## Output Format — `docs/competitive/{topic}.md`

```markdown
# Competitive Intelligence: {topic}

**Data:** YYYY-MM-DD
**Depth:** quick | deep | paranoid
**Theo packages afetados:** [lista]
**Referências analisadas:** [lista]
**Referências ausentes:** [lista — para você clonar depois]

## Sumário Executivo (3 frases)

1. Como cada framework resolve.
2. Onde o estado da arte falha hoje.
3. Aposta de dominação do Theo.

## Tabela de Extração Técnica

| Framework | Approach | Key file:line | LOC | Deps | Pattern |
|---|---|---|---|---|---|
| Next.js | ... | packages/next/.../X.ts:320 | N | N | Factory |
| Rails | ... | actionpack/lib/.../Y.rb:162 | N | N | Convention |
| Remix | ... | ... | N | N | ... |
| Hono | ... | ... | N | N | ... |

## Benchmark Numérico

| Métrica | Theo | Next.js | Rails | Remix | Hono | Líder |
|---|---|---|---|---|---|---|
| LOC | N | N | N | N | N | quem |
| Deps | N | N | N | N | N | quem |
| API surface | N | N | N | N | N | quem |
| Type-safety E2E | ... | ... | ... | ... | ... | quem |
| Web Standards | ... | ... | ... | ... | ... | quem |
| ... | ... | ... | ... | ... | ... | ... |

## Análise Adversarial — Onde Cada Um Falha

### Next.js
- **Fragilidade:** [com referência a issue/commit]
- **Trade-off ruim:** ...
- **Anti-pattern:** [file:line]

### Rails
- ...

### Remix
- ...

### Hono
- ...

## Adversarial Review do Theo

| Crítico | Ataque | Resposta defensável? | Ação |
|---|---|---|---|
| Tim Neutkens | "..." | Sim/Não/Parcial | Manter / Mitigar / Refazer |
| Ryan Florence | "..." | ... | ... |
| Yusuke Wada | "..." | ... | ... |
| DHH | "..." | ... | ... |

## Padrões Convergentes (Onde TODOS Concordam)

1. **{padrão}** — todos fazem assim, porque... → Theo DEVE adotar.
2. ...

## Padrões Divergentes (Trade-off Real)

1. **{decisão}** — Next.js faz X, Hono faz Y. Trade-off: ... → Theo escolhe **Z porque...**.
2. ...

## Disruptive Bet do Theo — A Aposta de Dominação

**Aposta:** {1 frase clara}

**Por que ninguém faz:** {análise honesta}

**Por que o Theo faz agora:** {constraint específica + janela de oportunidade}

**Sucesso medido por:**
- Métrica 1: ... (target N, baseline atual N)
- Métrica 2: ...

**Risco:** {o que pode dar errado}

**Plano B:** {fallback se a aposta falhar}

## Recomendação Final

### Adotar (paridade competitiva)
1. **{do framework X}** — {o quê + por quê + arquivo do Theo a modificar}

### Rejeitar (não imitar)
1. **{do framework Y}** — {o quê + por que NÃO + qual alternativa}

### Dominar (disruptive bet)
1. **{aposta acima}** — {ação concreta + dono + sprint alvo}

## Impacto em ADRs Existentes

- ADR-XXX: status (manter / revisar / descartar)
- ...

## Próximos Passos Concretos

- [ ] {Ação 1 com arquivo + linha}
- [ ] {Ação 2}
- [ ] {Ação 3}

## Referências Citadas

- {framework}: {file:line} — {o que mostra}
- {framework}: {commit hash} — {fix relevante}
- {URL externa se houver}
```

## Tópicos Comuns

| Tópico | Keywords para grep | Líderes a estudar |
|---|---|---|
| `routing` | `route, router, segment, param, dynamic` | Next.js (App Router), TanStack Router, SvelteKit |
| `layouts` | `layout, template, outlet, slot, children` | Next.js (parallel routes), Remix (nested) |
| `middleware` | `middleware, handler, before, intercept, chain` | Hono, Rails, Nitro |
| `server-routes` | `loader, action, defineRoute, get, post` | Hono (Route handlers), Remix (loaders), Next.js (route handlers) |
| `server-actions` | `action, mutation, form, useFormState` | Next.js (Server Actions), Remix (actions), SvelteKit (form actions) |
| `streaming` | `stream, flush, suspense, RSC, pipe` | Next.js (RSC), Remix (defer), SvelteKit (streaming) |
| `build` | `bundle, chunk, split, treeshake, optimize` | Vite, Turbopack (Next.js), Rollup |
| `hmr` | `hmr, hot, reload, refresh, accept` | Vite (canonical), webpack (legacy) |
| `type-safety` | `infer, type, generic, schema, validate` | tRPC, TanStack, Hono RPC, Effect |
| `error-handling` | `error, exception, rescue, boundary, catch` | Remix (ErrorBoundary), Hono (onError) |
| `config` | `config, defineConfig, options, defaults` | Vite (defineConfig), Next.js (next.config), Astro |
| `cli` | `command, flag, arg, scaffold, generate` | Vite CLI, Astro CLI, Rails generators |
| `testing` | `test, fixture, mock, vitest, playwright` | Vitest, Playwright, Rails fixtures |
| `auth` | `session, cookie, token, csrf, auth` | Lucia, NextAuth, Rails has_secure_password |
| `env` | `env, dotenv, public, secret, NEXT_PUBLIC` | Vite (import.meta.env), Next.js (NEXT_PUBLIC_), Astro |
| `openapi` | `openapi, swagger, zod-openapi, schema` | Hono (zod-openapi), Fastify (json-schema) |
| `observability` | `otel, opentelemetry, trace, span, metric` | OpenTelemetry instrumentation packages |
| `static-assets` | `public, static, asset, hash, immutable` | Vite, Astro, Next.js |
| `context` | `context, AsyncLocalStorage, scope, request` | Hono (Context), Nitro (useEvent), Next.js (headers) |

## Quality Bar

Toda execução de `to-reference` em modo `deep` ou `paranoid` DEVE produzir:

- [ ] Discovery dinâmica de `referencias/*/` (não hardcoded)
- [ ] Mínimo 3 frameworks comparados (se houver no disco)
- [ ] Tabela de extração técnica com file:line REAL (não inventado)
- [ ] Benchmark numérico com >= 4 métricas duras
- [ ] Análise adversarial — fraqueza concreta de cada framework com evidência
- [ ] Adversarial review do Theo — 4 críticos, 4 ataques, 4 ações
- [ ] Pelo menos 1 disruptive bet com métrica de sucesso + plano B
- [ ] Output gravado em `docs/competitive/{topic}.md`
- [ ] Próximos passos com arquivo do Theo + linha (>= 3 ações)

Se algum item falhar, a skill **NÃO termina**. Retorna ao Passo correspondente.

## Anti-Patterns da Skill

- **Comparação sem benchmark numérico** — score 1-5 não conta. Tem que ter número.
- **Imitação como conclusão** — "vamos fazer como Next.js" não é dominação.
- **Adversarial review fake** — inventar ataque genérico. O ataque tem que ser específico.
- **Disruptive bet vago** — "fazer melhor que todos" não é bet. "Reduzir API surface em 70% mantendo paridade" é.
- **Pular file:line** — toda referência precisa ser auditável.
- **Hardcoded framework list** — sempre `ls referencias/`.

## Integração com Outras Skills

| Skill | Quando usar |
|---|---|
| `/to-research` | DEPOIS de `to-reference`: aprofunda com web search + RFCs |
| `/framework-scope-guardian` | Valida que a disruptive bet cabe no MVP |
| `/framework-api-reviewer` | Revisa a API resultante da decisão |
| `/meeting` | Para decisões controversas, leva o relatório à reunião |
| `/to-plan` | Plano de implementação consome `docs/competitive/{topic}.md` |

## Comandos de Clonagem de Referências (Execução Manual)

Quando quiser ampliar o universo de referências:

```bash
cd /home/paulo/Projetos/usetheo/theo-agents/referencias

# Tier 1 — essenciais
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
```

Adicionar ao `.gitignore` do projeto para não versionar:
```
referencias/
```
