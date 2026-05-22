export { defineRoute } from './define-route.js'
export type { RouteConfig } from './define-route.js'

// T1.4 — auto-load .env for server code. Public surface for standalone
// scripts (Telegram bot, queue consumers, cron jobs) that bypass the CLI.
export { loadEnv, _resetEnvCache } from '../config/load-env.js'
export type { LoadEnvOptions, LoadEnvResult } from '../config/load-env-types.js'

export { defineAgentEndpoint } from './define-agent-endpoint.js'
export type { AgentEndpointConfig, AgentEndpointHandlerArgs } from './define-agent-endpoint.js'

export { defineAgentTool } from './define-agent-tool.js'
export type { DefineAgentToolSpec, CustomTool } from './define-agent-tool.js'

export { streamAgentRun } from './stream-agent-run.js'

export { createConversationHistory } from './create-conversation-history.js'
export type {
  ConversationHistoryArgs,
  ConversationHistoryResult,
  SdkAgent,
  SdkAgentOptions,
} from './create-conversation-history.js'

export { defineAction } from './define-action.js'
export type { ActionConfig } from './define-action.js'

export { defineMiddleware } from './define-middleware.js'
export type { MiddlewareHandler } from './define-middleware.js'

export { parseRequestBody, FileTooLargeError } from './body-parser.js'
export type { UploadedFile, ParsedBody, BodyParserOptions } from './body-parser.js'

export { getCookie, setCookie, deleteCookie } from './cookies.js'
export type { CookieOptions } from './cookies.js'

export { createRateLimiter } from './rate-limit.js'
export type { RateLimitConfig, RateLimitResult } from './rate-limit.js'

export { createSessionManager, assertProductionSecret, rotateIfNeeded } from './session.js'
export type { SessionManager, SessionConfig, SessionMeta } from './session.js'

export { JsonStdoutSink, createNoOpLogger, safeAudit } from './audit-log.js'
export type { AuditLogger, AuditEvent } from './audit-log.js'

// T2.1 — pluggable rate-limit store
export { InMemoryStore } from './rate-limit-store.js'
export type { RateLimitStore, RateLimitState } from './rate-limit-store.js'

// T2.2 — per-route + per-user rate limit
export { createRouteRateLimiter, matchRoutePattern, deriveKey } from './rate-limit-per-route.js'
export type { RouteRateLimitConfig, KeyByMode } from './rate-limit-per-route.js'

// T5.1 — CSP report endpoint helpers
export { handleCspReport, normalizeLegacy, normalizeNew, CSP_REPORT_PATH } from './csp-report.js'
export type { CspViolation, CspReportHandlerOptions } from './csp-report.js'

// T6.1 — login throttle primitive
export { checkThrottle, recordAttempt } from './auth-throttle.js'
export type { ThrottleOptions, ThrottleState } from './auth-throttle.js'

// T6.2 — TOTP RFC 6238
export { generateTotp, verifyTotp, generateTotpSecret, totpUri } from './auth-totp.js'
export type { TotpOptions, VerifyTotpOptions, TotpAlgorithm, TotpUriOptions } from './auth-totp.js'

// T6.3 — Backup codes
export { generateBackupCodes, verifyBackupCode } from './auth-backup-codes.js'
export type { BackupCode, BackupCodeOptions } from './auth-backup-codes.js'

// T7.3 — RFC 7636 PKCE
export { generatePkceChallenge, pkceChallengeFromVerifier } from './oauth-pkce.js'
export type { PkceChallenge } from './oauth-pkce.js'

// T7.4 — OAuth state + OIDC discovery
export { generateOAuthState, verifyOAuthState } from './oauth-state.js'
export { discoverOidcProvider, clearOidcCache } from './oidc-discovery.js'
export type { OidcMetadata } from './oidc-discovery.js'

// T1.2 — CORS handler
export { createCorsHandler, matchesOrigin } from './cors.js'
export type { CorsConfig, CorsOrigin, CorsHandler } from './cors.js'

export { requireAuth, AuthRequiredError } from './auth.js'

export { defineWebSocket } from './define-websocket.js'
export type { WebSocketHandler, WebSocketLike } from './define-websocket.js'

export { defineChannel } from './define-channel.js'
export type { ChannelHandler } from './define-channel.js'

export { ChannelManager } from './channel-manager.js'

export { createLogger, logRequest } from './logger.js'
export type { TheoLogger, LogLevel, StructuredLog, RequestLog } from './logger.js'

export { serializeResponse, deserializeResponse } from './serialization.js'
export type { SerializedResponse } from './serialization.js'

export { generateManifest, writeManifest, loadManifest } from './manifest.js'
export type {
  TheoManifest,
  ManifestRoute,
  ManifestAction,
  ManifestWebSocket,
  LoadedManifest,
} from './manifest.js'

// Low-level pipeline primitives — exported so runtime adapters (Bun, Netlify,
// AWS Lambda) can drive the same executeRoute pipeline that dev mode uses.
export { scanServerRoutes } from './scan.js'
export { matchRoute } from './match.js'
export { executeRoute, sendError, sendJson } from './execute.js'
export { createProductionLoader, createViteLoader } from './module-loader.js'
export type { ServerRouteNode } from './match.js'
export type { LoadModule } from './module-loader.js'

export { defineTheoPlugin } from './define-plugin.js'
export { PluginRunner, DuplicatePluginError, DuplicateDecorationError } from './plugin-runner.js'
export { createPluginRunnerFromConfig, InvalidPluginShapeError } from './load-plugins.js'

export { superjsonTransformer, jsonTransformer, resolveTransformer } from './transformer.js'
export type { TheoTransformer } from './transformer.js'

export { loadCustomErrorPages, MAX_ERROR_HTML_BYTES } from './error-pages.js'
// T1.1 — Agent runtime event variant (standalone in TheoKit; no TheoUI coupling)
export type {
  AgentEvent,
  AgentMessageEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentErrorEvent,
} from './agent-types.js'
export type { CustomErrorPages } from './error-pages.js'
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
