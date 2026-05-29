---
status: accepted
date: 2026-05-28
deciders: paulo
consulted: claude
informed: theokit-sdk-maintainers, theo-ui-maintainers
---

# ADR 0018: `@usetheo/ui/vite-plugin` é contrato VERSIONADO + contract test cross-repo executa contra `dist/` real

## Context and Problem Statement

A integração entre `theokit` e `@usetheo/ui` é hoje **100% implícita**: `theokit/packages/theo/src/vite-plugin/integrate-ui.ts` resolve `node_modules/@usetheo/ui/dist/vite-plugin.js` via filesystem walk e faz `await import()` dinâmico. Quando o contrato quebra (factory muda shape, dist ausente, subpath export removido), o `integrate-ui.ts` degrada silenciosamente para `[]` com `console.warn` em stderr — invisível em CI e em produção.

`theokit/packages/theo/package.json` NÃO declara `@usetheo/ui` em `peerDependencies`, `dependencies` nem `optionalDependencies`. O `pnpm install` no app do usuário NÃO emite warn em mismatch de versão.

Existe spike `theokit/docs/spikes/usetheo-ui-vite-plugin-shape.md` (Status anterior: PROPOSED) que descreve o API shape esperado, peer-dep matrix e acceptance criteria — mas estava sem sign-off cross-repo.

## Decision Drivers

1. **Honestidade — falhe alto, falhe cedo, falhe claro** (CLAUDE.md global §8). Silent fallback é o tipo mais perigoso de bug.
2. **Não reinvente — use pipelines nativos** (CLAUDE.md global §9). `peerDependencies` + `publint`/`attw` + dynamic import test são contratos padrão; não precisamos de DSL própria.
3. **DRY — source of truth única** (CLAUDE.md global §12). O range suportado vive em UM lugar: `package.json:peerDependencies`.
4. **Testes que provam comportamento, não estrutura** (CLAUDE.md global §7). Mock de `@usetheo/ui` mascararia drift exatamente como mock de DB mascara bugs de migration. Único teste honesto: executar contra `dist/` real.

## Considered Options

### Opção A — Status quo: filesystem walk + console.warn (REJEITADA)
Manter contrato 100% implícito. **Por quê não:** 11 silent fallback paths em `integrate-ui.ts` confirmados pelo baseline 2026-05-28. CI não detecta regressões; drift descoberto em produção.

### Opção B — `@usetheo/ui` como `dependency` regular (REJEITADA)
Força `pnpm install theokit` a sempre baixar UI mesmo se app não usar. **Por quê não:** UI é opt-in (apps `api-only` não precisam); seria over-installation.

### Opção C — `@usetheo/ui` como `optionalDependencies` (REJEITADA)
Comportamento variável entre PMs; warn é silenciado. **Por quê não:** opaco — não é o sinal que queremos.

### Opção D — `@usetheo/ui` como `peerDependencies` + `peerDependenciesMeta.optional: true` (ACEITA)
Range explícito + optional via meta. PM emite warn em mismatch (D vs ausente). `publint`/`attw` validam shape.

### Sobre o contract test:
- **B1** — Mock-based unit test (REJEITADA): não detecta drift real do `dist/`.
- **B2** — Integration test executando `await import(real-dist-path)` nos DOIS lados (ACEITA): único teste honesto.

## Decision Outcome

**Decisão A (peer dep):** `theokit/packages/theo/package.json` declara:

```jsonc
{
  "peerDependencies": { "@usetheo/ui": "^0.12.0-next.0" },
  "peerDependenciesMeta": { "@usetheo/ui": { "optional": true } }
}
```

Range fechado `^0.12.0-next.0` segue semver caret pre-release semantics: aceita `0.12.0-next.X` (X >= 0) mas exclui `0.13.0-*`. Subida de minor da UI **força** bump explícito em `theokit/`.

**Decisão B (contract test):** Dois contract tests, um por lado:

- `theokit/tests/integration/contract-usetheo-ui-vite-plugin.test.ts` — 6 `it()` (5 contrato + 1 hoist guard EC-7) executando `await import(require_.resolve('@usetheo/ui/vite-plugin'))` real.
- `theo-ui/tests/contract/theokit-consumer.test.ts` — 5 `it()` espelho contra o próprio `dist/vite-plugin.js` via path absoluto `PKG_ROOT` (EC-1 fix: usar `fileURLToPath(import.meta.url)` em vez de `require_.resolve('./dist/...')` que resolve relativo ao arquivo do teste).

Hook `prepublishOnly` no `theo-ui/` exige `pnpm test:contract` antes de qualquer publish.

### Consequences

**Positivas:**
- Drift cross-repo bloqueado pelos dois lados.
- Subida de minor da UI vira PR forçado em `theokit/` (1 commit de bump).
- 11 silent warns viram falhas hard de CI.
- `pnpm install` emite warn em mismatch (premissa do D1, gated por EC-4 test).

**Negativas:**
- CI do `theokit/` ganha dependência forte na qualidade do `dist/` de `theo-ui/`. Quando UI quebra contrato, CI do `theokit/` quebra. **Aceito** — é o sinal que queremos.
- Custo: 1 commit de bump em `theokit/` por minor de UI.

### Ressalva (EC-11)

O range em `peerDependencies` é gate de **install-time** (warn via PM, validation via `publint`/`attw`). NÃO é lido em runtime pelo `integrate-ui.ts` (filesystem walk independente). Runtime validation é coberta pelo contract test T1.2. Adicionar version-check em runtime seria over-engineering (KISS).

## Pros and Cons of the Options

| Opção | Prós | Contras |
|---|---|---|
| A (status quo) | Zero mudança | Drift continua silencioso (mantém o bug) |
| B (dep regular) | Resolver instala automaticamente | Over-installation em apps que não usam UI |
| C (optionalDeps) | Permite ausência | Warn semantics opaca / variável |
| **D (optional peer)** | **Range explícito + warn nativo + opcional** | **1 commit/minor (aceito)** |

## More Information

- **Spike:** [`docs/spikes/usetheo-ui-vite-plugin-shape.md`](../spikes/usetheo-ui-vite-plugin-shape.md) — status: ACCEPTED via este ADR.
- **Plano:** [`.claude/knowledge-base/plans/cross-repo-integration-coesao-plan.md`](../../../.claude/knowledge-base/plans/cross-repo-integration-coesao-plan.md) (T1.1, T1.2, T1.3).
- **Baseline:** [`.claude/knowledge-base/baselines/cross-repo-coesao-2026-05-28.md`](../../../.claude/knowledge-base/baselines/cross-repo-coesao-2026-05-28.md) — 11 silent warn paths catalogados.
- **Mirror ADR no UI:** [`../../../theo-ui/docs/adr/0001-vite-plugin-subpath-export-contract.md`](../../../theo-ui/docs/adr/0001-vite-plugin-subpath-export-contract.md).
- **Edge case review:** [`.claude/knowledge-base/reviews/edge-cases/cross-repo-integration-coesao-edge-cases-2026-05-28.md`](../../../.claude/knowledge-base/reviews/edge-cases/cross-repo-integration-coesao-edge-cases-2026-05-28.md).
