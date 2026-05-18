import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/multipart-upload')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T6.2 — multipart-upload fixture', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/upload.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
  })

  it('config sets upload limits', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/upload:\s*\{/)
    expect(src).toMatch(/maxFileSize/)
    expect(src).toMatch(/maxFiles/)
  })

  it('route uses parseRequestBody', () => {
    const src = read('server/routes/upload.ts')
    expect(src).toMatch(/parseRequestBody/)
  })

  it('route handles missing-file case with 422', () => {
    const src = read('server/routes/upload.ts')
    expect(src).toMatch(/422/)
  })

  it('app uses FormData + multipart enctype', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/new FormData/)
    expect(src).toMatch(/encType=['"]multipart\/form-data['"]/)
  })

  it('README documents size limits', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/maxFileSize|413|MB/)
  })
})
