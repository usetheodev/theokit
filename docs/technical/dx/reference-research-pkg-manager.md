# Reference Research: Package Manager Detection

**Data:** 2026-05-08
**Implementações pesquisadas:** Next.js (create-next-app)
**Tópico:** Detecção de package manager e install strategy

## Resumo Executivo

Next.js e Theo usam o mesmo pattern core: `npm_config_user_agent` → detect pnpm/yarn/bun/npm. Next.js adiciona: (1) CLI flags override (`--use-pnpm`), (2) pnpm version detection para compatibilidade v9/v10, (3) offline detection para yarn, (4) env vars durante install (`ADBLOCK=1`, `NODE_ENV=development`). O Theo tem o mínimo funcional — 3 melhorias opcionais.

## Comparação

| Aspecto | Theo (atual) | Next.js | Gap |
|---------|-------------|---------|-----|
| Detection via user_agent | ✅ Idêntico | ✅ `getPkgManager()` | Nenhum |
| CLI override flags | ❌ Não tem | ✅ `--use-pnpm`, `--use-npm`, etc. | LOW — convention over config |
| pnpm version detection | ❌ Não tem | ✅ `getPnpmMajorVersion()` | LOW — irrelevante até publish |
| Offline detection | ❌ Não tem | ✅ DNS lookup + proxy check | LOW — pnpm/npm fazem fallback |
| Install env vars | ❌ Não seta | ✅ `ADBLOCK=1`, `NODE_ENV=dev` | MEDIUM — pnpm pode pular devDeps |
| Install error handling | ✅ Throws error | ✅ Similar | Nenhum |
| cross-spawn | ✅ Usa | ✅ Usa | Nenhum |

## Padrões Encontrados

### Padrão 1: `NODE_ENV=development` durante install

**Usado por:** Next.js
**Como funciona:**
```typescript
spawn(pkgManager, ['install'], {
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: 'inherit',
})
```
**Por quê:** pnpm respeita `NODE_ENV` — se `production`, pula devDependencies. Setar `development` garante que deps de dev (TypeScript, types) instalam.

**Trade-offs:**
- Pro: Previne bug silencioso (devDeps faltando)
- Con: 1 linha de código

### Padrão 2: `ADBLOCK=1` + `DISABLE_OPENCOLLECTIVE=1`

**Usado por:** Next.js
**Como funciona:** Env vars que suprimem messages de doação/ads de packages durante install.
**Para Theo:** Nice-to-have, não essencial.

## Recomendação para o Theo

1. **Adotar agora (1 linha):** Setar `NODE_ENV=development` no `runInstall` — previne bug real com pnpm
2. **Adotar quando publicar:** CLI override flags (`--use-pnpm`) — desnecessário enquanto monorepo-only
3. **Não adotar:** Offline detection, pnpm version detection — over-engineering para MVP

## Impacto em ADRs

Nenhum ADR precisa mudar. A implementação atual é correta para o estágio atual (monorepo dev). O gap `NODE_ENV=development` é um quick fix de 1 linha.
