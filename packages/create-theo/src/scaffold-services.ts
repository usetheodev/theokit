/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scaffold helper. All write paths derived from the trusted
 * targetDir (CLI argument, resolved absolute). Read paths are the
 * bundled service templates shipped with this package.
 */
/**
 * Phase 4 — `--backend python|node` scaffolding (T4.1, T4.2).
 *
 * After the main TheoKit scaffold runs, this helper:
 *   - Copies the requested service template(s) under `<target>/services/<name>/`
 *   - Substitutes `{{name}}` in `.tmpl` files
 *   - Renames `.tmpl` files to drop the suffix
 *   - Injects services config into the user's `theo.config.ts`
 *   - Injects `@hey-api/client-fetch` into the user's package.json (EC-10)
 */
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export type BackendKind = 'python' | 'node'

const VALID_BACKENDS = ['python', 'node'] as const

/**
 * Parse `--backend python` / `--backend node` (multi-value) from argv.
 *
 * Accepts:
 *   --backend python
 *   --backend=python
 *   --backend python --backend node
 *
 * Throws on unknown backend name.
 */
export function parseBackendFlags(args: string[]): BackendKind[] {
  const out: BackendKind[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    let value: string | undefined
    if (a === '--backend') {
      value = args[i + 1]
      i++
    } else if (a.startsWith('--backend=')) {
      value = a.slice('--backend='.length)
    }
    if (value === undefined) continue
    if (!(VALID_BACKENDS as readonly string[]).includes(value)) {
      throw new Error(
        `unknown --backend value: '${value}'. Valid options: ${VALID_BACKENDS.join(', ')}.`,
      )
    }
    out.push(value as BackendKind)
  }
  return out
}

const BACKEND_CONFIG: Record<
  BackendKind,
  {
    templateDir: string
    serviceName: string
    port: number
    proxy: string
    dev: string
    start: string
  }
> = {
  python: {
    templateDir: 'agent-python',
    serviceName: 'agent',
    port: 8001,
    proxy: '/api/agent',
    dev: 'uvicorn main:app --reload --port 8001',
    start: 'uvicorn main:app --port 8001 --workers 4',
  },
  node: {
    templateDir: 'agent-node',
    serviceName: 'worker',
    port: 8002,
    proxy: '/api/worker',
    dev: 'pnpm dev',
    start: 'pnpm start',
  },
}

function getServiceTemplateDir(kind: BackendKind): string {
  return resolve(__dirname, '../templates/services', BACKEND_CONFIG[kind].templateDir)
}

function substituteTmpls(dir: string, projectName: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      substituteTmpls(full, projectName)
      continue
    }
    if (entry.endsWith('.tmpl')) {
      const content = readFileSync(full, 'utf-8').replace(/\{\{name\}\}/g, projectName)
      const dest = full.replace(/\.tmpl$/, '')
      writeFileSync(dest, content)
      unlinkSync(full)
    }
  }
}

interface ServiceEntry {
  runtime: BackendKind
  port: number
  proxy: string
  dev: string
  start: string
}

/**
 * Build the `services: {}` snippet to inject into `theo.config.ts`.
 * Returns the inner record literal — caller wraps in `services: { ... }`.
 */
export function buildServicesSnippet(selections: { name: string; entry: ServiceEntry }[]): string {
  if (selections.length === 0) return ''
  const blocks = selections.map(({ name, entry }) => {
    return `    ${name}: {
      runtime: '${entry.runtime}',
      port: ${String(entry.port)},
      proxy: '${entry.proxy}',
      dev: ${JSON.stringify(entry.dev)},
      start: ${JSON.stringify(entry.start)},
    },`
  })
  return `  services: {\n${blocks.join('\n')}\n  },\n`
}

/**
 * Insert the services block into an existing `theo.config.ts`.
 * Strategy: find `defineConfig({` and append the services block before the closing brace.
 */
export function injectServicesIntoConfig(configSource: string, snippet: string): string {
  if (snippet.length === 0) return configSource
  if (configSource.includes('services:')) return configSource // already present

  // Match the LAST `}` before the closing of defineConfig({...})
  const re = /defineConfig\(\{([\s\S]*?)\}\)/m
  const match = re.exec(configSource)
  if (!match) return configSource

  const inner = match[1]
  // Strip trailing whitespace without backtracking-prone \s+$ regex.
  let trimEnd = inner.length
  while (trimEnd > 0 && /\s/.test(inner.charAt(trimEnd - 1))) {
    trimEnd--
  }
  const trimmed = inner.slice(0, trimEnd)
  const sep = trimmed.length > 0 && !trimmed.endsWith(',') ? ',\n' : '\n'
  const newInner = `${trimmed}${sep}${snippet}`
  return configSource.replace(re, `defineConfig({${newInner}})`)
}

export function injectHeyApiDep(packageJsonSource: string): string {
  const pkg = JSON.parse(packageJsonSource) as {
    dependencies?: Record<string, string>
  }
  pkg.dependencies = pkg.dependencies ?? {}
  if (!('@hey-api/client-fetch' in pkg.dependencies)) {
    pkg.dependencies['@hey-api/client-fetch'] = '^0.6.0'
  }
  return JSON.stringify(pkg, null, 2) + '\n'
}

export interface ScaffoldServicesOptions {
  /** Target project directory (already scaffolded with the TS template). */
  targetDir: string
  /** Project name (substituted into .tmpl files). */
  projectName: string
  /** Which backends to scaffold. */
  backends: BackendKind[]
}

export function scaffoldServices(options: ScaffoldServicesOptions): void {
  if (options.backends.length === 0) return

  const selections: { name: string; entry: ServiceEntry }[] = []

  for (const kind of options.backends) {
    const cfg = BACKEND_CONFIG[kind]
    const src = getServiceTemplateDir(kind)
    // Schema contract: dev/start commands run from `services/<serviceName>/` cwd
    // (services/schema/schema.ts line 35). The destination MUST equal serviceName
    // so the orchestrator's cwd resolution matches the on-disk directory.
    const dest = join(options.targetDir, 'services', cfg.serviceName)
    if (!existsSync(src)) {
      throw new Error(`service template not found: ${src}`)
    }
    cpSync(src, dest, { recursive: true })
    substituteTmpls(dest, options.projectName)

    selections.push({
      name: cfg.serviceName,
      entry: {
        runtime: kind,
        port: cfg.port,
        proxy: cfg.proxy,
        dev: cfg.dev,
        start: cfg.start,
      },
    })
  }

  // Inject services into theo.config.ts
  const configPath = join(options.targetDir, 'theo.config.ts')
  if (existsSync(configPath)) {
    const cfgSrc = readFileSync(configPath, 'utf-8')
    const snippet = buildServicesSnippet(selections)
    const updated = injectServicesIntoConfig(cfgSrc, snippet)
    if (updated !== cfgSrc) {
      writeFileSync(configPath, updated)
    }
  }

  // EC-10: inject @hey-api/client-fetch into user's package.json
  const pkgPath = join(options.targetDir, 'package.json')
  if (existsSync(pkgPath)) {
    const pkgSrc = readFileSync(pkgPath, 'utf-8')
    const updated = injectHeyApiDep(pkgSrc)
    writeFileSync(pkgPath, updated)
  }

  // Rename .gitignore for services if needed (none currently shipped, but reserved hook)
}
