/**
 * T3.1 — Integration tests for theo-ui-link.sh / theo-ui-unlink.sh (ADR 0020).
 *
 * Validation strategy: spawn the shell scripts in a sandbox where we copy
 * the script files into a tmp dir + create fake `../theo-ui/dist/vite-plugin.js`.
 * The scripts use `cd "$(dirname "$0")/.."` to root themselves, so we mimic
 * the real layout: sandbox/scripts/{link,unlink}.sh + sandbox/{ws files}.
 *
 * EC-5: dist/vite-plugin.js guard.
 * Guard checks: missing sibling, missing dist, already linked, idempotent unlink.
 *
 * NOTE: scripts do `pnpm install` after swap — we stub pnpm to a no-op so we
 * avoid the multi-minute install per test. PNPM_BIN env var overrides the
 * binary path. Tests confirm the FILE-SWAP behavior, not the install behavior.
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(TEST_DIR, '..', '..')

let sandbox: string
let linkScript: string
let unlinkScript: string

function setupSandbox(opts: {
  withSibling?: boolean
  withDist?: boolean
  preExistingBak?: boolean
} = {}) {
  const { withSibling = true, withDist = true, preExistingBak = false } = opts
  sandbox = mkdtempSync(join(tmpdir(), 'theokit-link-flow-'))
  mkdirSync(join(sandbox, 'scripts'), { recursive: true })

  // Copy the real scripts in.
  linkScript = join(sandbox, 'scripts', 'theo-ui-link.sh')
  unlinkScript = join(sandbox, 'scripts', 'theo-ui-unlink.sh')
  copyFileSync(join(REPO_ROOT, 'scripts', 'theo-ui-link.sh'), linkScript)
  copyFileSync(join(REPO_ROOT, 'scripts', 'theo-ui-unlink.sh'), unlinkScript)
  chmodSync(linkScript, 0o755)
  chmodSync(unlinkScript, 0o755)

  // Workspace files.
  writeFileSync(
    join(sandbox, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  )
  writeFileSync(
    join(sandbox, 'pnpm-workspace.linked-ui.yaml'),
    "packages:\n  - 'packages/*'\n  - '../theo-ui'\n",
  )

  if (withSibling) {
    mkdirSync(join(sandbox, '..', 'theo-ui'), { recursive: true })
    if (withDist) {
      mkdirSync(join(sandbox, '..', 'theo-ui', 'dist'), { recursive: true })
      writeFileSync(join(sandbox, '..', 'theo-ui', 'dist', 'vite-plugin.js'), 'export default () => ({ name: "fake" });\n')
    }
  }

  if (preExistingBak) {
    writeFileSync(join(sandbox, 'pnpm-workspace.yaml.bak'), 'pre-existing\n')
  }
}

function runScript(script: string) {
  // PATH+PNPM_BIN trick — stub pnpm so install is a no-op.
  // We create a tiny shell script that always exits 0.
  const pnpmStub = join(sandbox, '.pnpm-stub')
  writeFileSync(pnpmStub, '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(pnpmStub, 0o755)
  // Make a dir with our stub named "pnpm" in front of PATH
  const stubDir = join(sandbox, '.stub-bin')
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(join(stubDir, 'pnpm'), '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(join(stubDir, 'pnpm'), 0o755)
  const env = { ...process.env, PATH: `${stubDir}:${process.env['PATH'] ?? ''}` }
  return spawnSync('bash', [script], { encoding: 'utf-8', env })
}

afterEach(() => {
  if (sandbox) {
    try {
      rmSync(sandbox, { recursive: true, force: true })
      rmSync(join(sandbox, '..', 'theo-ui'), { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

describe('T3.1 — theo-ui-link.sh / theo-ui-unlink.sh flow (ADR 0020)', () => {
  describe('theo-ui-link guards', () => {
    it('should fail with exit 1 when ../theo-ui sibling is missing', () => {
      setupSandbox({ withSibling: false })
      const r = runScript(linkScript)
      expect(r.status).toBe(1)
      expect(r.stderr + r.stdout).toMatch(/sibling checkout not found/)
    })

    it('EC-5: should fail with exit 1 when ../theo-ui/dist/vite-plugin.js is missing', () => {
      setupSandbox({ withSibling: true, withDist: false })
      const r = runScript(linkScript)
      expect(r.status).toBe(1)
      expect(r.stderr + r.stdout).toMatch(/dist\/ not built|missing vite-plugin\.js/i)
    })

    it('should fail with exit 1 when pnpm-workspace.yaml.bak already exists (link already active)', () => {
      setupSandbox({ withSibling: true, withDist: true, preExistingBak: true })
      const r = runScript(linkScript)
      expect(r.status).toBe(1)
      expect(r.stderr + r.stdout).toMatch(/Already linked|unlink/i)
    })

    it('should succeed with sibling + dist + no .bak — produces .bak and swaps yaml', () => {
      setupSandbox({ withSibling: true, withDist: true })
      const r = runScript(linkScript)
      expect(r.status).toBe(0)
      expect(existsSync(join(sandbox, 'pnpm-workspace.yaml.bak'))).toBe(true)
      const ws = readFileSync(join(sandbox, 'pnpm-workspace.yaml'), 'utf-8')
      expect(ws).toContain('../theo-ui')
    })
  })

  describe('theo-ui-unlink behavior', () => {
    it('should be a no-op (exit 0) when .bak is absent', () => {
      setupSandbox({ withSibling: true, withDist: true })
      const r = runScript(unlinkScript)
      expect(r.status).toBe(0)
      expect(r.stdout).toMatch(/Not currently linked|Nothing to do/i)
    })

    it('should restore canonical pnpm-workspace.yaml and remove .bak when linked', () => {
      setupSandbox({ withSibling: true, withDist: true })
      // First, link.
      const link = runScript(linkScript)
      expect(link.status).toBe(0)
      expect(existsSync(join(sandbox, 'pnpm-workspace.yaml.bak'))).toBe(true)

      // Then, unlink.
      const unlink = runScript(unlinkScript)
      expect(unlink.status).toBe(0)
      expect(existsSync(join(sandbox, 'pnpm-workspace.yaml.bak'))).toBe(false)
      const restored = readFileSync(join(sandbox, 'pnpm-workspace.yaml'), 'utf-8')
      expect(restored).not.toContain('../theo-ui')
    })
  })

  describe('EC-3: pre-commit gate ordering (link guard FIRST)', () => {
    it('pre-commit hook should fail FAST on .bak presence (GATE 0), not on template check (GATE 3)', () => {
      // Given a sandbox with the real pre-commit hook + a fake .bak (simulating link active)
      const hookSandbox = mkdtempSync(join(tmpdir(), 'theokit-precommit-'))
      const hookPath = join(hookSandbox, 'pre-commit')
      copyFileSync(join(REPO_ROOT, '.githooks', 'pre-commit'), hookPath)
      chmodSync(hookPath, 0o755)
      writeFileSync(join(hookSandbox, 'pnpm-workspace.yaml.bak'), 'fake\n')

      // Stub git so `git rev-parse --show-toplevel` returns our sandbox
      const stubDir = join(hookSandbox, '.stub-bin')
      mkdirSync(stubDir, { recursive: true })
      writeFileSync(
        join(stubDir, 'git'),
        `#!/usr/bin/env bash\nif [ "$1" = "rev-parse" ]; then echo "${hookSandbox}"; exit 0; fi\nexit 0\n`,
      )
      chmodSync(join(stubDir, 'git'), 0o755)

      const env = { ...process.env, PATH: `${stubDir}:${process.env['PATH'] ?? ''}` }
      const r = spawnSync('bash', [hookPath], { encoding: 'utf-8', env, cwd: hookSandbox })

      // Then: EC-3 — fail at GATE 0 with the "theo-ui linked" message.
      expect(r.status).toBe(1)
      expect(r.stderr + r.stdout).toMatch(/theo-ui is currently linked|theo-ui:unlink/i)

      try {
        rmSync(hookSandbox, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    })
  })
})
