# Edge Case Review — plugin-cors-and-roadmap

Data: 2026-05-27
Tasks analisadas: 14 (T0.1, T1.1, T1.2, T2.1, T2.2, T2.3, T3.1, T3.2, T4.1, T4.2, T4.3, T5.1, T6.1, T6.2)
Edge cases encontrados: **13** (MUST FIX: 3 · SHOULD TEST: 7 · DOCUMENT: 3)

> **Veredicto upfront:** **PLANO PRECISA DE AJUSTE.** 3 MUST FIX são problemas reais: (1) peer-dep `theokit >=0.5.0` falha install porque TheoKit atual é `0.1.0-alpha.5` (não 0.5.0); (2) inconsistência cross-repo entre fixture stubbed (T3.1) vs integration test real (T3.2) — uma das duas abordagens precisa ser escolhida + pnpm-workspace.yaml atualizada se for real; (3) user predicate em `origin: (o) => boolean` que joga exception derruba TODAS as requests com 500 (catch missing). Os 3 são fixes de 1-3 LOC cada. Os 7 SHOULD TEST enxertam testes pequenos nos TDD blocks existentes. Os 3 DOCUMENT viram notas.

---

## MUST FIX

### EC-1: Peer-dep `theokit >=0.5.0` doesn't match current TheoKit version
- **Task afetada:** T1.1
- **Família:** Boundary / Version mismatch
- **Cenário:** Plan §T1.1 e ADR D5 declaram `peerDependencies: { "theokit": ">=0.5.0" }`. **Verificação real:** `packages/theo/package.json:3` mostra `"version": "0.1.0-alpha.5"` (e o CLI ainda mostra `0.1.0-alpha.0`). TheoKit NUNCA chegou em 0.5.0 — "0.5.0" no plan veio do milestone do macro-roadmap (R0.5.x), não da versão real.
- **Impacto:** Quando user roda `pnpm add @theokit/plugin-cors`, pnpm warns "unmet peer dependency" porque `theokit@0.1.0-alpha.5` não satisfaz `>=0.5.0`. Em modo `strict-peer-dependencies` (default no pnpm 9+), o install FALHA. Plugin não pode ser usado.
- **Fix sugerido:** Trocar peer-dep range para o que existe HOJE: `"theokit": ">=0.1.0-alpha.5"` OR `"theokit": "^0.1.0-alpha.5"`. Quando TheoKit chegar em 0.5.0 (futura release), bump explícito em changeset.

### EC-2: Cross-repo workspace inconsistency between fixture (T3.1) and integration test (T3.2)
- **Task afetada:** T3.1, T3.2
- **Família:** Boundary / Cross-repo wiring
- **Cenário:** T3.1 Deep Dives diz: *"OR — keep fixture simple: stub `defineConfig` and `defineRoute` since the test is about CORS behavior, not TheoKit boot"* e marca "leans towards stubbed". T3.2 diz: *"Test imports `PluginRunner` from `theokit/server`"* — assume cross-repo workspace link. **Não há decisão.** Se ficar stubbed, `import { defineConfig } from 'theokit'` em T3.1 quebra. Se for real, `theokit-plugins/pnpm-workspace.yaml` precisa incluir `../theokit/packages/theo`.
- **Impacto:** Ou a fixture não compila (stubbed mas imports real `theokit`), ou o integration test não resolve `theokit/server` (real mas workspace não declara). Bloqueia Phase 3 inteira.
- **Fix sugerido:** Adicionar nova decisão **D7 em T0.1**: *"Fixture e integration test usam `theokit` via workspace link cross-repo. `theokit-plugins/pnpm-workspace.yaml` adiciona `- '../theokit/packages/theo'`."* + atualizar T3.1 Deep Dives removendo a opção stub. 1 linha no workspace yaml + 1 linha no plan.

### EC-3: User predicate exception (`origin: (o) => { throw new Error() }`) crashes all requests
- **Task afetada:** T2.2 (`resolveOrigin`)
- **Família:** Security / Resource (single bug → DoS)
- **Cenário:** Plan §T2.2 mostra `resolveOrigin` chamando `opts.origin(requestOrigin)` sem try/catch. Se user predicate joga (bug typo, runtime error, externa lib throws), exception propaga: PluginRunner's `runHookList` re-throws → onError hooks rodam → response 500. **TODAS** as requests do app retornam 500 até o app ser reiniciado. Confirmado via `packages/theo/src/server/plugins/plugin-runner.ts:runHookList`: `await hook(ctx); throw err` (no surrounding catch within the cors plugin's own scope).
- **Impacto:** Disponibilidade. Um bug em predicate = outage até deploy fix. Probabilidade real: user escreve `origin: (o) => allowedOrigins.split(',')` esperando array mas `allowedOrigins` undefined → TypeError em CADA request.
- **Fix sugerido:** No `resolveOrigin`, wrap predicate call em try/catch; tratar throw como `null` (no match) + log uma vez via `console.warn`:
  ```ts
  if (typeof opts.origin === 'function') {
    try { return opts.origin(requestOrigin) ? requestOrigin : null }
    catch (err) { console.warn('[@theokit/plugin-cors] origin predicate threw:', err); return null }
  }
  ```
  3 LOC. + 1 RED test em T2.2.

