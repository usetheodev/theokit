# Changelog

## 2.1.0

### Minor Changes

- 9b5da86: **A controller route can name a rate limit, and a guard can refuse with 429** (#612).

  `theokit/server/rate-limit` exported a complete limiter and nothing a `@Controller` route could use,
  so every app wrote the adapter — the third instance of a pattern whose first two shipped as
  `@Public()` and `Authenticated()` (#574). The hand-written adapter could not be correct, for two
  reasons that were not the author's fault:

  - **A guard could not answer 429.** `canActivate` returns a boolean, so a refused caller received
    `403 Forbidden resource` and the `X-RateLimit-*` the limiter had just computed were discarded —
    a guard owns no response to attach them to. "You are not allowed" and "you are allowed, later"
    read identically, and a well-behaved client had nothing to back off on.
  - **The intuitive alternative was silently inert.** A `preHandler` plugin enforced nothing on
    controller routes (#607, fixed in the same line of work) while reading exactly like protection.

  **`theokit/server/rate-limit` now exports `RateLimited`:**

  ```ts
  @Post('stt')
  @UseGuards(Authenticated(sessions), RateLimited({ max: 20, windowMs: 60_000 }))
  transcribe() { ... }
  ```

  A refused caller gets `429` with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
  `scope: 'shared'` pools several routes into one budget, which is what an app capping endpoints that
  bill a third party per call actually wants. The constructor **throws** on a configuration that
  cannot tell callers apart — `keyBy: 'ip'` with no `trustProxy` and no `identify` — because a Web
  `Request` has no socket address, and accepting it would put every visitor in one bucket: a limiter
  that refuses the whole internet after N requests while reading as protection until it does. It does
  not attach `X-RateLimit-*` to allowed responses, and says so in its docblock rather than shipping a
  header that appears under one dispatcher and vanishes under another.

  **`@theokit/http`:**

  - `HttpException` accepts and carries `headers`, and every dispatcher renders them through one
    `httpExceptionToResponse` instead of four hand-built `new Response(...)` calls. `429` without
    `Retry-After`, `401` without `WWW-Authenticate` and `405` without `Allow` are all half an answer.
  - The guard pipeline is one `runGuards` shared by `TheoApp`, `createDecoratorHandler` and the
    TheoKit plugin, instead of four copies — the arrangement #576 already paid for once. A guard
    throwing an `HttpException` now reaches the client with its status and headers on all three, agent
    routes included, where the exception previously escaped the dispatcher entirely.
  - The published types say these exceptions are `Error`s again. `tsup` had been erasing the
    inheritance into an anonymous structural type, so an app writing `throw new UnauthorizedException()`
    tripped `@typescript-eslint/only-throw-error` against the framework's own exceptions — and the
    lint was right about what the `.d.ts` claimed.

## 2.1.0-next.0

### Minor Changes

- 9b5da86: **A controller route can name a rate limit, and a guard can refuse with 429** (#612).

  `theokit/server/rate-limit` exported a complete limiter and nothing a `@Controller` route could use,
  so every app wrote the adapter — the third instance of a pattern whose first two shipped as
  `@Public()` and `Authenticated()` (#574). The hand-written adapter could not be correct, for two
  reasons that were not the author's fault:

  - **A guard could not answer 429.** `canActivate` returns a boolean, so a refused caller received
    `403 Forbidden resource` and the `X-RateLimit-*` the limiter had just computed were discarded —
    a guard owns no response to attach them to. "You are not allowed" and "you are allowed, later"
    read identically, and a well-behaved client had nothing to back off on.
  - **The intuitive alternative was silently inert.** A `preHandler` plugin enforced nothing on
    controller routes (#607, fixed in the same line of work) while reading exactly like protection.

  **`theokit/server/rate-limit` now exports `RateLimited`:**

  ```ts
  @Post('stt')
  @UseGuards(Authenticated(sessions), RateLimited({ max: 20, windowMs: 60_000 }))
  transcribe() { ... }
  ```

  A refused caller gets `429` with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
  `scope: 'shared'` pools several routes into one budget, which is what an app capping endpoints that
  bill a third party per call actually wants. The constructor **throws** on a configuration that
  cannot tell callers apart — `keyBy: 'ip'` with no `trustProxy` and no `identify` — because a Web
  `Request` has no socket address, and accepting it would put every visitor in one bucket: a limiter
  that refuses the whole internet after N requests while reading as protection until it does. It does
  not attach `X-RateLimit-*` to allowed responses, and says so in its docblock rather than shipping a
  header that appears under one dispatcher and vanishes under another.

  **`@theokit/http`:**

  - `HttpException` accepts and carries `headers`, and every dispatcher renders them through one
    `httpExceptionToResponse` instead of four hand-built `new Response(...)` calls. `429` without
    `Retry-After`, `401` without `WWW-Authenticate` and `405` without `Allow` are all half an answer.
  - The guard pipeline is one `runGuards` shared by `TheoApp`, `createDecoratorHandler` and the
    TheoKit plugin, instead of four copies — the arrangement #576 already paid for once. A guard
    throwing an `HttpException` now reaches the client with its status and headers on all three, agent
    routes included, where the exception previously escaped the dispatcher entirely.
  - The published types say these exceptions are `Error`s again. `tsup` had been erasing the
    inheritance into an anonymous structural type, so an app writing `throw new UnauthorizedException()`
    tripped `@typescript-eslint/only-throw-error` against the framework's own exceptions — and the
    lint was right about what the `.d.ts` claimed.

## 2.0.0

### Major Changes

- 0d8bfee: **An undeclared route is refused instead of served, in every dispatcher** (#576).

  A controller or agent route that declares neither a guard nor an explicit "open on purpose" now
  answers 403. `undeclaredRoutes` defaulted to `'warn'` in `@theokit/http@1.2.0`, which served the
  request and logged a line promising this change; a safe default an app has to switch on protects
  only the apps that were already reading their logs.

  The check also reached one dispatcher out of three. `@theokit/http` ships `TheoApp`,
  `createDecoratorHandler` and `httpDecoratorsPlugin` over the same route metadata, and the framework's
  own controller dispatch — `theokit dev`, `theokit start` — reuses `createDecoratorHandler`, which
  looked at the question nowhere. The decision is computed once now, on the metadata walk
  (`WalkResult.access`), so a fourth dispatcher cannot ship without it.

  `@UseGuards()` with no arguments no longer counts as a declaration, at dispatch or at build. It
  named nobody who decides while reading as guarded, and the two gates disagreed about it: the build
  passed and the request was served unguarded.

  Migration: `@Public()` for a route anyone may call, `@UseGuards(...)` for one someone decides,
  `access: 'public'` / `guards: [...]` on an agent entry. `undeclaredRoutes: 'warn'` restores the
  previous behaviour per app while you migrate. Full guide in `MIGRATION.md`.

  **`Authenticated(sessions)` — the guard every app was writing by hand** (#574).

  `theokit/server/auth` now exports the controller equivalent of
  `.policy(({ subject }) => subject !== null)`. Measured in the first real adopter: 8 controllers, 6
  copies of a 22-line `AuthGuard`, and the first version of that class read the subject off the guard's
  `ExecutionContext` — which carries no subject — so it denied everyone and passed the only test aimed
  at it, because that test asserted an unauthenticated request is refused.

## 1.2.0

### Minor Changes

- 6cee319: Two authoring surfaces stop making consumers write framework internals by hand.

  **`@Public()`** (`@theokit/http`) — since #514 every controller route must declare an access
  decision, so this sits on the critical path of every route an adopter writes. The route builder says
  `.policy('public')`; a controller had to say `@SetMetadata('theokit:public', true)`, copying the
  framework's metadata key into app source from a build-time module no entry point reaches. Measured in
  the first real adopter: 8 controllers, 6 copies of that string. `PUBLIC_ROUTE_METADATA` is exported
  with it, so one importable definition replaces a key that could not be changed without a coordinated
  edit in every app. `SetMetadata` stays for anything custom, and this does not make controllers a
  second policy engine — `.policy()` remains the richer surface.

  **Plugin authoring types** (`theokit/server/define`) — `TheoPlugin`, `PluginContext`,
  `PluginErrorContext` and the four hook signatures existed and were unexported, so an app writing a
  plugin could not name the shape of its own subject and declared structural copies instead. Those
  compile, and go on compiling after the framework's shape changes, until something fails at runtime.

  **`subjectFromContext` fails loudly** — given a controller guard's `ExecutionContext` it used to
  answer `null`, which is indistinguishable from "anonymous caller", so a guard written on it denied
  everyone and passed the only test aimed at it. It now throws and names the alternative. An anonymous
  run-context still answers `null`, and a context carrying both a subject and `getRequest` still
  resolves — the absence is the trigger, not the shape.

- f55cd1b: A route that declared no access decision is now distinguishable from one declared open, and can be
  refused.

  `guards: []` meant two things at once (#576) — _"open on purpose"_ and _"nobody said"_ — and the
  dispatcher, unable to tell them apart, took the permissive reading. For controllers that was safe
  only while a separate build gate (#514) refused undeclared controller routes, which makes least
  privilege a property of the **pipeline** rather than of the system; `@theokit/http` is published on
  its own, so reaching the dispatcher without that build is an ordinary way to use it. Agent routes
  had neither gate: they are auto-wired, dispatched before everything else, and a capability-authored
  agent has no class to hang `@UseGuards` on, so `guards` was `undefined` → `?? []` → served.

  - `AgentAppEntry.access?: 'public' | 'guarded'` makes the decision explicit. A non-empty `guards`
    still counts as a declaration, so nothing that already guards its routes has to re-declare it.
  - Every undeclared route warns **once at mount**, naming the route and the remedy for its own
    surface (`access: 'public'` for an agent entry, `@Public()` for a controller).
  - `TheoAppOptions.undeclaredRoutes: 'warn' | 'deny'` — `'deny'` answers 403 instead.

  **The default is `'warn'`, and that is deliberate.** Flipping it here would break every app whose
  agent endpoints are open today — precisely the population this issue is about — inside a non-major
  release. It becomes `'deny'` in the next major; `'deny'` is available now for anyone who wants the
  property before then.

  `emit-controllers` now imports `PUBLIC_ROUTE_METADATA` from `@theokit/http` instead of redeclaring
  it, and its refusal message teaches `@Public()` rather than the raw `@SetMetadata` string.

### Patch Changes

- 98b4f83: A controller whose constructor throws answers 500 for its own routes instead of exiting the process.

  Reported from a real app (#577): one optional plugin's env var was unset, the app booted, logged the
  plugin as skipped, printed its URL — and then died on the first request to **any** route, from an
  unhandled rejection inside the dispatcher. `createDecoratorHandler` built every controller in one
  loop before serving anything, so one class failing to construct discarded the handler for all of
  them; because the framework builds that handler lazily inside request dispatch, the throw escaped
  into the request.

  The routes of a controller that failed to build are still registered and now answer 500
  `CONTROLLER_CONSTRUCTION_FAILED`, carrying the cause and the controller's name — with the stack
  redacted in production by the same `digestError` every other error path here uses. The failure is
  also logged once, at construction: containment is not swallowing, and a 500 nobody reads is the
  silent failure this codebase refuses elsewhere.

  Every other controller serves normally, which is the whole point — the operator had been told the
  plugin degraded gracefully, and it had widened one route's failure to the process.

## 1.1.2

### Patch Changes

- 420ee70: A controller can read the raw request body again.

  `resolveBody` consumed the request to populate `@Body`, unconditionally for POST, PUT and PATCH, and swallowed the failure when the payload was not JSON. The read still happened, so a handler taking `@Req()` received a request with `bodyUsed: true` and every later read threw `Body is unusable`.

  That made `multipart/form-data` uploads and any signature-covered payload unreachable from a controller: the content-type and boundary arrived intact and the body was gone, while `@Body()` resolved to `undefined` because the JSON parse that drained it had failed.

  It now reads a `clone()`. The JSON path is unchanged.

## 1.1.1

### Patch Changes

- d222546: Both static-file servers now refuse to serve a file that lives outside the directory they were
  configured to serve, and each of them reads the file it checked rather than re-resolving the path.

  The traversal guards were operating on the path _string_ while the read operated on the
  _filesystem_, and a symlink is exactly the case where those two disagree. `serveStaticFile` resolved
  to absolute and compared the result against `clientDir`; `createStaticHandler` rejected `..` and `//`
  segments in the request pathname. Neither touches the disk, so an entry inside the served directory
  that pointed somewhere else passed both checks and the server returned the target's contents — any
  file the server process could open, to an unauthenticated `GET`. Serving a directory that also
  receives uploads, or unpacking an archive that carries a symlink, is enough to put one there.

  Containment is now decided by `realpath`, which asks the filesystem the question the string check
  cannot answer. Symlinks are not banned: one whose target stays inside the served tree is ordinary and
  is still served. Leaving is what is refused, and it is refused as "not here" rather than `403`, so
  the response does not confirm what exists outside. A URL that walks out with `..` still gets its
  `403`.

  The same lines carried a second defect. Each server resolved the path more than once — check the
  existence, stat the type or the size, then read the bytes — so what was checked was not necessarily
  what was served. Each now opens one descriptor and does both through it. Where a size _limit_ was
  enforced this was the limit being bypassable rather than enforced: the custom error pages
  (`MAX_ERROR_HTML_BYTES`) and the OpenAPI spec endpoint (`MAX_SPEC_BYTES`) both measured one file and
  could read another. `@theokit/http` additionally reported `content-length` from a separately sampled
  `stat.size` while the body came from its own read, so a file that changed size between the two
  produced a response whose declared length disagreed with its body; the length now comes from the
  bytes that were actually read.

  A path that stays inside its root behaves exactly as before — same status, same headers, same bytes.

## 1.1.0

### Minor Changes

- Removida a `peerDependency` em `@theokit/agents`. Ela invertia a direção do grafo (`agents`
  depende de `http`, nunca o contrário) e sua faixa, `>=0.47.0`, nomeava a linha de versão de outro
  pacote — nunca foi uma declaração de compatibilidade. Na prática, arrastava uma cópia antiga de
  `@theokit/agents` para dentro da árvore de instalação de todo consumidor, ao lado da versão que ele
  realmente pediu.

  A correção já existia no código desde a quebra do ciclo `agents ↔ http`, mas nunca chegou a
  ninguém: `1.0.0` foi publicado antes dela e a versão não subiu, então o registry continuou servindo
  o manifesto antigo. Esta é a release que entrega o fix.

  Nada a fazer para migrar. Quem depende de `@theokit/agents` continua declarando essa dependência
  normalmente — a diferença é que agora só uma cópia é instalada.

## 1.0.0

### Major Changes

- b77cf03: **Agent decorators removed — authoring is now capability composition (M53).**

  BREAKING for `@theokit/agents`: every **agent** decorator is gone. The `@theokit/http` **controller**
  decorators (`@Controller`/`@Get`/`@Post`/`@UseGuards`) are untouched.

  - **Removed:** `@Agent`, `@MainLoop`, `@Tool`, `@Toolbox`, `@HumanInTheLoop`, `@Skills`, `@Memory`,
    `@ContextWindow`, `@ProjectContext`, `@MCP`, `@Guardrails`, `@Checkpoint`, `@SubAgents`,
    `@Compaction`, `@Gateway`, `@Trace`, `@Audit`, `@RequiresApproval`, `@Mixin` — plus nine that
    wrote metadata **no production code read** (`@Artifact`, `@Hook`, `@Observable`, `@Sandbox`,
    `@EditFormat`, `@Model`, `@RequiresCapability`, `@Policy`, `@Budget`). `@Model` never set the
    model and `@Sandbox` never sandboxed anything; deleting them removes no behavior.
  - **Replacement:** `applyCapabilities([...])` composing `ModelCapability`, `AgentConfigCapability`,
    `MainLoopCapability`, `ToolboxCapability`, `skills()`, `memory()`, `mcpServers()`, `guardrails()`,
    `checkpoint()` and friends. Conflicting declarations now fail with a typed
    `CapabilityConflictError` instead of last-write-wins, and `provenance` records which capability
    contributed each field.
  - **Also removed:** `bridge/walk-agent-metadata.ts` (the metadata walk) and `compileAgent`. The
    `reflect-metadata` **required peer dependency** and `experimentalDecorators`/
    `emitDecoratorMetadata` are gone from `packages/agents` — consumers of the agent surface can drop
    all three.
  - **BREAKING for `@theokit/http`:** `TheoApp.create({ agents })` and `agentsPlugin({ agents })` take
    prepared entries (`{ name, route, compiled }`) instead of decorated classes; `delegate()` and
    `AgentRunner` take a spec instead of a class (`AgentRunner.builder(Class)` →
    `AgentRunner.fromSpec(spec)`).

  Migration guide with the full decorator→capability map: [`MIGRATION.md`](./MIGRATION.md).

  Two real defects were found and fixed while doing this: every HTTP-served agent was silently running
  the **fallback model** (`@Agent({ model })` and `llmModel` were both dropped because `walk` was
  passed where `compiled` was expected, through an untyped dynamic import), and the agents branch of
  `TheoApp` had **no test at all** — `@theokit/agents` was never declared in `packages/http`'s
  `package.json`, so nothing could link it.

## 0.7.0

### Minor Changes

- acdf585: `@Expose` decorator — make an agent's exposure visible in one code review (M47, ADR-0059).

  Put a `@Controller('/api/agents')` class with `@Expose(chatAgent, { csrf: true })` (+ `@UseGuards(...)`) next to your other controllers, and a reviewer sees in one file WHAT the agent is (`chatAgent`, built separately in `agents/chat.ts`), WHERE it's served (`POST /api/agents/chat`), and its security. The agent stays built separately; the exposure is explicit and opt-in — the zero-config `agents/*.ts` convention is unchanged.

  On the frontend, `import { chat } from '@theo/agents'; useAgent(chat)` binds with **no magic string and no duplicated input type**: the path comes from the generated typed handle and `send` is inferred from the agent's `.input()` (cmd-click `chat` → `agents/chat.ts`). The same handle drives every surface — web `useAgent(chat)`, terminal `useAgent(chat.inProcess(run))`, desktop `createAgentClient(chat.channel(source))`.

  - `@theokit/http` gains the `Expose` decorator + `ExposeOptions`/`ExposeEntry` types, the `WalkResult.agent` field, a `serveAgent` seam on `createDecoratorHandler` (http stays agent-runtime agnostic), and `@UseGuards` widened to a `PropertyDecorator` (per-agent auth on the `@Expose` property).
  - `theokit` gains `AgentHandle` / `agentHandle` in `theokit/client`, a `useAgent(handle)` overload, and codegen that emits one typed handle per agent.
  - One runtime under it all (`mountAgent`): `@Expose`, `@Agent`, and the file convention are authoring surfaces, not competing paths (a grep gate proves no parallel agent streamer ships).

## 0.6.0

### Minor Changes

- 55afcec: Decorator controllers now reach parity with file-based `route()` inside a theokit app (#122).

  Put a `@Controller` class in `server/controllers/*.controller.ts` and in `theokit dev` its routes are **served** alongside file-based routes — sharing CSRF, security headers, CORS, rate-limit, and plugins — and **typed** in `@theo/client` as `client.<ns>.<method>()` with the response type inferred from the handler and `:id` params typed from the route pattern. File-based routes take precedence; a controller only answers paths they miss.

  - File-based routes, the deploy manifest, and the routes-only typed client are unchanged (the swc transform is a strict no-op outside `controllers/`; controllers stay out of `generateManifest`).
  - Request `@Body`/`@Query` types are `unknown` for now — parameter decorators are invisible to the type system (#124); runtime `@Body` Zod validation is unaffected.
  - Production `theokit start` serving of controllers is tracked separately (#123).
  - `@theokit/http` gains `transformControllerSource`, `createDecoratorHandler`, `isControllerClass`, `loadControllerWithSwc`, `loadControllersFromGlob` + supporting types so the framework reuses http's swc + dispatch rather than duplicating them.

## [Unreleased]

## [0.1.0-alpha.0] - 2026-06-08

### Added

- `@Controller(prefix?, opts?)` class decorator with optional host sub-domain matching
- 8 HTTP-verb method decorators: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Options`, `@Head`, `@All`
- 9 parameter decorators: `@Req`, `@Res`, `@Body`, `@Param`, `@Query`, `@Headers`, `@Session`, `@Ip`, `@HostParam`
- 3 response-shape decorators: `@HttpCode`, `@Header`, `@Redirect`
- `@UseGuards(...guards)` and `@UseInterceptors(...interceptors)` class/method decorators
- Bridge engine: `walkControllerMetadata()` produces structured `WalkResult[]` from decorator metadata
- `registerControllers([...])` low-level API with dedup + warn on duplicates
- `resolveDtoSchema()` for Pattern D2 (Zod `static schema` convention on DTO classes)
- `HttpDecoratorsConfigError` with actionable messages for missing `@Controller` and `emitDecoratorMetadata`
- `joinPath()` with leading/trailing slash normalization
- Metadata facade: 8 symbol keys + typed `setMeta`/`getMeta` wrappers over `reflect-metadata`
- 6 Pattern contract tests (D1-D6) verifying locked design decisions
- `theokit generate controller <name>` CLI verb extension
