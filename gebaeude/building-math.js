// Rechnen: Vektoren, Polygone, Zahlen lesen und formatieren (rein, ohne Zustand). Teil von building.js.

// ---------- Rechnen ----------
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = a => Math.hypot(...a), norm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0], perp = a => [-a[1], a[0]], near = (a, b, t = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < t;
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–');
const fmt2 = n => (Number.isFinite(n) ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
// Zahlen-Leser für alle Felder (deutsches Format): „1.260“, „1260“, „1 260“, „1.260,5“, „1260,5“, „1,26 m“, „126 cm“, Rechnen „2*1260+115“.
// Punkt mit genau drei Ziffern dahinter (und 1–3 Ziffern davor, nicht „0“) ist Tausendertrenner, sonst Dezimalzeichen; Komma ist immer dezimal.
const numPart = t => {
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  const dots = (t.match(/\./g) || []).length;
  if (dots > 1) return t.replace(/\./g, '');
  if (dots === 1 && /^[1-9]\d{0,2}\.\d{3}$/.test(t)) return t.replace('.', '');
  return t;
};
const num = s => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : NaN;
  let t = String(s ?? '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
  if (!t) return NaN;
  let f = 1;
  const u = t.match(/\s*(mm|cm|m)$/);
  if (u) { f = u[1] === 'm' ? 1000 : u[1] === 'cm' ? 10 : 1; t = t.slice(0, u.index); }
  t = t.replace(/(\d) (?=\d)/g, '$1').replace(/×/g, '*').replace(/(\d|\))\s*x\s*(?=\d|\()/g, '$1*');
  t = t.replace(/\d[\d.,]*/g, m => numPart(m));
  if (!/^[\d.+\-*/() ]+$/.test(t)) return NaN;
  if (/^[+-]?\d*\.?\d+$/.test(t.replace(/ /g, ''))) { const v = parseFloat(t); return Number.isFinite(v) ? v * f : NaN; }
  try { const v = Function(`"use strict";return (${t})`)(); return Number.isFinite(v) ? v * f : NaN; } catch { return NaN; }
};
// Wert im Feld beim Bearbeiten: nackte Zahl mit Dezimalkomma (kein Tausenderpunkt, damit nichts falsch gelesen wird)
const raw = n => (Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : '');
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
function lineInPoly(P, p, d, holes = []) {
  const ts = [];
  for (const R of [P, ...holes]) for (let i = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], e = sub(b, a), den = cross2(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross2(sub(a, p), e) / den, s = cross2(sub(a, p), d) / den;
    if (s >= 0 && s < 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([add(p, mul(d, ts[i])), add(p, mul(d, ts[i + 1]))]);
  return out;
}

export { sub, add, mul, dot, len, norm, cross3, cross2, perp, near, uid, fmt, fmt2, numPart, num, raw, esc, area2, segD, pip, centroid, lineX, hull, triangulate, bridge, clipBy, offsetPoly, lineInPoly };
