/**
 * Wave 2 — Polyglot Services Orchestration (T1.1).
 *
 * Declarative `services: {}` primitive for `theo.config.ts`. Each entry
 * declares an external sidecar process (Python FastAPI / Node Hono) that
 * boots alongside the TheoKit TS app. Empty `services: {}` is the default
 * and preserves Wave 1 behavior (no impact on TS-only apps).
 *
 * See ADRs 0012-0015 + plan: docs/plans/wave-2-polyglot-services-plan.md
 */
import { z } from 'zod'

/** Wave 2 runtime kinds. Go/Rust/Java/Ruby/PHP archived; deferred per ADR-0012 invariant #2/#3. */
const ServiceRuntimeSchema = z.enum(['python', 'node'])

/** EC-3 fix: names that conflict with generated docker-compose entries. */
const RESERVED_SERVICE_NAMES = ['web', 'caddy', 'postgres', 'redis'] as const

/**
 * EC-12 fix: service names must be docker-compose-safe — lowercase,
 * start with a letter, contain only a-z 0-9 -. Reserved names rejected.
 */
const ServiceNameSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z][a-z0-9-]*$/,
    'service name must be lowercase, start with letter, contain only a-z 0-9 -',
  )
  .refine((n) => !(RESERVED_SERVICE_NAMES as readonly string[]).includes(n), {
    message: `service name conflicts with reserved name (${RESERVED_SERVICE_NAMES.join('/')})`,
  })

/**
 * Single service definition. All commands run from `services/<name>/` cwd.
 *
 * EC-4 fix: `proxy` regex requires NON-EMPTY path after `/` (the `+` quantifier)
 * to reject `/` which would catch-all and conflict with TheoKit's own routing.
 */
const ServiceDefinitionSchema = z.object({
  runtime: ServiceRuntimeSchema,
  port: z.number().int().min(1).max(65535),
  proxy: z.string().regex(/^\/[a-zA-Z0-9\-_/]+$/, 'proxy must be a non-root path starting with /'),
  dev: z.string().min(1),
  build: z.string().optional(),
  start: z.string().min(1),
  openapi: z.string().url().optional(),
  healthcheck: z.string().regex(/^\//, 'healthcheck must start with /').default('/health'),
  cors: z.boolean().default(false),
  env: z.record(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  /**
   * EC-25 + ref doc §8: by default the proxy strips upstream Set-Cookie
   * to prevent the polyglot service from issuing cookies that conflict
   * with TheoKit's encrypted session. Set to true to opt-in.
   */
  passSetCookie: z.boolean().default(false),
})

export type ServiceDefinition = z.infer<typeof ServiceDefinitionSchema>
export type ServicesConfig = Record<string, ServiceDefinition>

/**
 * Topological-order helper used by `dependsOn` cycle detection refine.
 * Returns true iff `graph` is a DAG. Each node's deps must all reference
 * existing nodes; cycles return false.
 */
function isDag(graph: Record<string, readonly string[]>): boolean {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const colors: Record<string, 0 | 1 | 2> = {}
  for (const node of Object.keys(graph)) colors[node] = WHITE

  function visit(node: string): boolean {
    if (colors[node] === GRAY) return false // cycle
    if (colors[node] === BLACK) return true
    colors[node] = GRAY
    for (const dep of graph[node] ?? []) {
      if (!(dep in graph)) return false // missing reference
      if (!visit(dep)) return false
    }
    colors[node] = BLACK
    return true
  }

  for (const node of Object.keys(graph)) {
    if (colors[node] === WHITE && !visit(node)) return false
  }
  return true
}

/**
 * Full services config schema with cross-service refines.
 *
 * EC-1 fix: detect duplicate ports across services.
 * EC-13: empty `dependsOn: []` accepted as no-deps.
 * Self-dep, missing-ref, and cycles rejected via topological check.
 */
export const servicesConfigSchema = z
  .record(ServiceNameSchema, ServiceDefinitionSchema)
  .default({})
  // EC-1: duplicate port detection across services
  .refine(
    (s) => {
      const ports = Object.values(s).map((v) => v.port)
      return new Set(ports).size === ports.length
    },
    {
      message: 'duplicate port across services — each service must bind a unique port',
    },
  )
  // duplicate proxy prefix detection
  .refine(
    (s) => {
      const prefixes = Object.values(s).map((v) => v.proxy)
      return new Set(prefixes).size === prefixes.length
    },
    { message: 'duplicate proxy prefix across services' },
  )
  // dependsOn correctness (self-dep, missing reference, cycle)
  .refine(
    (s) => {
      // Build graph
      const graph: Record<string, readonly string[]> = {}
      for (const [name, def] of Object.entries(s)) {
        graph[name] = def.dependsOn ?? []
      }
      // Self-dep: a service mentioning itself is rejected as part of cycle detection
      for (const [name, deps] of Object.entries(graph)) {
        if (deps.includes(name)) return false
      }
      return isDag(graph)
    },
    {
      message: 'invalid dependsOn — must reference existing services, no self-deps, no cycles',
    },
  )

export type ServicesConfigInput = z.input<typeof servicesConfigSchema>
export type ServicesConfigOutput = z.output<typeof servicesConfigSchema>
