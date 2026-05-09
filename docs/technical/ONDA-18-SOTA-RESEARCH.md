# Onda 18 — SOTA Research: Deploy Adapters

**Data:** 2026-05-09
**Pesquisador:** Claude (SOTA Research Skill)
**Escopo:** Adapters para deploy em Node.js, Docker, Vercel, e Cloudflare Workers.

---

## 1. Análise Honesta: O Que o Theo Precisa?

### Estado Atual

O Theo hoje deploya APENAS em Node.js:
- `theo build` → `.theo/client/` (Vite client build) + opcionalmente `.theo/server/` (SSR)
- `theo start` → Node.js HTTP server (produção)
- Nenhum Dockerfile, nenhum adapter, nenhum output para Vercel/Cloudflare

### O que frameworks fazem

| Framework | Approach | # Adapters |
|-----------|----------|-----------|
| **Nitro** | Presets built-in (20+) | 20+ |
| **SvelteKit** | Adapter plugins | 5 oficiais |
| **Astro** | Adapter plugins | 5+ |
| **Remix** | Adapters (Express, Vercel, Cloudflare) | 5+ |
| **Next.js** | Vercel-first, adapters community | ~3 |
| **Hono** | Multi-runtime nativo | 9+ runtimes |

### Decisão Pragmática: Docker First, Vercel Second

**Por que NÃO fazer 4 adapters de uma vez:**
1. Cada adapter é um projeto complexo (Vercel Build Output API, Cloudflare wrangler, etc.)
2. O Theo usa `node:http` (IncomingMessage/ServerResponse) — Cloudflare Workers usa Web API (Request/Response). Converter requer refactor significativo.
3. WebSocket não funciona em serverless (Vercel) nem em Workers sem Durable Objects.
4. SSR precisa de Node.js runtime para `renderToPipeableStream`.

**Escopo realista para Onda 18:**

| Adapter | Esforço | Valor | Onda 18? |
|---------|---------|-------|----------|
| **Docker** | Pequeno | ALTO — todo mundo usa Docker | ✅ |
| **Vercel** | Médio-Grande | ALTO — maior plataforma | ✅ (básico) |
| **Cloudflare** | Grande | MÉDIO — precisa de refactor para Web Standards | ❌ Futuro |

---

## 2. Docker Adapter

### O que entregar

Um `Dockerfile` gerado pelo CLI (`theo docker:generate`) ou incluído no template.

```dockerfile
# Multi-stage build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm theo build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.theo ./.theo
COPY --from=builder /app/server ./server
COPY --from=builder /app/theo.config.ts ./theo.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "--import", "tsx", "node_modules/.bin/theo", "start"]
```

**Simplificação**: Em vez de compilar o server pra JS puro, usa `tsx` no Docker (já é devDep). Para MVP isso funciona. Otimização (build server to JS) é onda futura.

### Implementação

- Novo comando CLI: `theo docker` — gera `Dockerfile` + `.dockerignore`
- Ou: template file copiado para o projeto (`theo init docker`)
- Mais simples: apenas **documentação + Dockerfile de referência** no template

**Decisão: Gerar Dockerfile via CLI command** — `theo docker` cria Dockerfile + .dockerignore no projeto.

---

## 3. Vercel Adapter

### Vercel Build Output API

Vercel aceita output pré-built em `.vercel/output/`:

```
.vercel/output/
├── config.json          # Routing rules
├── static/              # Static assets (client build)
│   ├── index.html
│   └── assets/
└── functions/
    └── api.func/        # Serverless function
        ├── index.mjs    # Entry point
        └── .vc-config.json
```

### Como mapear o Theo para Vercel

| Theo | Vercel |
|------|--------|
| `.theo/client/` (static) | `.vercel/output/static/` |
| API routes (`server/routes/`) | `.vercel/output/functions/api.func/` |
| Server actions | Dentro da mesma function |
| SPA fallback | Routing rule em config.json |
| SSR | Serverless function |

