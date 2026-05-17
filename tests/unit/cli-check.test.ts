import { describe, it, expect } from 'vitest'
import { runCheck } from '../../packages/theo/src/cli/commands/check.js'

describe('runCheck', () => {
  it('exits 0 and reports all-green when every step passes', async () => {
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => false,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: true, routesCount: 3 }),
    })
    expect(result.exitCode).toBe(0)
    expect(result.steps.find((s) => s.name === 'typecheck')?.status).toBe('ok')
    expect(result.steps.find((s) => s.name === 'eslint')?.status).toBe('skipped')
    expect(result.steps.find((s) => s.name === 'scan')?.status).toBe('ok')
  })

  it('exits 1 when typecheck fails', async () => {
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => false,
      runTsc: async () => ({ ok: false, output: 'TS2304: Cannot find name "foo"' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: true, routesCount: 0 }),
    })
    expect(result.exitCode).toBe(1)
    expect(result.steps.find((s) => s.name === 'typecheck')?.status).toBe('fail')
  })

  it('exits 1 when scan fails', async () => {
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => false,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: false, error: 'invalid route file' }),
    })
    expect(result.exitCode).toBe(1)
    expect(result.steps.find((s) => s.name === 'scan')?.status).toBe('fail')
  })

  it('reports typecheck as "skipped" when tsconfig is absent (does not crash)', async () => {
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => false,
      hasEslintConfig: () => false,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: true, routesCount: 1 }),
    })
    expect(result.exitCode).toBe(0)
    expect(result.steps.find((s) => s.name === 'typecheck')?.status).toBe('skipped')
  })

  it('runs eslint when .eslintrc-like config is detected', async () => {
    let eslintRan = false
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => true,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => {
        eslintRan = true
        return { ok: true, output: '' }
      },
      scanProject: async () => ({ ok: true, routesCount: 0 }),
    })
    expect(eslintRan).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.steps.find((s) => s.name === 'eslint')?.status).toBe('ok')
  })

  it('exits 1 when eslint fails', async () => {
    const result = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => true,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => ({ ok: false, output: 'no-unused-vars: x' }),
      scanProject: async () => ({ ok: true, routesCount: 0 }),
    })
    expect(result.exitCode).toBe(1)
    expect(result.steps.find((s) => s.name === 'eslint')?.status).toBe('fail')
  })

  it('aggregates final exit code: 1 if any step fails, 0 otherwise', async () => {
    const allOk = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => true,
      runTsc: async () => ({ ok: true, output: '' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: true, routesCount: 2 }),
    })
    expect(allOk.exitCode).toBe(0)

    const oneBad = await runCheck({
      cwd: '/fake',
      hasTsConfig: () => true,
      hasEslintConfig: () => true,
      runTsc: async () => ({ ok: false, output: 'err' }),
      runEslint: async () => ({ ok: true, output: '' }),
      scanProject: async () => ({ ok: true, routesCount: 2 }),
    })
    expect(oneBad.exitCode).toBe(1)
  })
})
