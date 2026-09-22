/**
 * The tile's stylesheet, injected once per page as a `<style>` element.
 *
 * All theming rides two data attributes on the tile root (`.dsm-tile`
 * `data-theme="dark|light"` and `data-compact`), so the same markup renders
 * correctly on a light DSH theme, a dark one, or a custom theme that only sets
 * a body background. Colors never read DSH's private theme variables: the tile
 * must keep working across Harness versions and third-party themes.
 */

/** Every class this plugin owns is prefixed `dsm-`. */
export const STYLE_ELEMENT_ID = 'dsh-system-monitor-styles'

export const CSS = `
.dsm-tile{
  position:fixed;pointer-events:auto;box-sizing:border-box;
  display:flex;flex-direction:column;gap:0;
  width:268px;max-height:calc(100vh - 24px);overflow:hidden;
  border-radius:12px;border:1px solid var(--dsm-border);
  background:var(--dsm-bg);color:var(--dsm-fg);
  backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%);
  box-shadow:0 12px 32px rgba(0,0,0,.30),0 1px 0 rgba(255,255,255,.05) inset;
  font:12px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  user-select:none;-webkit-user-select:none;
  transition:opacity .18s ease
}
.dsm-tile[data-theme="dark"]{
  --dsm-bg:rgba(22,24,30,.88);--dsm-fg:#e9ebf1;--dsm-muted:#98a1b2;
  --dsm-border:rgba(255,255,255,.10);--dsm-track:rgba(255,255,255,.09);
  --dsm-head:rgba(255,255,255,.04);--dsm-hover:rgba(255,255,255,.09)
}
.dsm-tile[data-theme="light"]{
  --dsm-bg:rgba(252,252,255,.90);--dsm-fg:#1a1c21;--dsm-muted:#5f6673;
  --dsm-border:rgba(0,0,0,.10);--dsm-track:rgba(0,0,0,.08);
  --dsm-head:rgba(0,0,0,.025);--dsm-hover:rgba(0,0,0,.06)
}
.dsm-tile[data-dragging]{transition:none;cursor:grabbing}
.dsm-head{
  display:flex;align-items:center;gap:6px;flex:0 0 auto;
  padding:7px 8px 7px 10px;background:var(--dsm-head);
  border-bottom:1px solid var(--dsm-border);cursor:grab;touch-action:none
}
.dsm-grip{display:flex;flex-direction:column;gap:2px;opacity:.45;flex:0 0 auto}
.dsm-grip i{display:block;width:10px;height:1px;background:currentColor;border-radius:1px}
.dsm-title{flex:1 1 auto;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-btn{
  flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:20px;height:20px;padding:0;border:0;border-radius:5px;cursor:pointer;
  background:transparent;color:var(--dsm-muted);font:inherit;line-height:1
}
.dsm-btn:hover{background:var(--dsm-hover);color:var(--dsm-fg)}
.dsm-btn[data-spin="1"] svg{animation:dsm-spin .9s linear infinite}
@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:8px 10px 9px}
.dsm-tile[data-compact="1"] .dsm-body{padding:6px 9px 7px}
.dsm-row{display:flex;flex-direction:column;gap:4px;padding:5px 0}
.dsm-row + .dsm-row{border-top:1px solid var(--dsm-border)}
.dsm-tile[data-compact="1"] .dsm-row{gap:3px;padding:3px 0}
.dsm-row-head{display:flex;align-items:baseline;gap:6px;min-width:0}
.dsm-label{flex:0 0 auto;font-size:9.5px;font-weight:700;letter-spacing:.06em;color:var(--dsm-muted);min-width:30px}
.dsm-caption{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;opacity:.9}
.dsm-value{flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:600;font-size:12px}
.dsm-bar{position:relative;height:5px;border-radius:999px;background:var(--dsm-track);overflow:hidden}
.dsm-tile[data-compact="1"] .dsm-bar{height:4px}
.dsm-bar-fill{height:100%;border-radius:999px;transition:width .4s ease,background-color .4s ease}
.dsm-ok{background:#2ea043}
.dsm-warn{background:#d29922}
.dsm-hot{background:#e5484d}
.dsm-unknown{background:var(--dsm-muted);opacity:.5}
.dsm-details{display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--dsm-muted)}
.dsm-detail-hot{color:#ff8b8b}
.dsm-tile[data-theme="light"] .dsm-detail-hot{color:#c02a2f}
.dsm-detail-warn{color:#e0a92e}
.dsm-tile[data-theme="light"] .dsm-detail-warn{color:#a1700b}
.dsm-cores{display:flex;flex-wrap:wrap;gap:2px;margin-top:2px}
.dsm-core{width:8px;height:10px;border-radius:2px;background:var(--dsm-track);overflow:hidden;display:flex;align-items:flex-end}
.dsm-core i{display:block;width:100%;border-radius:2px}
.dsm-note{padding:6px 0;color:var(--dsm-muted);font-size:10.5px}
.dsm-err{color:#e5484d}
.dsm-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:5px;font-size:10px;color:var(--dsm-muted)}
.dsm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2ea043;margin-right:4px;vertical-align:middle}
.dsm-dot[data-status="error"]{background:#e5484d}
.dsm-dot[data-status="loading"]{background:#d29922}
.dsm-settings{display:flex;flex-direction:column;gap:10px;padding:2px 0 6px;font-size:12px}
.dsm-field{display:flex;align-items:center;gap:8px}
.dsm-field > label{min-width:132px;opacity:.8}
.dsm-settings select,.dsm-settings input[type="range"]{flex:1 1 auto;max-width:220px}
.dsm-settings select{padding:3px 6px;border-radius:6px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit}
.dsm-check{display:flex;align-items:center;gap:7px}
.dsm-check input{margin:0}
.dsm-hint{opacity:.62;font-size:11px;line-height:1.5}
.dsm-buttons{display:flex;gap:8px;flex-wrap:wrap}
.dsm-buttons button{
  padding:4px 10px;border-radius:6px;border:1px solid rgba(127,127,127,.35);
  background:transparent;color:inherit;font:inherit;cursor:pointer
}
.dsm-buttons button:hover{background:rgba(127,127,127,.16)}
@media (prefers-reduced-motion:reduce){
  .dsm-tile,.dsm-bar-fill{transition:none}
  .dsm-btn[data-spin="1"] svg{animation:none}
}
`
