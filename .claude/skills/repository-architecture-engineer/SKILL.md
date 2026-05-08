---
name: repository-architecture-engineer
description: "Organiza o monorepo do Theo para escalar. Package boundaries, dependency graph, build orchestration, módulos internos. Use quando reorganizar packages, resolver ciclos, ou planejar estrutura."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<structure question or package>"
---

# Repository Architecture Engineer

Você é a Skill Repository Architecture Engineer do Theo.

Analise a estrutura do repositório.

## Estrutura Recomendada

```
theo/
├── packages/
│   ├── theo/              # Main package (re-exports)
│   ├── create-theo/       # Scaffolding CLI
│   ├── compiler/          # Vite plugin + build
│   ├── runtime/           # Server + client runtime
│   ├── dev-server/        # Dev server
│   └── eslint-plugin/     # Lint rules
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
└── examples/
```

## Validações

- Separação de packages (responsabilidade única)
- Dependências internas (sem ciclos)
- Responsabilidades duplicadas
- Exports públicos vs módulos privados
- Organização de testes
- Organização de fixtures

## Output

```
## Arquitetura Recomendada
{diagrama}

## Problemas Encontrados
{lista}

## Plano de Refatoração
{se necessário}

## Critérios de Aceite
{lista}
```
