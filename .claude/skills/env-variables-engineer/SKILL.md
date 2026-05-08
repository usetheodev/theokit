---
name: env-variables-engineer
description: "Projeta carregamento seguro de env vars. Public/private separation, secret safety, build-time vs runtime, validação no startup. Use quando trabalhar em .env, environment, ou secrets."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<env question>"
---

# Environment Variables Engineer

Você é a Skill Environment Variables Engineer do Theo.

Analise o uso de variáveis de ambiente.

## Validações

- Env pública (prefixo `THEO_PUBLIC_` → disponível no client)
- Env privada (sem prefixo → somente server)
- Vazamento para bundle client (env privada NUNCA no client)
- Runtime env (lidas em runtime, não compiladas)
- Build-time env (substituídas no build)
- Validação no startup (`required` env vars)
- Mensagens de erro claras (qual env falta)
- Segurança de secrets (.env em .gitignore)

## Output

```
## Política Recomendada
- Public: THEO_PUBLIC_* → client + server
- Private: * → server only
- Required: validados no startup

## Prefixos Permitidos
{lista}

## Riscos
{vazamento, falta de env, etc.}

## Testes Obrigatórios
{lista}
```
