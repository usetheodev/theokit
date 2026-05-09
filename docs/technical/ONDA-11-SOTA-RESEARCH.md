# Onda 11 — SOTA Research: Preparação para Agents (sem implementar Agents)

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Contratos arquiteturais para agents futuros: streaming, context extensível, observability extensível, agents/ ignorado, zero deps de LLM no core.

---

## 1. Princípio Fundamental

> **Preparar sem pagar.** O Theo deve aceitar agents no futuro sem que o core carregue dependências de LLM, sem que o bundle cresça, e sem que a API pública mude.

A Onda 11 NÃO implementa agents. Ela garante que decisões já tomadas (Ondas 0-10) não BLOQUEIAM agents futuros, e faz ajustes mínimos onde necessário.

---

## 2. Estado Atual do Theo

### O que já funciona para agents

| Aspecto | Estado | Agent-ready? |
|---------|--------|-------------|
| `ctx: unknown` nos handlers | Handlers recebem `ctx` tipado como `unknown` | ✅ Extensível — plugins podem injetar qualquer forma |
| `createContext()` em `server/context.ts` | User define factory function | ✅ Agent pode injetar dados via context |
| `Response` nativo em handlers | Handler pode retornar `Response` | ✅ Pode retornar streaming Response |
| Middleware `await next()` | Middleware composável | ✅ Agent middleware pode ser adicionado |
| requestId em todas as responses | UUID via `crypto.randomUUID()` | ✅ Correlação de traces |
| Structured JSON logging | `logRequest()` com campos padronizados | ⚠️ Extensível mas não plugável |
| `agents/` dir | Não existe no projeto | ⚠️ Se user criar, framework ignora? Precisa testar |
| Streaming em routes | Handler pode retornar `Response` com `ReadableStream` body | ✅ Funciona por design |

### O que precisa de ajuste

| Gap | Criticidade | Esforço |
|-----|-------------|---------|
| Validar que `agents/` não quebra framework | ALTA | Baixo — apenas testar |
| Verificar que Response com ReadableStream funciona | ALTA | Baixo — apenas testar |
| Context extensível com type safety | MÉDIA | Baixo — genérico no defineRoute |
| Logger extensível (hook para custom loggers) | MÉDIA | Baixo — callback pattern |
| Bundle audit (zero LLM deps) | ALTA | Nenhum — apenas verificar |

---

## 3. Streaming: ReadableStream como Contrato

### Estado da Indústria (2025-2026)

O ecossistema de streaming para AI converge em dois padrões:

1. **SSE (Server-Sent Events)** — unidirecional, text-based, `text/event-stream`. Usado por OpenAI, Anthropic, Vercel AI SDK.
2. **Streamable HTTP** — evolução do MCP, bidirecional, baseado em HTTP POST + SSE response.

Ambos usam `ReadableStream` internamente. O Web Standard `Response` com body `ReadableStream` é o contrato universal.

### Como o Theo já suporta streaming

O `executeRoute` em `packages/theo/src/server/execute.ts:159-169` já trata `Response` nativo:

```typescript
if (handlerResult instanceof Response) {
  res.writeHead(handlerResult.status, Object.fromEntries(handlerResult.headers))
  const responseBody = await handlerResult.text()
  res.end(responseBody)
  return
}
```

**PROBLEMA**: `await handlerResult.text()` bufferiza todo o body antes de enviar. Para streaming real, precisa pipar o ReadableStream diretamente para o Node.js response.

### Fix necessário (Onda 11)

```typescript
if (handlerResult instanceof Response) {
  res.writeHead(handlerResult.status, Object.fromEntries(handlerResult.headers))
  
  if (handlerResult.body) {
    // Stream the response body pipe to Node.js response
    const reader = handlerResult.body.getReader()
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    }
    await pump()
  } else {
    res.end()
  }
  return
}
```

Isso permite que routes retornem streaming responses (SSE, AI responses, etc.) sem o framework bufferizar.

### Benchmark: Como outros frameworks fazem

| Framework | Streaming support | Mecanismo |
|-----------|------------------|-----------|
| **Hono** | `c.stream()`, `c.streamSSE()` | Helpers que criam ReadableStream |
| **Next.js** | `ReadableStream` em route handlers | Pipe via `nodeToWebReadableStream` |
| **Remix** | `defer()` com streaming | React Suspense + streaming HTML |
| **Vercel AI SDK** | `streamText()`, `streamUI()` | Data Stream Protocol (SSE-based) |

