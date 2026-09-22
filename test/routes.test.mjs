import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { apply, DEFAULT_CONFIG, ROUTES } from '../lib/index.js'
import { makeRoutes } from '../lib/routes.js'
import { VERSION } from '../lib/version.js'
import { isLoopback, isTrustedRequest } from '../lib/trust.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A monitor stub with a fixed snapshot and call counters. */
function stubMonitor(overrides = {}) {
  const calls = { refresh: 0 }
  const snapshot = {
    ts: 1_700_000_000_000,
    host: { hostname: 'stub-host', platform: 'win32', arch: 'x64', uptimeSec: 10, pid: 1 },
    cpu: { usage: 12.5, perCore: [12.5], cores: 1, model: 'Stub', speedMHz: 1000, temperature: 50, temperatureSource: 'stub', temperatureZones: [] },
    memory: { totalBytes: 100, freeBytes: 50, usedBytes: 50, usage: 50 },
    gpus: [],
    gpuSource: 'none',
    errors: [],
    ticks: 1,
  }
  return {
    calls,
    config: { tickMs: 1000, gpuMs: 1500, cpuTemperatureMs: 5000, gpu: true, cpuTemperature: true },
    snapshot: () => snapshot,
    async refresh() {
      calls.refresh += 1
      return snapshot
    },
    start: () => () => {},
    stop: () => {},
    ...overrides,
  }
}

/** A `ServerResponse` stand-in that records what the handler wrote. */
function createRes() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    end(text) {
      this.body = text
    },
    json() {
      return this.body === null ? null : JSON.parse(this.body)
    },
  }
}

/** An `IncomingMessage` stand-in. */
function createReq({ method = 'GET', url = '/', address = '127.0.0.1', headers = {} } = {}) {
  return { method, url, headers, socket: { remoteAddress: address } }
}

/** Resolve a route by path and drive it once. */
async function call(routes, path, request) {
  const route = routes.find((candidate) => candidate.path === path)
  assert.ok(route, `no route registered for ${path}`)
  const res = createRes()
  await route.handler(request, res)
  return res
}

/** Build a context that captures registrations and effects. */
function createCtx() {
  const routes = []
  const effects = []
  return {
    routes,
    effects,
    logger: { info() {}, warn() {}, error() {} },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
  }
}

test('isLoopback accepts only real loopback peers', () => {
  for (const address of ['127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1']) {
    assert.equal(isLoopback(address), true, `${address} is loopback`)
  }
  for (const address of ['192.168.1.10', '10.0.0.1', '::ffff:192.168.1.10', '0.0.0.0', 'fe80::1', undefined, null, 42]) {
    assert.equal(isLoopback(address), false, `${String(address)} is not loopback`)
  }
})

test('a forwarded-address header disqualifies an otherwise local request', () => {
  const local = createReq()
  assert.equal(isTrustedRequest(local), true)
  for (const header of ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host']) {
    assert.equal(isTrustedRequest(createReq({ headers: { [header]: '203.0.113.9' } })), false, header)
  }
  assert.equal(isTrustedRequest(createReq({ address: '10.1.2.3' })), false)
  assert.equal(isTrustedRequest(null), false)
})

test('the routes live at the documented paths', () => {
  const routes = makeRoutes(createCtx(), { monitor: stubMonitor(), config: DEFAULT_CONFIG })
  assert.deepEqual(
    routes.map((route) => route.path).sort(),
    [ROUTES.health, ROUTES.snapshot].sort()
  )
  assert.ok(routes.every((route) => route.kind === 'exact'))
})

test('the client bundle polls the exact path the host registers', async () => {
  const bundle = await readFile(resolve(root, 'lib/client.js'), 'utf8')
  assert.ok(
    bundle.includes(`"${ROUTES.snapshot}"`),
    `lib/client.js must poll ${ROUTES.snapshot}; rebuild with \`npm run build\``
  )
  assert.ok(bundle.includes(`"${ROUTES.snapshot}?refresh=1"`) || bundle.includes('?refresh=1'))
})

test('health reports the plugin identity without touching hardware', async () => {
  const routes = makeRoutes(createCtx(), { monitor: stubMonitor(), config: DEFAULT_CONFIG })
  const res = await call(routes, ROUTES.health, createReq({ url: ROUTES.health }))

  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  const body = res.json()
  assert.equal(body.ok, true)
  assert.equal(body.plugin, 'dsh-system-monitor')
  assert.equal(body.version, VERSION)
  assert.equal(body.platform, process.platform)
})

