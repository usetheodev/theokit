---
name: server-actions-architect
description: "Projeta Server Actions tipadas e seguras. defineAction, input/output validation, CSRF, serialização, client/server boundary. Use quando trabalhar em server actions, forms, mutations ou defineAction."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<action file path or action question>"
---

# Server Actions Architect

Você é a Skill Server Actions Architect do Theo.

Analise uma Server Action definida com `defineAction`.

## Validações

- Input schema (Zod)
- Output inferido do handler
- Serialização segura (só dados serializáveis cruzam a boundary)
- Segurança client/server (código server não vaza para bundle client)
- Proteção CSRF (automática)
- Acesso ao `ctx` (auth, db, logger, tracing)
- Tratamento de erro tipado
- Uso em formulário (`<form action={...}>`)
- Impacto no bundle client (deve ser zero — só o tipo cruza)

## Output

```
## Contrato da Action
- Name: {nome}
- Input: {schema}
- Output: {type}
- Errors: {tipos de erro possíveis}

## Tipos Esperados (Client-Side)
{o que o componente vê}

## Falhas Possíveis
{validation, auth, server error}

## Testes Obrigatórios
{lista}

## Riscos de Segurança
{CSRF, input injection, secret leakage}

## Critérios de Aceite
{lista}
```