**Decisão para Theo**: Não criar helpers (`streamSSE()` etc). Apenas garantir que `Response` com `ReadableStream` body é pipado corretamente. Helpers de streaming são escopo de um futuro pacote `@theo/ai`.

---

## 4. Context Extensível

### Estado Atual

`createContext()` em `server/context.ts` é uma user-defined factory:

```typescript
export function createContext({ request, response }) {
  return { requestId: crypto.randomUUID(), user: null }
}
```

O handler recebe `ctx: unknown`. O user faz cast manual.

### Pattern da Indústria: Hono

Hono usa **generics** para tipagem de context:

```typescript
type Env = { Variables: { user: User; requestId: string } }
const app = new Hono<Env>()
app.get('/', (c) => c.get('user')) // typed!
```

### Oportunidade para Theo

O `defineRoute` e `defineAction` já aceitam `ctx: unknown`. Para agents futuros, o contrato é:

1. `createContext()` retorna qualquer objeto
2. Handler recebe esse objeto como `ctx`
3. A inferência de tipo vem de um genérico no `defineRoute`

**Atual**: `ctx: unknown` — funciona mas o user perde autocomplete.

**Melhoria Onda 11**: Adicionar genérico `TCtx` ao `RouteConfig` e `ActionConfig`:

```typescript
export interface RouteConfig<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
  TCtx = unknown,
> {
  handler: (ctx: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: TCtx
  }) => unknown | Promise<unknown>
}
```

Isso permite:
```typescript
interface AppContext { user: User; requestId: string }
export const GET = defineRoute<z.ZodUndefined, z.ZodUndefined, z.ZodUndefined, AppContext>({
  handler: ({ ctx }) => {
    ctx.user // typed!
  }
})
```

**Porém**: O genérico é verboso com 4 type params. Uma alternativa mais limpa é um wrapper:

```typescript
// User cria no seu projeto:
const route = <TQ, TB, TP>(config: RouteConfig<TQ, TB, TP, AppContext>) => defineRoute(config)
```

**Decisão**: Adicionar `TCtx` como 4º genérico com default `unknown`. Zero breaking change. Agent layer pode depois criar helpers tipados.

---

## 5. Observability Extensível

### Estado Atual

`logRequest()` em `packages/theo/src/server/logger.ts` faz `console.log(JSON.stringify(log))`. Não há hook para custom loggers, exporters, ou integração com OpenTelemetry.

### Estado da Indústria

- **OpenTelemetry GenAI Semantic Conventions** (stable 2026): `gen_ai.*` attributes para spans de LLM.
- **OpenLLMetry** (Traceloop): Auto-instrumentation para OpenAI, Anthropic, LangChain em TypeScript.
- **Vercel AI SDK**: Telemetry hooks opcionais via `experimental_telemetry`.

### Oportunidade para Theo

O logger não precisa ser substituído agora. A extensibilidade vem de dois pontos:

1. **Logger hook**: Permitir que o user passe um custom logger no config:
   ```typescript
   // theo.config.ts
   export default defineConfig({
     logger: (log) => myCustomLogger.info(log)
   })
   ```

2. **Span-ready requestId**: O `requestId` já existe. Um futuro `@theo/otel` package pode criar spans usando o requestId como trace context.

**Decisão Onda 11**: NÃO implementar OpenTelemetry. Apenas garantir que:
- O `RequestLog` interface é extensível (campos adicionais aceitos)
- O `logRequest` pode ser substituído via config
- O `requestId` é propagado em todas as execution units

---

## 6. Diretório `agents/` Ignorado

### Estado Atual

`validateProjectStructure()` em `packages/theo/src/core/validate-structure.ts` verifica `app/`, `theo.config.ts`, `package.json`. Não verifica nem rejeita `agents/`.

`scanRoutes()` em `packages/theo/src/router/scan.ts` escaneia apenas `app/`.
`scanServerRoutes()` e `scanServerActions()` escaneiam apenas `server/routes/` e `server/actions/`.

**Conclusão**: `agents/` já é ignorado pelo framework. Criar o diretório não quebra nada. Precisa apenas de um teste que prove isso.

---

## 7. Zero Deps de LLM no Bundle

### Estado Atual

`packages/theo/package.json` dependencies:
- `cac` — CLI parser
- `vite` — build tool
- `@vitejs/plugin-react` — React transform

