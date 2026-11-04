// Geometrie eines Bauteils (GLB-Dreiecke) lesbar machen: Kanten, Kreise, ebene Flächen und Fangpunkte.
// Alles in Millimetern im Modellsystem. Die Erkennung ist rein geometrisch, sie braucht keine CAD-Daten.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const G = { sub, add, mul, dot, cross, len, norm };

// Kante mit Knick über diesem Winkel gilt als Kante. Facettierte Zylinder haben meist 10–20° zwischen Nachbarn
const FEATURE_COS = Math.cos(32 * Math.PI / 180);

export function analyzePart(mesh) {
  // 1. Gleiche Punkte zusammenführen: GLB-Dateien teilen Punkte zwischen Flächen oft nicht
  const map = new Map(), P = [], tri = [];
  const vid = i => {
    const x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2], k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let v = map.get(k);
    if (v == null) { v = P.length; P.push([x, y, z]); map.set(k, v); }
    return v;
  };
  for (let i = 0; i < mesh.idx.length; i += 3) {
    const a = vid(mesh.idx[i]), b = vid(mesh.idx[i + 1]), c = vid(mesh.idx[i + 2]);
    if (a === b || b === c || a === c) continue;
    const n = cross(sub(P[b], P[a]), sub(P[c], P[a])), area = len(n) / 2;
    if (area < 1e-9) continue;
    tri.push({ v: [a, b, c], n: norm(n), area });
  }
  // 2. Kanten und ihre Dreiecke
  const edges = new Map(), ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  tri.forEach((t, ti) => [[0, 1], [1, 2], [2, 0]].forEach(([i, j]) => {
    const a = t.v[i], b = t.v[j], k = ek(a, b);
    let e = edges.get(k);
    if (!e) edges.set(k, (e = { a: Math.min(a, b), b: Math.max(a, b), t: [] }));
    e.t.push(ti);
  }));
  const feat = [];
  edges.forEach(e => {
    const sharp = e.t.length !== 2 || dot(tri[e.t[0]].n, tri[e.t[1]].n) < FEATURE_COS;
    e.sharp = sharp;
    if (sharp) feat.push(e);
  });
  // 3. Flächen: zusammenhängende Dreiecke ohne Knick dazwischen; eben, wenn alle Normalen gleich sind
  const region = new Int32Array(tri.length).fill(-1), faces = [];
  for (let s = 0; s < tri.length; s++) {
    if (region[s] >= 0) continue;
    const id = faces.length, stack = [s], list = [];
    region[s] = id;
    while (stack.length) {
      const ti = stack.pop();
      list.push(ti);
      tri[ti].v.forEach((a, i) => {
        const e = edges.get(ek(a, tri[ti].v[(i + 1) % 3]));
        if (e.sharp) return;
        e.t.forEach(o => { if (region[o] < 0) { region[o] = id; stack.push(o); } });
      });
    }
    const n0 = tri[list[0]].n, planar = list.every(ti => dot(tri[ti].n, n0) > 0.9995);
    let area = 0, c = [0, 0, 0];
    list.forEach(ti => { const t = tri[ti], m = mul(add(add(P[t.v[0]], P[t.v[1]]), P[t.v[2]]), 1 / 3); area += t.area; c = add(c, mul(m, t.area)); });
    faces.push({ id, tris: list, planar, n: planar ? n0 : null, area, c: mul(c, 1 / (area || 1)), d: planar ? dot(n0, P[tri[list[0]].v[0]]) : 0 });
  }
  // 4. Kantenzüge: Kanten mit Knick aneinanderhängen, an Verzweigungen trennen
  const adj = new Map();
  feat.forEach((e, i) => [e.a, e.b].forEach(v => { if (!adj.has(v)) adj.set(v, []); adj.get(v).push(i); }));
  const used = new Uint8Array(feat.length), chains = [];
  const walk = (start, ei) => {
    const pts = [start];
    let v = start, e = ei;
    while (e != null && !used[e]) {
      used[e] = 1;
      const f = feat[e], w = f.a === v ? f.b : f.a;
      pts.push(w);
      v = w;
      const nx = adj.get(v);
      e = nx.length === 2 ? nx.find(x => !used[x]) : null;
    }
    return pts;
  };
  // erst an Enden und Verzweigungen beginnen, dann geschlossene Ringe
  adj.forEach((list, v) => { if (list.length !== 2) list.forEach(e => { if (!used[e]) chains.push(walk(v, e)); }); });
  feat.forEach((e, i) => { if (!used[i]) chains.push(walk(e.a, i)); });
  // 5. Kreise und Bögen erkennen, gerade Kanten sammeln
  const circles = [], lines = [];
  chains.forEach(ch => {
    const closed = ch.length > 3 && ch[0] === ch.at(-1), pts = (closed ? ch.slice(0, -1) : ch).map(v => P[v]);
    const c = pts.length >= 5 ? fitCircle(pts) : null;
    if (c) { circles.push({ ...c, closed, pts }); return; }
    // gerade Stücke einzeln: ein Zug kann Ecken haben
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const last = i === pts.length - 1, d0 = norm(sub(pts[s + 1] || pts[i], pts[s]));
      const bend = !last && len(cross(d0, norm(sub(pts[i + 1], pts[i])))) > 0.02;
      if (bend || last) { if (len(sub(pts[i], pts[s])) > 0.05) lines.push({ a: pts[s], b: pts[i] }); s = i; }
    }
  });
  // Bögen desselben Kreises zusammenlegen (ein Ring kann an Verzweigungen geteilt sein)
  const merged = [];
  circles.forEach(c => {
    const m = merged.find(o => len(sub(o.c, c.c)) < 0.02 && Math.abs(o.r - c.r) < 0.02 && Math.abs(dot(o.n, c.n)) > 0.999);
    if (m) { m.pts.push(...c.pts); m.closed = m.closed || c.closed; } else merged.push({ ...c, pts: [...c.pts] });
  });
  merged.forEach((c, i) => {
    c.id = i;
    if (!c.closed) c.closed = arcSpan(c) > 1.9 * Math.PI; // Bögen, die zusammen fast ganz herumgehen
  });
  // 6. Fangpunkte: Eckpunkte (Enden von Kantenzügen), Kantenmitten, Kreismittelpunkte, Mitten ebener Flächen
  const points = [], addPt = (p, kind, ref) => { if (!points.some(q => len(sub(q.p, p)) < 0.01 && q.kind === kind)) points.push({ p, kind, ref }); };
  merged.forEach(c => addPt(c.c, 'center', c.id));
  lines.forEach((l, i) => { addPt(l.a, 'vertex', i); addPt(l.b, 'vertex', i); addPt(mul(add(l.a, l.b), 0.5), 'mid', i); });
  faces.filter(f => f.planar && f.area > 0.5).forEach(f => addPt(f.c, 'face', f.id));
  // Ausdehnung
  const mn = [0, 1, 2].map(k => P.reduce((m, p) => Math.min(m, p[k]), Infinity)), mx = [0, 1, 2].map(k => P.reduce((m, p) => Math.max(m, p[k]), -Infinity));
  return { P, tri, faces, region, circles: merged, lines, points, feat: feat.map(e => [e.a, e.b]), mn, mx, size: len(sub(mx, mn)) };
}

