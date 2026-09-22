import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { buildViewModel, clampTilePosition, defaultTilePosition } from './model.js'

/** Subscribe a component to the shared options store. */
export function useOptions(store) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/**
 * The floating tile.
 *
 * Rendered into a body-attached container rather than a slot: the DSH web shell
 * renders exactly one slot (`root`, owned by the three-column AppFrame), so
 * there is no overlay seat to register into, and a `position: fixed` element is
 * what "floating tile" actually means here.
 *
 * @param props.store - the shared options store.
 * @param props.t - locale-bound translator.
 * @param props.client - `{ fetchSnapshot(force) }`.
 */
export function Tile({ store, t, client }) {
  const options = useOptions(store)
  const tileRef = useRef(null)

  const [snapshot, setSnapshot] = useState(null)
  const [status, setStatus] = useState('loading')
  const [request, setRequest] = useState({ id: 0, force: false })
  const [viewport, setViewport] = useState(() => readViewport())
  const [measured, setMeasured] = useState({ width: 300, height: 120 })
  const [dragPosition, setDragPosition] = useState(null)
  const [dragging, setDragging] = useState(false)

  const drag = useRef(null)
  const pendingPoint = useRef(null)
  const rafHandle = useRef(0)

  // --- polling ---------------------------------------------------------------

  useEffect(() => {
    if (options.enabled !== true) return undefined
    let cancelled = false
    let timer = null

    const run = async (force) => {
      try {
        const data = await client.fetchSnapshot(force === true)
        if (cancelled) return
        setSnapshot(data)
        setStatus('ready')
      } catch {
        if (cancelled) return
        // Keep the last good snapshot on screen; the badge shows the outage.
        setStatus('error')
      }
    }

    void run(request.force)
    timer = globalThis.setInterval(() => {
      if (globalThis.document?.hidden !== true) void run(false)
    }, options.intervalMs)

    const onVisibility = () => {
      if (globalThis.document?.hidden !== true) void run(false)
    }
    globalThis.document?.addEventListener?.('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (timer !== null) globalThis.clearInterval(timer)
      globalThis.document?.removeEventListener?.('visibilitychange', onVisibility)
    }
  }, [client, options.enabled, options.intervalMs, request])

  // --- environment tracking --------------------------------------------------

  useEffect(() => {
    const onResize = () => {
      setViewport(readViewport())
      setDragPosition(null)
    }
    globalThis.addEventListener?.('resize', onResize)
    return () => globalThis.removeEventListener?.('resize', onResize)
  }, [])

  // Measure after every layout that can change the tile's height.
  const viewModel = useMemo(() => buildViewModel(snapshot, options), [snapshot, options])
  useLayoutEffect(() => {
    const node = tileRef.current
    if (node === null || typeof node.getBoundingClientRect !== 'function') return
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    setMeasured((previous) =>
      Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
        ? previous
        : { width: rect.width, height: rect.height }
    )
  }, [viewModel.rows.length, options.collapsed, options.compact, status])

  // --- dragging --------------------------------------------------------------

  const onPointerDown = useCallback((event) => {
    if (event.button !== 0) return
    const node = tileRef.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    drag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, position: null }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }, [])

  const onPointerMove = useCallback((event) => {
    const state = drag.current
    if (state === null) return
    pendingPoint.current = { x: event.clientX - state.offsetX, y: event.clientY - state.offsetY }
    if (rafHandle.current !== 0) return
    const flush = () => {
      rafHandle.current = 0
      const point = pendingPoint.current
      if (point === null || drag.current === null) return
      const node = tileRef.current
      const rect = node?.getBoundingClientRect?.() ?? measured
      const next = clampTilePosition(point, rect, readViewport())
      drag.current.position = next
      setDragging(true)
      setDragPosition(next)
    }
    rafHandle.current = globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(flush) : (flush(), 0)
  }, [measured])

  const endDrag = useCallback(() => {
    const state = drag.current
    drag.current = null
    pendingPoint.current = null
    if (rafHandle.current !== 0) {
      globalThis.cancelAnimationFrame?.(rafHandle.current)
      rafHandle.current = 0
    }
    setDragging(false)
    if (state?.position != null) store.set({ position: state.position })
    setDragPosition(null)
  }, [store])

  const onDoubleClick = useCallback(() => {
    store.set({ collapsed: !options.collapsed })
  }, [options.collapsed, store])

  // --- derived render state --------------------------------------------------

  const position = useMemo(() => {
    if (dragPosition !== null) return dragPosition
    if (options.position !== null) return clampTilePosition(options.position, measured, viewport)
    return defaultTilePosition(measured, viewport)
  }, [dragPosition, options.position, measured, viewport])

  if (options.enabled !== true) return null

  const updatedText =
    viewModel.updatedAt === null ? t('never') : t('updatedAt', { time: formatClock(viewModel.updatedAt) })
  const statusText = status === 'error' ? t('offline') : (viewModel.host?.hostname ?? t('title'))

  return (
    <section
      ref={tileRef}
      className="dsm-tile"
      data-compact={options.compact === true ? '1' : '0'}
      data-dragging={dragging ? '1' : undefined}
      style={{ left: `${position.x}px`, top: `${position.y}px`, opacity: options.opacity }}
      aria-label={t('title')}
    >
      <header
        className="dsm-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <span className="dsm-grip" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="dsm-title">{t('title')}</span>
        <button
          type="button"
          className="dsm-btn"
          data-spin={status === 'loading' ? '1' : '0'}
          title={t('refresh')}
          aria-label={t('refresh')}
          onPointerDown={stopPointer}
          onClick={() => setRequest((previous) => ({ id: previous.id + 1, force: true }))}
        >
          <RefreshIcon />
        </button>
        <button
          type="button"
          className="dsm-btn"
          title={options.collapsed ? t('expand') : t('collapse')}
          aria-label={options.collapsed ? t('expand') : t('collapse')}
          aria-expanded={options.collapsed !== true}
          onPointerDown={stopPointer}
          onClick={() => store.set({ collapsed: !options.collapsed })}
        >
          <ChevronIcon collapsed={options.collapsed === true} />
        </button>
        <button
          type="button"
          className="dsm-btn"
          title={t('hide')}
          aria-label={t('hide')}
          onPointerDown={stopPointer}
          onClick={() => store.set({ enabled: false })}
        >
          <CloseIcon />
        </button>
      </header>

      {options.collapsed === true ? null : (
        <div className="dsm-body">
          {viewModel.ok !== true && status === 'loading' ? <p className="dsm-note">{t('loading')}</p> : null}
          {viewModel.ok !== true && status === 'error' ? <p className="dsm-note dsm-err">{t('hostUnavailable')}</p> : null}

          {viewModel.rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}

          {viewModel.ok === true && options.showGpu === true && (snapshot?.gpus?.length ?? 0) === 0 ? (
            <p className="dsm-note">{t('noGpu')}</p>
          ) : null}

          <footer className="dsm-foot">
            <span>
              <span className="dsm-dot" data-status={status} />
              {statusText}
            </span>
            <span>{updatedText}</span>
          </footer>
        </div>
      )}
    </section>
  )
}

