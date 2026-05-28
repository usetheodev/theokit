/**
 * theokit/server — public barrel.
 *
 * T4.4 (architecture-cleanup, ADR-0001 v3): slim aggregation via `export *`
 * from thematic sub-barrels. Consumers MAY also import directly from subpaths
 * (`theokit/server/auth`, `theokit/server/cost`, `theokit/server/cron`,
 * `theokit/server/jobs`) — recommended for new code; this top-level barrel
 * stays as a backwards-compat path until 1.0.
 *
 * For body-parser, serialization, transformer, webhook helpers, trace context
 * propagation, error pages, plugin types, and config/env helpers — re-exported
 * inline because they don't fit a single sub-barrel cleanly.
 */

// Core defines + low-level pipeline primitives (used by adapter templates)
export * from './define/index.js'
export * from './http/index.js'
export * from './scan/index.js'

// Subdomain sub-barrels (consumers can also import direct: theokit/server/<sub>)
export * from './agent/index.js'
export * from './auth/index.js'
export * from './cost/index.js'
export * from './cron/index.js'
export * from './jobs/index.js'
export * from './observability/index.js'
export * from './plugins/index.js'
export * from './rate-limit/index.js'
export * from './realtime/index.js'
export * from './security/index.js'
export * from './storage/index.js'
export * from './webhook/index.js'

// Cross-module: cache lives at packages/theo/src/cache/ (not server/cache)
export * from '../cache/index.js'

// Inline re-exports — items that don't belong to a single sub-barrel
export { parseRequestBody, FileTooLargeError } from './body-parser.js'
export type { UploadedFile, ParsedBody, BodyParserOptions } from './body-parser.js'

export { serializeResponse, deserializeResponse } from './serialization.js'
export type { SerializedResponse } from './serialization.js'

export { superjsonTransformer, jsonTransformer, resolveTransformer } from './transformer.js'
export type { TheoTransformer } from './transformer.js'

// Plugin types (used by definePlugin + extension authors)
export type {
  TheoPlugin,
  TheoApp,
  PluginContext,
  PluginErrorContext,
  HookName,
  HookResult,
  OnRequestHook,
  PreHandlerHook,
  OnResponseHook,
  OnErrorHook,
  RunHookOptions,
} from './plugin-types.js'
export { definePlugin } from './plugin-types.js'

// Config helpers — auto-load .env for standalone server scripts (Telegram bots,
// queue consumers, cron jobs) that bypass the CLI.
export { loadEnv, _resetEnvCache } from '../config/load-env.js'
export type { LoadEnvOptions, LoadEnvResult } from '../config/load-env-types.js'

// Wave 2 — Polyglot services orchestration types (types only — runtime in services/)
export type {
  ServiceDefinition,
  ServicesConfig,
  ServicesConfigInput,
  ServicesConfigOutput,
} from '../services/index.js'
