# Edge Case Review — onda-21-cross-validation-gaps

Data: 2026-05-10
Tasks analisadas: 12 (T0.1–T0.4, T1.1–T1.3, T2.1, T3.1, T4.1, T5.1, T6.1, T7.1, T8.1)
Edge cases encontrados: 14 (MUST FIX: 4, SHOULD TEST: 6, DOCUMENT: 4)

## MUST FIX

### EC-1: Middleware type mismatch — MiddlewareHandler vs runtime invocation
- **Task afetada:** T3.1 (Middleware Composável)
- **Família:** Type
- **Cenário:** `define-middleware.ts:1-4` define `MiddlewareHandler` como `(request: Request, next: (request: Request) => Promise<Response>) => Response | Promise<Response>` (Web Standards). Porém `middleware-runner.ts:24` invoca `mw(req, res, async () => { ... })` passando Node.js `IncomingMessage`, `ServerResponse`, e um callback de 3 argumentos. O tipo público não corresponde ao runtime.
- **Impacto:** User que escreve middleware seguindo o tipo `MiddlewareHandler` receberá `IncomingMessage` em runtime onde espera `Request`. Crash silencioso ou type confusion. Isso já é um bug existente, mas T3.1 vai amplificá-lo ao multiplicar middlewares.
- **Fix sugerido:** Em T3.1, alinhar: ou converter `IncomingMessage` → `Request` antes de chamar middleware (Web Standards), ou alterar `MiddlewareHandler` para aceitar `(req: IncomingMessage, res: ServerResponse, next: () => Promise<void>)`. Recomendo a segunda opção por KISS (match reality). Adicionar migration note.

### EC-2: Manifest filePaths relativos — resolução no loadManifest depende de CWD
- **Task afetada:** T0.1, T0.3
- **Família:** State / Boundary
- **Cenário:** O plano diz que manifest usa filePaths relativos ao `serverDir` e `loadManifest()` resolve para absoluto. Mas `start.ts` hoje usa `const serverDir = resolve(cwd, 'server')`. Se o manifest foi gerado em CI com layout diferente, o `serverDir` no deploy pode ter path diferente. Mais importante: o manifest salva paths do `server/routes/`, mas em produção os módulos são carregados via `createProductionLoader()` que faz `import()` direto no filePath — se esse path não existir no deploy (ex: Vercel/Cloudflare), crash.
- **Impacto:** Deploy em Vercel/Cloudflare falha se server files não estão no mesmo caminho relativo do build.
- **Fix sugerido:** `loadManifest()` deve resolver filePaths relativos ao `serverDir` do runtime (passado como arg), não hardcoded. Adicionar task step: `loadManifest(distDir, serverDir)` — resolve `path.resolve(serverDir, manifestRoute.filePath)`.

### EC-3: busboy multipart sem Content-Type boundary — crash
- **Task afetada:** T1.1
- **Família:** Input
- **Cenário:** Request com `Content-Type: multipart/form-data` mas SEM boundary parameter (header malformado). busboy precisa do boundary para parsing. Se ausente, busboy emite erro assíncrono não tratado.
- **Impacto:** Unhandled error crash, request pendurado sem response.
- **Fix sugerido:** Antes de criar busboy instance, verificar se boundary existe: `if (!contentType.includes('boundary='))` → rejeitar com 400 "Missing multipart boundary". Adicionar como RED test em T1.1.

### EC-4: deepMerge com prototype pollution
- **Task afetada:** T6.1
- **Família:** Security
- **Cenário:** `deepMerge()` implementada ingenuamente pode ser vulnerável a prototype pollution se o env config contiver `__proto__` ou `constructor` como chave. Ex: `{ "__proto__": { "admin": true } }`.
- **Impacto:** Prototype pollution → potencial RCE se config é usada em contextos inseguros.
- **Fix sugerido:** No loop de deepMerge, skip keys `__proto__`, `constructor`, `prototype`: `if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue`.

## SHOULD TEST

