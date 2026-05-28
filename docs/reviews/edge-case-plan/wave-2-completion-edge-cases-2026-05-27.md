# Edge Case Review — wave-2-completion

Data: 2026-05-27
Tasks analisadas: 14 (T0.1, T0.2, T1.1, T1.2, T2.1, T2.2, T2.3, T3.1, T4.1, T4.2, T4.3, T5.1, T6.1, T6.2)
Edge cases encontrados: 12 (MUST FIX: 3, SHOULD TEST: 5, DOCUMENT: 4)

**Veredicto:** PLANO PRECISA DE AJUSTE — 3 MUST FIX devem entrar antes da implementação começar. Nenhum exige nova arquitetura; todos resolvem com mudança em ≤1 frase do plan ou um teste adicional.

---

## MUST FIX

### EC-1: `ViteDevServer.close()` override é frágil (mutate vs wrap)

- **Task afetada:** T1.1
- **Família:** State / Lifecycle
- **Cenário:** O plan diz "extend return shape OR mutate `server.close` to also stop services". Mutate (`server.close = wrapped`) quebra com qualquer upgrade Vite que mude a assinatura de `close()`. Extend return shape gera tipo divergente do `ViteDevServer` oficial — call sites que esperam o tipo Vite quebram.
- **Impacto:** Wave 2 upgrades Vite → dev pode parar de stopar services no Ctrl+C → orphan child processes (já é EC-7 do plano v1.1 que se REIVINDICA mitigado pelo `process.on('SIGINT')`).
- **Fix sugerido:** Em T1.1, prescrever explicitamente: **NÃO mutate `server.close`**. Use `server.httpServer?.on('close', () => orchestration.stop())` que é Node-native event API, estável across Vite versions. A propriedade `server.httpServer` é `Server | null` na API pública do Vite.

### EC-2: HMR / repeated `startDevServer` causa port collision em testes

- **Task afetada:** T1.1 + T4.x + T5.1
- **Família:** State / Resource
- **Cenário:** Fixtures usam portas fixas (8101, 8102, 8103, 8104). Testes que invocam `startDevServer(FIXTURE)` mais de uma vez na mesma run (por exemplo, Vitest reload + Playwright reload) tentam re-spawn na porta já bindada — child process exits com EADDRINUSE → healthcheck timeout → test fail.
- **Impacto:** Flakiness em CI quando suítes paralelas tocam fixtures que compartilham porta. Já vimos pattern similar em `theoui-autoinject` (que usou `port: 0` para auto-allocate).
- **Fix sugerido:** Em T4.1/T4.2/T4.3, **trocar portas fixas por `port: 0` (auto-allocate) OU criar um `services-port-allocator.ts` helper que retorna a próxima porta livre via `net.createServer` probe**. Documentar a escolha em D4 (D4 atualmente fala "real fixtures" — adicionar uma frase sobre port allocation). Pragmático: começar com `port: 0` na fixture's `theo.config.ts`. O test reads the bound port after spawn.

### EC-3: Fixture vs template drift em `services/agent-python/main.py`

- **Task afetada:** T4.1 + T4.2 + T4.3
- **Família:** State / Maintenance
- **Cenário:** Cada fixture copia (ou re-implementa) o `main.py` do `packages/create-theo/templates/services/agent-python/`. Se alguém atualiza a template (por exemplo, adiciona um header `X-Theokit-Service`), as fixtures não atualizam → divergência silenciosa → testes passam contra código obsoleto.
- **Impacto:** Cross-validation (T6.1) não detecta porque os arquivos são "diferentes" intencionalmente. Dogfood detecta tarde (cenário Python sidecar falha porque template mudou shape e fixture ainda usa shape antigo).
- **Fix sugerido:** Em T4.1/T4.2/T4.3, prescrever **fixtures referenciam a template via symlink ou copy script**. Pragmático mais simples: T4.1 task #1 explicitamente diz "copy from packages/create-theo/templates/services/agent-python/ — adicione drift-check test em T4.1 que diff fixture vs template e falha se divergirem". Test: `tests/integration/fixture-drift-check.test.ts` reads both files, compares.

---

## SHOULD TEST

### EC-4: Caddyfile `tracing` directive deve ser validado contra `caddy:2.11` real

- **Task afetada:** T2.1 (compose+Caddyfile emission)
- **Teste sugerido:** `test_caddyfile_validates_against_caddy_211` — Given the Caddyfile emitted by `generateCaddyfile` for a fixture, When `docker run --rm -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2.11 caddy validate --config /etc/caddy/Caddyfile` is run, Then exit 0. (CI may skip if Docker not available; document.) Verified locally: `docker run --rm caddy:2.11 caddy list-modules | grep tracing` shows `http.handlers.tracing` IS bundled.

### EC-5: Hey API plugin fires fetch BEFORE healthcheck-gated readiness

- **Task afetada:** T3.1
- **Teste sugerido:** `test_typed_client_plugin_waits_for_healthcheck` — Given a fixture with a service whose openapi URL returns 200 only after 1s, When `startDevServer` boots (which calls `orchestrateDev` per T1.1) AND `services-typed-client` plugin's `configureServer` fires, Then `generateTypedClient` fetch succeeds (not gets a 503/connection-refused). Verifies that T1.1's healthcheck gating runs BEFORE T3.1's `configureServer`. If order is wrong, test fails with "fetch failed before service ready".

### EC-6: `clients/*.ts` not gitignored → diff noise

