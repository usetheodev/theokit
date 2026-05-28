# Edge Case Review — storage-modules-sdk-delegation

Data: 2026-05-27
Tasks analisadas: 14 (T0.1, T0.2, T0.3, T0.4, T1.1, T1.2, T2.1, T2.2, T3.1, T3.2, T4.1, T4.2, T5.1, T5.2)
Edge cases encontrados: **11** (MUST FIX: 1 · SHOULD TEST: 6 · DOCUMENT: 4)

> **Veredicto upfront:** **PLANO PRECISA DE AJUSTE MÍNIMO** (1 MUST FIX). O risco real único é cache de valores falsy em `useStorage<T>` — bug sutil que poluiria todas as 3 helpers downstream (`useUnstorage`/`useDatabase`/qualquer custom). Fix: trocar `if (cached !== undefined)` por `if (this.#genericClients.has(name))` no T1.1 — 2 linhas. Os 6 SHOULD TEST enxertam-se nos TDD blocks; os 4 DOCUMENT são notas no concept doc de §5.1.

---

## MUST FIX

### EC-1: `useStorage<T>` cacheia `undefined`/`null` retornados pela factory mas usa `!== undefined` como cache-hit check
- **Task afetada:** T1.1
- **Família:** State / Cache semantics
- **Cenário:** Plan §T1.1 Deep Dives mostra `const cached = this.#clients.get(name); if (cached !== undefined) return cached as T`. Mas o Map ARMAZENA `undefined` no `.set(name, client)` se a factory retornar undefined/null. Próxima chamada faz `.get(name)` que retorna `undefined`, falha o `!== undefined`, e a factory é **re-invocada**. Pior: para factory que retorna `null` (mais raro mas válido), o cache armazena `null`, depois `cached !== undefined === true`, então retorna o cached null sem re-invocar — mas como `null` cast pra `T` (e.g., `MongoClient`), o user-facing código quebra de jeito sutil.
- **Impacto:** Para `useStorage<MongoClient>('mongo', () => null /* lazy lazy */)` → segunda chamada retorna `null` mas tipado como `MongoClient` → TypeError no primeiro `.connect()`. Para factory que retorna `undefined` → cache nunca é hit → factory invocada infinitas vezes (memory leak + connection thrashing). Bug propaga para `useUnstorage`/`useDatabase` que dependem do mecanismo.
- **Fix sugerido:** Trocar `if (cached !== undefined) return cached` por `if (this.#genericClients.has(name)) return this.#genericClients.get(name) as T`. 2 linhas. Mesmo padrão usado em `WeakMap`/cache patterns canônicos. Adicionar RED test: factory retorna `null` → segunda chamada retorna mesmo null sem invocar factory de novo.

---

## SHOULD TEST

### EC-2: `useStorage<A>('x', f)` seguido por `useStorage<B>('x', f2)` retorna cached A castado como B (type hole)
- **Task afetada:** T1.1
- **Família:** Type / Cache semantics
- **Cenário:** Plan §T1.1 Edge Cases reconhece o trade-off ("same name reused across `useStorage` types — second factory NOT called; returns cached `Foo` cast as `Bar`"). Mas não tem RED test asserting este behavior — risco de alguém futuro "consertar" sem saber que é intencional.
- **Teste sugerido:** `test_useStorage_second_type_returns_cached_first_type()` — Given `useStorage<{a:number}>('x', () => ({a:1}))` then `useStorage<{b:string}>('x', () => ({b:'fail'}))`, Then second factory NOT invoked AND returned value is `{a:1}` cast as `{b:string}` (runtime: TS hole documented).

### EC-3: BC das mensagens de erro de `usePostgres`/`useRedis` ao refatorar para usar `useStorage` internamente
- **Task afetada:** T1.1
- **Família:** State / Backward compat
- **Cenário:** Plan §T1.1 Deep Dives mostra `usePostgres` refatorada para chamar `useStorage` interno com namespace `__pg:${dbName}`. Mensagens atuais `'Database "X" not configured'` precisam permanecer literais (tests existentes assert via regex). Se a refatoração mover lookup para dentro de useStorage, mensagem pode mudar para algo genérico.
- **Teste sugerido:** `test_usePostgres_error_message_unchanged_after_refactor()` — Given config sem `databases.foo`, When `usePostgres('foo', f)`, Then throws Error matching `/Database "foo" not configured\. Add it to theo\.config\.ts > storage\.databases\./` (EXACT message stability).

