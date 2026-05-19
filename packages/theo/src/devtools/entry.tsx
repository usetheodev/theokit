/**
 * Devtools entry — runs in the browser, in DEV only.
 *
 * - EC-1: wrapper element has `position: absolute` so parent `body { display: flex }`
 *   does not skew the overlay layout.
 * - EC-12: custom element name namespaced as `theo-devtools-portal` to avoid collision.
 *   Guarded by `customElements.get` so HMR re-execution doesn't re-define.
 * - EC-16: singleton flag on `window.__theoDevtoolsMounted` prevents double-mount
 *   on HMR module re-run.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { Overlay } from './Overlay.js'

declare global {
  interface Window {
    __theoDevtoolsMounted?: boolean
  }
}

const PORTAL_TAG = 'theo-devtools-portal'

function definePortalElement(): void {
  if (typeof customElements === 'undefined') return
  if (customElements.get(PORTAL_TAG)) return
  customElements.define(
    PORTAL_TAG,
    class TheoDevtoolsPortal extends HTMLElement {},
  )
}

function mount(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__theoDevtoolsMounted) return
  window.__theoDevtoolsMounted = true

  definePortalElement()

  // EC-1: wrapper script-tag with position: absolute removes the wrapper from
  // a flexbox parent's layout — chip+panel float free of user app layout.
  const wrapper = document.createElement('script')
  wrapper.style.display = 'block'
  wrapper.style.position = 'absolute'
  wrapper.setAttribute('data-theo-devtools', 'true')
  wrapper.setAttribute('type', 'application/json')

  const host = document.createElement(PORTAL_TAG)
  wrapper.appendChild(host)
  document.body.appendChild(wrapper)

  const shadowRoot = host.attachShadow({ mode: 'open' })

  const reactRootHost = document.createElement('div')
  reactRootHost.setAttribute('data-theo-devtools-root', '')
  shadowRoot.appendChild(reactRootHost)

  const root = createRoot(reactRootHost)
  root.render(
    <StrictMode>
      <Overlay shadowRoot={shadowRoot} />
    </StrictMode>,
  )
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
}
