import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCpuUsageSampler } from '../lib/metrics/cpu.js'
import { sampleMemory } from '../lib/metrics/memory.js'

/** Build an `os.cpus()`-shaped snapshot from explicit jiffy counters. */
function frame(cores) {
  return cores.map((core) => ({
    model: 'Fake CPU 9000',
    speed: 3000,
    times: {
      user: core.user ?? 0,
      nice: 0,
      sys: core.sys ?? 0,
      idle: core.idle ?? 0,
      irq: 0,
    },
  }))
}

test('the first CPU sample reports no rate, then real deltas', () => {
  const sequences = [
    frame([
      { user: 70, sys: 30, idle: 900 },
      { user: 70, sys: 30, idle: 900 },
    ]),
    frame([
      { user: 420, sys: 180, idle: 1400 },
      { user: 70, sys: 30, idle: 1900 },
    ]),
  ]
  let call = 0
  const sample = createCpuUsageSampler({ cpus: () => sequences[Math.min(call++, sequences.length - 1)] })

  const first = sample()
  assert.equal(first.usage, null, 'a single reading has no baseline to diff against')
  assert.equal(first.cores, 2)
  assert.equal(first.model, 'Fake CPU 9000')

  const second = sample()
  // Core 0: 500 busy of 1000 elapsed jiffies = 50%. Core 1: 0 busy of 1000 = 0%.
  assert.equal(second.perCore[0], 50)
  assert.equal(second.perCore[1], 0)
  // Aggregate: 1500 idle of 2000 elapsed = 25% busy.
  assert.equal(second.usage, 25)
})

test('the CPU sampler ignores a core-count change instead of producing nonsense', () => {
  const sample = createCpuUsageSampler({
    cpus: (() => {
      const frames = [frame([{ user: 1, sys: 0, idle: 1 }]), frame([{ user: 1, sys: 0, idle: 1 }, { user: 1, sys: 0, idle: 1 }])]
      let index = 0
      return () => frames[Math.min(index++, frames.length - 1)]
    })(),
  })
  sample()
  const afterHotplug = sample()
  assert.equal(afterHotplug.usage, null)
  assert.deepEqual(afterHotplug.perCore, [])
})

test('the CPU sampler never divides by zero', () => {
  const frozen = frame([{ user: 10, sys: 0, idle: 10 }])
  const sample = createCpuUsageSampler({ cpus: () => frozen })
  sample()
  const result = sample()
  assert.equal(result.usage, null, 'no elapsed jiffies means no measurable rate')
  assert.deepEqual(result.perCore, [null])
})

test('memory usage is derived from the "available" figure', () => {
  const memory = sampleMemory({ totalmem: () => 32 * 1024 ** 3, freemem: () => 8 * 1024 ** 3 })
  assert.equal(memory.totalBytes, 32 * 1024 ** 3)
  assert.equal(memory.usedBytes, 24 * 1024 ** 3)
  assert.equal(memory.usage, 75)
})

test('memory clamps a nonsensical free figure past the total', () => {
  const memory = sampleMemory({ totalmem: () => 1000, freemem: () => 5000 })
  assert.equal(memory.usedBytes, 0)
  assert.equal(memory.freeBytes, 1000)
  assert.equal(memory.usage, 0)
})

test('memory reports null usage when the total is unusable', () => {
  const memory = sampleMemory({ totalmem: () => 0, freemem: () => 0 })
  assert.equal(memory.usage, null)
})