### Limitações no Vercel

- **WebSocket**: NÃO funciona em Vercel serverless. WS precisa de server persistente.
- **Session cookies**: Funcionam (stateless, encrypted cookies vão no request).
- **Rate limiting in-memory**: NÃO funciona (cada invocation é nova instância). Precisa de Redis/KV.
- **`theo start`**: NÃO usado. Vercel tem seu próprio server.

### Implementação

- Novo build target: `theo build --target=vercel`
- Gera `.vercel/output/` com config.json, static/, functions/
- A serverless function wraps o executeRoute/executeAction com Web API adapter
- Precisa de adapter: `IncomingMessage` → `Request` (para compat)

### Adapter Interface (Interna)

```typescript
interface DeployAdapter {
  name: string
  buildOutput(config: TheoConfig, buildDir: string): Promise<void>
}
```

Cada adapter implementa `buildOutput` que transforma o build output para o formato do target.

---

## 4. Escopo Final para Onda 18

### O que implementar

| Feature | Complexidade |
|---------|-------------|
| CLI `theo docker` — gera Dockerfile + .dockerignore | Baixa |
| CLI `--target` flag no build | Baixa |
| Vercel adapter — gera `.vercel/output/` | Média |
| Adapter interface abstrata | Baixa |
| Node adapter (refactor do existente) | Baixa |
| Testes de cada adapter output | Média |

### UPDATE: Cloudflare Workers INCLUÍDO

Cloudflare Workers agora suporta `node:http` (createServer, IncomingMessage, ServerResponse) via `nodejs_compat` flag com compatibility date `2025-09-01`+. Isso significa que o código do Theo pode rodar em Workers SEM refactor de IncomingMessage → Request.

O adapter Cloudflare gera um Worker que:
1. Importa o server code do Theo
2. Configura `nodejs_compat` no `wrangler.toml`
3. Serve static assets via Cloudflare Pages ou `__STATIC_CONTENT`
4. Roda API routes/actions/middleware como Worker handlers

**Limitações em Workers:**
- WebSocket: Funciona via Cloudflare native WS (não via `ws` lib)
- Session cookies: Funcionam (stateless, encrypted)
- Rate limiting in-memory: NÃO persiste entre invocations (precisa de KV/DO)
- SSR: Funciona com `renderToString`, `renderToPipeableStream` precisa de compat
- `fs` operations: NÃO disponível (loadConfig precisa de adaptação)

### O que NÃO implementar

| Feature | Por quê |
|---------|---------|
| Netlify adapter | Baixa prioridade |
| AWS Lambda adapter | Baixa prioridade |
| Auto-detect platform | Complexidade sem valor para alpha |

---

## 5. Decisões

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | Docker via CLI command `theo docker` | Simples, gera Dockerfile + .dockerignore |
| D2 | Vercel via `--target=vercel` no build | Gera `.vercel/output/` com Build Output API |
| D3 | Node.js é default (backward compat) | `theo build` sem flag = Node.js output atual |
| D4 | Adapter interface interna | Extensível para futuros adapters sem breaking change |
| D5 | WebSocket nota no Vercel | Documenta que WS não funciona em serverless |
| D6 | Cloudflare adiado | Precisa de refactor de IncomingMessage → Request |

---

## Sources

- [Nitro Config — Presets](https://nitro.build/config)
- [Vercel Build Output API](https://vercel.com/docs/build-output-api/primitives)
- [Vercel Serverless Functions Guide 2026](https://reintech.io/blog/vercel-serverless-functions-complete-developer-guide-2026)
- [SvelteKit Adapters](https://svelte.dev/docs/kit/adapters)
- [SvelteKit adapter-auto](https://svelte.dev/docs/kit/adapter-auto)
- [Vercel Nitro Integration](https://vercel.com/docs/frameworks/backend/nitro)
- [Cloudflare Nitro Presets](https://deepwiki.com/nitrojs/nitro/6.2-cloudflare-presets)
