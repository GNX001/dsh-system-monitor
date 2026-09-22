/**
 * Build the browser half into `lib/client.js`.
 *
 * The client module system wants one classic script that calls
 * `window.__ModuleLoader__.load({ id, factory })`, where `factory` receives the
 * shell's `require` and returns the module exports. esbuild's `cjs` output is
 * exactly the body of such a factory — it uses `require` and assigns
 * `module.exports` — so the banner opens the factory (declaring `module` and
 * `exports` in its scope) and the footer closes it. React and react-dom stay
 * external and resolve through the shell's module table.
 *
 * The host half (`lib/index.js`) is plain ESM and needs no build step.
 */
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = 'dsh-system-monitor'

const BANNER = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PLUGIN_ID)},
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
`

const FOOTER = `
    return module.exports
  }
})
`

const outfile = resolve(root, 'lib/client.js')

const result = await build({
  entryPoints: [resolve(root, 'src/client/index.jsx')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome110', 'firefox110', 'safari16'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  // Resolved by the shell's module table at runtime, never bundled.
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  legalComments: 'none',
  // Default 'ascii' escaping keeps the bundle correct no matter what charset the
  // static handler advertises, at the cost of \\uXXXX for the Chinese strings.
  charset: 'ascii',
  banner: { js: BANNER },
  footer: { js: FOOTER },
  metafile: true,
  logLevel: 'info',
})

const rawBundle = await readFile(outfile, 'utf8')
// esbuild appends its own trailing newline after the footer, which leaves a
// blank line at EOF. Normalize to exactly one so `git diff --check` stays clean.
const bundle = `${rawBundle.replace(/\s+$/, '')}\n`
if (bundle !== rawBundle) await writeFile(outfile, bundle, 'utf8')

const problems = []
if (!bundle.startsWith('window.__ModuleLoader__.load(')) problems.push('bundle does not open the module-loader factory')
if (!bundle.includes(`id: ${JSON.stringify(PLUGIN_ID)}`)) problems.push(`bundle does not declare id ${PLUGIN_ID}`)
if (!bundle.trimEnd().endsWith('})')) problems.push('bundle does not close the module-loader call')
if (/\brequire\("(?!react|react-dom|react\/jsx-runtime|@deepseek-ai\/dsh-client-ui-primitives)/.test(bundle)) {
  problems.push('bundle requires a module that is not in the shell module table')
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`[build] ${problem}`)
  process.exitCode = 1
} else {
  const bytes = Buffer.byteLength(bundle)
  const inputs = Object.keys(result.metafile.inputs).length
  console.log(`[build] lib/client.js ${bytes} bytes from ${inputs} sources — module-loader contract verified`)
}
