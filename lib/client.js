window.__ModuleLoader__.load({
  id: "dsh-system-monitor",
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  SNAPSHOT_PATH: () => SNAPSHOT_PATH,
  apply: () => apply,
  bindTranslator: () => bindTranslator,
  fetchSnapshot: () => fetchSnapshot,
  inject: () => inject,
  installStyles: () => installStyles
});
module.exports = __toCommonJS(index_exports);
var import_react3 = __toESM(require("react"), 1);
var import_client = require("react-dom/client");

// src/client/model.js
var STORAGE_KEY = "dsh-system-monitor:options";
var LOCALE_NS = "dsh-system-monitor";
var INTERVAL_CHOICES = [1e3, 1500, 2e3, 3e3, 5e3, 1e4];
var DEFAULT_OPTIONS = Object.freeze({
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
  showPower: false
});
var MIN_OPACITY = 0.4;
var MAX_OPACITY = 1;
var MIN_INTERVAL = 500;
var MAX_INTERVAL = 6e4;
var NUMERIC_BOUNDS = {
  opacity: [MIN_OPACITY, MAX_OPACITY],
  intervalMs: [MIN_INTERVAL, MAX_INTERVAL]
};
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
function toBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function normalizeOptions(raw) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  const options = {};
  for (const [key, fallback] of Object.entries(DEFAULT_OPTIONS)) {
    const value = source[key];
    if (typeof fallback === "boolean") {
      options[key] = toBoolean(value, fallback);
    } else if (typeof fallback === "number") {
      const [min, max] = NUMERIC_BOUNDS[key] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
      options[key] = clampNumber(value, min, max, fallback);
    } else if (key === "position") {
      options[key] = normalizePosition(value);
    } else {
      options[key] = value === void 0 ? fallback : value;
    }
  }
  return options;
}
function normalizePosition(value) {
  if (value === null || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
function createSafeStorage(backing) {
  let store = backing;
  if (store === void 0) {
    try {
      store = globalThis.localStorage ?? null;
    } catch {
      store = null;
    }
  }
  const memory = /* @__PURE__ */ new Map();
  const usable = store !== null && typeof store?.getItem === "function";
  return {
    getItem(key) {
      if (usable) {
        try {
          const value = store.getItem(key);
          if (value !== null && value !== void 0) return value;
        } catch {
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      const text = String(value);
      memory.set(key, text);
      if (!usable) return;
      try {
        store.setItem(key, text);
      } catch {
      }
    },
    removeItem(key) {
      memory.delete(key);
      if (!usable) return;
      try {
        store.removeItem(key);
      } catch {
      }
    }
  };
}
function readStored(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}
function writeStored(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
  }
}
function loadOptions(storage) {
  const raw = readStored(storage, STORAGE_KEY);
  if (typeof raw !== "string" || raw === "") return { ...DEFAULT_OPTIONS };
  try {
    return normalizeOptions(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}
function saveOptions(storage, options) {
  writeStored(storage, STORAGE_KEY, JSON.stringify(options));
}
function createOptionsStore(options = {}) {
  const storage = createSafeStorage(options.storage);
  let state = loadOptions(storage);
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    /** Current options object (a stable reference until the next change). */
    getSnapshot: () => state,
    /** Subscribe to changes; returns the unsubscribe. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Merge a patch, normalize, persist, and notify. */
    set(patch) {
      const next = normalizeOptions({ ...state, ...patch });
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      saveOptions(storage, state);
      emit();
    },
    /** Restore defaults (keeping the tile enabled). */
    reset() {
      this.set({ ...DEFAULT_OPTIONS, enabled: true });
    }
  };
}
function clampTilePosition(position, size, viewport) {
  const margin = 4;
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.round(Math.min(maxX, Math.max(margin, position.x))),
    y: Math.round(Math.min(maxY, Math.max(margin, position.y)))
  };
}
function defaultTilePosition(size, viewport) {
  return clampTilePosition(
    { x: viewport.width - size.width - 20, y: 76 },
    size,
    viewport
  );
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`;
  const mib = bytes / 1024 ** 2;
  if (mib >= 1) return `${mib.toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
function formatBytePair(usedBytes, totalBytes) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return formatBytes(usedBytes);
  const gib = totalBytes / 1024 ** 3;
  const useGib = gib >= 1;
  const scale = useGib ? 1024 ** 3 : 1024 ** 2;
  const unit = useGib ? "GB" : "MB";
  const digits = useGib && gib < 100 ? 1 : 0;
  const one = (bytes) => {
    if (!Number.isFinite(bytes)) return "\u2014";
    return bytes === 0 ? "0" : (bytes / scale).toFixed(digits);
  };
  return `${one(usedBytes)}/${one(totalBytes)} ${unit}`;
}
function formatPercent(value) {
  if (!Number.isFinite(value)) return null;
  const clamped = Math.min(100, Math.max(0, value));
  return `${clamped < 10 && clamped > 0 ? clamped.toFixed(1) : Math.round(clamped)}%`;
}
function formatTemperature(celsius) {
  if (!Number.isFinite(celsius)) return null;
  return `${celsius.toFixed(celsius >= 100 ? 0 : 1).replace(/\.0$/, "")}\xB0C`;
}
function formatWatts(watts) {
  if (!Number.isFinite(watts)) return null;
  return `${watts.toFixed(watts >= 100 ? 0 : 1)} W`;
}
function severityOf(percent) {
  if (!Number.isFinite(percent)) return "unknown";
  if (percent >= 90) return "hot";
  if (percent >= 70) return "warn";
  return "ok";
}
function temperatureSeverity(celsius) {
  if (!Number.isFinite(celsius)) return "unknown";
  if (celsius >= 90) return "hot";
  if (celsius >= 75) return "warn";
  return "ok";
}
function shortCpuName(model) {
  if (typeof model !== "string" || model.trim() === "") return null;
  let text = model.trim();
  text = text.replace(/\s*\((?:R|TM|C)\)/gi, "");
  text = text.replace(/\s+(w\/|with)\s+.*$/i, "");
  text = text.replace(/\s+(CPU|Processor)\s*@.*$/i, "");
  text = text.replace(/^(AMD|Intel|Apple|Qualcomm)\s+/i, "");
  text = text.replace(/\s+\d+-Core\s+Processor$/i, "");
  return text.trim() === "" ? null : text.trim();
}
function shortGpuName(name) {
  if (typeof name !== "string" || name.trim() === "") return null;
  let text = name.trim();
  text = text.replace(/\s*\((?:R|TM|C)\)/gi, "");
  text = text.replace(/^(NVIDIA|AMD|ATI|Intel|Apple|Advanced Micro Devices(,? Inc\.?)?)\s+/i, "");
  text = text.replace(/^GeForce\s+/i, "");
  text = text.replace(/\s+(Laptop GPU|Laptop|Mobile|Desktop|Graphics Adapter|GPU)$/i, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > 22 ? `${text.slice(0, 21)}\u2026` : text;
}
function buildViewModel(snapshot, options) {
  const resolved = options ?? DEFAULT_OPTIONS;
  if (snapshot === null || typeof snapshot !== "object") {
    return { ok: false, rows: [], errors: [], updatedAt: null, host: null };
  }
  const rows = [];
  if (resolved.showCpu !== false) rows.push(cpuRow(snapshot.cpu, resolved));
  if (resolved.showMemory !== false) rows.push(memoryRow(snapshot.memory));
  if (resolved.showGpu !== false) {
    const gpus = Array.isArray(snapshot.gpus) ? snapshot.gpus : [];
    gpus.forEach((gpu, index) => rows.push(gpuRow(gpu, resolved, index, gpus.length)));
  }
  return {
    ok: true,
    rows: rows.filter((row) => row !== null),
    errors: Array.isArray(snapshot.errors) ? snapshot.errors : [],
    updatedAt: Number.isFinite(snapshot.ts) ? snapshot.ts : null,
    host: snapshot.host ?? null
  };
}
function cpuRow(cpu, options) {
  if (cpu === null || typeof cpu !== "object") return null;
  const details = [];
  if (options.showCpuTemperature !== false && Number.isFinite(cpu.temperature)) {
    details.push({ key: "temp", text: formatTemperature(cpu.temperature), tone: temperatureSeverity(cpu.temperature) });
  }
  const cores = Number.isFinite(cpu.cores) ? cpu.cores : null;
  const model = typeof cpu.model === "string" ? cpu.model.trim() : "";
  return {
    key: "cpu",
    label: "CPU",
    caption: shortCpuName(cpu.model),
    // The full model string and core count live in the tooltip, so the visible
    // line stays short without throwing the information away.
    captionTitle: [model, cores === null ? null : `${cores} threads`].filter(Boolean).join(" \xB7 "),
    valueText: formatPercent(cpu.usage),
    severity: severityOf(cpu.usage),
    details
  };
}
function memoryRow(memory) {
  if (memory === null || typeof memory !== "object") return null;
  const size = formatBytePair(memory.usedBytes, memory.totalBytes);
  const details = [];
  if (size !== null) details.push({ key: "size", text: size, tone: "muted" });
  return {
    key: "memory",
    label: "MEM",
    caption: null,
    captionTitle: null,
    valueText: formatPercent(memory.usage),
    severity: severityOf(memory.usage),
    details
  };
}
function gpuRow(gpu, options, index, total) {
  if (gpu === null || typeof gpu !== "object") return null;
  const details = [];
  if (options.showGpuTemperature !== false && Number.isFinite(gpu.temperature)) {
    details.push({ key: "temp", text: formatTemperature(gpu.temperature), tone: temperatureSeverity(gpu.temperature) });
  }
  if (options.showGpuMemory !== false && gpu.memory !== null && typeof gpu.memory === "object") {
    const size = formatBytePair(gpu.memory.usedBytes, gpu.memory.totalBytes);
    if (size !== null) details.push({ key: "vram", text: size, tone: "muted" });
  }
  if (options.showPower === true && Number.isFinite(gpu.powerWatts)) {
    details.push({ key: "power", text: formatWatts(gpu.powerWatts), tone: "muted" });
  }
  return {
    key: `gpu-${gpu.index ?? index}`,
    label: total > 1 ? `GPU${gpu.index ?? index}` : "GPU",
    caption: shortGpuName(gpu.name) ?? "GPU",
    captionTitle: typeof gpu.name === "string" ? gpu.name : null,
    valueText: formatPercent(gpu.usage),
    severity: severityOf(gpu.usage),
    details
  };
}

// src/client/styles.js
var STYLE_ELEMENT_ID = "dsh-system-monitor-styles";
var TILE_Z_INDEX = 900;
var CSS = `
.dsm-tile{
  position:fixed;pointer-events:auto;box-sizing:border-box;
  z-index:${TILE_Z_INDEX};
  display:flex;flex-direction:column;
  width:300px;max-height:calc(100vh - 24px);overflow:hidden;
  border-radius:10px;border:1px solid var(--dsm-border);
  background:var(--dsm-bg);
  background:color-mix(in srgb, var(--dsm-bg) 94%, transparent);
  color:var(--dsm-fg);
  backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);
  box-shadow:0 8px 24px rgba(0,0,0,.16);
  font:12px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  user-select:none;-webkit-user-select:none;

  /* DSH design tokens, each with a standalone fallback. */
  --dsm-bg:var(--dsw-alias-bg-layer-2,#ffffff);
  --dsm-head:var(--dsw-alias-bg-layer-3,#f4f5f7);
  --dsm-fg:var(--dsw-alias-label-primary,#1a1c21);
  --dsm-muted:var(--dsw-alias-label-secondary,#5f6673);
  --dsm-subtle:var(--dsw-alias-label-tertiary,#8a9099);
  --dsm-border:var(--dsw-alias-border-l2,rgba(0,0,0,.12));
  --dsm-hover:var(--dsw-alias-bg-overlay,rgba(127,127,127,.14));
  --dsm-ok:var(--dsw-alias-state-success-primary,#2ea043);
  --dsm-warn:var(--dsw-alias-state-warn-primary,#d29922);
  --dsm-hot:var(--dsw-alias-state-error-primary,#e5484d);
}
.dsm-tile[data-dragging]{cursor:grabbing}
.dsm-head{
  display:flex;align-items:center;gap:6px;flex:0 0 auto;
  padding:6px 8px 6px 10px;background:var(--dsm-head);
  border-bottom:1px solid var(--dsm-border);cursor:grab;touch-action:none
}
.dsm-grip{display:flex;flex-direction:column;gap:2px;opacity:.4;flex:0 0 auto}
.dsm-grip i{display:block;width:10px;height:1px;background:currentColor;border-radius:1px}
.dsm-title{
  flex:1 1 auto;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
  color:var(--dsm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
.dsm-btn{
  flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:20px;height:20px;padding:0;border:0;border-radius:5px;cursor:pointer;
  background:transparent;color:var(--dsm-muted);font:inherit;line-height:1
}
.dsm-btn:hover{background:var(--dsm-hover);color:var(--dsm-fg)}
.dsm-btn[data-spin="1"] svg{animation:dsm-spin .9s linear infinite}
@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:4px 10px 6px}
.dsm-tile[data-compact="1"] .dsm-body{padding:2px 9px 4px}
.dsm-row{display:flex;align-items:baseline;gap:8px;padding:5px 0;white-space:nowrap}
.dsm-tile[data-compact="1"] .dsm-row{padding:2px 0}
.dsm-row + .dsm-row{border-top:1px solid var(--dsm-border)}
.dsm-label{flex:0 0 30px;font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--dsm-subtle)}
.dsm-caption{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dsm-muted);font-size:11.5px}
.dsm-readout{flex:0 0 auto;display:flex;align-items:baseline;gap:9px;font-variant-numeric:tabular-nums}
.dsm-value{min-width:34px;text-align:right;font-weight:600;color:var(--dsm-fg)}
.dsm-value.dsm-warn{color:var(--dsm-warn)}
.dsm-value.dsm-hot{color:var(--dsm-hot)}
.dsm-value.dsm-unknown{color:var(--dsm-subtle);font-weight:400}
.dsm-detail{color:var(--dsm-muted);font-size:11px;text-align:right}
.dsm-detail.dsm-warn{color:var(--dsm-warn)}
.dsm-detail.dsm-hot{color:var(--dsm-hot)}
.dsm-note{padding:5px 0;color:var(--dsm-subtle);font-size:11px}
.dsm-err{color:var(--dsm-hot)}
.dsm-foot{
  display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:1px;
  padding-top:5px;border-top:1px solid var(--dsm-border);font-size:10px;color:var(--dsm-subtle)
}
.dsm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dsm-ok);margin-right:5px;vertical-align:middle}
.dsm-dot[data-status="error"]{background:var(--dsm-hot)}
.dsm-dot[data-status="loading"]{background:var(--dsm-warn)}
.dsm-settings{display:flex;flex-direction:column;gap:10px;padding:2px 0 6px;font-size:12px}
.dsm-field{display:flex;align-items:center;gap:8px}
.dsm-field > label{min-width:132px;opacity:.8}
.dsm-settings select,.dsm-settings input[type="range"]{flex:1 1 auto;max-width:220px}
.dsm-settings select{
  padding:3px 6px;border-radius:6px;font:inherit;color:inherit;background:transparent;
  border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35))
}
.dsm-check{display:flex;align-items:center;gap:7px}
.dsm-check input{margin:0}
.dsm-hint{opacity:.62;font-size:11px;line-height:1.5}
.dsm-buttons{display:flex;gap:8px;flex-wrap:wrap}
.dsm-buttons button{
  padding:4px 10px;border-radius:6px;font:inherit;cursor:pointer;color:inherit;background:transparent;
  border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35))
}
.dsm-buttons button:hover{background:var(--dsw-alias-bg-overlay,rgba(127,127,127,.14))}
@media (prefers-reduced-motion:reduce){
  .dsm-btn[data-spin="1"] svg{animation:none}
}
`;

// src/client/tile.jsx
var import_react = __toESM(require("react"), 1);
function useOptions(store) {
  return (0, import_react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
}
function Tile({ store, t, client }) {
  const options = useOptions(store);
  const tileRef = (0, import_react.useRef)(null);
  const [snapshot, setSnapshot] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [request, setRequest] = (0, import_react.useState)({ id: 0, force: false });
  const [viewport, setViewport] = (0, import_react.useState)(() => readViewport());
  const [measured, setMeasured] = (0, import_react.useState)({ width: 300, height: 120 });
  const [dragPosition, setDragPosition] = (0, import_react.useState)(null);
  const [dragging, setDragging] = (0, import_react.useState)(false);
  const drag = (0, import_react.useRef)(null);
  const pendingPoint = (0, import_react.useRef)(null);
  const rafHandle = (0, import_react.useRef)(0);
  (0, import_react.useEffect)(() => {
    if (options.enabled !== true) return void 0;
    let cancelled = false;
    let timer = null;
    const run = async (force) => {
      try {
        const data = await client.fetchSnapshot(force === true);
        if (cancelled) return;
        setSnapshot(data);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    };
    void run(request.force);
    timer = globalThis.setInterval(() => {
      if (globalThis.document?.hidden !== true) void run(false);
    }, options.intervalMs);
    const onVisibility = () => {
      if (globalThis.document?.hidden !== true) void run(false);
    };
    globalThis.document?.addEventListener?.("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) globalThis.clearInterval(timer);
      globalThis.document?.removeEventListener?.("visibilitychange", onVisibility);
    };
  }, [client, options.enabled, options.intervalMs, request]);
  (0, import_react.useEffect)(() => {
    const onResize = () => {
      setViewport(readViewport());
      setDragPosition(null);
    };
    globalThis.addEventListener?.("resize", onResize);
    return () => globalThis.removeEventListener?.("resize", onResize);
  }, []);
  const viewModel = (0, import_react.useMemo)(() => buildViewModel(snapshot, options), [snapshot, options]);
  (0, import_react.useLayoutEffect)(() => {
    const node = tileRef.current;
    if (node === null || typeof node.getBoundingClientRect !== "function") return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setMeasured(
      (previous) => Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5 ? previous : { width: rect.width, height: rect.height }
    );
  }, [viewModel.rows.length, options.collapsed, options.compact, status]);
  const onPointerDown = (0, import_react.useCallback)((event) => {
    if (event.button !== 0) return;
    const node = tileRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    drag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, position: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);
  const onPointerMove = (0, import_react.useCallback)((event) => {
    const state = drag.current;
    if (state === null) return;
    pendingPoint.current = { x: event.clientX - state.offsetX, y: event.clientY - state.offsetY };
    if (rafHandle.current !== 0) return;
    const flush = () => {
      rafHandle.current = 0;
      const point = pendingPoint.current;
      if (point === null || drag.current === null) return;
      const node = tileRef.current;
      const rect = node?.getBoundingClientRect?.() ?? measured;
      const next = clampTilePosition(point, rect, readViewport());
      drag.current.position = next;
      setDragging(true);
      setDragPosition(next);
    };
    rafHandle.current = globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(flush) : (flush(), 0);
  }, [measured]);
  const endDrag = (0, import_react.useCallback)(() => {
    const state = drag.current;
    drag.current = null;
    pendingPoint.current = null;
    if (rafHandle.current !== 0) {
      globalThis.cancelAnimationFrame?.(rafHandle.current);
      rafHandle.current = 0;
    }
    setDragging(false);
    if (state?.position != null) store.set({ position: state.position });
    setDragPosition(null);
  }, [store]);
  const onDoubleClick = (0, import_react.useCallback)(() => {
    store.set({ collapsed: !options.collapsed });
  }, [options.collapsed, store]);
  const position = (0, import_react.useMemo)(() => {
    if (dragPosition !== null) return dragPosition;
    if (options.position !== null) return clampTilePosition(options.position, measured, viewport);
    return defaultTilePosition(measured, viewport);
  }, [dragPosition, options.position, measured, viewport]);
  if (options.enabled !== true) return null;
  const updatedText = viewModel.updatedAt === null ? t("never") : t("updatedAt", { time: formatClock(viewModel.updatedAt) });
  const statusText = status === "error" ? t("offline") : viewModel.host?.hostname ?? t("title");
  return /* @__PURE__ */ import_react.default.createElement(
    "section",
    {
      ref: tileRef,
      className: "dsm-tile",
      "data-compact": options.compact === true ? "1" : "0",
      "data-dragging": dragging ? "1" : void 0,
      style: { left: `${position.x}px`, top: `${position.y}px`, opacity: options.opacity },
      "aria-label": t("title")
    },
    /* @__PURE__ */ import_react.default.createElement(
      "header",
      {
        className: "dsm-head",
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onDoubleClick
      },
      /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-grip", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("i", null), /* @__PURE__ */ import_react.default.createElement("i", null), /* @__PURE__ */ import_react.default.createElement("i", null)),
      /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-title" }, t("title")),
      /* @__PURE__ */ import_react.default.createElement(
        "button",
        {
          type: "button",
          className: "dsm-btn",
          "data-spin": status === "loading" ? "1" : "0",
          title: t("refresh"),
          "aria-label": t("refresh"),
          onPointerDown: stopPointer,
          onClick: () => setRequest((previous) => ({ id: previous.id + 1, force: true }))
        },
        /* @__PURE__ */ import_react.default.createElement(RefreshIcon, null)
      ),
      /* @__PURE__ */ import_react.default.createElement(
        "button",
        {
          type: "button",
          className: "dsm-btn",
          title: options.collapsed ? t("expand") : t("collapse"),
          "aria-label": options.collapsed ? t("expand") : t("collapse"),
          "aria-expanded": options.collapsed !== true,
          onPointerDown: stopPointer,
          onClick: () => store.set({ collapsed: !options.collapsed })
        },
        /* @__PURE__ */ import_react.default.createElement(ChevronIcon, { collapsed: options.collapsed === true })
      ),
      /* @__PURE__ */ import_react.default.createElement(
        "button",
        {
          type: "button",
          className: "dsm-btn",
          title: t("hide"),
          "aria-label": t("hide"),
          onPointerDown: stopPointer,
          onClick: () => store.set({ enabled: false })
        },
        /* @__PURE__ */ import_react.default.createElement(CloseIcon, null)
      )
    ),
    options.collapsed === true ? null : /* @__PURE__ */ import_react.default.createElement("div", { className: "dsm-body" }, viewModel.ok !== true && status === "loading" ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dsm-note" }, t("loading")) : null, viewModel.ok !== true && status === "error" ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dsm-note dsm-err" }, t("hostUnavailable")) : null, viewModel.rows.map((row) => /* @__PURE__ */ import_react.default.createElement(Row, { key: row.key, row })), viewModel.ok === true && options.showGpu === true && (snapshot?.gpus?.length ?? 0) === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dsm-note" }, t("noGpu")) : null, /* @__PURE__ */ import_react.default.createElement("footer", { className: "dsm-foot" }, /* @__PURE__ */ import_react.default.createElement("span", null, /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-dot", "data-status": status }), statusText), /* @__PURE__ */ import_react.default.createElement("span", null, updatedText)))
  );
}
function Row({ row }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dsm-row" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-label" }, row.label), /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-caption", title: row.captionTitle ?? void 0 }, row.caption ?? ""), /* @__PURE__ */ import_react.default.createElement("span", { className: "dsm-readout" }, /* @__PURE__ */ import_react.default.createElement("span", { className: `dsm-value dsm-${row.severity}` }, row.valueText ?? "\u2014"), row.details.map((detail) => /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      key: detail.key,
      className: detail.tone === "muted" || detail.tone === "ok" ? "dsm-detail" : `dsm-detail dsm-${detail.tone}`
    },
    detail.text
  ))));
}
function stopPointer(event) {
  event.stopPropagation();
}
function readViewport() {
  return {
    width: globalThis.innerWidth ?? 1280,
    height: globalThis.innerHeight ?? 800
  };
}
function formatClock(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return "";
  }
}
function RefreshIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ));
}
function ChevronIcon({ collapsed }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: collapsed ? "M4 6.5 8 10.5l4-4" : "M4 9.5 8 5.5l4 4",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ));
}
function CloseIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4.5 4.5l7 7m0-7-7 7", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }));
}

