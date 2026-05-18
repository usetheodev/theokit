import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EX = resolve(__dirname, '../../examples/agent-saas')
const read = (rel: string) => readFileSync(resolve(EX, rel), 'utf-8')
const has = (rel: string) => existsSync(resolve(EX, rel))

describe('examples/agent-saas — structure', () => {
  it('has all top-level config files', () => {
    expect(has('package.json')).toBe(true)
    expect(has('tsconfig.json')).toBe(true)
    expect(has('theo.config.ts')).toBe(true)
    expect(has('drizzle.config.ts')).toBe(true)
    expect(has('.env.example')).toBe(true)
    expect(has('.gitignore')).toBe(true)
    expect(has('index.html')).toBe(true)
    expect(has('README.md')).toBe(true)
  })

  it('package.json declares full dep set (theokit + ui + drizzle + zod + ws)', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
    for (const dep of [
      'theokit',
      '@usetheo/ui',
      'react',
      'react-dom',
      'react-router',
      'drizzle-orm',
      'postgres',
      'zod',
      'ws',
    ]) {
      expect(pkg.dependencies[dep], `missing dep ${dep}`).toBeDefined()
    }
  })

  it('theo.config.ts enables all the production-shaped flags', () => {
    const src = read('theo.config.ts')
    expect(src).toMatch(/ssr:\s*true/)
    expect(src).toMatch(/ssrStreaming:\s*true/)
    expect(src).toMatch(/ui:\s*\{.*theme.*violet-forge/s)
    expect(src).toMatch(/rateLimit:/)
    expect(src).toMatch(/upload:/)
    expect(src).toMatch(/serialization:\s*['"]superjson['"]/)
  })

  it('.env.example uses CHANGE_ME placeholder (EC-2 will refuse to boot in prod)', () => {
    expect(read('.env.example')).toMatch(/SECRET=CHANGE_ME/)
  })
})

describe('examples/agent-saas — database', () => {
  it('schema declares users + conversations + messages + attachments', () => {
    const src = read('db/schema.ts')
    expect(src).toMatch(/users\s*=\s*pgTable/)
    expect(src).toMatch(/conversations\s*=\s*pgTable/)
    expect(src).toMatch(/messages\s*=\s*pgTable/)
    expect(src).toMatch(/attachments\s*=\s*pgTable/)
  })

  it('schema exports inferred types for type-safe queries', () => {
    const src = read('db/schema.ts')
    expect(src).toMatch(/type User =/)
    expect(src).toMatch(/type Conversation =/)
    expect(src).toMatch(/type Message =/)
  })

  it('schema declares relations between users → conversations → messages', () => {
    const src = read('db/schema.ts')
    expect(src).toMatch(/usersRelations/)
    expect(src).toMatch(/conversationsRelations/)
    expect(src).toMatch(/messagesRelations/)
  })

  it('db/index.ts wires drizzle + postgres with schema', () => {
    const src = read('db/index.ts')
    expect(src).toMatch(/drizzle\(/)
    expect(src).toMatch(/postgres\(/)
    expect(src).toMatch(/schema/)
  })
})

describe('examples/agent-saas — server primitives wired', () => {
  it('context.ts calls assertProductionSecret (EC-2)', () => {
    const src = read('server/context.ts')
    expect(src).toMatch(/assertProductionSecret\(SECRET\)/)
    expect(src).toMatch(/createSessionManager/)
  })

  it('middleware.ts uses defineMiddleware', () => {
    const src = read('server/middleware.ts')
    expect(src).toMatch(/defineMiddleware/)
  })

  it('channel uses defineChannel + exports broadcast helper', () => {
    const src = read('server/channels/notifications.ts')
    expect(src).toMatch(/defineChannel/)
    expect(src).toMatch(/export function broadcast/)
  })

  it('rename action uses defineAction with Zod input', () => {
    const src = read('server/actions/rename-conversation.ts')
    expect(src).toMatch(/defineAction/)
    expect(src).toMatch(/z\.object/)
    expect(src).toMatch(/requireAuth/)
  })

  it('password helper uses PBKDF2 (Web Crypto, constant-time compare)', () => {
    const src = read('server/password.ts')
    expect(src).toMatch(/PBKDF2/)
    expect(src).toMatch(/constantTimeEqual/)
  })
})

describe('examples/agent-saas — routes', () => {
  const ROUTES: Array<[string, RegExp]> = [
    ['server/routes/health.ts', /defineRoute/],
    ['server/routes/signup.ts', /defineRoute[\s\S]*z\.object/],
    ['server/routes/login.ts', /verifyPassword/],
    ['server/routes/logout.ts', /destroySession/],
    ['server/routes/me.ts', /requireAuth\(ctx\.session\)/],
    ['server/routes/upload.ts', /parseRequestBody/],
    ['server/routes/conversations/index.ts', /defineRoute/],
    ['server/routes/conversations/[id]/index.ts', /params:\s*z\.object/],
    ['server/routes/conversations/[id]/chat.ts', /defineAgentEndpoint/],
  ]
  for (const [path, pattern] of ROUTES) {
    it(`${path} exists and matches ${pattern}`, () => {
      expect(has(path), `missing ${path}`).toBe(true)
      expect(read(path)).toMatch(pattern)
    })
  }

  it('chat route auth-gates BEFORE streaming (no SSE leak on 401)', () => {
    const src = read('server/routes/conversations/[id]/chat.ts')
    // requireAuth must appear before the first `yield`
    const authIdx = src.indexOf('requireAuth')
    const firstYield = src.indexOf('yield')
    expect(authIdx).toBeGreaterThan(0)
    expect(firstYield).toBeGreaterThan(authIdx)
  })

  it('chat route persists both user + assistant messages', () => {
    const src = read('server/routes/conversations/[id]/chat.ts')
    expect(src).toMatch(/role:\s*['"]user['"]/)
    expect(src).toMatch(/role:\s*['"]assistant['"]/)
  })

  it('chat route streams progressively (yield inside for-await)', () => {
    const src = read('server/routes/conversations/[id]/chat.ts')
    expect(src).toMatch(/for await[\s\S]*yield\s*\{\s*type:\s*['"]message['"]/)
  })
})

describe('examples/agent-saas — frontend', () => {
  it('home page uses theoFetch<typeof GET> for typed client', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/theoFetch<typeof/)
    expect(src).toMatch(/import\s+type\s*\{[^}]*GET/)
  })

  it('home page does NOT import server runtime values (only types)', () => {
    const src = read('app/page.tsx')
    // Every `from '.*/server/...'` import must be type-only
    const nonTypeImports = src
      .split('\n')
      .filter((l) => /from\s+['"][^'"]*server\//.test(l))
      .filter((l) => !/^\s*import\s+type\b/.test(l))
    expect(nonTypeImports).toEqual([])
  })

  it('conversation page uses useAgentStream + AgentTimeline + AgentComposer', () => {
    const src = read('app/conversations/[id]/page.tsx')
    expect(src).toMatch(/useAgentStream/)
    expect(src).toMatch(/AgentTimeline/)
    expect(src).toMatch(/AgentComposer/)
    expect(src).toMatch(/from\s+['"]@usetheo\/ui['"]/)
  })

  it('conversation page reads dynamic [id] param via useParams', () => {
    const src = read('app/conversations/[id]/page.tsx')
    expect(src).toMatch(/useParams/)
  })

  it('settings page exercises multipart upload AND websocket', () => {
    const src = read('app/settings/page.tsx')
    expect(src).toMatch(/multipart\/form-data/)
    expect(src).toMatch(/new FormData/)
    expect(src).toMatch(/new WebSocket\(/)
  })

  it('has loading + error + not-found boundaries', () => {
    expect(has('app/loading.tsx')).toBe(true)
    expect(has('app/error.tsx')).toBe(true)
    expect(has('app/not-found.tsx')).toBe(true)
  })
})

describe('examples/agent-saas — README documents every primitive', () => {
  const PRIMITIVES = [
    'defineRoute',
    'defineAgentEndpoint',
    'defineAction',
    'defineMiddleware',
    'defineChannel',
    'createSessionManager',
    'assertProductionSecret',
    'requireAuth',
    'parseRequestBody',
    'theoFetch',
    'useAgentStream',
  ]
  for (const p of PRIMITIVES) {
    it(`README mentions ${p}`, () => {
      expect(read('README.md')).toContain(p)
    })
  }
})
