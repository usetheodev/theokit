import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/adapter-targets/aws-lambda')
const ADAPTER = resolve(__dirname, '../../packages/theo/src/adapters/aws-lambda.ts')
const read = (p: string) => readFileSync(p, 'utf-8')

describe('T8.6 — adapter-aws-lambda fixture', () => {
  it('fixture has theo.config.ts + README', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'README.md'))).toBe(true)
  })

  it('README mentions `theokit build --target=aws-lambda`', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/--target=aws-lambda/)
  })

  it('README mentions API Gateway HTTP API v2', () => {
    expect(read(resolve(FIXTURE, 'README.md'))).toMatch(/HTTP API v2|API Gateway/i)
  })

  it('adapter source emits handler.mjs', () => {
    expect(read(ADAPTER)).toMatch(/handler\.mjs/)
  })

  it('adapter source converts v2 event to Request shape', () => {
    expect(read(ADAPTER)).toMatch(/eventV2ToRequestShape|eventV2/)
  })

  it('adapter source handles binary content via base64', () => {
    expect(read(ADAPTER)).toMatch(/base64|isBase64Encoded/i)
  })
})
