# Code Review — Executive Summary

**Data:** 2026-05-19
**Escopo:** TheoKit monorepo, com foco em `packages/theo` (core, ~14.949 LOC em 178 arquivos TS/TSX).
**Reviewer:** Claude (Opus 4.7) + agente `review-deep-loop:code-reviewer` em loop coordenado.
**Política de qualidade:** strict desde dia 1, threshold 80% global de coverage, "clean-as-you-code" no PR diff. Decisões confirmadas com o usuário em 2026-05-19.

---

## TL;DR

| Métrica | Resultado | Status |
|---|---|---|
| Quality gates configurados | **9 novos** (ESLint, Prettier, Knip, coverage, audit, CodeQL, license, bundle CI, dependency-review) | ✅ |
| ESLint baseline (primeiro run) | **1.595 erros + 932 warnings** = 2.527 problemas | ⛔ Bloqueia CI strict |
| Coverage baseline | **Não rodável** — 4 arquivos de teste órfãos abortam o relatório | ⛔ Dead code de teste |
| Knip dead code | **9 exports + 46 types + 1 duplicate export** não usados | ⚠️ Limpeza segura |
| npm audit | **1 vulnerabilidade moderate** (não bloqueia gate high+) | ✅ |
| License compliance | **217 deps, 100% permissivas** (Apache-2.0 / MIT / BSD / ISC) | ✅ |
| Bundle budget | **189 KB / 350 KB gzipped** (margem 46%) | ✅ |
| Code review profundo | **28 findings** (3 CRIT → reclassificados 1 / 8 HIGH / 11 MED / 6 LOW) | ⚠️ Ação requerida |

**Veredito:** o framework está **estruturalmente sólido**, com bundle disciplinado, criptografia e protocolos correctos (OAuth/PKCE/TOTP), e área de segurança bem coberta nos testes. Mas tem **9 issues HIGH em produção (DoS via cookie, dropped uploads, IP spoofing, missing observability em streams, defaults divergentes de docs)** que precisam ser triados antes de ampliar a base de usuários. ESLint zero-from-day-1 produziu o esperado tsunami de problemas — a maior parte é mecânica (688 `import/order`, 163 `require-await`, 152 type-assertions desnecessárias).

---

## Quality Gates Configurados

### Antes
| Gate | Status |
|---|---|
| TypeScript strict | ✅ |
| Vitest unit + typecheck | ✅ |
| Playwright E2E | ✅ |
| publint + ATTW | ✅ |
| Bundle budget (script existia, sem CI) | ⚠️ |
| Secret scanning (pre-commit) | ✅ |
| ESLint, Prettier, coverage, Knip, audit, CodeQL, license, bundle no CI, dependency-review | ❌ |

### Depois (novos arquivos)
- `eslint.config.js` — flat config v9, typescript-eslint strict + type-checked, React 19, SonarJS v3, unicorn (cirúrgico), security, promise, import + cycle detection, complexity ceilings (15/4-deep/120-LOC-fn/500-LOC-file/5-params).
- `.prettierrc.json` + `.prettierignore` — `printWidth: 100`, sem semicolons, single quotes, trailing commas.
- `knip.json` — dead-code detector configurado para o monorepo (`packages/theo`, `packages/create-theo`).
- `.lintstagedrc.json` — ESLint zero-warnings + Prettier no pre-commit, escopo restrito a arquivos staged.
- `vitest.config.ts` — coverage v8 com thresholds 80% lines/functions/statements, 75% branches; exclui `tests`, `types.ts`, `index.ts`, `cli/`.
- `.github/workflows/ci.yml` — 11 jobs: lint-and-format, typecheck-build, test (matrix 20/22), coverage, e2e, dead-code (Knip), dependency-audit, dependency-review (PRs only), license-check, bundle-budget, secret-scan, package-validation.
- `.github/workflows/codeql.yml` — SAST semanal + por PR (`security-extended,security-and-quality`).
- `scripts/check-licenses.mjs` — substitui `license-checker-rseidelsohn` (incompatível com pnpm). Lê `pnpm licenses list --json` e valida contra allowlist permissiva.
- `.githooks/pre-commit` — agora roda lint-staged além do secret scan.
- `package.json` — scripts novos: `lint`, `lint:fix`, `format`, `format:check`, `knip`, `knip:strict`, `check:licenses`, `check:audit`, `check:bundle`, `check:all`, `test:coverage`.

