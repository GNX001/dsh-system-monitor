import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  DEFAULT_EXCLUDED_INTERFACES,
  createInterfaceFilter,
  createLinuxNetworkSampler,
  parseProcNetDev,
  parseWindowsNetworkCounters,
  readWindowsNetwork,
  sampleNetwork,
} from '../lib/metrics/network.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** A realistic `/proc/net/dev`, columns per the kernel's own header. */
const PROC_NET_DEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9000000    9000    0    0    0     0          0         0  9000000    9000    0    0    0     0       0          0
  eth0: 1000000    1000    0    0    0     0          0         0   500000     500    0    0    0     0       0          0
docker0: 8000000    8000    0    0    0     0          0         0  8000000    8000    0    0    0     0       0          0
`

test('the interface filter drops loopback and virtual adapters', () => {
  const counted = createInterfaceFilter()
  for (const name of ['Realtek Gaming 2.5GbE Family Controller', 'MediaTek Wi-Fi 6E MT7922 160MHz Wireless LAN Card', 'UsbNcm Host Device']) {
    assert.equal(counted(name), true, `${name} is a real adapter`)
  }
  for (const name of [
    'Loopback Pseudo-Interface 1',
    'isatap.{GUID}',
    'Teredo Tunneling Pseudo-Interface',
    'Microsoft Wi-Fi Direct Virtual Adapter',
    'vEthernet (WSL)',
    'VMware Network Adapter VMnet8',
    'VirtualBox Host-Only Network',
    'Bluetooth Device (Personal Area Network)',
    'WireGuard Tunnel',
    'Tailscale',
    'Realtek Gaming 2.5GbE Family Controller_2',
  ]) {
    assert.equal(counted(name), false, `${name} must not contribute`)
  }
  // Linux's loopback device is named `lo`, which the word "loopback" misses.
  assert.equal(counted('lo'), false)
  assert.equal(counted('eth0'), true)
})

test('the exclusion list is overridable in both directions', () => {
  // A custom deny list replaces the default entirely.
  const only = createInterfaceFilter(['gaming'], [])
  assert.equal(only('Realtek Gaming 2.5GbE'), false)
  assert.equal(only('Loopback Pseudo-Interface 1'), true, 'defaults no longer apply')
  // `lo` is never countable, whatever the deny list says.
  assert.equal(only('lo'), false)

  // An explicit include rescues a name the default list would have dropped.
  assert.equal(createInterfaceFilter()('vEthernet (WSL)'), false)
  const rescued = createInterfaceFilter(undefined, ['vethernet'])
  assert.equal(rescued('vEthernet (WSL)'), true, 'an explicit include wins over the default deny')

  assert.ok(DEFAULT_EXCLUDED_INTERFACES.includes('loopback'))
})

test('Windows throughput sums the counted adapters only', async () => {
  const raw = await readFile(resolve(fixtures, 'typeperf-network-raw.txt'), 'utf8')
  const parsed = parseWindowsNetworkCounters(raw)

  assert.equal(parsed.ok, true)
  assert.equal(parsed.error, null)
  assert.equal(parsed.interfaces.length, 3, 'the capture covers three adapters')

  // Declared rates are per second already: the totals are a plain sum of the
  // Wi-Fi adapter's two directions, with the two idle adapters contributing 0.
  const wifi = parsed.interfaces.find((entry) => entry.name.includes('MediaTek'))
  assert.ok(wifi.counted)
  assert.ok(wifi.downloadBytesPerSec > 0, 'the capture had download traffic')
  assert.ok(wifi.uploadBytesPerSec > 0, 'the capture had upload traffic')
  assert.equal(parsed.downloadBytesPerSec, wifi.downloadBytesPerSec)
  assert.equal(parsed.uploadBytesPerSec, wifi.uploadBytesPerSec)

  for (const entry of parsed.interfaces) {
    assert.equal(typeof entry.counted, 'boolean')
    assert.ok(entry.downloadBytesPerSec >= 0 && entry.uploadBytesPerSec >= 0)
  }
})

test('the counter name is read from the header, not the column position', () => {
  // Columns are counter-major: every Received instance, then every Sent one.
  // A positional parser would swap the two directions here.
  const header = [
    '(PDH-CSV 4.0)',
    '\\\\PC\\Network Interface(NIC A)\\Bytes Received/sec',
    '\\\\PC\\Network Interface(NIC B)\\Bytes Received/sec',
    '\\\\PC\\Network Interface(NIC A)\\Bytes Sent/sec',
    '\\\\PC\\Network Interface(NIC B)\\Bytes Sent/sec',
  ]
    .map((field) => `"${field}"`)
    .join(',')
  const row = ['"01/02/2026 03:04:05.678"', '"100.000000"', '"200.000000"', '"10.000000"', '"20.000000"'].join(',')
  const parsed = parseWindowsNetworkCounters(`\n${header}\n${row}\n`)

  assert.equal(parsed.downloadBytesPerSec, 300)
  assert.equal(parsed.uploadBytesPerSec, 30)
})

test('a junk Windows frame fails without throwing', () => {
  const parsed = parseWindowsNetworkCounters('The command completed successfully.')
  assert.equal(parsed.ok, false)
  assert.equal(parsed.downloadBytesPerSec, null)
  assert.equal(parsed.uploadBytesPerSec, null)
  assert.match(parsed.error, /no readable typeperf frame/)
})

test('a failed typeperf run is reported, not treated as zero traffic', async () => {
  const result = await readWindowsNetwork({ exec: async () => ({ ok: false, error: 'ENOENT: typeperf.exe' }), platform: 'win32' })
  assert.equal(result.ok, false)
  assert.equal(result.downloadBytesPerSec, null)
  assert.match(result.error, /ENOENT/)
  assert.equal(result.source, 'windows-network-counters')
})

test('/proc/net/dev parses the received and transmitted byte columns', () => {
  const interfaces = parseProcNetDev(PROC_NET_DEV)
  assert.deepEqual(
    interfaces.map((entry) => entry.name),
    ['lo', 'eth0', 'docker0']
  )
  assert.deepEqual(interfaces[1], { name: 'eth0', rxBytes: 1000000, txBytes: 500000 })
  assert.deepEqual(parseProcNetDev(''), [])
  assert.deepEqual(parseProcNetDev('garbage without a colon'), [])
})

test('the Linux sampler reports a rate from two cumulative readings', async () => {
  const frames = [PROC_NET_DEV, PROC_NET_DEV.replace('1000000', '3000000').replace('500000', '1000000')]
  let index = 0
  let clock = 1_000_000
  const sample = createLinuxNetworkSampler({
    readFile: async () => frames[Math.min(index++, frames.length - 1)],
    now: () => clock,
  })

  const first = await sample()
  assert.equal(first.ok, true)
  assert.equal(first.downloadBytesPerSec, null, 'the first reading has no interval to measure')
  assert.match(first.pending, /first sample/)
  assert.equal(first.interfaces.find((entry) => entry.name === 'lo').counted, false)

  clock += 2000
  const second = await sample()
  // eth0 gained 2 MB down and 0.5 MB up over 2 s; lo and docker0 are excluded.
  assert.equal(second.downloadBytesPerSec, 1_000_000)
  assert.equal(second.uploadBytesPerSec, 250_000)
  assert.equal(second.error, null)
})

test('the Linux sampler does not divide by a zero interval', async () => {
  let clock = 1_000_000
  const sample = createLinuxNetworkSampler({ readFile: async () => PROC_NET_DEV, now: () => clock })
  await sample()
  const second = await sample()
  assert.equal(second.downloadBytesPerSec, null)
  assert.equal(second.error, null)
})

test('an unreadable /proc/net/dev reports why', async () => {
  const sample = createLinuxNetworkSampler({
    readFile: async () => {
      throw new Error('EACCES')
    },
  })
  const result = await sample()
  assert.equal(result.ok, false)
  assert.equal(result.downloadBytesPerSec, null)
  assert.match(result.error, /cannot read \/proc\/net\/dev/)
})

test('unsupported platforms report a reason instead of 0 B/s', async () => {
  const result = await sampleNetwork({ platform: 'darwin' })
  assert.equal(result.ok, false)
  assert.equal(result.downloadBytesPerSec, null)
  assert.equal(result.uploadBytesPerSec, null)
  assert.equal(result.source, 'unsupported')
  assert.match(result.error, /darwin/)
})

test('a throwing collector is contained by the dispatcher', async () => {
  const result = await sampleNetwork({
    platform: 'linux',
    linuxSampler: () => {
      throw new Error('sampler exploded')
    },
  })
  assert.equal(result.downloadBytesPerSec, null)
  assert.equal(result.source, 'error')
  assert.match(result.error, /sampler exploded/)
})