### EC-5: Manifest gerado com .ts extensions — produção usa .js
- **Task afetada:** T0.1, T0.3
- **Teste sugerido:** `test_manifest_filePath_extension_in_prod()` — Given manifest gerado com filePath `routes/health.ts`, When loadManifest() em produção, Then filePath deve ser ajustado para `.js` se `.ts` não existir OU o loader deve lidar com isso transparentemente.

### EC-6: Multipart com filename contendo path traversal
- **Task afetada:** T1.1
- **Teste sugerido:** `test_multipart_filename_path_traversal()` — Given multipart file com filename `../../../etc/passwd`, When parseRequestBody(), Then filename é sanitizado (basename only, sem diretórios).

### EC-7: Catch-all com URL-encoded slashes
- **Task afetada:** T2.1
- **Teste sugerido:** `test_catchall_url_encoded_slash()` — Given catch-all route `/api/docs/:...slug`, When URL is `/api/docs/a%2Fb`, Then slug captura `a%2Fb` como string literal (não decodifica para `a/b` que mudaria o matching).

### EC-8: Middleware diretório com .js e .ts misturados
- **Task afetada:** T3.1
- **Teste sugerido:** `test_middleware_dir_mixed_extensions()` — Given server/middleware/ com `01-cors.ts` e `01-cors.js`, When scanMiddlewares(), Then prioriza `.ts` sobre `.js` (ou erro por conflito).

### EC-9: superjson com Response objects
- **Task afetada:** T5.1
- **Teste sugerido:** `test_superjson_skips_response_objects()` — Given route handler que retorna `new Response(...)`, When serialization='superjson', Then Response é streamed diretamente (não passa por superjson — already handled em execute.ts:166-184).

### EC-10: Channel protocol — mensagem JSON inválida
- **Task afetada:** T8.1
- **Teste sugerido:** `test_channel_invalid_json_message()` — Given channel WS connection, When client sends "not json", Then connection não crasheia, log warning, mensagem ignorada.

## DOCUMENT

### EC-11: busboy armazena files em memória — OOM com uploads grandes
- **Risco aceito:** O plano usa buffer in-memory para files. Upload de arquivo de 500MB causará OOM. Isso é aceitável para MVP porque: (1) maxFileSize default é 10MB, (2) disk streaming é futuro enhancement, (3) documentar o limite é suficiente.

### EC-12: ChannelManager in-memory — state perdido em restart
- **Risco aceito:** ChannelManager usa Map in-memory. Restart do server limpa todas as subscriptions. Aceitável porque: (1) WS connections já caem no restart, (2) Redis backing é YAGNI para MVP, (3) client deve reconectar e resubscribar automaticamente.

### EC-13: Levenshtein O(n*m) em produção
- **Risco aceito:** Levenshtein roda em 404s comparando contra todas as routes. Com 100 routes, é ~100 comparações de strings curtas — microsegundos. Não vale otimizar com BK-tree para este volume.

### EC-14: Config env merge não suporta `defineConfig()` wrapper no env file
- **Risco aceito:** Se user exporta `export default defineConfig({...})` no env file, funciona (identity function). Se exporta plain object `export default { port: 8080 }`, também funciona. Não precisa de tratamento especial — `defineConfig` é identity.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 2 | 1 (EC-2) | 1 (EC-5) | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T0.3 | 1 | 1 (EC-2) | 0 | 0 |
| T0.4 | 0 | 0 | 0 | 0 |
| T1.1 | 3 | 1 (EC-3) | 2 (EC-6) | 1 (EC-11) |
| T1.2 | 0 | 0 | 0 | 0 |
| T1.3 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 0 | 1 (EC-7) | 0 |
| T3.1 | 2 | 1 (EC-1) | 1 (EC-8) | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T5.1 | 1 | 0 | 1 (EC-9) | 0 |
| T6.1 | 2 | 1 (EC-4) | 0 | 1 (EC-14) |
| T7.1 | 1 | 0 | 0 | 1 (EC-13) |
| T8.1 | 2 | 0 | 1 (EC-10) | 1 (EC-12) |

**Veredicto:** PLANO PRECISA DE AJUSTE — 4 MUST FIX items que devem ser incorporados antes da implementação.
