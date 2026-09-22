/**
 * End-to-end test of the shipped browser half.
 *
 * This deliberately runs the **built** `lib/client.js` inside jsdom through the
 * same `window.__ModuleLoader__.load({ id, factory })` contract the DSH shell
 * uses, with a `require` shim that only answers the modules the shell module
 * table actually provides. That covers the things a unit test of the source
 * cannot: the bundle's factory wrapper, its external `require` set, mounting
 * into the real DOM, polling, and teardown.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import { STORAGE_KEY } from '../src/client/model.js'
import { format, zh } from '../src/client/locales.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(root, 'lib/client.js')

/** Modules the shell's module table provides to a client plugin. */
const SHELL_MODULES = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'])

let dom
let React
let ReactDOMClient
let act
let bundleSource

/** Every mounted client context, so the file can be left with no live timers. */
const mounted = []

before(async () => {
  bundleSource = await readFile(bundlePath, 'utf8')

  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://127.0.0.1:43129/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })

  globalThis.window = window
  globalThis.document = window.document
  globalThis.localStorage = window.localStorage
  globalThis.MutationObserver = window.MutationObserver
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  globalThis.innerWidth = 1440
  globalThis.innerHeight = 900
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })

  React = (await import('react')).default
  ReactDOMClient = await import('react-dom/client')
  act = React.act ?? (await import('react-dom/test-utils')).act
})

after(async () => {
  // Disposing every mount stops the tile's poll interval; without it the test
  // process has no reason to exit.
  await act(async () => {
    for (const ctx of mounted) {
      for (const dispose of ctx.effects) dispose?.()
    }
  })
  mounted.length = 0
  document.body.innerHTML = ''
  dom?.window?.close()
})

/** The payload the host half serves. */
function snapshot() {
  return {
    ok: true,
    version: '0.1.0',
    ts: Date.UTC(2026, 0, 2, 3, 4, 5),
    host: { hostname: 'dev-box', platform: 'win32', arch: 'x64', uptimeSec: 3600, pid: 42 },
    cpu: { usage: 23.4, perCore: [10, 90], cores: 2, model: 'AMD Ryzen 7 8845HS w/ Radeon 780M Graphics', speedMHz: 3800, temperature: 81.9, temperatureZones: [] },
    memory: { totalBytes: 32 * 1024 ** 3, usedBytes: 19.4 * 1024 ** 3, freeBytes: 12.6 * 1024 ** 3, usage: 60.6 },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU',
        vendor: 'nvidia',
        usage: 42,
        temperature: 61,
        powerWatts: 88.5,
        memory: { usedBytes: 4 * 1024 ** 3, totalBytes: 12 * 1024 ** 3, usage: 33.3 },
      },
    ],
    gpuSource: 'nvidia-smi',
    errors: [],
    ticks: 7,
  }
}

/** Flush React and pending promises. */
const flush = () => act(async () => {
  await new Promise((resolveFlush) => setTimeout(resolveFlush, 1))
})

/**
 * Load the built bundle through a `__ModuleLoader__` shim.
 * @returns the loaded module and every `require` spec it asked for.
 */
function loadBundle() {
  const requested = []
  const requireShim = (spec) => {
    requested.push(spec)
    if (spec === 'react') return React
    if (spec === 'react-dom/client') return ReactDOMClient
    if (spec === 'react-dom') return ReactDOMClient
    throw new Error(`client-modules: require("${spec}") is not in the shell module table`)
  }

  let loaded = null
  dom.window.__ModuleLoader__ = {
    load(definition) {
      assert.equal(typeof definition.id, 'string')
      loaded = { id: definition.id, exports: definition.factory(requireShim) }
    },
  }

  // compileFunction keeps the bundle's top-level declarations out of the shared
  // global scope, so each test can load it again.
  vm.compileFunction(bundleSource, [], { filename: bundlePath })()
  assert.ok(loaded !== null, 'the bundle must call window.__ModuleLoader__.load')
  return { loaded, requested }
}

