# Edge Case Review — theokit-0.3.0-cutover-execution

**Data:** 2026-05-19
**Tasks analisadas:** 13 (T1.1, T2.1-T2.3, T3.1, T4.1, T5.1, T6.1, T7.1-T7.3, T8.1, T9.1)
**Edge cases encontrados:** 17 (MUST FIX: 5, SHOULD TEST: 7, DOCUMENT: 5)

---

## MUST FIX

### EC-1: `Headers` object (not plain) quebra o spread em `useAgentStream`
- **Task afetada:** T1.1
- **Família:** Type / Boundary
- **Cenário:** Usuário passa `init.headers = new Headers({ ... })` (legal por `RequestInit`). O cast `init.headers as Record<string, string>` no plano dá `unknown` em runtime; spread `{ ...headers }` numa instância de `Headers` retorna `{}` porque os pares vivem em métodos, não em props enumeráveis. Resultado: o framework SOBRESCREVE todo o `Headers` do user.
- **Impacto:** Headers customizados (Authorization, X-Request-Id, etc.) somem. Auth quebra silenciosamente.
- **Fix sugerido:** Detectar via `init.headers instanceof Headers` antes do spread:
  ```ts
  const h = init.headers instanceof Headers ? Object.fromEntries(init.headers) : (init.headers ?? {})
  init.headers = { ...h, 'X-Theo-Action': '1' }
  ```

### EC-2: `JSON.stringify` em `warnOnce` payload com referência circular crasha
- **Task afetada:** T2.1
- **Família:** Input / State
- **Cenário:** Caller passa `payload = { req, err }` onde `err.cause` aponta de volta pra `err`. `JSON.stringify` joga `TypeError: Converting circular structure to JSON`. Hoje o plano emite via `console.warn(JSON.stringify(payload))`.
- **Impacto:** Uma única warn-emit crasha o processo do request handler.
- **Fix sugerido:** Try/catch ao redor do stringify, fallback pra `String(err)`:
  ```ts
  let line: string
  try { line = JSON.stringify({ ...payload, warnOnce: true }) }
  catch { line = `[warnOnce] ${key} — (payload had circular ref)` }
  console.warn(line)
  ```

### EC-3: CDN caching congela nonce stale com CSP header dinâmico
- **Task afetada:** T4.1
- **Família:** Security / Resource
- **Cenário:** Usuário hospeda em Vercel/Cloudflare/CloudFront com CDN cache habilitado. Primeira request gera HTML com `<script nonce="abc">` + CSP header `'nonce-abc'`. CDN cacheia o HTML mas REGENERA o CSP header em toda request (origin-shielded). Hit #2 entrega o HTML cached (nonce `abc`) mas com novo CSP header `'nonce-xyz'`. Browser bloqueia todo `<script>` da página.
- **Impacto:** **Crítico.** Toda página SSR cacheada quebra silenciosamente em prod com CDN. Aparece como "site funciona em dev, quebra em prod" — o pior tipo de bug.
- **Fix sugerido:** Quando nonce é gerado, framework força `Cache-Control: private, no-store` na response. Adicionar em `applySecurityHeaders` quando nonce está presente:
  ```ts
  if (nonce) res.setHeader('Cache-Control', 'private, no-store')
  ```
  Documentar override path em migration guide para users que queiram cachear (require static nonce via env var, opt-out).

### EC-4: Static prerender baked-in nonce vs runtime CSP nonce — mismatch garantido
- **Task afetada:** T4.1
- **Família:** Security / Build vs Runtime
- **Cenário:** `theokit build` com `prerender` ON gera HTML estático com nonce embutido no momento do build. Em runtime, `applySecurityHeaders` gera novo nonce per-request. Mismatch absoluto, browser bloqueia scripts.
- **Impacto:** **Crítico** para qualquer projeto usando prerender (`/static-paths.ts`, `theokit build --static`).
- **Fix sugerido:** No build path, NÃO gerar `<script nonce>` — usar `'unsafe-inline'` fallback APENAS para rotas prerendered. Detectar via flag `ctx.isPrerender` que o build seta:
  ```ts
  const useNonce = !ctx.isPrerender
  ```
  Documentar trade-off: prerendered routes não conseguem strict CSP.

