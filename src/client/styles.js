/**
 * The tile's stylesheet, injected once per page as a `<style>` element.
 *
 * **Shape.** One horizontal capsule: a drag grip, then the metric items separated
 * by `丨`, then the refresh and hide buttons. It is a status readout, so there is
 * no title bar, no footer and no gauges — only text. `flex-wrap` lets it fall onto
 * a second line on a narrow window instead of clipping a metric.
 *
 * **Theming.** Every color comes from DeepSeek Harness's own design tokens
 * (`--dsw-alias-*`), which the theme plugin defines on `body` for the light theme
 * and on `body[data-ds-dark-theme]` for the dark one. The tile is attached to
 * `document.body`, so it inherits those declarations and re-resolves them the
 * instant the theme changes — including third-party themes such as Catppuccin
 * that rewrite the same tokens. Each reference carries a literal fallback so the
 * tile still renders sensibly where the tokens are absent.
 */

/** Every class this plugin owns is prefixed `dsm-`. */
export const STYLE_ELEMENT_ID = 'dsh-system-monitor-styles'

/**
 * The tile's stacking level.
 *
 * It has to beat conversation content: code blocks and tool cards use
 * `z-index: 1`–`12`, and because none of their ancestors creates a stacking
 * context they paint over a `z-index: auto` fixed element — which is exactly the
 * bug where a code block covered the tile. It deliberately stays *below* DSH's
 * own 1000/1100 layer so opening a modal or menu still covers the tile instead of
 * fighting it.
 */
export const TILE_Z_INDEX = 900

/** Separator drawn between two metric items, matching the requested design. */
export const ITEM_SEPARATOR = '丨'

/** Glyph for the drag grip; a full braille cell reads as a grip texture. */
export const GRIP_GLYPH = '⣿'

export const CSS = `
.dsm-tile{
  position:fixed;pointer-events:auto;box-sizing:border-box;
  z-index:${TILE_Z_INDEX};
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  max-width:calc(100vw - 28px);
  padding:5px 8px 5px 9px;
  border-radius:999px;
  border:1px solid var(--dsm-border);
  background:var(--dsm-bg);
  background:color-mix(in srgb, var(--dsm-bg) 94%, transparent);
  color:var(--dsm-fg);
  backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);
  box-shadow:0 6px 20px rgba(0,0,0,.18);
  font:12px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  user-select:none;-webkit-user-select:none;cursor:grab;touch-action:none;
  font-variant-numeric:tabular-nums;

  /* DSH design tokens, each with a standalone fallback. */
  --dsm-bg:var(--dsw-alias-bg-layer-2,#ffffff);
  --dsm-fg:var(--dsw-alias-label-primary,#1a1c21);
  --dsm-muted:var(--dsw-alias-label-secondary,#5f6673);
  --dsm-subtle:var(--dsw-alias-label-tertiary,#8a9099);
  --dsm-border:var(--dsw-alias-border-l2,rgba(0,0,0,.12));
  --dsm-hover:var(--dsw-alias-bg-overlay,rgba(127,127,127,.14));
  --dsm-warn:var(--dsw-alias-state-warn-primary,#d29922);
  --dsm-hot:var(--dsw-alias-state-error-primary,#e5484d);
  --dsm-ok:var(--dsw-alias-state-success-primary,#2ea043);
}
.dsm-tile[data-dragging]{cursor:grabbing}
.dsm-grip{flex:0 0 auto;color:var(--dsm-subtle);font-size:11px;line-height:1;letter-spacing:-1px;opacity:.75}
.dsm-items{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;min-width:0}
.dsm-item{display:inline-flex;align-items:baseline;gap:5px;white-space:nowrap}
.dsm-label{color:var(--dsm-subtle);font-size:10px;font-weight:700;letter-spacing:.05em}
.dsm-value{color:var(--dsm-fg);font-weight:600}
.dsm-value.dsm-warn{color:var(--dsm-warn)}
.dsm-value.dsm-hot{color:var(--dsm-hot)}
.dsm-value.dsm-unknown{color:var(--dsm-subtle);font-weight:400}
.dsm-detail{color:var(--dsm-muted);font-size:11px}
.dsm-detail.dsm-warn{color:var(--dsm-warn)}
.dsm-detail.dsm-hot{color:var(--dsm-hot)}
.dsm-sep{flex:0 0 auto;color:var(--dsm-subtle);opacity:.55;font-size:11px;line-height:1}
.dsm-note{color:var(--dsm-subtle);font-size:11px;white-space:nowrap}
.dsm-note.dsm-err{color:var(--dsm-hot)}
.dsm-status{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--dsm-warn);margin-left:1px}
.dsm-status[data-status="error"]{background:var(--dsm-hot)}
.dsm-actions{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;margin-left:2px}
.dsm-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:19px;height:19px;padding:0;border:0;border-radius:50%;cursor:pointer;
  background:transparent;color:var(--dsm-muted);font:inherit;line-height:1
}
.dsm-btn:hover{background:var(--dsm-hover);color:var(--dsm-fg)}
.dsm-btn[data-spin="1"] svg{animation:dsm-spin .9s linear infinite}
@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-tile[data-compact="1"]{padding:2px 6px 2px 8px;gap:7px;font-size:11px}
.dsm-tile[data-compact="1"] .dsm-detail{font-size:10px}
.dsm-tile[data-compact="1"] .dsm-btn{width:17px;height:17px}
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
`