### EC-4: `useUnstorage`/`useDatabase` precisam estar marcados/garantidos como server-only (não devem bundle para client)
- **Task afetada:** T3.1, T4.1
- **Família:** Boundary / Bundler
- **Cenário:** Helpers usam `await import('unstorage')`/`await import('db0')` — ambas libs Node-only. Se algum user importa de código que vai pra client bundle (e.g., `app/page.tsx` por engano), Vite TENTA bundle dessas libs → falha de build OU pior, leak de credenciais. O `theokit/server` barrel deveria já enforcement isso, mas vale RED test.
- **Teste sugerido:** `test_useUnstorage_useDatabase_not_in_client_bundle()` — Given a Vite client build that imports something from `theokit/server`, When the build runs, Then `useUnstorage` and `useDatabase` are tree-shaken / excluded / explicitly marked server-only via existing barrel mechanism. Verifies the existing server-only enforcement still works for the new exports.

### EC-5: `useDatabase` connector confusion — user passa a factory `sqlite` em vez de `sqlite({...})`
- **Task afetada:** T4.1
- **Família:** Input / DX
- **Cenário:** `db0` connectors são curried — `import sqlite from 'db0/connectors/better-sqlite3'` exporta uma factory function; user precisa invocar `sqlite({...})` para obter o `Connector`. Mistake comum: passar `sqlite` direto (sem invocar) para `useDatabase('main', sqlite)`. `db0.createDatabase(sqlite)` vai falhar com erro críptico (TypeError no internals).
- **Teste sugerido:** `test_useDatabase_throws_clear_error_when_connector_is_factory_not_invoked()` — Given a factory function (not invoked), When `useDatabase('main', factory)`, Then throws Error containing `'connector'` AND a hint about invoking (`'Did you forget to call the connector factory? e.g., sqlite({...}) instead of sqlite'`). Implementation: runtime check `typeof connector === 'function' && connector.length > 0` heuristic + actionable message.

### EC-6: CHANGELOG entry per task pode exceder 600 chars quando inclui 3 ADR cross-links + concept doc link
- **Task afetada:** T5.2
- **Família:** Doc / Length
- **Cenário:** Plan T5.2 RED test asserts `length < 600`. Mas uma entry como "**`useStorage<T>` + `useUnstorage` + `useDatabase`** — three helpers... See ADR-0008, ADR-0009, ADR-0010, plus `docs/concepts/storage-manager.md`, `docs/concepts/plugins.md`..." pode estourar.
- **Teste sugerido:** `test_changelog_each_storage_entry_under_700_chars()` — relax cap to 700, or split into 3 separate entries (definePlugin / useStorage / unstorage+db0). Preferred: split for readability.

### EC-7: Fixture custom-driver pattern em T3.2 acopla ao shape interno de `unstorage.Driver`
- **Task afetada:** T3.2
- **Família:** Integration / Versioning
- **Cenário:** Fixture cria um `mockRedisDriver` matching `unstorage`'s `Driver` interface. Se unstorage v1.10 → v2.x mudar shape do Driver (que é internal-ish), fixture quebra silenciosamente. Sem assertion de "Driver shape" o fixture pode passar uma versão mas falhar a próxima.
- **Teste sugerido:** `test_fixture_mock_driver_implements_current_Driver_interface()` — Given `mockRedisDriver`, When `expectTypeOf<MockDriver>().toExtend<Driver>()`, Then passes. Pin to the unstorage version declared in peer-deps; if test fails on bump, fixture needs update.

---

## DOCUMENT

### EC-8: Reserved namespace prefixes `__unstorage:` / `__db0:` em `useStorage<T>` map
- **Task afetada:** T3.1, T4.1 (concept doc §5.1)
- **Risco aceito:** Plan usa `__unstorage:${name}` e `__db0:${name}` como cache keys internas no `#genericClients` Map. Se um user explicitamente chama `manager.useStorage('__unstorage:foo', f)` ele colide com o cache de `useUnstorage('foo', driver)`. Probabilidade baixíssima (ninguém usa underscore-prefix por convenção), mas indocumentado.
- **Nota a adicionar em §6 do concept doc:** "**Reserved key prefixes:** Não use `__unstorage:`, `__db0:`, `__pg:`, `__redis:` como `name` em `useStorage<T>` — esses prefixos são reservados internamente pelos helpers `useUnstorage`/`useDatabase`/`usePostgres`/`useRedis`."

