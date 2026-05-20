import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LLM_PROVIDER_BLOCKLIST = [
  'openai',
  '@anthropic-ai',
  'langchain',
  '@langchain',
  'llamaindex',
  '@ai-sdk',
  'cohere',
  '@google/generative-ai',
  'groq-sdk',
  '@mistralai',
]

function getPackageDeps(pkgPath: string): { deps: string[]; peerDeps: string[] } {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  return {
    deps: Object.keys(pkg.dependencies ?? {}),
    peerDeps: Object.keys(pkg.peerDependencies ?? {}),
  }
}

function findLLMDeps(depNames: string[]): string[] {
  return depNames.filter((dep) => LLM_PROVIDER_BLOCKLIST.some((blocked) => dep.startsWith(blocked)))
}

describe('Bundle Audit: zero LLM dependencies', () => {
  const theoPkgPath = resolve(__dirname, '../../packages/theo/package.json')
  const createTheoPkgPath = resolve(__dirname, '../../packages/create-theo/package.json')

  it('blocklist should be comprehensive (8+ providers)', () => {
    expect(LLM_PROVIDER_BLOCKLIST.length).toBeGreaterThanOrEqual(8)
  })

  it('theo should have zero LLM providers in dependencies', () => {
    const { deps } = getPackageDeps(theoPkgPath)
    const found = findLLMDeps(deps)
    expect(found, `Found LLM deps: ${found.join(', ')}`).toHaveLength(0)
  })

  it('theo should have zero LLM providers in peerDependencies', () => {
    const { peerDeps } = getPackageDeps(theoPkgPath)
    const found = findLLMDeps(peerDeps)
    expect(found, `Found LLM peer deps: ${found.join(', ')}`).toHaveLength(0)
  })

  it('create-theo should have zero LLM providers in dependencies', () => {
    const { deps } = getPackageDeps(createTheoPkgPath)
    const found = findLLMDeps(deps)
    expect(found, `Found LLM deps: ${found.join(', ')}`).toHaveLength(0)
  })
})
