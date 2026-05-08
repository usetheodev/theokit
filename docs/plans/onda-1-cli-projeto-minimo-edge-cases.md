# Edge Case Review — onda-1-cli-projeto-minimo

Data: 2026-05-08
Tasks analisadas: 8 (T0.1, T1.1, T2.1, T3.1, T4.1, T5.1, T5.2)
Edge cases encontrados: 7 (MUST FIX: 2, SHOULD TEST: 3, DOCUMENT: 2)

## MUST FIX

### EC-1: scaffold() — project name com caracteres inválidos para npm
- **Task afetada:** T2.1
- **Familia:** Input
- **Cenario:** Dev roda `npx create-theo My App!` ou `npx create-theo ../escape`. O nome vai direto no `package.json` como `"name"`. npm exige: lowercase, sem espaços, sem caracteres especiais (exceto hífens e pontos). Se não validar, o `pnpm install` posterior falha com erro genérico.
- **Impacto:** Experiência ruim — o dev acha que o scaffolding funcionou, mas install falha com erro confuso do npm sobre nome inválido.
- **Fix sugerido:** Adicionar validação no início de `scaffold()`: `if (!/^[a-z0-9][a-z0-9._-]*$/.test(projectName)) throw new Error("Invalid project name...")`. Converter o dir arg para nome válido: `path.basename(targetDir).toLowerCase().replace(/[^a-z0-9.-]/g, '-')`.

### EC-2: scaffold() — sem argumento (npx create-theo sem nome)
- **Task afetada:** T2.1
- **Familia:** Input
- **Cenario:** Dev roda `npx create-theo` sem argumento. `process.argv.slice(2)[0]` é `undefined`. Se não tratado, `path.resolve(cwd, undefined)` resulta em path inesperado ou crash.
- **Impacto:** Crash com stack trace em vez de mensagem útil.
- **Fix sugerido:** Em `cli.ts`, checar `if (!projectName) { console.error('Usage: create-theo <project-name>'); process.exit(1) }`.

## SHOULD TEST

### EC-3: theoPlugin — Windows path separators no virtual module
- **Task afetada:** T3.1
- **Familia:** Boundary
- **Cenario:** `resolve(projectRoot, 'app/page.tsx')` no Windows gera `C:\Users\...\app\page.tsx`. Vite espera forward slashes em import paths.
- **Teste sugerido:** `test_load_uses_forward_slashes() — Given theoPlugin on any OS, When load returns import path, Then path uses forward slashes only (no backslash)`
- **Fix:** Usar `.replace(/\\/g, '/')` no path gerado, ou usar `import { normalizePath } from 'vite'`.

### EC-4: startDevServer — porta ocupada
- **Task afetada:** T4.1
- **Familia:** Resource
- **Cenario:** Porta 3000 já em uso por outro processo. Vite por padrão tenta portas alternativas (`strictPort: false`), então não crasharia. Mas se o plano usar `strictPort: true`, crasharia.
- **Teste sugerido:** `test_dev_server_with_busy_port() — Given port already in use, When startDevServer({ port: busyPort, strictPort: false }), Then server starts on alternative port`
- **Nota:** O plano não menciona `strictPort`. Default Vite é `false` (retry automático). Documentar que é o comportamento esperado.

### EC-5: scaffold() — cpSync falha se templates dir não existe
- **Task afetada:** T2.1
- **Familia:** I/O
- **Cenario:** Se o path para `templates/default/` está errado (e.g., package publicado sem templates), `cpSync` lança `ENOENT`. Dev vê stack trace do Node em vez de mensagem útil.
- **Teste sugerido:** `test_scaffold_throws_on_missing_template() — Given template dir does not exist, When scaffold, Then throws with clear message about missing template`
- **Fix:** Antes do `cpSync`, checar `if (!existsSync(templateDir)) throw new Error("Template not found...")`.

## DOCUMENT

### EC-6: theo dev — loadConfig com dynamic import fora de tsx
- **Task afetada:** T4.1
- **Familia:** Boundary
- **Risco aceito:** `loadConfig` usa `import()` para carregar `theo.config.ts`. Isso funciona quando executado via `tsx` (bin shim). Se alguém chamar `startDevServer()` programaticamente sem tsx loader, o import de `.ts` falharia. Na Onda 1 isso não acontece porque o único caller é o CLI via bin shim (tsx). Risco documentado, não tratado.

### EC-7: create-theo — install falha sem internet
- **Task afetada:** T2.1
- **Familia:** Resource
- **Risco aceito:** Se `pnpm install` falha (sem internet, registry down), o scaffold completa mas deps não instalam. O dev vê o erro do pnpm e pode rodar `pnpm install` manualmente depois. create-next-app usa `is-online` para detectar isso e passar `--offline`, mas para Onda 1 não vale a complexidade. Documentar e seguir.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 4 | 2 (EC-1, EC-2) | 1 (EC-5) | 1 (EC-7) |
| T3.1 | 1 | 0 | 1 (EC-3) | 0 |
| T4.1 | 1 | 0 | 1 (EC-4) | 1 (EC-6) |
| T5.1 | 0 | 0 | 0 | 0 |
| T5.2 | 0 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 2 MUST FIX devem ser incorporados.

### Ajustes necessários no plano:

1. **T2.1 (scaffold):** Adicionar validação de project name (EC-1) e teste para `npx create-theo` sem argumento (EC-2). Adicionar teste para template dir ausente (EC-5).
2. **T3.1 (theoPlugin):** Adicionar teste de forward slashes no path do import (EC-3).
3. **T4.1 (dev server):** Documentar que `strictPort: false` é o default (EC-4).
