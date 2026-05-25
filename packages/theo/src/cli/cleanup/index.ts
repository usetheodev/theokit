/**
 * cli/cleanup — agent registry GC + .theo/ outdir wipe.
 *
 * Renamed from `cli/lib/` (T0.2 of architecture-review-remediation-plan).
 * The `lib/` name was ambiguous — these are cleanup utilities, not generic libs.
 */
export { cleanOutDir, gcAgentRegistry } from './cleanup.js'
export type * from './cleanup-types.js'
