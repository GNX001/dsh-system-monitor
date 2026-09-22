/**
 * Pure client-half logic: option normalization/persistence, value formatting,
 * theme detection, tile geometry, and the snapshot → view-model reduction.
 *
 * Everything here is framework-free and DOM-free except `detectTheme`, which
 * takes the document as an argument. The React components in `tile.jsx` render
 * the view model this module produces, so all formatting and severity rules are
 * unit-testable without a renderer.
 */

/** Storage key for the persisted tile options. */
export const STORAGE_KEY = 'dsh-system-monitor:options'

/** Locale namespace registered with the DSH locale service. */
export const LOCALE_NS = 'dsh-system-monitor'

/** Poll cadences the settings panel offers, in milliseconds. */
export const INTERVAL_CHOICES = [1000, 1500, 2000, 3000, 5000, 10000]

/** Tile options and their defaults. */
export const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  collapsed: false,
  intervalMs: 1500,
  opacity: 0.94,
  position: null,
  showCpu: true,
  showCpuTemperature: true,
  showMemory: true,
  showGpu: true,
  showGpuTemperature: true,
  showGpuMemory: true,
  showPower: false,
  showPerCore: false,
})

const MIN_OPACITY = 0.4
const MAX_OPACITY = 1
const MIN_INTERVAL = 500
const MAX_INTERVAL = 60000

/** Inclusive bounds for every numeric option, keyed by option name. */
const NUMERIC_BOUNDS = {
  opacity: [MIN_OPACITY, MAX_OPACITY],
  intervalMs: [MIN_INTERVAL, MAX_INTERVAL],
}

/** Clamp a number into a range, falling back when it is not finite. */
function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Coerce a value to boolean with an explicit fallback for non-booleans. */
function toBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Normalize persisted or partially-supplied options into a complete, valid set.
 * Unknown keys are dropped and out-of-range numbers are clamped, so a corrupted
 * localStorage entry can never produce an unusable tile.
 */
export function normalizeOptions(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const options = {}
  for (const [key, fallback] of Object.entries(DEFAULT_OPTIONS)) {
    const value = source[key]
    if (typeof fallback === 'boolean') {
      options[key] = toBoolean(value, fallback)
    } else if (typeof fallback === 'number') {
      const [min, max] = NUMERIC_BOUNDS[key] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      options[key] = clampNumber(value, min, max, fallback)
    } else if (key === 'position') {
      options[key] = normalizePosition(value)
    } else {
      options[key] = value === undefined ? fallback : value
    }
  }
  return options
}

