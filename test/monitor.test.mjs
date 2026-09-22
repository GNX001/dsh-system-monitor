import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMonitor } from '../lib/metrics/monitor.js'

/** Let the monitor's async tick finish (its timers are injected, so real timers are free). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

/**
 * Build a monitor wired to fake timers, a controllable clock, and stub
 * collectors, so cadence can be asserted exactly without waiting.
 */
function harness(overrides = {}) {
  const state = { now: 1_000_000, timers: new Map(), nextTimer: 1, gpuCalls: 0, temperatureCalls: 0, memoryCalls: 0 }
  const monitor = createMonitor({
    platform: 'win32',
    now: () => state.now,
    setTimer: (fn, ms) => {
      const id = state.nextTimer++
      state.timers.set(id, { fn, ms })
      return id
    },
    clearTimer: (id) => state.timers.delete(id),
    collectCpu: () => ({ usage: 42, perCore: [42], cores: 1, model: 'Stub CPU', speedMHz: 3000 }),
    collectMemory: () => {
      state.memoryCalls += 1
      return { totalBytes: 100, freeBytes: 25, usedBytes: 75, usage: 75 }
    },
    collectGpus: () => {
      state.gpuCalls += 1
      return { gpus: [{ index: 0, name: 'Stub GPU', usage: 7, temperature: 60, memory: {}, powerWatts: 12 }], source: 'stub', errors: [] }
    },
    collectCpuTemperature: () => {
      state.temperatureCalls += 1
      return { celsius: 50, zones: [{ name: 'stub', celsius: 50 }], source: 'stub', error: null }
    },
    ...overrides,
  })

  return {
    monitor,
    state,
    /** Fire the registered interval callback. */
    async fire() {
      const entry = [...state.timers.values()][0]
      assert.ok(entry, 'no timer registered')
      entry.fn()
      await settle()
    },
    /** Advance the fake clock. */
    advance(ms) {
      state.now += ms
    },
    registeredInterval() {
      return [...state.timers.values()][0]?.ms ?? null
    },
  }
}

test('start probes everything immediately and schedules the configured cadence', async () => {
  const { monitor, state, registeredInterval } = harness({ tickMs: 1000 })
  const dispose = monitor.start()
  await settle()

  assert.equal(state.gpuCalls, 1, 'the first tick must not wait for the GPU cadence')
  assert.equal(state.temperatureCalls, 1)
  assert.equal(state.memoryCalls, 1)
  assert.equal(registeredInterval(), 1000)

  dispose()
  assert.equal(state.timers.size, 0, 'the disposer must clear the interval')
  monitor.stop()
})

test('the GPU and temperature probes keep their own slower cadence', async () => {
  const { monitor, state, fire, advance } = harness({ tickMs: 1000, gpuMs: 1500, cpuTemperatureMs: 5000 })
  monitor.start()
  await settle()

  advance(1000)
  await fire()
  assert.equal(state.gpuCalls, 1, 'GPU must not be re-probed before gpuMs')
  assert.equal(state.temperatureCalls, 1, 'temperature must not be re-probed before cpuTemperatureMs')
  assert.equal(state.memoryCalls, 2, 'in-process counters refresh on every tick')

  advance(600)
  await fire()
  assert.equal(state.gpuCalls, 2, 'GPU is re-probed once gpuMs elapsed')

  advance(4000)
  await fire()
  assert.equal(state.temperatureCalls, 2, 'temperature follows its own slower cadence')
  monitor.stop()
})

test('the cached GPU reading survives ticks that do not re-probe', async () => {
  const { monitor, fire, advance } = harness({ tickMs: 1000, gpuMs: 60_000 })
  monitor.start()
  await settle()
  const first = monitor.snapshot().gpus

  advance(1000)
  await fire()
  assert.deepEqual(monitor.snapshot().gpus, first, 'the last reading is carried between probes')
  monitor.stop()
})

