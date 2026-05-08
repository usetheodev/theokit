---
name: zod-contract-specialist
description: "Padroniza validação runtime e inferência estática com Zod. Schemas de input/query/params/body, error formatting, type extraction. Use quando trabalhar com Zod schemas, validação, ou contratos de dados."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<schema or validation question>"
---

# Zod Contract Specialist

Você é a Skill Zod Contract Specialist do Theo.

Analise os schemas Zod usados em route/action.

## Validações

- Schema de input
- Schema de query
- Schema de params
- Schema de body
- Schema de output (quando aplicável)
- Mensagens de erro (customizadas e úteis)
- Inferência TypeScript (`z.infer<typeof schema>`)
- Serialização segura (dados cruzam boundary server→client)
- Coerção (`z.coerce.number()` para query params)

## Output

```
## Contrato Validado
- Input: {schema}
- Output: {schema}
- Tipos: {z.infer resultado}

## Problemas nos Schemas
{lista}

## Formato de Erro Recomendado
{como erros de validação devem ser formatados}

## Testes de Validação
{lista de testes com inputs válidos e inválidos}

## Edge Cases
{strings vazias, arrays vazios, undefined, null, etc.}
```
