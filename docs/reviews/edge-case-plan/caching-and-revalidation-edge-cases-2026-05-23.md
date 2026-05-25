# Edge Case Review — caching-and-revalidation

Data: 2026-05-23
Tasks analisadas: 13 (T1.1, T1.2, T1.3, T2.1, T2.2, T3.1, T4.1, T5.1, T6.1, T7.1, T7.2, T8.1, T8.2)
Edge cases encontrados: 18 (MUST FIX: 5, SHOULD TEST: 7, DOCUMENT: 6)

---

## MUST FIX

### EC-1: `validateTags` called with non-array crashes
- **Task afetada:** T1.1
- **Família:** Input
- **Cenário:** `validateTags(undefined, 'route')` ou `validateTags("foo", 'route')`. A função itera com `for (...of tags)` e acessa `.length` — runtime crash.
- **Impacto:** Qualquer caller que passe um valor não-array (typo, .filter() retornando undefined, JSON malformado) crasha o request inteiro em vez de degradar graciosamente.
- **Fix sugerido:** No topo de `validateTags`: `if (!Array.isArray(tags)) return { valid: [], dropped: [{ value: tags, reason: 'expected array, got ' + typeof tags }] }` (3 linhas). Adicionar test RED `validateTags_non_array_returns_dropped`.

### EC-2: `varies` incluindo `cookie`/`set-cookie` fragmenta cache silenciosamente
- **Task afetada:** T1.3 + T5.1
- **Família:** Boundary / Performance
- **Cenário:** Usuário declara `cache: { varies: ['cookie'] }` esperando cache-per-user. Como cookies têm cardinalidade ilimitada (cada user diferente), cada request é cache miss. Cache hit-rate cai para zero sem qualquer warn.
- **Impacto:** Performance cliff invisível. O usuário acha que tem cache mas não tem. Astro `memory-provider.ts:219` previne isso explicitamente; nosso plano não.
- **Fix sugerido:** Em `cache-middleware.ts` (T5.1), no momento de construir `varies` para `deriveKey`: filtrar `cookie`/`set-cookie` da lista + warn-once via `console.warn`. 2 linhas. Adicionar test em T5.1.

### EC-3: Large response body OOMs LRU cache
- **Task afetada:** T5.1
- **Família:** Resource
- **Cenário:** Handler retorna 50MB JSON (e.g., um dump de dados). Cache armazena 1000 entries por default (config `maxEntries`). 50MB × 1000 = 50GB. Process OOM em produção.
- **Impacto:** Outage. O config `maxEntries` é count-based; sem cap por entry size, um único endpoint mal-comportado derruba o servidor.
- **Fix sugerido:** Em T5.1, adicionar config `cache.maxEntrySize?: number` (default 10 MB) + check no middleware antes de `engine.set`: `if (body.byteLength > maxEntrySize) { console.warn(...); return response without caching }`. Adicionar test RED `dcr_middleware_oversized_response_bypasses`.

### EC-4: Cache middleware ANTES de auth middleware = data leak
- **Task afetada:** T5.1
- **Família:** Security
- **Cenário:** Router middleware chain: `[cache, auth, route]`. Request 1 (autenticado, user=alice) preenche cache. Request 2 (não-autenticado) chega — cache hit serve resposta da Alice antes do auth rodar.
- **Impacto:** Vazamento de dados privados para usuários não-autorizados. Cache poisoning estrutural.
- **Fix sugerido:** Em T5.1, modificar `router/handler.ts` para garantir que cache middleware roda DEPOIS de auth (ou o usuário marca explicitamente a rota como public via `cache.public: true`). Documentar invariante em `docs/concepts/caching.md` (T8.2): "Cache middleware runs AFTER user-defined middleware to ensure auth gates apply". Adicionar integration test `cache_runs_after_auth_in_default_chain`.

### EC-5: `picomatch` não declarado como dep direta
- **Task afetada:** T7.2
- **Família:** Boundary / Resource
- **Cenário:** Plano afirma "picomatch já transitivo via Vite". Mas Vite é devDep. Em runtime production (após `theokit build`), `picomatch` pode não estar no bundle/node_modules → `import picomatch from 'picomatch'` falha em prod.
- **Impacto:** App buildado com route rules crasha em prod com `Cannot find module 'picomatch'`.
- **Fix sugerido:** Em T7.2, adicionar `"picomatch": "^4.0.0"` como `dependencies` direta em `packages/theo/package.json`. Verificar via `pnpm why picomatch` que está em runtime tree. Adicionar test em smoke suite que importa de `packages/theo/dist/`.

---

## SHOULD TEST

### EC-6: `req.url` malformado em deriveKey
- **Task afetada:** T1.3
- **Teste sugerido:** `deriveKey_malformed_url_throws_clear_error()` — Given `Request` com URL relativa inválida (impossível via Request, mas o `getKey` callback pode retornar uma URL malformada), When `deriveKey` called, Then throws com mensagem mencionando a URL problemática (não TypeError genérico).

### EC-7: `getKey` retorna não-string
- **Task afetada:** T1.3
- **Teste sugerido:** `deriveKey_getKey_returns_non_string_throws()` — Given `opts.getKey = () => 42 as any`, When `deriveKey` called, Then throws `Error('getKey must return a string')`. Fix de implementação: `const k = await opts.getKey(req); if (typeof k !== 'string') throw new Error('getKey must return a string, got ' + typeof k); return k`.

