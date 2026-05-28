# Plan: System 100% Functional — Unblock Release

> **Version 1.1** — Close the gap between "primitivos prontos no bancada" e "framework shippable no npm". Resolve os blockers descobertos no dogfood do plano anterior (Zod 3/4 dual-version, CorsConfig DTS error, outbox não-wired em `http/execute.ts`, manifest cron+job não-wired em `theokit build`, real-Postgres CI test) + execute o standard 22-phase `/dogfood full` em estado verde sem ressalvas. Sessão exclusiva de Dogfooding (Phase 7) com **5 sub-fases de validação** cobrindo: smoke unitário, smoke de integração, regressão pre-existing, smoke end-to-end de scaffold→build→deploy, e production-shape stress. Outcome: `pnpm typecheck` clean, `pnpm test` 100% passing, `pnpm --filter theokit build` succeeds, `/dogfood full` health ≥ 90/100 (não apenas ≥70), `theokit@0.2.0` pronto para `pnpm publish`.

## Context

O dogfood do plano `jobs-crons-webhooks-cost-tracking` (2026-05-24, `docs/audit/dogfood-2026-05-24-jobs-crons-webhooks.md`) declarou 88/100 com ressalvas. As primitivas (Phase 0-6 daquele plano) estão completas e green-tested (223/223). Porém o sistema NÃO é 100% funcional para usuário externo:

### Blockers críticos descobertos

| # | Blocker | Evidência | Severidade |
|---|---|---|---|
| B1 | `pnpm --filter theokit build` falha no DTS | `vite-plugin/index.ts:192` — `Type '{ origins?: any; ... }' is not assignable to type 'CorsConfig' (origins required)` | CRITICAL — bloqueia npm publish |
| B2 | `pnpm typecheck` reporta ≥100 erros | Dual Zod 3.25.76 + Zod 4.4.3 instaladas. Zod 4 vem via knip transitivamente; types resolvem para a versão errada em alguns arquivos (`examples/full-stack-agent/server/tools/*.ts`) | CRITICAL — TS estritamente quebrado |
| B3 | 38 test files falham no full sweep | Mesma raiz B2 — `config/schema.ts:24` (`z.function().args(z.unknown()).returns(z.string())`) infere tipo errado, cascateando para `loadConfig`, `defineConfig`, e todos os testes que importam config | CRITICAL — não dá para validar suite completa |
| B4 | Outbox não wired em `http/execute.ts` | Cross-validation MEDIUM-1 (`docs/reviews/cross-validation/jobs-crons-webhooks-cost-tracking-xval-2026-05-24.md`). Usuário hoje precisa instanciar outbox + dispatcher manualmente | HIGH — DX broken |
| B5 | Cron+job manifest não wired em `cli/commands/build.ts` | Cross-validation MEDIUM-2. `theokit build --target=vercel` NÃO emite `.theo/crons.json` nem atualiza `vercel.json crons[]` | HIGH — release primitive não acionável via CLI |
| B6 | `PostgresJobBackend` sem teste real-Postgres em CI | Cross-validation LOW-1. SKIP LOCKED race-safety só verificada manualmente | LOW — pg-mem cobre 90% dos casos |
| B7 | `pnpm --filter theokit-sdk build` falha | Pré-existente (Zod 3 `toJSONSchema` ausente). FORA de escopo deste plano (theokit-sdk é repo sibling) | OUT OF SCOPE |

### Evidência cumulativa

- 38 test files (`pnpm test` full): `tests/integration/onda{1,2,3,4,5,8}-mandatory.test.ts`, `tests/unit/adapters.test.ts`, `tests/unit/aws-lambda-adapter.test.ts`, `tests/unit/cli-info.test.ts`, etc. — todos importam direta ou indiretamente `packages/theo/src/config/schema.ts` que falha typecheck
- Dogfood `full` skipped (decisão registrada): "blocked by pre-existing Zod 3/4 skew unrelated to this plan"
- `pnpm why zod` confirms: `knip 5.88.1 → zod 4.4.3` (transitive) AND root `zod 3.25.76` (direct)
- Edge-case review (`docs/reviews/edge-case-plan/system-100-percent-functional-edge-cases-2026-05-25.md`) — 11 additional edge cases incorporated as EC-201..EC-211 below (4 MUST FIX folded into tasks, 4 SHOULD TEST added to TDD cycles, 3 DOCUMENT inline)

## Objective

**Done** = `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` exit 0 (todos os ~2500 testes green), `pnpm --filter theokit build` exit 0 (com DTS), `pnpm exec dependency-cruiser` 0 violations, `/dogfood full` health ≥ 90/100, `pnpm --filter theokit publint` "All good", `theokit@0.2.0` pronto para publish.

Specific measurable goals:

- G1. **Zod single version** (3.25.76 across all workspace packages incluindo transitive overrides)
- G2. **`packages/theo/src/config/schema.ts` infere tipos corretamente** — `loadConfig` retorna `TheoConfig` com `cors.origins` required, sem `any`
- G3. **`vite-plugin/index.ts:192` compila sem erro** — `cors` resolve para `CorsConfig | undefined`
- G4. **All 2500+ tests green** em `pnpm test` (full sweep)
- G5. **`theokit build --target=<adapter>` emite manifests** — `.theo/crons.json` + `.theo/jobs.json` + adapter-specific config patches
- G6. **`ctx.queue.enqueue` works inside `defineRoute` handlers** — outbox + per-request queue client auto-wired
- G7. **`PostgresJobBackend` validado em real-Postgres** via CI Docker service (concurrent SKIP LOCKED race verified)
- G8. **`pnpm --filter theokit build` succeeds** (zero DTS errors)
- G9. **`/dogfood full` health ≥ 90/100** com zero CRITICAL e zero HIGH
- G10. **`pnpm publint packages/theo`** all good

## ADRs

| ID | Decision | Rationale | Consequences |
|---|---|---|---|
| **D1** | Pinar Zod via `pnpm.overrides` para versão única (3.25.76) | Dual-package hazard quebra inferência. knip é devDep — se quebrar internamente, fallback é remover knip do CI (não é runtime). Migration para Zod 4 é grande demais (escopo separado, post-1.0). | Resolução determinística. Knip pode reportar warnings; remove se necessário. |
| **D2** | `theokit build` SEMPRE roda cron + job scan + manifest emit, independente de `--target` | Manifest é neutral (schemaVersion=1); adapters consomem. Skip baseado em flag confunde "vazio porque opt-out" vs "vazio porque nada declarado". | Add ~5ms à build time. Build sempre tem `.theo/{crons,jobs}.json` (mesmo que vazio). |
| **D3** | Outbox é setup AUTOMÁTICO no `http/execute.ts` quando `jobs.backend` está configurado em `theo.config.ts` | DX-first: `ctx.queue.enqueue` "just works" sem boilerplate. Sem backend configurado, `ctx.queue` é undefined (não throw — silent no-op preserva compat com apps sem jobs). | One config switch (`jobs.backend = ...`) → primitivos jobs ativam automaticamente. |
| **D4** | Real-Postgres CI test usa GitHub Actions `services: postgres` (Docker) com env-gated invocation | Testcontainers em CI dá flakiness conhecida; GHA services são mais previsíveis. Test é skipped se `POSTGRES_URL` env não setada — local devs continuam com pg-mem. | CI workflow gains uma matrix com Postgres service. Local dev unchanged. |
| **D5** | `CorsConfig.origins` permanece **required** — o fix é na Zod schema inference, NÃO na interface runtime | Mudar `CorsConfig` para `origins?` quebraria semântica (CORS sem origin allowlist = "everything"). Schema deve refletir invariante. | Tarefas focam em corrigir o tipo derivado, não relaxar o contrato. |
| **D6** | `/dogfood full` é OBRIGATÓRIO em Phase 7 (sessão exclusiva), com 5 sub-fases. Não declarar plano completo enquanto health < 90/100 | Dogfood do plano anterior fez 88/100 com SKIPPED de 4 fases. Este plano fecha as 4 skipped + adiciona prova de production-shape. | Phase 7 é a maior do plano (~ 30% do trabalho). |
| **D7** | `theokit@0.2.0` publish ao npm NÃO está nesse plano (operacional, release-engineer track) | Plano é técnico: deixar o código pronto para publish. O ato de `pnpm publish` é fora do escopo de engenharia. | Plano fecha quando "tudo está pronto para publish", não quando "publicado". |

## Dependency Graph

```
Phase 0 — Critical blockers (Zod + Cors)
  │
  └──▶ Phase 1 — CLI build wiring (depends on schema clean)
       │
       ├──▶ Phase 2 — Outbox runtime integration
       │    │
       │    └──▶ Phase 4 — Full test suite green
       │
       ├──▶ Phase 3 — Postgres CI integration test
       │
       └──▶ Phase 5 — theokit build (DTS) succeeds
            │
            └──▶ Phase 6 — Deploy validation (Vercel)
                 │
                 └──▶ Phase 7 — Dogfood exclusivo (5 sub-fases)
                      │
                      └──▶ Final Phase: pre-publish gate (publint + attw)

Parallelism: Phase 1, Phase 2, Phase 3 can run concurrently after Phase 0.
Phase 4 sequences after Phase 2. Phase 5 sequences after Phase 0 + Phase 1.
Phase 6 + Phase 7 are sequential at the end.
```

---

## Phase 0: Critical blockers — Zod single-version + CorsConfig inference

**Objective:** Eliminate the dual-Zod hazard and the cascading TS errors so that `pnpm typecheck` returns exit 0.

### T0.1 — Pin Zod 3.25.76 across workspace via pnpm overrides

