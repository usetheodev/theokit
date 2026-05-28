/**
 * server/http/execute-context.ts
 *
 * `ExecuteRouteContext` — the parameter object passed to `executeRoute()`
 * and `executeAction()` per ADR-0016 (T3.1 of architecture-cleanup).
 *
 * Replaces the 12-positional-param signature with a single named-field
 * object, eliminating 3 of 4 eslint-disable comments on `executeRoute`.
 *
 * Location: lives in `server/http/` (not `core/contracts/`) because the
 * shape references server-side types (CsrfMode, JobBackend, PluginRunner,
 * TheoTransformer, ServerRouteNode, LoadModule, DisallowedConfig). Keeping
 * the type here preserves the existing module direction graph — no new
 * `core → server` edges.
 *
 * Consumers within server/ build this object once per request; external
 * callers (router-runner) see the same shape via the `ExecuteRouteContext`
 * named export.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { JobBackend } from '../jobs/job-backend.js'
import type { PluginRunner } from '../plugins/plugin-runner.js'
import type { ServerRouteNode } from '../scan/match.js'
import type { LoadModule } from '../scan/module-loader.js'
import type { CsrfMode, DisallowedConfig } from '../security/csrf.js'
import type { TheoTransformer } from '../transformer.js'

/**
 * The request-execution context. Each request builds one of these and passes
 * it to `executeRoute(ctx)`.
 *
 * All fields are required EXCEPT those with optional `?` markers; defaults
 * are applied inside `executeRoute` via destructure (e.g., `csrfMode = 'strict'`).
 */
export interface ExecuteRouteContext {
  route: ServerRouteNode
  method: string
  params: Record<string, string>
  req: IncomingMessage
  res: ServerResponse
  loadModule: LoadModule
  serverDir?: string
  requestId?: string
  pluginRunner?: PluginRunner
  transformer?: TheoTransformer
  /** Defaults to `'strict'` when omitted. */
  csrfMode?: CsrfMode
  disallowed?: DisallowedConfig
  /** When provided, `ctx.queue` auto-injects + outbox lifecycle hooks attach. */
  jobBackend?: JobBackend
}
