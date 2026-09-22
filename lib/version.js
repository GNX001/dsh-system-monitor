/**
 * Single source of truth for the version reported by the health route.
 * `test/manifest.test.mjs` asserts this string still equals package.json's
 * `version`, so the two can never drift silently.
 */
export const VERSION = '0.3.1'
