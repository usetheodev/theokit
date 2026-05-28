import { Outlet } from 'react-router'
export default function DashboardLayout() {
  return (
    <div data-testid="dashboard-layout">
      <Outlet />
    </div>
  )
}