test('refresh forces both probes and returns the fresh snapshot', async () => {
  const { monitor, state } = harness({ gpuMs: 60_000, cpuTemperatureMs: 60_000 })
  await monitor.refresh()
  assert.equal(state.gpuCalls, 1)
  assert.equal(state.temperatureCalls, 1)

  const snapshot = await monitor.refresh()
  assert.equal(state.gpuCalls, 2, 'refresh ignores the cadence')
  assert.equal(state.temperatureCalls, 2)
  assert.equal(snapshot.cpu.temperature, 50)
  assert.equal(snapshot.cpu.usage, 42)
  assert.equal(snapshot.memory.usage, 75)
  assert.equal(snapshot.gpus.length, 1)
  assert.equal(snapshot.gpuSource, 'stub')
})

test('the snapshot is a detached clone, not live state', async () => {
  const { monitor } = harness()
  const snapshot = await monitor.refresh()
  snapshot.cpu.usage = 999
  snapshot.host.hostname = 'tampered'
  const again = monitor.snapshot()
  assert.equal(again.cpu.usage, 42)
  assert.notEqual(again.host.hostname, 'tampered')
})

test('a failing collector degrades one metric and records the reason', async () => {
  const { monitor } = harness({
    collectCpu: () => {
      throw new Error('cpu exploded')
    },
    collectMemory: () => {
      throw new Error('memory exploded')
    },
    collectGpus: () => ({ gpus: [], source: 'none', errors: ['nvidia-smi missing'] }),
    collectCpuTemperature: () => ({ celsius: null, zones: [], source: 'unsupported', error: 'no sensor' }),
  })
  const snapshot = await monitor.refresh()

  assert.equal(snapshot.cpu.usage, null, 'a failed CPU collector leaves usage unknown')
  assert.equal(snapshot.memory.usage, null)
  assert.deepEqual(
    snapshot.errors.map((entry) => entry.source).sort(),
    ['cpu', 'cpu-temperature', 'gpu', 'memory']
  )
  assert.ok(snapshot.errors.every((entry) => typeof entry.message === 'string' && entry.message.length > 0))
})

test('the diagnostics list is bounded', async () => {
  const errors = Array.from({ length: 40 }, (_, index) => `failure ${index}`)
  const { monitor } = harness({ collectGpus: () => ({ gpus: [], source: 'none', errors }) })
  const snapshot = await monitor.refresh()
  assert.ok(snapshot.errors.length <= 6, `expected a bounded list, got ${snapshot.errors.length}`)
})

test('probing can be switched off per metric', async () => {
  const { monitor, state } = harness({ gpu: false, cpuTemperature: false })
  const snapshot = await monitor.refresh()
  assert.equal(state.gpuCalls, 0)
  assert.equal(state.temperatureCalls, 0)
  assert.deepEqual(snapshot.gpus, [])
  assert.equal(snapshot.cpu.temperature, null)
  assert.equal(monitor.config.gpu, false)
  assert.equal(monitor.config.cpuTemperature, false)
})

test('a rejected collector promise is contained too', async () => {
  const { monitor } = harness({
    collectGpus: () => Promise.reject(new Error('async gpu failure')),
    collectCpuTemperature: () => Promise.reject(new Error('async temp failure')),
  })
  const snapshot = await monitor.refresh()
  assert.ok(snapshot.errors.some((entry) => /async gpu failure/.test(entry.message)))
  assert.ok(snapshot.errors.some((entry) => /async temp failure/.test(entry.message)))
})

test('host inventory is reported once and stays stable', async () => {
  const { monitor } = harness()
  const snapshot = await monitor.refresh()
  assert.equal(snapshot.host.platform, 'win32')
  assert.equal(snapshot.host.pid, process.pid)
  assert.ok(typeof snapshot.host.hostname === 'string' && snapshot.host.hostname.length > 0)
  assert.ok(Number.isFinite(snapshot.host.uptimeSec))
})
