# Edge Case Review — onda-22-cross-validation-reference-gaps

Data: 2026-05-11
Tasks analisadas: 9 (T0.1, T0.2, T1.1, T2.1, T3.1, T4.1, T4.2, T5.1, T6.1, T7.1)
Edge cases encontrados: 11 (MUST FIX: 3, SHOULD TEST: 5, DOCUMENT: 3)

## MUST FIX

### EC-1: toWebRequest body consumido duas vezes — bridge lê body, depois handler tenta ler de novo
- **Task afetada:** T0.1, T0.2
- **Família:** Resource / State
- **Cenário:** `toWebRequest` cria um `Request` com body stream do `IncomingMessage`. O middleware lê o body (ex: logging). Depois, `executeRoute` tenta `parseRequestBody(req)` no mesmo `IncomingMessage` — mas o stream já foi consumido pelo middleware via bridge.
- **Impacto:** Body é `undefined` no handler. POST/PUT/PATCH quebram silenciosamente para qualquer route com middleware que leia o body.
- **Fix sugerido:** `toWebRequest` NÃO deve consumir o IncomingMessage stream. Usar `Request.clone()` se o middleware precisa ler, ou buffer o body uma vez e reusar. A solução mais simples: ler o body inteiro antes de criar o Request (buffer completo) e criar o Request com o buffer. O `parseRequestBody` em `execute.ts` também precisa usar o body bufferizado.

### EC-2: middleware-runner chama middleware com `(req, res, next)` — 3 call sites além de `middleware-runner.ts`
- **Task afetada:** T0.2
- **Família:** Integration / Breaking change
- **Cenário:** `executeRoute` (execute.ts:97), `executeAction` (action-execute.ts:36), e `start.ts:131/164` todos chamam `runMiddlewareAndContext(req, res, ...)`. O plano menciona atualizar `middleware-runner.ts` mas NÃO menciona `cli/commands/start.ts` que é o servidor de produção.
- **Impacto:** Dev server funciona (Vite middleware), mas `theo start` (produção) fica quebrado se a interface de `runMiddlewareAndContext` mudar.
- **Fix sugerido:** Adicionar `cli/commands/start.ts` à lista de "Files to edit" de T0.2. A interface de `runMiddlewareAndContext` não muda externamente (continua recebendo `IncomingMessage`/`ServerResponse`), a bridge é interna. Mas VERIFICAR que `start.ts` continua funcionando após a mudança.

### EC-3: Route group conflict detection não cobre layouts conflitantes
- **Task afetada:** T4.1
- **Família:** State / Logic
- **Cenário:** `app/(auth)/layout.tsx` e `app/(public)/layout.tsx` ambos definem layout para o path `/`. Se ambos têm `page.tsx` na raiz, há conflito de page (plano cobre). Mas se `(auth)/about/page.tsx` e `(public)/about/page.tsx` existem, e cada group tem seu layout, o router precisa decidir qual layout usar para `/about` — e não há regra definida.
- **Impacto:** Comportamento indefinido na geração do route manifest. Pode gerar dois layouts para o mesmo path.
- **Fix sugerido:** A detecção de conflito de T4.1 deve cobrir NÃO SÓ pages conflitantes entre groups, mas qualquer route file (page, layout, error, loading) que resolve pro mesmo path. Se detectado, erro claro: "Conflicting route files in groups (auth) and (public) for path /about".

## SHOULD TEST

### EC-4: Sec-Fetch-Site com valor inesperado/malformado
- **Task afetada:** T1.1
- **Teste sugerido:** `test_csrf_unknown_sec_fetch_site_value` — Given Sec-Fetch-Site: "foobar" (valor não-spec), When validateCsrf(), Then fallback para X-Theo-Action (tratar unknown como ausente, não como cross-site)

### EC-5: toWebRequest com URL que tem caracteres especiais (unicode, encoded)
- **Task afetada:** T0.1
- **Teste sugerido:** `test_toWebRequest_unicode_url` — Given req.url = "/api/users?name=%E4%B8%AD%E6%96%87", When toWebRequest(), Then Request.url preserva encoding corretamente

