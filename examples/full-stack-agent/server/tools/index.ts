import type { CustomTool } from 'theokit/server'

import { calculator } from './calculator.js'
import { currentTime } from './current-time.js'
import { echo } from './echo.js'
import { randomNumber } from './random-number.js'
import { webFetch } from './web-fetch.js'
import { webSearch } from './web-search.js'
import { buildWorkspaceRead } from './workspace-read.js'
import { buildWorkspaceWrite } from './workspace-write.js'

/**
 * Build the per-conversation tool catalog.
 *
 * Most tools are stateless singletons. Workspace tools need the `agentId` at
 * construction time to bake the sandbox path into their handler closure — so
 * we build the full catalog per request.
 */
export function buildTools(agentId: string): CustomTool[] {
  return [
    currentTime,
    calculator,
    randomNumber,
    webFetch,
    webSearch,
    buildWorkspaceRead(agentId),
    buildWorkspaceWrite(agentId),
    echo,
  ]
}

// Re-export singletons for tests + direct imports.
export { calculator, currentTime, echo, randomNumber, webFetch, webSearch }
export { buildWorkspaceRead, buildWorkspaceWrite }
