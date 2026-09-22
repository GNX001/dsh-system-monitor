import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  adapterKeyOf,
  NVIDIA_QUERY_FIELDS,
  parseNvidiaSmiCsv,
  parseWindowsGpuCounters,
  readLinuxAmdGpus,
  readNvidiaGpus,
  sampleGpus,
} from '../lib/metrics/gpu.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('nvidia-smi output parses into utilization, temperature, VRAM and power', async () => {
  const raw = await readFile(resolve(fixtures, 'nvidia-smi.csv'), 'utf8')
  const gpus = parseNvidiaSmiCsv(raw)
  assert.equal(gpus.length, 1)

  const [gpu] = gpus
  assert.equal(gpu.vendor, 'nvidia')
  assert.equal(gpu.source, 'nvidia-smi')
  assert.equal(gpu.index, 0)
  assert.equal(gpu.name, 'NVIDIA GeForce RTX 5070 Ti Laptop GPU')
  assert.equal(gpu.usage, 0)
  assert.equal(gpu.memory.totalBytes, 12227 * 1024 * 1024)
  assert.equal(gpu.memory.usedBytes, 0)
  assert.equal(gpu.memory.usage, 0)
  assert.ok(gpu.temperature > 0 && gpu.temperature < 110)
  assert.ok(gpu.powerWatts > 0)
})

test('the query puts the free-text name last so commas cannot shift fields', () => {
  assert.equal(NVIDIA_QUERY_FIELDS.at(-1), 'name')
  const gpus = parseNvidiaSmiCsv('0, 42, 1024, 8192, 61, 120.5, RTX 4090, Laptop GPU Edition\n')
  assert.equal(gpus.length, 1)
  assert.equal(gpus[0].name, 'RTX 4090, Laptop GPU Edition')
  assert.equal(gpus[0].usage, 42)
  assert.equal(gpus[0].temperature, 61)
  assert.equal(gpus[0].powerWatts, 120.5)
})

test('unsupported nvidia-smi counters stay null, never 0', () => {
  const gpus = parseNvidiaSmiCsv('0, 15, 512, 8192, [N/A], [Not Supported], Tesla T4\n')
  assert.equal(gpus.length, 1)
  assert.equal(gpus[0].usage, 15)
  assert.equal(gpus[0].temperature, null)
  assert.equal(gpus[0].powerWatts, null)
  assert.equal(gpus[0].memory.usage, 6.3)
})

test('malformed nvidia-smi rows are skipped instead of crashing the tick', () => {
  assert.deepEqual(parseNvidiaSmiCsv(''), [])
  assert.deepEqual(parseNvidiaSmiCsv('not,enough,fields\n'), [])
  assert.deepEqual(parseNvidiaSmiCsv('\n\n'), [])
})

test('adapterKeyOf isolates the adapter LUID + physical index', () => {
  assert.equal(
    adapterKeyOf('\\\\PC\\GPU Engine(pid_10720_luid_0x00000000_0x0000D56C_phys_0_eng_3_engtype_3D)\\Utilization Percentage'),
    'luid_0x00000000_0x0000D56C_phys_0'
  )
  assert.equal(adapterKeyOf('nothing here'), null)
})

/** Build a synthetic `typeperf` frame from a counter list and a value list. */
function typeperfFrame(counters, values) {
  const header = ['(PDH-CSV 4.0)', ...counters].map((field) => `"${field}"`).join(',')
  const row = ['"01/02/2026 03:04:05.678"', ...values].map((field) => `"${field}"`).join(',')
  return `\n${header}\n${row}\nExiting, please wait...\n`
}

