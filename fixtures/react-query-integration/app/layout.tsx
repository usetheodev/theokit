'use client'

import { useState, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Wrap the app in QueryClientProvider. Use `useState` (not a top-level
 * `new QueryClient()`) so React StrictMode double-mount doesn't create
 * a new client instance per render — that would defeat caching.
 */
export default function Layout({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
