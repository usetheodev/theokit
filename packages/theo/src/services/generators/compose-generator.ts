/**
 * docker-compose.yml generator (T3.3).
 *
 * Emits the "TheoCloud-shaped" local harness — Caddy ingress in front of
 * web + declared services. Each service has a healthcheck and Caddy
 * `depends_on: service_healthy`.
 *
 * Used by the Node adapter: `theokit build --target node` writes the
 * compose stack to `.theo/node/docker-compose.yml`.
 */
import type { ManifestServiceEntry, ServicesManifest } from '../adapters-bridge/manifest.js'

export interface ComposeOptions {
  /** Port for the web container (TheoKit). Default 3000. */
  webPort: number
  /** Caddy listening port (default same as webPort — Caddy fronts everything). */
  caddyPort?: number
  /** Project name (compose file `name:` field). */
  projectName?: string
}

function indent(level: number): string {
  return '  '.repeat(level)
}

function healthcheckLines(svc: ManifestServiceEntry): string[] {
  const checker =
    svc.runtime === 'python'
      ? `curl -f http://localhost:${String(svc.port)}${svc.healthcheck} || exit 1`
      : `wget --spider -q http://localhost:${String(svc.port)}${svc.healthcheck} || exit 1`
  return [
    `${indent(2)}healthcheck:`,
    `${indent(3)}test: ["CMD-SHELL", "${checker}"]`,
    `${indent(3)}interval: 10s`,
    `${indent(3)}timeout: 5s`,
    `${indent(3)}retries: 3`,
  ]
}

function envLines(env: Record<string, string>): string[] {
  const lines: string[] = [`${indent(2)}environment:`]
  for (const [k, v] of Object.entries(env)) {
    lines.push(`${indent(3)}${k}: ${JSON.stringify(v)}`)
  }
  return lines
}

function serviceBlockLines(svc: ManifestServiceEntry): string[] {
  // EC-8: auto-inject convention env vars in the container too
  const env: Record<string, string> = {
    THEOKIT_SERVICE_NAME: svc.name,
    THEOKIT_SERVICE_PORT: String(svc.port),
    ...(svc.env ?? {}),
  }
  return [
    `${indent(1)}${svc.name}:`,
    `${indent(2)}build:`,
    `${indent(3)}context: ./services/${svc.name}`,
    `${indent(2)}expose:`,
    `${indent(3)}- "${String(svc.port)}"`,
    ...envLines(env),
    ...healthcheckLines(svc),
  ]
}

function caddyBlockLines(caddyPort: number, services: ManifestServiceEntry[]): string[] {
  const depends: string[] = [
    `${indent(2)}depends_on:`,
    `${indent(3)}web:`,
    `${indent(4)}condition: service_healthy`,
  ]
  for (const svc of services) {
    depends.push(`${indent(3)}${svc.name}:`, `${indent(4)}condition: service_healthy`)
  }
  return [
    `${indent(1)}caddy:`,
    `${indent(2)}image: caddy:2.11`,
    `${indent(2)}ports:`,
    `${indent(3)}- "${String(caddyPort)}:${String(caddyPort)}"`,
    `${indent(2)}volumes:`,
    `${indent(3)}- ./Caddyfile:/etc/caddy/Caddyfile:ro`,
    ...depends,
  ]
}

function webBlockLines(webPort: number): string[] {
  return [
    `${indent(1)}web:`,
    `${indent(2)}build:`,
    `${indent(3)}context: .`,
    `${indent(3)}dockerfile: Dockerfile`,
    `${indent(2)}expose:`,
    `${indent(3)}- "${String(webPort)}"`,
    `${indent(2)}healthcheck:`,
    `${indent(3)}test: ["CMD-SHELL", "wget --spider -q http://localhost:${String(webPort)}/api/health || exit 1"]`,
    `${indent(3)}interval: 10s`,
    `${indent(3)}timeout: 5s`,
    `${indent(3)}retries: 3`,
  ]
}

export function generateComposeYaml(
  manifest: ServicesManifest | null,
  options: ComposeOptions,
): string {
  const services = manifest?.services ?? []
  const webPort = options.webPort
  const caddyPort = options.caddyPort ?? webPort

  const projectLines = options.projectName ? [`name: ${options.projectName}`] : []

  const lines: string[] = [
    ...projectLines,
    `services:`,
    ...caddyBlockLines(caddyPort, services),
    ...webBlockLines(webPort),
    ...services.flatMap(serviceBlockLines),
    '',
  ]
  return lines.join('\n')
}