test('Windows GPU utilization is the max per adapter, not the sum across engines', () => {
  // One adapter with three engines busy at once. Summing would report 150% and
  // break every progress bar; the max is what Task Manager shows.
  const luid = 'luid_0x00000000_0x0000AAAA_phys_0'
  const text = typeperfFrame(
    [
      `\\\\PC\\GPU Engine(pid_1_${luid}_eng_0_engtype_3D)\\Utilization Percentage`,
      `\\\\PC\\GPU Engine(pid_2_${luid}_eng_1_engtype_Copy)\\Utilization Percentage`,
      `\\\\PC\\GPU Engine(pid_3_${luid}_eng_2_engtype_VideoDecode)\\Utilization Percentage`,
      `\\\\PC\\GPU Adapter Memory(${luid})\\Dedicated Usage`,
    ],
    ['70.000000', '55.000000', '80.000000', '2147483648.000000']
  )

  const gpus = parseWindowsGpuCounters(text)
  assert.equal(gpus.length, 1)
  assert.equal(gpus[0].usage, 80, 'the busiest engine wins')
  assert.equal(gpus[0].memory.usedBytes, 2147483648)
  assert.equal(gpus[0].temperature, null, 'this counter set has no temperature')
  assert.equal(gpus[0].memory.totalBytes, null, 'this counter set has no VRAM capacity')
})

test('Windows GPU counters split multiple adapters apart', () => {
  const a = 'luid_0x00000000_0x0000AAAA_phys_0'
  const b = 'luid_0x00000000_0x0000BBBB_phys_0'
  const text = typeperfFrame(
    [
      `\\\\PC\\GPU Engine(pid_1_${a}_eng_0_engtype_3D)\\Utilization Percentage`,
      `\\\\PC\\GPU Engine(pid_2_${b}_eng_0_engtype_3D)\\Utilization Percentage`,
      `\\\\PC\\GPU Adapter Memory(${a})\\Dedicated Usage`,
      `\\\\PC\\GPU Adapter Memory(${b})\\Dedicated Usage`,
    ],
    ['10.000000', '90.000000', '1073741824.000000', '536870912.000000']
  )

  const gpus = parseWindowsGpuCounters(text)
  assert.equal(gpus.length, 2)
  assert.deepEqual(gpus.map((gpu) => gpu.usage), [10, 90])
  assert.deepEqual(gpus.map((gpu) => gpu.memory.usedBytes), [1073741824, 536870912])
  assert.deepEqual(gpus.map((gpu) => gpu.index), [0, 1])
})

test('the captured Windows GPU fixture parses into one row per adapter', async () => {
  const raw = await readFile(resolve(fixtures, 'typeperf-gpu-raw.txt'), 'utf8')
  const gpus = parseWindowsGpuCounters(raw)

  // The capture covers a hybrid laptop: the discrete NVIDIA adapter holding the
  // live engine counters, plus two idle adapters (the integrated GPU and a
  // software/basic-render device).
  assert.equal(gpus.length, 3)
  assert.deepEqual(
    gpus.map((gpu) => gpu.name),
    ['GPU adapter 0x0000D56C', 'GPU adapter 0x00010174', 'GPU adapter 0x000101D5']
  )

  const busy = gpus.filter((gpu) => gpu.usage !== null && gpu.usage > 0)
  assert.equal(busy.length, 1, 'only the discrete adapter was doing work')
  // Max-per-engine, not sum: the raw frame holds 486 engine columns whose total
  // would be a few hundred percent.
  assert.ok(busy[0].usage > 0 && busy[0].usage <= 100, `utilization out of range: ${busy[0].usage}`)
  assert.ok(busy[0].memory.usedBytes > 400 * 1024 * 1024, 'the working adapter reported dedicated VRAM')

  for (const gpu of gpus) {
    assert.ok(gpu.usage === null || (gpu.usage >= 0 && gpu.usage <= 100), `utilization out of range: ${gpu.usage}`)
    assert.equal(gpu.temperature, null, 'the counter set carries no temperature')
    assert.equal(typeof gpu.memory.usedBytes, 'number')
  }
})

test('a junk Windows GPU frame yields no adapters', () => {
  assert.deepEqual(parseWindowsGpuCounters(''), [])
  assert.deepEqual(parseWindowsGpuCounters('The command completed successfully.'), [])
})

/** Build a fake `fs/promises` pair from a path→content map. */
function fakeFs(files) {
  const missing = (path) => {
    const error = new Error(`ENOENT: ${path}`)
    error.code = 'ENOENT'
    throw error
  }
  const directories = new Map()
  for (const path of Object.keys(files)) {
    const parts = path.split('/')
    parts.pop()
    while (parts.length > 0) {
      const parent = parts.join('/')
      if (!directories.has(parent)) directories.set(parent, [])
      const child = path.split('/')[parts.length]
      if (!directories.get(parent).includes(child)) directories.get(parent).push(child)
      parts.pop()
    }
  }
  return {
    readdir: async (path) => directories.get(path) ?? missing(path),
    readFile: async (path) => (path in files ? String(files[path]) : missing(path)),
  }
}

