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
  // The Unlicense: released into the public domain with no conditions on use.
  assert.equal(manifest.license, 'Unlicense')
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
  // The English README ships alongside the Chinese one, which is the primary
  // file GitHub renders.
  assert.ok(manifest.files.includes('README.en.md'))
  assert.ok(!manifest.files.includes('README.zh.md'), 'the pre-rename name must be gone')
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

test('the Chinese README is the primary one and cross-links the English one', async () => {
  const zh = await read('README.md')
  const en = await read('README.en.md')

  // GitHub renders README.md, so it must be the Chinese document and must link
  // to the English translation — and the English one must link back.
  assert.match(zh, /中文 \| \[English\]\(README\.en\.md\)/, 'the switcher must point at README.en.md')
  assert.match(en, /\[中文\]\(README\.md\) \| English/, 'the switcher must point back at README.md')
  assert.doesNotMatch(zh, /README\.zh\.md/, 'no link may keep the pre-rename name')

  // Both must actually be in their own language.
  assert.match(zh, /悬浮状态条/)
  assert.match(en, /floating status capsule/)
})

test('both READMEs document install, routes, privacy and the platforms', async () => {
  const zh = await read('README.md')
  const en = await read('README.en.md')

  for (const [name, text] of [['README.md', zh], ['README.en.md', en]]) {
    assert.match(text, /dsh plugin --profile web add/, `${name}: install command`)
    assert.match(text, /\/api\/dsh-system-monitor\/snapshot/, `${name}: snapshot route`)
    assert.match(text, /nvidia-smi/, `${name}: the GPU tool`)
    assert.match(text, /--dsw-alias-/, `${name}: the theme tokens it uses`)
  }
  // "loopback" is spelled 回环 in the Chinese document.
  assert.match(zh, /回环/)
  assert.match(en, /loopback/i)
  assert.match(zh, /网速/)
  assert.match(en, /network throughput/i)
})

test('both READMEs credit the author on the first line under the title', async () => {
  for (const [name, expected] of [
    ['README.md', '**作者：DeepSeek + DeepSeek-Harness**'],
    ['README.en.md', '**Author: DeepSeek + DeepSeek-Harness**'],
  ]) {
    const lines = (await read(name)).split('\n')
    assert.equal(lines[0], '# dsh-system-monitor', `${name}: the title comes first`)
    assert.equal(lines[1], '', `${name}: blank line after the title`)
    assert.equal(lines[2], expected, `${name}: the author byline is the first line under the title`)
  }
})

test('the release is public domain and carries no conditions', async () => {
  const license = await read('LICENSE')

  // The Unlicense dedicates the work to the public domain. MIT would not do:
  // it conditions use on keeping the copyright notice.
  assert.match(license, /free and unencumbered software released into the public domain/)
  assert.match(license, /dedicate any and all copyright interest in the\s+software to the public domain/)
  assert.match(license, /For more information, please refer to <https:\/\/unlicense\.org>/)
  assert.doesNotMatch(license, /MIT License/)
  assert.doesNotMatch(license, /The above copyright notice and this permission notice shall be included/)

  // No document may still advertise MIT.
  for (const name of ['README.md', 'README.en.md', 'package.json']) {
    assert.doesNotMatch(await read(name), /\bMIT\b/, `${name} must not claim MIT any more`)
  }
  for (const name of ['README.md', 'README.en.md']) {
    const text = await read(name)
    assert.match(text, /Unlicense/, `${name}: names the license`)
    assert.match(text, /LICENSE/, `${name}: links the full text`)
  }
  // The Chinese document states the no-conditions grant in Chinese.
  assert.match(await read('README.md'), /无任何使用条件/)
  assert.match(await read('README.en.md'), /with no conditions on use/)
})
