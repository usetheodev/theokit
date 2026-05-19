---
name: to-reference
description: "Deep dive nas implementações de referência em `referencias/` para extrair técnicas, padrões, dependências externas, design patterns, algoritmos, edge cases — TUDO necessário para escrever o módulo equivalente no TheoKit. Gera um guia de implementação completo em `.claude/knowledge-base/reference/{topic}.md`. Use ANTES de começar a codar qualquer módulo não-trivial."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Agent
argument-hint: "<topic> [--impl nextjs,hono,...] [--depth standard|exhaustive]"
---

# to-reference: Deep Dive → Guia de Implementação

**Não é benchmark, não é marketing, não é "disruptive bet".** Esta skill produz um documento que um humano (ou outro Claude) lê e consegue **implementar o módulo no TheoKit sem precisar voltar a pesquisar nada**.

Exemplo concreto do output esperado:

> Input: `/to-reference Server Components (RSC)`
> Output: `.claude/knowledge-base/reference/server-components-rsc.md` — 8–15 páginas com como Next.js implementa RSC (file:line), como Remix encara o problema, que libs internas usam (e.g. `react-server-dom-webpack`), que algoritmo de payload binário usam, edge cases conhecidos (e.g. `'use client'` boundary corruption), e **plano de implementação para TheoKit** (arquivos a criar, API pública, deps a adotar, fases de rollout, testes).

Quem ler esse documento depois deve conseguir abrir um editor e começar a digitar código.

---

## Argumentos

- `$ARGUMENTS` primeira parte = tópico em natural language (ex: `Server Components (RSC)`, `routing`, `HMR`, `type-safe forms`)
- `--impl <names>` = subset de implementações em `referencias/` (default: todas que tiverem o keyword)
- `--depth standard|exhaustive` (default `standard`)
  - `standard` ≈ 45–60 min — 3+ frameworks, padrões extraídos, deps catalogadas, implementation guide
  - `exhaustive` ≈ 2h — todos os frameworks com keyword, git arqueologia, RFCs públicas, edge case enumeration

---

## Output canônico

**Local fixo:** `.claude/knowledge-base/reference/{topic-kebab}.md`

`{topic-kebab}` é a versão kebab-case do tópico (ex: `Server Components (RSC)` → `server-components-rsc.md`). Sem subpastas, sem prefixos de data. Um arquivo por tópico. Reexecutar a skill no mesmo tópico **sobrescreve com aviso** — força commit antes de sobrescrever.

Antes de qualquer Write:

```bash
mkdir -p .claude/knowledge-base/reference
test -f .claude/knowledge-base/reference/{slug}.md && \
  echo "WARN: documento existente. Commit suas mudanças antes." || \
  echo "OK: novo documento."
```

---

## Discovery dinâmica

**NUNCA hardcode a lista de frameworks.** A pasta `referencias/` é gitignored — diferentes devs podem ter clones diferentes. Sempre comece com:

```bash
ls -d referencias/*/ 2>/dev/null | sed 's|referencias/||;s|/$||'
```

Se `referencias/` estiver vazia, **pare e instrua o usuário a clonar** (ver seção de clonagem no final). Não invente prior art.

Para cada framework presente, descubra a linguagem e o tamanho:

```bash
for ref in referencias/*/; do
  name=$(basename "$ref")
  ts=$(find "$ref" -name "*.ts" ! -path "*/node_modules/*" 2>/dev/null | wc -l)
  rs=$(find "$ref" -name "*.rs" ! -path "*/node_modules/*" 2>/dev/null | wc -l)
  rb=$(find "$ref" -name "*.rb" ! -path "*/node_modules/*" 2>/dev/null | wc -l)
  echo "$name | ts:$ts rs:$rs rb:$rb"
done
```

---

## Processo

### Passo 1 — Mapear o problema

Antes de tocar `referencias/`:

1. **Qual o problema concreto** o TheoKit quer resolver com este módulo?
2. **Qual o package do TheoKit afetado?** (`packages/theo/src/{router,server,client,vite-plugin,...}`)
3. **Já existe algo parcial?** `grep -rln "{keyword}" packages/`
4. **Quais arquivos da pasta `.claude/knowledge-base/reference/` referenciam tópicos vizinhos?** (evita escrever doc isolado quando há contexto)

