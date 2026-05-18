import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isoDateTransformer } from '../../fixtures/custom-transformer/transformer.js'

const FIXTURE = resolve(__dirname, '../../fixtures/custom-transformer')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T7.2 — custom-transformer fixture (structure)', () => {
  it('has all expected files', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'transformer.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'server/routes/data.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'app/page.tsx'))).toBe(true)
  })

  it('config uses superjson (default built-in for Date round-trip)', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/serialization:\s*['"]superjson['"]/)
  })

  it('custom transformer implements TheoTransformer interface', () => {
    expect(isoDateTransformer).toHaveProperty('name')
    expect(isoDateTransformer).toHaveProperty('serialize')
    expect(isoDateTransformer).toHaveProperty('deserialize')
    expect(typeof isoDateTransformer.serialize).toBe('function')
    expect(typeof isoDateTransformer.deserialize).toBe('function')
  })

  it('README documents both built-in options', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/superjson/)
    expect(readme).toMatch(/['"]?json['"]?/)
  })
})

describe('T7.2 — custom-transformer Date round-trip', () => {
  it('serialize → deserialize preserves Date instance', () => {
    const original = { ts: new Date('2026-05-17T20:00:00Z'), note: 'hello' }
    const wire = isoDateTransformer.serialize(original)
    const back = isoDateTransformer.deserialize(wire) as typeof original
    expect(back.ts instanceof Date).toBe(true)
    expect(back.ts.toISOString()).toBe(original.ts.toISOString())
    expect(back.note).toBe(original.note)
  })

  it('handles nested Date', () => {
    const original = { outer: { inner: { when: new Date('2030-01-01') } } }
    const wire = isoDateTransformer.serialize(original)
    const back = isoDateTransformer.deserialize(wire) as typeof original
    expect(back.outer.inner.when instanceof Date).toBe(true)
  })

  it('leaves non-Date strings alone (no false-positive marker match)', () => {
    const wire = isoDateTransformer.serialize({ label: 'hello world' })
    const back = isoDateTransformer.deserialize(wire) as { label: string }
    expect(back.label).toBe('hello world')
  })
})
