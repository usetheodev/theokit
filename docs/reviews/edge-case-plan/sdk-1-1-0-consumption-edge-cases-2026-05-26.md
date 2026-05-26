# Edge Case Review — `sdk-1-1-0-consumption`

**Data:** 2026-05-26
**Plano:** `docs/plans/sdk-1-1-0-consumption-plan.md` v1.0 (1286 linhas, 11 phases, 14 tasks)
**Tasks analisadas:** 14 (T0.1, T1.1, T2.1, T3.1, T4.1, T5.1, T6.1, T6.2, T7.1, T8.1, T8.2, T9.1, T9.2, T10.1) + Phase 11
**Edge cases encontrados:** 17 (**MUST FIX: 3** · **SHOULD TEST: 9** · **DOCUMENT: 5**)

---

## MUST FIX

### EC-1: `instanceof AbortSignal` falha cross-realm
- **Task afetada:** T3.1
- **Família:** Type / Boundary
- **Cenário:** O algoritmo proposto faz `req.signal instanceof AbortSignal`. Em Node 18 com polyfill (`abort-controller` npm), undici, ou Edge runtimes que carregam AbortSignal de realm diferente, o `instanceof` retorna `false` mesmo com signal válido. Fallback cai no path Node `req.on('close')` — pode dar undefined se `req` não tem `on` também.
- **Impacto:** Signal threading silenciosamente quebra em ambientes mixed-realm. Browser disconnect não cancela LLM call → cobrança de tokens permanece (o gap #5 inteiro do handoff fica não-resolvido em prod).
- **Fix sugerido:** Substituir `req.signal instanceof AbortSignal` por duck-type: `req.signal !== null && typeof req.signal === 'object' && 'aborted' in req.signal && typeof (req.signal as { addEventListener?: unknown }).addEventListener === 'function'`. Adicionar 1 RED test cobrindo o caso "signal from polyfill realm".

### EC-2: `conversationId` com `:` ou `*` corrompe chave Redis
- **Task afetada:** T9.2
- **Família:** Security / Input
- **Cenário:** RedisConversationStorage usa `agent:conversation:<id>` como chave. Se o `conversationId` vier de cookie/URL e contiver `:` (válido em UUID? não, mas o `readCookie` valida o regex `^[a-zA-Z0-9_-]{1,128}$` no framework — mas o storage adapter NÃO revalida). Se um caller bypass o framework (e.g., chat.ts customizado, ou um job de manutenção), pode injetar `id="*"` → `agent:conversation:*` → `LRANGE` retorna `[]` (Redis não expande globs em GET/LRANGE), MAS `KEYS agent:conversation:*` em outro contexto vê tudo.
- **Impacto:** O risco real é menor que pareceu (LRANGE/RPUSH não expandem globs), mas o key namespace pode colidir se um id legítimo contém `*` ou whitespace. Possível corrupção silenciosa.
- **Fix sugerido:** No construtor da RedisConversationStorage, validar `conversationId` com o mesmo regex do framework: `if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('invalid conversationId')`. Adicionar RED test `test_redis_rejects_id_with_colon`.

### EC-3: Race condition na config lazy do registry
- **Task afetada:** T6.1
- **Família:** Timing / State
- **Cenário:** Duas requests concorrentes chegam no cold start. Ambas executam `if (!configured) configure()` antes do flag flip. `configure()` é chamado 2x. Plan afirma "configure called exactly 1x" como teste — mas se a implementação for `if (!flag) { configure(); flag = true }` sem locking, a race acontece.
- **Impacto:** Em SDKs onde `configure()` não é idempotente, segunda chamada pode resetar contadores LRU OU lançar. Mesmo se idempotente, o invariante documentado é violado → confusão futura.
- **Fix sugerido:** Flip do flag **antes** do configure: `if (!configuring) { configuring = true; configure(config) }`. Synchronous flag flip dispensa lock. RED test deve exercer concorrência: `Promise.all([handler(), handler(), handler()])` e assertar spy 1x.

---

## SHOULD TEST

### EC-4: Version check `starts with "1.1."` é frágil
- **Task afetada:** T0.1
- **Teste sugerido:** `test_sdk_version_satisfies_caret_range` — Given `package.json.version`, When checked against `semver.satisfies(version, '^1.1.0')`, Then true. Aceita 1.1.x, 1.2.x, 1.99.x — rejeita 1.0.x e 2.0.x. Usar `semver` lib (já transitive).

### EC-5: Sync contract test só checa uma direção
- **Task afetada:** T2.1
- **Teste sugerido:** `test_theokit_storage_assignable_to_sdk_adapter` — Given TheoKit `ConversationStorageLike` value, When atribuído a `import('@usetheo/sdk').ConversationStorageAdapter` variable, Then sem erro de tipo. Garante que se TheoKit's interface drift (e.g., adiciona método required), o teste pega. Já existe a direção SDK→TheoKit; falta TheoKit→SDK.

### EC-6: Type guard requer `'provider' in err` — falha em SDK partial
- **Task afetada:** T4.1
- **Teste sugerido:** `test_type_guard_matches_minimal_agent_run_error` — Given `new AgentRunError({ code: 'auth' })` sem `provider`, When `isAgentRunError` chamado, Then `true`. Reduzir o guard para checar só `'code' in err && typeof err.code === 'string'` (provider é opcional na surface da SDK em casos como timeout local).

### EC-7: `AgentRunErrorCode` local union drifta da SDK
- **Task afetada:** T1.1, T4.1
- **Teste sugerido:** `test_agent_run_error_code_accepts_unknown_string_for_forward_compat` — Given `const c: AgentRunErrorCode = 'context_too_large'` (hipoteticamente novo código), When typecheck, Then aceito. Solução: declarar como `type AgentRunErrorCode = 'auth' | 'rate_limit' | ... | 'unknown' | (string & {})` — autocompletion preserva enquanto futuros códigos não quebram TS.

### EC-8: Map de start-timestamps em `trackAgentTools` cresce sem bound
- **Task afetada:** T5.1
- **Teste sugerido:** `test_orphan_starts_pruned_after_ttl` — Given `onToolStart('a')` chamado mas sem `onToolEnd`/`onToolError` correspondente por 5 minutos (fake timer), When `onToolStart('b')` chamado novamente (próximo tool), Then entrada `'a'` foi pruned do Map. Fix: cada `onToolStart` pruna entradas com `startedAt < now - 5*60_000` (loop simples sobre Map.entries).

### EC-9: Adapter externo `UsageStorageAdapter` sem `kind` field não-testado
- **Task afetada:** T5.1
- **Teste sugerido:** `test_external_adapter_without_kind_field_backward_compat` — Given um adapter mock que NÃO tem `kind` na record (legacy), When `trackAgentRun` chamado, Then storage.record recebe `kind: 'llm'` (default aplicado). Caller code externo segue funcionando sem update.

### EC-10: Deprecation warning de `gcAgentRegistry` log-spam por call
- **Task afetada:** T7.1
- **Teste sugerido:** `test_gc_agent_registry_warns_only_once_per_process` — Given gcAgentRegistry chamado 100x no mesmo processo, When console.warn spy inspecionado, Then `expect(warnSpy).toHaveBeenCalledTimes(1)`. Use módulo-scoped flag `warnedOnce`.

### EC-11: `pg-mem` pode não suportar atômico `messages || $msg`
- **Task afetada:** T9.1
- **Teste sugerido:** `test_pg_mem_jsonb_concat_works` — preflight smoke. Se `pg-mem` falhar no `||` operator (versões antigas têm cobertura JSONB limitada), fallback é UPDATE com `messages = $newArray` (RMW). Add note no plano: documenter pg-mem version mínima OU fallback path.

### EC-12: `ioredis-mock` TTL semantics divergem do Redis real
- **Task afetada:** T9.2
- **Teste sugerido:** `test_redis_mock_ttl_with_fake_timers` — verify `vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000)` causa key expiration no mock. Se mock não suporta fake-time-based expire, marcar TTL test como skip + add nota: validação real só em `REDIS_URL` env.

---

## DOCUMENT

### EC-13: SIGTERM evicta mid-stream — confiar em LB drain
- **Risco aceito:** Standard K8s pattern: Load Balancer remove o pod do roteamento ANTES do SIGTERM (preStop hook + terminationGracePeriodSeconds=30). Por isso, no momento do SIGTERM, novas requests já não chegam; in-flight pode prosseguir até o force-kill. Adicionar drain logic na framework duplica o que K8s/Vercel fazem. **Doc em T6.2**: nota explicando "rely on platform-level drain; SIGTERM evicts immediately".

### EC-14: `Agent.registry.configure()` chamada manual conflita com lazy
- **Risco aceito:** Se o user faz `Agent.registry.configure()` antes de uma request hit, e DEPOIS o lazy fire faz `configure()` de novo com config do `theo.config.ts`. Resultado: config do framework wins. **Doc em T6.1**: "Programmatic configure() is supported but TheoKit's lazy call (driven by theo.config.ts) overrides it. Use theo.config.ts for production."

### EC-15: `error.message` da SDK é trusted-no-secret
- **Risco aceito:** O plano explicitamente impede leak de `providerError` via SSE wire (RED test). Mas `error.message` da SDK é serializado sem sanitização — SDK é responsável por não colocar secrets ali. **Doc em T4.1**: "Invariant: `@usetheo/sdk` MUST NOT include API keys, raw tokens, or PII in AgentRunError.message. SSE wire propagates message verbatim."

### EC-16: `callId` collision (SDK reuse)
- **Risco aceito:** Plano menciona "multiple onToolStart with same callId → use the last one (defensive)". Mas se SDK reusa `callId` por bug (não deveria — UUID-shaped), nosso Map sobrescreve. Se a SDK fixa o bug, comportamento muda. **Doc em T5.1**: "callId uniqueness é contrato da SDK. TheoKit defends against duplicate-start but does not retry."

### EC-17 (Combined): `maxAgents` baixo + concurrent chats = mid-stream eviction
- **Risco aceito:** Se user setar `maxAgents: 1` e tiver 2 conversation ids simultâneas, a chegada do segundo `getOrCreate` evicta o agent do primeiro → request 1 fica órfã (Agent disposed mid-stream → SDK aborta com `code:'aborted'`). **Doc em T6.1**: "maxAgents MUST be ≥ max-concurrent-conversations. Default 100 covers indie/small-team; tune up for high-traffic."

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|:-----:|:--------:|:-----------:|:--------:|
| T0.1 | 1 | 0 | 1 (EC-4) | 0 |
| T1.1 | 1 | 0 | 1 (EC-7) | 0 |
| T2.1 | 1 | 0 | 1 (EC-5) | 0 |
| T3.1 | 1 | 1 (EC-1) | 0 | 0 |
| T4.1 | 3 | 0 | 2 (EC-6, EC-7 shared) | 1 (EC-15) |
| T5.1 | 4 | 0 | 2 (EC-8, EC-9) | 1 (EC-16) |
| T6.1 | 3 | 1 (EC-3) | 0 | 2 (EC-14, EC-17) |
| T6.2 | 1 | 0 | 0 | 1 (EC-13) |
| T7.1 | 1 | 0 | 1 (EC-10) | 0 |
| T8.1 | 0 | 0 | 0 | 0 |
| T8.2 | 0 | 0 | 0 | 0 |
| T9.1 | 1 | 0 | 1 (EC-11) | 0 |
| T9.2 | 2 | 1 (EC-2) | 1 (EC-12) | 0 |
| T10.1 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — incorporar 3 MUST FIX antes de iniciar implementação. 9 SHOULD TEST viram tests adicionais em RED phase. 5 DOCUMENT viram bullets em JSDoc / inline notes.

---

## Mudanças propostas ao plano

Adicionar uma seção `## Edge cases incorporated (EC-1..EC-17)` no plano linkando este review, e atualizar os blocos TDD afetados:

### T3.1 (EC-1)
RED adicional:
```
RED:  test_signal_threading_cross_realm() — Given req.signal from a polyfilled AbortController (not native), When deriveSignal called, Then returns the signal (instanceof check bypassed by duck-type)
```
Algorithm muda para duck-type check (substituir `instanceof AbortSignal` por `'aborted' in req.signal && typeof req.signal.addEventListener === 'function'`).

### T6.1 (EC-3)
RED adicional:
```
RED:  test_lazy_configure_no_race_under_concurrency() — Given module just loaded, When Promise.all([request, request, request]) hits handler, Then Agent.registry.configure called exactly 1x (spy)
```
Algorithm muda: flag flip SÍNCRONO antes do configure (`configuring = true; configure(config)` em vez de `configure(config); configuring = true`).

### T9.2 (EC-2)
RED adicional:
```
RED:  test_redis_storage_rejects_conversation_id_with_colon() — Given new RedisConversationStorage().appendMessage('a:b', msg), When called, Then throws Error matching /invalid conversationId/
RED:  test_redis_storage_rejects_conversation_id_with_wildcard() — Given id 'a*', When called, Then throws
```
Construtor da RedisConversationStorage valida regex do framework.

### Tests adicionais SHOULD TEST (9 testes)
Incorporar nos respective TDD blocks dos tasks correspondentes (EC-4 em T0.1, EC-5 em T2.1, EC-6/EC-7 em T4.1, EC-8/EC-9 em T5.1, EC-10 em T7.1, EC-11 em T9.1, EC-12 em T9.2).

### Notes JSDoc DOCUMENT (5 notes)
- T4.1: invariant "SDK error.message is trusted to not leak secrets"
- T5.1: "callId uniqueness is SDK contract; TheoKit defends but does not retry"
- T6.1: "Programmatic configure() is overridden by theo.config.ts lazy fire"
- T6.1: "maxAgents MUST be ≥ max-concurrent-conversations (default 100 ok for indie)"
- T6.2: "SIGTERM evicts immediately; rely on platform-level LB drain"

---

## Próximo passo

Atualizar `docs/plans/sdk-1-1-0-consumption-plan.md` com:
- Os 3 MUST FIX inline nos TDD/Algorithm/Tasks blocks correspondentes (EC-1, EC-2, EC-3)
- Os 9 SHOULD TEST como REDs adicionais nas tasks afetadas
- Os 5 DOCUMENT como JSDoc notes

Após o ajuste, **plano vira v1.1** com referência a este review em uma nota "edge-cases incorporated". Aí sim pronto para implementação.