Salve esses 4 itens em um buffer mental — viram a primeira seção do doc.

### Passo 2 — Identificar entrypoints em cada framework

Para cada framework em `referencias/`, ache os arquivos-chave:

```bash
KEYWORD="<termo principal>"   # ex: server-component, rsc, route, hmr
for fw in $(ls -d referencias/*/); do
  name=$(basename "$fw")
  echo "=== $name ==="
  # Entrypoints: arquivos com o keyword no nome
  find "$fw" -type f \( -name "*${KEYWORD}*" \) ! -path "*/node_modules/*" ! -path "*/dist/*" 2>/dev/null | head -10
  # Exports públicos
  grep -rln "export.*\b${KEYWORD}\b" "$fw"/src "$fw"/packages 2>/dev/null | head -5
done
```

Liste TODOS os arquivos relevantes. Não pule — é nesta lista que o resto da skill se ancora.

### Passo 3 — Deep read (NÃO grep apenas)

Para os 5–10 arquivos mais centrais de cada framework, **leia o arquivo inteiro** (Read tool, sem offset). Anote em cada um:

1. **API pública** — exports nomeados, tipos, defaults
2. **Algoritmo interno** — passo a passo do que o módulo FAZ, em prosa
3. **Estado/data structures** — quais Maps, Sets, classes carregam estado
4. **Dependências externas** — `import` de não-stdlib (`react`, `webpack`, `acorn`, etc.)
5. **Side effects** — escreve filesystem? mexe em globals? injeta `<script>`?
6. **TODOs/FIXMEs/HACKs** — copie literalmente, com file:line
7. **Padrão de design** — Factory? Plugin? Middleware? Observer? Visitor?

Resultado: notas estruturadas por framework. Não passe para o Passo 4 sem ter feito leitura completa de pelo menos 3 arquivos por framework.

### Passo 4 — Catalogar dependências externas

**Esta etapa é o diferencial.** Quais libs npm/cargo/gem cada framework usa para resolver o problema?

```bash
# Filtra imports não-stdlib relevantes ao tópico
grep -rn "^import.*from ['\"][^./]" referencias/$FW --include="*.ts" 2>/dev/null \
  | grep -i "$KEYWORD" \
  | awk -F"'" '{print $2}' | awk -F'"' '{print $1}' \
  | sort -u
```

Para cada lib aparecer:
- **Nome** + versão pinada no `package.json` do framework
- **Função no contexto** (não a descrição genérica — o uso específico)
- **Possível adoção no TheoKit** (sim / não / avaliar)

Libs que aparecem em **2+ frameworks** são tipicamente ovos de ouro. Marque-as como "convergent dependency".

### Passo 5 — Extrair padrões

Padrões convergentes (todos fazem assim) e divergentes (cada um faz diferente). Para cada padrão:

- **Nome do padrão** (ex: "Per-request context via AsyncLocalStorage")
- **Quem usa** (com file:line)
- **Por que funciona**
- **Trade-off conhecido**

### Passo 6 — Catalogar edge cases

Como cada framework descobriu os edge cases? Olhe:

```bash
# Commits que mencionam fix/bug no tópico
cd referencias/$FW
git log --oneline --grep="$KEYWORD" --grep="fix\|hotfix\|bug" --all-match 2>/dev/null | head -30

# CHANGELOG entries
grep -i "$KEYWORD" "$fw"/CHANGELOG*.md 2>/dev/null | head -20

# Issues/RFCs no tree
find "$fw" -maxdepth 3 -name "RFC*" -o -name "DESIGN*" 2>/dev/null
```

Cada edge case vira uma linha na tabela de "Edge cases conhecidos" — com a fonte (commit hash ou changelog version).

### Passo 7 — Escrever o Implementation Guide

A seção mais importante do output. Estrutura obrigatória:

1. **Arquitetura proposta** — diagrama em ASCII (boxes + arrows)
2. **Files to create** — caminho exato dentro de `packages/`
3. **Public API surface** — assinatura TypeScript de cada export
4. **Dependências a adotar** — npm packages com versão alvo
5. **Test strategy** — quais arquivos de teste, quais cenários BDD
6. **Phases of rollout** — 2–4 fases incrementais
7. **Acceptance criteria** — checklist verificável
8. **Risks + mitigations**

Cada item da lista DEVE ser concretamente acionável — alguém abre o editor e começa.

