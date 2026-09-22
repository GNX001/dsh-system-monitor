import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_OPTIONS,
  buildViewModel,
  clampTilePosition,
  createOptionsStore,
  createSafeStorage,
  defaultTilePosition,
  formatBytePair,
  formatBytes,
  formatPercent,
  formatRate,
  formatTemperature,
  formatWatts,
  loadOptions,
  normalizeOptions,
  normalizePosition,
  severityOf,
  temperatureSeverity,
  INTERVAL_CHOICES,
  STORAGE_KEY,
} from '../src/client/model.js'
import { TILE_Z_INDEX } from '../src/client/styles.js'
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
    showNetwork: false,
    position: { x: 10.4, y: -3 },
    bogus: 'ignored',
    // An option dropped in a later release is discarded, not carried forward.
    collapsed: true,
  })
  assert.equal(options.intervalMs, 500, 'below the floor clamps up')
  assert.equal(options.opacity, 1, 'above the ceiling clamps down')
  assert.equal(options.enabled, true, 'non-boolean falls back to the default')
  assert.equal(options.showNetwork, false)
  assert.deepEqual(options.position, { x: 10, y: -3 })
  assert.equal('bogus' in options, false)
  assert.equal('collapsed' in options, false, 'a removed option must not survive normalization')
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

test('a used/total pair shares one unit, so the line stays short', () => {
  assert.equal(formatBytePair(19.4 * 1024 ** 3, 32 * 1024 ** 3), '19.4/32.0 GB')
  assert.equal(formatBytePair(4 * 1024 ** 3, 12 * 1024 ** 3), '4.0/12.0 GB')
  // The reported bug: 0 bytes is not "0 KB" when the total is in GB.
  assert.equal(formatBytePair(0, 12 * 1024 ** 3), '0/12.0 GB')
  // The unit follows the total: below 1 GiB it is MB, at/above it is GB.
  assert.equal(formatBytePair(512 * 1024 ** 2, 800 * 1024 ** 2), '512/800 MB')
  assert.equal(formatBytePair(512 * 1024 ** 2, 1024 * 1024 ** 2), '0.5/1.0 GB')
  // A 3-digit total drops the decimal to keep the column narrow.
  assert.equal(formatBytePair(100 * 1024 ** 3, 128 * 1024 ** 3), '100/128 GB')
  // No usable total: fall back to a single formatted value.
  assert.equal(formatBytePair(4 * 1024 ** 3, null), '4.0 GB')
  assert.equal(formatBytePair(Number.NaN, 12 * 1024 ** 3), '—/12.0 GB')
  assert.equal(formatBytePair(null, 0), null)
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

test('throughput is formatted as a rate', () => {
  assert.equal(formatRate(0), '0 B/s')
  assert.equal(formatRate(512), '512 B/s')
  assert.equal(formatRate(2048), '2.0 KB/s')
  assert.equal(formatRate(240 * 1024), '240 KB/s')
  assert.equal(formatRate(1.25 * 1024 ** 2), '1.3 MB/s')
  assert.equal(formatRate(120 * 1024 ** 2), '120 MB/s')
  assert.equal(formatRate(2 * 1024 ** 3), '2.0 GB/s')
  // Unmeasurable rates are null, never 0 B/s.
  assert.equal(formatRate(null), null)
  assert.equal(formatRate(Number.NaN), null)
  assert.equal(formatRate(-1), null)
})

test('the tile stacks above conversation content but below DSH menus', () => {
  // Code blocks and tool cards use z-index 1..12, and DSH's own modal/menu layer
  // starts at 1000. The tile has to sit between the two: high enough not to be
  // covered by a code block, low enough that opening a menu still covers it.
  assert.ok(TILE_Z_INDEX > 12, `tile z-index ${TILE_Z_INDEX} would be covered by code blocks`)
  assert.ok(TILE_Z_INDEX < 1000, `tile z-index ${TILE_Z_INDEX} would cover DSH menus and modals`)
})

test('tile geometry keeps the capsule inside the viewport', () => {
  const viewport = { width: 1200, height: 800 }
  const size = { width: 620, height: 30 }

  assert.deepEqual(clampTilePosition({ x: -50, y: -50 }, size, viewport), { x: 4, y: 4 })
  assert.deepEqual(clampTilePosition({ x: 9999, y: 9999 }, size, viewport), { x: 576, y: 766 })

  const resting = defaultTilePosition(size, viewport)
  assert.equal(resting.x, 1200 - 620 - 20)
  assert.equal(resting.y, 76)
  // A viewport narrower than the capsule must not produce a negative coordinate.
  const tiny = defaultTilePosition(size, { width: 200, height: 150 })
  assert.equal(tiny.x, 4)
  assert.equal(tiny.y, 76)
})

/** A representative snapshot with two GPUs and a network readout. */
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
    network: {
      downloadBytesPerSec: 1.25 * 1024 ** 2,
      uploadBytesPerSec: 240 * 1024,
      source: 'windows-network-counters',
      interfaces: [
        { name: 'Realtek Gaming 2.5GbE Family Controller', counted: true, downloadBytesPerSec: 1.25 * 1024 ** 2, uploadBytesPerSec: 240 * 1024 },
        { name: 'Loopback Pseudo-Interface 1', counted: false, downloadBytesPerSec: 9e9, uploadBytesPerSec: 9e9 },
      ],
    },
    errors: [],
  }
}

