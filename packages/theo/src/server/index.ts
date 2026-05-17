export { defineRoute } from './define-route.js'
export type { RouteConfig } from './define-route.js'

export { defineAgentEndpoint } from './define-agent-endpoint.js'
export type { AgentEndpointConfig, AgentEndpointHandlerArgs } from './define-agent-endpoint.js'

export { defineAction } from './define-action.js'
export type { ActionConfig } from './define-action.js'

export { defineMiddleware } from './define-middleware.js'
export type { MiddlewareHandler } from './define-middleware.js'

export { parseRequestBody } from './body-parser.js'
export type { UploadedFile, ParsedBody, BodyParserOptions } from './body-parser.js'

export { getCookie, setCookie, deleteCookie } from './cookies.js'
export type { CookieOptions } from './cookies.js'

export { createRateLimiter } from './rate-limit.js'
export type { RateLimitConfig, RateLimitResult } from './rate-limit.js'

export { createSessionManager } from './session.js'
export type { SessionManager, SessionConfig } from './session.js'

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
export type { TheoManifest, ManifestRoute, ManifestAction, ManifestWebSocket, LoadedManifest } from './manifest.js'

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

export {
  superjsonTransformer,
  jsonTransformer,
  resolveTransformer,
} from './transformer.js'
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
