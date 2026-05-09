# Edge Case Review — onda-6-build-production

Data: 2026-05-09
Tasks analisadas: 5 (T0.1, T1.1, T2.1, T3.1, T4.1)
Edge cases encontrados: 6 (MUST FIX: 2, SHOULD TEST: 2, DOCUMENT: 2)

## MUST FIX

### EC-1: Static file serving — path traversal vulnerability
- **Task afetada:** T2.1
- **Familia:** Security
- **Cenario:** Request `GET /../../../etc/passwd` ou `GET /..%2F..%2Fetc/passwd`. Se o production server usa `join(distDir, url)` sem sanitizar, pode servir arquivos fora do dist directory.
- **Impacto:** File disclosure vulnerability — server leaks files do sistema.
- **Fix sugerido:** Após resolver o path, verificar que `resolvedPath.startsWith(distDir)`. Se não, retornar 403: `const resolved = resolve(distDir, '.' + url); if (!resolved.startsWith(distDir)) return send403(res)`.

### EC-2: Production loader — `import()` caching entre requests
- **Task afetada:** T0.1
- **Familia:** State
- **Cenario:** `import()` no Node.js cacheia modules. Se dev edita server route e reinicia `theo start`, o module cache do Node pode servir versão antiga. Em dev isso não é problema (Vite ssrLoadModule invalida cache).
- **Impacto:** Mudanças no server code não refletem após restart sem clear do cache.
- **Fix sugerido:** Na `createProductionLoader`, adicionar cache-bust via query string: `import(url + '?t=' + Date.now())`. Ou documentar que `theo start` deve ser reiniciado após mudanças (aceitável para prod).

## SHOULD TEST

### EC-3: Build com .theo/ já existente de build anterior
- **Task afetada:** T1.1
- **Familia:** State
- **Cenario:** Dev roda `theo build` duas vezes. O segundo build deve limpar `.theo/` antes de escrever (Vite `emptyOutDir: true` cuida do `client/` mas não do `server/` se existir).
- **Teste sugerido:** `test_build_cleans_previous() — Given .theo/ from previous build, When build, Then .theo/client/ is fresh (no stale files)`

### EC-4: Production server — request para `/api/` sem routes
- **Task afetada:** T2.1
- **Familia:** Input
- **Cenario:** App não tem `server/routes/` (frontend-only). Toda request a `/api/*` deve retornar 404 JSON, não crash.
- **Teste sugerido:** `test_no_server_routes() — Given app without server/, When GET /api/anything in prod, Then 404 JSON`

## DOCUMENT

### EC-5: tsx como production dependency
- **Task afetada:** D4
- **Familia:** Boundary
- **Risco aceito:** O plano diz que server code é executado via `tsx` em produção. Mas `tsx` é `devDependency` no monorepo. Para deploy real, o user precisa instalar `tsx` como dependency, ou o Theo precisa bundlar server code. Para MVP, documentar que deploy requer `tsx` instalado. Bundling vem em Onda futura.

### EC-6: Graceful shutdown não implementado
- **Task afetada:** T2.1
- **Familia:** Resource
- **Risco aceito:** O plano não menciona SIGINT/SIGTERM handling no production server. Se o server recebe kill signal, conexões em andamento são dropped. Para MVP, aceitável — Node.js encerra naturalmente. Para produção real, graceful shutdown (close server, wait for pending requests) é necessário. Documentar como enhancement futuro.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 1 (EC-2) | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-3) | 0 |
| T2.1 | 2 | 1 (EC-1) | 1 (EC-4) | 1 (EC-6) |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 1 (EC-5) |

**Veredicto: PLANO PRECISA DE AJUSTE** — 2 MUST FIX a incorporar.

### Ajustes necessários:

1. **T2.1:** Adicionar path traversal prevention no static file server (EC-1). Verificar `resolvedPath.startsWith(distDir)`.
2. **T0.1:** Production loader deve ter mecanismo de cache-bust ou documentar reinício necessário (EC-2).
