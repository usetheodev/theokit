# Plan: `@theokit/plugin-cors` (first plugin) + moderate roadmap

> **Version 1.0** — Bootstrap o ecossistema de plugins TheoKit shipping o **primeiro plugin oficial** (`@theokit/plugin-cors`) através do repo `theokit-plugins/` (já scaffolded). CORS é gap real no core (nenhum primitive built-in), spec RFC bem definida (~80 LOC), zero dependência externa, universalmente necessário — ideal para validar a pipeline completa (package scaffold → desenvolvimento → testes → release via Changesets → publicação npm). Em paralelo, este plano formaliza um **roadmap moderado** com 2 plugins adicionais committed (`@theokit/plugin-sentry`, `@theokit/plugin-i18n`) e mantém o restante (otel, resend, stripe-webhooks, clerk/auth0/workos, feature-flags, inngest/trigger-dev) explicitamente demand-gated por 1+ app em produção + 3+ requests, conforme ADR-0008 + CLAUDE.md R0.6.5. Resultado: TheoKit deixa de ser "framework sem ecossistema" com 1 plugin shipping + roadmap honesto, sem violar a regra bottom-up.

## Context

Estado atual (commit `7e07053` + scaffold `theokit-plugins@035d177`):

1. **TheoKit core (`/home/paulo/Projetos/usetheo/theokit/`)**:
   - `TheoPlugin` interface + `definePlugin()` helper formalizados em ADR-0008
   - `PluginRunner` runtime carrega plugins de `theo.config.ts > plugins[]`
   - **Zero plugins shipping** — `grep -rn "defineTheoPlugin({" packages/theo/src/` retorna vazio
   - Concept doc `docs/concepts/plugins.md` §3 declara honestamente "zero shipping plugins"

2. **Repo `theokit-plugins/` (`/home/paulo/Projetos/usetheo/theokit-plugins/`)**:
   - Scaffold inicial commitado (`035d177`)
   - pnpm-workspace + tsconfig.base + ESLint + Prettier + Changesets + CI workflows
   - `packages/` vazia exceto `.gitkeep`
   - README + CONTRIBUTING documentam gates de first-party
   - Todos os 5 gates passam no estado vazio (typecheck/lint/format/build/test exit 0)

3. **Gap concreto no core que o primeiro plugin endereça (CORS)**:
   - `grep -rn "Access-Control-Allow" packages/theo/src/` retorna vazio — nenhum CORS handling
   - `grep -rn "cors" packages/theo/src/` só retorna imports de outros nomes (`OnRequestHook` etc.) e false positives em variable names
   - `theo.config.ts > security` tem `cors: corsSchema.optional()` declarado (`packages/theo/src/config/schema.ts:194`) MAS o schema **só valida config**, não implementa runtime de CORS
   - Toda API real em produção precisa de CORS — gap óbvio

4. **Decisões do usuário (2026-05-27):**
   - **Primeiro plugin:** `@theokit/plugin-cors` (gap real, scope pequeno, zero SDK externa, valida pipeline)
   - **Estratégia roadmap:** Moderada — commit a 3 plugins (cors + sentry + i18n), demais demand-gated

5. **Evidências de prior art para CORS (Fastify):**
   - `@fastify/cors` é 1 dos 25 oficiais Fastify, ~250 LOC, RFC W3C CORS spec
   - Express `cors` middleware (1M+ weekly DLs) — spec source of truth
   - Inputs: `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`, `preflightContinue`, `optionsSuccessStatus`
   - Edge cases: `'*' + credentials:true` é INVÁLIDO (security spec), preflight OPTIONS short-circuit com 204, `Vary: Origin` quando `origin` é dinâmico

## Objective

**Done = (a) `@theokit/plugin-cors@0.1.0` shipping no npm; (b) usuário consegue `pnpm add @theokit/plugin-cors` + 2 linhas de config no `theo.config.ts > plugins: [cors({...})]` e ter CORS funcional; (c) pipeline `theokit-plugins` validada end-to-end (scaffold → dev → test → CI → release); (d) roadmap formalizado para `@theokit/plugin-sentry` e `@theokit/plugin-i18n` com critérios de aceitação claros; (e) demais plugins explicitamente demand-gated em `theokit-plugins/ROADMAP.md`.**

Metas mensuráveis:

1. `packages/plugin-cors/` existe em `theokit-plugins/` com package.json + tsconfig + tsup + tests + README + LICENSE
2. `@theokit/plugin-cors@0.1.0` cobre RFC CORS completo: origin (string/array/fn/true), methods, allowedHeaders, exposedHeaders, credentials, maxAge, preflight
3. Runtime guard rejeita combinação inválida `origin: '*' + credentials: true` (security spec)
4. Preflight OPTIONS short-circuits com 204 (configurável via `optionsSuccessStatus`)
5. `Vary: Origin` setado quando origin é dinâmica (string[] ou fn)
6. ≥ 15 unit tests cobrindo cenários RFC + edge cases
7. Fixture project boots TheoKit + plugin-cors + faz CORS request real (curl-equivalent via test)
8. CI verde (lint/typecheck/build/test) no PR de cors
9. Changeset criado em `.changeset/initial-cors.md` declarando `@theokit/plugin-cors@0.1.0`
10. Release manual via `pnpm release` produz tarball válido (`npm publish` documentado mas não executado neste plano — gated em NPM_TOKEN setup)
11. `theokit-plugins/ROADMAP.md` lista 2 plugins committed (sentry, i18n) + 6 demand-gated (otel, resend, stripe-webhooks, clerk, feature-flags, inngest)
12. ADR-0011 em `theokit/docs/adr/` documenta a estratégia moderada
13. ADR-0012 (stub `proposed`) em `theokit-plugins/docs/adr/` para `@theokit/plugin-sentry`
14. ADR-0013 (stub `proposed`) em `theokit-plugins/docs/adr/` para `@theokit/plugin-i18n`
15. `docs/concepts/plugins.md` no TheoKit core atualizado §3 — "1 shipping plugin (@theokit/plugin-cors), 2 committed, N demand-gated"

## ADRs

### D1 — Bootstrap com CORS, não 3 plugins de uma vez
- **Decisão:** Esta onda ship apenas `@theokit/plugin-cors`. Sentry e i18n ficam como roadmap committed (com ADRs `proposed`) mas não entram código nesta entrega.
- **Rationale:** CORS valida toda a pipeline (scaffold → dev → test → CI → release) com escopo mínimo (~80 LOC). Shipping 3 plugins simultaneamente: (a) atrasa a primeira release (qualquer dos 3 trava todos), (b) inflate o risco de bug pré-release, (c) viola "envia o menor incremento que entrega valor" do TheoKit. Sentry e i18n se beneficiam de aprender com a release de CORS antes de seguir.
- **Consequences:** ✅ Primeira release em 1 sprint vs 3-4 sprints. ✅ Pipeline validada com risco mínimo. ⚠️ Roadmap precisa de gate temporal claro pra evitar "moderado virou conservador na prática" (gate: sentry inicia ≤ 2 semanas pós-cors release; i18n ≤ 6 semanas).

### D2 — CORS implementado como pure-TS função + `definePlugin` wrapper, NÃO como class
- **Decisão:** `corsPlugin(options): TheoPlugin` retorna direto `definePlugin({ name, register })`. Toda lógica em funções puras (`shouldAllowOrigin`, `buildHeaders`, `handlePreflight`) testáveis isoladamente.
- **Rationale:** Plugins TheoKit são simples — não há estado mútável que justifique class. Funções puras facilitam unit testing (sem mock de TheoApp/PluginContext). Match com padrão de `@fastify/cors` e `cors` (Express).
- **Consequences:** ✅ ≥ 80% dos testes são unit puros (sem mock). ✅ Tree-shake amigável. ⚠️ User precisa importar default OU named — escolheremos default export para match com convenção npm (`import cors from '@theokit/plugin-cors'`).

### D3 — Origin matching aceita `string | string[] | (origin) => boolean | true`, NÃO regex
- **Decisão:** Tipo da option `origin`: `string` (exato match OR `'*'` literal) | `string[]` (allowlist) | `(origin: string) => boolean` (custom predicate) | `true` (allow any, sem credentials). Regex explicitamente rejeitado.
- **Rationale:** Spec RFC CORS aceita "origin or wildcard". Express `cors` aceita regex MAS gera CVEs históricos (overpermissive patterns). Match com `@fastify/cors` v8+ que removeu regex por security. Predicate function cobre 100% dos use cases de regex de forma type-safe.
- **Consequences:** ✅ Security default. ✅ TypeScript types simples. ⚠️ Migração de Express `cors({ origin: /\.example\.com$/ })` exige reescrever como `(origin) => origin.endsWith('.example.com')` — documentado no README.

### D4 — Roadmap committed = 3 plugins (cors + sentry + i18n); resto explicitamente demand-gated
- **Decisão:** `theokit-plugins/ROADMAP.md` tem **2 colunas**: (a) "Committed" com cors (este plano), sentry (ADR-0012 proposed), i18n (ADR-0013 proposed); (b) "Demand-gated" com otel, resend, stripe-webhooks, clerk/auth0/workos, feature-flags, inngest/trigger-dev. Demand-gated lista cada um com tabela de "evidência atual" (zero = não shipping).
- **Rationale:** Match decisão do usuário ("moderado"). Honra ADR-0008 + R0.6.5 para os 6 demand-gated. Tem 3 committed pra mostrar trajetória sem violar single-maintainer scope (~3 dias manutenção/plugin/ano = 9 dias/ano total).
- **Consequences:** ✅ Comunidade vê trajetória clara. ✅ Pressão de demand-gating não some — só 3 plugins isentos. ⚠️ Sentry e i18n precisam ser shipped em ≤ 6 semanas senão promessa quebra (gate temporal em D1).

### D5 — `@theokit/plugin-cors` declara `theokit >= 0.1.0-alpha.5` como peer-dep (não dep direta)
- **Decisão:** `peerDependencies: { "theokit": ">=0.1.0-alpha.5" }`. Sem `dependencies` runtime — plugin é puro TS + Node http types. **EC-1 fix:** versão alinhada à TheoKit atual (`packages/theo/package.json:3 → "0.1.0-alpha.5"`); "0.5.0" anteriormente citado era o milestone do macro-roadmap, não a versão real do package.
- **Rationale:** TheoKit core já está instalado pelo user; peer-dep evita versão dupla. Range `>=0.1.0-alpha.5` aceita a versão atual + futuros bumps (incluindo eventual `0.5.0`/`1.0.0`). Plugin bumpa peer-dep range explicitamente quando TheoKit fizer breaking change (D6 cobre).
- **Consequences:** ✅ `pnpm add @theokit/plugin-cors` resolve clean contra TheoKit atual. ✅ Zero risco de TheoKit duplicado no node_modules. ⚠️ Range permissivo aceita futuras majors incompatíveis — mitigated por bump explícito via Changeset em cada TheoKit major (D6 + EC-13 documentado).

