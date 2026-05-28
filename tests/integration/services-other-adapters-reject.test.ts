import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ADAPTERS_DIR = resolve(__dirname, '../../packages/theo/src/adapters')

const REJECTING_ADAPTERS = [
  'vercel',
  'cloudflare',
  'aws-lambda',
  'bun',
  'deno-deploy',
  'netlify',
  'static',
] as const

describe('T2.2 — 7 adapters reject services (structural)', () => {
  for (const name of REJECTING_ADAPTERS) {
    describe(`adapter: ${name}`, () => {
      const src = readFileSync(resolve(ADAPTERS_DIR, `${name}.ts`), 'utf-8')

      it(`${name}.ts imports assertServicesUnsupported`, () => {
        expect(src).toMatch(/import\s*\{[^}]*assertServicesUnsupported[^}]*\}\s*from/)
      })

      it(`${name}.ts imports readManifest`, () => {
        expect(src).toMatch(/import\s*\{[^}]*readManifest[^}]*\}\s*from/)
      })

      it(`${name}.ts calls assertServicesUnsupported with its name and readManifest(cwd)`, () => {
        expect(src).toMatch(
          new RegExp(
            `assertServicesUnsupported\\(\\s*['"]${name}['"]\\s*,\\s*readManifest\\(cwd\\)\\s*\\)`,
          ),
        )
      })
    })
  }
})

describe('T2.2 — 7 adapters reject services (live)', () => {
  it('vercel adapter throws on non-empty manifest', async () => {
    const { vercelAdapter } = await import('../../packages/theo/src/adapters/vercel.js')
    await assertRejects(vercelAdapter.build.bind(vercelAdapter) as AnyBuildFn, 'vercel')
  })

  it('cloudflare adapter throws on non-empty manifest', async () => {
    const { cloudflareAdapter } = await import('../../packages/theo/src/adapters/cloudflare.js')
    await assertRejects(cloudflareAdapter.build.bind(cloudflareAdapter) as AnyBuildFn, 'cloudflare')
  })

  it('aws-lambda adapter throws on non-empty manifest', async () => {
    const { awsLambdaAdapter } = await import('../../packages/theo/src/adapters/aws-lambda.js')
    await assertRejects(awsLambdaAdapter.build.bind(awsLambdaAdapter) as AnyBuildFn, 'aws-lambda')
  })

  it('bun adapter throws on non-empty manifest', async () => {
    const { bunAdapter } = await import('../../packages/theo/src/adapters/bun.js')
    await assertRejects(bunAdapter.build.bind(bunAdapter) as AnyBuildFn, 'bun')
  })

  it('deno-deploy adapter throws on non-empty manifest', async () => {
    const { denoDeployAdapter } = await import('../../packages/theo/src/adapters/deno-deploy.js')
    await assertRejects(
      denoDeployAdapter.build.bind(denoDeployAdapter) as AnyBuildFn,
      'deno-deploy',
    )
  })

  it('netlify adapter throws on non-empty manifest', async () => {
    const { netlifyAdapter } = await import('../../packages/theo/src/adapters/netlify.js')
    await assertRejects(netlifyAdapter.build.bind(netlifyAdapter) as AnyBuildFn, 'netlify')
  })

  it('static adapter throws on non-empty manifest', async () => {
    const { staticAdapter } = await import('../../packages/theo/src/adapters/static.js')
    await assertRejects(staticAdapter.build.bind(staticAdapter) as AnyBuildFn, 'static')
  })
})

// adapter build signatures vary; testing rejection path uniformly
type AnyBuildFn = (config: unknown, cwd: string) => Promise<void>

async function assertRejects(buildFn: AnyBuildFn, name: string) {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildManifest, writeManifest } = await import('../../packages/theo/src/services/index.js')

  const tmp = mkdtempSync(join(tmpdir(), `wave2-${name}-reject-`))
  try {
    const manifest = buildManifest({
      agent: {
        runtime: 'python',
        port: 8001,
        proxy: '/api/agent',
        dev: 'uvicorn main:app',
        start: 'uvicorn main:app --workers 4',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
    })
    writeManifest(tmp, manifest)

    let threw = false
    let errMsg = ''
    try {
      await buildFn({ port: 3000, ssr: false }, tmp)
    } catch (err) {
      threw = true
      errMsg = err instanceof Error ? err.message : String(err)
    }
    expect(threw).toBe(true)
    expect(errMsg).toContain(name)
    expect(errMsg).toMatch(/node \(local\)|theo-cloud|--target node/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
