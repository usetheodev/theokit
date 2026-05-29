/**
 * Provider Resolver — Strategy + Registry pattern (FAANG-grade).
 *
 * Inspiração: Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`)
 * + Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).
 *
 * Princípio: provider routing é responsabilidade do FRAMEWORK, não do consumer.
 * Consumer template usa `model: { id: 'gpt-4o-mini' }` puro — sem conditionals.
 *
 * Wire protocol: OpenAI Chat Completions (universal — implementado por todos
 * os providers: OpenRouter, Groq, Mistral, Together, Anthropic via proxy, etc).
 *
 * Resolução por prioridade (FIRST match wins):
 *   1. OPENROUTER_API_KEY → baseUrl=openrouter.ai (gateway multi-modelo)
 *   2. OPENAI_API_KEY     → baseUrl=api.openai.com
 *   3. ANTHROPIC_API_KEY  → direct Anthropic (Messages API, não OpenAI-compat)
 *
 * Escape hatch: `options.apiKey` explícito SOBREPÕE auto-resolution
 * (consumer pode forçar provider específico se quiser).
 */

/**
 * Provider configuration descriptor — Registry entry shape.
 *
 * @public
 */
export interface ProviderDescriptor {
  /** Stable name used internally — não exposto no wire. */
  name: string
  /** Environment variable that holds the API key for this provider. */
  envKey: string
  /** Base URL for the provider's OpenAI-compatible (or native) API. */
  baseUrl: string
  /** Resolution priority (lower = higher priority). FIRST match wins. */
  priority: number
}

/**
 * Resolved provider configuration — output of `resolveProvider()`.
 *
 * @public
 */
export interface ResolvedProvider {
  name: string
  apiKey: string
  baseUrl: string
}

/**
 * Default provider registry. Order = priority (first = highest).
 *
 * Adding a new provider:
 *   1. Append entry below (or register via `registerProvider()`).
 *   2. Set `envKey` matching the user's env var convention.
 *   3. Set `baseUrl` to the OpenAI-compat endpoint (or native if not compat).
 *   4. Provider name used in telemetry/logs only — never wire-exposed.
 */
const DEFAULT_REGISTRY: ProviderDescriptor[] = [
  {
    name: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    priority: 1,
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    priority: 2,
  },
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    priority: 3,
  },
]

/**
 * Runtime registry — copy of DEFAULT_REGISTRY mutable via registerProvider().
 * Sorted by priority on every resolve (stable, O(n log n) — n <= ~10 providers).
 */
const registry: ProviderDescriptor[] = [...DEFAULT_REGISTRY]

/**
 * Register a new provider (Registry pattern — runtime extension point).
 * Useful for self-hosted endpoints or custom providers without touching theokit src.
 *
 * @example
 * registerProvider({
 *   name: 'self-hosted',
 *   envKey: 'SELF_HOSTED_API_KEY',
 *   baseUrl: 'https://llm.internal.acme.com/v1',
 *   priority: 0, // highest priority
 * })
 *
 * @public
 */
export function registerProvider(descriptor: ProviderDescriptor): void {
  // Idempotent — replace existing by name.
  const idx = registry.findIndex((p) => p.name === descriptor.name)
  if (idx >= 0) registry[idx] = descriptor
  else registry.push(descriptor)
}

/**
 * Reset registry to DEFAULT_REGISTRY (test-only / dev escape hatch).
 *
 * @public
 */
export function resetProviderRegistry(): void {
  registry.length = 0
  registry.push(...DEFAULT_REGISTRY)
}

/**
 * Get current registry snapshot (read-only — inspection).
 *
 * @public
 */
export function listProviders(): readonly ProviderDescriptor[] {
  return [...registry].sort((a, b) => a.priority - b.priority)
}

/**
 * Resolve provider from env vars by priority. FIRST env var found wins.
 *
 * @returns ResolvedProvider with apiKey + baseUrl + name
 * @throws Error if NO provider env var is set (actionable message)
 *
 * @public
 */
export function resolveProvider(): ResolvedProvider {
  const sorted = [...registry].sort((a, b) => a.priority - b.priority)
  for (const desc of sorted) {
    const apiKey = process.env[desc.envKey]
    if (apiKey && apiKey.length > 0) {
      return {
        name: desc.name,
        apiKey,
        baseUrl: desc.baseUrl,
      }
    }
  }
  // No env var found — emit actionable error.
  const envKeys = sorted.map((p) => p.envKey).join(' OR ')
  throw new Error(
    `No LLM provider API key found in environment. Set one of: ${envKeys}. ` +
      `Get a free OpenRouter key at https://openrouter.ai/keys (recommended — one key, many models).`,
  )
}

/**
 * Try to resolve — does NOT throw. Returns null if no provider available.
 * Useful for graceful degradation (e.g., mock mode).
 *
 * @public
 */
export function tryResolveProvider(): ResolvedProvider | null {
  try {
    return resolveProvider()
  } catch {
    return null
  }
}