### D7 — Fixture + integration test usam workspace link cross-repo (EC-2 fix)
- **Decisão:** `theokit-plugins/pnpm-workspace.yaml` adiciona `- '../theokit/packages/theo'` (sibling checkout pattern). T3.1 fixture importa `from 'theokit'` real (não stubbed); T3.2 integration test importa `PluginRunner from 'theokit/server'` real. Mesma estratégia usada por `theokit-sdk` em `pnpm-workspace.yaml` do core.
- **Rationale:** Integration test stubbed seria circular (testaria nosso próprio stub, não a integração real). Workspace cross-repo já é padrão do monorepo usetheo (sibling tolerance: pnpm warns mas não falha se sibling não estiver clonado). EC-2 expunha inconsistência entre T3.1 ("stubbed") e T3.2 ("real PluginRunner") — esta ADR consolida para "real".
- **Consequences:** ✅ Test exercita PluginRunner real. ✅ Fixture é representativa do uso. ⚠️ CI runner precisa clonar AMBOS os repos (já é o caso pra `theokit-sdk` — CI workflow já handle). ⚠️ Contributors externos sem `theokit/` clonado vêem warning de pnpm — aceitable (mesma DX que SDK).

### D6 — Release inicial = v0.1.0, NÃO v1.0.0
- **Decisão:** Primeira versão = `0.1.0`. Reservar `1.0.0` para depois de ≥ 6 meses de uso em produção sem breaking changes.
- **Rationale:** Match com convenção npm + Fastify (`@fastify/cors` começou 0.x). Comunica claramente "API pode mudar". Honra TheoKit core que ainda está em 0.x.
- **Consequences:** ✅ Liberdade de breaking change pré-1.0. ⚠️ Alguns CI security tools (Snyk, Renovate) tratam 0.x como "unstable" — aceitable, é a realidade.

## Dependency Graph

> **ADRs:** D1..D7 (D7 added per EC-2 fix during edge-case review). Total 7 decisions.

```
Phase 0 (ADRs D1..D7 + scope lock)
   │
   ▼
Phase 1 (scaffold packages/plugin-cors/ in theokit-plugins)
   │
   ▼
Phase 2 (implement @theokit/plugin-cors)
   │
   ▼
Phase 3 (tests + fixture)
   │
   ▼
Phase 4 (release pipeline validation)
   │
   ├─────────────────┐
   ▼                 ▼
Phase 5         Phase 6
(TheoKit         (theokit-plugins
 core docs        roadmap doc + stub
 update)          ADRs sentry+i18n)
   │                 │
   └────────┬────────┘
            ▼
        Phase 7 (Dogfood QA)
```

**Parallelization:** Phase 5 e Phase 6 podem rodar em paralelo após Phase 4 (Phase 5 toca o repo core, Phase 6 toca o repo theokit-plugins). Phases 0-4 são sequenciais.

**Cross-repo:** este plano toca AMBOS os repos. Phase 0 (ADRs) e Phase 5 (concept doc update) ficam em `theokit/`. Phases 1-4 e Phase 6 ficam em `theokit-plugins/`. Phase 7 dogfood roda em ambos.

---

## Phase 0: ADRs + scope lock

**Objective:** Documentar D1..D6 antes de tocar código; alinhar expectativas sobre o que entra nesta release vs roadmap.

### T0.1 — Write ADR-0011 (moderate plugin roadmap strategy) in `theokit/docs/adr/`

#### Objective
Registrar D1, D4, D6 — decisão de shipping cors agora + roadmap committed de 3 plugins + versionamento 0.x.

#### Evidence
- Decisão do usuário em 2026-05-27 (resposta à AskUserQuestion)
- ADR-0008 D1 explicitamente rejeita "shipping speculativo" — esta ADR documenta a exceção (1 plugin) + as 2 promessas adicionais (sentry, i18n) com gates temporais
- CLAUDE.md R0.6.5 demand-gated para os 6 demais

#### Files to edit
```
docs/adr/0011-moderate-plugin-roadmap-strategy.md — NEW
```

#### Deep file dependency analysis
- New file in TheoKit core. Doc-only.
- Cross-link: ADR-0008 (canonical SDK) + ADR-0010 (peer-dep optional model) + R0.6.5

#### Deep Dives
Sections (MADR 3.0):
1. **Context** — `theokit-plugins` scaffold pronto, decisão do owner para shipping
2. **Decision** — D1 (cors primeiro) + D4 (roadmap 3 committed + 6 demand-gated) + D6 (0.1.0 inicial)
3. **Considered alternatives** — A: aggressive 7 plugins (rejected, single-maintainer overload); B: conservative 1 plugin only (rejected, atrasa ecossistema sem motivo); C: moderate 3 (chosen)
4. **Consequences** — gates temporais: sentry inicia ≤ 2 sem após cors release; i18n ≤ 6 sem; falha quebra promessa explícita

#### Tasks
1. Criar `docs/adr/0011-moderate-plugin-roadmap-strategy.md`
2. Status `accepted`, date `2026-05-27`
3. Cross-link ADR-0008 + R0.6.5 + reference ao scaffold commit `035d177`

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     adr_0011_exists_with_madr_sections() — Given the repo, When read docs/adr/0011-*.md, Then file exists + has Context/Decision/Considered alternatives/Consequences (happy path; MUST fail pre-write)
RED:     adr_0011_documents_d1_d4_d6() — Given content, When grep '### D1' '### D4' '### D6', Then all 3 present (validation error)
RED:     adr_0011_cites_committed_plugins() — Given content, When grep, Then 'cors' AND 'sentry' AND 'i18n' all present (edge case: roadmap clarity)
RED:     adr_0011_documents_temporal_gates() — Given content, When grep '2 weeks|≤ 2 sem|6 weeks|≤ 6 sem', Then both timeframes present (error scenario: no enforcement)
GREEN:   Write ADR with all required sections
REFACTOR: None
VERIFY:  npx vitest run tests/unit/adr-0011-moderate-plugin-roadmap.test.ts
```

BDD scenarios:
- **Happy path**: ADR has all 4 MADR sections
- **Validation error**: D1/D4/D6 missing → fail
- **Edge case**: 3 committed plugins all listed
- **Error scenario**: temporal gates missing means roadmap is unenforceable

#### Acceptance Criteria
- [ ] `docs/adr/0011-moderate-plugin-roadmap-strategy.md` exists
- [ ] D1 + D4 + D6 documented with Rationale + Consequences
- [ ] Cross-links ADR-0008 + R0.6.5 + scaffold commit
- [ ] Temporal gates explicit (2 weeks sentry, 6 weeks i18n)
- [ ] Pass: `npx vitest run tests/unit/adr-0011-moderate-plugin-roadmap.test.ts`

#### DoD
- [ ] File committed in theokit repo
- [ ] Structural test green
- [ ] Linked from `theokit-plugins/ROADMAP.md` (Phase 6) and `docs/concepts/plugins.md` (Phase 5)

---

## Phase 1: Scaffold `packages/plugin-cors/` in `theokit-plugins`

**Objective:** Criar o pacote skeleton no monorepo já scaffolded; remover `.gitkeep` do `packages/`; primeiro changeset.

### T1.1 — Create `packages/plugin-cors/` package skeleton

#### Objective
Skeleton mínimo viável que typechecks + builds + lints, mesmo sem implementação real do CORS ainda.

#### Evidence
- `theokit-plugins/CONTRIBUTING.md` documenta o layout (`packages/plugin-<name>/{src,tests,package.json,tsconfig.json,tsup.config.ts,README.md}`)
- ESLint + Prettier do scaffold já configurados; só precisa criar arquivos
- Changesets workspace pronto

#### Files to edit
```
theokit-plugins/packages/plugin-cors/package.json — NEW
theokit-plugins/packages/plugin-cors/tsconfig.json — NEW (extends ../../tsconfig.base.json)
theokit-plugins/packages/plugin-cors/tsup.config.ts — NEW
theokit-plugins/packages/plugin-cors/src/index.ts — NEW (export stub returning empty plugin)
theokit-plugins/packages/plugin-cors/README.md — NEW (usage placeholder; full doc in T4.3)
theokit-plugins/packages/plugin-cors/LICENSE — NEW (MIT, same as root)
theokit-plugins/packages/.gitkeep — DELETE
```

#### Deep file dependency analysis
- All NEW files in theokit-plugins. No cross-repo deps yet.
- After this task: `pnpm install` resolves the new package; `pnpm typecheck` validates the empty package; `pnpm build` produces `dist/`.

#### Deep Dives

**package.json shape (per CONTRIBUTING.md):**
```json
{
  "name": "@theokit/plugin-cors",
  "version": "0.1.0",
  "description": "CORS plugin for TheoKit — handles preflight, origin matching, Vary header",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "theokit": ">=0.1.0-alpha.5"
  },
  "publishConfig": {
    "access": "public"
  },
  "keywords": ["theokit", "theokit-plugin", "cors"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/usetheodev/theokit-plugins.git",
    "directory": "packages/plugin-cors"
  },
  "license": "MIT"
}
```

**Stub `src/index.ts`:**
```ts
// Stub — replaced by real implementation in Phase 2.
import { definePlugin, type TheoPlugin } from 'theokit/server'

export interface CorsOptions {
  // Filled in T2.1
}

export default function corsPlugin(_options: CorsOptions = {}): TheoPlugin {
  return definePlugin({
    name: '@theokit/plugin-cors',
    register() {
      // Implementation in T2.2-T2.4
    },
  })
}
```

**Invariants:**
- Package name MUST be `@theokit/plugin-cors` (matches naming convention from ADR-0008)
- Version starts at `0.1.0` (D6)
- `type: module` + ESM-only (TheoKit is ESM-only)
- `peerDependencies.theokit >=0.1.0-alpha.5` (D5 — EC-1 fix; matches current package.json)

**Edge cases:**
- Removing `.gitkeep` from `packages/` exposes `packages/plugin-cors/` as first child; pnpm-workspace glob already includes it
- tsconfig must extend `../../tsconfig.base.json` so strict mode is inherited

#### Tasks
1. Criar `packages/plugin-cors/` dir
2. Criar `package.json` com shape acima
3. Criar `tsconfig.json` extends base
4. Criar `tsup.config.ts` minimal
5. Criar `src/index.ts` stub
6. Criar `README.md` placeholder
7. Criar `LICENSE` (cópia da root)
8. Deletar `packages/.gitkeep`
9. `pnpm install` (workspace re-link)
10. Verificar `pnpm typecheck`, `pnpm build`, `pnpm test` (test passa trivialmente — sem arquivos test)

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     package_json_has_correct_shape() — Given packages/plugin-cors/package.json, When parsed, Then name='@theokit/plugin-cors' AND version='0.1.0' AND peerDep theokit>=0.1.0-alpha.5 AND exports.types AND exports.import all present (happy path; MUST fail pre-scaffold) [EC-1 fix: aligned to current TheoKit version]
RED:     stub_default_export_returns_TheoPlugin() — Given import default from packages/plugin-cors/src/index.ts, When called with {}, Then returns { name: '@theokit/plugin-cors', register: fn } (validation error)
RED:     tsconfig_extends_workspace_base() — Given packages/plugin-cors/tsconfig.json, When parsed, Then extends './../../tsconfig.base.json' (edge case: inherited strict mode)
RED:     gitkeep_removed_after_first_package() — Given packages/, When fs.readdirSync('packages'), Then .gitkeep NOT present AND 'plugin-cors' present (edge case: container properly populated)
RED:     workspace_typecheck_passes() — Given full workspace, When pnpm typecheck, Then exit 0 (error scenario: skeleton must be valid TS)
GREEN:   Create all files; remove .gitkeep
REFACTOR: None
VERIFY:  cd theokit-plugins && pnpm install && pnpm typecheck && pnpm build && npx vitest run packages/plugin-cors/tests/skeleton.test.ts
```

