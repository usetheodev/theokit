import { Outlet } from 'react-router'
export default function RootLayout() {
  return (
    <div data-testid="root-layout">
      <Outlet />
    </div>
  )
}
