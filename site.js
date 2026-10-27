// Baustellen-Berechnungen: Flächen (Wände, Boden, Decke), Schellen mit Bohrpunkten,
// Parallelrohre und Zuschnitt aus Stangen. Reine Rechnung, keine Oberfläche.
import { V, pointAt, rotAbout } from './geometry.js';

// Achsparallele Flächen. axis: 0 = X, 1 = Y, 2 = Z; side: auf welcher Seite des Rohrs die Fläche liegt.
// Eine Fläche: { id, kind, c, pass } – c = Lage im Raum (mm), pass = Durchführung erlaubt.
export const PLANE_KINDS = {
  back: { name: 'Rückwand', axis: 1, side: 1 },
  front: { name: 'Vorderwand', axis: 1, side: -1 },
  left: { name: 'Wand links', axis: 0, side: -1 },
  right: { name: 'Wand rechts', axis: 0, side: 1 },
  floor: { name: 'Boden', axis: 2, side: -1 },
  ceil: { name: 'Decke', axis: 2, side: 1 },
};
export const planeAxis = pl => PLANE_KINDS[pl.kind].axis;
// Abstand vom Raum aus gesehen: positiv = Punkt liegt im Raum vor der Fläche
export const planeDist = (pl, p) => (p[planeAxis(pl)] - pl.c) * -PLANE_KINDS[pl.kind].side;

// Rohr und Flächen: type 'through' = durchstößt die Fläche, 'behind' = liegt dahinter (auf der falschen Seite),
// 'touch' = Rohrmitte näher als r an der Fläche. through ist bei 'through' und 'behind' gesetzt.
export function planeHits(samples, planes, r) {
  const out = [];
  for (const pl of planes) {
    let behindRun = false;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1].p, b = samples[i].p, da = planeDist(pl, a), db = planeDist(pl, b);
      const s0 = samples[i - 1].s, s1 = samples[i].s;
      if ((da > 0) !== (db > 0)) {
        const t = da / (da - db);
        out.push({ plane: pl, p: V.add(a, V.mul(V.sub(b, a), t)), s: s0 + (s1 - s0) * t, through: true, type: 'through' });
      } else if (Math.max(da, db) <= 0) {
        if (!behindRun) out.push({ plane: pl, p: a, s: s0, through: true, type: 'behind' });
        behindRun = true;
        continue;
      } else if (Math.min(da, db) < r - 0.01) {
        const p = da < db ? a : b;
        if (!out.some(o => o.plane === pl && V.len(V.sub(o.p, p)) < 4 * r)) out.push({ plane: pl, p, s: da < db ? s0 : s1, through: false, type: 'touch' });
      }
      behindRun = false;
    }
  }
  return out;
}

// Gerade Abschnitte entlang der abgewickelten Länge (von Rohranfang/Biegeende bis Biegeanfang/Rohrende)
export function straightRuns(layout) {
  const runs = [];
  let s0 = 0, from = 'end';
  layout.bends.forEach(b => { runs.push({ s0, s1: b.start, from, to: 'bend' }); s0 = b.end; from = 'bend'; });
  runs.push({ s0, s1: layout.total, from, to: 'end' });
  return runs;
}

// Automatische Schellen: je Gerade eine Schelle im Abstand clampBend vom Bogen bzw. clampEnd vom Rohrende,
// dazwischen gleichmäßig mit höchstens clampMax. Geraden, die dafür zu kurz sind, bekommen nur dann eine Schelle
// (in der Mitte), wenn sonst der Höchstabstand entlang des Rohrs überschritten würde.
export function autoClamps(layout, f) {
  if (!layout.total) return [];
  const runs = straightRuns(layout), out = [];
  for (const r of runs) {
    const a = r.s0 + (r.from === 'bend' ? f.clampBend : f.clampEnd);
    const b = r.s1 - (r.to === 'bend' ? f.clampBend : f.clampEnd);
    if (b < a - 0.01) continue;
    const n = Math.max(b - a > 1 ? 1 : 0, Math.ceil((b - a) / f.clampMax - 1e-9));
    for (let i = 0; i <= n; i++) out.push(n ? a + (b - a) * i / n : a);
  }
  out.sort((x, y) => x - y);
  // Lücken schließen: in die längste Gerade innerhalb einer zu großen Lücke eine Schelle setzen
  for (let guard = 0; guard < 50; guard++) {
    const pts = [0, ...out, layout.total];
    let gap = -1;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] - pts[i - 1] > f.clampMax + 0.5) { gap = i; break; }
    }
    if (gap < 0) break;
    const lo = pts[gap - 1], hi = pts[gap];
    const cand = runs.map(r => ({ r, a: Math.max(r.s0, lo), b: Math.min(r.s1, hi) })).filter(c => c.b - c.a > 1).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    if (!cand) break;
    out.push((cand.a + cand.b) / 2);
    out.sort((x, y) => x - y);
  }
  return out;
}