/** Accept only a `{x, y}` pair of finite numbers; anything else means "auto". */
export function normalizePosition(value) {
  if (value === null || typeof value !== 'object') return null
  const x = Number(value.x)
  const y = Number(value.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * A localStorage-shaped adapter (`getItem`/`setItem`/`removeItem`).
 *
 * Keeping the DOM shape — rather than a bespoke `get`/`set` pair — means one
 * interface runs through the whole module and a caller's own storage stub drops
 * straight in. Falls back to an in-memory map whenever the page's storage is
 * unavailable or throws (private mode, blocked cookies, quota), because a
 * monitoring widget must never break the host application.
 */
export function createSafeStorage(backing) {
  let store = backing
  if (store === undefined) {
    try {
      store = globalThis.localStorage ?? null
    } catch {
      store = null
    }
  }
  const memory = new Map()
  const usable = store !== null && typeof store?.getItem === 'function'

  return {
    getItem(key) {
      if (usable) {
        try {
          const value = store.getItem(key)
          if (value !== null && value !== undefined) return value
        } catch {
          /* fall through to the in-memory copy */
        }
      }
      return memory.has(key) ? memory.get(key) : null
    },
    setItem(key, value) {
      const text = String(value)
      memory.set(key, text)
      if (!usable) return
      try {
        store.setItem(key, text)
      } catch {
        /* quota or blocked storage: the in-memory copy above still works */
      }
    },
    removeItem(key) {
      memory.delete(key)
      if (!usable) return
      try {
        store.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

/** Read one key without ever throwing. */
function readStored(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null
  } catch {
    return null
  }
}

/** Write one key without ever throwing. */
function writeStored(storage, key, value) {
  try {
    storage?.setItem?.(key, value)
  } catch {
    /* ignore */
  }
}

/** Read and normalize persisted options. */
export function loadOptions(storage) {
  const raw = readStored(storage, STORAGE_KEY)
  if (typeof raw !== 'string' || raw === '') return { ...DEFAULT_OPTIONS }
  try {
    return normalizeOptions(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

/** Persist options. */
export function saveOptions(storage, options) {
  writeStored(storage, STORAGE_KEY, JSON.stringify(options))
}

/**
 * A tiny external store consumed by `useSyncExternalStore`. Both the tile and
 * the settings panel read the same instance, so an option changed in Settings
 * is visible in the tile on the next paint.
 *
 * @param options.storage - an optional localStorage-shaped backing; defaults to
 *   the page's `localStorage` through {@link createSafeStorage}.
 */
export function createOptionsStore(options = {}) {
  const storage = createSafeStorage(options.storage)
  let state = loadOptions(storage)
  const listeners = new Set()

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  return {
    /** Current options object (a stable reference until the next change). */
    getSnapshot: () => state,
    /** Subscribe to changes; returns the unsubscribe. */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Merge a patch, normalize, persist, and notify. */
    set(patch) {
      const next = normalizeOptions({ ...state, ...patch })
      if (JSON.stringify(next) === JSON.stringify(state)) return
      state = next
      saveOptions(storage, state)
      emit()
    },
    /** Restore defaults (keeping the tile enabled). */
    reset() {
      this.set({ ...DEFAULT_OPTIONS, enabled: true })
    },
  }
}

/**
 * Resolve the app's current theme.
 *
 * The DSH web shell paints its own background and the tile sits on top of it, so
 * `prefers-color-scheme` alone is wrong whenever the user picked a theme in
 * Settings that differs from the OS. The order of evidence is therefore:
 * an explicit theme attribute on `<html>`, then the measured luminance of the
 * body background, then the OS preference.
 *
 * @param doc - a Document (defaults to the page document).
 * @returns `'dark'` or `'light'`.
 */
export function detectTheme(doc) {
  const fallback = () => {
    try {
      return doc?.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }
  if (doc === undefined || doc === null) return 'light'

  const root = doc.documentElement
  const marker = [root?.getAttribute?.('data-theme'), root?.getAttribute?.('data-color-mode'), root?.className]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  if (/(^|[^a-z])dark([^a-z]|$)/.test(marker)) return 'dark'
  if (/(^|[^a-z])light([^a-z]|$)/.test(marker)) return 'light'

  const background = doc.defaultView?.getComputedStyle?.(doc.body ?? root)?.backgroundColor
  const rgb = parseCssColor(background)
  if (rgb !== null && rgb.alpha > 0.05) return relativeLuminance(rgb) < 0.5 ? 'dark' : 'light'

  return fallback()
}

/** Parse `rgb()` / `rgba()` / `#rrggbb` into channel values, or null. */
export function parseCssColor(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (rgbMatch !== null) {
    const parts = rgbMatch[1]
      .split(/[,\s/]+/)
      .map((part) => part.trim())
      .filter((part) => part !== '')
    if (parts.length < 3) return null
    const channels = parts.slice(0, 3).map((part) => (part.endsWith('%') ? (Number.parseFloat(part) / 100) * 255 : Number(part)))
    if (channels.some((channel) => !Number.isFinite(channel))) return null
    return { r: channels[0], g: channels[1], b: channels[2], alpha: parseAlpha(parts[3]) }
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hexMatch !== null) {
    const hex = hexMatch[1]
    const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      alpha: 1,
    }
  }
  return null
}

/**
 * Alpha accepts both the legacy `0.5` form and the modern `/ 50%` form, and
 * only the units digit is captured by the channel split, so a trailing `%` must
 * be handled here rather than falling back to fully opaque.
 */
function parseAlpha(part) {
  if (part === undefined) return 1
  const alpha = part.endsWith('%') ? Number.parseFloat(part) / 100 : Number(part)
  if (!Number.isFinite(alpha)) return 1
  return Math.min(1, Math.max(0, alpha))
}

/** WCAG relative luminance of an RGB triple (0 = black, 1 = white). */
export function relativeLuminance(color) {
  const channel = (value) => {
    const scaled = Math.min(1, Math.max(0, value / 255))
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * Clamp a dragged position so the tile stays fully inside the viewport.
 * @param position - the requested `{x, y}`.
 * @param size - the tile's `{width, height}`.
 * @param viewport - the window's `{width, height}`.
 */
export function clampTilePosition(position, size, viewport) {
  const margin = 4
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return {
    x: Math.round(Math.min(maxX, Math.max(margin, position.x))),
    y: Math.round(Math.min(maxY, Math.max(margin, position.y))),
  }
}

/** Default resting place: just below the top-right corner, clear of the shell chrome. */
export function defaultTilePosition(size, viewport) {
  return clampTilePosition(
    { x: viewport.width - size.width - 20, y: 76 },
    size,
    viewport
  )
}

/**
 * Format a byte count the way a system monitor does: 1024-based units, labelled
 * GB/MB (matching Windows Task Manager and macOS Activity Monitor).
 * @returns e.g. `"19.4 GB"`, or null when the value is unusable.
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null
  const gib = bytes / 1024 ** 3
  if (gib >= 1) return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`
  const mib = bytes / 1024 ** 2
  if (mib >= 1) return `${mib.toFixed(0)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Format a percentage, keeping one decimal only below 10%. */
export function formatPercent(value) {
  if (!Number.isFinite(value)) return null
  const clamped = Math.min(100, Math.max(0, value))
  return `${clamped < 10 && clamped > 0 ? clamped.toFixed(1) : Math.round(clamped)}%`
}

/** Format a Celsius reading. */
export function formatTemperature(celsius) {
  if (!Number.isFinite(celsius)) return null
  return `${celsius.toFixed(celsius >= 100 ? 0 : 1).replace(/\.0$/, '')}°C`
}

/** Format a wattage reading. */
export function formatWatts(watts) {
  if (!Number.isFinite(watts)) return null
  return `${watts.toFixed(watts >= 100 ? 0 : 1)} W`
}

/** Severity bucket for a load percentage. */
export function severityOf(percent) {
  if (!Number.isFinite(percent)) return 'unknown'
  if (percent >= 90) return 'hot'
  if (percent >= 70) return 'warn'
  return 'ok'
}

/** Severity bucket for a temperature. Laptop CPUs idle hot, so the bar is high. */
export function temperatureSeverity(celsius) {
  if (!Number.isFinite(celsius)) return 'unknown'
  if (celsius >= 90) return 'hot'
  if (celsius >= 75) return 'warn'
  return 'ok'
}

/**
 * Shorten a CPU marketing string to something that fits a 260px tile.
 * `"AMD Ryzen 7 8845HS w/ Radeon 780M Graphics"` → `"Ryzen 7 8845HS"`.
 */
export function shortCpuName(model) {
  if (typeof model !== 'string' || model.trim() === '') return null
  let text = model.trim()
  text = text.replace(/\s*\((?:R|TM|C)\)/gi, '')
  text = text.replace(/\s+(w\/|with)\s+.*$/i, '')
  text = text.replace(/\s+(CPU|Processor)\s*@.*$/i, '')
  text = text.replace(/^(AMD|Intel|Apple|Qualcomm)\s+/i, '')
  text = text.replace(/\s+\d+-Core\s+Processor$/i, '')
  return text.trim() === '' ? null : text.trim()
}

/**
 * Shorten a GPU marketing string.
 * `"NVIDIA GeForce RTX 5070 Ti Laptop GPU"` → `"RTX 5070 Ti"`.
 */
export function shortGpuName(name) {
  if (typeof name !== 'string' || name.trim() === '') return null
  let text = name.trim()
  text = text.replace(/\s*\((?:R|TM|C)\)/gi, '')
  text = text.replace(/^(NVIDIA|AMD|ATI|Intel|Apple|Advanced Micro Devices(,? Inc\.?)?)\s+/i, '')
  text = text.replace(/^GeForce\s+/i, '')
  text = text.replace(/\s+(Laptop GPU|Laptop|Mobile|Desktop|Graphics Adapter|GPU)$/i, '')
  text = text.replace(/\s+/g, ' ').trim()
  if (text === '') return null
  return text.length > 22 ? `${text.slice(0, 21)}…` : text
}

/**
 * Reduce a host snapshot to the rows the tile paints.
 *
 * This is the whole display contract: every string is already formatted and
 * every severity already decided, so `tile.jsx` only maps over `rows`.
 *
 * @param snapshot - the payload from `/api/dsh-system-monitor/snapshot`.
 * @param options - resolved tile options.
 * @returns `{ ok, rows, errors, updatedAt, host }`.
 */
export function buildViewModel(snapshot, options) {
  const resolved = options ?? DEFAULT_OPTIONS
  if (snapshot === null || typeof snapshot !== 'object') {
    return { ok: false, rows: [], errors: [], updatedAt: null, host: null }
  }

  const rows = []
  if (resolved.showCpu !== false) rows.push(cpuRow(snapshot.cpu, resolved))
  if (resolved.showMemory !== false) rows.push(memoryRow(snapshot.memory))
  if (resolved.showGpu !== false) {
    const gpus = Array.isArray(snapshot.gpus) ? snapshot.gpus : []
    gpus.forEach((gpu, index) => rows.push(gpuRow(gpu, resolved, index, gpus.length)))
  }

  return {
    ok: true,
    rows: rows.filter((row) => row !== null),
    errors: Array.isArray(snapshot.errors) ? snapshot.errors : [],
    updatedAt: Number.isFinite(snapshot.ts) ? snapshot.ts : null,
    host: snapshot.host ?? null,
  }
}

/** Build the CPU row. */
function cpuRow(cpu, options) {
  if (cpu === null || typeof cpu !== 'object') return null
  const details = []
  if (options.showCpuTemperature !== false && Number.isFinite(cpu.temperature)) {
    details.push({ key: 'temp', text: formatTemperature(cpu.temperature), tone: temperatureSeverity(cpu.temperature) })
  }
  return {
    key: 'cpu',
    label: 'CPU',
    caption: shortCpuName(cpu.model),
    percent: Number.isFinite(cpu.usage) ? cpu.usage : null,
    valueText: formatPercent(cpu.usage),
    severity: severityOf(cpu.usage),
    perCore: options.showPerCore === true && Array.isArray(cpu.perCore) ? cpu.perCore : null,
    // A bare count: the unit is localized by the component, not here.
    cores: options.showPerCore === true && Number.isFinite(cpu.cores) ? cpu.cores : null,
    details,
  }
}

/** Build the memory row. */
function memoryRow(memory) {
  if (memory === null || typeof memory !== 'object') return null
  const used = formatBytes(memory.usedBytes)
  const total = formatBytes(memory.totalBytes)
  const details = []
  if (used !== null && total !== null) details.push({ key: 'size', text: `${used} / ${total}`, tone: 'muted' })
  return {
    key: 'memory',
    label: 'MEM',
    caption: null,
    percent: Number.isFinite(memory.usage) ? memory.usage : null,
    valueText: formatPercent(memory.usage),
    severity: severityOf(memory.usage),
    perCore: null,
    cores: null,
    details,
  }
}

/** Build one row per GPU. */
function gpuRow(gpu, options, index, total) {
  if (gpu === null || typeof gpu !== 'object') return null
  const details = []
  if (options.showGpuTemperature !== false && Number.isFinite(gpu.temperature)) {
    details.push({ key: 'temp', text: formatTemperature(gpu.temperature), tone: temperatureSeverity(gpu.temperature) })
  }
  if (options.showGpuMemory !== false && gpu.memory !== null && typeof gpu.memory === 'object') {
    const used = formatBytes(gpu.memory.usedBytes)
    const capacity = formatBytes(gpu.memory.totalBytes)
    if (used !== null) details.push({ key: 'vram', text: capacity === null ? used : `${used} / ${capacity}`, tone: 'muted' })
  }
  if (options.showPower === true && Number.isFinite(gpu.powerWatts)) {
    details.push({ key: 'power', text: formatWatts(gpu.powerWatts), tone: 'muted' })
  }
  return {
    key: `gpu-${gpu.index ?? index}`,
    label: total > 1 ? `GPU${gpu.index ?? index}` : 'GPU',
    caption: shortGpuName(gpu.name) ?? 'GPU',
    percent: Number.isFinite(gpu.usage) ? gpu.usage : null,
    valueText: formatPercent(gpu.usage),
    severity: severityOf(gpu.usage),
    perCore: null,
    cores: null,
    details,
  }
}
