/**
 * Fixture cache module — wires `useUnstorage` with the mock Redis driver.
 *
 * In production this file would import `unstorage/drivers/redis` instead.
 */
import { useUnstorage } from '../../../../../packages/theo/src/server/storage/use-unstorage.js'
import { mockRedisDriver } from './mock-redis-driver.js'

// `useUnstorage` is a server-side primitive (Nitro/Nuxt-style naming), NOT a
// React hook. The `react-hooks/rules-of-hooks` lint rule false-positives because
// of the `use*` prefix; disable for this server-only call site.
export async function getCache<T = string>(name = 'cache') {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useUnstorage<T>(name, mockRedisDriver({ prefix: `${name}:` }))
}