// Lage einer Schelle, Befestigungsfläche (Rohr parallel zur Fläche, Abstand bis Schellenhöhe + 30 mm Zugabe)
// und Bohrpunkt auf der Fläche
export function clampInfo(samples, s, planes, f) {
  const p = pointAt(samples, s);
  const t = V.norm(V.sub(pointAt(samples, s + 1), pointAt(samples, s - 1)));
  let mount = null;
  for (const pl of planes) {
    if (Math.abs(t[planeAxis(pl)]) > 0.05) continue;
    const d = planeDist(pl, p);
    if (d > 0 && d <= f.clampH + 30 && (!mount || d < mount.d)) mount = { plane: pl, d };
  }
  let q = null;
  if (mount) { q = [...p]; q[planeAxis(mount.plane)] = mount.plane.c; }
  return { s, p, t, mount, q };
}

// Bohrpunkt in Baustellenmaßen: je Richtung in der Fläche der Abstand zur nächsten Wand/zum Boden,
// sonst zum näheren Rohrende (Anfang A oder Ende E)
const AX = [['rechts', 'links'], ['hinten', 'vor'], ['über', 'unter']];
export function drillCoords(q, mountPlane, planes, A, E) {
  const k = planeAxis(mountPlane), out = [];
  for (const i of [0, 1, 2]) {
    if (i === k) continue;
    const refs = planes.filter(pl => planeAxis(pl) === i);
    if (refs.length) {
      const pl = refs.reduce((m, x) => (Math.abs(q[i] - x.c) < Math.abs(q[i] - m.c) ? x : m));
      out.push({ v: Math.abs(q[i] - pl.c), ref: PLANE_KINDS[pl.kind].name, axis: i });
    } else {
      const useA = Math.abs(q[i] - A[i]) <= Math.abs(q[i] - E[i]), o = useA ? A : E, d = q[i] - o[i];
      out.push({ v: Math.abs(d), ref: useA ? 'Rohranfang' : 'Rohrende', dir: Math.abs(d) < 0.05 ? '' : AX[i][d > 0 ? 0 : 1], axis: i });
    }
  }
  return out;
}

// Parallelrohr als Rohrbündel: Der Versatz startet senkrecht zum ersten Schenkel (Richtung dir0, Betrag dist)
// und wird an jeder Biegung mitgedreht – wie bei gemeinsam gebogenen Rohren. Liegt er in der Biegeebene,
// entstehen verschachtelte Bögen (innen kürzer, außen länger), quer dazu bleibt die Form gleich.
// Schnittpunkt i: Anteil quer zur Biegeebene unverändert, Anteil in der Ebene auf der Winkelhalbierenden.
export function parallelPoints(pts, dist, dir0) {
  const d = pts.slice(1).map((p, i) => V.norm(V.sub(p, pts[i])));
  const o = [V.mul(V.norm(V.sub(dir0, V.mul(d[0], V.dot(dir0, d[0])))), dist)];
  for (let i = 1; i < d.length; i++) {
    const ax = V.cross(d[i - 1], d[i]), s = V.len(ax);
    o.push(s < 1e-9 ? o[i - 1] : rotAbout(o[i - 1], V.mul(ax, 1 / s), Math.acos(Math.max(-1, Math.min(1, V.dot(d[i - 1], d[i]))))));
  }
  return pts.map((p, i) => {
    if (i === 0) return V.add(p, o[0]);
    if (i === pts.length - 1) return V.add(p, o.at(-1));
    const n = V.norm(V.cross(d[i - 1], d[i])), m1 = V.cross(n, d[i - 1]), m2 = V.cross(n, d[i]);
    return V.add(V.add(p, V.mul(n, V.dot(o[i - 1], n))), V.mul(V.add(m1, m2), V.dot(o[i - 1], m1) / (1 + V.dot(m1, m2))));
  });
}

// Zuschnitt aus Stangen (größte Stücke zuerst in die erste passende Stange), Sägeschnitt kerf
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
