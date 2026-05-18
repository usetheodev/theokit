import { useParams } from 'react-router'

export default function DocsCatchAllPage() {
  const params = useParams<{ slug?: string }>()
  // The catch-all is exposed as a `/`-joined string in react-router 7;
  // splitting it gives an array view if the consumer wants segments.
  const segments = (params.slug ?? '').split('/').filter(Boolean)
  return (
    <article>
      <h1>Docs catch-all</h1>
      <p>
        Path: <code>/docs/{params.slug ?? ''}</code>
      </p>
      <p>Segments: {segments.length === 0 ? '(empty)' : segments.join(' › ')}</p>
    </article>
  )
}
