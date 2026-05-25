import { getCacheEngine } from './engine-singleton.js'
import { validateTags } from './validation.js'

export interface RevalidateResult {
  deleted: number
}

/**
 * Invalidate all cache entries carrying the given tag.
 * Safe to call from any context (route handler, action, webhook).
 *
 * `opts.expire` accepted for API compatibility with Next.js; at MVP we delete
 * immediately (no SWR-with-expire semantics). A non-zero value emits one warn.
 */
export async function revalidateTag(
  tag: string,
  opts?: { expire?: number },
): Promise<RevalidateResult> {
  if (opts?.expire !== undefined && opts.expire > 0) {
    warnOnce(
      'revalidateTag-expire',
      '[theokit:cache] revalidateTag opts.expire is accepted but not honored at MVP (entries are deleted immediately).',
    )
  }
  const { valid } = validateTags([tag], 'revalidateTag')
  if (valid.length === 0) return { deleted: 0 }
  const engine = getCacheEngine()
  const deleted = await engine.invalidateTag(valid[0])
  return { deleted }
}

/**
 * Immediate invalidation (no SWR), Server-Action-safe.
 * Same semantics as revalidateTag at MVP; kept as separate name for
 * call-site clarity ("I want fresh data NOW").
 */
export async function updateTag(tag: string): Promise<RevalidateResult> {
  const { valid } = validateTags([tag], 'updateTag')
  if (valid.length === 0) return { deleted: 0 }
  const engine = getCacheEngine()
  const deleted = await engine.invalidateTag(valid[0])
  return { deleted }
}

/**
 * Invalidate cached entries for a route path.
 * Sugar over `revalidateTag('_THEO_T_/${path}/${type?}')`.
 */
export async function revalidatePath(
  path: string,
  opts?: { type?: 'layout' | 'page'; expire?: number },
): Promise<RevalidateResult> {
  if (opts?.expire !== undefined && opts.expire > 0) {
    warnOnce(
      'revalidatePath-expire',
      '[theokit:cache] revalidatePath opts.expire is accepted but not honored at MVP.',
    )
  }
  const engine = getCacheEngine()
  const deleted = await engine.revalidatePath(path, opts?.type)
  return { deleted }
}

const warnedKeys = new Set<string>()
function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}