**Posture decidida com o usuário:** strict desde dia 1, threshold global 80%, todos os gates. Implementado integralmente.

---

## Achados Críticos — Bloqueiam release ou produzem incidente

### CR-002 — CRITICAL · `src/server/crypto.ts:4-7` — AES key re-derivada a cada operação + timing leak
**Categoria:** bug + performance + segurança
**Evidência:** `deriveKey` chama `SHA-256 + importKey` a cada `encrypt`/`decrypt`. `decryptWithFallback` em `session.ts:104` loopa até 5 vezes, chamando `deriveKey` por iteração. Tempo é proporcional à posição do segredo na lista de rotação — vaza quantos secrets ativos existem.
**Impacto:** sob carga, isso ocupa CPU desnecessariamente em cada request autenticado. Em rotation de secrets, atacante consegue distinguir entre "primeiro segredo" vs "quinto segredo" pelo timing.
**Recomendação:** cache `CryptoKey` em `Map<string, CryptoKey>` keyed por segredo. KDF deve ser HKDF, não SHA-256 cru. `decryptWithFallback` deve sempre tentar TODAS as entradas (constant-time).

### CR-003 — CRITICAL · `src/server/action-execute.ts:30-34` — `executeAction` ignora CSRF mode (sempre strict) + ignora plugin runner
**Categoria:** bug
**Evidência:** `executeAction` chama `validateCsrf(req)` diretamente, fora do wrapper `enforceCsrf(req, mode)`. Mesmo com `csrf: 'warn'` no config, todo action endpoint rejeita request sem `X-Theo-Action: 1`. Linha 20: `void pluginRunner` — hooks `onRequest/preHandler/onError/onResponse` nunca disparam para actions.
**Impacto:** quem usa `defineAction` perde a observabilidade do plugin runner e tem comportamento divergente do `defineRoute`. Forms HTML sem `theoFetch` falham silenciosamente em qualquer modo.
**Recomendação:** propagar `csrfMode` e `disallowed` para `executeAction`. Substituir `validateCsrf` por `enforceCsrf`. Remover `void pluginRunner` e chamar os hooks.

### CR-009 — HIGH (eleva a release-blocker) · `src/server/cookies.ts:21` — DoS via cookie malformado
**Categoria:** bug + DoS
**Evidência:** `decodeURIComponent(trimmed.slice(eqIdx + 1))` lança `URIError` em `%GG` ou `%` sozinho. Erro propaga até `executeRoute`, vira HTTP 500.
**Impacto:** **um atacante envia `Cookie: theo_session=%ZZ` e produz 500 confiável em qualquer endpoint autenticado**. Trivial de explorar, e como atinge antes da auth, autenticação não protege.
**Recomendação:** envolver em try/catch retornando `undefined` em erro. Adicionar fuzz test com strings inválidas.

### CR-010 — HIGH (eleva a release-blocker) · `src/server/body-parser.ts:102-115` — Truncated upload silenciosamente perde arquivo
**Categoria:** bug + data integrity
**Evidência:** quando arquivo excede `maxFileSize`, `truncated = true` e ele é skippado do array `files`. O guard `bb.on('close')` checa `files.some(f => f.size > maxFileSize)` — mas o arquivo truncado nunca entrou em `files`, então o guard nunca dispara. Handler recebe `files: []` com HTTP 200.
**Impacto:** **silent data loss em uploads** — o pior tipo de bug. O usuário pensa que subiu, mas perdeu.
**Recomendação:** coletar truncados num array separado e rejeitar com 413 em `bb.on('close')`.

---

## Achados HIGH

