import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

export class InvalidPackageNameError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid package name "${input}": ${reason}`)
    this.name = 'InvalidPackageNameError'
  }
}

export class UnknownPackageError extends Error {
  constructor(input: string, suggestion?: string) {
    super(
      suggestion
        ? `Unknown package: ${input}. Did you mean: ${suggestion}?`
        : `Unknown package: ${input}.`,
    )
    this.name = 'UnknownPackageError'
  }
}

/**
 * EC-4 — strict whitelist of characters allowed in package input.
 * Lowercase ASCII letters, digits, hyphens. Must start with letter/digit.
 * Rejects: shell metacharacters, path traversal, scope syntax, uppercase.
 */
const PACKAGE_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/

export function validatePackageInput(input: string): true {
  if (typeof input !== 'string' || input.length === 0) {
    throw new InvalidPackageNameError(input, 'must be a non-empty string')
  }
  if (!PACKAGE_NAME_REGEX.test(input)) {
    throw new InvalidPackageNameError(
      input,
      'allowed: lowercase letters, digits, hyphens only',
    )
  }
  return true
}

export type PackageManager = 'pnpm' | 'bun' | 'yarn' | 'npm'

export function detectPackageManager(lockfiles: Record<string, boolean>): PackageManager {
  if (lockfiles['pnpm-lock.yaml']) return 'pnpm'
  if (lockfiles['bun.lockb']) return 'bun'
  if (lockfiles['yarn.lock']) return 'yarn'
  if (lockfiles['package-lock.json']) return 'npm'
  return 'npm'
}

export interface PackageRegistryEntry {
  /** 'bundled' = adapter already shipped inside theokit; no npm install needed.
   *  'external' = adapter/plugin lives as a separate npm package. */
  kind: 'bundled' | 'external'
  /** Required when kind === 'external'. */
  npm?: string
  /** Usage hint printed to the user (e.g. `theokit build --target=bun`). */
  usage: string
}

export const KNOWN_PACKAGES: Record<string, PackageRegistryEntry> = {
  bun: {
    kind: 'bundled',
    usage: 'theokit build --target=bun',
  },
  deno: {
    kind: 'bundled',
    usage: 'theokit build --target=deno-deploy',
  },
  netlify: {
    kind: 'bundled',
    usage: 'theokit build --target=netlify',
  },
  'aws-lambda': {
    kind: 'bundled',
    usage: 'theokit build --target=aws-lambda',
  },
  static: {
    kind: 'bundled',
    usage: 'theokit build --target=static',
  },
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function findSuggestion(input: string, candidates: string[]): string | undefined {
  let best: { name: string; d: number } | null = null
  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (best === null || d < best.d) best = { name: c, d }
  }
  if (best && best.d <= 3) return best.name
  return undefined
}

export interface RunAddDeps {
  input: string
  cwd: string
  existsSync?: (path: string) => boolean
  spawnPm?: (
    cmd: string,
    args: string[],
    opts: { cwd: string; shell: boolean },
  ) => Promise<{ ok: boolean; code: number }>
  registry?: Record<string, PackageRegistryEntry>
}

export interface AddResult {
  packageInstalled: string
  packageManager: PackageManager | 'bundled'
  usage: string
  exitCode: 0
}

export async function runAdd(deps: RunAddDeps): Promise<AddResult> {
  validatePackageInput(deps.input)

  const registry = deps.registry ?? KNOWN_PACKAGES
  const entry = registry[deps.input]
  if (!entry) {
    const suggestion = findSuggestion(deps.input, Object.keys(registry))
    throw new UnknownPackageError(deps.input, suggestion)
  }

  // T6.1 — bundled adapters need no install
  if (entry.kind === 'bundled') {
    return {
      packageInstalled: `${deps.input} (bundled inside theokit)`,
      packageManager: 'bundled',
      usage: entry.usage,
      exitCode: 0,
    }
  }

  if (!entry.npm) {
    throw new Error(`External package "${deps.input}" missing npm field in registry`)
  }

  const existsFn = deps.existsSync ?? ((p: string) => existsSync(p))
  const lockfiles = {
    'pnpm-lock.yaml': existsFn(resolve(deps.cwd, 'pnpm-lock.yaml')),
    'bun.lockb': existsFn(resolve(deps.cwd, 'bun.lockb')),
    'yarn.lock': existsFn(resolve(deps.cwd, 'yarn.lock')),
    'package-lock.json': existsFn(resolve(deps.cwd, 'package-lock.json')),
  }
  const pm = detectPackageManager(lockfiles)

  const args = pm === 'npm' ? ['install', entry.npm] : ['add', entry.npm]
  const spawnFn = deps.spawnPm ?? defaultSpawnPm
  const result = await spawnFn(pm, args, { cwd: deps.cwd, shell: false })

  if (!result.ok) {
    throw new Error(`Package manager exited with non-zero exit code ${result.code}`)
  }

  return {
    packageInstalled: entry.npm,
    packageManager: pm,
    usage: entry.usage,
    exitCode: 0,
  }
}

function defaultSpawnPm(
  cmd: string,
  args: string[],
  opts: { cwd: string; shell: boolean },
): Promise<{ ok: boolean; code: number }> {
  return new Promise((resolveProm) => {
    const proc = spawn(cmd, args, { cwd: opts.cwd, shell: opts.shell, stdio: 'inherit' })
    proc.on('close', (code) => resolveProm({ ok: code === 0, code: code ?? 1 }))
    proc.on('error', () => resolveProm({ ok: false, code: 1 }))
  })
}

export async function addCommand(input: string): Promise<void> {
  try {
    const result = await runAdd({ input, cwd: process.cwd() })
    console.log(`\n  ✓ Installed ${result.packageInstalled} via ${result.packageManager}\n`)
    console.log(`  Next: import { /* ... */ } from '${result.packageInstalled}'\n`)
  } catch (err) {
    console.error(`\n  ✗ ${(err as Error).message}\n`)
    process.exit(1)
  }
}
