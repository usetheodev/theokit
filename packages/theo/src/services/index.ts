/**
 * Wave 2 — Polyglot Services Orchestration: public barrel.
 *
 * ADR-0001 v3 invariant #3: cross-module imports MUST flow through this barrel.
 * Deep imports (`from '../services/<file>.js'`) from other modules are forbidden
 * and caught by `.dependency-cruiser.cjs` (`no-cross-module-deep-import` rule).
 *
 * T4.1 (architecture-cleanup): files re-organized into 4 sub-domains:
 *   - schema/         — Zod schema + types
 *   - runtime/        — dev orchestration, healthcheck, proxy, log-merge, spawn helpers, path-scope
 *   - generators/     — Caddyfile, docker-compose, Vercel config, OpenAPI typed-client
 *   - adapters-bridge/— manifest IO, adapter rejection, TheoCloud stub, Vite dev-server proxy
 *
 * The `core/contracts/<file>.ts` rule does NOT apply here — `services/` is a
 * feature module, not a shared-types module. Use this `index.ts` exclusively.
 */

// Adapter bridge
export { assertServicesUnsupported } from './adapters-bridge/adapter-support.js'

// Generators
export { generateCaddyfile } from './generators/caddy-generator.js'
export type { CaddyfileOptions } from './generators/caddy-generator.js'
export { generateComposeYaml } from './generators/compose-generator.js'
export type { ComposeOptions } from './generators/compose-generator.js'
export { generateTypedClient } from './generators/openapi-client-gen.js'
export type {
  GenerateClientOptions,
  GenerateClientResult,
} from './generators/openapi-client-gen.js'
export { buildVercelServicesBlock, mergeVercelJson } from './generators/vercel-config-builder.js'
export type { VercelServiceEntry, VercelServicesBlock } from './generators/vercel-config-builder.js'

// Manifest
export { buildManifest, writeManifest, readManifest } from './adapters-bridge/manifest.js'
export type { ManifestServiceEntry, ServicesManifest } from './adapters-bridge/manifest.js'

// Schema
export { servicesConfigSchema } from './schema/schema.js'
export type {
  ServiceDefinition,
  ServicesConfig,
  ServicesConfigInput,
  ServicesConfigOutput,
} from './schema/schema.js'

// Runtime (dev orchestration)
export { orchestrateDev } from './runtime/orchestrator.js'
export type {
  SpawnedService,
  OrchestrateDevOptions,
  OrchestrateDevResult,
} from './runtime/orchestrator.js'
export { pollHealthcheck } from './runtime/healthcheck-poller.js'
export type { HealthcheckOptions, HealthcheckResult } from './runtime/healthcheck-poller.js'
export { proxyFetch } from './runtime/proxy.js'
export type { ProxyOptions } from './runtime/proxy.js'
export { createLogMerger } from './runtime/log-merge.js'
export type { LogMergerOptions, LogMerger } from './runtime/log-merge.js'
export {
  buildSpawnEnv,
  formatLogPrefix,
  installLifecycleHandlers,
} from './runtime/process-spawn-helpers.js'
export { isPathInScope } from './runtime/path-scope.js'

// Vite dev-server proxy
export { buildServicesProxyConfig } from './adapters-bridge/vite-proxy-builder.js'
export type { ViteProxyEntry, ViteProxyConfig } from './adapters-bridge/vite-proxy-builder.js'

// TheoCloud (Wave 3 stub)
export { prepareTheoCloudArtifacts } from './adapters-bridge/theo-cloud-adapter-stub.js'
export type { TheoCloudAdapterArtifacts } from './adapters-bridge/theo-cloud-adapter-stub.js'
