/**
 * Caddyfile generator (T3.3).
 *
 * Emits a Caddyfile that fronts the TheoKit web app + declared services
 * with W3C trace context propagation enabled (Caddy 2.11+ `tracing` directive).
 *
 * Generated output sits at `<dist>/.theo/node/Caddyfile`, consumed by the
 * docker-compose stack (T3.3 compose-generator).
 *
 * EC-23: `reverse_proxy` directives are ordered by prefix length DESC.
 * Caddy matches longest-prefix-first when written in order.
 */
import type { ServicesManifest } from '../adapters-bridge/manifest.js'

export interface CaddyfileOptions {
  /** Port Caddy listens on (TheoKit web port; default 3000). */
  port: number
  /** TheoKit web container hostname (compose service name). Default 'web'. */
  webHost: string
}

function reverseProxyLines(servicePath: string, target: string, cors: boolean): string[] {
  const out = [`\treverse_proxy ${servicePath}* ${target}`]
  if (cors) {
    out.push(
      `\theader ${servicePath}* Access-Control-Allow-Origin "*"`,
      `\theader ${servicePath}* Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"`,
      `\theader ${servicePath}* Access-Control-Allow-Headers "Content-Type, Authorization, traceparent, tracestate, baggage"`,
    )
  }
  return out
}

export function generateCaddyfile(
  manifest: ServicesManifest | null,
  options: CaddyfileOptions,
): string {
  // EC-23: sort services by proxy prefix length DESC so longest matches first
  const services = (manifest?.services ?? [])
    .slice()
    .sort((a, b) => b.proxy.length - a.proxy.length)

  const serviceLines = services.flatMap((svc) =>
    reverseProxyLines(svc.proxy, `${svc.name}:${String(svc.port)}`, svc.cors),
  )

  const lines: string[] = [
    `:${String(options.port)} {`,
    `\t# W3C Trace Context propagation (Caddy 2.11+)`,
    `\ttracing`,
    `\theader -Server`,
    ...serviceLines,
    `\treverse_proxy ${options.webHost}:${String(options.port)}`,
    `}`,
    '',
  ]
  return lines.join('\n')
}
