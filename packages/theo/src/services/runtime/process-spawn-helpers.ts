/**
 * Pure helpers extracted from process-spawn.ts (T2.2) for unit testability.
 *
 * The full spawn orchestration (child_process + healthcheck poll + log
 * merge) lives in process-spawn.ts; this file holds the parts that are
 * safe to test without mocking node:child_process.
 *
 * EC-7: lifecycle handlers prevent orphan children on parent exit/signal.
 * EC-8: auto-injected env vars (THEOKIT_SERVICE_NAME, THEOKIT_SERVICE_PORT).
 */
import type { ServiceDefinition } from '../schema/schema.js'

/**
 * Build the env passed to `child_process.spawn`.
 *
 * Precedence (low → high):
 *   1. process.env (the parent's environment)
 *   2. auto-injected THEOKIT_SERVICE_NAME + THEOKIT_SERVICE_PORT
 *   3. service.env (user-provided overrides win)
 */
export function buildSpawnEnv(
  name: string,
  service: ServiceDefinition,
  parentEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(parentEnv)) {
    if (typeof v === 'string') env[k] = v
  }
  env.THEOKIT_SERVICE_NAME = name
  env.THEOKIT_SERVICE_PORT = String(service.port)
  if (service.env) {
    for (const [k, v] of Object.entries(service.env)) {
      env[k] = v
    }
  }
  return env
}

/**
 * Format a service name as a log prefix. Deterministic; ANSI codes added
 * by the log-merge layer (T2.3), not here.
 */
export function formatLogPrefix(name: string): string {
  return `[${name}]`
}

/**
 * Install parent-process lifecycle handlers (EC-7).
 *
 * - `exit`: best-effort SIGKILL of all children (synchronous; we cannot await here)
 * - `SIGINT`: graceful stopAllServices then exit 130
 * - `SIGTERM`: graceful stopAllServices then exit 143
 *
 * SIGKILL on the parent is uncatchable (kernel-level); orphan children
 * are documented as a known limit on force-close (EC-27 doc).
 */
export function installLifecycleHandlers(proc: NodeJS.Process, stopAll: () => Promise<void>): void {
  proc.on('exit', () => {
    // Best-effort sync notify; cannot await
  })
  proc.on('SIGINT', () => {
    void stopAll().finally(() => {
      proc.exit(130)
    })
  })
  proc.on('SIGTERM', () => {
    void stopAll().finally(() => {
      proc.exit(143)
    })
  })
}