// Kreis durch Punkte: Ebene und Mittelpunkt aus drei gut verteilten Punkten, dann alle prüfen
export function fitCircle(pts) {
  const n = pts.length, a = pts[0], b = pts[Math.floor(n / 3)], c = pts[Math.floor(2 * n / 3)];
  const ab = sub(b, a), ac = sub(c, a), nn = cross(ab, ac), l2 = dot(nn, nn);
  if (l2 < 1e-10) return null;
  const ctr = add(a, mul(add(mul(cross(nn, ab), dot(ac, ac)), mul(cross(ac, nn), dot(ab, ab))), 1 / (2 * l2)));
  const r = len(sub(a, ctr)), nrm = norm(nn), tol = Math.max(0.01, r * 0.004);
  if (r < 0.2 || r > 1e4) return null;
  for (const p of pts) {
    if (Math.abs(len(sub(p, ctr)) - r) > tol || Math.abs(dot(sub(p, ctr), nrm)) > tol) return null;
  }
  // Ein Bogen braucht etwas Krümmung, sonst ist er eine gerade Kante
  if (arcSpan({ c: ctr, n: nrm, pts }) < 0.5) return null;
  return { c: ctr, n: nrm, r };
}
// Winkelbereich, den die Punkte eines Kreises abdecken
function arcSpan(c) {
  const u = norm(Math.abs(c.n[0]) < 0.9 ? cross(c.n, [1, 0, 0]) : cross(c.n, [0, 1, 0])), w = cross(c.n, u);
  const ang = c.pts.map(p => { const d = sub(p, c.c); return Math.atan2(dot(d, w), dot(d, u)); }).sort((x, y) => x - y);
  let gap = 2 * Math.PI - (ang.at(-1) - ang[0]);
  for (let i = 1; i < ang.length; i++) gap = Math.max(gap, ang[i] - ang[i - 1]);
  return 2 * Math.PI - gap;
}

