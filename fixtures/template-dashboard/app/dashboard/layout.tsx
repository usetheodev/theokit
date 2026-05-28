import { Outlet } from 'react-router'

export default function DashboardLayout() {
  return (
    <div>
      <h2>Dashboard Area</h2>
      <Outlet />
    </div>
  )
}
