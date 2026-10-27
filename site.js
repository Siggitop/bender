// Baustellen-Berechnungen: Raum (Grundriss → Wände, Boden, Decke), Schellen mit Bohrpunkten,
// Rohrbündel (Parallelrohre) und Zuschnitt aus Stangen. Reine Rechnung, keine Oberfläche.
import { V, pointAt, rotAbout, refPerp } from './geometry.js';

// ---------- Raum ----------
// Ein Raum ist ein rechtwinkliger Grundriss (Ecken in der Draufsicht, mm), Bodenhöhe z0 und Raumhöhe.
// Daraus entstehen begrenzte Flächen: Boden, Decke und je Grundrisskante eine Wand.
// Fläche: { id, name, kind: 'wall'|'floor'|'ceil', axis, c, n, ext, edge, pass }
//   axis/c: Ebene x[axis] = c · n = ±1, zeigt in den Raum · ext[i] = [min, max] je Achse
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const wallLetter = i => LETTERS[i % 26] + (i >= 26 ? Math.floor(i / 26) : '');
export const signedArea = o => o.reduce((a, p, i) => { const q = o[(i + 1) % o.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

export function pointInPoly(o, x, y) {
  let inside = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const [xi, yi] = o[i], [xj, yj] = o[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function roomPlanes(room) {
  const o = room?.outline;
  if (!o || o.length < 3) return [];
  const ccw = signedArea(o) > 0, z0 = room.z0 || 0, z1 = z0 + room.height;
  const bx = [Math.min(...o.map(p => p[0])), Math.max(...o.map(p => p[0]))];
  const by = [Math.min(...o.map(p => p[1])), Math.max(...o.map(p => p[1]))];
  const planes = [
    { id: 'floor', name: 'Boden', kind: 'floor', axis: 2, c: z0, n: 1, ext: [bx, by, [z0, z0]], poly: o },
    { id: 'ceil', name: 'Decke', kind: 'ceil', axis: 2, c: z1, n: -1, ext: [bx, by, [z1, z1]], poly: o },
  ];
  o.forEach((p, i) => {
    const q = o[(i + 1) % o.length], dx = q[0] - p[0], dy = q[1] - p[1];
    const alongX = Math.abs(dy) < 1e-6 && Math.abs(dx) > 1e-6, alongY = Math.abs(dx) < 1e-6 && Math.abs(dy) > 1e-6;
    if (!alongX && !alongY) return; // schräge oder leere Kante: keine Wand
    // Innen liegt bei Gegenuhrzeigersinn links der Kante: Linksnormale von (dx, dy) ist (−dy, dx)
    const left = [-Math.sign(dy), Math.sign(dx)], inward = ccw ? left : [-left[0], -left[1]];
    const axis = alongX ? 1 : 0, u = alongX ? 0 : 1;
    const ext = [[0, 0], [0, 0], [z0, z1]];
    ext[u] = [Math.min(p[u], q[u]), Math.max(p[u], q[u])];
    ext[axis] = [p[axis], p[axis]];
    planes.push({ id: 'w' + i, name: 'Wand ' + wallLetter(i), kind: 'wall', axis, c: p[axis], n: inward[axis], ext, edge: i, pass: !!room.pass?.[i] });
  });
  return planes;
}

// Abstand vom Raum aus gesehen: positiv = Punkt liegt auf der Raumseite der Fläche
export const planeDist = (pl, p) => (p[pl.axis] - pl.c) * pl.n;
// Liegt der Punkt (projiziert) innerhalb der Fläche?
export function onPlane(pl, p, margin = 0) {
  if (pl.poly) return pointInPoly(pl.poly, p[0], p[1]) || (margin > 0 && distToOutline(pl.poly, p[0], p[1]) <= margin);
  return [0, 1, 2].every(i => i === pl.axis || (p[i] >= pl.ext[i][0] - margin && p[i] <= pl.ext[i][1] + margin));
}
// Abstand eines Punkts zum Rand des Grundrisses (Draufsicht)
export function distToOutline(o, x, y) {
  let best = Infinity;
  o.forEach((a, i) => {
    const b = o[(i + 1) % o.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  });
  return best;
}
export const inRoom = (room, p, tol = 0.01) => {
  const z0 = room.z0 || 0;
  return pointInPoly(room.outline, p[0], p[1]) && p[2] >= z0 - tol && p[2] <= z0 + room.height + tol;
};

// Rohr gegen Raum: 'through' = durchstößt eine Fläche, 'touch' = Rohrmitte näher als r an einer Fläche,
// 'outside' = Rohr liegt außerhalb des Raums, ohne durch eine Wand dorthin zu kommen (z. B. ganz hinter der Wand).
// through ist bei 'through' und 'outside' gesetzt.
export function planeHits(samples, room, r) {
  const planes = roomPlanes(room), out = [];
  if (!planes.length) return out;
  for (const pl of planes) {
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1].p, b = samples[i].p, da = planeDist(pl, a), db = planeDist(pl, b);
      const s0 = samples[i - 1].s, s1 = samples[i].s;
      if ((da > 0) !== (db > 0)) {
        const t = da / (da - db), p = V.add(a, V.mul(V.sub(b, a), t));
        if (onPlane(pl, p, r)) out.push({ plane: pl, p, s: s0 + (s1 - s0) * t, through: true, type: 'through' });
      } else if (Math.min(da, db) > 0 && Math.min(da, db) < r - 0.01) {
        const p = da < db ? a : b;
        if (onPlane(pl, p) && !out.some(o => o.plane === pl && V.len(V.sub(o.p, p)) < 4 * r)) out.push({ plane: pl, p, s: da < db ? s0 : s1, through: false, type: 'touch' });
      }
    }
  }
  // Außerhalb liegende Stücke, die nicht durch ein Durchstoßen entstanden sind
  let wasOut = false;
  for (let i = 1; i < samples.length; i++) {
    const m = V.mul(V.add(samples[i - 1].p, samples[i].p), 0.5), outNow = !inRoom(room, m);
    if (outNow && !wasOut && !out.some(h => h.type === 'through' && h.s >= samples[i - 1].s - 0.01 && h.s <= samples[i].s + 0.01)) {
      out.push({ plane: null, p: m, s: (samples[i - 1].s + samples[i].s) / 2, through: true, type: 'outside' });
    }
    wasOut = outNow;
  }
  return out;
}

// ---------- Schellen ----------
// Gerade Abschnitte entlang der abgewickelten Länge (von Rohranfang/Biegeende bis Biegeanfang/Rohrende)
export function straightRuns(layout) {
  const runs = [];
  let s0 = 0, from = 'end';
  layout.bends.forEach(b => { runs.push({ s0, s1: b.start, from, to: 'bend' }); s0 = b.end; from = 'bend'; });
  runs.push({ s0, s1: layout.total, from, to: 'end' });
  return runs;
}

// Automatische Schellen je Gerade:
//  · möglichst je eine Schelle clampBend vom Bogen bzw. clampEnd vom Rohrende,
//  · lägen diese beiden näher als clampMin beieinander, stattdessen eine Schelle in der Mitte,
//  · dazwischen gleichmäßig mit höchstens clampMax.
// Danach wird jede Lücke über clampMax (auch über Bögen hinweg) mit einer Schelle in der längsten Geraden geschlossen.
export function autoClamps(layout, f) {
  if (!layout.total) return [];
  const runs = straightRuns(layout), out = [], minGap = f.clampMin ?? f.clampMax / 2;
  for (const r of runs) {
    const a = r.s0 + (r.from === 'bend' ? f.clampBend : f.clampEnd);
    const b = r.s1 - (r.to === 'bend' ? f.clampBend : f.clampEnd);
    if (b < a - 0.01) continue;
    if (b - a < minGap) { out.push((a + b) / 2); continue; }
    const n = Math.ceil((b - a) / f.clampMax - 1e-9);
    for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  out.sort((x, y) => x - y);
  for (let guard = 0; guard < 50; guard++) {
    const pts = [0, ...out, layout.total];
    let gap = -1;
    for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > f.clampMax + 0.5) { gap = i; break; }
    if (gap < 0) break;
    const lo = pts[gap - 1], hi = pts[gap];
    const cand = runs.map(r => ({ a: Math.max(r.s0, lo), b: Math.min(r.s1, hi) })).filter(c => c.b - c.a > 1).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    if (!cand) break;
    out.push((cand.a + cand.b) / 2);
    out.sort((x, y) => x - y);
  }
  return out;
}

// Lage einer Schelle, Befestigungsfläche (Rohr parallel zur Fläche, Abstand bis Schellenhöhe + 30 mm,
// Punkt liegt auf der Fläche) und Bohrpunkt; offset verschiebt auf ein Parallelrohr
export function clampInfo(samples, s, planes, f, offset = null) {
  let p = pointAt(samples, s);
  const t = V.norm(V.sub(pointAt(samples, s + 1), pointAt(samples, s - 1)));
  if (offset) p = V.add(p, offset);
  let mount = null;
  for (const pl of planes) {
    if (Math.abs(t[pl.axis]) > 0.05) continue;
    const d = planeDist(pl, p);
    if (d > 0 && d <= f.clampH + 30 && onPlane(pl, p) && (!mount || d < mount.d)) mount = { plane: pl, d };
  }
  let q = null;
  if (mount) { q = [...p]; q[mount.plane.axis] = mount.plane.c; }
  return { s, p, t, mount, q };
}

// Bohrpunkt in Baustellenmaßen: je Richtung in der Fläche der Abstand zur nächsten Wand bzw. zum Boden,
// sonst zum näheren Rohrende (Anfang A oder Ende E)
const AX = [['rechts', 'links'], ['hinten', 'vor'], ['über', 'unter']];
export function drillCoords(q, mountPlane, planes, A, E) {
  const k = mountPlane.axis, out = [];
  for (const i of [0, 1, 2]) {
    if (i === k) continue;
    const refs = planes.filter(pl => pl.axis === i && pl.kind !== 'ceil');
    if (refs.length) {
      const pl = refs.reduce((m, x) => (Math.abs(q[i] - x.c) < Math.abs(q[i] - m.c) ? x : m));
      out.push({ v: Math.abs(q[i] - pl.c), ref: pl.name, axis: i });
    } else {
      const useA = Math.abs(q[i] - A[i]) <= Math.abs(q[i] - E[i]), o = useA ? A : E, d = q[i] - o[i];
      out.push({ v: Math.abs(d), ref: useA ? 'Rohranfang' : 'Rohrende', dir: Math.abs(d) < 0.05 ? '' : AX[i][d > 0 ? 0 : 1], axis: i });
    }
  }
  return out;
}

// ---------- Rohrbündel ----------
// Parallelrohr: Der Versatz startet senkrecht zum ersten Schenkel (Richtung dir0, Betrag dist) und wird an jeder
// Biegung mitgedreht – wie bei gemeinsam gebogenen Rohren. In der Biegeebene entstehen verschachtelte Bögen,
// quer dazu bleibt die Form gleich. Schnittpunkt: Anteil quer zur Biegeebene unverändert, in der Ebene auf der
// Winkelhalbierenden. Liefert die Schnittpunkte und den Versatz je Schenkel.
export function parallelGeometry(pts, dist, dir0) {
  const d = pts.slice(1).map((p, i) => V.norm(V.sub(p, pts[i])));
  const o = [V.mul(V.norm(V.sub(dir0, V.mul(d[0], V.dot(dir0, d[0])))), dist)];
  for (let i = 1; i < d.length; i++) {
    const ax = V.cross(d[i - 1], d[i]), s = V.len(ax);
    o.push(s < 1e-9 ? o[i - 1] : rotAbout(o[i - 1], V.mul(ax, 1 / s), Math.acos(Math.max(-1, Math.min(1, V.dot(d[i - 1], d[i]))))));
  }
  const out = pts.map((p, i) => {
    if (i === 0) return V.add(p, o[0]);
    if (i === pts.length - 1) return V.add(p, o.at(-1));
    const n = V.norm(V.cross(d[i - 1], d[i])), m1 = V.cross(n, d[i - 1]), m2 = V.cross(n, d[i]);
    return V.add(V.add(p, V.mul(n, V.dot(o[i - 1], n))), V.mul(V.add(m1, m2), V.dot(o[i - 1], m1) / (1 + V.dot(m1, m2))));
  });
  return { pts: out, offsets: o };
}
export const parallelPoints = (pts, dist, dir0) => parallelGeometry(pts, dist, dir0).pts;
// Seite in 90°-Schritten um den ersten Schenkel (0 = refPerp, meist „oben“) → Startrichtung
export function sideDir(pts, side) {
  const d0 = V.norm(V.sub(pts[1], pts[0]));
  return rotAbout(refPerp(d0), d0, side * Math.PI / 2);
}

// ---------- Zuschnitt ----------
// Aus Stangen: größte Stücke zuerst in die erste passende Stange, Sägeschnitt kerf
export function cutPlan(pieces, stock, kerf = 3) {
  const bars = [], tooLong = [];
  [...pieces].sort((a, b) => b.len - a.len).forEach(pc => {
    if (pc.len > stock) { tooLong.push(pc); return; }
    const bar = bars.find(b => b.rest >= pc.len + (b.cuts.length ? kerf : 0));
    if (bar) { bar.rest -= pc.len + (bar.cuts.length ? kerf : 0); bar.cuts.push(pc); }
    else bars.push({ cuts: [pc], rest: stock - pc.len });
  });
  return { bars, tooLong };
}

// ---------- Hilfen für den Grundriss ----------
// Dreiecke für einen einfachen Grundriss (Ohrenschneiden), für die Bodenfläche in 3D
export function triangulate(o) {
  const idx = o.map((_, i) => i), tris = [];
  const ccw = signedArea(o) > 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => { const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  for (let guard = 0; idx.length > 3 && guard < 1000; guard++) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const c = cross(o[i0], o[i1], o[i2]);
      if (ccw ? c <= 1e-9 : c >= -1e-9) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(o[j], o[i0], o[i1], o[i2]))) continue;
      tris.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx);
  return tris;
}

// Grundriss bereinigen: doppelte Punkte und Punkte auf einer Geraden entfernen
export function cleanOutline(o) {
  let pts = o.filter((p, i) => { const q = o[(i + 1) % o.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.5; });
  for (let guard = 0; guard < pts.length; guard++) {
    const k = pts.findIndex((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) < 1e-6;
    });
    if (k < 0) break;
    pts.splice(k, 1);
  }
  return pts;
}
