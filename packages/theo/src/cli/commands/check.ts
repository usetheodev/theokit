import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

export type StepStatus = 'ok' | 'fail' | 'skipped'

export interface CheckStep {
  name: 'typecheck' | 'eslint' | 'scan'
  status: StepStatus
  output: string
}

export interface CheckResult {
  exitCode: 0 | 1
  steps: CheckStep[]
}

export interface RunCheckDeps {
  cwd: string
  hasTsConfig?: () => boolean
  hasEslintConfig?: () => boolean
  runTsc?: () => Promise<{ ok: boolean; output: string }>
  runEslint?: () => Promise<{ ok: boolean; output: string }>
  scanProject?: () => Promise<
    { ok: true; routesCount: number } | { ok: false; error: string }
  >
}

function defaultHasTsConfig(cwd: string): boolean {
  return existsSync(resolve(cwd, 'tsconfig.json'))
}

function defaultHasEslintConfig(cwd: string): boolean {
  const candidates = [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
  ]
  return candidates.some((name) => existsSync(resolve(cwd, name)))
}

function spawnCmd(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => {
      stdout += c.toString()
    })
    proc.stderr.on('data', (c) => {
      stderr += c.toString()
    })
    proc.on('close', (code) => {
      resolve({ ok: code === 0, output: stdout + stderr })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, output: String(err) })
    })
  })
}

async function defaultRunTsc(cwd: string): Promise<{ ok: boolean; output: string }> {
  // Use npx so the project's own typescript is preferred.
  return spawnCmd('npx', ['--no-install', 'tsc', '--noEmit'], cwd)
}

async function defaultRunEslint(cwd: string): Promise<{ ok: boolean; output: string }> {
  return spawnCmd('npx', ['--no-install', 'eslint', '.'], cwd)
}

async function defaultScanProject(
  cwd: string,
): Promise<{ ok: true; routesCount: number } | { ok: false; error: string }> {
  try {
    const { scanRoutes } = await import('../../router/scan.js')
    const appDir = resolve(cwd, 'app')
    if (!existsSync(appDir)) return { ok: true, routesCount: 0 }
    const tree = scanRoutes(appDir)
    let count = 0
    function walk(n: { page?: string; children: { page?: string; children: unknown[] }[] }): void {
      if (n.page) count++
      for (const child of n.children) walk(child as never)
    }
    walk(tree)
    return { ok: true, routesCount: count }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function runCheck(deps: RunCheckDeps): Promise<CheckResult> {
  const cwd = deps.cwd
  const hasTsConfig = (deps.hasTsConfig ?? (() => defaultHasTsConfig(cwd)))()
  const hasEslintConfig = (deps.hasEslintConfig ?? (() => defaultHasEslintConfig(cwd)))()
  const runTsc = deps.runTsc ?? (() => defaultRunTsc(cwd))
  const runEslint = deps.runEslint ?? (() => defaultRunEslint(cwd))
  const scanProject = deps.scanProject ?? (() => defaultScanProject(cwd))

  const steps: CheckStep[] = []

  if (!hasTsConfig) {
    steps.push({ name: 'typecheck', status: 'skipped', output: 'no tsconfig.json' })
  } else {
    const res = await runTsc()
    steps.push({
      name: 'typecheck',
      status: res.ok ? 'ok' : 'fail',
      output: res.output,
    })
  }

  if (!hasEslintConfig) {
    steps.push({ name: 'eslint', status: 'skipped', output: 'no eslint config' })
  } else {
    const res = await runEslint()
    steps.push({
      name: 'eslint',
      status: res.ok ? 'ok' : 'fail',
      output: res.output,
    })
  }

  const scan = await scanProject()
  if (scan.ok) {
    steps.push({ name: 'scan', status: 'ok', output: `${scan.routesCount} routes` })
  } else {
    steps.push({ name: 'scan', status: 'fail', output: scan.error })
  }

  const failed = steps.some((s) => s.status === 'fail')
  return { exitCode: failed ? 1 : 0, steps }
}

export async function checkCommand(): Promise<void> {
  const result = await runCheck({ cwd: process.cwd() })

  console.log('')
  for (const step of result.steps) {
    const icon = step.status === 'ok' ? '✓' : step.status === 'fail' ? '✗' : '·'
    console.log(`  ${icon} ${step.name}: ${step.status}`)
    if (step.status === 'fail' && step.output) {
      console.log(step.output.split('\n').map((l) => `    ${l}`).join('\n'))
    }
  }
  console.log('')
  process.exit(result.exitCode)
}
