/**
 * Types for state cleanup utilities (Phase 2 of
 * docs/plans/framework-zero-config-polish-plan.md).
 */

export interface CleanOutDirOptions {
  /** Absolute path of the directory to wipe. Must be inside cwd (EC-3). */
  dir: string
  /** Basenames to preserve. Defaults to `['.git', '.gitkeep', '.gitignore']`. */
  skip?: string[]
}

export interface CleanOutDirResult {
  deleted: number
  kept: number
}

export interface GcAgentRegistryOptions {
  /** Absolute path of `.theokit/agents/`. */
  dir: string
  /** LRU cap. Default: 100. */
  maxAgents?: number
}

export interface GcAgentRegistryResult {
  deleted: number
  kept: number
}
