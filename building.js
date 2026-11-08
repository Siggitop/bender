// Gebäude (Experiment): Geschosse, Achsraster, Planunterlage, Wände, Stützen, Decken.
// Eigener Speicher (IndexedDB „biege-bau“), eigene Ansicht, eigenes WebGL: Die Rohrdaten der App bleiben unberührt.
// Einheit mm, Z nach oben. Typen angelehnt an IFC (Storey, Grid, Wall, Column, Slab). Siehe ROADMAP-GEBAEUDE.md.

// ---------- Rechnen ----------
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = a => Math.hypot(...a), norm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0], perp = a => [-a[1], a[0]], near = (a, b, t = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < t;
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–');
const num = s => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const area2 = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; return [Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy), t]; };
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
function hull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...P].reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
// Ohrenschneiden für einfache Polygone (gegen den Uhrzeigersinn)
function triangulate(P) {
  const idx = P.map((_, i) => i), out = [];
  const s = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  const inTri = (p, a, b, c) => { const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let found = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length], a = P[i0], b = P[i1], c = P[i2];
      if (s(a, b, c) <= 1e-9) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && !near(P[j], a, 1e-6) && !near(P[j], b, 1e-6) && !near(P[j], c, 1e-6) && inTri(P[j], a, b, c))) continue;
      out.push([i0, i1, i2]); idx.splice(k, 1); found = true; break;
    }
    if (!found) break;
  }
  if (idx.length === 3) out.push([...idx]);
  return out;
}

// ---------- Speicher ----------
const DBN = 'biege-bau';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('buildings', { keyPath: 'id' }); d.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbDo(store, mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), r = fn(t.objectStore(store));
    t.oncomplete = () => { d.close(); res(r?.result); };
    t.onerror = () => { d.close(); rej(t.error); };
  });
}
const loadB = () => dbDo('buildings', 'readonly', s => s.get('main'));
const saveB = b => dbDo('buildings', 'readwrite', s => s.put(b));
const putFile = (id, blob) => dbDo('files', 'readwrite', s => s.put(blob, id));
const getFile = id => dbDo('files', 'readonly', s => s.get(id));
const delFile = id => dbDo('files', 'readwrite', s => s.delete(id));
const newBuilding = () => ({ id: 'main', name: 'Gebäude', ver: 1, storeys: [{ id: uid(), name: 'EG', elev: 0, height: 3000 }], grids: [], els: [], underlays: [] });

// ---------- Symbole ----------
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  ok: '<path d="m5 12 5 5 9-10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  list: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  sel: '<path d="M5 3l14 8-6 2-2 6z"/>',
  wall: '<path d="M3 6h18v12H3z"/><path d="M3 12h18M9 6v6M15 12v6"/>',
  column: '<path d="M7 3h10M7 21h10M9.5 3v18M14.5 3v18"/>',
  slab: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M3 9v3l9 5 9-5V9"/>',
  grid: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 7v14M19 7v14M3 12h18"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h9v8M13 4v4"/>',
  iso: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="14.5" cy="12" r=".8"/>',
};
const TYPE_NAME = { wall: 'Wand', column: 'Stütze', slab: 'Decke', door: 'Tür', window: 'Fenster', opening: 'Wanddurchbruch', hole: 'Deckendurchbruch' };
const WALL_OPS = ['door', 'window', 'opening'], OPS = [...WALL_OPS, 'hole'];
const OP_DEF = { door: { w: 1010, h: 2135, sill: 0 }, window: { w: 1260, h: 1385, sill: 900 }, opening: { w: 300, h: 300, sill: 2300 }, hole: { w: 600, d: 400 } };
const JUST = [['l', 'Links'], ['c', 'Mitte'], ['r', 'Rechts']];

