import { Link } from 'react-router'

export default function Page() {
  return (
    <main>
      <h1>Dynamic routes demo</h1>
      <ul>
        <li>
          <Link to="/blog/hello-world">/blog/hello-world</Link> — single dynamic segment{' '}
          <code>[id]</code>
        </li>
        <li>
          <Link to="/docs/guides/setup/quickstart">/docs/guides/setup/quickstart</Link> — catch-all{' '}
          <code>[...slug]</code>
        </li>
        <li>
          <Link to="/docs">/docs</Link> — catch-all with empty path
        </li>
      </ul>
    </main>
  )
}
