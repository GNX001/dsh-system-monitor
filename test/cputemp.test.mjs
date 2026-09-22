import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  parseThermalCounters,
  readLinuxCpuTemperature,
  readWindowsCpuTemperature,
  sampleCpuTemperature,
  thermalRawToCelsius,
  thermalZoneName,
  WINDOWS_THERMAL_COUNTER,
} from '../lib/metrics/cputemp.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('the ACPI thermal counter is read as Kelvin, not deci-Kelvin or deci-Celsius', () => {
  // Measured on the development machine: ~355 at rest, ~367 under sustained
  // 4-thread load. Kelvin puts that at 82 °C → 94 °C, i.e. a laptop CPU settling
  // just under its 95 °C throttle. Deci-Celsius would make the same trace a
  // 1.2 °C rise under full load, which no physical package does.
  assert.equal(thermalRawToCelsius(355), 81.9)
  assert.equal(thermalRawToCelsius(367), 93.9)

  const rise = thermalRawToCelsius(367) - thermalRawToCelsius(355)
  assert.ok(rise > 10, `a real load rise must be ~12 °C, got ${rise}`)
  assert.equal(thermalRawToCelsius(355, 'decicelsius'), 35.5)
})

test('an explicit scale overrides auto-detection', () => {
  // Deci-Kelvin sources report ~3000 for room temperature.
  assert.equal(thermalRawToCelsius(3550), 81.9, 'auto-detection picks deci-Kelvin above 1000')
  assert.equal(thermalRawToCelsius(3550, 'decikelvin'), 81.9)
  assert.equal(thermalRawToCelsius(3731.5, 'decikelvin'), 100, 'an explicit scale is applied verbatim')
  assert.equal(thermalRawToCelsius(400, 'decicelsius'), 40)
  // The plausibility guard is an independent safety net: no scale can smuggle a
  // physically impossible value through.
  assert.equal(thermalRawToCelsius(355, 'decikelvin'), null, '35.5 K is not a CPU temperature')
  assert.equal(thermalRawToCelsius(50, 'kelvin'), null)
})

test('implausible and absent readings are rejected, never reported as cold', () => {
  assert.equal(thermalRawToCelsius(0), null, 'ACPI reports 0 for "no sensor"')
  assert.equal(thermalRawToCelsius('N/A'), null)
  assert.equal(thermalRawToCelsius(Number.NaN), null)
  assert.equal(thermalRawToCelsius(100), null, '100 K is -173 °C, below the plausible floor')
  assert.equal(thermalRawToCelsius(900), null, '900 K is 627 °C, above the plausible ceiling')
})

test('thermalZoneName extracts the ACPI instance out of a counter path', () => {
  assert.equal(thermalZoneName('\\\\PC\\Thermal Zone Information(\\_SB.ECTZ)\\Temperature'), '\\_SB.ECTZ')
  assert.equal(thermalZoneName('unparseable'), 'unparseable')
})

test('parseThermalCounters picks the hottest zone and keeps every zone', async () => {
  const raw = await readFile(resolve(fixtures, 'typeperf-thermal.txt'), 'utf8')
  const parsed = parseThermalCounters(raw)
  assert.ok(parsed, 'the captured fixture must parse')
  assert.equal(parsed.zones.length, 2)
  assert.deepEqual(
    parsed.zones.map((zone) => zone.name).sort(),
    ['\\_SB.ECTZ', '\\_TZ.TZ01']
  )
  assert.equal(parsed.celsius, Math.max(...parsed.zones.map((zone) => zone.celsius)))
  assert.ok(parsed.celsius > 20 && parsed.celsius < 110, `implausible fixture reading ${parsed.celsius}`)

  // Highest first, so a UI can show zones[0] as the headline.
  assert.ok(parsed.zones[0].celsius >= parsed.zones[1].celsius)
})

test('parseThermalCounters returns null rather than guessing on junk', () => {
  assert.equal(parseThermalCounters(''), null)
  assert.equal(parseThermalCounters('The command completed successfully.'), null)
})

test('the Windows reader reports a failed probe as an error result', async () => {
  const exec = async (command, args) => {
    assert.equal(command, 'typeperf.exe')
    assert.deepEqual(args, [WINDOWS_THERMAL_COUNTER, '-sc', '1'])
    return { ok: false, error: 'ENOENT: typeperf.exe not found', stdout: '' }
  }
  const result = await readWindowsCpuTemperature({ exec, platform: 'win32' })
  assert.equal(result.celsius, null)
  assert.match(result.error, /ENOENT/)
  assert.equal(result.source, 'acpi-thermal-zone')
})

test('the Windows reader parses a successful probe', async () => {
  const raw = await readFile(resolve(fixtures, 'typeperf-thermal.txt'), 'utf8')
  const result = await readWindowsCpuTemperature({ exec: async () => ({ ok: true, stdout: raw }), platform: 'win32' })
  assert.equal(result.error, null)
  assert.ok(result.celsius > 20)
  assert.equal(result.zones.length, 2)
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

test('the Linux reader merges ACPI zones and CPU hwmon chips', async () => {
  const fs = fakeFs({
    '/sys/class/thermal/thermal_zone0/temp': '47000',
    '/sys/class/thermal/thermal_zone0/type': 'x86_pkg_temp\n',
    '/sys/class/thermal/thermal_zone1/temp': '0',
    '/sys/class/thermal/thermal_zone1/type': 'acpitz\n',
    '/sys/class/hwmon/hwmon0/name': 'coretemp\n',
    '/sys/class/hwmon/hwmon0/temp1_input': '49000',
    '/sys/class/hwmon/hwmon0/temp2_input': '51000',
    '/sys/class/hwmon/hwmon1/name': 'nvme\n',
    '/sys/class/hwmon/hwmon1/temp1_input': '99000',
  })
  const result = await readLinuxCpuTemperature({ fs, platform: 'linux' })

  assert.equal(result.error, null)
  assert.equal(result.source, 'linux-hwmon')
  // nvme is not a CPU sensor and must be excluded even though it is hottest.
  assert.ok(!result.zones.some((zone) => zone.name.startsWith('nvme')))
  assert.equal(result.celsius, 51, 'the hottest CPU sensor wins')
  assert.deepEqual(
    result.zones.map((zone) => zone.name),
    ['coretemp/temp2', 'coretemp/temp1', 'x86_pkg_temp']
  )
})

test('the Linux reader degrades when /sys has no CPU sensors', async () => {
  const result = await readLinuxCpuTemperature({ fs: fakeFs({}), platform: 'linux' })
  assert.equal(result.celsius, null)
  assert.match(result.error, /no readable CPU thermal sensor/)
})

test('unsupported platforms report why instead of inventing a temperature', async () => {
  const result = await sampleCpuTemperature({ platform: 'darwin' })
  assert.equal(result.celsius, null)
  assert.equal(result.source, 'unsupported')
  assert.match(result.error, /darwin/)
})

test('a throwing collector is contained by the dispatcher', async () => {
  const result = await sampleCpuTemperature({
    platform: 'linux',
    fs: {
      readdir: async () => {
        throw new Error('kernel exploded')
      },
      readFile: async () => {
        throw new Error('kernel exploded')
      },
    },
  })
  assert.equal(result.celsius, null)
  assert.equal(result.source, 'linux-hwmon')
})
