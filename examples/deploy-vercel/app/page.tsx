import { Badge, Button, Card } from '@usetheo/ui'
import { CheckCircle2, Cloud, Gauge, ShieldCheck, Sparkles, Zap } from 'lucide-react'

/**
 * Landing page for the Vercel-deploy example.
 *
 * The smoke script (`scripts/deploy-smoke-vercel.sh`) asserts:
 *   1. GET / returns 200
 *   2. HTML body contains the literal "TheoKit deployed" (the h1 below)
 *   3. SSR works (no JS execution needed for assertion #2)
 *
 * The page is built entirely from TheoUI primitives (Card, Button, Badge)
 * so it looks production-grade without bespoke CSS.
 */

interface Feature {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Routing, auth, real-time — wired',
    description:
      'File-based routing, typed actions, encrypted sessions, WebSockets. Configured by convention, not a maze of plugins.',
  },
  {
    icon: ShieldCheck,
    title: 'Production-aware defaults',
    description:
      'Strict CSRF, enforce-mode CSP, structured audit logging, Argon2id passwords — secure out of the box.',
  },
  {
    icon: Gauge,
    title: 'SSR streaming + bundle budget',
    description:
      '193 KB gzipped on the default template — 45% under the 350 KB budget. renderToPipeableStream with Suspense, baked in.',
  },
  {
    icon: Cloud,
    title: 'Deploy adapters',
    description:
      'Node, Vercel, Cloudflare Workers, Bun, Deno Deploy, Netlify, AWS Lambda, static, Theo PaaS.',
  },
]

export default function Home() {
  return (
    <div className="container py-16">
      {/* HERO */}
      <section className="mx-auto max-w-3xl text-center">
        <Badge variant="outline" className="mb-6 gap-1.5">
          <Sparkles className="h-3 w-3" />
          Vercel adapter example
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">TheoKit deployed</h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
          This page is served by TheoKit through the Vercel adapter. SSR-streamed, type-safe, and
          deployed in one command. Hit <code className="font-mono text-sm">/api/health</code> for
          the live API.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <a href="/api/health" rel="noopener">
              <CheckCircle2 className="h-4 w-4" />
              GET /api/health
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://github.com/usetheodev/theokit"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </Button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-6">
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                <f.icon className="h-5 w-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold leading-tight">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </section>

      {/* PROOF */}
      <section className="mx-auto mt-16 max-w-3xl">
        <Card className="bg-muted/30 p-6">
          <div className="flex items-center gap-2">
            <Badge variant="default">Live</Badge>
            <span className="text-sm font-medium">Smoke assertions passing</span>
          </div>
          <ul className="text-muted-foreground mt-3 grid gap-1.5 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
              <code className="font-mono">GET /</code> → 200 + this HTML
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
              <code className="font-mono">GET /api/health</code> → 200 +{' '}
              <code className="font-mono">&#123;ok:true&#125;</code>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
              SSR streaming with chunked transfer encoding
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
              Adapter declares <code className="font-mono">x-theo-deployed-by: vercel</code>
            </li>
          </ul>
        </Card>
      </section>
    </div>
  )
}
