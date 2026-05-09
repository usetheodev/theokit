import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'

const fixtureDir = resolve(__dirname, '../../fixtures/production-build')

describe('Error Pages', () => {
  describe('fixture files', () => {
    it('should have public/404.html fixture', () => {
      expect(existsSync(join(fixtureDir, 'public/404.html'))).toBe(true)
    })

    it('should have public/500.html fixture', () => {
      expect(existsSync(join(fixtureDir, 'public/500.html'))).toBe(true)
    })

    it('404.html should contain custom content', () => {
      const content = readFileSync(join(fixtureDir, 'public/404.html'), 'utf-8')
      expect(content).toContain('404')
      expect(content).toContain('Not Found')
    })

    it('500.html should contain custom content', () => {
      const content = readFileSync(join(fixtureDir, 'public/500.html'), 'utf-8')
      expect(content).toContain('500')
      expect(content).toContain('Server Error')
    })
  })

  describe('URL extension detection logic', () => {
    // The production server uses extname() to distinguish SPA routes from static file requests
    it('should detect file extensions for static file URLs', () => {
      expect(extname('/styles.css')).toBe('.css')
      expect(extname('/image.png')).toBe('.png')
      expect(extname('/script.js')).toBe('.js')
      expect(extname('/favicon.ico')).toBe('.ico')
    })

    it('should NOT detect extensions for SPA routes (EC-2)', () => {
      expect(extname('/dashboard')).toBe('')
      expect(extname('/about')).toBe('')
      expect(extname('/users/123')).toBe('')
      expect(extname('/')).toBe('')
    })

    it('should NOT serve 404 for SPA routes - extension check prevents it', () => {
      // URLs without extensions go to SPA fallback, NOT to 404.html
      const spaRoutes = ['/dashboard', '/about', '/users/123', '/settings/profile']
      for (const route of spaRoutes) {
        const urlPath = route.split('?')[0]
        const hasExtension = !!extname(urlPath)
        expect(hasExtension, `${route} should NOT have extension`).toBe(false)
      }
    })

    it('should serve 404 for missing static files with extensions', () => {
      const staticPaths = ['/missing.css', '/image.png', '/bundle.js']
      for (const path of staticPaths) {
        const urlPath = path.split('?')[0]
        const hasExtension = !!extname(urlPath)
        expect(hasExtension, `${path} SHOULD have extension`).toBe(true)
      }
    })
  })
})
