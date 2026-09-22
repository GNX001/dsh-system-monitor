import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_OPTIONS,
  buildViewModel,
  clampTilePosition,
  createOptionsStore,
  createSafeStorage,
  defaultTilePosition,
  detectTheme,
  formatBytes,
  formatPercent,
  formatTemperature,
  formatWatts,
  loadOptions,
  normalizeOptions,
  normalizePosition,
  parseCssColor,
  relativeLuminance,
  severityOf,
  shortCpuName,
  shortGpuName,
  temperatureSeverity,
  INTERVAL_CHOICES,
  STORAGE_KEY,
} from '../src/client/model.js'
import { bindDictionary, en, format, zh } from '../src/client/locales.js'

/** A `localStorage` stand-in backed by a Map. */
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
  }
}

test('normalizeOptions clamps, coerces, and drops unknown keys', () => {
  const options = normalizeOptions({
    intervalMs: 10,
    opacity: 5,
    enabled: 'yes',
    collapsed: true,
    position: { x: 10.4, y: -3 },
    bogus: 'ignored',
  })
  assert.equal(options.intervalMs, 500, 'below the floor clamps up')
  assert.equal(options.opacity, 1, 'above the ceiling clamps down')
  assert.equal(options.enabled, true, 'non-boolean falls back to the default')
  assert.equal(options.collapsed, true)
  assert.deepEqual(options.position, { x: 10, y: -3 })
  assert.equal('bogus' in options, false)
})

test('normalizeOptions survives garbage without throwing', () => {
  for (const input of [null, undefined, 42, 'nope', [], { intervalMs: 'abc' }]) {
    const options = normalizeOptions(input)
    assert.equal(options.intervalMs, DEFAULT_OPTIONS.intervalMs)
    assert.equal(options.enabled, true)
  }
})

test('normalizePosition accepts only finite pairs', () => {
  assert.deepEqual(normalizePosition({ x: 1, y: 2 }), { x: 1, y: 2 })
  assert.equal(normalizePosition({ x: Number.NaN, y: 2 }), null)
  assert.equal(normalizePosition({ x: 1 }), null)
  assert.equal(normalizePosition('1,2'), null)
  assert.equal(normalizePosition(null), null)
})

test('options round-trip through storage, and corruption falls back to defaults', () => {
  const storage = memoryStorage()
  const store = createOptionsStore({ storage })
  store.set({ intervalMs: 3000, showPower: true, position: { x: 40, y: 50 } })

  const reloaded = loadOptions(storage)
  assert.equal(reloaded.intervalMs, 3000)
  assert.equal(reloaded.showPower, true)
  assert.deepEqual(reloaded.position, { x: 40, y: 50 })

  storage.setItem(STORAGE_KEY, '{not json')
  assert.deepEqual(loadOptions(storage), { ...DEFAULT_OPTIONS })
})

test('the options store notifies subscribers only on a real change', () => {
  const store = createOptionsStore({ storage: memoryStorage() })
  let notifications = 0
  const unsubscribe = store.subscribe(() => {
    notifications += 1
  })

  store.set({ intervalMs: 2000 })
  assert.equal(notifications, 1)
  store.set({ intervalMs: 2000 })
  assert.equal(notifications, 1, 'a no-op patch must not re-render every consumer')

  unsubscribe()
  store.set({ intervalMs: 3000 })
  assert.equal(notifications, 1)
})

test('reset restores defaults and re-enables the tile', () => {
  const store = createOptionsStore({ storage: memoryStorage() })
  store.set({ enabled: false, intervalMs: 9000, position: { x: 1, y: 1 } })
  store.reset()
  assert.equal(store.getSnapshot().enabled, true)
  assert.equal(store.getSnapshot().intervalMs, DEFAULT_OPTIONS.intervalMs)
  assert.equal(store.getSnapshot().position, null)
})

