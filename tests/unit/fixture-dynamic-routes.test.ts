import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/dynamic-routes')
const read = (rel: string) => readFileSync(resolve(FIXTURE, rel), 'utf-8')

describe('T5.2 — dynamic-routes fixture', () => {
  it('has dynamic [id] segment under app/blog/', () => {
    expect(existsSync(resolve(FIXTURE, 'app/blog/[id]/page.tsx'))).toBe(true)
  })

  it('has catch-all [...slug] segment under app/docs/', () => {
    expect(existsSync(resolve(FIXTURE, 'app/docs/[...slug]/page.tsx'))).toBe(true)
  })

  it('has server route with [id] dynamic param', () => {
    expect(existsSync(resolve(FIXTURE, 'server/routes/posts/[id].ts'))).toBe(true)
  })

  it('dynamic pages use useParams from react-router', () => {
    expect(read('app/blog/[id]/page.tsx')).toMatch(/useParams/)
    expect(read('app/docs/[...slug]/page.tsx')).toMatch(/useParams/)
  })

  it('server route validates params with Zod', () => {
    const src = read('server/routes/posts/[id].ts')
    expect(src).toMatch(/params:\s*z\.object/)
  })

  it('README documents both patterns', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/\[id\]/)
    expect(readme).toMatch(/\[\.\.\.slug\]|catch.all/)
  })
})
