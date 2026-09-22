import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from '../lib/metrics/exec.js'

/**
 * Minimal stand-in for a spawned child. `runCommand` attaches its listeners
 * synchronously after `spawn` returns, so events are emitted on a later tick.
 * `hang` holds the process open (no `close`) after any output is delivered,
 * which is what a probe that floods stdout and then stalls actually does.
 */
function fakeChild({ stdout = '', stderr = '', code = 0, signal = null, error = null, hang = false }) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stdout.setEncoding = () => {}
  child.stderr = new EventEmitter()
  child.stderr.setEncoding = () => {}
  child.killed = false
  child.kill = () => {
    child.killed = true
  }
  setImmediate(() => {
    if (error !== null) {
      child.emit('error', error)
      return
    }
    if (stdout !== '') child.stdout.emit('data', stdout)
    if (stderr !== '') child.stderr.emit('data', stderr)
    if (hang) return
    child.emit('close', code, signal)
  })
  return child
}

/** Build a `spawnImpl` that answers each command from a table. */
function spawnTable(handlers) {
  const calls = []
  const impl = (command, args, options) => {
    calls.push({ command, args, options })
    const handler = handlers[command]
    if (handler === undefined) throw Object.assign(new Error(`unexpected command ${command}`), { code: 'ENOENT' })
    return handler(args, options)
  }
  return { impl, calls }
}

test('runCommand collects stdout and reports success', async () => {
  const { impl, calls } = spawnTable({
    'nvidia-smi': () => fakeChild({ stdout: '0, 42, 100, 200, 48, 18.4, RTX\n' }),
  })
  const result = await runCommand('nvidia-smi', ['--query-gpu=x'], { spawnImpl: impl, platform: 'linux' })

  assert.equal(result.ok, true)
  assert.equal(result.code, 0)
  assert.equal(result.transport, 'pipe')
  assert.equal(result.stdout, '0, 42, 100, 200, 48, 18.4, RTX\n')
  assert.equal(result.error, null)
  assert.equal(calls[0].options.windowsHide, true)
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe'])
})

test('runCommand reports a non-zero exit without throwing', async () => {
  const { impl } = spawnTable({ typeperf: () => fakeChild({ code: 1, stderr: 'boom' }) })
  const result = await runCommand('typeperf', [], { spawnImpl: impl, platform: 'linux' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 1)
  assert.match(result.error, /exited with code 1/)
})

test('runCommand surfaces a missing executable as a result, not a rejection', async () => {
  const { impl } = spawnTable({}) // any command throws ENOENT
  const result = await runCommand('nvidia-smi', [], { spawnImpl: impl, platform: 'linux' })
  assert.equal(result.ok, false)
  assert.match(result.error, /^ENOENT:/)
})

test('runCommand kills a hung probe and marks it timed out', async () => {
  let killed = false
  const child = fakeChild({ hang: true })
  const originalKill = child.kill
  child.kill = () => {
    killed = true
    originalKill()
  }
  const result = await runCommand('nvidia-smi', [], { spawnImpl: () => child, platform: 'linux', timeoutMs: 20 })
  assert.equal(result.ok, false)
  assert.equal(result.timedOut, true)
  assert.equal(killed, true)
  assert.match(result.error, /timed out/)
})

test('runCommand fails loudly when a probe floods stdout', async () => {
  const result = await runCommand('noisy', [], {
    spawnImpl: () => fakeChild({ stdout: 'x'.repeat(500), hang: true }),
    platform: 'linux',
    maxBytes: 100,
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /more than 100 bytes/)
  assert.equal(result.stdout.length, 100)
})

test('the temp-file transport stays off on non-Windows platforms', async () => {
  const { impl, calls } = spawnTable({
    typeperf: () => fakeChild({ error: Object.assign(new Error('refused'), { code: 'EPERM' }) }),
  })
  const result = await runCommand('typeperf', [], { spawnImpl: impl, platform: 'linux' })
  assert.equal(result.ok, false)
  assert.match(result.error, /^EPERM:/)
  assert.equal(calls.length, 1, 'Linux must not attempt the cmd.exe fallback')
})

/**
 * Pull the redirection target out of the `cmd.exe` line the fallback builds.
 * The path may or may not be quoted (quoting is skipped when the path needs no
 * escaping), so both forms are accepted — which also asserts the line is one
 * `cmd.exe` can actually parse.
 */
function redirectTargetOf(line) {
  const match = />\s*(?:"([^"]+)"|(\S+))\s*2>&1\s*$/.exec(line)
  if (match === null) throw new Error(`cmd.exe line must redirect to a path: ${line}`)
  return match[1] ?? match[2]
}

test('a Windows EPERM pipe refusal is retried through a temp file', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'dsm-exec-'))
  const { impl, calls } = spawnTable({
    'nvidia-smi': () => fakeChild({ error: Object.assign(new Error('refused'), { code: 'EPERM' }) }),
    'cmd.exe': (args) => {
      // Emulate the shell redirection the fallback relies on. The write must be
      // synchronous: the child's `close` can land before a floating async write
      // finished, which would flip this into a flaky ENOENT race.
      writeFileSync(redirectTargetOf(args[args.length - 1]), '0, 55, 1, 2, 61, 20, FALLBACK\n', 'utf8')
      return fakeChild({ code: 0 })
    },
  })

  const result = await runCommand('nvidia-smi', ['--query-gpu=index'], {
    spawnImpl: impl,
    platform: 'win32',
    tempDir,
  })

  assert.equal(result.ok, true, result.error ?? '')
  assert.equal(result.transport, 'file')
  assert.match(result.stdout, /FALLBACK/)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].command, 'cmd.exe')
  assert.equal(calls[1].options.stdio, 'ignore', 'the fallback must not need pipes')
  assert.match(calls[1].args[2], /^nvidia-smi /, 'the original argv is replayed')
})

test('a Windows non-EPERM failure is not retried through a temp file', async () => {
  const { impl, calls } = spawnTable({
    typeperf: () => fakeChild({ code: 9009, stderr: 'not recognized' }),
  })
  const result = await runCommand('typeperf', [], { spawnImpl: impl, platform: 'win32' })
  assert.equal(result.ok, false)
  assert.equal(calls.length, 1)
  assert.match(result.error, /exited with code 9009/)
})

test('the temp file is cleaned up after the fallback runs', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'dsm-exec-clean-'))
  let captured = null
  const { impl } = spawnTable({
    probe: () => fakeChild({ error: Object.assign(new Error('refused'), { code: 'EPERM' }) }),
    'cmd.exe': (args) => {
      captured = redirectTargetOf(args[args.length - 1])
      writeFileSync(captured, 'ok', 'utf8')
      return fakeChild({ code: 0 })
    },
  })
  await runCommand('probe', [], { spawnImpl: impl, platform: 'win32', tempDir })
  assert.ok(captured !== null)
  await assert.rejects(() => readFile(captured, 'utf8'), /ENOENT/)
})