export async function openBuilding(env) {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgb = (h, fb) => { h = css(h); return h.startsWith('#') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255) : fb; };
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  // ---------- Oberfläche ----------
  const root = document.createElement('div');
  root.className = 'ped bau';
  root.innerHTML = `
    <canvas class="ped-gl"></canvas><canvas class="ped-2d"></canvas>
    <div class="ped-head">
      <button class="flbtn" data-b="list" title="Geschosse, Raster, Unterlage" aria-label="Geschosse, Raster, Unterlage">${SVG(IC.list)}</button>
      <button class="flbtn" data-b="undo" title="Rückgängig" aria-label="Rückgängig">${SVG(IC.undo)}</button>
      <button class="flbtn" data-b="redo" title="Wiederholen" aria-label="Wiederholen">${SVG(IC.redo)}</button>
      <b class="ped-title"></b>
      <button class="flbtn primary" data-b="done" title="Fertig" aria-label="Fertig">${SVG(IC.ok)}</button>
    </div>
    <aside class="ped-list"></aside>
    <div class="ped-info" hidden></div>
    <div class="ped-bottom">
      <div class="ped-cmd" hidden></div>
      <div class="navbar ped-tools" role="toolbar" aria-label="Werkzeuge">
        <button class="nvb" data-b="t:sel" title="Auswählen" aria-label="Auswählen">${SVG(IC.sel)}</button>
        <button class="nvb" data-b="t:wall" title="Wand" aria-label="Wand">${SVG(IC.wall)}</button>
        <button class="nvb" data-b="t:column" title="Stütze" aria-label="Stütze">${SVG(IC.column)}</button>
        <button class="nvb" data-b="t:slab" title="Decke" aria-label="Decke">${SVG(IC.slab)}</button>
        <button class="nvb" data-b="t:open" title="Tür, Fenster, Durchbruch" aria-label="Tür, Fenster, Durchbruch">${SVG(IC.door)}</button>
        <button class="nvb" data-b="t:grid" title="Achse" aria-label="Achse">${SVG(IC.grid)}</button>
        <i class="bsep"></i>
        <button class="nvb" data-b="view" title="Grundriss oder 3D" aria-label="Grundriss oder 3D"></button>
        <button class="nvb" data-b="fit" title="Einpassen" aria-label="Einpassen">${SVG(IC.fit)}</button>
      </div>
    </div>
    <input type="file" class="bau-file" accept="image/*,application/pdf" hidden>
    <input type="file" class="bau-json" accept="application/json,.json" hidden>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const glc = $('.ped-gl'), cv = $('.ped-2d'), ctx = cv.getContext('2d');
  const listEl = $('.ped-list'), infoEl = $('.ped-info'), cmdEl = $('.ped-cmd');

  // ---------- Zustand ----------
  let B = (await loadB().catch(() => null)) || newBuilding();
  let cur = B.storeys[0].id;
  const cam = { yaw: -0.6, pitch: 0.55, sc: 0.05, panX: 0, panY: 0, plan: false };
  let mid = [0, 0, 0], size = 20000, W = 1, H = 1, listOpen = innerWidth > 900, showAbove = false;
  let tool = 'sel', cmd = null, sel = null, hover = null, dirty = true, gridForm = false;
  const undo = [], redo = [];
  const imgs = new Map(); // Unterlage: Datei-ID → Bild
  const st = id => B.storeys.find(s => s.id === id), curSt = () => st(cur);
  const sorted = () => [...B.storeys].sort((a, b) => a.elev - b.elev);
  const visible = s => showAbove || s.elev <= curSt().elev + 1e-6;
  let saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => saveB(B).catch(e => env.toast(`Speichern fehlgeschlagen: ${e.message || e}`)), 250); };
  const snap = () => JSON.stringify(B);
  function change(fn) { undo.push(snap()); if (undo.length > 200) undo.shift(); redo.length = 0; fn(); dirty = true; persist(); renderUi(); draw(); }
  const elById = id => B.els.find(e => e.id === id);
  const pipeCache = new Map();
  const pipeGeom = id => { if (!pipeCache.has(id)) { let g = []; try { g = env.sceneGeom?.(id) || []; } catch {} pipeCache.set(id, g); } return pipeCache.get(id); };
  B.links ||= [];

  // ---------- Bauteile ----------
  const wallOffs = w => (w.just === 'l' ? [0, w.t] : w.just === 'r' ? [-w.t, 0] : [-w.t / 2, w.t / 2]);
  const zRange = e => { const s = st(e.storey); if (e.type === 'slab') return [s.elev - e.t, s.elev]; return [s.elev + (e.base || 0), s.elev + (e.h ?? s.height)]; };
  // Grundriss einer Wand: Ecken an L-Stößen auf Gehrung (Winkelhalbierende), sonst rechtwinklig
  function wallPoly(w) {
    const d = norm(sub(w.b, w.a)), n = perp(d), [lo, hi] = wallOffs(w), r = {};
    for (const end of ['a', 'b']) {
      const P = w[end], away = end === 'a' ? d : mul(d, -1);
      const others = B.els.filter(o => o !== w && o.type === 'wall' && o.storey === w.storey && (near(o.a, P) || near(o.b, P)));
      let m = null, face = null;
      // T-Stoß: Das Ende sitzt auf der Achse einer anderen Wand und endet an deren Fläche
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
        if (face) { const den = cross2(d, face.d); if (Math.abs(den) > 1e-6) { r[end + k] = add(Q, mul(d, cross2(sub(face.p, Q), face.d) / den)); continue; } }
        if (!m) { r[end + k] = Q; continue; }
        const den = cross2(d, m), s = cross2(sub(P, Q), m) / den, X = add(Q, mul(d, s));
        r[end + k] = len(sub(X, P)) > Math.abs(off) * 8 + 50 ? Q : X;
      }
    }
    return [r.aR, r.bR, r.bL, r.aL];
  }
  function colPoly(c) {
    if (c.shape === 'round') return Array.from({ length: 28 }, (_, k) => { const a = 2 * Math.PI * k / 28; return [c.p[0] + Math.cos(a) * c.w / 2, c.p[1] + Math.sin(a) * c.w / 2]; });
    const a = (c.rot || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = perp(u), hw = c.w / 2, hd = c.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => add(c.p, add(mul(u, x), mul(v, y))));
  }
  const hostOf = o => elById(o.host);
  const wallAxis = w => { const v = sub(w.b, w.a), L = len(v); return { d: L ? mul(v, 1 / L) : [1, 0], L }; };
  // Öffnung in der Wand: Rechteck über die ganze Wanddicke, at = Mitte ab Wandanfang
  function opPoly(o) {
    if (o.type === 'hole') return [[-o.w / 2, -o.d / 2], [o.w / 2, -o.d / 2], [o.w / 2, o.d / 2], [-o.w / 2, o.d / 2]].map(q => add(o.p, q));
    const w = hostOf(o);
    if (!w) return [];
    const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), A = add(w.a, mul(d, o.at - o.w / 2)), Bp = add(w.a, mul(d, o.at + o.w / 2));
    return [add(A, mul(n, lo)), add(Bp, mul(n, lo)), add(Bp, mul(n, hi)), add(A, mul(n, hi))];
  }
  const opZ = o => { if (o.type === 'hole') { const h = hostOf(o); return h ? zRange(h) : [0, 0]; } const w = hostOf(o), z0 = w ? zRange(w)[0] : st(o.storey).elev; return [z0 + (o.sill || 0), z0 + (o.sill || 0) + o.h]; };
  const footprint = e => (e.type === 'wall' ? wallPoly(e) : e.type === 'column' ? colPoly(e) : OPS.includes(e.type) ? opPoly(e) : e.pts);
  const zOf = e => (OPS.includes(e.type) ? opZ(e) : zRange(e));
  // Streifen eines konvexen Grundrisses zwischen s0 und s1 entlang der Wandachse
  function clipStrip(poly, a, d, s0, s1) {
    const clip = (P, f) => { const out = []; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], fp = f(p), fq = f(q); if (fp >= 0) out.push(p); if ((fp >= 0) !== (fq >= 0)) out.push(add(p, mul(sub(q, p), fp / (fp - fq)))); } return out; };
    const sv = p => dot(sub(p, a), d);
    return clip(clip(poly, p => sv(p) - s0), p => s1 - sv(p));
  }
  // Wand mit Öffnungen in Stücke: neben den Öffnungen ganz, darunter Brüstung, darüber Sturz
  function wallPieces(w) {
    const poly = wallPoly(w), [z0, z1] = zRange(w), { d } = wallAxis(w);
    const ops = B.els.filter(o => o.host === w.id && WALL_OPS.includes(o.type)).map(o => ({ s0: o.at - o.w / 2, s1: o.at + o.w / 2, b: z0 + (o.sill || 0), t: z0 + (o.sill || 0) + o.h }));
    if (!ops.length) return [{ poly, z0, z1 }];
    const cuts = [...new Set([-1e7, ...ops.flatMap(o => [o.s0, o.s1]), 1e7])].sort((a, b) => a - b), out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1], m = (s0 + s1) / 2, strip = clipStrip(poly, w.a, d, s0, s1);
      if (strip.length < 3 || s1 - s0 < 0.01) continue;
      const hit = ops.filter(o => m > o.s0 && m < o.s1);
      if (!hit.length) { out.push({ poly: strip, z0, z1 }); continue; }
      const lo2 = Math.min(...hit.map(o => o.b)), hi2 = Math.max(...hit.map(o => o.t));
      if (lo2 > z0 + 0.5) out.push({ poly: strip, z0, z1: Math.min(lo2, z1) });
      if (hi2 < z1 - 0.5) out.push({ poly: strip, z0: Math.max(hi2, z0), z1 });
    }
    return out;
  }
  const slabArea = e => Math.abs(area2(e.pts)) / 1e6;

  // ---------- Kamera ----------
  const basis = () => {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { rx: [cy, -sy, 0], ry: [-sy * sp, -cy * sp, -cp], rz: [sy * cp, cy * cp, -sp] };
  };
  const P3 = p => { const { rx, ry, rz } = basis(), d = sub(p, mid); return [W / 2 + cam.panX + dot(rx, d) * cam.sc, H / 2 + cam.panY + dot(ry, d) * cam.sc, dot(rz, d)]; };
  const P2 = (p, z = curSt().elev) => P3([p[0], p[1], z]);
  const unP = (x, y, z) => { const { rx, ry, rz } = basis(); return add(add(add(mid, mul(rx, (x - W / 2 - cam.panX) / cam.sc)), mul(ry, (y - H / 2 - cam.panY) / cam.sc)), mul(rz, z)); };
  // Bildpunkt auf die Arbeitsebene (Oberkante Rohdecke des aktuellen Geschosses)
  const onPlane = (x, y, z0 = curSt().elev) => { const { rz } = basis(); if (Math.abs(rz[2]) < 0.12) return null; const P = unP(x, y, 0), t = (z0 - P[2]) / rz[2]; return [P[0] + rz[0] * t, P[1] + rz[1] * t]; };
  function bounds() {
    const pts = [];
    B.els.forEach(e => { if (!visible(st(e.storey))) return; const [z0, z1] = zOf(e); footprint(e).forEach(p => pts.push([...p, z0], [...p, z1])); });
    B.grids.forEach(g => pts.push([...g.a, curSt().elev], [...g.b, curSt().elev]));
    B.underlays.filter(u => u.storey === cur).forEach(u => ulCorners(u).forEach(p => pts.push([...p, curSt().elev])));
    if (!pts.length) pts.push([-5000, -5000, curSt().elev], [15000, 10000, curSt().elev + curSt().height]);
    const mn = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), mx = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
    return { mn, mx };
  }
  function fitView() {
    const { mn, mx } = bounds();
    mid = mn.map((v, k) => (v + mx[k]) / 2); size = Math.max(1000, len(sub(mx, mn)));
    const side = listOpen && W > 900 ? 300 : 0, { rx, ry } = basis();
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => [0, 1, 2].map(k => ((b >> k) & 1 ? mx[k] : mn[k])));
    const ext = (r) => Math.max(1, ...corners.map(c => Math.abs(dot(r, sub(c, mid))))) * 2;
    cam.sc = Math.min((W - side - 40) / ext(rx), (H - 200) / ext(ry)) * 0.92;
    cam.panX = side / 2; cam.panY = -20;
  }
  function setPlan(on) {
    const keep = [W / 2 + cam.panX, H / 2 + cam.panY];
    cam.plan = on;
    if (on) { cam.yaw = 0; cam.pitch = Math.PI / 2 - 1e-4; } else { cam.yaw = -0.6; cam.pitch = 0.55; }
    fitView(); dirty = true; renderUi(); draw();
    return keep;
  }

  // ---------- WebGL ----------
  const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uM; uniform mat3 uR; varying vec3 vN; varying vec3 vC;
void main() { gl_Position = uM * vec4(aPos, 1.0); vN = uR * aNor; vC = aCol; }`;
  const FS = `precision mediump float;
uniform vec3 uL; uniform float uAlpha; uniform float uFlat; varying vec3 vN; varying vec3 vC;
void main() { vec3 n = normalize(vN); float d = abs(dot(n, uL)); vec3 col = mix(vC * (0.55 + 0.5 * d), vC, uFlat); gl_FragColor = vec4(col * uAlpha, uAlpha); }`;
  const gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  let glp = null, triN = 0, lineN = 0, prevN = 0;
  if (gl) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    const u = n => gl.getUniformLocation(p, n), a = n => gl.getAttribLocation(p, n);
    glp = { p, tris: gl.createBuffer(), lines: gl.createBuffer(), prev: gl.createBuffer(), aPos: a('aPos'), aNor: a('aNor'), aCol: a('aCol'), uM: u('uM'), uR: u('uR'), uL: u('uL'), uAlpha: u('uAlpha'), uFlat: u('uFlat') };
  }
  const attribs = () => { [[glp.aPos, 0], [glp.aNor, 12], [glp.aCol, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off); }); };
  // Prisma aus Grundriss und Höhen: Deckel, Boden, Seiten; Kanten als Linien
  function prism(poly, z0, z1, col, out, lines) {
    let P = poly.filter((p, i) => !near(p, poly[(i + 1) % poly.length], 0.01));
    if (P.length < 3) return;
    if (area2(P) < 0) P = [...P].reverse();
    const put = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
    triangulate(P).forEach(([a, b, c]) => {
      put([...P[a], z1], [0, 0, 1]); put([...P[b], z1], [0, 0, 1]); put([...P[c], z1], [0, 0, 1]);
      put([...P[a], z0], [0, 0, -1]); put([...P[c], z0], [0, 0, -1]); put([...P[b], z0], [0, 0, -1]);
    });
    const smooth = P.length > 16; // runde Stützen: keine Kanten auf dem Mantel
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], e = sub(q, p), l = len(e), n = [e[1] / l, -e[0] / l, 0];
      const A = [...p, z0], Bq = [...q, z0], C = [...q, z1], D = [...p, z1];
      [A, Bq, C, A, C, D].forEach(v => put(v, n));
      if (lines) { lines.push(A, Bq, D, C); if (!smooth) lines.push(A, D); }
    }
  }
  // Decke mit Durchbrüchen: Löcher über Brücken zum Außenrand in ein einfaches Polygon, Seiten außen und an den Löchern
  function prismHoles(outer, holes, z0, z1, col, out, lines) {
    if (!holes.length) { prism(outer, z0, z1, col, out, lines); return; }
    let P = area2(outer) < 0 ? [...outer].reverse() : [...outer];
    const Hs = holes.map(h => (area2(h) > 0 ? [...h].reverse() : [...h])).sort((a, b) => Math.max(...b.map(q => q[0])) - Math.max(...a.map(q => q[0])));
    const crosses = (a, b, segs) => segs.some(([c, e]) => { if (near(a, c, 1e-6) || near(a, e, 1e-6) || near(b, c, 1e-6) || near(b, e, 1e-6)) return false; const d1 = cross2(sub(b, a), sub(c, a)), d2 = cross2(sub(b, a), sub(e, a)), d3 = cross2(sub(e, c), sub(a, c)), d4 = cross2(sub(e, c), sub(b, c)); return d1 * d2 < 0 && d3 * d4 < 0; });
    const edges = poly => poly.map((q, i) => [q, poly[(i + 1) % poly.length]]);
    for (const h of Hs) {
      const mi = h.reduce((bi, q, i) => (q[0] > h[bi][0] ? i : bi), 0), M = h[mi];
      const segs = [...edges(P), ...Hs.flatMap(edges)];
      let vi = -1, bd = Infinity;
      P.forEach((q, i) => { const dd = len(sub(q, M)); if (dd < bd && !crosses(M, q, segs)) { bd = dd; vi = i; } });
      if (vi < 0) continue;
      const ring = [...h.slice(mi), ...h.slice(0, mi), M];
      P = [...P.slice(0, vi + 1), ...ring, P[vi], ...P.slice(vi + 1)];
    }
    const put = (p, n) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
    triangulate(P).forEach(([a, b, c]) => {
      put([...P[a], z1], [0, 0, 1]); put([...P[b], z1], [0, 0, 1]); put([...P[c], z1], [0, 0, 1]);
      put([...P[a], z0], [0, 0, -1]); put([...P[c], z0], [0, 0, -1]); put([...P[b], z0], [0, 0, -1]);
    });
    for (const ring of [area2(outer) < 0 ? [...outer].reverse() : outer, ...Hs]) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], e = sub(q, p), l = len(e);
      if (l < 0.01) continue;
      const n = [e[1] / l, -e[0] / l, 0], A = [...p, z0], Bq = [...q, z0], C = [...q, z1], D = [...p, z1];
      [A, Bq, C, A, C, D].forEach(v => put(v, n));
      if (lines) lines.push(A, Bq, D, C, A, D);
    }
  }
  // Rohr aus der Rohrplanung: Zylinder je Abschnitt
  function tubeInto(pts, r, col, out) {
    const N = 10;
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i], e = pts[i + 1], ax = sub(e, s), L = len(ax);
      if (L < 0.01) continue;
      const a = mul(ax, 1 / L), u0 = Math.abs(a[2]) < 0.9 ? [a[1], -a[0], 0] : [1, 0, 0], u = norm(sub(u0, mul(a, dot(u0, a)))), w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
      for (let k = 0; k < N; k++) {
        const t0 = 2 * Math.PI * k / N, t1 = 2 * Math.PI * (k + 1) / N, n0 = add(mul(u, Math.cos(t0)), mul(w, Math.sin(t0))), n1 = add(mul(u, Math.cos(t1)), mul(w, Math.sin(t1)));
        const A = add(s, mul(n0, r)), Bq = add(s, mul(n1, r)), C = add(e, mul(n1, r)), D = add(e, mul(n0, r));
        [[A, n0], [Bq, n1], [C, n1], [A, n0], [C, n1], [D, n0]].forEach(([p, n]) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]));
      }
    }
  }
  const COL = { wall: [0.87, 0.85, 0.81], column: [0.70, 0.73, 0.77], slab: [0.78, 0.79, 0.81] };
  // Grundriss: geschnittene Bauteile dunkel, Decken hell, ohne Schattierung
  const PLAN = { wall: [0.36, 0.38, 0.41], column: [0.22, 0.24, 0.27], slab: [0.95, 0.95, 0.94] };
  function buildGeometry() {
    const tris = [], lines = [], acc = rgb('--accent', [0.04, 0.49, 0.74]);
    for (const e of B.els) {
      const s = st(e.storey);
      if (!s || !visible(s) || OPS.includes(e.type)) continue;
      const [z0, z1] = zRange(e), isSel = sel?.el === e.id;
      let c = isSel ? (cam.plan ? acc : acc.map(v => v * 0.7 + 0.3)) : (cam.plan ? PLAN : COL)[e.type];
      if (s.id !== cur) c = c.map(v => v * 0.92 + 0.06);
      if (e.type === 'wall') {
        const pieces = wallPieces(e);
        pieces.forEach(pc => prism(pc.poly, pc.z0, pc.z1, c, tris, null));
        prism(footprint(e), z0, z1, c, [], lines); // Kanten der ganzen Wand
        B.els.filter(o => o.host === e.id && WALL_OPS.includes(o.type)).forEach(o => { // Kanten der Öffnungen auf beiden Seiten
          const P = opPoly(o), [b, t] = opZ(o);
          [[P[0], P[1]], [P[3], P[2]]].forEach(([p, q]) => lines.push([...p, b], [...q, b], [...q, b], [...q, t], [...q, t], [...p, t], [...p, t], [...p, b]));
        });
      } else if (e.type === 'slab') prismHoles(e.pts, B.els.filter(o => o.host === e.id && o.type === 'hole').map(opPoly), z0, z1, c, tris, lines);
      else prism(footprint(e), z0, z1, c, tris, lines);
    }
    // Ausgewählte Öffnung: als durchsichtiger Körper hervorheben
    const so = selEl();
    if (so && OPS.includes(so.type)) { const [b, t] = opZ(so); prism(opPoly(so), b - 2, t + 2, acc, tris, lines); }
    // Rohrprojekte der Geschosse
    (B.links || []).forEach(L => {
      const s = st(L.storey);
      if (!s || !visible(s)) return;
      const off = [L.off[0], L.off[1], L.off[2] + s.elev];
      pipeGeom(L.scene).forEach(pp => tubeInto(pp.pts.map(q => add(q, off)), Math.max(pp.r, 1.6 / cam.sc), pp.col, tris));
    });
    triN = tris.length / 9;
    const L = new Float32Array(lines.length * 9);
    lines.forEach((p, i) => L.set([p[0], p[1], p[2], 0, 0, 1, 0, 0, 0], i * 9));
    lineN = lines.length;
    if (glp) {
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.tris); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.lines); gl.bufferData(gl.ARRAY_BUFFER, L, gl.STATIC_DRAW);
    }
    dirty = false;
  }
  // Vorschau beim Zeichnen: durchsichtig
  function previewGeometry() {
    const out = [], acc = rgb('--accent', [0.04, 0.49, 0.74]), s = curSt();
    const pv = cmdPreview();
    if (pv) prism(pv.poly, pv.z0, pv.z1, acc, out, null);
    prevN = out.length / 9;
    if (glp && prevN) { gl.bindBuffer(gl.ARRAY_BUFFER, glp.prev); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW); }
    return s;
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
  function makeGrid(nx, sx, ny, sy) {
    const W2 = (nx - 1) * sx, H2 = (ny - 1) * sy, ex = 1500;
    change(() => {
      B.grids = [];
      for (let i = 0; i < nx; i++) B.grids.push({ id: uid(), name: String(i + 1), a: [i * sx, -ex], b: [i * sx, H2 + ex] });
      for (let j = 0; j < ny; j++) B.grids.push({ id: uid(), name: letter(j), a: [-ex, j * sy], b: [W2 + ex, j * sy] });
    });
    gridForm = false; fitView(); renderUi(); draw();
  }

  // ---------- Planunterlage ----------
  // Bildpunkt (u, v) → Grundriss: pos ist die linke obere Bildecke, s mm je Bildpunkt, rot in Grad
  const ulMap = (u, x, y) => { const a = (u.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), X = x * u.s, Y = -y * u.s; return [u.pos[0] + X * c - Y * s, u.pos[1] + X * s + Y * c]; };
  const ulCorners = u => [[0, 0], [u.w, 0], [u.w, u.h], [0, u.h]].map(([x, y]) => ulMap(u, x, y));
  async function ulImage(u) {
    if (imgs.has(u.file)) return imgs.get(u.file);
    imgs.set(u.file, null);
    const blob = await getFile(u.file).catch(() => null);
    if (!blob) return null;
    const img = new Image();
    img.onload = () => { imgs.set(u.file, img); draw(); };
    img.src = URL.createObjectURL(blob);
    return null;
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
      // Vorläufig 20 m breit, mittig im Raster; danach kalibrieren
      const { mn, mx } = bounds(), s = 20000 / img.naturalWidth, c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2];
      const old = B.underlays.find(u => u.storey === cur);
      change(() => {
        if (old) B.underlays = B.underlays.filter(u => u !== old);
        B.underlays.push({ id, storey: cur, file: fileId, name: file.name, w: img.naturalWidth, h: img.naturalHeight, s, rot: 0, alpha: 0.55, pos: [c[0] - img.naturalWidth * s / 2, c[1] + img.naturalHeight * s / 2] });
      });
      if (old) delFile(old.file).catch(() => {});
      fitView(); startCmd('cal');
      env.toast('Unterlage geladen. Jetzt kalibrieren: zwei Punkte mit bekanntem Abstand tippen.');
    } catch (e) { env.toast(`Unterlage: ${e.message || e}`); }
  }
  const curUl = () => B.underlays.find(u => u.storey === cur);

  // ---------- Fangen ----------
  let touch = false;
  function snapAt(x, y, o = {}) {
    const z = curSt().elev, tol = touch ? 20 : 11;
    let best = null;
    const consider = (p, label) => { if (!p) return; const s = P2(p, z), d = Math.hypot(s[0] - x, s[1] - y); if (d < tol && (!best || d < best.d)) best = { p: [...p], label, d }; };
    B.els.forEach(e => {
      if (e.storey !== cur || o.skip?.has(e.id)) return;
      if (e.type === 'wall') { consider(e.a, 'Wandende'); consider(e.b, 'Wandende'); consider(mul(add(e.a, e.b), 0.5), 'Wandmitte'); }
      else if (e.type === 'column') consider(e.p, 'Stütze');
      else if (e.type === 'slab') e.pts.forEach(q => consider(q, 'Eckpunkt'));
    });
    // Wandenden des Geschosses darunter: Wände stehen oft übereinander
    const below = sorted().filter(s => s.elev < z).at(-1);
    if (below) B.els.forEach(e => { if (e.storey === below.id && e.type === 'wall') { consider(e.a, 'Wandende darunter'); consider(e.b, 'Wandende darunter'); } });
    gridCross().forEach(q => consider(q.p, q.label));
    (o.extra || []).forEach(q => consider(q.p, q.label));
    if (best) return best;
    let p = onPlane(x, y, z);
    if (!p) return null;
    for (const g of B.grids) {
      const [d, t] = segD(x, y, P2(g.a, z), P2(g.b, z));
      if (d < tol * 0.7) {
        const q = add(g.a, mul(sub(g.b, g.a), t));
        if (o.from) { const v = sub(q, o.from), L = len(v); if (L > 1) return { p: add(o.from, mul(norm(v), Math.round(L / 10) * 10)), label: `auf Achse ${g.name}` }; }
        return { p: q, label: `auf Achse ${g.name}` };
      }
    }
    if (o.from) {
      const v = sub(p, o.from), L = Math.round(len(v) / 10) * 10;
      let ang = Math.atan2(v[1], v[0]);
      const q = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
      if (Math.abs(ang - q) < 0.06) ang = q;
      return { p: add(o.from, [Math.cos(ang) * L, Math.sin(ang) * L]), free: true };
    }
    return { p: p.map(v => Math.round(v / 10) * 10), free: true };
  }

  // ---------- Befehle ----------
  const lastOp = { kind: 'door', v: { door: { ...OP_DEF.door }, window: { ...OP_DEF.window }, opening: { ...OP_DEF.opening }, hole: { ...OP_DEF.hole } } };
  const lastWall = { th: 240, just: 'c' }, lastCol = { shape: 'rect', w: 300, d: 300 }, lastSlab = { th: 250 };
  function startCmd(t, extra = {}) {
    sel = null; hover = null; gridForm = false;
    if (t === 'sel') { cmd = null; tool = 'sel'; renderUi(); draw(); return; }
    if (['wall', 'column', 'slab', 'grid', 'open'].includes(t) && Math.abs(basis().rz[2]) < 0.12) setPlan(true);
    tool = ['wall', 'column', 'slab', 'grid', 'open'].includes(t) ? t : tool;
    cmd = { t, pts: [], ...extra };
    if (t === 'wall') Object.assign(cmd, { th: lastWall.th, just: lastWall.just });
    if (t === 'column') Object.assign(cmd, { ...lastCol });
    if (t === 'slab') Object.assign(cmd, { th: lastSlab.th });
    if (t === 'open') Object.assign(cmd, { kind: lastOp.kind, ...structuredClone(lastOp.v) });
    Object.assign(cmd, extra);
    dirty = true; renderUi(); draw();
  }
  function endCmd() { cmd = null; tool = 'sel'; hover = null; dirty = true; renderUi(); draw(); }
  // Vorschau des laufenden Befehls als Prisma
  function cmdPreview() {
    if (!cmd) return null;
    const s = curSt(), h = hover?.p;
    if (cmd.t === 'wall' && cmd.pts.length && h && !near(h, cmd.pts.at(-1))) {
      const w = { type: 'wall', storey: cur, a: cmd.pts.at(-1), b: h, t: cmd.th, just: cmd.just };
      const d = norm(sub(w.b, w.a)), n = perp(d), [lo, hi] = wallOffs(w);
      return { poly: [add(w.a, mul(n, lo)), add(w.b, mul(n, lo)), add(w.b, mul(n, hi)), add(w.a, mul(n, hi))], z0: s.elev, z1: s.elev + s.height };
    }
    if (cmd.t === 'column' && h) return { poly: colPoly({ ...cmd, p: h }), z0: s.elev, z1: s.elev + s.height };
    if (cmd.t === 'open' && hover?.op) { const o = hover.op; return { poly: opPoly(o), z0: opZ(o)[0], z1: opZ(o)[1] }; }
    if (cmd.t === 'slab' && cmd.pts.length >= 2) { const P = [...cmd.pts, ...(h ? [h] : [])]; return Math.abs(area2(P)) > 1 ? { poly: P, z0: s.elev - cmd.th, z1: s.elev } : null; }
    return null;
  }
  const newEl = o => ({ id: uid(), storey: cur, ...o });
  function addWall(a, b) {
    if (near(a, b, 1)) return;
    change(() => B.els.push(newEl({ type: 'wall', a: [...a], b: [...b], t: cmd.th, just: cmd.just, h: null })));
  }
  function wallClick(p) {
    if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
    const last = cmd.pts.at(-1);
    if (near(p, last, 1)) return;
    addWall(last, p);
    if (cmd.pts.length > 1 && near(p, cmd.pts[0], 1)) { cmd.pts = []; env.toast('Umriss geschlossen.'); }
    else cmd.pts.push(p);
    renderUi(); draw();
  }
  function wallLen(dir) { // Länge aus dem Feld in eine Richtung
    const L = num(cmd.len);
    if (!cmd.pts.length) { env.toast('Erst den Startpunkt tippen.'); return; }
    if (!(L > 0)) { env.toast('Länge eingeben.'); return; }
    const a = cmd.pts.at(-1), b = add(a, mul(dir, L));
    addWall(a, b); cmd.pts.push(b); renderUi(); draw();
  }
  function slabFromWalls() {
    const W2 = B.els.filter(e => e.type === 'wall' && e.storey === cur);
    if (W2.length < 3) { env.toast('Dafür braucht es einen geschlossenen Wandumriss.'); return null; }
    // Kette über gemeinsame Endpunkte suchen, die größte geschlossene
    const key = p => `${Math.round(p[0])},${Math.round(p[1])}`, adj = new Map();
    W2.forEach(w => [[w.a, w.b], [w.b, w.a]].forEach(([p, q]) => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push({ w, to: q }); }));
    let best = null;
    for (const start of W2) {
      const loop = [start.a], used = new Set([start.id]);
      let at = start.b, prev = start, ok = false;
      for (let g = 0; g < W2.length + 1; g++) {
        if (near(at, start.a)) { ok = true; break; }
        loop.push(at);
        const nx = (adj.get(key(at)) || []).find(x => !used.has(x.w.id));
        if (!nx) break;
        used.add(nx.w.id); prev = nx.w; at = nx.to;
      }
      if (ok && loop.length >= 3 && (!best || Math.abs(area2(loop)) > Math.abs(area2(best.loop)))) best = { loop, walls: [...used].map(elById) };
      void prev;
    }
    if (!best) { env.toast('Kein geschlossener Wandumriss gefunden.'); return null; }
    // Außenkante: jede Kante um die halbe Wanddicke (nach Lage) nach außen
    let P = best.loop;
    const ccw = area2(P) > 0;
    const offs = P.map((p, i) => {
      const q = P[(i + 1) % P.length], w = best.walls.find(w2 => (near(w2.a, p) && near(w2.b, q)) || (near(w2.a, q) && near(w2.b, p)));
      if (!w) return 0;
      const [lo, hi] = wallOffs(w), sameDir = near(w.a, p), left = sameDir ? hi : -lo;
      // nach außen = rechts bei gegen den Uhrzeigersinn
      return ccw ? (sameDir ? -lo : hi) : left;
    });
    const lines = P.map((p, i) => { const q = P[(i + 1) % P.length], d = norm(sub(q, p)), n = ccw ? [d[1], -d[0]] : perp(d); return { p: add(p, mul(n, offs[i])), d }; });
    const out = lines.map((L, i) => {
      const M = lines[(i + P.length - 1) % P.length], den = cross2(M.d, L.d);
      if (Math.abs(den) < 1e-9) return L.p;
      const t = cross2(sub(L.p, M.p), L.d) / den;
      return add(M.p, mul(M.d, t));
    });
    return out;
  }
  function addSlab(pts) {
    if (pts.length < 3 || Math.abs(area2(pts)) < 1e4) { env.toast('Umriss zu klein.'); return; }
    change(() => B.els.push(newEl({ type: 'slab', pts: pts.map(p => [...p]), t: cmd?.th ?? lastSlab.th })));
  }

  // Öffnung unter dem Zeiger: Wand (Tür, Fenster, Durchbruch) oder Decke (Deckendurchbruch)
  function opAt(x, y) {
    const k = cmd.kind, v = cmd[k], p = onPlane(x, y);
    if (!p) return null;
    if (k === 'hole') {
      const sl = B.els.filter(e => e.type === 'slab' && e.storey === cur).find(e => pip(p[0], p[1], e.pts));
      return sl ? { type: 'hole', host: sl.id, storey: cur, p: p.map(q => Math.round(q / 10) * 10), w: v.w, d: v.d } : null;
    }
    const tol = (touch ? 22 : 12) / cam.sc;
    let best = null;
    B.els.filter(e => e.type === 'wall' && e.storey === cur).forEach(w => {
      const [dd, t] = segD(p[0], p[1], w.a, w.b);
      if (dd < w.t / 2 + tol && (!best || dd < best.dd)) best = { w, dd, t };
    });
    if (!best) return null;
    const { L } = wallAxis(best.w), half = Math.min(v.w, L) / 2, at = Math.max(half, Math.min(L - half, Math.round(best.t * L / 10) * 10));
    return { type: k, host: best.w.id, storey: cur, at, w: Math.min(v.w, L), h: v.h, sill: v.sill, ...(k === 'door' ? { hinge: 'l', swing: 1 } : {}) };
  }
  function onTap(x, y) {
    if (cmd?.t === 'open') {
      const o = opAt(x, y);
      if (!o) { env.toast(cmd.kind === 'hole' ? 'Auf eine Decke tippen.' : 'Auf eine Wand tippen.'); return; }
      const id = uid();
      change(() => B.els.push({ id, ...o }));
      return;
    }
    if (!cmd) { pickSelect(x, y); return; }
    const from = cmd.t === 'wall' && cmd.pts.length ? cmd.pts.at(-1) : (cmd.t === 'slab' || cmd.t === 'grid' || cmd.t === 'cal' || cmd.t === 'umove') && cmd.pts.length ? cmd.pts.at(-1) : null;
    const extra = cmd.t === 'wall' && cmd.pts.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : cmd.t === 'slab' && cmd.pts.length > 2 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    const s = snapAt(x, y, { from: cmd.t === 'cal' || cmd.t === 'umove' ? null : from, extra });
    if (!s) { env.toast('In dieser Ansicht lässt sich nicht zeichnen. Grundriss oder 3D von schräg oben.'); return; }
    const p = s.p;
    if (cmd.t === 'wall') { wallClick(p); return; }
    if (cmd.t === 'column') { change(() => B.els.push(newEl({ type: 'column', p, shape: cmd.shape, w: cmd.w, d: cmd.shape === 'round' ? cmd.w : cmd.d, rot: 0, h: null }))); return; }
    if (cmd.t === 'slab') {
      if (cmd.pts.length > 2 && near(p, cmd.pts[0], 1)) { const P = cmd.pts; cmd.pts = []; addSlab(P); return; }
      cmd.pts.push(p); renderUi(); draw(); return;
    }
    if (cmd.t === 'grid') {
      if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
      const a = cmd.pts[0];
      if (near(a, p, 10)) return;
      const vertical = Math.abs(p[0] - a[0]) < Math.abs(p[1] - a[1]);
      change(() => B.grids.push({ id: uid(), name: nextGridName(vertical), a, b: p }));
      cmd.pts = []; renderUi(); draw(); return;
    }
    if (cmd.t === 'cal') {
      const q = onPlane(x, y) || p;
      cmd.pts.push(q);
      if (cmd.pts.length === 2) { const d = len(sub(cmd.pts[1], cmd.pts[0])); cmd.have = d; cmd.real = cmd.real ?? Math.round(d); }
      if (cmd.pts.length > 2) cmd.pts = [q];
      renderUi(); draw(); return;
    }
    if (cmd.t === 'umove') {
      if (!cmd.pts.length) { cmd.pts.push(onPlane(x, y) || p); renderUi(); draw(); return; }
      const u = curUl(), d = sub(p, cmd.pts[0]);
      if (u) change(() => { u.pos = add(u.pos, d); });
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
  function pickEl(x, y) {
    const hits = [];
    for (const e of B.els) {
      if (e.storey !== cur) continue;
      const fp = footprint(e), [z0, z1] = zOf(e);
      if (fp.length < 3) continue;
      const top = fp.map(p => P3([...p, z1])), bot = fp.map(p => P3([...p, z0]));
      const inside = e.type === 'slab' ? pip(x, y, top) || pip(x, y, bot) : pip(x, y, hull([...top, ...bot].map(s => [s[0], s[1]])));
      if (inside) hits.push({ e, pri: OPS.includes(e.type) ? -1 : { column: 0, wall: 1, slab: 2 }[e.type], z: Math.min(...top.map(s => s[2])) });
    }
    hits.sort((a, b) => a.pri - b.pri || a.z - b.z);
    if (hits.length) return { el: hits[0].e.id };
    const tol = touch ? 14 : 8;
    for (const g of B.grids) if (segD(x, y, P2(g.a), P2(g.b))[0] < tol) return { grid: g.id };
    return null;
  }
  function pickSelect(x, y) { sel = pickEl(x, y); dirty = true; renderUi(); draw(); }
  const selEl = () => (sel?.el ? elById(sel.el) : null), selGrid = () => (sel?.grid ? B.grids.find(g => g.id === sel.grid) : null);
  // Anfasser der Auswahl: Punkte im Grundriss
  function handles() {
    const e = selEl(), g = selGrid(), H2 = [];
    if (e?.type === 'wall') H2.push({ k: 'a', p: e.a }, { k: 'b', p: e.b }, { k: 'm', p: mul(add(e.a, e.b), 0.5), move: true });
    if (e?.type === 'column') H2.push({ k: 'p', p: e.p, move: true });
    if (e?.type === 'slab') e.pts.forEach((p, i) => H2.push({ k: i, p }));
    if (e && WALL_OPS.includes(e.type) && hostOf(e)) { const w = hostOf(e); H2.push({ k: 'o', p: add(w.a, mul(wallAxis(w).d, e.at)), move: true }); }
    if (e?.type === 'hole') H2.push({ k: 'o', p: e.p, move: true });
    if (g) H2.push({ k: 'a', p: g.a }, { k: 'b', p: g.b });
    return H2;
  }
  function handleAt(x, y) {
    const tol = touch ? 22 : 12;
    let best = null;
    for (const h of handles()) { const s = P2(h.p), d = Math.hypot(s[0] - x, s[1] - y); if (d < tol && (!best || d < best.d)) best = { ...h, d }; }
    return best;
  }
  // Ziehen beginnen: Mit dem Wandende laufen die Enden verbundener Wände mit
  function dragStart(h) {
    const e = selEl(), g = selGrid(), before = snap(), follow = [];
    if (e?.type === 'wall') {
      const pts = h.k === 'm' ? [e.a, e.b] : [e[h.k]];
      B.els.forEach(o => { if (o === e || o.type !== 'wall' || o.storey !== e.storey) return; for (const w of ['a', 'b']) if (pts.some(p => near(o[w], p))) follow.push({ o, w, from: [...o[w]] }); });
    }
    return { h, before, e, g, follow, a0: e?.a && [...e.a], b0: e?.b && [...e.b], p0: e?.p && [...e.p], pts0: e?.pts && e.pts.map(p => [...p]), ga: g && [...g.a], gb: g && [...g.b] };
  }
  function dragMove(D, x, y) {
    const { h, e, g } = D, skip = new Set([e?.id, ...D.follow.map(f => f.o.id)].filter(Boolean));
    const anchor = h.k === 'a' ? (e ? D.b0 : D.gb) : h.k === 'b' ? (e ? D.a0 : D.ga) : null;
    const s = snapAt(x, y, { skip, from: anchor });
    if (!s) return;
    const p = s.p;
    if (e?.type === 'wall') {
      if (h.k === 'm') { const d = sub(p, mul(add(D.a0, D.b0), 0.5)); e.a = add(D.a0, d); e.b = add(D.b0, d); D.follow.forEach(f => { f.o[f.w] = add(f.from, d); }); }
      else { e[h.k] = p; D.follow.forEach(f => { f.o[f.w] = [...p]; }); }
    } else if (e?.type === 'column') e.p = p;
    else if (e?.type === 'slab') e.pts[h.k] = p;
    else if (e && WALL_OPS.includes(e.type)) { const w = hostOf(e), { d, L } = wallAxis(w), half = e.w / 2; e.at = Math.max(half, Math.min(L - half, Math.round(dot(sub(p, w.a), d) / 10) * 10)); }
    else if (e?.type === 'hole') e.p = p;
    else if (g) g[h.k] = p;
    hover = { p, label: s.label };
    dirty = true; draw();
  }
  function dragEnd(D) {
    if (snap() === D.before) return;
    undo.push(D.before); redo.length = 0; persist(); renderUi();
  }

  // ---------- Zeichnen (Beschriftung, Raster, Anfasser) ----------
  function renderOverlay() {
    const dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const z = curSt().elev, acc = css('--accent') || '#0a7cbd', mark = css('--mark') || '#ff7a1a', text = css('--text') || '#222', muted = css('--muted') || '#888';
    // Unterlage: über dem Modell, durchscheinend
    const u = curUl();
    if (u && (cam.plan || cmd?.t === 'cal' || cmd?.t === 'umove')) { // in 3D nur beim Ausrichten, sonst verdeckt sie das Modell
      const img = imgs.get(u.file);
      if (img === undefined) ulImage(u);
      if (img) {
        const O = P2(ulMap(u, 0, 0), z), X = P2(ulMap(u, 1, 0), z), Y = P2(ulMap(u, 0, 1), z);
        ctx.save(); ctx.globalAlpha = u.alpha ?? 0.55;
        ctx.transform(X[0] - O[0], X[1] - O[1], Y[0] - O[0], Y[1] - O[1], O[0], O[1]);
        ctx.drawImage(img, 0, 0); ctx.restore();
      }
    }
    // Ursprung
    { const o = P2([0, 0], z); ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o[0] - 6, o[1]); ctx.lineTo(o[0] + 6, o[1]); ctx.moveTo(o[0], o[1] - 6); ctx.lineTo(o[0], o[1] + 6); ctx.stroke(); }
    // Achsraster: Strich-Punkt, Kreise mit Namen an beiden Enden
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    B.grids.forEach(g => {
      const a = P2(g.a, z), b = P2(g.b, z), on = sel?.grid === g.id;
      ctx.strokeStyle = on ? acc : 'rgba(200,60,60,.75)'; ctx.lineWidth = on ? 2 : 1; ctx.setLineDash([14, 4, 2, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      const d = norm(sub(b.slice(0, 2), a.slice(0, 2)));
      for (const [p, sgn] of [[a, -1], [b, 1]]) {
        const c = [p[0] + d[0] * 13 * sgn, p[1] + d[1] * 13 * sgn];
        ctx.fillStyle = css('--card') || '#fff'; ctx.beginPath(); ctx.arc(c[0], c[1], 12, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = on ? acc : 'rgb(200,60,60)'; ctx.fillText(g.name, c[0], c[1] + 0.5);
      }
    });
    // Grundriss: Türaufschlag als Viertelkreis, Fenster als Doppellinie
    if (cam.plan) B.els.forEach(o => {
      if (o.storey !== cur || !WALL_OPS.includes(o.type) || o.type === 'opening') return;
      const w = hostOf(o);
      if (!w) return;
      const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), col = sel?.el === o.id ? acc : (css('--text') || '#333');
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      if (o.type === 'window') {
        const P = opPoly(o).map(q => P2(q, z));
        ctx.fillStyle = css('--card') || '#fff'; ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
        const m0 = P2(add(add(w.a, mul(d, o.at - o.w / 2)), mul(n, (lo + hi) / 2)), z), m1 = P2(add(add(w.a, mul(d, o.at + o.w / 2)), mul(n, (lo + hi) / 2)), z);
        ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
        return;
      }
      const sw = o.swing ?? 1, face = sw > 0 ? hi : lo, hingeS = (o.hinge || 'l') === 'l' ? o.at - o.w / 2 : o.at + o.w / 2, freeS = (o.hinge || 'l') === 'l' ? o.at + o.w / 2 : o.at - o.w / 2;
      const Hp = add(add(w.a, mul(d, hingeS)), mul(n, face)), Fp = add(add(w.a, mul(d, freeS)), mul(n, face)), Op = add(Hp, mul(n, sw * o.w));
      const h2 = P2(Hp, z), f2 = P2(Fp, z), o2 = P2(Op, z), r2 = Math.hypot(f2[0] - h2[0], f2[1] - h2[1]);
      const a0 = Math.atan2(f2[1] - h2[1], f2[0] - h2[0]), a1 = Math.atan2(o2[1] - h2[1], o2[0] - h2[0]);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      ctx.beginPath(); ctx.moveTo(h2[0], h2[1]); ctx.lineTo(o2[0], o2[1]); ctx.stroke();
      ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(h2[0], h2[1], r2, a0, a0 + da, da < 0); ctx.stroke(); ctx.setLineDash([]);
    });
    // Maße der Auswahl
    const e = selEl();
    if (e?.type === 'wall') dimLine(e.a, e.b, `${fmt(len(sub(e.b, e.a)))}`, acc, z);
    if (e && WALL_OPS.includes(e.type) && hostOf(e)) { const w = hostOf(e), { d } = wallAxis(w); dimLine(w.a, add(w.a, mul(d, e.at - e.w / 2)), fmt(e.at - e.w / 2), acc, z); dimLine(add(w.a, mul(d, e.at - e.w / 2)), add(w.a, mul(d, e.at + e.w / 2)), fmt(e.w), acc, z); }
    // Befehl: gesetzte Punkte und Länge zum Zeiger
    if (cmd) {
      const pts = cmd.pts || [];
      pts.forEach((p, i) => dot2(P2(p, z), i === 0 ? 5 : 4, mark));
      if ((cmd.t === 'slab' || cmd.t === 'cal' || cmd.t === 'grid') && pts.length) {
        ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.setLineDash(cmd.t === 'slab' ? [] : [6, 4]);
        ctx.beginPath(); pts.forEach((p, i) => { const s = P2(p, z); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
        if (hover?.p && cmd.t !== 'cal') { const s = P2(hover.p, z); ctx.lineTo(s[0], s[1]); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (hover?.op && hover.op.type !== 'hole') { const o = hover.op, w = hostOf(o), { d } = wallAxis(w); dimLine(w.a, add(w.a, mul(d, o.at - o.w / 2)), fmt(o.at - o.w / 2), mark, z); }
      if (hover?.p && pts.length && ['wall', 'grid', 'slab'].includes(cmd.t)) dimLine(pts.at(-1), hover.p, fmt(len(sub(hover.p, pts.at(-1)))), mark, z);
      if (cmd.t === 'cal' && pts.length === 2) dimLine(pts[0], pts[1], `${fmt(cmd.have)} → ${fmt(num(cmd.real))}`, mark, z);
    }
    // Anfasser
    if (!cmd) handles().forEach(h => { const s = P2(h.p, z); ctx.fillStyle = css('--card') || '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); if (h.move) ctx.rect(s[0] - 6, s[1] - 6, 12, 12); else ctx.arc(s[0], s[1], 6, 0, 7); ctx.fill(); ctx.stroke(); });
    // Fangpunkt unter dem Zeiger
    if (hover?.p) {
      const s = P2(hover.p, z);
      ctx.strokeStyle = hover.label ? mark : acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], hover.label ? 8 : 5, 0, 7); ctx.stroke();
      if (hover.label) tag(s[0], s[1] - 22, hover.label, mark);
    }
    void text;
  }
  function dot2(s, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7); ctx.fill(); }
  function tag(x, y, t, c) {
    ctx.font = '600 12px system-ui'; const w = ctx.measureText(t).width + 12;
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 0.5);
  }
  function dimLine(p, q, t, c, z) {
    const a = P2(p, z), b = P2(q, z), d = norm(sub(b.slice(0, 2), a.slice(0, 2))), n = [-d[1] * 34, d[0] * 34];
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

  // ---------- Leisten und Felder ----------
  const fld = (k, v, label, unit = 'mm', ph = '') => `<label class="ped-f"><span>${label}</span><input data-f="${k}" inputmode="decimal" value="${v == null || v === '' ? '' : fmt(v)}"${ph ? ` placeholder="${ph}"` : ''}><i>${unit}</i></label>`;
  const seg = (k, val, opts) => `<span class="ped-seg">${opts.map(([v, t]) => `<button data-seg="${k}:${v}"${val === v ? ' class="on"' : ''}>${t}</button>`).join('')}</span>`;
  function renderUi() {
    $('.ped-title').textContent = `Gebäude · ${curSt().name} (Experiment)`;
    root.classList.toggle('list-open', listOpen);
    root.querySelectorAll('[data-b^="t:"]').forEach(b => b.classList.toggle('on', b.dataset.b === `t:${cmd ? cmd.t : 'sel'}`));
    $('[data-b="view"]').innerHTML = SVG(cam.plan ? IC.iso : IC.plan);
    $('[data-b="view"]').title = cam.plan ? '3D' : 'Grundriss';
    $('[data-b="undo"]').disabled = !undo.length; $('[data-b="redo"]').disabled = !redo.length;
    renderList(); renderCmd(); renderInfo();
  }
  function renderCmd() {
    cmdEl.hidden = !cmd;
    if (!cmd) { cmdEl.innerHTML = ''; return; }
    const done = '<button data-b="end" class="on">Fertig</button>', cancel = '<button data-b="end">Abbrechen</button>';
    let h = '';
    if (cmd.t === 'wall') {
      h = `<span class="bprompt">${cmd.pts.length ? 'Nächster Punkt' : 'Wand: Startpunkt tippen'}</span>${fld('th', cmd.th, 'Dicke')}${seg('just', cmd.just, JUST)}`;
      if (cmd.pts.length) h += `${fld('len', cmd.len ?? '', 'Länge', 'mm', '0')}<span class="ped-seg">${[['1,0', '→'], ['0,1', '↑'], ['-1,0', '←'], ['0,-1', '↓']].map(([v, t]) => `<button data-dir="${v}" title="Länge in diese Richtung">${t}</button>`).join('')}</span><button data-b="chain">Neu ansetzen</button>`;
      h += done;
    } else if (cmd.t === 'column') {
      h = `<span class="bprompt">Stütze: Punkt tippen</span>${seg('shape', cmd.shape, [['rect', 'Eckig'], ['round', 'Rund']])}${fld('w', cmd.w, cmd.shape === 'round' ? 'Ø' : 'B')}${cmd.shape === 'round' ? '' : fld('d', cmd.d, 'T')}${done}`;
    } else if (cmd.t === 'slab') {
      h = `<span class="bprompt">${cmd.pts.length ? `${cmd.pts.length} Punkte · Startpunkt schließt` : 'Decke: Umriss tippen'}</span>${fld('th', cmd.th, 'Dicke')}<button data-b="fromwalls">Aus Wänden</button>${cmd.pts.length >= 3 ? '<button data-b="slabok" class="on">Schließen</button>' : ''}${cancel}`;
    } else if (cmd.t === 'open') {
      const v = cmd[cmd.kind];
      h = `<span class="bprompt">${cmd.kind === 'hole' ? 'Auf eine Decke tippen' : 'Auf eine Wand tippen'}</span>${seg('okind', cmd.kind, [['door', 'Tür'], ['window', 'Fenster'], ['opening', 'Durchbruch'], ['hole', 'Decke']])}${fld('ow', v.w, 'B')}${cmd.kind === 'hole' ? fld('od', v.d, 'T') : fld('oh', v.h, 'H')}${cmd.kind === 'window' || cmd.kind === 'opening' ? fld('osill', v.sill, cmd.kind === 'window' ? 'Brüstung' : 'UK') : ''}${done}`;
    } else if (cmd.t === 'grid') {
      h = `<span class="bprompt">${cmd.pts.length ? 'Endpunkt der Achse' : 'Achse: zwei Punkte tippen'}</span><button data-b="gridform"${gridForm ? ' class="on"' : ''}>Raster erzeugen</button>${done}`;
    } else if (cmd.t === 'cal') {
      h = `<span class="bprompt">${cmd.pts.length < 2 ? `Kalibrieren: ${cmd.pts.length ? 'zweiten' : 'ersten'} Punkt auf dem Plan tippen` : 'Echter Abstand'}</span>${cmd.pts.length === 2 ? `${fld('real', cmd.real, 'Abstand')}<button data-b="calok" class="on">Übernehmen</button>` : ''}${cancel}`;
    } else if (cmd.t === 'umove') {
      h = `<span class="bprompt">${cmd.pts.length ? 'Zielpunkt tippen (fängt an Achsen und Wänden)' : 'Unterlage verschieben: Punkt auf dem Plan tippen'}</span>${cancel}`;
    }
    cmdEl.innerHTML = h;
  }
  function renderInfo() {
    const e = selEl(), g = selGrid();
    let h = '';
    if (cmd?.t === 'grid' && gridForm) {
      h = `<h4>Raster erzeugen</h4><small>Ersetzt die vorhandenen Achsen. Achsen 1, 2, 3 … laufen senkrecht im Grundriss, A, B, C … waagerecht. Ursprung ist Achse 1/A.</small>
        <div class="ped-grid">${fld('gnx', cmd.gnx ?? 5, 'Achsen 1…', 'Stk')}${fld('gsx', cmd.gsx ?? 6000, 'Abstand')}</div>
        <div class="ped-grid">${fld('gny', cmd.gny ?? 3, 'Achsen A…', 'Stk')}${fld('gsy', cmd.gsy ?? 6000, 'Abstand')}</div>
        <div class="ped-acts"><button data-b="gridmake" class="on">Erzeugen</button></div>`;
    } else if (e?.type === 'wall') {
      const s = st(e.storey);
      h = `<h4>Wand</h4><div class="ped-grid">${fld('wl', len(sub(e.b, e.a)), 'Länge')}${fld('wt', e.t, 'Dicke')}</div>
        <div class="ped-grid">${fld('wh', e.h ?? '', 'Höhe', 'mm', fmt(s.height))}${fld('wbase', e.base || 0, 'Fuß')}</div>
        <div class="ped-acts"><span class="bprompt">Lage zur Achse</span>${seg('wjust', e.just, JUST)}</div>
        <small>Länge ändert das Ende, der Anfang bleibt. Höhe leer: bis OK Rohdecke ${esc(nextName(s))}.</small>
        <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
    } else if (e?.type === 'column') {
      const s = st(e.storey);
      h = `<h4>Stütze</h4><div class="ped-acts">${seg('cshape', e.shape, [['rect', 'Eckig'], ['round', 'Rund']])}</div>
        <div class="ped-grid">${fld('cw', e.w, e.shape === 'round' ? 'Ø' : 'B')}${e.shape === 'round' ? '' : fld('cd', e.d, 'T') + fld('crot', e.rot || 0, 'Drehung', '°')}</div>
        <div class="ped-grid">${fld('ch', e.h ?? '', 'Höhe', 'mm', fmt(s.height))}</div><small>Höhe leer: bis OK Rohdecke ${esc(nextName(s))}.</small>
        <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
    } else if (e?.type === 'slab') {
      h = `<h4>Decke</h4><div class="ped-grid">${fld('st', e.t, 'Dicke')}</div><small>${fmt(slabArea(e))} m² · ${e.pts.length} Eckpunkte. Oberkante = OK Rohdecke ${esc(st(e.storey).name)} (${fmt(st(e.storey).elev)}).</small>
        <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
    } else if (e && WALL_OPS.includes(e.type)) {
      const w = hostOf(e), L = w ? wallAxis(w).L : 0;
      h = `<h4>${TYPE_NAME[e.type]}</h4><div class="ped-grid">${fld('pw', e.w, 'Breite')}${fld('ph', e.h, 'Höhe')}</div>
        <div class="ped-grid">${fld('pleft', e.at - e.w / 2, 'ab Wandanfang')}${e.type === 'door' ? '' : fld('psill', e.sill || 0, e.type === 'window' ? 'Brüstung' : 'UK')}</div>
        ${e.type === 'door' ? `<div class="ped-acts">${seg('phinge', e.hinge || 'l', [['l', 'Anschlag links'], ['r', 'rechts']])}${seg('pswing', String(e.swing ?? 1), [['1', 'Aufschlag hier'], ['-1', 'drüben']])}</div>` : ''}
        <small>In der Wand ${fmt(L)} mm, rechts bleiben ${fmt(L - e.at - e.w / 2)} mm. Ziehen am Quadrat verschiebt entlang der Wand.</small>
        <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
    } else if (e?.type === 'hole') {
      h = `<h4>Deckendurchbruch</h4><div class="ped-grid">${fld('pw', e.w, 'B')}${fld('pd', e.d, 'T')}</div><small>Mitte X ${fmt(e.p[0])} · Y ${fmt(e.p[1])}. Ziehen am Quadrat verschiebt.</small>
        <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
    } else if (g) {
      h = `<h4>Achse</h4><label class="ped-f"><span>Name</span><input data-gname value="${esc(g.name)}"></label><small>Länge ${fmt(len(sub(g.b, g.a)))} mm. Enden lassen sich ziehen.</small>
        <div class="ped-acts"><button data-b="delgrid">${SVG(IC.trash)} Löschen</button></div>`;
    }
    infoEl.hidden = !h; infoEl.innerHTML = h;
  }
  // Rohrprojekte (Szenen der Rohrplanung) in diesem Geschoss: Lage über X/Y/Z ab OK Rohdecke
  function linksHere() {
    const scenes = env.scenes?.() || [], name = id => scenes.find(x => x.id === id)?.name || 'Szene fehlt';
    const here = B.links.filter(L => L.storey === cur), free = scenes.filter(x => !B.links.some(L => L.scene === x.id));
    return `${here.map(L => `<div class="bau-link"><div class="ped-row"><span class="ped-rn"><b>${esc(name(L.scene))}</b><small>${pipeGeom(L.scene).length} Rohre</small></span><button class="icbtn" data-unlink="${L.scene}" title="Zuordnung lösen" aria-label="Zuordnung lösen">${SVG(IC.trash)}</button></div>
      <div class="ped-grid">${['X', 'Y', 'Z'].map((t, k) => `<label class="ped-f"><span>${t}</span><input data-loff="${L.scene}:${k}" inputmode="decimal" value="${fmt(L.off[k])}"><i>mm</i></label>`).join('')}</div></div>`).join('')}
      ${free.length ? `<div class="ped-add"><select class="bau-scene">${free.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button data-b="link">Zuordnen</button></div>` : here.length ? '' : '<p class="ped-hint">Keine Rohrprojekte vorhanden.</p>'}
      ${here.length ? '<p class="ped-hint">Lage der Szene ab Ursprung, Z ab OK Rohdecke. Im Rohrteil gibt es dann „Ebenen aus Gebäude“.</p>' : ''}`;
  }
  const nextName = s => { const i = sorted().indexOf(s); return sorted()[i + 1]?.name || 'Dach'; };
  function renderList() {
    if (!listOpen) { listEl.innerHTML = ''; return; }
    const s = curSt(), u = curUl(), count = t => B.els.filter(e => e.type === t && e.storey === cur).length;
    listEl.innerHTML = `<h4>Geschosse</h4>
      ${[...sorted()].reverse().map(x => `<div class="ped-row${x.id === cur ? ' on' : ''}"><button class="ped-rn" data-st="${x.id}"><b>${esc(x.name)}</b><small>OK RD ${fmt(x.elev)} · Höhe ${fmt(x.height)} · ${B.els.filter(e => e.storey === x.id).length} Bauteile</small></button></div>`).join('')}
      <div class="bau-st">
        <label class="ped-f"><span>Name</span><input data-sname value="${esc(s.name)}"></label>
        <div class="ped-grid">${fld('selev', s.elev, 'OK RD')}${fld('sheight', s.height, 'Höhe')}</div>
        <div class="ped-add"><button data-b="stup">+ darüber</button><button data-b="stdown">+ darunter</button>${B.storeys.length > 1 ? `<button data-b="stdel" title="Geschoss löschen" aria-label="Geschoss löschen">${SVG(IC.trash)}</button>` : ''}</div>
        <p class="ped-hint">${count('wall')} Wände · ${count('column')} Stützen · ${count('slab')} Decken. Höhenänderungen nehmen alle Bauteile mit.</p>
      </div>
      <div class="ped-add"><button data-b="above"${showAbove ? ' class="on"' : ''}>${showAbove ? 'Geschosse darüber ausblenden' : 'Geschosse darüber zeigen'}</button></div>
      <h4>Rohrprojekte · ${esc(s.name)}</h4>
      ${linksHere()}
      <h4>Achsraster</h4>
      <p class="ped-hint">${B.grids.length ? `${B.grids.length} Achsen` : 'Noch keine Achsen.'}</p>
      <div class="ped-add"><button data-b="gridtool">Raster erzeugen</button></div>
      <h4>Planunterlage · ${esc(s.name)}</h4><p class="ped-hint">Sichtbar im Grundriss.</p>
      ${u ? `<p class="ped-hint">${esc(u.name || 'Bild')} · 1 Bildpunkt = ${fmt(u.s)} mm</p>
        <label class="ped-f bau-range"><span>Deckkraft</span><input type="range" data-ualpha min="0.1" max="1" step="0.05" value="${u.alpha ?? 0.55}"></label>
        <div class="ped-grid">${fld('urot', u.rot || 0, 'Drehung', '°')}</div>
        <div class="ped-add"><button data-b="cal">Kalibrieren</button><button data-b="umove">Verschieben</button><button data-b="udel" title="Unterlage entfernen" aria-label="Unterlage entfernen">${SVG(IC.trash)}</button></div>`
        : '<p class="ped-hint">Architektenplan als Bild oder PDF (Seite 1) unterlegen, kalibrieren, nachzeichnen.</p>'}
      <div class="ped-add"><button data-b="uload">${u ? 'Andere Unterlage' : 'Bild oder PDF laden'}</button></div>
      <h4>Datei</h4>
      <div class="ped-add"><button data-b="export">Sichern</button><button data-b="import">Laden</button></div>
      <p class="ped-hint">Sichern lädt das Gebäude als JSON-Datei herunter, mit Planunterlagen und Zuordnungen. Laden ersetzt das Gebäude.</p>`;
  }

  // ---------- Bedienung ----------
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.unlink) { const id = b.dataset.unlink; change(() => { B.links = B.links.filter(L => L.scene !== id); }); return; }
    if (b.dataset.st) { cur = b.dataset.st; sel = null; if (cmd) cmd.pts = []; dirty = true; renderUi(); draw(); return; }
    if (b.dataset.seg) {
      const [k, v] = b.dataset.seg.split(':'), el = selEl();
      if (k === 'just' && cmd) { cmd.just = v; lastWall.just = v; }
      else if (k === 'shape' && cmd) { cmd.shape = v; lastCol.shape = v; }
      else if (k === 'wjust' && el) change(() => { el.just = v; });
      else if (k === 'cshape' && el) change(() => { el.shape = v; if (v === 'round') el.d = el.w; });
      else if (k === 'okind' && cmd) { cmd.kind = v; lastOp.kind = v; }
      else if (k === 'phinge' && el) change(() => { el.hinge = v; });
      else if (k === 'pswing' && el) change(() => { el.swing = +v; });
      renderUi(); draw(); return;
    }
    if (b.dataset.dir && cmd?.t === 'wall') { wallLen(b.dataset.dir.split(',').map(Number)); return; }
    const a = b.dataset.b;
    if (!a) return;
    if (a.startsWith('t:')) { const t = a.slice(2); if (cmd?.t === t) endCmd(); else startCmd(t); return; }
    switch (a) {
      case 'done': close(); return;
      case 'list': listOpen = !listOpen; renderUi(); return;
      case 'undo': case 'redo': {
        const from = a === 'undo' ? undo : redo, to = a === 'undo' ? redo : undo;
        if (!from.length) return;
        to.push(snap()); B = JSON.parse(from.pop());
        if (!st(cur)) cur = B.storeys[0].id;
        B.links ||= [];
        sel = null; dirty = true; persist(); renderUi(); draw(); return;
      }
      case 'view': setPlan(!cam.plan); return;
      case 'above': showAbove = !showAbove; dirty = true; renderUi(); draw(); return;
      case 'link': { const id = $('.bau-scene')?.value; if (id) change(() => B.links.push({ scene: id, storey: cur, off: [0, 0, 0] })); return; }
      case 'fit': fitView(); draw(); return;
      case 'end': endCmd(); return;
      case 'chain': cmd.pts = []; renderUi(); draw(); return;
      case 'slabok': { const P = cmd.pts; cmd.pts = []; addSlab(P); return; }
      case 'fromwalls': { const P = slabFromWalls(); if (P) addSlab(P); return; }
      case 'gridform': case 'gridtool': if (cmd?.t !== 'grid') startCmd('grid'); gridForm = a === 'gridtool' ? true : !gridForm; renderUi(); return;
      case 'gridmake': {
        const nx = Math.round(num(cmd.gnx ?? 5)), ny = Math.round(num(cmd.gny ?? 3)), sx = num(cmd.gsx ?? 6000), sy = num(cmd.gsy ?? 6000);
        if (!(nx >= 1 && ny >= 1 && nx <= 60 && ny <= 60 && sx > 0 && sy > 0)) { env.toast('Anzahl 1 bis 60, Abstand größer 0.'); return; }
        const go = !B.grids.length || await env.ask(`Vorhandene ${B.grids.length} Achsen ersetzen?`, 'Ersetzen');
        if (go) makeGrid(nx, sx, ny, sy);
        return;
      }
      case 'calok': calOk(); return;
      case 'del': { const el = selEl(); if (el) { change(() => { B.els = B.els.filter(x => x !== el && x.host !== el.id); }); sel = null; dirty = true; renderUi(); draw(); } return; }
      case 'delgrid': { const g = selGrid(); if (g) { change(() => { B.grids = B.grids.filter(x => x !== g); }); sel = null; renderUi(); draw(); } return; }
      case 'stup': case 'stdown': {
        const s = curSt(), S = sorted(), i = S.indexOf(s);
        let ns;
        if (a === 'stup') { const top = S.at(-1); ns = { id: uid(), name: nextStoreyName(top, 1), elev: top.elev + top.height, height: top.height }; }
        else { const bot = S[0]; ns = { id: uid(), name: nextStoreyName(bot, -1), elev: bot.elev - bot.height, height: bot.height }; }
        void i;
        change(() => B.storeys.push(ns)); cur = ns.id; sel = null; dirty = true; renderUi(); draw(); return;
      }
      case 'stdel': {
        const s = curSt(), n = B.els.filter(x => x.storey === s.id).length;
        if (!await env.ask(`Geschoss „${s.name}“${n ? ` mit ${n} Bauteilen` : ''} löschen?`, 'Löschen')) return;
        change(() => { B.storeys = B.storeys.filter(x => x !== s); B.els = B.els.filter(x => x.storey !== s.id); B.underlays = B.underlays.filter(x => x.storey !== s.id); });
        cur = sorted()[0].id; sel = null; dirty = true; renderUi(); draw(); return;
      }
      case 'uload': $('.bau-file').click(); return;
      case 'cal': startCmd('cal'); return;
      case 'umove': startCmd('umove'); return;
      case 'udel': { const u = curUl(); if (u && await env.ask('Planunterlage entfernen?', 'Entfernen')) { change(() => { B.underlays = B.underlays.filter(x => x !== u); }); } return; }
      case 'export': {
        const files = {};
        for (const u of B.underlays) { const f = await getFile(u.file).catch(() => null); if (f) files[u.file] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); }
        const blob = new Blob([JSON.stringify({ ...B, files }, null, 1)], { type: 'application/json' }), url = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = url; l.download = `gebaeude-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(l); l.click(); l.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000); return;
      }
      case 'import': $('.bau-json').click(); return;
    }
  });
  function nextStoreyName(ref, dir) {
    const m = /^(-?\d+)\.?\s*OG$/i.exec(ref.name), u = /^(\d+)\.?\s*UG$/i.exec(ref.name);
    if (dir > 0) { if (/^EG$/i.test(ref.name)) return '1. OG'; if (m) return `${+m[1] + 1}. OG`; if (u) return +u[1] > 1 ? `${+u[1] - 1}. UG` : 'EG'; return `Geschoss ${B.storeys.length + 1}`; }
    if (/^EG$/i.test(ref.name)) return 'UG'; if (/^UG$/i.test(ref.name)) return '2. UG'; if (u) return `${+u[1] + 1}. UG`; if (m) return +m[1] > 1 ? `${+m[1] - 1}. OG` : 'EG'; return `Geschoss ${B.storeys.length + 1}`;
  }
  $('.bau-file').addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) loadUnderlay(f); });
  $('.bau-json').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!Array.isArray(o.storeys) || !o.storeys.length || !Array.isArray(o.els)) throw new Error('keine Gebäudedatei');
      if (!await env.ask('Gebäude aus der Datei laden? Das jetzige wird ersetzt (Rückgängig möglich).', 'Laden')) return;
      const files = o.files || {}, uls = [];
      for (const u of o.underlays || []) if (files[u.file]) { await putFile(u.file, await (await fetch(files[u.file])).blob()); imgs.delete(u.file); uls.push(u); }
      delete o.files;
      change(() => { B = { ...newBuilding(), ...o, id: 'main', grids: o.grids || [], links: o.links || [], underlays: uls }; });
      cur = B.storeys[0].id; sel = null; fitView(); dirty = true; renderUi(); draw();
    } catch (err) { env.toast(`Laden: ${err.message || err}`); }
  });
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-ualpha]')) { const u = curUl(); if (u) { u.alpha = +el.value; persist(); draw(); } }
  });
  root.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-ualpha]')) return;
    if (el.matches('[data-sname]')) { const v = el.value.trim(); if (v) change(() => { curSt().name = v; }); return; }
    if (el.matches('[data-loff]')) { const [id, k] = el.dataset.loff.split(':'), L = B.links.find(x => x.scene === id), v = num(el.value); if (L && Number.isFinite(v)) change(() => { L.off[+k] = v; }); else renderUi(); return; }
    if (el.matches('[data-gname]')) { const g = selGrid(), v = el.value.trim(); if (g && v) change(() => { g.name = v; }); return; }
    const k = el.dataset.f;
    if (!k) return;
    const v = num(el.value), e2 = selEl(), s = curSt();
    const pos = x => Number.isFinite(x) && x > 0;
    // Felder des laufenden Befehls
    if (cmd) {
      if (k === 'th' && pos(v)) { cmd.th = v; if (cmd.t === 'wall') lastWall.th = v; else lastSlab.th = v; }
      else if (k === 'len') cmd.len = Number.isFinite(v) ? v : null;
      else if (k === 'w' && pos(v)) { cmd.w = v; lastCol.w = v; }
      else if (k === 'd' && pos(v)) { cmd.d = v; lastCol.d = v; }
      else if (k === 'real' && pos(v)) cmd.real = v;
      else if (['gnx', 'gny', 'gsx', 'gsy'].includes(k) && pos(v)) cmd[k] = v;
      else if (cmd.t === 'open' && ['ow', 'oh', 'od', 'osill'].includes(k) && (pos(v) || (k === 'osill' && v === 0))) { const key = { ow: 'w', oh: 'h', od: 'd', osill: 'sill' }[k]; cmd[cmd.kind][key] = v; lastOp.v[cmd.kind][key] = v; }
      renderUi(); draw(); return;
    }
    if (k === 'selev' && Number.isFinite(v)) { change(() => { s.elev = v; }); return; }
    if (k === 'sheight' && pos(v)) { change(() => { const dz = v - s.height; B.storeys.forEach(x => { if (x !== s && x.elev > s.elev + 1e-6) x.elev += dz; }); s.height = v; }); return; } // Geschosse darüber rücken nach
    if (k === 'urot' && Number.isFinite(v)) { const u = curUl(); if (u) change(() => { u.rot = v; }); return; }
    if (!e2) return;
    const empty = el.value.trim() === '';
    change(() => {
      if (k === 'wl' && pos(v)) { e2.b = add(e2.a, mul(norm(sub(e2.b, e2.a)), v)); B.els.filter(o => o.host === e2.id && WALL_OPS.includes(o.type)).forEach(o => { o.w = Math.min(o.w, v); o.at = Math.max(o.w / 2, Math.min(v - o.w / 2, o.at)); }); }
      else if (k === 'wt' && pos(v)) e2.t = v;
      else if ((k === 'wh' || k === 'ch')) e2.h = empty ? null : pos(v) ? v : e2.h;
      else if (k === 'wbase' && Number.isFinite(v)) e2.base = v;
      else if (k === 'cw' && pos(v)) { e2.w = v; if (e2.shape === 'round') e2.d = v; }
      else if (k === 'cd' && pos(v)) e2.d = v;
      else if (k === 'crot' && Number.isFinite(v)) e2.rot = v;
      else if (k === 'st' && pos(v)) e2.t = v;
      else if (k === 'pw' && pos(v)) { if (e2.type === 'hole') e2.w = v; else { const L = wallAxis(hostOf(e2)).L; e2.w = Math.min(v, L); e2.at = Math.max(e2.w / 2, Math.min(L - e2.w / 2, e2.at)); } }
      else if (k === 'ph' && pos(v)) e2.h = v;
      else if (k === 'pd' && pos(v)) e2.d = v;
      else if (k === 'psill' && Number.isFinite(v) && v >= 0) e2.sill = v;
      else if (k === 'pleft' && Number.isFinite(v)) { const L = wallAxis(hostOf(e2)).L; e2.at = Math.max(e2.w / 2, Math.min(L - e2.w / 2, v + e2.w / 2)); }
    });
  });
  // Feldwerte des Befehls schon beim Tippen merken (Länge mit Richtungspfeil)
  root.addEventListener('input', e => { if (cmd && e.target.dataset.f === 'len') { const v = num(e.target.value); cmd.len = Number.isFinite(v) ? v : null; } });

  // ---------- Zeiger ----------
  const ptrs = new Map();
  let drag = null, pinch = null;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hoverOf = (x, y) => {
    if (!cmd) return null;
    if (cmd.t === 'open') { const o = opAt(x, y); return o ? { op: o } : null; }
    const from = cmd.pts?.length && cmd.t !== 'cal' && cmd.t !== 'umove' ? cmd.pts.at(-1) : null;
    const extra = cmd.pts?.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    return snapAt(x, y, { from, extra });
  };
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    touch = e.pointerType !== 'mouse';
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; if (drag?.D) { dragEnd(drag.D); } drag = null; return; }
    const h = !cmd && e.button === 0 && !e.shiftKey ? handleAt(x, y) : null;
    drag = { pan: e.button === 2 || e.button === 1 || e.shiftKey || (cam.plan && !h), moved: false, D: h ? dragStart(h) : null };
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e), p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { touch = false; const h = hoverOf(x, y); const hv = !cmd && handleAt(x, y); cv.style.cursor = hv ? 'grab' : ''; if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; draw(); } }
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
    else { cam.yaw += dx * 0.01; cam.pitch = Math.max(0.05, Math.min(Math.PI / 2 - 1e-4, cam.pitch + dy * 0.01)); if (cam.plan) { cam.plan = false; dirty = true; renderUi(); } }
    draw();
  });
  const up = e => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (pinch) { if (!ptrs.size) pinch = null; drag = null; return; }
    if (!p || !drag) return;
    if (drag.D) { if (drag.moved) dragEnd(drag.D); hover = null; drag = null; renderUi(); draw(); return; }
    if (!drag.moved && e.button !== 2) { if (cmd) hover = null; onTap(p.x, p.y); if (cmd && e.pointerType === 'mouse') { hover = hoverOf(p.x, p.y); draw(); } }
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
  root.addEventListener('keydown', e => {
    if (e.target.matches('input, select')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.key === 'Escape') { if (cmd) endCmd(); else { sel = null; dirty = true; renderUi(); draw(); } }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) $(sel.grid ? '[data-b="delgrid"]' : '[data-b="del"]')?.click();
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(`[data-b="${e.shiftKey ? 'redo' : 'undo'}"]`).click(); }
  });
  root.tabIndex = -1;
  const ro = new ResizeObserver(() => { const r = root.getBoundingClientRect(); W = r.width; H = r.height; draw(); });
  ro.observe(root);
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
  if (!(await loadB().catch(() => null))) saveB(B).catch(() => {});
  return {
    close, draw, startCmd, onTap, pickEl, P2, P3, fitView, setPlan, footprint,
    get B() { return B; }, get state() { return { cmd, sel, cur, cam, hover }; },
    setCur(id) { cur = id; dirty = true; renderUi(); draw(); },
  };
}

