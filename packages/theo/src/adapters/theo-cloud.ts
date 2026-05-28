/**
 * TheoCloud deploy adapter (Wave 2 stub; Wave 3 ships real K8s manifests).
 *
 * Per ADR-0012 (mission expansion) + 2026-05-27 owner decision, TheoCloud
 * is the principal deploy target for polyglot services. Wave 2 ships a
 * scaffolding stub that:
 *   1. Validates the `.theo/services.json` manifest schemaVersion (forward-compat guard)
 *   2. Logs the services that WILL be deployed by the Wave 3 real implementation
 *   3. Does NOT yet emit K8s manifests (Wave 3 deliverable)
 *
 * The adapter is REGISTERED in `VALID_TARGETS` so `theokit build --target theo-cloud`
 * is accepted at the CLI level today.
 */
import type { TheoConfig } from '../config/schema.js'
import { prepareTheoCloudArtifacts, readManifest } from '../services/index.js'

import type { DeployAdapter } from './types.js'

export const theoCloudAdapter: DeployAdapter = {
  name: 'theo-cloud',

  build(_config: TheoConfig, cwd: string): Promise<void> {
    const manifest = readManifest(cwd)
    const artifacts = prepareTheoCloudArtifacts(manifest)
    const summary = artifacts.services.length === 0 ? 'none' : artifacts.services.join(', ')
    // eslint-disable-next-line no-console -- CLI build progress
    console.log(
      `[theo-cloud] Wave 2 stub: manifest schemaVersion=${String(artifacts.manifestVersion)}, ` +
        `services=${summary}. K8s manifest emission ships in Wave 3.`,
    )
    return Promise.resolve()
  },
}
