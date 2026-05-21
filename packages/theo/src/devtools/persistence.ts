/**
 * T4.2 — localStorage round-trip for devtools preferences.
 *
 * - EC-21: STORAGE_VERSION key shipped from day 0. Version mismatch
 *   returns empty (defaults used) — protects against future schema drift.
 * - EC-29: per-key try/catch. Corrupt JSON in ONE key falls back to default
 *   for THAT key; other valid keys remain restored.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import {
  type DevtoolsPosition,
  type DevtoolsState,
  type DevtoolsTab,
  type DevtoolsTheme,
  STORAGE_VERSION,
} from './shared.js'

export const STORAGE_KEYS = {
  version: 'theo-devtools-storage-version',
  position: 'theo-devtools-position',
  theme: 'theo-devtools-theme',
  open: 'theo-devtools-open',
  activeTab: 'theo-devtools-active-tab',
  visible: 'theo-devtools-visible',
} as const

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/**
 * EC-29 — per-key read with isolated try/catch.
 * Corrupt JSON or missing key → fallback. Never throws.
 */
function readKey<T>(key: string, fallback: T): T {
  const ls = getLocalStorage()
  if (!ls) return fallback
  try {
    const raw = ls.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeKey(key: string, value: unknown): void {
  const ls = getLocalStorage()
  if (!ls) return
  try {
    ls.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded, private browsing, etc. — silently skip.
  }
}

export type PersistedState = Pick<
  DevtoolsState,
  'position' | 'theme' | 'open' | 'activeTab' | 'visible'
>

const VALID_POSITIONS = new Set<DevtoolsPosition>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])
const VALID_THEMES = new Set<DevtoolsTheme>(['light', 'dark', 'system'])
const VALID_TABS = new Set<DevtoolsTab>([
  'requests',
  'routes',
  'errors',
  'csrf-readiness',
  'settings',
])

function asPosition(v: unknown): DevtoolsPosition | null {
  return typeof v === 'string' && VALID_POSITIONS.has(v as DevtoolsPosition)
    ? (v as DevtoolsPosition)
    : null
}
function asTheme(v: unknown): DevtoolsTheme | null {
  return typeof v === 'string' && VALID_THEMES.has(v as DevtoolsTheme) ? (v as DevtoolsTheme) : null
}
function asTab(v: unknown): DevtoolsTab | null {
  return typeof v === 'string' && VALID_TABS.has(v as DevtoolsTab) ? (v as DevtoolsTab) : null
}
function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/**
 * Load persisted preferences from localStorage.
 *
 * EC-21: Returns {} if STORAGE_VERSION key does not match the current
 * version — defaults are used at the Overlay level. Any future major
 * version bump simply clears the slate without an explicit migration.
 *
 * EC-29: each field is read independently. Corrupt 'position' key does
 * NOT cause 'theme' to also reset.
 */
export function loadFromStorage(): Partial<PersistedState> {
  const storedVersion = readKey<number>(STORAGE_KEYS.version, 0)
  if (storedVersion !== STORAGE_VERSION) return {}

  const out: Partial<PersistedState> = {}

  const pos = asPosition(readKey<unknown>(STORAGE_KEYS.position, null))
  if (pos) out.position = pos

  const theme = asTheme(readKey<unknown>(STORAGE_KEYS.theme, null))
  if (theme) out.theme = theme

  const tab = asTab(readKey<unknown>(STORAGE_KEYS.activeTab, null))
  if (tab) out.activeTab = tab

  const open = asBool(readKey<unknown>(STORAGE_KEYS.open, null))
  if (open !== null) out.open = open

  const visible = asBool(readKey<unknown>(STORAGE_KEYS.visible, null))
  if (visible !== null) out.visible = visible

  return out
}

/**
 * Persist the current preferences. Always writes the version key first
 * so future loads can detect this schema.
 */
export function writeToStorage(s: PersistedState): void {
  writeKey(STORAGE_KEYS.version, STORAGE_VERSION)
  writeKey(STORAGE_KEYS.position, s.position)
  writeKey(STORAGE_KEYS.theme, s.theme)
  writeKey(STORAGE_KEYS.open, s.open)
  writeKey(STORAGE_KEYS.activeTab, s.activeTab)
  writeKey(STORAGE_KEYS.visible, s.visible)
}
