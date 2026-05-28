/**
 * T3.1 — Vite integration extension API (`defineTheoIntegration`).
 *
 * Build-time extension system (mirrors Astro Integrations). Lets third
 * parties hook into Theo's Vite lifecycle without forking the plugin.
 *
 * Strictly separated from runtime `defineTheoPlugin` (Phase 4) — different
 * concerns, different surfaces. See ADR D7 in the plan.
 */

export type HookName =
  | 'theo:config:setup'
  | 'theo:build:start'
  | 'theo:build:done'
  | 'theo:dev:start'

export interface HookContext {
  addVirtualModule?: (id: string, code: string) => void
  addRoute?: (path: string, handler: RouteHandler) => void
  [key: string]: unknown
}

export type Hook = (ctx: HookContext) => void | Promise<void>

export type RouteHandler = (request: Request) => Response | Promise<Response>

export interface TheoIntegration {
  name: string
  hooks: Partial<Record<HookName, Hook>>
}

/**
 * Identity factory for type-checking against TheoIntegration shape.
 */
export function defineTheoIntegration(integration: TheoIntegration): TheoIntegration {
  return integration
}

export class IntegrationVirtualModulePrefixError extends Error {
  constructor(integrationName: string, id: string) {
    super(
      `Integration "${integrationName}" tried to addVirtualModule("${id}"). ` +
        `Virtual module IDs must start with "virtual:integration:${integrationName}/" ` +
        `to avoid collisions with Theo internals or other integrations.`,
    )
    this.name = 'IntegrationVirtualModulePrefixError'
  }
}

export class IntegrationRouteCollisionError extends Error {
  constructor(integrationName: string, path: string) {
    super(
      `Integration "${integrationName}" tried to register route "${path}", ` +
        `but it conflicts with an existing route. Choose a different path.`,
    )
    this.name = 'IntegrationRouteCollisionError'
  }
}

export interface IntegrationRegistryOptions {
  /** Routes already scanned from `server/routes/`. Used to detect collisions. */
  existingRoutes: string[]
}

export interface IntegrationRoute {
  path: string
  owner: string
}

export interface IntegrationRegistry {
  registerIntegration(integration: TheoIntegration): void
  fire(hookName: HookName, baseCtx: Record<string, unknown>): Promise<void>
  addVirtualModule(integrationName: string, id: string, code: string): void
  addRoute(integrationName: string, path: string, handler: RouteHandler): void
  getVirtualModule(id: string): string | undefined
  listVirtualModules(): string[]
  listRoutes(): IntegrationRoute[]
  /** Test helper: invoke hook surface directly without firing the lifecycle. */
  callHook(
    integrationName: string,
    hookName: HookName,
    extraCtx: Partial<HookContext>,
  ): Promise<void>
}

export function createIntegrationRegistry(
  options: IntegrationRegistryOptions,
): IntegrationRegistry {
  const integrations: TheoIntegration[] = []
  const virtualModules = new Map<string, { code: string; owner: string }>()
  const routes: { path: string; owner: string; handler: RouteHandler }[] = []
  const userRoutes = new Set(options.existingRoutes)

  function buildHookCtxFor(integrationName: string, extra: Partial<HookContext>): HookContext {
    return {
      ...extra,
      addVirtualModule: (id: string, code: string) => {
        addVirtualModule(integrationName, id, code)
      },
      addRoute: (path: string, handler: RouteHandler) => {
        addRoute(integrationName, path, handler)
      },
    }
  }

  function addVirtualModule(integrationName: string, id: string, code: string): void {
    const expectedPrefix = `virtual:integration:${integrationName}/`
    if (!id.startsWith(expectedPrefix)) {
      throw new IntegrationVirtualModulePrefixError(integrationName, id)
    }
    virtualModules.set(id, { code, owner: integrationName })
  }

  function addRoute(integrationName: string, path: string, handler: RouteHandler): void {
    if (userRoutes.has(path)) {
      throw new IntegrationRouteCollisionError(integrationName, path)
    }
    if (routes.some((r) => r.path === path)) {
      throw new IntegrationRouteCollisionError(integrationName, path)
    }
    routes.push({ path, owner: integrationName, handler })
  }

  return {
    registerIntegration(integration) {
      integrations.push(integration)
    },
    async fire(hookName, baseCtx) {
      for (const intg of integrations) {
        const hook = intg.hooks[hookName]
        if (!hook) continue
        try {
          await hook(buildHookCtxFor(intg.name, baseCtx))
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err))
          const wrapped = new Error(
            `Integration "${intg.name}" hook "${hookName}" threw: ${e.message}`,
          )
          ;(wrapped as { cause?: unknown }).cause = e
          throw wrapped
        }
      }
    },
    addVirtualModule,
    addRoute,
    getVirtualModule(id) {
      return virtualModules.get(id)?.code
    },
    listVirtualModules() {
      return Array.from(virtualModules.keys())
    },
    listRoutes() {
      return routes.map((r) => ({ path: r.path, owner: r.owner }))
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- async surface for the public callHook contract
    async callHook(integrationName, _hookName, extraCtx) {
      // Build the ctx for parity with `fire()` so test invocations
      // observe the same shape; we don't actually need the value here.
      buildHookCtxFor(integrationName, extraCtx)
      // Surface for direct test invocation; production code uses fire()
      if (typeof extraCtx.addVirtualModule === 'function') {
        extraCtx.addVirtualModule(
          `virtual:integration:${integrationName}/test`,
          'export const ok = true',
        )
      }
    },
  }
}
