// Gebäude (Experiment): eigenständiges Werkzeug für die Gebäudestruktur.
// Geschosse, Achsraster, Planunterlage, Wände, Stützen (auch Stahl), Unterzüge und Stahlträger, Decken, Öffnungen,
// Dächer (flach mit Attika, geneigt), Rasterdecken, Räume, Schächte; IFC-Export.
// Eigener Speicher (IndexedDB „biege-bau“), eigene Ansicht, eigenes WebGL: Die Rohrdaten der App bleiben unberührt.
// Einheit mm, Z nach oben. Typen angelehnt an IFC. Siehe ROADMAP-GEBAEUDE.md.

import { sub, add, mul, dot, len, norm, cross3, cross2, perp, near, uid, fmt, fmt2, num, raw, esc, area2, segD, pip, centroid, lineX, hull, triangulate, bridge, clipBy, offsetPoly, lineInPoly } from './building-math.js';
import { STEEL, STEEL_FAM, steelSection } from './building-steel.js';
import { loadB, listB, delB, saveB, putFile, getFile, delFile, newBuilding, lastId, remember, download } from './building-store.js';
import { SVG, IC, TYPE_NAME, LAYERS, ROOM_NAMES, TILE_PRESETS, WALL_PRESETS, WALL_KINDS, kindName, WOPS, wopName, WIN_TPL, WALL_SEG, TYPE_COL, WALL_OPS, OPS, OP_DEF, JUST, MORE, ABOVE, layerOf, MAT, TYPE_CATS, seedTypes } from './building-data.js';
import { BAU_CSS } from './building-css.js';

export async function openBuilding(env) {
  let styleEl = document.getElementById('bau-css');
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'bau-css'; document.head.appendChild(styleEl); }
  styleEl.textContent = BAU_CSS;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgb = (h, fb) => { h = css(h); return h.startsWith('#') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : fb; };
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  // ---------- Oberfläche ----------
  const root = document.createElement('div');
  root.className = 'ped bau';
  root.innerHTML = `
    <div class="bau-top">
    <div class="ped-head">
      <button class="flbtn" data-b="list" title="Projektmanager: Struktur und Layer" aria-label="Projektmanager">${SVG(IC.list)}</button>
      <button class="flbtn bau-docbtn" data-dlg="docs" title="Gebäude: öffnen, neu, sichern, laden" aria-label="Gebäude">${SVG(IC.house)}<span class="bau-docname"></span></button>
      <button class="flbtn" data-b="undo" title="Rückgängig" aria-label="Rückgängig">${SVG(IC.undo)}</button>
      <button class="flbtn" data-b="redo" title="Wiederholen" aria-label="Wiederholen">${SVG(IC.redo)}</button>
      <button class="ped-title bau-titlebtn" data-b="stpick" title="Geschoss wechseln (Bild auf/ab)"></button>
      <button class="flbtn primary" data-b="done" title="Fertig" aria-label="Fertig">${SVG(IC.ok)}</button>
    </div>
      <div class="bau-rib"></div>
      <div class="bau-opt"></div>
    </div>
    <div class="bau-main">
      <aside class="ped-list"></aside>
      <div class="bau-view"><canvas class="ped-gl"></canvas><canvas class="ped-2d"></canvas></div>
      <div class="ped-info" hidden></div>
    </div>
    <div class="bau-status">
      <span class="bau-sp"></span><span class="bau-sx"></span>
      <button data-b="ortho" title="Ortho (F8)">Ortho</button><button data-ddk="snap" title="Fang-Einstellungen">Fang</button><button data-dlg="keys" title="Tastaturkürzel (?)">?</button>
    </div>
    <div class="bau-ctxm" hidden></div>
    <div class="bau-dlg" hidden></div>
    <div class="bau-stpop" hidden></div>
    <div class="bau-ddpop" hidden></div>
    <div class="bau-ddpop bau-dimed" hidden></div>
    <div class="ped-bottom">
      <div class="ped-views bau-more" hidden>${MORE.map(([t, n]) => `<button data-b="t:${t}">${n}</button>`).join('')}</div>
      <div class="ped-cmd" hidden></div>
      <div class="navbar ped-tools" role="toolbar" aria-label="Werkzeuge">
        <button class="nvb" data-b="t:sel" title="Auswählen (Esc)" aria-label="Auswählen">${SVG(IC.sel)}</button>
        <button class="nvb" data-b="t:wall" title="Wand (W)" aria-label="Wand">${SVG(IC.wall)}</button>
        <button class="nvb" data-b="t:column" title="Stütze (S)" aria-label="Stütze">${SVG(IC.column)}</button>
        <button class="nvb" data-b="t:beam" title="Unterzug oder Stahlträger (T)" aria-label="Unterzug oder Stahlträger">${SVG(IC.beam)}</button>
        <button class="nvb" data-b="t:slab" title="Decke oder Bodenplatte (D)" aria-label="Decke oder Bodenplatte">${SVG(IC.slab)}</button>
        <button class="nvb" data-b="t:open" title="Tür, Fenster, Durchbruch (O)" aria-label="Tür, Fenster, Durchbruch">${SVG(IC.door)}</button>
        <button class="nvb" data-b="more" title="Treppe, Dach, Rasterdecke, Raum, Schacht, Achse" aria-label="Weitere Bauteile">${SVG(IC.more)}</button>
        <button class="nvb" data-b="t:measure" title="Messen (M)" aria-label="Messen">${SVG(IC.measure)}</button>
        <i class="bsep"></i>
        <button class="nvb" data-b="view" title="Grundriss oder 3D (V)" aria-label="Grundriss oder 3D"></button>
        <button class="nvb" data-b="fit" title="Einpassen (F): auf die Auswahl, ohne Auswahl auf alles" aria-label="Einpassen">${SVG(IC.fit)}</button>
      </div>
    </div>
    <input type="file" class="bau-file" accept="image/*,application/pdf" hidden>
    <input type="file" class="bau-json" accept="application/json,.json" hidden>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const glc = $('.ped-gl'), cv = $('.ped-2d'), ctx = cv.getContext('2d');
  const ribEl = $('.bau-rib'), optEl = $('.bau-opt'), topEl = $('.bau-top'), statusEl = $('.bau-status'), ctxm = $('.bau-ctxm'), listEl = $('.ped-list'), infoEl = $('.ped-info'), cmdEl = $('.ped-cmd'), moreEl = $('.bau-more'), dlgEl = $('.bau-dlg'), stPop = $('.bau-stpop'), ddPop = $('.bau-ddpop:not(.bau-dimed)'), dimEd = $('.bau-dimed');

  // ---------- Zustand ----------
  // zuletzt geöffnetes Gebäude, sonst das erste vorhandene, sonst ein neues (dann Startfenster)
  const lid = lastId();
  let B = (lid && await loadB(lid).catch(() => null)) || (await listB().catch(() => []))[0] || null;
  const fresh = !B;
  if (!B) B = newBuilding();
  remember(B.id);
  const fixB = () => { if (!B.typesV) { B.types ||= seedTypes(); B.typesV = 1; (B.els || []).forEach(linkOne); } B.types ||= seedTypes(); B.vis ||= { off: {}, hide: [] }; B.vis.off ||= {}; B.vis.hide ||= []; B.grids ||= []; B.underlays ||= []; };
  fixB();
  let cur = [...B.storeys].sort((a, b) => Math.abs(a.elev) - Math.abs(b.elev))[0].id;
  // Liste: Reiter, aufgeklappte Geschosse und Gruppen; Fenster (Dialog) mit eigenem Zustand
  let tab = 'tree', dlg = null;
  const openSt = new Set([cur]), openGrp = new Set();
  const cam = { yaw: -0.6, pitch: 0.55, sc: 0.05, panX: 0, panY: 0, plan: false };
  let desk = false, ribTab = (() => { try { const v = +localStorage.getItem('biege.bau.rib'); return v >= 0 && v < 8 ? v : 1; } catch { return 1; } })(), ribOff = (() => { try { return localStorage.getItem('biege.bau.riboff') === '1'; } catch { return false; } })(), lastCmdT = null, ribPrev = 1;
  let mid = [0, 0, 0], size = 20000, W = 1, H = 1, listOpen = innerWidth > 1000, showAbove = false, moreOpen = false;
  // sel: { ids: [...] } Bauteile oder { grid: id }; addMode: Tippen ergänzt die Auswahl
  let cmd = null, sel = null, hover = null, dirty = true, gridForm = false, addMode = false;
  // Länge direkt eintippen (Mac): Ziffern sammeln, Enter setzt den Punkt in Zeigerrichtung, Minus = Gegenrichtung
  let dyn = '', dynNeg = false, lastMouse = null;
  const DYN = ['wall', 'beam', 'slab', 'roof', 'ceil', 'grid', 'move', 'copy', 'stair', 'measure', 'shaft'];
  const undo = [], redo = [];
  const imgs = new Map(); // Unterlage: Datei-ID → Bild
  // aktuelles Geschoss; fehlt es (gelöscht, neues Gebäude), das unterste
  const st = id => B.storeys.find(s => s.id === id), curSt = () => st(cur) || st(cur = [...B.storeys].sort((a, b) => a.elev - b.elev)[0].id);
  const sorted = () => [...B.storeys].sort((a, b) => a.elev - b.elev);
  const visible = s => !!s && (showAbove || s.elev <= curSt().elev + 1e-6);
  let saveT = 0, savedAt = 0, testing = false; // testing: Selbsttest läuft, nichts wird gespeichert
  const saveNow = () => { if (testing) return Promise.resolve(); B.updated = Date.now(); return saveB(B).then(() => { savedAt = Date.now(); if (dlg?.kind === 'docs') renderDlg(); }); };
  const persist = () => { if (testing) return; clearTimeout(saveT); saveT = setTimeout(() => saveNow().catch(e => env.toast(`Speichern fehlgeschlagen: ${e.message || e}`)), 250); };
  const snap = () => JSON.stringify(B);
  function change(fn) { undo.push(snap()); if (undo.length > 200) undo.shift(); redo.length = 0; fn(); relinkAll(); syncStairs(); dirty = true; persist(); renderUi(); draw(); }
  const elById = id => B.els.find(e => e.id === id);
  const selIds = () => (sel?.ids || []).filter(id => B.els.some(e => e.id === id)), isSel = id => !!sel?.ids?.includes(id);
  const selEl = () => (selIds().length === 1 ? elById(selIds()[0]) : null), selGrid = () => (sel?.grid ? B.grids.find(g => g.id === sel.grid) : null);
  // sichtbar: Layer an und Bauteil nicht einzeln ausgeblendet
  const shown = e => !B.vis.off[layerOf(e)] && !B.vis.hide.includes(e.id);
  const visPersist = () => { dirty = true; persist(); renderUi(); draw(); };
  const nextAbove = s => sorted()[sorted().indexOf(s) + 1];
  const nextName = s => nextAbove(s)?.name || 'Dach';

  // ---------- Bauteile: Lage ----------
  const wallOffs = w => (w.just === 'l' ? [0, w.t] : w.just === 'r' ? [-w.t, 0] : [-w.t / 2, w.t / 2]);
  const beamSec = e => (e.shape === 'steel' ? steelSection(e.prof) : null);
  const beamDims = e => { const s = beamSec(e); return s ? (e.rot90 ? { w: s.h, h: s.b } : { w: s.b, h: s.h }) : { w: e.w, h: e.bh }; };
  // Schacht: von seinem Geschoss bis zum Geschoss „to“
  const shaftRange = e => { const a = st(e.storey), b = st(e.to) || a; return [a.elev, b.elev + b.height]; };
  const onStorey = (e, sid) => { if (e.type !== 'shaft') return e.storey === sid; const s = st(sid), [z0, z1] = shaftRange(e); return !!s && s.elev >= z0 - 1e-6 && s.elev < z1 - 1e-6; };
  // Treppe: gerade oder zweiläufig mit Halbpodest; Steigungen bis OK Rohdecke darüber, massive Stufen
  const stairH = e => { const s = st(e.storey), up = nextAbove(s); return up ? up.elev - s.elev : s.height; };
  function stairGeo(e) {
    const s = st(e.storey), H = stairH(e), n = Math.max(2, Math.round(e.n || H / 175)), h = H / n, g = e.g || 270, d = norm(e.dir), q = mul(perp(d), e.side || 1), w = e.w || 1000;
    const R = (s0, s1, o0, o1) => [add(add(e.a, mul(d, s0)), mul(q, o0)), add(add(e.a, mul(d, s1)), mul(q, o0)), add(add(e.a, mul(d, s1)), mul(q, o1)), add(add(e.a, mul(d, s0)), mul(q, o1))];
    const steps = [], walk = [];
    if (e.kind !== 'u') {
      for (let i = 0; i < n - 1; i++) steps.push({ poly: R(i * g, (i + 1) * g, -w / 2, w / 2), z1: s.elev + (i + 1) * h });
      walk.push(e.a, add(e.a, mul(d, (n - 1) * g)));
      return { steps, land: null, foot: R(0, Math.max(1, (n - 1) * g), -w / 2, w / 2), h, n, H, g, L: (n - 1) * g, walk };
    }
    const n1 = Math.ceil(n / 2), n2 = n - n1, L1 = (n1 - 1) * g, gap = e.gap ?? 100, land = e.land || w, off = w + gap;
    for (let i = 0; i < n1 - 1; i++) steps.push({ poly: R(i * g, (i + 1) * g, -w / 2, w / 2), z1: s.elev + (i + 1) * h });
    const landing = { poly: R(L1, L1 + land, -w / 2, off + w / 2), z1: s.elev + n1 * h };
    for (let j = 0; j < n2 - 1; j++) steps.push({ poly: R(L1 - (j + 1) * g, L1 - j * g, off - w / 2, off + w / 2), z1: s.elev + (n1 + j + 1) * h });
    const P = (sv, o) => add(add(e.a, mul(d, sv)), mul(q, o));
    walk.push(P(0, 0), P(L1 + land / 2, 0), P(L1 + land / 2, off), P(L1 - (n2 - 1) * g, off));
    return { steps, land: landing, foot: R(Math.min(0, L1 - (n2 - 1) * g), L1 + land, -w / 2, off + w / 2), h, n, H, g, L: L1 + land, walk };
  }
  // Wände und Stützen ohne eigene Höhe: bis Unterkante der Decke darüber (die Decke liegt auf), ohne Decke bis OK Rohdecke darüber
  function slabOver(e, s) {
    const up = nextAbove(s);
    if (!up || !['wall', 'column'].includes(e.type)) return null;
    const p = e.type === 'wall' ? mul(add(e.a, e.b), 0.5) : e.p;
    return B.els.find(o => o.type === 'slab' && o.storey === up.id && pip(p[0], p[1], o.pts)) || null;
  }
  const autoTop = (e, s) => { const up = nextAbove(s), sl = slabOver(e, s); return (up ? up.elev : s.elev + s.height) - (sl ? sl.t : 0); };
  function zRange(e) {
    const s = st(e.storey);
    switch (e.type) {
      case 'stair': return [s.elev, s.elev + stairH(e)];
      case 'slab': return [s.elev - e.t, s.elev];
      case 'beam': { const t = s.elev + e.top; return [t - beamDims(e).h, t]; }
      case 'roof': { const g = roofGeo(e); return [g.zE + g.minH, g.zE + g.maxH + e.t + (e.kind === 'flat' ? e.par?.h || 0 : 0)]; }
      case 'ceil': return [s.elev + e.z, s.elev + e.z + (e.t || 20)];
      case 'space': return [s.elev, s.elev + s.height];
      case 'shaft': return shaftRange(e);
      default: return [s.elev + (e.base || 0), e.h != null ? s.elev + e.h : autoTop(e, s)];
    }
  }
  // Grundriss einer Wand: L-Ecken auf Gehrung, T-Stöße enden an der Fläche der durchgehenden Wand
  function wallPoly(w) {
    const d = norm(sub(w.b, w.a)), n = perp(d), [lo, hi] = wallOffs(w), r = {};
    for (const end of ['a', 'b']) {
      const P = w[end], away = end === 'a' ? d : mul(d, -1);
      const others = B.els.filter(o => o !== w && o.type === 'wall' && o.storey === w.storey && (near(o.a, P) || near(o.b, P)));
      let m = null, face = null;
      if (others.length >= 2) { // zwei fluchtende Wände laufen durch: wie ein T-Stoß an deren Fläche enden
        const pair = others.flatMap((o1, i) => others.slice(i + 1).map(o2 => [o1, o2])).find(([o1, o2]) => { const d1 = norm(sub(o1.b, o1.a)), d2 = norm(sub(o2.b, o2.a)); return Math.abs(cross2(d1, d2)) < 0.02 && Math.abs(cross2(d1, d)) > 0.02; });
        if (pair) { const host = pair[0], hd = norm(sub(host.b, host.a)), hn = perp(hd), [hlo, hhi] = wallOffs(host), side = dot(sub(w[end === 'a' ? 'b' : 'a'], host.a), hn); face = { p: add(host.a, mul(hn, side > 0 ? hhi : hlo)), d: hd }; }
      }
      if (!others.length) {
        const host = B.els.find(o => { if (o === w || o.type !== 'wall' || o.storey !== w.storey) return false; const [dd, t] = segD(P[0], P[1], o.a, o.b); return dd < 1 && t > 0.001 && t < 0.999; });
        if (host) {
          const hd = norm(sub(host.b, host.a)), hn = perp(hd), [hlo, hhi] = wallOffs(host), side = dot(sub(w[end === 'a' ? 'b' : 'a'], host.a), hn);
          face = { p: add(host.a, mul(hn, side > 0 ? hhi : hlo)), d: hd };
        }
      }
      if (others.length === 1) {
        const o = others[0], od = norm(sub(o.b, o.a)), oAway = near(o.a, P) ? od : mul(od, -1), s = add(away, oAway);
        if (len(s) > 1e-3 && Math.abs(cross2(away, oAway)) > 0.02) m = norm(s);
      }
      for (const [k, off] of [['L', hi], ['R', lo]]) {
        const Q = add(P, mul(n, off));
        if (face) { const X = lineX(Q, d, face.p, face.d); if (X) { r[end + k] = X; continue; } }
        if (!m) { r[end + k] = Q; continue; }
        const X = lineX(Q, d, P, m);
        r[end + k] = !X || len(sub(X, P)) > Math.abs(off) * 8 + 50 ? Q : X;
      }
    }
    return [r.aR, r.bR, r.bL, r.aL];
  }
  // Fangpunkte einer Stütze: eckig/Stahl die vier Ecken der Außenkontur, rund die vier Randpunkte
  const colOutline = c => (c.shape === 'round' ? [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y]) => add(c.p, [x * c.w / 2, y * c.w / 2])) : colPoly(c));
  function colPoly(c) {
    if (c.shape === 'round') return Array.from({ length: 28 }, (_, k) => { const a = 2 * Math.PI * k / 28; return [c.p[0] + Math.cos(a) * c.w / 2, c.p[1] + Math.sin(a) * c.w / 2]; });
    const sec = c.shape === 'steel' ? steelSection(c.prof) : null, w = sec ? sec.b : c.w, dd = sec ? sec.h : c.d;
    const a = (c.rot || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = perp(u), hw = w / 2, hd = dd / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => add(c.p, add(mul(u, x), mul(v, y))));
  }
  function beamPoly(e) { const d = norm(sub(e.b, e.a)), n = perp(d), hw = beamDims(e).w / 2; return [add(e.a, mul(n, -hw)), add(e.b, mul(n, -hw)), add(e.b, mul(n, hw)), add(e.a, mul(n, hw))]; }
  const hostOf = o => elById(o.host);
  const wallAxis = w => { const v = sub(w.b, w.a), L = len(v); return { d: L ? mul(v, 1 / L) : [1, 0], L }; };
  function opPoly(o) {
    if (o.type === 'hole') return [[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [o.w / 2, o.d / 2], [-o.w / 2, o.d / 2]].map(q => add(o.p, q));
    const w = hostOf(o);
    if (!w) return [];
    const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), A = add(w.a, mul(d, o.at - o.w / 2)), Bp = add(w.a, mul(d, o.at + o.w / 2));
    return [add(A, mul(n, lo)), add(Bp, mul(n, lo)), add(Bp, mul(n, hi)), add(A, mul(n, hi))];
  }
  // Fenster-Aufbau: Spalten (Breite fest oder automatisch), Ober- und Unterlicht, Öffnungsart je Feld; Rahmen und Pfosten
  const winDefault = w => { const n = w <= 1300 ? 1 : w <= 2500 ? 2 : 3; return { cols: Array(n).fill(null), top: null, bot: null, ops: { main: n === 1 ? ['dk-r'] : n === 2 ? ['dk-l', 'dk-r'] : ['dk-l', 'f', 'dk-r'], top: ['k'], bot: ['f'] }, frame: 70, mull: 90 }; };
  const winCfg = e => e.cfg || winDefault(e.w);
  function winCols(e) {
    const c = winCfg(e), fixed = c.cols.map(v => (v > 0 ? v : 0)), sum = fixed.reduce((a, b) => a + b, 0), nA = c.cols.filter(v => !(v > 0)).length;
    const ws = c.cols.map(v => (v > 0 ? v : nA ? Math.max(0, e.w - sum) / nA : 0));
    if (!nA && ws.length) ws[ws.length - 1] += e.w - sum; // ohne automatische Spalte gleicht die letzte aus
    return ws;
  }
  function winLayout(e) {
    const c = winCfg(e), W = e.w, Hh = e.h, f = c.frame ?? 70, m = c.mull ?? 90, ws = winCols(e), th = c.top?.h || 0, bh = c.bot?.h || 0;
    const xs = [0]; ws.forEach(w => xs.push(xs.at(-1) + w));
    const rows = [];
    if (bh > 0) rows.push({ key: 'bot', z0: 0, z1: bh, split: !!c.bot.split });
    rows.push({ key: 'main', z0: bh, z1: Hh - th, split: true });
    if (th > 0) rows.push({ key: 'top', z0: Hh - th, z1: Hh, split: !!c.top.split });
    const fields = [], bars = [];
    rows.forEach(rw => (rw.split ? ws.map((w, i) => [xs[i], xs[i + 1], i]) : [[0, W, 0]]).forEach(([x0, x1, i]) => {
      const gx0 = x0 + (x0 < 0.5 ? f : m / 2), gx1 = x1 - (x1 > W - 0.5 ? f : m / 2), gz0 = rw.z0 + (rw.z0 < 0.5 ? f : m / 2), gz1 = rw.z1 - (rw.z1 > Hh - 0.5 ? f : m / 2);
      fields.push({ row: rw.key, i, x0, x1, z0: rw.z0, z1: rw.z1, op: (c.ops?.[rw.key] || [])[i] || 'f', g: { x0: gx0, x1: Math.max(gx0 + 1, gx1), z0: gz0, z1: Math.max(gz0 + 1, gz1) } });
    }));
    rows.slice(1).forEach(rw => bars.push({ x0: f, x1: W - f, z0: rw.z0 - m / 2, z1: rw.z0 + m / 2 }));
    rows.forEach(rw => { if (rw.split) xs.slice(1, -1).forEach(x => bars.push({ x0: x - m / 2, x1: x + m / 2, z0: Math.max(rw.z0, f), z1: Math.min(rw.z1, Hh - f) })); });
    return { W, Hh, f, m, xs, ws, rows, fields, bars };
  }
  // Öffnungszeichen (DIN): Spitze zur Bandseite; Kipp = Spitze unten. Liefert Strecken im Feld (x nach rechts, z nach oben)
  function wopLines(op, g) {
    const xm = (g.x0 + g.x1) / 2, zm = (g.z0 + g.z1) / 2, L = [];
    if (op === 'd-l' || op === 'dk-l') L.push([[g.x1, g.z1], [g.x0, zm]], [[g.x0, zm], [g.x1, g.z0]]);
    if (op === 'd-r' || op === 'dk-r') L.push([[g.x0, g.z1], [g.x1, zm]], [[g.x1, zm], [g.x0, g.z0]]);
    if (op === 'k' || op.startsWith('dk')) L.push([[g.x0, g.z1], [xm, g.z0]], [[xm, g.z0], [g.x1, g.z1]]);
    if (op === 's') { const a = g.x0 + (g.x1 - g.x0) * 0.2, b = g.x1 - (g.x1 - g.x0) * 0.2; L.push([[a, zm], [b, zm]], [[b, zm], [b - 80, zm + 60]], [[b, zm], [b - 80, zm - 60]]); }
    return L;
  }
  const winText = e => { const L = winLayout(e), c = winCfg(e), main = L.fields.filter(x => x.row === 'main'); return `${main.length}-teilig${c.top?.h ? ' mit Oberlicht' : ''}${c.bot?.h ? ', Unterlicht' : ''} · ${main.map(x => WOPS.find(o => o[0] === x.op)?.[2] || 'F').join(' | ')}`; };
  // 3D: Rahmen und Pfosten, Glas durchscheinend, Öffnungszeichen auf beiden Seiten
  function winMesh(e, frameCol, out, glassOut, lines) {
    const w = hostOf(e);
    if (!w) return;
    const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), fd = 80, [z0] = opZ(e), L = winLayout(e);
    const o2 = add(add(w.a, mul(d, e.at - e.w / 2)), mul(n, (lo + hi) / 2 - fd / 2)), T = { o: [o2[0], o2[1], z0], u: [d[0], d[1], 0], v: [0, 0, 1], n: [n[0], n[1], 0] };
    const R = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    extrude(R(0, L.W, 0, L.Hh), [R(L.f, L.W - L.f, L.f, L.Hh - L.f)], 0, fd, frameCol, out, lines, T);
    L.bars.forEach(b => extrude(R(b.x0, b.x1, b.z0, b.z1), [], 0, fd, frameCol, out, null, T));
    const W3 = (x, z, k) => add(add(add(T.o, mul(T.u, x)), mul(T.v, z)), mul(T.n, k));
    L.fields.forEach(fl => {
      extrude(R(fl.g.x0, fl.g.x1, fl.g.z0, fl.g.z1), [], fd / 2 - 12, fd / 2 + 12, [0.55, 0.76, 0.92], glassOut, null, T);
      if (lines) wopLines(fl.op, fl.g).forEach(([a, b]) => [fd + 1, -1].forEach(k => lines.push(W3(a[0], a[1], k), W3(b[0], b[1], k))));
    });
  }
  const opZ = o => { if (o.type === 'hole') { const h = hostOf(o); return h ? zRange(h) : [0, 0]; } const w = hostOf(o), z0 = w ? zRange(w)[0] : st(o.storey).elev; return [z0 + (o.sill || 0), z0 + (o.sill || 0) + o.h]; };
  function footprint(e) {
    switch (e.type) {
      case 'wall': return wallPoly(e);
      case 'column': return colPoly(e);
      case 'beam': return beamPoly(e);
      case 'roof': return roofGeo(e).outer;
      case 'stair': return stairGeo(e).foot;
      default: return OPS.includes(e.type) ? opPoly(e) : e.pts;
    }
  }
  const zOf = e => (OPS.includes(e.type) ? opZ(e) : zRange(e));
  // Stützen in einer Wand: Bereich entlang der Wand, Höhe, Lage quer (null = über die ganze Wanddicke)
  function wallColCuts(w, poly = wallPoly(w)) {
    const { d } = wallAxis(w), n = perp(d), [wlo, whi] = wallOffs(w), sv = p => dot(sub(p, w.a), d), lat = p => dot(sub(p, w.a), n);
    const ws = poly.map(sv), sMin = Math.min(...ws), sMax = Math.max(...ws), out = [];
    B.els.forEach(c => {
      if (c.type !== 'column' || c.storey !== w.storey) return;
      const P = colPoly(c), ss = P.map(sv), ls = P.map(lat), l0 = Math.min(...ls), l1 = Math.max(...ls), s0 = Math.min(...ss), s1 = Math.max(...ss);
      if (l1 <= wlo + 0.5 || l0 >= whi - 0.5 || s1 <= sMin + 0.5 || s0 >= sMax - 0.5) return;
      const [cz0, cz1] = zRange(c);
      out.push({ s0, s1, b: cz0, t: cz1, lat: l0 <= wlo + 0.5 && l1 >= whi - 0.5 ? null : [l0, l1], col: c.id });
    });
    return out;
  }
  function wallPieces(w) {
    const poly = wallPoly(w), [z0, z1] = zRange(w), { d } = wallAxis(w), n = perp(d), lat = p => dot(sub(p, w.a), n);
    const ops = [...B.els.filter(o => o.host === w.id && WALL_OPS.includes(o.type)).map(o => ({ s0: o.at - o.w / 2, s1: o.at + o.w / 2, b: z0 + (o.sill || 0), t: z0 + (o.sill || 0) + o.h })), ...wallColCuts(w, poly)];
    if (!ops.length) return [{ poly, z0, z1 }];
    const sv = p => dot(sub(p, w.a), d), cuts = [...new Set([-1e7, ...ops.flatMap(o => [o.s0, o.s1]), 1e7])].sort((a, b) => a - b), out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1], m = (s0 + s1) / 2, strip = clipBy(clipBy(poly, p => sv(p) - s0), p => s1 - sv(p));
      if (strip.length < 3 || s1 - s0 < 0.01) continue;
      const hit = ops.filter(o => m > o.s0 && m < o.s1);
      if (!hit.length) { out.push({ poly: strip, z0, z1 }); continue; }
      const lo2 = Math.min(...hit.map(o => o.b)), hi2 = Math.max(...hit.map(o => o.t));
      if (lo2 > z0 + 0.5) out.push({ poly: strip, z0, z1: Math.min(lo2, z1) });
      if (hi2 < z1 - 0.5) out.push({ poly: strip, z0: Math.max(hi2, z0), z1 });
      // Stütze schmaler als die Wand: die Wand bleibt neben der Stütze stehen
      if (!hit.some(o => !o.lat)) {
        const o = hit[0], zb = Math.max(lo2, z0), zt = Math.min(hi2, z1);
        if (zt > zb + 0.5) [clipBy(strip, p => o.lat[0] - lat(p)), clipBy(strip, p => lat(p) - o.lat[1])].forEach(Q => { if (Q.length >= 3 && Math.abs(area2(Q)) > 1) out.push({ poly: Q, z0: zb, z1: zt }); });
      }
    }
    return out;
  }
  // Dach: Traufe auf Höhe base; geneigt = untere Hülle der Dachflächen über den Traufkanten (gilt exakt für konvexe Umrisse)
  function roofGeo(e) {
    const s = st(e.storey), zE = s.elev + (e.base ?? s.height), n = e.pts.length, sg = Math.sign(area2(e.pts)) || 1;
    const edges = e.pts.map((a, i) => { const b = e.pts[(i + 1) % n], d = norm(sub(b, a)), ed = e.edges?.[i] || { eave: true, pitch: 30 }; return { a, b, d, nin: mul(perp(d), sg), eave: e.kind === 'pitched' && ed.eave !== false, k: Math.tan(Math.max(0, Math.min(80, ed.pitch ?? 30)) * Math.PI / 180) }; });
    const outer = e.over ? offsetPoly(e.pts, -e.over) : e.pts.map(p => [...p]);
    const eaves = edges.filter(x => x.eave);
    const Hf = x => p => dot(sub(p, x.a), x.nin) * x.k;
    const Hp = p => (eaves.length ? Math.min(...eaves.map(x => Hf(x)(p))) : 0);
    let facets = [outer];
    if (eaves.length) facets = eaves.map(x => eaves.reduce((P, y) => (y === x || P.length < 3 ? P : clipBy(P, p => Hf(y)(p) - Hf(x)(p))), outer)).filter(P => P.length >= 3 && Math.abs(area2(P)) > 1);
    const hs = facets.flat().map(Hp);
    return { zE, H: Hp, facets, outer, edges, minH: Math.min(0, ...hs), maxH: Math.max(0, ...hs) };
  }
  // Rasterdecke: herausgenommene Platten als Löcher
  function ceilHoles(e) {
    return (e.off || []).map(k => { const [i, j] = k.split(',').map(Number), x = e.ox + i * e.gx, y = e.oy + j * e.gy; return [[x, y], [x + e.gx, y], [x + e.gx, y + e.gy], [x, y + e.gy]]; }).filter(q => q.every(p => pip(p[0], p[1], e.pts) || e.pts.some(v => near(v, p, 1))));
  }
  const ceilBox = e => { const xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const modp = (v, g) => ((v % g) + g) % g;
  // Randstreifen: Breite der Zuschnitte an den vier Seiten des umschließenden Rechtecks (0 = volle Platte)
  function ceilStrips(e) { const b = ceilBox(e); return { l: modp(e.ox - b.x0, e.gx), r: modp(b.x1 - e.ox, e.gx), u: modp(e.oy - b.y0, e.gy), o: modp(b.y1 - e.oy, e.gy) }; }
  // Platten zählen: voll (ganz im Umriss), Zuschnitt (teilweise), herausgenommen
  function ceilTiles(e) {
    const b = ceilBox(e), off = new Set(e.off || []), full = [], cut = [];
    const inside = (x, y) => pip(x, y, e.pts) && !(e.holes || []).some(h => pip(x, y, h));
    for (let i = Math.floor((b.x0 - e.ox) / e.gx); e.ox + i * e.gx < b.x1; i++) for (let j = Math.floor((b.y0 - e.oy) / e.gy); e.oy + j * e.gy < b.y1; j++) {
      const x = e.ox + i * e.gx, y = e.oy + j * e.gy, c = [[x + 1, y + 1], [x + e.gx - 1, y + 1], [x + e.gx - 1, y + e.gy - 1], [x + 1, y + e.gy - 1]], k = c.filter(q => inside(q[0], q[1])).length;
      const any = k || inside(x + e.gx / 2, y + e.gy / 2) || [e.pts, ...(e.holes || [])].some(R => R.some(p => p[0] > x && p[0] < x + e.gx && p[1] > y && p[1] < y + e.gy));
      if (!any) continue;
      const t = { i, j, x, y, key: `${i},${j}` };
      if (k === 4) full.push(t); else cut.push(t);
      t.off = off.has(t.key);
    }
    return { full, cut };
  }
  // Rasterstart: von Ecke k aus beginnt die erste volle Platte nach rx bzw. ry (Randstreifen)
  function setCeilStart(e, k, rx, ry) {
    const c = e.pts[k], m = centroid(e.pts), sx = Math.sign(m[0] - c[0]) || 1, sy = Math.sign(m[1] - c[1]) || 1;
    e.start = { k, rx, ry }; e.ox = c[0] + sx * rx; e.oy = c[1] + sy * ry; e.off = [];
  }
  // Randstreifen gleich: Rest gleichmäßig auf beide Seiten, kein Streifen schmaler als ein Viertel
  function ceilEqual(e) {
    const b = ceilBox(e), ax = (lo, hi, g2) => { const Wd = hi - lo, n = Math.floor(Wd / g2); let st2 = (Wd - n * g2) / 2; if (st2 < g2 / 4 && n > 0) st2 = (Wd - (n - 1) * g2) / 2; return lo + st2; };
    e.ox = ax(b.x0, b.x1, e.gx); e.oy = ax(b.y0, b.y1, e.gy); e.start = null; e.off = [];
  }
  const shaftsThrough = s => B.els.filter(e => e.type === 'shaft' && (() => { const [z0, z1] = shaftRange(e); return s.elev > z0 + 1e-6 && s.elev <= z1 + 1e-6; })());

  // ---------- Kamera ----------
  const basis = () => {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { rx: [cy, -sy, 0], ry: [-sy * sp, -cy * sp, -cp], rz: [sy * cp, cy * cp, -sp] };
  };
  const P3 = p => { const { rx, ry, rz } = basis(), d = sub(p, mid); return [W / 2 + cam.panX + dot(rx, d) * cam.sc, H / 2 + cam.panY + dot(ry, d) * cam.sc, dot(rz, d)]; };
  const P2 = (p, z = curSt().elev) => P3([p[0], p[1], z]);
  const unP = (x, y, z) => { const { rx, ry, rz } = basis(); return add(add(add(mid, mul(rx, (x - W / 2 - cam.panX) / cam.sc)), mul(ry, (y - H / 2 - cam.panY) / cam.sc)), mul(rz, z)); };
  const onPlane = (x, y, z0 = curSt().elev) => { const { rz } = basis(); if (Math.abs(rz[2]) < 0.12) return null; const P = unP(x, y, 0), t = (z0 - P[2]) / rz[2]; return [P[0] + rz[0] * t, P[1] + rz[1] * t]; };
  function bounds() {
    const pts = [];
    B.els.forEach(e => { if (!visible(st(e.storey))) return; const [z0, z1] = zOf(e); footprint(e).forEach(p => pts.push([...p, z0], [...p, z1])); });
    B.grids.forEach(g => pts.push([...g.a, curSt().elev], [...g.b, curSt().elev]));
    // Platz für Achsköpfe und Maßketten vor dem Achsanfang
    if (B.grids.length > 1) { const e2 = Math.max(1500, 0.12 * Math.max(...B.grids.flatMap(g => [Math.abs(g.b[0] - g.a[0]), Math.abs(g.b[1] - g.a[1])]))); B.grids.forEach(g => { const d = norm(sub(g.b, g.a)); if (Number.isFinite(d[0])) pts.push([...sub(g.a, mul(d, e2)), curSt().elev], [...add(g.b, mul(d, e2)), curSt().elev]); }); }
    B.underlays.filter(u => u.storey === cur).forEach(u => ulCorners(u).forEach(p => pts.push([...p, curSt().elev])));
    if (!pts.length) pts.push([-5000, -5000, curSt().elev], [15000, 10000, curSt().elev + curSt().height]);
    return { mn: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), mx: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k]))) };
  }
  // Auswahl als Quader (Bauteile und Achse), null ohne Auswahl
  function selBox() {
    const pts = [];
    selIds().map(elById).filter(Boolean).forEach(e => { const [z0, z1] = zOf(e); (footprint(e) || []).forEach(p => pts.push([...p, z0], [...p, z1])); });
    const g = selGrid(); if (g) pts.push([...g.a, curSt().elev], [...g.b, curSt().elev]);
    if (!pts.length) return null;
    return { mn: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), mx: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k]))) };
  }
  // Auf die Auswahl einpassen: Blickrichtung und Drehpunkt-Mitte bleiben, nur Maßstab und Verschiebung ändern sich
  function fitSel() {
    const bb = selBox();
    if (!bb) { fitView(); return; }
    const { mn, mx } = bb, c = mn.map((v, k) => (v + mx[k]) / 2), A = viewArea(), { rx, ry } = basis();
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => [0, 1, 2].map(k => ((b >> k) & 1 ? mx[k] : mn[k])));
    const ext = r => Math.max(1500, ...corners.map(q => Math.abs(dot(r, sub(q, c))) * 2));
    cam.sc = Math.min(20, Math.min((A.x1 - A.x0) / ext(rx), Math.max(80, A.y1 - A.y0) / ext(ry)) * 0.8);
    const s2 = P3(c); cam.panX += (A.x0 + A.x1) / 2 - s2[0]; cam.panY += (A.y0 + Math.max(A.y0 + 80, A.y1)) / 2 - s2[1];
  }
  // freier Bereich der Zeichenfläche: Desktop (Paletten sind angedockt, nichts schwebt über dem Modell) bzw. neben/über schwebenden Fenstern
  function viewArea() {
    const cr = cv.getBoundingClientRect(), dlr = !dlgEl.hidden ? dlgEl.getBoundingClientRect() : null;
    if (desk) { let x1 = W - 12; if (dlr?.width && dlr.left > cr.left) x1 = Math.min(x1, dlr.left - cr.left - 12); return { x0: 12, x1: Math.max(x1, 160), y0: 12, y1: H - 12 }; }
    const ifr = !infoEl.hidden && W > 700 ? infoEl.getBoundingClientRect() : null, side = W > 700 ? (dlr?.width ? dlr : ifr?.width ? ifr : null) : null;
    const dr = dlr && W <= 700 ? dlr : null;
    return { x0: listOpen && W > 700 ? 320 : 12, x1: side ? side.left - cr.left - 12 : W - 12, y0: 64, y1: dr && dr.height ? dr.top - cr.top - 8 : H - 130 };
  }
  // Drehpunkt: Mitte der Auswahl, sonst der Punkt auf dem Bauteil unter dem Zeiger, sonst auf der Geschossebene
  function orbitPivot(x, y) {
    const bb = selBox();
    if (bb) return bb.mn.map((v, k) => (v + bb.mx[k]) / 2);
    const h = pickEl(x, y), e = h?.el && elById(h.el);
    if (e) {
      const [z0, z1] = zOf(e), fp = footprint(e);
      if (fp?.length > 2) {
        for (const z of [z1, z0]) { const p = onPlane(x, y, z); if (p && pip(p[0], p[1], fp)) return [...p, z]; }
        // seitlich getroffen: nächster Punkt des Umrisses auf halber Höhe
        const zm = (z0 + z1) / 2, p = onPlane(x, y, zm);
        if (p) { let best = null; fp.forEach((q, i) => { const r2 = fp[(i + 1) % fp.length], d = sub(r2, q), L2 = dot(d, d), t = L2 ? Math.max(0, Math.min(1, dot(sub(p, q), d) / L2)) : 0, c = add(q, mul(d, t)), dd = len(sub(p, c)); if (!best || dd < best.d) best = { c, d: dd }; }); return [...best.c, zm]; }
        const c = centroid(fp); return [c[0], c[1], zm];
      }
    }
    const p = onPlane(x, y);
    return p ? [...p, curSt().elev] : null;
  }
  function fitView() {
    const { mn, mx } = bounds();
    mid = mn.map((v, k) => (v + mx[k]) / 2); size = Math.max(1000, len(sub(mx, mn)));
    const { rx, ry } = basis(), { x0, x1, y0, y1 } = viewArea();
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => [0, 1, 2].map(k => ((b >> k) & 1 ? mx[k] : mn[k])));
    const ext = r => Math.max(1, ...corners.map(c => Math.abs(dot(r, sub(c, mid))))) * 2;
    cam.sc = Math.min((x1 - x0) / ext(rx), Math.max(80, y1 - y0) / ext(ry)) * 0.9;
    cam.panX = (x0 + x1) / 2 - W / 2; cam.panY = (y0 + Math.max(y0 + 80, y1)) / 2 - H / 2;
  }
  function setPlan(on) {
    cam.plan = on;
    if (on) { cam.yaw = 0; cam.pitch = Math.PI / 2 - 1e-4; } else { cam.yaw = -0.6; cam.pitch = 0.55; }
    fitView(); dirty = true; renderUi(); draw();
  }

  // ---------- Geometrie ----------
  // Prisma aus Grundriss (mit Löchern) zwischen z0 und z1. T: lokales System {o, u, v, n}, sonst Grundriss x/y und Höhe z
  // Teil der Strecke p→q (Parameter 0..1), der außerhalb aller konvexen Polygone Ks liegt
  function segOutside(p, q, Ks) {
    const d = sub(q, p), iv = [];
    Ks.forEach(K => {
      const sg = area2(K) >= 0 ? 1 : -1; let t0 = 0, t1 = 1, ok = true;
      for (let i = 0; i < K.length && ok; i++) {
        const a = K[i], b = K[(i + 1) % K.length], e = sub(b, a), nx = [e[1] * sg, -e[0] * sg], den = dot(nx, d), num2 = dot(nx, sub(a, p)); // innen: dot(nx, x - a) <= 0
        if (Math.abs(den) < 1e-12) { if (num2 < -1e-9) ok = false; continue; }
        const t = num2 / den; if (den > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t);
      }
      if (ok && t1 - t0 > 1e-6) iv.push([t0, t1]);
    });
    iv.sort((x, y) => x[0] - y[0]);
    const out = []; let c = 0;
    for (const [a, b] of iv) { if (a > c + 1e-6) out.push([c, a]); c = Math.max(c, b); }
    if (c < 1 - 1e-6) out.push([c, 1]);
    return out.filter(([a, b]) => (b - a) * len(d) > 1);
  }
  // Kantenlinien einer Wand: Umriss oben, unten, senkrecht – ohne die Teile, die in einer Stütze liegen (Gehrung und Stoß verschwinden hinter der Stütze)
  function wallOutline(w, z0, z1, lines) {
    const fp = footprint(w), cols = B.els.filter(c => c.type === 'column' && c.storey === w.storey && shown(c)).map(c => ({ K: colPoly(c), r: zRange(c) }));
    const Ks = z => cols.filter(c => z >= c.r[0] - 1 && z <= c.r[1] + 1).map(c => c.K);
    const P = fp.filter((p, i) => !near(p, fp[(i + 1) % fp.length], 0.01));
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], d = sub(q, p);
      for (const z of [z0, z1]) segOutside(p, q, Ks(z)).forEach(([a, b]) => lines.push([...add(p, mul(d, a)), z], [...add(p, mul(d, b)), z]));
      if (!Ks((z0 + z1) / 2).some(K => pip(p[0], p[1], K))) lines.push([...p, z0], [...p, z1]);
    }
  }
  function extrude(outer, holes, z0, z1, col, out, lines, T) {
    let P0 = outer.filter((p, i) => !near(p, outer[(i + 1) % outer.length], 0.01));
    if (P0.length < 3) return;
    if (area2(P0) < 0) P0 = [...P0].reverse();
    const Hs = (holes || []).filter(h => h.length >= 3).map(h => (area2(h) > 0 ? [...h].reverse() : [...h]));
    const P = Hs.length ? bridge(P0, Hs) : P0;
    const W3 = T ? (p, z) => add(add(add(T.o, mul(T.u, p[0])), mul(T.v, p[1])), mul(T.n, z)) : (p, z) => [p[0], p[1], z];
    const N3 = T ? q => add(add(mul(T.u, q[0]), mul(T.v, q[1])), mul(T.n, q[2])) : q => q;
    const put = (p, q) => out.push(p[0], p[1], p[2], q[0], q[1], q[2], col[0], col[1], col[2]);
    const up = N3([0, 0, 1]), dn = N3([0, 0, -1]);
    triangulate(P).forEach(([a, b, c]) => { put(W3(P[a], z1), up); put(W3(P[b], z1), up); put(W3(P[c], z1), up); put(W3(P[a], z0), dn); put(W3(P[c], z0), dn); put(W3(P[b], z0), dn); });
    for (const ring of [P0, ...Hs]) {
      const smooth = ring.length > 16;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length], e = sub(q, p), l = len(e);
        if (l < 0.01) continue;
        const nn = N3([e[1] / l, -e[0] / l, 0]), A = W3(p, z0), Bq = W3(q, z0), C = W3(q, z1), D = W3(p, z1);
        [A, Bq, C, A, C, D].forEach(v => put(v, nn));
        if (lines) { lines.push(A, Bq, D, C); if (!smooth) lines.push(A, D); }
      }
    }
  }
  const prism = (poly, z0, z1, col, out, lines) => extrude(poly, [], z0, z1, col, out, lines);
  // Stahlprofil entlang einer Achse
  function steelAlong(sec, P0, P1, upHint, rotDeg, col, out, lines) {
    const ax = sub(P1, P0), L = len(ax);
    if (L < 1) return;
    const n = mul(ax, 1 / L);
    let v = norm(sub(upHint, mul(n, dot(upHint, n))));
    let u = cross3(v, n);
    if (rotDeg) { const a = rotDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), u2 = add(mul(u, c), mul(v, s)); v = add(mul(v, c), mul(u, -s)); u = u2; }
    extrude(sec.outer, sec.holes, 0, L, col, out, lines, { o: P0, u, v, n });
  }
  // Geneigtes Dach: je Fläche Ober- und Unterseite, Stirnseiten am Rand, Giebel unter Giebelkanten
  function roofMesh(e, col, out, lines) {
    const g = roofGeo(e), t = e.t || 200, put = (p, q) => out.push(p[0], p[1], p[2], q[0], q[1], q[2], col[0], col[1], col[2]);
    if (e.kind !== 'pitched' || !g.edges.some(x => x.eave)) {
      extrude(g.outer, [], g.zE, g.zE + t, col, out, lines);
      const par = e.par || {};
      if (e.kind !== 'pitched' && par.h > 0 && par.w > 0) extrude(offsetPoly(e.pts, -(par.o || 0)), [offsetPoly(e.pts, par.w - (par.o || 0))], g.zE + t, g.zE + t + par.h, col.map(v => v * 0.92), out, lines);
      return;
    }
    const onRim = (p, q) => g.outer.some((a, i) => { const b = g.outer[(i + 1) % g.outer.length]; return segD(p[0], p[1], a, b)[0] < 0.5 && segD(q[0], q[1], a, b)[0] < 0.5; });
    for (const F0 of g.facets) {
      const F = area2(F0) < 0 ? [...F0].reverse() : F0, lo = F.map(p => [p[0], p[1], g.zE + g.H(p)]), hi = lo.map(p => [p[0], p[1], p[2] + t]);
      let nn = norm(cross3(sub(lo[1], lo[0]), sub(lo[2], lo[0])));
      if (nn[2] < 0) nn = mul(nn, -1);
      for (let i = 1; i < F.length - 1; i++) { put(hi[0], nn); put(hi[i], nn); put(hi[i + 1], nn); put(lo[0], mul(nn, -1)); put(lo[i + 1], mul(nn, -1)); put(lo[i], mul(nn, -1)); }
      for (let i = 0; i < F.length; i++) {
        const j = (i + 1) % F.length;
        lines.push(hi[i], hi[j]);
        if (!onRim(F[i], F[j])) continue;
        const e2 = sub(F[j], F[i]), l = len(e2), sn = [e2[1] / l, -e2[0] / l, 0];
        [lo[i], lo[j], hi[j], lo[i], hi[j], hi[i]].forEach(p => put(p, sn));
        lines.push(lo[i], lo[j], lo[i], hi[i]);
      }
    }
    // Giebel: senkrechte Scheibe unter jeder Giebelkante des Umrisses
    if (e.gable !== false) g.edges.filter(x => !x.eave).forEach(x => {
      const L = len(sub(x.b, x.a)), N = 32, top = Array.from({ length: N + 1 }, (_, k) => { const s2 = L * k / N; return [s2, Math.max(0, g.H(add(x.a, mul(x.d, s2))))]; });
      if (top.every(q => q[1] < 1)) return;
      const poly = [[0, 0], [L, 0], ...top.reverse()];
      extrude(poly, [], 0, e.gt || 240, col.map(v => v * 0.95), out, lines, { o: [x.a[0], x.a[1], g.zE], u: [x.d[0], x.d[1], 0], v: [0, 0, 1], n: [x.nin[0], x.nin[1], 0] });
    });
  }
  // Ein Bauteil als Dreiecke (9 Zahlen je Ecke), Kanten als Punktpaare
  function elemMesh(e, col, out, lines, lift = 0) {
    const s = st(e.storey);
    if (!s) return;
    const [z0, z1] = zRange(e);
    switch (e.type) {
      case 'wall': {
        wallPieces(e).forEach(pc => prism(pc.poly, pc.z0, pc.z1, col, out, null));
        if (lines) {
          wallOutline(e, z0, z1, lines);
          B.els.filter(o => o.host === e.id && WALL_OPS.includes(o.type)).forEach(o => { const P = opPoly(o), [b, t] = opZ(o); [[P[0], P[1]], [P[3], P[2]]].forEach(([p, q]) => lines.push([...p, b], [...q, b], [...q, b], [...q, t], [...q, t], [...p, t], [...p, t], [...p, b])); });
        }
        return;
      }
      case 'column':
        if (e.shape === 'steel') steelAlong(steelSection(e.prof), [e.p[0], e.p[1], z0], [e.p[0], e.p[1], z1 + lift], [Math.cos(((e.rot || 0) + 90) * Math.PI / 180), Math.sin(((e.rot || 0) + 90) * Math.PI / 180), 0], 0, col, out, lines);
        else prism(colPoly(e), z0 + lift, z1 + lift, col, out, lines);
        return;
      case 'beam': {
        if (e.shape === 'steel') { const c = z1 - beamDims(e).h / 2; steelAlong(steelSection(e.prof), [e.a[0], e.a[1], c], [e.b[0], e.b[1], c], [0, 0, 1], e.rot90 ? 90 : 0, col, out, lines); }
        else prism(beamPoly(e), z0, z1, col, out, lines);
        return;
      }
      case 'slab': extrude(e.pts, [...B.els.filter(o => o.host === e.id && o.type === 'hole').map(opPoly), ...shaftsThrough(s).map(x => x.pts)], z0, z1, col, out, lines); return;
      case 'roof': roofMesh(e, col, out, lines || []); return;
      case 'ceil': {
        extrude(e.pts, [...ceilHoles(e), ...(e.holes || [])], z0, z1, col, out, lines);
        if (lines) for (const [k, g2, o2] of [[0, e.gx, e.ox], [1, e.gy, e.oy]]) {
          const vals = e.pts.map(p => p[k]), lo = Math.min(...vals), hi = Math.max(...vals), d = k ? [1, 0] : [0, 1];
          for (let c = Math.ceil((lo - o2) / g2) * g2 + o2; c < hi; c += g2) { const p = k ? [0, c] : [c, 0]; lineInPoly(e.pts, p, d, e.holes || []).forEach(([a, b]) => lines.push([a[0], a[1], z0 - 1], [b[0], b[1], z0 - 1])); }
        }
        return;
      }
      case 'shaft': prism(e.pts, z0, z1, col, out, lines); return;
      case 'space': extrude(e.pts, e.holes || [], z0, z1, col, out, lines); return;
      case 'stair': { const g = stairGeo(e); g.steps.forEach(q => prism(q.poly, z0, q.z1, col, out, lines)); if (g.land) prism(g.land.poly, z0, g.land.z1, col, out, lines); return; }
    }
  }

  // ---------- WebGL ----------
  const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uM; uniform mat3 uR; varying vec3 vN; varying vec3 vC;
void main() { gl_Position = uM * vec4(aPos, 1.0); vN = uR * aNor; vC = aCol; }`;
  const FS = `precision mediump float;
uniform vec3 uL; uniform float uAlpha; uniform float uFlat; varying vec3 vN; varying vec3 vC;
void main() { vec3 n = normalize(vN); float d = abs(dot(n, uL)); vec3 col = mix(vC * (0.55 + 0.5 * d), vC, uFlat); gl_FragColor = vec4(col * uAlpha, uAlpha); }`;
  const gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  let glp = null, triN = 0, lineN = 0, prevN = 0, transN = 0;
  if (gl) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    const u = n => gl.getUniformLocation(p, n), a = n => gl.getAttribLocation(p, n);
    glp = { p, tris: gl.createBuffer(), lines: gl.createBuffer(), prev: gl.createBuffer(), trans: gl.createBuffer(), aPos: a('aPos'), aNor: a('aNor'), aCol: a('aCol'), uM: u('uM'), uR: u('uR'), uL: u('uL'), uAlpha: u('uAlpha'), uFlat: u('uFlat') };
  }
  const attribs = () => { [[glp.aPos, 0], [glp.aNor, 12], [glp.aCol, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off); }); };
  const COL = { stair: [0.82, 0.80, 0.76], base: [0.70, 0.71, 0.73], wall: [0.87, 0.85, 0.81], column: [0.70, 0.73, 0.77], steel: [0.52, 0.58, 0.66], beam: [0.80, 0.78, 0.74], slab: [0.78, 0.79, 0.81], flat: [0.66, 0.67, 0.69], roof: [0.70, 0.40, 0.33], ceil: [0.95, 0.95, 0.92], shaft: [0.95, 0.62, 0.25] };
  // Grundriss: geschnittene Bauteile dunkel, Decken hell, ohne Schattierung
  const PLAN = { wall: [0.36, 0.38, 0.41], column: [0.22, 0.24, 0.27], steel: [0.22, 0.24, 0.27], slab: [0.95, 0.95, 0.94], base: [0.95, 0.95, 0.94] };
  const colOf = e => (e.type === 'column' && e.shape === 'steel' ? 'steel' : e.type === 'beam' && e.shape === 'steel' ? 'steel' : e.type === 'roof' && e.kind !== 'pitched' ? 'flat' : e.type === 'slab' && e.base ? 'base' : e.type);
  function buildGeometry() {
    const tris = [], trans = [], lines = [], acc = rgb('--accent', [0.04, 0.49, 0.74]);
    for (const e of B.els) {
      const s = st(e.storey);
      if (!s || !visible(s) || OPS.includes(e.type) || e.type === 'space' || !shown(e)) continue;
      if (cam.plan && ABOVE.includes(e.type)) continue; // über der Schnittebene: im Grundriss gestrichelt
      const k = colOf(e);
      let c = isSel(e.id) ? (cam.plan ? acc : acc.map(v => v * 0.7 + 0.3)) : ((cam.plan ? PLAN[k] : null) || COL[k]);
      if (s.id !== cur && !isSel(e.id)) c = c.map(v => v * 0.92 + 0.06);
      elemMesh(e, c, e.type === 'ceil' || e.type === 'shaft' ? trans : tris, lines);
    }
    // Gelände: durchscheinende Fläche um das Gebäude
    if (B.terrain != null && !B.vis.off.terrain && !cam.plan && B.els.length) {
      const all = B.els.filter(e => !OPS.includes(e.type)).flatMap(footprint), xs = all.map(p => p[0]), ys = all.map(p => p[1]), m = 6000;
      prism([[Math.min(...xs) - m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.max(...ys) + m], [Math.min(...xs) - m, Math.max(...ys) + m]], B.terrain - 10, B.terrain, [0.52, 0.66, 0.42], trans, null);
    }
    // Fenster mit Rahmen, Pfosten, Glas
    if (!cam.plan) B.els.forEach(o => { if (o.type !== 'window' || !shown(o) || !visible(st(o.storey))) return; winMesh(o, isSel(o.id) ? acc : [0.95, 0.95, 0.96], tris, trans, lines); });
    // ausgewählte Öffnungen als Körper hervorheben
    selIds().map(elById).filter(o => o && OPS.includes(o.type)).forEach(o => { const [b, t] = opZ(o); prism(opPoly(o), b - 2, t + 2, acc, tris, lines); });
    triN = tris.length / 9; transN = trans.length / 9;
    const L = new Float32Array(lines.length * 9);
    lines.forEach((p, i) => L.set([p[0], p[1], p[2], 0, 0, 1, 0, 0, 0], i * 9));
    lineN = lines.length;
    if (glp) {
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.tris); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.trans); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trans), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.lines); gl.bufferData(gl.ARRAY_BUFFER, L, gl.STATIC_DRAW);
    }
    dirty = false;
  }
  function previewGeometry() {
    const out = [], acc = rgb('--accent', [0.04, 0.49, 0.74]), pv = cmdPreview();
    if (pv) prism(pv.poly, pv.z0, pv.z1, acc, out, null);
    prevN = out.length / 9;
    if (glp && prevN) { gl.bindBuffer(gl.ARRAY_BUFFER, glp.prev); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW); }
  }
  function renderGL() {
    const dpr = devicePixelRatio || 1, w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
    if (!glp) return;
    if (dirty) buildGeometry();
    previewGeometry();
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { rx, ry, rz } = basis(), zr = size * 1.5;
    const rows = [
      [...mul(rx, 2 * cam.sc / W), 2 * (W / 2 + cam.panX) / W - 1 - (2 * cam.sc / W) * dot(rx, mid)],
      [...mul(ry, -2 * cam.sc / H), 1 - 2 * (H / 2 + cam.panY) / H + (2 * cam.sc / H) * dot(ry, mid)],
      [...mul(rz, 1 / zr), -dot(rz, mid) / zr],
      [0, 0, 0, 1],
    ];
    const M = new Float32Array(16), R3 = new Float32Array(9);
    for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) M[c * 4 + k] = rows[k][c];
    [rx, ry, rz].forEach((row, k) => row.forEach((v, c) => { R3[c * 3 + k] = v; }));
    gl.useProgram(glp.p);
    gl.uniformMatrix4fv(glp.uM, false, M); gl.uniformMatrix3fv(glp.uR, false, R3);
    gl.uniform3fv(glp.uL, norm([-0.45, -0.65, -0.6]));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(glp.uAlpha, 1); gl.uniform1f(glp.uFlat, cam.plan ? 1 : 0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    if (triN) { gl.bindBuffer(gl.ARRAY_BUFFER, glp.tris); attribs(); gl.drawArrays(gl.TRIANGLES, 0, triN); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (lineN) {
      const edge = isDark() ? [0.2, 0.22, 0.25] : [0.25, 0.27, 0.3];
      gl.uniform1f(glp.uFlat, 1); gl.uniform1f(glp.uAlpha, 0.85); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.lines); attribs(); gl.disableVertexAttribArray(glp.aCol); gl.vertexAttrib3fv(glp.aCol, edge);
      gl.drawArrays(gl.LINES, 0, lineN); gl.enableVertexAttribArray(glp.aCol);
    }
    // Rasterdecken und Schächte durchscheinend, sie verdecken nichts
    if (transN) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1f(glp.uFlat, 0); gl.uniform1f(glp.uAlpha, 0.45);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.trans); attribs(); gl.drawArrays(gl.TRIANGLES, 0, transN);
      gl.depthMask(true);
    }
    if (prevN) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.uniform1f(glp.uFlat, 0); gl.uniform1f(glp.uAlpha, 0.4);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.prev); attribs(); gl.drawArrays(gl.TRIANGLES, 0, prevN);
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND);
  }

  // ---------- Achsraster ----------
  const gridCross = () => {
    const out = [];
    for (let i = 0; i < B.grids.length; i++) for (let j = i + 1; j < B.grids.length; j++) {
      const g = B.grids[i], h = B.grids[j], d1 = sub(g.b, g.a), d2 = sub(h.b, h.a), den = cross2(d1, d2);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross2(sub(h.a, g.a), d2) / den, s = cross2(sub(h.a, g.a), d1) / den;
      if (t < -0.01 || t > 1.01 || s < -0.01 || s > 1.01) continue;
      out.push({ p: add(g.a, mul(d1, t)), label: `Achse ${g.name}/${h.name}` });
    }
    return out;
  };
  const letter = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function nextGridName(vertical) {
    const names = new Set(B.grids.map(g => g.name));
    for (let i = 0; i < 999; i++) { const n = vertical ? String(i + 1) : letter(i); if (!names.has(n)) return n; }
    return '?';
  }
  // xs, ys: Abstände zwischen den Achsen (Liste), Achsen 1, 2, 3 … senkrecht, A, B, C … waagerecht
  function makeGrid(xs, ys) {
    const cum = L => L.reduce((a, v) => [...a, a.at(-1) + v], [0]), X = xs.length ? cum(xs) : [], Y = ys.length ? cum(ys) : [], ex = 1500;
    const W2 = X.length ? X.at(-1) : 10000, H2 = Y.length ? Y.at(-1) : 10000;
    change(() => {
      B.grids = [];
      X.forEach((x, i) => B.grids.push({ id: uid(), name: String(i + 1), a: [x, -ex], b: [x, H2 + ex] }));
      Y.forEach((y, j) => B.grids.push({ id: uid(), name: letter(j), a: [-ex, y], b: [W2 + ex, y] }));
    });
    gridForm = false; fitView(); renderUi(); draw();
  }
  // Abstände als Liste: „6000 6000 7500“, „3x6000 7500“, „6.000; 7.500“
  function parseSpacing(str) {
    const out = [], t0 = String(str ?? '').replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2').replace(/\s*[x×*]\s*/gi, 'x');
    for (const t of t0.split(/[\s;+]+/).filter(Boolean)) {
      const m = t.match(/^(\d+)x([\d,.]+)$/i);
      if (m) { const n = +m[1], v = num(m[2]); if (n > 0 && n <= 60 && v > 0) for (let i = 0; i < n; i++) out.push(v); }
      else { const v = num(t); if (v > 0) out.push(v); }
    }
    return out.slice(0, 120);
  }
  // Scharen paralleler Achsen; n zeigt nach rechts bzw. oben, items nach Lage quer sortiert
  function gridFams() {
    const fams = [];
    for (const g of B.grids) {
      const d0 = norm(sub(g.b, g.a));
      if (!Number.isFinite(d0[0])) continue;
      let ang = Math.atan2(d0[1], d0[0]);
      if (ang < -1e-9) ang += Math.PI;
      if (ang >= Math.PI - 1e-9) ang -= Math.PI;
      let f = fams.find(x => Math.abs(x.ang - ang) < 0.004 || Math.abs(Math.abs(x.ang - ang) - Math.PI) < 0.004);
      if (!f) {
        const d = [Math.cos(ang), Math.sin(ang)]; let n = perp(d);
        if (Math.abs(n[0]) >= Math.abs(n[1]) ? n[0] < 0 : n[1] < 0) n = mul(n, -1);
        f = { ang, d, n, vert: Math.abs(d[1]) > Math.abs(d[0]), items: [] }; fams.push(f);
      }
      f.items.push({ g, off: dot(g.a, f.n) });
    }
    fams.forEach(f => f.items.sort((a, b) => a.off - b.off));
    return fams;
  }
  const famOf = g => gridFams().find(f => f.items.some(it => it.g === g));
  // Gruppen einer Schar: Achsen, die sich der Länge nach überlappen (z. B. links und rechts im Plan getrennt).
  // Eine Achse über mehrere Gruppen hinweg gehört zu allen davon. own = eigene Achsen, items = mit durchlaufenden, nach Lage sortiert
  function gridGroups(f) {
    const iv = f.items.map(it => { const u = dot(it.g.a, f.d), v = dot(it.g.b, f.d); return { it, t0: Math.min(u, v), t1: Math.max(u, v) }; }).sort((a, b) => (a.t1 - a.t0) - (b.t1 - b.t0));
    let grs = [];
    const ov = (a, b) => a.t0 < b.t1 - 1 && a.t1 > b.t0 + 1;
    for (const x of iv) {
      const hit = grs.filter(G => ov(x, G));
      if (!hit.length) grs.push({ t0: x.t0, t1: x.t1, own: [x.it], span: [] });
      else if (hit.length === 1) { const G = hit[0]; G.own.push(x.it); G.t0 = Math.min(G.t0, x.t0); G.t1 = Math.max(G.t1, x.t1); }
      else hit.forEach(G => G.span.push(x.it));
    }
    for (let k = true; k;) {
      k = false;
      for (let i = 0; i < grs.length && !k; i++) for (let j = i + 1; j < grs.length && !k; j++) if (ov(grs[i], grs[j])) {
        const A = grs[i], Bq = grs[j]; A.own.push(...Bq.own); A.span = [...new Set([...A.span, ...Bq.span])].filter(it => !A.own.includes(it)); A.t0 = Math.min(A.t0, Bq.t0); A.t1 = Math.max(A.t1, Bq.t1); grs.splice(j, 1); k = true;
      }
    }
    return grs.map(G => ({ ...G, n: f.n, d: f.d, f, items: [...new Set([...G.own, ...G.span])].sort((a, b) => a.off - b.off), side: G.own.find(it => it.g.dimSide)?.g.dimSide || 'a' }));
  }
  // Gruppe einer Achse (die, zu der sie selbst gehört; sonst die erste, die sie durchläuft)
  function grpOf(g) {
    const f = famOf(g); if (!f) return null;
    const G = gridGroups(f);
    return G.find(x => x.own.some(it => it.g === g)) || G.find(x => x.items.some(it => it.g === g));
  }
  const letterIdx = t => [...t].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const nextInSeq = t => (/^\d+$/.test(t) ? String(+t + 1) : /^[A-Z]+$/.test(t) ? letter(letterIdx(t) + 1) : null);
  const prevInSeq = t => (/^\d+$/.test(t) ? (+t > 1 ? String(+t - 1) : null) : /^[A-Z]+$/.test(t) && letterIdx(t) > 0 ? letter(letterIdx(t) - 1) : null);
  // Name für eine neue Achse der Schar an der Lage off: fortlaufend am Rand, dazwischen „2a“
  function famName(items, off, vert) {
    const names = new Set(B.grids.map(g => g.name)), before = [...items].reverse().find(it => it.off < off - 1), after = items.find(it => it.off > off + 1);
    if (before && after) { for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!names.has(before.g.name + c)) return before.g.name + c; }
    if (before && !after) { const x = nextInSeq(before.g.name); if (x && !names.has(x)) return x; }
    if (!before && after) { const x = prevInSeq(after.g.name); if (x && !names.has(x)) return x; }
    return nextGridName(vert);
  }
  // Parallele Achse im Abstand off (quer, in Richtung n der Schar) zu ref, gleiche Länge
  function addParallel(ref, off) {
    const f = famOf(ref); if (!f) return null;
    const o = dot(ref.a, f.n) + off;
    if ((grpOf(ref) || f).items.some(it => Math.abs(it.off - o) < 1)) return null;
    const g = { id: uid(), name: famName((grpOf(ref) || f).items, o, f.vert), a: add(ref.a, mul(f.n, off)).map(v => Math.round(v * 10) / 10), b: add(ref.b, mul(f.n, off)).map(v => Math.round(v * 10) / 10) };
    B.grids.push(g); return g;
  }
  function gridSeries(str, side) {
    const L = parseSpacing(str), ref0 = B.grids.find(g => g.id === cmd.ref) || B.grids.find(g => g.id === cmd.base);
    if (!L.length || !ref0) { env.toast('Abstand eingeben, z. B. 6000, 3x7500 oder 6000 6000 7500.'); return; }
    let ref = ref0, n = 0;
    change(() => { for (const v of L) { const g = addParallel(ref, side * v); if (g) { ref = g; n++; } } });
    cmd.ref = ref.id; cmd.side = side; renderUi(); draw();
    if (n > 1) env.toast(`${n} Achsen gesetzt.`);
  }
  // Abstand zwischen Achse i und i+1 einer Schar setzen: i+1 (und mit „mitschieben“ alle folgenden) wandern
  function setGap(f, i, val) { // f: Gruppe (items, n)
    const it = f.items[i], nx = f.items[i + 1];
    if (!it || !nx || !(val > 0)) return;
    const dl = val - (nx.off - it.off);
    if (Math.abs(dl) < 0.05) return;
    const mv = gMode !== 'one' ? f.items.slice(i + 1) : [nx];
    if (gMode === 'one' && f.items[i + 2] && nx.off + dl >= f.items[i + 2].off - 1) { env.toast(`Achse ${nx.g.name} würde über Achse ${f.items[i + 2].g.name} hinaus wandern. „Alle folgenden“ wählen.`); return; }
    change(() => { const ids = new Set(mv.map(({ g }) => g.id)), F = gridFollowers([...ids]); mv.forEach(({ g }) => { g.a = add(g.a, mul(f.n, dl)).map(r1); g.b = add(g.b, mul(f.n, dl)).map(r1); }); applyFollow(F, id => (ids.has(id) ? mul(f.n, dl) : [0, 0])); });
    renderUi(); draw();
  }
  function renumberGrids() {
    const fams = gridFams(); let ni = 0, li = 0;
    change(() => fams.forEach(f => f.items.forEach(({ g }) => { g.name = f.vert ? String(++ni) : letter(li++); })));
    renderUi(); draw(); env.toast('Achsen neu nummeriert: 1, 2, 3 … von links, A, B, C … von unten.');
  }
  // Mitnahme beim Verschieben einer Achse: one = nur diese, next = alle folgenden, all = ganze Gruppe
  let gMode = 'next', gdimHits = [], dimEdit = null, opHits = [];
  const r1 = v => Math.round(v * 10) / 10;
  // Liegt p auf der Achse g (innerhalb ihrer Länge)?
  const onGrid = (p, g) => { const v = sub(g.b, g.a), L = len(v); if (!L) return false; const d = mul(v, 1 / L), t = dot(sub(p, g.a), d); return t > -1 && t < L + 1 && Math.abs(cross2(d, sub(p, g.a))) < 1; };
  // Bauteile, die an den Achsen gids hängen: Stützen auf der Achse, Wand- und Trägerenden auf der Achse,
  // Stützen in einer Wand, die ganz auf der Achse liegt; Öffnungen behalten ihre Lage in der Wand
  function gridFollowers(gids) {
    const set = new Set(gids), G = B.grids.filter(g => set.has(g.id) && !g.free), out = [];
    if (!G.length) return out;
    const gsOf = p => G.filter(g => onGrid(p, g)).map(g => g.id);
    for (const e of B.els) {
      if (e.noGrid) continue;
      if (e.type === 'column') { const gs = gsOf(e.p); if (gs.length) out.push({ e, k: 'p', gs, p0: [...e.p] }); }
      else if (e.type === 'wall' || e.type === 'beam') {
        const ga = gsOf(e.a), gb = gsOf(e.b);
        if (ga.length) out.push({ e, k: 'a', gs: ga, p0: [...e.a] });
        if (gb.length) out.push({ e, k: 'b', gs: gb, p0: [...e.b] });
        if (e.type === 'wall' && (ga.length || gb.length)) B.els.filter(o => o.host === e.id && WALL_OPS.includes(o.type)).forEach(o => out.push({ e: o, k: 'op', w: e, at0: o.at, a0: [...e.a] }));
        const both = ga.filter(id => gb.includes(id));
        if (e.type === 'wall' && both.length) { const P = wallPoly(e); B.els.forEach(c => { if (c.type === 'column' && !c.noGrid && c.storey === e.storey && !out.some(f => f.e === c) && pip(c.p[0], c.p[1], P)) out.push({ e: c, k: 'p', gs: both, p0: [...c.p] }); }); }
      }
    }
    return out;
  }
  function applyFollow(F, dOf) {
    F.forEach(f => { if (f.k !== 'op') f.e[f.k] = add(f.p0, f.gs.reduce((s2, id) => add(s2, dOf(id)), [0, 0])).map(r1); });
    F.forEach(f => { if (f.k === 'op') { const { d, L } = wallAxis(f.w); f.e.at = Math.max(f.e.w / 2, Math.min(L - f.e.w / 2, r1(f.at0 - dot(sub(f.w.a, f.a0), d)))); } });
  }
  const G_MODES = [['one', 'Nur diese Achse'], ['next', 'Alle folgenden'], ['all', 'Ganze Gruppe']];
  // Maßketten am Raster: Abstände von Achse zu Achse und Gesamtmaß, je Schar vor dem Achsanfang
  function gridDims(z, col) {
    gdimHits = []; const placed = [];
    if (B.vis.off.grid) return;
    const sc = (() => { const a = P2([0, 0], z), b = P2([1000, 0], z); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000; })();
    if (!(sc > 0)) return;
    for (const f0 of gridFams()) for (const f of gridGroups(f0)) for (const sd of f.side === 'both' ? ['a', 'b'] : f.side === 'off' ? [] : [f.side]) {
      if (f.items.length < 2) continue;
      const sg = sd === 'b' ? 1 : -1, t0 = sd === 'b' ? f.t1 : f.t0;
      const at = (t, c) => add(mul(f.d, t), mul(f.n, c));
      let narrowFlip = false;
      const ou = (() => { const p0 = P2(at(t0, f.items[0].off), z), p1 = P2(at(t0 + sg * 1000, f.items[0].off), z), v = [p1[0] - p0[0], p1[1] - p0[1]], l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l]; })();
      const row = (px, i0, i1, val, hit) => {
        const t = t0 + sg * px / sc, A = P2(at(t, f.items[i0].off), z), Bp = P2(at(t, f.items[i1].off), z);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bp[0], Bp[1]);
        const dd = norm(sub(Bp.slice(0, 2), A.slice(0, 2))), tk = [(dd[0] - dd[1]) * 5, (dd[1] + dd[0]) * 5];
        for (const q of [A, Bp]) { ctx.moveTo(q[0] - tk[0], q[1] - tk[1]); ctx.lineTo(q[0] + tk[0], q[1] + tk[1]); }
        ctx.stroke();
        const txt = fmt(val);
        ctx.font = '600 12px system-ui'; const w = ctx.measureText(txt).width + 10;
        // zu eng für die Zahl: abwechselnd weiter nach außen
        const base = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], fits = o => { const mm = [base[0] + ou[0] * o, base[1] + ou[1] * o]; return !placed.some(r2 => Math.abs(r2[0] - mm[0]) < (r2[2] + w) / 2 + 2 && Math.abs(r2[1] - mm[1]) < 22); };
        let out2 = 0; for (const o of [0, 15, -18, 30, -34, 45]) if (fits(o)) { out2 = o; break; }
        const m = [base[0] + ou[0] * out2, base[1] + ou[1] * out2]; placed.push([m[0], m[1], w]);
        ctx.fillStyle = hit ? (css('--card') || '#fff') : 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.roundRect(m[0] - w / 2, m[1] - 10, w, 20, 5); ctx.fill();
        if (hit) { ctx.strokeStyle = 'rgba(200,60,60,.45)'; ctx.stroke(); }
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, m[0], m[1] + 0.5);
        if (hit) gdimHits.push({ x: m[0], y: m[1], w: Math.max(w, 44), ids: [f.items[i0].g.id, f.items[i1].g.id], val });
      };
      for (let i = 0; i < f.items.length - 1; i++) row(58, i, i + 1, f.items[i + 1].off - f.items[i].off, true);
      if (f.items.length > 2) row(88, 0, f.items.length - 1, f.items.at(-1).off - f.items[0].off, false);
    }
  }
  // Maße einer gewählten Öffnung auf der Wandfläche (zur Kamera hin): links/rechts bis zur nächsten Kante, Brüstung, bis UK Decke
  function opDims(o) {
    const w = hostOf(o);
    if (!w) return [];
    const { d, L } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), [z0, z1] = zRange(w), { rz } = basis();
    const off = n[0] * rz[0] + n[1] * rz[1] < 0 ? hi : lo;
    const Fp = (s2, z) => [...add(add(w.a, mul(d, s2)), mul(n, off)), z];
    const sv = q => dot(sub(q, w.a), d), lat = q => dot(sub(q, w.a), n);
    const fs = wallPoly(w).filter(q => Math.abs(lat(q) - off) < 1).map(sv), fs0 = fs.length ? Math.min(...fs) : 0, fs1 = fs.length ? Math.max(...fs) : L;
    const s0 = o.at - o.w / 2, s1 = o.at + o.w / 2, oth = [...B.els.filter(x => x !== o && x.host === w.id && WALL_OPS.includes(x.type)).map(x => [x.at - x.w / 2, x.at + x.w / 2]), ...wallColCuts(w).map(c => [c.s0, c.s1])];
    const sl = Math.max(fs0, ...oth.filter(([, b2]) => b2 <= s0 + 1).map(([, b2]) => b2)), sr = Math.min(fs1, ...oth.filter(([a2]) => a2 >= s1 - 1).map(([a2]) => a2));
    const b = z0 + (o.sill || 0), t = b + o.h, zm = b + o.h / 2, out = [];
    out.push({ A: Fp(s0, b + o.h * 0.15), B: Fp(s1, b + o.h * 0.15), val: o.w, kind: 'w', title: 'Breite' });
    if (s0 - sl > 0.5) out.push({ A: Fp(sl, zm), B: Fp(s0, zm), val: s0 - sl, kind: 'l', title: 'Abstand links' });
    if (sr - s1 > 0.5) out.push({ A: Fp(s1, zm), B: Fp(sr, zm), val: sr - s1, kind: 'r', title: 'Abstand rechts' });
    if (b - z0 > 0.5) out.push({ A: Fp(o.at, z0), B: Fp(o.at, b), val: b - z0, kind: 'u', title: o.type === 'window' ? 'Brüstung' : 'Unterkante' });
    if (z1 - t > 0.5) out.push({ A: Fp(o.at, t), B: Fp(o.at, z1), val: z1 - t, kind: 'o', title: 'Bis Unterkante Decke' });
    out.forEach(m2 => Object.assign(m2, { sl, sr, z0, z1, L }));
    return out;
  }
  // Maße eines Deckendurchbruchs: von jeder Kante waagerecht bzw. senkrecht bis zur nächsten Wandfläche oder Deckenkante
  function holeDims(o) {
    const [, z1] = zOf(o), segs = [];
    B.els.forEach(e => { if (e.type === 'wall' && e.storey === o.storey) { const P = wallPoly(e); P.forEach((q, i) => segs.push([q, P[(i + 1) % P.length]])); } });
    const sl = elById(o.host); if (sl?.pts) sl.pts.forEach((q, i) => segs.push([q, sl.pts[(i + 1) % sl.pts.length]]));
    const hit = (q, dir) => { let best = Infinity; segs.forEach(([a, b]) => { const e2 = sub(b, a), den = cross2(dir, e2); if (Math.abs(den) < 1e-9) return; const t = cross2(sub(a, q), e2) / den, u = cross2(sub(a, q), dir) / den; if (t > 0.5 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t; }); return best; };
    const out = [], hw = o.w / 2, hd = o.d / 2, P = o.p;
    [[[1, 0], [P[0] + hw, P[1]], 'x+', 'Abstand rechts'], [[-1, 0], [P[0] - hw, P[1]], 'x-', 'Abstand links'], [[0, 1], [P[0], P[1] + hd], 'y+', 'Abstand oben'], [[0, -1], [P[0], P[1] - hd], 'y-', 'Abstand unten']].forEach(([dir, q, kind, title]) => {
      const t = hit(q, dir); if (Number.isFinite(t) && t < 1e5) out.push({ A: [...q, z1], B: [...add(q, mul(dir, t)), z1], val: t, kind, title, dir });
    });
    return out;
  }
  function applyOpDim(hh, v) {
    const o = elById(hh.op);
    if (!o) return;
    if (o.type === 'hole') {
      const m = hh.dir, dl = hh.val - v; // Abstand kleiner → Durchbruch wandert zur Kante hin
      change(() => { o.p = add(o.p, mul(m, dl)).map(r1); });
    } else {
      const w = hostOf(o); if (!w) return;
      change(() => {
        if (hh.kind === 'w') { if (v > 0) { o.w = r1(v); o.at = r1(Math.max(o.w / 2, Math.min(hh.L - o.w / 2, o.at))); } }
        else if (hh.kind === 'l') o.at = r1(Math.max(o.w / 2, Math.min(hh.L - o.w / 2, hh.sl + v + o.w / 2)));
        else if (hh.kind === 'r') o.at = r1(Math.max(o.w / 2, Math.min(hh.L - o.w / 2, hh.sr - v - o.w / 2)));
        else if (hh.kind === 'u') o.sill = r1(Math.max(0, v));
        else if (hh.kind === 'o') o.sill = r1(Math.max(0, hh.z1 - hh.z0 - v - o.h));
      });
    }
    renderUi(); draw();
  }
  // Maß im Raum zeichnen (Ansicht oder Grundriss), antippbar
  function dim3(A, Bq, val, col, hits, data) {
    const a = P3(A), b = P3(Bq), L2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L2 < 8) return;
    const dd = [(b[0] - a[0]) / L2, (b[1] - a[1]) / L2], tk = [(dd[0] - dd[1]) * 5, (dd[1] + dd[0]) * 5];
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    for (const q of [a, b]) { ctx.moveTo(q[0] - tk[0], q[1] - tk[1]); ctx.lineTo(q[0] + tk[0], q[1] + tk[1]); }
    ctx.stroke();
    const txt = fmt(val); ctx.font = '700 12px system-ui'; const w = ctx.measureText(txt).width + 12, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.fillStyle = css('--card') || '#fff'; ctx.beginPath(); ctx.roundRect(m[0] - w / 2, m[1] - 11, w, 22, 6); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, m[0], m[1] + 0.5);
    hits.push({ x: m[0], y: m[1], w: Math.max(w, 44), val, ...data });
  }
  function openDimEd(hh) {
    dimEdit = hh;
    const rr = root.getBoundingClientRect(), cr = cv.getBoundingClientRect(), g2 = hh.ids && B.grids.find(g => g.id === hh.ids[1]);
    const typed = dimEd.hidden ? null : dimEd.querySelector('input')?.value;
    if (hh.op) {
      dimEd.innerHTML = `<div class="bau-ddh">${esc(hh.title)}</div><label class="ped-f"><input data-gdim inputmode="decimal" value="${raw(hh.val)}"><i>mm</i></label><div class="ped-acts"><button data-b="gdimok" class="on">Übernehmen</button><button data-b="gdimx">Abbrechen</button></div>`;
      dimEd.hidden = false;
      const x = hh.x + cr.left - rr.left, y = hh.y + cr.top - rr.top;
      dimEd.style.left = `${Math.max(8, Math.min(rr.width - 268, x - 130))}px`; dimEd.style.top = `${Math.max(8, Math.min(rr.height - 150, y + 16))}px`;
      const i = dimEd.querySelector('input'); if (typed != null) i.value = typed; i.focus(); i.select(); return;
    }
    dimEd.innerHTML = `<div class="bau-ddh">Abstand ${esc(B.grids.find(g => g.id === hh.ids[0])?.name || '')} – ${esc(g2?.name || '')}</div><label class="ped-f"><input data-gdim inputmode="decimal" value="${raw(hh.val)}"><i>mm</i></label>${seg('gshift', gMode === 'one' ? 'one' : 'next', [['next', 'Folgende mitschieben'], ['one', `Nur ${esc(g2?.name || '')}`]])}<div class="ped-acts"><button data-b="gdimok" class="on">Übernehmen</button><button data-b="gdimx">Abbrechen</button></div>`;
    dimEd.hidden = false;
    const x = hh.x + cr.left - rr.left, y = hh.y + cr.top - rr.top;
    dimEd.style.left = `${Math.max(8, Math.min(rr.width - 268, x - 130))}px`; dimEd.style.top = `${Math.max(8, Math.min(rr.height - 150, y + 16))}px`;
    const i = dimEd.querySelector('input'); if (typed != null) i.value = typed; i.focus(); i.select();
  }
  const closeDimEd = () => { dimEd.hidden = true; dimEdit = null; };
  function applyDimEd() {
    const hh = dimEdit, v = num(dimEd.querySelector('input')?.value);
    closeDimEd();
    if (!hh || !(v >= 0) || (!hh.op && !(v > 0))) return;
    if (hh.op) { applyOpDim(hh, v); return; }
    for (const f0 of gridFams()) for (const G of gridGroups(f0)) { const i = G.items.findIndex(it => it.g.id === hh.ids[0]); if (i >= 0 && G.items[i + 1]?.g.id === hh.ids[1]) { setGap(G, i, v); return; } }
  }

  // ---------- Planunterlage ----------
  const ulMap = (u, x, y) => { const a = (u.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), X = x * u.s, Y = -y * u.s; return [u.pos[0] + X * c - Y * s, u.pos[1] + X * s + Y * c]; };
  const ulCorners = u => [[0, 0], [u.w, 0], [u.w, u.h], [0, u.h]].map(([x, y]) => ulMap(u, x, y));
  async function ulImage(u) {
    if (imgs.has(u.file)) return;
    imgs.set(u.file, null);
    const blob = await getFile(u.file).catch(() => null);
    if (!blob) return;
    const img = new Image();
    img.onload = () => { imgs.set(u.file, img); draw(); };
    img.src = URL.createObjectURL(blob);
  }
  // PDF: erste Seite mit pdf.js als Bild (pdf.js wird nur dafür und nur bei Bedarf geladen)
  async function pdfToBlob(file) {
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('pdf.js nicht erreichbar (Internet nötig)')); document.head.appendChild(s); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, page = await pdf.getPage(1);
    const v0 = page.getViewport({ scale: 1 }), scale = Math.min(6, 4000 / Math.max(v0.width, v0.height)), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    if (pdf.numPages > 1) env.toast(`PDF mit ${pdf.numPages} Seiten: Seite 1 übernommen.`);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  async function loadUnderlay(file) {
    try {
      const blob = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name) ? await pdfToBlob(file) : file;
      const img = new Image(), url = URL.createObjectURL(blob);
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Bild nicht lesbar')); img.src = url; });
      const id = uid(), fileId = uid();
      await putFile(fileId, blob);
      imgs.set(fileId, img);
      const { mn, mx } = bounds(), s = 20000 / img.naturalWidth, c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2];
      const old = B.underlays.find(u => u.storey === cur);
      change(() => {
        if (old) B.underlays = B.underlays.filter(u => u !== old);
        B.underlays.push({ id, storey: cur, file: fileId, name: file.name, w: img.naturalWidth, h: img.naturalHeight, s, rot: 0, alpha: 0.55, pos: [c[0] - img.naturalWidth * s / 2, c[1] + img.naturalHeight * s / 2] });
      });
      if (old) delFile(old.file).catch(() => {});
      if (!cam.plan) setPlan(true);
      fitView(); startCmd('cal');
      env.toast('Unterlage geladen. Jetzt kalibrieren: zwei Punkte mit bekanntem Abstand tippen.');
    } catch (e) { env.toast(`Unterlage: ${e.message || e}`); }
  }
  const curUl = () => B.underlays.find(u => u.storey === cur);
  // Kalibrieren/Ausrichten: mit Ortho liegt der zweite Punkt waagerecht oder senkrecht zum ersten
  const calOrtho = p => { const f = cmd?.pts?.length === 1 ? cmd.pts[0] : null; if (!f || !p || !orthoOn || cmd.t !== 'cal') return p; const v = sub(p, f); return Math.abs(v[0]) >= Math.abs(v[1]) ? [p[0], f[1]] : [f[0], p[1]]; };
  function ulAlign(a, b) {
    const u = curUl(), v = sub(b, a);
    if (!u || len(v) < 1) return;
    const ang = Math.atan2(v[1], v[0]), dl = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) - ang, c = Math.cos(dl), s2 = Math.sin(dl), deg = dl * 180 / Math.PI;
    if (Math.abs(deg) < 0.005) { env.toast('Die Linie liegt schon gerade.'); return; }
    change(() => { const q = sub(u.pos, a); u.pos = add(a, [q[0] * c - q[1] * s2, q[0] * s2 + q[1] * c]); u.rot = Math.round(((u.rot || 0) + deg) * 1000) / 1000; });
    env.toast(`Plan um ${fmt2(deg)}° gedreht.`);
  }

  // ---------- Fangen ----------
  // Reihenfolge: Punkte (Enden, Ecken, Achsschnitte) → Linien (Achsen, Wandachsen und -flächen) → frei.
  // Mit Ortho (Richtung nahe 15°-Raster ab dem letzten Punkt) bleibt die Richtung, Linien schneiden den Ortho-Strahl.
  let touch = false;
  function snapLines(skip) {
    const L = B.vis.off.grid ? [] : B.grids.map(g => ({ a: g.a, b: g.b, label: `Achse ${g.name}` }));
    B.els.forEach(e => {
      if (e.storey !== cur || skip?.has(e.id) || !shown(e)) return;
      if (e.type === 'wall') {
        const d = norm(sub(e.b, e.a)), n = perp(d), [lo, hi] = wallOffs(e);
        L.push({ a: e.a, b: e.b, label: 'Wandachse' });
        for (const o of [lo, hi]) if (Math.abs(o) > 0.5) L.push({ a: add(e.a, mul(n, o)), b: add(e.b, mul(n, o)), label: 'Wandfläche' });
      } else if (e.type === 'beam') L.push({ a: e.a, b: e.b, label: 'Trägerachse' });
      else if (e.type === 'column') {
        // Außenflächen der Stütze (rund: umschreibendes Quadrat als Flucht)
        const K = e.shape === 'round' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(e.p, [x * e.w / 2, y * e.w / 2])) : colOutline(e);
        K.forEach((q, i) => L.push({ a: q, b: K[(i + 1) % 4], label: e.shape === 'round' ? 'Stützenflucht' : 'Stützenfläche' }));
      }
      else if (['slab', 'roof', 'ceil', 'space', 'shaft'].includes(e.type) && e.pts) e.pts.forEach((p, i) => L.push({ a: p, b: e.pts[(i + 1) % e.pts.length], label: 'Kante' }));
    });
    return L;
  }
  // Fangergebnis auf 0,1 mm runden: keine Rundungsreste aus Schnittpunkten in den Daten
  function snapAt(x, y, o = {}) {
    if (!cam.plan && !freeSnap && !o.no3d) { const r3 = snap3D(x, y, o); if (r3) { r3.p3 = r3.p3.map(v => Math.round(v * 10) / 10); r3.p = r3.p3.slice(0, 2); return r3; } }
    const res = snapRaw(x, y, o); if (res?.p) res.p = res.p.map(v => Math.round(v * 10) / 10); return res;
  }
  // Fang in der 3D-Ansicht: Ecken, Kanten und (beim Messen) Flächen der Bauteile in echter Höhe; beim Messen zusätzlich X/Y/Z-Strahlen ab dem letzten Punkt
  const AX3 = [[[1, 0, 0], 'X', 'rgb(225,60,60)'], [[0, 1, 0], 'Y', 'rgb(40,160,70)'], [[0, 0, 1], 'Z', 'rgb(40,110,220)']];
  function solids3D() {
    const out = [];
    B.els.forEach(e => {
      if (!onStorey(e, cur) || !shown(e)) return;
      if (['wall', 'column', 'beam', 'slab', 'shaft'].includes(e.type)) { const fp = footprint(e); if (fp?.length > 2) { const [z0, z1] = zOf(e); out.push({ e, fp, z0, z1 }); } }
      else if (WALL_OPS.includes(e.type)) { const w = hostOf(e); if (!w) return; const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), [wz] = zRange(w), b = wz + (e.sill || 0); const q = (s2, o2) => add(add(w.a, mul(d, s2)), mul(n, o2)); out.push({ e, fp: [q(e.at - e.w / 2, lo), q(e.at + e.w / 2, lo), q(e.at + e.w / 2, hi), q(e.at - e.w / 2, hi)], z0: b, z1: b + e.h, op: true }); }
    });
    return out;
  }
  function snap3D(x, y, o) {
    const tol = touch ? 20 : 11, S = solids3D(), C = snapCfg, meas = cmd?.t === 'measure';
    const U = unP(x, y, 0), { rz } = basis();
    // nächste getroffene Fläche (Tiefe), für Verdeckung und Flächenfang
    let face = null;
    const takeF = (p3, t, label) => { if (!face || t < face.t) face = { p3, t, label }; };
    S.forEach(({ e, fp, z0, z1, op }) => {
      if (op) return;
      for (const z of [z1, z0]) { const p = onPlane(x, y, z); if (p && pip(p[0], p[1], fp)) takeF([...p, z], P3([...p, z])[2], z === z1 ? 'auf Oberseite' : 'auf Unterseite'); }
      fp.forEach((q, i) => {
        const q2 = fp[(i + 1) % fp.length], ev = sub(q2, q), den = cross2(ev, [rz[0], rz[1]]);
        if (Math.abs(den) < 1e-9) return;
        const t = -cross2(ev, sub([U[0], U[1]], q)) / den, R = add(U, mul(rz, t)), u = dot(sub([R[0], R[1]], q), ev) / dot(ev, ev);
        if (u >= 0 && u <= 1 && R[2] >= z0 - 0.5 && R[2] <= z1 + 0.5) takeF(R, t, e.type === 'wall' ? 'auf Wandfläche' : e.type === 'column' ? 'auf Stützenfläche' : 'auf Fläche');
      });
    });
    const vis = p3 => !face || P3(p3)[2] <= face.t + 30;
    let best = null;
    const tryP = (p3, label) => { const s2 = P3(p3), dpx = Math.hypot(s2[0] - x, s2[1] - y); if (dpx < tol && vis(p3) && (!best || dpx < best.d - 0.5 || (Math.abs(dpx - best.d) <= 0.5 && s2[2] < best.z))) best = { p3, label, d: dpx, z: s2[2] }; };
    if (C.end) S.forEach(({ e, fp, z0, z1, op }) => fp.forEach(q => { const lb = op ? 'Öffnungsecke' : e.type === 'column' ? 'Stützenecke' : e.type === 'wall' ? 'Wandecke' : 'Ecke'; tryP([...q, z1], `${lb} oben`); tryP([...q, z0], `${lb} unten`); }));
    if (C.mid) S.forEach(({ fp, z0, z1, op }) => { if (op) return; fp.forEach((q, i) => { const m = mul(add(q, fp[(i + 1) % fp.length]), 0.5); tryP([...m, z1], 'Kantenmitte oben'); }); });
    if (best) return { p3: best.p3, label: best.label, d3: true };
    // Kanten: oben, unten, senkrecht
    let bestE = null;
    const tryE = (A, Bq, label) => {
      const a = P3(A), b = P3(Bq), ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
      if (L2 < 1) return;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2)), dpx = Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y);
      if (dpx >= tol * 0.8) return;
      const p3 = add(A, mul(sub(Bq, A), t));
      if (vis(p3) && (!bestE || dpx < bestE.d)) bestE = { p3, label, d: dpx };
    };
    if (C.face) S.forEach(({ e, fp, z0, z1, op }) => fp.forEach((q, i) => { const q2 = fp[(i + 1) % fp.length], lb = op ? 'Laibung' : 'Kante'; tryE([...q, z1], [...q2, z1], `auf ${lb} oben`); tryE([...q, z0], [...q2, z0], `auf ${lb} unten`); tryE([...q, z0], [...q, z1], `auf ${lb} senkrecht`); }));
    if (bestE) return { p3: bestE.p3, label: bestE.label, d3: true };
    // Messen: X/Y/Z-Strahlen ab dem letzten Punkt
    const f3 = meas && o.from?.length === 3 ? o.from : null;
    if (f3) {
      const a = P3(f3); let bR = null;
      AX3.forEach(([ax, nm], k) => { const b = P3(add(f3, mul(ax, 1000))), ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; if (L2 < 1) return; const dpx = Math.abs((x - a[0]) * ey - (y - a[1]) * ex) / Math.sqrt(L2); if (dpx < tol && (!bR || dpx < bR.d)) bR = { k, d: dpx, t: ((x - a[0]) * ex + (y - a[1]) * ey) / L2 * 1000 }; });
      if (bR) { const tt = snapCfg.round ? Math.round(bR.t / 10) * 10 : bR.t; return { p3: add(f3, mul(AX3[bR.k][0], tt)), label: `${AX3[bR.k][1]}-Richtung`, d3: true, ray: bR.k }; }
    }
    if (meas && face && C.face) return { p3: face.p3, label: face.label, d3: true };
    return null;
  }
  // ---------- Fang-Einstellungen (je Gerät) ----------
  const SNAP_KEYS = [['end', 'Endpunkte und Ecken'], ['mid', 'Mitten'], ['grid', 'Achsen und Achsschnitte'], ['face', 'Wandflächen, Achsen, Kanten'], ['track', 'Fluchten (Spurlinien)'], ['perp', 'Lot'], ['ext', 'Verlängerungen'], ['round', 'Raster 10 mm']];
  const SNAP_HELP = { end: 'Wandenden, Wand- und Raumecken, Stützenmitte und -ecken', mid: 'Mitte von Wänden, Trägern, Kanten und Stützenseiten', grid: 'Achslinien und ihre Schnittpunkte', face: 'auf Wand- und Stützenflächen, Wandachsen und Kanten entlang', track: 'waagerecht/senkrecht durch erfasste Punkte (Kreuz)', perp: 'senkrecht vom letzten Punkt auf eine Linie', ext: 'über Wand- und Achsenden hinaus', round: 'freie Punkte und Längen auf 10 mm' };
  const snapCfg = (() => { const d = Object.fromEntries(SNAP_KEYS.map(([k]) => [k, true])); try { return { ...d, ...JSON.parse(localStorage.getItem('biege.bau.snap') || '{}') }; } catch { return d; } })();
  const saveSnap = () => { try { localStorage.setItem('biege.bau.snap', JSON.stringify(snapCfg)); } catch {} };
  // erfasste Punkte: Fluchten laufen von Punkten, über die der Zeiger zuletzt gefahren ist (wie in CAD üblich)
  let acq = [], freeSnap = false;
  // Ortho-Modus: nur waagerecht und senkrecht (F8 oder Knopf); aus: Richtung rastet nur nahe 15°-Schritten
  let orthoOn = (() => { try { return localStorage.getItem('biege.bau.ortho') === '1'; } catch { return false; } })();
  const acquire = (p, label = 'Punkt') => { if (acq.some(q => near(q.p, p, 0.5))) return; acq.push({ p: [...p], label }); if (acq.length > 8) acq.shift(); };
  function snapPoints(o) {
    const C = snapCfg, P = [], put = (p, label, kind) => { if (p) P.push({ p, label, kind }); };
    B.els.forEach(e => {
      if (!onStorey(e, cur) || o.skip?.has(e.id) || !shown(e) || OPS.includes(e.type)) return;
      if (e.type === 'stair') { if (C.end) put(e.a, 'Treppenantritt'); return; }
      if (e.type === 'wall' || e.type === 'beam') {
        const w = e.type === 'wall';
        if (C.end) { put(e.a, w ? 'Wandende' : 'Trägerende'); put(e.b, w ? 'Wandende' : 'Trägerende'); if (w) wallPoly(e).forEach(q => put(q, 'Wandecke')); }
        if (C.mid) put(mul(add(e.a, e.b), 0.5), w ? 'Wandmitte' : 'Trägermitte', 'mid');
      } else if (e.type === 'column') {
        // Stütze: Mitte, Ecken der Außenkontur, Kantenmitten (rund: vier Randpunkte)
        if (C.end) put(e.p, 'Stützenmitte');
        const K = colOutline(e);
        if (C.end) K.forEach(q => put(q, e.shape === 'round' ? 'Stützenrand' : 'Stützenecke'));
        if (C.mid && e.shape !== 'round') K.forEach((q, i) => put(mul(add(q, K[(i + 1) % 4]), 0.5), 'Stützenkante Mitte', 'mid'));
      }
      else if (e.pts) {
        if (C.end) e.pts.forEach(q => put(q, 'Eckpunkt'));
        if (C.mid && e.type !== 'space') e.pts.forEach((q, i) => put(mul(add(q, e.pts[(i + 1) % e.pts.length]), 0.5), 'Kantenmitte', 'mid'));
      }
    });
    const below = sorted().filter(s => s.elev < curSt().elev).at(-1);
    if (below && C.end) B.els.forEach(e => { if (e.storey === below.id && e.type === 'wall' && shown(e)) { put(e.a, 'Wandende darunter'); put(e.b, 'Wandende darunter'); } });
    if (C.grid && !B.vis.off.grid) gridCross().forEach(q => put(q.p, q.label));
    (o.extra || []).forEach(q => put(q.p, q.label));
    return P;
  }
  // Fluchtpunkte: erfasste Punkte, Punkte der laufenden Kette, der letzte Punkt; auf dem Touchscreen zusätzlich Punkte nahe dem Finger
  function trackPoints(o, pts, x, y, z) {
    const T = acq.map(q => ({ p: q.p, label: q.label }));
    (cmd?.pts || []).forEach(p => T.push({ p, label: 'Kettenpunkt' }));
    if (o.from) T.push({ p: o.from, label: 'letzter Punkt' });
    if (touch) pts.forEach(q => { const s2 = P2(q.p, z); if (Math.hypot(s2[0] - x, s2[1] - y) < 140) T.push(q); });
    return T;
  }
  // Reihenfolge: Punkte → Linien und Konstruktionslinien (Wand, Achse, Kante, Flucht, Verlängerung, Lot) → frei.
  // Ortho (Richtung nahe 15°-Raster ab dem letzten Punkt) bleibt erhalten; Linien schneiden dann den Ortho-Strahl.
  function snapRaw(x, y, o = {}) {
    const z = curSt().elev, tol = touch ? 20 : 11, raw = onPlane(x, y, z);
    if (!raw) return null;
    const rnd = v => (snapCfg.round ? Math.round(v / 10) * 10 : v);
    if (freeSnap) return { p: raw, free: true, label: 'ohne Fang' };
    const scr = p => P2(p, z), dpx = p => { const s2 = scr(p); return Math.hypot(s2[0] - x, s2[1] - y); };
    const lineDist = (p, d) => { const a = scr(p), b = scr(add(p, mul(d, 1000))), ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1; return Math.abs((x - a[0]) * ey - (y - a[1]) * ex) / l; };
    let ortho = null;
    if (o.from && !o.noOrtho) { const v = sub(raw, o.from); if (len(v) > 1) { const ang = Math.atan2(v[1], v[0]); if (orthoOn) { const q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2); ortho = [Math.round(Math.cos(q)), Math.round(Math.sin(q))]; } else { const q = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); if (Math.abs(ang - q) < 0.07) ortho = [Math.cos(q), Math.sin(q)]; } } }
    // 1. Punkte
    const pts = snapPoints(o);
    let best = null;
    for (const q of pts) { const d = dpx(q.p); if (d < tol && (!best || d < best.d)) best = { p: [...q.p], label: q.label, d }; }
    if (best) { acquire(best.p, best.label); if (!ortho || best.d < tol * 0.6 || Math.abs(cross2(sub(best.p, o.from), ortho)) * cam.sc < tol * 0.5) return best; }
    // 2. Linien: echte (Achsen, Wände, Kanten), Verlängerungen, Fluchten, Lot
    const real = snapLines(o.skip).filter(L => (L.label.startsWith('Achse') ? snapCfg.grid : snapCfg.face));
    const cons = [];
    real.forEach(L => {
      const d = norm(sub(L.b, L.a)), [sd, t] = segD(x, y, scr(L.a), scr(L.b));
      if (sd < tol) cons.push({ p: L.a, d, label: L.label, real: true, dist: sd });
      else if (snapCfg.ext && (t <= 0 || t >= 1)) { const ld = lineDist(L.a, d); if (ld < tol * 0.8) cons.push({ p: L.a, d, label: `Verlängerung ${L.label}`, dist: ld, guide: t <= 0 ? L.a : L.b }); }
    });
    if (snapCfg.track) trackPoints(o, pts, x, y, z).forEach(q => [[1, 0], [0, 1]].forEach(d => { const ld = lineDist(q.p, d); if (ld < tol * 0.8 && dpx(q.p) > tol) cons.push({ p: q.p, d, label: `Flucht ${q.label}`, dist: ld, guide: q.p, track: true }); }));
    let perpHit = null;
    if (o.from && snapCfg.perp) real.forEach(L => { const d = norm(sub(L.b, L.a)), f = add(L.a, mul(d, dot(sub(o.from, L.a), d))), dd = dpx(f); if (len(sub(f, o.from)) > 1 && dd < tol && (!perpHit || dd < perpHit.d)) perpHit = { p: f, label: `Lot auf ${L.label}`, d: dd }; });
    const lines = cons.sort((a, b) => a.dist + (a.real ? 0 : 2) - (b.dist + (b.real ? 0 : 2)));
    if (ortho) {
      let pick = perpHit && Math.abs(cross2(norm(sub(perpHit.p, o.from)), ortho)) < 0.01 ? perpHit : null;
      for (const c of lines) {
        const X = lineX(o.from, ortho, c.p, c.d);
        if (!X || dot(sub(X, o.from), ortho) <= 1) continue;
        const d = dpx(X) + (c.real ? 0 : 2);
        if (d < tol * 1.6 && (!pick || d < pick.d)) pick = { p: X, label: `${c.label} · Ortho`, d, guides: c.guide ? [c.guide] : [] };
      }
      if (pick) return pick;
      return { p: add(o.from, mul(ortho, rnd(dot(sub(raw, o.from), ortho)))), label: 'Ortho', ortho: true };
    }
    if (perpHit) return perpHit;
    if (lines.length) {
      const top = lines.slice(0, 8);
      let bx = null;
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
        if (Math.abs(cross2(top[i].d, top[j].d)) < 0.05) continue;
        const X = lineX(top[i].p, top[i].d, top[j].p, top[j].d);
        if (!X) continue;
        const d = dpx(X);
        if (d < tol * 1.2 && (!bx || d < bx.d)) bx = { p: X, label: `${top[i].label} × ${top[j].label}`, d, guides: [top[i].guide, top[j].guide].filter(Boolean) };
      }
      if (bx) return bx;
      const c = lines[0], t0 = dot(sub(raw, c.p), c.d);
      return { p: add(c.p, mul(c.d, rnd(t0))), label: c.real ? `auf ${c.label}` : c.label, guides: c.guide ? [c.guide] : [] };
    }
    // 3. frei
    if (o.from) { const v = sub(raw, o.from); return { p: add(o.from, mul(norm(v), rnd(len(v)))), free: true }; }
    return { p: raw.map(rnd), free: true };
  }

  // ---------- Räume erkennen ----------
  // Raster über den Wänden, Füllung ab dem Tippunkt, Rand als Polygon. Türen schließen den Raum nicht auf.
  // Raum finden: erst grob über das ganze Geschoss, dann fein nur um den gefundenen Raum
  function detectRoom(p) {
    const r0 = detectRoomIn(p);
    if (r0.err) return r0;
    const all = [...r0.pts, ...(r0.holes || []).flat()], m = 800;
    const r2 = detectRoomIn(p, [Math.min(...all.map(q => q[0])) - m, Math.min(...all.map(q => q[1])) - m, Math.max(...all.map(q => q[0])) + m, Math.max(...all.map(q => q[1])) + m]);
    return r2.err ? r0 : r2;
  }
  function detectRoomIn(p, box) {
    const walls = B.els.filter(e => e.type === 'wall' && e.storey === cur);
    if (!walls.length) return { err: 'Keine Wände in diesem Geschoss.' };
    // Stützen schließen Lücken zwischen Wänden mit
    let polys = [...walls.map(wallPoly), ...B.els.filter(e => e.type === 'column' && onStorey(e, cur)).map(colPoly)];
    if (box) polys = polys.filter(P => P.some(q => q[0] > box[0] && q[0] < box[2] && q[1] > box[1] && q[1] < box[3]) || P.every(q => q[0] < box[0]) === false && P.every(q => q[0] > box[2]) === false && P.every(q => q[1] < box[1]) === false && P.every(q => q[1] > box[3]) === false);
    const all = polys.flat();
    let x0 = Math.min(...all.map(q => q[0])) - 300, y0 = Math.min(...all.map(q => q[1])) - 300, x1 = Math.max(...all.map(q => q[0])) + 300, y1 = Math.max(...all.map(q => q[1])) + 300;
    if (box) [x0, y0, x1, y1] = box;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return { err: 'Außerhalb der Wände.' };
    const c = Math.max(box ? 4 : 20, Math.ceil(Math.sqrt((x1 - x0) * (y1 - y0) / (box ? 2.5e6 : 1.2e6)))), nx = Math.ceil((x1 - x0) / c), ny = Math.ceil((y1 - y0) / c), G = new Uint8Array(nx * ny);
    polys.forEach(P => {
      const xs = P.map(q => q[0]), ys = P.map(q => q[1]);
      const i0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / c) - 1), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) - x0) / c) + 1), j0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / c) - 1), j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) - y0) / c) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * c, cy = y0 + (j + 0.5) * c;
        if (pip(cx, cy, P) || P.some((a, k) => segD(cx, cy, a, P[(k + 1) % P.length])[0] < c * 0.72)) G[j * nx + i] = 1;
      }
    });
    const si = Math.floor((p[0] - x0) / c), sj = Math.floor((p[1] - y0) / c);
    if (G[sj * nx + si]) return { err: 'Auf eine Wand getippt.' };
    const F = new Uint8Array(nx * ny), Q = new Int32Array(nx * ny);
    let qh = 0, qt = 0, open = false;
    F[sj * nx + si] = 1; Q[qt++] = sj * nx + si;
    while (qh < qt) {
      const k = Q[qh++], i = k % nx, j = (k - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { open = true; break; }
      for (const n of [k - 1, k + 1, k - nx, k + nx]) if (!G[n] && !F[n]) { F[n] = 1; Q[qt++] = n; }
    }
    if (open) return { err: 'Der Raum ist nicht geschlossen.' };
    // Randkanten (Fläche links), zu Ringen verbinden
    const next = new Map(), key = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!F[j * nx + i]) continue;
      if (!F[(j - 1) * nx + i]) next.set(key(i, j), key(i + 1, j));
      if (!F[j * nx + i + 1]) next.set(key(i + 1, j), key(i + 1, j + 1));
      if (!F[(j + 1) * nx + i]) next.set(key(i + 1, j + 1), key(i, j + 1));
      if (!F[j * nx + i - 1]) next.set(key(i, j + 1), key(i, j));
    }
    const rings = [], seen = new Set();
    for (const s0 of next.keys()) {
      if (seen.has(s0)) continue;
      const ring = [];
      let k = s0, guard = 0;
      do { seen.add(k); ring.push(k); k = next.get(k); } while (k != null && k !== s0 && guard++ < 1e6);
      rings.push(ring.map(v => { const i = v % (nx + 1), j = (v - i) / (nx + 1); return [x0 + i * c, y0 + j * c]; }));
    }
    if (!rings.length) return { err: 'Kein Raum gefunden.' };
    rings.sort((a2, b2) => Math.abs(area2(b2)) - Math.abs(area2(a2)));
    const fit = R => fitRing(R, c, walls);
    // Außenrand = größter Ring; die anderen sind Inseln (z. B. ein Kern mitten im Raum)
    return { pts: fit(rings[0]), holes: rings.slice(1).filter(R => Math.abs(area2(R)) > c * c * 16).map(fit) };
  }
  function fitRing(bestRing, c, walls) {
    // vereinfachen: gerade Stücke zusammenfassen, Treppen schräger Wände glätten
    const dp = (P, eps) => { if (P.length < 3) return P; let k = 0, dm = 0; for (let i = 1; i < P.length - 1; i++) { const d = segD(P[i][0], P[i][1], P[0], P.at(-1))[0]; if (d > dm) { dm = d; k = i; } } return dm > eps ? [...dp(P.slice(0, k + 1), eps).slice(0, -1), ...dp(P.slice(k), eps)] : [P[0], P.at(-1)]; };
    const half = Math.floor(bestRing.length / 2), simp = [...dp(bestRing.slice(0, half + 1), c * 1.1).slice(0, -1), ...dp([...bestRing.slice(half), bestRing[0]], c * 1.1).slice(0, -1)];
    // Der Rand liegt im Mittel 0,72 Zellen vor der Wandfläche: zurück auf die Fläche
    const clean = simp.filter((q, i) => !near(q, simp[(i + 1) % simp.length], 1));
    let pts = clean.length >= 3 ? offsetPoly(clean, -c * 0.72) : clean;
    // Ecken exakt auf die Wandflächen ziehen: Schnitt der zwei nächsten Flächen, sonst Lot auf eine
    const faces = walls.flatMap(w => { const d = norm(sub(w.b, w.a)), n = perp(d), [lo, hi] = wallOffs(w); return [lo, hi].map(o => ({ p: add(w.a, mul(n, o)), d })); });
    B.els.filter(e => e.type === 'column' && e.shape !== 'round' && onStorey(e, cur)).forEach(e => { const K = colPoly(e); K.forEach((q, i) => faces.push({ p: q, d: norm(sub(K[(i + 1) % 4], q)) })); });
    const dist = (q, f) => Math.abs(cross2(f.d, sub(q, f.p)));
    pts = pts.map(q => {
      const nearF = faces.map(f => ({ f, d: dist(q, f) })).filter(x => x.d < c * 3).sort((a2, b2) => a2.d - b2.d);
      for (let i = 0; i < nearF.length; i++) for (let j = i + 1; j < nearF.length; j++) {
        if (Math.abs(cross2(nearF[i].f.d, nearF[j].f.d)) < 0.05) continue;
        const X = lineX(nearF[i].f.p, nearF[i].f.d, nearF[j].f.p, nearF[j].f.d);
        if (X && len(sub(X, q)) < c * 4) return X.map(v => Math.round(v * 10) / 10);
      }
      if (nearF.length) { const f = nearF[0].f; return add(f.p, mul(f.d, dot(sub(q, f.p), f.d))).map(v => Math.round(v * 10) / 10); }
      return q;
    });
    return pts;
  }

  // ---------- Befehle ----------
  const last = {
    wall: { th: 240, just: 'c', kind: 'iwt', typeId: 'tw-iwt240' }, col: { shape: 'rect', w: 300, d: 300, prof: 'HEB 200', align: 'c' }, slab: { th: 250, base: false },
    stair: { kind: 'straight', w: 1000, g: 270, side: 1 }, meas: 'dist',
    beam: { shape: 'rect', w: 300, bh: 500, prof: 'IPE 300' }, roof: { kind: 'flat', th: 250 }, ceil: { z: 2600, gx: 625, gy: 625, mode: 'room' },
    op: { kind: 'door', v: structuredClone(OP_DEF) }, copyN: 1,
  };
  const DRAW = ['wall', 'column', 'beam', 'slab', 'grid', 'open', 'roof', 'ceil', 'space', 'shaft', 'stair', 'measure', 'gstart', 'ualign'];
  function startCmd(t, extra = {}) {
    acq = []; dyn = ''; closeDD();
    if (!['move', 'copy', 'split', 'tiles', 'gstart', 'measure'].includes(t)) sel = null;
    hover = null; gridForm = false; addMode = false; moreOpen = false;
    if (t === 'sel') { cmd = null; dirty = true; renderUi(); draw(); return; }
    if ([...DRAW, 'move', 'copy', 'split', 'tiles'].includes(t) && Math.abs(basis().rz[2]) < 0.12) setPlan(true);
    cmd = { t, pts: [] }; if (!['sel', 'gstart', 'tiles', 'split'].includes(t)) lastCmdT = t;
    const s = curSt();
    if (t === 'wall') Object.assign(cmd, { th: last.wall.th, just: last.wall.just, kind: last.wall.kind, typeId: last.wall.typeId ?? null });
    if (t === 'column') Object.assign(cmd, { ...last.col });
    if (t === 'slab') Object.assign(cmd, { th: last.slab.th, base: last.slab.base });
    if (t === 'stair') Object.assign(cmd, { ...last.stair });
    if (t === 'measure') Object.assign(cmd, { mode: last.meas, closed: false, res: null });
    if (t === 'beam') Object.assign(cmd, { ...last.beam, top: s.height - last.slab.th });
    if (t === 'roof') Object.assign(cmd, { kind: last.roof.kind, th: last.roof.th, base: s.height });
    if (t === 'ceil') Object.assign(cmd, { ...last.ceil });
    if (t === 'shaft') Object.assign(cmd, { to: sorted().at(-1).id });
    if (t === 'open') Object.assign(cmd, { kind: last.op.kind, ...structuredClone(last.op.v) });
    if (t === 'copy') Object.assign(cmd, { n: last.copyN });
    Object.assign(cmd, extra);
    dirty = true; renderUi(); draw();
  }
  function endCmd() { closeDD(); cmd = null; hover = null; acq = []; dyn = ''; dirty = true; renderUi(); draw(); }
  // Vorschau des laufenden Befehls als durchsichtiger Körper
  function cmdPreview() {
    if (!cmd) return null;
    const s = curSt(), h = hover?.p;
    const quad = (a, b, lo, hi) => { const d = norm(sub(b, a)), n = perp(d); return [add(a, mul(n, lo)), add(b, mul(n, lo)), add(b, mul(n, hi)), add(a, mul(n, hi))]; };
    if (cmd.t === 'wall' && cmd.pts.length && h && !near(h, cmd.pts.at(-1))) { const [lo, hi] = wallOffs({ t: cmd.th, just: cmd.just }); return { poly: quad(cmd.pts.at(-1), h, lo, hi), z0: s.elev, z1: s.elev + s.height }; }
    if (cmd.t === 'beam' && cmd.pts.length && h && !near(h, cmd.pts[0])) { const dm = beamDims(cmd); return { poly: quad(cmd.pts[0], h, -dm.w / 2, dm.w / 2), z0: s.elev + cmd.top - dm.h, z1: s.elev + cmd.top }; }
    if (cmd.t === 'column' && h) return { poly: colPoly({ ...cmd, p: h }), z0: s.elev, z1: s.elev + s.height };
    if (cmd.t === 'stair' && cmd.pts.length && h && !near(h, cmd.pts[0], 50)) { const tmp = { ...cmd, storey: cur, a: cmd.pts[0], dir: norm(sub(h, cmd.pts[0])) }; return { poly: stairGeo(tmp).foot, z0: s.elev, z1: s.elev + stairH(tmp) }; }
    if (cmd.t === 'open' && hover?.op) { const o = hover.op; return { poly: opPoly(o), z0: opZ(o)[0], z1: opZ(o)[1] }; }
    if (cmd.t === 'shaft' && cmd.pts.length && h) { const a = cmd.pts[0]; return { poly: [a, [h[0], a[1]], h, [a[0], h[1]]], z0: s.elev, z1: s.elev + s.height }; }
    if (['slab', 'roof', 'ceil'].includes(cmd.t) && cmd.pts.length >= 2) {
      const P = [...cmd.pts, ...(h ? [h] : [])];
      if (Math.abs(area2(P)) < 1) return null;
      return cmd.t === 'slab' ? { poly: P, z0: s.elev - cmd.th, z1: s.elev } : cmd.t === 'roof' ? { poly: P, z0: s.elev + cmd.base, z1: s.elev + cmd.base + cmd.th } : { poly: P, z0: s.elev + cmd.z, z1: s.elev + cmd.z + 20 };
    }
    return null;
  }
  const newEl = o => ({ id: uid(), storey: cur, ...o });
  function addEl(o) { const e = newEl(o); change(() => B.els.push(e)); return e; }
  // Wandenden an andere Wände anschließen: Liegt ein Ende im Bereich einer anderen Wand oder kurz davor, rückt es auf den Schnitt der Achsen.
  // Trifft es dort deren Ende, rückt auch dieses mit (L-Ecke auf Gehrung), sonst entsteht ein T-Stoß.
  function joinWall(w, ends = ['a', 'b']) {
    let moved = false;
    for (const end of ends) {
      const P = w[end], d = norm(sub(w.b, w.a)), other = w[end === 'a' ? 'b' : 'a'];
      if (B.els.some(o => o !== w && o.type === 'wall' && o.storey === w.storey && (near(o.a, P, 0.5) || near(o.b, P, 0.5)))) continue; // schon verbunden
      let best = null;
      for (const o of B.els) {
        if (o === w || o.type !== 'wall' || o.storey !== w.storey) continue;
        const od = norm(sub(o.b, o.a));
        if (Math.abs(cross2(d, od)) < 0.05) continue;
        const X = lineX(P, d, o.a, od);
        if (!X) continue;
        const reach = (o.t + w.t) / 2 + 80, mv = len(sub(X, P)), Lo = len(sub(o.b, o.a)), sv = dot(sub(X, o.a), od);
        if (mv > reach || sv < -reach || sv > Lo + reach || len(sub(X, other)) < 50) continue;
        const oEnd = sv < (o.t + w.t) / 2 + 80 ? 'a' : sv > Lo - (o.t + w.t) / 2 - 80 ? 'b' : null;
        if (!best || mv < best.mv) best = { o, X: X.map(v => Math.round(v * 10) / 10), oEnd, mv };
      }
      if (!best) continue;
      if (!near(w[end], best.X, 0.05)) { w[end] = best.X; moved = true; }
      const o = best.o, oe = best.oEnd;
      // L-Ecke: das nahe Ende der anderen Wand rückt mit, sofern dort keine dritte Wand hängt
      if (oe && !near(o[oe], best.X, 0.05) && !B.els.some(q => q !== o && q !== w && q.type === 'wall' && q.storey === o.storey && (near(q.a, o[oe], 0.5) || near(q.b, o[oe], 0.5)))) { o[oe] = best.X; moved = true; }
    }
    return moved;
  }
  function joinAll() { let n = 0; for (let k = 0; k < 2; k++) B.els.filter(e => e.type === 'wall' && e.storey === cur).forEach(w => { if (joinWall(w)) n++; }); return n; }
  // Wandzug: über gemeinsame Enden verbundene Wände (gleiche Wandart, falls gesetzt)
  function wallChain(w) {
    const res = new Set([w.id]), queue = [w];
    while (queue.length) {
      const x = queue.pop();
      B.els.forEach(o => { if (o.type !== 'wall' || o.storey !== x.storey || res.has(o.id) || (w.kind && o.kind !== w.kind)) return; if ([x.a, x.b].some(p => near(o.a, p, 1) || near(o.b, p, 1))) { res.add(o.id); queue.push(o); } });
    }
    return [...res];
  }
  function newWall(a, b, first) {
    const e = newEl({ type: 'wall', a: [...a], b: [...b], t: cmd.th, just: cmd.just, kind: cmd.kind, h: null, ...(cmd.typeId ? { typeId: cmd.typeId } : {}) });
    change(() => { B.els.push(e); joinWall(e, first ? ['a', 'b'] : ['b']); });
    return e;
  }
  function wallClick(p) {
    if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
    const a = cmd.pts.at(-1);
    if (near(p, a, 1)) return;
    const closing = cmd.pts.length > 1 && near(p, cmd.pts[0], 1), first = cmd.pts.length === 1;
    const e = newWall(a, closing ? cmd.pts[0] : p, first && !closing);
    if (first) cmd.pts[0] = [...e.a];
    if (closing) { cmd.pts = []; env.toast('Umriss geschlossen.'); }
    else cmd.pts.push([...e.b]);
    renderUi(); draw();
  }
  function wallLen(dir) {
    const L = num(cmd.len);
    if (!cmd.pts.length) { env.toast('Erst den Startpunkt tippen.'); return; }
    if (!(L > 0)) { env.toast('Länge eingeben.'); return; }
    const a = cmd.pts.at(-1), b = add(a, mul(dir, L)).map(v => Math.round(v * 10) / 10);
    cmd.lastDir = dir;
    const first = cmd.pts.length === 1, e = newWall(a, b, first);
    if (first) cmd.pts[0] = [...e.a];
    cmd.pts.push([...e.b]); renderUi(); draw();
  }
  function outlineFromWalls() {
    const W2 = B.els.filter(e => e.type === 'wall' && e.storey === cur);
    if (W2.length < 3) { env.toast('Dafür braucht es einen geschlossenen Wandumriss.'); return null; }
    const key = p => `${Math.round(p[0])},${Math.round(p[1])}`, adj = new Map();
    W2.forEach(w => [[w.a, w.b], [w.b, w.a]].forEach(([p, q]) => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push({ w, to: q }); }));
    let best = null;
    for (const start of W2) {
      const loop = [start.a], used = new Set([start.id]);
      let at = start.b, ok = false;
      for (let g = 0; g < W2.length + 1; g++) {
        if (near(at, start.a)) { ok = true; break; }
        loop.push(at);
        const nx = (adj.get(key(at)) || []).find(x => !used.has(x.w.id));
        if (!nx) break;
        used.add(nx.w.id); at = nx.to;
      }
      if (ok && loop.length >= 3 && (!best || Math.abs(area2(loop)) > Math.abs(area2(best.loop)))) best = { loop, walls: [...used].map(elById) };
    }
    if (!best) { env.toast('Kein geschlossener Wandumriss gefunden.'); return null; }
    const P = best.loop, ccw = area2(P) > 0;
    const offs = P.map((p, i) => {
      const q = P[(i + 1) % P.length], w = best.walls.find(w2 => (near(w2.a, p) && near(w2.b, q)) || (near(w2.a, q) && near(w2.b, p)));
      if (!w) return 0;
      const [lo, hi] = wallOffs(w), same = near(w.a, p);
      return ccw ? (same ? -lo : hi) : (same ? hi : -lo);
    });
    const L = P.map((p, i) => { const q = P[(i + 1) % P.length], d = norm(sub(q, p)), n = ccw ? [d[1], -d[0]] : perp(d); return { p: add(p, mul(n, offs[i])), d }; });
    return L.map((l, i) => { const m = L[(i + P.length - 1) % P.length]; return lineX(m.p, m.d, l.p, l.d) || l.p; });
  }
  // Voreinstellungen für geneigte Dächer: Kanten parallel zur längsten sind Traufen
  function roofPreset(pts, kind) {
    const n = pts.length, ls = pts.map((p, i) => len(sub(pts[(i + 1) % n], p))), k = ls.indexOf(Math.max(...ls)), dk = norm(sub(pts[(k + 1) % n], pts[k]));
    return pts.map((p, i) => {
      const d = norm(sub(pts[(i + 1) % n], p)), par = Math.abs(cross2(d, dk)) < 0.05;
      const eave = kind === 'walm' ? true : kind === 'sattel' ? par : i === k;
      return { eave, pitch: kind === 'pult' ? 10 : 30 };
    });
  }
  function addArea(type, pts, holes) {
    if (pts.length < 3 || Math.abs(area2(pts)) < 1e4) { env.toast('Umriss zu klein.'); return; }
    const P = pts.map(p => [...p]);
    if (type === 'slab') addEl({ type, pts: P, t: cmd?.th ?? last.slab.th, ...((cmd ? cmd.base : last.slab.base) ? { base: true } : {}) });
    else if (type === 'roof') addEl({ type, pts: P, t: cmd.th, base: cmd.base, kind: cmd.kind, edges: roofPreset(P, 'walm'), over: cmd.kind === 'flat' ? 0 : 400, par: { h: cmd.kind === 'flat' ? 500 : 0, w: 240, o: 0 }, gable: true });
    else if (type === 'ceil') {
      const C = cmd?.t === 'ceil' ? cmd : last.ceil, e = { id: uid(), storey: cur, type, pts: P, ...(holes?.length ? { holes: holes.map(h => h.map(q => [...q])) } : {}), z: C.z, t: 20, gx: C.gx, gy: C.gy, ox: 0, oy: 0, off: [] };
      ceilEqual(e);
      change(() => B.els.push(e));
      return e;
    }
  }
  // Deckenöffnung über der Treppe: Rechteck um den Grundriss in der Decke des Geschosses darüber
  function stairHoleSpec(e) {
    const up = nextAbove(st(e.storey));
    if (!up) return null;
    const F = stairGeo(e).foot, xs = F.map(p => p[0]), ys = F.map(p => p[1]), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const slab = B.els.find(o => o.type === 'slab' && o.storey === up.id && pip(c[0], c[1], o.pts));
    return slab ? { host: slab.id, storey: up.id, p: c, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) } : null;
  }
  function stairHole(e) {
    const want = stairHoleSpec(e), cur2 = B.els.find(o => o.stairOf === e.id);
    if (!want) { if (cur2) B.els = B.els.filter(o => o !== cur2); return false; }
    if (cur2) Object.assign(cur2, want); else B.els.push({ id: uid(), type: 'hole', ...want, stairOf: e.id });
    return true;
  }
  // Deckenöffnungen der Treppen nachführen (neue Geschosse, Kopien, geänderte Decken); verwaiste entfernen
  function syncStairs() {
    B.els.filter(x => x.type === 'stair').forEach(stairHole);
    B.els = B.els.filter(o => !o.stairOf || B.els.some(x => x.id === o.stairOf));
  }
  function addStair(a, dir) {
    const e = newEl({ type: 'stair', a: [...a], dir, kind: cmd.kind, w: cmd.w, g: cmd.g, side: cmd.side, gap: 100 });
    let hole = false;
    change(() => { B.els.push(e); hole = stairHole(e); });
    const g = stairGeo(e);
    env.toast(`Treppe: ${g.n} Steigungen à ${fmt(g.h)} mm, Auftritt ${fmt(g.g)}${hole ? ', Deckenöffnung darüber angelegt' : ''}.`);
  }
  // Messen: Werte eines Bauteils
  const perim = P => P.reduce((a, p, i) => a + len(sub(P[(i + 1) % P.length], p)), 0);
  function elMeasure(e) {
    const A = P => Math.abs(area2(P)) / 1e6;
    switch (e.type) {
      case 'space': return [['Fläche', `${fmt2(A(e.pts) - (e.holes || []).reduce((a, h) => a + A(h), 0))} m²`], ['Umfang', `${fmt(perim(e.pts) + (e.holes || []).reduce((a, h) => a + perim(h), 0))} mm`]];
      case 'slab': { const holes = [...B.els.filter(o => o.host === e.id && o.type === 'hole').map(opPoly), ...shaftsThrough(st(e.storey)).map(x => x.pts)]; return [[e.base ? 'Bodenplatte' : 'Decke', `${fmt2(A(e.pts) - holes.reduce((a, h) => a + A(h), 0))} m²`], ['Umfang', `${fmt(perim(e.pts))} mm`], ['Dicke', `${fmt(e.t)} mm`]]; }
      case 'ceil': { const T = ceilTiles(e); return [['Fläche', `${fmt2(A(e.pts) - (e.holes || []).reduce((a, h) => a + A(h), 0))} m²`], ['Platten', `${T.full.filter(t => !t.off).length} voll, ${T.cut.filter(t => !t.off).length} Zuschnitt`]]; }
      case 'shaft': return [['Querschnitt', `${fmt2(A(e.pts))} m²`], ['Umfang', `${fmt(perim(e.pts))} mm`]];
      case 'roof': { const g = roofGeo(e); let roofA = A(g.outer); if (e.kind === 'pitched') roofA = g.facets.reduce((a, F) => { const lo = F.map(p => [p[0], p[1], g.H(p)]); const nn = norm(cross3(sub(lo[1], lo[0]), sub(lo[2], lo[0]))); return a + A(F) / Math.max(0.05, Math.abs(nn[2])); }, 0); return [['Grundfläche', `${fmt2(A(g.outer))} m²`], ['Dachfläche', `${fmt2(roofA)} m²`]]; }
      case 'wall': { const L = len(sub(e.b, e.a)), [z0, z1] = zRange(e), ops = B.els.filter(o => o.host === e.id && WALL_OPS.includes(o.type)), cc = wallColCuts(e).filter(o => !o.lat).reduce((a, o) => a + (Math.min(o.s1, L) - Math.max(o.s0, 0)) * (Math.min(o.t, z1) - Math.max(o.b, z0)), 0); return [['Länge', `${fmt(L)} mm`], ['Höhe', `${fmt(z1 - z0)} mm`], ['Ansichtsfläche', `${fmt2((L * (z1 - z0) - ops.reduce((a, o) => a + o.w * o.h, 0) - Math.max(0, cc)) / 1e6)} m²`]]; }
      case 'beam': return [['Länge', `${fmt(len(sub(e.b, e.a)))} mm`]];
      case 'column': { const [z0, z1] = zRange(e); return [['Höhe', `${fmt(z1 - z0)} mm`]]; }
      case 'stair': { const g = stairGeo(e); return [['Steigungen', `${g.n} × ${fmt(g.h)} mm`], ['Auftritt', `${fmt(g.g)} mm`], ['Lauflänge', `${fmt(g.L)} mm`]]; }
      default: return e.type === 'window' ? [['Größe', `${fmt(e.w)} × ${fmt(e.h)} mm`], ['Teilung', winText(e)]] : [['Größe', `${fmt(e.w)} × ${fmt(e.h ?? e.d)} mm`]];
    }
  }
  // Zeigerpunkt fürs Messen: in 3D mit Höhe, sobald die Punkte Höhen haben
  const mHover = c => (c.pts.at(-1)?.length === 3 || (!cam.plan && c.mode !== 'area') ? (hover?.p3 || (hover?.p && [...hover.p, curSt().elev])) : hover?.p);
  function measRes() {
    const c = cmd, P = c.pts, hp = mHover(c);
    if (c.mode === 'pick') { const e = c.res && elById(c.res); return e ? `${TYPE_NAME[e.type]}: ${elMeasure(e).map(([k, v]) => `${k} ${v}`).join(' · ')}` : 'Raum, Decke, Wand … antippen'; }
    if (c.mode === 'dist') { const Q = P.length === 2 ? P : P.length === 1 && hp ? [P[0], hp] : null; if (!Q) return P.length ? 'Zweiten Punkt tippen' : 'Ersten Punkt tippen'; const d = sub(Q[1], Q[0]); return `${fmt(len(d))} mm · ΔX ${fmt(Math.abs(d[0]))} · ΔY ${fmt(Math.abs(d[1]))}${d.length > 2 ? ` · ΔZ ${fmt(Math.abs(d[2]))}` : ''}`; }
    if (c.mode === 'chain') { const Q = [...P, ...(hp && P.length ? [hp] : [])]; if (Q.length < 2) return 'Punkte tippen'; let sm = 0; for (let i = 1; i < Q.length; i++) sm += len(sub(Q[i], Q[i - 1])); return `Summe ${fmt(sm)} mm · ${Q.length - 1} Strecken`; }
    const Q = c.closed ? P : [...P, ...(hp ? [hp] : [])];
    if (Q.length < 3) return 'Umriss tippen, Startpunkt schließt';
    return `${fmt2(Math.abs(area2(Q)) / 1e6)} m² · Umfang ${fmt(perim(Q))} mm${c.closed ? '' : ' (offen)'}`;
  }
  function measureTap(x, y) {
    const c = cmd;
    if (c.mode === 'pick') { const h = pickEl(x, y); c.res = h?.el || null; renderUi(); draw(); return; }
    const done2 = (c.mode === 'dist' && c.pts.length >= 2) || c.closed;
    const s2 = snapAt(x, y, { from: done2 || c.mid ? null : c.pts.at(-1), extra: c.mode === 'area' && c.pts.length > 2 ? [{ p: c.pts[0], label: 'Startpunkt' }] : [] });
    if (!s2?.p) return;
    const q = !cam.plan && c.mode !== 'area' ? (s2.p3 || [...s2.p, curSt().elev]) : s2.p;
    if (c.mid) { if (!c.mid.a) { c.mid.a = q; renderUi(); draw(); return; } const m = mul(add(c.mid.a, q), 0.5); c.mid = null; measurePoint(m); return; }
    measurePoint(q);
  }
  function measurePoint(p) {
    const c = cmd;
    if ((c.mode === 'dist' && c.pts.length >= 2) || c.closed) { c.pts = []; c.closed = false; }
    if (c.mode === 'area' && c.pts.length > 2 && near(p, c.pts[0], 1)) c.closed = true; else c.pts.push(p);
    renderUi(); draw();
  }
  function opAt(x, y) {
    const k = cmd.kind, v = cmd[k], p = onPlane(x, y);
    if (!p) return null;
    if (k === 'hole') {
      const sl = B.els.filter(e => e.type === 'slab' && e.storey === cur).find(e => pip(p[0], p[1], e.pts));
      return sl ? { type: 'hole', host: sl.id, storey: cur, p: p.map(q => Math.round(q / 10) * 10), w: v.w, d: v.d } : null;
    }
    const tol = (touch ? 22 : 12) / cam.sc;
    let best = null;
    B.els.filter(e => e.type === 'wall' && e.storey === cur).forEach(w => { const [dd, t] = segD(p[0], p[1], w.a, w.b); if (dd < w.t / 2 + tol && (!best || dd < best.dd)) best = { w, dd, t }; });
    if (!best) return null;
    const { L } = wallAxis(best.w), half = Math.min(v.w, L) / 2, at = Math.max(half, Math.min(L - half, Math.round(best.t * L / 10) * 10));
    return { type: k, host: best.w.id, storey: cur, at, w: Math.min(v.w, L), h: v.h, sill: v.sill, ...(k === 'door' ? { hinge: 'l', swing: 1 } : {}) };
  }
  // Verschieben und Kopieren: Bauteile um d, Öffnungen nur mit ihrer Wand oder Decke
  function moveEl(e, d) {
    const mv = p => add(p, d);
    if (e.a) e.a = mv(e.a);
    if (e.b) e.b = mv(e.b);
    if (e.p) e.p = mv(e.p);
    if (e.pts) e.pts = e.pts.map(mv);
    if (e.holes) e.holes = e.holes.map(h => h.map(mv));
    if (e.type === 'ceil') { e.ox += d[0]; e.oy += d[1]; }
  }
  function xform(d) {
    const ids = selIds(), els = ids.map(elById).filter(Boolean);
    if (!els.length) return;
    // Hauptbauteile; Türen und Fenster sitzen relativ in ihrer Wand, Deckendurchbrüche wandern mit ihrer Decke
    const main = els.filter(e => !WALL_OPS.includes(e.type) && !(e.type === 'hole' && !ids.includes(e.id)));
    if (cmd.t === 'move') {
      const moved = new Set(main.map(e => e.id));
      B.els.forEach(o => { if (o.type === 'hole' && moved.has(o.host)) moved.add(o.id); });
      change(() => { B.els.forEach(e => { if (moved.has(e.id)) moveEl(e, d); }); B.els.filter(e => moved.has(e.id) && e.type === 'stair').forEach(stairHole); });
      return;
    }
    const n = Math.max(1, Math.min(50, Math.round(num(cmd.n) || 1))), hosts = main.filter(e => e.type !== 'hole'), made = [];
    const opsOf = B.els.filter(o => OPS.includes(o.type) && !o.stairOf && hosts.some(h => h.id === o.host));
    change(() => {
      for (let k = 1; k <= n; k++) {
        const map = new Map(), dk = mul(d, k);
        hosts.forEach(e => { const c = structuredClone(e); c.id = uid(); map.set(e.id, c.id); moveEl(c, dk); B.els.push(c); made.push(c.id); if (c.type === 'stair') stairHole(c); });
        opsOf.forEach(o => { const c = structuredClone(o); c.id = uid(); c.host = map.get(o.host); if (c.type === 'hole') moveEl(c, dk); B.els.push(c); });
      }
    });
    sel = { ids: made.slice(-hosts.length) };
  }
  function splitWall(w, p) {
    const { d, L } = wallAxis(w), s = Math.round(dot(sub(p, w.a), d) / 10) * 10;
    if (s < 10 || s > L - 10) { env.toast('Zu nah am Wandende.'); return; }
    const m = add(w.a, mul(d, s)), nw = { ...structuredClone(w), id: uid(), a: m };
    change(() => {
      B.els.push(nw);
      B.els.filter(o => o.host === w.id && WALL_OPS.includes(o.type) && o.at > s).forEach(o => { o.host = nw.id; o.at -= s; o.at = Math.max(o.w / 2, o.at); });
      w.b = m;
      B.els.filter(o => o.host === w.id && WALL_OPS.includes(o.type)).forEach(o => { o.at = Math.min(o.at, s - o.w / 2); });
    });
    sel = { ids: [w.id, nw.id] };
  }
  function copyStorey() {
    const s = curSt(), top = sorted().at(-1), ns = { id: uid(), name: nextStoreyName(top, 1), elev: top.elev + top.height, height: s.height };
    change(() => {
      B.storeys.push(ns);
      const map = new Map(), src = B.els.filter(e => e.storey === s.id && e.type !== 'shaft');
      src.forEach(e => map.set(e.id, uid()));
      src.forEach(e => { const c = structuredClone(e); c.id = map.get(e.id); c.storey = ns.id; if (c.host) c.host = map.get(c.host) || c.host; B.els.push(c); });
    });
    cur = ns.id; sel = null; dirty = true; renderUi(); draw();
    env.toast(`${s.name} kopiert als ${ns.name}.`);
  }

  function onTap(x, y, shift = false) {
    if (!dimEd.hidden) closeDimEd();
    if (!cmd) { const hh = opHits.find(q => Math.abs(q.x - x) < q.w / 2 + 4 && Math.abs(q.y - y) < 14); if (hh) { openDimEd(hh); return; } }
    if (!cmd || cmd.t === 'grid') { const hh = gdimHits.find(q => Math.abs(q.x - x) < q.w / 2 + 4 && Math.abs(q.y - y) < 14); if (hh) { openDimEd(hh); return; } }
    if (!cmd) { pickSelect(x, y, shift || addMode); return; }
    const t = cmd.t;
    if (t === 'measure') { measureTap(x, y); return; }
    if (t === 'gstart') {
      const e = elById(cmd.el);
      if (!e) { endCmd(); return; }
      let k = -1, bd = touch ? 34 : 22;
      e.pts.forEach((q, i) => { const s2 = P2(q), d = Math.hypot(s2[0] - x, s2[1] - y); if (d < bd) { bd = d; k = i; } });
      if (k < 0) { env.toast('Eine Ecke der Rasterdecke antippen.'); return; }
      const S = ceilStrips(e), c = e.pts[k], m = centroid(e.pts), rx = m[0] > c[0] ? S.l : S.r, ry = m[1] > c[1] ? S.u : S.o;
      change(() => setCeilStart(e, k, Math.round(rx), Math.round(ry)));
      cmd = null; sel = { ids: [e.id] }; renderUi(); draw();
      return;
    }
    if (t === 'open') {
      const o = opAt(x, y);
      if (!o) { env.toast(cmd.kind === 'hole' ? 'Auf eine Decke tippen.' : 'Auf eine Wand tippen.'); return; }
      addEl(o); return;
    }
    if (t === 'tiles') {
      const e = elById(cmd.el); if (!e) { endCmd(); return; }
      const p = onPlane(x, y, st(e.storey).elev + e.z);
      if (!p || !pip(p[0], p[1], e.pts)) return;
      const k = `${Math.floor((p[0] - e.ox) / e.gx)},${Math.floor((p[1] - e.oy) / e.gy)}`;
      change(() => { e.off = (e.off || []).includes(k) ? e.off.filter(q => q !== k) : [...(e.off || []), k]; });
      return;
    }
    if (t === 'space' || (t === 'ceil' && cmd.mode === 'room')) {
      const p = onPlane(x, y);
      if (!p) return;
      const r = detectRoom(p);
      if (r.err) { env.toast(r.err); return; }
      if (t === 'space') { const nums = B.els.filter(e => e.type === 'space').map(e => +e.no).filter(Number.isFinite); addEl({ type: 'space', pts: r.pts, ...(r.holes.length ? { holes: r.holes } : {}), name: 'Raum', no: String((nums.length ? Math.max(...nums) : 0) + 1) }); }
      else addArea('ceil', r.pts, r.holes);
      return;
    }
    const lp = cmd.pts.length ? cmd.pts.at(-1) : null;
    const from = ['wall', 'beam', 'slab', 'roof', 'ceil', 'grid', 'move', 'copy', 'stair'].includes(t) ? lp : null;
    const extra = ['wall', 'slab', 'roof', 'ceil'].includes(t) && cmd.pts.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    const raw = t === 'cal' || t === 'ualign' || t === 'umove' && !cmd.pts.length;
    const s = raw ? { p: calOrtho(onPlane(x, y)) } : snapAt(x, y, { from: cmd.mid ? null : from, extra, skip: t === 'move' || t === 'copy' ? new Set(selIds()) : null });
    if (!s?.p) { env.toast('In dieser Ansicht lässt sich nicht zeichnen. Grundriss oder 3D von schräg oben.'); return; }
    // Mitte zwischen zwei Punkten: erst beide Punkte, dann gilt die Mitte als getippter Punkt
    if (cmd.mid) { if (!cmd.mid.a) { cmd.mid.a = s.p; renderUi(); draw(); return; } const m = mul(add(cmd.mid.a, s.p), 0.5).map(v => Math.round(v * 10) / 10); cmd.mid = null; applyPoint(m); return; }
    applyPoint(s.p);
  }
  // Ein Punkt für den laufenden Befehl (aus dem Fang, aus „Mitte“ oder aus der eingetippten Länge)
  // Stütze in einer Wand: Richtung der Wand übernehmen, quer mittig oder bündig zur Wandfläche
  function colInWall(p) {
    const wl = B.els.find(w => { if (w.type !== 'wall' || w.storey !== cur) return false; const { d, L } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), s2 = dot(sub(p, w.a), d), l2 = dot(sub(p, w.a), n); return s2 > -1 && s2 < L + 1 && l2 > lo - 1 && l2 < hi + 1; });
    if (!wl) return { p, rot: 0 };
    const { d } = wallAxis(wl), n = perp(d), [lo, hi] = wallOffs(wl), s2 = dot(sub(p, wl.a), d), sec = cmd.shape === 'steel' ? steelSection(cmd.prof) : null, depth = cmd.shape === 'round' ? cmd.w : sec ? sec.h : cmd.d;
    const latT = cmd.align === 'l' ? hi - depth / 2 : cmd.align === 'r' ? lo + depth / 2 : (lo + hi) / 2;
    const rot = Math.round(Math.atan2(d[1], d[0]) * 180 / Math.PI * 100) / 100;
    return { p: add(add(wl.a, mul(d, s2)), mul(n, latT)).map(v => Math.round(v * 10) / 10), rot: ((rot % 360) + 360) % 360, wall: wl };
  }
  function applyPoint(p) {
    const t = cmd.t;
    if (cmd.pts.length) cmd.lastDir = len(sub(p, cmd.pts.at(-1))) > 1 ? norm(sub(p, cmd.pts.at(-1))) : cmd.lastDir;
    switch (t) {
      case 'wall': wallClick(p); return;
      case 'stair':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        if (near(p, cmd.pts[0], 50)) return;
        addStair(cmd.pts[0], norm(sub(p, cmd.pts[0]))); cmd.pts = []; renderUi(); draw(); return;
      case 'column': { const q = colInWall(p); addEl({ type: 'column', p: q.p, shape: cmd.shape, w: cmd.w, d: cmd.shape === 'round' ? cmd.w : cmd.d, prof: cmd.prof, rot: q.rot, h: null }); if (q.wall) env.toast(`Stütze in der Wand (${cmd.align === 'l' ? 'bündig links' : cmd.align === 'r' ? 'bündig rechts' : 'mittig'}), Wand ist ausgespart.`); return; }
      case 'beam':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        if (near(p, cmd.pts[0], 10)) return;
        addEl({ type: 'beam', a: cmd.pts[0], b: p, shape: cmd.shape, w: cmd.w, bh: cmd.bh, prof: cmd.prof, top: cmd.top, rot90: false });
        cmd.pts = []; renderUi(); draw(); return;
      case 'slab': case 'roof': case 'ceil':
        if (cmd.pts.length > 2 && near(p, cmd.pts[0], 1)) { const P = cmd.pts; cmd.pts = []; addArea(t, P); return; }
        cmd.pts.push(p); renderUi(); draw(); return;
      case 'shaft': {
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        const a = cmd.pts[0];
        if (Math.abs(p[0] - a[0]) < 50 || Math.abs(p[1] - a[1]) < 50) { env.toast('Schacht zu schmal.'); return; }
        addEl({ type: 'shaft', pts: [a, [p[0], a[1]], p, [a[0], p[1]]], to: cmd.to, name: 'Schacht' });
        cmd.pts = []; renderUi(); draw(); return;
      }
      case 'grid': {
        const ref = cmd.base && (B.grids.find(g => g.id === cmd.ref) || B.grids.find(g => g.id === cmd.base));
        if (ref) {
          // Parallele durch den getippten Punkt, Abstand zur letzten Achse auf 5 mm gerundet
          const f = famOf(ref), off = Math.round(dot(sub(p, ref.a), f.n) / 5) * 5;
          if (Math.abs(off) < 10) return;
          let g = null;
          change(() => { g = addParallel(ref, off); });
          if (g) { cmd.ref = g.id; cmd.side = Math.sign(off); }
          renderUi(); draw(); return;
        }
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        const a = cmd.pts[0];
        if (near(a, p, 10)) return;
        let g = null;
        change(() => {
          g = { id: uid(), name: '?', a, b: p }; B.grids.push(g);
          const G = grpOf(g); g.name = famName(G.items.filter(it => it.g !== g), dot(g.a, G.n), G.f.vert);
        });
        cmd.pts = []; cmd.base = cmd.ref = g.id; cmd.side = 1; renderUi(); draw();
        env.toast(`Achse ${g.name}. Jetzt parallele Achsen: Abstand eintippen (auch 3x7500) oder Lage tippen.`);
        return;
      }
      case 'move': case 'copy':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        xform(sub(p, cmd.pts[0])); endCmd(); return;
      case 'split': {
        const w = elById(cmd.el);
        if (w) splitWall(w, p);
        endCmd(); return;
      }
      case 'measure': measurePoint(p); return;
      case 'cal':
        cmd.pts.push(p);
        if (cmd.pts.length === 2) { cmd.have = len(sub(cmd.pts[1], cmd.pts[0])); cmd.real = cmd.real ?? Math.round(cmd.have); }
        if (cmd.pts.length > 2) cmd.pts = [p];
        renderUi(); draw(); return;
      case 'ualign':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        ulAlign(cmd.pts[0], p); endCmd(); return;
      case 'umove':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        { const u = curUl(), d = sub(p, cmd.pts[0]); if (u) change(() => { u.pos = add(u.pos, d); }); }
        endCmd(); return;
    }
  }
  function calOk() {
    const u = curUl(), real = num(cmd.real);
    if (!u || cmd.pts.length < 2 || !(real > 0) || !(cmd.have > 0)) { env.toast('Zwei Punkte tippen und den echten Abstand eingeben.'); return; }
    const f = real / cmd.have, A = cmd.pts[0];
    change(() => { u.s *= f; u.pos = add(A, mul(sub(u.pos, A), f)); });
    env.toast(`Unterlage kalibriert: 1 Bildpunkt = ${fmt(u.s)} mm.`);
    endCmd(); fitView(); draw();
  }

  // ---------- Auswählen und Ziehen ----------
  const PRI = { stair: 0.8, door: -1, window: -1, opening: -1, hole: -1, column: 0, beam: 0.5, wall: 1, space: 1.5, shaft: 1.6, slab: 2, ceil: 2.5, roof: 3 };
  function pickEl(x, y) {
    const hits = [];
    for (const e of B.els) {
      if (!onStorey(e, cur) || !shown(e)) continue;
      if (cam.plan && e.type === 'ceil' && !isSel(e.id)) continue;
      const fp = footprint(e);
      if (!fp || fp.length < 3) continue;
      const [z0, z1] = zOf(e), top = fp.map(p => P3([...p, z1])), bot = fp.map(p => P3([...p, z0]));
      const inside = ['slab', 'space', 'ceil'].includes(e.type) ? pip(x, y, top) || pip(x, y, bot) : pip(x, y, hull([...top, ...bot].map(s => [s[0], s[1]])));
      if (inside) hits.push({ e, pri: PRI[e.type] ?? 2, z: Math.min(...top.map(s => s[2])) });
    }
    hits.sort((a, b) => a.pri - b.pri || a.z - b.z);
    if (hits.length) return { el: hits[0].e.id };
    const tol = touch ? 14 : 8;
    if (!B.vis.off.grid) for (const g of B.grids) {
      const a = P2(g.a), b = P2(g.b), d = norm(sub(b.slice(0, 2), a.slice(0, 2)));
      if (Number.isFinite(d[0])) for (const [q, sg, hid] of [[a, -1, g.hideA], [b, 1, g.hideB]]) if (!hid && Math.hypot(q[0] + d[0] * 13 * sg - x, q[1] + d[1] * 13 * sg - y) < 14) return { grid: g.id, head: true };
      if (segD(x, y, a, b)[0] < tol) return { grid: g.id };
    }
    return null;
  }
  let lastTap = null;
  function pickSelect(x, y, add2) {
    const h = pickEl(x, y), now = Date.now(), we = h?.el && elById(h.el);
    if (!add2 && we?.type === 'wall' && lastTap && now - lastTap.t < 450 && lastTap.id === h.el) { sel = { ids: wallChain(we) }; lastTap = null; dirty = true; renderUi(); draw(); if (sel.ids.length > 1) env.toast(`Wandzug: ${sel.ids.length} Wände gewählt.`); return; }
    if (!add2 && h?.el && we?.type !== 'wall' && lastTap && now - lastTap.t < 450 && lastTap.id === h.el) { sel = { ids: [h.el] }; lastTap = null; dirty = true; renderUi(); fitSel(); draw(); return; }
    lastTap = { t: now, id: h?.el };
    if (add2 && h?.el) { const ids = selIds(); sel = { ids: ids.includes(h.el) ? ids.filter(i => i !== h.el) : [...ids, h.el] }; if (!sel.ids.length) sel = null; }
    else sel = h?.el ? { ids: [h.el] } : h?.grid ? { grid: h.grid } : null;
    dirty = true; renderUi(); draw();
    if (h?.head) { const i = infoEl.querySelector('[data-gname]'); if (i) { i.focus(); i.select(); } }
  }
  function handles() {
    const e = selEl(), g = selGrid(), H2 = [];
    if (e?.type === 'wall' || e?.type === 'beam') H2.push({ k: 'a', p: e.a }, { k: 'b', p: e.b }, { k: 'm', p: mul(add(e.a, e.b), 0.5), move: true });
    if (e?.type === 'column') H2.push({ k: 'p', p: e.p, move: true });
    if (e?.pts) e.pts.forEach((p, i) => H2.push({ k: i, p }));
    if (e && WALL_OPS.includes(e.type) && hostOf(e)) { const w = hostOf(e); H2.push({ k: 'o', p: add(w.a, mul(wallAxis(w).d, e.at)), move: true }); }
    if (e?.type === 'hole') H2.push({ k: 'o', p: e.p, move: true });
    if (e?.type === 'ceil') H2.push({ k: 'g', p: ceilHandle(e), move: true, grid: true });
    if (e?.type === 'stair') H2.push({ k: 'sa', p: e.a, move: true });
    if (g) H2.push({ k: 'a', p: g.a }, { k: 'b', p: g.b }, { k: 'm', p: mul(add(g.a, g.b), 0.5), move: true });
    return H2;
  }
  const ceilHandle = e => { if (e.start) return [e.ox, e.oy]; const b = ceilBox(e); return [e.ox + Math.ceil((b.x0 - e.ox) / e.gx) * e.gx, e.oy + Math.ceil((b.y0 - e.oy) / e.gy) * e.gy]; };
  function handleAt(x, y) {
    const tol = touch ? 22 : 12;
    let best = null;
    for (const h of handles()) { const s = P2(h.p), d = Math.hypot(s[0] - x, s[1] - y); if (d < tol && (!best || d < best.d)) best = { ...h, d }; }
    return best;
  }
  function dragStart(h) {
    const e = selEl(), g = selGrid(), before = snap(), follow = [];
    if (e?.type === 'wall') {
      const pts = h.k === 'm' ? [e.a, e.b] : [e[h.k]];
      B.els.forEach(o => { if (o === e || o.type !== 'wall' || o.storey !== e.storey) return; for (const w of ['a', 'b']) if (pts.some(p => near(o[w], p))) follow.push({ o, w, from: [...o[w]] }); });
    }
    // Achse parallel ziehen: mitwandernde Achsen merken
    const gmove = g && h.k === 'm' ? (() => { const f = grpOf(g), i = f.items.findIndex(it => it.g === g); return (gMode === 'all' ? f.items : gMode === 'next' ? f.items.slice(i) : [f.items[i]]).map(it => ({ g: it.g, a: [...it.g.a], b: [...it.g.b] })); })() : null;
    const gF = gmove ? gridFollowers(gmove.map(m => m.g.id)) : null;
    return { h, before, e, g, follow, gmove, gF, a0: e?.a && [...e.a], b0: e?.b && [...e.b], ga: g && [...g.a], gb: g && [...g.b], opp: e?.type === 'shaft' && typeof h.k === 'number' ? [...e.pts[(h.k + 2) % 4]] : null };
  }
  // Magnet beim stufenlosen Ziehen: nur Bauteilecken und Stützen ganz in der Nähe
  function magnetAt(x, y) {
    if (freeSnap) return null;
    const tol = touch ? 14 : 8; let best = null;
    B.els.forEach(e => { if (!onStorey(e, cur) || !shown(e) || !['wall', 'column', 'slab', 'shaft'].includes(e.type)) return; (footprint(e) || []).forEach(q => { const s2 = P2(q), dd2 = Math.hypot(s2[0] - x, s2[1] - y); if (dd2 < tol && (!best || dd2 < best.d)) best = { p: q, d: dd2 }; }); if (e.type === 'column') { const s2 = P2(e.p), dd2 = Math.hypot(s2[0] - x, s2[1] - y); if (dd2 < tol && (!best || dd2 < best.d)) best = { p: e.p, d: dd2 }; } });
    return best?.p || null;
  }
  function dragMove(D, x, y) {
    const { h, e, g } = D;
    if (g && h.k === 'm' && D.gmove) {
      const mg = magnetAt(x, y), p = mg || onPlane(x, y);
      if (!p) return;
      const n = perp(norm(sub(D.gb, D.ga))), dd = Math.round(dot(sub(p, mul(add(D.ga, D.gb), 0.5)), n));
      D.gmove.forEach(m => { m.g.a = add(m.a, mul(n, dd)); m.g.b = add(m.b, mul(n, dd)); });
      if (D.gF?.length) { const ids = new Set(D.gmove.map(m => m.g.id)), dv = mul(n, dd); applyFollow(D.gF, id => (ids.has(id) ? dv : [0, 0])); }
      hover = mg ? { p: mg, label: 'Ecke' } : null;
      dirty = true; draw(); return;
    }
    const skip = new Set([e?.id, ...D.follow.map(f => f.o.id)].filter(Boolean));
    const anchor = h.k === 'a' ? (e ? D.b0 : D.gb) : h.k === 'b' ? (e ? D.a0 : D.ga) : null;
    const s = snapAt(x, y, { skip, from: anchor });
    if (!s) return;
    const p = s.p;
    if (e?.type === 'wall' || e?.type === 'beam') {
      if (h.k === 'm') { const d = sub(p, mul(add(D.a0, D.b0), 0.5)); e.a = add(D.a0, d); e.b = add(D.b0, d); D.follow.forEach(f => { f.o[f.w] = add(f.from, d); }); }
      else { e[h.k] = p; D.follow.forEach(f => { f.o[f.w] = [...p]; }); }
    } else if (e?.type === 'column') e.p = p;
    else if (e?.type === 'ceil' && h.k === 'g') { e.ox = p[0]; e.oy = p[1]; e.off = []; if (e.start) { const c = e.pts[e.start.k]; e.start = { ...e.start, rx: Math.round(Math.abs(p[0] - c[0])), ry: Math.round(Math.abs(p[1] - c[1])) }; } }
    else if (e?.type === 'stair') e.a = p;
    else if (e?.pts && typeof h.k === 'number') {
      if (D.opp) { const A = D.opp; e.pts = [A, [p[0], A[1]], p, [A[0], p[1]]]; } // Schacht bleibt rechteckig, die Gegenecke steht
      else e.pts[h.k] = p;
    } else if (e && WALL_OPS.includes(e.type)) { const w = hostOf(e), { d, L } = wallAxis(w), half = e.w / 2; e.at = Math.max(half, Math.min(L - half, Math.round(dot(sub(p, w.a), d) / 10) * 10)); }
    else if (e?.type === 'hole') e.p = p;
    else if (g && h.k === 'm') { const n = perp(norm(sub(D.gb, D.ga))), dd = Math.round(dot(sub(p, mul(add(D.ga, D.gb), 0.5)), n)); g.a = add(D.ga, mul(n, dd)); g.b = add(D.gb, mul(n, dd)); }
    else if (g) g[h.k] = p;
    hover = { p, label: s.label };
    dirty = true; draw();
  }
  function dragEnd(D) {
    if (D.e?.type === 'stair') stairHole(D.e);
    if (D.e?.type === 'wall' && D.moved !== false) joinWall(D.e, D.h.k === 'm' ? ['a', 'b'] : [D.h.k]);
    if (snap() === D.before) return;
    undo.push(D.before); redo.length = 0; persist(); renderUi();
  }

  // ---------- Zeichnen (Beschriftung, Raster, Anfasser) ----------
  function polyPath(P, z) { ctx.beginPath(); P.forEach((q, i) => { const s = P2(q, z); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }
  function renderOverlay() {
    const dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const z = curSt().elev, acc = css('--accent') || '#0a7cbd', mark = css('--mark') || '#ff7a1a', text = css('--text') || '#222', muted = css('--muted') || '#888', card = css('--card') || '#fff';
    const u = curUl();
    if (u && !B.vis.off.under && (cam.plan || ['cal', 'umove', 'ualign'].includes(cmd?.t))) {
      const img = imgs.get(u.file);
      if (img === undefined) ulImage(u);
      if (img) {
        const O = P2(ulMap(u, 0, 0), z), X = P2(ulMap(u, 1, 0), z), Y = P2(ulMap(u, 0, 1), z);
        ctx.save(); ctx.globalAlpha = u.alpha ?? 0.55;
        ctx.transform(X[0] - O[0], X[1] - O[1], Y[0] - O[0], Y[1] - O[1], O[0], O[1]);
        ctx.drawImage(img, 0, 0); ctx.restore();
      }
    }
    // Räume (Grundriss): leichte Füllung, Nummer, Name, Fläche
    if (cam.plan) B.els.forEach(e => {
      if (e.type !== 'space' || e.storey !== cur || !shown(e)) return;
      const on = isSel(e.id);
      polyPath(e.pts, z); (e.holes || []).forEach(hh => { hh.forEach((q, i) => { const s2 = P2(q, z); if (i) ctx.lineTo(s2[0], s2[1]); else ctx.moveTo(s2[0], s2[1]); }); ctx.closePath(); });
      ctx.fillStyle = on ? 'rgba(10,124,189,.16)' : 'rgba(80,160,120,.10)'; ctx.fill('evenodd');
      if (on) { ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); }
      const c = P2(centroid(e.pts), z);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = text;
      ctx.font = '700 12px system-ui'; ctx.fillText(`${e.no ? `${e.no} ` : ''}${e.name || ''}`, c[0], c[1] - 8);
      ctx.font = '12px system-ui'; ctx.fillStyle = muted; ctx.fillText(`${fmt2(Math.abs(area2(e.pts)) / 1e6)} m²`, c[0], c[1] + 8);
    });
    // Wandschichten (Grundriss): Bänder je Schicht in Materialfarbe, ohne die Stützen; erst ab sichtbarer Dicke
    if (cam.plan) {
      const cols = B.els.filter(c => c.type === 'column' && c.storey === cur && shown(c)).map(colPoly), px = len(sub(P2([1000, 0], z), P2([0, 0], z))) / 1000;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); cols.forEach(K => K.forEach((q, i) => { const s2 = P2(q, z); if (i) ctx.lineTo(s2[0], s2[1]); else ctx.moveTo(s2[0], s2[1]); ctx.closePath(); })); ctx.clip('evenodd');
      B.els.forEach(w => {
        if (w.type !== 'wall' || w.storey !== cur || !shown(w)) return;
        const ty = typeOf(w); if (!ty?.layers || ty.layers.length < 2 || w.t * px < 6) return;
        const P = wallPoly(w), d = norm(sub(w.b, w.a)), n = perp(d), [lo] = wallOffs(w), lat = p => dot(sub(p, w.a), n);
        let o0 = lo;
        ty.layers.forEach(l => {
          const o1 = o0 + l.t, A0 = o0, A1 = o1, band = clipBy(clipBy(P, p => lat(p) - A0), p => A1 - lat(p));
          if (band.length >= 3) { polyPath(band, z); ctx.fillStyle = MAT[l.m] || '#ddd'; ctx.globalAlpha = 0.95; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(60,60,60,.55)'; ctx.lineWidth = 0.8; ctx.stroke(); }
          o0 = o1;
        });
        polyPath(P, z); ctx.strokeStyle = isSel(w.id) ? acc : 'rgba(40,40,40,.85)'; ctx.lineWidth = isSel(w.id) ? 2 : 1.1; ctx.stroke();
      });
      ctx.restore();
    }
    // Über der Schnittebene (Grundriss): gestrichelt
    if (cam.plan) B.els.forEach(e => {
      if (!ABOVE.includes(e.type) || e.type === 'stair' || !onStorey(e, cur) || !shown(e)) return;
      const fp = footprint(e), on = isSel(e.id);
      ctx.strokeStyle = on ? acc : e.type === 'shaft' ? 'rgb(220,120,40)' : muted; ctx.lineWidth = on ? 2 : 1.2; ctx.setLineDash(e.type === 'shaft' ? [] : [8, 5]);
      polyPath(fp, z); ctx.stroke(); ctx.setLineDash([]);
      if (e.type === 'shaft') { const s = fp.map(q => P2(q, z)); ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[2][0], s[2][1]); ctx.moveTo(s[1][0], s[1][1]); ctx.lineTo(s[3][0], s[3][1]); ctx.stroke(); }
      if (e.type === 'roof' && e.kind === 'pitched' && on) { const g = roofGeo(e); g.facets.forEach(F => { polyPath(F, z); ctx.stroke(); }); }
    });
    { const o = P2([0, 0], z); ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o[0] - 6, o[1]); ctx.lineTo(o[0] + 6, o[1]); ctx.moveTo(o[0], o[1] - 6); ctx.lineTo(o[0], o[1] + 6); ctx.stroke(); }
    // Leeres Geschoss: wie es losgeht
    if (!cmd && !dlg && !B.els.some(e => onStorey(e, cur)) && !(curUl() && cam.plan)) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = muted;
      ctx.font = '600 15px system-ui'; ctx.fillText(`${curSt().name} ist leer`, W / 2, H * 0.42);
      ctx.font = '13px system-ui';
      ['Wand (W): Außenwände Ecke für Ecke antippen, Startpunkt schließt', B.grids.length ? 'Stütze (S) → „Auf alle Achsschnitte“ besetzt das ganze Raster' : 'Plan unterlegen oder Achsraster: Liste oben links → Unterlage bzw. Raster', 'Decke (D) → „Aus Wänden“ übernimmt den Umriss'].forEach((t, i) => ctx.fillText(t, W / 2, H * 0.42 + 26 + i * 20));
    }
    // Achsraster
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    (B.vis.off.grid ? [] : B.grids).forEach(g => {
      const a = P2(g.a, z), b = P2(g.b, z), on = sel?.grid === g.id;
      ctx.strokeStyle = on ? acc : 'rgba(200,60,60,.75)'; ctx.lineWidth = on ? 2 : 1; ctx.setLineDash([14, 4, 2, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      const d = norm(sub(b.slice(0, 2), a.slice(0, 2)));
      for (const [p, sgn] of [[a, -1], [b, 1]]) {
        if (sgn < 0 ? g.hideA : g.hideB) continue;
        const c = [p[0] + d[0] * 13 * sgn, p[1] + d[1] * 13 * sgn];
        ctx.fillStyle = card; ctx.beginPath(); ctx.arc(c[0], c[1], 12, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = on ? acc : 'rgb(200,60,60)'; ctx.fillText(g.name, c[0], c[1] + 0.5);
      }
    });
    if (cam.plan || cmd?.t === 'grid' || sel?.grid) gridDims(z, 'rgb(200,60,60)'); else gdimHits = [];
    opHits = [];
    { const o = !cmd && selEl(); if (o && OPS.includes(o.type)) (o.type === 'hole' ? holeDims(o) : opDims(o)).forEach(m => dim3(m.A, m.B, m.val, acc, opHits, { op: o.id, kind: m.kind, title: m.title, dir: m.dir, sl: m.sl, sr: m.sr, z0: m.z0, z1: m.z1, L: m.L })); }
    // gewählte Achse: Abstände zu den Nachbarn direkt an der Achse (laufen beim Ziehen mit)
    { const g = !cmd && selGrid(), f = g && grpOf(g), i = f ? f.items.findIndex(it => it.g === g) : -1;
      if (f) { const mid = mul(add(g.a, g.b), 0.5); [f.items[i - 1], f.items[i + 1]].forEach(nb => { if (nb) { const o = nb.off - f.items[i].off; dimLine(mid, add(mid, mul(f.n, o)), fmt(Math.abs(o)), acc, z); } }); } }
    if (cmd?.t === 'grid' && cmd.base) {
      const ref = B.grids.find(g => g.id === cmd.ref) || B.grids.find(g => g.id === cmd.base);
      if (ref) {
        const a = P2(ref.a, z), b = P2(ref.b, z);
        ctx.strokeStyle = mark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (hover?.p) {
          const f = famOf(ref), off = Math.round(dot(sub(hover.p, ref.a), f.n) / 5) * 5;
          if (Math.abs(off) >= 10) {
            const pa = add(ref.a, mul(f.n, off)), pb = add(ref.b, mul(f.n, off)), A = P2(pa, z), Bq = P2(pb, z);
            ctx.lineWidth = 1.5; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]); ctx.stroke(); ctx.setLineDash([]);
            const mid = mul(add(ref.a, ref.b), 0.5); dimLine(mid, add(mid, mul(f.n, off)), fmt(Math.abs(off)), mark, z);
          }
        }
      }
    }
    // Türen und Fenster im Grundriss
    if (cam.plan) B.els.forEach(o => {
      if (o.storey !== cur || !['door', 'window'].includes(o.type) || !shown(o)) return;
      const w = hostOf(o);
      if (!w) return;
      const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), col = isSel(o.id) ? acc : text;
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      if (o.type === 'window') {
        polyPath(opPoly(o), z); ctx.fillStyle = card; ctx.fill(); ctx.stroke();
        const m0 = P2(add(add(w.a, mul(d, o.at - o.w / 2)), mul(n, (lo + hi) / 2)), z), m1 = P2(add(add(w.a, mul(d, o.at + o.w / 2)), mul(n, (lo + hi) / 2)), z);
        ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
        winLayout(o).xs.slice(1, -1).forEach(x => { const base = add(w.a, mul(d, o.at - o.w / 2 + x)), q0 = P2(add(base, mul(n, lo)), z), q1 = P2(add(base, mul(n, hi)), z); ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); });
        return;
      }
      const sw = o.swing ?? 1, face = sw > 0 ? hi : lo, l = (o.hinge || 'l') === 'l', hingeS = l ? o.at - o.w / 2 : o.at + o.w / 2, freeS = l ? o.at + o.w / 2 : o.at - o.w / 2;
      const Hp = add(add(w.a, mul(d, hingeS)), mul(n, face)), Fp = add(add(w.a, mul(d, freeS)), mul(n, face)), Op = add(Hp, mul(n, sw * o.w));
      const h2 = P2(Hp, z), f2 = P2(Fp, z), o2 = P2(Op, z), r2 = Math.hypot(f2[0] - h2[0], f2[1] - h2[1]);
      const a0 = Math.atan2(f2[1] - h2[1], f2[0] - h2[0]), a1 = Math.atan2(o2[1] - h2[1], o2[0] - h2[0]);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      ctx.beginPath(); ctx.moveTo(h2[0], h2[1]); ctx.lineTo(o2[0], o2[1]); ctx.stroke();
      ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(h2[0], h2[1], r2, a0, a0 + da, da < 0); ctx.stroke(); ctx.setLineDash([]);
    });
    // Treppen im Grundriss: Stufen, Lauflinie mit Pfeil
    if (cam.plan) B.els.forEach(e => {
      if (e.type !== 'stair' || e.storey !== cur || !shown(e)) return;
      const g = stairGeo(e), on = isSel(e.id);
      ctx.strokeStyle = on ? acc : text; ctx.lineWidth = on ? 1.6 : 1;
      [...g.steps.map(q => q.poly), ...(g.land ? [g.land.poly] : [])].forEach(P => { polyPath(P, z); ctx.stroke(); });
      const W2 = g.walk.map(q => P2(q, z));
      ctx.beginPath(); W2.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      dot2(W2[0], 3, on ? acc : text);
      const A1 = W2.at(-2), A2 = W2.at(-1), ang = Math.atan2(A2[1] - A1[1], A2[0] - A1[0]);
      ctx.beginPath(); ctx.moveTo(A2[0], A2[1]); ctx.lineTo(A2[0] - 9 * Math.cos(ang - 0.4), A2[1] - 9 * Math.sin(ang - 0.4)); ctx.moveTo(A2[0], A2[1]); ctx.lineTo(A2[0] - 9 * Math.cos(ang + 0.4), A2[1] - 9 * Math.sin(ang + 0.4)); ctx.stroke();
    });
    // Maße der Auswahl
    const e = selEl();
    if (e?.type === 'wall' || e?.type === 'beam') dimLine(e.a, e.b, fmt(len(sub(e.b, e.a))), acc, z);
    if (false && e && WALL_OPS.includes(e.type) && hostOf(e)) { const w = hostOf(e), { d } = wallAxis(w); dimLine(w.a, add(w.a, mul(d, e.at - e.w / 2)), fmt(e.at - e.w / 2), acc, z); dimLine(add(w.a, mul(d, e.at - e.w / 2)), add(w.a, mul(d, e.at + e.w / 2)), fmt(e.w), acc, z); }
    if (e?.type === 'ceil' && cam.plan) { polyPath(e.pts, z); ctx.strokeStyle = acc; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(10,124,189,.35)'; ctx.lineWidth = 1; for (const [k, g2, o2] of [[0, e.gx, e.ox], [1, e.gy, e.oy]]) { const vals = e.pts.map(p => p[k]), lo = Math.min(...vals), hi = Math.max(...vals), dd = k ? [1, 0] : [0, 1]; for (let c = Math.ceil((lo - o2) / g2) * g2 + o2; c < hi; c += g2) lineInPoly(e.pts, k ? [0, c] : [c, 0], dd, e.holes || []).forEach(([a, b]) => { const s1 = P2(a, z), s2 = P2(b, z); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke(); }); } ceilHoles(e).forEach(q => { polyPath(q, z); ctx.fillStyle = 'rgba(220,50,50,.35)'; ctx.fill(); }); ceilTiles(e).cut.forEach(t => { if (t.off) return; polyPath([[t.x, t.y], [t.x + e.gx, t.y], [t.x + e.gx, t.y + e.gy], [t.x, t.y + e.gy]].map(q => q), z); ctx.save(); ctx.clip(); polyPath(e.pts, z); ctx.fillStyle = 'rgba(255,122,26,.22)'; ctx.fill(); ctx.restore(); }); }
    // Mehrfachauswahl: Umrisse
    if (selIds().length > 1) selIds().map(elById).filter(Boolean).forEach(o => { const fp = footprint(o); if (fp?.length > 2) { polyPath(fp, z); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); } });
    // Messen
    if (cmd?.t === 'measure') {
      const c = cmd, P = c.pts, hp = mHover(c);
      // X/Y/Z-Strahlen ab dem letzten Punkt (3D)
      const f3 = !cam.plan && P.at(-1)?.length === 3 && !(c.mode === 'dist' && P.length >= 2) ? P.at(-1) : null;
      if (f3) { const a = P3(f3); AX3.forEach(([ax, , colr], k) => { const b = P3(add(f3, mul(ax, 1000))), ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); if (l < 1) return; ctx.strokeStyle = colr; ctx.globalAlpha = hover?.ray === k ? 0.95 : 0.35; ctx.lineWidth = hover?.ray === k ? 2 : 1; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(a[0] - ex / l * 3000, a[1] - ey / l * 3000); ctx.lineTo(a[0] + ex / l * 3000, a[1] + ey / l * 3000); ctx.stroke(); }); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      if (c.mode === 'pick' && c.res && elById(c.res)) { const fp = footprint(elById(c.res)); if (fp?.length > 2) { polyPath(fp, z); ctx.fillStyle = 'rgba(255,122,26,.18)'; ctx.fill(); ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.stroke(); } }
      else if (c.mode === 'area') {
        const Q = c.closed ? P : [...P, ...(hp ? [hp] : [])];
        if (Q.length >= 2) { polyPath(Q, z); ctx.fillStyle = 'rgba(255,122,26,.16)'; if (Q.length > 2) ctx.fill(); ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.stroke(); }
        if (Q.length > 2) { const m = P2(centroid(Q), z); tag(m[0], m[1], `${fmt2(Math.abs(area2(Q)) / 1e6)} m²`, mark); }
      } else {
        const Q = c.mode === 'dist' && P.length === 2 ? P : [...P, ...(hp && P.length ? [hp] : [])];
        for (let i = 1; i < Q.length; i++) dimLine(Q[i - 1], Q[i], fmt(len(sub(Q[i], Q[i - 1]))), mark, z);
      }
    }
    // Befehl
    if (cmd) {
      const pts = cmd.pts || [];
      pts.forEach((p, i) => dot2(p.length > 2 ? P3(p) : P2(p, z), i === 0 ? 5 : 4, mark));
      if (['slab', 'roof', 'ceil', 'cal', 'ualign', 'grid', 'move', 'copy', 'beam', 'shaft'].includes(cmd.t) && pts.length) {
        ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.setLineDash(['slab', 'roof', 'ceil'].includes(cmd.t) ? [] : [6, 4]);
        ctx.beginPath(); pts.forEach((p, i) => { const s = P2(p, z); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
        if (hover?.p && !(['cal', 'ualign'].includes(cmd.t) && pts.length !== 1)) { const s = P2(hover.p, z); ctx.lineTo(s[0], s[1]); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // Verschieben/Kopieren: Umrisse am Ziel
      if ((cmd.t === 'move' || cmd.t === 'copy') && pts.length && hover?.p) {
        const d = sub(hover.p, pts[0]), n = cmd.t === 'copy' ? Math.max(1, Math.min(50, Math.round(num(cmd.n) || 1))) : 1;
        ctx.strokeStyle = mark; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        for (let k = 1; k <= n; k++) selIds().map(elById).filter(Boolean).forEach(o => { const fp = footprint(o); if (fp?.length > 2) { polyPath(fp.map(q => add(q, mul(d, k))), z); ctx.stroke(); } });
        ctx.setLineDash([]);
      }
      if (hover?.op && hover.op.type !== 'hole') { const o = hover.op, w = hostOf(o), { d } = wallAxis(w); dimLine(w.a, add(w.a, mul(d, o.at - o.w / 2)), fmt(o.at - o.w / 2), mark, z); }
      if (hover?.p && pts.length && ['wall', 'grid', 'slab', 'roof', 'ceil', 'beam', 'move', 'copy'].includes(cmd.t)) dimLine(pts.at(-1), hover.p, fmt(len(sub(hover.p, pts.at(-1)))), mark, z);
      if (cmd.t === 'cal' && pts.length === 1 && hover?.p) dimLine(pts[0], hover.p, fmt(len(sub(hover.p, pts[0]))), mark, z);
      if (cmd.t === 'cal' && pts.length === 2) dimLine(pts[0], pts[1], `${fmt(cmd.have)} → ${fmt(num(cmd.real))}`, mark, z);
    }
    if (!cmd) handles().forEach(h => { const s = P2(h.p, z); ctx.fillStyle = h.grid ? mark : card; ctx.strokeStyle = h.grid ? card : acc; ctx.lineWidth = 2; ctx.beginPath(); if (h.move) ctx.rect(s[0] - 6, s[1] - 6, 12, 12); else ctx.arc(s[0], s[1], 6, 0, 7); ctx.fill(); ctx.stroke(); if (h.grid) tag(s[0], s[1] - 20, 'Rasterstart', mark); });
    if (cmd) {
      // erfasste Punkte als kleine Kreuze, Spurlinien gestrichelt zum Bezugspunkt
      ctx.strokeStyle = acc; ctx.lineWidth = 1.2;
      acq.forEach(q => { const s2 = P2(q.p, z); ctx.beginPath(); ctx.moveTo(s2[0] - 4, s2[1] - 4); ctx.lineTo(s2[0] + 4, s2[1] + 4); ctx.moveTo(s2[0] + 4, s2[1] - 4); ctx.lineTo(s2[0] - 4, s2[1] + 4); ctx.stroke(); });
      if (hover?.p && hover.guides?.length) { ctx.setLineDash([6, 5]); hover.guides.forEach(g => { const a = P2(g, z), b = P2(hover.p, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }); ctx.setLineDash([]); }
      if (hover?.ortho || hover?.label?.includes('Ortho')) { const f = cmd.pts?.at(-1); if (f && hover?.p) { const a = P2(f, z), b = P2(hover.p, z), d2 = norm(sub(b.slice(0, 2), a.slice(0, 2))); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + d2[0] * 2000, b[1] + d2[1] * 2000); ctx.stroke(); ctx.setLineDash([]); } }
      if (cmd.mid?.a) { const s2 = P2(cmd.mid.a, z); dot2(s2, 4, mark); if (hover?.p) { const m = P2(mul(add(cmd.mid.a, hover.p), 0.5), z); ctx.strokeStyle = mark; ctx.beginPath(); ctx.moveTo(m[0] - 6, m[1]); ctx.lineTo(m[0] + 6, m[1]); ctx.moveTo(m[0], m[1] - 6); ctx.lineTo(m[0], m[1] + 6); ctx.stroke(); } }
    }
    if (hover?.p) {
      const s = hover.p3 ? P3(hover.p3) : P2(hover.p, z);
      ctx.strokeStyle = hover.label ? mark : acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], hover.label ? 8 : 5, 0, 7); ctx.stroke();
      if (hover.label) tag(s[0], s[1] - 22, hover.label, mark);
    }
    if (drag?.piv && drag.moved && !drag.pan && !drag.D) { const s2 = P3(drag.piv); ctx.fillStyle = 'rgba(40,170,90,.18)'; ctx.beginPath(); ctx.arc(s2[0], s2[1], 13, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s2[0], s2[1], 5, 0, 7); ctx.stroke(); dot2(s2, 4, 'rgb(40,170,90)'); }
    if (cmd && (dyn || dynNeg)) { const at = lastMouse || [W / 2, H / 2]; tag(at[0] + 70, at[1] + 26, `${cmd.t === 'grid' ? 'Abstand' : 'Länge'} ${dyn || '…'} mm${dynNeg ? ' · Gegenrichtung' : ''} · Enter`, acc); }
  }
  function placeDyn() {
    if (cmd?.t === 'grid' && cmd.base) {
      const str = dyn, neg = dynNeg, ref = B.grids.find(g => g.id === cmd.ref) || B.grids.find(g => g.id === cmd.base);
      dyn = ''; dynNeg = false;
      let side = cmd.side || 1;
      if (hover?.p && ref) side = Math.sign(dot(sub(hover.p, ref.a), famOf(ref).n)) || side;
      gridSeries(str, neg ? -side : side); return;
    }
    const L = num(dyn), neg = dynNeg, from = cmd?.pts?.at(-1);
    dyn = ''; dynNeg = false;
    if (!(L > 0) || !from) { draw(); return; }
    const hp3 = from.length > 2 ? (hover?.p3 || (hover?.p && [...hover.p, from[2]])) : hover?.p;
    let dir = hp3 && len(sub(hp3, from)) > 1 ? norm(sub(hp3, from)) : from.length > 2 ? [...(cmd.lastDir || [1, 0]), 0].slice(0, 3) : cmd.lastDir || [1, 0];
    if (neg) dir = mul(dir, -1);
    const p = add(from, mul(dir, L)).map(v => Math.round(v * 10) / 10);
    if (cmd.t === 'measure') measurePoint(p); else applyPoint(p);
    if (lastMouse && cmd) { hover = hoverOf(...lastMouse); }
    draw();
  }
  function dot2(s, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7); ctx.fill(); }
  function tag(x, y, t, c) {
    ctx.font = '600 12px system-ui'; const w = ctx.measureText(t).width + 12;
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 0.5);
  }
  function dimLine(p, q, t, c, z) {
    const a = p.length > 2 ? P3(p) : P2(p, z), b = q.length > 2 ? P3(q) : P2(q, z), d = norm(sub(b.slice(0, 2), a.slice(0, 2))), n = [-d[1] * 34, d[0] * 34];
    if (!Number.isFinite(d[0]) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 4) return;
    ctx.strokeStyle = c; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + n[0] * 1.2, a[1] + n[1] * 1.2); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + n[0] * 1.2, b[1] + n[1] * 1.2);
    ctx.moveTo(a[0] + n[0], a[1] + n[1]); ctx.lineTo(b[0] + n[0], b[1] + n[1]); ctx.stroke();
    const m = [(a[0] + b[0]) / 2 + n[0], (a[1] + b[1]) / 2 + n[1]];
    ctx.font = '600 12px system-ui'; const w = ctx.measureText(t).width + 10;
    ctx.fillStyle = css('--card') || '#fff'; ctx.beginPath(); ctx.roundRect(m[0] - w / 2, m[1] - 10, w, 20, 5); ctx.fill();
    ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, m[0], m[1] + 0.5);
  }
  let queued = false;
  function draw() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; renderGL(); renderOverlay(); }); }

  // ---------- IFC-Export (IFC4, Geometrie als Dreiecksnetz) ----------
  function ifcText() {
    const L = [];
    let n = 0;
    const E = s => { L.push(`#${++n}=${s};`); return `#${n}`; };
    const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    const gid = () => `'${CH[Math.floor(Math.random() * 4)]}${Array.from({ length: 21 }, () => CH[Math.floor(Math.random() * 64)]).join('')}'`;
    const S = t => `'${String(t ?? '').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
    const R = v => { let s = String(Math.round(v * 1000) / 1000); if (!/[.eE]/.test(s)) s += '.'; return s; };
    const origin = E('IFCCARTESIANPOINT((0.,0.,0.))'), a2p = E(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
    const ctx3 = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${a2p},$)`);
    const units = E(`IFCUNITASSIGNMENT((${[E('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), E('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), E('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), E('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')].join(',')}))`);
    const project = E(`IFCPROJECT(${gid()},$,${S(B.name || 'Gebäude')},$,$,$,$,(${ctx3}),${units})`);
    const lp = () => E(`IFCLOCALPLACEMENT($,${a2p})`);
    const site = E(`IFCSITE(${gid()},$,'Grundstück',$,$,${lp()},$,$,.ELEMENT.,$,$,$,$,$)`);
    const bldg = E(`IFCBUILDING(${gid()},$,${S(B.name || 'Gebäude')},$,$,${lp()},$,$,.ELEMENT.,$,$,$)`);
    E(`IFCRELAGGREGATES(${gid()},$,$,$,${project},(${site}))`);
    E(`IFCRELAGGREGATES(${gid()},$,$,$,${site},(${bldg}))`);
    const shape = tris => {
      if (!tris.length) return '$';
      const pts = new Map(), faces = [];
      const P = i => { const k = `${R(tris[i])},${R(tris[i + 1])},${R(tris[i + 2])}`; if (!pts.has(k)) pts.set(k, E(`IFCCARTESIANPOINT((${k}))`)); return pts.get(k); };
      for (let i = 0; i < tris.length; i += 27) { const a = P(i), b = P(i + 9), c = P(i + 18); if (a === b || b === c || a === c) continue; faces.push(E(`IFCFACE((${E(`IFCFACEOUTERBOUND(${E(`IFCPOLYLOOP((${a},${b},${c}))`)},.T.)`)}))`)); }
      if (!faces.length) return '$';
      const brep = E(`IFCFACETEDBREP(${E(`IFCCLOSEDSHELL((${faces.join(',')}))`)})`);
      return E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${ctx3},'Body','Brep',(${brep}))`)}))`);
    };
    const meshOf = e => { const out = []; elemMesh(e, [0, 0, 0], out, null); return out; };
    // Türblatt und Glasscheibe als dünne Platte in Wandmitte
    const plateOf = o => { const w = hostOf(o); if (!w) return []; const { d } = wallAxis(w), nn = perp(d), [lo, hi] = wallOffs(w), c = (lo + hi) / 2, th = o.type === 'door' ? 40 : 60, A = add(w.a, mul(d, o.at - o.w / 2)), Bp = add(w.a, mul(d, o.at + o.w / 2)), [b, t] = opZ(o), out = []; prism([add(A, mul(nn, c - th / 2)), add(Bp, mul(nn, c - th / 2)), add(Bp, mul(nn, c + th / 2)), add(A, mul(nn, c + th / 2))], b, t, [0, 0, 0], out, null); return out; };
    const boxOf = o => { const out = [], [b, t] = opZ(o); prism(opPoly(o), b, t, [0, 0, 0], out, null); return out; };
    const ids = new Map(), storeys = [];
    for (const s of sorted()) {
      const so = E(`IFCBUILDINGSTOREY(${gid()},$,${S(s.name)},$,$,${lp()},$,$,.ELEMENT.,${R(s.elev)})`);
      storeys.push(so);
      const contained = [], spaces = [];
      for (const e of B.els.filter(x => x.storey === s.id)) {
        const nm = S(e.type === 'space' ? e.no || 'Raum' : e.type === 'column' || e.type === 'beam' ? (e.shape === 'steel' ? e.prof : TYPE_NAME[e.type]) : TYPE_NAME[e.type]);
        let id;
        switch (e.type) {
          case 'wall': id = E(`IFCWALL(${gid()},$,${S(kindName(e.kind) || 'Wand')},$,$,${lp()},${shape(meshOf(e))},$,${e.kind === 'tb' ? '.PARTITIONING.' : '.STANDARD.'})`); break;
          case 'column': id = E(`IFCCOLUMN(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.COLUMN.)`); break;
          case 'beam': id = E(`IFCBEAM(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.BEAM.)`); break;
          case 'slab': id = E(`IFCSLAB(${gid()},$,${e.base ? "'Bodenplatte'" : nm},$,$,${lp()},${shape(meshOf(e))},$,${e.base ? '.BASESLAB.' : '.FLOOR.'})`); break;
          case 'stair': id = E(`IFCSTAIR(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,${e.kind === 'u' ? '.HALF_TURN_STAIR.' : '.STRAIGHT_RUN_STAIR.'})`); break;
          case 'roof': id = E(`IFCSLAB(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.ROOF.)`); break;
          case 'ceil': id = E(`IFCCOVERING(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.CEILING.)`); break;
          case 'shaft': id = E(`IFCSPACE(${gid()},$,${S(e.name || 'Schacht')},$,'Schacht',${lp()},${shape(meshOf(e))},'Schacht',.ELEMENT.,.SPACE.,$)`); spaces.push(id); continue;
          case 'space': id = E(`IFCSPACE(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},${S(e.name)},.ELEMENT.,.SPACE.,$)`); spaces.push(id); continue;
          case 'door': id = E(`IFCDOOR(${gid()},$,${nm},$,$,${lp()},${shape(plateOf(e))},$,${R(e.h)},${R(e.w)},.DOOR.,$,$)`); break;
          case 'window': {
            const L = winLayout(e), main = L.fields.filter(x => x.row === 'main').length, top = L.rows.some(x => x.key === 'top'), tris = [];
            winMesh(e, [0, 0, 0], tris, tris, null);
            const part = main === 1 && !top ? '.SINGLE_PANEL.' : main === 2 && !top ? '.DOUBLE_PANEL_VERTICAL.' : main === 3 && !top ? '.TRIPLE_PANEL_VERTICAL.' : main === 1 && top ? '.DOUBLE_PANEL_HORIZONTAL.' : main === 2 && top ? '.TRIPLE_PANEL_TOP.' : '.USERDEFINED.';
            id = E(`IFCWINDOW(${gid()},$,${nm},$,$,${lp()},${shape(tris)},$,${R(e.h)},${R(e.w)},.WINDOW.,${part},$)`);
            const ps = E(`IFCPROPERTYSET(${gid()},$,'Fenster',$,(${[E(`IFCPROPERTYSINGLEVALUE('Teilung',$,IFCLABEL(${S(winText(e))}),$)`), E(`IFCPROPERTYSINGLEVALUE('Felder',$,IFCLABEL(${S(L.fields.map(x => `${x.row === 'main' ? '' : x.row === 'top' ? 'Oberlicht ' : 'Unterlicht '}${wopName(x.op)}`).join(', '))}),$)`)].join(',')}))`);
            E(`IFCRELDEFINESBYPROPERTIES(${gid()},$,$,$,(${id}),${ps})`);
            break;
          }
          default: id = E(`IFCOPENINGELEMENT(${gid()},$,${nm},$,$,${lp()},${shape(boxOf(e))},$,.OPENING.)`); ids.set(e.id, id); continue;
        }
        ids.set(e.id, id); contained.push(id);
      }
      if (contained.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${gid()},$,$,$,(${contained.join(',')}),${so})`);
      if (spaces.length) E(`IFCRELAGGREGATES(${gid()},$,$,$,${so},(${spaces.join(',')}))`);
    }
    if (storeys.length) E(`IFCRELAGGREGATES(${gid()},$,$,$,${bldg},(${storeys.join(',')}))`);
    // Durchbrüche: gehören als Aussparung zu ihrer Wand oder Decke
    B.els.filter(e => (e.type === 'opening' || e.type === 'hole') && ids.has(e.host)).forEach(e => E(`IFCRELVOIDSELEMENT(${gid()},$,$,$,${ids.get(e.host)},${ids.get(e.id)})`));
    // Schichtaufbau der Wand- und Deckentypen (IfcMaterialLayerSet), je Typ einmal, alle Exemplare daran gebunden
    { const byT = {}, mats = {}; B.els.forEach(e => { const ty = typeOf(e); if (ty?.layers && ids.has(e.id)) (byT[ty.id] ||= []).push(ids.get(e.id)); });
      Object.entries(byT).forEach(([tid, list]) => {
        const ty = B.types[tid], ls = ty.layers.map(l => E(`IFCMATERIALLAYER(${mats[l.m] ||= E(`IFCMATERIAL(${S(l.m)},$,$)`)},${(+l.t).toFixed(1)},$,${S(l.m)},$,$,$)`));
        E(`IFCRELASSOCIATESMATERIAL(${gid()},$,$,$,(${list.join(',')}),${E(`IFCMATERIALLAYERSET((${ls.join(',')}),${S(ty.name)},$)`)})`);
      }); }
    const now = new Date().toISOString().slice(0, 19);
    return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');\nFILE_NAME(${S('gebaeude.ifc')},'${now}',(''),(''),'Rohrbiegen Gebaeude','Rohrbiegen','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
  }
  // Ansicht als Bild: Modell und Beschriftung zusammen, mit Hintergrund
  function viewImage() {
    renderGL(); renderOverlay();
    const c = document.createElement('canvas'); c.width = glc.width; c.height = glc.height;
    const g = c.getContext('2d');
    g.fillStyle = isDark() ? '#2d3034' : '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(glc, 0, 0); g.drawImage(cv, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) download(b, `gebaeude-${curSt().name.replace(/\W+/g, '-')}-${cam.plan ? 'grundriss' : '3d'}.png`); }, 'image/png');
  }

  // ---------- Leisten und Felder ----------
  const fld = (k, v, label, unit = 'mm', ph = '') => `<label class="ped-f"><span>${label}</span><input data-f="${k}" inputmode="decimal" value="${v == null || v === '' ? '' : raw(v)}"${ph ? ` placeholder="${ph}"` : ''}><i>${unit}</i></label>`;
  const seg = (k, val, opts) => `<span class="ped-seg">${opts.map(([v, t]) => `<button data-seg="${k}:${v}"${String(val) === String(v) ? ' class="on"' : ''}>${t}</button>`).join('')}</span>`;
  const profSel = (k, val) => `<label class="ped-f"><span>Profil</span><select data-sel="${k}">${STEEL_FAM.map(f => `<optgroup label="${f}">${Object.keys(STEEL).filter(n => n.startsWith(`${f} `)).map(n => `<option${n === val ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  const storeySel = (k, val, from) => `<label class="ped-f"><span>bis</span><select data-sel="${k}">${sorted().filter(s => !from || s.elev >= from.elev).map(s => `<option value="${s.id}"${s.id === val ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
  // ---------- Bauteiltypen ----------
  // Ein Typ trägt die Parameter (Wand: Schichten, Art; Decke: Schichten; Stütze: Form und Maß; Fenster/Tür: Maße, Teilung). Das Bauteil verweist mit typeId darauf.
  // Ändert man am Bauteil einen Typwert von Hand, löst es sich vom Typ („Eigene Maße“); „Typ bearbeiten“ ändert alle Exemplare.
  // (als function: wird schon beim Laden des Gebäudes gebraucht)
  function catOf(e) { return ['wall', 'slab', 'column', 'window', 'door'].includes(e.type) ? e.type : null; }
  function typeOf(e) { return (e.typeId && B.types?.[e.typeId]) || null; }
  function typeTotal(ty) { return ty.layers ? ty.layers.reduce((a, l) => a + l.t, 0) : null; }
  function eq1(a, c) { return Math.abs((+a || 0) - (+c || 0)) < 0.05; }
  function typeMatches(e, ty) {
    switch (ty.cat) {
      case 'wall': return eq1(e.t, typeTotal(ty)) && e.kind === ty.kind;
      case 'slab': return eq1(e.t, typeTotal(ty)) && !!e.base === !!ty.base;
      case 'column': return e.shape === ty.shape && (ty.shape === 'steel' ? e.prof === ty.prof : eq1(e.w, ty.w) && eq1(ty.shape === 'round' ? e.w : e.d, ty.shape === 'round' ? ty.w : ty.d));
      case 'window': case 'door': return eq1(e.w, ty.w) && eq1(e.h, ty.h) && eq1(e.sill, ty.sill) && (ty.cat === 'door' || JSON.stringify(e.cfg ?? null) === JSON.stringify(ty.cfg ?? null));
    }
    return false;
  }
  function applyType(e, ty) {
    switch (ty.cat) {
      case 'wall': e.t = typeTotal(ty); e.kind = ty.kind; break;
      case 'slab': e.t = typeTotal(ty); if (ty.base) e.base = true; else delete e.base; break;
      case 'column': e.shape = ty.shape; if (ty.shape === 'steel') e.prof = ty.prof; else { e.w = ty.w; e.d = ty.shape === 'round' ? ty.w : ty.d; } break;
      case 'window': case 'door': {
        const w = hostOf(e), Lw = w ? wallAxis(w).L : ty.w;
        e.w = Math.min(ty.w, Lw); e.h = ty.h; e.sill = ty.sill || 0; e.at = Math.max(e.w / 2, Math.min(Lw - e.w / 2, e.at));
        if (ty.cat === 'window') { if (ty.cfg) e.cfg = JSON.parse(JSON.stringify(ty.cfg)); else delete e.cfg; }
        break;
      }
    }
    e.typeId = ty.id;
  }
  function linkOne(e) { const cat = catOf(e); if (!cat || e.typeId) return; const ty = Object.values(B.types || {}).find(t => t.cat === cat && typeMatches(e, t)); if (ty) e.typeId = ty.id; }
  function relinkAll() { for (const e of B.els) if (e.typeId) { const ty = B.types?.[e.typeId]; if (!ty || ty.cat !== catOf(e) || !typeMatches(e, ty)) delete e.typeId; } }
  const typeName = (cat, base) => { let n = base, i = 2; const have = new Set(Object.values(B.types).filter(t => t.cat === cat).map(t => t.name)); while (have.has(n)) n = `${base} (${i++})`; return n; };
  function typeFromEl(e) {
    const id = `ty-${uid()}`, cat = catOf(e);
    let t;
    if (cat === 'wall') t = { id, cat, name: typeName(cat, `${kindName(e.kind) || 'Wand'} ${fmt(e.t / 10)}`), kind: e.kind || 'iwt', layers: [{ m: 'Mauerwerk', t: e.t }] };
    else if (cat === 'slab') t = { id, cat, name: typeName(cat, `${e.base ? 'Bodenplatte' : 'Decke'} ${fmt(e.t / 10)}`), ...(e.base ? { base: true } : {}), layers: [{ m: 'Stahlbeton', t: e.t }] };
    else if (cat === 'column') t = e.shape === 'steel' ? { id, cat, name: typeName(cat, `Stahlstütze ${e.prof}`), shape: 'steel', prof: e.prof } : e.shape === 'round' ? { id, cat, name: typeName(cat, `Rundstütze Ø ${fmt(e.w / 10)}`), shape: 'round', w: e.w, d: e.w } : { id, cat, name: typeName(cat, `Stütze ${fmt(e.w / 10)} × ${fmt(e.d / 10)}`), shape: 'rect', w: e.w, d: e.d };
    else t = { id, cat, name: typeName(cat, cat === 'door' ? `Tür ${fmt(e.w)} × ${fmt(e.h)}` : `${winText(e).split(' · ')[0]} ${fmt(e.w)} × ${fmt(e.h)}`), w: e.w, h: e.h, sill: e.sill || 0, ...(cat === 'window' && e.cfg ? { cfg: JSON.parse(JSON.stringify(e.cfg)) } : {}) };
    return t;
  }
  function newTypeFrom(els) { const t = typeFromEl(els[0]); change(() => { B.types[t.id] = t; els.forEach(e => applyType(e, t)); }); env.toast(`Neuer Typ „${t.name}“ angelegt und angewendet.`); return t; }
  function editType(id, mut) { const ty = B.types?.[id]; if (!ty) return; change(() => { mut(ty); B.els.forEach(e => { if (e.typeId === id) applyType(e, ty); }); }); }
  const curTypeId = () => { const ids = new Set(selIds().map(elById).filter(Boolean).map(e => e.typeId || '')); return ids.size === 1 ? [...ids][0] : ''; };
  const typeOpts = (cat, withNew = true) => [...Object.values(B.types || {}).filter(t => t.cat === cat).sort((a, c) => a.name.localeCompare(c.name, 'de', { numeric: true })).map(t => [t.id, t.name]), ['', 'Eigene Maße'], ...(withNew ? [['__new', 'Neuer Typ aus Auswahl …']] : [])];
  function typeRow(els) {
    const cats = new Set(els.map(catOf));
    if (cats.size !== 1 || [...cats][0] == null) return '';
    const ids = new Set(els.map(e => e.typeId || '')), val = ids.size === 1 ? [...ids][0] : '__mixed', opts = typeOpts([...cats][0]);
    if (val === '__mixed') opts.unshift(['__mixed', 'verschieden']);
    return `<div class="ped-acts">${dd('etype', 'Typ', val, opts)}</div>`;
  }
  const layerSum = ty => (ty.layers || []).map(l => fmt(l.t)).join(' + ');
  const typeInfo = ty => (ty.layers ? `${layerSum(ty)} = ${fmt(typeTotal(ty))} mm` : ty.cat === 'column' ? (ty.shape === 'steel' ? ty.prof : ty.shape === 'round' ? `Ø ${fmt(ty.w)} mm` : `${fmt(ty.w)} × ${fmt(ty.d)} mm`) : `${fmt(ty.w)} × ${fmt(ty.h)} mm`);
  // Typ bearbeiten (Abschnitt der Palette): Name, Parameter, Schichten; gilt für alle Exemplare
  function typeEditHtml(e) {
    const ty = typeOf(e);
    if (!ty) return `<small>Dieses Bauteil hat eigene Maße. Oben „Typ“ wählen oder „Neuer Typ aus Auswahl …“, um die Maße als Typ festzuhalten und für weitere Bauteile zu nutzen.</small>`;
    const n = B.els.filter(x => x.typeId === ty.id).length;
    let h = `<label class="ped-f bau-wname"><span>Name</span><input data-tyf="name" value="${esc(ty.name)}" class="bau-short"></label>`;
    if (ty.cat === 'wall') h += `<div class="ped-acts">${seg('tykind', ty.kind, WALL_SEG)}</div>`;
    if (ty.layers) {
      h += `<datalist id="bau-mats">${Object.keys(MAT).map(m => `<option value="${esc(m)}">`).join('')}</datalist><table class="bau-tb bau-lay"><tbody>${ty.layers.map((l, i) => `<tr><td><i class="bau-sw2" style="background:${MAT[l.m] || '#ddd'}"></i></td><td><input data-tyl="m:${i}" list="bau-mats" value="${esc(l.m)}"></td><td><input data-tyl="t:${i}" inputmode="decimal" value="${raw(l.t)}"> <span>mm</span></td><td>${ty.layers.length > 1 ? `<button class="icbtn" data-b="tyldel:${i}" title="Schicht entfernen" aria-label="Schicht entfernen">${SVG(IC.x)}</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <div class="ped-acts"><button data-b="tyladd">+ Schicht</button><span class="bprompt">Gesamt ${fmt(typeTotal(ty))} mm</span></div>${ty.cat === 'wall' ? '<small>Schicht 1 liegt links in Zeichenrichtung der Wand.</small>' : ''}`;
      if (ty.cat === 'slab') h += `<div class="ped-acts">${seg('tybase', ty.base ? '1' : '0', [['0', 'Decke'], ['1', 'Bodenplatte']])}</div>`;
    } else if (ty.cat === 'column') {
      h += `<div class="ped-acts">${seg('tyshape', ty.shape, [['rect', 'Eckig'], ['round', 'Rund'], ['steel', 'Stahl']])}</div>${ty.shape === 'steel' ? profSel('typrof', ty.prof) : `<div class="ped-grid">${fld('tyw', ty.w, ty.shape === 'round' ? 'Ø' : 'Breite')}${ty.shape === 'round' ? '' : fld('tyd', ty.d, 'Tiefe')}</div>`}`;
    } else {
      h += `<div class="ped-grid">${fld('tyw', ty.w, 'Breite')}${fld('tyh', ty.h, 'Höhe')}${ty.cat === 'window' ? fld('tysill', ty.sill, 'Brüstung') : ''}</div>`;
      if (ty.cat === 'window') h += `<small>Teilung und Öffnungsarten: im Fenster-Editor einstellen, dann hier übernehmen.</small>`;
    }
    h += `<div class="ped-acts">${ty.cat === 'window' ? `<button data-b="typeupd" class="on">Typ aus diesem Fenster übernehmen</button>` : ''}<button data-b="tydel">Typ löschen</button></div><small>${n} Exemplar${n === 1 ? '' : 'e'} nutzen diesen Typ.</small>`;
    return h;
  }
  function tyField(el) {
    const ty = B.types?.[curTypeId()];
    if (!ty) return;
    const v = num(el.value), pos = v > 0, f = el.dataset.f;
    if (el.dataset.tyf === 'name') { const nm = el.value.trim(); if (nm) editType(ty.id, t => { t.name = nm; }); }
    else if (el.dataset.tyl) { const [k, i] = el.dataset.tyl.split(':'); editType(ty.id, t => { const l = t.layers[+i]; if (!l) return; if (k === 'm') l.m = el.value.trim() || l.m; else if (pos) l.t = v; }); }
    else if (f === 'tyw' && pos) editType(ty.id, t => { t.w = v; if (t.shape === 'round') t.d = v; });
    else if (f === 'tyd' && pos) editType(ty.id, t => { t.d = v; });
    else if (f === 'tyh' && pos) editType(ty.id, t => { t.h = v; });
    else if (f === 'tysill' && Number.isFinite(v) && v >= 0) editType(ty.id, t => { t.sill = v; });
    renderUi(); draw();
  }
  function typesHtml() {
    return Object.entries(TYPE_CATS).map(([cat, title]) => {
      const ts = Object.values(B.types || {}).filter(t => t.cat === cat).sort((a, c) => a.name.localeCompare(c.name, 'de', { numeric: true }));
      return `<h5 class="bau-th">${title}</h5>${ts.map(t => { const n = B.els.filter(e => e.typeId === t.id).length; return `<button class="bau-trow" data-tysel="${t.id}"><b>${esc(t.name)}</b><small>${n} ${n === 1 ? 'Exemplar' : 'Exemplare'} · ${esc(typeInfo(t))}</small></button>`; }).join('') || '<small class="bau-none">keine</small>'}`;
    }).join('');
  }

  // ---------- Desktop-Gerüst: Menüband, Optionsleiste, Statusleiste ----------
  // Ab 1000 px Breite: Menüband oben, Paletten angedockt, Optionsleiste unter dem Band, Statusleiste unten; schmaler: wie bisher schwebende Leisten
  function applyDesk() {
    const want = root.clientWidth >= 1000;
    if (want === desk) return;
    desk = want; root.classList.toggle('desk', desk);
    if (desk) optEl.appendChild(cmdEl); else root.querySelector('.ped-bottom').insertBefore(cmdEl, root.querySelector('.ped-tools'));
    if (desk && !listOpen) listOpen = true;
    requestAnimationFrame(() => { topEl.style.setProperty('--top-h', `${topEl.offsetHeight}px`); renderUi(); fitView(); draw(); });
  }
  const RIB_B = (a, l, ic, o = {}) => ({ a, l, ic, ...o });
  const RIB = [
    ['Gebäude', [['Datei', [RIB_B('docnew', 'Neu', 'plus'), RIB_B('dlg:docs', 'Öffnen', 'house'), RIB_B('export', 'Sichern', 'save'), RIB_B('import', 'Laden', 'upload')]], ['Ausgabe', [RIB_B('ifc', 'IFC', 'ifc'), RIB_B('png', 'Bild', 'image')]], ['Hilfe', [RIB_B('dlg:keys', 'Kürzel', 'help')]]]],
    ['Start', [['Auswahl', [RIB_B('t:sel', 'Auswählen', 'sel')]], ['Bauen', [RIB_B('t:wall', 'Wand', 'wall'), RIB_B('t:column', 'Stütze', 'column'), RIB_B('t:beam', 'Träger', 'beam'), RIB_B('t:slab', 'Decke', 'slab'), RIB_B('t:open', 'Öffnung', 'door')]], ['Ändern', [RIB_B('xmove', 'Verschieben', 'move', { sel: 1 }), RIB_B('xcopy', 'Kopieren', 'copy', { sel: 1 }), RIB_B('del', 'Löschen', 'trash', { sel: 1 })]], ['Verlauf', [RIB_B('undo', 'Rückgängig', 'undo'), RIB_B('redo', 'Wiederholen', 'redo')]]]],
    ['Tragwerk', [['Wand und Stütze', [RIB_B('t:wall', 'Wand', 'wall'), RIB_B('t:column', 'Stütze', 'column')]], ['Träger und Decke', [RIB_B('t:beam', 'Träger', 'beam'), RIB_B('t:slab', 'Decke', 'slab')]], ['Wände', [RIB_B('joinall', 'Ecken verbinden', 'link')]]]],
    ['Öffnungen', [['Wand', [RIB_B('op:door', 'Tür', 'door'), RIB_B('op:window', 'Fenster', 'window'), RIB_B('op:opening', 'Durchbruch', 'opening')]], ['Decke', [RIB_B('op:hole', 'Durchbruch', 'hole'), RIB_B('t:shaft', 'Schacht', 'shaft')]]]],
    ['Ausbau', [['Räume', [RIB_B('t:space', 'Raum', 'space'), RIB_B('t:ceil', 'Rasterdecke', 'ceil')]], ['Aufbauten', [RIB_B('t:stair', 'Treppe', 'stair'), RIB_B('t:roof', 'Dach', 'roof')]]]],
    ['Raster + Plan', [['Achsraster', [RIB_B('t:grid', 'Achse', 'grid'), RIB_B('dlg:grid', 'Raster erzeugen', 'grid')]], ['Planunterlage', [RIB_B('uload', 'Laden', 'under'), RIB_B('cal', 'Kalibrieren', 'ruler', { ul: 1 }), RIB_B('ualign', 'Ausrichten', 'rotate', { ul: 1 }), RIB_B('umove', 'Verschieben', 'move', { ul: 1 })]], ['Geschosse', [RIB_B('dlg:storeys', 'Geschosse', 'layers')]]]],
    ['Messen', [['Messen', [RIB_B('t:measure', 'Messen', 'measure')]]]],
    ['Ansicht', [['Ansicht', [RIB_B('view', 'Grundriss / 3D', 'plan'), RIB_B('fit', 'Einpassen', 'fit'), RIB_B('above', 'Darüber', 'layers'), RIB_B('list', 'Projektbrowser', 'list')]]]],
  ];
  // Kontext-Reiter: nur Aktionen zur Auswahl; die Werte stehen in der Palette rechts
  function ctxTab() {
    const ids = selIds(), els = ids.map(elById).filter(Boolean), g = selGrid();
    if (g) return ['Achse', [['Achse', [RIB_B('gpar', 'Parallele', 'grid'), RIB_B('grenum', 'Neu nummerieren', 'rotate'), RIB_B('delgrid', 'Löschen', 'trash')]]]];
    if (!els.length) return null;
    const ty = els.every(x => x.type === els[0].type) ? els[0].type : null, one = els.length === 1 ? els[0] : null, grp = [];
    const spec = [];
    if (ty === 'wall') spec.push(RIB_B('split', 'Teilen', 'cut', { sel1: 1 }), RIB_B('chainsel', 'Wandzug', 'wall'), RIB_B('joinall', 'Ecken verbinden', 'link'));
    if (ty && WALL_OPS.includes(ty)) spec.push(...(ty === 'window' ? [RIB_B('windlg', 'Gestalten', 'window', { sel1: 1 })] : []));
    if (ty === 'stair') spec.push(RIB_B('stairdlg', 'Treppe', 'stair', { sel1: 1 }));
    if (ty === 'roof') spec.push(RIB_B('roofdlg', 'Dach', 'roof', { sel1: 1 }));
    if (ty === 'ceil') spec.push(RIB_B('ceildlg', 'Raster', 'ceil', { sel1: 1 }), RIB_B('gstart', 'Rasterstart', 'grid', { sel1: 1 }), RIB_B('tiles', 'Platten', 'ceil', { sel1: 1 }));
    if (ty === 'space') spec.push(RIB_B('roomceil', 'Rasterdecke', 'ceil', { sel1: 1 }));
    if (spec.length) grp.push([one ? TYPE_NAME[one.type] : `${TYPE_NAME[ty]} (${els.length})`, spec]);
    grp.push(['Ändern', [RIB_B('xmove', 'Verschieben', 'move'), RIB_B('xcopy', 'Kopieren', 'copy'), RIB_B('hidesel', 'Ausblenden', 'eyeoff'), RIB_B('del', 'Löschen', 'trash')]]);
    grp.push(['Auswahl', [RIB_B('selnone', 'Aufheben', 'x')]]);
    return [one ? TYPE_NAME[one.type] : ty ? `${TYPE_NAME[ty]} (${els.length})` : `Auswahl (${els.length})`, grp];
  }
  const ribBtn = b => {
    const [kind, val] = b.a.includes(':') ? b.a.split(':') : ['b', b.a], attr = kind === 'dlg' ? `data-dlg="${val}"` : `data-b="${b.a}"`;
    const on = kind === 't' ? cmd?.t === val : kind === 'op' ? cmd?.t === 'open' && cmd.kind === val : b.a === 'view' ? !cam.plan : b.a === 'above' ? showAbove : b.a === 'list' ? listOpen : false;
    const dis = (b.sel && !selIds().length && !sel?.grid) || (b.ul && !curUl()) ? ' disabled' : '';
    return `<button class="bau-rb${on ? ' on' : ''}" ${attr} title="${esc(b.l)}"${dis}>${SVG(IC[b.ic] || IC.more)}<span>${esc(b.l)}</span></button>`;
  };
  function renderRibbon() {
    if (!desk) return;
    const ct = ctxTab();
    if (ribTab === 100 && !ct) ribTab = ribPrev;
    const tabs = [...RIB.map(([n]) => n)], idx = Math.min(ribTab, tabs.length - 1), ctxOn = ct && ribTab === 100;
    const cur2 = ctxOn ? ct : RIB[idx];
    ribEl.innerHTML = `<div class="bau-rtabs">${RIB.map(([n], i) => `<button class="bau-rtab${!ctxOn && i === idx ? ' on' : ''}" data-rtab="${i}">${esc(n)}</button>`).join('')}${ct ? `<button class="bau-rtab ctx${ctxOn ? ' on' : ''}" data-rtab="100">${esc(ct[0])}</button>` : ''}</div>
      <div class="bau-rpanel">${cur2[1].map(([gn, bs]) => `<div class="bau-rg"><div class="bau-rbs">${bs.map(ribBtn).join('')}</div><small>${esc(gn)}</small></div>`).join('')}</div>`;
    topEl.classList.toggle('rib-off', ribOff);
    topEl.style.setProperty('--top-h', `${topEl.offsetHeight}px`);
  }
  function renderStatus() {
    if (!desk) return;
    const n = selIds().length, one = selEl(), pr = cmdEl.querySelector('.bprompt')?.textContent;
    statusEl.querySelector('.bau-sp').textContent = cmd ? (pr || cmd.t) : n === 1 && one ? `${elLabel(one)} gewählt` : n > 1 ? `${n} Bauteile gewählt` : selGrid() ? `Achse ${selGrid().name} gewählt` : 'Bereit · Befehl im Menüband wählen oder Bauteil antippen';
    statusEl.querySelector('[data-b="ortho"]').classList.toggle('on', orthoOn);
    statusEl.querySelector('[data-ddk="snap"]').textContent = `Fang ${SNAP_KEYS.filter(([k]) => snapCfg[k]).length}/${SNAP_KEYS.length}`;
  }
  // Kontextmenü (rechte Maustaste)
  function ctxMenu(x, y) {
    const hit = !cmd ? pickEl(x, y) : null;
    if (hit && !(hit.el && isSel(hit.el)) && !(hit.grid && sel?.grid === hit.grid)) { sel = hit.el ? { ids: [hit.el] } : { grid: hit.grid }; dirty = true; renderUi(); draw(); }
    const has = selIds().length > 0 || !!sel?.grid, it = (a, l, ic, dis) => `<button data-b="${a}" ${dis ? 'disabled' : ''}>${SVG(IC[ic] || IC.more)}${esc(l)}</button>`;
    ctxm.innerHTML = cmd ? `${it('end', cmd.pts?.length ? 'Fertig / Abbrechen (Esc)' : 'Befehl beenden (Esc)', 'x')}${it('ortho', orthoOn ? 'Ortho ausschalten (F8)' : 'Ortho einschalten (F8)', 'plan')}`
      : `${lastCmdT ? it(`t:${lastCmdT}`, `Letzten Befehl wiederholen (${TYPE_NAME[lastCmdT] || MORE.find(m => m[0] === lastCmdT)?.[1] || lastCmdT})`, 'rotate') : ''}${has ? `<hr>${it('xmove', 'Verschieben', 'move')}${it('xcopy', 'Kopieren', 'copy')}${it('hidesel', 'Ausblenden', 'eyeoff')}${it('del', 'Löschen', 'trash')}${it('selnone', 'Auswahl aufheben', 'x')}` : ''}<hr>${it('fit', has ? 'Auf Auswahl zoomen (F)' : 'Alles einpassen (F)', 'fit')}${it('view', cam.plan ? '3D-Ansicht (V)' : 'Grundriss (V)', 'plan')}`;
    ctxm.hidden = false;
    const rr = root.getBoundingClientRect(), cr = cv.getBoundingClientRect(), w = 240, h2 = ctxm.offsetHeight;
    ctxm.style.left = `${Math.max(4, Math.min(rr.width - w - 4, x + cr.left - rr.left))}px`; ctxm.style.top = `${Math.max(4, Math.min(rr.height - h2 - 4, y + cr.top - rr.top))}px`;
  }
  // Dialoge zu einem Bauteil gelten immer für die aktuelle Auswahl: anderes Bauteil gleicher Art gewählt → Dialog zeigt dieses, sonst schließt er
  const DLG_TYPE = { window: ['window'], roof: ['roof'], ceil: ['ceil'], stair: ['stair'] };
  let dlgAutoFor = null;
  function syncDlgSel() {
    const ids0 = selIds(), e0 = ids0.length === 1 ? elById(ids0[0]) : null;
    if (!e0 || !DLG_TYPE[e0.type]) dlgAutoFor = null;
    // Desktop: der Editor zum gewählten Fenster, Dach, Treppe oder zur Rasterdecke erscheint von selbst in der Palette (einmal je Auswahl; mit × schließbar)
    if (desk && !cmd && !dlg && e0 && dlgAutoFor !== e0.id && Object.keys(DLG_TYPE).includes(e0.type)) { dlg = { kind: e0.type, el: e0.id }; dlgAutoFor = e0.id; }
    if (!dlg?.el || !DLG_TYPE[dlg.kind]) return;
    const ids = selIds(), e = ids.length === 1 ? elById(ids[0]) : null;
    if (e && DLG_TYPE[dlg.kind].includes(e.type)) { if (dlg.el !== e.id) { dlg = { kind: dlg.kind, el: e.id }; dlgAutoFor = e.id; } }
    else if (!(cmd && ['gstart', 'tiles'].includes(cmd.t))) dlg = null;
  }
  function renderUi() {
    syncDlgSel();
    const s = curSt();
    $('.ped-title').innerHTML = `${esc(s.name)} <span class="bau-tcar">▾</span>`;
    $('.bau-docname').textContent = B.name || 'Gebäude';
    root.classList.toggle('list-open', listOpen);
    const t = cmd ? cmd.t : 'sel';
    root.querySelectorAll('[data-b^="t:"]').forEach(b => b.classList.toggle('on', b.dataset.b === `t:${t}`));
    $('[data-b="more"]').classList.toggle('on', moreOpen || MORE.some(([k]) => k === t));
    moreEl.hidden = !moreOpen;
    $('[data-b="view"]').innerHTML = SVG(cam.plan ? IC.iso : IC.plan);
    $('[data-b="view"]').title = cam.plan ? '3D (V)' : 'Grundriss (V)';
    $('[data-b="undo"]').disabled = !undo.length; $('[data-b="redo"]').disabled = !redo.length;
    renderList(); renderCmd(); renderInfo(); renderDlg(); renderRibbon(); renderStatus();
  }
  function setCurrent(id, keepSel) {
    if (!st(id)) return;
    cur = id; openSt.add(id);
    if (!keepSel) sel = null;
    if (cmd) { cmd.pts = []; if (cmd.t === 'measure') { cmd.closed = false; cmd.res = null; } }
    dirty = true; renderUi(); draw();
  }
  // Auswahlknopf mit Liste: zeigt den aktuellen Wert, antippen öffnet die Liste darüber. k wie bei seg (Wahl läuft über denselben Weg)
  const DD = {};
  const dd = (k, label, val, opts, extra = '') => {
    DD[k] = { opts, val, extra, label };
    const curO = opts.find(o => String(o[0]) === String(val));
    return `<button class="bau-dd" data-ddk="${k}"${label ? ` title="${esc(label)}"` : ''}>${label ? `<span>${label}</span>` : ''}<b>${esc(curO ? curO[1] : val === '' || val == null ? 'nicht festgelegt' : val)}</b><i>▾</i></button>`;
  };
  const mmOpts = (vs, cur) => [...vs, ...(cur != null && !vs.includes(+cur) ? [+cur] : [])].sort((a, b) => b - a).map(v => [v, `${fmt(v)} mm`]);
  const profOpts = () => Object.keys(STEEL).map(n => [n, n]);
  const OP_SIZES = { door: [[885, 2135], [1010, 2135], [1135, 2135], [1260, 2135], [1760, 2135], [2010, 2135]], window: [[885, 1385], [1010, 1385], [1260, 1385], [1760, 1385], [2010, 1385], [2510, 1385], [1010, 2135], [2010, 2135]], opening: [[150, 150], [200, 200], [300, 300], [400, 400], [600, 400], [1000, 500]], hole: [[200, 200], [300, 300], [600, 400], [1000, 600], [1200, 1200]] };
  function renderCmd() {
    cmdEl.hidden = !cmd;
    if (!cmd) { cmdEl.innerHTML = ''; return; }
    if (cmd.mid) { cmdEl.innerHTML = `<span class="bprompt">Mitte zwischen zwei Punkten: ${cmd.mid.a ? 'zweiten' : 'ersten'} Punkt tippen</span><button data-b="midpick" class="on">Mitte aus</button>`; return; }
    const nOn = SNAP_KEYS.filter(([k]) => snapCfg[k]).length;
    const helpers = `<span class="bau-cgrp"><button data-b="ortho" class="bau-tg${orthoOn ? ' on' : ''}" title="Ortho-Modus: nur waagerecht und senkrecht (F8)">Ortho</button><button data-b="midpick" class="bau-tg" title="Punkt in der Mitte zwischen zwei Punkten">Mitte</button><button class="bau-dd" data-ddk="snap" title="Fang-Einstellungen"><span>Fang</span><b>${nOn}/${SNAP_KEYS.length}</b><i>▾</i></button></span>`;
    const done = '<button data-b="end" class="on">Fertig</button>', cancel = '<button data-b="end">Abbrechen</button>', c = cmd;
    const close = c.pts.length >= 3 ? '<button data-b="areaok" class="on">Schließen</button>' : '';
    const P = t => `<span class="bprompt">${t}</span>`, G = (...x) => `<span class="bau-cgrp">${x.join('')}</span>`;
    let h = '';
    switch (c.t) {
      case 'wall':
        h = P(c.pts.length ? 'Nächster Punkt' : 'Wand: Startpunkt tippen') + G(dd('wtype', 'Typ', c.typeId || '', typeOpts('wall', false)), dd('wth', 'Dicke', c.th, mmOpts(WALL_PRESETS, c.th), `<div class="bau-ddx">${fld('th', c.th, 'Andere Dicke')}</div>`), dd('just', 'Lage', c.just, [['l', 'Links der Achse'], ['c', 'Mittig'], ['r', 'Rechts der Achse']]));
        if (c.pts.length) h += G(fld('len', c.len ?? '', 'Länge', 'mm', '0'), `<span class="ped-seg">${c.lastDir ? '<button data-dir="last" title="In Richtung der letzten Wand">↗︎</button>' : ''}${[['1,0', '→'], ['0,1', '↑'], ['-1,0', '←'], ['0,-1', '↓']].map(([v, t]) => `<button data-dir="${v}" title="Länge in diese Richtung">${t}</button>`).join('')}</span>`) + '<button data-b="chain">Neu ansetzen</button>';
        h += helpers + done; break;
      case 'column': {
        const sizes = c.shape === 'round' ? [['r250', 'Ø 250'], ['r300', 'Ø 300'], ['r400', 'Ø 400'], ['r500', 'Ø 500']] : [['240x240', '240 × 240'], ['300x300', '300 × 300'], ['400x400', '400 × 400'], ['500x500', '500 × 500'], ['300x500', '300 × 500']];
        const cur2 = c.shape === 'round' ? `r${c.w}` : `${c.w}x${c.d}`;
        h = P('Stütze: Punkt tippen') + G(dd('shape', 'Art', c.shape, [['rect', 'Eckig'], ['round', 'Rund'], ['steel', 'Stahl']]),
          c.shape === 'steel' ? dd('cprofdd', 'Profil', c.prof, profOpts()) : dd('cdim', 'Maß', sizes.some(x => x[0] === cur2) ? cur2 : cur2, sizes.some(x => x[0] === cur2) ? sizes : [...sizes, [cur2, c.shape === 'round' ? `Ø ${c.w}` : `${c.w} × ${c.d}`]], `<div class="bau-ddx">${fld('w', c.w, c.shape === 'round' ? 'Ø' : 'Breite')}${c.shape === 'round' ? '' : fld('d', c.d, 'Tiefe')}</div>`),
          dd('calign', 'In der Wand', c.align || 'c', [['l', 'Bündig links'], ['c', 'Mittig'], ['r', 'Bündig rechts']]))
          + (B.grids.length ? '<button data-b="colgrid">Auf alle Achsschnitte</button>' : '') + helpers + done; break;
      }
      case 'beam': {
        const sizes = [['240x400', '240 × 400'], ['300x500', '300 × 500'], ['400x600', '400 × 600'], ['400x800', '400 × 800']], cur2 = `${c.w}x${c.bh}`;
        h = P(c.pts.length ? 'Ende tippen' : 'Träger: Anfang tippen') + G(dd('bshape', 'Art', c.shape, [['rect', 'Unterzug'], ['steel', 'Stahlträger']]),
          c.shape === 'steel' ? dd('bprofdd', 'Profil', c.prof, profOpts()) : dd('bdim', 'Maß', cur2, sizes.some(x => x[0] === cur2) ? sizes : [...sizes, [cur2, `${c.w} × ${c.bh}`]], `<div class="bau-ddx">${fld('bw', c.w, 'Breite')}${fld('bh', c.bh, 'Höhe')}</div>`), fld('btop', c.top, 'OK')) + helpers + done; break;
      }
      case 'slab':
        h = P(c.pts.length ? `${c.pts.length} Punkte · Startpunkt schließt` : `${c.base ? 'Bodenplatte' : 'Decke'}: Umriss tippen`) + G(dd('skind', 'Art', c.base ? 'base' : 'slab', [['slab', 'Decke'], ['base', 'Bodenplatte']]), dd('sth', 'Dicke', c.th, mmOpts([160, 180, 200, 220, 250, 300, 350, 400], c.th), `<div class="bau-ddx">${fld('th', c.th, 'Andere Dicke')}</div>`)) + `<button data-b="fromwalls">Aus Wänden</button>${close}${helpers}${cancel}`; break;
      case 'roof':
        h = P(c.pts.length ? `${c.pts.length} Punkte · Startpunkt schließt` : 'Dach: Umriss tippen') + G(dd('rkind', 'Art', c.kind, [['flat', 'Flachdach'], ['pitched', 'Geneigt']]), dd('sth', 'Dicke', c.th, mmOpts([200, 250, 300, 350], c.th), `<div class="bau-ddx">${fld('th', c.th, 'Andere Dicke')}</div>`), fld('rbase', c.base, 'Traufe')) + `<button data-b="fromwalls">Aus Wänden</button>${close}${helpers}${cancel}`; break;
      case 'stair':
        h = P(c.pts.length ? 'Laufrichtung tippen' : 'Treppe: Antritt tippen (Mitte der ersten Stufe)') + G(dd('stkind', 'Form', c.kind, [['straight', 'Gerade'], ['u', 'Zweiläufig mit Podest']]), dd('stwdd', 'Breite', c.w, mmOpts([900, 1000, 1100, 1200, 1250], c.w), `<div class="bau-ddx">${fld('stw', c.w, 'Andere Breite')}</div>`), c.kind === 'u' ? dd('stside', 'Wende', String(c.side), [['1', 'Links herum'], ['-1', 'Rechts herum']]) : '') + done; break;
      case 'ceil':
        h = P(c.mode === 'room' ? 'In einen Raum tippen' : c.pts.length ? `${c.pts.length} Punkte` : 'Umriss tippen') + G(dd('cmode', 'Fläche', c.mode, [['room', 'Ganzer Raum'], ['poly', 'Umriss zeichnen']]), dd('cgdd', 'Platten', `${c.gx}x${c.gy}`, TILE_PRESETS.map(([a, b2]) => [`${a}x${b2}`, `${a} × ${b2}`])), fld('cz', c.z, 'UK')) + `${c.mode === 'poly' ? close : ''}${done}`; break;
      case 'space': h = P('Raum: in einen von Wänden umschlossenen Bereich tippen') + done; break;
      case 'shaft': h = P(c.pts.length ? 'Gegenüberliegende Ecke' : 'Schacht: erste Ecke tippen') + G(dd('shtodd', 'Bis', c.to, [...sorted()].filter(s => s.elev >= curSt().elev).reverse().map(s => [s.id, s.name]))) + done; break;
      case 'open': {
        const v = c[c.kind], sz = OP_SIZES[c.kind], cur2 = `${v.w}x${c.kind === 'hole' ? v.d : v.h}`;
        h = P(c.kind === 'hole' ? 'Auf eine Decke tippen' : 'Auf eine Wand tippen') + G(dd('okind', 'Art', c.kind, [['door', 'Tür'], ['window', 'Fenster'], ['opening', 'Wanddurchbruch'], ['hole', 'Deckendurchbruch']]),
          dd('osize', 'Größe', cur2, sz.some(([a, b2]) => `${a}x${b2}` === cur2) ? sz.map(([a, b2]) => [`${a}x${b2}`, `${a} × ${b2}`]) : [...sz.map(([a, b2]) => [`${a}x${b2}`, `${a} × ${b2}`]), [cur2, `${v.w} × ${c.kind === 'hole' ? v.d : v.h}`]], `<div class="bau-ddx">${fld('ow', v.w, 'Breite')}${c.kind === 'hole' ? fld('od', v.d, 'Tiefe') : fld('oh', v.h, 'Höhe')}</div>`),
          c.kind === 'window' || c.kind === 'opening' ? fld('osill', v.sill, c.kind === 'window' ? 'Brüstung' : 'UK') : '') + done; break;
      }
      case 'grid': {
        const base = c.base && B.grids.find(g => g.id === c.base), ref = base && (B.grids.find(g => g.id === c.ref) || base);
        if (base) {
          const f = famOf(ref), arrow = !f ? '' : f.vert ? (c.side < 0 ? '←' : '→') : Math.abs(f.d[0]) > 0.99 ? (c.side < 0 ? '↓' : '↑') : (c.side < 0 ? '−' : '+');
          h = P(`Parallel zu Achse ${esc(ref.name)}: Lage tippen oder Abstand eingeben`) + G(`<label class="ped-f"><span>Abstand</span><input data-gdist inputmode="text" autocomplete="off" placeholder="6000 · 3x7500"><i>mm</i></label>`, `<button data-b="gside" class="bau-tg" title="Seite wechseln (oder Minus tippen)">Seite ${arrow}</button>`) + '<button data-b="gnew">Neue Richtung</button>';
        } else h = P(c.pts.length ? 'Endpunkt der Achse' : 'Achse: zwei Punkte tippen, z. B. auf einer Achslinie im Plan') + '<button data-dlg="grid">Raster erzeugen …</button>';
        h += helpers + done; break;
      }
      case 'measure': h = G(dd('mmode', 'Messen', c.mode, [['dist', 'Abstand'], ['chain', 'Kette'], ['area', 'Fläche'], ['pick', 'Bauteil antippen']])) + `<span class="bprompt bau-mres">${esc(measRes())}</span>${c.pts.length || c.res ? '<button data-b="mclear">Neu</button>' : ''}${c.mode === 'pick' ? '' : helpers}${done}`; break;
      case 'move': case 'copy': h = P(c.pts.length ? 'Zielpunkt tippen oder Abstand eintippen' : `${selIds().length} Bauteil${selIds().length > 1 ? 'e' : ''} ${c.t === 'move' ? 'verschieben' : 'kopieren'}: Basispunkt tippen`) + (c.t === 'copy' ? fld('cn', c.n, 'Anzahl', 'Stk') : '') + helpers + cancel; break;
      case 'split': h = P('Teilungspunkt auf der Wand tippen') + cancel; break;
      case 'tiles': h = P('Platten antippen: herausnehmen oder wieder einsetzen') + done; break;
      case 'gstart': h = P('Ecke der Rasterdecke antippen, von der das Raster beginnt') + cancel; break;
      case 'cal': h = P(c.pts.length < 2 ? `Kalibrieren: ${c.pts.length ? 'zweiten' : 'ersten'} Punkt auf dem Plan tippen` : 'Echter Abstand') + (c.pts.length === 2 ? `${fld('real', c.real, 'Abstand')}<button data-b="calok" class="on">Übernehmen</button>` : '') + `<span class="bau-cgrp"><button data-b="ortho" class="bau-tg${orthoOn ? ' on' : ''}" title="Zweiter Punkt nur waagerecht oder senkrecht zum ersten (F8)">Ortho</button><button data-b="ualign" title="Plan drehen, bis eine Linie gerade liegt">Plan ausrichten</button></span>` + cancel; break;
      case 'ualign': h = P(c.pts.length ? 'Zweiten Punkt auf derselben Linie tippen' : 'Plan ausrichten: zwei Punkte auf einer Linie tippen, die waagerecht oder senkrecht liegen soll') + cancel; break;
      case 'umove': h = P(c.pts.length ? 'Zielpunkt tippen (fängt an Achsen und Wänden)' : 'Unterlage verschieben: Punkt auf dem Plan tippen') + cancel; break;
    }
    cmdEl.innerHTML = h;
    if (ddPop.dataset.k) openDD(ddPop.dataset.k, true);
  }
  // Liste eines Auswahlknopfs bzw. das Fang-Menü öffnen (über dem Knopf)
  function openDD(k, keep) {
    const btn = root.querySelector(`[data-ddk="${k}"]`);
    if (!btn) { ddPop.hidden = true; delete ddPop.dataset.k; return; }
    if (!keep && ddPop.dataset.k === k && !ddPop.hidden) { ddPop.hidden = true; delete ddPop.dataset.k; return; }
    let h = '';
    if (k === 'snap') h = `<div class="bau-ddh">Fang</div>${SNAP_KEYS.map(([sk, n]) => `<button class="bau-sw${snapCfg[sk] ? ' on' : ''}" data-snapk="${sk}"><i></i><span><b>${n}</b><small>${SNAP_HELP[sk]}</small></span></button>`).join('')}<p class="bau-ddhint">Shift gedrückt (Mac): ohne Fang. F8: Ortho an/aus.</p>`;
    else { const d = DD[k]; h = `${d.label ? `<div class="bau-ddh">${d.label}</div>` : ''}${d.opts.map(([v, t]) => `<button class="bau-ddo${String(v) === String(d.val) ? ' on' : ''}" data-ddv="${k}:${v}">${esc(t)}</button>`).join('')}${d.extra}`; }
    ddPop.innerHTML = h; ddPop.dataset.k = k; ddPop.hidden = false;
    const rr = root.getBoundingClientRect(), br = btn.getBoundingClientRect(), pw = Math.min(300, rr.width - 16);
    ddPop.style.width = `${k === 'snap' ? pw : Math.max(br.width, 240)}px`;
    ddPop.style.left = `${Math.max(8, Math.min(rr.width - (k === 'snap' ? pw : Math.max(br.width, 240)) - 8, br.left - rr.left))}px`;
    if (br.top - rr.top < rr.height * 0.45) { // Knopf oben (Optionsleiste am Desktop): Liste nach unten öffnen
      ddPop.style.top = `${br.bottom - rr.top + 6}px`; ddPop.style.bottom = 'auto'; ddPop.style.maxHeight = `${Math.max(160, rr.bottom - br.bottom - 50)}px`;
    } else {
      ddPop.style.bottom = `${rr.bottom - br.top + 6}px`; ddPop.style.top = 'auto';
      ddPop.style.maxHeight = `${Math.max(160, br.top - rr.top - 70)}px`;
    }
  }
  const closeDD = () => { ddPop.hidden = true; delete ddPop.dataset.k; };
  const acts = (extra = '') => `<div class="ped-acts"><button data-b="xmove">Verschieben</button><button data-b="xcopy">Kopieren</button>${extra}<button data-b="addsel"${addMode ? ' class="on"' : ''}>+ Weitere</button><button data-b="hidesel" title="Ausblenden">${SVG(IC.eyeoff)}</button><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
  // Geschoss in der Palette: Name, Höhe der Oberkante Rohdecke, Geschosshöhe; Geschosse anfügen
  const storeyForm = sc => `<div class="ped-grid"><label class="ped-f bau-wname"><span>Name</span><input data-stf="name" value="${esc(sc.name)}" class="bau-short"></label>${fld('stelev', sc.elev, 'OK Rohdecke')}${fld('stheight', sc.height, 'Höhe')}</div>
    <div class="ped-acts"><button data-b="stup">+ Geschoss oben</button><button data-b="stdown">+ unten (Keller)</button><button data-b="stcopy">Kopie oben</button>${B.storeys.length > 1 ? '<button data-b="stdel">Löschen</button>' : ''}</div>`;
  // Planunterlage in der Palette: Deckkraft, Drehung, Kalibrieren, Ausrichten, Verschieben, Entfernen
  const ulForm = () => {
    const u = curUl();
    return u ? `<small>${esc(u.name || 'Bild')} · 1 Bildpunkt = ${fmt(u.s)} mm</small><label class="ped-f bau-range"><span>Deckkraft</span><input type="range" data-ualpha min="0.1" max="1" step="0.05" value="${u.alpha ?? 0.55}"></label><div class="ped-grid">${fld('urot', u.rot || 0, 'Drehung', '°')}</div>
      <div class="ped-acts"><button data-b="cal">Kalibrieren</button><button data-b="ualign">Ausrichten</button><button data-b="umove">Verschieben</button><button data-b="uload">Andere laden</button><button data-b="udel">Entfernen</button></div>`
      : '<small>Architektenplan als Bild oder PDF unterlegen, mit zwei Punkten kalibrieren, nachzeichnen. Jedes Geschoss hat seine eigene Unterlage.</small><div class="ped-acts"><button data-b="uload" class="on">Bild oder PDF laden</button></div>';
  };
  // Einklappbare Abschnitte der Eigenschaften-Palette (Zustand wird gemerkt)
  const secOpen = (k, def) => { try { const v = localStorage.getItem(`biege.bau.sec.${k}`); return v == null ? def : v === '1'; } catch { return def; } };
  const sec = (k, title, body, def = false) => `<details class="bau-sec" data-sec="${k}"${secOpen(k, def) ? ' open' : ''}><summary>${title}</summary><div class="bau-secb">${body}</div></details>`;
  const IFC_CLASS = { wall: 'IfcWall', column: 'IfcColumn', beam: 'IfcBeam', slab: 'IfcSlab', roof: 'IfcSlab (Dach)', ceil: 'IfcCovering', space: 'IfcSpace', shaft: 'IfcSpace', stair: 'IfcStair', door: 'IfcDoor', window: 'IfcWindow', opening: 'IfcOpeningElement', hole: 'IfcOpeningElement' };
  const rows = L => `<table class="bau-tb">${L.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`;
  function secsHtml(e, g) {
    if (g) return '';
    if (!e) return '';
    const s0 = st(e.storey), host = e.host && elById(e.host), pts = e.type === 'column' ? [e.p] : e.a && e.b ? [e.a, e.b] : [];
    const onG = B.grids.filter(gr => pts.some(q => onGrid(q, gr)));
    const bez = [['Geschoss', esc(s0?.name || '–')]];
    if (host) bez.push([host.type === 'wall' ? 'Wand' : 'Decke', esc(elLabel(host))]);
    if (onG.length) bez.push(['Achse', `${onG.map(x => esc(x.name)).join(' / ')} · ${e.noGrid ? 'gelöst' : 'folgt'}`]);
    if (B.vis.hide.includes(e.id)) bez.push(['Sichtbarkeit', 'ausgeblendet']);
    const ty0 = typeOf(e);
    if (catOf(e)) bez.unshift(['Typ', ty0 ? esc(ty0.name) : 'Eigene Maße']);
    if (ty0?.layers) bez.splice(1, 0, ['Aufbau', esc(layerSum(ty0))]);
    const ifc = [['Klasse', IFC_CLASS[e.type] || e.type], ['Name', esc(e.type === 'wall' ? kindName(e.kind) || 'Wand' : e.name || elLabel(e))]];
    if (e.type === 'wall') ifc.push(['Art', e.kind === 'tb' ? 'PARTITIONING' : 'STANDARD']);
    const mm = elMeasure(e);
    return `<div class="bau-secs">${catOf(e) ? sec('typed', 'Typ bearbeiten', typeEditHtml(e)) : ''}${mm?.length ? sec('mengen', 'Mengen', rows(mm), true) : ''}${sec('bezug', 'Bezug', rows(bez))}${sec('ifc', 'IFC', rows(ifc))}</div>`;
  }
  function renderInfo() {
    const e = selEl(), g = selGrid(), n = selIds().length;
    let h = '';
    if (n > 1) {
      const cnt = {}; selIds().map(elById).filter(Boolean).forEach(x => { cnt[TYPE_NAME[x.type]] = (cnt[TYPE_NAME[x.type]] || 0) + 1; });
      const els = selIds().map(elById).filter(Boolean), ty = els.every(x => x.type === els[0].type) ? els[0].type : null, same = f => (els.every(x => (x[f] ?? null) === (els[0][f] ?? null)) ? (els[0][f] ?? null) : undefined);
      const fm = (k, v, label, unit = 'mm', ph = '') => fld(k, v, label, unit, ph || (v === undefined ? 'verschieden' : ''));
      let common = '';
      if (ty === 'wall') common = `<div class="ped-acts">${seg('mwkind', same('kind') || '', WALL_SEG)}</div><div class="ped-grid">${fm('mt', same('t'), 'Dicke')}${fm('mh', same('h'), 'Höhe', 'mm', 'Geschoss')}${fm('mbase', same('base') || 0, 'Fuß')}</div>`;
      else if (ty === 'column') common = `<div class="ped-grid">${fm('mh', same('h'), 'Höhe', 'mm', 'Geschoss')}</div>`;
      else if (ty === 'beam') common = `<div class="ped-grid">${fm('mtop', same('top'), 'OK')}</div>`;
      else if (ty === 'slab') common = `<div class="ped-grid">${fm('mt', same('t'), 'Dicke')}</div>`;
      else if (ty && WALL_OPS.includes(ty)) common = `<div class="ped-grid">${fm('mw', same('w'), 'Breite')}${fm('mhh', same('h'), 'Höhe')}${ty === 'door' ? '' : fm('msill', same('sill'), 'Brüstung')}</div>`;
      h = `<h4>${n} Bauteile</h4><small>${Object.entries(cnt).map(([k, v]) => `${v} × ${k}`).join(' · ')}${common ? ' · Werte gelten für alle' : ''}</small>${common}${acts('<button data-b="selnone">Aufheben</button>')}`;
    } else if (e) {
      const s = st(e.storey);
      switch (e.type) {
        case 'wall':
          h = `<h4>${esc(kindName(e.kind) || 'Wand')}</h4><div class="ped-grid">${fld('wl', len(sub(e.b, e.a)), 'Länge')}${fld('wt', e.t, 'Dicke')}</div>
            <div class="ped-grid">${fld('wh', e.h ?? '', 'Höhe', 'mm', fmt(autoTop(e, s) - s.elev))}${fld('wbase', e.base || 0, 'Fuß')}</div>
            <div class="ped-acts"><span class="bprompt">Lage zur Achse</span>${seg('wjust', e.just, JUST)}</div>
            <small>Länge ändert das Ende, der Anfang bleibt. Höhe leer: ${slabOver(e, s) ? `bis UK Decke ${esc(nextName(s))}` : `bis OK Rohdecke ${esc(nextName(s))}`}, jetzt ${fmt(zRange(e)[1] - zRange(e)[0])} mm.</small>${acts(`<button data-b="split">Teilen</button>${wallChain(e).length > 1 ? `<button data-b="chainsel">Wandzug (${wallChain(e).length})</button>` : ''}<button data-b="joinall">Ecken verbinden</button>`)}`; break;
        case 'column':
          h = `<h4>Stütze</h4><div class="ped-acts">${seg('cshape', e.shape, [['rect', 'Eckig'], ['round', 'Rund'], ['steel', 'Stahl']])}</div>
            <div class="ped-grid">${e.shape === 'steel' ? profSel('eprof', e.prof) : fld('cw', e.w, e.shape === 'round' ? 'Ø' : 'B') + (e.shape === 'round' ? '' : fld('cd', e.d, 'T'))}${e.shape === 'round' ? '' : fld('crot', e.rot || 0, 'Drehung', '°')}</div>
            <div class="ped-grid">${fld('ch', e.h ?? '', 'Höhe', 'mm', fmt(autoTop(e, s) - s.elev))}</div><small>Höhe leer: ${slabOver(e, s) ? `bis UK Decke ${esc(nextName(s))}` : `bis OK Rohdecke ${esc(nextName(s))}`}, jetzt ${fmt(zRange(e)[1] - zRange(e)[0])} mm.</small>${acts()}`; break;
        case 'beam': {
          const dm = beamDims(e);
          h = `<h4>${e.shape === 'steel' ? 'Stahlträger' : 'Unterzug'}</h4><div class="ped-acts">${seg('ebshape', e.shape, [['rect', 'Unterzug'], ['steel', 'Stahl']])}</div>
            <div class="ped-grid">${e.shape === 'steel' ? profSel('eprof', e.prof) + `<span class="ped-seg"><button data-b="rot90"${e.rot90 ? ' class="on"' : ''}>Liegend</button></span>` : fld('ebw', e.w, 'B') + fld('ebh', e.bh, 'H')}</div>
            <div class="ped-grid">${fld('ebl', len(sub(e.b, e.a)), 'Länge')}${fld('ebtop', e.top, 'OK')}</div>
            <small>OK über OK Rohdecke ${esc(s.name)}, UK ${fmt(e.top - dm.h)}.</small>${acts()}`; break;
        }
        case 'slab': h = `<h4>${e.base ? 'Bodenplatte' : 'Decke'}</h4><div class="ped-acts">${seg('eskind', e.base ? 'base' : 'slab', [['slab', 'Decke'], ['base', 'Bodenplatte']])}</div><div class="ped-grid">${fld('st', e.t, 'Dicke')}</div><small>${elMeasure(e)[0][1]} · Oberkante = OK Rohdecke ${esc(s.name)} (${fmt(s.elev)}).</small>${acts()}`; break;
        case 'roof': {
          const g2 = roofGeo(e), par = e.par || {};
          h = `<h4>${e.kind === 'pitched' ? 'Steildach' : 'Flachdach'}</h4><div class="ped-acts">${seg('erkind', e.kind, [['flat', 'Flach'], ['pitched', 'Geneigt']])}</div>
            <div class="ped-grid">${fld('erbase', e.base ?? s.height, 'Traufe')}${fld('ert', e.t, 'Dicke')}${fld('erover', e.over || 0, 'Überstand')}</div>`;
          h += e.kind === 'pitched' ? `<div class="ped-acts"><button data-b="roofdlg" class="on">Dachform und Kanten …</button></div><small>First ${fmt(g2.maxH)} über Traufe.</small>`
            : `<div class="ped-grid">${fld('parh', par.h || 0, 'Attika')}${fld('parw', par.w || 240, 'B')}${fld('paro', par.o || 0, 'Sims')}</div><small>Attika 0 = ohne. Sims = Überstand nach außen.</small>`;
          h += acts(); break;
        }
        case 'ceil': {
          const S = ceilStrips(e), T = ceilTiles(e);
          h = `<h4>Rasterdecke</h4><div class="ped-grid">${fld('ecz', e.z, 'UK')}</div>
            <small>Platten ${e.gx} × ${e.gy} · ${T.full.length} voll, ${T.cut.length} Zuschnitt · Ränder ${[S.l, S.r, S.u, S.o].map(v => fmt(v || 0)).join(' / ')} mm${e.start ? ` · Start an Ecke ${e.start.k + 1}` : ' · mittig'}</small>
            <div class="ped-acts"><button data-b="ceildlg" class="on">Raster einstellen …</button></div>${acts()}`; break;
        }
        case 'space':
          h = `<h4>Raum</h4><div class="ped-grid"><label class="ped-f"><span>Nr.</span><input data-txt="no" value="${esc(e.no)}" class="bau-short"></label><label class="ped-f"><span>Name</span><input data-txt="name" list="bau-rn" value="${esc(e.name)}"></label></div>
            <datalist id="bau-rn">${ROOM_NAMES.map(n2 => `<option value="${n2}">`).join('')}</datalist>
            <small>${elMeasure(e).map(([k, v]) => `${k} ${v}`).join(' · ')}</small>
            <div class="ped-acts">${B.els.some(x => x.type === 'ceil' && x.storey === e.storey && pip(...centroid(e.pts), x.pts)) ? '' : '<button data-b="roomceil">Rasterdecke hier</button>'}</div>${acts()}`; break;
        case 'shaft': {
          const [z0, z1] = shaftRange(e);
          h = `<h4>Schacht</h4><div class="ped-grid"><label class="ped-f"><span>Name</span><input data-txt="name" value="${esc(e.name || 'Schacht')}"></label>${storeySel('eshto', e.to, s)}</div><small>Von ${fmt(z0)} bis ${fmt(z1)}, ${elMeasure(e)[0][1]}. Decken dazwischen sind ausgespart.</small>${acts()}`; break;
        }
        case 'stair': {
          const g2 = stairGeo(e);
          h = `<h4>Treppe</h4><small>${e.kind === 'u' ? 'Zweiläufig mit Podest' : 'Gerade'}, ${g2.n} Steigungen à ${fmt(g2.h)} mm, Auftritt ${fmt(g2.g)}, Breite ${fmt(e.w)} · Schrittmaß ${fmt(2 * g2.h + g2.g)} mm.</small>
            <div class="ped-acts"><button data-b="stairdlg" class="on">Treppe einstellen …</button></div>${acts()}`; break;
        }
        case 'hole': h = `<h4>Deckendurchbruch</h4><div class="ped-grid">${fld('pw', e.w, 'B')}${fld('pd', e.d, 'T')}</div><small>${e.stairOf ? 'Deckenöffnung einer Treppe. ' : ''}Mitte X ${fmt(e.p[0])} · Y ${fmt(e.p[1])}. Ziehen am Quadrat verschiebt.</small><div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`; break;
        default: if (WALL_OPS.includes(e.type)) {
          const w = hostOf(e), L = w ? wallAxis(w).L : 0;
          h = `<h4>${TYPE_NAME[e.type]}</h4><div class="ped-grid">${fld('pw', e.w, 'Breite')}${fld('ph', e.h, 'Höhe')}</div>
            <div class="ped-grid">${fld('pleft', e.at - e.w / 2, 'ab Wandanfang')}${e.type === 'door' ? '' : fld('psill', e.sill || 0, e.type === 'window' ? 'Brüstung' : 'UK')}</div>
            ${e.type === 'door' ? `<div class="ped-acts">${seg('phinge', e.hinge || 'l', [['l', 'Anschlag links'], ['r', 'rechts']])}${seg('pswing', String(e.swing ?? 1), [['1', 'Aufschlag hier'], ['-1', 'drüben']])}</div>` : ''}
            ${e.type === 'window' ? `<div class="ped-acts"><button data-b="windlg" class="on">Fenster gestalten …</button></div><small>${esc(winText(e))}. In der Wand ${fmt(L)} mm, rechts bleiben ${fmt(L - e.at - e.w / 2)} mm.</small>` : `<small>In der Wand ${fmt(L)} mm, rechts bleiben ${fmt(L - e.at - e.w / 2)} mm.</small>`}
            <div class="ped-acts"><button data-b="hidesel" title="Ausblenden">${SVG(IC.eyeoff)}</button><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
        }
      }
    } else if (g) {
      const f = grpOf(g), i = f ? f.items.findIndex(it => it.g === g) : -1, pv = f?.items[i - 1], nx = f?.items[i + 1];
      const sideN = !f ? ['Anfang', 'Ende'] : Math.abs(f.d[0]) > 0.99 ? ['Links', 'Rechts'] : Math.abs(f.d[1]) > 0.99 ? ['Unten', 'Oben'] : ['Anfang', 'Ende'];
      h = `<h4>Achse ${esc(g.name)}</h4><div class="ped-grid"><label class="ped-f"><span>Name</span><input data-gname value="${esc(g.name)}" class="bau-short"></label>${dd('ghead', 'Achskopf', g.hideA && g.hideB ? 'none' : g.hideA ? 'b' : g.hideB ? 'a' : 'both', [['both', 'Beide Enden'], ['a', 'Nur Anfang'], ['b', 'Nur Ende'], ['none', 'Keiner']])}</div>
        ${pv || nx ? `<div class="ped-grid">${pv ? fld('ggprev', f.items[i].off - pv.off, `Abstand zu ${esc(pv.g.name)}`) : ''}${nx ? fld('ggnext', nx.off - f.items[i].off, `Abstand zu ${esc(nx.g.name)}`) : ''}</div><div class="ped-acts">${dd('gshift', 'Beim Verschieben', gMode, G_MODES)}${dd('gdside', 'Maßkette', f.side, [['a', sideN[0]], ['b', sideN[1]], ['both', 'Beide Seiten'], ['off', 'Aus']])}</div><small>Gruppe: ${f.items.length} Achsen (${esc(f.items[0].g.name)} bis ${esc(f.items.at(-1).g.name)}). Maßkette und Mitnahme gelten für diese Gruppe.</small>` : ''}
        <small>Länge ${fmt(len(sub(g.b, g.a)))} mm. Enden ziehen ändert die Länge, das Quadrat in der Mitte verschiebt parallel. Maßzahlen im Grundriss antippen ändert Abstände.</small>
        <div class="ped-acts">${dd('gfree', 'Bauteile auf der Achse', g.free ? 'free' : 'link', [['link', 'Folgen der Achse'], ['free', 'Bleiben stehen']])}</div>
        <div class="ped-acts"><button data-b="gpar" class="on">Parallele Achse anfügen</button><button data-b="grenum">Neu nummerieren</button><button data-b="delgrid">${SVG(IC.trash)} Löschen</button></div>`;
    }
    if (e && h && ['wall', 'column', 'beam'].includes(e.type)) {
      const on = B.grids.filter(g => (e.type === 'column' ? [e.p] : [e.a, e.b]).some(q => onGrid(q, g)));
      if (on.length) h += `<div class="ped-acts">${dd('glink', `Achse ${on.map(g => esc(g.name)).join('/')}`, e.noGrid ? '0' : '1', [['1', 'Folgt der Achse'], ['0', 'Von der Achse gelöst']])}</div>`;
    }
    if (e && h && catOf(e)) h = h.replace('</h4>', `</h4>${typeRow([e])}`);
    else if (n > 1 && h && catOf(selIds().map(elById).filter(Boolean)[0] || {})) h = h.replace('</h4>', `</h4>${typeRow(selIds().map(elById).filter(Boolean))}`);
    if (e && h) h = h.replace('<h4>', `<h4><i class="bau-dot" style="--c:${TYPE_COL[e.type] || '#999'}"></i>`);
    else if (n > 1 && h) h = h.replace('<h4>', '<h4><i class="bau-dot" style="--c:var(--accent)"></i>');
    if (h && desk) h += secsHtml(e, g);
    if (!h && desk) {
      const cnt = {}; B.els.filter(x => x.storey === cur && !OPS.includes(x.type)).forEach(x => { cnt[TYPE_NAME[x.type]] = (cnt[TYPE_NAME[x.type]] || 0) + 1; });
      const sc = curSt();
      h = `<h4>${esc(sc.name)}</h4><small>OK Rohdecke ${fmt(sc.elev)} mm · Höhe ${fmt(sc.height)} mm</small>${Object.keys(cnt).length ? `<table>${Object.entries(cnt).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`).join('')}</table>` : '<small>Noch keine Bauteile in diesem Geschoss.</small>'}<small>Nichts gewählt: Bauteil antippen, um seine Eigenschaften zu sehen, oder im Menüband einen Befehl starten.</small>${sec('geschoss', 'Geschoss', storeyForm(sc), true)}${sec('unterlage', 'Planunterlage', ulForm(), !!curUl())}`;
    }
    infoEl.hidden = desk ? false : (!h || !!dlg); infoEl.innerHTML = h;
  }

  // ---------- Projektmanager: Struktur und Layer ----------
  function elLabel(e) {
    switch (e.type) {
      case 'wall': return `${kindName(e.kind) || 'Wand'} ${fmt(e.t)}`;
      case 'column': return e.shape === 'steel' ? `Stütze ${e.prof}` : e.shape === 'round' ? `Stütze Ø ${fmt(e.w)}` : `Stütze ${fmt(e.w)} × ${fmt(e.d)}`;
      case 'beam': return e.shape === 'steel' ? `Träger ${e.prof}` : `Unterzug ${fmt(e.w)} × ${fmt(e.bh)}`;
      case 'slab': return e.base ? 'Bodenplatte' : 'Decke';
      case 'roof': return e.kind === 'pitched' ? 'Steildach' : 'Flachdach';
      case 'ceil': return `Rasterdecke ${e.gx} × ${e.gy}`;
      case 'space': return `${e.no ? `${e.no} ` : ''}${e.name || 'Raum'}`;
      case 'shaft': return e.name || 'Schacht';
      case 'stair': return e.kind === 'u' ? 'Treppe, zweiläufig' : 'Treppe, gerade';
      default: return `${TYPE_NAME[e.type]} ${fmt(e.w)} × ${fmt(e.h ?? e.d)}`;
    }
  }
  function elSub(e) {
    switch (e.type) {
      case 'wall': case 'beam': return `${fmt(len(sub(e.b, e.a)))} mm`;
      case 'slab': case 'space': case 'ceil': case 'shaft': return elMeasure(e)[0][1];
      case 'roof': return elMeasure(e)[1][1];
      case 'stair': { const g = stairGeo(e); return `${g.n} × ${fmt(g.h)} / ${fmt(g.g)}`; }
      default: return '';
    }
  }
  // Raum eines Bauteils: der Raum, in dem seine Mitte liegt (Wände, Decken, Dächer, Schächte, Öffnungen bleiben ohne Raum)
  const ROOMABLE = ['column', 'beam', 'stair', 'ceil'];
  function roomMap(sid) {
    const rooms = B.els.filter(e => e.type === 'space' && e.storey === sid), m = new Map();
    B.els.forEach(e => { if (e.storey !== sid || !ROOMABLE.includes(e.type)) return; const c = centroid(footprint(e)), r2 = rooms.find(r => pip(c[0], c[1], r.pts)); if (r2) m.set(e.id, r2.id); });
    return { rooms: rooms.sort((a, b) => String(a.no).localeCompare(String(b.no), 'de', { numeric: true })), m };
  }
  const eyeBtn = e => { const hid = B.vis.hide.includes(e.id); return `<button class="icbtn bau-eye" data-eye="${e.id}" title="${hid ? 'Einblenden' : 'Ausblenden'}" aria-label="${hid ? 'Einblenden' : 'Ausblenden'}">${SVG(hid ? IC.eyeoff : IC.eye)}</button>`; };
  const elRow = (e, d) => `<div class="bau-row${isSel(e.id) ? ' on' : ''}${shown(e) ? '' : ' off'}" style="--d:${d}"><button class="bau-rn" data-pick="${e.id}"><b>${esc(elLabel(e))}</b>${elSub(e) ? `<small>${esc(elSub(e))}</small>` : ''}</button>${eyeBtn(e)}</div>`;
  const car = (key, open) => `<button class="icbtn bau-car${open ? ' open' : ''}" data-tog="${key}" aria-label="${open ? 'Zuklappen' : 'Aufklappen'}">${SVG(IC.chev)}</button>`;
  function treeHtml() {
    return [...sorted()].reverse().map(s => {
      const open = openSt.has(s.id), all = B.els.filter(e => e.storey === s.id);
      let h = `<div class="bau-row bau-sthead${s.id === cur ? ' cur' : ''}">${car(`st:${s.id}`, open)}<button class="bau-rn" data-st="${s.id}"><b>${esc(s.name)}</b><small>OK RD ${fmt(s.elev)} · ${all.length} Bauteile</small></button></div>`;
      if (!open) return h;
      const { rooms, m } = roomMap(s.id);
      rooms.forEach(r2 => {
        const kids = all.filter(e => m.get(e.id) === r2.id), k = `rm:${r2.id}`, o = openGrp.has(k);
        h += `<div class="bau-row${isSel(r2.id) ? ' on' : ''}${shown(r2) ? '' : ' off'}" style="--d:1">${kids.length ? car(k, o) : '<i class="bau-sp"></i>'}<button class="bau-rn" data-pick="${r2.id}"><b>${esc(elLabel(r2))}</b><small>${elSub(r2)}${kids.length ? ` · ${kids.length} Bauteile` : ''}</small></button>${eyeBtn(r2)}</div>`;
        if (o) kids.forEach(e => { h += elRow(e, 2); });
      });
      const rest = all.filter(e => e.type !== 'space' && !m.has(e.id));
      [...LAYERS.flatMap(([k, name]) => (k === 'wall' ? [...WALL_KINDS.map(([wk, wn]) => [`wall:${wk}`, `${wn.replace('wand', 'wände').replace('Trockenbau', 'Trockenbauwände')}`]), ['wall:', 'Wände']] : [[k, name]]))].forEach(([k, name]) => {
        const items = rest.filter(e => (k.startsWith('wall:') ? e.type === 'wall' && (e.kind || '') === k.slice(5) : layerOf(e) === k));
        if (!items.length) return;
        const key = `g:${s.id}:${k}`, o = openGrp.has(key);
        h += `<div class="bau-row bau-grp${B.vis.off[k] ? ' off' : ''}" style="--d:1">${car(key, o)}<button class="bau-rn" data-tog="${key}"><b>${name}</b><small>${items.length}</small></button></div>`;
        if (o) items.forEach(e => { h += elRow(e, 2); });
      });
      if (!all.length) h += '<p class="ped-hint" style="--d:1">Noch keine Bauteile.</p>';
      return h;
    }).join('');
  }
  function layerHtml() {
    const cnt = k => (k === 'grid' ? B.grids.length : k === 'under' ? B.underlays.length : k === 'terrain' ? (B.terrain != null ? 1 : 0) : B.els.filter(e => layerOf(e) === k).length);
    return LAYERS.map(([k, name]) => { const off = !!B.vis.off[k]; return `<div class="bau-row${off ? ' off' : ''}"><span class="bau-rn"><b>${name}</b><small>${cnt(k)}</small></span><button class="icbtn bau-eye" data-layer="${k}" title="${off ? 'Einblenden' : 'Ausblenden'}">${SVG(off ? IC.eyeoff : IC.eye)}</button></div>`; }).join('')
      + `${B.vis.hide.length || Object.values(B.vis.off).some(Boolean) ? `<div class="ped-add"><button data-b="showall">Alles einblenden${B.vis.hide.length ? ` (${B.vis.hide.length} einzeln ausgeblendet)` : ''}</button></div>` : ''}<p class="ped-hint">Ausgeblendetes lässt sich im Bild nicht antippen und fängt nicht.</p>`;
  }
  function renderList() {
    if (!listOpen) { listEl.innerHTML = ''; return; }
    const sc = listEl.querySelector('.bau-tree')?.scrollTop || 0;
    listEl.innerHTML = `<div class="bau-tabs">${seg('tab', tab, [['tree', 'Struktur'], ['layer', 'Layer'], ['types', 'Typen']])}</div>
      <div class="bau-tree">${tab === 'tree' ? treeHtml() : tab === 'types' ? typesHtml() : layerHtml()}</div>
      <div class="bau-foot"><button data-dlg="storeys">Geschosse</button><button data-dlg="grid">Raster</button><button data-dlg="under">Unterlage</button></div>`;
    listEl.querySelector('.bau-tree').scrollTop = sc;
  }

  // ---------- Fenster (Dialoge) ----------
  // Startfenster: Geschossfolge aus Keller, Obergeschossen, Dachgeschoss
  function wizardStoreys(d) {
    const og = Math.max(0, Math.min(30, Math.round(num(d.og) || 0)));
    return [...(d.kg === '1' ? ['KG'] : []), 'EG', ...Array.from({ length: og }, (_, i) => `${i + 1}. OG`), ...(d.dg === '1' ? ['DG'] : [])];
  }
  async function switchTo(nb) {
    clearTimeout(saveT); await saveNow().catch(() => {});
    B = nb; fixB(); remember(B.id);
    undo.length = 0; redo.length = 0;
    cur = [...B.storeys].sort((a, c) => Math.abs(a.elev) - Math.abs(c.elev))[0].id;
    openSt.clear(); openSt.add(cur); openGrp.clear();
    sel = null; cmd = null; dlg = null; hover = null; dirty = true;
    await saveNow().catch(() => {});
    fitView(); renderUi(); draw();
  }
  async function createFromWizard() {
    const d = dlg, h = num(d.h) > 0 ? num(d.h) : 2750, names = wizardStoreys(d), iEG = names.indexOf('EG'), nb = newBuilding((d.name || '').trim() || 'Gebäude');
    nb.storeys = names.map((n, i) => ({ id: uid(), name: n, elev: (i - iEG) * h, height: h }));
    if (d.base === 'grid') {
      const nx = Math.max(1, Math.min(60, Math.round(num(d.gnx) || 1))), ny = Math.max(1, Math.min(60, Math.round(num(d.gny) || 1))), sx = num(d.gsx) || 6000, sy = num(d.gsy) || 6000, W2 = (nx - 1) * sx, H2 = (ny - 1) * sy, ex = 1500;
      for (let i = 0; i < nx; i++) nb.grids.push({ id: uid(), name: String(i + 1), a: [i * sx, -ex], b: [i * sx, H2 + ex] });
      for (let j = 0; j < ny; j++) nb.grids.push({ id: uid(), name: letter(j), a: [-ex, j * sy], b: [W2 + ex, j * sy] });
    }
    const L = num(d.l), Bw = num(d.b), t = d.t || 365;
    if (L > 0 && Bw > 0) {
      const R = [[0, 0], [L, 0], [L, Bw], [0, Bw]], outer = offsetPoly(R, -t / 2);
      nb.storeys.forEach((s, i) => {
        R.forEach((p, k) => nb.els.push({ id: uid(), storey: s.id, type: 'wall', a: [...p], b: [...R[(k + 1) % 4]], t, just: 'c', kind: 'aw', h: null }));
        nb.els.push({ id: uid(), storey: s.id, type: 'slab', pts: outer.map(q => q.map(v => Math.round(v * 10) / 10)), t: i === 0 ? 300 : 250, ...(i === 0 ? { base: true } : {}) });
      });
    }
    const plan = d.base === 'plan';
    await switchTo(nb);
    setPlan(true);
    env.toast(`„${nb.name}“ angelegt: ${names.join(', ')}.`);
    if (plan) openDlg('under');
  }
  function openDlg(kind, extra = {}) {
    dlg = { kind, ...extra };
    if (kind === 'new') Object.assign(dlg, { name: extra.first ? 'Gebäude' : 'Neues Gebäude', kg: '0', dg: '0', og: 1, h: 2750, base: 'free', gnx: 5, gsx: 6000, gny: 3, gsy: 6000, l: '', b: '', t: 365 }, extra);
    if (kind === 'docs') listB().then(l => { if (dlg?.kind === 'docs') { dlg.list = l; renderDlg(); } }).catch(() => {});
    if (kind === 'grid') Object.assign(dlg, { gsx: '4x6000', gsy: '2x6000' }, extra);
    moreOpen = false; stPop.hidden = true;
    renderUi();
    if (W <= 700 && !desk) requestAnimationFrame(() => { fitView(); draw(); }); // Telefon: Modell über das Fenster; breit: Einpassen (F) berücksichtigt das Fenster
  }
  function closeDlg() { dlg = null; if (cmd && ['gstart', 'tiles'].includes(cmd.t)) cmd = null; renderUi(); draw(); }
  const DLG = {
    storeys: () => ({
      title: 'Geschosse',
      body: `<table class="bau-tab"><thead><tr><th>Name</th><th>OK RD</th><th>Höhe</th><th></th></tr></thead><tbody>${[...sorted()].reverse().map(x => `<tr class="${x.id === cur ? 'on' : ''}"><td><input data-dst="name:${x.id}" value="${esc(x.name)}"></td><td><input data-dst="elev:${x.id}" inputmode="decimal" value="${raw(x.elev)}"></td><td><input data-dst="height:${x.id}" inputmode="decimal" value="${raw(x.height)}"></td><td><button class="icbtn" data-st="${x.id}" title="Zeigen" aria-label="Zeigen">${SVG(IC.chev)}</button></td></tr>`).join('')}</tbody></table>
        <div class="ped-add"><button data-b="stup">+ Geschoss oben</button><button data-b="stdown">+ unten (Keller)</button></div>
        <div class="ped-add"><button data-b="stcopy">${esc(curSt().name)} oben anfügen (Kopie)</button>${B.storeys.length > 1 ? `<button data-b="stdel">${esc(curSt().name)} löschen</button>` : ''}</div>
        <h5>Gelände</h5><div class="ped-grid"><span class="ped-seg"><button data-b="terrain"${B.terrain != null ? ' class="on"' : ''}>${B.terrain != null ? 'Gelände an' : 'Gelände aus'}</button></span>${B.terrain != null ? fld('dterrain', B.terrain, 'OK Gelände') : ''}</div>
        <p class="ped-hint">OK RD = Oberkante Rohdecke. Höhe ändern schiebt die Geschosse darüber mit. Keller: „+ unten“, dann Bodenplatte mit dem Deckenwerkzeug. Wechseln: Titel oben oder Bild auf/ab.</p>`,
    }),
    keys: () => ({
      title: 'Tastaturkürzel',
      body: `<div class="bau-keys"><h5>Befehle</h5><kbd>W</kbd><span>Wand</span><kbd>S</kbd><span>Stütze</span><kbd>T</kbd><span>Träger</span><kbd>D</kbd><span>Decke, Bodenplatte</span><kbd>O</kbd><span>Tür, Fenster, Durchbruch</span><kbd>R</kbd><span>Raum</span><kbd>G</kbd><span>Achse</span><kbd>M</kbd><span>Messen</span><kbd>Leertaste</kbd><span>letzten Befehl wiederholen</span><kbd>Esc</kbd><span>Befehl beenden, Auswahl aufheben</span>
        <h5>Zeichnen</h5><kbd>Zahl + Enter</kbd><span>Länge bzw. Abstand eintippen, Minus kehrt um</span><kbd>F8</kbd><span>Ortho an/aus</span><kbd>Shift</kbd><span>ohne Fang (gedrückt halten)</span>
        <h5>Ansicht</h5><kbd>V</kbd><span>Grundriss / 3D</span><kbd>F</kbd><span>Einpassen, mit Auswahl auf die Auswahl</span><kbd>Bild ↑ ↓</kbd><span>Geschoss wechseln</span><kbd>Rechtsklick</kbd><span>Kontextmenü, Ziehen mit rechter Taste verschiebt</span><kbd>Doppelklick</kbd><span>Bauteil heranzoomen, Wand: ganzer Wandzug</span>
        <h5>Bearbeiten</h5><kbd>Entf</kbd><span>Auswahl löschen</span><kbd>⌘ Z / ⇧ ⌘ Z</kbd><span>Rückgängig / Wiederholen</span><kbd>?</kbd><span>diese Übersicht</span></div>`,
    }),
    grid: () => ({
      title: 'Achsraster erzeugen',
      body: `<p class="ped-hint">Schnellstart ohne Plan. Ersetzt die vorhandenen Achsen. Achsen 1, 2, 3 … laufen senkrecht, A, B, C … waagerecht, Ursprung ist Achse 1/A. Abstände als Liste: „6000 6000 7500“ oder „3x6000 7500“. Mit Plan besser den Befehl Achse nehmen und auf dem Plan zeichnen.</p>
        <label class="ped-f bau-wname"><span>Abstände 1, 2, 3 … (mm)</span><input data-dtxt="gsx" value="${esc(dlg.gsx)}" autocomplete="off"></label>
        <label class="ped-f bau-wname"><span>Abstände A, B, C … (mm)</span><input data-dtxt="gsy" value="${esc(dlg.gsy)}" autocomplete="off"></label>
        <p class="ped-hint">${(() => { const a = parseSpacing(dlg.gsx), b2 = parseSpacing(dlg.gsy); return `${a.length + (a.length ? 1 : 0)} Achsen senkrecht, ${b2.length + (b2.length ? 1 : 0)} waagerecht · ${fmt(a.reduce((x, v) => x + v, 0))} × ${fmt(b2.reduce((x, v) => x + v, 0))} mm`; })()}</p>
        <div class="ped-acts"><button data-b="gridmake" class="on">Erzeugen</button>${B.grids.length ? `<span class="bprompt">${B.grids.length} Achsen vorhanden</span>` : ''}</div>`,
    }),
    under: () => {
      const u = curUl();
      return {
        title: `Planunterlage · ${esc(curSt().name)}`,
        body: `${u ? `<p class="ped-hint">${esc(u.name || 'Bild')} · 1 Bildpunkt = ${fmt(u.s)} mm. Sichtbar im Grundriss.</p>
          <label class="ped-f bau-range"><span>Deckkraft</span><input type="range" data-ualpha min="0.1" max="1" step="0.05" value="${u.alpha ?? 0.55}"></label>
          <div class="ped-grid">${fld('urot', u.rot || 0, 'Drehung', '°')}</div>
          <div class="ped-acts"><button data-b="cal">Kalibrieren</button><button data-b="ualign">Ausrichten</button><button data-b="umove">Verschieben</button><button data-b="udel">${SVG(IC.trash)} Entfernen</button></div>`
          : '<p class="ped-hint">Architektenplan als Bild oder PDF (Seite 1) unterlegen, mit zwei Punkten kalibrieren, nachzeichnen. Jedes Geschoss hat seine eigene Unterlage.</p>'}
          <div class="ped-acts"><button data-b="uload" class="on">${u ? 'Andere Unterlage laden' : 'Bild oder PDF laden'}</button></div>`,
      };
    },
    docs: () => {
      const list = (dlg.list || []).map(x => (x.id === B.id ? B : x)), tm = t => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
      if (!list.some(x => x.id === B.id)) list.unshift(B);
      list.sort((a, c) => (c.updated || 0) - (a.updated || 0));
      return {
        title: 'Gebäude',
        body: `${list.map(x => dlg.ren === x.id
          ? `<div class="bau-row on"><input class="bau-ren" data-docname="${x.id}" value="${esc(x.name)}"></div>`
          : `<div class="bau-row${x.id === B.id ? ' on' : ''}"><button class="bau-rn" data-doc="${x.id}"><b>${esc(x.name || 'Gebäude')}</b><small>${x.storeys.length} Geschosse · ${x.els.filter(e => !OPS.includes(e.type)).length} Bauteile · ${tm(x.updated)}</small></button><button class="icbtn" data-docren="${x.id}" title="Umbenennen" aria-label="Umbenennen">${SVG(IC.pen)}</button><button class="icbtn" data-docdup="${x.id}" title="Duplizieren" aria-label="Duplizieren">${SVG(IC.copy)}</button><button class="icbtn" data-docdel="${x.id}" title="Löschen" aria-label="Löschen">${SVG(IC.trash)}</button></div>`).join('')}
          <div class="ped-acts"><button data-b="docnew" class="on">+ Neues Gebäude</button></div>
          <p class="ped-hint">Gespeichert wird automatisch bei jeder Änderung${savedAt ? `, zuletzt ${new Date(savedAt).toLocaleTimeString('de-DE')}` : ''}. Die Gebäude liegen im Browser dieses Geräts.</p>
          <h5>Datei</h5>
          <div class="ped-acts"><button data-b="export">Sichern als Datei</button><button data-b="import">Laden aus Datei</button></div>
          <p class="ped-hint">„Sichern als Datei“ lädt „${esc(B.name)}“ als JSON herunter, mit Planunterlagen: zur Sicherung oder für ein anderes Gerät. „Laden aus Datei“ legt daraus ein weiteres Gebäude an.</p>
          <div class="ped-acts"><button data-b="ifc">IFC exportieren</button><button data-b="png">Ansicht als Bild</button></div>`,
      };
    },
    new: () => {
      const d = dlg, seg2 = (k, opts) => seg(`nw.${k}`, d[k], opts);
      const names = wizardStoreys(d);
      return {
        title: d.first ? 'Neues Gebäude anlegen' : 'Neues Gebäude',
        body: `<label class="ped-f bau-wname"><span>Name</span><input data-dtxt="name" value="${esc(d.name)}"></label>
          <h5>Geschosse</h5>
          <div class="ped-grid bau-wrow"><span class="bprompt">Keller</span>${seg2('kg', [['0', 'Nein'], ['1', 'Ja']])}</div>
          <div class="ped-grid bau-wrow"><span class="bprompt">Dachgeschoss</span>${seg2('dg', [['0', 'Nein'], ['1', 'Ja']])}</div>
          <div class="ped-grid">${fld('nog', d.og, 'Obergeschosse', 'Stk')}${fld('nh', d.h, 'Geschosshöhe')}</div>
          <p class="ped-hint">${names.join(' · ')}</p>
          <h5>Grundlage</h5>
          <div class="ped-acts">${seg2('base', [['free', 'Frei zeichnen'], ['grid', 'Achsraster'], ['plan', 'Plan laden']])}</div>
          ${d.base === 'grid' ? `<div class="ped-grid">${fld('ngnx', d.gnx, 'Achsen 1…', 'Stk')}${fld('ngsx', d.gsx, 'Abstand')}</div><div class="ped-grid">${fld('ngny', d.gny, 'Achsen A…', 'Stk')}${fld('ngsy', d.gsy, 'Abstand')}</div>` : ''}
          ${d.base === 'plan' ? '<p class="ped-hint">Nach dem Anlegen öffnet sich das Fenster für die Planunterlage: Bild oder PDF laden, dann mit zwei Punkten kalibrieren.</p>' : ''}
          <h5>Umriss (optional)</h5>
          <div class="ped-grid">${fld('nl', d.l, 'Länge', 'mm', 'leer')}${fld('nb', d.b, 'Breite', 'mm', 'leer')}</div>
          <div class="ped-grid"><span class="bprompt">Wand</span><span class="ped-seg">${WALL_PRESETS.map(v => `<button data-nwt="${v}"${d.t === v ? ' class="on"' : ''}>${v}</button>`).join('')}</span></div>
          <p class="ped-hint">Mit Länge und Breite entstehen in jedem Geschoss die Außenwände, unten die Bodenplatte, darüber die Decken. Leer lassen: im Grundriss frei zeichnen.</p>
          <div class="ped-acts"><button data-b="nwmake" class="on">Anlegen</button>${d.first ? '' : '<button data-b="dlgclose">Abbrechen</button>'}</div>`,
      };
    },
    ceil: () => {
      const e = elById(dlg.el);
      if (!e) return null;
      const T = ceilTiles(e), S = ceilStrips(e), mn = Math.min(e.gx, e.gy), warn = v => v > 0.5 && v < mn / 3, cell = v => `<td class="${warn(v) ? 'warn' : ''}">${v > 0.5 ? fmt(v) : 'voll'}</td>`;
      return {
        title: 'Rasterdecke einstellen',
        body: `<h5>Platten</h5><div class="ped-acts">${TILE_PRESETS.map(([a, b]) => `<button data-tile="${a}x${b}"${e.gx === a && e.gy === b ? ' class="on"' : ''}>${a} × ${b}</button>`).join('')}</div>
          <div class="ped-grid">${fld('dgx', e.gx, 'X')}${fld('dgy', e.gy, 'Y')}<button data-b="ctrot">Drehen</button></div>
          <div class="ped-grid">${fld('dcz', e.z, 'UK')}${fld('dct', e.t || 20, 'Dicke')}</div>
          <h5>Rasterstart</h5>
          <div class="ped-acts"><button data-b="gstart"${cmd?.t === 'gstart' ? ' class="on"' : ''}>${e.start ? `Ecke ${e.start.k + 1} · andere Ecke` : 'Ecke wählen'}</button><button data-b="cequal">Randstreifen gleich</button></div>
          ${e.start ? `<div class="ped-grid">${fld('drx', e.start.rx, 'Rand X')}${fld('dry', e.start.ry, 'Rand Y')}</div><p class="ped-hint">Ab Ecke ${e.start.k + 1}: so breit ist die erste, angeschnittene Platte in X und Y, danach kommen volle Platten. 0 = volle Platte direkt an der Ecke. Oder das orange Quadrat im Grundriss ziehen.</p>`
            : '<p class="ped-hint">Das Raster ist mittig verteilt (gleiche Randstreifen). Für einen festen Start eine Ecke wählen und die Randstreifen eingeben, oder das orange Quadrat im Grundriss ziehen.</p>'}
          <h5>Randstreifen</h5><table class="bau-kv"><tr><td>links</td>${cell(S.l)}<td>rechts</td>${cell(S.r)}</tr><tr><td>unten</td>${cell(S.u)}<td>oben</td>${cell(S.o)}</tr></table>
          ${[S.l, S.r, S.u, S.o].some(warn) ? '<p class="ped-hint warn">Zuschnitt schmaler als ein Drittel der Platte: schlecht zu montieren. Rasterstart verschieben oder „Randstreifen gleich“.</p>' : ''}
          <h5>Menge</h5><table class="bau-kv"><tr><td>Volle Platten</td><td>${T.full.filter(t => !t.off).length}</td><td>Zuschnitte</td><td>${T.cut.filter(t => !t.off).length}</td></tr><tr><td>Herausgenommen</td><td>${(e.off || []).length}</td><td>Fläche</td><td>${elMeasure(e)[0][1]}</td></tr></table>
          <div class="ped-acts"><button data-b="tiles"${cmd?.t === 'tiles' ? ' class="on"' : ''}>Platten herausnehmen</button></div>
          <p class="ped-hint">Randstreifen gemessen am umschließenden Rechteck des Raums; bei schrägen Wänden nur ungefähr.</p>`,
      };
    },
    roof: () => {
      const e = elById(dlg.el);
      if (!e || e.type !== 'roof') return null;
      const g = roofGeo(e);
      return {
        title: 'Dachform',
        body: `<div class="ped-acts"><button data-preset="sattel">Satteldach</button><button data-preset="pult">Pultdach</button><button data-preset="walm">Walmdach</button></div>
          <div class="bau-edges">${e.pts.map((p, i) => { const ed = e.edges?.[i] || { eave: true, pitch: 30 }; return `<div class="ped-grid"><span class="bprompt">Kante ${i + 1} · ${fmt(len(sub(e.pts[(i + 1) % e.pts.length], p)))}</span>${seg(`edge${i}`, ed.eave === false ? 'g' : 't', [['t', 'Traufe'], ['g', 'Giebel']])}${ed.eave === false ? '' : fld(`pitch${i}`, ed.pitch ?? 30, 'Neigung', '°')}</div>`; }).join('')}</div>
          <div class="ped-acts"><span class="ped-seg"><button data-b="gable"${e.gable !== false ? ' class="on"' : ''}>Giebel füllen</button></span></div>
          <p class="ped-hint">First ${fmt(g.maxH)} mm über Traufe, ${elMeasure(e)[1][1]} Dachfläche. Exakt für Umrisse ohne einspringende Ecken.</p>`,
      };
    },
    window: () => {
      const e = elById(dlg.el);
      if (!e || e.type !== 'window') return null;
      const c = winCfg(e), L = winLayout(e), sel2 = dlg.field && L.fields.find(f => `${f.row}:${f.i}` === dlg.field), same = B.els.filter(x => x.type === 'window' && x !== e && Math.abs(x.w - e.w) < 1 && Math.abs(x.h - e.h) < 1).length;
      const rowSeg = (k, v) => seg(k, v, [['0', 'aus'], ['1', 'durchgehend'], ['2', 'geteilt']]), rowVal = r2 => (!r2?.h ? '0' : r2.split ? '2' : '1');
      return {
        title: 'Fenster gestalten',
        body: `<h5>Vorlage</h5><div class="ped-acts">${WIN_TPL.map(([k, n]) => `<button data-wtpl="${k}">${n}</button>`).join('')}${(B.winTpl || []).map((t, i) => `<button data-wtplc="${i}">★ ${esc(t.name)}</button>`).join('')}</div>
          <h5>Maße</h5><div class="ped-grid bau-g3">${fld('dww', e.w, 'Breite')}${fld('dwh', e.h, 'Höhe')}${fld('dwsill', e.sill || 0, 'Brüstung')}</div>
          <div class="bau-win">${winSvg(e, dlg.field)}</div>
          <div class="bau-wfield">${sel2 ? `<span class="bprompt">${sel2.row === 'main' ? `Feld ${sel2.i + 1}` : sel2.row === 'top' ? 'Oberlicht' : 'Unterlicht'}${sel2.row !== 'main' && L.rows.find(x => x.key === sel2.row)?.split ? ` ${sel2.i + 1}` : ''}: Öffnungsart</span><div class="bau-wops">${WOPS.map(([k, n]) => `<button data-wop="${k}"${sel2.op === k ? ' class="on"' : ''}>${n}</button>`).join('')}</div>` : '<p class="ped-hint">Ein Feld in der Zeichnung antippen, um seine Öffnungsart zu wählen.</p>'}</div>
          <h5>Teilung</h5>
          <div class="ped-grid"><span class="bprompt">Felder nebeneinander</span><span class="bau-step"><button data-b="wcolm">−</button><b>${c.cols.length}</b><button data-b="wcolp">+</button></span></div>
          <div class="ped-grid bau-g3">${c.cols.map((v, i) => fld(`dwc${i}`, v > 0 ? v : '', `Feld ${i + 1}`, 'mm', fmt(L.ws[i]))).join('')}</div>
          <p class="ped-hint">Leere Felder teilen sich den Rest der Breite.</p>
          <div class="ped-grid"><span class="bprompt">Oberlicht</span>${rowSeg('dwtop', rowVal(c.top))}</div>${c.top?.h ? `<div class="ped-grid">${fld('dwth', c.top.h, 'Höhe Oberlicht')}</div>` : ''}
          <div class="ped-grid"><span class="bprompt">Unterlicht</span>${rowSeg('dwbot', rowVal(c.bot))}</div>${c.bot?.h ? `<div class="ped-grid">${fld('dwbh', c.bot.h, 'Höhe Unterlicht')}</div>` : ''}
          <h5>Rahmen</h5><div class="ped-grid">${fld('dwf', c.frame ?? 70, 'Rahmen')}${fld('dwm', c.mull ?? 90, 'Pfosten')}</div>
          <h5>Übertragen</h5>
          <div class="ped-acts">${same ? `<button data-b="wsame">Auf ${same} gleich große Fenster</button>` : ''}<button data-b="wsave">Als Vorlage speichern</button></div>`,
      };
    },
    stair: () => {
      const e = elById(dlg.el);
      if (!e || e.type !== 'stair') return null;
      const g = stairGeo(e), sm = 2 * g.h + g.g;
      return {
        title: 'Treppe',
        body: `<div class="ped-acts">${seg('dstkind', e.kind || 'straight', [['straight', 'Gerade'], ['u', 'Zweiläufig mit Podest']])}</div>
          <div class="ped-grid">${fld('dsw', e.w, 'Breite')}${fld('dsn', g.n, 'Steigungen', 'Stk')}${fld('dsg', g.g, 'Auftritt')}</div>
          ${e.kind === 'u' ? `<div class="ped-grid">${seg('dstside', String(e.side || 1), [['1', 'Wende links'], ['-1', 'rechts']])}${fld('dsgap', e.gap ?? 100, 'Treppenauge')}</div>` : ''}
          <table class="bau-kv"><tr><td>Höhe</td><td>${fmt(g.H)}</td><td>Steigung</td><td>${fmt(g.h)}</td></tr><tr><td>Schrittmaß 2s+a</td><td class="${sm < 590 || sm > 650 ? 'warn' : ''}">${fmt(sm)}</td><td>Lauflänge</td><td>${fmt(g.L)}</td></tr></table>
          <p class="ped-hint">Bequem: Schrittmaß 590–650 mm, Steigung um 175 mm. Höhe bis OK Rohdecke ${esc(nextName(st(e.storey)))}.</p>
          <div class="ped-acts"><button data-b="stflip">Richtung umkehren</button><button data-b="sthole">Deckenöffnung neu</button></div>`,
      };
    },
  };
  // Vorschau des Fensters als Zeichnung: Felder antippbar, Öffnungszeichen, Maße
  function winSvg(e, selKey) {
    const L = winLayout(e), sc = Math.min(300 / L.W, 230 / L.Hh), w = L.W * sc, h = L.Hh * sc, px = 14, py = 10, X = x => px + x * sc, Y = z => py + h - z * sc;
    let s2 = `<svg viewBox="0 0 ${w + px * 2 + 46} ${h + py * 2 + 26}" class="bau-winsvg" role="img" aria-label="Fensterteilung">`;
    s2 += `<rect class="wf-frame" x="${X(0)}" y="${Y(L.Hh)}" width="${w}" height="${h}" rx="2"/>`;
    L.bars.forEach(b => { s2 += `<rect class="wf-bar" x="${X(b.x0)}" y="${Y(b.z1)}" width="${(b.x1 - b.x0) * sc}" height="${(b.z1 - b.z0) * sc}"/>`; });
    L.fields.forEach(f => {
      const g = f.g, key = `${f.row}:${f.i}`, x0 = X(g.x0), x1 = X(g.x1), y0 = Y(g.z1), y1 = Y(g.z0);
      s2 += `<g data-wf="${key}" class="wf-field${key === selKey ? ' on' : ''}"><rect class="wf-glass" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
      wopLines(f.op, g).forEach(([a, b]) => { s2 += `<line class="wf-op" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}"/>`; });
      s2 += `<text class="wf-t" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 + 4}">${WOPS.find(o => o[0] === f.op)?.[2] || 'F'}</text></g>`;
    });
    L.ws.forEach((cw, i) => { s2 += `<text class="wf-d" x="${X(L.xs[i] + cw / 2)}" y="${py + h + 18}">${fmt(cw)}</text>`; });
    L.rows.forEach(rw => { s2 += `<text class="wf-d" x="${px + w + 6}" y="${(Y(rw.z0) + Y(rw.z1)) / 2 + 4}" text-anchor="start">${fmt(rw.z1 - rw.z0)}</text>`; });
    return `${s2}</svg>`;
  }
  // Änderungen am Fensteraufbau: Kopie der Einstellungen anlegen, Felder an die Spaltenzahl anpassen
  function winEdit(e, fn) {
    change(() => {
      e.cfg = structuredClone(winCfg(e));
      fn(e.cfg, e);
      const n = e.cfg.cols.length;
      e.cfg.ops ||= {}; for (const k of ['main', 'top', 'bot']) { const a = e.cfg.ops[k] || []; e.cfg.ops[k] = Array.from({ length: n }, (_, i) => a[i] || (k === 'main' ? 'f' : k === 'top' ? 'k' : 'f')); }
    });
  }
  function winApplyTpl(e, size, cfg) {
    const w = hostOf(e), Lw = w ? wallAxis(w).L : e.w;
    change(() => {
      if (size) { e.w = Math.min(size.w, Lw); e.h = size.h; e.sill = size.sill; e.at = Math.max(e.w / 2, Math.min(Lw - e.w / 2, e.at)); }
      e.cfg = { ...winDefault(e.w), ...structuredClone(cfg), frame: cfg.frame ?? 70, mull: cfg.mull ?? 90 };
      e.cfg.ops = { main: [], top: ['k'], bot: ['f'], ...structuredClone(cfg.ops || {}) };
      if (!cfg.top) e.cfg.top = null; if (!cfg.bot) e.cfg.bot = null;
    });
    dlg.field = null;
  }
  function renderDlg() {
    const d = dlg && DLG[dlg.kind]?.();
    if (dlg && !d) dlg = null;
    infoEl.querySelector('.bau-dock')?.remove();
    // Desktop: Bauteil-Editoren (Fenster, Dach, Treppe, Rasterdecke) stehen in der Eigenschaften-Palette, gebunden an die Auswahl
    if (d && desk && DLG_TYPE[dlg.kind]) {
      dlgEl.hidden = true; dlgEl.innerHTML = '';
      const host = document.createElement('div'); host.className = 'bau-dlg bau-dock';
      host.innerHTML = `<div class="bau-dlg-head"><b>${d.title}</b><button class="icbtn" data-b="dlgclose" title="Schließen" aria-label="Schließen">${SVG(IC.x)}</button></div><div class="bau-dlg-body">${d.body}</div>`;
      const secs = infoEl.querySelector('.bau-secs'); if (secs) secs.before(host); else infoEl.appendChild(host);
      return;
    }
    dlgEl.hidden = !d;
    if (!d) { dlgEl.innerHTML = ''; return; }
    const sc = dlgEl.querySelector('.bau-dlg-body')?.scrollTop || 0;
    dlgEl.innerHTML = `<div class="bau-dlg-head"><b>${d.title}</b><button class="icbtn" data-b="dlgclose" title="Schließen" aria-label="Schließen">${SVG(IC.x)}</button></div><div class="bau-dlg-body">${d.body}</div>`;
    dlgEl.querySelector('.bau-dlg-body').scrollTop = sc;
  }
  function dlgChange(el) {
    const k = el.dataset.f, v = num(el.value), fin = Number.isFinite(v), pos = fin && v > 0;
    if (el.dataset.dtxt && dlg?.kind === 'new') { dlg[el.dataset.dtxt] = el.value; return; }
    if (el.dataset.dtxt && dlg?.kind === 'grid') { dlg[el.dataset.dtxt] = el.value; renderDlg(); return; }
    if (el.dataset.docname) {
      const id = el.dataset.docname, name = el.value.trim();
      dlg.ren = null;
      if (name) {
        if (id === B.id) change(() => { B.name = name; });
        else loadB(id).then(x => { if (x) { x.name = name; return saveB(x); } }).then(() => listB()).then(l => { if (dlg?.kind === 'docs') { dlg.list = l; renderDlg(); } });
      }
      renderDlg(); return;
    }
    if (dlg?.kind === 'window' && k) {
      const e = elById(dlg.el);
      if (!e) return;
      const w = hostOf(e), Lw = w ? wallAxis(w).L : e.w, blank = el.value.trim() === '';
      if (k === 'dww' && pos) { change(() => { e.w = Math.min(v, Lw); e.at = Math.max(e.w / 2, Math.min(Lw - e.w / 2, e.at)); }); return; }
      if (k === 'dwh' && pos) { change(() => { e.h = v; }); return; }
      if (k === 'dwsill' && fin && v >= 0) { change(() => { e.sill = v; }); return; }
      if (/^dwc\d+$/.test(k)) { const i = +k.slice(3); winEdit(e, c => { c.cols[i] = blank ? null : pos ? v : c.cols[i]; }); return; }
      if (k === 'dwth' && pos) { winEdit(e, c => { if (c.top) c.top.h = v; }); return; }
      if (k === 'dwbh' && pos) { winEdit(e, c => { if (c.bot) c.bot.h = v; }); return; }
      if (k === 'dwf' && pos) { winEdit(e, c => { c.frame = v; }); return; }
      if (k === 'dwm' && pos) { winEdit(e, c => { c.mull = v; }); return; }
      renderUi(); return;
    }
    if (dlg?.kind === 'new' && k) { const map = { nog: 'og', nh: 'h', ngnx: 'gnx', ngsx: 'gsx', ngny: 'gny', ngsy: 'gsy', nl: 'l', nb: 'b' }; if (map[k]) dlg[map[k]] = el.value.trim() === '' ? '' : v; renderDlg(); return; }
    if (el.dataset.dst) {
      const [f, id] = el.dataset.dst.split(':'), x = st(id);
      if (!x) return;
      if (f === 'name') { const t = el.value.trim(); if (t) change(() => { x.name = t; }); }
      else if (f === 'elev' && fin) change(() => { x.elev = v; });
      else if (f === 'height' && pos) change(() => { const dz = v - x.height; B.storeys.forEach(y => { if (y !== x && y.elev > x.elev + 1e-6) y.elev += dz; }); x.height = v; });
      else renderUi();
      return;
    }
    if (!k) return;
    if (dlg?.kind === 'grid') { if (pos) dlg[k] = v; renderUi(); return; }
    if (k === 'dterrain' && fin) { change(() => { B.terrain = v; }); return; }
    if (k === 'urot' && fin) { const u = curUl(); if (u) change(() => { u.rot = v; }); return; }
    const e = dlg?.el && elById(dlg.el);
    if (!e) return;
    change(() => {
      if (k === 'dgx' && pos) { e.gx = v; e.start ? setCeilStart(e, e.start.k, e.start.rx, e.start.ry) : ceilEqual(e); }
      else if (k === 'dgy' && pos) { e.gy = v; e.start ? setCeilStart(e, e.start.k, e.start.rx, e.start.ry) : ceilEqual(e); }
      else if (k === 'dcz' && pos) e.z = v;
      else if (k === 'dct' && pos) e.t = v;
      else if ((k === 'drx' || k === 'dry') && fin && v >= 0 && e.start) setCeilStart(e, e.start.k, k === 'drx' ? v : e.start.rx, k === 'dry' ? v : e.start.ry);
      else if (k.startsWith('pitch') && fin && v >= 0 && v <= 80) { const i = +k.slice(5); e.edges ||= roofPreset(e.pts, 'walm'); e.edges[i] = { ...(e.edges[i] || { eave: true }), pitch: v }; }
      else if (k === 'dsw' && pos) e.w = v;
      else if (k === 'dsn' && pos) e.n = Math.max(2, Math.round(v));
      else if (k === 'dsg' && pos) e.g = v;
      else if (k === 'dsgap' && fin && v >= 0) e.gap = v;
      if (e.type === 'stair') stairHole(e);
    });
  }

  // ---------- Bedienung ----------
  root.addEventListener('click', async e => {
    if (!ddPop.hidden && !e.target.closest('.bau-ddpop') && !e.target.closest('[data-ddk]')) closeDD();
    if (!dimEd.hidden && e.target !== cv && !e.target.closest('.bau-dimed')) closeDimEd();
    if (!ctxm.hidden && !e.target.closest('.bau-ctxm')) ctxm.hidden = true;
    const rt = e.target.closest('[data-rtab]');
    if (rt) { const v = +rt.dataset.rtab; if (e.detail > 1 && v === ribTab) ribOff = !ribOff; else { if (v === 100 && ribTab !== 100) ribPrev = ribTab; ribTab = v; if (ribOff && e.detail <= 1) ribOff = false; } try { localStorage.setItem('biege.bau.rib', String(ribTab === 100 ? ribPrev : ribTab)); localStorage.setItem('biege.bau.riboff', ribOff ? '1' : '0'); } catch {} renderRibbon(); return; }
    const wf = e.target.closest('[data-wf]');
    if (wf && dlg?.kind === 'window') { dlg.field = dlg.field === wf.dataset.wf ? null : wf.dataset.wf; renderDlg(); return; }
    const b = e.target.closest('button');
    if (!b) return;
    const we = dlg?.kind === 'window' && elById(dlg.el);
    if (we) {
      if (b.dataset.wtpl) { const t = WIN_TPL.find(x => x[0] === b.dataset.wtpl); winApplyTpl(we, t[2], t[3]); return; }
      if (b.dataset.wtplc) { const t = B.winTpl[+b.dataset.wtplc]; winApplyTpl(we, { w: t.w, h: t.h, sill: t.sill }, t.cfg); return; }
      if (b.dataset.wop && dlg.field) { const [row, i] = dlg.field.split(':'); winEdit(we, c => { c.ops[row] ||= []; c.ops[row][+i] = b.dataset.wop; }); return; }
      if (b.dataset.b === 'wcolp' || b.dataset.b === 'wcolm') { winEdit(we, c => { if (b.dataset.b === 'wcolp') { if (c.cols.length < 6) c.cols.push(null); } else if (c.cols.length > 1) c.cols.pop(); }); dlg.field = null; return; }
      if (b.dataset.b === 'wsame') { const cfg = structuredClone(winCfg(we)), list = B.els.filter(x => x.type === 'window' && x !== we && Math.abs(x.w - we.w) < 1 && Math.abs(x.h - we.h) < 1); change(() => list.forEach(x => { x.cfg = structuredClone(cfg); })); env.toast(`Teilung auf ${list.length} Fenster übertragen.`); return; }
      if (b.dataset.b === 'wsave') { const name = `${fmt(we.w)} × ${fmt(we.h)} ${winText(we).split(' · ')[0]}`; change(() => { B.winTpl = [...(B.winTpl || []), { name, w: we.w, h: we.h, sill: we.sill || 0, cfg: structuredClone(winCfg(we)) }]; }); env.toast(`Vorlage „${name}“ gespeichert.`); return; }
      if (b.dataset.seg?.startsWith('dwtop:') || b.dataset.seg?.startsWith('dwbot:')) { const [k, v] = b.dataset.seg.split(':'), key = k === 'dwtop' ? 'top' : 'bot'; winEdit(we, c => { c[key] = v === '0' ? null : { h: c[key]?.h || (key === 'top' ? 500 : 400), split: v === '2' }; }); dlg.field = null; return; }
    }
    if (!b.closest('.bau-stpop') && b.dataset.b !== 'stpick') stPop.hidden = true;
    if (b.dataset.st) { setCurrent(b.dataset.st); stPop.hidden = true; return; }
    if (b.dataset.tysel) { const ids = B.els.filter(x => x.typeId === b.dataset.tysel && x.storey === cur).map(x => x.id); if (!ids.length) env.toast('Kein Exemplar dieses Typs in diesem Geschoss.'); else { sel = { ids }; dirty = true; renderUi(); draw(); } return; }
    if (b.dataset.pick) { const x = elById(b.dataset.pick); if (x) { if (!onStorey(x, cur)) setCurrent(x.storey, true); sel = { ids: [x.id] }; addMode = false; if (cmd && cmd.t !== 'measure') cmd = null; dirty = true; renderUi(); draw(); } return; }
    if (b.dataset.eye) { const id = b.dataset.eye; B.vis.hide = B.vis.hide.includes(id) ? B.vis.hide.filter(i => i !== id) : [...B.vis.hide, id]; if (B.vis.hide.includes(id) && isSel(id)) sel = null; visPersist(); return; }
    if (b.dataset.layer) { const k = b.dataset.layer; B.vis.off[k] = !B.vis.off[k]; if (B.vis.off[k]) sel = null; visPersist(); return; }
    if (b.dataset.tog) { const k = b.dataset.tog, isSt = k.startsWith('st:'), set = isSt ? openSt : openGrp, id = isSt ? k.slice(3) : k; if (set.has(id)) set.delete(id); else set.add(id); renderList(); return; }
    if (b.dataset.dlg) { openDlg(b.dataset.dlg); return; }
    if (b.dataset.doc) { if (b.dataset.doc !== B.id) { const nb = await loadB(b.dataset.doc).catch(() => null); if (nb) { await switchTo(nb); env.toast(`„${nb.name}“ geöffnet.`); } } else closeDlg(); return; }
    if (b.dataset.docren) { dlg.ren = b.dataset.docren; renderDlg(); dlgEl.querySelector('.bau-ren')?.focus(); return; }
    if (b.dataset.docdup) {
      const src = b.dataset.docdup === B.id ? structuredClone(B) : await loadB(b.dataset.docdup).catch(() => null);
      if (!src) return;
      if (b.dataset.docdup === B.id) await saveNow().catch(() => {});
      const c2 = { ...src, id: uid(), name: `${src.name} (Kopie)`, updated: Date.now() };
      await saveB(c2); dlg.list = await listB(); renderDlg(); env.toast(`Kopie „${c2.name}“ angelegt.`); return;
    }
    if (b.dataset.docdel) {
      const id = b.dataset.docdel, x = id === B.id ? B : (dlg.list || []).find(q => q.id === id);
      if (!x || !await env.ask(`Gebäude „${x.name}“ löschen? Das lässt sich nicht rückgängig machen.`, 'Löschen')) return;
      await delB(id);
      if (id === B.id) { clearTimeout(saveT); const rest = (await listB()).sort((a, c) => (c.updated || 0) - (a.updated || 0)); B = rest[0] || null; if (B) await switchTo(B); else { await switchTo(newBuilding()); openDlg('new', { first: true }); return; } }
      openDlg('docs'); return;
    }
    if (b.dataset.nwt && dlg?.kind === 'new') { dlg.t = +b.dataset.nwt; renderDlg(); return; }
    const el = selEl(), del = dlg?.el && elById(dlg.el), tgt = del || el;
    if (b.dataset.tile && tgt?.type === 'ceil') { const [gx, gy] = b.dataset.tile.split('x').map(Number); change(() => { tgt.gx = gx; tgt.gy = gy; if (tgt.start) setCeilStart(tgt, tgt.start.k, tgt.start.rx, tgt.start.ry); else ceilEqual(tgt); }); return; }
    if (b.dataset.wpre && cmd) { cmd.th = +b.dataset.wpre; last.wall.th = cmd.th; renderUi(); draw(); return; }
    if (b.dataset.preset && tgt?.type === 'roof') { change(() => { tgt.edges = roofPreset(tgt.pts, b.dataset.preset); }); return; }
    if (b.dataset.ddk) { if (b.dataset.ddk === 'snap' || DD[b.dataset.ddk]) openDD(b.dataset.ddk); return; }
    const segv = b.dataset.seg || b.dataset.ddv;
    if (b.dataset.ddv) closeDD();
    if (segv) {
      const [k, v] = segv.split(/:(.*)/s), C = cmd;
      if (k === 'tab') { tab = v; renderList(); return; }
      if (k.startsWith('nw.') && dlg?.kind === 'new') { dlg[k.slice(3)] = v; renderDlg(); return; }
      if (k === 'just' && C) { C.just = v; last.wall.just = v; }
      else if (k === 'wth' && C) { C.th = +v; last.wall.th = C.th; C.typeId = null; last.wall.typeId = null; }
      else if (k === 'wtype' && C) { C.typeId = v || null; last.wall.typeId = C.typeId; const ty = v && B.types[v]; if (ty) { C.kind = ty.kind; C.th = typeTotal(ty); last.wall.kind = C.kind; last.wall.th = C.th; } }
      else if (k === 'etype') {
        const els = selIds().map(elById).filter(Boolean);
        if (v === '__new') { if (els.length) newTypeFrom(els); }
        else if (v === '') change(() => els.forEach(x => { delete x.typeId; }));
        else if (v !== '__mixed' && B.types[v]) { const ty = B.types[v]; change(() => els.forEach(x => applyType(x, ty))); }
      }
      else if (k === 'tykind') { const id = curTypeId(); if (id) editType(id, t => { t.kind = v; }); }
      else if (k === 'tybase') { const id = curTypeId(); if (id) editType(id, t => { if (v === '1') t.base = true; else delete t.base; }); }
      else if (k === 'tyshape') { const id = curTypeId(); if (id) editType(id, t => { t.shape = v; if (v === 'steel') t.prof ||= 'HEB 200'; else { t.w ||= 300; t.d = v === 'round' ? t.w : (t.d || t.w); } }); }
      else if (k === 'sth' && C) { C.th = +v; if (C.t === 'roof') last.roof.th = C.th; else last.slab.th = C.th; }
      else if (k === 'calign' && C) { C.align = v; last.col.align = v; }
      else if (k === 'cdim' && C) { if (v[0] === 'r') { C.w = C.d = +v.slice(1); } else { const [a2, b2] = v.split('x').map(Number); C.w = a2; C.d = b2; } last.col.w = C.w; last.col.d = C.d; }
      else if (k === 'cprofdd' && C) { C.prof = v; last.col.prof = v; }
      else if (k === 'bdim' && C) { const [a2, b2] = v.split('x').map(Number); C.w = a2; C.bh = b2; last.beam.w = a2; last.beam.bh = b2; }
      else if (k === 'bprofdd' && C) { C.prof = v; last.beam.prof = v; }
      else if (k === 'stwdd' && C) { C.w = +v; last.stair.w = C.w; }
      else if (k === 'cgdd' && C) { const [a2, b2] = v.split('x').map(Number); C.gx = a2; C.gy = b2; last.ceil.gx = a2; last.ceil.gy = b2; }
      else if (k === 'shtodd' && C) C.to = v;
      else if (k === 'gshift') { gMode = v; if (dimEdit) { const hh = dimEdit; openDimEd(hh); } else renderUi(); return; }
      else if (k === 'gdside') { const g = selGrid(), G = g && grpOf(g); if (G) change(() => G.own.forEach(it => { it.g.dimSide = v; })); renderUi(); draw(); return; }
      else if (k === 'gfree') { const g = selGrid(); if (g) change(() => { if (v === 'free') g.free = true; else delete g.free; }); renderUi(); return; }
      else if (k === 'glink') { const e3 = selEl(); if (e3) change(() => { if (v === '0') e3.noGrid = true; else delete e3.noGrid; }); renderUi(); return; }
      else if (k === 'ghead') { const g = selGrid(); if (g) change(() => { g.hideA = v === 'b' || v === 'none'; g.hideB = v === 'a' || v === 'none'; }); renderUi(); draw(); return; }
      else if (k === 'osize' && C) { const [a2, b2] = v.split('x').map(Number); C[C.kind].w = a2; C[C.kind][C.kind === 'hole' ? 'd' : 'h'] = b2; last.op.v[C.kind].w = a2; last.op.v[C.kind][C.kind === 'hole' ? 'd' : 'h'] = b2; }
      else if (k === 'wkind' && C) { C.kind = v; last.wall.kind = v; C.th = WALL_KINDS.find(x => x[0] === v)[2]; last.wall.th = C.th; }
      else if (k === 'ewkind' && el) change(() => { el.kind = v; });
      else if (k === 'mwkind') { const els = selIds().map(elById).filter(x => x?.type === 'wall'); change(() => els.forEach(x => { x.kind = v; })); }
      else if (k === 'shape' && C) { C.shape = v; last.col.shape = v; }
      else if (k === 'bshape' && C) { C.shape = v; last.beam.shape = v; }
      else if (k === 'rkind' && C) { C.kind = v; last.roof.kind = v; }
      else if (k === 'skind' && C) { C.base = v === 'base'; last.slab.base = C.base; C.th = C.base ? 300 : 250; last.slab.th = C.th; }
      else if (k === 'stkind' && C) { C.kind = v; last.stair.kind = v; }
      else if (k === 'stside' && C) { C.side = +v; last.stair.side = +v; }
      else if (k === 'mmode' && C) { C.mode = v; last.meas = v; C.pts = []; C.closed = false; C.res = null; }
      else if (k === 'cmode' && C) { C.mode = v; C.pts = []; last.ceil.mode = v; }
      else if (k === 'okind' && C) { C.kind = v; last.op.kind = v; }
      else if (k === 'wjust' && el) change(() => { el.just = v; });
      else if (k === 'cshape' && el) change(() => { el.shape = v; if (v === 'round') el.d = el.w; if (v === 'steel') el.prof ||= last.col.prof; });
      else if (k === 'ebshape' && el) change(() => { el.shape = v; if (v === 'steel') el.prof ||= last.beam.prof; el.w ||= 300; el.bh ||= 500; });
      else if (k === 'eskind' && el) change(() => { if (v === 'base') el.base = true; else delete el.base; });
      else if (k === 'erkind' && el) change(() => { el.kind = v; if (v === 'pitched' && !el.over) el.over = 400; el.edges ||= roofPreset(el.pts, 'walm'); });
      else if (k === 'phinge' && el) change(() => { el.hinge = v; });
      else if (k === 'pswing' && el) change(() => { el.swing = +v; });
      else if (k === 'dstkind' && tgt) change(() => { tgt.kind = v; stairHole(tgt); });
      else if (k === 'dstside' && tgt) change(() => { tgt.side = +v; stairHole(tgt); });
      else if (k.startsWith('edge') && tgt?.type === 'roof') { const i = +k.slice(4); change(() => { tgt.edges ||= roofPreset(tgt.pts, 'walm'); tgt.edges[i] = { ...(tgt.edges[i] || { pitch: 30 }), eave: v === 't' }; }); }
      renderUi(); draw(); return;
    }
    if (b.dataset.dir && cmd?.t === 'wall') { wallLen(b.dataset.dir === 'last' ? cmd.lastDir || [1, 0] : b.dataset.dir.split(',').map(Number)); return; }
    if (b.dataset.snapk) { const k = b.dataset.snapk; snapCfg[k] = !snapCfg[k]; saveSnap(); renderCmd(); openDD('snap', true); if (lastMouse && cmd) hover = hoverOf(...lastMouse); draw(); return; }
    const a = b.dataset.b;
    if (!a) return;
    if (a === 'midpick' && cmd) { cmd.mid = cmd.mid ? null : {}; renderUi(); draw(); return; }
    if (a.startsWith('op:')) { moreOpen = false; if (cmd?.t === 'open' && cmd.kind === a.slice(3)) endCmd(); else startCmd('open', { kind: a.slice(3) }); return; }
    if (!ctxm.hidden) ctxm.hidden = true;
    if (a === 'tyladd' || a.startsWith('tyldel:') || a === 'typeupd' || a === 'tydel') {
      const id = curTypeId(), ty = B.types?.[id], e0 = selEl();
      if (!ty) return;
      if (a === 'tyladd') editType(id, t => { t.layers.push({ m: 'Putz', t: 10 }); });
      else if (a.startsWith('tyldel:')) editType(id, t => { if (t.layers.length > 1) t.layers.splice(+a.slice(7), 1); });
      else if (a === 'typeupd' && e0) editType(id, t => { t.w = e0.w; t.h = e0.h; t.sill = e0.sill || 0; if (e0.cfg) t.cfg = JSON.parse(JSON.stringify(e0.cfg)); else delete t.cfg; });
      else if (a === 'tydel') { const n = B.els.filter(x => x.typeId === id).length; if (!n || await env.ask(`Typ „${ty.name}“ löschen? ${n} Bauteil${n === 1 ? ' behält' : 'e behalten'} die Maße als „Eigene Maße“.`, 'Löschen')) change(() => { delete B.types[id]; B.els.forEach(x => { if (x.typeId === id) delete x.typeId; }); }); }
      renderUi(); draw(); return;
    }
    if (a.startsWith('t:')) { const t = a.slice(2); moreOpen = false; if (cmd?.t === t) endCmd(); else startCmd(t); return; }
    switch (a) {
      case 'done': close(); return;
      case 'list': listOpen = !listOpen; renderUi(); return;
      case 'more': moreOpen = !moreOpen; renderUi(); return;
      case 'stpick':
        stPop.hidden = !stPop.hidden;
        if (!stPop.hidden) stPop.innerHTML = [...sorted()].reverse().map(x => `<button data-st="${x.id}"${x.id === cur ? ' class="on"' : ''}><b>${esc(x.name)}</b><small>OK RD ${fmt(x.elev)}</small></button>`).join('') + '<button data-dlg="storeys"><b>Geschosse bearbeiten …</b></button>';
        return;
      case 'dlgclose': closeDlg(); return;
      case 'undo': case 'redo': {
        const from = a === 'undo' ? undo : redo, to = a === 'undo' ? redo : undo;
        if (!from.length) return;
        to.push(snap()); B = JSON.parse(from.pop()); fixB();
        if (!st(cur)) cur = B.storeys[0].id;
        sel = null; dirty = true; persist(); renderUi(); draw(); return;
      }
      case 'view': setPlan(!cam.plan); return;
      case 'above': showAbove = !showAbove; dirty = true; renderUi(); draw(); return;
      case 'fit': if (selBox()) fitSel(); else fitView(); draw(); return;
      case 'end': endCmd(); return;
      case 'chain': cmd.pts = []; renderUi(); draw(); return;
      case 'mclear': cmd.pts = []; cmd.closed = false; cmd.res = null; renderUi(); draw(); return;
      case 'areaok': { const P = cmd.pts; cmd.pts = []; addArea(cmd.t, P); return; }
      case 'fromwalls': { const P = outlineFromWalls(); if (P) addArea(cmd.t, P); return; }
      case 'gridmake': {
        const xs = parseSpacing(dlg.gsx), ys = parseSpacing(dlg.gsy);
        if (!xs.length && !ys.length) { env.toast('Abstände eingeben, z. B. 3x6000 7500.'); return; }
        const go = !B.grids.length || await env.ask(`Vorhandene ${B.grids.length} Achsen ersetzen?`, 'Ersetzen');
        if (go) { makeGrid(xs, ys); closeDlg(); }
        return;
      }
      case 'gpar': { const g = selGrid(); if (g) startCmd('grid', { base: g.id, ref: g.id, side: 1 }); return; }
      case 'grenum': renumberGrids(); return;
      case 'gdimok': applyDimEd(); return;
      case 'gdimx': closeDimEd(); return;
      case 'gnew': cmd.base = cmd.ref = null; cmd.pts = []; renderUi(); draw(); return;
      case 'gside': cmd.side = -(cmd.side || 1); renderUi(); return;
      case 'ualign': closeDlg(); startCmd('ualign'); return;
      case 'colgrid': {
        const pts = gridCross().map(q => q.p).filter(p => !B.els.some(x => x.type === 'column' && x.storey === cur && near(x.p, p, 10)));
        if (!pts.length) { env.toast('Auf allen Achsschnitten steht schon eine Stütze.'); return; }
        change(() => pts.forEach(p => B.els.push(newEl({ type: 'column', p, shape: cmd.shape, w: cmd.w, d: cmd.shape === 'round' ? cmd.w : cmd.d, prof: cmd.prof, rot: 0, h: null }))));
        env.toast(`${pts.length} Stützen gesetzt.`); return;
      }
      case 'calok': calOk(); return;
      case 'del': {
        const ids = selIds();
        if (!ids.length) return;
        change(() => { B.els = B.els.filter(x => !ids.includes(x.id) && !ids.includes(x.host) && !ids.includes(x.stairOf)); });
        sel = null; addMode = false; dirty = true; renderUi(); draw(); return;
      }
      case 'delgrid': { const g = selGrid(); if (g) { change(() => { B.grids = B.grids.filter(x => x !== g); }); sel = null; renderUi(); draw(); } return; }
      case 'hidesel': { B.vis.hide = [...new Set([...B.vis.hide, ...selIds()])]; sel = null; visPersist(); env.toast('Ausgeblendet. Wieder einblenden im Projektmanager.'); return; }
      case 'showall': B.vis = { off: {}, hide: [] }; visPersist(); return;
      case 'chainsel': if (el?.type === 'wall') { sel = { ids: wallChain(el) }; dirty = true; renderUi(); draw(); } return;
      case 'joinall': { let n = 0; change(() => { n = joinAll(); }); env.toast(n ? `${n} Wandenden angeschlossen.` : 'Alle Ecken waren schon verbunden.'); return; }
      case 'ortho': orthoOn = !orthoOn; try { localStorage.setItem('biege.bau.ortho', orthoOn ? '1' : '0'); } catch {} if (lastMouse && cmd) hover = hoverOf(...lastMouse); renderUi(); draw(); return;
      case 'xmove': case 'xcopy': startCmd(a === 'xmove' ? 'move' : 'copy'); return;
      case 'addsel': addMode = !addMode; renderUi(); if (addMode) env.toast('Weitere Bauteile antippen. Am Mac geht das auch mit Shift.'); return;
      case 'selnone': sel = null; addMode = false; dirty = true; renderUi(); draw(); return;
      case 'split': startCmd('split', { el: el.id }); return;
      case 'ceildlg': openDlg('ceil', { el: el.id }); return;
      case 'roofdlg': openDlg('roof', { el: el.id }); return;
      case 'stairdlg': openDlg('stair', { el: el.id }); return;
      case 'windlg': openDlg('window', { el: el.id }); return;
      case 'gstart': if (tgt?.type === 'ceil') { if (!cam.plan) setPlan(true); cmd = { t: 'gstart', el: tgt.id, pts: [] }; sel = { ids: [tgt.id] }; renderUi(); draw(); } return;
      case 'cequal': if (tgt?.type === 'ceil') change(() => ceilEqual(tgt)); return;
      case 'ctrot': if (tgt?.type === 'ceil') change(() => { [tgt.gx, tgt.gy] = [tgt.gy, tgt.gx]; if (tgt.start) setCeilStart(tgt, tgt.start.k, tgt.start.rx, tgt.start.ry); else ceilEqual(tgt); }); return;
      case 'tiles': if (tgt?.type === 'ceil') { if (cmd?.t === 'tiles') cmd = null; else { if (!cam.plan) setPlan(true); cmd = { t: 'tiles', el: tgt.id, pts: [] }; sel = { ids: [tgt.id] }; } renderUi(); draw(); } return;
      case 'roomceil': if (el?.type === 'space') { const c2 = addArea('ceil', el.pts.map(p => [...p]), el.holes); if (c2) { sel = { ids: [c2.id] }; openDlg('ceil', { el: c2.id }); } } return;
      case 'stflip': if (tgt?.type === 'stair') change(() => { if (tgt.kind === 'u') tgt.side = -(tgt.side || 1); else { const g = stairGeo(tgt); tgt.a = add(tgt.a, mul(norm(tgt.dir), g.L)); tgt.dir = mul(tgt.dir, -1); } stairHole(tgt); }); return;
      case 'sthole': if (tgt?.type === 'stair') { let ok = false; change(() => { ok = stairHole(tgt); }); env.toast(ok ? 'Deckenöffnung über der Treppe neu angelegt.' : 'Keine Decke über der Treppe gefunden.'); } return;
      case 'rot90': if (el) change(() => { el.rot90 = !el.rot90; }); return;
      case 'gable': if (tgt?.type === 'roof') change(() => { tgt.gable = tgt.gable === false; }); return;
      case 'terrain': change(() => { B.terrain = B.terrain == null ? Math.round((B.storeys.find(x => /^EG$/i.test(x.name))?.elev ?? 0) - 150) : null; }); return;
      case 'stup': case 'stdown': {
        const S = sorted();
        const ns = a === 'stup' ? { id: uid(), name: nextStoreyName(S.at(-1), 1), elev: S.at(-1).elev + S.at(-1).height, height: S.at(-1).height } : { id: uid(), name: nextStoreyName(S[0], -1), elev: S[0].elev - 2600, height: 2600 };
        change(() => B.storeys.push(ns)); setCurrent(ns.id); return;
      }
      case 'stcopy': copyStorey(); return;
      case 'stdel': {
        const s = curSt(), n = B.els.filter(x => x.storey === s.id).length;
        if (!await env.ask(`Geschoss „${s.name}“${n ? ` mit ${n} Bauteilen` : ''} löschen?`, 'Löschen')) return;
        change(() => { B.storeys = B.storeys.filter(x => x !== s); B.els = B.els.filter(x => x.storey !== s.id); B.underlays = B.underlays.filter(x => x.storey !== s.id); B.els.forEach(x => { if (x.type === 'shaft' && x.to === s.id) x.to = x.storey; }); });
        setCurrent(sorted()[0].id); return;
      }
      case 'uload': $('.bau-file').click(); return;
      case 'cal': closeDlg(); startCmd('cal'); return;
      case 'umove': closeDlg(); startCmd('umove'); return;
      case 'udel': { const u = curUl(); if (u && await env.ask('Planunterlage entfernen?', 'Entfernen')) change(() => { B.underlays = B.underlays.filter(x => x !== u); }); return; }
      case 'export': {
        const files = {};
        for (const u of B.underlays) { const f = await getFile(u.file).catch(() => null); if (f) files[u.file] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); }
        download(new Blob([JSON.stringify({ ...B, files }, null, 1)], { type: 'application/json' }), `${(B.name || 'gebaeude').replace(/[^\wäöüÄÖÜß-]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`); return;
      }
      case 'import': $('.bau-json').click(); return;
      case 'ifc': try { download(new Blob([ifcText()], { type: 'application/x-step' }), `gebaeude-${new Date().toISOString().slice(0, 10)}.ifc`); } catch (err) { env.toast(`IFC: ${err.message || err}`); } return;
      case 'png': viewImage(); return;
      case 'docnew': openDlg('new'); return;
      case 'nwmake': await createFromWizard(); return;
    }
  });
  function nextStoreyName(ref, dir) {
    const m = /^(-?\d+)\.?\s*OG$/i.exec(ref.name), u = /^(\d+)\.?\s*UG$/i.exec(ref.name);
    if (dir > 0) { if (/^EG$/i.test(ref.name)) return '1. OG'; if (m) return `${+m[1] + 1}. OG`; if (u) return +u[1] > 1 ? `${+u[1] - 1}. UG` : 'EG'; if (/^UG$/i.test(ref.name) || /^KG$/i.test(ref.name)) return 'EG'; return `Geschoss ${B.storeys.length + 1}`; }
    if (/^EG$/i.test(ref.name)) return 'UG'; if (/^UG$/i.test(ref.name)) return '2. UG'; if (u) return `${+u[1] + 1}. UG`; if (m) return +m[1] > 1 ? `${+m[1] - 1}. OG` : 'EG'; return `Geschoss ${B.storeys.length + 1}`;
  }
  $('.bau-file').addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { closeDlg(); loadUnderlay(f); } });
  $('.bau-json').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!Array.isArray(o.storeys) || !o.storeys.length || !Array.isArray(o.els)) throw new Error('keine Gebäudedatei');
      const files = o.files || {}, uls = [];
      for (const u of o.underlays || []) if (files[u.file]) { await putFile(u.file, await (await fetch(files[u.file])).blob()); imgs.delete(u.file); uls.push(u); }
      delete o.files;
      const nb = { ...newBuilding(), ...o, id: uid(), name: o.name || f.name.replace(/\.json$/i, ''), grids: o.grids || [], underlays: uls };
      await switchTo(nb);
      env.toast(`„${nb.name}“ aus der Datei geladen.`);
    } catch (err) { env.toast(`Laden: ${err.message || err}`); }
  });
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-ualpha]')) { const u = curUl(); if (u) { u.alpha = +el.value; persist(); draw(); } }
    if (cmd && el.dataset.f === 'len') { const v = num(el.value); cmd.len = Number.isFinite(v) ? v : null; }
  });
  root.addEventListener('change', e => {
    const el = e.target, e2 = selEl();
    if (el.matches('[data-ualpha]')) return;
    if (!el.closest('.bau-dlg') && el.matches('[data-stf], [data-f="stelev"], [data-f="stheight"], [data-f="urot"]')) {
      const sc = curSt(), v = num(el.value);
      if (el.dataset.stf === 'name') { const nm = el.value.trim(); if (nm) change(() => { sc.name = nm; }); }
      else if (el.dataset.f === 'stheight' && v > 0) change(() => { const dz = v - sc.height; B.storeys.forEach(y => { if (y !== sc && y.elev > sc.elev + 1e-6) y.elev += dz; }); sc.height = v; });
      else if (el.dataset.f === 'stelev' && Number.isFinite(v)) change(() => { sc.elev = v; });
      else if (el.dataset.f === 'urot' && Number.isFinite(v)) { const u = curUl(); if (u) change(() => { u.rot = v; }); }
      renderUi(); draw(); return;
    }
    if ((el.dataset.tyf || el.dataset.tyl || el.dataset.f?.startsWith('ty')) && !el.closest('.bau-dlg')) { tyField(el); return; }
    // nicht lesbare Zahl: alter Wert bleibt, Hinweis statt stiller Falschinterpretation
    if ((el.dataset.f || el.matches('[data-gdim]')) && el.value.trim() !== '' && !Number.isFinite(num(el.value))) { env.toast(`„${el.value.trim()}“ ist keine Zahl. Beispiele: 1260, 1.260, 1,26 m, 2*600.`); renderUi(); if (dlg) renderDlg(); return; }
    if (el.closest('.bau-dlg')) { dlgChange(el); return; }
    if (el.matches('[data-gname]')) { const g = selGrid(), v = el.value.trim(); if (g && v) change(() => { g.name = v; }); renderUi(); draw(); return; }
    if (el.matches('[data-gdim]')) { if (dimEdit) dimEdit.val = num(el.value) || dimEdit.val; return; }
    if (el.matches('[data-gdist]')) { if (cmd?.t === 'grid' && cmd.base && el.value.trim()) gridSeries(el.value, cmd.side || 1); return; }
    if (el.dataset.f === 'ggprev' || el.dataset.f === 'ggnext') { const g = selGrid(), f = g && grpOf(g), i = f ? f.items.findIndex(it => it.g === g) : -1, v = num(el.value); if (f && v > 0) setGap(f, el.dataset.f === 'ggprev' ? i - 1 : i, v); return; }
    if (el.dataset.txt && e2) { change(() => { e2[el.dataset.txt] = el.value.trim(); }); return; }
    if (el.dataset.sel) {
      const k = el.dataset.sel, v = el.value;
      if (k === 'cprof' && cmd) { cmd.prof = v; last.col.prof = v; }
      else if (k === 'bprof' && cmd) { cmd.prof = v; last.beam.prof = v; }
      else if (k === 'shto' && cmd) cmd.to = v;
      else if (k === 'eprof' && e2) change(() => { e2.prof = v; });
      else if (k === 'eshto' && e2) change(() => { e2.to = v; });
      renderUi(); draw(); return;
    }
    const k = el.dataset.f;
    if (!k) return;
    const v = num(el.value), pos = x => Number.isFinite(x) && x > 0, fin = Number.isFinite(v);
    if (cmd && el.closest('.ped-cmd, .bau-ddpop')) {
      const C = cmd;
      if (k === 'th' && pos(v)) { C.th = v; if (C.t === 'wall') { last.wall.th = v; C.typeId = null; last.wall.typeId = null; } else if (C.t === 'roof') last.roof.th = v; else last.slab.th = v; }
      else if (k === 'len') C.len = fin ? v : null;
      else if (k === 'w' && pos(v)) { C.w = v; last.col.w = v; }
      else if (k === 'd' && pos(v)) { C.d = v; last.col.d = v; }
      else if (k === 'bw' && pos(v)) { C.w = v; last.beam.w = v; }
      else if (k === 'bh' && pos(v)) { C.bh = v; last.beam.bh = v; }
      else if (k === 'btop' && fin) C.top = v;
      else if (k === 'rbase' && fin) C.base = v;
      else if (k === 'stw' && pos(v)) { C.w = v; last.stair.w = v; }
      else if (k === 'cz' && pos(v)) { C.z = v; last.ceil.z = v; }
      else if (k === 'cgx' && pos(v)) { C.gx = C.gy = v; last.ceil.gx = last.ceil.gy = v; }
      else if (k === 'cn' && pos(v)) { C.n = Math.round(v); last.copyN = C.n; }
      else if (k === 'real' && pos(v)) C.real = v;
      else if (C.t === 'open' && ['ow', 'oh', 'od', 'osill'].includes(k) && (pos(v) || (k === 'osill' && v === 0))) { const key = { ow: 'w', oh: 'h', od: 'd', osill: 'sill' }[k]; C[C.kind][key] = v; last.op.v[C.kind][key] = v; }
      renderUi(); draw(); return;
    }
    // Mehrfachauswahl: ein Wert für alle
    if (k[0] === 'm' && selIds().length > 1) {
      const els = selIds().map(elById).filter(Boolean), empty2 = el.value.trim() === '';
      change(() => els.forEach(x => {
        if (k === 'mt' && pos(v)) x.t = v;
        else if (k === 'mh') x.h = empty2 ? null : pos(v) ? v : x.h;
        else if (k === 'mbase' && fin) x.base = v;
        else if (k === 'mtop' && fin) x.top = v;
        else if (k === 'mw' && pos(v)) { const L = wallAxis(hostOf(x)).L; x.w = Math.min(v, L); x.at = Math.max(x.w / 2, Math.min(L - x.w / 2, x.at)); }
        else if (k === 'mhh' && pos(v)) x.h = v;
        else if (k === 'msill' && fin && v >= 0) x.sill = v;
      }));
      return;
    }
    if (!e2) return;
    const empty = el.value.trim() === '';
    change(() => {
      const opsOf = () => B.els.filter(o => o.host === e2.id && WALL_OPS.includes(o.type));
      if (k === 'wl' && pos(v)) { e2.b = add(e2.a, mul(norm(sub(e2.b, e2.a)), v)); opsOf().forEach(o => { o.w = Math.min(o.w, v); o.at = Math.max(o.w / 2, Math.min(v - o.w / 2, o.at)); }); }
      else if (k === 'ebl' && pos(v)) e2.b = add(e2.a, mul(norm(sub(e2.b, e2.a)), v));
      else if (k === 'wt' && pos(v)) e2.t = v;
      else if (k === 'wh' || k === 'ch') e2.h = empty ? null : pos(v) ? v : e2.h;
      else if (k === 'wbase' && fin) e2.base = v;
      else if (k === 'cw' && pos(v)) { e2.w = v; if (e2.shape === 'round') e2.d = v; }
      else if (k === 'cd' && pos(v)) e2.d = v;
      else if (k === 'crot' && fin) e2.rot = v;
      else if (k === 'st' && pos(v)) e2.t = v;
      else if (k === 'ebw' && pos(v)) e2.w = v;
      else if (k === 'ebh' && pos(v)) e2.bh = v;
      else if (k === 'ebtop' && fin) e2.top = v;
      else if (k === 'erbase' && fin) e2.base = v;
      else if (k === 'ert' && pos(v)) e2.t = v;
      else if (k === 'erover' && fin && v >= 0) e2.over = v;
      else if (k === 'parh' && fin && v >= 0) e2.par = { ...(e2.par || { w: 240, o: 0 }), h: v };
      else if (k === 'parw' && pos(v)) e2.par = { ...(e2.par || { h: 500, o: 0 }), w: v };
      else if (k === 'paro' && fin && v >= 0) e2.par = { ...(e2.par || { h: 500, w: 240 }), o: v };
      else if (k === 'ecz' && pos(v)) e2.z = v;
      else if (k === 'pw' && pos(v)) { if (e2.type === 'hole') e2.w = v; else { const L = wallAxis(hostOf(e2)).L; e2.w = Math.min(v, L); e2.at = Math.max(e2.w / 2, Math.min(L - e2.w / 2, e2.at)); } }
      else if (k === 'ph' && pos(v)) e2.h = v;
      else if (k === 'pd' && pos(v)) e2.d = v;
      else if (k === 'psill' && fin && v >= 0) e2.sill = v;
      else if (k === 'pleft' && fin) { const L = wallAxis(hostOf(e2)).L; e2.at = Math.max(e2.w / 2, Math.min(L - e2.w / 2, v + e2.w / 2)); }
    });
  });

  // ---------- Zeiger ----------
  const ptrs = new Map();
  let drag = null, pinch = null;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hoverOf = (x, y) => {
    if (!cmd) return null;
    const t = cmd.t;
    if (t === 'open') { const o = opAt(x, y); return o ? { op: o } : null; }
    if (t === 'space' || t === 'tiles' || t === 'split' || (t === 'ceil' && cmd.mode === 'room')) return null;
    if (t === 'cal' || t === 'ualign' || (t === 'umove' && !cmd.pts.length)) { const p = calOrtho(onPlane(x, y)); return p ? { p } : null; }
    if (t === 'measure') { if (cmd.mode === 'pick' || (cmd.mode === 'dist' && cmd.pts.length >= 2) || cmd.closed) return null; return snapAt(x, y, { from: cmd.pts.at(-1), extra: cmd.mode === 'area' && cmd.pts.length > 2 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [] }); }
    if (t === 'gstart') return null;
    const from = ['wall', 'beam', 'slab', 'roof', 'ceil', 'grid', 'move', 'copy', 'stair'].includes(t) && cmd.pts.length ? cmd.pts.at(-1) : null;
    const extra = ['wall', 'slab', 'roof', 'ceil'].includes(t) && cmd.pts.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    return snapAt(x, y, { from: cmd.mid ? null : from, extra, skip: t === 'move' || t === 'copy' ? new Set(selIds()) : null });
  };
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    touch = e.pointerType !== 'mouse';
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
    if (moreOpen || !stPop.hidden) { moreOpen = false; stPop.hidden = true; renderUi(); }
    if (!ddPop.hidden) closeDD();
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; if (drag?.D) dragEnd(drag.D); drag = null; return; }
    const h = !cmd && e.button === 0 && !e.shiftKey ? handleAt(x, y) : null;
    drag = { pan: e.button === 2 || e.button === 1 || (cam.plan && !h), moved: false, D: h ? dragStart(h) : null, shift: e.shiftKey };
    if (!drag.pan && !drag.D) drag.piv = orbitPivot(x, y);
    freeSnap = !!(e.shiftKey && cmd);
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e), p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { touch = false; lastMouse = [x, y]; if (desk) { const pp = onPlane(x, y); statusEl.querySelector('.bau-sx').textContent = pp ? `X ${fmt(pp[0])}   Y ${fmt(pp[1])} mm` : ''; } freeSnap = !!(e.shiftKey && cmd); const h = hoverOf(x, y), hv = !cmd && handleAt(x, y); cv.style.cursor = hv ? 'grab' : ''; if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; if (cmd?.t === 'measure') renderCmd(); draw(); } }
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      zoomAt(pinch.cx, pinch.cy, d / pinch.d); cam.panX += cx - pinch.cx; cam.panY += cy - pinch.cy;
      Object.assign(pinch, { d, cx, cy }); draw(); return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(x - p.x0, y - p.y0) < 6) return;
    drag.moved = true;
    if (drag.D) { dragMove(drag.D, x, y); return; }
    if (drag.pan) { cam.panX += dx; cam.panY += dy; }
    else {
      // Drehen: der Drehpunkt bleibt an seiner Stelle auf dem Bildschirm
      const pv = drag.piv, s0 = pv && P3(pv);
      cam.yaw += dx * 0.01; cam.pitch = Math.max(0.05, Math.min(Math.PI / 2 - 1e-4, cam.pitch + dy * 0.01));
      if (cam.plan) { cam.plan = false; dirty = true; renderUi(); }
      if (pv) { const s1 = P3(pv); cam.panX += s0[0] - s1[0]; cam.panY += s0[1] - s1[1]; }
    }
    draw();
  });
  const up = e => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (pinch) { if (!ptrs.size) pinch = null; drag = null; return; }
    if (!p || !drag) return;
    if (drag.D) { if (drag.moved) dragEnd(drag.D); hover = null; drag = null; renderUi(); draw(); return; }
    if (!drag.moved && e.button === 2) { drag = null; ctxMenu(p.x, p.y); return; }
    if (!drag.moved && e.button !== 2) { if (cmd) hover = null; onTap(p.x, p.y, drag.shift); if (cmd && e.pointerType === 'mouse') { hover = hoverOf(p.x, p.y); draw(); } }
    drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (drag?.D && drag.moved) dragEnd(drag.D); drag = null; pinch = null; });
  cv.addEventListener('pointerleave', () => { if (hover && !ptrs.size) { hover = null; draw(); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function zoomAt(x, y, f) {
    const s = Math.max(0.0005, Math.min(20, cam.sc * f)) / cam.sc;
    cam.panX = x - W / 2 - (x - W / 2 - cam.panX) * s; cam.panY = y - H / 2 - (y - H / 2 - cam.panY) * s; cam.sc *= s;
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); draw(); }, { passive: false });
  // Tastatur (Mac, iPad mit Tastatur): Werkzeuge mit einem Buchstaben, Bild auf/ab wechselt das Geschoss
  root.addEventListener('keyup', e => { if (e.key === 'Shift' && freeSnap) { freeSnap = false; if (lastMouse && cmd) hover = hoverOf(...lastMouse); draw(); } });
  root.addEventListener('keydown', e => {
    if (e.target.matches('[data-gdim]')) { if (e.key === 'Escape') closeDimEd(); if (e.key === 'Enter') { e.preventDefault(); applyDimEd(); } return; }
    if (e.target.matches('input, select, textarea')) { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape' && e.target.matches('.bau-ren')) { dlg.ren = null; renderDlg(); } return; }
    const k = e.key.toLowerCase();
    if (e.key === 'F8') { e.preventDefault(); orthoOn = !orthoOn; try { localStorage.setItem('biege.bau.ortho', orthoOn ? '1' : '0'); } catch {} if (lastMouse && cmd) hover = hoverOf(...lastMouse); renderUi(); draw(); env.toast(orthoOn ? 'Ortho an: nur waagerecht und senkrecht.' : 'Ortho aus.'); return; }
    if (e.key === 'Shift' && cmd) { freeSnap = true; if (lastMouse) hover = hoverOf(...lastMouse); draw(); return; }
    if (cmd && DYN.includes(cmd.t) && (cmd.pts?.length || (cmd.t === 'grid' && cmd.base)) && !(cmd.t === 'measure' && cmd.mode === 'pick') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (cmd.t === 'grid' && dyn && (k === 'x' || e.key === ' ' || e.key === '*')) { dyn += e.key === ' ' ? ' ' : 'x'; e.preventDefault(); draw(); return; }
      if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !dyn.includes(','))) { dyn += e.key === '.' ? ',' : e.key; e.preventDefault(); draw(); return; }
      if (e.key === '-') { dynNeg = !dynNeg; e.preventDefault(); draw(); return; }
      if (dyn && e.key === 'Backspace') { dyn = dyn.slice(0, -1); e.preventDefault(); draw(); return; }
      if (dyn && e.key === 'Enter') { e.preventDefault(); placeDyn(); return; }
      if ((dyn || dynNeg) && e.key === 'Escape') { dyn = ''; dynNeg = false; draw(); return; }
    }
    if (e.key === 'Escape') { if (!stPop.hidden) stPop.hidden = true; else if (cmd) endCmd(); else if (dlg) closeDlg(); else { sel = null; addMode = false; dirty = true; renderUi(); draw(); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { $(sel.grid ? '[data-b="delgrid"]' : '[data-b="del"]')?.click(); return; }
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); $(`[data-b="${e.shiftKey ? 'redo' : 'undo'}"]`).click(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'PageUp' || e.key === 'PageDown') { const S = sorted(), i = S.indexOf(curSt()), n = S[i + (e.key === 'PageUp' ? 1 : -1)]; if (n) setCurrent(n.id); e.preventDefault(); return; }
    if (e.key === ' ' && !cmd && lastCmdT) { e.preventDefault(); startCmd(lastCmdT); return; }
    if (e.key === '?') { e.preventDefault(); if (dlg?.kind === 'keys') closeDlg(); else openDlg('keys'); return; }
    const map = { w: 'wall', s: 'column', t: 'beam', d: 'slab', o: 'open', m: 'measure', r: 'space', g: 'grid' };
    if (map[k]) { e.preventDefault(); if (cmd?.t === map[k]) endCmd(); else startCmd(map[k]); return; }
    if (k === 'v') { setPlan(!cam.plan); return; }
    if (k === 'f') { if (selBox()) fitSel(); else fitView(); draw(); }
  });
  // Beim Anklicken eines Zahlenfelds den ganzen Wert markieren: tippen ersetzt ihn
  root.addEventListener('focusin', e => { if (e.target.matches?.('input[data-f], input[data-gdim]')) setTimeout(() => e.target.select(), 0); });
  root.addEventListener('toggle', e => { const d = e.target.closest?.('[data-sec]'); if (d) try { localStorage.setItem(`biege.bau.sec.${d.dataset.sec}`, d.open ? '1' : '0'); } catch {} }, true);
  root.tabIndex = -1;
  const ro = new ResizeObserver(() => { applyDesk(); const r = cv.getBoundingClientRect(); W = r.width; H = r.height; draw(); });
  ro.observe(root); ro.observe(cv);
  function close() {
    clearTimeout(saveT); saveB(B).catch(() => {});
    ro.disconnect();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    imgs.forEach(img => img?.src && URL.revokeObjectURL(img.src));
    root.remove();
    env.onClose?.();
  }

  // Start
  const r0 = root.getBoundingClientRect();
  W = r0.width; H = r0.height;
  fitView(); renderUi(); draw(); root.focus({ preventScroll: true });
  if (fresh) { saveNow().catch(() => {}); openDlg('new', { first: true }); }
  return {
    click: sel2 => root.querySelector(sel2)?.click(), field(key, val) { const el = root.querySelector(`[data-f="${key}"]`); if (!el) return false; el.value = String(val); el.dispatchEvent(new Event('change', { bubbles: true })); return true; },
    close, draw, startCmd, onTap, pickEl, P2, P3, fitView, setPlan, footprint, snapAt, detectRoom, ifcText, roofGeo, zOf, gridFams, gridGroups, opDims, holeDims, elemMesh, wallOutline, num,
    get B() { return B; }, get state() { return { cmd, sel, cur, cam, hover }; },
    setCur(id) { cur = id; dirty = true; renderUi(); draw(); },
    // Selbsttest in einem eigenen Test-Gebäude (nichts wird gespeichert, Rückgängig und Auswahl bleiben erhalten)
    async selfTest() {
      const keep = { B, cur, sel, cmd, hover, undo: [...undo], redo: [...redo], dlg }, { runBuildingTests } = await import('./building-test.js');
      clearTimeout(saveT); testing = true;
      B = newBuilding('Selbsttest'); fixB(); cur = B.storeys[0].id; sel = null; cmd = null; dlg = null;
      try {
        return await runBuildingTests({ get B() { return B; }, cur: () => cur, num, parseSpacing, detectRoom, wallOutline, wallPieces, opDims, gridGroups, gridFams, gridFollowers, applyFollow, setGap, ifcText, colPoly, zOf, editType, relinkAll, newTypeFrom, applyType });
      } finally {
        B = keep.B; cur = keep.cur; sel = keep.sel; cmd = keep.cmd; hover = keep.hover; dlg = keep.dlg;
        undo.splice(0, undo.length, ...keep.undo); redo.splice(0, redo.length, ...keep.redo); testing = false; dirty = true; renderUi(); draw();
      }
    },
    setSel(ids) { sel = ids ? { ids } : null; dirty = true; renderUi(); draw(); },
  };
}
