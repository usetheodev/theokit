'use client'

import { useMemo, useState } from 'react'
import {
  ChatThread,
  ChatMessage,
  ChatComposer,
  ToolCallCard,
  AgentStreaming,
  AgentErrorCard,
  EmptyState,
  QuickActionChips,
  Avatar,
  Button,
  ScrollArea,
  type UIMessage,
  type QuickAction,
  type ToolCallStatus,
} from '@usetheo/ui'
import { Sparkles, Wrench, Calculator, Clock, Globe, RotateCcw } from 'lucide-react'
import { useAgentStream } from 'theokit/client'

/**
 * TheoKit OpenRouter demo — the canonical chat surface.
 *
 * • useAgentStream  → SSE consumption + auto-CSRF + AbortController cleanup
 * • ChatThread      → conversation rendering
 * • ToolCallCard    → expandable tool invocations (one per call/result event)
 * • AgentStreaming  → typing indicator while LLM streams tokens
 * • AgentErrorCard  → typed error rendering with retry CTA
 */

type Item =
  | { kind: 'message'; id: string; role: 'user' | 'assistant'; content: string; ts: string }
  | {
      kind: 'tool'
      id: string
      tool: string
      target?: string
      status: ToolCallStatus
      output?: string
      ts: string
    }
  | { kind: 'error'; id: string; message: string; ts: string }

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'time', label: 'What time is it?', icon: Clock },
  { id: 'calc', label: 'Calculate (12.5 * 8) + 100', icon: Calculator },
  { id: 'fetch', label: 'Fetch the latest TC39 proposals', icon: Globe },
  { id: 'reset', label: 'Start a new conversation', icon: RotateCcw },
]

// Modern chat UX: only the assistant carries an avatar. User messages are
// right-aligned with a distinct bubble style — that's enough signal.
// (TheoUI's ChatMessage uses flex-col, so a user avatar would land BELOW
// the bubble, not above — visually unusual.)
const ASSISTANT_AVATAR = (
  <Avatar size="sm" tone="primary">
    <Avatar.Fallback>AI</Avatar.Fallback>
  </Avatar>
)

export default function Page(): React.ReactElement {
  const [composer, setComposer] = useState('')
  const [userItems, setUserItems] = useState<Item[]>([])
  const { events, send, status, reset } = useAgentStream<{ message: string }>('/api/chat')

  const items = useMemo<Item[]>(() => {
    const ts = new Date().toISOString()
    const agentItems: Item[] = events.map((event, i) => {
      const id = `e-${i.toString()}`
      switch (event.type) {
        case 'message':
          return { kind: 'message', id, role: 'assistant', content: event.content, ts }
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
            ts,
          }
        case 'tool_result':
          return {
            kind: 'tool',
            id,
            tool: event.name,
            status: 'success',
            output:
              typeof event.data === 'string' ? event.data : JSON.stringify(event.data, null, 2),
            ts,
          }
        case 'error':
          return { kind: 'error', id, message: event.message, ts }
      }
    })
    return [...userItems, ...agentItems]
  }, [userItems, events])

  function submit(value: string): void {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    const id = `u-${userItems.length.toString()}`
    setUserItems((prev) => [
      ...prev,
      { kind: 'message', id, role: 'user', content: trimmed, ts: new Date().toISOString() },
    ])
    send({ message: trimmed })
    setComposer('')
  }

  function handleQuickAction(id: string): void {
    if (id === 'reset') {
      setUserItems([])
      reset()
      return
    }
    const action = QUICK_ACTIONS.find((a) => a.id === id)
    if (action !== undefined && typeof action.label === 'string') {
      submit(action.label)
    }
  }

  const isStreaming = status === 'streaming'
  const hasError = status === 'error'
  const isEmpty = items.length === 0 && !isStreaming

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
          {isEmpty ? (
            <EmptyState
              eyebrow="OpenRouter"
              icon={Sparkles}
              title="Ask anything — try a tool!"
              description="This demo wires OpenRouter to TheoKit. Three tools are loaded: current_time, calculator, web_fetch. Pick a quick action below or type your own."
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
                      timestamp={item.ts}
                    />
                  )
                }
                return (
                  <AgentErrorCard
                    key={item.id}
                    kind="generic"
                    title="Agent error"
                    detail={item.message}
                  />
                )
              })}
              {isStreaming && <AgentStreaming model="openai/gpt-4o-mini" />}
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
                title="Stream interrupted"
                detail="The connection to the agent ended unexpectedly. Reset to try again."
                actions={
                  <Button variant="ghost" size="sm" onClick={() => reset()}>
                    Reset
                  </Button>
                }
              />
            </div>
          )}
          <ChatComposer
            value={composer}
            onValueChange={setComposer}
            onSubmit={submit}
            running={isStreaming}
            placeholder="Ask anything — try 'what time is it?' or 'calculate 12 + 30'…"
          />
        </div>
      </div>
    </div>
  )
}
