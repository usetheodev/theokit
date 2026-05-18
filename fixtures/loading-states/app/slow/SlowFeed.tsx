/**
 * Suspense-deferred component. Throws a promise that resolves after 200ms,
 * which is the contract React's Suspense fallback expects.
 */

let cache: string | undefined
let pending: Promise<void> | undefined

function ensureLoaded(): string {
  if (cache) return cache
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        cache = 'feed payload loaded after 200ms'
        resolve()
      }, 200)
    })
  }
  throw pending
}

export default function SlowFeed() {
  const data = ensureLoaded()
  return <p>{data}</p>
}
