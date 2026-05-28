/**
 * TheoCloud adapter scaffolding (T3.5 — Wave 2 stub; full Wave 3).
 *
 * Wave 2 establishes the contract: the adapter CONSUMES `.theo/services.json`
 * (manifest emitted by `theokit build`) and produces TheoCloud deployment
 * artifacts. The artifacts themselves (K8s manifests, Helm charts, etc.) are
 * Wave 3 deliverables — this module provides the read/validate gate so the
 * manifest format is locked NOW.
 *
 * Per ADR-0012 invariant #4, the same `.theo/services.json` consumed by
 * the `node` adapter (docker-compose generator) is the same shape consumed
 * here. No platform-specific fields. The contract is global.
 */
import type { ServicesManifest } from './manifest.js'

export interface TheoCloudAdapterArtifacts {
  /** Manifest schemaVersion the adapter consumed. */
  manifestVersion: 1
  /** Service names that will be deployed. */
  services: string[]
  /** Wave 3 will populate K8s manifests here. */
  k8sManifests?: never
  /** Wave 3 will populate Helm values here. */
  helmValues?: never
}

/**
 * Wave 2 stub — validates the manifest is consumable. Throws if shape is
 * unexpected (forward-compat guard for Wave 3 development).
 *
 * Wave 3 will replace the body with real K8s manifest emission.
 */
export function prepareTheoCloudArtifacts(
  manifest: ServicesManifest | null,
): TheoCloudAdapterArtifacts {
  if (manifest === null) {
    return { manifestVersion: 1, services: [] }
  }
  // Forward-compat: when Wave 3 evolves the manifest schema, the adapter
  // must bump version handling explicitly.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: manifest comes from disk
  if (manifest.version !== 1) {
    throw new Error(
      `TheoCloud adapter: unsupported manifest version ${String(manifest.version)}. ` +
        `Wave 2/3 expects schemaVersion 1. Update the adapter before bumping.`,
    )
  }
  return {
    manifestVersion: 1,
    services: manifest.services.map((s) => s.name),
  }
}
