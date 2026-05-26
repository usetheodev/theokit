export { defineRoute } from './define/define-route.js'
export type { RouteConfig } from './define/define-route.js'

// T1.4 — auto-load .env for server code. Public surface for standalone
// scripts (Telegram bot, queue consumers, cron jobs) that bypass the CLI.
export { loadEnv, _resetEnvCache } from '../config/load-env.js'
export type { LoadEnvOptions, LoadEnvResult } from '../config/load-env-types.js'

export { defineAgentEndpoint } from './define/define-agent-endpoint.js'
export type {
  AgentEndpointConfig,
  AgentEndpointHandlerArgs,
} from './define/define-agent-endpoint.js'

export { defineAgentTool } from './define/define-agent-tool.js'
export type { DefineAgentToolSpec, CustomTool } from './define/define-agent-tool.js'

export { streamAgentRun } from './agent/stream-agent-run.js'

export { createConversationHistory } from './agent/create-conversation-history.js'
export type {
  ConversationHistoryArgs,
  ConversationHistoryResult,
  SdkAgent,
  SdkAgentOptions,
} from './agent/create-conversation-history.js'

export { defineAction } from './define/define-action.js'
export type { ActionConfig } from './define/define-action.js'

export { defineMiddleware } from './define/define-middleware.js'
export type { MiddlewareHandler } from './define/define-middleware.js'

export { parseRequestBody, FileTooLargeError } from './body-parser.js'
export type { UploadedFile, ParsedBody, BodyParserOptions } from './body-parser.js'

export { getCookie, setCookie, deleteCookie } from './http/cookies.js'
export type { CookieOptions } from './http/cookies.js'

export { createRateLimiter } from './rate-limit/rate-limit.js'
export type { RateLimitConfig, RateLimitResult } from './rate-limit/rate-limit.js'

export { createSessionManager, assertProductionSecret, rotateIfNeeded } from './auth/session.js'
export type { SessionManager, SessionConfig, SessionMeta } from './auth/session.js'

export { JsonStdoutSink, createNoOpLogger, safeAudit } from './observability/audit-log.js'
export type { AuditLogger, AuditEvent } from './observability/audit-log.js'

// T2.1 — pluggable rate-limit store
export { InMemoryStore } from './rate-limit/rate-limit-store.js'
export type { RateLimitStore, RateLimitState } from './rate-limit/rate-limit-store.js'

// T2.2 — per-route + per-user rate limit
export {
  createRouteRateLimiter,
  matchRoutePattern,
  deriveKey,
} from './rate-limit/rate-limit-per-route.js'
export type { RouteRateLimitConfig, KeyByMode } from './rate-limit/rate-limit-per-route.js'

// T5.1 — CSP report endpoint helpers
export {
  handleCspReport,
  normalizeLegacy,
  normalizeNew,
  CSP_REPORT_PATH,
} from './security/csp-report.js'
export type { CspViolation, CspReportHandlerOptions } from './security/csp-report.js'

// T6.1 — login throttle primitive
export { checkThrottle, recordAttempt } from './auth/auth-throttle.js'
export type { ThrottleOptions, ThrottleState } from './auth/auth-throttle.js'

// T6.2 — TOTP RFC 6238
export { generateTotp, verifyTotp, generateTotpSecret, totpUri } from './auth/auth-totp.js'
export type {
  TotpOptions,
  VerifyTotpOptions,
  TotpAlgorithm,
  TotpUriOptions,
} from './auth/auth-totp.js'

// T6.3 — Backup codes
export { generateBackupCodes, verifyBackupCode } from './auth/auth-backup-codes.js'
export type { BackupCode, BackupCodeOptions } from './auth/auth-backup-codes.js'

// T7.3 — RFC 7636 PKCE
export { generatePkceChallenge, pkceChallengeFromVerifier } from './auth/oauth-pkce.js'
export type { PkceChallenge } from './auth/oauth-pkce.js'

// T7.4 — OAuth state + OIDC discovery
export { generateOAuthState, verifyOAuthState } from './auth/oauth-state.js'
export { discoverOidcProvider, clearOidcCache } from './auth/oidc-discovery.js'
export type { OidcMetadata } from './auth/oidc-discovery.js'