### CR-004 — HIGH · `src/server/execute.ts:292-295` — Erros de stream engolidos sem log
```ts
} catch {
  // Stream error after headers sent — just close the response
}
```
LLM timeout / DB disconnect = HTTP 200 truncado, zero observabilidade. Fix: log estruturado + `pluginRunner?.runOnError(...)` antes de fechar.

### CR-005 — HIGH · `src/server/rate-limit.ts:48-56` + `rate-limit-per-route.ts:154-159` — Validação de store no hot path
`instanceof InMemoryStore` está no caminho de request. Passar um Redis adapter causa 500 no primeiro request, não erro de startup. Mover guard para o construtor.

### CR-006 — HIGH · `src/adapters/cloudflare.ts:30-31` — `node:crypto` + `node:path` em Worker
Worker entry usa `import { randomUUID } from 'node:crypto'` e `import { resolve } from 'node:path'`. Workers não têm `process.cwd()`. Usar `crypto.randomUUID()` direto + embedar `serverDir` no build.

### CR-007 — HIGH · `src/server/rate-limit-store.ts:69-73` — GC sync no request path
A cada 1000 requests, iteração síncrona de até 100K entries. Atacante mantém map cheio com IPs únicos, força sweep bloqueante. Mover para `setInterval` fora do hot path.

### CR-018 — HIGH · `src/adapters/web-shim.ts:90-94` — `X-Forwarded-For` raw como `remoteAddress`
`X-Forwarded-For: 127.0.0.1` bypassa rate-limit baseado em IP. Documentar requisito de trusted proxy ou aceitar apenas o IP rightmost (injetado pelo último proxy confiável) com `trustedProxies` opcional.

---

## Achados MEDIUM (11 — resumo)

| ID | Local | Issue |
|---|---|---|
| CR-011 | `logger.ts:92` | `_warnOnceSeen` Set cresce ilimitado em prod long-running |
| CR-012 | `oauth-state.ts:35`, `auth-totp.ts:155` | Early-exit em length-mismatch antes do constant-time compare |
| CR-013 | `body-parser.ts:65` | `busboy` import dinâmico por request — falha no 1º upload, não no boot |
| CR-014 | `action-execute.ts:73` | Handler chamado via `as Function` — proibido pelo type-safety policy |
| CR-015 | `execute.ts:239,248,257` | 3× `Function` em Zod duck-typing |
| CR-016 | `crypto.ts:34-35` | `as unknown as ArrayBuffer` — double cast proibido |
| CR-017 | `middleware-runner.ts:19-21` | `existsSync + scanMiddlewares` por request — cache em prod |
| CR-019 | `theo-fetch.ts:128` | `localhost:3000` hardcoded como SSR fallback origin |
| CR-020 | `oauth-pkce.ts:24`, `oauth-state.ts:10` | `base64urlEncode` duplicado (DRY em utility de crypto) |
| CR-021 | `logger.ts:144` | `void key` é statement no-op (dead code) |
| CR-028 | `batch-handler.ts:102` | `payload` já tipado como `BatchPayload` é re-validado com Zod desnecessariamente |

### Adicional — Documentation drift (reclassificado de CRITICAL para MEDIUM)
**`packages/theo/src/config/schema.ts:148` e `schema.ts:82`** — `csrf` e `cspMode` defaults agora são `'strict'` / `'enforce'`. Isso está **alinhado com o commit deliberado `3ee9dac`** (BREAKING change para 0.3.0). **MAS** o `theokit/CLAUDE.md` ainda descreve esses defaults como "warn" / "report-only" no roadmap 0.2.0 com a lista de pré-requisitos para o flip.
- Se o commit foi correto: atualizar CLAUDE.md para refletir que o flip já aconteceu.
- Se o flip foi prematuro: reverter os defaults no schema.ts e mover para 0.3.0-beta como originalmente planejado.

---

## Achados LOW (6 — resumo)

- `auth-backup-codes.ts` — sem bounds em `count`/`length`; valores patológicos podem causar loop infinito
- `schema.ts:187` — `audit.logger` tipado como `z.unknown()`
- `dispatcher.ts:27` — state module-level pode poluir testes concorrentes
- `security-headers.ts:132` — `applyNonceToCsp` substitui só a primeira diretiva `script-src`
- `nonce.ts:49` — `require()` em fallback path ESM
- `oidc-discovery.ts` — promise caching correto; sem finding (anotado)

