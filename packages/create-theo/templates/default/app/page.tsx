'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChatThread,
  ChatMessage,
  ChatComposer,
  ToolCallCard,
  AgentStreaming,
  AgentErrorCard,
  EmptyState,
  QuickActionChips,
  ContextWindowBar,
  CommandPalette,
  Avatar,
  Tooltip,
  Button,
  ScrollArea,
  type UIMessage,
  type QuickAction,
  type CommandItem,
  type ToolCallStatus,
} from '@usetheo/ui'
import { Sparkles, Wrench, RotateCcw, Command } from 'lucide-react'
import { useAgentStream } from 'theokit/client'

/**
 * Default scaffold — an Agent Surface, composed entirely from TheoUI.
 *
 *   ChatThread / ChatMessage  → conversation
 *   ToolCallCard              → expandable tool invocations
 *   AgentStreaming            → streaming indicator
 *   AgentErrorCard            → error display
 *   ChatComposer              → bottom input bar
 *   EmptyState                → first-load screen
 *   ContextWindowBar          → context usage at top
 *   CommandPalette            → ⌘K quick actions
 *   Avatar                    → assistant face in messages
 *   Tooltip                   → hints on icons
 *
 * `useAgentStream` handles SSE consumption, AbortController cleanup, and
 * StrictMode safety. Replace the mock at server/routes/chat.ts with your
 * real LLM provider (OpenAI / Anthropic / local).
 */

type ConversationItem =
  | { kind: 'message'; id: string; role: 'user' | 'assistant'; content: string; timestamp: string }
  | {
      kind: 'tool'
      id: string
      tool: string
      target?: string
      status: ToolCallStatus
      output?: string
      timestamp: string
    }
  | { kind: 'error'; id: string; message: string; timestamp: string }

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'summarize', label: 'Summarize this page', icon: Sparkles },
  { id: 'tools', label: 'Show available tools', icon: Wrench },
  { id: 'reset', label: 'Start a new conversation', icon: RotateCcw },
]

const COMMAND_ITEMS: CommandItem[] = QUICK_ACTIONS.map((a) => ({
  id: a.id,
  label: a.label,
  icon: a.icon,
  group: 'Quick actions',
}))

// Mock context-window usage — replace with real model state.
const CONTEXT_USED = 4_200
const CONTEXT_TOTAL = 200_000
const MODEL_NAME = 'mock-llm'

// Modern chat UX: only the assistant carries an avatar. User messages are
// right-aligned with a distinct bubble style — that's enough signal.
// (TheoUI's ChatMessage uses flex-col, so a user avatar would land BELOW
// the bubble, not above — visually unusual.)
const ASSISTANT_AVATAR = (
  <Avatar size="sm" tone="primary">
    <Avatar.Fallback>TH</Avatar.Fallback>
  </Avatar>
)

export default function Page() {
  const [composerValue, setComposerValue] = useState('')
  const [userMessages, setUserMessages] = useState<ConversationItem[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { events, send, status, reset } = useAgentStream<{ message: string }>('/api/chat')

  // ⌘K / Ctrl+K opens the CommandPalette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo<ConversationItem[]>(() => {
    const ts = new Date().toISOString()
    const agentItems: ConversationItem[] = events.map((event, i) => {
      const id = `e-${i}`
      switch (event.type) {
        case 'message':
          return { kind: 'message', id, role: 'assistant', content: event.content, timestamp: ts }
        case 'tool_call':
          return {
            kind: 'tool',
            id,
            tool: event.name,
            target:
              typeof event.args === 'object' && event.args !== null
                ? Object.entries(event.args as Record<string, unknown>)
                    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                    .join(' ')
                : undefined,
            status: 'running',
            timestamp: ts,
          }
        case 'tool_result':
          return {
            kind: 'tool',
            id,
            tool: event.name,
            status: 'success',
            output:
              typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2),
            timestamp: ts,
          }
        case 'error':
          return { kind: 'error', id, message: event.message, timestamp: ts }
      }
    })
    return [...userMessages, ...agentItems]
  }, [userMessages, events])

  function handleSubmit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    const id = `u-${userMessages.length}`
    setUserMessages((prev) => [
      ...prev,
      { kind: 'message', id, role: 'user', content: trimmed, timestamp: new Date().toISOString() },
    ])
    send({ message: trimmed })
    setComposerValue('')
  }

  function handleQuickAction(id: string) {
    setPaletteOpen(false)
    if (id === 'reset') {
      setUserMessages([])
      reset()
      return
    }
    const action = QUICK_ACTIONS.find((a) => a.id === id)
    if (action) handleSubmit(typeof action.label === 'string' ? action.label : '')
  }

  const isStreaming = status === 'streaming'
  const isEmpty = items.length === 0 && !isStreaming
  const hasError = status === 'error'

  return (
    <>
      <ContextWindowBar
        used={CONTEXT_USED}
        total={CONTEXT_TOTAL}
        trailing={MODEL_NAME}
        label="Context window"
        compact
        className="border-border/60 border-b px-6 py-2"
      />

      <ScrollArea className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
          {isEmpty ? (
            <EmptyState
              eyebrow="Theo Agent"
              icon={Sparkles}
              title="What should we build today?"
              description="Ask anything. This scaffold ships with a mock LLM at server/routes/chat.ts so you can see the wiring before plugging in a real model."
              action={<QuickActionChips actions={QUICK_ACTIONS} onSelect={handleQuickAction} />}
            />
          ) : (
            <ChatThread>
              {items.map((item) => {
                if (item.kind === 'message') {
                  const message: UIMessage = {
                    id: item.id,
                    role: item.role,
                    parts: [{ type: 'text', text: item.content, state: 'done' }],
                  }
                  return (
                    <ChatMessage
                      key={item.id}
                      message={message}
                      avatar={item.role === 'assistant' ? ASSISTANT_AVATAR : undefined}
                    />
                  )
                }
                if (item.kind === 'tool') {
                  return (
                    <ToolCallCard
                      key={item.id}
                      tool={item.tool}
                      icon={Wrench}
                      target={item.target}
                      status={item.status}
                      output={item.output}
                      timestamp={item.timestamp}
                    />
                  )
                }
                return (
                  <AgentErrorCard
                    key={item.id}
                    kind="tool-failure"
                    title="Agent error"
                    detail={item.message}
                  />
                )
              })}
              {isStreaming && <AgentStreaming model={MODEL_NAME} />}
            </ChatThread>
          )}
        </div>
      </ScrollArea>

      <div className="border-border/60 border-t bg-background/50 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          {hasError && (
            <div className="mb-3">
              <AgentErrorCard
                kind="network"
                title="Stream ended with an error"
                detail="The connection to the agent endpoint was interrupted. Reset to try again."
                actions={
                  <Button variant="ghost" size="sm" onClick={() => reset()}>
                    Reset
                  </Button>
                }
              />
            </div>
          )}
          <ChatComposer
            value={composerValue}
            onValueChange={setComposerValue}
            onSubmit={handleSubmit}
            running={isStreaming}
            placeholder="Ask the agent…"
            leadingActions={
              <Tooltip label="Open command palette (⌘K)" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Open command palette"
                >
                  <Command className="size-4" />
                </Button>
              </Tooltip>
            }
          />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={COMMAND_ITEMS}
        onSelect={handleQuickAction}
        placeholder="Run a command…"
        emptyMessage="No matching commands."
      />
    </>
  )
}