/** A client context capturing everything `apply` registers. */
function createClientCtx() {
  const effects = []
  const slotInjections = []
  const slotRegistrations = []
  let dictionaries = null
  let boundNamespace = null

  return {
    effects,
    slotInjections,
    slotRegistrations,
    get dictionaries() {
      return dictionaries
    },
    get boundNamespace() {
      return boundNamespace
    },
    logger: { info() {}, warn() {}, error() {} },
    locale: {
      register(namespace, dicts) {
        boundNamespace = namespace
        dictionaries = dicts
        return () => {}
      },
      bind(namespace) {
        assert.equal(namespace, boundNamespace)
        assert.ok(dictionaries, 'bind must follow register')
        // Resolve through the plugin's own dictionaries, so a missing key shows up.
        return (key, params) => format(dictionaries.zh[key] ?? key, params)
      },
    },
    slots: {
      inject(name, callback) {
        slotInjections.push(name)
        return callback()
      },
      register(options, component) {
        slotRegistrations.push({ options, component })
        return () => {}
      },
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return dispose
    },
  }
}

/** Mount the tile against a stubbed host route. */
async function mount({ options, payload = snapshot(), status = 200 } = {}) {
  document.body.innerHTML = ''
  window.localStorage.clear()
  if (options !== undefined) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options))

  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (status !== 200) return { ok: false, status, json: async () => null }
    return { ok: true, status: 200, json: async () => structuredClone(payload) }
  }

  const { loaded, requested } = loadBundle()
  const ctx = createClientCtx()
  await act(async () => {
    loaded.exports.apply(ctx)
  })
  await flush()
  mounted.push(ctx)

  return {
    exports: loaded.exports,
    requested,
    ctx,
    calls,
    container: document.getElementById('dsh-system-monitor-root'),
    tile: () => document.querySelector('.dsm-tile'),
    text: () => document.querySelector('.dsm-body')?.textContent ?? '',
  }
}

