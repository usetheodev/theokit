import { Outlet, Link } from 'react-router'

export default function RootLayout() {
  return (
    <main>
      <h1>Theo Devtools — Live Demo</h1>
      <p style={{ color: '#666' }}>
        Look at the bottom-right corner — that's the devtools chip. Click it. Try the buttons.
      </p>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/products">Products</Link>
      </nav>
      <Outlet />
    </main>
  )
}