### EC-9: `useDatabase` NÃO auto-registra dispose — sqlite em testes paralelos pode reter file lock
- **Task afetada:** T4.1, T4.2
- **Risco aceito:** Plan §T4.1 Deep Dives diz: "doesn't auto-register for drain — db0 dispose semantics vary by connector". Para `:memory:` sqlite isso não importa. Para sqlite em arquivo + testes paralelos (`./test.db`), conexão pode reter lock até GC, atrasando o próximo teste. Custo do auto-register seria pequeno mas exige saber o método correto por connector — não vale a complexidade.
- **Nota a adicionar em §6 do concept doc:** "**Lifecycle:** `useDatabase` não chama `dispose` automaticamente (db0 connectors variam). Para fechar conexões deterministicamente (especialmente em testes paralelos com sqlite-on-disk), registre o hook manualmente: `manager.register({ name: 'db:main', dispose: () => myConnectionClose() })`."

### EC-10: `better-sqlite3` é módulo nativo — build pode falhar em arquiteturas exóticas (ARM custom, musl Alpine)
- **Task afetada:** T4.2 (fixture)
- **Risco aceito:** CI roda em x86_64 GNU/Linux/macOS/Win onde prebuilt binaries do `better-sqlite3` existem. Devs em ARM Linux com glibc não-padrão ou Alpine sem build-tools podem falhar `pnpm install`. Plano não controla isso.
- **Nota a adicionar em fixture README + concept doc:** "**Native module note:** `better-sqlite3` requer prebuilt binaries para sua plataforma. Se `pnpm install` falhar com `node-gyp` errors em Alpine/ARM, instale `python3 make g++` ou use `bun:sqlite` (db0 connector) em ambientes Bun."

### EC-11: Peer-dep version mismatch — user instala major incompatível (`unstorage@2.x` quando TheoKit declara `^1.10`)
- **Task afetada:** T0.4
- **Risco aceito:** `peerDependenciesMeta.optional = true` significa que pnpm não força versão. Se user instala `unstorage@2.0` (futuro hypothetical), pnpm WARN mas instala. Runtime: API breaking changes podem fazer `useUnstorage` quebrar em ways sutis. Detecção runtime (`unstorage.version >= '2'` check) seria possível mas é complexity > damage. UnJS libs historicamente mantém BC entre majors via deprecation paths.
- **Nota a adicionar em concept doc §6:** "**Peer-dep versions:** `unstorage@^1.10` e `db0@^0.3` são pinados nos peer-deps do TheoKit. Ao bumpar para versões majors novas, leia o changelog upstream — TheoKit não detecta mismatches em runtime. Tests no monorepo são tied à versão declarada; bump coordenado é necessário."

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T0.3 | 0 | 0 | 0 | 0 |
| T0.4 | 1 | 0 | 0 | EC-11 |
| T1.1 | 3 | EC-1 | EC-2, EC-3 | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T3.1 | 2 | 0 | EC-4 | EC-8 (compartilhado T3.1/T4.1) |
| T3.2 | 1 | 0 | EC-7 | 0 |
| T4.1 | 3 | 0 | EC-4 (compartilhado), EC-5 | EC-8 (compartilhado), EC-9 |
| T4.2 | 1 | 0 | 0 | EC-10 |
| T5.1 | 0 | 0 | 0 | (EC-8, EC-9, EC-10, EC-11 viram notas aqui) |
| T5.2 | 1 | 0 | EC-6 | 0 |
| **Total** | **11** | **1** | **6** | **4** |

**Veredicto: PLANO PRECISA DE AJUSTE.** O ajuste é mínimo (1 fix de 2 LOC + 1 RED test no T1.1). Os 6 SHOULD TEST enxertam-se diretamente nos TDD blocks das tasks afetadas. As 4 DOCUMENT viram 4 frases na seção §6 do concept doc T5.1.

## Ações sugeridas no plano (incorporação)

1. **T1.1** — **MUST FIX**: trocar implementation snippet de `if (cached !== undefined)` para `if (this.#genericClients.has(name))`. Adicionar RED tests `useStorage_caches_null_return`, `useStorage_caches_undefined_return`, e os EC-2/EC-3 (type hole + BC error messages).
2. **T3.1** — adicionar RED test `useUnstorage_marked_server_only_in_barrel` (EC-4).
3. **T3.2** — adicionar RED test `mock_driver_implements_unstorage_Driver_interface` (EC-7).
4. **T4.1** — adicionar RED test `useDatabase_actionable_error_for_uninvoked_connector_factory` (EC-5) + sharing of EC-4 com T3.1.
5. **T5.1** — adicionar 4 bullets em §6 "Edge cases & gotchas" para EC-8, EC-9, EC-10, EC-11.
6. **T5.2** — relaxar cap de 600→700 chars OU dividir entry em 3 (definePlugin / useStorage / unstorage+db0).

Custo total das incorporações: **~20 LOC de testes + 2 LOC de fix + 4 parágrafos de doc**. Plano fica 100% production-ready.
