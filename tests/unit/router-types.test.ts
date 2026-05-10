import { describe, it, expect } from 'vitest'
import { isRouteFile } from 'theokit'

describe('isRouteFile', () => {
  it.each(['page.tsx', 'page.ts', 'page.jsx', 'page.js'])('should accept %s', (f) => {
    expect(isRouteFile(f)).toBe(true)
  })
  it.each(['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js'])('should accept %s', (f) => {
    expect(isRouteFile(f)).toBe(true)
  })
  it.each(['error.tsx', 'loading.tsx', 'not-found.tsx'])('should accept %s', (f) => {
    expect(isRouteFile(f)).toBe(true)
  })
  it.each(['utils.ts', 'page.css', 'pages.tsx', 'lay-out.tsx', '', '.gitkeep', 'page.tsx.bak'])(
    'should reject %s',
    (f) => {
      expect(isRouteFile(f)).toBe(false)
    },
  )
})