test('Linux AMD GPUs are read straight from sysfs', async () => {
  const fs = fakeFs({
    '/sys/class/drm/card0/device/gpu_busy_percent': '37\n',
    '/sys/class/drm/card0/device/mem_info_vram_used': '2147483648',
    '/sys/class/drm/card0/device/mem_info_vram_total': '8589934592',
    '/sys/class/drm/card0/device/hwmon/hwmon2/temp1_input': '52000',
    '/sys/class/drm/card0/device/hwmon/hwmon2/name': 'amdgpu\n',
  })
  const result = await readLinuxAmdGpus({ fs, drmRoot: '/sys/class/drm', platform: 'linux' })

  assert.equal(result.error, null)
  assert.equal(result.gpus.length, 1)
  assert.equal(result.gpus[0].usage, 37)
  assert.equal(result.gpus[0].temperature, 52)
  assert.equal(result.gpus[0].memory.usedBytes, 2147483648)
  assert.equal(result.gpus[0].memory.totalBytes, 8589934592)
  assert.equal(result.gpus[0].memory.usage, 25)
  assert.equal(result.gpus[0].vendor, 'amd')
})

test('Linux AMD discovery skips cards with no readable signals', async () => {
  const result = await readLinuxAmdGpus({ fs: fakeFs({}), drmRoot: '/sys/class/drm', platform: 'linux' })
  assert.deepEqual(result.gpus, [])
  assert.match(result.error, /no AMD GPU sysfs nodes/)
})

test('nvidia-smi wins over the platform fallback when it answers', async () => {
  const calls = []
  const exec = async (command) => {
    calls.push(command)
    if (command === 'nvidia-smi') {
      return { ok: true, stdout: '0, 30, 1024, 8192, 55, 90, RTX Test\n' }
    }
    throw new Error(`${command} should not have been called`)
  }
  const result = await sampleGpus({ exec, platform: 'win32' })
  assert.equal(result.source, 'nvidia-smi')
  assert.equal(result.gpus.length, 1)
  assert.equal(result.gpus[0].usage, 30)
  assert.deepEqual(calls, ['nvidia-smi'])
})

test('a custom nvidia-smi path is honored', async () => {
  const calls = []
  const exec = async (command, args) => {
    calls.push({ command, args })
    return { ok: true, stdout: '0, 1, 2, 3, 4, 5, GPU\n' }
  }
  await readNvidiaGpus({ exec, nvidiaSmiPath: 'C:\\tools\\nvidia-smi.exe', platform: 'win32' })
  assert.equal(calls[0].command, 'C:\\tools\\nvidia-smi.exe')
  assert.ok(calls[0].args[0].startsWith('--query-gpu='))
  assert.equal(calls[0].args[1], '--format=csv,noheader,nounits')
})

test('when nvidia-smi is missing the platform fallback runs and errors are kept', async () => {
  const exec = async (command) => {
    if (command === 'nvidia-smi') return { ok: false, error: 'ENOENT: nvidia-smi not found' }
    return { ok: false, error: 'ENOENT: typeperf.exe not found' }
  }
  const result = await sampleGpus({ exec, platform: 'win32' })
  assert.equal(result.source, 'none')
  assert.deepEqual(result.gpus, [])
  assert.equal(result.errors.length, 2)
  assert.match(result.errors[0], /nvidia-smi/)
})

test('a GPU probe that throws does not escape the sampler', async () => {
  const exec = async () => {
    throw new Error('probe exploded')
  }
  const result = await sampleGpus({ exec, platform: 'linux' })
  assert.equal(result.source, 'none')
  assert.deepEqual(result.gpus, [])
  assert.ok(result.errors.some((message) => /probe exploded/.test(message)))
})

test('macOS reports no GPU rather than inventing one', async () => {
  const exec = async () => ({ ok: false, error: 'ENOENT: nvidia-smi not found' })
  const result = await sampleGpus({ exec, platform: 'darwin' })
  assert.equal(result.source, 'none')
  assert.deepEqual(result.gpus, [])
})
