import type { Plugin } from 'vite'
import { resolve } from 'node:path'

const VIRTUAL_ENTRY_ID = '/@theo/entry-client'
const RESOLVED_VIRTUAL_ID = '\0@theo/entry-client'

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function theoPlugin(root?: string): Plugin {
  const projectRoot = root ?? process.cwd()

  return {
    name: 'theo',

    resolveId(id: string) {
      if (id === VIRTUAL_ENTRY_ID) {
        return RESOLVED_VIRTUAL_ID
      }
    },

    load(id: string) {
      if (id === RESOLVED_VIRTUAL_ID) {
        const pagePath = normalizePath(resolve(projectRoot, 'app/page.tsx'))
        return [
          `import React from 'react'`,
          `import { createRoot } from 'react-dom/client'`,
          `import Page from '${pagePath}'`,
          ``,
          `const el = document.getElementById('root')`,
          `if (el) {`,
          `  createRoot(el).render(React.createElement(Page))`,
          `}`,
        ].join('\n')
      }
    },
  }
}
