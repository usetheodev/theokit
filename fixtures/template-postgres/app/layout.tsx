import { Outlet } from 'react-router'

export default function RootLayout() {
  return (
    <div>
      <nav>
        <a href="/">Home</a>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