test('a storage that throws is degraded, not propagated', () => {
  const hostile = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('quota')
    },
    removeItem() {
      throw new Error('blocked')
    },
  }
  const storage = createSafeStorage(hostile)
  const store = createOptionsStore({ storage })
  assert.doesNotThrow(() => store.set({ intervalMs: 2500 }))
  assert.equal(store.getSnapshot().intervalMs, 2500, 'the in-memory copy still works')
})

test('formatters match system-monitor conventions', () => {
  assert.equal(formatBytes(32 * 1024 ** 3), '32.0 GB')
  assert.equal(formatBytes(20.5 * 1024 ** 3), '20.5 GB')
  assert.equal(formatBytes(512 * 1024 ** 2), '512 MB')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(Number.NaN), null)
  assert.equal(formatBytes(-1), null)

  assert.equal(formatPercent(23.4), '23%')
  assert.equal(formatPercent(7.5), '7.5%')
  assert.equal(formatPercent(0), '0%')
  assert.equal(formatPercent(140), '100%')
  assert.equal(formatPercent(null), null)

  assert.equal(formatTemperature(47.2), '47.2°C')
  assert.equal(formatTemperature(94.0), '94°C')
  assert.equal(formatTemperature(null), null)
  assert.equal(formatWatts(18.36), '18.4 W')
  assert.equal(formatWatts(120), '120 W')
})

test('severity buckets are staged, not binary', () => {
  assert.equal(severityOf(10), 'ok')
  assert.equal(severityOf(70), 'warn')
  assert.equal(severityOf(90), 'hot')
  assert.equal(severityOf(null), 'unknown')
  assert.equal(temperatureSeverity(50), 'ok')
  assert.equal(temperatureSeverity(75), 'warn')
  assert.equal(temperatureSeverity(90), 'hot')
  assert.equal(temperatureSeverity(undefined), 'unknown')
})

test('marketing names are shortened for a narrow tile', () => {
  assert.equal(shortCpuName('AMD Ryzen 7 8845HS w/ Radeon 780M Graphics'), 'Ryzen 7 8845HS')
  assert.equal(shortCpuName('Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz'), 'Core i7-9750H')
  assert.equal(shortCpuName('Apple M3 Pro'), 'M3 Pro')
  assert.equal(shortCpuName(''), null)
  assert.equal(shortCpuName(null), null)

  assert.equal(shortGpuName('NVIDIA GeForce RTX 5070 Ti Laptop GPU'), 'RTX 5070 Ti')
  assert.equal(shortGpuName('AMD Radeon RX 7900 XTX'), 'Radeon RX 7900 XTX')
  assert.equal(shortGpuName('Intel(R) Arc(TM) A770 Graphics Adapter'), 'Arc A770')
  assert.equal(shortGpuName(''), null)
  assert.ok(shortGpuName('NVIDIA GeForce RTX 4090 Laptop GPU With An Absurdly Long Suffix').length <= 22)
})

test('CSS color parsing handles rgb/rgba/hex and rejects junk', () => {
  assert.deepEqual(parseCssColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, alpha: 1 })
  assert.deepEqual(parseCssColor('rgba(10,20,30,0.5)'), { r: 10, g: 20, b: 30, alpha: 0.5 })
  assert.deepEqual(parseCssColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, alpha: 0.5 })
  assert.deepEqual(parseCssColor('#fff'), { r: 255, g: 255, b: 255, alpha: 1 })
  assert.deepEqual(parseCssColor('#1a2b3c'), { r: 26, g: 43, b: 60, alpha: 1 })
  for (const junk of ['', 'transparent', 'var(--x)', null, undefined, 'rgb(1,2)']) {
    assert.equal(parseCssColor(junk), null, String(junk))
  }
  assert.ok(relativeLuminance({ r: 255, g: 255, b: 255 }) > 0.99)
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0)
})

