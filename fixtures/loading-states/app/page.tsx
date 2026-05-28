import { Link } from 'react-router'

export default function Page() {
  return (
    <main>
      <h1>Loading states demo</h1>
      <p>
        Navigate to <Link to="/slow">/slow</Link> to see the segment-level loading fallback render
        while the deferred resource resolves.
      </p>
    </main>
  )
}
