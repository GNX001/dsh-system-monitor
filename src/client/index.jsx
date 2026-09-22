import React from 'react'
import { createRoot } from 'react-dom/client'
import { LOCALE_NS, createOptionsStore } from './model.js'
import { CSS, STYLE_ELEMENT_ID } from './styles.js'
import { Tile } from './tile.jsx'
import { SettingsSection } from './settings.jsx'
import { bindDictionary, en, zh } from './locales.js'

/**
 * dsh-system-monitor — browser half.
 *
 * Mounts the floating tile and registers the settings panel. The host half
 * (`lib/index.js`) owns every reading; this half only polls it.
 */

/** Host route this half polls. `test/routes.test.mjs` asserts it matches lib/routes.js. */
export const SNAPSHOT_PATH = '/api/dsh-system-monitor/snapshot'

/** Runtime services required before the tile can mount. */
export const inject = ['slots', 'locale']

/** DOM id of the injected `<style>` element (also the de-dupe key). */
const CONTAINER_ID = 'dsh-system-monitor-root'

/**
 * Mount the tile and register the settings section.
 * @param ctx - client context carrying `slots`, `locale`, and `effect`.
 */
export function apply(ctx) {
  const doc = globalThis.document
  if (doc === undefined || doc === null) return

  installStyles(doc)
  const store = createOptionsStore({})
  const t = bindTranslator(ctx)
  const client = { fetchSnapshot }

  const container = doc.createElement('div')
  container.id = CONTAINER_ID
  const host = (doc.body ?? doc.documentElement)
  if (host === null) return
  host.appendChild(container)

  const root = createRoot(container)
  root.render(React.createElement(Tile, { store, t, client }))
  ctx.effect(
    () => () => {
      root.unmount()
      container.remove()
    },
    'dsh-system-monitor: tile'
  )

  ctx.effect(
    () =>
      ctx.slots?.inject?.('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'system-monitor',
            order: 60,
            label: () => t('settingsTitle'),
            inject: () => ({ store, t }),
          },
          SettingsSection
        )
      ),
    'dsh-system-monitor: settings section'
  )
}

/** Inject the stylesheet once; a second copy of the bundle reuses it. */
export function installStyles(doc) {
  if (doc.getElementById(STYLE_ELEMENT_ID) !== null) return
  const style = doc.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

/**
 * Bind the translator to the DSH locale service when it is available, and fall
 * back to a dictionary picked from the browser language when it is not — the
 * tile must render even if the locale plugin is missing.
 */
export function bindTranslator(ctx) {
  try {
    if (typeof ctx?.locale?.register === 'function' && typeof ctx?.locale?.bind === 'function') {
      ctx.effect?.(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-system-monitor: dictionaries')
      return ctx.locale.bind(LOCALE_NS)
    }
  } catch {
    /* fall through to the bundled dictionary */
  }
  const language = String(globalThis.navigator?.language ?? 'en').toLowerCase()
  return bindDictionary(language.startsWith('zh') ? zh : en)
}

/**
 * Fetch one snapshot from the host half.
 * @param force - ask the host to re-probe hardware before answering.
 * @throws when the route is missing (plugin host half not installed) or the
 *   payload is not a snapshot.
 */
export async function fetchSnapshot(force = false) {
  const url = force ? `${SNAPSHOT_PATH}?refresh=1` : SNAPSHOT_PATH
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (response.ok !== true) throw new Error(`snapshot request failed with ${response.status}`)
  const data = await response.json()
  if (data === null || typeof data !== 'object' || data.ok !== true) throw new Error('malformed snapshot payload')
  return data
}
