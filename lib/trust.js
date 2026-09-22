/**
 * The read-only loopback trust fence shared by this plugin's routes.
 *
 * The snapshot exposes host inventory (CPU/GPU model names, memory pressure),
 * which is fingerprinting material even though it is not secret. The web server
 * can bind `0.0.0.0`, so every route is fenced to the loopback peer: a request
 * arriving from the LAN, or one carrying a proxy's forwarded-address header, is
 * refused before any metric is read.
 *
 * The plugin has no write routes, so no same-origin/CSRF check is needed beyond
 * the peer check — there is nothing a cross-site request could make it do.
 */

/**
 * Whether a peer address is the loopback interface.
 * @param address - `req.socket.remoteAddress` (IPv4, IPv6, or IPv4-mapped IPv6).
 */
export function isLoopback(address) {
  if (typeof address !== 'string') return false
  const value = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
  if (value === '::1' || value === '127.0.0.1') return true
  return value.startsWith('127.')
}

/** Header names a reverse proxy uses to carry the original client address. */
const FORWARDED_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host']

/**
 * Whether a request may read this plugin's metrics.
 * @param req - an `IncomingMessage`.
 * @returns true only for a direct loopback peer.
 */
export function isTrustedRequest(req) {
  if (req === null || typeof req !== 'object') return false
  if (!isLoopback(req.socket?.remoteAddress)) return false
  const headers = req.headers ?? {}
  for (const name of FORWARDED_HEADERS) {
    if (headers[name] !== undefined) return false
  }
  return true
}
