import type { IncomingMessage, ServerResponse } from 'node:http'

export interface PluginContext {
  request: IncomingMessage
  response: ServerResponse
  ctx: Record<string, unknown>
  requestId: string
}

export interface PluginErrorContext extends PluginContext {
  error: unknown
}

export interface RunHookOptions {
  inErrorPath?: boolean
}

export interface HookResult {
  shortCircuited: boolean
}

export type OnRequestHook = (ctx: PluginContext) => void | Promise<void>
export type PreHandlerHook = (ctx: PluginContext) => void | Promise<void>
export type OnResponseHook = (ctx: PluginContext) => void | Promise<void>
export type OnErrorHook = (ctx: PluginErrorContext) => void | Promise<void>

export type HookName = 'onRequest' | 'preHandler' | 'onResponse' | 'onError'

export type HookByName<K extends HookName> = K extends 'onError'
  ? OnErrorHook
  : K extends 'onRequest'
    ? OnRequestHook
    : K extends 'preHandler'
      ? PreHandlerHook
      : K extends 'onResponse'
        ? OnResponseHook
        : never

export interface TheoApp {
  addHook<K extends HookName>(name: K, fn: HookByName<K>): void
  // `T` lets plugin authors document the per-key shape of decorations.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T documents the value type for plugin authors
  decorateRequest<T>(key: string, value: T): void
}

export interface TheoPlugin {
  name: string
  register(app: TheoApp): void | Promise<void>
}

/**
 * Identity function for plugin authors. Provides auto-completion + type
 * inference at the call site (TanStack/Vite/Astro pattern). Pure runtime
 * no-op — returns the input unchanged.
 *
 * @example
 *   import { definePlugin } from 'theokit/server'
 *   export default definePlugin({
 *     name: 'my-plugin',
 *     register(app) {
 *       app.addHook('onRequest', (req) => { ... })
 *     },
 *   })
 *
 * Equivalent to `const p: TheoPlugin = {...}` but more ergonomic. See
 * ADR-0008 (D1 + D6) for the rationale.
 */
export function definePlugin(plugin: TheoPlugin): TheoPlugin {
  return plugin
}
