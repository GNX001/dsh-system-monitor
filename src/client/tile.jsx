import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { buildViewModel, clampTilePosition, defaultTilePosition } from './model.js'
import { GRIP_GLYPH, ITEM_SEPARATOR } from './styles.js'

/** Subscribe a component to the shared options store. */
export function useOptions(store) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/**
 * The floating status capsule.
 *
 * Rendered into a body-attached container rather than a slot: the DSH web shell
 * renders exactly one slot (`root`, owned by the three-column AppFrame), so there
 * is no overlay seat to register into, and a `position: fixed` element is what
 * "floating" means here.
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
  const [measured, setMeasured] = useState({ width: 620, height: 30 })
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
        // Keep the last good reading on screen; the status dot shows the outage.
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

  // Measure after every layout that can change the capsule's size.
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
  }, [viewModel.rows.length, options.compact, status])

  // --- dragging --------------------------------------------------------------

  // The whole capsule is the drag handle (it has no title bar), so a press that
  // lands on a button has to be excluded explicitly.
  const onPointerDown = useCallback((event) => {
    if (event.button !== 0) return
    if (event.target?.closest?.('button') != null) return
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

  // --- derived render state --------------------------------------------------

  const position = useMemo(() => {
    if (dragPosition !== null) return dragPosition
    if (options.position !== null) return clampTilePosition(options.position, measured, viewport)
    return defaultTilePosition(measured, viewport)
  }, [dragPosition, options.position, measured, viewport])

  if (options.enabled !== true) return null

  const rowNodes = []
  viewModel.rows.forEach((row, index) => {
    if (index > 0) rowNodes.push(<span className="dsm-sep" key={`sep-${row.key}`} aria-hidden="true">{ITEM_SEPARATOR}</span>)
    rowNodes.push(<Item key={row.key} row={row} t={t} />)
  })

  return (
    <section
      ref={tileRef}
      className="dsm-tile"
      data-compact={options.compact === true ? '1' : '0'}
      data-dragging={dragging ? '1' : undefined}
      style={{ left: `${position.x}px`, top: `${position.y}px`, opacity: options.opacity }}
      aria-label={t('title')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="dsm-grip" aria-hidden="true">{GRIP_GLYPH}</span>

      <div className="dsm-items">
        {rowNodes}
        {viewModel.rows.length === 0 ? (
          <span className={status === 'error' ? 'dsm-note dsm-err' : 'dsm-note'}>
            {status === 'error' ? t('offline') : t('loading')}
          </span>
        ) : null}
      </div>

      {status !== 'ready' ? (
        <span className="dsm-status" data-status={status} title={status === 'error' ? t('offline') : t('loading')} />
      ) : null}

      <span className="dsm-actions">
        <button
          type="button"
          className="dsm-btn"
          data-spin={status === 'loading' ? '1' : '0'}
          title={t('refresh')}
          aria-label={t('refresh')}
          onClick={() => setRequest((previous) => ({ id: previous.id + 1, force: true }))}
        >
          <RefreshIcon />
        </button>
        <button
          type="button"
          className="dsm-btn"
          title={t('hide')}
          aria-label={t('hide')}
          onClick={() => store.set({ enabled: false })}
        >
          <CloseIcon />
        </button>
      </span>
    </section>
  )
}

/**
 * One metric item: label, headline value, then trailing details, all on the same
 * baseline. Text only — no bar, gauge or sparkline.
 */
function Item({ row, t }) {
  return (
    <span className="dsm-item" title={row.title ?? undefined}>
      <span className="dsm-label">{t(row.labelKey, row.labelParams)}</span>
      {row.valueText !== null ? (
        <span className={`dsm-value dsm-${row.severity}`}>{row.valueText}</span>
      ) : (
        <span className="dsm-value dsm-unknown">—</span>
      )}
      {row.details.map((detail) => (
        <span
          key={detail.key}
          className={detail.tone === 'muted' || detail.tone === 'ok' ? 'dsm-detail' : `dsm-detail dsm-${detail.tone}`}
        >
          {detail.text}
        </span>
      ))}
    </span>
  )
}

/** Read the viewport size, with a sane fallback for non-browser hosts. */
function readViewport() {
  return {
    width: globalThis.innerWidth ?? 1280,
    height: globalThis.innerHeight ?? 800,
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

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
