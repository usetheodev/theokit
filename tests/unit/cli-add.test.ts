import { describe, it, expect } from 'vitest'
import {
  runAdd,
  validatePackageInput,
  detectPackageManager,
  KNOWN_PACKAGES,
  InvalidPackageNameError,
  UnknownPackageError,
} from '../../packages/theo/src/cli/commands/add.js'

describe('validatePackageInput (EC-4)', () => {
  it('accepts simple lowercase names', () => {
    expect(validatePackageInput('bun')).toBe(true)
  })

  it('accepts names with digits and hyphens', () => {
    expect(validatePackageInput('aws-lambda')).toBe(true)
    expect(validatePackageInput('deno-deploy-2')).toBe(true)
  })

  it('rejects shell metacharacters (EC-4)', () => {
    expect(() => validatePackageInput('bun; rm -rf /')).toThrow(InvalidPackageNameError)
    expect(() => validatePackageInput('bun && evil')).toThrow(InvalidPackageNameError)
    expect(() => validatePackageInput('bun | wat')).toThrow(InvalidPackageNameError)
  })

  it('rejects path traversal (EC-4)', () => {
    expect(() => validatePackageInput('../../etc/passwd')).toThrow(InvalidPackageNameError)
    expect(() => validatePackageInput('/etc/passwd')).toThrow(InvalidPackageNameError)
    expect(() => validatePackageInput('foo/bar')).toThrow(InvalidPackageNameError)
  })

  it('rejects scoped package syntax (must use known short name)', () => {
    expect(() => validatePackageInput('@scope/pkg')).toThrow(InvalidPackageNameError)
  })

  it('rejects empty input', () => {
    expect(() => validatePackageInput('')).toThrow(InvalidPackageNameError)
  })

  it('rejects uppercase', () => {
    expect(() => validatePackageInput('Bun')).toThrow(InvalidPackageNameError)
  })
})

describe('detectPackageManager', () => {
  it('prefers pnpm when pnpm-lock.yaml exists', () => {
    const pm = detectPackageManager({
      'pnpm-lock.yaml': true,
      'bun.lockb': true,
      'package-lock.json': true,
    })
    expect(pm).toBe('pnpm')
  })

  it('falls back to bun when only bun.lockb is present', () => {
    const pm = detectPackageManager({ 'bun.lockb': true })
    expect(pm).toBe('bun')
  })

  it('falls back to yarn when only yarn.lock is present', () => {
    const pm = detectPackageManager({ 'yarn.lock': true })
    expect(pm).toBe('yarn')
  })

  it('falls back to npm when no lockfile is present', () => {
    const pm = detectPackageManager({})
    expect(pm).toBe('npm')
  })
})

describe('runAdd', () => {
  it('rejects unknown package with suggestion when close match exists', async () => {
    await expect(
      runAdd({
        input: 'bunzzz',
        cwd: '/cwd',
        existsSync: () => true,
        spawnPm: async () => ({ ok: true, code: 0 }),
        registry: {
          bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
        },
      }),
    ).rejects.toThrow(UnknownPackageError)
  })

  it('rejects unknown package without suggestion when nothing close', async () => {
    await expect(
      runAdd({
        input: 'totallyunrelated',
        cwd: '/cwd',
        existsSync: () => true,
        spawnPm: async () => ({ ok: true, code: 0 }),
        registry: {
          bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
        },
      }),
    ).rejects.toThrow(/Unknown package/)
  })

  it('invokes the detected PM with array args + shell:false (EC-4)', async () => {
    let spawnCall: { cmd: string; args: string[]; useShell: boolean } | null = null
    await runAdd({
      input: 'bun',
      cwd: '/cwd',
      existsSync: (p: string) => p.endsWith('pnpm-lock.yaml'),
      spawnPm: async (cmd, args, opts) => {
        spawnCall = { cmd, args, useShell: opts.shell }
        return { ok: true, code: 0 }
      },
      registry: {
        ...KNOWN_PACKAGES,
        bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
      },
    })
    expect(spawnCall!.cmd).toBe('pnpm')
    expect(spawnCall!.args).toEqual(['add', 'theokit-adapter-bun'])
    expect(spawnCall!.useShell).toBe(false)
  })

  it('propagates non-zero exit code from PM', async () => {
    await expect(
      runAdd({
        input: 'bun',
        cwd: '/cwd',
        existsSync: () => false,
        spawnPm: async () => ({ ok: false, code: 1 }),
        registry: {
          ...KNOWN_PACKAGES,
          bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
        },
      }),
    ).rejects.toThrow(/exit code 1/)
  })

  it('falls back to npm when no lockfile present', async () => {
    let usedCmd = ''
    await runAdd({
      input: 'bun',
      cwd: '/cwd',
      existsSync: () => false,
      spawnPm: async (cmd) => {
        usedCmd = cmd
        return { ok: true, code: 0 }
      },
      registry: {
        ...KNOWN_PACKAGES,
        bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
      },
    })
    expect(usedCmd).toBe('npm')
  })

  it('rejects malicious input BEFORE spawn (EC-4)', async () => {
    let spawned = false
    await expect(
      runAdd({
        input: 'bun; rm -rf',
        cwd: '/cwd',
        existsSync: () => true,
        spawnPm: async () => {
          spawned = true
          return { ok: true, code: 0 }
        },
        registry: {
          ...KNOWN_PACKAGES,
          bun: { kind: 'external', npm: 'theokit-adapter-bun', usage: 'theokit add bun' },
        },
      }),
    ).rejects.toThrow(InvalidPackageNameError)
    expect(spawned).toBe(false)
  })
})