#### Objective
Force pnpm to resolve `zod` to exactly `3.25.76` for ALL packages — including transitive deps (knip's bundled `zod 4.4.3`). Single resolution path eliminates dual-package hazard.

#### Evidence
`pnpm why zod` outputs:
```
knip 5.88.1 → zod 4.4.3
zod 3.25.76 (direct)
```
TS compiler resolves `z.ZodType` to one of two versions per import path. `examples/full-stack-agent/server/tools/calculator.ts:116` errors with `Type 'ZodObject<...>' is missing the following properties from type 'ZodType<unknown, ...>': def, type, toJSONSchema, check, and 18 more` — those properties exist on Zod 4 but not Zod 3.

#### Files to edit
```
package.json — add pnpm.overrides for zod
pnpm-lock.yaml — regenerated by `pnpm install`
```

#### Deep file dependency analysis
- `package.json` (MODIFY): adds `pnpm.overrides.zod = "3.25.76"`. This forces transitive resolutions of `zod` to the pinned version. Per pnpm docs (`https://pnpm.io/package_json#pnpmoverrides`), this is the surgical fix for dual-package hazards.
- Downstream: every package using `zod` (direct or transitive) re-resolves on next `pnpm install`. Knip 5.88.1 was tested against Zod 4 — it MAY emit type warnings at knip runtime. Acceptance: as long as `pnpm exec knip` still produces correct output, the override is safe. If knip outright breaks, we fall back to T0.1b (remove knip from CI).

#### Deep Dives
- **pnpm overrides scope:** applies to entire workspace recursively. No need to touch individual `packages/*/package.json`.
- **Risk of pinning to 3.25.76 specifically:** that's the version currently consumed. Pinning to a range (`^3.24.0`) doesn't force a single resolution; pinning to exact version does.
- **Invariant post-fix:** `ls node_modules/.pnpm/ | grep "^zod@"` returns exactly ONE entry (`zod@3.25.76`).
- **EC-210 (DOCUMENT) — pnpm overrides bypass peer-dep validation:** `pnpm overrides` forces version even if `peerDependencies` would conflict. Knip 5.88.1 declares Zod 4 as peer; override silently overrides. Acceptable since knip is a devDep (not runtime) — if knip outright fails, fallback `T0.1b` (remove knip from CI). Note: this trade-off is one-line documentation in `package.json` (`"// pnpm.overrides note": "knip 5.88.1 declares zod peer ^4; we pin 3.25.76 per ADR-D1; if knip fails, see T0.1b"`).

#### Tasks
1. Edit `package.json` root: add `"pnpm": { "overrides": { "zod": "3.25.76" } }` (or merge with existing pnpm config).
2. Run `pnpm install` to regenerate lockfile.
3. Verify `pnpm why zod` shows single resolution.
4. Verify `ls node_modules/.pnpm/ | grep "^zod@" | wc -l` == 1.

#### TDD + BDD (⛔ OBRIGATÓRIO)

> Infrastructure task — TDD via integration assertion test.

```
RED: test_single_zod_version_installed — Given pnpm-lock.yaml, When inspected, Then exactly one zod version present.
RED: test_zod_resolves_to_3_25_76 — Given require('zod/package.json'), When read, Then version === '3.25.76'.
RED: test_no_zod_4_in_node_modules_pnpm — Given ls node_modules/.pnpm/, When grepped for ^zod@4, Then zero matches.
RED (error): test_knip_still_runs_or_skipped — Given pnpm exec knip --no-config, When invoked, Then either exits 0 (knip OK with Zod 3) OR exits non-zero with knip-specific error (documented as T0.1b trigger).
GREEN: Add pnpm.overrides in package.json + pnpm install.
REFACTOR: None.
VERIFY: node -e "console.log(require('zod/package.json').version)" && ls node_modules/.pnpm/ | grep "^zod@" | wc -l
```

BDD scenarios:
- Happy path: single zod resolution
- Validation error: dual versions still present → fail
- Edge case: knip incompatibility → documented as T0.1b trigger
- Error scenario: install failure (e.g., resolution conflict) → manually rollback override

#### Acceptance Criteria
- [ ] `package.json` contains `"pnpm.overrides.zod": "3.25.76"`
- [ ] `pnpm-lock.yaml` updated
- [ ] `node_modules/.pnpm/` has exactly ONE `zod@*` directory
- [ ] `require('zod/package.json').version === '3.25.76'`
- [ ] `pnpm install` exits 0
- [ ] Pass: no new TS errors introduced (gate via T0.2)

#### DoD
- [ ] All tasks completed
- [ ] Single-version assertion passes
- [ ] CHANGELOG `[Unreleased]` notes the override
- [ ] `pnpm exec knip` either passes OR knip-specific failure is logged with T0.1b decision

---

### T0.2 — Verify `config/schema.ts` infers `CorsConfig` correctly

#### Objective
Confirm that after Zod single-version pin, `loadConfig` returns a type where `security.cors.origins` is required (matching runtime `CorsConfig.origins: CorsOrigin`).

#### Evidence
DTS error `vite-plugin/index.ts:192 — Property 'origins' is optional in type '{ ... origins?: any; ... }' but required in type 'CorsConfig'` was traced to `z.function().args(...).returns(...)` in `config/schema.ts:24` and `:172`. When TS sees two Zod versions, the inferred `z.infer<typeof corsSchema>` produces a degraded type with `origins?: any`.

#### Files to edit
```
packages/theo/src/config/schema.ts — verify (may need micro-tweaks if Zod 3 z.function() API differs from current)
packages/theo/src/vite-plugin/index.ts — verify line 192 compiles
tests/unit/config-schema-cors-inference.test.ts (NEW)
```

#### Deep file dependency analysis
- `config/schema.ts`: defines `corsSchema` + `theoConfigSchema` + `rateLimitSchema`. Used by `load-config.ts` to validate `theo.config.ts`. The `z.infer<typeof theoConfigSchema>` is the public `TheoConfig` type used everywhere.
- `vite-plugin/index.ts:192`: `cors = userConfig.security?.cors`. Type flow: `loadConfig()` → `z.infer<typeof theoConfigSchema>` → `userConfig.security?.cors` → must match `CorsConfig | undefined`.
- After T0.1, the inferred type should match. This task VERIFIES that assumption; if it doesn't, micro-tweak the schema (e.g., switch `z.function().args(...).returns(...)` to a Zod 3-compatible callable signature OR use `z.custom<(origin: string) => boolean>()`).

#### Deep Dives
- **Why `z.function().args(...).returns(...)` is fragile:** Zod 3 supports it but the inferred type uses generics. With one Zod version, inference works. With two, TS unions the generics from both versions, producing degenerate types.
- **Fallback:** if T0.1 alone doesn't fix `corsSchema`, replace `z.function().args(z.string()).returns(z.boolean())` with `z.custom<(origin: string) => boolean>((v) => typeof v === 'function')`.
- **Invariant:** `z.infer<typeof corsSchema>['origins']` MUST be required (not optional).
- **EC-209 (DOCUMENT) — `z.custom<>()` fallback loses runtime signature validation:** if the fallback is needed, `z.custom<(origin: string) => boolean>((v) => typeof v === 'function')` validates only that the value IS a function — does NOT validate that it accepts a `string` and returns a `boolean`. Accept this because (a) TS-side the generic enforces the signature at compile time; (b) any runtime user-error in CORS config surfaces on the first request rejected (NOT silent). Document in JSDoc of `corsSchema`.

#### Tasks
1. After T0.1, run `pnpm typecheck` and grep for `cors` / `origins` errors.
2. If errors persist on `cors`, replace `z.function()...` with `z.custom<...>()` in both call sites (lines 24 + 172).
3. Write inference assertion test (`expectTypeOf<z.infer<typeof corsSchema>>().toExtend<{ origins: CorsOrigin }>()`).
4. Verify `vite-plugin/index.ts:192` compiles.

#### TDD + BDD

```
RED: test_corsSchema_origins_is_required — Given z.infer<typeof corsSchema>, When TS-checked, Then 'origins' is REQUIRED field.
RED: test_rateLimitSchema_keyBy_is_function_or_enum — Given z.infer<typeof rateLimitSchema>, When TS-checked, Then keyBy union includes callable signature.
RED: test_loadConfig_return_type_matches_TheoConfig — Given loadConfig(), When return type inspected, Then matches strict TheoConfig shape with cors.origins required.
RED (error): test_vite_plugin_line_192_compiles — Given vite-plugin/index.ts, When tsc --noEmit, Then no error on line 192 cors assignment.
GREEN: Apply T0.1 (Zod override). If still failing, switch to z.custom<>() in schema.ts.
REFACTOR: Document the rationale in schema.ts JSDoc.
VERIFY: pnpm typecheck 2>&1 | grep -c "vite-plugin/index.ts.*192" → 0
```

BDD scenarios:
- Happy path: post-T0.1, types infer correctly
- Validation error: types still degenerate → switch to z.custom<>()
- Edge case: rateLimitSchema also uses `z.function()...` — same fix
- Error scenario: schema regression on next dependency upgrade

#### Acceptance Criteria
- [ ] All 4 RED tests pass
- [ ] `pnpm typecheck` → 0 errors in `config/schema.ts` AND `vite-plugin/index.ts`
- [ ] `z.infer<typeof corsSchema>['origins']` is required (verified via type test)
- [ ] No new runtime behavior change (schema validation unchanged)

#### DoD
- [ ] All tasks completed
- [ ] Schema inference verified via type test
- [ ] DTS error on `vite-plugin/index.ts:192` GONE

---

### T0.3 — `pnpm typecheck` exit 0 (zero TS errors workspace-wide)

#### Objective
After T0.1 + T0.2, the cascade resolves. Verify with a clean `pnpm typecheck` and remediate any residual errors not addressed by Zod fix.

#### Evidence
`pnpm typecheck` currently reports ≥100 errors. The vast majority cascade from `config/schema.ts` (test fixtures, examples, fixtures importing `loadConfig`, `defineConfig`). Post-T0.2, expect drastic reduction. Any residual errors are independent bugs that need direct fix.

#### Files to edit
```
packages/theo/src/... — any file with residual TS errors
examples/full-stack-agent/... — tool files use defineAgentTool with Zod schemas
fixtures/typed-client/server/routes/users.ts — if still failing
tests/... — if cascade unfinished
tests/unit/typecheck-clean-gate.test.ts (NEW) — asserts `pnpm typecheck` returns clean
```

#### Deep file dependency analysis
- `examples/full-stack-agent/server/tools/*.ts`: each uses `defineAgentTool({ inputSchema: z.object({...}), handler: ... })`. With Zod single-version, `inputSchema: z.object(...)` should match `T extends z.ZodType` constraint in `defineAgentTool`.
- `fixtures/typed-client/server/routes/users.ts`: `defineRoute({ body: z.object(...) })` — same pattern.
- `tests/integration/ondaN-mandatory.test.ts`: import scaffolded apps that use Zod schemas.

#### Deep Dives
- **Expected residual after Zod fix:** ≤5 unrelated TS errors. If >5, escalate per file.
- **Pre-existing TS errors NOT related to Zod:** unlikely but possible (e.g., a stale import). Fix one by one; document each in CHANGELOG.
- **EC-203 (MUST FIX) — SDK isolation pre-flight:** `examples/full-stack-agent/server/tools/*.ts` use `defineAgentTool({ inputSchema: z.object(...) })`. The framework's `defineAgentTool` uses `z.ZodType` from Zod 3. But the example tools' output type cast may touch `@usetheo/sdk` types (which are Zod 4-shaped in the sibling repo, per B7 OUT OF SCOPE). Run pre-flight isolation: `pnpm typecheck 2>&1 | grep "examples/full-stack-agent/server/tools" | grep -E "@usetheo/sdk|toJSONSchema|ZodObject"`. If hits > 0, those errors are SDK-rooted (B7) and EXCLUDED from this task's pass criteria. Document the excluded count in `docs/audit/phase-0-typecheck-pre-flight-2026-MM-DD.md`.

#### Tasks
1. Run `pnpm typecheck` post-T0.2.
2. **EC-203 PRE-FLIGHT:** isolate SDK-rooted errors via the grep above; record count in pre-flight audit doc.
3. For each NON-SDK residual error file: read the error, identify root cause, fix.
4. Write gate test that asserts `pnpm typecheck` exit 0 EXCLUDING SDK-rooted errors (if any).

#### TDD + BDD

```
RED: test_typecheck_exit_zero — Given workspace state, When `tsc --noEmit` invoked, Then exit code 0.
RED: test_config_schema_clean — Given packages/theo/src/config/schema.ts, When typechecked, Then 0 errors.
RED: test_examples_full_stack_agent_tools_clean — Given examples/full-stack-agent/server/tools/, When typechecked, Then 0 errors.
RED: test_fixtures_typed_client_clean — Given fixtures/typed-client/, When typechecked, Then 0 errors.
RED (edge): test_no_new_TS_errors_from_phase_0 — Given diff between pre-T0.1 errors and post-T0.3 errors, When subtracted, Then post is strictly fewer.
RED (EC-203): test_sdk_rooted_errors_documented_not_blocking — Given pnpm typecheck output, When SDK-rooted errors greppd, Then count documented in pre-flight audit doc AND excluded from `test_typecheck_exit_zero`.
GREEN: Fix any residual TS errors per-file.
REFACTOR: Consolidate any shared type-safety patterns into helpers if a refactor emerges.
VERIFY: pnpm typecheck 2>&1 | tail -3
```

BDD scenarios:
- Happy path: zero TS errors
- Validation error: any residual error fixed individually
- Edge case: error introduced by fix → revert + try alternate fix
- Error scenario: tsc segfault / infinite loop → escalate as TS bug

#### Acceptance Criteria
- [ ] `pnpm typecheck` exit code 0 (EXCLUDING SDK-rooted errors per EC-203 pre-flight)
- [ ] All 6 RED tests pass (5 base + 1 EC-203)
- [ ] No files added to a ts-ignore allowlist
- [ ] Zero `@ts-ignore` / `@ts-expect-error` introduced
- [ ] EC-203: pre-flight audit doc records SDK-rooted error count (if any) for cross-repo follow-up

#### DoD
- [ ] All tasks completed
- [ ] `pnpm typecheck` clean (modulo SDK gap documented in pre-flight)
- [ ] CHANGELOG documents any non-Zod fixes applied

---

## Phase 1: CLI build wiring — cron + job manifests + adapter translators

**Objective:** `theokit build` invokes scanners + manifest emitters + adapter translators automatically.

### T1.1 — Wire cron scan + manifest emit in `cli/commands/build.ts`

#### Objective
After T0 completes, `theokit build` (any target) scans `server/crons/`, emits `.theo/crons.json`, and (per-adapter) translates to platform config.

#### Evidence
Cross-validation MEDIUM-2: "scanCrons, writeCronManifest, translateCronToVercel/Cloudflare/AWS/Deno all exist and unit-tested. The actual invocation from `theokit build` is NOT yet wired."

#### Files to edit
```
packages/theo/src/cli/commands/build.ts — add cron scan + manifest emit + adapter translation
tests/integration/cli-build-emits-cron-manifest.test.ts (NEW)
```

#### Deep file dependency analysis
- `cli/commands/build.ts`: currently invokes route + action + WS scanners and emits their manifests. Add: cron scanner (`scanCrons(serverDir + '/crons')`) → manifest writer (`writeCronManifest('.theo/crons.json')`) → adapter dispatch (`translateCronTo{Vercel,Cloudflare,AwsLambda,Deno}` based on `--target` flag).
- Downstream: any user running `theokit build --target=vercel` gets `vercel.json crons[]` updated AND `/api/__crons/<name>` route stubs generated.

#### Deep Dives
- **Order in build pipeline:** AFTER route+action+ws scans (those existing), BEFORE adapter-specific bundling.
- **Per-D2:** cron scan runs unconditionally (regardless of `--target`); manifest emits unconditionally. Adapter translator runs only if matching target.
- **N/A adapters (bun, netlify, static):** if user passes `--target=bun` with crons declared, emit warning to stdout AND include in `.theo/manifest-warnings.json`.
- **Edge case:** `server/crons/` doesn't exist → scanCrons returns `[]` → manifest emits `{ schemaVersion: 1, crons: [] }`.
- **EC-201 (MUST FIX) — `--target` flag precedence over `theo.config.ts.adapters[]`:** the CLI's `--target=<x>` flag (verified at `build.ts:25`) is THIS-build authoritative. If `theo.config.ts.adapters[]` declares multiple platforms, the array is treated as informative (lists what the app supports) but does NOT dispatch translations for non-matching targets. A single build run translates for ONE target only — the one passed via `--target`. To deploy to multiple platforms, the user runs `theokit build` multiple times with different `--target` values. Document this in stdout: when building with `--target=vercel` but `config.adapters` includes `cloudflare`, log "Note: config.adapters lists [cloudflare]; this build translates for vercel only. Run `theokit build --target=cloudflare` separately for CF."

#### Tasks
1. Read current `build.ts` structure.
2. Add `scanCrons` invocation after existing scanners.
3. Add `writeCronManifest` invocation.
4. Add target-dispatching for `translateCronToVercel/Cloudflare/AwsLambda/Deno`.
5. Add stdout warning for N/A targets.

#### TDD + BDD

```
RED: test_build_emits_cron_manifest — Given fixture with server/crons/foo.ts, When `theokit build` invoked, Then .theo/crons.json exists with foo entry.
RED: test_build_emits_empty_manifest_when_no_crons — Given fixture without server/crons/, When build, Then .theo/crons.json exists with crons:[].
RED: test_build_target_vercel_updates_vercel_json — Given cron in fixture + --target=vercel, When build, Then vercel.json crons[] populated.
RED: test_build_target_bun_emits_warning — Given cron in fixture + --target=bun, When build, Then warning in stdout AND .theo/manifest-warnings.json mentions cron skipped.
RED: test_build_target_cloudflare_updates_wrangler — Given cron + --target=cloudflare, When build, Then wrangler.toml [triggers] crons populated.
RED (edge): test_build_preserves_existing_vercel_json_fields — Given vercel.json with {functions, headers} + cron, When build, Then those fields preserved (EC-105).
RED (EC-201): test_target_flag_is_authoritative_ignores_config_adapters_array — Given theo.config.ts.adapters=['cloudflare'] AND --target=vercel, When build, Then ONLY vercel.json updated (wrangler.toml NOT touched) AND stdout informs about config.adapters cross-reference.
GREEN: Wire scanner + manifest + translator in build.ts.
REFACTOR: Extract scan-and-emit helper if duplication with jobs (T1.2).
VERIFY: cd fixtures/cron-basic && npx tsx ../../packages/theo/src/cli/index.ts build --target=vercel && cat .theo/crons.json
```

BDD scenarios:
- Happy path: build emits manifest + adapter config
- Validation error: cron schedule invalid → build fails with actionable error
- Edge case: no crons → empty manifest (not error)
- Error scenario: N/A target + crons → warning, build succeeds

#### Acceptance Criteria
- [ ] All 7 RED tests pass (6 base + 1 EC-201)
- [ ] `theokit build` always emits `.theo/crons.json` (empty if no crons)
- [ ] Per-adapter translation invoked when `--target` matches
- [ ] EC-105 preservation verified
- [ ] EC-201: `--target` flag is documented as authoritative; `config.adapters[]` is informative-only
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Manual smoke: `cd fixtures/cron-basic && npx tsx ../../packages/theo/src/cli/index.ts build --target=vercel` produces correct `vercel.json` + `.theo/crons.json`

---

### T1.2 — Wire job scan + manifest emit in `cli/commands/build.ts`

#### Objective
Same pattern as T1.1 but for jobs: `server/jobs/` → `.theo/jobs.json`.

#### Evidence
Same cross-validation MEDIUM-2.

#### Files to edit
```
packages/theo/src/cli/commands/build.ts — add job scan + manifest emit
tests/integration/cli-build-emits-job-manifest.test.ts (NEW)
```

#### Deep file dependency analysis
- Same `build.ts` modified in T1.1; new lines after cron block.
- Jobs don't have per-adapter translation (jobs run via worker process, not via platform trigger). Manifest is sufficient.

#### Deep Dives
- **Why no adapter translation for jobs:** unlike crons (translate to vercel.json crons[]), jobs always run via in-process worker (`createJobRunner`). The manifest is purely informational/diagnostic.
- **Edge case:** if user has `server/jobs/` but no `jobs.backend` in config, scan still emits manifest (purely declarative).

#### Tasks
1. Add `scanJobs` after `scanCrons` in build.ts.
2. Add `writeJobManifest` invocation.
3. No per-adapter dispatch needed.

#### TDD + BDD

```
RED: test_build_emits_jobs_manifest — Given fixture with server/jobs/foo.ts, When build, Then .theo/jobs.json with foo entry.
RED: test_build_emits_empty_jobs_when_no_jobs — Given fixture without server/jobs/, When build, Then .theo/jobs.json with jobs:[].
RED: test_build_jobs_manifest_includes_hasInputSchema — Given job with Zod input, When build, Then manifest.jobs[0].hasInputSchema === true.
RED (edge): test_build_jobs_max_attempts_in_manifest — Given job with maxAttempts:5, When build, Then manifest.jobs[0].maxAttempts === 5.
RED (error): test_duplicate_job_name_throws_build — Given two jobs same name, When build, Then exits non-zero with DuplicateJobNameError.
GREEN: Wire in build.ts.
REFACTOR: None (separate from cron block).
VERIFY: cd fixtures/jobs-basic && npx tsx ../../packages/theo/src/cli/index.ts build && cat .theo/jobs.json
```

BDD scenarios:
- Happy path: jobs manifest emitted
- Validation error: duplicate job name → build fails
- Edge case: no jobs → empty manifest
- Error scenario: job module syntax error → actionable build failure

#### Acceptance Criteria
- [ ] All 5 RED tests pass
- [ ] `.theo/jobs.json` always emitted
- [ ] hasInputSchema + maxAttempts reflected accurately
- [ ] Duplicate name fails build

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Manual smoke OK

---

## Phase 2: Outbox runtime integration

**Objective:** `ctx.queue.enqueue` works inside `defineRoute` handlers without any user boilerplate.

### T2.1 — Wire per-request outbox lifecycle into `http/execute.ts`

#### Objective
Per ADR D3: when `theo.config.ts.jobs.backend` is configured, every request gets a per-request outbox + queue client. `res.on('finish')` flushes; `res.on('close')` discards on abort; statusCode ≥ 400 discards.

#### Evidence
Cross-validation MEDIUM-1: "outbox module is complete and unit-tested. The actual hook-up to `http/execute.ts` is NOT yet wired."

#### Files to edit
```
packages/theo/src/server/http/execute.ts — wire outbox + queue client + lifecycle hooks
packages/theo/src/config/schema.ts — add jobs.backend field
packages/theo/src/config/load-config.ts — resolve backend instance at config load time
tests/integration/outbox-execute-integration.test.ts (NEW) — the KEY test of D3
```

#### Deep file dependency analysis
- `http/execute.ts`: route execution pipeline. Already manages `req`, `res`, `ctx` (context). Add per-request `outbox = createOutbox()`, `queueClient = createQueueClient(backend, outbox)`, attach to `ctx.queue`. Hook `res.on('finish')` (flush if statusCode < 400) + `res.on('close')` (discard if not finished).
- `config/schema.ts`: add `jobs: z.object({ backend: z.custom<JobBackend>() }).optional()`.
- `config/load-config.ts`: backend is a JobBackend instance, not a string — passed through unchanged.

#### Deep Dives
- **Pipeline ordering:** outbox attached BEFORE handler invocation; flush/discard hooks attached BEFORE `res.write`/`res.end` callbacks.
- **Per-D3 invariant:** if `jobs.backend` is undefined → `ctx.queue` is undefined; user calling `ctx.queue?.enqueue(...)` is no-op (TS narrows via optional chain).
- **Edge case (streaming response):** `res.on('finish')` fires at stream END. Outbox correctly defers flush.
- **Edge case (4xx response):** handler returns 4xx → `res.statusCode < 400` is false → outbox discards. Verified by KEY test.
- **Edge case (handler throws):** existing error pipeline already sets `res.statusCode = 500`. Outbox discard via `statusCode >= 400` check. KEY guarantee.
- **EC-202 (MUST FIX) — plugin `decorateRequest('queue', ...)` collision:** verified in `packages/theo/src/server/plugin-types.ts:43` + `plugins/plugin-runner.ts:76`. Plugins can decorate `'queue'` before the framework injects `ctx.queue`. BEFORE injection, check `if (ctx.queue !== undefined) throw new DuplicateContextKeyError('queue', { reason: 'plugin already decorated; choose a different key OR remove jobs.backend from config' })`. Fail loud, never silent override.
- **EC-206 (SHOULD TEST) — long-poll streaming + outbox memory:** `res.on('finish')` for a long-poll response (e.g., 30s+ hold) means the outbox holds entries for the entire connection lifetime. For ~10 buffered entries the memory is negligible; for 1000+ enqueues during long-poll, document the limit. Acceptable since per-D3, request handler is fire-and-forget; users batching 1000+ enqueues per request should be using cron or batch endpoints, not long-poll.

#### Tasks
1. Add `jobs` field to `theoConfigSchema`.
2. Modify `load-config.ts` to pass through backend instance.
3. In `http/execute.ts`: after middleware, before handler — instantiate outbox + queue client, inject into `ctx`.
4. Attach `res.on('finish', ...)` flush hook.
5. Attach `res.on('close', ...)` discard hook (if `!res.writableFinished`).
6. Test backend invocation order.

#### TDD + BDD

```
RED: test_ctx_queue_enqueue_works_from_route_handler — Given route that calls ctx.queue.enqueue + 200 response, When request, Then job dispatched after res.finish.
RED: test_ctx_queue_undefined_when_no_backend_configured — Given no jobs.backend in config, When route handler accessed ctx.queue, Then undefined (no throw).
RED: test_handler_throws_zero_orphan_jobs — Given route enqueues then throws, When request, Then 0 jobs dispatched (KEY guarantee).
RED: test_4xx_response_discards_outbox — Given route enqueues + returns 400, When request, Then 0 jobs dispatched.
RED: test_client_disconnect_discards_outbox — Given route with delay + abort mid-flight, When awaited, Then 0 jobs dispatched.
RED: test_streaming_response_flushes_at_stream_end — Given streaming route that enqueues, When stream ends, Then job dispatched.
RED (edge): test_multiple_enqueues_dispatched_in_order — Given 3 enqueues, When res.finish, Then backend.enqueue called 3 times in insertion order.
RED (error): test_backend_throw_during_flush_logs_continues — Given outbox of 3 + backend throws on entry 2, When flush, Then 1+3 dispatched, entry 2 logged.
RED (EC-202): test_queue_decoration_collision_throws — Given plugin that decorates `'queue'` + jobs.backend configured, When request, Then DuplicateContextKeyError thrown with actionable message + 500 response (NOT silent override).
RED (EC-202): test_no_queue_collision_when_jobs_backend_absent — Given plugin decorates 'queue' + no jobs.backend in config, When request, Then plugin's queue preserved (framework no-op).
RED (EC-206): test_long_poll_response_does_not_leak_outbox_memory — Given long-poll route holding 30s with 10 enqueues, When res.finish fires, Then outbox flushes once + no timers leaked.
GREEN: Wire in execute.ts.
REFACTOR: Extract lifecycle helper if reusable for actions (T2.2).
VERIFY: npx vitest run tests/integration/outbox-execute-integration.test.ts
```

BDD scenarios:
- Happy path: 2xx response flushes outbox; jobs dispatched
- Validation error: 4xx discards
- Edge case: no backend configured → ctx.queue undefined, no-op
- Error scenario: handler throws → KEY guarantee (zero orphans)

#### Acceptance Criteria
- [ ] All 11 RED tests pass (8 base + 2 EC-202 + 1 EC-206)
- [ ] `ctx.queue.enqueue` works from any `defineRoute` handler when `jobs.backend` configured
- [ ] Zero orphan jobs in all failure modes (handler throw, 4xx, client abort)
- [ ] Plugin collision on `ctx.queue` throws `DuplicateContextKeyError` (NEVER silent override)
- [ ] Long-poll streaming verified safe (10 enqueues over 30s connection)
- [ ] Backward compat: routes without queue continue working
- [ ] Pass: TS strict, lint, vitest, integration

#### DoD
- [ ] All tasks completed
- [ ] KEY test asserts ZERO orphans in 3 failure modes
- [ ] `DuplicateContextKeyError` exported from `theokit/server`
- [ ] Code-audit checks passing

---

### T2.2 — Update `JobRegistry` augmentation example in template-default

#### Objective
Templates that scaffold `theokit dev` need a working example of `JobRegistry` augmentation so users discovering jobs don't hit EC-110.

#### Evidence
EC-110 documented in `docs/concepts/jobs.md`. Without an example in the scaffolded template, new users will hit `Type 'X' is not assignable to type 'never'` and not understand why.

#### Files to edit
```
packages/create-theo/templates/default/types/jobs.d.ts.tmpl (NEW)
packages/create-theo/templates/default/server/jobs/example-job.ts.tmpl (NEW — optional opt-in via flag)
tests/integration/scaffold-default-jobs-augmentation.test.ts (NEW)
```

#### Deep file dependency analysis
- `types/jobs.d.ts.tmpl`: ships a stub `declare module 'theokit/server' { interface JobRegistry { /* add jobs here */ } }`. User uncomments + adds entries as they declare jobs.

#### Deep Dives
- **Why ship empty vs filled:** filled means user has to delete example job before adding real ones (annoying). Empty means user has to write the augmentation pattern (educational, matches docs).
- Compromise: ship commented-out example in a `.d.ts` file with comments explaining.

#### Tasks
1. Create `templates/default/types/jobs.d.ts.tmpl` with documented `JobRegistry` augmentation skeleton.
2. Verify template inclusion via existing scaffold mechanism.

#### TDD + BDD

```
RED: test_scaffold_default_includes_jobs_d_ts — Given scaffold output, When inspected, Then types/jobs.d.ts present.
RED: test_jobs_d_ts_includes_JobRegistry_augmentation_example — Given jobs.d.ts, When grepped, Then contains "declare module 'theokit/server'" + "interface JobRegistry".
RED: test_jobs_d_ts_has_documentation_comment — Given jobs.d.ts, When read, Then has comment explaining usage.
RED (edge): test_jobs_d_ts_typechecks_clean_after_scaffold — Given scaffolded project, When tsc, Then 0 errors (empty augmentation is valid TS).
GREEN: Create template file.
REFACTOR: None.
VERIFY: pnpm vitest run tests/integration/scaffold-default-jobs-augmentation.test.ts
```

BDD scenarios:
- Happy path: scaffold includes file
- Validation error: malformed augmentation → caught by TS
- Edge case: empty augmentation valid
- Error scenario: user forgets to uncomment → fails compile with actionable EC-110 message (documented in `docs/concepts/jobs.md`)

#### Acceptance Criteria
- [ ] All 4 RED tests pass
- [ ] `types/jobs.d.ts` shipped in default template
- [ ] Comment explains usage + links to docs/concepts/jobs.md

#### DoD
- [ ] All tasks completed
- [ ] Tests green
- [ ] Scaffold smoke OK

---

## Phase 3: Real-Postgres CI integration test

**Objective:** Close LOW-1 from cross-validation. `PostgresJobBackend` SKIP LOCKED safety is verified against real Postgres in CI.

### T3.1 — GitHub Actions Postgres service for jobs CI

#### Objective
Per ADR D4: add a CI job that boots a Postgres service container and runs the `PostgresJobBackend` integration test against it. The test asserts concurrent dequeue does NOT double-dispatch (SKIP LOCKED race-safety).

#### Evidence
Cross-validation LOW-1: "test asserts SEQUENTIAL contract (locked_until prevents re-dispatch) — pg-mem doesn't implement SKIP LOCKED. Real-Postgres race-safety verified manually."

#### Files to edit
```
.github/workflows/postgres-jobs-ci.yml (NEW)
tests/integration/job-backend-postgres-real.test.ts (NEW) — env-gated
packages/theo/src/server/jobs/job-backend-postgres.ts — verify pool.end() exposed for test teardown
```

#### Deep file dependency analysis
- `.github/workflows/postgres-jobs-ci.yml`: GHA workflow with `services: postgres:15-alpine`. Sets `POSTGRES_URL` from the service's default credentials (assembled piecewise at runtime — see the workflow file). Invokes `pnpm vitest run tests/integration/job-backend-postgres-real.test.ts`.
- `tests/integration/job-backend-postgres-real.test.ts`: skipped (`describe.skipIf(!process.env.POSTGRES_URL)`) — only runs in CI with Postgres service.

#### Deep Dives
- **Why env-gated:** local devs without Postgres still get green tests via pg-mem.
- **SKIP LOCKED race test:** 5 concurrent `dequeue` calls against 1 enqueued job → total leases returned across all calls === 1.
- **Edge case:** Postgres service slow to start — workflow includes `--health-cmd "pg_isready -U postgres"` health check.

#### Tasks
1. Write `.github/workflows/postgres-jobs-ci.yml` with `services: postgres:15-alpine`.
2. Write `tests/integration/job-backend-postgres-real.test.ts` with `describe.skipIf` pattern.
3. Verify locally by setting `POSTGRES_URL` env + running test.

#### TDD + BDD

```
RED: test_real_postgres_dequeue_lock_prevents_double_dispatch — Given 1 enqueued job + 5 concurrent dequeue calls, When awaited, Then total leases === 1.
RED: test_real_postgres_concurrent_enqueue_idempotency — Given 10 concurrent enqueue calls with same idempotencyKey, When awaited, Then all return SAME jobId.
RED: test_real_postgres_visibility_timeout_returns_to_queue — Given dequeued lease + worker crash (no ack), When lockSeconds elapses, Then job dequeueable again.
RED (edge): test_real_postgres_migrate_idempotent — Given migrate() called twice, When schema inspected, Then no error.
RED (env-gate): test_skips_when_POSTGRES_URL_unset — Given POSTGRES_URL undefined, When test file evaluated, Then suite skipped.
GREEN: Write workflow + test.
REFACTOR: Extract Postgres helper if reused.
VERIFY: POSTGRES_URL=<your-pg-connection-string> pnpm vitest run tests/integration/job-backend-postgres-real.test.ts
```

BDD scenarios:
- Happy path: real-Postgres CI passes
- Validation error: SKIP LOCKED broken → test fails
- Edge case: env unset → graceful skip
- Error scenario: Postgres service down → CI fails with clear log

#### Acceptance Criteria
- [ ] All 5 RED tests pass on CI (manually verified locally with Postgres)
- [ ] GHA workflow runs on PR + main push
- [ ] Local dev unchanged (pg-mem test still runs)

#### DoD
- [ ] All tasks completed
- [ ] Workflow committed to `.github/workflows/`
- [ ] Smoke ran successfully

---

## Phase 4: Full test suite green

**Objective:** `pnpm test` exit 0. All 2500+ tests across workspace pass.

### T4.1 — Audit and unblock the 38 failing test files post-Zod fix

#### Objective
After Phase 0 (Zod single-version), most of the 38 failing test files should auto-recover. This task audits, runs, and fixes any residual failures.

#### Evidence
`pnpm test` (pre-T0) reports 69 failed test files, 38 failed individual tests. Root cause: Zod 3/4 skew cascading into `config/schema.ts` and downstream consumers.

#### Files to edit
```
tests/integration/ondaN-mandatory.test.ts (multiple — verify each)
tests/unit/adapters.test.ts (verify)
tests/unit/aws-lambda-adapter.test.ts (verify)
tests/unit/cli-info.test.ts (verify)
... (full list emerges from `pnpm test` output)
```

#### Deep file dependency analysis
- Each failing file: identify why. If transitive from Zod (likely majority), expect auto-recovery. If genuinely broken (rare), fix individually.

#### Deep Dives
- **Audit strategy:** run `pnpm test 2>&1 | grep "FAIL" | wc -l`. Compare pre-T0 (69) vs post-T0. If post < 69, identify what's still failing.
- **Categories expected:** (a) Zod cascade — fixed by T0; (b) Outbox-related — fixed by T2.1; (c) Build-related — fixed by T1.1+T1.2; (d) genuinely independent — fix in this task.

#### Tasks
1. Run `pnpm test` post-T0+T1+T2.
2. Categorize residual failures.
3. Fix each residual.
4. Write gate test asserting full suite green.

#### TDD + BDD

```
RED: test_pnpm_test_exit_zero — Given workspace, When `pnpm test` invoked, Then exit code 0.
RED: test_no_test_file_fails — Given test output, When parsed, Then "FAIL " count === 0.
RED: test_skip_count_unchanged_or_lower — Given pre-T0 skip count, When compared to post-T4.1, Then post ≤ pre.
RED (edge): test_total_test_count_grew — Given pre count (~2120) and post count, When compared, Then post > pre (we ADDED tests in Phases 1-3).
RED (EC-205): test_no_orphan_ts_expect_error_after_zod_fix — Given workspace post-T0.1, When `grep -rn "@ts-expect-error" tests/ packages/theo/src/`, Then EACH hit's next line still produces a TS error (no orphan disables). Orphan @ts-expect-error becomes a lint error (`unused expect-error directive`) — gate verifies zero orphans.
GREEN: Fix any residual failures.
REFACTOR: None.
VERIFY: pnpm test 2>&1 | tail -5
```

BDD scenarios:
- Happy path: full suite green
- Validation error: any residual failure investigated + fixed
- Edge case: flaky tests identified + stabilized
- Error scenario: regression introduced by Phase 0-3 → revert + re-fix

#### Acceptance Criteria
- [ ] `pnpm test` exit 0
- [ ] All 5 RED tests pass (4 base + 1 EC-205)
- [ ] No test marked as `.skip` newly
- [ ] Zero orphan `@ts-expect-error` post-Zod fix
- [ ] CHANGELOG documents the cascade resolution

#### DoD
- [ ] All tasks completed
- [ ] Full suite green
- [ ] Test count: pre-baseline + Phase 0-3 new tests, no losses

---

## Phase 5: theokit package build (DTS)

**Objective:** `pnpm --filter theokit build` exits 0 with clean DTS bundle.

### T5.1 — Verify build succeeds post-Phase 0

#### Objective
After Zod fix + CorsConfig fix, the DTS error at `vite-plugin/index.ts:192` is gone. Verify end-to-end build + check for any other DTS error.

#### Evidence
Pre-T0: `Type '{ origins?: any; ... }' is not assignable to type 'CorsConfig'` at line 192 — single error blocking entire DTS build.

#### Files to edit
```
packages/theo/src/... — any file with residual DTS error
tests/integration/theokit-build-succeeds.test.ts (NEW) — gate test
```

#### Deep file dependency analysis
- Post-T0, the CorsConfig issue should be gone. If any other DTS error surfaces (from a different root cause), fix individually.

#### Tasks
1. Run `pnpm --filter theokit build` post-T0+T4.1.
2. If any DTS error, fix.
3. Write gate test.

#### TDD + BDD

```
RED: test_theokit_build_exit_zero — Given workspace, When `pnpm --filter theokit build` invoked, Then exit 0.
RED: test_dts_outputs_present — Given build complete, When dist/ inspected, Then dist/index.d.ts + dist/server/index.d.ts exist.
RED: test_dts_exports_include_jobs — Given dist/server/index.d.ts, When grepped, Then 'defineJob' export present.
RED: test_dts_exports_include_crons — Given same, Then 'defineCron' export.
RED: test_dts_exports_include_webhook — Given same, Then 'defineWebhook' export.
RED (edge): test_dts_no_anys_in_public_api — Given dist/server/index.d.ts, When grepped for ':any\b', Then 0 hits.
GREEN: Fix any residual DTS errors.
REFACTOR: None.
VERIFY: pnpm --filter theokit build 2>&1 | tail -5
```

BDD scenarios:
- Happy path: build clean
- Validation error: DTS error → fix
- Edge case: `any` leaks → fix type
- Error scenario: tsup config issue → fix tsup.config.ts

#### Acceptance Criteria
- [ ] All 6 RED tests pass
- [ ] `pnpm --filter theokit build` exit 0
- [ ] DTS bundles include all Phase 0-6 (anterior plan) primitives
- [ ] No `any` in public API surface

#### DoD
- [ ] All tasks completed
- [ ] Build succeeds
- [ ] DTS valid

---

### T5.2 — `publint` + `attw` clean

#### Objective
Per release-readiness: `publint` (validates `package.json exports`, `files`, etc.) and `@arethetypeswrong/cli` (validates type resolution for npm consumers) both report green.

#### Evidence
Standard dogfood Phase 19 of the existing `dogfood` skill runs both. Post-T5.1, these should pass.

#### Files to edit
```
packages/theo/package.json — if publint reports issues, fix
tests/integration/publint-attw-green.test.ts (NEW)
```

#### Deep file dependency analysis
- `publint`: checks `package.json exports` map, `files` field, etc.
- `attw`: validates that TypeScript resolution works for ESM + CJS consumers.

#### Tasks
1. Run `pnpm exec publint packages/theo`.
2. Run `pnpm exec @arethetypeswrong/cli --pack packages/theo`.
3. Fix any reported issues in `package.json`.

#### TDD + BDD

```
RED: test_publint_all_good — Given packages/theo, When publint, Then "All good!" in output.
RED: test_attw_no_problems — Given packed theokit, When attw, Then "No problems".
RED (edge): test_no_files_field_missing — Given package.json, When inspected, Then "files" field present.
RED (error): test_exports_map_includes_server — Given package.json exports, When parsed, Then "./server" path defined.
GREEN: Fix any issues.
REFACTOR: None.
VERIFY: pnpm exec publint packages/theo && pnpm exec @arethetypeswrong/cli --pack packages/theo
```

BDD scenarios:
- Happy path: both tools clean
- Validation error: missing export → fix
- Edge case: ESM-only consumer broken → adjust exports
- Error scenario: type-resolution path wrong → fix

#### Acceptance Criteria
- [ ] All 4 RED tests pass
- [ ] publint "All good!"
- [ ] attw "No problems"

#### DoD
- [ ] All tasks completed
- [ ] Both tools green

---

## Phase 6: Deploy adapter validation (Vercel — at minimum)

**Objective:** Validate `theokit build --target=vercel` produces a deployable artifact. Optional: smoke test against real Vercel deployment (deferred to operational track if requires npm publish first).

### T6.1 — Vercel adapter build + structural smoke

#### Objective
`theokit build --target=vercel` on fixture/example produces correct `.vercel/output/` structure per Vercel Build Output API v3.

#### Evidence
Macro roadmap item #7 (deploy validation) pending; R0.5.1 (Vercel SSE deploy) pending.

#### Files to edit
```
tests/integration/vercel-adapter-build-smoke.test.ts (NEW)
examples/deploy-vercel/ (existing — verify still builds)
```

#### Deep file dependency analysis
- `examples/deploy-vercel/`: existing example. Run `theokit build --target=vercel` against it.
- Assertions: `.vercel/output/config.json` valid, `.vercel/output/functions/` contains expected handlers.

#### Deep Dives
- **Real deploy NOT in this plan** — requires npm publish + Vercel auth. This task validates STRUCTURE only.
- **Edge case:** existing vercel.json with user config preserved (EC-105).
- **EC-207 (SHOULD TEST) — `pnpm install` precondition for `examples/deploy-vercel/`:** workspace fixtures may NOT have their `node_modules/` populated freshly in CI (especially on fresh clones). Test script MUST check `test -d examples/deploy-vercel/node_modules` first; if missing, run `pnpm install --filter ./examples/deploy-vercel` automatically (or fail fast with actionable message).

#### Tasks
1. **EC-207:** check + ensure `pnpm install --filter ./examples/deploy-vercel` if `node_modules` missing.
2. Run `theokit build --target=vercel` against `examples/deploy-vercel/`.
3. Assert output structure.
4. Document the manual real-deploy procedure for the operational track.

#### TDD + BDD

```
RED: test_vercel_build_produces_output_dir — Given fixture, When build --target=vercel, Then .vercel/output/ exists.
RED: test_vercel_output_config_valid_json — Given .vercel/output/config.json, When parsed, Then valid JSON with version field.
RED: test_vercel_functions_dir_populated — Given build output, When .vercel/output/functions/ inspected, Then route handlers present.
RED: test_vercel_static_assets_present — Given build output, When .vercel/output/static/ inspected, Then app shell present.
RED (edge): test_existing_vercel_json_preserved — Given existing vercel.json with custom fields, When build, Then those fields preserved (EC-105).
RED (EC-207): test_vercel_example_has_node_modules_or_script_installs_first — Given `examples/deploy-vercel/`, When integration script runs, Then either node_modules pre-exists OR `pnpm install --filter` ran successfully before build.
GREEN: Verify adapter; fix if issues.
REFACTOR: None.
VERIFY: cd examples/deploy-vercel && rm -rf .vercel && npx tsx ../../packages/theo/src/cli/index.ts build --target=vercel && ls .vercel/output/
```

BDD scenarios:
- Happy path: structural build correct
- Validation error: output schema wrong → fix adapter
- Edge case: existing config preserved
- Error scenario: missing required field → fix

#### Acceptance Criteria
- [ ] All 6 RED tests pass (5 base + 1 EC-207)
- [ ] `.vercel/output/` structure matches Vercel Build Output API v3
- [ ] Documentation file `docs/concepts/deploy-vercel.md` (NEW) — manual deploy procedure
- [ ] EC-207: integration script is idempotent (re-runs clean even without pre-installed node_modules)

#### DoD
- [ ] All tasks completed
- [ ] Build smoke green
- [ ] Doc written

---

## Phase 7: DOGFOODING EXCLUSIVO (5 sub-fases)

**Objective:** Definitive proof that the system works end-to-end as a real user would experience. Sessão exclusiva conforme solicitado.

> **Critical:** Dogfooding NOT done until ALL 5 sub-phases pass. The plan is NOT complete until Phase 7 health ≥ 90/100.

### T7.1 — Sub-fase A: Standard `/dogfood full` — 22 phases

#### Objective
Run the standard dogfood skill's 22-phase suite. ZERO skipped phases. Health ≥ 80/100 from this sub-phase alone.

#### Evidence
Previous dogfood (`docs/audit/dogfood-2026-05-24-jobs-crons-webhooks.md`) skipped 4 phases. This time, all 22 phases MUST run.

#### Files to edit
```
docs/audit/dogfood-2026-MM-DD-100-percent-full-22.md (NEW — output)
```

#### Deep file dependency analysis
- Invokes existing `dogfood` skill (`.claude/skills/dogfood/SKILL.md`).
- Output: per-phase score, total health, CRITICAL/HIGH issue list.

#### Deep Dives
- **Pre-conditions** (must be green BEFORE this sub-phase):
  - Phase 0 complete (Zod fix)
  - Phase 4 complete (full test suite green)
  - Phase 5 complete (theokit build succeeds)
- **22 phases include:** Pre-flight, Scaffold default, Scaffold all templates, Frontend dev, API+actions+middleware, Cookies, Build+manifest, Production server, E2E Playwright, HMR, DX evaluation, Typed client+serialization, Auth system, Env/errors/rate/config, SSR, WebSocket+channels, Generators, Deploy adapters, Build pipeline+package validation, Naming+README integrity, Regression, Cross-validation features.

#### Tasks
1. Ensure pre-conditions met.
2. Invoke `/dogfood full`.
3. Read report.
4. Triage CRITICAL/HIGH issues.

#### TDD + BDD

```
RED (gate): assert_dogfood_report_exists — Given /dogfood full invoked, When complete, Then docs/audit/dogfood-{date}-*.md exists.
RED (gate): assert_health_score_at_least_80 — Given report, When parsed, Then health score ≥ 80.
RED (gate): assert_zero_critical_issues — Given report, When CRITICAL count parsed, Then 0.
RED (gate): assert_zero_skipped_phases_due_to_blockers — Given report, When phase scores read, Then no phase scored 0 due to "blocked by other".
GREEN: Run dogfood; fix CRITICAL/HIGH iteratively until pass.
REFACTOR: None (meta-task).
VERIFY: head -30 docs/audit/dogfood-*-100-percent-full-22.md
```

BDD scenarios:
- Happy path: 22 phases all green
- Validation error: CRITICAL found → fix + re-run
- Edge case: HIGH but acceptable → document with rationale
- Error scenario: skill itself errors → debug skill prerequisites

#### Acceptance Criteria
- [ ] All 4 RED gates pass
- [ ] Health ≥ 80
- [ ] Zero CRITICAL
- [ ] ALL 22 phases scored > 0

#### DoD
- [ ] All tasks completed
- [ ] Report saved + committed
- [ ] CRITICAL/HIGH list = empty

---

### T7.2 — Sub-fase B: Jobs+Crons+Webhooks+Cost specific dogfood

#### Objective
The 4 primitives delivered in the previous plan are tested end-to-end as a real user would discover them.

#### Files to edit
```
docs/audit/dogfood-2026-MM-DD-100-percent-jobs-crons.md (NEW)
```

#### Deep Dives
- **End-to-end scenarios:**
  1. Scaffold project with `npx tsx create-theo my-test`
  2. Add `server/crons/test.ts` with `*/1 * * * *` schedule
  3. Run `theokit dev` for 2 min — verify handler fires ≥ 1 time
  4. Add `server/jobs/echo.ts` + `server/routes/enqueue.ts` calling `ctx.queue.enqueue('echo', ...)`
  5. POST to `/api/enqueue` — verify job dispatches within 1s
  6. Add `server/webhooks/stripe.ts` with `stripe(...)` verify
  7. Send signed POST → 200; send invalid → 401
  8. Configure `cost.storage: new InMemoryUsageStorage()`
  9. Hit `defineAgentEndpoint` with stubbed Agent.prompt
  10. Query `usageStorage.getUsage()` → non-zero

#### Tasks
1. Scaffold + execute each scenario.
2. Document evidence per scenario.

#### TDD + BDD

```
RED: test_cron_fires_in_dev_server — Given scaffold + cron + theokit dev, When 2 min pass, Then handler logged ≥ 1 time.
RED: test_job_dispatched_via_ctx_queue — Given route enqueues echo job, When POST hit, Then dispatched within 1s.
RED: test_stripe_webhook_signed_request_200 — Given valid Stripe sig, When POST, Then 200.
RED: test_stripe_webhook_invalid_sig_401 — Given invalid sig, When POST, Then 401.
RED: test_track_agent_run_persists_to_storage — Given configured storage + agent endpoint hit, When getUsage queried, Then non-zero.
RED (edge): test_cron_handler_with_concurrency_forbid — Given slow handler + concurrency forbid, When second tick, Then skipped + warning.
GREEN: Execute scenarios; capture evidence.
REFACTOR: None.
VERIFY: cat docs/audit/dogfood-*-100-percent-jobs-crons.md
```

BDD scenarios:
- Happy path: each primitive works end-to-end
- Validation error: invalid input → expected error response
- Edge case: concurrency forbid skips overlap
- Error scenario: misconfigured webhook → 401, not 500

#### Acceptance Criteria
- [ ] All 6 RED scenarios pass
- [ ] Evidence captured per scenario (logs, HTTP responses, file contents)
- [ ] Report saved

#### DoD
- [ ] All tasks completed
- [ ] Evidence committed

---

### T7.3 — Sub-fase C: Pre-existing regression sweep

#### Objective
Ensure NOTHING that worked in `develop` branch (pre-this plan) was broken by Phase 0-6.

#### Files to edit
```
docs/audit/dogfood-2026-MM-DD-100-percent-regression.md (NEW)
```

#### Deep Dives
- **Regression matrix:**
  - All previous fixture-N-mandatory tests still pass
  - All previous adapter tests still pass
  - `theokit dev`, `theokit start`, `theokit build` (all targets) all work
  - All public exports from `theokit/server`, `theokit/client`, `theokit/vite-plugin` unchanged shape

#### Tasks
1. Run `pnpm test` full.
2. Compare test count to baseline (`git log --oneline | head -5` for context).
3. Confirm zero net losses.

#### TDD + BDD

```
RED: test_full_suite_passes — Given pnpm test, When complete, Then exit 0.
RED: test_test_count_grew_or_stable — Given previous baseline (~2300), When current count read, Then ≥ baseline.
RED: test_no_previously_passing_test_now_skipped — Given test reporter, When previously-passing tests checked, Then status === passed (not skipped).
RED (edge): test_no_dependency_cruiser_regression — Given dep-cruiser, When run, Then 0 violations.
GREEN: Identify + fix any regression.
REFACTOR: None.
VERIFY: pnpm test 2>&1 | grep "Tests" | tail -1
```

BDD scenarios:
- Happy path: zero regressions
- Validation error: any regression identified + fixed
- Edge case: test slowness regression → optimize
- Error scenario: lint regression → fix

#### Acceptance Criteria
- [ ] All 4 RED tests pass
- [ ] Net test count ≥ baseline
- [ ] No regressed test marked .skip

#### DoD
- [ ] All tasks completed
- [ ] Regression report committed

---

### T7.4 — Sub-fase D: Scaffold → build → start E2E

#### Objective
Validate the complete user journey: fresh scaffold → install → build → start production server → live HTTP smoke.

#### Files to edit
```
scripts/e2e-scaffold-build-start.sh (NEW)
docs/audit/dogfood-2026-MM-DD-100-percent-e2e.md (NEW)
```

#### Deep Dives
- **Steps:**
  1. `rm -rf /tmp/theokit-e2e-* && mkdir /tmp/theokit-e2e-{ts}`
  2. `cd /tmp/theokit-e2e-{ts} && npx tsx <path-to-create-theo>/bin.ts my-app`
  3. `cd my-app && pnpm install`
  4. `pnpm theokit build`
  5. **EC-204:** pick a random free port `PORT=$(comm -23 <(seq 49152 65535 | sort) <(ss -Hltn | awk '{print $4}' | sed 's/.*://' | sort -u) | head -1)`
  6. `PORT=$PORT pnpm theokit start &` (background); capture PID via `SERVER_PID=$!`
  7. **EC-204:** wait for bind with timeout: `until curl -sf http://localhost:$PORT/ > /dev/null; do sleep 0.1; [ $((++TRIES)) -gt 100 ] && exit 1; done` (10s ceiling)
  8. `curl -s http://localhost:$PORT/` → 200, contains "Hello Theo"
  9. `curl -s http://localhost:$PORT/api/health` → 200, JSON
  10. `kill $SERVER_PID` (NOT `kill %1` — explicit PID survives script reinvocation contexts)
- **EC-204 (MUST FIX) — port conflict + race-to-bind:** the original script used hardcoded port 3000 and `kill %1`. Both fail in real CI: port 3000 may be in use (other test, sidecar, dev server) AND `kill %1` only works in interactive shells with job control. Random ephemeral port (49152-65535 range, IANA-recommended) + explicit `$SERVER_PID` capture + wait-for-bind loop with 10s ceiling resolves all three risks.

#### Tasks
1. Write the bash script with EC-204 patterns (random port + wait-for-bind + explicit PID).
2. Run it; capture all output.
3. Document pass/fail per step.

#### TDD + BDD

```
RED: test_scaffold_succeeds — Given npx create-theo, When invoked, Then exit 0 + my-app/ directory present.
RED: test_pnpm_install_in_scaffold_succeeds — Given my-app, When pnpm install, Then exit 0 + node_modules present.
RED: test_build_in_scaffold_succeeds — Given my-app, When pnpm theokit build, Then exit 0 + .theo/ present.
RED: test_start_serves_root — Given my-app + theokit start, When curl /, Then 200 + "Hello Theo".
RED: test_start_serves_health_api — Given same, When curl /api/health, Then 200 + JSON.
RED (edge): test_start_shutdown_clean — Given running server, When SIGTERM, Then process exits cleanly within 5s.
RED (EC-204): test_e2e_handles_port_conflict_with_random_port — Given port 3000 in use (simulated by pre-binding), When script runs, Then picks different ephemeral port + still succeeds end-to-end.
RED (EC-204): test_e2e_waits_for_server_bind — Given slow server startup (simulated delay), When script runs, Then wait-loop succeeds within 10s ceiling OR fails fast with actionable timeout.
GREEN: Fix any failing step.
REFACTOR: None.
VERIFY: bash scripts/e2e-scaffold-build-start.sh
```

BDD scenarios:
- Happy path: full journey works
- Validation error: any step fails → fix
- Edge case: port conflict → script picks free port
- Error scenario: scaffold network failure → retry logic

#### Acceptance Criteria
- [ ] All 8 RED tests pass (6 base + 2 EC-204)
- [ ] Script idempotent (re-runs clean)
- [ ] Script uses random ephemeral port (NEVER hardcoded 3000)
- [ ] Script uses explicit `$SERVER_PID` for kill (NEVER `kill %1`)
- [ ] Wait-for-bind loop has 10s ceiling (fails fast, never hangs CI)
- [ ] Evidence captured

#### DoD
- [ ] All tasks completed
- [ ] Script committed
- [ ] E2E report committed

---

### T7.5 — Sub-fase E: Production-shape stress + audit

#### Objective
Final production-shape audit: bundle size, latency, memory, security headers.

#### Files to edit
```
docs/audit/dogfood-2026-MM-DD-100-percent-prod-shape.md (NEW)
```

#### Deep Dives
- **Bundle size:** `pnpm theokit build` on default template → `dist/assets/index-*.js` gzipped ≤ 350 KB
- **Cold start:** `theokit start` time-to-first-200 ≤ 1.5s
- **HMR latency in dev:** edit `app/page.tsx` → browser refresh ≤ 500ms
- **Security headers present in response:** CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Memory:** start server, hit 100 requests, RSS should stabilize (no leak)
- **EC-208 (SHOULD TEST) — bundle budget scope is `default` template ONLY:** the 350 KB number comes from CLAUDE.md baseline for default template (current 193.90 KB). Other templates (saas, dashboard, postgres, api-only) have more deps and MAY exceed 350 KB legitimately. Budget assertion applies ONLY to default; other templates are measured + recorded as informative baselines, NOT gated.
- **EC-211 (DOCUMENT) — 100-request memory test is a "smoke floor", not a leak detector:** sequential 100 GETs catches LARGE leaks (≥500KB/req) but NOT small ones (1KB/req). Small leaks only surface after days of production traffic — out of scope for Phase 7. Document as "smoke floor"; production-grade leak detection comes from real telemetry post-deploy, not from CI.

#### Tasks
1. Run each stress measurement.
2. Document numbers.
3. Compare to roadmap baselines (193.90 KB bundle, etc.).
4. **EC-208:** record bundle sizes for ALL templates (default + saas + dashboard + postgres + api-only); assert ONLY default ≤ 350 KB.
5. **EC-211:** add note in report that memory test is a smoke floor, not a definitive leak detector.

#### TDD + BDD

```
RED: test_bundle_size_under_350kb — Given default template build, When gzipped size read, Then ≤ 350_000 bytes.
RED: test_cold_start_under_1500ms — Given theokit start, When time-to-first-200 measured, Then ≤ 1500ms.
RED: test_security_headers_present — Given response from /, When headers inspected, Then CSP + X-Frame + X-Content-Type + Referrer-Policy all present.
RED: test_memory_stable_under_load — Given 100 sequential GET /api/health, When RSS measured before/after, Then delta ≤ 50MB.
RED (edge): test_no_uncaught_exceptions_in_logs — Given production run, When logs inspected, Then 0 "uncaughtException" entries.
RED (EC-208): test_bundle_budget_applies_only_to_default_template — Given build of all 5 templates, When sizes measured, Then assertion ≤ 350KB applies ONLY to default; saas/dashboard/postgres/api-only recorded as informative.
GREEN: Fix any miss (optimize, add header, etc.).
REFACTOR: None.
VERIFY: cat docs/audit/dogfood-*-100-percent-prod-shape.md
```

BDD scenarios:
- Happy path: all numbers within budget
- Validation error: bundle > 350KB → identify culprit, optimize
- Edge case: HMR latency variable → measure 10-run average
- Error scenario: memory leak → fix + re-measure

#### Acceptance Criteria
- [ ] All 6 RED tests pass (5 base + 1 EC-208)
- [ ] All numbers documented + within budget
- [ ] No security headers missing
- [ ] EC-208: bundle sizes for ALL 5 templates recorded; only default has assertion
- [ ] EC-211: memory test annotated as "smoke floor" in report

#### DoD
- [ ] All tasks completed
- [ ] Production-shape report committed
- [ ] Numbers tracked vs roadmap baselines

---

## Coverage Matrix

| # | Gap / Blocker | Task(s) | Resolution |
|---|---|---|---|
| 1 | B1 — CorsConfig DTS error | T0.1 + T0.2 + T5.1 | Zod single-version pin + schema inference verified + build green |
| 2 | B2 — Zod 3/4 dual-version 100+ TS errors | T0.1 | pnpm.overrides forces 3.25.76 |
| 3 | B3 — 38 test files failing | T4.1 | Cascade auto-resolves post-T0; residual fixed individually |
| 4 | B4 — Outbox not wired in execute.ts | T2.1 | Per-request outbox + lifecycle hooks |
| 5 | B5 — Cron/job manifest not wired in build.ts | T1.1 + T1.2 | Scanner + emit + adapter dispatch in CLI |
| 6 | B6 — Postgres real-CI test missing | T3.1 | GHA workflow with postgres:15-alpine service |
| 7 | `pnpm typecheck` clean | T0.3 | Gate test + per-file fixes |
| 8 | `pnpm test` clean | T4.1 | Cascade resolution + gate test |
| 9 | `pnpm --filter theokit build` clean | T5.1 | DTS gate test |
| 10 | publint + attw green | T5.2 | Both tools invoked + fixed |
| 11 | `ctx.queue.enqueue` from defineRoute works | T2.1 | Outbox wired |
| 12 | `theokit build --target=vercel` emits crons | T1.1 + T6.1 | CLI wiring + Vercel adapter smoke |
| 13 | JobRegistry augmentation example in scaffold | T2.2 | types/jobs.d.ts.tmpl |
| 14 | Documentation for deploy procedure | T6.1 | docs/concepts/deploy-vercel.md |
| 15 | Standard /dogfood full passes | T7.1 | ≥80 health + 0 CRITICAL |
| 16 | Jobs+crons+webhooks E2E validated | T7.2 | 6 scenario tests |
| 17 | Zero regression vs pre-plan | T7.3 | Full suite ≥ baseline |
| 18 | Scaffold→build→start E2E | T7.4 | bash script + 6 RED tests |
| 19 | Production-shape audit | T7.5 | Bundle/latency/memory/headers verified |
| 20 | Pre-publish gate | Final Phase | publint + attw + npm pack |
| 21 | EC-201 `--target` flag precedence over config.adapters[] | T1.1 | `--target` authoritative; informative stdout note for cross-reference |
| 22 | EC-202 plugin `decorateRequest('queue')` collision | T2.1 | `DuplicateContextKeyError` thrown fail-loud; never silent override |
| 23 | EC-203 SDK-rooted TS errors in examples/full-stack-agent | T0.3 | Pre-flight grep isolates SDK-rooted vs Zod-rooted; SDK gap documented in pre-flight audit, excluded from gate |
| 24 | EC-204 T7.4 port conflict + bind race | T7.4 | Random ephemeral port + wait-for-bind loop with 10s ceiling + explicit `$SERVER_PID` |
| 25 | EC-205 orphan `@ts-expect-error` after Zod fix | T4.1 | Grep gate; lint catches unused expect-error directives |
| 26 | EC-206 outbox + long-poll streaming memory safety | T2.1 | Test asserts 30s long-poll + 10 enqueues = no leak |
| 27 | EC-207 `examples/deploy-vercel/` pnpm install precondition | T6.1 | Script auto-installs node_modules if missing |
| 28 | EC-208 bundle budget scope (default template only) | T7.5 | Assertion only on default; others recorded as informative |
| 29 | EC-209 `z.custom<>()` fallback documentation | T0.2 | JSDoc note in corsSchema |
| 30 | EC-210 pnpm overrides bypasses peer-dep validation | T0.1 | Documented in package.json comment + T0.1b fallback if knip fails |
| 31 | EC-211 memory test is "smoke floor", not leak detector | T7.5 | Documented in production-shape report |

**Coverage: 31/31 gaps covered (100%)**

## Global Definition of Done

- [ ] All 7 phases completed (Phase 0–7)
- [ ] All RED → GREEN tests passing (~60+ new tests across phases)
- [ ] Zero TypeScript errors (`pnpm typecheck` exit 0)
- [ ] Zero ESLint warnings (`pnpm lint` exit 0)
- [ ] `pnpm test` exit 0 (all 2500+ tests green)
- [ ] `pnpm --filter theokit build` exit 0 (DTS clean)
- [ ] `pnpm exec dependency-cruiser packages/theo/src/ --validate` 0 violations
- [ ] `pnpm exec ls-lint` 0 violations
- [ ] `pnpm exec publint packages/theo` "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo` "No problems"
- [ ] Backward compatibility preserved (`theokit/server` exports add-only, no removals)
- [ ] CHANGELOG `[Unreleased]` updated per phase
- [ ] **Dogfood QA Phase 7** — ALL 5 sub-phases pass with health ≥ 90/100 aggregate
- [ ] **Fixture proof** — all primitives still have reproducible fixtures
- [ ] **Architecture diff** — `/architecture-docs server` re-run; user confirms

### Plan-specific criteria

- [ ] Single Zod version installed (3.25.76)
- [ ] `vite-plugin/index.ts:192` compiles clean (was the canonical DTS error)
- [ ] `ctx.queue.enqueue` from `defineRoute` handler works without user boilerplate
- [ ] `theokit build --target=vercel` emits valid `.vercel/output/` + preserves user `vercel.json`
- [ ] Real-Postgres CI workflow runs on PR + main push
- [ ] Bundle size for default template ≤ 350 KB gzipped
- [ ] Security headers present on every response (CSP, X-Frame, X-Content-Type, Referrer-Policy)
- [ ] **EC-201**: `--target` flag is authoritative; `config.adapters[]` is informative-only (1 RED test asserts)
- [ ] **EC-202**: `DuplicateContextKeyError` exported + thrown on plugin/framework `ctx.queue` collision (2 RED tests)
- [ ] **EC-203**: pre-flight audit doc records SDK-rooted error count separately from Zod-rooted
- [ ] **EC-204**: T7.4 script uses random ephemeral port + wait-for-bind loop + explicit PID kill
- [ ] **EC-205**: zero orphan `@ts-expect-error` directives post-Zod fix
- [ ] **EC-206**: long-poll streaming + 10 enqueues verified memory-safe
- [ ] **EC-207**: T6.1 script idempotent (auto-installs node_modules if missing)
- [ ] **EC-208**: bundle budget assertion scoped to default template only
- [ ] All 11 EC-201..EC-211 either implemented (MUST FIX), tested (SHOULD TEST), or documented (DOCUMENT) per coverage matrix above

## Final Phase: Dogfood QA (MANDATORY)

> Phase 7 IS the dogfood QA. Standard template `/dogfood full` is Sub-phase A (T7.1). This Final Phase is the wrap-up + pre-publish gate.

**Objective:** Sign off the entire plan — every gate green, every primitive validated, ready for `pnpm publish`.

### Execution

Run Phase 7 in order (T7.1 → T7.2 → T7.3 → T7.4 → T7.5). Aggregate health.

### Acceptance Criteria

- [ ] T7.1 health ≥ 80
- [ ] T7.2 all 6 scenarios pass
- [ ] T7.3 zero regression
- [ ] T7.4 full E2E green
- [ ] T7.5 all production-shape numbers within budget
- [ ] Aggregate health ≥ 90/100
- [ ] Zero CRITICAL issues introduced by this plan
- [ ] Zero HIGH issues in modified code paths
- [ ] Pre-existing issues documented in `docs/audit/dogfood-2026-MM-DD-100-percent-pre-existing.md` (if any)

### Pre-publish gate (at the END of Phase 7)

After all 5 sub-phases pass:

- [ ] `pnpm --filter theokit build` — green
- [ ] `pnpm exec publint packages/theo` — "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo --ignore-rules cjs-resolves-to-esm no-resolution` — "No problems"
- [ ] `pnpm pack packages/theo` — produces valid tarball
- [ ] Tarball contents inspected — no node_modules, no .git, no source maps without explicit opt-in

### If any sub-phase fails

1. Identify ROOT CAUSE — Phase 0-6 regression OR pre-existing OR new bug.
2. If Phase 0-6 regression → fix in the originating phase, re-run all subsequent phases.
3. If pre-existing → document, exclude from blocking (per existing dogfood policy).
4. If new bug discovered during dogfood → add as new task in next phase iteration.

---

## Notes on Skill Process

- **`/architecture-docs server` BEFORE skipped** — the existing snapshot from `architecture-review-remediation-plan` (2026-05-23) is recent enough; this plan touches only `http/execute.ts`, `cli/commands/build.ts`, and `config/schema.ts` (typing fix only). AFTER snapshot will capture the wired primitives.
- **`/edge-case-plan system-100-percent-functional`** — invoke immediately after this plan is saved. The 7 blockers in this plan are highly concrete; edge cases will likely cluster around T0.1 (pnpm overrides edge cases — knip compatibility, transitive dep churn) and T2.1 (outbox lifecycle race conditions).
- **`/cross-validation system-100-percent-functional`** — invoke AFTER implementation completes, BEFORE Phase 7 dogfood.
