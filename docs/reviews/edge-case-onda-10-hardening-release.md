# Edge Case Review — onda-10-hardening-release

Data: 2026-05-09
Tasks analisadas: 12
Edge cases encontrados: 5 (MUST FIX: 2, SHOULD TEST: 2, DOCUMENT: 1)

## MUST FIX

### EC-1: create-theo template path breaks after tsup build
- **Task afetada:** T0.2
- **Família:** Resource / State
- **Cenário:** `src/index.ts` resolve templates via `resolve(__dirname, '../templates', templateName)` onde `__dirname = dirname(fileURLToPath(import.meta.url))`. Após tsup build, o output vai para `dist/index.js`. O `import.meta.url` agora aponta para `dist/`, então `../templates` resolve `packages/create-theo/templates/` — que funciona na estrutura do repo. MAS quando o package é publicado no npm com `"files": ["dist", "templates"]`, o caminho relativo `dist/ → ../templates/` funciona. PORÉM se tsup inlina todos os módulos num único `dist/cli.js`, o `import.meta.url` é do `cli.js`, e `../templates` resolve corretamente SOMENTE se `cli.js` está em `dist/`. Se tsup mover para subdir (`dist/src/cli.js`), quebra.
- **Impacto:** `npx create-theo my-app` falha com "Template not found" para todo consumidor npm.
- **Fix sugerido:** No T0.2, adicionar teste explícito: `test_template_path_from_dist()` — Given built `dist/cli.js`, When resolving template dir, Then `resolve(dirname(import.meta.url), '../templates/default')` exists. Se o path não funciona, ajustar `getTemplateDir()` para usar path relativo correto em relação ao `dist/` output.

### EC-2: vite-plugin SSR aliases break when imported from dist/
- **Task afetada:** T0.1, T2.2
- **Família:** Boundary / Resource
- **Cenário:** `vite-plugin/index.ts` linha 21-23 resolve `theoSrcDir = resolve(currentDir, '..')` para criar SSR aliases que apontam para `server/index.ts` e `index.ts`. Após tsup build, `currentDir` será `packages/theo/dist/vite-plugin/`, e `resolve(currentDir, '..')` será `packages/theo/dist/`. Os aliases apontarão para `dist/server/index.ts` e `dist/index.ts` — que não existem (são `.js` não `.ts`). Isso quebra `theo dev` quando o plugin é carregado de `dist/`.
- **Impacto:** `theo dev` falha quando `theo` é instalado via npm (resolve de `dist/`, não `src/`). No monorepo dev com aliases Vitest, funciona. Mas consumidor externo quebra.
- **Fix sugerido:** No vite-plugin, as aliases SSR devem apontar para `.js` em vez de `.ts`, OU usar extensão condicional. Mais pragmático: o vite-plugin quando instalado via npm deve apontar para os `.js` compilados. Ajustar o code para usar `resolve(theoSrcDir, 'server/index.js')` com fallback: `const ext = existsSync(resolve(theoSrcDir, 'index.ts')) ? '.ts' : '.js'`. Adicionar teste no T2.2.

## SHOULD TEST

### EC-3: tsup banner shebang duplicado
- **Task afetada:** T0.1
- **Teste sugerido:** `test_cli_no_duplicate_shebang()` — Given tsup config with banner, When cli/index.ts source does NOT have shebang, Then dist/cli/index.js has exactly one `#!/usr/bin/env node` line. Se o source tiver um shebang e tsup adicionar outro via banner, o output terá dois shebangs e `node` reclamará.

### EC-4: pnpm try:dev quebra após exports mudarem
- **Task afetada:** T1.1
- **Teste sugerido:** `test_pnpm_try_dev_still_works()` — Given updated exports pointing to dist/, When running `pnpm try:scaffold && pnpm try:dev`, Then dev server starts. O script `try:dev` usa `npx tsx ../packages/theo/src/cli/index.ts dev` que importa source direto. Isso continua funcionando via tsx. MAS se algum import interno do theo mudar de `./foo.js` para `./foo` (sem extensão) durante a mudança, tsx pode ter problemas. Verificar que o workflow de dev não é afetado.

## DOCUMENT

### EC-5: attw pode falhar em node10 mode
- **Risco aceito:** O Theo é ESM-only (ADR D2). attw reporta resolução em `node10` mode, mas consumidores com `moduleResolution: node10` já não conseguem usar packages ESM-only. Warnings de attw em node10 são esperados e aceitáveis. Não é um bug — é uma escolha de design. Se attw reportar erros apenas em node10, ignorar (filtrar) no teste.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 2 | 0 | 1 (EC-3) | 0 |
| T0.2 | 1 | 1 (EC-1) | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-4) | 0 |
| T2.1 | 1 | 0 | 0 | 1 (EC-5) |
| T2.2 | 1 | 1 (EC-2) | 0 | 0 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 2 MUST FIX items (EC-1 e EC-2) precisam ser incorporados antes da implementação.