peerDependencies: `zod`, `react`, `react-dom`, `react-router`

**Nenhuma** dependência de LLM (OpenAI, Anthropic, LangChain, etc.). O bundle do core é limpo.

**Verificação**: Um teste que parse `package.json` e verifica que nenhuma dep tem nome de provedor AI.

---

## 8. Decisões para a Onda 11

| # | Decisão | Justificativa | Esforço |
|---|---------|---------------|---------|
| D1 | Fix streaming: pipar ReadableStream em vez de bufferizar | Handler que retorna `new Response(readableStream)` deve streamer, não bufferizar | Baixo — ~10 linhas em execute.ts |
| D2 | Adicionar `TCtx` genérico ao RouteConfig e ActionConfig | Context extensível com type safety. Default `unknown` = zero breaking change | Baixo — ~5 linhas por arquivo |
| D3 | Testar que `agents/` dir não quebra framework | Provar que o core ignora diretórios desconhecidos | Baixo — 1 fixture + 1 teste |
| D4 | Testar que bundle não tem deps de LLM | Guardrail contra inclusão acidental | Baixo — 1 teste |
| D5 | Tornar logger substituível via config (opcional) | Extensibilidade para custom loggers sem mudar core | Médio — schema update + wiring |
| D6 | Testar que route com ReadableStream streama corretamente | Provar streaming genérico funciona | Baixo — 1 teste de integração |
| D7 | Provar que context aceita dados arbitrários de plugins | createContext retorna qualquer shape → handler recebe | Baixo — 1 teste |

---

## 9. O que NÃO fazer na Onda 11

| Tentação | Por que NÃO |
|----------|-------------|
| Implementar `@theo/ai` package | Fora do escopo. Agent layer é Onda 12+. |
| Adicionar OpenTelemetry SDK como dep | Peso desnecessário. Usar OTel é decisão do user, não do framework. |
| Criar `agents/` directory structure | Sem implementação = sem diretório. |
| Criar `defineAgent()` ou `defineTask()` | YAGNI. Não há uso concreto ainda. |
| Adicionar SSE helpers (`streamSSE()`) | YAGNI. User pode criar `new Response(readableStream)` direto. |
| Integrar MCP protocol | Complexidade prematura. MCP é protocolo de agent, não de framework. |
| Adicionar WebSocket support | Fora do MVP. SSE via ReadableStream cobre o caso principal. |

---

## 10. Competitive Analysis: Agent Readiness

| Aspecto | Theo (alvo Onda 11) | Next.js | Hono | Vercel AI SDK |
|---------|---------------------|---------|------|---------------|
| Streaming Response | ✅ ReadableStream pipe | ✅ Native | ✅ c.stream() | ✅ streamText() |
| Context extensível | ✅ TCtx generic | ❌ No typed ctx | ✅ Variables generic | N/A |
| Logger plugável | ✅ Config hook | ❌ Internal | ✅ c.log() | N/A |
| agents/ ignored | ✅ Tested | N/A | N/A | N/A |
| Zero LLM deps | ✅ Audited | ✅ | ✅ | ❌ (core is AI) |
| OTel integration | ❌ Futuro | ✅ | ✅ Middleware | ✅ Built-in |

---

## Sources

- [Vercel AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OpenLLMetry — OTel for LLMs](https://github.com/traceloop/openllmetry)
- [OpenTelemetry for LLM Observability (2026)](https://dev.to/rapidclaw/2026-opentelemetry-for-llm-observability-self-hosted-setup-335o)
- [Hono Context API](https://hono.dev/docs/api/context)
- [Hono Middleware Guide](https://hono.dev/docs/guides/middleware)
- [Hono vs ElysiaJS vs Nitro (2026)](https://www.pkgpulse.com/blog/hono-vs-elysiajs-vs-nitro-2026)
- [MCP Streamable HTTP](https://thenewstack.io/how-mcp-uses-streamable-http-for-real-time-ai-tool-interaction/)
- [OpenAI Responses API for TypeScript](https://blog.robino.dev/posts/openai-responses-api)
- [VoltAgent Framework](https://voltagent.dev/)
- [Top 5 TypeScript AI Agent Frameworks 2026](https://techwithibrahim.medium.com/top-5-typescript-ai-agent-frameworks-you-should-know-in-2026-5a2a0710f4a0)
