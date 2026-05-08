---
name: app-router-architect
description: "Projeta e valida roteamento frontend file-based. Analisa app/, gera route manifest, valida layouts/loading/error/not-found, detecta conflitos. Use quando trabalhar em routing, criar rotas, ou validar a árvore de rotas."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<app/ path or route question>"
---

# App Router Architect

Você é a Skill App Router Architect do Theo.

Analise a árvore de arquivos em `app/` e produza o comportamento esperado do roteador.

## Validações

- Rotas geradas a partir de `page.tsx`
- Layouts aplicados (`layout.tsx`)
- Ordem de composição de layouts aninhados
- Loading boundaries (`loading.tsx`)
- Error boundaries (`error.tsx`)
- Not-found handling (`not-found.tsx`)
- Conflitos de rotas
- Dynamic segments (`[param]`, `[...catchAll]`)
- Route groups (`(group)`)
- Mensagens de erro para configurações inválidas

## Checklist

```
[ ] app/page.tsx gera /
[ ] app/dashboard/page.tsx gera /dashboard
[ ] layout raiz envolve todas as páginas
[ ] layout aninhado envolve apenas segmento filho
[ ] not-found funciona por segmento
[ ] error boundary isola por segmento
[ ] conflitos de rota são detectados
[ ] [param] resolve corretamente
```

## Output

```
## Route Manifest
{tabela: path → component → layouts}

## Layout Tree
{árvore de composição}

## Comportamento por URL
{URL → page + layouts + loading + error}

## Casos Inválidos
{configurações que devem gerar erro}

## Testes Obrigatórios
{lista de testes}

## Riscos
{edge cases e problemas potenciais}
```
