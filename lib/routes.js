import { sendJson } from './http.js'
import { VERSION } from './version.js'
import { isTrustedRequest } from './trust.js'

/**
 * Route paths. The client bundle mirrors these literals and
 * `test/routes.test.mjs` asserts both sides still agree, so a rename cannot
 * silently break the tile.
 */
export const ROUTES = {
  snapshot: '/api/dsh-system-monitor/snapshot',
  health: '/api/dsh-system-monitor/health',
}

/**
 * Build this plugin's routes for `ctx.webServer.register`.
 *
 * Both routes are GET-only reads behind the loopback fence. `snapshot` serves
 * the cached sample (the tile polls it); `?refresh=1` forces a fresh sample for
 * the tile's manual refresh button, which costs a helper-process round trip and
 * is therefore opt-in.
 *
 * @param ctx - host context (`ctx.logger` is used for diagnostics).
 * @param deps - the monitor plus the resolved plugin config.
 * @returns route descriptors, one per path.
 */
export function makeRoutes(ctx, deps) {
  const { monitor, config } = deps

  /** Shared prologue: method, trust fence, and origin. */
  const guard = (req, res) => {
    if (req.method !== 'GET') {
      // A 405 must advertise the one method this route answers.
      sendJson(res, 405, { error: 'method not allowed', allow: 'GET' }, { allow: 'GET' })
      return null
    }
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { error: 'forbidden: loopback clients only' })
      return null
    }
    try {
      return new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { error: 'bad request url' })
      return null
    }
  }

  return [
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: (req, res) => {
        if (guard(req, res) === null) return
        sendJson(res, 200, {
          ok: true,
          plugin: 'dsh-system-monitor',
          version: VERSION,
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          cadence: monitor.config,
        })
      },
    },
    {
      kind: 'exact',
      path: ROUTES.snapshot,
      handler: async (req, res) => {
        const url = guard(req, res)
        if (url === null) return
        try {
          const wantsRefresh = url.searchParams.get('refresh') === '1'
          if (wantsRefresh && config.allowRefresh === false) {
            sendJson(res, 403, { error: 'refresh disabled by plugin config' })
            return
          }
          const snapshot = wantsRefresh ? await monitor.refresh() : monitor.snapshot()
          sendJson(res, 200, { ok: true, version: VERSION, ...snapshot })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          ctx?.logger?.warn?.(error instanceof Error ? error : new Error(message))
          sendJson(res, 500, { ok: false, error: message })
        }
      },
    },
  ]
}
