---
status: accepted
date: 2026-05-28
deciders: paulo
consulted: claude
informed: theo-ui-maintainers
---

# ADR 0020: Workspace-link cross-repo para `theo-ui/` é OPT-IN; SDK permanece como link permanente (assimetria intencional)

## Context and Problem Statement

`theokit/pnpm-workspace.yaml` JÁ inclui `../theokit-sdk/packages/{sdk,gateway,gateway-telegram}` como workspace permanente — edição local no SDK reflete imediatamente. Decisão tomada antes deste plano.

`../theo-ui/` ficou deliberadamente de fora. `theokit/CLAUDE.md` linha 135 (versão 2026-05-22) declara: "Do not add `theo-ui/` to `pnpm-workspace.yaml` casually — that's a strategic-review-worthy decision."

**Por quê de fora?** Adicionar UI ao workspace default unifica dev mas:
- Destroi o ciclo "publish-and-bump valida exports/build" — a UI deixa de ter incentivo de buildar `dist/` antes de publicar.
- CI passa a depender de checkout do sibling para passar.

**Problema:** loop de iteração cross-repo UI ↔ theokit hoje é ~10min (edit → build → publish next → bump → install → restart). Documentado no baseline §3.

## Decision Drivers

1. **KISS** — solução não pode introduzir complexidade meta-tooling cross-repo (`meta`, `mu-repo` etc).
2. **Preservar sinal de "publish-and-bump funciona"** — CI deve continuar validando o release path.
3. **Honestidade** — assimetria SDK vs UI deve ser visível, justificável, documentada.

## Considered Options

### Opção A — Promover `theo-ui/` para workspace default permanente (REJEITADA)
Viola CLAUDE.md linha 135; remove sinal de "publish-and-bump valida o build".

### Opção B — `pnpm link --global` documentado (FALLBACK)
Frágil — link global polui outros checkouts; não cobre subpath exports limpamente. Aceitar como plano B se Opção C tiver edge case com pnpm@9.15.0.

### Opção C — Arquivo workspace alternativo opt-in (ACEITA)
`pnpm-workspace.linked-ui.yaml` (inerte por default). Scripts `pnpm theo-ui:link` / `unlink` fazem swap + `pnpm install`. CI sempre usa o canonical (sem link).

### Sobre SDK (re-confirmação):
**Mantém como workspace permanente (D5).** Razão: SDK é consumido pelo runtime de produção (`server/agent/*`, `define-agent-tool`, exemplos). Iteração rápida é crítica. UI é dep opcional via auto-detect — não há "import direto" em código de produção do framework. Assimetria é JUSTA pelo perfil de acoplamento.

## Decision Outcome

**Decisão A (UI opt-in):**

- `theokit/pnpm-workspace.linked-ui.yaml` — cópia do `pnpm-workspace.yaml` + uma linha `- '../theo-ui'`. INERTE por default.
- `theokit/scripts/theo-ui-link.sh` — guards: (1) `../theo-ui` exists, (2) `../theo-ui/dist/vite-plugin.js` exists (EC-5 fix), (3) `.bak` ausente. Copia workspace alt sobre default, preserva `.bak`, roda `pnpm install`.
- `theokit/scripts/theo-ui-unlink.sh` — restaura `.bak`, roda `pnpm install`.
- Pre-commit hook **com ordem explícita (EC-3)**: GATE 1 `.bak` check antes de GATE 2 `check:templates`. Bloqueia commit-com-link, força `--no-verify` é proibido (CLAUDE.md global §4).
- CI **sempre** usa `pnpm-workspace.yaml` canonical (sem link). `.gitignore` cobre `.bak`.

**Decisão B (SDK status quo):** Não tocar `pnpm-workspace.yaml` entries do SDK. Documentar assimetria em `theokit/CLAUDE.md` + `CONTRIBUTING.md`.

### Consequences

**Positivas:**
- Loop dev cross-repo UI cai de ~10min para <60s (medido via Cenário C do Dogfood).
- CI continua sendo canary de "publish-and-bump path".
- Sinal preservado: contributor tem que fazer "publish" explicitamente (via `--write` mode do sync + Changesets) para release.

**Negativas:**
- Mais 2 scripts bash + 1 arquivo workspace alt.
- Contributor precisa lembrar de `unlink` antes de commit (pre-commit hook força).
- Doc adicional em `CONTRIBUTING.md` para cuidados (EC-9: 1 terminal/checkout; EC-10: dois repos = dois commits).

## Pros and Cons of the Options

| Opção | Prós | Contras |
|---|---|---|
| A (workspace default) | Loop rápido sempre | Destroi sinal publish; CI depende de sibling |
| B (pnpm link --global) | Sem arquivos novos | Polui global; subpath exports edge |
| **C (workspace alt opt-in)** | **Rápido sob demanda + sinal preservado** | **2 scripts + 1 arquivo + 1 hook order** |

## More Information

- **Plano:** T3.1 + T3.2.
- **Baseline:** [`cross-repo-coesao-2026-05-28.md`](../../../.claude/knowledge-base/baselines/cross-repo-coesao-2026-05-28.md) §3 (loop iteração) + §5 (workspace state).
- **CLAUDE.md atualização:** T3.2 (linhas 125 + 135).
- **Mirror ADR SDK:** [`../../../theokit-sdk/docs/adr/0001-workspace-link-default-status-quo.md`](../../../theokit-sdk/docs/adr/0001-workspace-link-default-status-quo.md).
- **EC-3 fix:** pre-commit hook ordering documented explicitly.
- **EC-5 fix:** script verifica `dist/vite-plugin.js` existente antes de ativar link.
- **EC-9 / EC-10 docs:** seção "Cuidados" no `CONTRIBUTING.md`.
- **Fallback B (`pnpm link --global`):** aceitar se C tiver edge case empírico com pnpm@9.15.0.