### EC-8: Clock skew negativo quebra expiração
- **Task afetada:** T3.1
- **Teste sugerido:** `engine_negative_age_treated_as_fresh()` — Given entry com `storedAt = Date.now() + 60000` (clock retrocedeu), When `getOrCompute`, Then status='hit' (não crasha). Fix: `const age = Math.max(0, (Date.now() - entry.storedAt) / 1000)`.

### EC-9: `validate` callback throws
- **Task afetada:** T3.1
- **Teste sugerido:** `engine_validate_throws_treated_as_miss_logs_onError()` — Given `validate = () => { throw new Error('boom') }`, When `getOrCompute`, Then status='miss', loader called, onError called com `phase: 'get'`. Fix de impl: wrap validate call in try/catch.

### EC-10: Loader retorna undefined
- **Task afetada:** T3.1
- **Teste sugerido:** `engine_loader_undefined_warns_no_cache_write()` — Given `fn = async () => undefined`, When `getOrCompute`, Then returns undefined; storage.size() ainda 0; warn emitted once. (JSON.stringify(undefined) === undefined — não cachear).

### EC-11: Streaming response (chunked transfer, não-SSE) cached incorretamente
- **Task afetada:** T5.1
- **Teste sugerido:** `dcr_middleware_chunked_stream_not_cached()` — Given handler retorna `new Response(readableStream, { headers: { 'transfer-encoding': 'chunked' } })`, When middleware processa, Then NOT cached (auto-detect via `!response.headers.has('content-length') && response.body instanceof ReadableStream`).

### EC-12: Singleton interfere entre arquivos de teste
- **Task afetada:** T7.1
- **Teste sugerido:** `singleton_isolated_per_test_file()` — verificar via `beforeEach(() => _resetCacheEngine())` em cada test file. Adicionar lint rule via grep no CI: "todo test file que importa de cache/* DEVE chamar _resetCacheEngine no beforeEach".

---

## DOCUMENT

### EC-13: `getCacheControlHeader` não valida inputs (pure function)
- **Risco aceito:** É função pura intencional. Validar inputs aqui duplicaria a validação dos call-sites (defineCachedRoute usa Zod schema). KISS: deixar pura.

### EC-14: BigInt em args crasha JSON.stringify default
- **Risco aceito:** Plano já documenta em T4.1 ("JSON serialization constraints"). Solução existente: `opts.getKey` override. Add 1 linha em `docs/concepts/caching.md` (T8.2) listando BigInt junto com Symbol/Function/Date.

### EC-15: `invalidate(key)` concorrente durante loader sobrescreve com stale
- **Risco aceito:** Real mas pouco frequente. Solução completa requer generation counter (complexidade). KISS: documentar em JSDoc do `invalidate`: "Concurrent invalidate during in-flight loader may not prevent the stale write. Prefer using `revalidateTag` from a separate request/handler context."

### EC-16: Config HMR re-init não suportado
- **Risco aceito:** Dev workflow expectation é "edit config → restart dev server". Auto-reinit precisaria comparar configs + decidir quando invalidar storage. KISS: documentar "Changes to `theo.config.ts cache` require dev server restart" em T8.2.

### EC-17: `deleteByTag` O(N) em tag gigante
- **Risco aceito:** Default `maxEntries: 1000` cap o pior caso. Para usuários com Redis adapter customizado, eles escolhem o trade-off (Redis SCAN é O(N) também). Documentar complexidade na JSDoc do `CacheStorageAdapter.deleteByTag`.

### EC-18: Loader hangs forever (background revalidation)
- **Risco aceito:** Astro e Nitro têm o mesmo problema; ambos aceitam. Adicionar timeout custom é over-engineering. Documentar: "user-supplied loaders must complete; configure upstream timeouts (e.g., fetch with AbortController)" em T8.2.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 | 1 | 1 (EC-1) | 0 | 0 |
| T1.2 | 1 | 0 | 0 | 1 (EC-13) |
| T1.3 | 3 | 1 (EC-2 partial) | 2 (EC-6, EC-7) | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 1 | 0 | 0 | 1 (EC-17) |
| T3.1 | 4 | 0 | 3 (EC-8, EC-9, EC-10) | 2 (EC-15, EC-18) |
| T4.1 | 1 | 0 | 0 | 1 (EC-14) |
| T5.1 | 4 | 3 (EC-2 main, EC-3, EC-4) | 1 (EC-11) | 0 |
| T6.1 | 0 | 0 | 0 | 0 |
| T7.1 | 2 | 0 | 1 (EC-12) | 1 (EC-16) |
| T7.2 | 1 | 1 (EC-5) | 0 | 0 |
| T8.1 | 0 | 0 | 0 | 0 |
| T8.2 | 0 | 0 | 0 | 0 |
| **Total** | **18** | **5** | **7** | **6** |

**Veredicto:** PLANO PRECISA DE AJUSTE — 5 MUST FIX antes do go-ahead.

### Próximos passos

1. Incorporar os 5 MUST FIX no plano:
   - **EC-1** → adicionar test + 3-line guard em T1.1
   - **EC-2** → adicionar filter+warn em T5.1 middleware
   - **EC-3** → adicionar `maxEntrySize` config + check em T5.1
   - **EC-4** → adicionar invariante de ordem de middleware em T5.1 (doc + integration test) + chain modification
   - **EC-5** → declarar `picomatch` como `dependencies` direta em T7.2

2. Adicionar os 7 SHOULD TEST como RED tests adicionais nas TDD+BDD sections respectivas.

3. Incorporar os 6 DOCUMENT items em `docs/concepts/caching.md` (T8.2).

4. Re-rodar este review após incorporação para confirmar 0 MUST FIX restantes.
