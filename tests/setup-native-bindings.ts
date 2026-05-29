/**
 * dogfood-regressions-fix-plan v1.1 T1.2 — vitest globalSetup hook.
 *
 * Runs ONCE per vitest suite (across all workers). Calls the native-bindings
 * preflight which detects NODE_MODULE_VERSION mismatch on better-sqlite3 +
 * auto-rebuilds. Sentinel-cached so subsequent runs short-circuit.
 *
 * See: scripts/preflight-native-bindings.mjs + CLAUDE.md > "Native bindings
 * discipline".
 */
import { ensureNativeBindings } from '../scripts/preflight-native-bindings.mjs'

export default async function setup(): Promise<void> {
  await ensureNativeBindings()
}