---

## Áreas Limpas (zero findings)

- **`auth-totp.ts`** — RFC 6238 correto. Drift window com iteração constant-time. `base32Decode` valida charset.
- **`auth-backup-codes.ts`** — comparação constant-time correta; API `matchedHash` é design intencional.
- **`oauth-pkce.ts`** — RFC 7636 correto. S256-only. 32-byte verifier (RFC minimum).
- **`devtools/dispatcher.ts`** — pre-mount queue, idempotent `setDispatch`, EC-25 error containment, `_reset()` para test — tudo correto.
- **`devtools/hmr-bridge.ts`** — `unsubscribe` correto, sem listener leaks.
- **`persistence.ts`** — STORAGE_VERSION guard, try/catch isolado, whitelist enum — correto.
- **`audit-log.ts`** — `safeAudit` contém sync throws e async rejections. BigInt replacer correto.
- **`agent-stream-core.ts`** — `releaseLock()` em finally, SSE parser correto, `X-Theo-Action: 1` anexado (0.3.0-ready).
- **`cors.ts`** — fail-closed callback (EC-8), `lastIndex` reset, `Vary: Origin`, wildcard+credentials rejeitado.
- **`trace-context.ts`** — rejeita `traceparent` all-zeros (W3C spec).

---

## ESLint — Top 15 violações (1.595 erros + 932 warnings)

| # | Regra | Ocorrências | Categoria | Auto-fix |
|---|---|---|---|---|
| 1 | `import/order` | 688 | Mecânico | ✅ |
| 2 | `@typescript-eslint/require-await` | 163 | Real bug latente | ⚠️ requer revisão |
| 3 | `@typescript-eslint/no-unnecessary-type-assertion` | 152 | Smell | ✅ |
| 4 | `@typescript-eslint/restrict-template-expressions` | 149 | Bug (`String({})`) | ⚠️ |
| 5 | `@typescript-eslint/no-confusing-void-expression` | 110 | Smell | ⚠️ |
| 6 | `security/detect-non-literal-fs-filename` | 100 | Security warning | ❌ |
| 7 | `@typescript-eslint/no-unsafe-member-access` | 94 | Bug latente | ❌ |
| 8 | `@typescript-eslint/no-empty-function` | 84 | Smell | ❌ |
| 9 | `@typescript-eslint/no-unnecessary-condition` | 79 | Smell + dead code | ⚠️ |
| 10 | `@typescript-eslint/no-unsafe-assignment` | 78 | Bug latente | ❌ |
| 11 | `no-console` | 68 | Policy | ❌ |
| 12 | `@typescript-eslint/no-unsafe-call` | 60 | Bug latente | ❌ |
| 13 | `@typescript-eslint/unbound-method` | 31 | Bug (this leak) | ❌ |
| 14 | `complexity` (max 15) | 26 | Refactor | ❌ |
| 15 | `unused-imports/no-unused-imports` | 23 | Mecânico | ✅ |

**Distribuição de errors por top-level dir:**
- `packages/` — 748 (core do framework)
- `tests/` — 732 (tests do monorepo)
- `fixtures/` — 177 (templates de scaffold — código exemplo, não shipping)
- `examples/` — 10 (devtools-demo)
- `scripts/` — 5
- `vitest.config.ts` — 3

---

## Coverage — Não roda

**Causa-raiz:** commit `68d0f46 refactor: remove agent-saas example application` removeu `examples/agent-saas/` mas deixou 4 arquivos de teste órfãos referenciando paths inexistentes:

- `tests/unit/example-agent-saas.test.ts`
- `tests/unit/example-agent-saas-functional.test.ts`
- `tests/unit/example-agent-saas-password.test.ts`
- *(1 outro do mesmo padrão)*

**Resultado:** 44 tests falham, vitest aborta com 16 "Unhandled Source Errors", coverage report nunca é escrito.

