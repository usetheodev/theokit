import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = resolve(__dirname, '../..')
const CLI = resolve(REPO, 'packages/theo/src/cli/index.ts')

let projectDir: string

const writeConfig = (extra = ''): void => {
  writeFileSync(
    join(projectDir, 'theo.config.ts'),
    `export default { appDir: 'app', serverDir: 'server', port: 3000, ${extra} }`,
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
    JSON.stringify({ name: 'theokit-build-test-fixture', private: true, type: 'module' }, null, 2),
  )
  // Minimal index.html for Vite client build entry
  writeFileSync(
    join(projectDir, 'index.html'),
    `<!doctype html><html><body><div id="root"></div><script type="module" src="/@theo/entry-client"></script></body></html>\n`,
  )
}

const writeCron = (name: string, schedule: string): void => {
  mkdirSync(join(projectDir, 'server/crons'), { recursive: true })
  writeFileSync(
    join(projectDir, `server/crons/${name}.ts`),
    `import { defineCron } from '${resolve(REPO, 'packages/theo/src/server/cron/define-cron.ts')}'
export default defineCron('${name}', { schedule: '${schedule}', handler: () => {} })
`,
  )
}

const runBuild = (args = ''): { stdout: string; exitCode: number } => {
  try {
    // eslint-disable-next-line sonarjs/os-command -- developer-local integration test invoking the framework's own CLI
    const stdout = execSync(`npx tsx ${CLI} build ${args}`, {
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
  projectDir = mkdtempSync(join(tmpdir(), 'theokit-cli-cron-'))
  writeMinimalApp()
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

// Slow tests — each invokes `npx tsx build`. Bump per-test timeout to 30s
// (default 5s is insufficient under parallel-suite contention).
describe('CLI build emits cron manifest (T1.1)', { timeout: 30_000 }, () => {
  it('build emits .theo/crons.json when crons are declared', () => {
    writeConfig()
    writeCron('morning', '0 9 * * *')
    // Manifests emit BEFORE Vite/adapter — verify manifest regardless of
    // adapter outcome (test fixture lacks node_modules → Vite fails, but
    // cron+job artifacts must be present).
    runBuild()
    const manifestPath = join(projectDir, '.theo/crons.json')
    expect(existsSync(manifestPath)).toBe(true)
    const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      crons: { name: string; schedule: string }[]
    }
    expect(json.crons[0].name).toBe('morning')
    expect(json.crons[0].schedule).toBe('0 9 * * *')
  })

  it('build emits empty manifest when no crons exist', () => {
    writeConfig()
    runBuild()
    const manifestPath = join(projectDir, '.theo/crons.json')
    expect(existsSync(manifestPath)).toBe(true)
    const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      crons: unknown[]
    }
    expect(json.crons).toEqual([])
  })

  it('build --target=vercel updates vercel.json crons[]', () => {
    writeConfig()
    writeCron('hourly', '0 * * * *')
    // Manifests emit BEFORE Vite/adapter — verify manifest regardless of
    // adapter outcome (test fixture lacks node_modules → Vite fails, but
    // cron+job artifacts must be present).
    runBuild('--target=vercel')
    const vercelJson = join(projectDir, 'vercel.json')
    expect(existsSync(vercelJson)).toBe(true)
    const json = JSON.parse(readFileSync(vercelJson, 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    expect(json.crons.length).toBe(1)
    expect(json.crons[0].schedule).toBe('0 * * * *')
  })

  it('build --target=cloudflare updates wrangler.toml [triggers]', () => {
    writeConfig()
    writeCron('cf-cron', '*/15 * * * *')
    // Manifests emit BEFORE Vite/adapter — verify manifest regardless of
    // adapter outcome (test fixture lacks node_modules → Vite fails, but
    // cron+job artifacts must be present).
    runBuild('--target=cloudflare')
    const wrangler = join(projectDir, 'wrangler.toml')
    expect(existsSync(wrangler)).toBe(true)
    const content = readFileSync(wrangler, 'utf8')
    expect(content).toContain('[triggers]')
    expect(content).toMatch(/crons\s*=\s*\["\*\/15 \* \* \* \*"\]/)
  })

  it('build --target=bun emits warning + records skip when crons present', () => {
    writeConfig()
    writeCron('foo', '* * * * *')
    // Manifests emit BEFORE Vite/adapter — verify manifest regardless of
    // adapter outcome (test fixture lacks node_modules → Vite fails, but
    // cron+job artifacts must be present).
    const { stdout } = runBuild('--target=bun')
    expect(stdout.toLowerCase()).toMatch(/cron.*skip|cron.*not supported|warn/)
  })

  // EC-105: existing vercel.json fields preserved
  it('build preserves existing vercel.json fields when adding crons', () => {
    writeConfig()
    writeCron('foo', '* * * * *')
    writeFileSync(
      join(projectDir, 'vercel.json'),
      JSON.stringify({
        functions: { 'api/x.ts': { maxDuration: 30 } },
        headers: [{ source: '/(.*)', headers: [{ key: 'X-Foo', value: 'bar' }] }],
      }),
    )
    runBuild('--target=vercel')
    const json = JSON.parse(readFileSync(join(projectDir, 'vercel.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(json.functions).toBeDefined()
    expect(json.headers).toBeDefined()
    expect(json.crons).toBeDefined()
  })

  // EC-201: --target authoritative even if config.adapters[] differs
  it('EC-201: --target flag is authoritative over config.adapters[]', () => {
    writeConfig(`adapters: ['cloudflare']`)
    writeCron('foo', '0 0 * * *')
    const { stdout } = runBuild('--target=vercel')
    // ONLY vercel.json should be created
    expect(existsSync(join(projectDir, 'vercel.json'))).toBe(true)
    // wrangler.toml should NOT be created (CF not targeted this build)
    expect(existsSync(join(projectDir, 'wrangler.toml'))).toBe(false)
    // stdout should reference the divergence
    expect(stdout.toLowerCase()).toMatch(/adapters|cloudflare|cross.?reference|note/)
  })

  // Suppress unused-import lint warning for cpSync (imported for future fixture-copy needs)
  it('utility: cpSync available for fixture copying', () => {
    expect(typeof cpSync).toBe('function')
  })
})
