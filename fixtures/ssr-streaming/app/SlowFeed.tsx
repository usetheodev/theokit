/**
 * Suspense-deferred component used to demonstrate the progressive flush
 * in renderToPipeableStream. The shell of the page (header, fallback)
 * lands in the first chunk; this component's output lands later, after
 * the simulated 200ms work resolves.
 */

let cache: string[] | undefined
let pending: Promise<void> | undefined

function ensureLoaded(): string[] {
  if (cache) return cache
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      setTimeout(() => {
        cache = ['item-1', 'item-2', 'item-3']
        resolve()
      }, 200)
    })
  }
  throw pending
}

export default function SlowFeed() {
  const items = ensureLoaded()
  return (
    <ul>
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  )
}
