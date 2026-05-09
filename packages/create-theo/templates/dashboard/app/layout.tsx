import { Outlet } from 'react-router'

export default function RootLayout() {
  return (
    <div>
      <nav>
        <a href="/">Home</a> | <a href="/about">About</a> | <a href="/dashboard">Dashboard</a>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
