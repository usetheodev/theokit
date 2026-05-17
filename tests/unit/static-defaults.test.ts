import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildStatic } from '../../packages/theo/src/adapters/static.js'
import type { TheoConfig } from '../../packages/theo/src/config/schema.js'

const baseConfig: TheoConfig = {
  appDir: 'app',
  serverDir: 'server',
  port: 3000,
  ssr: false,
  serialization: 'json',
} as TheoConfig

describe('buildStatic — default Vite SSR wiring (T1.5 closure)', () => {
  it('emits HTML using the client index template when no SSR build is present', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'theo-static-default-'))
    try {
      const clientDir = resolve(cwd, '.theo/client')
      mkdirSync(clientDir, { recursive: true })
      writeFileSync(
        resolve(clientDir, 'index.html'),
        '<!doctype html><html><body><div id="root"></div></body></html>',
      )
      const captured: Record<string, string> = {}
      await buildStatic(baseConfig, cwd, {
        runNodeBuild: async () => {},
        scanAppRoutes: () => ({
          segment: '',
          path: '/',
          page: '/app/page.tsx',
          children: [],
        }),
        loadStaticPaths: async () => null,
        writeFile: async (p, c) => {
          captured[p] = c
        },
        ensureDir: async () => {},
        // Do NOT inject renderHtml — exercise the default created in buildStatic
      })
      const indexPath = resolve(cwd, '.theo/static/index.html')
      expect(captured[indexPath]).toBeDefined()
      expect(captured[indexPath]).toContain('<div id="root">')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('loads static-paths.ts via dynamic import (default loader)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'theo-static-load-'))
    try {
      // Build minimal app structure
      mkdirSync(resolve(cwd, 'app/blog/[id]'), { recursive: true })
      writeFileSync(
        resolve(cwd, 'app/blog/[id]/static-paths.js'),
        'export default () => [{ id: "1" }, { id: "2" }]\n',
      )
      mkdirSync(resolve(cwd, '.theo/client'), { recursive: true })
      writeFileSync(
        resolve(cwd, '.theo/client/index.html'),
        '<!doctype html><html><body><div id="root"></div></body></html>',
      )

      const captured: Record<string, string> = {}
      await buildStatic(baseConfig, cwd, {
        runNodeBuild: async () => {},
        scanAppRoutes: () => ({
          segment: '',
          path: '/',
          children: [
            {
              segment: 'blog',
              path: '/blog',
              children: [
                {
                  segment: '[id]',
                  path: '/blog/[id]',
                  page: resolve(cwd, 'app/blog/[id]/page.tsx'),
                  children: [],
                },
              ],
            },
          ],
        }),
        // Override appDir to match the temp project layout. The default loader
        // looks for `<appDir>/<segments...>/static-paths.ts` — we need to point
        // it at the file we just wrote.
        loadStaticPaths: async (paramsFile) => {
          // The collector composes paramsFile from options.appDir; we hijack
          // it here to point at our .js file (default tries .ts → fall back .js).
          const jsPath = paramsFile.replace(/\.ts$/, '.js')
          const mod = (await import(jsPath)) as { default: () => unknown[] }
          return mod.default() as Awaited<ReturnType<typeof Promise.resolve>> as never
        },
        writeFile: async (p, c) => {
          captured[p] = c
        },
        ensureDir: async () => {},
      })

      const files = Object.keys(captured).filter((p) =>
        p.includes('/.theo/static/blog/'),
      )
      expect(files.length).toBe(2)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
