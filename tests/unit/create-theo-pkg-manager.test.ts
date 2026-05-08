import { describe, it, expect, afterEach } from 'vitest'
import { detectPkgManager } from '../../packages/create-theo/src/pkg-manager.js'

const originalAgent = process.env.npm_config_user_agent

afterEach(() => {
  if (originalAgent !== undefined) {
    process.env.npm_config_user_agent = originalAgent
  } else {
    delete process.env.npm_config_user_agent
  }
})

describe('detectPkgManager', () => {
  it('should detect pnpm from npm_config_user_agent', () => {
    process.env.npm_config_user_agent = 'pnpm/9.15.0 node/v20.11.0'
    expect(detectPkgManager()).toBe('pnpm')
  })

  it('should detect yarn from npm_config_user_agent', () => {
    process.env.npm_config_user_agent = 'yarn/4.0.0 node/v20.11.0'
    expect(detectPkgManager()).toBe('yarn')
  })

  it('should detect bun from npm_config_user_agent', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0'
    expect(detectPkgManager()).toBe('bun')
  })

  it('should default to npm when user_agent is not set', () => {
    delete process.env.npm_config_user_agent
    expect(detectPkgManager()).toBe('npm')
  })
})
