import { describe, it, expect } from 'vitest'
import {
  awsLambdaAdapter,
  buildAwsLambda,
  renderAwsLambdaEntry,
  eventV2ToRequestShape,
  responseToLambdaResultV2,
} from '../../packages/theo/src/adapters/aws-lambda.js'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'
import type { TheoConfig } from '../../packages/theo/src/config/schema.js'

const baseConfig: TheoConfig = {
  appDir: 'app',
  serverDir: 'server',
  port: 3000,
  ssr: false,
  serialization: 'json',
} as TheoConfig

describe('AWS Lambda adapter — shape', () => {
  it('exposes the DeployAdapter contract', () => {
    expect(awsLambdaAdapter.name).toBe('aws-lambda')
    expect(typeof awsLambdaAdapter.build).toBe('function')
  })

  it('is listed in VALID_TARGETS', () => {
    expect(VALID_TARGETS).toContain('aws-lambda')
  })
})

describe('eventV2ToRequestShape', () => {
  it('extracts method + path from v2 event', () => {
    const shape = eventV2ToRequestShape({
      version: '2.0',
      requestContext: { http: { method: 'POST', path: '/api/users' } },
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Alice"}',
      isBase64Encoded: false,
    })
    expect(shape.method).toBe('POST')
    expect(shape.path).toBe('/api/users')
    expect(shape.body).toBe('{"name":"Alice"}')
  })

  it('decodes base64 body when isBase64Encoded is true', () => {
    const shape = eventV2ToRequestShape({
      version: '2.0',
      requestContext: { http: { method: 'POST', path: '/upload' } },
      headers: {},
      body: Buffer.from('binary').toString('base64'),
      isBase64Encoded: true,
    })
    expect(shape.body).toBe('binary')
  })

  it('handles missing body', () => {
    const shape = eventV2ToRequestShape({
      version: '2.0',
      requestContext: { http: { method: 'GET', path: '/' } },
      headers: {},
      isBase64Encoded: false,
    })
    expect(shape.body).toBeUndefined()
  })
})

describe('responseToLambdaResultV2', () => {
  it('produces v2 result with statusCode and headers', () => {
    const result = responseToLambdaResultV2(200, { 'content-type': 'application/json' }, '{"ok":true}')
    expect(result.statusCode).toBe(200)
    expect(result.headers['content-type']).toBe('application/json')
    expect(result.body).toBe('{"ok":true}')
    expect(result.isBase64Encoded).toBe(false)
  })

  it('base64-encodes binary content types (EC: AWS v2 binary)', () => {
    const result = responseToLambdaResultV2(
      200,
      { 'content-type': 'application/octet-stream' },
      Buffer.from('binary').toString('binary'),
    )
    expect(result.isBase64Encoded).toBe(true)
  })

  it('marks application/pdf as binary', () => {
    const result = responseToLambdaResultV2(200, { 'content-type': 'application/pdf' }, 'pdf')
    expect(result.isBase64Encoded).toBe(true)
  })
})

describe('renderAwsLambdaEntry — template', () => {
  it('exports handler as ESM default-compatible export', () => {
    const out = renderAwsLambdaEntry()
    expect(out).toContain('export const handler')
  })

  it('handles APIGatewayProxyEventV2 format', () => {
    const out = renderAwsLambdaEntry()
    expect(out).toContain('event.requestContext')
  })

  it('does not import node:http (Lambda runtime has its own)', () => {
    const out = renderAwsLambdaEntry()
    expect(out).not.toMatch(/from 'node:http'/)
  })
})

describe('buildAwsLambda — orchestration', () => {
  it('runs node build before writing the handler', async () => {
    const calls: string[] = []
    await buildAwsLambda(baseConfig, '/cwd', {
      runNodeBuild: async () => {
        calls.push('node-build')
      },
      writeEntry: () => {
        calls.push('write')
      },
      ensureDir: () => {},
    })
    expect(calls).toEqual(['node-build', 'write'])
  })

  it('writes handler.mjs in .theo/aws/', async () => {
    let path = ''
    await buildAwsLambda(baseConfig, '/test', {
      runNodeBuild: async () => {},
      writeEntry: (p) => {
        path = p
      },
      ensureDir: () => {},
    })
    expect(path).toContain('/.theo/aws/handler.mjs')
  })
})