// Kreise auf derselben Achse wie (A, n), sortiert nach Lage entlang n
export function coaxial(geo, A, n, tol = 0.03) {
  return geo.circles.filter(c => Math.abs(dot(c.n, n)) > 0.999 && len(cross(sub(c.c, A), n)) < tol)
    .map(c => ({ c, t: dot(sub(c.c, A), n) })).sort((x, y) => x.t - y.t);
}
// Wie weit reicht das Material entlang n? (größte und kleinste Lage aller Punkte)
export function extentAlong(geo, n) {
  let lo = Infinity, hi = -Infinity;
  for (const p of geo.P) { const t = dot(p, n); if (t < lo) lo = t; if (t > hi) hi = t; }
  return [lo, hi];
}
// Nach außen zeigt die Seite, auf der weniger Material liegt
export function outward(geo, A, n) {
  const t0 = dot(A, n);
  let pos = 0, neg = 0;
  for (const p of geo.P) { const t = dot(p, n) - t0; if (t > 0.01) pos++; else if (t < -0.01) neg++; }
  return pos <= neg ? n : mul(n, -1);
}

// Anschlüsse vorschlagen: Mündung = Kreis an einer Außenfläche, Anschlag = wo die Bohrung enger wird
export function suggestPorts(geo) {
  const out = [];
  for (const c of geo.circles.filter(x => x.closed)) {
    const d = outward(geo, c.c, c.n), [, hi] = extentAlong(geo, d);
    if (hi - dot(c.c, d) > 0.05) continue; // nicht an der Außenseite
    if (out.some(o => len(cross(sub(o.mouth, c.c), o.d)) < 0.05 && dot(o.d, d) > 0.999)) continue;
    const port = portFrom(geo, c.c, d);
    if (port) out.push(port);
  }
  return out;
}
// Anschluss an einer Mündung: Bohrung = kleinster Kreis nahe der Öffnung, Anschlag = erste Stufe nach innen
export function portFrom(geo, mouth, d) {
  const along = coaxial(geo, mouth, d).map(o => ({ ...o, t: -o.t })).filter(o => o.t > -0.05).sort((x, y) => x.t - y.t); // t = Tiefe nach innen
  if (!along.length) return null;
  const [lo, hi] = extentAlong(geo, d), body = hi - lo;
  // Bohrung: kleinster Kreis direkt an der Öffnung (Fasen eingeschlossen); Anschlag: erste Stufe danach, an der es enger wird
  const near = along.filter(o => o.t <= Math.min(3, body * 0.2)), bore = Math.min(...(near.length ? near : along).map(o => o.c.r));
  const boreAt = along.find(o => Math.abs(o.c.r - bore) < 0.02).t;
  const stop = along.find(o => o.t > boreAt + 0.05 && o.c.r < bore - 0.05);
  const depth = stop ? stop.t : body / 2;
  return { mouth: [...mouth], d: [...d], D: pipeD(bore * 2), depth: Math.round(depth * 100) / 100 };
}
// Bohrung mit Spiel → übliches Rohrmaß, sonst auf 0,1 mm
const PIPE_OD = [3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 38, 42];
export function pipeD(bore) {
  const s = PIPE_OD.find(v => bore >= v - 0.05 && bore - v <= 0.35);
  return s ?? Math.round(bore * 10) / 10;
}

// Strahl gegen alle Dreiecke (Möller–Trumbore); liefert den nächsten Treffer
export function rayHit(geo, o, dir, skip = 0) {
  let best = null;
  const { P, tri } = geo;
  for (let i = 0; i < tri.length; i++) {
    const [a, b, c] = tri[i].v, e1 = sub(P[b], P[a]), e2 = sub(P[c], P[a]), h = cross(dir, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = sub(o, P[a]), u = f * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = f * dot(dir, q);
    if (v < 0 || u + v > 1) continue;
    const t = f * dot(e2, q);
    if (t > skip && (!best || t < best.t)) best = { t, tri: i, p: add(o, mul(dir, t)) };
  }
  return best;
}
