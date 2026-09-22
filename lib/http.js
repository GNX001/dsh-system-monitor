/**
 * JSON response helper for the plugin's routes. Kept local so the plugin has
 * zero runtime dependencies and owns its own wire shape.
 */

/**
 * Write one JSON response with the headers a polled telemetry endpoint wants:
 * `no-store` (never cache a live reading) and an explicit content length.
 * @param res - the server response.
 * @param status - HTTP status code.
 * @param body - a JSON-serializable payload.
 * @param extraHeaders - protocol headers the status code requires, e.g. `Allow`
 *   on a 405. Caller headers win over the defaults.
 */
export function sendJson(res, status, body, extraHeaders) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    ...extraHeaders,
  })
  res.end(text)
}
