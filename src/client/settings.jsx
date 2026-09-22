import React from 'react'
import { INTERVAL_CHOICES } from './model.js'
import { useOptions } from './tile.jsx'

/** Section toggles rendered as a checkbox list. */
const TOGGLES = [
  ['showCpu', 'showCpu'],
  ['showCpuTemperature', 'showCpuTemperature'],
  ['showMemory', 'showMemory'],
  ['showGpu', 'showGpu'],
  ['showGpuTemperature', 'showGpuTemperature'],
  ['showGpuMemory', 'showGpuMemory'],
  ['showPower', 'showPower'],
  ['showNetwork', 'showNetwork'],
]

/**
 * The settings panel registered into the `settings.section` slot, so the tile
 * itself stays a pure readout: everything configurable lives in DSH's own
 * Settings, not in a popover on the widget.
 *
 * @param props.store - the shared options store.
 * @param props.t - locale-bound translator.
 */
export function SettingsSection({ store, t }) {
  const options = useOptions(store)
  const set = (patch) => store.set(patch)

  return (
    <div className="dsm-settings">
      <p className="dsm-hint">{t('settingsHint')}</p>

      <label className="dsm-check">
        <input type="checkbox" checked={options.enabled === true} onChange={(event) => set({ enabled: event.target.checked })} />
        <span>{t('enable')}</span>
      </label>
      <p className="dsm-hint">{t('enableHint')}</p>

      <div className="dsm-field">
        <label htmlFor="dsm-interval">{t('interval')}</label>
        <select
          id="dsm-interval"
          value={String(options.intervalMs)}
          onChange={(event) => set({ intervalMs: Number(event.target.value) })}
        >
          {INTERVAL_CHOICES.map((milliseconds) => (
            <option key={milliseconds} value={String(milliseconds)}>
              {t('intervalSecond', { n: milliseconds / 1000 })}
            </option>
          ))}
        </select>
      </div>

      <div className="dsm-field">
        <label htmlFor="dsm-opacity">{t('opacity')}</label>
        <input
          id="dsm-opacity"
          type="range"
          min="40"
          max="100"
          step="1"
          value={String(Math.round(options.opacity * 100))}
          onChange={(event) => set({ opacity: Number(event.target.value) / 100 })}
        />
      </div>

      <div>
        <p className="dsm-hint">{t('sections')}</p>
        {TOGGLES.map(([key, labelKey]) => (
          <label className="dsm-check" key={key} htmlFor={`dsm-toggle-${key}`}>
            <input
              id={`dsm-toggle-${key}`}
              type="checkbox"
              checked={options[key] === true}
              onChange={(event) => set({ [key]: event.target.checked })}
            />
            <span>{t(labelKey)}</span>
          </label>
        ))}
      </div>

      <div>
        <p className="dsm-hint">{t('appearance')}</p>
        <label className="dsm-check" htmlFor="dsm-compact">
          <input
            id="dsm-compact"
            type="checkbox"
            checked={options.compact === true}
            onChange={(event) => set({ compact: event.target.checked })}
          />
          <span>{t('compact')}</span>
        </label>
      </div>

      <div className="dsm-buttons">
        <button type="button" onClick={() => set({ position: null })}>
          {t('resetPosition')}
        </button>
        <button type="button" onClick={() => store.reset()}>
          {t('resetAll')}
        </button>
      </div>
    </div>
  )
}
