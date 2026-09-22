/**
 * The tile's stylesheet, injected once per page as a `<style>` element.
 *
 * **Theming.** Every color comes from DeepSeek Harness's own design tokens
 * (`--dsw-alias-*`), which the theme plugin defines on `body` for the light
 * theme and on `body[data-ds-dark-theme]` for the dark one. The tile is attached
 * to `document.body`, so it inherits those declarations and re-resolves them the
 * instant the theme changes — including third-party themes such as Catppuccin
 * that rewrite the same tokens. Each reference carries a literal fallback so the
 * tile still renders sensibly where the tokens are absent (the dev harness, or a
 * future shell that renames them).
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

export const CSS = `
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
`