// T1.2 — CORS handler
export { createCorsHandler, matchesOrigin } from './http/cors.js'
export type { CorsConfig, CorsOrigin, CorsHandler } from './http/cors.js'

export { requireAuth, AuthRequiredError } from './auth/auth.js'

export { defineWebSocket } from './define/define-websocket.js'
export type { WebSocketHandler, WebSocketLike } from './define/define-websocket.js'

export { defineChannel } from './define/define-channel.js'
export type { ChannelHandler } from './define/define-channel.js'

export { ChannelManager } from './realtime/channel-manager.js'

export { createLogger, logRequest } from './observability/logger.js'
export type { TheoLogger, LogLevel, StructuredLog, RequestLog } from './observability/logger.js'

export { serializeResponse, deserializeResponse } from './serialization.js'
export type { SerializedResponse } from './serialization.js'

export { generateManifest, writeManifest, loadManifest } from './scan/manifest.js'
export type {
  TheoManifest,
  ManifestRoute,
  ManifestAction,
  ManifestWebSocket,
  LoadedManifest,
} from './scan/manifest.js'

// Low-level pipeline primitives — exported so runtime adapters (Bun, Netlify,
// AWS Lambda) can drive the same executeRoute pipeline that dev mode uses.
export { scanServerRoutes } from './scan/scan.js'
export { matchRoute } from './scan/match.js'
export { executeRoute, sendError, sendJson } from './http/execute.js'
export { createProductionLoader, createViteLoader } from './scan/module-loader.js'
export type { ServerRouteNode } from './scan/match.js'
export type { LoadModule } from './scan/module-loader.js'

export { defineTheoPlugin } from './define/define-plugin.js'
export {
  PluginRunner,
  DuplicatePluginError,
  DuplicateDecorationError,
} from './plugins/plugin-runner.js'
export { createPluginRunnerFromConfig, InvalidPluginShapeError } from './plugins/load-plugins.js'

// Cache primitives (Phase 1–7, caching-and-revalidation-plan)
export { defineCachedFunction } from '../cache/define-cached-function.js'
export type {
  CachedFunction,
  DefineCachedFunctionOptions,
} from '../cache/define-cached-function.js'

export {
  defineCachedRoute,
  DEFAULT_MAX_ENTRY_SIZE as CACHE_DEFAULT_MAX_ENTRY_SIZE,
} from '../cache/define-cached-route.js'
export type { CachedRouteConfig, RouteCacheOptions } from '../cache/define-cached-route.js'

export { revalidatePath, revalidateTag, updateTag } from '../cache/revalidate.js'
export type { RevalidateResult } from '../cache/revalidate.js'

export { createCacheEngine } from '../cache/cache-engine.js'
export type {
  CacheEngine,
  CacheEngineOptions,
  CacheStatus,
  GetOrComputeOptions,
} from '../cache/cache-engine.js'

export { InMemoryCacheAdapter } from '../cache/in-memory-adapter.js'
export type { InMemoryCacheAdapterOptions } from '../cache/in-memory-adapter.js'

export type {
  CacheEntry,
  CacheStorageAdapter,
  CacheStore,
  CacheStoreAdmin,
} from '../cache/storage-adapter.js'

export { _resetCacheEngine, getCacheEngine, initCacheEngine } from '../cache/engine-singleton.js'
export type { NormalizedCacheConfig } from '../cache/engine-singleton.js'

export { compileRouteRules, resolveRouteRule } from '../cache/route-rules.js'
export type { CompiledRouteRule, RouteRule, RouteRules } from '../cache/route-rules.js'

export { getCacheControlHeader } from '../cache/cache-control-header.js'
export type { CacheControlInput } from '../cache/cache-control-header.js'

export {
  DEFAULT_EXCLUDED_QUERY_PARAMS,
  deriveKey as deriveCacheKey,
} from '../cache/key-derivation.js'
export type { KeyDerivationOptions } from '../cache/key-derivation.js'

export {
  validateExpire as validateCacheExpire,
  validateMaxAge as validateCacheMaxAge,
  validateTags as validateCacheTags,
} from '../cache/validation.js'
export type { ValidationResult as CacheValidationResult } from '../cache/validation.js'