test('the view model formats every item for direct rendering', () => {
  const view = buildViewModel(sampleSnapshot(), DEFAULT_OPTIONS)

  assert.equal(view.ok, true)
  assert.equal(view.rows.length, 5, 'CPU + memory + two GPUs + network')

  const [cpu, memory, gpu0, gpu1] = view.rows
  assert.equal(cpu.labelKey, 'labelCpu')
  assert.equal(cpu.valueText, '23%')
  assert.equal(cpu.severity, 'ok')
  assert.deepEqual(cpu.details.map((detail) => detail.text), ['81.9°C'])
  assert.match(cpu.title, /AMD Ryzen 7 8845HS/, 'the untruncated model stays in the tooltip')
  assert.match(cpu.title, /4T/, 'the thread count is language-neutral')

  assert.equal(memory.labelKey, 'labelMem')
  assert.equal(memory.valueText, '61%')
  assert.deepEqual(memory.details.map((detail) => detail.text), ['19.4/32.0 GB'])

  assert.deepEqual([gpu0.labelKey, gpu0.labelParams], ['labelGpuN', { n: 0 }], 'a multi-GPU machine numbers its items')
  assert.equal(gpu0.title, 'NVIDIA GeForce RTX 5070 Ti Laptop GPU')
  assert.equal(gpu0.valueText, '42%')
  assert.deepEqual(gpu0.details.map((detail) => detail.text), ['61°C', '4.0/12.0 GB'])

  assert.deepEqual([gpu1.labelKey, gpu1.labelParams], ['labelGpuN', { n: 1 }])
  assert.equal(gpu1.valueText, null, 'an unknown reading renders as "no data"')
  assert.deepEqual(gpu1.details, [])
})

test('the network item reports both directions', () => {
  const network = buildViewModel(sampleSnapshot(), DEFAULT_OPTIONS).rows.at(-1)
  assert.equal(network.labelKey, 'labelNet')
  assert.equal(network.valueText, '↓ 1.3 MB/s', 'download is the headline value')
  assert.deepEqual(network.details.map((detail) => detail.text), ['↑ 240 KB/s'])
  assert.equal(network.severity, 'ok', 'throughput has no red threshold')
  // Only the counted adapter is named; the excluded loopback is not.
  assert.equal(network.title, 'Realtek Gaming 2.5GbE Family Controller')
})

