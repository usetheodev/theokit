# Edge Case Review — onda-0-fundamento

Data: 2026-05-08
Tasks analisadas: 18 (T0.1-T0.3, T1.1-T1.5, T2.1-T2.4, T3.1-T3.2, T4.1-T4.4, T5.1-T5.3)
Edge cases encontrados: 8 (MUST FIX: 3, SHOULD TEST: 3, DOCUMENT: 2)

## MUST FIX

### EC-1: loadConfig — config file exporta named export em vez de default
- **Task afetada:** T1.4
- **Familia:** Input
- **Cenario:** Dev escreve `export const config = defineConfig({...})` em vez de `export default defineConfig({...})`. `loadConfig` faz `mod.default ?? mod` — se mod é um objeto com `config` property, o fallback `mod` vai ser o module inteiro, não o config.
- **Impacto:** `loadConfig` tenta parsear o module object como config, gerando erro Zod confuso em vez de mensagem útil.
- **Fix sugerido:** Em `loadConfig`, após `mod.default ?? mod`, checar se o resultado tem uma property que é um plain object. Se `mod.default` não existe, tentar `Object.values(mod).find(v => typeof v === 'object' && v !== null)` ou simplesmente documentar que DEVE ser `export default`. Melhor: validar e dar erro claro: `"theo.config.ts must use export default defineConfig({...})"`.

### EC-2: loadConfig — config file com syntax error ou import que falha
- **Task afetada:** T1.4
- **Familia:** Input / I/O
- **Cenario:** `theo.config.ts` tem syntax error ou importa módulo que não existe. O `import()` dinâmico lança erro genérico (SyntaxError ou ERR_MODULE_NOT_FOUND), não TheoConfigError.
- **Impacto:** Dev vê stack trace do Node.js em vez de mensagem DX-friendly.
- **Fix sugerido:** Wrap o `import()` em try/catch. Se falha, lançar TheoConfigError (ou novo erro) com mensagem: `"Failed to load theo.config.ts: ${error.message}"` incluindo o path.

### EC-3: validateProjectStructure — dir passado não existe
- **Task afetada:** T3.2
- **Familia:** Input
- **Cenario:** `validateProjectStructure('/caminho/que/nao/existe')` — o `existsSync(join(rootDir, 'app'))` retorna false para tudo, gerando mensagem confusa "Missing required directory: app/" quando o problema real é que o rootDir não existe.
- **Impacto:** Mensagem de erro misleading — dev acha que falta app/ quando o diretório raiz é que está errado.
- **Fix sugerido:** Primeira checagem: `if (!existsSync(rootDir)) throw new TheoProjectError(['Project directory does not exist: ' + rootDir], rootDir)`.

## SHOULD TEST

### EC-4: theoConfigSchema — propriedades extras (unknown keys)
- **Task afetada:** T1.1
- **Familia:** Input
- **Cenario:** Dev passa `{ port: 3000, database: 'postgres' }`. Com `z.object()` (não strict), Zod ignora propriedades extras silenciosamente. Dev pode achar que `database` está sendo usado quando não está.
- **Teste sugerido:** `test_unknown_keys_stripped() — Given { port: 3000, database: 'postgres' }, When parse, Then result does NOT have database property`
- **Nota:** Considerar usar `.strict()` no futuro (Onda 1+) para rejeitar propriedades desconhecidas, como Next.js faz. Na Onda 0, strip silencioso é aceitável se testado.

### EC-5: defineRoute — handler sem return (void)
- **Task afetada:** T2.1 / T5.1
- **Familia:** Type
- **Cenario:** Dev escreve `handler: ({ query }) => { console.log(query) }` — handler retorna void. O tipo aceita `unknown | Promise<unknown>` que inclui void, mas pode confundir em Onda 3 quando o runtime espera um return value.
- **Teste sugerido:** `type_handler_void_accepted() — Given handler returning void, When defineRoute, Then compiles (identity function, void ok na Onda 0)`

### EC-6: loadConfig — theo.config.ts exporta null/undefined
- **Task afetada:** T1.4
- **Familia:** Input
- **Cenario:** `export default null` ou `export default undefined` em theo.config.ts. `loadConfig` faz `mod.default ?? mod` → null/undefined → `theoConfigSchema.safeParse(null)` → Zod error genérico.
- **Teste sugerido:** `test_config_exports_null() — Given config exporting null, When loadConfig, Then throws with clear message (not Zod internal)`

## DOCUMENT

### EC-7: Vitest module caching com fixtures
- **Task afetada:** T4.1-T4.3
- **Familia:** Timing / State
- **Risco aceito:** Vitest pode cachear o `import()` dinâmico de `theo.config.ts` das fixtures entre testes. Se dois testes importam configs diferentes do mesmo path relativo, o segundo pode receber o resultado cacheado do primeiro. Na prática isso não deve acontecer porque cada fixture tem path absoluto diferente. Se acontecer, fix é adicionar `?t=${Date.now()}` no import URL.

### EC-8: Windows paths em validateProjectStructure
- **Task afetada:** T3.2
- **Familia:** Boundary
- **Risco aceito:** `path.join()` no Windows usa `\` como separador. `existsSync` funciona com ambos. As mensagens de erro vão mostrar paths com `\` no Windows, o que é aceitável. Teste cross-platform é escopo da Onda 10.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1-T0.3 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-4) | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T1.3 | 0 | 0 | 0 | 0 |
| T1.4 | 3 | 2 (EC-1, EC-2) | 1 (EC-6) | 0 |
| T1.5 | 0 | 0 | 0 | 0 |
| T2.1 | 1 | 0 | 1 (EC-5) | 0 |
| T2.2-T2.4 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| T3.2 | 1 | 1 (EC-3) | 0 | 1 (EC-8) |
| T4.1-T4.4 | 1 | 0 | 0 | 1 (EC-7) |
| T5.1-T5.3 | 1 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 3 MUST FIX devem ser incorporados antes de implementar.

### Ajustes necessarios no plano:

1. **T1.4 (loadConfig):** Adicionar try/catch no `import()` com mensagem DX-friendly (EC-2). Adicionar validação de `export default` vs named export (EC-1). Adicionar teste para config que exporta null (EC-6).
2. **T3.2 (validateProjectStructure):** Adicionar checagem se rootDir existe antes de validar conteúdo (EC-3).
3. **T1.1 (theoConfigSchema):** Adicionar teste que verifica que unknown keys são stripped (EC-4).
4. **T2.1/T5.1 (defineRoute):** Adicionar type test que void handler compila (EC-5).
