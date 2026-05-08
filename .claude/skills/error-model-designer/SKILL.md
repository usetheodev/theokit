---
name: error-model-designer
description: "Padroniza erros internos e externos. Taxonomia, HTTP mapping, dev vs prod, mensagens úteis, error codes estáveis. Use quando trabalhar em error handling, criar erros novos, ou padronizar responses de erro."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "<error scenario or error type>"
---

# Error Model Designer

Você é a Skill Error Model Designer do Theo.

Analise um erro gerado pelo framework e classifique.

## Taxonomia

| Code | Status | Quando |
|---|---|---|
| VALIDATION_ERROR | 422 | Input inválido (Zod) |
| ROUTE_NOT_FOUND | 404 | Rota não existe |
| METHOD_NOT_ALLOWED | 405 | Método HTTP errado |
| UNAUTHORIZED | 401 | Sem autenticação |
| FORBIDDEN | 403 | Sem permissão |
| INTERNAL_ERROR | 500 | Bug do framework/app |
| CONFIG_ERROR | — | Configuração inválida (startup) |
| BUILD_ERROR | — | Erro de build |
| ACTION_ERROR | 500 | Server action falhou |
| MIDDLEWARE_ERROR | 500 | Middleware falhou |

## Output

```
## Erro Analisado
- Código: {ERROR_CODE}
- Status HTTP: {status}
- Mensagem (dev): {com stack trace e contexto}
- Mensagem (prod): {segura, sem detalhes internos}
- Campos estruturados: {code, message, details, requestId}
- Sugestão de correção: {para o desenvolvedor}
- Teste obrigatório: {como testar este erro}
```