### EC-6: Route group com nome contendo caracteres especiais — `(auth-v2)`, `(marketing.old)`
- **Task afetada:** T4.1
- **Teste sugerido:** `test_route_group_special_chars` — Given app/(auth-v2)/page.tsx, When scanRoutes(), Then path is '/' e group funciona normalmente. Também testar `(.)` e `(..)` que são sintaxe de intercepting routes no Next.js — Theo deve tratar como group normal.

### EC-7: defineAction output com schema que tem .transform() ou .refine()
- **Task afetada:** T3.1
- **Teste sugerido:** `test_define_action_output_with_transform` — Given output: z.string().transform(s => s.toUpperCase()), When InferActionOutput inferred, Then tipo é `string` (output de transform, não input). Zod transforms produzem tipos diferentes para input vs output — `z.infer` usa output por padrão, o que é correto aqui.

### EC-8: Route-level middleware com async que rejeita (throw)
- **Task afetada:** T5.1
- **Teste sugerido:** `test_route_middleware_async_rejection` — Given route middleware that throws Error("auth failed"), When request arrives, Then 500 returned com error message, não unhandled promise rejection

## DOCUMENT

### EC-9: Web bridge performance overhead
- **Risco aceito:** Converter `IncomingMessage → Request → Response → ServerResponse` a cada request com middleware adiciona overhead de serialização. Para o MVP, isso é aceitável — frameworks como Remix fazem o mesmo. Se profiling mostrar gargalo, otimizar com lazy conversion.

### EC-10: global-error.tsx não funciona com SSR streaming
- **Risco aceito:** O `generateEntryServer` usa `renderToPipeableStream`. Se o root layout falhar durante SSR, o global-error não pode ser "injetado" no stream já iniciado. Isso é uma limitação conhecida do React SSR — Next.js resolve com um shell HTML mínimo que carrega client-side. Para o Theo MVP, global-error funciona apenas no client.

### EC-11: Middleware directory vs single file detection com .js extensão
- **Risco aceito:** `middleware-runner.ts:18` verifica `existsSync(join(serverDir, 'middleware.ts'))` — hardcoded `.ts`. Em produção (build), os arquivos são `.js`. O `start.ts` provavelmente resolve isso de outra forma. Não é problema do plano atual, mas vale verificar que o build pipeline transpila corretamente.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 3 | 1 (EC-1) | 1 (EC-5) | 1 (EC-9) |
| T0.2 | 2 | 1 (EC-2) | 0 | 1 (EC-11) |
| T1.1 | 1 | 0 | 1 (EC-4) | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T3.1 | 1 | 0 | 1 (EC-7) | 0 |
| T4.1 | 2 | 1 (EC-3) | 1 (EC-6) | 0 |
| T4.2 | 1 | 0 | 0 | 1 (EC-10) |
| T5.1 | 1 | 0 | 1 (EC-8) | 0 |
| T6.1 | 0 | 0 | 0 | 0 |
| T7.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 3 MUST FIX items devem ser incorporados antes da implementação.

### Ajustes Necessários

1. **EC-1 (T0.1):** Adicionar ao Deep Dive de `toWebRequest`: "Body DEVE ser bufferizado uma única vez. O `IncomingMessage` stream é lido para um Buffer, e o `Request` é criado com esse buffer. O mesmo buffer é disponibilizado para `parseRequestBody` via propriedade no req (ex: `req._theoBody`)." Adicionar teste RED para body consumido duas vezes.

2. **EC-2 (T0.2):** Adicionar `packages/theo/src/cli/commands/start.ts` à lista de "Files to edit" com nota: "Verificar que chamadas a `runMiddlewareAndContext` continuam funcionando após mudança interna da bridge." Adicionar teste de integração para `start.ts`.

3. **EC-3 (T4.1):** Expandir o teste `test_route_group_conflict_detected` para cobrir conflitos de QUALQUER route file entre groups, não só pages. Atualizar Deep Dive com regra: "Conflito = qualquer dois groups produzindo o mesmo path com qualquer route file (page, layout, error, loading)."
