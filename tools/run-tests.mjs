/**
 * Run every suite in ONE process.
 *
 * `node --test test/` is the normal entry point and is what `npm test` uses, but
 * it must spawn a child process per test file. Sandboxed and restricted
 * environments can refuse that with `EPERM`, so this runner imports the suites
 * directly instead — same tests, same assertions, same reporter, one process.
 *
 *   node tools/run-tests.mjs
 *
 * node:test sets `process.exitCode` itself when a test fails, so this script
 * adds no reporting of its own.
 */
import { readdir } from 'node:fs/promises'

const testDirectory = new URL('../test/', import.meta.url)
const files = (await readdir(testDirectory))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()

if (files.length === 0) {
  console.error('[run-tests] no *.test.mjs files found in test/')
  process.exitCode = 1
} else {
  console.log(`[run-tests] running ${files.length} suites in one process\n`)
  for (const file of files) {
    await import(new URL(file, testDirectory).href)
  }
}
