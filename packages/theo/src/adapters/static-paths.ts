import type { RouteNode } from '../router/types.js'

export interface ResolvedPath {
  /** URL path to render, e.g. '/blog/123' */
  url: string
  /** Output file path relative to .theo/static/, e.g. 'blog/123.html' */
  filename: string
}

export type StaticPathParams = Record<string, string | string[]>

export type LoadStaticPaths = (paramsFilePath: string) => Promise<StaticPathParams[] | null>

export class StaticPathsRequiredError extends Error {
  constructor(routePath: string, paramsFile: string) {
    super(
      `Route ${routePath} has dynamic segments and requires ${paramsFile}. ` +
        `Export default function returning Array<{ <param>: string | string[] }>.`,
    )
    this.name = 'StaticPathsRequiredError'
  }
}

export interface CollectOptions {
  appDir: string
  loadStaticPaths: LoadStaticPaths
}

export type ParsedSegment =
  | { kind: 'static' }
  | { kind: 'param'; name: string }
  | { kind: 'catch-all'; name: string }

const CATCH_ALL = /^\[\.\.\.(.+)\]$/
const PARAM = /^\[(.+)\]$/

export function parseSegment(segment: string): ParsedSegment {
  const catchAll = CATCH_ALL.exec(segment)
  if (catchAll) return { kind: 'catch-all', name: catchAll[1] }
  const param = PARAM.exec(segment)
  if (param) return { kind: 'param', name: param[1] }
  return { kind: 'static' }
}

export async function collectStaticPaths(
  tree: RouteNode,
  options: CollectOptions,
): Promise<ResolvedPath[]> {
  const out: ResolvedPath[] = []
  await walk(tree, [], out, options)
  return out
}

async function walk(
  node: RouteNode,
  parentSegments: string[],
  out: ResolvedPath[],
  options: CollectOptions,
): Promise<void> {
  const segments = node.segment === '' ? parentSegments : [...parentSegments, node.segment]

  if (node.page) {
    const resolved = await resolveNodePaths(segments, options)
    out.push(...resolved)
  }

  for (const child of node.children) {
    await walk(child, segments, out, options)
  }
}

async function resolveNodePaths(
  segments: string[],
  options: CollectOptions,
): Promise<ResolvedPath[]> {
  if (segments.length === 0) {
    return [{ url: '/', filename: 'index.html' }]
  }

  const parsed = segments.map(parseSegment)
  const hasDynamic = parsed.some((p) => p.kind !== 'static')

  if (!hasDynamic) {
    const joined = segments.join('/')
    return [{ url: '/' + joined, filename: joined + '.html' }]
  }

  let lastDynamicIdx = 0
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].kind !== 'static') lastDynamicIdx = i
  }

  const dirSegments = segments.slice(0, lastDynamicIdx + 1)
  const paramsFile = `${options.appDir}/${dirSegments.join('/')}/static-paths.ts`
  const params = await options.loadStaticPaths(paramsFile)

  if (!params) {
    const routePath = '/' + segments.join('/')
    throw new StaticPathsRequiredError(routePath, paramsFile)
  }

  return params.map((paramSet) => {
    const filled: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const p = parsed[i]
      if (p.kind === 'static') {
        filled.push(segments[i])
      } else {
        const value = paramSet[p.name]
        if (Array.isArray(value)) {
          filled.push(...value)
        } else {
          filled.push(value)
        }
      }
    }
    const joined = filled.join('/')
    return { url: '/' + joined, filename: joined + '.html' }
  })
}
