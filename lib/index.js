import { createMonitor } from './metrics/monitor.js'
import { makeRoutes } from './routes.js'
import { VERSION } from './version.js'

/**
 * dsh-system-monitor — host half.
 *
 * Samples CPU, memory and GPU telemetry on the machine that runs the Harness
 * host and publishes it as read-only JSON on the host web server. The browser
 * half (`./client`) renders the floating tile that polls it.
 *
 * There is no privileged access anywhere in this plugin: every reading comes
 * from Node's own `os` counters, the kernel's `/sys` sensor files, or a
 * vendor-supplied query tool (`nvidia-smi`) invoked with a fixed argument
 * vector. No elevation, no drivers, no network.
 */

/** Stable cordis plugin name. */
export const name = 'system-monitor'

/** The host service the routes mount on. */
export const inject = ['webServer']

/** Re-exported for the client contract check and the health route. */
export { ROUTES } from './routes.js'
export { VERSION }

/** Resolved defaults; every key is overridable from the cordis patch config. */
export const DEFAULT_CONFIG = {
  /** Master switch: false mounts no routes and starts no sampling. */
  enabled: true,
  /** Base tick for the in-process CPU/memory counters. */
  tickMs: 1000,
  /** Cadence for the GPU probe (spawns `nvidia-smi`). */
  gpuMs: 1500,
  /** Cadence for the CPU-temperature probe (spawns `typeperf` on Windows). */
  cpuTemperatureMs: 5000,
  /** `auto` | `kelvin` | `decikelvin` | `decicelsius` — see cputemp.js. */
  cpuTemperatureScale: 'auto',
  /** Set false on machines where the process-spawning probes are unwanted. */
  gpu: true,
  /** Set false to skip CPU temperature probing entirely. */
  cpuTemperature: true,
  /** Allow `?refresh=1` to force a fresh sample. */
  allowRefresh: true,
  /** Override the `nvidia-smi` executable (name or absolute path). */
  nvidiaSmiPath: 'nvidia-smi',
}

/**
 * Mount the sampler and its routes.
 * @param ctx - host context carrying `webServer`, `logger` and `effect`.
 * @param config - partial plugin config from the cordis patch entry.
 */
export function apply(ctx, config = {}) {
  const resolved = { ...DEFAULT_CONFIG, ...(config ?? {}) }
  if (resolved.enabled === false) return

  const monitor = createMonitor(resolved)

  ctx.effect(() => monitor.start(), 'dsh-system-monitor: metric sampler')

  ctx.effect(() => {
    const routes = makeRoutes(ctx, { monitor, config: resolved })
    const disposers = routes.map((route) => ctx.webServer.register(route))
    ctx.logger?.info?.(
      `[dsh-system-monitor] v${VERSION} serving ${routes.map((route) => route.path).join(', ')}`
    )
    return () => {
      for (const dispose of disposers) dispose()
      monitor.stop()
    }
  }, 'dsh-system-monitor: routes')
}