// src/client/settings.jsx
var import_react2 = __toESM(require("react"), 1);
var TOGGLES = [
  ["showCpu", "showCpu"],
  ["showCpuTemperature", "showCpuTemperature"],
  ["showMemory", "showMemory"],
  ["showGpu", "showGpu"],
  ["showGpuTemperature", "showGpuTemperature"],
  ["showGpuMemory", "showGpuMemory"],
  ["showPower", "showPower"]
];
function SettingsSection({ store, t }) {
  const options = useOptions(store);
  const set = (patch) => store.set(patch);
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsm-settings" }, /* @__PURE__ */ import_react2.default.createElement("p", { className: "dsm-hint" }, t("settingsHint")), /* @__PURE__ */ import_react2.default.createElement("label", { className: "dsm-check" }, /* @__PURE__ */ import_react2.default.createElement("input", { type: "checkbox", checked: options.enabled === true, onChange: (event) => set({ enabled: event.target.checked }) }), /* @__PURE__ */ import_react2.default.createElement("span", null, t("enable"))), /* @__PURE__ */ import_react2.default.createElement("p", { className: "dsm-hint" }, t("enableHint")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsm-field" }, /* @__PURE__ */ import_react2.default.createElement("label", { htmlFor: "dsm-interval" }, t("interval")), /* @__PURE__ */ import_react2.default.createElement(
    "select",
    {
      id: "dsm-interval",
      value: String(options.intervalMs),
      onChange: (event) => set({ intervalMs: Number(event.target.value) })
    },
    INTERVAL_CHOICES.map((milliseconds) => /* @__PURE__ */ import_react2.default.createElement("option", { key: milliseconds, value: String(milliseconds) }, t("intervalSecond", { n: milliseconds / 1e3 })))
  )), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsm-field" }, /* @__PURE__ */ import_react2.default.createElement("label", { htmlFor: "dsm-opacity" }, t("opacity")), /* @__PURE__ */ import_react2.default.createElement(
    "input",
    {
      id: "dsm-opacity",
      type: "range",
      min: "40",
      max: "100",
      step: "1",
      value: String(Math.round(options.opacity * 100)),
      onChange: (event) => set({ opacity: Number(event.target.value) / 100 })
    }
  )), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("p", { className: "dsm-hint" }, t("sections")), TOGGLES.map(([key, labelKey]) => /* @__PURE__ */ import_react2.default.createElement("label", { className: "dsm-check", key, htmlFor: `dsm-toggle-${key}` }, /* @__PURE__ */ import_react2.default.createElement(
    "input",
    {
      id: `dsm-toggle-${key}`,
      type: "checkbox",
      checked: options[key] === true,
      onChange: (event) => set({ [key]: event.target.checked })
    }
  ), /* @__PURE__ */ import_react2.default.createElement("span", null, t(labelKey))))), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("p", { className: "dsm-hint" }, t("appearance")), /* @__PURE__ */ import_react2.default.createElement("label", { className: "dsm-check", htmlFor: "dsm-compact" }, /* @__PURE__ */ import_react2.default.createElement(
    "input",
    {
      id: "dsm-compact",
      type: "checkbox",
      checked: options.compact === true,
      onChange: (event) => set({ compact: event.target.checked })
    }
  ), /* @__PURE__ */ import_react2.default.createElement("span", null, t("compact")))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsm-buttons" }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => set({ position: null }) }, t("resetPosition")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => store.reset() }, t("resetAll"))));
}

