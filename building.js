// Gebäude (Experiment): eigenständiges Werkzeug für die Gebäudestruktur.
// Geschosse, Achsraster, Planunterlage, Wände, Stützen (auch Stahl), Unterzüge und Stahlträger, Decken, Öffnungen,
// Dächer (flach mit Attika, geneigt), Rasterdecken, Räume, Schächte; IFC-Export.
// Eigener Speicher (IndexedDB „biege-bau“), eigene Ansicht, eigenes WebGL: Die Rohrdaten der App bleiben unberührt.
// Einheit mm, Z nach oben. Typen angelehnt an IFC. Siehe ROADMAP-GEBAEUDE.md.

// ---------- Rechnen ----------
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = a => Math.hypot(...a), norm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0], perp = a => [-a[1], a[0]], near = (a, b, t = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < t;
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–');
const fmt2 = n => (Number.isFinite(n) ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
const num = s => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const area2 = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; return [Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy), t]; };
const pip = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const centroid = P => { const a = area2(P); if (Math.abs(a) < 1e-9) return mul(P.reduce((s, p) => add(s, p), [0, 0]), 1 / P.length); let cx = 0, cy = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], f = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; } return [cx / (6 * a), cy / (6 * a)]; };
// Schnitt zweier Geraden (Punkt + Richtung), null bei parallel
const lineX = (p, d, q, e) => { const den = cross2(d, e); if (Math.abs(den) < 1e-9) return null; return add(p, mul(d, cross2(sub(q, p), e) / den)); };
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
  while (idx.length > 3 && guard++ < 20000) {
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
// Löcher über Brücken zum Außenrand in ein einfaches Polygon (außen gegen, Löcher im Uhrzeigersinn)
function bridge(P0, Hs) {
  let P = [...P0];
  const crosses = (a, b, segs) => segs.some(([c, e]) => { if (near(a, c, 1e-6) || near(a, e, 1e-6) || near(b, c, 1e-6) || near(b, e, 1e-6)) return false; const d1 = cross2(sub(b, a), sub(c, a)), d2 = cross2(sub(b, a), sub(e, a)), d3 = cross2(sub(e, c), sub(a, c)), d4 = cross2(sub(e, c), sub(b, c)); return d1 * d2 < 0 && d3 * d4 < 0; });
  const edges = poly => poly.map((q, i) => [q, poly[(i + 1) % poly.length]]);
  for (const h of [...Hs].sort((a, b) => Math.max(...b.map(q => q[0])) - Math.max(...a.map(q => q[0])))) {
    const mi = h.reduce((bi, q, i) => (q[0] > h[bi][0] ? i : bi), 0), M = h[mi], segs = [...edges(P), ...Hs.flatMap(edges)];
    let vi = -1, bd = Infinity;
    P.forEach((q, i) => { const dd = len(sub(q, M)); if (dd < bd && !crosses(M, q, segs)) { bd = dd; vi = i; } });
    if (vi < 0) continue;
    P = [...P.slice(0, vi + 1), ...h.slice(mi), ...h.slice(0, mi), M, P[vi], ...P.slice(vi + 1)];
  }
  return P;
}
// Konvexes Polygon an f(p) ≥ 0 abschneiden (f linear)
function clipBy(P, f) {
  const out = [];
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], fp = f(p), fq = f(q); if (fp >= 0) out.push(p); if ((fp >= 0) !== (fq >= 0)) out.push(add(p, mul(sub(q, p), fp / (fp - fq)))); }
  return out;
}
// Jede Kante um d nach innen (negativ: nach außen) verschieben
function offsetPoly(P, d) {
  const sg = Math.sign(area2(P)) || 1, n = P.length;
  const L = P.map((p, i) => { const q = P[(i + 1) % n], e = norm(sub(q, p)); return { p: add(p, mul(perp(e), sg * d)), e }; });
  return L.map((l, i) => { const m = L[(i + n - 1) % n]; return lineX(m.p, m.e, l.p, l.e) || l.p; });
}
// Gerade (unendlich) mit Polygon schneiden: Stücke innen
function lineInPoly(P, p, d) {
  const ts = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), den = cross2(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross2(sub(a, p), e) / den, s = cross2(sub(a, p), d) / den;
    if (s >= 0 && s < 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([add(p, mul(d, ts[i])), add(p, mul(d, ts[i + 1]))]);
  return out;
}

// ---------- Stahlprofile (Nennmaße h × b × s × t in mm) ----------
const STEEL = (() => {
  const S = {};
  const I = (fam, rows) => rows.trim().split(/\s+/).forEach(r => { const [n, h, b, tw, tf] = r.split(':').map(Number); S[`${fam} ${n}`] = { kind: fam === 'UPN' ? 'U' : 'I', h, b, tw, tf }; });
  I('IPE', '80:80:46:3.8:5.2 100:100:55:4.1:5.7 120:120:64:4.4:6.3 140:140:73:4.7:6.9 160:160:82:5:7.4 180:180:91:5.3:8 200:200:100:5.6:8.5 220:220:110:5.9:9.2 240:240:120:6.2:9.8 270:270:135:6.6:10.2 300:300:150:7.1:10.7 330:330:160:7.5:11.5 360:360:170:8:12.7 400:400:180:8.6:13.5 450:450:190:9.4:14.6 500:500:200:10.2:16 600:600:220:12:19');
  I('HEA', '100:96:100:5:8 120:114:120:5:8 140:133:140:5.5:8.5 160:152:160:6:9 180:171:180:6:9.5 200:190:200:6.5:10 220:210:220:7:11 240:230:240:7.5:12 260:250:260:7.5:12.5 280:270:280:8:13 300:290:300:8.5:14 320:310:300:9:15.5 340:330:300:9.5:16.5 360:350:300:10:17.5 400:390:300:11:19 450:440:300:11.5:21 500:490:300:12:23');
  I('HEB', '100:100:100:6:10 120:120:120:6.5:11 140:140:140:7:12 160:160:160:8:13 180:180:180:8.5:14 200:200:200:9:15 220:220:220:9.5:16 240:240:240:10:17 260:260:260:10:17.5 280:280:280:10.5:18 300:300:300:11:19 320:320:300:11.5:20.5 340:340:300:12:21.5 360:360:300:12.5:22.5 400:400:300:13.5:24 450:450:300:14:26 500:500:300:14.5:28');
  I('UPN', '80:80:45:6:8 100:100:50:6:8.5 120:120:55:7:9 140:140:60:7:10 160:160:65:7.5:10.5 180:180:70:8:11 200:200:75:8.5:11.5 220:220:80:9:12.5 240:240:85:9.5:13 260:260:90:10:14 280:280:95:10:15 300:300:100:10:16');
  '48.3x4 60.3x4 76.1x4 88.9x5 114.3x5 139.7x6.3 168.3x6.3 219.1x8'.split(' ').forEach(r => { const [d, t] = r.split('x').map(Number); S[`RO ${r.replace('.', ',')}`] = { kind: 'O', h: d, b: d, t }; });
  '50x50x4 60x60x4 80x80x5 100x100x6 120x120x6 140x140x8 160x160x8 200x200x10'.split(' ').forEach(r => { const [h, b, t] = r.split('x').map(Number); S[`QRO ${r}`] = { kind: 'Q', h, b, t }; });
  return S;
})();
const STEEL_FAM = ['IPE', 'HEA', 'HEB', 'UPN', 'RO', 'QRO'];
// Querschnitt in der Ebene (x quer, y Profilhöhe), mittig; Löcher für Hohlprofile
function steelSection(name) {
  const s = STEEL[name] || STEEL['HEA 200'], { h, b } = s, H = h / 2, Bh = b / 2;
  if (s.kind === 'I') { const { tw, tf } = s, w = tw / 2; return { outer: [[-Bh, -H], [Bh, -H], [Bh, -H + tf], [w, -H + tf], [w, H - tf], [Bh, H - tf], [Bh, H], [-Bh, H], [-Bh, H - tf], [-w, H - tf], [-w, -H + tf], [-Bh, -H + tf]], holes: [], h, b }; }
  if (s.kind === 'U') { const { tw, tf } = s; return { outer: [[-Bh, -H], [Bh, -H], [Bh, -H + tf], [-Bh + tw, -H + tf], [-Bh + tw, H - tf], [Bh, H - tf], [Bh, H], [-Bh, H]], holes: [], h, b }; }
  if (s.kind === 'O') { const c = r => Array.from({ length: 24 }, (_, k) => [Math.cos(2 * Math.PI * k / 24) * r, Math.sin(2 * Math.PI * k / 24) * r]); return { outer: c(H), holes: [c(H - s.t).reverse()], h, b }; }
  const t = s.t; return { outer: [[-Bh, -H], [Bh, -H], [Bh, H], [-Bh, H]], holes: [[[-Bh + t, -H + t], [-Bh + t, H - t], [Bh - t, H - t], [Bh - t, -H + t]]], h, b };
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
function download(blob, name) {
  const url = URL.createObjectURL(blob), l = document.createElement('a');
  l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ---------- Symbole und Namen ----------
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  ok: '<path d="m5 12 5 5 9-10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  list: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  sel: '<path d="M5 3l14 8-6 2-2 6z"/>',
  wall: '<path d="M3 6h18v12H3z"/><path d="M3 12h18M9 6v6M15 12v6"/>',
  column: '<path d="M7 3h10M7 21h10M9.5 3v18M14.5 3v18"/>',
  beam: '<path d="M3 7h18M3 17h18M12 7v10"/>',
  slab: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M3 9v3l9 5 9-5V9"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="14.5" cy="12" r=".8"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h9v8M13 4v4"/>',
  iso: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};
const TYPE_NAME = { wall: 'Wand', column: 'Stütze', beam: 'Träger', slab: 'Decke', roof: 'Dach', ceil: 'Rasterdecke', space: 'Raum', shaft: 'Schacht', door: 'Tür', window: 'Fenster', opening: 'Wanddurchbruch', hole: 'Deckendurchbruch' };
const WALL_OPS = ['door', 'window', 'opening'], OPS = [...WALL_OPS, 'hole'];
const OP_DEF = { door: { w: 1010, h: 2135, sill: 0 }, window: { w: 1260, h: 1385, sill: 900 }, opening: { w: 300, h: 300, sill: 2300 }, hole: { w: 600, d: 400 } };
const JUST = [['l', 'Links'], ['c', 'Mitte'], ['r', 'Rechts']];
const MORE = [['roof', 'Dach'], ['ceil', 'Rasterdecke'], ['space', 'Raum'], ['shaft', 'Schacht'], ['grid', 'Achse']];
// Bauteile über der Schnittebene: im Grundriss nur gestrichelt
const ABOVE = ['beam', 'roof', 'ceil', 'shaft'];

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
      <button class="flbtn" data-b="list" title="Geschosse, Raster, Unterlage, Datei" aria-label="Geschosse, Raster, Unterlage, Datei">${SVG(IC.list)}</button>
      <button class="flbtn" data-b="undo" title="Rückgängig" aria-label="Rückgängig">${SVG(IC.undo)}</button>
      <button class="flbtn" data-b="redo" title="Wiederholen" aria-label="Wiederholen">${SVG(IC.redo)}</button>
      <b class="ped-title"></b>
      <button class="flbtn primary" data-b="done" title="Fertig" aria-label="Fertig">${SVG(IC.ok)}</button>
    </div>
    <aside class="ped-list"></aside>
    <div class="ped-info" hidden></div>
    <div class="ped-bottom">
      <div class="ped-views bau-more" hidden>${MORE.map(([t, n]) => `<button data-b="t:${t}">${n}</button>`).join('')}</div>
      <div class="ped-cmd" hidden></div>
      <div class="navbar ped-tools" role="toolbar" aria-label="Werkzeuge">
        <button class="nvb" data-b="t:sel" title="Auswählen" aria-label="Auswählen">${SVG(IC.sel)}</button>
        <button class="nvb" data-b="t:wall" title="Wand" aria-label="Wand">${SVG(IC.wall)}</button>
        <button class="nvb" data-b="t:column" title="Stütze" aria-label="Stütze">${SVG(IC.column)}</button>
        <button class="nvb" data-b="t:beam" title="Unterzug oder Stahlträger" aria-label="Unterzug oder Stahlträger">${SVG(IC.beam)}</button>
        <button class="nvb" data-b="t:slab" title="Decke" aria-label="Decke">${SVG(IC.slab)}</button>
        <button class="nvb" data-b="t:open" title="Tür, Fenster, Durchbruch" aria-label="Tür, Fenster, Durchbruch">${SVG(IC.door)}</button>
        <button class="nvb" data-b="more" title="Dach, Rasterdecke, Raum, Schacht, Achse" aria-label="Weitere Bauteile">${SVG(IC.more)}</button>
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
  const listEl = $('.ped-list'), infoEl = $('.ped-info'), cmdEl = $('.ped-cmd'), moreEl = $('.bau-more');

  // ---------- Zustand ----------
  let B = (await loadB().catch(() => null)) || newBuilding();
  let cur = B.storeys[0].id;
  const cam = { yaw: -0.6, pitch: 0.55, sc: 0.05, panX: 0, panY: 0, plan: false };
  let mid = [0, 0, 0], size = 20000, W = 1, H = 1, listOpen = innerWidth > 900, showAbove = false, moreOpen = false;
  // sel: { ids: [...] } Bauteile oder { grid: id }; addMode: Tippen ergänzt die Auswahl
  let cmd = null, sel = null, hover = null, dirty = true, gridForm = false, addMode = false;
  const undo = [], redo = [];
  const imgs = new Map(); // Unterlage: Datei-ID → Bild
  const st = id => B.storeys.find(s => s.id === id), curSt = () => st(cur);
  const sorted = () => [...B.storeys].sort((a, b) => a.elev - b.elev);
  const visible = s => !!s && (showAbove || s.elev <= curSt().elev + 1e-6);
  let saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => saveB(B).catch(e => env.toast(`Speichern fehlgeschlagen: ${e.message || e}`)), 250); };
  const snap = () => JSON.stringify(B);
  function change(fn) { undo.push(snap()); if (undo.length > 200) undo.shift(); redo.length = 0; fn(); dirty = true; persist(); renderUi(); draw(); }
  const elById = id => B.els.find(e => e.id === id);
  const selIds = () => sel?.ids || [], isSel = id => selIds().includes(id);
  const selEl = () => (selIds().length === 1 ? elById(selIds()[0]) : null), selGrid = () => (sel?.grid ? B.grids.find(g => g.id === sel.grid) : null);
  const nextAbove = s => sorted()[sorted().indexOf(s) + 1];
  const nextName = s => nextAbove(s)?.name || 'Dach';

  // ---------- Bauteile: Lage ----------
  const wallOffs = w => (w.just === 'l' ? [0, w.t] : w.just === 'r' ? [-w.t, 0] : [-w.t / 2, w.t / 2]);
  const beamSec = e => (e.shape === 'steel' ? steelSection(e.prof) : null);
  const beamDims = e => { const s = beamSec(e); return s ? (e.rot90 ? { w: s.h, h: s.b } : { w: s.b, h: s.h }) : { w: e.w, h: e.bh }; };
  // Schacht: von seinem Geschoss bis zum Geschoss „to“
  const shaftRange = e => { const a = st(e.storey), b = st(e.to) || a; return [a.elev, b.elev + b.height]; };
  const onStorey = (e, sid) => { if (e.type !== 'shaft') return e.storey === sid; const s = st(sid), [z0, z1] = shaftRange(e); return !!s && s.elev >= z0 - 1e-6 && s.elev < z1 - 1e-6; };
  function zRange(e) {
    const s = st(e.storey);
    switch (e.type) {
      case 'slab': return [s.elev - e.t, s.elev];
      case 'beam': { const t = s.elev + e.top; return [t - beamDims(e).h, t]; }
      case 'roof': { const g = roofGeo(e); return [g.zE + g.minH, g.zE + g.maxH + e.t + (e.kind === 'flat' ? e.par?.h || 0 : 0)]; }
      case 'ceil': return [s.elev + e.z, s.elev + e.z + (e.t || 20)];
      case 'space': return [s.elev, s.elev + s.height];
      case 'shaft': return shaftRange(e);
      default: return [s.elev + (e.base || 0), s.elev + (e.h ?? s.height)];
    }
  }
  // Grundriss einer Wand: L-Ecken auf Gehrung, T-Stöße enden an der Fläche der durchgehenden Wand
  function wallPoly(w) {
    const d = norm(sub(w.b, w.a)), n = perp(d), [lo, hi] = wallOffs(w), r = {};
    for (const end of ['a', 'b']) {
      const P = w[end], away = end === 'a' ? d : mul(d, -1);
      const others = B.els.filter(o => o !== w && o.type === 'wall' && o.storey === w.storey && (near(o.a, P) || near(o.b, P)));
      let m = null, face = null;
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
  const opZ = o => { if (o.type === 'hole') { const h = hostOf(o); return h ? zRange(h) : [0, 0]; } const w = hostOf(o), z0 = w ? zRange(w)[0] : st(o.storey).elev; return [z0 + (o.sill || 0), z0 + (o.sill || 0) + o.h]; };
  function footprint(e) {
    switch (e.type) {
      case 'wall': return wallPoly(e);
      case 'column': return colPoly(e);
      case 'beam': return beamPoly(e);
      case 'roof': return roofGeo(e).outer;
      default: return OPS.includes(e.type) ? opPoly(e) : e.pts;
    }
  }
  const zOf = e => (OPS.includes(e.type) ? opZ(e) : zRange(e));
  function wallPieces(w) {
    const poly = wallPoly(w), [z0, z1] = zRange(w), { d } = wallAxis(w);
    const ops = B.els.filter(o => o.host === w.id && WALL_OPS.includes(o.type)).map(o => ({ s0: o.at - o.w / 2, s1: o.at + o.w / 2, b: z0 + (o.sill || 0), t: z0 + (o.sill || 0) + o.h }));
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
    B.underlays.filter(u => u.storey === cur).forEach(u => ulCorners(u).forEach(p => pts.push([...p, curSt().elev])));
    if (!pts.length) pts.push([-5000, -5000, curSt().elev], [15000, 10000, curSt().elev + curSt().height]);
    return { mn: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), mx: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k]))) };
  }
  function fitView() {
    const { mn, mx } = bounds();
    mid = mn.map((v, k) => (v + mx[k]) / 2); size = Math.max(1000, len(sub(mx, mn)));
    const side = listOpen && W > 900 ? 300 : 0, { rx, ry } = basis();
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(b => [0, 1, 2].map(k => ((b >> k) & 1 ? mx[k] : mn[k])));
    const ext = r => Math.max(1, ...corners.map(c => Math.abs(dot(r, sub(c, mid))))) * 2;
    cam.sc = Math.min((W - side - 40) / ext(rx), (H - 200) / ext(ry)) * 0.92;
    cam.panX = side / 2; cam.panY = -20;
  }
  function setPlan(on) {
    cam.plan = on;
    if (on) { cam.yaw = 0; cam.pitch = Math.PI / 2 - 1e-4; } else { cam.yaw = -0.6; cam.pitch = 0.55; }
    fitView(); dirty = true; renderUi(); draw();
  }

  // ---------- Geometrie ----------
  // Prisma aus Grundriss (mit Löchern) zwischen z0 und z1. T: lokales System {o, u, v, n}, sonst Grundriss x/y und Höhe z
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
  function elemMesh(e, col, out, lines) {
    const s = st(e.storey);
    if (!s) return;
    const [z0, z1] = zRange(e);
    switch (e.type) {
      case 'wall': {
        wallPieces(e).forEach(pc => prism(pc.poly, pc.z0, pc.z1, col, out, null));
        if (lines) {
          prism(footprint(e), z0, z1, col, [], lines);
          B.els.filter(o => o.host === e.id && WALL_OPS.includes(o.type)).forEach(o => { const P = opPoly(o), [b, t] = opZ(o); [[P[0], P[1]], [P[3], P[2]]].forEach(([p, q]) => lines.push([...p, b], [...q, b], [...q, b], [...q, t], [...q, t], [...p, t], [...p, t], [...p, b])); });
        }
        return;
      }
      case 'column':
        if (e.shape === 'steel') steelAlong(steelSection(e.prof), [e.p[0], e.p[1], z0], [e.p[0], e.p[1], z1], [Math.cos(((e.rot || 0) + 90) * Math.PI / 180), Math.sin(((e.rot || 0) + 90) * Math.PI / 180), 0], 0, col, out, lines);
        else prism(colPoly(e), z0, z1, col, out, lines);
        return;
      case 'beam': {
        if (e.shape === 'steel') { const c = z1 - beamDims(e).h / 2; steelAlong(steelSection(e.prof), [e.a[0], e.a[1], c], [e.b[0], e.b[1], c], [0, 0, 1], e.rot90 ? 90 : 0, col, out, lines); }
        else prism(beamPoly(e), z0, z1, col, out, lines);
        return;
      }
      case 'slab': extrude(e.pts, [...B.els.filter(o => o.host === e.id && o.type === 'hole').map(opPoly), ...shaftsThrough(s).map(x => x.pts)], z0, z1, col, out, lines); return;
      case 'roof': roofMesh(e, col, out, lines || []); return;
      case 'ceil': {
        extrude(e.pts, ceilHoles(e), z0, z1, col, out, lines);
        if (lines) for (const [k, g2, o2] of [[0, e.gx, e.ox], [1, e.gy, e.oy]]) {
          const vals = e.pts.map(p => p[k]), lo = Math.min(...vals), hi = Math.max(...vals), d = k ? [1, 0] : [0, 1];
          for (let c = Math.ceil((lo - o2) / g2) * g2 + o2; c < hi; c += g2) { const p = k ? [0, c] : [c, 0]; lineInPoly(e.pts, p, d).forEach(([a, b]) => lines.push([a[0], a[1], z0 - 1], [b[0], b[1], z0 - 1])); }
        }
        return;
      }
      case 'shaft': prism(e.pts, z0, z1, col, out, lines); return;
      case 'space': prism(e.pts, z0, z1, col, out, lines); return;
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
  const COL = { wall: [0.87, 0.85, 0.81], column: [0.70, 0.73, 0.77], steel: [0.52, 0.58, 0.66], beam: [0.80, 0.78, 0.74], slab: [0.78, 0.79, 0.81], flat: [0.66, 0.67, 0.69], roof: [0.70, 0.40, 0.33], ceil: [0.95, 0.95, 0.92], shaft: [0.95, 0.62, 0.25] };
  // Grundriss: geschnittene Bauteile dunkel, Decken hell, ohne Schattierung
  const PLAN = { wall: [0.36, 0.38, 0.41], column: [0.22, 0.24, 0.27], steel: [0.22, 0.24, 0.27], slab: [0.95, 0.95, 0.94] };
  const colOf = e => (e.type === 'column' && e.shape === 'steel' ? 'steel' : e.type === 'beam' && e.shape === 'steel' ? 'steel' : e.type === 'roof' && e.kind !== 'pitched' ? 'flat' : e.type);
  function buildGeometry() {
    const tris = [], trans = [], lines = [], acc = rgb('--accent', [0.04, 0.49, 0.74]);
    for (const e of B.els) {
      const s = st(e.storey);
      if (!s || !visible(s) || OPS.includes(e.type) || e.type === 'space') continue;
      if (cam.plan && ABOVE.includes(e.type)) continue; // über der Schnittebene: im Grundriss gestrichelt
      const k = colOf(e);
      let c = isSel(e.id) ? (cam.plan ? acc : acc.map(v => v * 0.7 + 0.3)) : ((cam.plan ? PLAN[k] : null) || COL[k]);
      if (s.id !== cur && !isSel(e.id)) c = c.map(v => v * 0.92 + 0.06);
      elemMesh(e, c, e.type === 'ceil' || e.type === 'shaft' ? trans : tris, lines);
    }
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

  // ---------- Fangen ----------
  // Reihenfolge: Punkte (Enden, Ecken, Achsschnitte) → Linien (Achsen, Wandachsen und -flächen) → frei.
  // Mit Ortho (Richtung nahe 15°-Raster ab dem letzten Punkt) bleibt die Richtung, Linien schneiden den Ortho-Strahl.
  let touch = false;
  function snapLines(skip) {
    const L = B.grids.map(g => ({ a: g.a, b: g.b, label: `Achse ${g.name}` }));
    B.els.forEach(e => {
      if (e.storey !== cur || skip?.has(e.id)) return;
      if (e.type === 'wall') {
        const d = norm(sub(e.b, e.a)), n = perp(d), [lo, hi] = wallOffs(e);
        L.push({ a: e.a, b: e.b, label: 'Wandachse' });
        for (const o of [lo, hi]) if (Math.abs(o) > 0.5) L.push({ a: add(e.a, mul(n, o)), b: add(e.b, mul(n, o)), label: 'Wandfläche' });
      } else if (e.type === 'beam') L.push({ a: e.a, b: e.b, label: 'Trägerachse' });
      else if (['slab', 'roof', 'ceil', 'space', 'shaft'].includes(e.type) && e.pts) e.pts.forEach((p, i) => L.push({ a: p, b: e.pts[(i + 1) % e.pts.length], label: 'Kante' }));
    });
    return L;
  }
  function snapAt(x, y, o = {}) {
    const z = curSt().elev, tol = touch ? 20 : 11, raw = onPlane(x, y, z);
    // Ortho: Richtung ab dem letzten Punkt rastet auf 15°, wenn sie nahe dran ist
    let ortho = null;
    if (o.from && raw && !o.noOrtho) {
      const v = sub(raw, o.from);
      if (len(v) > 1) { const ang = Math.atan2(v[1], v[0]), q = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); if (Math.abs(ang - q) < 0.07) ortho = [Math.cos(q), Math.sin(q)]; }
    }
    const scr = p => P2(p, z), dpx = p => { const s = scr(p); return Math.hypot(s[0] - x, s[1] - y); };
    // 1. Punkte
    let best = null;
    const consider = (p, label) => { if (!p) return; const d = dpx(p); if (d < tol && (!best || d < best.d)) best = { p: [...p], label, d }; };
    B.els.forEach(e => {
      if (!onStorey(e, cur) || o.skip?.has(e.id)) return;
      if (e.type === 'wall' || e.type === 'beam') { consider(e.a, e.type === 'wall' ? 'Wandende' : 'Trägerende'); consider(e.b, e.type === 'wall' ? 'Wandende' : 'Trägerende'); consider(mul(add(e.a, e.b), 0.5), e.type === 'wall' ? 'Wandmitte' : 'Trägermitte'); }
      else if (e.type === 'column') consider(e.p, 'Stütze');
      else if (e.pts) e.pts.forEach(q => consider(q, 'Eckpunkt'));
    });
    const below = sorted().filter(s => s.elev < z).at(-1);
    if (below) B.els.forEach(e => { if (e.storey === below.id && e.type === 'wall') { consider(e.a, 'Wandende darunter'); consider(e.b, 'Wandende darunter'); } });
    gridCross().forEach(q => consider(q.p, q.label));
    (o.extra || []).forEach(q => consider(q.p, q.label));
    // Mit Ortho zählt ein Punkt nur, wenn er auf dem Strahl liegt oder der Zeiger sehr nahe ist
    if (best && (!ortho || best.d < tol * 0.6 || Math.abs(cross2(sub(best.p, o.from), ortho)) * cam.sc < tol * 0.5)) return best;
    if (!raw) return null;
    // 2. Linien
    const lines = snapLines(o.skip).map(L => { const [d, t] = segD(x, y, scr(L.a), scr(L.b)); return { ...L, d, t }; }).filter(L => L.d < tol).sort((a, b) => a.d - b.d);
    if (ortho) {
      let pick = null;
      for (const L of lines) {
        const X = lineX(o.from, ortho, L.a, norm(sub(L.b, L.a)));
        if (X && dot(sub(X, o.from), ortho) > 1) { const d = dpx(X); if (d < tol * 1.6 && (!pick || d < pick.d)) pick = { p: X, label: `${L.label} · Ortho`, d }; }
      }
      if (pick) return pick;
      const Lr = Math.round(dot(sub(raw, o.from), ortho) / 10) * 10;
      return { p: add(o.from, mul(ortho, Lr)), label: 'Ortho', ortho: true };
    }
    if (lines.length) {
      // zwei Linien nahe: ihr Schnittpunkt
      if (lines.length > 1) for (const L2 of lines.slice(1)) { const X = lineX(lines[0].a, norm(sub(lines[0].b, lines[0].a)), L2.a, norm(sub(L2.b, L2.a))); if (X && dpx(X) < tol) return { p: X, label: `${lines[0].label} × ${L2.label}` }; }
      const L = lines[0], q = add(L.a, mul(sub(L.b, L.a), L.t));
      if (o.from) { const v = sub(q, o.from), Ln = len(v); if (Ln > 1) { const u = norm(sub(L.b, L.a)), t0 = dot(sub(q, L.a), u); return { p: add(L.a, mul(u, Math.round(t0 / 10) * 10)), label: `auf ${L.label}` }; } }
      return { p: q, label: `auf ${L.label}` };
    }
    // 3. frei
    if (o.from) { const v = sub(raw, o.from), L = Math.round(len(v) / 10) * 10; return { p: add(o.from, mul(norm(v), L)), free: true }; }
    return { p: raw.map(v => Math.round(v / 10) * 10), free: true };
  }

  // ---------- Räume erkennen ----------
  // Raster über den Wänden, Füllung ab dem Tippunkt, Rand als Polygon. Türen schließen den Raum nicht auf.
  function detectRoom(p) {
    const walls = B.els.filter(e => e.type === 'wall' && e.storey === cur);
    if (!walls.length) return { err: 'Keine Wände in diesem Geschoss.' };
    const polys = walls.map(wallPoly), all = polys.flat();
    const x0 = Math.min(...all.map(q => q[0])) - 300, y0 = Math.min(...all.map(q => q[1])) - 300, x1 = Math.max(...all.map(q => q[0])) + 300, y1 = Math.max(...all.map(q => q[1])) + 300;
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return { err: 'Außerhalb der Wände.' };
    const c = Math.max(20, Math.ceil(Math.sqrt((x1 - x0) * (y1 - y0) / 1.2e6))), nx = Math.ceil((x1 - x0) / c), ny = Math.ceil((y1 - y0) / c), G = new Uint8Array(nx * ny);
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
    let bestRing = null;
    const seen = new Set();
    for (const s0 of next.keys()) {
      if (seen.has(s0)) continue;
      const ring = [];
      let k = s0, guard = 0;
      do { seen.add(k); ring.push(k); k = next.get(k); } while (k != null && k !== s0 && guard++ < 1e6);
      const P = ring.map(v => { const i = v % (nx + 1), j = (v - i) / (nx + 1); return [x0 + i * c, y0 + j * c]; });
      if (!bestRing || Math.abs(area2(P)) > Math.abs(area2(bestRing))) bestRing = P;
    }
    if (!bestRing) return { err: 'Kein Raum gefunden.' };
    // vereinfachen: gerade Stücke zusammenfassen, Treppen schräger Wände glätten
    const dp = (P, eps) => { if (P.length < 3) return P; let k = 0, dm = 0; for (let i = 1; i < P.length - 1; i++) { const d = segD(P[i][0], P[i][1], P[0], P.at(-1))[0]; if (d > dm) { dm = d; k = i; } } return dm > eps ? [...dp(P.slice(0, k + 1), eps).slice(0, -1), ...dp(P.slice(k), eps)] : [P[0], P.at(-1)]; };
    const half = Math.floor(bestRing.length / 2), simp = [...dp(bestRing.slice(0, half + 1), c * 1.1).slice(0, -1), ...dp([...bestRing.slice(half), bestRing[0]], c * 1.1).slice(0, -1)];
    // Der Rand liegt im Mittel 0,72 Zellen vor der Wandfläche: zurück auf die Fläche
    const clean = simp.filter((q, i) => !near(q, simp[(i + 1) % simp.length], 1));
    return { pts: clean.length >= 3 ? offsetPoly(clean, -c * 0.72) : clean };
  }

  // ---------- Befehle ----------
  const last = {
    wall: { th: 240, just: 'c' }, col: { shape: 'rect', w: 300, d: 300, prof: 'HEB 200' }, slab: { th: 250 },
    beam: { shape: 'rect', w: 300, bh: 500, prof: 'IPE 300' }, roof: { kind: 'flat', th: 250 }, ceil: { z: 2600, gx: 625, gy: 625, mode: 'room' },
    op: { kind: 'door', v: structuredClone(OP_DEF) }, copyN: 1,
  };
  const DRAW = ['wall', 'column', 'beam', 'slab', 'grid', 'open', 'roof', 'ceil', 'space', 'shaft'];
  function startCmd(t, extra = {}) {
    if (!['move', 'copy', 'split', 'tiles'].includes(t)) sel = null;
    hover = null; gridForm = false; addMode = false; moreOpen = false;
    if (t === 'sel') { cmd = null; dirty = true; renderUi(); draw(); return; }
    if ([...DRAW, 'move', 'copy', 'split', 'tiles'].includes(t) && Math.abs(basis().rz[2]) < 0.12) setPlan(true);
    cmd = { t, pts: [] };
    const s = curSt();
    if (t === 'wall') Object.assign(cmd, { th: last.wall.th, just: last.wall.just });
    if (t === 'column') Object.assign(cmd, { ...last.col });
    if (t === 'slab') Object.assign(cmd, { th: last.slab.th });
    if (t === 'beam') Object.assign(cmd, { ...last.beam, top: s.height - last.slab.th });
    if (t === 'roof') Object.assign(cmd, { kind: last.roof.kind, th: last.roof.th, base: s.height });
    if (t === 'ceil') Object.assign(cmd, { ...last.ceil });
    if (t === 'shaft') Object.assign(cmd, { to: sorted().at(-1).id });
    if (t === 'open') Object.assign(cmd, { kind: last.op.kind, ...structuredClone(last.op.v) });
    if (t === 'copy') Object.assign(cmd, { n: last.copyN });
    Object.assign(cmd, extra);
    dirty = true; renderUi(); draw();
  }
  function endCmd() { cmd = null; hover = null; dirty = true; renderUi(); draw(); }
  // Vorschau des laufenden Befehls als durchsichtiger Körper
  function cmdPreview() {
    if (!cmd) return null;
    const s = curSt(), h = hover?.p;
    const quad = (a, b, lo, hi) => { const d = norm(sub(b, a)), n = perp(d); return [add(a, mul(n, lo)), add(b, mul(n, lo)), add(b, mul(n, hi)), add(a, mul(n, hi))]; };
    if (cmd.t === 'wall' && cmd.pts.length && h && !near(h, cmd.pts.at(-1))) { const [lo, hi] = wallOffs({ t: cmd.th, just: cmd.just }); return { poly: quad(cmd.pts.at(-1), h, lo, hi), z0: s.elev, z1: s.elev + s.height }; }
    if (cmd.t === 'beam' && cmd.pts.length && h && !near(h, cmd.pts[0])) { const dm = beamDims(cmd); return { poly: quad(cmd.pts[0], h, -dm.w / 2, dm.w / 2), z0: s.elev + cmd.top - dm.h, z1: s.elev + cmd.top }; }
    if (cmd.t === 'column' && h) return { poly: colPoly({ ...cmd, p: h }), z0: s.elev, z1: s.elev + s.height };
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
  function wallClick(p) {
    if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
    const a = cmd.pts.at(-1);
    if (near(p, a, 1)) return;
    addEl({ type: 'wall', a: [...a], b: [...p], t: cmd.th, just: cmd.just, h: null });
    if (cmd.pts.length > 1 && near(p, cmd.pts[0], 1)) { cmd.pts = []; env.toast('Umriss geschlossen.'); }
    else cmd.pts.push(p);
    renderUi(); draw();
  }
  function wallLen(dir) {
    const L = num(cmd.len);
    if (!cmd.pts.length) { env.toast('Erst den Startpunkt tippen.'); return; }
    if (!(L > 0)) { env.toast('Länge eingeben.'); return; }
    const a = cmd.pts.at(-1), b = add(a, mul(dir, L));
    addEl({ type: 'wall', a: [...a], b, t: cmd.th, just: cmd.just, h: null }); cmd.pts.push(b); renderUi(); draw();
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
  function addArea(type, pts) {
    if (pts.length < 3 || Math.abs(area2(pts)) < 1e4) { env.toast('Umriss zu klein.'); return; }
    const P = pts.map(p => [...p]);
    if (type === 'slab') addEl({ type, pts: P, t: cmd?.th ?? last.slab.th });
    else if (type === 'roof') addEl({ type, pts: P, t: cmd.th, base: cmd.base, kind: cmd.kind, edges: roofPreset(P, 'walm'), over: cmd.kind === 'flat' ? 0 : 400, par: { h: cmd.kind === 'flat' ? 500 : 0, w: 240, o: 0 }, gable: true });
    else if (type === 'ceil') {
      const xs = P.map(q => q[0]), ys = P.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      addEl({ type, pts: P, z: cmd.z, t: 20, gx: cmd.gx, gy: cmd.gy, ox: cx - cmd.gx / 2 - Math.ceil((cx - cmd.gx / 2 - Math.min(...xs)) / cmd.gx) * cmd.gx, oy: cy - cmd.gy / 2 - Math.ceil((cy - cmd.gy / 2 - Math.min(...ys)) / cmd.gy) * cmd.gy, off: [] });
    }
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
    if (e.a) { e.a = mv(e.a); e.b = mv(e.b); }
    if (e.p) e.p = mv(e.p);
    if (e.pts) e.pts = e.pts.map(mv);
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
      change(() => B.els.forEach(e => { if (moved.has(e.id)) moveEl(e, d); }));
      return;
    }
    const n = Math.max(1, Math.min(50, Math.round(num(cmd.n) || 1))), hosts = main.filter(e => e.type !== 'hole'), made = [];
    const opsOf = B.els.filter(o => OPS.includes(o.type) && hosts.some(h => h.id === o.host));
    change(() => {
      for (let k = 1; k <= n; k++) {
        const map = new Map(), dk = mul(d, k);
        hosts.forEach(e => { const c = structuredClone(e); c.id = uid(); map.set(e.id, c.id); moveEl(c, dk); B.els.push(c); made.push(c.id); });
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
    if (!cmd) { pickSelect(x, y, shift || addMode); return; }
    const t = cmd.t;
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
      if (t === 'space') { const nums = B.els.filter(e => e.type === 'space').map(e => +e.no).filter(Number.isFinite); addEl({ type: 'space', pts: r.pts, name: 'Raum', no: String((nums.length ? Math.max(...nums) : 0) + 1) }); }
      else addArea('ceil', r.pts);
      return;
    }
    const lp = cmd.pts.length ? cmd.pts.at(-1) : null;
    const from = ['wall', 'beam', 'slab', 'roof', 'ceil', 'grid', 'move', 'copy'].includes(t) ? lp : null;
    const extra = ['wall', 'slab', 'roof', 'ceil'].includes(t) && cmd.pts.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    const raw = t === 'cal' || t === 'umove' && !cmd.pts.length;
    const s = raw ? { p: onPlane(x, y) } : snapAt(x, y, { from, extra, skip: t === 'move' || t === 'copy' ? new Set(selIds()) : null });
    if (!s?.p) { env.toast('In dieser Ansicht lässt sich nicht zeichnen. Grundriss oder 3D von schräg oben.'); return; }
    const p = s.p;
    switch (t) {
      case 'wall': wallClick(p); return;
      case 'column': addEl({ type: 'column', p, shape: cmd.shape, w: cmd.w, d: cmd.shape === 'round' ? cmd.w : cmd.d, prof: cmd.prof, rot: 0, h: null }); return;
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
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        const a = cmd.pts[0];
        if (near(a, p, 10)) return;
        change(() => B.grids.push({ id: uid(), name: nextGridName(Math.abs(p[0] - a[0]) < Math.abs(p[1] - a[1])), a, b: p }));
        cmd.pts = []; renderUi(); draw(); return;
      }
      case 'move': case 'copy':
        if (!cmd.pts.length) { cmd.pts.push(p); renderUi(); draw(); return; }
        xform(sub(p, cmd.pts[0])); endCmd(); return;
      case 'split': {
        const w = elById(cmd.el), q = onPlane(x, y);
        if (w && q) splitWall(w, q);
        endCmd(); return;
      }
      case 'cal':
        cmd.pts.push(p);
        if (cmd.pts.length === 2) { cmd.have = len(sub(cmd.pts[1], cmd.pts[0])); cmd.real = cmd.real ?? Math.round(cmd.have); }
        if (cmd.pts.length > 2) cmd.pts = [p];
        renderUi(); draw(); return;
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
  const PRI = { door: -1, window: -1, opening: -1, hole: -1, column: 0, beam: 0.5, wall: 1, space: 1.5, shaft: 1.6, slab: 2, ceil: 2.5, roof: 3 };
  function pickEl(x, y) {
    const hits = [];
    for (const e of B.els) {
      if (!onStorey(e, cur)) continue;
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
    for (const g of B.grids) if (segD(x, y, P2(g.a), P2(g.b))[0] < tol) return { grid: g.id };
    return null;
  }
  function pickSelect(x, y, add2) {
    const h = pickEl(x, y);
    if (add2 && h?.el) { const ids = selIds(); sel = { ids: ids.includes(h.el) ? ids.filter(i => i !== h.el) : [...ids, h.el] }; if (!sel.ids.length) sel = null; }
    else sel = h?.el ? { ids: [h.el] } : h?.grid ? { grid: h.grid } : null;
    dirty = true; renderUi(); draw();
  }
  function handles() {
    const e = selEl(), g = selGrid(), H2 = [];
    if (e?.type === 'wall' || e?.type === 'beam') H2.push({ k: 'a', p: e.a }, { k: 'b', p: e.b }, { k: 'm', p: mul(add(e.a, e.b), 0.5), move: true });
    if (e?.type === 'column') H2.push({ k: 'p', p: e.p, move: true });
    if (e?.pts) e.pts.forEach((p, i) => H2.push({ k: i, p }));
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
  function dragStart(h) {
    const e = selEl(), g = selGrid(), before = snap(), follow = [];
    if (e?.type === 'wall') {
      const pts = h.k === 'm' ? [e.a, e.b] : [e[h.k]];
      B.els.forEach(o => { if (o === e || o.type !== 'wall' || o.storey !== e.storey) return; for (const w of ['a', 'b']) if (pts.some(p => near(o[w], p))) follow.push({ o, w, from: [...o[w]] }); });
    }
    return { h, before, e, g, follow, a0: e?.a && [...e.a], b0: e?.b && [...e.b], ga: g && [...g.a], gb: g && [...g.b], opp: e?.type === 'shaft' && typeof h.k === 'number' ? [...e.pts[(h.k + 2) % 4]] : null };
  }
  function dragMove(D, x, y) {
    const { h, e, g } = D, skip = new Set([e?.id, ...D.follow.map(f => f.o.id)].filter(Boolean));
    const anchor = h.k === 'a' ? (e ? D.b0 : D.gb) : h.k === 'b' ? (e ? D.a0 : D.ga) : null;
    const s = snapAt(x, y, { skip, from: anchor });
    if (!s) return;
    const p = s.p;
    if (e?.type === 'wall' || e?.type === 'beam') {
      if (h.k === 'm') { const d = sub(p, mul(add(D.a0, D.b0), 0.5)); e.a = add(D.a0, d); e.b = add(D.b0, d); D.follow.forEach(f => { f.o[f.w] = add(f.from, d); }); }
      else { e[h.k] = p; D.follow.forEach(f => { f.o[f.w] = [...p]; }); }
    } else if (e?.type === 'column') e.p = p;
    else if (e?.pts && typeof h.k === 'number') {
      if (D.opp) { const A = D.opp; e.pts = [A, [p[0], A[1]], p, [A[0], p[1]]]; } // Schacht bleibt rechteckig, die Gegenecke steht
      else e.pts[h.k] = p;
    } else if (e && WALL_OPS.includes(e.type)) { const w = hostOf(e), { d, L } = wallAxis(w), half = e.w / 2; e.at = Math.max(half, Math.min(L - half, Math.round(dot(sub(p, w.a), d) / 10) * 10)); }
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
  function polyPath(P, z) { ctx.beginPath(); P.forEach((q, i) => { const s = P2(q, z); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); }
  function renderOverlay() {
    const dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const z = curSt().elev, acc = css('--accent') || '#0a7cbd', mark = css('--mark') || '#ff7a1a', text = css('--text') || '#222', muted = css('--muted') || '#888', card = css('--card') || '#fff';
    const u = curUl();
    if (u && (cam.plan || cmd?.t === 'cal' || cmd?.t === 'umove')) {
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
      if (e.type !== 'space' || e.storey !== cur) return;
      const on = isSel(e.id);
      polyPath(e.pts, z); ctx.fillStyle = on ? 'rgba(10,124,189,.16)' : 'rgba(80,160,120,.10)'; ctx.fill();
      if (on) { ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); }
      const c = P2(centroid(e.pts), z);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = text;
      ctx.font = '700 12px system-ui'; ctx.fillText(`${e.no ? `${e.no} ` : ''}${e.name || ''}`, c[0], c[1] - 8);
      ctx.font = '12px system-ui'; ctx.fillStyle = muted; ctx.fillText(`${fmt2(Math.abs(area2(e.pts)) / 1e6)} m²`, c[0], c[1] + 8);
    });
    // Über der Schnittebene (Grundriss): gestrichelt
    if (cam.plan) B.els.forEach(e => {
      if (!ABOVE.includes(e.type) || !onStorey(e, cur)) return;
      const fp = footprint(e), on = isSel(e.id);
      ctx.strokeStyle = on ? acc : e.type === 'shaft' ? 'rgb(220,120,40)' : muted; ctx.lineWidth = on ? 2 : 1.2; ctx.setLineDash(e.type === 'shaft' ? [] : [8, 5]);
      polyPath(fp, z); ctx.stroke(); ctx.setLineDash([]);
      if (e.type === 'shaft') { const s = fp.map(q => P2(q, z)); ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[2][0], s[2][1]); ctx.moveTo(s[1][0], s[1][1]); ctx.lineTo(s[3][0], s[3][1]); ctx.stroke(); }
      if (e.type === 'roof' && e.kind === 'pitched' && on) { const g = roofGeo(e); g.facets.forEach(F => { polyPath(F, z); ctx.stroke(); }); }
    });
    { const o = P2([0, 0], z); ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o[0] - 6, o[1]); ctx.lineTo(o[0] + 6, o[1]); ctx.moveTo(o[0], o[1] - 6); ctx.lineTo(o[0], o[1] + 6); ctx.stroke(); }
    // Achsraster
    ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    B.grids.forEach(g => {
      const a = P2(g.a, z), b = P2(g.b, z), on = sel?.grid === g.id;
      ctx.strokeStyle = on ? acc : 'rgba(200,60,60,.75)'; ctx.lineWidth = on ? 2 : 1; ctx.setLineDash([14, 4, 2, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      const d = norm(sub(b.slice(0, 2), a.slice(0, 2)));
      for (const [p, sgn] of [[a, -1], [b, 1]]) {
        const c = [p[0] + d[0] * 13 * sgn, p[1] + d[1] * 13 * sgn];
        ctx.fillStyle = card; ctx.beginPath(); ctx.arc(c[0], c[1], 12, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = on ? acc : 'rgb(200,60,60)'; ctx.fillText(g.name, c[0], c[1] + 0.5);
      }
    });
    // Türen und Fenster im Grundriss
    if (cam.plan) B.els.forEach(o => {
      if (o.storey !== cur || !['door', 'window'].includes(o.type)) return;
      const w = hostOf(o);
      if (!w) return;
      const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), col = isSel(o.id) ? acc : text;
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      if (o.type === 'window') {
        polyPath(opPoly(o), z); ctx.fillStyle = card; ctx.fill(); ctx.stroke();
        const m0 = P2(add(add(w.a, mul(d, o.at - o.w / 2)), mul(n, (lo + hi) / 2)), z), m1 = P2(add(add(w.a, mul(d, o.at + o.w / 2)), mul(n, (lo + hi) / 2)), z);
        ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
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
    // Maße der Auswahl
    const e = selEl();
    if (e?.type === 'wall' || e?.type === 'beam') dimLine(e.a, e.b, fmt(len(sub(e.b, e.a))), acc, z);
    if (e && WALL_OPS.includes(e.type) && hostOf(e)) { const w = hostOf(e), { d } = wallAxis(w); dimLine(w.a, add(w.a, mul(d, e.at - e.w / 2)), fmt(e.at - e.w / 2), acc, z); dimLine(add(w.a, mul(d, e.at - e.w / 2)), add(w.a, mul(d, e.at + e.w / 2)), fmt(e.w), acc, z); }
    if (e?.type === 'ceil' && cam.plan) { polyPath(e.pts, z); ctx.strokeStyle = acc; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(10,124,189,.35)'; ctx.lineWidth = 1; for (const [k, g2, o2] of [[0, e.gx, e.ox], [1, e.gy, e.oy]]) { const vals = e.pts.map(p => p[k]), lo = Math.min(...vals), hi = Math.max(...vals), dd = k ? [1, 0] : [0, 1]; for (let c = Math.ceil((lo - o2) / g2) * g2 + o2; c < hi; c += g2) lineInPoly(e.pts, k ? [0, c] : [c, 0], dd).forEach(([a, b]) => { const s1 = P2(a, z), s2 = P2(b, z); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.stroke(); }); } ceilHoles(e).forEach(q => { polyPath(q, z); ctx.fillStyle = 'rgba(255,122,26,.35)'; ctx.fill(); }); }
    // Mehrfachauswahl: Umrisse
    if (selIds().length > 1) selIds().map(elById).filter(Boolean).forEach(o => { const fp = footprint(o); if (fp?.length > 2) { polyPath(fp, z); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); } });
    // Befehl
    if (cmd) {
      const pts = cmd.pts || [];
      pts.forEach((p, i) => dot2(P2(p, z), i === 0 ? 5 : 4, mark));
      if (['slab', 'roof', 'ceil', 'cal', 'grid', 'move', 'copy', 'beam', 'shaft'].includes(cmd.t) && pts.length) {
        ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.setLineDash(['slab', 'roof', 'ceil'].includes(cmd.t) ? [] : [6, 4]);
        ctx.beginPath(); pts.forEach((p, i) => { const s = P2(p, z); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
        if (hover?.p && cmd.t !== 'cal') { const s = P2(hover.p, z); ctx.lineTo(s[0], s[1]); }
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
      if (cmd.t === 'cal' && pts.length === 2) dimLine(pts[0], pts[1], `${fmt(cmd.have)} → ${fmt(num(cmd.real))}`, mark, z);
    }
    if (!cmd) handles().forEach(h => { const s = P2(h.p, z); ctx.fillStyle = card; ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath(); if (h.move) ctx.rect(s[0] - 6, s[1] - 6, 12, 12); else ctx.arc(s[0], s[1], 6, 0, 7); ctx.fill(); ctx.stroke(); });
    if (hover?.p) {
      const s = P2(hover.p, z);
      ctx.strokeStyle = hover.label ? mark : acc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], hover.label ? 8 : 5, 0, 7); ctx.stroke();
      if (hover.label) tag(s[0], s[1] - 22, hover.label, mark);
    }
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
          case 'wall': id = E(`IFCWALL(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.STANDARD.)`); break;
          case 'column': id = E(`IFCCOLUMN(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.COLUMN.)`); break;
          case 'beam': id = E(`IFCBEAM(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.BEAM.)`); break;
          case 'slab': id = E(`IFCSLAB(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.FLOOR.)`); break;
          case 'roof': id = E(`IFCSLAB(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.ROOF.)`); break;
          case 'ceil': id = E(`IFCCOVERING(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},$,.CEILING.)`); break;
          case 'shaft': id = E(`IFCSPACE(${gid()},$,${S(e.name || 'Schacht')},$,'Schacht',${lp()},${shape(meshOf(e))},'Schacht',.ELEMENT.,.SPACE.,$)`); spaces.push(id); continue;
          case 'space': id = E(`IFCSPACE(${gid()},$,${nm},$,$,${lp()},${shape(meshOf(e))},${S(e.name)},.ELEMENT.,.SPACE.,$)`); spaces.push(id); continue;
          case 'door': id = E(`IFCDOOR(${gid()},$,${nm},$,$,${lp()},${shape(plateOf(e))},$,${R(e.h)},${R(e.w)},.DOOR.,$,$)`); break;
          case 'window': id = E(`IFCWINDOW(${gid()},$,${nm},$,$,${lp()},${shape(plateOf(e))},$,${R(e.h)},${R(e.w)},.WINDOW.,$,$)`); break;
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
  const fld = (k, v, label, unit = 'mm', ph = '') => `<label class="ped-f"><span>${label}</span><input data-f="${k}" inputmode="decimal" value="${v == null || v === '' ? '' : fmt(v)}"${ph ? ` placeholder="${ph}"` : ''}><i>${unit}</i></label>`;
  const seg = (k, val, opts) => `<span class="ped-seg">${opts.map(([v, t]) => `<button data-seg="${k}:${v}"${String(val) === String(v) ? ' class="on"' : ''}>${t}</button>`).join('')}</span>`;
  const profSel = (k, val) => `<label class="ped-f"><span>Profil</span><select data-sel="${k}">${STEEL_FAM.map(f => `<optgroup label="${f}">${Object.keys(STEEL).filter(n => n.startsWith(`${f} `)).map(n => `<option${n === val ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  const storeySel = (k, val, from) => `<label class="ped-f"><span>bis</span><select data-sel="${k}">${sorted().filter(s => !from || s.elev >= from.elev).map(s => `<option value="${s.id}"${s.id === val ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
  function renderUi() {
    $('.ped-title').textContent = `Gebäude · ${curSt().name} (Experiment)`;
    root.classList.toggle('list-open', listOpen);
    const t = cmd ? cmd.t : 'sel';
    root.querySelectorAll('[data-b^="t:"]').forEach(b => b.classList.toggle('on', b.dataset.b === `t:${t}`));
    $('[data-b="more"]').classList.toggle('on', moreOpen || MORE.some(([k]) => k === t));
    moreEl.hidden = !moreOpen;
    $('[data-b="view"]').innerHTML = SVG(cam.plan ? IC.iso : IC.plan);
    $('[data-b="view"]').title = cam.plan ? '3D' : 'Grundriss';
    $('[data-b="undo"]').disabled = !undo.length; $('[data-b="redo"]').disabled = !redo.length;
    renderList(); renderCmd(); renderInfo();
  }
  function renderCmd() {
    cmdEl.hidden = !cmd;
    if (!cmd) { cmdEl.innerHTML = ''; return; }
    const done = '<button data-b="end" class="on">Fertig</button>', cancel = '<button data-b="end">Abbrechen</button>', c = cmd;
    const close = c.pts.length >= 3 ? '<button data-b="areaok" class="on">Schließen</button>' : '';
    let h = '';
    switch (c.t) {
      case 'wall':
        h = `<span class="bprompt">${c.pts.length ? 'Nächster Punkt' : 'Wand: Startpunkt tippen'}</span>${fld('th', c.th, 'Dicke')}${seg('just', c.just, JUST)}`;
        if (c.pts.length) h += `${fld('len', c.len ?? '', 'Länge', 'mm', '0')}<span class="ped-seg">${[['1,0', '→'], ['0,1', '↑'], ['-1,0', '←'], ['0,-1', '↓']].map(([v, t]) => `<button data-dir="${v}" title="Länge in diese Richtung">${t}</button>`).join('')}</span><button data-b="chain">Neu ansetzen</button>`;
        h += done; break;
      case 'column':
        h = `<span class="bprompt">Stütze: Punkt tippen</span>${seg('shape', c.shape, [['rect', 'Eckig'], ['round', 'Rund'], ['steel', 'Stahl']])}${c.shape === 'steel' ? profSel('cprof', c.prof) : fld('w', c.w, c.shape === 'round' ? 'Ø' : 'B') + (c.shape === 'round' ? '' : fld('d', c.d, 'T'))}${done}`; break;
      case 'beam':
        h = `<span class="bprompt">${c.pts.length ? 'Ende tippen' : 'Träger: Anfang tippen'}</span>${seg('bshape', c.shape, [['rect', 'Unterzug'], ['steel', 'Stahl']])}${c.shape === 'steel' ? profSel('bprof', c.prof) : fld('bw', c.w, 'B') + fld('bh', c.bh, 'H')}${fld('btop', c.top, 'OK')}${done}`; break;
      case 'slab':
        h = `<span class="bprompt">${c.pts.length ? `${c.pts.length} Punkte · Startpunkt schließt` : 'Decke: Umriss tippen'}</span>${fld('th', c.th, 'Dicke')}<button data-b="fromwalls">Aus Wänden</button>${close}${cancel}`; break;
      case 'roof':
        h = `<span class="bprompt">${c.pts.length ? `${c.pts.length} Punkte · Startpunkt schließt` : 'Dach: Umriss tippen'}</span>${seg('rkind', c.kind, [['flat', 'Flach'], ['pitched', 'Geneigt']])}${fld('rbase', c.base, 'Traufe')}${fld('th', c.th, 'Dicke')}<button data-b="fromwalls">Aus Wänden</button>${close}${cancel}`; break;
      case 'ceil':
        h = `<span class="bprompt">${c.mode === 'room' ? 'In einen Raum tippen' : c.pts.length ? `${c.pts.length} Punkte` : 'Umriss tippen'}</span>${seg('cmode', c.mode, [['room', 'Raum'], ['poly', 'Umriss']])}${fld('cz', c.z, 'UK')}${fld('cgx', c.gx, 'Raster')}${c.mode === 'poly' ? close : ''}${done}`; break;
      case 'space': h = `<span class="bprompt">Raum: in einen von Wänden umschlossenen Bereich tippen</span>${done}`; break;
      case 'shaft': h = `<span class="bprompt">${c.pts.length ? 'Gegenüberliegende Ecke' : 'Schacht: erste Ecke tippen'}</span>${storeySel('shto', c.to, curSt())}${done}`; break;
      case 'open': {
        const v = c[c.kind];
        h = `<span class="bprompt">${c.kind === 'hole' ? 'Auf eine Decke tippen' : 'Auf eine Wand tippen'}</span>${seg('okind', c.kind, [['door', 'Tür'], ['window', 'Fenster'], ['opening', 'Durchbruch'], ['hole', 'Decke']])}${fld('ow', v.w, 'B')}${c.kind === 'hole' ? fld('od', v.d, 'T') : fld('oh', v.h, 'H')}${c.kind === 'window' || c.kind === 'opening' ? fld('osill', v.sill, c.kind === 'window' ? 'Brüstung' : 'UK') : ''}${done}`; break;
      }
      case 'grid': h = `<span class="bprompt">${c.pts.length ? 'Endpunkt der Achse' : 'Achse: zwei Punkte tippen'}</span><button data-b="gridform"${gridForm ? ' class="on"' : ''}>Raster erzeugen</button>${done}`; break;
      case 'move': case 'copy': h = `<span class="bprompt">${c.pts.length ? 'Zielpunkt tippen' : `${selIds().length} Bauteil${selIds().length > 1 ? 'e' : ''} ${c.t === 'move' ? 'verschieben' : 'kopieren'}: Basispunkt tippen`}</span>${c.t === 'copy' ? fld('cn', c.n, 'Anzahl', 'Stk') : ''}${cancel}`; break;
      case 'split': h = `<span class="bprompt">Teilungspunkt auf der Wand tippen</span>${cancel}`; break;
      case 'tiles': h = `<span class="bprompt">Platten antippen: herausnehmen oder wieder einsetzen</span>${done}`; break;
      case 'cal': h = `<span class="bprompt">${c.pts.length < 2 ? `Kalibrieren: ${c.pts.length ? 'zweiten' : 'ersten'} Punkt auf dem Plan tippen` : 'Echter Abstand'}</span>${c.pts.length === 2 ? `${fld('real', c.real, 'Abstand')}<button data-b="calok" class="on">Übernehmen</button>` : ''}${cancel}`; break;
      case 'umove': h = `<span class="bprompt">${c.pts.length ? 'Zielpunkt tippen (fängt an Achsen und Wänden)' : 'Unterlage verschieben: Punkt auf dem Plan tippen'}</span>${cancel}`; break;
    }
    cmdEl.innerHTML = h;
  }
  const acts = (extra = '') => `<div class="ped-acts"><button data-b="xmove">Verschieben</button><button data-b="xcopy">Kopieren</button>${extra}<button data-b="addsel"${addMode ? ' class="on"' : ''}>+ Weitere</button><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
  function renderInfo() {
    const e = selEl(), g = selGrid(), n = selIds().length;
    let h = '';
    if (cmd?.t === 'grid' && gridForm) {
      h = `<h4>Raster erzeugen</h4><small>Ersetzt die vorhandenen Achsen. Achsen 1, 2, 3 … laufen senkrecht im Grundriss, A, B, C … waagerecht. Ursprung ist Achse 1/A.</small>
        <div class="ped-grid">${fld('gnx', cmd.gnx ?? 5, 'Achsen 1…', 'Stk')}${fld('gsx', cmd.gsx ?? 6000, 'Abstand')}</div>
        <div class="ped-grid">${fld('gny', cmd.gny ?? 3, 'Achsen A…', 'Stk')}${fld('gsy', cmd.gsy ?? 6000, 'Abstand')}</div>
        <div class="ped-acts"><button data-b="gridmake" class="on">Erzeugen</button></div>`;
    } else if (n > 1) {
      const cnt = {}; selIds().map(elById).filter(Boolean).forEach(x => { cnt[TYPE_NAME[x.type]] = (cnt[TYPE_NAME[x.type]] || 0) + 1; });
      h = `<h4>${n} Bauteile</h4><small>${Object.entries(cnt).map(([k, v]) => `${v} × ${k}`).join(' · ')}</small>${acts('<button data-b="selnone">Aufheben</button>')}`;
    } else if (e) {
      const s = st(e.storey);
      switch (e.type) {
        case 'wall':
          h = `<h4>Wand</h4><div class="ped-grid">${fld('wl', len(sub(e.b, e.a)), 'Länge')}${fld('wt', e.t, 'Dicke')}</div>
            <div class="ped-grid">${fld('wh', e.h ?? '', 'Höhe', 'mm', fmt(s.height))}${fld('wbase', e.base || 0, 'Fuß')}</div>
            <div class="ped-acts"><span class="bprompt">Lage zur Achse</span>${seg('wjust', e.just, JUST)}</div>
            <small>Länge ändert das Ende, der Anfang bleibt. Höhe leer: bis OK Rohdecke ${esc(nextName(s))}.</small>${acts('<button data-b="split">Teilen</button>')}`; break;
        case 'column':
          h = `<h4>Stütze</h4><div class="ped-acts">${seg('cshape', e.shape, [['rect', 'Eckig'], ['round', 'Rund'], ['steel', 'Stahl']])}</div>
            <div class="ped-grid">${e.shape === 'steel' ? profSel('eprof', e.prof) : fld('cw', e.w, e.shape === 'round' ? 'Ø' : 'B') + (e.shape === 'round' ? '' : fld('cd', e.d, 'T'))}${e.shape === 'round' ? '' : fld('crot', e.rot || 0, 'Drehung', '°')}</div>
            <div class="ped-grid">${fld('ch', e.h ?? '', 'Höhe', 'mm', fmt(s.height))}</div><small>Höhe leer: bis OK Rohdecke ${esc(nextName(s))}.</small>${acts()}`; break;
        case 'beam': {
          const dm = beamDims(e);
          h = `<h4>${e.shape === 'steel' ? 'Stahlträger' : 'Unterzug'}</h4><div class="ped-acts">${seg('ebshape', e.shape, [['rect', 'Unterzug'], ['steel', 'Stahl']])}</div>
            <div class="ped-grid">${e.shape === 'steel' ? profSel('eprof', e.prof) + `<span class="ped-seg"><button data-b="rot90"${e.rot90 ? ' class="on"' : ''}>Liegend</button></span>` : fld('ebw', e.w, 'B') + fld('ebh', e.bh, 'H')}</div>
            <div class="ped-grid">${fld('ebl', len(sub(e.b, e.a)), 'Länge')}${fld('ebtop', e.top, 'OK')}</div>
            <small>OK = Oberkante über OK Rohdecke ${esc(s.name)}, UK ${fmt(e.top - dm.h)}.</small>${acts()}`; break;
        }
        case 'slab': h = `<h4>Decke</h4><div class="ped-grid">${fld('st', e.t, 'Dicke')}</div><small>${fmt2(Math.abs(area2(e.pts)) / 1e6)} m² · ${e.pts.length} Eckpunkte. Oberkante = OK Rohdecke ${esc(s.name)} (${fmt(s.elev)}).</small>${acts()}`; break;
        case 'roof': {
          const g2 = roofGeo(e), par = e.par || {};
          h = `<h4>Dach</h4><div class="ped-acts">${seg('erkind', e.kind, [['flat', 'Flach'], ['pitched', 'Geneigt']])}</div>
            <div class="ped-grid">${fld('erbase', e.base ?? s.height, 'Traufe')}${fld('ert', e.t, 'Dicke')}${fld('erover', e.over || 0, 'Überstand')}</div>`;
          if (e.kind === 'pitched') {
            h += `<div class="ped-acts"><span class="bprompt">Form</span><button data-preset="sattel">Satteldach</button><button data-preset="pult">Pultdach</button><button data-preset="walm">Walmdach</button></div>
              <div class="bau-edges">${e.pts.map((p, i) => { const ed = e.edges?.[i] || { eave: true, pitch: 30 }; return `<div class="ped-grid"><span class="bprompt">Kante ${i + 1} · ${fmt(len(sub(e.pts[(i + 1) % e.pts.length], p)))}</span>${seg(`edge${i}`, ed.eave === false ? 'g' : 't', [['t', 'Traufe'], ['g', 'Giebel']])}${ed.eave === false ? '' : fld(`pitch${i}`, ed.pitch ?? 30, 'Neigung', '°')}</div>`; }).join('')}</div>
              <div class="ped-acts"><button data-b="gable"${e.gable !== false ? ' class="on"' : ''}>Giebel füllen</button></div>
              <small>First ${fmt(g2.maxH)} über Traufe. Exakt für Umrisse ohne einspringende Ecken.</small>`;
          } else h += `<div class="ped-grid">${fld('parh', par.h || 0, 'Attika H')}${fld('parw', par.w || 240, 'B')}${fld('paro', par.o || 0, 'Sims')}</div><small>Attika 0 = ohne. Sims = Überstand der Attika nach außen.</small>`;
          h += acts(); break;
        }
        case 'ceil':
          h = `<h4>Rasterdecke</h4><div class="ped-grid">${fld('ecz', e.z, 'UK')}${fld('ecgx', e.gx, 'Raster X')}${fld('ecgy', e.gy, 'Y')}</div>
            <small>${fmt2(Math.abs(area2(e.pts)) / 1e6)} m², ${(e.off || []).length} Platten herausgenommen. UK über OK Rohdecke ${esc(s.name)}.</small>
            <div class="ped-acts"><button data-b="tiles">Platten herausnehmen</button><button data-b="center">Raster mittig</button></div>${acts()}`; break;
        case 'space':
          h = `<h4>Raum</h4><div class="ped-grid"><label class="ped-f"><span>Nr.</span><input data-txt="no" value="${esc(e.no)}"></label><label class="ped-f"><span>Name</span><input data-txt="name" value="${esc(e.name)}"></label></div>
            <small>${fmt2(Math.abs(area2(e.pts)) / 1e6)} m² (Grundfläche, auf etwa 5 cm genau erkannt).</small>${acts()}`; break;
        case 'shaft': {
          const [z0, z1] = shaftRange(e);
          h = `<h4>Schacht</h4><div class="ped-grid">${storeySel('eshto', e.to, s)}</div><small>Von ${esc(s.name)} (${fmt(z0)}) bis ${fmt(z1)}. Decken dazwischen sind ausgespart.</small>${acts()}`; break;
        }
        case 'hole': h = `<h4>Deckendurchbruch</h4><div class="ped-grid">${fld('pw', e.w, 'B')}${fld('pd', e.d, 'T')}</div><small>Mitte X ${fmt(e.p[0])} · Y ${fmt(e.p[1])}. Ziehen am Quadrat verschiebt.</small><div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`; break;
        default: if (WALL_OPS.includes(e.type)) {
          const w = hostOf(e), L = w ? wallAxis(w).L : 0;
          h = `<h4>${TYPE_NAME[e.type]}</h4><div class="ped-grid">${fld('pw', e.w, 'Breite')}${fld('ph', e.h, 'Höhe')}</div>
            <div class="ped-grid">${fld('pleft', e.at - e.w / 2, 'ab Wandanfang')}${e.type === 'door' ? '' : fld('psill', e.sill || 0, e.type === 'window' ? 'Brüstung' : 'UK')}</div>
            ${e.type === 'door' ? `<div class="ped-acts">${seg('phinge', e.hinge || 'l', [['l', 'Anschlag links'], ['r', 'rechts']])}${seg('pswing', String(e.swing ?? 1), [['1', 'Aufschlag hier'], ['-1', 'drüben']])}</div>` : ''}
            <small>In der Wand ${fmt(L)} mm, rechts bleiben ${fmt(L - e.at - e.w / 2)} mm. Ziehen am Quadrat verschiebt entlang der Wand.</small>
            <div class="ped-acts"><button data-b="del">${SVG(IC.trash)} Löschen</button></div>`;
        }
      }
    } else if (g) {
      h = `<h4>Achse</h4><label class="ped-f"><span>Name</span><input data-gname value="${esc(g.name)}"></label><small>Länge ${fmt(len(sub(g.b, g.a)))} mm. Enden lassen sich ziehen.</small>
        <div class="ped-acts"><button data-b="delgrid">${SVG(IC.trash)} Löschen</button></div>`;
    }
    infoEl.hidden = !h; infoEl.innerHTML = h;
  }
  function renderList() {
    if (!listOpen) { listEl.innerHTML = ''; return; }
    const s = curSt(), u = curUl(), cnt = {};
    B.els.filter(e => onStorey(e, cur) && !OPS.includes(e.type)).forEach(e => { cnt[TYPE_NAME[e.type]] = (cnt[TYPE_NAME[e.type]] || 0) + 1; });
    listEl.innerHTML = `<h4>Geschosse</h4>
      ${[...sorted()].reverse().map(x => `<div class="ped-row${x.id === cur ? ' on' : ''}"><button class="ped-rn" data-st="${x.id}"><b>${esc(x.name)}</b><small>OK RD ${fmt(x.elev)} · Höhe ${fmt(x.height)} · ${B.els.filter(e => e.storey === x.id).length} Bauteile</small></button></div>`).join('')}
      <div class="bau-st">
        <label class="ped-f"><span>Name</span><input data-sname value="${esc(s.name)}"></label>
        <div class="ped-grid">${fld('selev', s.elev, 'OK RD')}${fld('sheight', s.height, 'Höhe')}</div>
        <div class="ped-add"><button data-b="stup">+ darüber</button><button data-b="stdown">+ darunter</button>${B.storeys.length > 1 ? `<button data-b="stdel" title="Geschoss löschen" aria-label="Geschoss löschen">${SVG(IC.trash)}</button>` : ''}</div>
        <div class="ped-add"><button data-b="stcopy">Kopie als neues Geschoss oben</button></div>
        <p class="ped-hint">${Object.entries(cnt).map(([k, v]) => `${v} × ${k}`).join(' · ') || 'Noch keine Bauteile.'} Höhe ändern schiebt die Geschosse darüber mit.</p>
      </div>
      <div class="ped-add"><button data-b="above"${showAbove ? ' class="on"' : ''}>${showAbove ? 'Geschosse darüber ausblenden' : 'Geschosse darüber zeigen'}</button></div>
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
      <div class="ped-add"><button data-b="ifc">IFC exportieren</button><button data-b="png">Ansicht als Bild</button></div>
      <p class="ped-hint">Sichern lädt das Gebäude als JSON-Datei herunter, mit Planunterlagen. Laden ersetzt das Gebäude. IFC (IFC4) für BIM-Programme und Viewer.</p>`;
  }

  // ---------- Bedienung ----------
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.st) { cur = b.dataset.st; sel = null; if (cmd) cmd.pts = []; dirty = true; renderUi(); draw(); return; }
    const el = selEl();
    if (b.dataset.preset && el?.type === 'roof') { change(() => { el.edges = roofPreset(el.pts, b.dataset.preset); }); return; }
    if (b.dataset.seg) {
      const [k, v] = b.dataset.seg.split(':');
      const C = cmd;
      if (k === 'just' && C) { C.just = v; last.wall.just = v; }
      else if (k === 'shape' && C) { C.shape = v; last.col.shape = v; }
      else if (k === 'bshape' && C) { C.shape = v; last.beam.shape = v; }
      else if (k === 'rkind' && C) { C.kind = v; last.roof.kind = v; }
      else if (k === 'cmode' && C) { C.mode = v; C.pts = []; last.ceil.mode = v; }
      else if (k === 'okind' && C) { C.kind = v; last.op.kind = v; }
      else if (k === 'wjust' && el) change(() => { el.just = v; });
      else if (k === 'cshape' && el) change(() => { el.shape = v; if (v === 'round') el.d = el.w; if (v === 'steel') el.prof ||= last.col.prof; });
      else if (k === 'ebshape' && el) change(() => { el.shape = v; if (v === 'steel') el.prof ||= last.beam.prof; el.w ||= 300; el.bh ||= 500; });
      else if (k === 'erkind' && el) change(() => { el.kind = v; if (v === 'pitched' && !el.over) el.over = 400; el.edges ||= roofPreset(el.pts, 'walm'); });
      else if (k === 'phinge' && el) change(() => { el.hinge = v; });
      else if (k === 'pswing' && el) change(() => { el.swing = +v; });
      else if (k.startsWith('edge') && el) { const i = +k.slice(4); change(() => { el.edges ||= roofPreset(el.pts, 'walm'); el.edges[i] = { ...(el.edges[i] || { pitch: 30 }), eave: v === 't' }; }); }
      renderUi(); draw(); return;
    }
    if (b.dataset.dir && cmd?.t === 'wall') { wallLen(b.dataset.dir.split(',').map(Number)); return; }
    const a = b.dataset.b;
    if (!a) return;
    if (a.startsWith('t:')) { const t = a.slice(2); moreOpen = false; if (cmd?.t === t) endCmd(); else startCmd(t); return; }
    switch (a) {
      case 'done': close(); return;
      case 'list': listOpen = !listOpen; renderUi(); return;
      case 'more': moreOpen = !moreOpen; renderUi(); return;
      case 'undo': case 'redo': {
        const from = a === 'undo' ? undo : redo, to = a === 'undo' ? redo : undo;
        if (!from.length) return;
        to.push(snap()); B = JSON.parse(from.pop());
        if (!st(cur)) cur = B.storeys[0].id;
        sel = null; dirty = true; persist(); renderUi(); draw(); return;
      }
      case 'view': setPlan(!cam.plan); return;
      case 'above': showAbove = !showAbove; dirty = true; renderUi(); draw(); return;
      case 'fit': fitView(); draw(); return;
      case 'end': endCmd(); return;
      case 'chain': cmd.pts = []; renderUi(); draw(); return;
      case 'areaok': { const P = cmd.pts; cmd.pts = []; addArea(cmd.t, P); return; }
      case 'fromwalls': { const P = outlineFromWalls(); if (P) addArea(cmd.t, P); return; }
      case 'gridform': case 'gridtool': if (cmd?.t !== 'grid') startCmd('grid'); gridForm = a === 'gridtool' ? true : !gridForm; renderUi(); return;
      case 'gridmake': {
        const nx = Math.round(num(cmd.gnx ?? 5)), ny = Math.round(num(cmd.gny ?? 3)), sx = num(cmd.gsx ?? 6000), sy = num(cmd.gsy ?? 6000);
        if (!(nx >= 1 && ny >= 1 && nx <= 60 && ny <= 60 && sx > 0 && sy > 0)) { env.toast('Anzahl 1 bis 60, Abstand größer 0.'); return; }
        const go = !B.grids.length || await env.ask(`Vorhandene ${B.grids.length} Achsen ersetzen?`, 'Ersetzen');
        if (go) makeGrid(nx, sx, ny, sy);
        return;
      }
      case 'calok': calOk(); return;
      case 'del': {
        const ids = selIds();
        if (!ids.length) return;
        change(() => { B.els = B.els.filter(x => !ids.includes(x.id) && !ids.includes(x.host)); });
        sel = null; addMode = false; dirty = true; renderUi(); draw(); return;
      }
      case 'delgrid': { const g = selGrid(); if (g) { change(() => { B.grids = B.grids.filter(x => x !== g); }); sel = null; renderUi(); draw(); } return; }
      case 'xmove': case 'xcopy': startCmd(a === 'xmove' ? 'move' : 'copy'); return;
      case 'addsel': addMode = !addMode; renderUi(); if (addMode) env.toast('Weitere Bauteile antippen. Am Mac geht das auch mit Shift.'); return;
      case 'selnone': sel = null; addMode = false; dirty = true; renderUi(); draw(); return;
      case 'split': startCmd('split', { el: el.id }); return;
      case 'tiles': startCmd('tiles', { el: el.id }); sel = { ids: [el.id] }; renderUi(); return;
      case 'center': if (el?.type === 'ceil') { const xs = el.pts.map(q => q[0]), ys = el.pts.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; change(() => { el.ox = cx - el.gx / 2; el.oy = cy - el.gy / 2; el.off = []; }); } return;
      case 'rot90': if (el) change(() => { el.rot90 = !el.rot90; }); return;
      case 'gable': if (el) change(() => { el.gable = el.gable === false; }); return;
      case 'stup': case 'stdown': {
        const S = sorted();
        const ns = a === 'stup' ? { id: uid(), name: nextStoreyName(S.at(-1), 1), elev: S.at(-1).elev + S.at(-1).height, height: S.at(-1).height } : { id: uid(), name: nextStoreyName(S[0], -1), elev: S[0].elev - S[0].height, height: S[0].height };
        change(() => B.storeys.push(ns)); cur = ns.id; sel = null; dirty = true; renderUi(); draw(); return;
      }
      case 'stcopy': copyStorey(); return;
      case 'stdel': {
        const s = curSt(), n = B.els.filter(x => x.storey === s.id).length;
        if (!await env.ask(`Geschoss „${s.name}“${n ? ` mit ${n} Bauteilen` : ''} löschen?`, 'Löschen')) return;
        change(() => { B.storeys = B.storeys.filter(x => x !== s); B.els = B.els.filter(x => x.storey !== s.id); B.underlays = B.underlays.filter(x => x.storey !== s.id); B.els.forEach(x => { if (x.type === 'shaft' && x.to === s.id) x.to = x.storey; }); });
        cur = sorted()[0].id; sel = null; dirty = true; renderUi(); draw(); return;
      }
      case 'uload': $('.bau-file').click(); return;
      case 'cal': startCmd('cal'); return;
      case 'umove': startCmd('umove'); return;
      case 'udel': { const u = curUl(); if (u && await env.ask('Planunterlage entfernen?', 'Entfernen')) change(() => { B.underlays = B.underlays.filter(x => x !== u); }); return; }
      case 'export': {
        const files = {};
        for (const u of B.underlays) { const f = await getFile(u.file).catch(() => null); if (f) files[u.file] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); }
        download(new Blob([JSON.stringify({ ...B, files }, null, 1)], { type: 'application/json' }), `gebaeude-${new Date().toISOString().slice(0, 10)}.json`); return;
      }
      case 'import': $('.bau-json').click(); return;
      case 'ifc': try { download(new Blob([ifcText()], { type: 'application/x-step' }), `gebaeude-${new Date().toISOString().slice(0, 10)}.ifc`); } catch (err) { env.toast(`IFC: ${err.message || err}`); } return;
      case 'png': viewImage(); return;
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
      change(() => { B = { ...newBuilding(), ...o, id: 'main', grids: o.grids || [], underlays: uls }; });
      cur = B.storeys[0].id; sel = null; fitView(); dirty = true; renderUi(); draw();
    } catch (err) { env.toast(`Laden: ${err.message || err}`); }
  });
  root.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-ualpha]')) { const u = curUl(); if (u) { u.alpha = +el.value; persist(); draw(); } }
    if (cmd && el.dataset.f === 'len') { const v = num(el.value); cmd.len = Number.isFinite(v) ? v : null; }
  });
  root.addEventListener('change', e => {
    const el = e.target, e2 = selEl(), s = curSt();
    if (el.matches('[data-ualpha]')) return;
    if (el.matches('[data-sname]')) { const v = el.value.trim(); if (v) change(() => { s.name = v; }); return; }
    if (el.matches('[data-gname]')) { const g = selGrid(), v = el.value.trim(); if (g && v) change(() => { g.name = v; }); return; }
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
    if (cmd) {
      const C = cmd;
      if (k === 'th' && pos(v)) { C.th = v; if (C.t === 'wall') last.wall.th = v; else if (C.t === 'roof') last.roof.th = v; else last.slab.th = v; }
      else if (k === 'len') C.len = fin ? v : null;
      else if (k === 'w' && pos(v)) { C.w = v; last.col.w = v; }
      else if (k === 'd' && pos(v)) { C.d = v; last.col.d = v; }
      else if (k === 'bw' && pos(v)) { C.w = v; last.beam.w = v; }
      else if (k === 'bh' && pos(v)) { C.bh = v; last.beam.bh = v; }
      else if (k === 'btop' && fin) C.top = v;
      else if (k === 'rbase' && fin) C.base = v;
      else if (k === 'cz' && pos(v)) { C.z = v; last.ceil.z = v; }
      else if (k === 'cgx' && pos(v)) { C.gx = C.gy = v; last.ceil.gx = last.ceil.gy = v; }
      else if (k === 'cn' && pos(v)) { C.n = Math.round(v); last.copyN = C.n; }
      else if (k === 'real' && pos(v)) C.real = v;
      else if (['gnx', 'gny', 'gsx', 'gsy'].includes(k) && pos(v)) C[k] = v;
      else if (C.t === 'open' && ['ow', 'oh', 'od', 'osill'].includes(k) && (pos(v) || (k === 'osill' && v === 0))) { const key = { ow: 'w', oh: 'h', od: 'd', osill: 'sill' }[k]; C[C.kind][key] = v; last.op.v[C.kind][key] = v; }
      renderUi(); draw(); return;
    }
    if (k === 'selev' && fin) { change(() => { s.elev = v; }); return; }
    if (k === 'sheight' && pos(v)) { change(() => { const dz = v - s.height; B.storeys.forEach(x => { if (x !== s && x.elev > s.elev + 1e-6) x.elev += dz; }); s.height = v; }); return; }
    if (k === 'urot' && fin) { const u = curUl(); if (u) change(() => { u.rot = v; }); return; }
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
      else if (k.startsWith('pitch') && fin && v >= 0 && v <= 80) { const i = +k.slice(5); e2.edges ||= roofPreset(e2.pts, 'walm'); e2.edges[i] = { ...(e2.edges[i] || { eave: true }), pitch: v }; }
      else if (k === 'ecz' && pos(v)) e2.z = v;
      else if (k === 'ecgx' && pos(v)) { e2.gx = v; e2.off = []; }
      else if (k === 'ecgy' && pos(v)) { e2.gy = v; e2.off = []; }
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
    if (t === 'cal' || (t === 'umove' && !cmd.pts.length)) { const p = onPlane(x, y); return p ? { p } : null; }
    const from = ['wall', 'beam', 'slab', 'roof', 'ceil', 'grid', 'move', 'copy'].includes(t) && cmd.pts.length ? cmd.pts.at(-1) : null;
    const extra = ['wall', 'slab', 'roof', 'ceil'].includes(t) && cmd.pts.length > 1 ? [{ p: cmd.pts[0], label: 'Startpunkt' }] : [];
    return snapAt(x, y, { from, extra, skip: t === 'move' || t === 'copy' ? new Set(selIds()) : null });
  };
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    touch = e.pointerType !== 'mouse';
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
    if (moreOpen) { moreOpen = false; renderUi(); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; if (drag?.D) dragEnd(drag.D); drag = null; return; }
    const h = !cmd && e.button === 0 && !e.shiftKey ? handleAt(x, y) : null;
    drag = { pan: e.button === 2 || e.button === 1 || (cam.plan && !h), moved: false, D: h ? dragStart(h) : null, shift: e.shiftKey };
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e), p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { touch = false; const h = hoverOf(x, y), hv = !cmd && handleAt(x, y); cv.style.cursor = hv ? 'grab' : ''; if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; draw(); } }
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
  root.addEventListener('keydown', e => {
    if (e.target.matches('input, select')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.key === 'Escape') { if (cmd) endCmd(); else { sel = null; addMode = false; dirty = true; renderUi(); draw(); } }
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
    close, draw, startCmd, onTap, pickEl, P2, P3, fitView, setPlan, footprint, snapAt, detectRoom, ifcText, roofGeo, zOf,
    get B() { return B; }, get state() { return { cmd, sel, cur, cam, hover }; },
    setCur(id) { cur = id; dirty = true; renderUi(); draw(); },
    setSel(ids) { sel = ids ? { ids } : null; dirty = true; renderUi(); draw(); },
  };
}
