# Edge Case Review — onda-9-cookies-templates

Data: 2026-05-09
Tasks analisadas: 4 (T0.1, T1.1, T2.1, T3.1, T4.1)
Edge cases encontrados: 3 (MUST FIX: 1, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: setCookie — multiple Set-Cookie headers
- **Task afetada:** T0.1
- **Familia:** State
- **Cenario:** Quando se seta 2 cookies, `res.setHeader('Set-Cookie', ...)` pode overwrite o primeiro. Node.js `setHeader` com string SUBSTITUI. Para múltiplos cookies, precisa usar array: `res.setHeader('Set-Cookie', ['a=1', 'b=2'])`.
- **Impacto:** Segundo setCookie sobrescreve primeiro — user perde cookie.
- **Fix sugerido:** Ler headers existentes com `res.getHeader('Set-Cookie')`, converter para array, append novo, e setar array. (Já está no design do plano — verificar implementação.)

## SHOULD TEST

### EC-2: getCookie — valores com `=` (ex: base64 JWT)
- **Task afetada:** T0.1
- **Cenario:** Cookie value contém `=` (base64): `session=eyJhbGci...==`. Split por `=` pegaria apenas `eyJhbGci` sem o `==`.
- **Teste sugerido:** `test_getCookie_with_equals() — Given cookie 'token=abc==', When getCookie('token'), Then 'abc=='`
- **Fix:** Split no primeiro `=` apenas: `pair.split('=')` → `const [k, ...v] = pair.split('='); value = v.join('=')`

## DOCUMENT

### EC-3: Cookies em produção (theo start) vs dev (theo dev)
- **Risco aceito:** Em dev, `secure: false` por default (HTTP localhost). Em prod, `secure: true`. Se dev testa auth flow em localhost e depois deploya, cookies funcionam diferente. Aceitável — é o padrão da indústria (Next.js, Express fazem o mesmo).

## Resumo

| Task | MUST FIX | SHOULD TEST | DOCUMENT |
|------|----------|-------------|----------|
| T0.1 | 1 (EC-1) | 1 (EC-2) | 0 |
| T1.1 | 0 | 0 | 1 (EC-3) |
| T2.1-T4.1 | 0 | 0 | 0 |

**Veredicto: PLANO PRECISA DE AJUSTE** — 1 MUST FIX (append vs overwrite).