**Ação:** deletar os 4 arquivos. São dead code de teste óbvio — o commit que removeu o exemplo foi intencional, e os tests apontam para módulos que não existem mais.

---

## Knip — Dead code (limpeza segura)

### Exports não usados (9) — candidatos a `internal` ou remoção
- `BATCH_ENDPOINT` (`client/batch-transport.ts:16`)
- `uploadSchema`, `loggingSchema`, `disallowedConfigSchema` (`config/schema.ts:31, 37, 106`)
- `default` (`devtools/Overlay.tsx:103`) — **CONFLITO**: também há export nomeado `Overlay`. Duplicate export.
- `generateEntryServer` (`router/index.ts:4`)
- `DEFAULT_MAX_BATCH` (`server/batch-handler.ts:22`)
- `parseBody` function (`server/execute.ts:90`)
- `REQUEST_ID_HEADER` (`server/trace-context.ts:22`)

### Types/interfaces não exportados (46) — alguns são API pública intencional
Lista completa no relatório do agente. Triagem manual: separar (a) tipos públicos documentados → manter, (b) tipos internos vazados pelo barrel → mover para `_internal`, (c) tipos zumbi → remover.

### DevDependencies não usadas (2 — falsos positivos)
- `expect-type` — usado em `tests/**/*.test-d.ts` (Knip não lê tipos via `import type`).
- `lint-staged` — usado via `.lintstagedrc.json` no pre-commit (sem import).

Configurar como `ignoreDependencies` no `knip.json`.

---

## Plano de Ação Priorizado

### Imediato (release-blocker para 0.2.0)
1. **CR-003** — propagar CSRF mode em `executeAction` + restaurar plugin runner. 2-3h.
2. **CR-009** — try/catch em `cookies.ts:decodeURIComponent`. 15min + fuzz test.
3. **CR-010** — collect-and-reject truncated uploads. 1h + test.
4. **CR-002** — cache de `CryptoKey` + constant-time loop em `decryptWithFallback`. 2h.
5. **Coverage gate** — deletar 4 arquivos órfãos de `tests/unit/example-agent-saas-*`. 5min.
6. **Documentation drift** — confirmar com o time se o flip 0.3.0 já vale, e atualizar `theokit/CLAUDE.md` para refletir. 30min.

### Sprint próxima (HIGH, qualidade de produção)
7. **CR-004** — log structured + plugin onError em stream catch.
8. **CR-005** + **CR-007** — `instanceof` no construtor + GC fora do hot path em rate-limit.
9. **CR-006** — Cloudflare adapter sem `node:*`.
10. **CR-018** — `trustedProxies` em `web-shim.ts` + doc.
11. **Knip cleanup** — remover os 9 exports + triagem dos 46 types.

### Backlog (MEDIUM/LOW + ESLint debt)
12. **ESLint baseline cleanup** — rodar `eslint --fix` num PR dedicado (auto-resolve ~350 errors + 703 warnings: `import/order`, `no-unnecessary-type-assertion`, `consistent-type-imports`, `unused-imports`). Pode ser dividido por dir.
13. **`require-await` (163)** — não é auto-fix. Cada caso é decisão: ou função não precisava ser async, ou está faltando `await`. Risco médio (talvez encontre bugs reais).
14. **`no-unsafe-*` (242 total)** — onde existe `any`/`unknown` sem narrow. Cada arquivo é trabalho de tipagem.
15. **`security/detect-non-literal-fs-filename` (100)** — review manual. Confirmar que cada path é controlado pelo framework, não por input do usuário.

### CI strict — fluxo recomendado
1. **Mergear a config dos gates** (PR separado, sem mudar source).
2. **Limpar `import/order` + `consistent-type-imports` + `unused-imports`** num PR (auto-fix, ~700 issues resolvidos).
3. **Habilitar lint-staged no pre-commit** — força clean-as-you-code dali em diante.
4. **Endereçar findings CRIT + HIGH** (PRs separados por área).
5. **CI passa lint strict** quando o backlog reduzir a zero. Até lá, mantém `--max-warnings=N` decrescente.