test('theme detection prefers an explicit marker over the OS preference', () => {
  const makeDoc = ({ marker = null, bodyBackground = 'rgb(255,255,255)', prefersDark = false }) => ({
    documentElement: {
      getAttribute: (name) => (name === 'data-theme' ? marker : null),
      className: '',
    },
    body: {},
    defaultView: {
      getComputedStyle: () => ({ backgroundColor: bodyBackground }),
      matchMedia: () => ({ matches: prefersDark }),
    },
  })

  assert.equal(detectTheme(makeDoc({ marker: 'dark' })), 'dark')
  assert.equal(detectTheme(makeDoc({ marker: 'light', prefersDark: true })), 'light')
  assert.equal(detectTheme(makeDoc({ bodyBackground: 'rgb(20, 20, 20)' })), 'dark')
  assert.equal(detectTheme(makeDoc({ bodyBackground: 'rgb(250, 250, 250)' })), 'light')
  // A transparent body tells us nothing, so the OS preference decides.
  assert.equal(detectTheme(makeDoc({ bodyBackground: 'rgba(0, 0, 0, 0)', prefersDark: true })), 'dark')
  assert.equal(detectTheme(undefined), 'light')
})

test('tile geometry keeps the tile inside the viewport', () => {
  const viewport = { width: 1200, height: 800 }
  const size = { width: 268, height: 200 }

  assert.deepEqual(clampTilePosition({ x: -50, y: -50 }, size, viewport), { x: 4, y: 4 })
  assert.deepEqual(clampTilePosition({ x: 9999, y: 9999 }, size, viewport), { x: 928, y: 596 })

  const resting = defaultTilePosition(size, viewport)
  assert.equal(resting.x, 1200 - 268 - 20)
  assert.equal(resting.y, 76)
  // A viewport narrower than the tile must not produce a negative coordinate.
  const tiny = defaultTilePosition(size, { width: 200, height: 150 })
  assert.equal(tiny.x, 4)
  assert.equal(tiny.y, 4)
})

/** A representative snapshot with two GPUs. */
function sampleSnapshot() {
  return {
    ts: Date.UTC(2026, 0, 2, 3, 4, 5),
    host: { hostname: 'dev-box', platform: 'win32' },
    cpu: {
      usage: 23.4,
      perCore: [10, 90, 50, 0],
      cores: 4,
      model: 'AMD Ryzen 7 8845HS w/ Radeon 780M Graphics',
      speedMHz: 3800,
      temperature: 81.9,
      temperatureZones: [],
    },
    memory: { totalBytes: 32 * 1024 ** 3, usedBytes: 19.4 * 1024 ** 3, freeBytes: 12.6 * 1024 ** 3, usage: 60.6 },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU',
        usage: 42,
        temperature: 61,
        powerWatts: 88.5,
        memory: { usedBytes: 4 * 1024 ** 3, totalBytes: 12 * 1024 ** 3, usage: 33.3 },
      },
      { index: 1, name: 'AMD Radeon 780M', usage: null, temperature: null, powerWatts: null, memory: { usedBytes: null, totalBytes: null } },
    ],
    errors: [],
  }
}

test('the view model formats every row for direct rendering', () => {
  const view = buildViewModel(sampleSnapshot(), DEFAULT_OPTIONS)

  assert.equal(view.ok, true)
  assert.equal(view.rows.length, 4, 'CPU + memory + two GPUs')

  const [cpu, memory, gpu0, gpu1] = view.rows
  assert.equal(cpu.label, 'CPU')
  assert.equal(cpu.caption, 'Ryzen 7 8845HS')
  assert.equal(cpu.valueText, '23%')
  assert.equal(cpu.severity, 'ok')
  assert.deepEqual(cpu.details.map((detail) => detail.text), ['81.9°C'])

  assert.equal(memory.label, 'MEM')
  assert.equal(memory.valueText, '61%')
  assert.deepEqual(memory.details.map((detail) => detail.text), ['19.4 GB / 32.0 GB'])

  assert.equal(gpu0.label, 'GPU0', 'a multi-GPU machine numbers its rows')
  assert.equal(gpu0.caption, 'RTX 5070 Ti')
  assert.equal(gpu0.valueText, '42%')
  assert.deepEqual(gpu0.details.map((detail) => detail.text), ['61°C', '4.0 GB / 12.0 GB'])

  assert.equal(gpu1.label, 'GPU1')
  assert.equal(gpu1.percent, null)
  assert.equal(gpu1.valueText, null, 'an unknown reading renders as "no data"')
  assert.deepEqual(gpu1.details, [])
})

