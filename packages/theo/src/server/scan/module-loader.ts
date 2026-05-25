import { pathToFileURL } from 'node:url'

import type { ViteDevServer } from 'vite'

export type LoadModule = (path: string) => Promise<Record<string, unknown>>

export function createViteLoader(vite: ViteDevServer): LoadModule {
  return (path) => vite.ssrLoadModule(path) as Promise<Record<string, unknown>>
}

export function createProductionLoader(): LoadModule {
  return async (path) => {
    const url = pathToFileURL(path).href
    return import(url) as Promise<Record<string, unknown>>
  }
}
