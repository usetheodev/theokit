import { Suspense } from 'react'
import SlowFeed from './SlowFeed.js'

export default function Page() {
  return (
    <main>
      <h1>Streaming SSR demo</h1>
      <p>The shell flushes immediately. The feed below streams after 200ms.</p>
      <Suspense fallback={<p>Loading feed…</p>}>
        <SlowFeed />
      </Suspense>
    </main>
  )
}
