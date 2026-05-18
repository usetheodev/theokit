import { Suspense } from 'react'
import SlowFeed from './SlowFeed.js'

export default function SlowPage() {
  return (
    <section>
      <h2>Slow page</h2>
      <Suspense fallback={<p>(falling back to nearest loading.tsx…)</p>}>
        <SlowFeed />
      </Suspense>
    </section>
  )
}
