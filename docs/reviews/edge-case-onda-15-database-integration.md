# Edge Case Review — onda-15-database-integration

Data: 2026-05-09
Tasks analisadas: 3
Edge cases encontrados: 1 (MUST FIX: 0, SHOULD TEST: 0, DOCUMENT: 1)

## DOCUMENT

### EC-1: Template postgres won't run without a real PostgreSQL database
- **Risco aceito:** The template includes `db/index.ts` with `postgres(process.env.DATABASE_URL!)`. If the user scaffolds with `--template=postgres` and runs `theo dev` without a PostgreSQL database running and `DATABASE_URL` set, the server will crash with a connection error. This is expected and acceptable — the `.env.example` file tells the user to configure DATABASE_URL, and the error from the `postgres` driver is clear enough. No framework action needed.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 0 | 1 (EC-1) |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |

**Veredicto:** PLANO OK — zero MUST FIX. O plano é simples (template files + 1 string change) com risco mínimo.