// src/client/locales.js
var zh = {
  title: "\u7CFB\u7EDF\u76D1\u89C6",
  settingsTitle: "\u7CFB\u7EDF\u76D1\u89C6\u78C1\u8D34",
  settingsHint: "\u60AC\u6D6E\u78C1\u8D34\u663E\u793A\u672C\u673A CPU\u3001\u5185\u5B58\u4E0E\u6240\u6709 GPU \u7684\u5360\u7528\u7387\uFF1B\u6E29\u5EA6\u6765\u81EA Windows ACPI \u70ED\u533A\u8BA1\u6570\u5668\u6216 Linux \u5185\u6838\u4F20\u611F\u5668\uFF0C\u663E\u5B58\u4E0E\u529F\u8017\u6765\u81EA\u5382\u5546\u5DE5\u5177\uFF08\u5982 nvidia-smi\uFF09\u3002\u6240\u6709\u6570\u636E\u4EC5\u5728\u672C\u673A\u56DE\u73AF\u5730\u5740\u4E0A\u8BFB\u53D6\u3002",
  enable: "\u663E\u793A\u60AC\u6D6E\u78C1\u8D34",
  enableHint: "\u5173\u95ED\u540E\u78C1\u8D34\u4F1A\u9690\u85CF\uFF0C\u53EF\u968F\u65F6\u5728\u6B64\u91CD\u65B0\u6253\u5F00\u3002",
  interval: "\u5237\u65B0\u95F4\u9694",
  intervalSecond: "{n} \u79D2",
  opacity: "\u4E0D\u900F\u660E\u5EA6",
  sections: "\u663E\u793A\u5185\u5BB9",
  showCpu: "CPU",
  showCpuTemperature: "CPU \u6E29\u5EA6",
  showMemory: "\u5185\u5B58",
  showGpu: "GPU",
  showGpuTemperature: "GPU \u6E29\u5EA6",
  showGpuMemory: "\u663E\u5B58",
  showPower: "GPU \u529F\u8017",
  appearance: "\u5916\u89C2",
  compact: "\u7D27\u51D1\u6A21\u5F0F",
  resetPosition: "\u91CD\u7F6E\u4F4D\u7F6E",
  resetAll: "\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E",
  refresh: "\u7ACB\u5373\u5237\u65B0",
  collapse: "\u6298\u53E0",
  expand: "\u5C55\u5F00",
  hide: "\u9690\u85CF\u78C1\u8D34",
  show: "\u663E\u793A\u76D1\u89C6\u78C1\u8D34",
  openSettings: "\u6253\u5F00\u8BBE\u7F6E",
  loading: "\u8BFB\u53D6\u4E2D\u2026",
  offline: "\u65E0\u6CD5\u8FDE\u63A5\u5BBF\u4E3B\uFF0C\u91CD\u8BD5\u4E2D",
  noGpu: "\u672A\u68C0\u6D4B\u5230 GPU",
  updatedAt: "\u66F4\u65B0\u4E8E {time}",
  never: "\u5C1A\u672A\u66F4\u65B0",
  hostUnavailable: "\u5BBF\u4E3B\u63D2\u4EF6\u672A\u54CD\u5E94",
  pluginsDisabled: "\u4E0D\u652F\u6301\u6B64\u754C\u9762"
};
var en = {
  title: "System monitor",
  settingsTitle: "System monitor tile",
  settingsHint: "The floating tile shows live CPU, memory and every GPU on this machine. Temperatures come from Windows ACPI thermal-zone counters or Linux kernel sensors; VRAM and power come from vendor tools such as nvidia-smi. Every reading is served over loopback only.",
  enable: "Show the floating tile",
  enableHint: "Turning this off hides the tile; reopen it here at any time.",
  interval: "Refresh interval",
  intervalSecond: "{n}s",
  opacity: "Opacity",
  sections: "Sections",
  showCpu: "CPU",
  showCpuTemperature: "CPU temperature",
  showMemory: "Memory",
  showGpu: "GPU",
  showGpuTemperature: "GPU temperature",
  showGpuMemory: "VRAM",
  showPower: "GPU power draw",
  appearance: "Appearance",
  compact: "Compact mode",
  resetPosition: "Reset position",
  resetAll: "Restore defaults",
  refresh: "Refresh now",
  collapse: "Collapse",
  expand: "Expand",
  hide: "Hide the tile",
  show: "Show the system monitor",
  openSettings: "Open settings",
  loading: "Reading\u2026",
  offline: "Host unreachable, retrying",
  noGpu: "No GPU detected",
  updatedAt: "Updated {time}",
  never: "Not updated yet",
  hostUnavailable: "Host plugin not answering",
  pluginsDisabled: "Not supported in this interface"
};
function format(template, params) {
  if (params === void 0) return template;
  return String(template).replace(
    /\{(\w+)\}/g,
    (match, key) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}
function bindDictionary(dictionary) {
  return (key, params) => {
    const template = dictionary[key];
    if (typeof template !== "string") return key;
    return format(template, params);
  };
}

// src/client/index.jsx
var SNAPSHOT_PATH = "/api/dsh-system-monitor/snapshot";
var inject = ["slots", "locale"];
var CONTAINER_ID = "dsh-system-monitor-root";
function apply(ctx) {
  const doc = globalThis.document;
  if (doc === void 0 || doc === null) return;
  installStyles(doc);
  const store = createOptionsStore({});
  const t = bindTranslator(ctx);
  const client = { fetchSnapshot };
  const container = doc.createElement("div");
  container.id = CONTAINER_ID;
  const host = doc.body ?? doc.documentElement;
  if (host === null) return;
  host.appendChild(container);
  const root = (0, import_client.createRoot)(container);
  root.render(import_react3.default.createElement(Tile, { store, t, client }));
  ctx.effect(
    () => () => {
      root.unmount();
      container.remove();
    },
    "dsh-system-monitor: tile"
  );
  ctx.effect(
    () => ctx.slots?.inject?.(
      "settings.section",
      () => ctx.slots.register(
        {
          name: "settings.section",
          id: "system-monitor",
          order: 60,
          label: () => t("settingsTitle"),
          inject: () => ({ store, t })
        },
        SettingsSection
      )
    ),
    "dsh-system-monitor: settings section"
  );
}
function installStyles(doc) {
  if (doc.getElementById(STYLE_ELEMENT_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
function bindTranslator(ctx) {
  try {
    if (typeof ctx?.locale?.register === "function" && typeof ctx?.locale?.bind === "function") {
      ctx.effect?.(() => ctx.locale.register(LOCALE_NS, { zh, en }), "dsh-system-monitor: dictionaries");
      return ctx.locale.bind(LOCALE_NS);
    }
  } catch {
  }
  const language = String(globalThis.navigator?.language ?? "en").toLowerCase();
  return bindDictionary(language.startsWith("zh") ? zh : en);
}
async function fetchSnapshot(force = false) {
  const url = force ? `${SNAPSHOT_PATH}?refresh=1` : SNAPSHOT_PATH;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin"
  });
  if (response.ok !== true) throw new Error(`snapshot request failed with ${response.status}`);
  const data = await response.json();
  if (data === null || typeof data !== "object" || data.ok !== true) throw new Error("malformed snapshot payload");
  return data;
}

    return module.exports
  }
})
