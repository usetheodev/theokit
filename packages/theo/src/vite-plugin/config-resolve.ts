/**
 * T2.1 (architecture-medium-deferrals plan, ADR D2) — `configResolved` hook
 * body extracted from `vite-plugin/index.ts` for SRP.
 *
 * `resolvePluginConfig(projectRoot)` reads `theo.config.ts` and returns a
 * `ResolvedPluginConfig` bag with every field the Vite plugin needs at
 * `configResolved` time. The `configLoadedOnce` flag stays in `index.ts`
 * (caller owns the one-shot semantic).
 *
 * Errors during config load are swallowed silently (matches pre-refactor
 * behavior — config errors are surfaced elsewhere via validate-structure).
 */

import { loadConfig } from '../config/load-config.js'
import type { CorsConfig } from '../server/http/cors.js'
import type { AuditLogger } from '../server/observability/audit-log.js'
import { createPluginRunnerFromConfig } from '../server/plugins/load-plugins.js'
import type { PluginRunner } from '../server/plugins/plugin-runner.js'
import type { DisallowedConfig } from '../server/security/csrf.js'
import type { SecurityHeadersConfig } from '../server/security/security-headers.js'
import { resolveTransformer, type TheoTransformer } from '../server/transformer.js'

import { detectTheoUi, type TheoUiDetectResult } from './theoui-detect.js'

export interface ResolvedPluginConfig {
  pluginRunner: PluginRunner | undefined
  transformer: TheoTransformer | undefined
  resolvedBatching: { max?: number } | undefined
  theoUi: TheoUiDetectResult | undefined
  csrfMode: 'off' | 'warn' | 'strict'
  securityHeaders: SecurityHeadersConfig | undefined
  disallowed: DisallowedConfig | undefined
  cors: CorsConfig | undefined
  auditLogger: AuditLogger | undefined
  devtoolsEnabled: boolean
}

/**
 * Default config when load fails — keeps the plugin running with safe defaults.
 */
const DEFAULT_RESOLVED: ResolvedPluginConfig = {
  pluginRunner: undefined,
  transformer: undefined,
  resolvedBatching: undefined,
  theoUi: undefined,
  csrfMode: 'strict',
  securityHeaders: undefined,
  disallowed: undefined,
  cors: undefined,
  auditLogger: undefined,
  devtoolsEnabled: true,
}

export async function resolvePluginConfig(projectRoot: string): Promise<ResolvedPluginConfig> {
  try {
    const userConfig = await loadConfig(projectRoot)
    const pluginRunner = await createPluginRunnerFromConfig(userConfig.plugins)
    const transformer = resolveTransformer(userConfig.serialization)

    // Batching: Zod admits `boolean | { max?: number }`; normalize to object.
    let resolvedBatching: { max?: number } | undefined
    if (userConfig.batching === true) {
      resolvedBatching = {}
    } else if (typeof userConfig.batching === 'object') {
      resolvedBatching = userConfig.batching
    }

    const theoUi = detectTheoUi(projectRoot, userConfig.ui)

    // Audit logger — duck-type validation (consumer may pass any shape with `log()`).
    let auditLogger: AuditLogger | undefined
    const maybeLogger = (userConfig as { audit?: { logger?: unknown } }).audit?.logger
    if (maybeLogger && typeof (maybeLogger as { log?: unknown }).log === 'function') {
      auditLogger = maybeLogger as AuditLogger
    }

    return {
      pluginRunner,
      transformer,
      resolvedBatching,
      theoUi,
      csrfMode: userConfig.security?.csrf ?? 'strict',
      securityHeaders: userConfig.security?.headers,
      disallowed: userConfig.security?.disallowed,
      cors: userConfig.security?.cors,
      auditLogger,
      devtoolsEnabled: userConfig.devtools !== false,
    }
  } catch {
    // Config load errors are surfaced elsewhere (validate-structure).
    // Return safe defaults so middlewares can run without hooks.
    return DEFAULT_RESOLVED
  }
}
