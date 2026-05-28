/**
 * Adapter support gates (Wave 2 — TheoCloud-first focus).
 *
 * Wave 2 SUPPORTS polyglot `services: {}` on TWO targets ONLY:
 *   - `node` (local docker-compose harness — TheoCloud-shaped)
 *   - `theo-cloud` (the principal deploy target — Wave 3 adapter)
 *
 * All other in-tree deploy adapters (vercel, cloudflare, bun, deno-deploy,
 * aws-lambda, netlify, static) ARE STILL FIRST-CLASS DEPLOY TARGETS for
 * the TS app, but `services: {}` Wave 2 is NOT yet wired through them.
 * They reject loudly with an actionable message when the manifest has
 * non-empty services — pointing the user at `node` (local) or TheoCloud.
 *
 * Per owner decision 2026-05-27: TheoKit's polyglot services energy is
 * 100% TheoCloud; Vercel/Cloudflare/etc. polyglot-services wire-ups are
 * out of Wave 2 scope and deferred to fresh ADRs if demand emerges.
 */
import type { ServicesManifest } from './manifest.js'

const SUPPORTED_IN_WAVE_2 = ['node (local)', 'theo-cloud (Wave 3)'] as const

/**
 * Reject if the adapter does not support polyglot services. Adapters
 * outside `node` + `theo-cloud` call this; the message points to the
 * supported alternatives.
 *
 * Throws when manifest has non-empty services. No-op when manifest is null
 * or empty (Wave 1 BC — the app still deploys, just without sidecars).
 */
export function assertServicesUnsupported(
  adapterName: string,
  manifest: ServicesManifest | null,
): void {
  if (!manifest || manifest.services.length === 0) return
  const names = manifest.services.map((s) => s.name).join(', ')
  throw new Error(
    `Adapter '${adapterName}' does not support polyglot services in Wave 2.\n` +
      `Detected services in theo.config.ts: ${names}.\n\n` +
      `Wave 2 supports: ${SUPPORTED_IN_WAVE_2.join(', ')}.\n` +
      `TheoCloud is the strategic deploy target — the adapter ships in Wave 3.\n` +
      `For local dev/prod-like validation today, use \`theokit build --target node\`\n` +
      `(emits docker-compose + Caddyfile — TheoCloud-shaped harness).\n\n` +
      `See docs/concepts/services.md.`,
  )
}
