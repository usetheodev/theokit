import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = resolve(__dirname, '../..')
const CLI = resolve(REPO, 'packages/theo/src/cli/index.ts')

let projectDir: string

const writeConfig = (): void => {
  writeFileSync(
    join(projectDir, 'theo.config.ts'),
    `export default { appDir: 'app', serverDir: 'server', port: 3000 }`,
  )
}

const writeMinimalApp = (): void => {
  mkdirSync(join(projectDir, 'app'), { recursive: true })
  mkdirSync(join(projectDir, 'server'), { recursive: true })
  writeFileSync(
    join(projectDir, 'app/page.tsx'),
    'export default function Page() { return null }\n',
  )
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'job-test-fixture', private: true, type: 'module' }),
  )
  writeFileSync(
    join(projectDir, 'index.html'),
    `<!doctype html><html><body><div id="root"></div></body></html>\n`,
  )
}

const writeJob = (name: string, withSchema = false): void => {
  mkdirSync(join(projectDir, 'server/jobs'), { recursive: true })
  const importLine = withSchema
    ? `import { z } from '${join(REPO, 'node_modules/zod/index.js')}'\n`
    : ''
  const inputField = withSchema ? `input: z.object({ id: z.string() }),\n  ` : ''
  writeFileSync(
    join(projectDir, `server/jobs/${name}.ts`),
    `${importLine}import { defineJob } from '${resolve(REPO, 'packages/theo/src/server/jobs/define-job.ts')}'
export default defineJob('${name}', { ${inputField}maxAttempts: 3, handler: async () => {} })
`,
  )
}

const runBuild = (): { stdout: string; exitCode: number } => {
  try {
    // eslint-disable-next-line sonarjs/os-command -- developer-local integration test invoking the framework's own CLI
    const stdout = execSync(`npx tsx ${CLI} build`, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: `${e.stdout ?? ''}\n${e.stderr ?? ''}`,
      exitCode: e.status ?? 1,
    }
  }
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'theokit-cli-job-'))
  writeMinimalApp()
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('CLI build emits job manifest (T1.2)', { timeout: 30_000 }, () => {
  it('build emits .theo/jobs.json when jobs are declared', () => {
    writeConfig()
    writeJob('process-doc')
    runBuild()
    const manifestPath = join(projectDir, '.theo/jobs.json')
    expect(existsSync(manifestPath)).toBe(true)
    const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      jobs: { name: string; maxAttempts: number }[]
    }
    expect(json.jobs[0].name).toBe('process-doc')
    expect(json.jobs[0].maxAttempts).toBe(3)
  })

  it('build emits empty jobs manifest when no jobs exist', () => {
    writeConfig()
    runBuild()
    const json = JSON.parse(readFileSync(join(projectDir, '.theo/jobs.json'), 'utf8')) as {
      jobs: unknown[]
    }
    expect(json.jobs).toEqual([])
  })

  it('manifest reflects hasInputSchema=true when Zod input provided', () => {
    writeConfig()
    writeJob('with-schema', true)
    runBuild()
    const json = JSON.parse(readFileSync(join(projectDir, '.theo/jobs.json'), 'utf8')) as {
      jobs: { name: string; hasInputSchema: boolean }[]
    }
    expect(json.jobs[0].hasInputSchema).toBe(true)
  })

  it('manifest reflects hasInputSchema=false when no input schema', () => {
    writeConfig()
    writeJob('no-schema')
    runBuild()
    const json = JSON.parse(readFileSync(join(projectDir, '.theo/jobs.json'), 'utf8')) as {
      jobs: { name: string; hasInputSchema: boolean }[]
    }
    expect(json.jobs[0].hasInputSchema).toBe(false)
  })

  it('manifest schemaVersion === 1', () => {
    writeConfig()
    writeJob('foo')
    runBuild()
    const json = JSON.parse(readFileSync(join(projectDir, '.theo/jobs.json'), 'utf8')) as {
      schemaVersion: number
    }
    expect(json.schemaVersion).toBe(1)
  })
})