BDD scenarios:
- **Happy path**: package.json valid, stub exports TheoPlugin shape
- **Validation error**: wrong name / version / peer-dep range → fails
- **Edge case**: tsconfig inheritance verified
- **Error scenario**: workspace typecheck must remain clean

#### Acceptance Criteria
- [ ] `packages/plugin-cors/{package.json,tsconfig.json,tsup.config.ts,src/index.ts,README.md,LICENSE}` all exist
- [ ] `packages/.gitkeep` removed
- [ ] `pnpm install` clean (no new warnings)
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm build` produces `packages/plugin-cors/dist/{index.js,index.d.ts}`
- [ ] `pnpm test` exit 0 (skeleton test green)
- [ ] `pnpm lint` exit 0

#### DoD
- [ ] Skeleton committed in `theokit-plugins`
- [ ] All workspace gates green
- [ ] Skeleton test green (asserts shape, not behavior)

---

### T1.2 — Create initial changeset for `@theokit/plugin-cors@0.1.0`

#### Objective
Registrar a primeira release via Changesets — declarar bump minor (0.0.0 → 0.1.0) com nota user-facing.

#### Evidence
- `theokit-plugins/.changeset/config.json` configurado pra published packages (`access: public`)
- Releases shipam via `.github/workflows/release.yml` consumindo changesets pendentes
- Changeset deve existir ANTES de mergear o PR de implementação

#### Files to edit
```
theokit-plugins/.changeset/initial-cors-release.md — NEW
```

#### Deep file dependency analysis
- New markdown file with Changesets frontmatter format
- Consumed by `pnpm version` (auto-bumps) and `pnpm release` (publishes)
- Cannot be in same commit as the implementation — that's the wrong order. Changeset commits FIRST, implementation follows, release PR auto-opens.

#### Deep Dives

**Changeset frontmatter:**
```markdown
---
'@theokit/plugin-cors': minor
---

Initial release. Adds CORS plugin for TheoKit handling preflight requests, origin matching (string/array/predicate), credentials, exposed headers, and Vary: Origin header. Implements W3C CORS spec; rejects insecure `origin: '*' + credentials: true` combination at boot.

See README for usage and options reference. Requires `theokit >=0.1.0-alpha.5`.
```

**Invariants:**
- Bump type = `minor` (0.0.0 → 0.1.0 is minor per Changesets — 0.x.y are all minor bumps until 1.0)
- Body ≤ 700 chars (matches EC-6 from storage-modules plan)
- References "W3C CORS spec" + peer-dep range (D5)

#### Tasks
1. Criar `.changeset/initial-cors-release.md` com frontmatter + body
2. `pnpm changeset status` verifica que o changeset é detectado

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     changeset_file_exists() — Given the repo, When read .changeset/initial-cors-release.md, Then file exists (happy path; MUST fail pre-create)
RED:     changeset_bumps_plugin_cors_minor() — Given file frontmatter, When parsed, Then @theokit/plugin-cors === 'minor' (validation error: wrong bump)
RED:     changeset_status_detects_pending() — Given workspace, When pnpm changeset status, Then exit 0 AND output mentions @theokit/plugin-cors (edge case: discoverable)
RED:     changeset_body_under_700_chars() — Given the markdown body section (after frontmatter), Then length <700 (error scenario: EC-6 cap from previous plan)
GREEN:   Create the changeset markdown
REFACTOR: None
VERIFY:  cd theokit-plugins && pnpm changeset status && npx vitest run packages/plugin-cors/tests/changeset.test.ts
```

BDD scenarios:
- **Happy path**: changeset detected by Changesets CLI
- **Validation error**: wrong package name → not bumped
- **Edge case**: minor bump (0.0.0 → 0.1.0)
- **Error scenario**: body exceeds 700 chars

#### Acceptance Criteria
- [ ] `.changeset/initial-cors-release.md` exists with valid frontmatter
- [ ] `pnpm changeset status` reports `@theokit/plugin-cors` minor pending
- [ ] Body documents CORS feature scope + peer-dep + spec compliance
- [ ] Body < 700 chars

#### DoD
- [ ] Changeset committed
- [ ] Status command green
- [ ] No accidental release triggered (no `pnpm release` yet)

---

## Phase 2: Implement `@theokit/plugin-cors`

**Objective:** Substituir stub por implementação CORS completa: origin matching + headers + preflight + Vary.

### T2.1 — Define `CorsOptions` interface + Zod schema for validation

#### Objective
Type-safe options + runtime validation. Match con W3C CORS spec.

#### Evidence
- D3 — origin tipo: `string | string[] | (origin) => boolean | true` (regex rejected)
- `@fastify/cors` options shape como referência
- TheoKit usa Zod como single-source-of-truth (rules/type-safety.md)

#### Files to edit
```
theokit-plugins/packages/plugin-cors/src/options.ts — NEW
theokit-plugins/packages/plugin-cors/src/index.ts — EDIT: import CorsOptions, validate
theokit-plugins/packages/plugin-cors/package.json — EDIT: add `zod` to dependencies
```

#### Deep file dependency analysis
- `options.ts` (NEW): exports `CorsOptions` interface + `validateCorsOptions(opts)` function
- `index.ts`: imports `validateCorsOptions`, calls it at construction time; throws actionable error if invalid
- `package.json`: adds `"dependencies": { "zod": "^3.24.0" }` (NOT peer — `zod` versions are sensitive, lock to one)

#### Deep Dives

**`CorsOptions` interface (D3):**
```ts
import { z } from 'zod'

export const corsOriginSchema = z.union([
  z.literal(true), // allow any (no credentials)
  z.string(), // exact match or '*'
  z.array(z.string()), // allowlist
  z.function().args(z.string()).returns(z.boolean()), // predicate
])

export const corsOptionsSchema = z.object({
  origin: corsOriginSchema.optional(),
  methods: z.array(z.string()).optional(),
  allowedHeaders: z.array(z.string()).optional(),
  exposedHeaders: z.array(z.string()).optional(),
  credentials: z.boolean().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  preflightContinue: z.boolean().optional(),
  optionsSuccessStatus: z.number().int().min(200).max(299).optional(),
}).strict()

export type CorsOptions = z.input<typeof corsOptionsSchema>

export function validateCorsOptions(opts: CorsOptions): CorsOptions {
  const parsed = corsOptionsSchema.parse(opts)
  // EC-1: spec security — '*' + credentials:true is INVALID
  if (parsed.origin === '*' && parsed.credentials === true) {
    throw new Error(
      "[@theokit/plugin-cors] Invalid options: `origin: '*'` with `credentials: true` is forbidden by the CORS spec (browsers will reject). " +
      "Use a specific origin or `(origin) => true` predicate to echo the request origin."
    )
  }
  return parsed
}
```

**Invariants:**
- `.strict()` rejeita typos (cf. EC-1 do storage plan)
- W3C-mandated invalid combination throws at config time, not at first request

**Edge cases:**
- `origin === '*'` allowed without credentials ✅
- `origin === '*'` + `credentials === true` → throw (W3C spec)
- `origin === true` + `credentials === true` → allowed (predicate echoes origin)
- `methods === []` (empty allowed methods) → Zod accepts, runtime returns empty header (effectively forbidding all methods)
- `optionsSuccessStatus` outside 2xx → Zod rejects (must be 200-299)