test('snapshot serves the cached sample and never reads hardware itself', async () => {
  const monitor = stubMonitor()
  const routes = makeRoutes(createCtx(), { monitor, config: DEFAULT_CONFIG })
  const res = await call(routes, ROUTES.snapshot, createReq({ url: ROUTES.snapshot }))

  assert.equal(res.statusCode, 200)
  assert.equal(monitor.calls.refresh, 0, 'a plain poll must reuse the cached sample')
  const body = res.json()
  assert.equal(body.ok, true)
  assert.equal(body.version, VERSION)
  assert.equal(body.host.hostname, 'stub-host')
  assert.equal(body.cpu.usage, 12.5)
  assert.equal(body.memory.usage, 50)
})

test('?refresh=1 forces a fresh sample', async () => {
  const monitor = stubMonitor()
  const routes = makeRoutes(createCtx(), { monitor, config: DEFAULT_CONFIG })
  const res = await call(routes, ROUTES.snapshot, createReq({ url: `${ROUTES.snapshot}?refresh=1` }))

  assert.equal(res.statusCode, 200)
  assert.equal(monitor.calls.refresh, 1)
})

test('refresh can be disabled by config', async () => {
  const monitor = stubMonitor()
  const routes = makeRoutes(createCtx(), { monitor, config: { ...DEFAULT_CONFIG, allowRefresh: false } })
  const res = await call(routes, ROUTES.snapshot, createReq({ url: `${ROUTES.snapshot}?refresh=1` }))

  assert.equal(res.statusCode, 403)
  assert.equal(monitor.calls.refresh, 0)
})

test('a LAN peer gets 403 and learns nothing about the host', async () => {
  const routes = makeRoutes(createCtx(), { monitor: stubMonitor(), config: DEFAULT_CONFIG })
  const res = await call(routes, ROUTES.snapshot, createReq({ url: ROUTES.snapshot, address: '192.168.1.50' }))

  assert.equal(res.statusCode, 403)
  assert.doesNotMatch(res.body, /stub-host/, 'a refused request must not leak host inventory')
  assert.match(res.json().error, /loopback/)
})

test('non-GET methods are refused before anything else', async () => {
  const monitor = stubMonitor()
  const routes = makeRoutes(createCtx(), { monitor, config: DEFAULT_CONFIG })
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    const res = await call(routes, ROUTES.snapshot, createReq({ method, url: ROUTES.snapshot }))
    assert.equal(res.statusCode, 405, method)
    assert.equal(res.headers.allow, 'GET')
  }
  assert.equal(monitor.calls.refresh, 0)
})

test('a monitor failure becomes a 500 rather than a crash', async () => {
  const warnings = []
  const ctx = createCtx()
  ctx.logger.warn = (error) => warnings.push(error)
  const monitor = stubMonitor({
    async refresh() {
      throw new Error('sampler offline')
    },
  })
  const routes = makeRoutes(ctx, { monitor, config: DEFAULT_CONFIG })
  const res = await call(routes, ROUTES.snapshot, createReq({ url: `${ROUTES.snapshot}?refresh=1` }))

  assert.equal(res.statusCode, 500)
  assert.equal(res.json().ok, false)
  assert.match(res.json().error, /sampler offline/)
  assert.equal(warnings.length, 1, 'the failure must be logged')
})

test('apply registers both routes and its effect removes them again', () => {
  const ctx = createCtx()
  // Probing is switched off so the test never spawns a hardware tool.
  apply(ctx, { ...DEFAULT_CONFIG, gpu: false, cpuTemperature: false, tickMs: 3_600_000 })

  assert.deepEqual(
    ctx.routes.map((route) => route.path).sort(),
    [ROUTES.health, ROUTES.snapshot].sort()
  )
  assert.equal(ctx.effects.length, 2, 'one effect for the sampler, one for the routes')

  for (const dispose of ctx.effects) dispose?.()
  assert.equal(ctx.routes.length, 0, 'disposal must unregister every route')
})

test('apply is a no-op when the plugin is disabled', () => {
  const ctx = createCtx()
  apply(ctx, { ...DEFAULT_CONFIG, enabled: false })
  assert.equal(ctx.routes.length, 0)
  assert.equal(ctx.effects.length, 0)
})
