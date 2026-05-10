import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { scanServerRoutes } from './scan.js'
import { scanServerActions } from './action-scan.js'
import { scanWebSocketRoutes } from './ws-scan.js'
import { compilePattern } from './match.js'
import type { ServerRouteNode } from './match.js'
import type { ActionNode } from './action-scan.js'
import type { WebSocketRouteNode } from './ws-scan.js'

// --- Manifest Types ---

export interface ManifestRoute {
  filePath: string
  routePath: string
  paramNames: string[]
}

export interface ManifestAction {
  filePath: string
  actionPath: string
}

export interface ManifestWebSocket {
  filePath: string
  wsPath: string
}

export interface TheoManifest {
  version: 1
  generatedAt: string
  routes: ManifestRoute[]
  actions: ManifestAction[]
  websockets: ManifestWebSocket[]
}

export interface LoadedManifest {
  routes: ServerRouteNode[]
  actions: ActionNode[]
  websockets: WebSocketRouteNode[]
}

// --- Generate ---

export function generateManifest(serverDir: string): TheoManifest {
  const routes = scanServerRoutes(serverDir)
  const actions = scanServerActions(serverDir)
  const websockets = scanWebSocketRoutes(serverDir)

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    routes: routes.map((r) => ({
      filePath: relative(serverDir, r.filePath),
      routePath: r.routePath,
      paramNames: r.paramNames,
    })),
    actions: actions.map((a) => ({
      filePath: relative(serverDir, a.filePath),
      actionPath: a.actionPath,
    })),
    websockets: websockets.map((w) => ({
      filePath: relative(serverDir, w.filePath),
      wsPath: w.wsPath,
    })),
  }
}

// --- Write ---

export function writeManifest(manifest: TheoManifest, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true })
  const manifestPath = join(outputDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

// --- Load ---

export function loadManifest(distDir: string, serverDir: string): LoadedManifest {
  const manifestPath = join(distDir, 'manifest.json')

  if (!existsSync(manifestPath)) {
    throw new Error(
      `No manifest found at ${manifestPath}. Run "theo build" first.`,
    )
  }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as TheoManifest

  const routes: ServerRouteNode[] = raw.routes.map((r) => {
    const { pattern, paramNames } = compilePattern(r.routePath)
    return {
      filePath: resolve(serverDir, r.filePath),
      routePath: r.routePath,
      paramNames,
      pattern,
    }
  })

  const actions: ActionNode[] = raw.actions.map((a) => ({
    filePath: resolve(serverDir, a.filePath),
    actionPath: a.actionPath,
  }))

  const websockets: WebSocketRouteNode[] = raw.websockets.map((w) => ({
    filePath: resolve(serverDir, w.filePath),
    wsPath: w.wsPath,
  }))

  return { routes, actions, websockets }
}