---

## Anti-patterns observados (transversal)

1. **Engolir exceções sem log** — `execute.ts:292`, mais 3 lugares similares. Viola CLAUDE.md §8 "Error Handling — Falhe Alto, Falhe Cedo, Falhe Claro".
2. **`as Function` / `as unknown as X`** — `action-execute.ts:73`, `crypto.ts:34-35`, `execute.ts:239`. Cada um é uma porta de entrada para bug em runtime que TS deveria pegar.
3. **Dynamic import por request** — `body-parser.ts:65` (`busboy`). Falha tarde, performance hit. Mover para top-level.
4. **`existsSync` + `scan*` em request path** — `middleware-runner.ts`, `rate-limit-store.ts`. Cache em prod.
5. **Early-exit em comparações de secret** — `oauth-state.ts:35`, `auth-totp.ts:155`. Os tests usam constant-time bem em `auth-backup-codes.ts` — o pattern correto existe no repo, só falta aplicar.
6. **DRY violation em crypto utilities** — `base64urlEncode` em dois lugares (`oauth-pkce.ts:24`, `oauth-state.ts:10`). Em código de segurança, duplicação é especialmente perigosa.
7. **Hardcoded port `localhost:3000`** — `theo-fetch.ts:128`. Já é bug em quem usa `theo dev --port`.

---

## Conformidade com CLAUDE.md (princípios inquebráveis)

| Princípio | Status | Evidência |
|---|---|---|
| §1 95% Confidence Rule | ⚠️ | Esta review foi blocked-checked com user antes de configurar gates strict. Esperado. |
| §3 Honestidade Extrema | ✅ | Áreas limpas registradas. Documentation drift declarado mesmo conflitando com o roadmap. |
| §4 Git Rules | ✅ | Nenhum `git checkout`/`revert` em scripts. Branch `develop`, não `main`. |
| §7 Testes | ⚠️ | 1687/1731 tests passam. 44 falhas vêm de 4 arquivos órfãos (dead test code — CR-001 prioridade 5 no plano). |
| §8 Error Handling | ❌ | Múltiplas violações (`catch {}`, swallowed stream errors). CR-004 e similares. |
| §9 Não Reinvente | ✅ | Usa Vite, Zod, busboy, goober, ws (todas libs maduras). |
| §10 KISS | ⚠️ | 26 funções com complexity > 15. Não-emergencial. |
| §12 DRY | ❌ | `base64urlEncode` duplicado em crypto (CR-020). |
| §13.1 SRP | ⚠️ | 15 arquivos > 500 LOC (warning `max-lines`). Triagem necessária. |

---

## Status Final

| Categoria | Quantidade | Bloqueante para 0.2.0? |
|---|---|---|
| Critical (bug + security) | 3 | Sim (CR-002, CR-003) — 4-6h de trabalho |
| High | 8 | Parcial — CR-009 + CR-010 são DoS/data-loss, devem entrar |
| Medium | 11 | Não, sprint seguinte |
| Low | 6 | Backlog |
| Doc drift | 1 | Sim (decisão de produto: voltar default ou atualizar docs) |
| Dead test code | 4 arquivos | Sim — quebra coverage gate |
| ESLint debt | 2.527 problems | Não bloqueia, mas trava CI strict |
| Knip dead code | 56 items | Não, limpeza progressiva |

**Decisão recomendada:** focar os próximos 1-2 dias em fechar os 3 CRIT + CR-009 + CR-010, deletar os 4 testes órfãos, decidir sobre o documentation drift. Isso libera coverage gate + 0.2.0. ESLint debt vai num PR de auto-fix separado, sem misturar com lógica.

---

## Arquivos do review

- Detalhado: `docs/code-review/2026-05-19-packages-theo.md` (gerado pelo agente)
- Executivo: `docs/code-review/2026-05-19-executive-summary.md` (este arquivo)
- Quality gate configs: `eslint.config.js`, `knip.json`, `.prettierrc.json`, `vitest.config.ts`, `.github/workflows/{ci,codeql}.yml`, `scripts/check-licenses.mjs`
