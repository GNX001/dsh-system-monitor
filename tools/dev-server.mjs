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

const DEMO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dsh-system-monitor — dev harness</title>
<style>body{margin:0;height:100vh;background:#12141a;color:#aab;font:13px ui-sans-serif,system-ui,sans-serif}
.notes{position:fixed;left:20px;top:20px;max-width:520px;line-height:1.6}
code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px}</style>
</head>
<body>
<div class="notes">
  <h1 style="font-size:15px;margin:0 0 8px">dsh-system-monitor — dev harness</h1>
  <p>This page boots the real built browser half (<code>lib/client.js</code>) against the
  real host half over <code>${ROUTES.snapshot}</code>, with the same
  <code>window.__ModuleLoader__</code> contract the DSH shell uses.</p>
  <p>The floating tile should be in the top-right corner. Drag its header.</p>
  <p><a style="color:#7aa2f7" href="${ROUTES.health}">${ROUTES.health}</a> ·
     <a style="color:#7aa2f7" href="${ROUTES.snapshot}">${ROUTES.snapshot}</a></p>
</div>
<script src="/vendor/react.js"></script>
<script src="/vendor/react-dom.js"></script>
<script src="/vendor/client.js"></script>
<script>
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
  console.log('[dev-server] sampling once for a first reading…')
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${ROUTES.snapshot}?refresh=1`)
    const snapshot = await response.json()
    console.log(`[dev-server] snapshot status=${response.status}`)
    console.log(JSON.stringify({ cpu: snapshot.cpu, memory: snapshot.memory, gpus: snapshot.gpus, gpuSource: snapshot.gpuSource, errors: snapshot.errors }, null, 2))
    logs.push(snapshot)
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
