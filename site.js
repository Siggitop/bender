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
// Parallelrohr mit Lagewechseln des Bündels. An Biegung i (zwischen Schenkel i und i+1) dreht sich die Lage um ±90° um
// den nächsten Schenkel – z. B. von „übereinander“ auf „nebeneinander“. Rohr 1 biegt normal; das Parallelrohr läuft bis
// über die Ecke, geht dort senkrecht zur Biegeebene auf seine neue Höhe und biegt dann weiter (Raumecke mit zwei Bögen).
// txs: [{ bend, rot: ±1 }]
// Ergebnis: pts (Achspunkte), segs (Strecken mit Soll-Richtung, Schenkel, Art 'leg'|'drop'), offsets (Lage je Schenkel),
// turns (je Biegung die Lage danach: 0 = wie bisher, ±1 = gekippt), short (erste Strecke, die für ihre Bögen zu kurz ist)
// Kleinster Abstand zweier Strecken a0–a1 und b0–b1 (Rohrachsen) – für die Prüfung, ob sich Rohre berühren
function segDist(a0, a1, b0, b1) {
  const u = V.sub(a1, a0), v = V.sub(b1, b0), w = V.sub(a0, b0);
  const a = V.dot(u, u), b = V.dot(u, v), c = V.dot(v, v), d = V.dot(u, w), e = V.dot(v, w), den = a * c - b * b;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * e - c * d) / den)) : 0;
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? Math.max(0, Math.min(1, -d / a)) : 0; }
  else if (t > 1) { t = 1; s = a > 1e-9 ? Math.max(0, Math.min(1, (b - d) / a)) : 0; }
  return V.len(V.sub(V.add(w, V.mul(u, s)), V.mul(v, t)));
}
// Kleinster Achsabstand zweier Rohre (Abtastpunkte als Polylinien)
export function pipeGap(A, B) {
  let m = Infinity;
  for (let i = 0; i < A.length - 1; i++) for (let k = 0; k < B.length - 1; k++) m = Math.min(m, segDist(A[i], A[i + 1], B[k], B[k + 1]));
  return m;
}
// Damit jeder Schenkel exakt parallel zum Quellrohr läuft, müssen sich benachbarte Geraden schneiden: gleiche Höhe quer zur Biegeebene.
// An Ecken im Raum geht das nicht mit überall gleichem Abstand. Dann wird die Lage so wenig wie möglich geändert (kleinste gewichtete Änderung):
// Der erste Schenkel bleibt, Schenkel quer zur Versatzrichtung bleiben praktisch, schräge Schenkel geben nach – dort ist der Abstand kleiner.
function closeCorners(off, d, pts, sides) {
  const n = d.length, rows = [];
  for (let j = 0; j < n - 1; j++) {
    const ax = V.cross(d[j], d[j + 1]);
    if (V.len(ax) > 1e-9) rows.push({ j, nn: V.norm(ax) });
  }
  const miss = r => V.dot(V.sub(off[r.j], off[r.j + 1]), r.nn);
  if (rows.every(r => Math.abs(miss(r)) < 1e-6)) return;
  // Nachgiebigkeit je Schenkel: kurze und schräge geben nach, der erste gar nicht, das Ende fast nicht
  const give = d.map((dj, i) => { const L = V.len(V.sub(pts[i + 1], pts[i])) || 1; return i === 0 ? 0 : (Math.abs(V.dot(dj, sides[i])) > 0.01 ? 1 : 0.02) * (i === n - 1 ? 0.02 : 1) / L; });
  // Quer zum Schenkel projizierte Biegeebenen-Normale: Richtung, in die die Änderung am wenigsten kostet
  const row = (r, i) => (i === r.j + 1 ? 1 : i === r.j ? -1 : 0);
  const perp = (nn, i) => V.sub(nn, V.mul(d[i], V.dot(nn, d[i])));
  const m = rows.length, A = rows.map(a => rows.map(b => {
    let s = 0;
    for (const i of [a.j, a.j + 1]) if (row(b, i)) s += give[i] * row(a, i) * row(b, i) * V.dot(perp(a.nn, i), perp(b.nn, i));
    return s;
  })), b = rows.map(miss);
  const x = solve(A, b, m);
  if (!x) return;
  const fix = d.map(() => [0, 0, 0]);
  rows.forEach((r, k) => { for (const i of [r.j, r.j + 1]) fix[i] = V.add(fix[i], V.mul(perp(r.nn, i), give[i] * row(r, i) * x[k])); });
  off.forEach((o, i) => { off[i] = V.add(o, fix[i]); });
}
// Gleichungssystem lösen; bei zu wenig Nachgiebigkeit null
function solve(A, b, m) {
  A = A.map(r => [...r]); b = [...b];
  for (let k = 0; k < m; k++) {
    let p = k;
    for (let r = k + 1; r < m; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r;
    if (Math.abs(A[p][k]) < 1e-12) return null;
    [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
    for (let r = 0; r < m; r++) if (r !== k) { const f = A[r][k] / A[k][k]; for (let q = k; q < m; q++) A[r][q] -= f * A[k][q]; b[r] -= f * b[k]; }
  }
  return b.map((v, k) => v / A[k][k]);
}
// gapAuto(t) liefert den gemeinsamen Abstand aller Rohre des Bündels (zweiter Durchlauf, siehe needGap).
// Ergebnis: pts (Achspunkte inkl. Etagen), segs (Strecken mit Soll-Richtung, Schenkel, Art), offsets (Lage am Schenkelanfang),
// needGap (je Biegung: kleinster Abstand, damit zwischen Etage und Bogen die Mindest-Gerade bleibt), turns (Lage nach Biegung je rot).
// Wird ein Schenkel für seine Bögen zu kurz, gibt der Abstand auf den schrägen Schenkeln so wenig wie nötig nach (give 0 = exakt, 1 = verschoben wie das Quellrohr).
export function bundleGeometry(pts, dist, dir0, txs, opts) {
  const at = give => bundleAt(pts, dist, dir0, txs, opts, give), exact = at(0);
  if (!exact.short || txs?.length || at(1).short) return exact;
  let lo = 0, hi = 1, best = at(1);
  for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2, g = at(mid); if (g.short) lo = mid; else { hi = mid; best = g; } }
  return best;
}
function bundleAt(pts, dist, dir0, txs, { R, minStraight = 0 }, give) {
  const n = pts.length - 1, d = pts.slice(1).map((p, i) => V.norm(V.sub(p, pts[i])));
  const tx = new Map((txs || []).filter(t => t.bend >= 0 && t.bend < n - 1).map(t => [t.bend, t]));
  const off = [], turns = [];
  off[0] = V.mul(V.norm(V.sub(dir0, V.mul(d[0], V.dot(dir0, d[0])))), dist);
  // Versatzrichtung: Das Rohr liegt auf jeder Geraden im Abstand dist so weit wie möglich auf dieser Seite, Anfang und Ende also orthogonal versetzt.
  // Läuft ein Schenkel selbst in diese Richtung, geht es um die Ecke weiter (innen oder außen), und ab dort gilt die neue Seite.
  let side = V.norm(off[0]);
  const sides = [side];
  const onSide = (dj, fallback) => { const q = V.sub(side, V.mul(dj, V.dot(side, dj))); const l = V.len(q); if (l > 0.2) return V.mul(V.norm(q), dist * (1 - give + give * l)); side = V.norm(fallback); return fallback; };
  for (let j = 0; j < n - 1; j++) {
    const ax = V.cross(d[j], d[j + 1]), sn = V.len(ax);
    if (sn < 1e-9) { off[j + 1] = tx.size ? off[j] : onSide(d[j + 1], off[j]); sides[j + 1] = side; continue; }
    const nn = V.mul(ax, 1 / sn), m1 = V.cross(nn, d[j]), m2 = V.cross(nn, d[j + 1]);
    const carried = V.add(V.mul(nn, V.dot(off[j], nn)), V.mul(m2, V.dot(off[j], m1)));
    turns[j] = { 0: carried, 1: rotAbout(carried, d[j + 1], Math.PI / 2), [-1]: rotAbout(carried, d[j + 1], -Math.PI / 2) };
    const t = tx.get(j);
    off[j + 1] = t ? turns[j][t.rot > 0 ? 1 : -1] : tx.size ? carried : onSide(d[j + 1], carried);
    sides[j + 1] = side;
  }
  if (!tx.size) {
    closeCorners(off, d, pts, sides);
    // Lässt sich die Seite nicht halten, ohne dem Quellrohr zu nahe zu kommen: exakter Abstand, die Lage dreht sich mit
    if (off.some(o => V.len(o) < 0.6 * dist || V.len(o) > 1.4 * dist)) d.slice(0, -1).forEach((dj, j) => {
      const ax = V.cross(dj, d[j + 1]), sn = V.len(ax);
      if (sn < 1e-9) { off[j + 1] = off[j]; return; }
      const nn = V.mul(ax, 1 / sn);
      off[j + 1] = V.add(V.mul(nn, V.dot(off[j], nn)), V.mul(V.cross(nn, d[j + 1]), V.dot(off[j], V.cross(nn, dj))));
    });
  }
  // Ecken: in der Biegeebene Schnitt der beiden Geraden; quer dazu (nn) von der alten auf die neue Höhe → senkrechtes Stück (nur bei Lagewechsel)
  const out = [V.add(pts[0], off[0])], segs = [];
  const push = (q, dir, leg, kind) => { segs.push({ a: out.length - 1, dir, leg, kind }); out.push(q); };
  for (let i = 1; i < n; i++) {
    const d1 = d[i - 1], d2 = d[i], ax = V.cross(d1, d2), sn = V.len(ax);
    if (sn < 1e-9) continue;
    const nn = V.mul(ax, 1 / sn), m1 = V.cross(nn, d1), m2 = V.cross(nn, d2), cs = V.dot(d1, d2);
    const a1 = V.dot(off[i - 1], nn), a2 = V.dot(off[i], nn), b = V.dot(off[i - 1], m1), c = V.dot(off[i], m2), s = (b - c * cs) / sn;
    const u = V.add(V.mul(m2, c), V.mul(d2, s));
    push(V.add(V.add(pts[i], V.mul(nn, a1)), u), d1, i - 1, 'leg');
    if (Math.abs(a2 - a1) > 0.01) push(V.add(V.add(pts[i], V.mul(nn, a2)), u), V.mul(nn, Math.sign(a2 - a1)), i, 'drop');
  }
  push(V.add(pts[n], off[n - 1]), d[n - 1], n - 1, 'leg');
  // Soll-Länge je Strecke: Tangenten der angrenzenden Bögen (+ Mindest-Gerade zwischen zwei Bögen)
  const Tof = a => R * Math.tan(a * Math.PI / 360);
  const T = segs.map((sg, k) => (k ? Tof(Math.acos(Math.max(-1, Math.min(1, V.dot(segs[k - 1].dir, sg.dir)))) * 180 / Math.PI) : 0));
  let short = null;
  segs.forEach((sg, k) => {
    if (short) return;
    const len = V.dot(V.sub(out[sg.a + 1], out[sg.a]), sg.dir);
    const need = T[k] + (T[k + 1] || 0) + (k > 0 && k < segs.length - 1 ? minStraight : 0);
    if (len < need - 0.05) short = { ...sg, len, need, bend: sg.kind === 'drop' ? sg.leg - 1 : null };
  });
  return { pts: out, segs, offsets: off, turns, short };
}

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