---

## Estrutura do output — `.claude/knowledge-base/reference/{slug}.md`

```markdown
# Reference: {Topic}

**Date:** YYYY-MM-DD
**Depth:** standard | exhaustive
**Frameworks analyzed:** [lista com versões / commit hash]
**TheoKit package affected:** [path]
**Related references:** [outros docs em .claude/knowledge-base/reference/ que tocam o assunto]

---

## 1. Problem statement

- **What:** {1 parágrafo — o que precisamos implementar no TheoKit e por quê}
- **Current state:** {o que já existe, parcialmente ou não}
- **Why now:** {gatilho — issue, plano, gap competitivo}

## 2. Prior art — deep dive por framework

### {Framework} — version {x}.{y}.{z}

#### API pública
```ts
// {file:line}
export function foo(...): Bar { … }
export type Baz = …
```

#### Algoritmo interno (prosa, passo a passo)

1. {Passo 1, com file:line ancorado}
2. {Passo 2}
3. …

#### Estado mantido

- `{nome do Map/Set/Class}` em `{file:line}` — guarda {o quê} pelo motivo de {qual}

#### Dependências externas usadas

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `acorn` | ^8.x | Parse JS para detectar `'use client'` | Sim / Não / Avaliar |

#### Side effects observáveis

- Escreve em `node_modules/.cache/{framework}/...`
- Adiciona listener em `process.on('exit')`
- ...

#### TODOs / FIXMEs / HACKs literais

> `// FIXME: this loses precision when …` — `{file:line}`

#### Padrão de design

- Pattern: **Per-segment Factory + Plugin chain**
- Por que: {explicação em 1–2 frases}

(Repetir essa subsection para CADA framework analisado — Next.js / Remix / Hono / Astro / etc.)

## 3. Convergent patterns (todos concordam)

1. **{Pattern X}** — adotado por: Next.js ({file:line}), Remix ({file:line}), Astro ({file:line}). Funciona porque {razão concreta}. **TheoKit deve adotar.**
2. ...

## 4. Divergent patterns (trade-off real)

1. **{Decision Y}**
   - Next.js: faz `A` (file:line) — trade-off: {custos}
   - Hono: faz `B` (file:line) — trade-off: {custos}
   - **TheoKit choice:** `C porque {razão}`
2. ...

## 5. Dependency inventory — bibliotecas comuns

Convergent libs (aparecem em 2+ frameworks):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `acorn` | Next.js, Vite | AST parsing | **Adotar** (já trans-dep via vite) |
| `magic-string` | Vite, Astro | Source-map-safe string edits | **Adotar** se precisarmos editar source |
| `es-module-lexer` | Vite, Next.js | Detectar imports rapidamente | **Avaliar** |

## 6. Algorithms / data structures não-óbvios

- **{Algorithm name}** ({framework} {file:line}) — {descrição em 1 parágrafo + complexidade}
- **{Data structure name}** ({framework} {file:line}) — {por que essa estrutura, não a óbvia}

## 7. Edge cases conhecidos (com fonte)

| Edge case | Como manifesta | Onde foi corrigido | Como devemos prevenir |
|---|---|---|---|
| `'use client'` boundary corruption when re-exporting | Component renderiza no server por engano | Next.js 14.0.4 (commit abc123) | Validar no parse-time + warn |
| ... | ... | ... | ... |

## 8. Implementation Guide

### 8.1 Arquitetura proposta

```
┌─────────────────────┐
│  user code (app/)   │
└─────────┬───────────┘
          │ uses
          ▼
┌─────────────────────┐      ┌─────────────────┐
│  defineXxx() helper │─────▶│  XxxRegistry    │
└─────────┬───────────┘      └─────────────────┘
          │ resolved at build
          ▼
┌─────────────────────┐
│  vite-plugin/...    │
└─────────────────────┘
```

### 8.2 Files to create

```
packages/theo/src/{package}/{module}.ts         — entrypoint público
packages/theo/src/{package}/{module}-internal.ts — algoritmo interno
packages/theo/src/{package}/{module}-types.ts   — interfaces Zod + TS
tests/unit/{module}.test.ts                      — TDD primary
tests/integration/{module}-pipeline.test.ts      — pipeline real
fixtures/{module}-basic/                          — Playwright fixture
```

