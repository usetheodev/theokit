/**
 * T4.2 — localStorage persistence unit tests.
 *
 * EC-21: version key shipped from v0 — version mismatch returns {}.
 * EC-29: per-key try/catch — corrupt single key does NOT reset all.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEYS,
  loadFromStorage,
  writeToStorage,
} from '../../packages/theo/src/devtools/persistence.js'
import { STORAGE_VERSION } from '../../packages/theo/src/devtools/shared.js'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null
  }
}

const originalLS = globalThis.localStorage

function installLocalStorage(): MemoryStorage {
  const ls = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  return ls
}

beforeEach(() => {
  installLocalStorage()
})

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: originalLS, configurable: true })
})

describe('writeToStorage + loadFromStorage round-trip', () => {
  it('writes all 5 preference keys + version key', () => {
    writeToStorage({
      position: 'top-left',
      theme: 'dark',
      open: true,
      activeTab: 'errors',
      visible: false,
    })
    expect(localStorage.getItem(STORAGE_KEYS.version)).toBe(String(STORAGE_VERSION))
    expect(localStorage.getItem(STORAGE_KEYS.position)).toBe('"top-left"')
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('"dark"')
    expect(localStorage.getItem(STORAGE_KEYS.open)).toBe('true')
    expect(localStorage.getItem(STORAGE_KEYS.activeTab)).toBe('"errors"')
    expect(localStorage.getItem(STORAGE_KEYS.visible)).toBe('false')
  })

  it('round-trip restores all fields', () => {
    writeToStorage({
      position: 'top-right',
      theme: 'light',
      open: true,
      activeTab: 'routes',
      visible: true,
    })
    expect(loadFromStorage()).toEqual({
      position: 'top-right',
      theme: 'light',
      open: true,
      activeTab: 'routes',
      visible: true,
    })
  })
})

describe('EC-21 — version key gating', () => {
  it('returns {} when version key is absent', () => {
    localStorage.setItem(STORAGE_KEYS.position, '"top-left"')
    expect(loadFromStorage()).toEqual({})
  })

  it('returns {} when version key mismatches', () => {
    localStorage.setItem(STORAGE_KEYS.version, '999')
    localStorage.setItem(STORAGE_KEYS.position, '"top-left"')
    expect(loadFromStorage()).toEqual({})
  })

  it('returns valid fields when version key matches', () => {
    localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION))
    localStorage.setItem(STORAGE_KEYS.position, '"top-left"')
    expect(loadFromStorage()).toEqual({ position: 'top-left' })
  })
})

describe('EC-29 — per-key isolation', () => {
  it('corrupt position key does NOT prevent theme from loading', () => {
    localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION))
    localStorage.setItem(STORAGE_KEYS.position, '{not valid json')
    localStorage.setItem(STORAGE_KEYS.theme, '"dark"')
    const loaded = loadFromStorage()
    expect(loaded.theme).toBe('dark')
    expect(loaded.position).toBeUndefined() // fell back to default
  })

  it('all keys corrupt → defaults at every position; no throw', () => {
    localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION))
    localStorage.setItem(STORAGE_KEYS.position, '{')
    localStorage.setItem(STORAGE_KEYS.theme, '{')
    localStorage.setItem(STORAGE_KEYS.activeTab, '{')
    localStorage.setItem(STORAGE_KEYS.open, '{')
    localStorage.setItem(STORAGE_KEYS.visible, '{')
    expect(() => loadFromStorage()).not.toThrow()
    expect(loadFromStorage()).toEqual({})
  })

  it('rejects invalid position values via schema check', () => {
    localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION))
    localStorage.setItem(STORAGE_KEYS.position, '"middle"')
    const loaded = loadFromStorage()
    expect(loaded.position).toBeUndefined()
  })
})

describe('robustness — disabled localStorage', () => {
  it('writeToStorage no-ops if localStorage throws on setItem', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        setItem() {
          throw new Error('quota exceeded')
        },
        getItem() {
          return null
        },
      },
      configurable: true,
    })
    expect(() =>
      writeToStorage({
        position: 'top-left',
        theme: 'dark',
        open: false,
        activeTab: 'requests',
        visible: true,
      }),
    ).not.toThrow()
  })

  it('loadFromStorage returns {} when localStorage is undefined', () => {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true })
    expect(loadFromStorage()).toEqual({})
  })
})
