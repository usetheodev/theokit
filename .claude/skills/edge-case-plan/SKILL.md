---
name: edge-case-plan
description: "Analisa um plano de implementação e identifica edge cases não previstos. Pragmático — aponta riscos reais sem complicar o design. Use após /to-plan ou quando revisar qualquer plano em docs/plans/."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: "[plan-slug|plan-file-path]"
---

# Edge Case Plan Review

Analise o plano e identifique edge cases que NÃO foram previstos. Seja pragmático — aponte riscos reais, não cenários fantasiosos.

## Argumento

- `$ARGUMENTS` = slug do plano (busca em `docs/plans/{slug}-plan.md`) ou caminho completo
- Sem argumento = analisa o plano mais recente em `docs/plans/`

## Filosofia

**Você NÃO é o agente que complica.** Você é o agente que pergunta: "e se isso der errado?"

Regras de ouro:
1. **Só aponte edge cases que podem acontecer de verdade** — não cenários com probabilidade de 0.001%
2. **Nunca sugira adicionar camadas de abstração** — a solução para um edge case é um `if`, um teste, ou um type guard — não um novo módulo
3. **KISS prevalece** — se o fix para o edge case é mais complexo que o dano do edge case, documente o risco e siga em frente
4. **Cada edge case apontado DEVE ter uma sugestão de fix em ≤3 linhas de código ou ≤1 frase de mudança no plano**
5. **Corner cases (múltiplos edges combinados) só se forem realistas**

## Processo

### Passo 1 — Ler o Plano

```bash
ls docs/plans/*${ARGUMENTS}* 2>/dev/null || ls -t docs/plans/*.md | head -5
```

Leia o plano completo. Entenda:
- O que está sendo construído
- Quais packages/arquivos serão tocados
- Quais são os inputs e outputs de cada task
- Onde estão as fronteiras do sistema (HTTP, forms, user input, file system)

### Passo 2 — Mapear Fronteiras

Para cada task do plano, identifique:
- **Entradas**: de onde vêm os dados? (HTTP request, form, URL params, env vars)
- **Saídas**: para onde vão? (response, HTML, JSON, file, console)
- **Estado**: o que muda? (server state, session, cache, file system)

Edge cases vivem nas fronteiras.

### Passo 3 — Aplicar o Checklist Pragmático

Para cada task, passe por este checklist. Marque se o plano já cobre ou não:

```
INPUTS:
  [ ] O que acontece com input vazio/nulo?
  [ ] O que acontece com input no limite máximo?
  [ ] O que acontece com input malformado? (tipo errado, encoding ruim)
  [ ] Zod schema cobre edge cases? (strings vazias, arrays vazios)

ESTADO:
  [ ] O que acontece se a operação falhar no meio?
  [ ] A operação é idempotente?

I/O:
  [ ] O que acontece se o filesystem não estiver disponível?
  [ ] O que acontece com timeout em fetch/API calls?

TIPOS:
  [ ] A inferência TypeScript funciona em edge cases? (generics profundos, conditional types)
  [ ] Zod e TypeScript estão sincronizados?

BOUNDARY:
  [ ] Código server pode vazar para bundle client?
  [ ] Env vars privadas podem vazar para client?

INTEGRAÇÃO:
  [ ] O package consumidor recebe erros tipados ou unknown?
  [ ] A dependency direction é respeitada?
```

**Ignore os checks que não se aplicam.**

### Passo 4 — Classificar e Reportar

| Nível | Significado | Ação |
|---|---|---|
| **MUST FIX** | Crash, data loss, security hole, type unsafety | Adicionar ao plano |
| **SHOULD TEST** | Improvável mas perigoso | Adicionar teste ao TDD da task |
| **DOCUMENT** | Risco aceito conscientemente | Adicionar como nota |
| **IGNORE** | Teórico demais | Não incluir |

## Formato do Report

```markdown
# Edge Case Review — {plano}

Data: YYYY-MM-DD
Tasks analisadas: N
Edge cases encontrados: N (MUST FIX: N, SHOULD TEST: N, DOCUMENT: N)

## MUST FIX

### EC-{N}: {descrição curta}
- **Task afetada:** T{N}.{M}
- **Família:** Input / Boundary / Resource / Timing / State / Type / Security
- **Cenário:** {como acontece}
- **Impacto:** {o que quebra}
- **Fix sugerido:** {≤3 linhas de código ou ≤1 frase}

## SHOULD TEST

### EC-{N}: {descrição curta}
- **Task afetada:** T{N}.{M}
- **Teste sugerido:** `test_{name}` — Given {context}, When {action}, Then {expected}

## DOCUMENT

### EC-{N}: {descrição curta}
- **Risco aceito:** {por que é ok não tratar agora}

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 | N | N | N | N |

**Veredicto:** PLANO OK / PLANO PRECISA DE AJUSTE
```

## Anti-Patterns que Você NUNCA Comete

1. **Over-engineering** — "Vamos criar um ErrorRecoveryManager" → NÃO. Um `if` resolve.
2. **Especulação** — "E se no futuro..." → NÃO. Analise o plano COMO ESTÁ.
3. **Paranoia** — "Validar em TODAS as camadas" → NÃO. Valide na fronteira.
4. **Scope creep** — "Já que estamos aqui..." → NÃO. Edges NO PLANO.
5. **Complexidade disfarçada** — "Retry com exponential backoff + circuit breaker" → NÃO. Um timeout simples resolve 90%.