- **Task afetada:** T3.1 (Vite plugin generates `clients/<name>.ts`)
- **Teste sugerido:** `test_scaffolder_adds_clients_to_gitignore` — Given `npx create-theokit my-app --backend python`, When the scaffolder runs, Then the generated `my-app/.gitignore` contains `clients/` OR a Hey API generation comment header in `clients/*.ts` warns "DO NOT COMMIT — autogenerated". Trace this back to `packages/create-theo/src/scaffold-services.ts` adding `.gitignore` line.

### EC-7: Playwright spec stdout capture mechanism is unspecified

- **Task afetada:** T5.1
- **Teste sugerido:** `test_e2e_spec_captures_service_stdout` — Given the Playwright spec runs `startDevServer`, When a request hits the Python service via the proxy, Then `serviceStdout` array (declared in spec scope) contains a line with `traceparent`. The spec MUST wire a custom `write` callback into the log-merger (via a test-only `LogMergerOptions.write` injection point — currently `createLogMerger` accepts `write`, so the path exists). Spec's beforeAll injects a capturing write.

### EC-8: `pnpm-workspace.yaml` pre-registration may not tolerate missing fixtures in all pnpm versions

- **Task afetada:** T0.2
- **Teste sugerido:** `test_pnpm_install_tolerates_missing_fixtures` — Given the 3 fixture paths are in `pnpm-workspace.yaml` but the directories don't exist, When `pnpm install --frozen-lockfile=false` runs, Then exit 0 (pnpm warns but proceeds; verified for pnpm 9.x). If pnpm 10+ behavior differs, fallback: add fixtures with `package.json` stub BEFORE workspace registration. Add this as inline verification before proceeding to Phase 1.

---

## DOCUMENT

### EC-9: `.theo/` files are build artifacts; users must NOT edit

- **Risco aceito:** Wave 2 emits `.theo/services.json`, `.theo/docker-compose.yml`, `.theo/Caddyfile`. Users may edit them manually thinking they're config — gets overwritten next `pnpm build`. Already standard TheoKit convention but not stated in `docs/concepts/services.md`. Add a one-line section in T6.2 dogfood concept doc update: "Anything under `.theo/` is regenerated each build. Edit `theo.config.ts` or service code, not these artifacts."

### EC-10: Adapter rejection message is generic for Vercel/Cloudflare

- **Risco aceito:** Per the 2026-05-27 TheoCloud-first refocus, `assertServicesUnsupported('vercel', ...)` says "use `--target node` (local) or TheoCloud (Wave 3)". Vercel-Services-aware users may want specific guidance ("Vercel Services 2026 wire-up is deferred — a fresh ADR with demand evidence is required"). Pragmatically add this nuance ONLY in `docs/concepts/services.md` troubleshooting section, not in the runtime error message (keeps the helper uniform).

### EC-11: Cross-validation "APROVADO COM RESSALVAS" requires manual review

- **Risco aceito:** T6.1 may emit `APROVADO COM RESSALVAS`. The plan says "fix CRITICALs then proceed", but distinguishing CRITICAL from non-CRITICAL inside a cross-validation report is a human judgment call. Document expectation in T6.1: "If verdict is COM RESSALVAS, owner reads report; CRITICAL items become blockers; others become DOCUMENT memos for follow-up." Not automatable.

### EC-12: Python+uv prerequisite for Playwright spec is CI-environment-dependent

- **Risco aceito:** T5.1 explicitly skips when Python absent. CI matrices that don't include Python (e.g., a hypothetical Bun-only runner) will skip silently. Coverage gap acceptable — the unit + integration tests cover the helpers exhaustively; Playwright is the cherry on top. Document in T5.1 README/spec header: "skipped on runners without Python 3.11+ in PATH". Real validation happens on the dev's machine + CI matrix that includes Python.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 1 | 0 | 1 | 0 |
| T1.1 | 2 | 1 | 0 | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 0 | 1 | 1 (EC-9 shared) |
| T2.2 | 1 | 0 | 0 | 1 (EC-10) |
| T2.3 | 0 | 0 | 0 | 0 |
| T3.1 | 2 | 0 | 2 | 0 |
| T4.1 | 1 | 1 (EC-3 shared) | 0 | 0 |
| T4.2 | 1 | 1 (EC-3 shared) | 0 | 0 |
| T4.3 | 1 | 1 (EC-3 shared) | 0 | 0 |
| T5.1 | 1 | 0 | 1 | 1 (EC-12) |
| T6.1 | 1 | 0 | 0 | 1 (EC-11) |
| T6.2 | 0 | 0 | 0 | 0 |
| **port collisions across fixtures (EC-2)** | 1 | 1 | 0 | 0 |
| **Totals** | **12** | **3** | **5** | **4** |

**Veredicto: PLANO PRECISA DE AJUSTE.** Os 3 MUST FIX (EC-1, EC-2, EC-3) devem ser incorporados antes da implementação começar. Todos são mudanças cirúrgicas:

- **EC-1**: prescrever `server.httpServer?.on('close', ...)` em vez de `server.close` mutation (1 frase no T1.1 Deep Dives)
- **EC-2**: trocar portas fixas por `port: 0` em fixtures (1 frase no D4 + ajustar T4.x snippets)
- **EC-3**: adicionar drift-check test em T4.1 (1 task adicional + 1 RED test no TDD block de T4.1)

Os 5 SHOULD TEST entram nos blocos TDD das tasks correspondentes (sem novas tasks).

Os 4 DOCUMENT entram em troubleshooting de `docs/concepts/services.md` (na própria T6.2 dogfood ou antes).
