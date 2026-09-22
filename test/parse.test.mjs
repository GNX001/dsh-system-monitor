import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  clamp01,
  mibToBytes,
  milliCelsiusToCelsius,
  parseDelimitedLine,
  readTypeperfFrame,
  round,
  splitLines,
  toFiniteNumber,
  usagePercent,
} from '../lib/metrics/parse.js'

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('toFiniteNumber keeps 0 but rejects every "unavailable" spelling', () => {
  // 0 must survive: a 0% utilization reading is data, not absence.
  assert.equal(toFiniteNumber('0'), 0)
  assert.equal(toFiniteNumber('0.000000'), 0)
  assert.equal(toFiniteNumber(0), 0)
  assert.equal(toFiniteNumber('-1'), -1)

  // nvidia-smi emits these for counters a device does not implement; mapping
  // them to 0 would report a cold, idle GPU instead of "unknown".
  for (const placeholder of ['N/A', 'n/a', '[N/A]', '[Not Supported]', '-', '--', '', '   ', null, undefined, 'abc']) {
    assert.equal(toFiniteNumber(placeholder), null, `${JSON.stringify(placeholder)} must be null`)
  }
})

test('round and clamp01 are null-safe', () => {
  assert.equal(round(1.24, 1), 1.2)
  assert.equal(round(1.25, 1), 1.3)
  assert.equal(round(Number.NaN), null)
  assert.equal(round(undefined), null)
  assert.equal(clamp01(-3), 0)
  assert.equal(clamp01(3), 1)
  assert.equal(clamp01(Number.NaN), 0)
})

test('unit conversions preserve null', () => {
  assert.equal(mibToBytes(1024), 1073741824)
  assert.equal(mibToBytes('N/A'), null)
  assert.equal(milliCelsiusToCelsius(47500), 47.5)
  assert.equal(milliCelsiusToCelsius('bad'), null)
  assert.equal(milliCelsiusToCelsius(0), null, '0 milli-Celsius is the kernel "no reading" sentinel')
  assert.equal(usagePercent(50, 100), 50)
  assert.equal(usagePercent(1, 0), null)
  assert.equal(usagePercent(Number.NaN, 10), null)
})

test('parseDelimitedLine honors quoted fields and embedded delimiters', () => {
  assert.deepEqual(parseDelimitedLine('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(parseDelimitedLine('"a,1",b'), ['a,1', 'b'])
  assert.deepEqual(parseDelimitedLine('"say ""hi""",x'), ['say "hi"', 'x'])
  assert.deepEqual(parseDelimitedLine('" padded ",b'), ['padded', 'b'])
  assert.deepEqual(parseDelimitedLine(''), [''])
})

test('splitLines drops blank lines and trims', () => {
  assert.deepEqual(splitLines('a\r\n\r\n b \n'), ['a', 'b'])
  assert.deepEqual(splitLines(null), [])
})

test('readTypeperfFrame skips the header, the blank line and the trailer chatter', async () => {
  const raw = await readFile(resolve(fixtures, 'typeperf-thermal.txt'), 'utf8')
  const frame = readTypeperfFrame(raw)
  assert.ok(frame, 'the captured typeperf output must yield a frame')
  assert.equal(frame.header[0], '(PDH-CSV 4.0)')
  assert.equal(frame.header.length, frame.values.length)
  assert.equal(frame.header.length, 3)

  // The trailer typeperf prints on stdout must never be mistaken for a sample.
  assert.ok(!frame.values.some((value) => value.includes('Exiting')))
  assert.ok(!frame.values[0].includes('PDH-CSV'))
})

test('readTypeperfFrame returns null instead of throwing on junk', () => {
  assert.equal(readTypeperfFrame(''), null)
  assert.equal(readTypeperfFrame('The command completed successfully.'), null)
  assert.equal(readTypeperfFrame('"(PDH-CSV 4.0)","only-a-header"\n'), null)
})
