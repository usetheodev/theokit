/**
 * Fixture (T4.2) — TheoKit app using `useDatabase` with sqlite connector.
 *
 * No `storage:` block needed — `useDatabase` is call-site primitive that
 * gets its connector via the userland call (mirrors `useUnstorage` pattern).
 */
import { defineConfig } from '../../../packages/theo/src/index.js'

export default defineConfig({})