### EC-5: RegExp com flag `/g` em `disallowedRoutes` é stateful entre requests
- **Task afetada:** T5.1
- **Família:** State / Type
- **Cenário:** User configura `disallowedRoutes: [/api\/admin\/.*/g]` (flag global). `RegExp.test()` com `/g` mantém `lastIndex` mutável entre invocações. Request 1 matches, `lastIndex` avança; request 2 com mesma path testa a partir do meio da string, retorna `false`. Resultado: matcher "esquece" rotas alternadamente.
- **Impacto:** Bypass intermitente da escalation. Auditor de segurança nunca consegue reproduzir.
- **Fix sugerido:** Normalizar no validate do Zod schema OU resetar `lastIndex` antes de cada `.test()`:
  ```ts
  return patterns.some(p => {
    if (p instanceof RegExp) { p.lastIndex = 0; return p.test(path) }
    return path === p
  })
  ```

---

## SHOULD TEST

### EC-6: `useAgentStream` com `init.method` lowercase E `Headers` instance combinados
- **Task afetada:** T1.1
- **Teste sugerido:** `test_useAgentStream_handles_lowercase_method_and_Headers_instance` — Given `init = { method: 'post', headers: new Headers({ Authorization: 'Bearer x' }) }`, When `consumeAgentStream` runs, Then both `X-Theo-Action: '1'` AND `Authorization: Bearer x` are present in the actual fetch headers.

### EC-7: Regex false-positive em comentários ou string literals no `upgrade-readiness`
- **Task afetada:** T2.3
- **Teste sugerido:** `test_upgrade_readiness_skips_commented_fetch_calls` — Given source contém `// const x = fetch('/api/x', { method: 'POST' })`, When scan, Then NO violation reported. Adicionar `// Example: fetch(...)` na fixture clean.

### EC-8: `upgrade-readiness` em diretório sem `app/` nem `server/`
- **Task afetada:** T2.3
- **Teste sugerido:** `test_upgrade_readiness_empty_project` — Given diretório vazio (só `package.json`), When run, Then exit 0 + status='no-project-detected' (não crash, não exit 1).

### EC-9: `warnOnce` Set crescimento ilimitado em servidor long-running
- **Task afetada:** T2.1
- **Teste sugerido:** `test_warnOnce_set_grows_within_bound` — Given 10.000 unique keys, When all called, Then `_warnOnceSeen.size === 10000` (verificar que não há leak). Documentar como expected behavior; revisitar se prod logs mostram crescimento problemático.

### EC-10: Múltiplos `index-*.js` no bundle budget (multi-entry build)
- **Task afetada:** T7.2
- **Teste sugerido:** `test_bundle_budget_picks_largest_when_multiple_entries` — Given `.theo/client/assets/index-A.js (300KB)` e `index-B.js (100KB)`, Then script reporta 300KB (o maior), NÃO soma de ambos.

### EC-11: Port collision no Playwright config (3461-3464 já em uso)
- **Task afetada:** T7.1
- **Teste sugerido:** N/A em CI (portas dedicadas); DOCUMENTAR no migration guide / CONTRIBUTING que esses ports podem conflitar localmente + sugestão de override via env var.

### EC-12: Streaming SSR emite scripts via `renderToPipeableStream` que o framework não controla
- **Task afetada:** T4.1
- **Teste sugerido:** `test_nonce_applied_to_react_emitted_scripts` — Given streaming SSR com Suspense boundaries, When response flushes, Then TODOS os `<script>` no body têm o mesmo nonce (incluir asserção no Playwright spec contando `<script nonce>` vs `<script>` simples). React's internal script tags devem receber o nonce via prop em `renderToPipeableStream({ nonce })`.

---

## DOCUMENT

### EC-13: `docsUrl` aponta para URL que ainda não resolve
- **Task afetada:** T2.2 (+ T3.1)
- **Risco aceito:** Em 0.2.x patch + 0.3.0-beta, o `docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover'` aponta pra um domínio sem site de docs ainda. Usuário clica → 404. Custo: adicionar nota no migration guide README dizendo "se 404, leia local: `docs/migrating/0.2-to-0.3.md`". Fix real (site de docs) está em 0.4.0 do roadmap.

### EC-14: Trailing slash mismatch em `disallowedRoutes`
- **Task afetada:** T5.1
- **Risco aceito:** Plano já documenta — `'/api/login'` ≠ `'/api/login/'` por design (exact match). Usuário usa RegExp se quer tolerância. Documentar em migration guide com 1 linha + exemplo.