// ---------- Für die Rohrplanung: Ebenen aus dem Gebäude ----------
// Achsparallele Flächen von Wänden und eckigen Stützen, Fußboden (OK Rohdecke) und Deckenunterseite darüber,
// in den Koordinaten der Szene (Zuordnung im Gebäude: Geschoss und Versatz). Nur was nahe an den Rohren liegt.
export async function bauPlanesFor(sceneId, box) {
  const B = await loadB().catch(() => null);
  const L = B?.links?.find(x => x.scene === sceneId);
  if (!L) return null;
  const S = [...B.storeys].sort((a, b) => a.elev - b.elev), s = S.find(x => x.id === L.storey);
  if (!s) return null;
  const up = S[S.indexOf(s) + 1], off = [L.off[0], L.off[1], L.off[2] + s.elev], out = [];
  const rect = (axis, c, mn, mx) => { const [a, b] = [0, 1, 2].filter(i => i !== axis); out.push({ axis, c: c - off[axis], u: (mn[a] + mx[a]) / 2 - off[a], v: (mn[b] + mx[b]) / 2 - off[b], w: mx[a] - mn[a], h: mx[b] - mn[b] }); };
  const zTop = e => s.elev + (e.h ?? s.height), zBot = e => s.elev + (e.base || 0);
  for (const e of B.els) {
    if (e.storey !== s.id) continue;
    if (e.type === 'wall') {
      const v = sub(e.b, e.a), l = len(v);
      if (!l) continue;
      const d = mul(v, 1 / l), k = Math.abs(d[0]) > 0.9999 ? 0 : Math.abs(d[1]) > 0.9999 ? 1 : -1;
      if (k < 0) continue; // schräge Wände haben keine achsparallele Ebene
      const n = [-d[1], d[0]], [lo, hi] = e.just === 'l' ? [0, e.t] : e.just === 'r' ? [-e.t, 0] : [-e.t / 2, e.t / 2], o = 1 - k;
      const s0 = Math.min(e.a[k], e.b[k]) - e.t / 2, s1 = Math.max(e.a[k], e.b[k]) + e.t / 2;
      for (const f of [lo, hi]) {
        const c = e.a[o] + n[o] * f, mn = [0, 0, zBot(e)], mx = [0, 0, zTop(e)];
        mn[k] = s0; mx[k] = s1; mn[o] = mx[o] = c;
        rect(o, c, mn, mx);
      }
    } else if (e.type === 'column' && e.shape !== 'round' && Math.abs(((e.rot || 0) % 90 + 90) % 90) < 1e-6) {
      const sw = Math.round((e.rot || 0) / 90) % 2 ? [e.d, e.w] : [e.w, e.d];
      for (const k of [0, 1]) for (const sg of [-1, 1]) {
        const o = 1 - k, c = e.p[k] + sg * sw[k] / 2, mn = [0, 0, zBot(e)], mx = [0, 0, zTop(e)];
        mn[o] = e.p[o] - sw[o] / 2; mx[o] = e.p[o] + sw[o] / 2; mn[k] = mx[k] = c;
        rect(k, c, mn, mx);
      }
    } else if (e.type === 'slab') {
      const xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]);
      rect(2, s.elev, [Math.min(...xs), Math.min(...ys), 0], [Math.max(...xs), Math.max(...ys), 0]);
    }
  }
  if (up) for (const e of B.els) if (e.storey === up.id && e.type === 'slab') {
    const xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]);
    rect(2, up.elev - e.t, [Math.min(...xs), Math.min(...ys), 0], [Math.max(...xs), Math.max(...ys), 0]);
  }
  // nur Flächen nahe den Rohren (3 m Rand), doppelte weg
  const M = 3000, nearBox = pl => {
    if (!box) return true;
    const [a, b] = [0, 1, 2].filter(i => i !== pl.axis), lo = [], hi = [];
    lo[pl.axis] = hi[pl.axis] = pl.c; lo[a] = pl.u - pl.w / 2; hi[a] = pl.u + pl.w / 2; lo[b] = pl.v - pl.h / 2; hi[b] = pl.v + pl.h / 2;
    return [0, 1, 2].every(k => hi[k] >= box.mn[k] - M && lo[k] <= box.mx[k] + M);
  };
  const res = [];
  for (const pl of out.filter(nearBox)) if (!res.some(q => q.axis === pl.axis && Math.abs(q.c - pl.c) < 1 && Math.abs(q.u - pl.u) < 1 && Math.abs(q.v - pl.v) < 1 && Math.abs(q.w - pl.w) < 1 && Math.abs(q.h - pl.h) < 1)) res.push(pl);
  return { storey: s.name, planes: res.slice(0, 200) };
}