### 8.3 Public API surface (TypeScript)

```ts
export function defineXxx<...>(...): XxxConfig<...> { … }

export interface XxxOptions {
  ...
}

export type XxxHandler = (ctx: XxxContext) => ...
```

### 8.4 Dependências a adotar

| Package | Version | Justification |
|---|---|---|
| `acorn` | `^8.11.0` | Already transitive via vite — pin direct para AST parsing |
| `magic-string` | `^0.30.0` | Source-map-safe injection |

(ou "nenhuma — implementação fica em pure TS")

### 8.5 Test strategy

- **Unit:** `tests/unit/{module}.test.ts` — N cenários BDD
  - Happy path
  - Validation error
  - Edge case (lista os do passo 7)
  - Error scenario
- **Integration:** `tests/integration/{module}-pipeline.test.ts`
- **Fixture:** `fixtures/{module}-basic/` — projeto reproduzível
- **Playwright (se UI):** `tests/e2e/{module}.spec.ts`

### 8.6 Phases of rollout

1. **Phase 1 — Core API + unit tests** (target: green TDD)
2. **Phase 2 — Vite plugin wiring** (target: dev server end-to-end)
3. **Phase 3 — Production build** (target: prod build + Playwright spec)
4. **Phase 4 — Migration / opt-out** (se quebrar API existente)

### 8.7 Acceptance criteria

- [ ] {Critério 1 verificável}
- [ ] {Critério 2}
- [ ] tsc --noEmit clean
- [ ] vitest run green
- [ ] Playwright spec passes
- [ ] Dogfood check added

### 8.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| {risco concreto} | high/med/low | {fix preventivo} |

## 9. Open questions

Itens onde a pesquisa NÃO chegou em resposta. Cada um vira um TODO antes de começar a implementação.

1. {Pergunta} — possíveis caminhos: A / B
2. ...

## 10. Referências citadas