test('a single GPU is labelled GPU, not GPU0', () => {
  const snapshot = sampleSnapshot()
  snapshot.gpus = snapshot.gpus.slice(0, 1)
  assert.equal(buildViewModel(snapshot, DEFAULT_OPTIONS).rows[2].label, 'GPU')
})

test('the view model honors every display toggle', () => {
  const onlyMemory = buildViewModel(sampleSnapshot(), {
    ...DEFAULT_OPTIONS,
    showCpu: false,
    showGpu: false,
  })
  assert.deepEqual(onlyMemory.rows.map((row) => row.label), ['MEM'])

  const noTemperatures = buildViewModel(sampleSnapshot(), {
    ...DEFAULT_OPTIONS,
    showCpuTemperature: false,
    showGpuTemperature: false,
  })
  assert.deepEqual(noTemperatures.rows[0].details, [])
  assert.deepEqual(
    noTemperatures.rows[2].details.map((detail) => detail.text),
    ['4.0 GB / 12.0 GB'],
    'VRAM survives when only temperature is off'
  )

  const withPower = buildViewModel(sampleSnapshot(), { ...DEFAULT_OPTIONS, showPower: true })
  assert.equal(withPower.rows[2].details.at(-1).text, '88.5 W')

  const withCores = buildViewModel(sampleSnapshot(), { ...DEFAULT_OPTIONS, showPerCore: true })
  assert.deepEqual(withCores.rows[0].perCore, [10, 90, 50, 0])
  assert.equal(withCores.rows[0].cores, 4)
  assert.deepEqual(withCores.rows[0].details.map((detail) => detail.text), ['81.9°C'])

  const withoutCores = buildViewModel(sampleSnapshot(), DEFAULT_OPTIONS)
  assert.equal(withoutCores.rows[0].perCore, null)
  assert.equal(withoutCores.rows[0].cores, null)
})

test('a missing or malformed snapshot renders as "not ok" instead of throwing', () => {
  for (const input of [null, undefined, 'nope', 42]) {
    const view = buildViewModel(input, DEFAULT_OPTIONS)
    assert.equal(view.ok, false)
    assert.deepEqual(view.rows, [])
    assert.equal(view.updatedAt, null)
  }
  // Rows with a broken shape are dropped, not rendered half-built.
  const view = buildViewModel({ cpu: null, memory: 'broken', gpus: [null], errors: 'nope' }, DEFAULT_OPTIONS)
  assert.deepEqual(view.rows, [])
  assert.deepEqual(view.errors, [])
})

test('both dictionaries stay in sync and format placeholders', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  assert.equal(zh.title, '系统监视')
  assert.equal(en.title, 'System monitor')
  assert.equal(format('{n} 秒', { n: 2 }), '2 秒')
  assert.equal(format('{a} and {b}', { b: 2, a: 1 }), '1 and 2')
  assert.equal(format('no placeholders'), 'no placeholders')
  assert.equal(format('{missing}', {}), '{missing}')
  assert.equal(bindDictionary(zh)('cores', { n: 8 }), '8 核')
  assert.equal(bindDictionary(en)('doesNotExist'), 'doesNotExist')
})

test('every interval choice is inside the accepted range', () => {
  for (const choice of INTERVAL_CHOICES) {
    assert.equal(normalizeOptions({ intervalMs: choice }).intervalMs, choice)
  }
  assert.ok(INTERVAL_CHOICES.every((choice) => Number.isInteger(choice) && choice >= 1000))
})
