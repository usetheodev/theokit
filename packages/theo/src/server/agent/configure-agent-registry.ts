/**
 * Phase 6 — Production-Readiness #2: configure Agent.registry lazily on
 * first request.
 *
 * Why lazy: module-load timing races with bundler config resolution (some
 * apps load theo.config.ts asynchronously). Deferring until the first
 * request guarantees the config is fully materialized.
 *
 * EC-3 (MUST FIX) — sync flag flip BEFORE configure() prevents a race when
 * 2+ concurrent first-requests hit cold start:
 *
 *   WRONG:  if (!configured) { configure(opts); configured = true }
 *           → both concurrent callers pass the guard, configure runs twice.
 *
 *   RIGHT:  if (!configured) { configured = true; configure(opts) }
 *           → second caller sees flag=true, exits the guard. If configure
 *             throws, the flag rolls back so a future request can retry.
 *
 * EC-14 (DOCUMENT): if user code calls `Agent.registry.configure()` manually
 * BEFORE this lazy fire, TheoKit overrides with theo.config.ts values.
 * Framework wins by design — production config lives in theo.config.ts.
 */

interface AgentRegistryConfig {
  maxAgents?: number
  idleTimeoutMs?: number
}

interface RegistryLike {
  configure(opts: AgentRegistryConfig): void
}

let configured = false

/**
 * Idempotent — only the first call effects a configure(); subsequent calls
 * are no-ops. Safe under concurrency (EC-3 sync flag flip).
 *
 * @param registry — the SDK's Agent.registry (or any object with `configure`)
 * @param config — values from `theo.config.ts > agents.registry`; undefined skips
 */
export function configureAgentRegistryOnce(
  registry: RegistryLike,
  config: AgentRegistryConfig | undefined,
): void {
  if (configured) return
  if (config === undefined) {
    // No user config — SDK defaults apply. Mark configured so we don't
    // re-check on every request, but don't actually call configure().
    configured = true
    return
  }
  // EC-3 — flip BEFORE configure to prevent race
  configured = true
  try {
    registry.configure(config)
  } catch (err) {
    // Roll back the flag so a future request can retry. Only happens on
    // SDK bug — extremely rare.
    configured = false
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[theokit] Agent.registry.configure threw (will retry on next request): ${msg}`)
  }
}

/**
 * @internal — testing helper. Resets the module-scoped flag.
 */
export function __resetAgentRegistryConfigForTests(): void {
  configured = false
}

/**
 * @internal — testing helper. Reports configure state.
 */
export function __isAgentRegistryConfigured(): boolean {
  return configured
}
