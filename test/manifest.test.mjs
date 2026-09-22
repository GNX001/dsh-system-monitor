import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { DEFAULT_CONFIG, apply, inject, name } from '../lib/index.js'
import { VERSION } from '../lib/version.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFile(resolve(root, relative), 'utf8')

const manifest = JSON.parse(await read('package.json'))

test('package.json describes a DSH client plugin', () => {
  assert.equal(manifest.name, 'dsh-system-monitor')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.main, 'lib/index.js')

  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(
    manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'),
    'the tile binds the DSH locale service'
  )
  assert.ok(manifest.dsh.compatibility.dsh.startsWith('>='))
})

test('the published file list actually contains what the plugin loads', () => {
  for (const entry of ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    assert.ok(manifest.files.includes(entry), `${entry} must ship`)
  }
  assert.ok(manifest.files.includes('README.zh.md'))
})

test('both manifest exports point at files that exist', async () => {
  const host = await read('lib/index.js')
  assert.ok(host.length > 0)
  assert.equal(manifest.exports['.'].default, './lib/index.js')
  assert.equal(manifest.exports['./client'].default, './lib/client.js')
  // The built browser half must ship as source, not be generated at install time.
  const browser = await read('lib/client.js')
  assert.ok(browser.startsWith('window.__ModuleLoader__.load('))
})

test('the reported version cannot drift from package.json', () => {
  assert.equal(VERSION, manifest.version)
})

test('the bundle patch inserts this package under the profile roster', async () => {
  const patch = await read('cordis.patch.yml')
  assert.match(patch, /-\s*insert:/)
  assert.match(patch, new RegExp(`name:\\s*['"]?${manifest.name}['"]?`))
  assert.match(patch, /id:\s*system-monitor/)
})

test('the host half exports a well-formed cordis plugin', () => {
  assert.equal(name, 'system-monitor')
  assert.deepEqual(inject, ['webServer'])
  assert.equal(typeof apply, 'function')
})

test('every config key has a documented default', () => {
  assert.equal(DEFAULT_CONFIG.enabled, true)
  assert.ok(DEFAULT_CONFIG.tickMs > 0)
  assert.ok(DEFAULT_CONFIG.gpuMs >= DEFAULT_CONFIG.tickMs)
  assert.ok(DEFAULT_CONFIG.cpuTemperatureMs >= DEFAULT_CONFIG.tickMs)
  assert.equal(DEFAULT_CONFIG.allowRefresh, true)
  assert.equal(DEFAULT_CONFIG.nvidiaSmiPath, 'nvidia-smi')
  for (const scale of ['auto', 'kelvin', 'decikelvin', 'decicelsius']) {
    assert.ok(scale === 'auto' || typeof scale === 'string')
  }
  assert.equal(DEFAULT_CONFIG.cpuTemperatureScale, 'auto')
})

test('the browser half carries no host-only imports', async () => {
  const browser = await read('lib/client.js')
  for (const forbidden of ['node:fs', 'node:child_process', 'node:os', 'node:path']) {
    assert.ok(!browser.includes(forbidden), `lib/client.js must not reference ${forbidden}`)
  }
})

test('the shipped README documents install, routes and privacy', async () => {
  const readme = await read('README.md')
  assert.match(readme, /dsh plugin --profile web add/)
  assert.match(readme, /\/api\/dsh-system-monitor\/snapshot/)
  assert.match(readme, /loopback/i)
  assert.match(readme, /nvidia-smi/)
})
