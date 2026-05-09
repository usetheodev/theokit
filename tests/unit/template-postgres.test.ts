import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const templateDir = resolve(__dirname, '../../packages/create-theo/templates/postgres')

describe('Template: postgres', () => {
  it('should have postgres template directory', () => {
    expect(existsSync(templateDir)).toBe(true)
  })

  it('should have db/schema.ts with users table', () => {
    const path = resolve(templateDir, 'db/schema.ts')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('pgTable')
    expect(content).toContain('users')
    expect(content).toContain('email')
  })

  it('should have db/index.ts with drizzle connection', () => {
    const path = resolve(templateDir, 'db/index.ts')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('drizzle')
    expect(content).toContain('DATABASE_URL')
  })

  it('should have server/context.ts with ctx.db', () => {
    const path = resolve(templateDir, 'server/context.ts')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('db')
  })

  it('should have server/routes/users.ts with CRUD', () => {
    const path = resolve(templateDir, 'server/routes/users.ts')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('defineRoute')
    expect(content).toContain('GET')
    expect(content).toContain('POST')
  })

  it('should have drizzle.config.ts', () => {
    const path = resolve(templateDir, 'drizzle.config.ts')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('postgresql')
    expect(content).toContain('DATABASE_URL')
  })

  it('should have .env.example with DATABASE_URL', () => {
    const path = resolve(templateDir, '.env.example')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('DATABASE_URL=')
  })

  it('should have package.json.tmpl with drizzle deps', () => {
    const path = resolve(templateDir, 'package.json.tmpl')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('drizzle-orm')
    expect(content).toContain('postgres')
    expect(content).toContain('drizzle-kit')
    expect(content).toContain('{{name}}')
  })

  it('should have standard files (index.html, theo.config.ts, tsconfig.json)', () => {
    expect(existsSync(resolve(templateDir, 'index.html'))).toBe(true)
    expect(existsSync(resolve(templateDir, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(templateDir, 'tsconfig.json'))).toBe(true)
  })

  it('should have _gitignore for rename', () => {
    expect(existsSync(resolve(templateDir, '_gitignore'))).toBe(true)
  })

  it('should have db scripts in package.json.tmpl', () => {
    const content = readFileSync(resolve(templateDir, 'package.json.tmpl'), 'utf-8')
    expect(content).toContain('db:push')
    expect(content).toContain('db:generate')
    expect(content).toContain('db:migrate')
  })
})
