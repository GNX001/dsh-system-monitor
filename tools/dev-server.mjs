/**
 * Development harness: mount the real host half on a scratch port and serve a
 * page that boots the real browser half.
 *
 * This exists so the plugin can be exercised against the actual machine —
 * real hardware readings, real routes, real bundle — without installing it into
 * a DSH profile and restarting the app. It is a development tool and is not
 * part of the published package.
 *
 *   npm run build && node tools/dev-server.mjs
 *   # then open the printed URL
 *
 * @module tools/dev-server
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { apply, DEFAULT_CONFIG, ROUTES, VERSION } from '../lib/index.js'
import { DEFAULT_OPTIONS, buildViewModel } from '../src/client/model.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.DSM_DEV_PORT ?? 43199)

/** Routes registered by the plugin's `apply`, plus a fallback for static files. */
const routes = []
const disposers = []

/**
 * The smallest context the host half needs: a route table, an effect collector
 * and a logger. `ctx.webServer.register` stores handlers exactly like the real
 * `WebServer` service does.
 */
const ctx = {
  logger: {
    info: (message) => console.log('[host]', message),
    warn: (error) => console.warn('[host:warn]', error?.message ?? error),
    error: (error) => console.error('[host:error]', error?.message ?? error),
  },
  webServer: {
    register(route) {
      if (routes.some((candidate) => candidate.path === route.path)) {
        throw new Error(`duplicate route ${route.path}`)
      }
      routes.push(route)
      const dispose = () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
      disposers.push(dispose)
      return dispose
    },
  },
  effect(callback) {
    const dispose = callback()
    disposers.push(typeof dispose === 'function' ? dispose : () => {})
    return dispose
  },
}

/** Vendored scripts the demo page loads, so the harness needs no bundler step. */
const VENDOR = {
  '/vendor/react.js': join(root, 'node_modules/react/umd/react.development.js'),
  '/vendor/react-dom.js': join(root, 'node_modules/react-dom/umd/react-dom.development.js'),
  '/vendor/client.js': join(root, 'lib/client.js'),
}

/**
 * Where the shell's own theme stylesheet lives on this machine.
 *
 * `@deepseek-ai/dsh-client-ui-theme` carries the real palettes: `:root` for the
 * font stack, `body` for the light theme, `body[data-ds-dark-theme]` for the
 * dark one. Inlining those exact blocks is what makes this preview honest —
 * the tile is tinted by the same declarations it will inherit inside DSH, not by
 * a copy that could drift.
 */
const THEME_CANDIDATES = [
  process.env.DSM_THEME_CLIENT,
  'E:/My_Ai_Modes/DeepSeek-Harness/DSH Desktop/resources/app/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
].filter(Boolean)

/** The two palettes the tile has to follow, with a minimal fallback. */
const FALLBACK_THEME_CSS = `
:root{}
body{--dsw-static-neutral-bluish-00:#ffffff;--dsw-static-neutral-bluish-150:#e9ecf2;--dsw-static-neutral-bluish-600:#81858c;--dsw-static-neutral-bluish-700:#61666b;--dsw-static-neutral-bluish-1000:#000000;--dsw-static-green-500:#10b981;--dsw-static-amber-500:#f59e0b;--dsw-static-red-500:#ef4444;--dsw-static-deepseek-500:#4d6bfe;--dsw-alias-bg-layer-2:var(--dsw-static-neutral-bluish-00);--dsw-alias-bg-layer-3:var(--dsw-static-neutral-bluish-00);--dsw-alias-bg-overlay:var(--dsw-static-neutral-bluish-150);--dsw-alias-label-primary:var(--dsw-static-neutral-bluish-1000);--dsw-alias-label-secondary:var(--dsw-static-neutral-bluish-700);--dsw-alias-label-tertiary:var(--dsw-static-neutral-bluish-600);--dsw-alias-border-l2:#0000001a;--dsw-alias-border-l3:#0000001f;--dsw-alias-state-success-primary:var(--dsw-static-green-500);--dsw-alias-state-warn-primary:var(--dsw-static-amber-500);--dsw-alias-state-error-primary:var(--dsw-static-red-500)}
body[data-ds-dark-theme]{--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-layer-3:#353638;--dsw-alias-bg-overlay:#61666b;--dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;--dsw-alias-border-l2:#ffffff1a;--dsw-alias-border-l3:#ffffff1f}
`

/**
 * Pull the `:root` / `body` / `body[data-ds-dark-theme]` rule blocks out of the
 * theme bundle by balancing braces, so the preview carries the palettes verbatim.
 * @returns the CSS text, or the fallback when the bundle cannot be found.
 */
async function readThemeCss() {
  for (const candidate of THEME_CANDIDATES) {
    let source
    try {
      source = await readFile(candidate, 'utf8')
    } catch {
      continue
    }
    const blocks = []
    for (const selector of [':root{', 'body{', 'body[data-ds-dark-theme]{']) {
      const start = source.indexOf(selector)
      if (start < 0) continue
      let depth = 0
      let end = -1
      for (let index = start + selector.length - 1; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        else if (source[index] === '}') {
          depth -= 1
          if (depth === 0) {
            end = index
            break
          }
        }
      }
      if (end > start) blocks.push(source.slice(start, end + 1).replaceAll('\\"', '"'))
    }
    if (blocks.length >= 2) return { css: blocks.join('\n'), source: candidate }
  }
  return { css: FALLBACK_THEME_CSS, source: null }
}