/**
 * One metric line: label, caption, headline value, then trailing details.
 *
 * Text only — no bar, gauge or sparkline. Everything is on a single baseline row
 * so the numeric columns line up down the tile; the caption is the only element
 * allowed to shrink, and its full text stays reachable through the tooltip.
 */
function Row({ row }) {
  return (
    <div className="dsm-row">
      <span className="dsm-label">{row.label}</span>
      <span className="dsm-caption" title={row.captionTitle ?? undefined}>
        {row.caption ?? ''}
      </span>
      <span className="dsm-readout">
        <span className={`dsm-value dsm-${row.severity}`}>{row.valueText ?? '—'}</span>
        {row.details.map((detail) => (
          <span
            key={detail.key}
            className={detail.tone === 'muted' || detail.tone === 'ok' ? 'dsm-detail' : `dsm-detail dsm-${detail.tone}`}
          >
            {detail.text}
          </span>
        ))}
      </span>
    </div>
  )
}

/** Keep a header button's press from starting a drag. */
function stopPointer(event) {
  event.stopPropagation()
}

/** Read the viewport size, with a sane fallback for non-browser hosts. */
function readViewport() {
  return {
    width: globalThis.innerWidth ?? 1280,
    height: globalThis.innerHeight ?? 800,
  }
}

/** `HH:MM:SS` in the user's locale for the "updated at" footer. */
function formatClock(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString()
  } catch {
    return ''
  }
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon({ collapsed }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={collapsed ? 'M4 6.5 8 10.5l4-4' : 'M4 9.5 8 5.5l4 4'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