/** Click one of the header buttons. */
async function click(element) {
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

test('the bundle declares the module-loader id and the runtime services it needs', async () => {
  const { loaded, requested } = loadBundle()
  assert.equal(loaded.id, 'dsh-system-monitor')
  assert.deepEqual(loaded.exports.inject, ['slots', 'locale'])
  assert.equal(typeof loaded.exports.apply, 'function')
  assert.equal(typeof loaded.exports.fetchSnapshot, 'function')
  assert.deepEqual(
    [...new Set(requested)].sort(),
    ['react', 'react-dom/client'],
    'the bundle must only require modules the shell actually provides'
  )
  for (const spec of requested) assert.ok(SHELL_MODULES.has(spec), spec)
})

test('the tile mounts into the document body and renders real readings', async () => {
  const { container, tile, text } = await mount()

  assert.ok(container, 'a body-attached container is created')
  assert.ok(tile(), 'the tile is rendered')
  assert.equal(document.querySelector('.dsm-title').textContent, '系统监视')

  for (const label of ['CPU', 'MEM', 'GPU']) {
    assert.ok(
      [...document.querySelectorAll('.dsm-label')].some((node) => node.textContent === label),
      `missing the ${label} row`
    )
  }
  assert.match(text(), /23%/, 'CPU utilization')
  assert.match(text(), /61%/, 'memory utilization')
  assert.match(text(), /42%/, 'GPU utilization')
  assert.match(text(), /81\.9°C/, 'CPU temperature')
  assert.match(text(), /61°C/, 'GPU temperature')
  assert.match(text(), /19\.4\/32\.0 GB/, 'memory size')
  assert.match(text(), /4\.0\/12\.0 GB/, 'VRAM')
  assert.match(text(), /Ryzen 7 8845HS/, 'shortened CPU name')
  assert.match(text(), /RTX 5070 Ti/, 'shortened GPU name')
  assert.match(text(), /dev-box/, 'the footer names the host')
})

test('the tile renders text only — no bar or progress widget', async () => {
  const { tile } = await mount()

  // The user asked for a pure readout; a progress bar is the obvious way for one
  // to creep back in, so assert on both the markup and the stylesheet.
  assert.equal(tile().querySelectorAll('[role="progressbar"]').length, 0)
  for (const selector of ['.dsm-bar', '.dsm-bar-fill', '.dsm-cores', '.dsm-core']) {
    assert.equal(tile().querySelectorAll(selector).length, 0, `${selector} must not exist`)
  }
  const css = document.getElementById('dsh-system-monitor-styles').textContent
  assert.doesNotMatch(css, /dsm-bar/, 'no bar rules may ship')
  assert.doesNotMatch(css, /width:\s*\d+%/, 'no percentage-width fill may ship')
})

test('the tile colors itself from DSH theme tokens, so a theme switch follows', async () => {
  await mount()
  const css = document.getElementById('dsh-system-monitor-styles').textContent

  // Every themed color must resolve through a --dsw-alias-* token with a literal
  // fallback, which is what makes the tile follow Catppuccin, neu-theme, and the
  // built-in light/dark switch without any JavaScript.
  for (const token of [
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-border-l2',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-error-primary',
  ]) {
    assert.ok(css.includes(`var(${token}`), `missing a var() reference to ${token}`)
  }
  // A hardcoded palette is the bug this replaced: no bare hex surface.
  assert.doesNotMatch(css, /--dsm-bg:#/, 'the surface must come from a token, not a hex literal')

  // And the stacking level has to sit between conversation content and DSH's
  // own menu/modal layer.
  const zIndex = Number(/z-index:(\d+)/.exec(css)?.[1])
  assert.ok(Number.isFinite(zIndex), 'the tile must declare an explicit z-index')
  assert.ok(zIndex > 12, `z-index ${zIndex} would be covered by a code block`)
  assert.ok(zIndex < 1000, `z-index ${zIndex} would cover DSH menus`)
})

test('the tile polls the host route and only forces a re-probe on demand', async () => {
  const { calls, tile } = await mount({ options: { intervalMs: 600 } })

  assert.equal(calls.length, 1)
  assert.equal(calls[0], '/api/dsh-system-monitor/snapshot', 'the first poll reuses the cached sample')

  // The wait is wrapped in act so the interval-driven state update is flushed
  // the way a real render would be.
  await act(async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 800))
  })
  await flush()
  assert.ok(calls.length >= 2, `the tile must keep polling, saw ${calls.length} requests`)
  assert.equal(calls[1], '/api/dsh-system-monitor/snapshot')

  const refresh = tile().querySelectorAll('.dsm-head .dsm-btn')[0]
  await click(refresh)
  assert.equal(calls.at(-1), '/api/dsh-system-monitor/snapshot?refresh=1', 'the refresh button forces a re-probe')
})

test('an unreachable host shows the offline state instead of an empty tile', async () => {
  const { text, tile } = await mount({ status: 500 })
  assert.match(text(), /宿主插件未响应/)
  assert.ok(tile().querySelector('.dsm-note.dsm-err'))
  assert.equal(tile().querySelector('.dsm-dot').getAttribute('data-status'), 'error')
})

test('collapse hides the body, and double-clicking the header toggles it back', async () => {
  const { tile } = await mount()
  assert.ok(tile().querySelector('.dsm-body'))

  await click(tile().querySelectorAll('.dsm-head .dsm-btn')[1])
  assert.equal(tile().querySelector('.dsm-body'), null, 'collapsed hides the rows')

  await act(async () => {
    tile().querySelector('.dsm-head').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }))
  })
  await flush()
  assert.ok(tile().querySelector('.dsm-body'), 'double-click restores the rows')
})

