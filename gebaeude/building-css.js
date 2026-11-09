// Gestaltung des Gebäude-Werkzeugs (kommt mit dem Modul, damit nie altes CSS auf neues Markup trifft). Teil von building.js.
// Gestaltung des Gebäude-Werkzeugs: kommt mit dem Modul, damit nie altes CSS auf neues Markup trifft
const BAU_CSS = `
.bau .bau-st { padding: 4px 4px 0; }
.bau .ped-info .ped-f input[data-gname] { width: 90px; text-align: left; }
.bau .bau-range { padding: 4px; }
.bau .bau-range input { width: 140px; min-height: 0; padding: 0; }
.bau .ped-list .ped-grid { padding: 2px 4px; }
.bau .ped-cmd .ped-f input { width: 64px; }
.bau .ped-info .ped-acts .bprompt { font-size: 12px; color: var(--muted); padding-right: 4px; }
.bau .ped-info .ped-acts button svg { width: 16px; height: 16px; vertical-align: -3px; }
.bau .ped-add button { white-space: nowrap; }
.bau .ped-add button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.bau .ped-f select { min-height: 34px; max-width: 150px; padding: 3px 6px; font-size: 14px; }
.bau .bau-more { flex-wrap: wrap; justify-content: center; }
.bau .bau-edges { max-height: 34vh; overflow: auto; margin: 4px 0; }
.bau .bau-edges .ped-grid { align-items: center; padding: 2px 0; }
.bau .ped-info { max-height: calc(100% - 220px - env(safe-area-inset-top)); overflow: auto; }
.bau .ped-info .ped-grid .ped-f input[data-txt] { width: 110px; text-align: left; }
.bau .ped-seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
@media (max-width: 440px) { .bau .ped-tools .nvb { width: 35px; } .bau .ped-tools { gap: 0; } }
/* Gebäude: Titel mit Geschosswahl, Projektmanager (Struktur, Layer), Fenster */
.bau .bau-titlebtn { flex: 1; min-width: 0; min-height: 38px; border: 0; background: transparent; font-size: 15px; font-weight: 700; color: var(--text); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; }
.bau .bau-tsub { font-weight: 500; color: var(--muted); }
.bau .bau-tcar { font-size: 11px; color: var(--muted); }
.bau .bau-stpop { position: absolute; top: calc(58px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 6; display: flex; flex-direction: column; gap: 2px; min-width: 240px; padding: 6px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 28px rgba(0, 0, 0, .2); }
.bau .bau-stpop[hidden] { display: none; }
.bau .bau-stpop button { display: flex; justify-content: space-between; align-items: center; gap: 16px; border: 0; background: transparent; padding: 8px 10px; border-radius: 8px; text-align: left; font-size: 14px; }
.bau .bau-stpop button.on { background: var(--accent-soft); }
.bau .bau-stpop small { color: var(--muted); font-size: 12px; }
.bau .ped-list { flex-direction: column; padding: 6px; overflow: hidden; max-height: calc(100% - 150px - env(safe-area-inset-top)); }
.bau.list-open .ped-list { display: flex; }
.bau .bau-tabs { padding: 2px 2px 6px; }
.bau .bau-tabs .ped-seg { display: flex; }
.bau .bau-tabs .ped-seg button { flex: 1; min-height: 32px; border: 0; background: transparent; font-size: 13px; }
.bau .bau-tree { flex: 1 1 auto; overflow: auto; min-height: 60px; }
.bau .bau-row { display: flex; align-items: center; gap: 2px; padding-left: calc(var(--d, 0) * 14px); border-radius: 8px; }
.bau .bau-row.on { background: var(--accent-soft); }
.bau .bau-row.off { opacity: .5; }
.bau .bau-row.cur .bau-rn b { color: var(--accent); }
.bau .bau-tree .ped-hint { padding-left: calc(var(--d, 0) * 14px + 30px); }
.bau .bau-rn { flex: 1; min-width: 0; min-height: 34px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 3px 6px; border: 0; background: transparent; text-align: left; color: var(--text); }
.bau .bau-rn b { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 600; }
.bau .bau-rn small { font-size: 11.5px; color: var(--muted); }
.bau .bau-sthead .bau-rn b { font-size: 14.5px; font-weight: 700; }
.bau .bau-grp .bau-rn { flex-direction: row; align-items: center; justify-content: flex-start; gap: 6px; }
.bau .bau-car, .bau .bau-eye { min-width: 30px; min-height: 30px; padding: 0; color: var(--muted); }
.bau .bau-car svg, .bau .bau-eye svg { width: 16px; height: 16px; }
.bau .bau-car svg { transition: transform .15s; }
.bau .bau-car.open svg { transform: rotate(90deg); }
.bau .bau-sp { display: inline-block; width: 30px; flex: none; }
.bau .bau-foot { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--line); }
.bau .bau-foot button { min-height: 34px; padding: 4px 2px; font-size: 12.5px; }
.bau .bau-dlg { position: absolute; top: calc(64px + env(safe-area-inset-top)); right: 12px; z-index: 4; display: flex; flex-direction: column; width: min(380px, calc(100vw - 24px)); max-height: calc(100% - 170px - env(safe-area-inset-top)); background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 34px rgba(0, 0, 0, .22); }
.bau .bau-dlg[hidden] { display: none; }
.bau .bau-dlg-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 6px 14px; border-bottom: 1px solid var(--line); }
.bau .bau-dlg-head b { font-size: 15px; }
.bau .bau-dlg-body { overflow: auto; padding: 6px 12px 12px; font-size: 14px; }
.bau .bau-dlg h5 { margin: 12px 0 4px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.bau .bau-dlg .ped-grid { align-items: center; margin: 4px 0; }
.bau .bau-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
.bau .bau-tab th { padding: 2px 4px; text-align: left; font-weight: 600; color: var(--muted); }
.bau .bau-tab td { padding: 2px; }
.bau .bau-tab input { width: 100%; min-height: 32px; padding: 2px 6px; font-size: 14px; }
.bau .bau-tab td:nth-child(2) input, .bau .bau-tab td:nth-child(3) input { max-width: 84px; text-align: right; }
.bau .bau-tab tr.on input { border-color: var(--accent); }
.bau .bau-kv { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.bau .bau-kv td { padding: 3px 4px; }
.bau .bau-kv td:nth-child(even) { text-align: right; font-weight: 600; }
.bau .bau-kv td.warn, .bau .ped-hint.warn { color: var(--err); }
.bau .bau-mres { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.bau input.bau-short { width: 64px; }
.bau .ped-info .ped-f input[data-txt] { width: 130px; text-align: left; }
@media (min-width: 1000px) { .bau .ped-list { width: 300px; } .bau .bau-dlg { width: 360px; } }
@media (max-width: 700px) {
  .bau .bau-dlg { top: auto; left: 8px; right: 8px; bottom: calc(118px + env(safe-area-inset-bottom)); width: auto; max-height: 58vh; }
  .bau .bau-tsub { display: none; }
}
.bau .bau-tabs .ped-seg button.on { background: var(--accent); color: #fff; }
.bau .bau-foot { grid-template-columns: repeat(3, 1fr); }
.bau .ped-head .bau-docbtn { display: inline-flex; align-items: center; gap: 6px; width: auto; max-width: 220px; padding: 0 10px; }
.bau .ped-head .bau-docbtn svg { width: 18px; height: 18px; flex: none; }
.bau .bau-docname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 600; }
.bau .bau-dlg .bau-row .bau-rn { min-height: 42px; }
.bau .bau-ren { flex: 1; min-height: 38px; margin: 2px; font-size: 14px; }
.bau .bau-wname input { width: 220px; text-align: left; }
@media (max-width: 700px) { .bau .bau-docname { display: none; } .bau .ped-head .bau-docbtn { padding: 0; width: 38px; justify-content: center; } }
.bau .bau-wrow { justify-content: space-between; }
.bau .bau-wrow .bprompt { font-size: 13.5px; color: var(--text); }
/* ---- Neues Erscheinungsbild (Version 260): Tafel, Fenster, Leiste ---- */
.bau .ped-info, .bau .bau-dlg { border-radius: 18px; border: 1px solid var(--line); box-shadow: 0 14px 42px rgba(20, 40, 70, .16), 0 2px 6px rgba(20, 40, 70, .06); }
.bau .ped-info { width: min(340px, calc(100vw - 24px)); padding: 14px 14px 12px; }
.bau .ped-info h4 { display: flex; align-items: center; gap: 9px; margin: 0 0 10px; font-size: 16.5px; font-weight: 750; letter-spacing: -.01em; }
.bau .bau-dot { width: 22px; height: 22px; flex: none; border-radius: 7px; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .08), 0 2px 6px color-mix(in srgb, var(--c) 45%, transparent); }
.bau .bau-dlg-head { padding: 10px 8px 10px 16px; }
.bau .bau-dlg-head b { font-size: 16.5px; font-weight: 750; letter-spacing: -.01em; }
.bau .bau-dlg-body { padding: 4px 16px 16px; }
.bau .bau-dlg h5 { margin: 16px 0 6px; font-size: 11px; font-weight: 750; letter-spacing: .06em; color: var(--accent); }
/* Formular: zwei gleich breite Spalten, Beschriftung über dem Feld, Einheit im Feld */
.bau .ped-info .ped-grid, .bau .bau-dlg .ped-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; align-items: end; }
.bau .ped-info .ped-f, .bau .bau-dlg .ped-f { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-width: 0; margin: 0; padding: 0; font-size: 12px; }
.bau .ped-info .ped-f > span, .bau .bau-dlg .ped-f > span { font-size: 11.5px; font-weight: 650; color: var(--muted); letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bau .ped-info .ped-f input, .bau .bau-dlg .ped-f input, .bau .ped-info .ped-f select, .bau .bau-dlg .ped-f select { width: 100%; max-width: none; min-height: 42px; margin: 0; padding: 6px 36px 6px 12px; font-size: 15.5px; font-weight: 650; text-align: right; font-variant-numeric: tabular-nums; color: var(--text); border: 1px solid var(--line); border-radius: 12px; background: var(--bg); transition: border-color .12s, box-shadow .12s, background .12s; }
.bau .ped-info .ped-f select, .bau .bau-dlg .ped-f select { text-align: left; padding-right: 10px; font-size: 14px; }
.bau .ped-info .ped-f input:focus, .bau .bau-dlg .ped-f input:focus, .bau .ped-f select:focus { outline: none; border-color: var(--accent); background: var(--card); box-shadow: 0 0 0 4px var(--accent-soft); }
.bau .ped-info .ped-f input::placeholder, .bau .bau-dlg .ped-f input::placeholder { color: var(--muted); font-weight: 500; opacity: .8; }
.bau .ped-info .ped-f > i, .bau .bau-dlg .ped-f > i { position: absolute; right: 12px; bottom: 13px; font-size: 12px; font-style: normal; font-weight: 600; color: var(--muted); pointer-events: none; }
.bau .ped-info .ped-f input[data-txt], .bau .ped-info .ped-f input[data-gname], .bau .bau-dlg .ped-f input[data-dtxt], .bau .ped-info input.bau-short { width: 100%; text-align: left; padding-right: 12px; }
.bau .bau-dlg .bau-wname { grid-column: 1 / -1; }
.bau .bau-dlg .bau-wname input { width: 100%; }
/* Segmente: gleich breite Felder in einer Pille */
.bau .ped-info .ped-seg, .bau .bau-dlg .ped-seg { display: flex; flex: 1 1 100%; width: 100%; gap: 3px; padding: 3px; border-radius: 13px; background: var(--bg); }
.bau .ped-info .ped-seg button, .bau .bau-dlg .ped-seg button { flex: 1 1 0; min-width: 0; min-height: 36px; padding: 0 6px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bau .ped-seg button.on { background: var(--accent); color: #fff; box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent); }
.bau .ped-info .ped-acts, .bau .bau-dlg .ped-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; }
.bau .ped-info .ped-acts > .bprompt, .bau .bau-dlg .ped-acts > .bprompt { flex: 1 1 100%; padding: 0; font-size: 11.5px; font-weight: 650; color: var(--muted); }
/* Aktionsknöpfe als Pillen; Löschen rot */
.bau .ped-info .ped-acts > button, .bau .bau-dlg .ped-acts > button, .bau .bau-dlg .ped-add > button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; }
.bau .ped-info .ped-acts > button.on, .bau .bau-dlg .ped-acts > button.on, .bau .bau-dlg .ped-add > button.on { background: var(--accent); color: #fff; box-shadow: 0 3px 10px color-mix(in srgb, var(--accent) 35%, transparent); }
.bau .ped-info .ped-acts > button[data-b="del"] { background: color-mix(in srgb, var(--err) 12%, transparent); color: var(--err); }
.bau .ped-info .ped-acts > button svg { width: 16px; height: 16px; }
.bau .ped-info .ped-acts > button:active, .bau .bau-dlg .ped-acts > button:active { transform: scale(.97); }
@media (hover: hover) { .bau .ped-info .ped-acts > button:not(.on):hover, .bau .bau-dlg .ped-acts > button:not(.on):hover { filter: brightness(.96); } }
.bau .ped-info small { display: block; margin: 10px 0 0; padding: 9px 11px; border-radius: 12px; background: var(--bg); color: var(--muted); font-size: 12px; line-height: 1.5; }
.bau .bau-dlg .ped-hint { margin: 8px 0 0; font-size: 12px; line-height: 1.5; }
/* Befehlsleiste: kompakt, Felder in einer Zeile, gleiche Höhen */
.bau .ped-cmd { gap: 6px 8px; padding: 8px 10px; border-radius: 18px; box-shadow: 0 10px 30px rgba(20, 40, 70, .14); }
.bau .ped-cmd .bprompt { font-size: 13px; font-weight: 700; color: var(--text); }
.bau .ped-cmd .ped-f { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.bau .ped-cmd .ped-f > span { font-weight: 650; }
.bau .ped-cmd .ped-f input { width: 76px; min-height: 36px; padding: 4px 10px; border-radius: 10px; text-align: right; font-size: 15px; font-weight: 650; background: var(--bg); border: 1px solid var(--line); }
.bau .ped-cmd .ped-f input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.bau .ped-cmd .ped-seg { padding: 3px; gap: 2px; border-radius: 12px; background: var(--bg); }
.bau .ped-cmd .ped-seg button { min-height: 32px; padding: 0 10px; border-radius: 9px; font-weight: 650; }
.bau .ped-cmd > button { min-height: 36px; padding: 0 13px; border: 0; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; }
.bau .ped-cmd > button.on { background: var(--accent); color: #fff; }
/* Liste */
.bau .ped-list { border-radius: 18px; }
.bau .bau-tabs .ped-seg { padding: 3px; border-radius: 13px; background: var(--bg); }
.bau .bau-tabs .ped-seg button { border-radius: 10px; font-weight: 650; }
.bau .bau-foot button { border: 0; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.bau .bau-g3 { grid-template-columns: 1fr 1fr 1fr !important; }
.bau .bau-win { margin: 12px 0 4px; padding: 10px; border-radius: 14px; background: var(--bg); }
.bau .bau-winsvg { display: block; width: 100%; height: auto; max-height: 300px; }
.bau .bau-winsvg .wf-frame { fill: #f4f5f7; stroke: #8b96a5; stroke-width: 1.5; }
.bau .bau-winsvg .wf-bar { fill: #e7eaee; stroke: #8b96a5; stroke-width: 1; }
.bau .bau-winsvg .wf-glass { fill: #cfe6f7; stroke: #7a9bb8; stroke-width: 1; cursor: pointer; transition: fill .12s; }
.bau .bau-winsvg .wf-field:hover .wf-glass { fill: #b9dbf3; }
.bau .bau-winsvg .wf-field.on .wf-glass { fill: color-mix(in srgb, var(--accent) 30%, #cfe6f7); stroke: var(--accent); stroke-width: 2.5; }
.bau .bau-winsvg .wf-op { stroke: #3d5a78; stroke-width: 1.2; pointer-events: none; }
.bau .bau-winsvg .wf-t { font: 700 12px system-ui; fill: #3d5a78; text-anchor: middle; pointer-events: none; }
.bau .bau-winsvg .wf-d { font: 600 10.5px system-ui; fill: var(--muted); text-anchor: middle; }
.bau .bau-wfield { margin: 6px 0 2px; }
.bau .bau-wfield .bprompt { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: var(--text); }
.bau .bau-wops { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.bau .bau-wops button { min-height: 36px; padding: 0 6px; border: 0; border-radius: 10px; background: var(--bg); color: var(--text); font-size: 12.5px; font-weight: 650; }
.bau .bau-wops button.on { background: var(--accent); color: #fff; }
.bau .bau-step { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; }
.bau .bau-step button { width: 38px; height: 38px; border: 0; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-weight: 700; }
.bau .bau-step b { min-width: 22px; text-align: center; font-size: 17px; }
.bau .bau-dlg .ped-grid > .bprompt { align-self: center; font-size: 13px; font-weight: 650; color: var(--text); }

/* Achsabstand bearbeiten */
.bau .bau-dimed { width: 260px; gap: 8px; padding: 10px; }
.bau .bau-dimed .ped-f { position: relative; display: block; }
.bau .bau-dimed .ped-f input { width: 100%; min-height: 42px; padding: 4px 36px 4px 10px; border: 1px solid var(--accent); border-radius: 10px; background: var(--bg); text-align: right; font-size: 17px; font-weight: 700; }
.bau .bau-dimed .ped-f > i { position: absolute; right: 10px; top: 13px; font-style: normal; font-size: 12px; color: var(--muted); }
.bau .bau-dimed .ped-seg { display: flex; }
.bau .bau-dimed .ped-seg button { flex: 1; font-size: 12px; }
.bau .ped-cmd input[data-gdist] { width: 130px; text-align: left; }

/* Auswahlknöpfe mit Liste */
.bau .bau-cgrp { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bau .bau-dd { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 10px 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--text); font-size: 13px; white-space: nowrap; box-shadow: 0 1px 2px rgba(0, 0, 0, .04); }
.bau .bau-dd span { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.bau .bau-dd b { font-weight: 700; }
.bau .bau-dd i { font-style: normal; font-size: 10px; color: var(--muted); }
.bau .bau-dd:active { background: var(--accent-soft); }
.bau .ped-info .bau-dd { width: 100%; justify-content: space-between; min-height: 42px; border-radius: 12px; background: var(--bg); }
.bau .ped-cmd > .bau-tg, .bau .bau-cgrp > .bau-tg { min-height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--text); font-weight: 700; font-size: 13px; }
.bau .bau-cgrp > .bau-tg.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.bau .bau-ddpop { position: absolute; z-index: 7; display: flex; flex-direction: column; gap: 2px; padding: 6px; overflow: auto; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 16px 44px rgba(20, 40, 70, .22); }
.bau .bau-ddpop[hidden] { display: none; }
.bau .bau-ddh { padding: 6px 10px 4px; font-size: 11px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.bau .bau-ddo { display: flex; align-items: center; min-height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font-size: 14px; font-weight: 600; text-align: left; }
.bau .bau-ddo.on { background: var(--accent-soft); color: var(--accent); }
.bau .bau-ddo.on::after { content: '✓'; margin-left: auto; font-weight: 800; }
@media (hover: hover) { .bau .bau-ddo:not(.on):hover, .bau .bau-sw:hover { background: var(--bg); } }
.bau .bau-ddx { display: flex; gap: 8px; padding: 8px 6px 4px; margin-top: 4px; border-top: 1px solid var(--line); }
.bau .bau-ddx .ped-f { flex: 1; display: flex; flex-direction: column; gap: 3px; position: relative; font-size: 11.5px; color: var(--muted); }
.bau .bau-ddx .ped-f > span { font-weight: 650; }
.bau .bau-ddx .ped-f input { width: 100%; min-height: 38px; padding: 4px 30px 4px 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); text-align: right; font-size: 15px; font-weight: 650; }
.bau .bau-ddx .ped-f > i { position: absolute; right: 10px; bottom: 11px; font-style: normal; font-size: 11.5px; }
/* Fang: Schalter mit Bezeichnung und Erklärung */
.bau .bau-sw { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border: 0; border-radius: 12px; background: transparent; text-align: left; color: var(--text); }
.bau .bau-sw > i { position: relative; flex: none; width: 40px; height: 24px; border-radius: 99px; background: color-mix(in srgb, var(--muted) 35%, transparent); transition: background .15s; }
.bau .bau-sw > i::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: left .15s; }
.bau .bau-sw.on > i { background: var(--accent); }
.bau .bau-sw.on > i::after { left: 19px; }
.bau .bau-sw span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.bau .bau-sw b { font-size: 13.5px; font-weight: 700; }
.bau .bau-sw small { font-size: 11.5px; color: var(--muted); line-height: 1.35; }
.bau .bau-sw:not(.on) b { color: var(--muted); }
.bau .bau-ddhint { margin: 6px 10px 4px; font-size: 11.5px; color: var(--muted); }


/* ===== Desktop-Gerüst (Version 273): Menüband, Paletten, Statusleiste ===== */
.bau .bau-top, .bau .bau-main, .bau .bau-view { display: contents; }
.bau .bau-rib, .bau .bau-opt, .bau .bau-status { display: none; }
.bau .ped-head, .bau .ped-list, .bau .ped-info { z-index: 2; }
.bau.desk { display: flex; flex-direction: column; --rw: 330px; --lw: 280px; }
.bau.desk .bau-top { display: flex; flex-direction: column; flex: none; background: var(--card); border-bottom: 1px solid var(--line); z-index: 5; position: relative; }
.bau.desk .ped-head { position: static; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.bau.desk .ped-head .bau-titlebtn { margin: 0 auto; }
.bau.desk .bau-rib { display: block; }
.bau .bau-rtabs { display: flex; align-items: flex-end; gap: 2px; padding: 4px 10px 0; }
.bau .bau-rtab { min-height: 30px; padding: 0 14px; border: 0; border-bottom: 3px solid transparent; border-radius: 8px 8px 0 0; background: transparent; color: var(--muted); font-size: 13px; font-weight: 650; }
.bau .bau-rtab.on { color: var(--text); border-bottom-color: var(--accent); background: var(--accent-soft); }
.bau .bau-rtab.ctx { margin-left: 14px; color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.bau .bau-rtab.ctx.on { background: var(--accent-soft); }
.bau .bau-rtab.ctx:first-of-type { margin-left: auto; }
@media (hover: hover) { .bau .bau-rtab:not(.on):hover { background: var(--bg); } }
.bau .bau-rpanel { display: flex; align-items: stretch; gap: 0; min-height: 88px; padding: 6px 10px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--accent-soft) 35%, var(--card)); overflow-x: auto; }
.bau .bau-top.rib-off .bau-rpanel { display: none; }
.bau .bau-rg { display: flex; flex-direction: column; justify-content: space-between; padding: 0 10px; border-right: 1px solid var(--line); }
.bau .bau-rg:last-child { border-right: 0; }
.bau .bau-rbs { display: flex; gap: 2px; align-items: stretch; flex: 1; }
.bau .bau-rg > small { text-align: center; font-size: 11px; color: var(--muted); padding-top: 3px; white-space: nowrap; }
.bau .bau-rb { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-width: 62px; min-height: 58px; padding: 4px 6px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font-size: 11.5px; font-weight: 600; line-height: 1.15; text-align: center; }
.bau .bau-rb svg { width: 26px; height: 26px; }
.bau .bau-rb.on { background: var(--accent); color: #fff; }
.bau .bau-rb:disabled { opacity: .38; }
@media (hover: hover) { .bau .bau-rb:not(.on):not(:disabled):hover { background: var(--accent-soft); } }
.bau.desk .bau-opt { display: flex; flex: none; align-items: center; min-height: 46px; background: var(--card); border-bottom: 1px solid var(--line); z-index: 4; position: relative; }
.bau.desk .bau-opt:has(.ped-cmd[hidden]) { display: none; }
.bau.desk .bau-opt .ped-cmd { position: static; transform: none; flex: 1; justify-content: flex-start; border: 0; box-shadow: none; border-radius: 0; background: transparent; padding: 5px 12px; max-width: none; }
.bau.desk .bau-main { display: flex; flex: 1; min-height: 0; }
.bau.desk .bau-view { display: block; position: relative; flex: 1; min-width: 0; overflow: hidden; }
.bau.desk:not(.list-open) .ped-list { display: none; }
.bau.desk.list-open .ped-list { display: block; position: static; flex: none; width: var(--lw); max-height: none; height: auto; border-radius: 0; box-shadow: none; border: 0; border-right: 1px solid var(--line); overflow: auto; background: var(--card); }
.bau.desk .ped-info { display: block; position: static; flex: none; width: var(--rw); max-height: none; height: auto; border-radius: 0; box-shadow: none; border: 0; border-left: 1px solid var(--line); overflow: auto; background: var(--card); padding: 14px; }
.bau.desk .ped-bottom { display: none; }
.bau.desk .bau-dlg { top: calc(var(--top-h, 170px) + 12px); right: calc(var(--rw) + 12px); }
.bau.desk .bau-stpop { top: calc(var(--top-h, 170px) - 80px); }
.bau.desk .bau-status { display: flex; flex: none; align-items: center; gap: 14px; min-height: 30px; padding: 0 12px; background: var(--card); border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); z-index: 4; position: relative; }
.bau .bau-status .bau-sp { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-weight: 600; }
.bau .bau-status .bau-sx { font-variant-numeric: tabular-nums; min-width: 200px; }
.bau .bau-status button { min-height: 22px; padding: 0 9px; border: 1px solid var(--line); border-radius: 99px; background: var(--bg); color: var(--muted); font-size: 11.5px; font-weight: 650; }
.bau .bau-status button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.bau .bau-ctxm { position: absolute; z-index: 9; min-width: 200px; display: flex; flex-direction: column; gap: 1px; padding: 5px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 40px rgba(20, 40, 70, .24); }
.bau .bau-ctxm[hidden] { display: none; }
.bau .bau-ctxm button { display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text); font-size: 13px; font-weight: 600; text-align: left; }
.bau .bau-ctxm button svg { width: 17px; height: 17px; color: var(--muted); }
.bau .bau-ctxm button:disabled { opacity: .4; }
.bau .bau-ctxm hr { border: 0; border-top: 1px solid var(--line); margin: 3px 4px; }
@media (hover: hover) { .bau .bau-ctxm button:not(:disabled):hover { background: var(--accent-soft); } }
.bau .bau-keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px; }
.bau .bau-keys kbd { justify-self: start; padding: 1px 7px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 6px; background: var(--bg); font: 650 12px system-ui; }
.bau .bau-keys h5 { grid-column: 1 / -1; margin: 8px 0 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
`;

export { BAU_CSS };
