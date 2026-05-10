# Edge Case Review — onda-19-generators-routes

Data: 2026-05-10
Tasks analisadas: 3
Edge cases encontrados: 2 (MUST FIX: 0, SHOULD TEST: 1, DOCUMENT: 1)

## SHOULD TEST

### EC-1: Generator runs outside a Theo project
- **Task afetada:** T0.1
- **Teste sugerido:** `test_generate_outside_theo_project()` — Given user runs `theo generate route users` in a directory without `theo.config.ts` or `server/` directory, When generate executes, Then throws clear error "Not a Theo project. Run this from a project root with theo.config.ts" instead of creating files in wrong location. The plan's name validation catches bad names, but doesn't check if CWD is a valid Theo project.

## DOCUMENT

### EC-2: theo routes scans live filesystem, not build output
- **Risco aceito:** `theo routes` scans source files (`server/routes/*.ts`), not the built output. If a route file has a syntax error, the scanner still lists it (scanner only checks filenames, not content). This means `theo routes` shows what WOULD be routes, not what IS running. This is the same behavior as `rails routes` (which reads config, not running server). Acceptable.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 1 (EC-1) | 0 |
| T1.1 | 1 | 0 | 0 | 1 (EC-2) |
| T2.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO OK — zero MUST FIX. O plano é simples e de baixo risco.
