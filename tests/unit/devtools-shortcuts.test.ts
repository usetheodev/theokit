/**
 * T4.3 — Keyboard shortcut pure helpers.
 *
 * Component-level keyboard wiring covered via Playwright (T4.4).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { describe, expect, it } from 'vitest'
import {
  isCloseShortcut,
  isToggleVisibleShortcut,
} from '../../packages/theo/src/devtools/hooks/useShortcuts.js'

describe('isCloseShortcut', () => {
  it('matches Escape key', () => {
    expect(
      isCloseShortcut({ key: 'Escape', shiftKey: false, metaKey: false, ctrlKey: false }),
    ).toBe(true)
  })
  it('does not match other keys', () => {
    expect(isCloseShortcut({ key: 'a', shiftKey: false, metaKey: false, ctrlKey: false })).toBe(
      false,
    )
    expect(isCloseShortcut({ key: 'Enter', shiftKey: false, metaKey: false, ctrlKey: false })).toBe(
      false,
    )
  })
})

describe('isToggleVisibleShortcut', () => {
  it('matches Cmd+Shift+D on Mac', () => {
    expect(
      isToggleVisibleShortcut({ key: 'D', shiftKey: true, metaKey: true, ctrlKey: false }, true),
    ).toBe(true)
  })
  it('matches lowercase d on Mac', () => {
    expect(
      isToggleVisibleShortcut({ key: 'd', shiftKey: true, metaKey: true, ctrlKey: false }, true),
    ).toBe(true)
  })
  it('matches Ctrl+Shift+D on non-Mac', () => {
    expect(
      isToggleVisibleShortcut({ key: 'D', shiftKey: true, metaKey: false, ctrlKey: true }, false),
    ).toBe(true)
  })
  it('does NOT match Cmd+D (missing Shift)', () => {
    expect(
      isToggleVisibleShortcut({ key: 'D', shiftKey: false, metaKey: true, ctrlKey: false }, true),
    ).toBe(false)
  })
  it('does NOT match Cmd+Shift+X (wrong key)', () => {
    expect(
      isToggleVisibleShortcut({ key: 'X', shiftKey: true, metaKey: true, ctrlKey: false }, true),
    ).toBe(false)
  })
  it('does NOT match Ctrl+Shift+D on Mac (must use Cmd)', () => {
    expect(
      isToggleVisibleShortcut({ key: 'D', shiftKey: true, metaKey: false, ctrlKey: true }, true),
    ).toBe(false)
  })
})
