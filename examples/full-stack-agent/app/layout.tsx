// CSS-side entry per RFC 0008 follow-up: `@import "@usetheo/ui/styles.css"`
// must be in a CSS file (not JS) so Tailwind v4's compiler crawls the
// import graph and processes @theme tokens correctly. See globals.css.
import './globals.css'

import { Outlet } from 'react-router'
import {
  Sidebar,
  TopNav,
  AgentProfile,
  ThemeSwitcher,
  Tooltip,
  Badge,
  CostMeter,
  type AgentProfileDescriptor,
} from '@usetheo/ui'
import { Bot, MessageSquare, History, Settings } from 'lucide-react'

const AGENTS: AgentProfileDescriptor[] = [
  {
    id: 'theo',
    name: 'Theo',
    description: 'Mock LLM — replace at server/routes/chat.ts.',
    tone: 'primary',
    initials: 'TH',
    badge: 'Online',
  },
]

export default function RootLayout() {
  return (
    <div className="grid h-screen w-screen grid-rows-[auto_1fr] bg-background text-foreground">
      <TopNav className="border-border/60 border-b px-4 py-2">
        <TopNav.Left>
          <Tooltip label="TheoKit agent surface" side="bottom">
            <span className="inline-flex items-center gap-2">
              <Bot className="size-5 text-primary" aria-hidden />
              <span className="font-semibold text-sm tracking-tight">Theo Agent</span>
              <Badge variant="outline">v0.1</Badge>
            </span>
          </Tooltip>
        </TopNav.Left>
        <TopNav.Right>
          <Tooltip label="Toggle theme" side="bottom" align="end">
            <span>
              <ThemeSwitcher />
            </span>
          </Tooltip>
        </TopNav.Right>
      </TopNav>

      <div className="grid h-full grid-cols-[260px_1fr] overflow-hidden">
        <Sidebar className="flex flex-col border-border/60 border-r p-3">
          <Sidebar.Header>
            <AgentProfile agents={AGENTS} activeId="theo" />
          </Sidebar.Header>

          <Sidebar.Section title="Workspace">
            <Sidebar.Item icon={MessageSquare} active>
              New conversation
            </Sidebar.Item>
            <Sidebar.Item icon={History}>History</Sidebar.Item>
            <Sidebar.Item icon={Settings}>Settings</Sidebar.Item>
          </Sidebar.Section>

          <Sidebar.Footer className="mt-auto">
            <CostMeter
              compact
              title="This session"
              cost={0.0023}
              delta={{ value: 0.0023, period: 'now' }}
            />
          </Sidebar.Footer>
        </Sidebar>

        <main className="flex h-full flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
