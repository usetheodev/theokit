# Edge Case Review — onda-14-auth-hooks

Data: 2026-05-09
Tasks analisadas: 6
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: Empty or short secret causes weak encryption
- **Task afetada:** T0.1
- **Família:** Security
- **Cenário:** User creates session manager with `secret: ''` or `secret: 'abc'`. SHA-256 hash of a short string is still 256 bits, so AES-GCM won't fail — but the secret is trivially brute-forceable. There's no validation that the secret meets a minimum length.
- **Impacto:** Sessions encrypted with weak secret can be decrypted by attacker. Complete auth bypass.
- **Fix sugerido:** Add validation in `createSessionManager`: `if (config.secret.length < 32) throw new Error('Session secret must be at least 32 characters')`. Add test for this.

## SHOULD TEST

### EC-2: Session cookie exceeds 4KB browser limit
- **Task afetada:** T1.1
- **Teste sugerido:** `test_large_session_data_warning()` — Given session data that encrypts to > 4KB, When createSession called, Then operation succeeds (no crash) but log a warning. The plan mentions "Cookie size limit (~4KB)" in ADR D2 but has no test. At minimum, ensure it doesn't crash silently — the encrypted + base64-encoded output is ~33% larger than the input, so a session with 2.5KB of JSON would exceed 4KB after encryption.

## DOCUMENT

### EC-3: Session cannot be invalidated server-side
- **Risco aceito:** Already documented in ADR D2 — "Sessions não podem ser invalidadas server-side (exceto mudando o secret)." This means if a user's account is compromised, the only way to invalidate their session is to rotate the secret (which invalidates ALL sessions). For alpha, this is acceptable. For production, recommend adding a `revokedAt` timestamp check in `getSession` (future onda).

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 1 (EC-1) | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-2) | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T2.3 | 0 | 0 | 0 | 0 |
| ADR D2 | 1 | 0 | 0 | 1 (EC-3) |

**Veredicto:** PLANO PRECISA DE AJUSTE — 1 MUST FIX (EC-1: minimum secret length validation).