export {
  CACHE_TAG_MAX_ITEMS,
  CACHE_TAG_MAX_LENGTH,
  DEFAULT_MAX_AGE as CACHE_DEFAULT_MAX_AGE,
  DEFAULT_SWR_MULTIPLIER as CACHE_DEFAULT_SWR_MULTIPLIER,
  THEO_T_PREFIX,
} from '../cache/constants.js'

export { superjsonTransformer, jsonTransformer, resolveTransformer } from './transformer.js'
export type { TheoTransformer } from './transformer.js'

export { loadCustomErrorPages, MAX_ERROR_HTML_BYTES } from './http/error-pages.js'
// T1.1 — Agent runtime event variant (standalone in TheoKit; no TheoUI coupling)
export type {
  AgentEvent,
  AgentMessageEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentErrorEvent,
} from './agent/agent-types.js'
export type { CustomErrorPages } from './http/error-pages.js'
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

// Cron primitives (Phase 1, jobs-crons-webhooks-cost-tracking-plan, R0.5.4)
export { defineCron } from './cron/define-cron.js'
export type {
  CronOptions,
  CronContext,
  CronDefinition,
  CronConcurrencyPolicy,
} from './cron/cron-types.js'
export { validateCronSchedule } from './cron/cron-validate.js'

// Webhook foundation helpers (Phase 0, jobs-crons-webhooks-cost-tracking-plan)
export { timingSafeEqual } from './webhook/timing-safe-equal.js'
export { readRawBody, BodyTooLargeError, DEFAULT_MAX_BODY_BYTES } from './webhook/raw-body.js'
export type { RawBodyResult, ReadRawBodyOptions } from './webhook/raw-body.js'

// Trace context propagation (Phase 0)
export {
  extractTraceContext,
  injectTraceContext,
  generateNewTraceContext,
} from './observability/trace-context-propagation.js'
export type { TraceContext } from './observability/trace-context-propagation.js'

// Jobs primitives (Phase 2-3, R0.5.5-9)
export { defineJob } from './jobs/define-job.js'
export type { JobOptions, JobContext, JobDefinition, JobRegistry } from './jobs/job-types.js'
export { NonRetryableError } from './jobs/job-backend.js'
export type { JobBackend, JobEnqueueInput, JobLease } from './jobs/job-backend.js'
export { DuplicateContextKeyError } from './jobs/duplicate-context-key-error.js'
export { InMemoryJobBackend } from './jobs/job-backend-memory.js'
export type { InMemoryJobBackendOptions } from './jobs/job-backend-memory.js'
export { PostgresJobBackend } from './jobs/job-backend-postgres.js'
export type { PoolLike, PostgresJobBackendOptions } from './jobs/job-backend-postgres.js'
export { createOutbox } from './jobs/outbox.js'
export type { Outbox, OutboxFlushOptions } from './jobs/outbox.js'
export { createQueueClient, createOutboxDispatcher } from './jobs/queue-client.js'
export type { QueueClient, EnqueueOptions } from './jobs/queue-client.js'
export { createJobRunner } from './jobs/job-runner.js'
export type { JobRunner } from './jobs/job-runner.js'

// Webhook primitives (Phase 4, R0.5.10)
export { defineWebhook, dispatchWebhook } from './webhook/define-webhook.js'
export type {
  DefineWebhookOptions,
  WebhookDefinition,
  WebhookContext,
  VerifyFn,
  VerifyResult,
} from './webhook/webhook-types.js'

// Cost tracking primitives (Phase 5, R0.5.11)
export { trackAgentRun } from './cost/track-agent-run.js'
export type { TrackAgentRunInput, TrackAgentRunOptions } from './cost/track-agent-run.js'
export type {
  UsageRecord,
  ToolUsageRecord,
  UsageQuery,
  UsageResult,
  UsageStorageAdapter,
} from './cost/cost-types.js'
export { InMemoryUsageStorage } from './cost/usage-storage-memory.js'

// Phase 5 — tool lifecycle hooks for cost tracking (Production-Readiness #4)
export { trackAgentTools } from './cost/track-agent-tools.js'
export type {
  TrackAgentToolsOptions,
  TrackAgentToolsHooks,
  ToolHookEvent,
} from './cost/track-agent-tools.js'