test('an unmeasurable network rate says so instead of showing 0 B/s', () => {
  const snapshot = sampleSnapshot()
  snapshot.network = { downloadBytesPerSec: null, uploadBytesPerSec: null, source: 'unsupported', interfaces: [] }
  const network = buildViewModel(snapshot, DEFAULT_OPTIONS).rows.at(-1)
  assert.equal(network.valueText, null)
  assert.deepEqual(network.details, [])
  assert.equal(network.severity, 'unknown')
  assert.equal(network.title, 'unsupported', 'the tooltip still explains where it looked')
})

test('an item carries text only — no gauge, bar or per-core series', () => {
  // The tile is a readout: text fields and nothing a component would have to
  // draw as a chart. A stray numeric field here is how a bar would creep back.
  const row = buildViewModel(sampleSnapshot(), DEFAULT_OPTIONS).rows[0]
  assert.deepEqual(
    Object.keys(row).sort(),
    ['details', 'key', 'labelKey', 'labelParams', 'severity', 'title', 'valueText']
  )
  for (const value of [row.valueText, row.title, ...row.details.map((detail) => detail.text)]) {
    assert.equal(typeof value, 'string')
  }
})

test('a single GPU is labelled GPU, not GPU0', () => {
  const snapshot = sampleSnapshot()
  snapshot.gpus = snapshot.gpus.slice(0, 1)
  const row = buildViewModel(snapshot, DEFAULT_OPTIONS).rows[2]
  assert.equal(row.labelKey, 'labelGpu')
  assert.equal(row.labelParams, undefined, 'a lone adapter gets no number')
})

test('the view model honors every display toggle', () => {
  const labelsFor = (options) => buildViewModel(sampleSnapshot(), { ...DEFAULT_OPTIONS, ...options }).rows.map((row) => row.labelKey)

  assert.deepEqual(labelsFor({ showCpu: false, showGpu: false }), ['labelMem', 'labelNet'])
  assert.deepEqual(labelsFor({ showMemory: false, showNetwork: false }), ['labelCpu', 'labelGpuN', 'labelGpuN'])
  assert.deepEqual(labelsFor({ showNetwork: false, showGpu: false, showCpu: false }), ['labelMem'])

  const noTemperatures = buildViewModel(sampleSnapshot(), {
    ...DEFAULT_OPTIONS,
    showCpuTemperature: false,
    showGpuTemperature: false,
  })
  assert.deepEqual(noTemperatures.rows[0].details, [])
  assert.deepEqual(
    noTemperatures.rows[2].details.map((detail) => detail.text),
    ['4.0/12.0 GB'],
    'VRAM survives when only temperature is off'
  )

  const withPower = buildViewModel(sampleSnapshot(), { ...DEFAULT_OPTIONS, showPower: true })
  assert.equal(withPower.rows[2].details.at(-1).text, '88.5 W')
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
  // The short metric tags are the same in both languages by design; only the
  // network tag is translated, because it has no universal short form.
  for (const tag of ['labelCpu', 'labelMem', 'labelGpu', 'labelGpuN']) {
    assert.equal(zh[tag], en[tag], tag)
  }
  assert.equal(zh.labelNet, '网速')
  assert.equal(en.labelNet, 'NET')
  assert.equal(format('{n} 秒', { n: 2 }), '2 秒')
  assert.equal(format('{a} and {b}', { b: 2, a: 1 }), '1 and 2')
  assert.equal(format('no placeholders'), 'no placeholders')
  assert.equal(format('{missing}', {}), '{missing}')
  assert.equal(bindDictionary(zh)('intervalSecond', { n: 2 }), '2 秒')
  assert.equal(bindDictionary(en)('intervalSecond', { n: 2 }), '2s')
  assert.equal(bindDictionary(zh)('labelGpuN', { n: 1 }), 'GPU1')
  assert.equal(bindDictionary(en)('doesNotExist'), 'doesNotExist')
})

test('every interval choice is inside the accepted range', () => {
  for (const choice of INTERVAL_CHOICES) {
    assert.equal(normalizeOptions({ intervalMs: choice }).intervalMs, choice)
  }
  assert.ok(INTERVAL_CHOICES.every((choice) => Number.isInteger(choice) && choice >= 1000))
})
