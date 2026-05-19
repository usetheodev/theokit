import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { discoverOidcProvider, clearOidcCache } from '../../packages/theo/src/server/oidc-discovery.js'

/**
 * T7.4 — OIDC Discovery 1.0 fetcher.
 *
 * EC-7: HTTPS enforced for non-localhost issuers (RFC 8414 §3).
 */

const mockMetadata = {
  issuer: 'https://provider.example',
  authorization_endpoint: 'https://provider.example/authorize',
  token_endpoint: 'https://provider.example/token',
  jwks_uri: 'https://provider.example/jwks.json',
}

describe('T7.4 — discoverOidcProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any

  beforeEach(() => {
    clearOidcCache()
    fetchSpy = vi.spyOn(globalThis as { fetch: typeof fetch }, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify(mockMetadata), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('fetches the .well-known/openid-configuration', async () => {
    const m = await discoverOidcProvider('https://provider.example')
    expect(m.authorization_endpoint).toBe('https://provider.example/authorize')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect((fetchSpy.mock.calls[0][0] as string | URL).toString()).toContain('.well-known/openid-configuration')
  })

  it('caches the result — second call does not refetch', async () => {
    await discoverOidcProvider('https://provider.example')
    await discoverOidcProvider('https://provider.example')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('throws on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(discoverOidcProvider('https://missing.example')).rejects.toThrow(/404/)
  })

  it('does NOT cache failures — second call retries', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(discoverOidcProvider('https://flaky.example')).rejects.toThrow()
    // Next call: fetchSpy still mocks the default 200 response
    const m = await discoverOidcProvider('https://flaky.example')
    expect(m.authorization_endpoint).toBeDefined()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('EC-7: rejects HTTP issuer (RFC 8414 §3 requires HTTPS in production)', async () => {
    await expect(discoverOidcProvider('http://insecure.example')).rejects.toThrow(/HTTPS/i)
  })

  it('allows http://localhost for dev', async () => {
    await expect(discoverOidcProvider('http://localhost:8080')).resolves.toBeDefined()
  })
})
