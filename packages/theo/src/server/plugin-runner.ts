import type {
  HookName,
  HookResult,
  OnErrorHook,
  OnRequestHook,
  OnResponseHook,
  PluginContext,
  PluginErrorContext,
  PreHandlerHook,
  RunHookOptions,
  TheoApp,
  TheoPlugin,
} from './plugin-types.js'

export class DuplicatePluginError extends Error {
  constructor(name: string) {
    super(`Plugin "${name}" is already registered.`)
    this.name = 'DuplicatePluginError'
  }
}

export class DuplicateDecorationError extends Error {
  constructor(key: string, existingPlugin: string, newPlugin: string) {
    super(
      `Plugin "${newPlugin}" tried to decorate ctx.${key}, but it is already declared by plugin "${existingPlugin}".`,
    )
    this.name = 'DuplicateDecorationError'
  }
}

interface DecorationEntry {
  pluginName: string
  value: unknown
}

export class PluginRunner {
  private plugins = new Set<string>()
  private onRequestHooks: OnRequestHook[] = []
  private preHandlerHooks: PreHandlerHook[] = []
  private onResponseHooks: OnResponseHook[] = []
  private onErrorHooks: OnErrorHook[] = []
  private decorations = new Map<string, DecorationEntry>()

  has(name: string): boolean {
    return this.plugins.has(name)
  }

  async register(plugin: TheoPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new DuplicatePluginError(plugin.name)
    }
    // Add to registry FIRST so duplicate detection works even if register throws.
    this.plugins.add(plugin.name)

    const app: TheoApp = {
      addHook: (name: HookName, fn: unknown) => {
        switch (name) {
          case 'onRequest':
            this.onRequestHooks.push(fn as OnRequestHook)
            return
          case 'preHandler':
            this.preHandlerHooks.push(fn as PreHandlerHook)
            return
          case 'onResponse':
            this.onResponseHooks.push(fn as OnResponseHook)
            return
          case 'onError':
            this.onErrorHooks.push(fn as OnErrorHook)
            return
        }
      },
      // `T` lets call sites bind a stronger value type via the plugin API.
      // The runtime body stores `value` without inspection, so T appears
      // only on the parameter — that is the intended contract.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T documents the per-decoration type for consumers
      decorateRequest: <T>(key: string, value: T) => {
        const existing = this.decorations.get(key)
        if (existing) {
          // Roll back the plugin registration since decoration failed.
          this.plugins.delete(plugin.name)
          throw new DuplicateDecorationError(key, existing.pluginName, plugin.name)
        }
        this.decorations.set(key, { pluginName: plugin.name, value })
      },
    }

    await plugin.register(app)
  }

  applyDecorations(ctx: Record<string, unknown>): void {
    for (const [key, entry] of this.decorations.entries()) {
      ctx[key] = entry.value
    }
  }

  async runOnRequest(ctx: PluginContext): Promise<HookResult> {
    return this.runHookList(this.onRequestHooks, ctx)
  }

  async runPreHandler(ctx: PluginContext): Promise<HookResult> {
    return this.runHookList(this.preHandlerHooks, ctx)
  }

  async runOnResponse(ctx: PluginContext, options: RunHookOptions = {}): Promise<HookResult> {
    return this.runHookList(this.onResponseHooks, ctx, options)
  }

  /**
   * Run all onError hooks. Swallows errors thrown inside hooks themselves to
   * prevent recursion (an error in an error handler must not trigger onError
   * again).
   */
  async runOnError(ctx: PluginContext, error: unknown): Promise<HookResult> {
    const errorCtx: PluginErrorContext = { ...ctx, error }
    for (const hook of this.onErrorHooks) {
      try {
        await hook(errorCtx)
      } catch (innerErr) {
        // EC-9 + onError-safety: swallow to avoid recursion.
        console.error(
          `[plugin-runner] onError hook threw; suppressed to avoid recursion:`,
          innerErr,
        )
      }
    }
    return { shortCircuited: false }
  }

  private async runHookList(
    hooks: readonly ((ctx: PluginContext) => void | Promise<void>)[],
    ctx: PluginContext,
    options: RunHookOptions = {},
  ): Promise<HookResult> {
    for (const hook of hooks) {
      try {
        await hook(ctx)
      } catch (err) {
        if (options.inErrorPath) {
          // EC-9: we're already handling an error; do NOT trigger onError again.
          console.error(`[plugin-runner] hook threw during error path; suppressed (EC-9):`, err)
          continue
        }
        throw err
      }
      if (ctx.response.writableEnded || ctx.response.headersSent) {
        return { shortCircuited: true }
      }
    }
    return { shortCircuited: false }
  }
}