### EC-15: SECURITY.md aponta pra email que pode não existir
- **Task afetada:** T7.3
- **Risco aceito:** `security@usetheo.dev` MX records podem não estar configurados. Placeholder OK para 0.3.0; ajustar quando setup do projeto for completo. Adicionar fallback "OR open a private GitHub Security Advisory".

### EC-16: Beta window cruza feriado / sem reviewers
- **Task afetada:** T8.1 / T9.1
- **Risco aceito:** Release engineer's call. Documentar como gate humano: "se beta window inclui >= 3 dias úteis sem reviewer ativo, estender o prazo". Não codificar em script.

### EC-17: Migration guide divergence — usuário lê versão cached, plano atualiza
- **Task afetada:** T3.1
- **Risco aceito:** Markdown estático; CDN cache em github raw é minutos, não dias. Aceitável. Documentar versão do guide em frontmatter (`version: 0.3.0-beta.0`) para cross-reference.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 — useAgentStream X-Theo-Action | 2 | 1 (EC-1) | 1 (EC-6) | 0 |
| T2.1 — warnOnce | 2 | 1 (EC-2) | 1 (EC-9) | 0 |
| T2.2 — code + docsUrl | 1 | 0 | 0 | 1 (EC-13) |
| T2.3 — upgrade-readiness CLI | 2 | 0 | 2 (EC-7, EC-8) | 0 |
| T3.1 — migration guide | 1 | 0 | 0 | 1 (EC-17) |
| T4.1 — per-request nonce SSR | 3 | 2 (EC-3, EC-4) | 1 (EC-12) | 0 |
| T5.1 — disallowedRoutes | 2 | 1 (EC-5) | 0 | 1 (EC-14) |
| T6.1 — flip defaults | 0 | 0 | 0 | 0 |
| T7.1 — 4 templates Playwright | 1 | 0 | 1 (EC-11) | 0 |
| T7.2 — bundle budget | 1 | 0 | 1 (EC-10) | 0 |
| T7.3 — community scaffolding | 1 | 0 | 0 | 1 (EC-15) |
| T8.1 — beta publish | 1 | 0 | 0 | 1 (EC-16) |
| T9.1 — promote to latest | 0 | 0 | 0 | 0 |
| **TOTAL** | **17** | **5** | **7** | **5** |

**Veredicto: PLANO PRECISA DE AJUSTE.**

5 itens MUST FIX são reais — especialmente **EC-3 (CDN cache)** e **EC-4 (prerender nonce mismatch)**, que são CRÍTICOS para qualquer deploy de produção real e estão completamente ausentes do plano. EC-1 (Headers instance) e EC-5 (RegExp `/g`) são bugs garantidos em código que será escrito a sério. EC-2 (circular ref crash) é defensive coding que vale 3 linhas.

Os 7 SHOULD TEST viram cenários BDD adicionais nos blocos TDD das tasks afetadas. Os 5 DOCUMENT vão como notas no migration guide ou comments no source.

## Recomendações concretas para incorporar ao plano

Antes de implementar:

1. **T1.1**: adicionar item nas "Tasks" — "Handle `Headers` instance: `Object.fromEntries(headers)` antes do spread". Adicionar test case EC-6.
2. **T2.1**: adicionar try/catch no `warnOnce`. Test EC-9 (size bound assertion).
3. **T2.3**: tests EC-7 (skip comments) + EC-8 (empty project).
4. **T4.1**: adicionar 2 novas tasks/items — "Force `Cache-Control: private, no-store` when nonce is present" (EC-3) + "Detect `ctx.isPrerender` and skip nonce path" (EC-4) + test EC-12 (React script tags carry nonce via `renderToPipeableStream({ nonce })`).
5. **T5.1**: adicionar normalização de RegExp no validator OR reset `lastIndex` na matcher. Test no plano.
6. **T7.1**: documentar port-collision override no CONTRIBUTING.
7. **T7.2**: explicit test EC-10 (multiple entries).
8. Migration guide (T3.1): incluir notas para EC-13, EC-14, EC-17.
9. SECURITY.md (T7.3): mencionar GitHub Security Advisory como fallback do email.
10. T8.1: nota de gate humano para holiday windows.

Depois de incorporar: re-run `/edge-case-plan` é OPCIONAL — todos os items são endereçáveis dentro das tasks existentes sem criar novas phases.