---

## SHOULD TEST

### EC-4: `methods: []` (empty array) produces empty `Access-Control-Allow-Methods` header
- **Task afetada:** T2.1, T2.2
- **Família:** Input / Edge case
- **Teste sugerido:** `test_buildHeaders_methods_empty_array_emits_empty_value()` — Given `opts.methods = []`, When `buildCorsHeaders(isPreflight=true)`, Then `Access-Control-Allow-Methods === ''`. Browser interpreta como "nenhum método permitido" — bloqueia preflight. Aceitable mas warrants test que pinpoints behavior. OR — schema pode requerer `z.array(z.string()).min(1).optional()` se preferir rejeitar.

### EC-5: `origin: ''` (empty string) never matches and silently disables CORS
- **Task afetada:** T2.1
- **Família:** Input / Silent fail
- **Teste sugerido:** `test_resolveOrigin_empty_string_origin_never_matches()` — Given `opts.origin = ''`, When `resolveOrigin('https://a.com', opts)`, Then `null`. Schema aceita string vazia (`z.string()` sem `.min(1)`). User typo (`origin: process.env.ORIGIN ?? ''`) silenciosamente desabilita CORS sem erro. Fix opcional: `z.string().min(1)` no schema. Mínimo: 1 RED test documentando o comportamento.

### EC-6: Origin header com valor literal `'null'` (cross-origin file:// requests)
- **Task afetada:** T2.2
- **Família:** Input / RFC compliance
- **Teste sugerido:** `test_resolveOrigin_literal_null_string_handled()` — Given `requestOrigin === 'null'` (literal string — RFC 6454 spec para origins opaque), When matched against allowlist `['https://a.com']`, Then `null` returned (no match). Confirma que plugin não trata `'null'` string como `null` value via type coercion.

### EC-7: Origin trailing-slash mismatch
- **Task afetada:** T2.2, T4.3 (README)
- **Família:** Input / DX
- **Teste sugerido:** `test_resolveOrigin_trailing_slash_mismatch()` — Given `opts.origin = 'https://a.com/'` (user typo with trailing slash) and request Origin `'https://a.com'` (browsers never send trailing slash), Then `null` returned. README T4.3 deve documentar: "Origins must match the format browsers send: scheme + host + port (no trailing slash, no path)."

### EC-8: Schema rejection message for async predicate is opaque
- **Task afetada:** T2.1
- **Família:** Type / Zod inference
- **Teste sugerido:** `test_options_schema_rejects_async_predicate_with_clear_message()` — Given `corsPlugin({ origin: async (o) => true })`, When `validateCorsOptions` runs, Then throws with message containing 'origin' AND ('async' OR 'Promise' OR 'must return boolean'). Zod's default error for `z.function().returns(z.boolean())` when fn returns Promise might be opaque. Add `.refine()` for clearer message.

### EC-9: `exposedHeaders: ['']` produces malformed `Expose-Headers: ` value
- **Task afetada:** T2.1
- **Família:** Input / Output sanitization
- **Teste sugerido:** `test_options_schema_rejects_empty_strings_in_string_arrays()` — Given `opts.exposedHeaders = ['X-Foo', '']`, When parsed, Then ZodError on item index 1. Fix: schema uses `z.array(z.string().min(1))` for `exposedHeaders` + `allowedHeaders` + `methods`.

### EC-10: `PluginRunner` may NOT be exported from `theokit/server` barrel
- **Task afetada:** T3.2
- **Família:** Boundary / Public API surface
- **Teste sugerido:** `test_PluginRunner_exported_from_theokit_server()` — Given workspace, When `import { PluginRunner } from 'theokit/server'`, Then resolves to constructor function. **Verificar antes de implementar T3.2.** If NOT exported, integration test must either: (a) request export in TheoKit core; (b) use a smaller test surface (e.g., directly call `definePlugin({...}).register(mockApp)`). Plan should pin this in T3.2 acceptance criteria.

---

## DOCUMENT