- {framework} — {file:line ou commit hash} — {o que mostra}
- {framework} — {file:line} — {…}
- {URL externa, se houver} — {…}
```

---

## Quality bar

Toda execução em modo `standard` ou `exhaustive` DEVE produzir:

- [ ] Discovery dinâmica de `referencias/*/` (não hardcoded)
- [ ] Mínimo **3 frameworks** com deep-read (≥ 3 arquivos lidos inteiros por framework)
- [ ] Tabela de dependências externas com versão pinada
- [ ] Mínimo **5 padrões** identificados (convergent + divergent)
- [ ] Mínimo **5 edge cases** com fonte (commit hash ou CHANGELOG)
- [ ] Implementation Guide com **todas as 8 subsections** preenchidas
- [ ] Lista de open questions (mínimo 2 — se zero, a pesquisa foi rasa demais)
- [ ] Output em `.claude/knowledge-base/reference/{slug}.md`

Se qualquer item falhar, a skill **NÃO termina** — volta ao passo correspondente.

---

## Anti-patterns

- **Grep-and-dump.** Pegar `grep` results e colar no doc sem ler o código não conta como deep dive.
- **API surface sem prosa.** Listar `export function foo()` sem explicar O QUE foo faz é inútil para quem vai implementar.
- **"TODO: investigate"** no Implementation Guide. Se está como TODO, ainda é Passo 3, não Passo 7.
- **Ignorar dependências externas.** A seção 5 é onde mora o tempo poupado — bibliotecas que outros já vetaram resolvem 60% do trabalho.
- **Implementation Guide vago.** "Implementar módulo X" não é guide. "Criar `packages/theo/src/router/rsc.ts` com `export function defineRsc(opts: RscOptions)` usando `react-server-dom-webpack@^18.3.0`" é guide.
- **Pular open questions.** Pesquisa sem dúvidas é pesquisa rasa. Se não restou pergunta, leu superficialmente.

---

## Tópicos comuns + keywords + frameworks-alvo

| Tópico | Keywords | Frameworks-líder a ler |
|---|---|---|
| `Server Components (RSC)` | `server-component, use-client, use-server, rsc, react-server-dom` | Next.js (canonical), Remix (em curso), Astro (server islands) |
| `routing` | `router, route, segment, dynamic, param, catchAll` | Next.js App Router, TanStack Router, SvelteKit, Remix |
| `layouts` | `layout, template, outlet, parallel-routes` | Next.js, Remix, SvelteKit |
| `middleware` | `middleware, handler, interceptor, before/after` | Hono, Nitro, Rails, Next.js |
| `server-actions` | `action, form, useFormState, defineAction` | Next.js, Remix, SvelteKit form actions |
| `streaming` | `stream, flush, suspense, renderToPipeableStream` | Next.js, Remix defer, Astro server-streaming |
| `HMR` | `hmr, hot, accept, dispose, invalidate` | Vite (canonical), webpack (legacy comparison) |
| `type-safety end-to-end` | `infer, type, generic, schema, validate` | tRPC, TanStack, Hono RPC, Astro Actions |
| `build / code-splitting` | `bundle, chunk, split, manualChunks, preload` | Vite, Rollup, Turbopack |
| `error-handling` | `error, boundary, rescue, onError, ErrorBoundary` | Remix, Hono, Next.js |
| `config system` | `defineConfig, config, options, defaults` | Vite, Astro, Next.js |
| `cli / scaffolding` | `command, flag, scaffold, generate, create-` | Vite CLI, Astro CLI, Rails generators |
| `testing` | `test, fixture, mock, vitest, playwright` | Vitest, Playwright, Rails fixtures |
| `auth / sessions` | `session, cookie, csrf, jwt, encrypt` | Lucia, NextAuth, Rails has_secure_password |
| `env vars` | `env, import.meta.env, NEXT_PUBLIC, dotenv` | Vite, Next.js, Astro |
| `openapi / schema` | `openapi, swagger, json-schema, zod-openapi` | Hono (zod-openapi), Fastify, tRPC-OpenAPI |
| `observability` | `otel, opentelemetry, trace, span, metric` | OpenTelemetry instrumentations |
| `static assets` | `public, static, asset, hash, immutable` | Vite, Astro, Next.js |
| `request context` | `context, AsyncLocalStorage, getRequestContext` | Hono Context, Nitro useEvent, Next.js headers() |
| `websockets` | `ws, websocket, upgrade, channel, defineWebSocket` | Bun, Hono, Nitro |

---

## Integração com outras skills

| Skill | Quando usar |
|---|---|
| `/to-research` | DEPOIS de `to-reference`: web search + RFCs + benchmarks publicados |
| `/to-plan` | Consome `.claude/knowledge-base/reference/{slug}.md` direto na seção "Implementation Guide" |
| `/edge-case-plan` | Cruza com os edge cases catalogados no passo 7 |
| `/meeting` | Decisões com trade-off divergente vão pra reunião com o doc anexo |

---

## Clonagem de referências (uma vez por máquina)

`referencias/` é gitignored — cada dev clona localmente. Tier 1 essencial:

```bash
cd /home/paulo/Projetos/usetheo/theokit
mkdir -p referencias && cd referencias

git clone --depth 1 https://github.com/vercel/next.js.git           next.js
git clone --depth 1 https://github.com/remix-run/remix.git          remix
git clone --depth 1 https://github.com/honojs/hono.git              hono
git clone --depth 1 https://github.com/nitrojs/nitro.git            nitro
git clone --depth 1 https://github.com/TanStack/router.git          tanstack-router
git clone --depth 1 https://github.com/vitejs/vite.git              vite
git clone --depth 1 https://github.com/withastro/astro.git          astro
git clone --depth 1 https://github.com/sveltejs/kit.git             sveltekit
git clone --depth 1 https://github.com/fastify/fastify.git          fastify
git clone --depth 1 https://github.com/trpc/trpc.git                trpc
git clone --depth 1 https://github.com/rails/rails.git              rails
```

`.gitignore` já contém `referencias/` (verificar antes de clonar).

---

## Exemplo de invocação

```
/to-reference Server Components (RSC)
```

Espera-se:
1. Discovery: lista frameworks com `'use client'` / `'use server'` no source
2. Deep read em `referencias/next.js/packages/next/src/build/webpack/...` (RSC machinery)
3. Comparação com `referencias/remix/` (Remix está implementando RSC — capturar onde estão)
4. Comparação com `referencias/astro/` (server islands são RSC-like)
5. Output: `.claude/knowledge-base/reference/server-components-rsc.md` com Implementation Guide concreto para `packages/theo/src/router/rsc.ts` (ou decisão fundamentada de NÃO adotar RSC, com risk analysis).
