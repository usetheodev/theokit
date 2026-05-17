import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig } from '../../config/load-config.js'
import { scanRoutes } from '../../router/scan.js'

export interface RuntimeInfo {
  name: 'node' | 'bun' | 'deno' | 'unknown'
  version: string
}

export interface PackageJsonMinimal {
  name?: string
  version?: string
}

export interface ConfigSummary {
  ok: boolean
  summary: string
}

export interface BuildInfoDeps {
  cwd: string
  readPackageJson?: () => PackageJsonMinimal | null
  detectRuntime?: () => RuntimeInfo
  loadConfig?: () => Promise<ConfigSummary>
  countRoutes?: () => number
}

function defaultDetectRuntime(): RuntimeInfo {
  const g = globalThis as { Bun?: { version: string }; Deno?: { version: { deno: string } } }
  if (typeof g.Bun !== 'undefined' && g.Bun.version) {
    return { name: 'bun', version: g.Bun.version }
  }
  if (typeof g.Deno !== 'undefined' && g.Deno.version) {
    return { name: 'deno', version: g.Deno.version.deno }
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    return { name: 'node', version: process.versions.node }
  }
  return { name: 'unknown', version: '?' }
}

function defaultReadPackageJson(cwd: string): PackageJsonMinimal | null {
  const path = resolve(cwd, 'package.json')
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as PackageJsonMinimal
    return parsed
  } catch {
    return null
  }
}

async function defaultLoadConfig(cwd: string): Promise<ConfigSummary> {
  try {
    await loadConfig(cwd)
    return { ok: true, summary: 'config OK' }
  } catch (err) {
    return { ok: false, summary: (err as Error).message }
  }
}

function defaultCountRoutes(cwd: string): number {
  const appDir = resolve(cwd, 'app')
  if (!existsSync(appDir)) return 0
  const tree = scanRoutes(appDir)
  let count = 0
  function walk(node: { page?: string; children: { page?: string; children: unknown[] }[] }): void {
    if (node.page) count++
    for (const child of node.children) walk(child as never)
  }
  walk(tree)
  return count
}

export async function buildInfo(deps: BuildInfoDeps): Promise<string> {
  const cwd = deps.cwd
  const readPkg = deps.readPackageJson ?? (() => defaultReadPackageJson(cwd))
  const runtime = (deps.detectRuntime ?? defaultDetectRuntime)()
  const loadCfg = deps.loadConfig ?? (() => defaultLoadConfig(cwd))
  const countRts = deps.countRoutes ?? (() => defaultCountRoutes(cwd))

  const pkg = readPkg()
  const config = await loadCfg()

  let routesCount = 0
  let scanError: string | null = null
  try {
    routesCount = countRts()
  } catch (err) {
    scanError = (err as Error).message
  }

  const projectLine = pkg && pkg.name
    ? `${pkg.name}@${pkg.version ?? '?'}`
    : '(missing)'

  const configLine = config.ok
    ? 'OK'
    : `INVALID — ${config.summary}`

  const routesLine = scanError
    ? `Scan failed: ${scanError}`
    : `Routes: ${routesCount}`

  return [
    `# Theo info`,
    ``,
    `## Project`,
    `Project: ${projectLine}`,
    ``,
    `## Runtime`,
    `${runtime.name} ${runtime.version}`,
    ``,
    `## Config`,
    `Config: ${configLine}`,
    ``,
    `## App`,
    routesLine,
    ``,
  ].join('\n')
}

export async function infoCommand(): Promise<void> {
  const cwd = process.cwd()
  const output = await buildInfo({ cwd })
  console.log(output)
}