#### Tasks
1. Criar `src/options.ts` com schema + validator
2. Atualizar `src/index.ts` para chamar `validateCorsOptions(opts)` no construtor do plugin
3. Adicionar `zod` em `dependencies` do package.json
4. `pnpm install` re-link

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     options_schema_accepts_full_valid_config() — Given { origin: ['https://a.com'], methods: ['GET'], credentials: true, maxAge: 300 }, When validateCorsOptions, Then no throw (happy path)
RED:     options_schema_rejects_unknown_keys() — Given { origin: '*', wrongKey: true }, When parsed, Then ZodError on wrongKey (validation error)
RED:     options_schema_rejects_origin_wildcard_with_credentials() — Given { origin: '*', credentials: true }, When validateCorsOptions, Then throws with 'forbidden by the CORS spec' message (W3C compliance)
RED:     options_schema_accepts_predicate() — Given { origin: (o) => o.endsWith('.example.com') }, When parsed, Then accepted (edge case: D3 fn form)
RED:     [EC-8] options_schema_rejects_async_predicate_with_clear_message() — Given { origin: async (o) => true }, When validateCorsOptions, Then throws Error containing 'origin' AND ('async' OR 'Promise' OR 'must return boolean') — use .refine() for clarity if Zod default message is opaque
RED:     [EC-9] options_schema_rejects_empty_strings_in_string_arrays() — Given { exposedHeaders: ['X-Foo', ''] }, When parsed, Then ZodError at index 1 (use z.array(z.string().min(1)) for exposedHeaders/allowedHeaders/methods)
RED:     options_schema_rejects_regex() — Given { origin: /\.example\.com$/ }, When parsed, Then ZodError (D3 — regex explicitly rejected; type test via @ts-expect-error)
RED:     options_schema_rejects_optionsSuccessStatus_outside_2xx() — Given { optionsSuccessStatus: 404 }, When parsed, Then ZodError (error scenario: spec range)
RED:     options_schema_type_inference() — Given CorsOptions type, When used as param, Then origin is union of (string | string[] | true | fn) (type test via expectTypeOf)
GREEN:   Implement options.ts; wire into index.ts
REFACTOR: None
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/options.test.ts
```

BDD scenarios:
- **Happy path**: full valid config parses
- **Validation error**: unknown keys + wildcard+credentials forbidden
- **Edge case**: predicate accepted, regex rejected
- **Error scenario**: out-of-spec status code rejected

#### Acceptance Criteria
- [ ] `src/options.ts` exports `CorsOptions`, `corsOptionsSchema`, `validateCorsOptions`
- [ ] `index.ts` validates at construction (throws actionable error if invalid)
- [ ] 7+ unit tests in `tests/options.test.ts` green
- [ ] Type test verifies `CorsOptions['origin']` union shape
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 warnings
- [ ] `zod` added to `dependencies` (not peer)

#### DoD
- [ ] Options validated + tested
- [ ] W3C invalid combination rejected loudly
- [ ] Build green

---

### T2.2 — Implement origin matching + header building (pure functions)

#### Objective
Funções puras `resolveOrigin(requestOrigin, opts) → string | null` e `buildCorsHeaders(opts, resolvedOrigin) → Record<string, string>`.

#### Evidence
- D2 — funções puras testáveis sem mock de TheoApp
- W3C CORS spec: response headers `Access-Control-Allow-{Origin, Methods, Headers, Credentials}`, `Access-Control-Expose-Headers`, `Access-Control-Max-Age`, `Vary: Origin`

#### Files to edit
```
theokit-plugins/packages/plugin-cors/src/resolve-origin.ts — NEW
theokit-plugins/packages/plugin-cors/src/build-headers.ts — NEW
```

#### Deep file dependency analysis
- `resolve-origin.ts` (NEW): pure function, no I/O
- `build-headers.ts` (NEW): pure function, consumes resolved origin + opts

#### Deep Dives

**`resolveOrigin(requestOrigin, opts) → string | null`:**

| `opts.origin` | `requestOrigin` | Returns | Notes |
|---|---|---|---|
| `undefined` | any | `'*'` | Default behavior — allow any |
| `'*'` | any | `'*'` | Wildcard literal |
| `true` | any non-empty | `requestOrigin` | Echo |
| `'https://a.com'` | `'https://a.com'` | `'https://a.com'` | Exact match |
| `'https://a.com'` | `'https://b.com'` | `null` | No match — don't add headers |
| `['https://a.com', 'https://b.com']` | `'https://b.com'` | `'https://b.com'` | Allowlist match |
| `['https://a.com']` | `'https://b.com'` | `null` | Not in allowlist |
| `(o) => o.endsWith('.example.com')` | `'https://sub.example.com'` | `'https://sub.example.com'` | Predicate match |
| `(o) => false` | any | `null` | Predicate rejects |
| any | `undefined` (no Origin header) | `null` | Request has no Origin — don't add CORS headers |

**`buildCorsHeaders(opts, resolvedOrigin, isPreflight)`:**

```
{
  'Access-Control-Allow-Origin': resolvedOrigin,
  // 'Vary: Origin' only when origin is dynamic (array, predicate, or true)
  ...(isDynamic(opts.origin) ? { 'Vary': 'Origin' } : {}),
  ...(opts.credentials ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
  ...(opts.exposedHeaders?.length ? { 'Access-Control-Expose-Headers': opts.exposedHeaders.join(', ') } : {}),
  // preflight-only headers:
  ...(isPreflight ? {
    'Access-Control-Allow-Methods': (opts.methods ?? ['GET','HEAD','PUT','PATCH','POST','DELETE']).join(', '),
    'Access-Control-Allow-Headers': opts.allowedHeaders?.join(', ') ?? '*',
    ...(opts.maxAge !== undefined ? { 'Access-Control-Max-Age': String(opts.maxAge) } : {}),
  } : {}),
}
```

**Invariants:**
- `null` resolved origin → caller MUST NOT add any CORS headers (function returns empty object)
- `Vary: Origin` SOMENTE quando origin é dinâmico — caching-correct
- Preflight-only headers (`Allow-Methods`, `Allow-Headers`, `Max-Age`) só aparecem em preflight responses
- **[EC-3 MUST FIX]** Predicate function exception MUST be caught and treated as no-match. User predicate throwing must NEVER cascade to a 500 on every request.

**EC-3 predicate-throw guard (3 LOC):**
```ts
if (typeof opts.origin === 'function') {
  try {
    return opts.origin(requestOrigin) ? requestOrigin : null
  } catch (err) {
    console.warn('[@theokit/plugin-cors] origin predicate threw; treating as no-match:', err)
    return null
  }
}
```

**Edge cases:**
- `opts.allowedHeaders` undefined em preflight → response echoes `Access-Control-Request-Headers` (delegado ao caller via separate function — keep this pure)
- `opts.methods === []` → response header `Access-Control-Allow-Methods: ` (empty) — browser interpreta como nenhum método permitido (EC-4 SHOULD TEST)
- `opts.origin === ''` (empty string) → never matches, silently disables CORS (EC-5 SHOULD TEST)
- Request `Origin: 'null'` (literal string per RFC 6454 file:// requests) → string comparison; never matches allowlist (EC-6 SHOULD TEST)
- `opts.origin === 'https://a.com/'` (trailing slash typo) vs request `'https://a.com'` → no match (EC-7 SHOULD TEST + README warning T4.3)
- Multiple values in arrays → join com `, ` (HTTP list separator)

#### Tasks
1. Criar `src/resolve-origin.ts` com `resolveOrigin(requestOrigin, opts): string | null` + helper `isDynamicOrigin(opts.origin): boolean`
2. Criar `src/build-headers.ts` com `buildCorsHeaders(opts, resolvedOrigin, isPreflight): Record<string, string>`
3. Unit tests cobrindo todas as linhas da tabela acima

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     resolveOrigin_returns_wildcard_when_opts_origin_undefined() — Given opts={}, request origin='https://a.com', Then '*' (happy path: default)
RED:     resolveOrigin_returns_echo_when_opts_origin_true() — Given opts.origin=true, request 'https://a.com', Then 'https://a.com' (happy path)
RED:     resolveOrigin_returns_null_when_array_no_match() — Given opts.origin=['https://a.com'], request 'https://b.com', Then null (validation error: no match)
RED:     resolveOrigin_returns_null_when_no_request_origin() — Given any opts, request origin=undefined, Then null (edge case: server-to-server)
RED:     resolveOrigin_predicate_called_with_origin() — Given opts.origin=(o)=>o==='https://a.com', request='https://a.com', Then 'https://a.com' (happy path)
RED:     [EC-3] resolveOrigin_predicate_throw_treated_as_no_match() — Given opts.origin=()=>{throw new Error('boom')}, request='https://a.com', Then null returned (NOT throw) AND console.warn called with 'origin predicate threw' (MUST FIX: predicate exception must not cascade to 500)
RED:     [EC-4] buildHeaders_methods_empty_array_emits_empty_value() — Given opts.methods=[], isPreflight=true, Then Access-Control-Allow-Methods='' (documents browser behavior)
RED:     [EC-5] resolveOrigin_empty_string_origin_never_matches() — Given opts.origin='', request='https://a.com', Then null (silent disable — documented; schema does NOT min(1))
RED:     [EC-6] resolveOrigin_literal_null_string_handled_as_string() — Given requestOrigin='null', opts.origin=['https://a.com'], Then null returned (RFC 6454 file:// origins)
RED:     [EC-7] resolveOrigin_trailing_slash_no_match() — Given opts.origin='https://a.com/' (typo), request='https://a.com', Then null (README T4.3 documents browser format)
RED:     buildCorsHeaders_basic_headers() — Given resolved='https://a.com', isPreflight=false, opts={ credentials:true }, Then {Allow-Origin, Allow-Credentials, NO preflight headers} (happy path)
RED:     buildCorsHeaders_preflight_includes_methods_headers() — Given isPreflight=true, opts={ methods:['GET'], allowedHeaders:['X-Custom'], maxAge:300 }, Then Allow-Methods='GET', Allow-Headers='X-Custom', Max-Age='300' (happy path)
RED:     buildCorsHeaders_vary_when_dynamic_origin() — Given opts.origin=['a','b'], Then 'Vary'='Origin' present (edge case: caching correctness)
RED:     buildCorsHeaders_no_vary_when_static_origin() — Given opts.origin='https://a.com', Then 'Vary' absent (edge case)
RED:     buildCorsHeaders_returns_empty_when_resolved_null() — Given resolved=null, Then {} (error scenario: no CORS headers added)
RED:     buildCorsHeaders_exposed_headers_joined() — Given opts.exposedHeaders=['X-A','X-B'], Then 'Expose-Headers'='X-A, X-B' (edge case: list separator)
GREEN:   Implement resolveOrigin + buildCorsHeaders
REFACTOR: Extract isDynamicOrigin helper if branches duplicate
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/resolve-origin.test.ts packages/plugin-cors/tests/build-headers.test.ts
```

BDD scenarios:
- **Happy path**: origin matching for each input type + standard headers
- **Validation error**: no match returns null, caller skips
- **Edge case**: Vary header dynamics, preflight-vs-normal headers
- **Error scenario**: empty result when no origin matched

#### Acceptance Criteria
- [ ] `src/resolve-origin.ts` + `src/build-headers.ts` exist
- [ ] 11+ unit tests covering full origin matching matrix
- [ ] Functions are pure (no I/O, no globals)
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 warnings

#### DoD
- [ ] Pure functions implemented + tested
- [ ] Vary: Origin set correctly per W3C
- [ ] Caching correctness verified

---

### T2.3 — Wire as `TheoPlugin` with preflight short-circuit

#### Objective
Compose `validateCorsOptions` + `resolveOrigin` + `buildCorsHeaders` em um `TheoPlugin` que: (a) intercepta `onRequest` para preflight, (b) intercepta `onResponse` para responses normais.

#### Evidence
- D2 — usa `definePlugin` direto
- TheoKit `PluginContext` shape (`{ request, response, ctx, requestId }`) com Node http types
- Preflight = OPTIONS + `Access-Control-Request-Method` header presente

#### Files to edit
```
theokit-plugins/packages/plugin-cors/src/index.ts — EDIT: full implementation replacing stub
```

#### Deep file dependency analysis
- `index.ts`: orquestra options + resolve + build + wires hooks
- Stub from T1.1 fully replaced

#### Deep Dives

**Full `index.ts`:**
```ts
import { definePlugin, type TheoPlugin, type PluginContext } from 'theokit/server'
import { validateCorsOptions, type CorsOptions } from './options.js'
import { resolveOrigin } from './resolve-origin.js'
import { buildCorsHeaders } from './build-headers.js'

export type { CorsOptions } from './options.js'

export default function corsPlugin(options: CorsOptions = {}): TheoPlugin {
  const opts = validateCorsOptions(options)
  const optionsSuccessStatus = opts.optionsSuccessStatus ?? 204

  return definePlugin({
    name: '@theokit/plugin-cors',
    register(app) {
      // Preflight handler — onRequest, short-circuits with 204 + headers
      app.addHook('onRequest', (ctx: PluginContext) => {
        if (ctx.request.method !== 'OPTIONS') return
        // Preflight requires Access-Control-Request-Method header
        const acrm = ctx.request.headers['access-control-request-method']
        if (acrm === undefined) return // not a preflight, ignore

        const requestOrigin = getRequestOrigin(ctx.request.headers)
        const resolved = resolveOrigin(requestOrigin, opts)
        const headers = buildCorsHeaders(opts, resolved, true)
        // Echo Allow-Headers from request if opts.allowedHeaders not set
        if (opts.allowedHeaders === undefined) {
          const acrh = ctx.request.headers['access-control-request-headers']
          if (typeof acrh === 'string') headers['Access-Control-Allow-Headers'] = acrh
        }
        for (const [k, v] of Object.entries(headers)) ctx.response.setHeader(k, v)
        if (!opts.preflightContinue) {
          ctx.response.statusCode = optionsSuccessStatus
          ctx.response.setHeader('Content-Length', '0')
          ctx.response.end()
        }
      })

      // Normal response — onResponse, just adds CORS headers
      app.addHook('onResponse', (ctx: PluginContext) => {
        if (ctx.request.method === 'OPTIONS') return // already handled
        const requestOrigin = getRequestOrigin(ctx.request.headers)
        const resolved = resolveOrigin(requestOrigin, opts)
        const headers = buildCorsHeaders(opts, resolved, false)
        if (ctx.response.headersSent) return // can't modify after headers sent
        for (const [k, v] of Object.entries(headers)) ctx.response.setHeader(k, v)
      })
    },
  })
}

function getRequestOrigin(headers: NodeJS.Dict<string | string[]>): string | undefined {
  const o = headers['origin']
  return typeof o === 'string' ? o : undefined
}
```

**Invariants:**
- Preflight ALWAYS short-circuits with 204 (or `optionsSuccessStatus`) unless `preflightContinue: true`
- Normal responses NEVER touch already-sent headers (`headersSent` guard)
- OPTIONS without `Access-Control-Request-Method` is NOT preflight — passes through normally

**Edge cases:**
- OPTIONS with no `acrm` → fall through (some browsers issue plain OPTIONS for other purposes)
- `headersSent === true` in `onResponse` → skip (streaming responses already committed)
- `requestOrigin === undefined` → `resolved === null` → empty headers → noop

#### Tasks
1. Substituir `src/index.ts` stub pela implementação completa
2. Verificar `pnpm build` ainda passa
3. Tests inline já cobertos em T3.1

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     preflight_short_circuits_with_204() — Given OPTIONS + Access-Control-Request-Method='POST', When plugin handles, Then response.statusCode === 204 AND response.end called (happy path)
RED:     preflight_short_circuits_with_custom_status() — Given opts.optionsSuccessStatus=200, Then status === 200 (edge case)
RED:     preflight_echoes_request_headers_when_no_allowedHeaders() — Given no opts.allowedHeaders + request has 'X-Custom', Then Access-Control-Allow-Headers='X-Custom' (happy path)
RED:     preflight_continue_does_not_short_circuit() — Given opts.preflightContinue=true, Then response.end NOT called (edge case)
RED:     normal_response_adds_cors_headers() — Given GET /, When plugin handles, Then response.setHeader called with Access-Control-Allow-Origin (happy path)
RED:     normal_response_skipped_when_headersSent() — Given response.headersSent=true, When plugin handles, Then setHeader NOT called (error scenario: streaming)
RED:     options_without_acrm_is_not_preflight() — Given OPTIONS but no Access-Control-Request-Method, Then plugin treats as normal request (edge case)
RED:     request_without_origin_adds_no_cors_headers() — Given GET / with no Origin header, Then no Access-Control-* headers set (error scenario: server-to-server)
GREEN:   Implement full index.ts
REFACTOR: Extract getRequestOrigin if duplicated
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/index.test.ts
```

BDD scenarios:
- **Happy path**: preflight returns 204; normal request gets headers
- **Validation error**: preflight without `acrm` falls through to normal handling
- **Edge case**: `preflightContinue: true` + `headersSent` guard
- **Error scenario**: no Origin → no CORS headers

#### Acceptance Criteria
- [ ] `src/index.ts` no longer a stub — full plugin implementation
- [ ] Preflight short-circuits correctly
- [ ] Normal responses get headers without breaking streaming
- [ ] 8+ unit tests in `tests/index.test.ts` green
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 warnings
- [ ] `pnpm build` produces working dist

#### DoD
- [ ] Full plugin wired
- [ ] All unit tests green
- [ ] Default export = `corsPlugin` factory

---

## Phase 3: Tests + fixture project

**Objective:** Validate end-to-end with a real TheoKit boot — plugin loaded from `theo.config.ts > plugins[]`, real HTTP request, real CORS response.

### T3.1 — Fixture project `tests/fixtures/cors-app/`

#### Objective
Mini TheoKit app demonstrando real-world usage do plugin.

#### Evidence
- TheoKit "fixtures são obrigatórios" (rules/testing.md)
- ADR-0008 + CONTRIBUTING gates require fixture for first-party promotion

#### Files to edit
```
theokit-plugins/packages/plugin-cors/tests/fixtures/cors-app/theo.config.ts — NEW
theokit-plugins/packages/plugin-cors/tests/fixtures/cors-app/server/routes/health.ts — NEW
theokit-plugins/packages/plugin-cors/tests/fixtures/cors-app/README.md — NEW
```

#### Deep file dependency analysis
- Fixture is self-contained TheoKit app — uses `theokit` (workspace via peer-dep at install time)
- `theo.config.ts` imports `@theokit/plugin-cors` from `../../../../` (workspace path)
- Smoke test imports fixture config + verifies plugin is loaded

#### Deep Dives

**Fixture `theo.config.ts`:**
```ts
import { defineConfig } from 'theokit'
import corsPlugin from '@theokit/plugin-cors'

export default defineConfig({
  plugins: [
    corsPlugin({
      origin: ['https://allowed.example.com'],
      credentials: true,
      methods: ['GET', 'POST'],
    }),
  ],
})
```

**Fixture `server/routes/health.ts`:**
```ts
import { defineRoute } from 'theokit/server'

export default defineRoute({
  method: 'GET',
  handler: () => Response.json({ status: 'ok' }),
})
```

**Invariants:**
- Fixture uses `@theokit/plugin-cors` as if it were an npm install (workspace link)
- `theokit` import resolves via workspace (`theokit` is sibling repo via pnpm-workspace.yaml — need to add to theokit-plugins workspace)

**Edge cases:**
- pnpm-workspace.yaml may need updating to include theokit core path (workspace:`*` style)
- OR — keep fixture simple: stub `defineConfig` and `defineRoute` since the test is about CORS behavior, not TheoKit boot

#### Tasks
1. Decidir: full boot vs stubbed boot (Recomendado: stubbed — fixture é só para integration test, não boot real)
2. Criar fixture files
3. Integration test em `tests/integration.test.ts` verifica plugin instantiation + behavior

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     fixture_config_imports_plugin() — Given fixture/theo.config.ts, When evaluated, Then default export has plugins:[{name:'@theokit/plugin-cors', register:fn}] (happy path)
RED:     fixture_plugin_validates_options_at_construction() — Given fixture with valid opts, When config evaluated, Then no throw (validation error: opts must be valid)
RED:     fixture_route_handler_exists() — Given fixture/server/routes/health.ts, When evaluated, Then default export is route with method:'GET' (edge case: fixture completeness)
RED:     fixture_readme_exists() — Given fixture dir, Then README.md present with usage example (error scenario: undocumented fixture)
GREEN:   Create fixture files
REFACTOR: None
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/fixture.test.ts
```

BDD scenarios:
- **Happy path**: fixture config evaluates to valid TheoConfig with plugin
- **Validation error**: invalid opts in fixture would fail at construction
- **Edge case**: route handler structure
- **Error scenario**: missing README

#### Acceptance Criteria
- [ ] Fixture dir with theo.config.ts, server/routes/health.ts, README.md
- [ ] 4 tests in `tests/fixture.test.ts` green
- [ ] No real TheoKit boot required (stubbed via importing theokit types only)
- [ ] `pnpm typecheck` 0 errors

#### DoD
- [ ] Fixture committed
- [ ] Tests green

---

### T3.2 — Integration test simulating preflight + normal request

#### Objective
Test que monta um `PluginRunner`-like, registra o cors plugin, dispara hooks com requests stub, verifica response.

#### Evidence
- TheoKit `PluginRunner` shape disponível em `theokit/server` (importável)
- Integration tests in TheoKit core use similar patterns (e.g., `tests/integration/plugin-pipeline.test.ts`)

#### Files to edit
```
theokit-plugins/packages/plugin-cors/tests/integration.test.ts — NEW
```

#### Deep file dependency analysis
- Test imports `PluginRunner` from `theokit/server`
- Constructs minimal `IncomingMessage`/`ServerResponse` mocks
- Registers cors plugin, fires hooks, asserts headers

#### Deep Dives

**Test sketch:**
```ts
import { PluginRunner } from 'theokit/server'
import corsPlugin from '../src/index.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function mockReq(method: string, headers: Record<string, string>): IncomingMessage {
  return { method, headers, url: '/' } as unknown as IncomingMessage
}
function mockRes(): ServerResponse & { _headers: Record<string,string>, _ended:boolean, _status:number } {
  const _headers: Record<string,string> = {}
  let _ended = false
  let _status = 200
  return {
    setHeader: (k,v) => { _headers[k] = String(v) },
    end: () => { _ended = true },
    headersSent: false,
    get statusCode() { return _status },
    set statusCode(v) { _status = v },
    _headers, _ended, get _status() { return _status },
  } as never
}
// Test cases verify: preflight short-circuit, normal headers, no origin = no headers, etc.
```

#### Tasks
1. Criar `tests/integration.test.ts` com mocks + runner
2. Cobrir preflight + normal + no-origin scenarios
3. Verificar `PluginRunner` API se exporta de `theokit/server`

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     integration_preflight_returns_204_with_cors_headers() — Given preflight OPTIONS via PluginRunner, Then response 204 + Access-Control-Allow-Origin set (happy path)
RED:     integration_normal_request_gets_cors_headers() — Given GET / via runner, Then response 200 + Allow-Origin + Allow-Credentials (happy path)
RED:     integration_request_without_origin_no_cors() — Given GET / no Origin header, Then no Access-Control-* headers (edge case)
RED:     integration_disallowed_origin_no_cors() — Given Origin not in allowlist, Then no Access-Control-Allow-Origin set (validation error)
RED:     integration_preflight_continue_passes_through() — Given preflightContinue:true, Then handler runs after plugin (edge case)
RED:     integration_throws_on_invalid_options() — Given corsPlugin({ origin:'*', credentials:true }), Then throws at construction (error scenario: W3C spec)
RED:     [EC-10] PluginRunner_exported_from_theokit_server() — Given import { PluginRunner } from 'theokit/server', When typed as ctor, Then resolves (PREREQ: must pass before integration test can use real PluginRunner; if fails, request export in TheoKit core OR fall back to direct definePlugin({...}).register(mockApp))
GREEN:   Implement integration test (uses cross-repo workspace per D7)
REFACTOR: Extract mock helpers if duplicated
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/integration.test.ts
```

BDD scenarios:
- **Happy path**: preflight + normal both work
- **Validation error**: disallowed origin + invalid options throw
- **Edge case**: no Origin + preflightContinue
- **Error scenario**: W3C invalid combination throws loudly

#### Acceptance Criteria
- [ ] `tests/integration.test.ts` 6+ tests green
- [ ] Uses real `PluginRunner` from `theokit/server` (if exported) OR documented stub
- [ ] `pnpm test` exit 0
- [ ] `pnpm typecheck` 0 errors

#### DoD
- [ ] Integration test green
- [ ] Real plugin runner exercise (not just unit-level)

---

## Phase 4: Release pipeline validation

**Objective:** Verify the scaffolded `.github/workflows/release.yml` works end-to-end (até `npm publish`, que fica gated em NPM_TOKEN setup como passo manual).

### T4.1 — Verify CI green on plugin-cors PR

#### Objective
Push branch + PR; CI runs lint/typecheck/build/test on the new package; all green.

#### Evidence
- CI workflow `.github/workflows/ci.yml` já scaffolded (Phase 2 do scaffold)
- Quando primeiro pacote existe, `pnpm -r --filter='./packages/*'` deve picar `plugin-cors`

#### Files to edit
```
(nenhum arquivo — apenas runtime verification)
docs/audit/plugin-cors-ci-green-2026-MM-DD.md — NEW: screenshot/log da CI verde
```

#### Deep file dependency analysis
- Doc-only artifact for audit trail; no production file changes

#### Deep Dives
Steps:
1. `cd theokit-plugins && git checkout -b initial-plugin-cors`
2. Commit Phase 1-3 changes
3. Push branch, open PR
4. Verify GH Actions runs: `lint-and-format`, `typecheck-build`, `test`
5. All 3 jobs green
6. Save CI run URL + log snippet in audit doc

#### Tasks
1. Open PR
2. Monitor CI
3. If failures: fix, push, re-run
4. Document green run

#### TDD + BDD (⛔ OBRIGATÓRIO)

CI green is verified externally (GitHub Actions), but we capture it via doc structural test:

```
RED:     ci_audit_doc_exists() — Given the date YYYY-MM-DD, When read docs/audit/plugin-cors-ci-green-*.md, Then file exists (happy path; MUST fail pre-doc)
RED:     ci_audit_links_workflow_run() — Given content, When grep 'actions/runs/' or 'github.com.*workflows', Then URL present (validation error: untraceable)
RED:     ci_audit_lists_3_jobs() — Given content, When grep 'lint-and-format' 'typecheck-build' 'test', Then all 3 present (edge case)
RED:     ci_audit_states_green_outcome() — Given content, When grep 'green|passed|✅|success', Then present (error scenario: doc must conclude)
GREEN:   Capture CI run + write audit
REFACTOR: None
VERIFY:  cd theokit && npx vitest run tests/unit/plugin-cors-ci-audit.test.ts (this lives in theokit core for cross-repo traceability)
```

BDD scenarios:
- **Happy path**: audit doc exists with URL + 3 jobs
- **Validation error**: doc must link the actual workflow run
- **Edge case**: 3 jobs all named correctly
- **Error scenario**: outcome must be explicit

#### Acceptance Criteria
- [ ] Branch pushed, PR opened
- [ ] All 3 CI jobs green
- [ ] Audit doc `docs/audit/plugin-cors-ci-green-{date}.md` exists with URL + jobs

#### DoD
- [ ] CI green captured
- [ ] PR ready for merge (but NOT auto-merged — gated on review)

---

### T4.2 — Document NPM_TOKEN setup + first `pnpm release` dry-run

#### Objective
Setup secret `NPM_TOKEN` in `usetheodev/theokit-plugins` GitHub repo. Document the steps. Run `pnpm release --dry-run` (or equivalent) to verify packaging without publishing.

#### Evidence
- `.github/workflows/release.yml` already uses `${{ secrets.NPM_TOKEN }}`
- npm publishing requires automation token; can't be done locally without auth

#### Files to edit
```
theokit-plugins/docs/RELEASING.md — NEW: step-by-step release process
theokit-plugins/docs/SECRETS.md — NEW: NPM_TOKEN setup instructions
```

#### Deep file dependency analysis
- Both NEW docs in theokit-plugins/docs/
- No code changes

#### Deep Dives

**`RELEASING.md`:**
```markdown
# Releasing

Releases use [Changesets](https://github.com/changesets/changesets) + GitHub Actions.

## Flow

1. PR adds a changeset (e.g., `.changeset/initial-cors-release.md`)
2. PR merged to `main`
3. GH Actions opens a "Version Packages" PR auto-bumping versions + CHANGELOG.md
4. Reviewer merges the version PR
5. GH Actions runs `pnpm release` → `changeset publish` → npm publish

## Dry-run locally

```bash
cd theokit-plugins
pnpm build
pnpm pack --filter @theokit/plugin-cors --pack-destination ./tmp
# Inspect ./tmp/theokit-plugin-cors-0.1.0.tgz
tar -tzf ./tmp/theokit-plugin-cors-0.1.0.tgz | head -20
```

Expected contents: dist/, README.md, LICENSE, package.json.
```

**`SECRETS.md`:**
```markdown
# Secrets — GitHub Actions

## NPM_TOKEN

Required for `pnpm release` to publish to npm.

### Setup

1. https://www.npmjs.com/ — generate "Automation" token (not "Publish")
2. Repository → Settings → Secrets and variables → Actions
3. New repository secret: name=`NPM_TOKEN`, value=token from step 1
4. Verify by triggering release workflow

### Rotation

Rotate every 6 months. Steps as above; old token revoked at npm.
```

#### Tasks
1. Criar `docs/RELEASING.md`
2. Criar `docs/SECRETS.md`
3. (Externally) configurar `NPM_TOKEN` em `usetheodev/theokit-plugins` (not in this plan)
4. Local dry-run: `pnpm pack --filter @theokit/plugin-cors`

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     releasing_doc_exists() — Given the repo, When read docs/RELEASING.md, Then file present + has 'Flow' AND 'Dry-run' (happy path)
RED:     secrets_doc_exists() — Given the repo, When read docs/SECRETS.md, Then file present + mentions 'NPM_TOKEN' AND 'Automation' (validation error)
RED:     pnpm_pack_produces_valid_tarball() — Given pnpm pack, When tar -tzf <output>, Then includes 'package/dist/index.js' AND 'package/package.json' AND 'package/README.md' (edge case: package contents)
RED:     tarball_excludes_tests_and_node_modules() — Given tarball, When listed, Then NO 'tests/' AND NO 'node_modules/' (error scenario: bloat avoidance)
GREEN:   Create docs; run pnpm pack to verify
REFACTOR: None
VERIFY:  cd theokit-plugins && pnpm build && pnpm pack --filter @theokit/plugin-cors --pack-destination /tmp && tar -tzf /tmp/theokit-plugin-cors-0.1.0.tgz | grep -E 'package/dist/index.js|package/package.json'
```

BDD scenarios:
- **Happy path**: docs exist + tarball valid
- **Validation error**: missing NPM_TOKEN setup doc
- **Edge case**: tarball has correct files
- **Error scenario**: tarball excludes test files / node_modules

#### Acceptance Criteria
- [ ] `docs/RELEASING.md` and `docs/SECRETS.md` exist
- [ ] `pnpm pack` produces valid tarball
- [ ] Tarball contents minimal (dist/, package.json, README.md, LICENSE)
- [ ] NPM_TOKEN setup documented step-by-step
- [ ] **[EC-12 DOCUMENT]** Test script verifies tarball filename via `ls` output (NOT hardcoded `theokit-plugin-cors-0.1.0.tgz` — pnpm 9 strips scope to dash-joined form, older tooling may produce scoped name). Test: `OUTPUT=$(pnpm pack --filter @theokit/plugin-cors --pack-destination /tmp 2>&1 | tail -1) && test -f "$OUTPUT"`

#### DoD
- [ ] Docs committed
- [ ] Tarball verified locally
- [ ] (Out of plan scope) NPM_TOKEN configured in repo settings — flagged in DoD as "user action needed before first publish"

---

### T4.3 — Per-package README + usage examples

#### Objective
Production-quality README for `@theokit/plugin-cors` — visible on npm and in repo.

#### Evidence
- npm shows the package README on the package page
- CONTRIBUTING requires README per package

#### Files to edit
```
theokit-plugins/packages/plugin-cors/README.md — EDIT: replace placeholder with full doc
```

#### Deep file dependency analysis
- README.md is the most-read doc for users adopting the plugin

#### Deep Dives

**README structure:**
```markdown
# @theokit/plugin-cors

> CORS (Cross-Origin Resource Sharing) plugin for [TheoKit](https://github.com/usetheodev/theokit).

## Installation

\`\`\`bash
pnpm add @theokit/plugin-cors
\`\`\`

## Quick start

\`\`\`ts
// theo.config.ts
import { defineConfig } from 'theokit'
import cors from '@theokit/plugin-cors'

export default defineConfig({
  plugins: [
    cors({
      origin: ['https://app.example.com'],
      credentials: true,
    }),
  ],
})
\`\`\`

## Options reference

(table for each option: name, type, default, description)

## Security notes

- `origin: '*'` + `credentials: true` is **forbidden** by spec; plugin throws at boot
- Regex origin patterns are **not supported** — use `(origin) => boolean` predicates instead (security reason: ADR-D3)

## Migrating from Express `cors`

(table of equivalents)

## License

MIT
```

#### Tasks
1. Substituir placeholder README pelo full doc
2. Garantir todas opções estão documentadas com type + default + example
3. Adicionar security notes (D3 rationale)

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     readme_has_installation_section() — Given the README, Then '## Installation' present (happy path)
RED:     readme_has_quick_start_with_code_example() — Given content, Then '## Quick start' AND code block with 'cors(' (validation error)
RED:     readme_documents_all_options() — Given content, When grep all option names (origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge, preflightContinue, optionsSuccessStatus), Then all 8 present (edge case: completeness)
RED:     readme_documents_w3c_invalid_combo() — Given content, When grep 'origin.*\\*.*credentials.*true.*forbidden', Then matched (error scenario: security)
RED:     readme_documents_no_regex_support() — Given content, When grep 'regex|predicate', Then both mentioned (D3 rationale)
GREEN:   Write README
REFACTOR: None
VERIFY:  npx vitest run packages/plugin-cors/tests/readme.test.ts
```

BDD scenarios:
- **Happy path**: README has install + quick start
- **Validation error**: code example must use real API
- **Edge case**: all 8 options documented
- **Error scenario**: security caveats explicit

#### Acceptance Criteria
- [ ] README has Installation, Quick start, Options reference, Security notes, Migration
- [ ] All 8 options documented with type + default
- [ ] Security notes explicit (W3C invalid combo + no regex)
- [ ] Structural test green

#### DoD
- [ ] README polished + ready for npm package page

---

## Phase 5: Update TheoKit core docs (cross-repo)

**Objective:** `docs/concepts/plugins.md` updated — no more "zero shipping plugins"; first plugin live.

### T5.1 — Update `docs/concepts/plugins.md` §3 — replace "zero" with "1 shipping"

#### Objective
Concept doc reflects reality: cors is live, sentry+i18n committed in roadmap.

#### Evidence
- Current §3 says "zero plugins ship in production today" — was true at write time, now outdated after Phase 4

#### Files to edit
```
theokit/docs/concepts/plugins.md — EDIT §3 to reflect 1 live + 2 committed plugins
```

#### Deep file dependency analysis
- Existing structural test `tests/unit/concept-doc-plugins.test.ts` asserts "zero plugins" claim — update test + doc together

#### Deep Dives

**Updated §3:**
```markdown
## 3. Current state — 1 shipping plugin, 2 committed

As of 2026-MM-DD:

- **1 shipping:** `@theokit/plugin-cors@0.1.0` — CORS middleware (gap real in core)
- **2 committed in [theokit-plugins/ROADMAP.md](https://github.com/usetheodev/theokit-plugins/blob/main/ROADMAP.md):**
  - `@theokit/plugin-sentry` — Error tracking (ADR-0012 proposed)
  - `@theokit/plugin-i18n` — Internationalization (ADR-0013 proposed)
- **6 demand-gated** (won't ship without 1+ production app + 3+ requests): otel, resend, stripe-webhooks, clerk/auth0/workos, feature-flags, inngest/trigger-dev

See [ADR-0011](../adr/0011-moderate-plugin-roadmap-strategy.md) for the moderate strategy.

(rest of section explaining why core has many features built-in remains)
```

#### Tasks
1. Editar §3
2. Atualizar `tests/unit/concept-doc-plugins.test.ts` para refletir 1 shipping + 2 committed
3. Adicionar cross-link a ADR-0011 + ROADMAP.md

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     concept_doc_mentions_plugin_cors_shipping() — Given updated doc, When grep '@theokit/plugin-cors', Then matched (happy path; MUST fail pre-edit)
RED:     concept_doc_mentions_2_committed_plugins() — Given content, When grep 'sentry' AND 'i18n', Then both matched (validation error)
RED:     concept_doc_mentions_6_demand_gated() — Given content, When grep 'demand-gated|6 ', Then matched (edge case: honesty preserved)
RED:     concept_doc_crosslinks_adr_0011() — Given content, When grep 'ADR-0011|0011-moderate', Then matched (error scenario)
RED:     concept_doc_no_longer_says_zero_shipping() — Given content, When grep 'zero shipping plugins|zero plugins ship', Then NO MATCH (regression: doc must be updated)
GREEN:   Update doc + tests
REFACTOR: None
VERIFY:  cd theokit && npx vitest run tests/unit/concept-doc-plugins.test.ts
```

BDD scenarios:
- **Happy path**: doc reflects 1 shipping + 2 committed
- **Validation error**: missing cross-link to ADR-0011
- **Edge case**: 6 demand-gated still mentioned
- **Error scenario**: old "zero" claim removed (regression catch)

#### Acceptance Criteria
- [ ] `docs/concepts/plugins.md` §3 updated
- [ ] Cross-link to ADR-0011 + theokit-plugins ROADMAP.md
- [ ] `tests/unit/concept-doc-plugins.test.ts` updated + green
- [ ] `pnpm typecheck` 0 errors

#### DoD
- [ ] Doc updated
- [ ] Tests green
- [ ] Honesty maintained: 1 shipping, not "many"

---

## Phase 6: Roadmap doc + stub ADRs (theokit-plugins)

**Objective:** Formalize roadmap in `theokit-plugins/ROADMAP.md` + create stub ADRs for sentry + i18n with status `proposed`.

### T6.1 — Write `theokit-plugins/ROADMAP.md`

#### Objective
User-facing roadmap with 2-column structure: Committed vs Demand-gated.

#### Evidence
- D4 — moderate strategy
- ADR-0011 documents the strategy; ROADMAP.md is the user-facing artifact

#### Files to edit
```
theokit-plugins/ROADMAP.md — NEW
```

#### Deep file dependency analysis
- New file in theokit-plugins root
- Referenced from theokit-plugins/README.md + theokit/docs/concepts/plugins.md

#### Deep Dives

**Structure:**
```markdown
# Roadmap — theokit-plugins

> Strategy: **moderate** — 3 plugins committed (cors shipping, sentry+i18n committed), 6 demand-gated. See [ADR-0011 in theokit core](https://github.com/usetheodev/theokit/blob/main/docs/adr/0011-moderate-plugin-roadmap-strategy.md).

## Committed (will ship)

| Plugin | Status | Target | ADR |
|---|---|---|---|
| `@theokit/plugin-cors` | ✅ Shipping (v0.1.0) | 2026-MM-DD | (ADR-0011 in theokit core) |
| `@theokit/plugin-sentry` | 🟡 Proposed | ≤ 2 weeks after cors release | [ADR-0012](./docs/adr/0012-plugin-sentry-proposed.md) |
| `@theokit/plugin-i18n` | 🟡 Proposed | ≤ 6 weeks after cors release | [ADR-0013](./docs/adr/0013-plugin-i18n-proposed.md) |

## Demand-gated (won't ship until evidence)

Gates: 1+ app in production + 3+ requests + not duplicating core + <100 LOC OR <1 week/year maintenance + tests + fixture.

| Plugin | Demand evidence today | Why considered |
|---|---|---|
| `@theokit/plugin-otel` | 0 apps / 0 requests | TheoKit has trace context but no exporter |
| `@theokit/plugin-resend` | 0 / 0 | Common SaaS need (transactional email) |
| `@theokit/plugin-stripe-webhooks` | 0 / 0 | Sugar over `defineWebhook` for Stripe |
| `@theokit/plugin-clerk` / `-auth0` / `-workos` | 0 / 0 (each) | Hosted auth bridges |
| `@theokit/plugin-feature-flags` | 0 / 0 | GrowthBook / LaunchDarkly bridges |
| `@theokit/plugin-inngest` / `-trigger-dev` | 0 / 0 | Workflow engine bridges |

## How to propose

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Status legend

- ✅ Shipping — published to npm, accepting PRs
- 🟡 Proposed — ADR drafted with `proposed` status; implementation pending
- ⏳ Demand-gated — won't enter Committed until gates clear
```

#### Tasks
1. Criar `theokit-plugins/ROADMAP.md`
2. Cross-link ADR-0011 + future ADR-0012 + ADR-0013

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     roadmap_doc_exists() — Given the repo, When read ROADMAP.md, Then file present (happy path)
RED:     roadmap_has_committed_section() — Given content, When grep '## Committed', Then present (validation error)
RED:     roadmap_has_demand_gated_section() — Given content, When grep '## Demand-gated', Then present (edge case)
RED:     roadmap_lists_all_3_committed() — Given content, When grep '@theokit/plugin-cors' AND '@theokit/plugin-sentry' AND '@theokit/plugin-i18n', Then all matched (validation error)
RED:     roadmap_lists_6_demand_gated_with_evidence() — Given content, When grep '0 apps' or '0 / 0', Then mentioned (error scenario: honesty)
RED:     roadmap_cites_adr_0011() — Given content, When grep 'ADR-0011', Then matched (linkage)
GREEN:   Write ROADMAP.md
REFACTOR: None
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/roadmap-doc.test.ts (test lives in plugin-cors as workspace-level structural test; OR a workspace root test)
```

BDD scenarios:
- **Happy path**: ROADMAP exists with 2 columns
- **Validation error**: missing sections
- **Edge case**: all 3 committed + 6 demand-gated listed
- **Error scenario**: missing evidence labels

#### Acceptance Criteria
- [ ] `ROADMAP.md` exists with Committed + Demand-gated
- [ ] 3 committed + 6 demand-gated listed with evidence
- [ ] Cross-links to ADR-0011 + ADR-0012 + ADR-0013
- [ ] Structural test green
- [ ] **[EC-11 DOCUMENT]** No literal `2026-MM-DD` placeholder remains — date replaced with real cors release date (after Phase 4) OR explicit TBD with target month (e.g., `Target: 2026-Q3`). Structural test asserts `! grep '2026-MM-DD' ROADMAP.md`.
- [ ] **[EC-13 DOCUMENT]** ROADMAP.md includes a "TheoKit compatibility matrix" subsection listing tested ranges per plugin version (e.g., `@theokit/plugin-cors@0.1.x` → `theokit ^0.1.0-alpha.5`). Updated explicitly via Changeset on each TheoKit major bump.

#### DoD
- [ ] Roadmap committed
- [ ] Test green
- [ ] Referenced from README

---

### T6.2 — Stub ADRs `0012-plugin-sentry-proposed.md` + `0013-plugin-i18n-proposed.md`

#### Objective
Status `proposed` ADRs documenting the planned plugins. Body intentionally light (full ADRs accepted when implementation starts).

#### Evidence
- D4 — committed plugins need ADR even if not implemented yet
- Match pattern: ADRs in theokit core start as `proposed`, get promoted to `accepted` on implementation

#### Files to edit
```
theokit-plugins/docs/adr/0012-plugin-sentry-proposed.md — NEW
theokit-plugins/docs/adr/0013-plugin-i18n-proposed.md — NEW
```

#### Deep file dependency analysis
- New ADRs in theokit-plugins repo (NOT theokit core — these are plugin-specific decisions)
- Numbering continues from theokit core ADRs (0008-0011 already exist in core; 0012+ live here)

#### Deep Dives

**ADR-0012 (Sentry) — sketch:**
```markdown
# 0012. @theokit/plugin-sentry — error tracking bridge

* Status: proposed
* Date: 2026-05-27
* Target implementation: ≤ 2 weeks after @theokit/plugin-cors@0.1.0 release

## Context
... [empty for proposed — to be filled when work starts]

## Decision (to be drafted)
- Use Sentry SDK as peer-dep (optional)
- Wrap onError hook to capture
- Wrap onRequest to attach request context

## Open questions
- Sentry Browser vs Sentry Node? Hint: TheoPlugin is server-only → Node SDK
- Source maps integration with TheoKit build?
- Sample rate config?

## Status notes
This ADR is intentionally light until the work starts. Full ADR follows the implementation PR.
```

**ADR-0013 (i18n) — sketch:**
```markdown
# 0013. @theokit/plugin-i18n — internationalization

* Status: proposed
* Date: 2026-05-27
* Target implementation: ≤ 6 weeks after @theokit/plugin-cors@0.1.0 release

## Context
... [empty for proposed]

## Decision (to be drafted)
- ICU MessageFormat or simpler?
- Accept-Language detection vs explicit locale routing?
- Server-side translation, client-side hydration?

## Open questions
- Translation files format (JSON, PO, TOML)?
- Lazy-loading per route?
- Integration with TheoKit router?

## Status notes
This ADR is intentionally light until the work starts.
```

#### Tasks
1. Criar `docs/adr/0012-plugin-sentry-proposed.md`
2. Criar `docs/adr/0013-plugin-i18n-proposed.md`
3. Status `proposed`, date `2026-05-27`, target dates explicit

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     adr_0012_exists_with_proposed_status() — Given file, When read, Then 'Status: proposed' AND 'sentry' present (happy path)
RED:     adr_0013_exists_with_proposed_status() — Given file, When read, Then 'Status: proposed' AND 'i18n' present (happy path)
RED:     adrs_have_target_implementation_dates() — Given both files, Then 'Target implementation' OR '≤ N weeks' present (validation error: D1 temporal gate)
RED:     adrs_list_open_questions() — Given content, Then '## Open questions' section present (edge case: proposed status warrants questions)
RED:     adrs_self_describe_as_intentionally_light() — Given content, When grep 'intentionally light|proposed|to be drafted', Then matched (error scenario: scope honesty)
GREEN:   Write both ADRs
REFACTOR: None
VERIFY:  cd theokit-plugins && npx vitest run packages/plugin-cors/tests/stub-adrs.test.ts
```

BDD scenarios:
- **Happy path**: both ADRs exist with proposed status
- **Validation error**: missing target dates would break D1 enforcement
- **Edge case**: open questions section present
- **Error scenario**: scope honesty (these are stubs, not real ADRs yet)

#### Acceptance Criteria
- [ ] Both ADRs in `theokit-plugins/docs/adr/`
- [ ] Status `proposed` for both
- [ ] Target dates explicit (2 weeks, 6 weeks)
- [ ] Open questions sections present
- [ ] Structural test green

#### DoD
- [ ] Stub ADRs committed
- [ ] Tests green
- [ ] Cross-referenced from ROADMAP.md

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | First plugin shipping (validates pipeline) | T1.1, T2.1-T2.3, T4.1-T4.3 | `@theokit/plugin-cors@0.1.0` |
| 2 | Real CORS gap in core covered | T2.1-T2.3 | Full W3C CORS spec implementation |
| 3 | Roadmap formalized (3 committed + 6 gated) | T6.1 | `theokit-plugins/ROADMAP.md` |
| 4 | ADR documents moderate strategy | T0.1 | `theokit/docs/adr/0011-moderate-plugin-roadmap-strategy.md` |
| 5 | Stub ADRs for next 2 plugins | T6.2 | ADRs 0012 + 0013 with `proposed` status |
| 6 | Pipeline validation (scaffold → CI → release) | T1.1, T1.2, T4.1, T4.2 | Branch + PR + CI green + tarball verified |
| 7 | TheoKit core docs updated | T5.1 | `docs/concepts/plugins.md` §3 reflects 1 shipping |
| 8 | Honesty preserved (no overpromise) | T6.1 (demand-gated column) | Gates explicit per plugin |
| 9 | W3C spec compliance | T2.1 (validation) + T2.3 (preflight) | `'*' + credentials` throws; preflight 204 |
| 10 | Security defaults (no regex origin per D3) | T2.1 | Schema rejects regex |
| 11 | Per-package README | T4.3 | Full README on npm |
| 12 | Tarball minimal | T4.2 | `pnpm pack` verified |
| 13 | Fixture project | T3.1 | `tests/fixtures/cors-app/` |
| 14 | Integration test | T3.2 | Real `PluginRunner` exercise |
| 15 | Changeset for first release | T1.2 | `.changeset/initial-cors-release.md` |
| 16 | Secret setup documented | T4.2 | `docs/SECRETS.md` |
| 17 | Release flow documented | T4.2 | `docs/RELEASING.md` |
| 18 | CI verde captured for audit | T4.1 | `docs/audit/plugin-cors-ci-green-*.md` |
| EC-1 | Peer-dep `theokit >=0.5.0` doesn't match current 0.1.0-alpha.5 (MUST FIX) | T1.1 + D5 | Range relaxed to `>=0.1.0-alpha.5`; 4 sites updated |
| EC-2 | Cross-repo fixture/integration test inconsistency (MUST FIX) | T0.1 + T3.1/T3.2 | New ADR D7; `theokit-plugins/pnpm-workspace.yaml` adds `../theokit/packages/theo` |
| EC-3 | User predicate throw crashes all requests (MUST FIX) | T2.2 | 3 LOC try/catch in `resolveOrigin` + RED test `predicate_throw_treated_as_no_match` |
| EC-4 | `methods: []` empty array → empty header | T2.2 | RED test documenting browser behavior |
| EC-5 | `origin: ''` empty string never matches | T2.2 | RED test |
| EC-6 | Origin `'null'` literal (RFC 6454) | T2.2 | RED test |
| EC-7 | Trailing slash mismatch | T2.2 + T4.3 | RED test + README warning |
| EC-8 | Async predicate rejection message opaque | T2.1 | RED test + `.refine()` clear message |
| EC-9 | `exposedHeaders: ['']` empty in array | T2.1 | RED test + schema uses `z.string().min(1)` |
| EC-10 | `PluginRunner` may not be exported | T3.2 | RED test as prereq + fallback documented |
| EC-11 | `2026-MM-DD` placeholder may persist | T6.1 | Acceptance criterion + grep test |
| EC-12 | `pnpm pack` filename varies | T4.2 | Acceptance criterion verifies via `ls` |
| EC-13 | Peer-dep range too permissive on majors | T6.1 | "TheoKit compatibility matrix" subsection |

**Coverage: 18/18 functional gaps + 13/13 edge cases = 31/31 (100%)**

## Global Definition of Done

- [ ] All 7 phases (Phase 0 + 1-3 + 4 + 5-6) completed
- [ ] All RED → GREEN tests passing (~65+ new tests across phases — 55 base + 8 EC RED tests added)
- [ ] Zero TypeScript errors in BOTH repos (`pnpm typecheck` exit 0 in `theokit/` and `theokit-plugins/`)
- [ ] Zero ESLint warnings in BOTH repos
- [ ] `pnpm test` exit 0 in both repos
- [ ] `pnpm --filter @theokit/plugin-cors build` exit 0 (DTS clean)
- [ ] `pnpm pack --filter @theokit/plugin-cors` produces valid minimal tarball
- [ ] CI green for plugin-cors PR (audit URL captured in doc)
- [ ] **Dogfood QA PASS** — `/dogfood full` in TheoKit core ≥ 70/100 (plugin doesn't regress core)
- [ ] **Fixture proof** — `tests/fixtures/cors-app/` boots end-to-end (T3.1)
- [ ] Cross-repo doc updates landed (TheoKit core §3 + theokit-plugins README + ROADMAP)

### Plan-specific criteria

- [ ] `@theokit/plugin-cors@0.1.0` published to npm OR tarball ready + NPM_TOKEN setup documented (publish gated on external secret config)
- [ ] `corsPlugin({ origin: '*', credentials: true })` throws at boot with actionable message (W3C spec)
- [ ] Preflight OPTIONS short-circuits with 204 (or `optionsSuccessStatus`)
- [ ] `Vary: Origin` set when origin is dynamic
- [ ] Normal responses don't break streaming (`headersSent` guard)
- [ ] `theokit-plugins/ROADMAP.md` lists 3 committed + 6 demand-gated
- [ ] ADR-0011 in theokit core documents moderate strategy
- [ ] ADR-0012 + ADR-0013 in theokit-plugins with `proposed` status + target dates
- [ ] `docs/concepts/plugins.md` §3 honest about state (1 shipping, not "many")
- [ ] **EC-1**: peer-dep `theokit >=0.1.0-alpha.5` (matches current version)
- [ ] **EC-2**: ADR D7 declared + `theokit-plugins/pnpm-workspace.yaml` includes `../theokit/packages/theo`
- [ ] **EC-3**: `resolveOrigin` predicate path wrapped in try/catch; throw treated as no-match
- [ ] **EC-4..EC-7**: 4 RED tests in T2.2 (empty methods, empty origin, 'null' literal, trailing slash)
- [ ] **EC-8**, **EC-9**: 2 RED tests in T2.1 (async predicate rejection, empty strings in arrays)
- [ ] **EC-10**: RED test in T3.2 confirms `PluginRunner` exported (or documents fallback)
- [ ] **EC-11**: ROADMAP.md has no `2026-MM-DD` placeholder after Phase 4
- [ ] **EC-12**: T4.2 verifies tarball filename via `ls`, not hardcoded literal
- [ ] **EC-13**: ROADMAP.md includes "TheoKit compatibility matrix" subsection

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER Phases 0–6 are complete.

**Objective:** Verify plugin doesn't regress TheoKit core; verify install + usage works for a real user.

### Execution

1. `cd theokit && /dogfood full` — verify TheoKit core not regressed
2. Manual smoke (out of automated suite):
   - `cd theokit-plugins && pnpm pack --filter @theokit/plugin-cors`
   - `cd /tmp && mkdir cors-smoke && cd cors-smoke && npm init -y && npm i ../path/to/theokit-plugin-cors-0.1.0.tgz theokit@^0.1.0-alpha.5`
   - Write minimal `theo.config.ts` importing cors plugin
   - Run TheoKit dev server, curl preflight + normal request, verify headers

### Acceptance Criteria

- [ ] `/dogfood full` ≥ 70/100 health score
- [ ] Zero CRITICAL issues introduced by plugin
- [ ] Zero HIGH issues in commands/features touched (plugin runner, hooks)
- [ ] Manual smoke install works (npm install from tarball succeeds)
- [ ] curl preflight returns 204 with CORS headers
- [ ] curl normal request returns 200 with CORS headers
- [ ] Pre-existing dogfood failures documented (not caused by plugin)

### If Dogfood Fails

1. Identify plan-caused vs pre-existing
2. Fix CRITICAL/HIGH plan-caused
3. Re-run dogfood
4. Pre-existing logged but NOT blocking

---

## Notes on Skill Process

- **`/architecture-docs` BEFORE** — skipped; storage-modules snapshot (2026-05-26) is recent. Plugin is additive in a separate repo; doesn't touch core module DAG.
- **`/edge-case-plan plugin-cors-and-roadmap`** — invoke after save. Expected clusters: T2.1 (Zod schema edge cases — empty arrays, predicate exceptions), T2.3 (response.headersSent timing), T4.2 (npm pack contents), T6.2 (proposed ADR may be too lightweight).
- **`/cross-validation plugin-cors-and-roadmap`** — run BEFORE dogfood. Cross-repo plan; validation must check both `theokit/` and `theokit-plugins/`.
- **Cross-repo plan** — this is the first plan touching two repos. Coverage matrix lists tasks but doesn't disambiguate repo location; each task header lists the affected file path with explicit repo prefix.
- **Roadmap impact:** closes the "framework has no ecosystem" perception with 1 real plugin; sets clear expectations for next 6 weeks (sentry + i18n committed) without overpromising the rest.