### EC-11: ROADMAP.md placeholder dates `2026-MM-DD` and "≤ 2 weeks after cors release"
- **Task afetada:** T6.1
- **Risco aceito:** Dates só conhecidas após release real. Placeholders devem ser substituídos pelo `release.yml` automation OR no PR de release. Aceitable mas risco de virar permanente. **Nota a adicionar em T6.1 acceptance criteria:** "No `2026-MM-DD` literal in ROADMAP.md after Phase 4 completes — date replaced with actual cors release date OR explicit TBD with target month (e.g., `Target: 2026-Q3`)."

### EC-12: `pnpm pack` produces different filename for scoped packages
- **Task afetada:** T4.2
- **Risco aceito:** pnpm 9 produce `theokit-plugin-cors-0.1.0.tgz` (scope stripped, dash-joined). Older versions or npm pack may produce `theokit-plugin-cors-0.1.0.tgz` OR `@theokit/plugin-cors-0.1.0.tgz` depending on tooling. Plan assumes the dash-joined form. **Nota a adicionar em T4.2 acceptance criteria:** "Verify tarball with `pnpm pack --filter @theokit/plugin-cors --pack-destination ./tmp && ls tmp/` and assert exact filename produced (don't hardcode in test script)."

### EC-13: `peer-dep range` constraint upon TheoKit major bumps
- **Task afetada:** T6.1, T6.2
- **Risco aceito:** When TheoKit ships 0.6.x → 1.0.x → 2.0.x, peer-dep range `>=0.1.0-alpha.5` is overly permissive (accepts incompatible majors). Each TheoKit major bump should trigger explicit peer-dep range update in every plugin via Changeset PR. Plan implicitly covers (D5 says "Plugin bumpa peer-dep range explicitamente quando TheoKit fizer breaking change") but ROADMAP.md should add a section "TheoKit version compatibility" listing tested ranges per plugin version. **Nota a adicionar em T6.1:** include "TheoKit compatibility matrix" subsection in ROADMAP.md.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | EC-1 | 0 | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T2.1 | 3 | 0 | EC-5, EC-8, EC-9 | 0 |
| T2.2 | 3 | EC-3 | EC-4, EC-6, EC-7 | 0 |
| T2.3 | 0 | 0 | 0 | 0 |
| T3.1 | 1 | EC-2 (shared T3.1/T3.2) | 0 | 0 |
| T3.2 | 1 | (shared) | EC-10 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T4.2 | 1 | 0 | 0 | EC-12 |
| T4.3 | 0 | 0 | (EC-7 doc in README) | 0 |
| T5.1 | 0 | 0 | 0 | 0 |
| T6.1 | 2 | 0 | 0 | EC-11, EC-13 |
| T6.2 | 0 | 0 | 0 | 0 |
| **Total** | **13** | **3** | **7** | **3** |

**Veredicto: PLANO PRECISA DE AJUSTE.** Os 3 MUST FIX são bloqueadores reais — sem eles a release não funciona (EC-1 install fails), a Phase 3 não compila (EC-2 cross-repo), ou app inteiro cai por bug de predicate (EC-3 DoS via plugin).

## Ações sugeridas no plano (incorporação)

### Bloqueadores (incorporar antes de implementar)
1. **EC-1 (T1.1):** trocar peer-dep `>=0.5.0` → `>=0.1.0-alpha.5`. Atualizar package.json template + ADR D5.
2. **EC-2 (T3.1/T3.2):** adicionar ADR D7 ("fixture + integration test usam cross-repo workspace link"); atualizar `theokit-plugins/pnpm-workspace.yaml` adicionando `- '../theokit/packages/theo'`; remover opção "stubbed" do T3.1 Deep Dives.
3. **EC-3 (T2.2):** acrescentar try/catch em `resolveOrigin` predicate path + 1 RED test `predicate_throw_treated_as_no_match`. 3 LOC + 1 test.

### Refinamentos (incorporar nos TDD blocks)
4. **EC-4..EC-9, EC-10:** 7 RED tests adicionais distribuídos entre T2.1, T2.2, T3.2.

### Notas no plano
5. **EC-11 (T6.1):** acceptance criterion proibindo placeholder `2026-MM-DD` literal no ROADMAP.md final.
6. **EC-12 (T4.2):** acceptance criterion verifica filename pattern via `ls` (não hardcode).
7. **EC-13 (T6.1):** adicionar subsection "TheoKit compatibility matrix" no ROADMAP.md.

**Custo total das incorporações:** ~10 LOC de código + 8 RED tests + 1 ADR adicional (D7) + 3 notas de doc. Plano fica 100% production-ready.