const theme = await readThemeCss()

const DEMO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dsh-system-monitor — dev harness</title>
<style>
/* The shell's real palettes, verbatim: light on body, dark on
   body[data-ds-dark-theme]. The tile inherits these exactly as it does in DSH. */
${theme.css}
body{margin:0;height:100vh;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-primary,#111);font:13px var(--dsw-font-family,ui-sans-serif,system-ui,sans-serif)}
.notes{position:fixed;left:24px;top:24px;max-width:540px;line-height:1.65}
.notes h1{font-size:15px;margin:0 0 10px}
.notes button{margin-top:10px;padding:5px 12px;border-radius:6px;font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3,#0003)}
code{background:var(--dsw-alias-bg-overlay,#0001);padding:1px 5px;border-radius:4px}
a{color:var(--dsw-alias-state-business-primary,#4d6bfe)}
</style>
</head>
<body>
<div class="notes">
  <h1>dsh-system-monitor — dev harness</h1>
  <p>This page boots the real built browser half (<code>lib/client.js</code>) against the
  real host half over <code>${ROUTES.snapshot}</code>, with the same
  <code>window.__ModuleLoader__</code> contract the DSH shell uses.</p>
  <p>The tile is in the top-right corner, tinted by DSH's own
  <code>--dsw-alias-*</code> tokens — the same palettes DSH puts on <code>body</code>
  and <code>body[data-ds-dark-theme]</code>.</p>
  <button id="toggle" type="button">Toggle dark theme</button>
  <p><a href="${ROUTES.health}">${ROUTES.health}</a> ·
     <a href="${ROUTES.snapshot}">${ROUTES.snapshot}</a></p>
</div>
<script src="/vendor/react.js"></script>
<script src="/vendor/react-dom.js"></script>
<script src="/vendor/client.js"></script>
<script>
  document.getElementById('toggle').addEventListener('click', function () {
    document.body.toggleAttribute('data-ds-dark-theme')
  })
  // Minimal stand-in for the shell's module system: the bundle only ever asks
  // for react and react-dom/client.
  window.__ModuleLoader__ = {
    load: function (definition) {
      var exports = definition.factory(function (spec) {
        if (spec === 'react') return window.React
        if (spec === 'react-dom/client') return { createRoot: window.ReactDOM.createRoot }
        if (spec === 'react-dom') return window.ReactDOM
        throw new Error('dev harness: unexpected require(' + spec + ')')
      })
      exports.apply({
        logger: console,
        effect: function (fn) { return fn() },
        // Left undefined on purpose: this exercises the bundled-dictionary path
        // the plugin uses when the DSH locale service is not in reach.
        locale: undefined,
        slots: {
          inject: function (name, fn) { return fn() },
          register: function (options) {
            console.log('[dev harness] slot registration:', options.name, options.id)
            return function () {}
          },
        },
      })
      return exports
    },
  }
</script>
</body>
</html>
`

/** Serve one static file, or 404. */
async function serveFile(res, path, contentType) {
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' })
    res.end(body)
  } catch (error) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(`not found: ${error.message}`)
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = routes.find((candidate) => candidate.path === url.pathname)
  if (route !== undefined) {
    Promise.resolve(route.handler(req, res)).catch((error) => {
      console.error('[dev-server] handler failed:', error)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
    return
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(DEMO_PAGE)
    return
  }
  if (url.pathname in VENDOR) {
    void serveFile(res, VENDOR[url.pathname], 'text/javascript; charset=utf-8')
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

// GPU/CPU-temperature probing spawns helper tools; keep the cadences as they
// are in production so the harness reflects real behaviour.
apply(ctx, { ...DEFAULT_CONFIG })

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[dev-server] http://127.0.0.1:${PORT}/  (v${VERSION})`)
  console.log(`[dev-server] routes: ${routes.map((route) => route.path).join(', ')}`)
  console.log(
    theme.source === null
      ? '[dev-server] theme: built-in fallback (set DSM_THEME_CLIENT to the shell theme bundle)'
      : `[dev-server] theme: ${theme.source}`
  )
  console.log('[dev-server] sampling once for a first reading…')
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${ROUTES.snapshot}?refresh=1`)
    const snapshot = await response.json()
    console.log(`[dev-server] snapshot status=${response.status}`)

    // Text preview of exactly what the tile paints, so the layout can be read
    // without a browser.
    const view = buildViewModel(snapshot, DEFAULT_OPTIONS)
    console.log('[dev-server] tile rows (as rendered):')
    console.log(`  ┌${'─'.repeat(58)}`)
    for (const row of view.rows) {
      const left = `${row.label.padEnd(4)}${(row.caption ?? '').padEnd(24)}`
      const right = [row.valueText ?? '—', ...row.details.map((detail) => detail.text)].join('  ')
      console.log(`  │ ${left}${right}`)
    }
    console.log(`  └${'─'.repeat(58)}`)
    if (snapshot.errors.length > 0) console.log(`[dev-server] errors: ${JSON.stringify(snapshot.errors)}`)
  } catch (error) {
    console.error('[dev-server] first snapshot failed:', error)
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[dev-server] ${signal}: shutting down`)
    for (const dispose of disposers) dispose()
    server.close(() => process.exit(0))
  })
}