test('hiding the tile removes it and persists the choice', async () => {
  const { tile } = await mount()
  assert.ok(tile())

  await click(tile().querySelectorAll('.dsm-head .dsm-btn')[2])
  assert.equal(document.querySelector('.dsm-tile'), null, 'a hidden tile renders nothing')
  assert.match(window.localStorage.getItem(STORAGE_KEY), /"enabled":false/)
})

test('a theme switch needs no re-render: the body attribute tints the tile', async () => {
  const { tile } = await mount()
  const css = document.getElementById('dsh-system-monitor-styles').textContent

  // DSH puts the dark palette on body[data-ds-dark-theme] and the light one on
  // body. Both are ancestors of the tile, so flipping the attribute re-resolves
  // every var() with the tile untouched — no listener, no re-render.
  document.body.setAttribute('data-ds-dark-theme', '')
  assert.ok(document.body.contains(tile()), 'the tile lives under body, where the tokens are declared')
  assert.ok(
    css.includes('--dsm-bg:var(--dsw-alias-bg-layer-2'),
    'the surface must be a token reference so both palettes apply'
  )
  document.body.removeAttribute('data-ds-dark-theme')
})

test('the stylesheet is injected exactly once across mounts', async () => {
  await mount()
  await mount()
  assert.equal(document.querySelectorAll('#dsh-system-monitor-styles').length, 1)
})

test('the settings section registers with a label and renders every toggle', async () => {
  const { ctx } = await mount()

  assert.deepEqual(ctx.slotInjections, ['settings.section'])
  assert.equal(ctx.slotRegistrations.length, 1)
  const [{ options, component }] = ctx.slotRegistrations
  assert.equal(options.name, 'settings.section')
  assert.equal(options.id, 'system-monitor')
  assert.equal(typeof options.order, 'number')
  assert.equal(options.label(), '系统监视磁贴')

  const props = options.inject()
  assert.equal(typeof props.t, 'function')
  assert.equal(typeof props.store.getSnapshot, 'function')

  const host = document.createElement('div')
  document.body.appendChild(host)
  const settingsRoot = ReactDOMClient.createRoot(host)
  await act(async () => {
    settingsRoot.render(React.createElement(component, props))
  })
  await flush()

  const checkboxes = host.querySelectorAll('input[type="checkbox"]')
  assert.ok(checkboxes.length >= 9, `expected the option toggles, got ${checkboxes.length}`)
  assert.ok(host.querySelector('select'), 'the refresh-interval select is rendered')
  assert.ok(host.querySelector('input[type="range"]'), 'the opacity slider is rendered')
  assert.match(host.textContent, /显示悬浮磁贴/)

  // Flipping a toggle in Settings must reach the same store the tile reads.
  // The checkbox starts checked, so a real click unchecks it.
  const enable = checkboxes[0]
  assert.equal(enable.checked, true)
  await click(enable)
  assert.equal(props.store.getSnapshot().enabled, false)

  await act(async () => {
    settingsRoot.unmount()
  })
  host.remove()
})

test('disposal unmounts the tile and removes its container', async () => {
  const { ctx, container } = await mount()
  assert.ok(container)
  await act(async () => {
    for (const dispose of ctx.effects) dispose?.()
  })
  assert.equal(document.getElementById('dsh-system-monitor-root'), null)
  assert.equal(document.querySelector('.dsm-tile'), null)
})

test('the locale service dictionaries cover both languages', async () => {
  const { ctx } = await mount()
  assert.deepEqual(Object.keys(ctx.dictionaries).sort(), ['en', 'zh'])
  assert.equal(ctx.dictionaries.zh.title, zh.title)
  for (const [key, value] of Object.entries(ctx.dictionaries.zh)) {
    assert.equal(typeof value, 'string', key)
    assert.ok(key in ctx.dictionaries.en, `${key} is missing from the English dictionary`)
  }
})
