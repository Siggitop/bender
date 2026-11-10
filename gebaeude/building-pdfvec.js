// Vektoren aus einer PDF-Seite lesen (Operatorliste von pdf.js): Linien, Rechtecke, Kurven mit Strichstärke und Farbe.
// Teil der Gebäude-App. Rein rechnend: extractVectors() bekommt die Operatorliste, die pdf.js-Operatornummern (OPS) und die Matrix
// Seitenraum → Bildpunkte (viewport.transform) und liefert Strecken in Bildpunkten (y nach unten), gruppiert nach Strich (Farbe, Breite).

const mulM = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const hex = c => `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

// fn/args: Operatorliste, OPS: Nummern, vpT: Seite → Bildpunkte, max: Obergrenze für Strecken
function extractVectors(fn, args, OPS, vpT, max = 600000) {
  let ctm = [1, 0, 0, 1, 0, 0], sc = [0, 0, 0], fc = [0, 0, 0], lw = 1;
  const stack = [], groups = new Map(), fills = [];
  let subs = [], segN = 0, cut = false, fillN = 0;
  const M = () => mulM(vpT, ctm);
  const pushSub = () => { const s = { p: [], closed: false }; subs.push(s); return s; };
  const curSub = () => subs.at(-1) || pushSub();
  const bez = (p0, p1, p2, p3, s) => { const n = 8; for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; s.p.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
  const last = s => s.p.at(-1);
  function run(ops, co) {
    let k = 0;
    for (const op of ops) {
      if (op === OPS.moveTo) { const s = pushSub(); s.p.push([co[k], co[k + 1]]); k += 2; }
      else if (op === OPS.lineTo) { const s = curSub(); if (!s.p.length) s.p.push([co[k], co[k + 1]]); else s.p.push([co[k], co[k + 1]]); k += 2; }
      else if (op === OPS.curveTo) { const s = curSub(), p0 = last(s) || [co[k], co[k + 1]]; bez(p0, [co[k], co[k + 1]], [co[k + 2], co[k + 3]], [co[k + 4], co[k + 5]], s); k += 6; }
      else if (op === OPS.curveTo2) { const s = curSub(), p0 = last(s) || [co[k], co[k + 1]]; bez(p0, p0, [co[k], co[k + 1]], [co[k + 2], co[k + 3]], s); k += 4; }
      else if (op === OPS.curveTo3) { const s = curSub(), p0 = last(s) || [co[k], co[k + 1]]; bez(p0, [co[k], co[k + 1]], [co[k + 2], co[k + 3]], [co[k + 2], co[k + 3]], s); k += 4; }
      else if (op === OPS.closePath) { const s = curSub(); s.closed = true; const f = s.p[0]; subs.push({ p: f ? [f.slice()] : [], closed: false, auto: true }); }
      else if (op === OPS.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; subs.push({ p: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }); k += 4; }
    }
  }
  function paint(stroke, fill) {
    const m = M(), det = Math.abs(m[0] * m[3] - m[1] * m[2]), sc2 = Math.sqrt(det) || 1, w = Math.max(0, lw * sc2);
    const tr = p => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
    const colS = hex(sc), colF = hex(fc);
    for (const s of subs) {
      if (s.p.length < 2) continue;
      const P = s.p.map(tr);
      if (fill && P.length >= 3 && fillN < 50000) { fills.push({ c: colF, p: P }); fillN++; }
      if (!stroke && !fill) continue;
      const key = stroke ? `${colS}|${Math.round(w * 20) / 20}` : `${colF}|0`;
      let g = groups.get(key); if (!g) { g = { c: stroke ? colS : colF, w: stroke ? Math.round(w * 20) / 20 : 0, a: [] }; groups.set(key, g); }
      for (let i = 0; i < P.length - 1; i++) { if (segN >= max) { cut = true; break; } g.a.push(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); segN++; }
      if (s.closed && P.length > 2 && segN < max) { g.a.push(P.at(-1)[0], P.at(-1)[1], P[0][0], P[0][1]); segN++; }
    }
  }
  for (let i = 0; i < fn.length; i++) {
    const op = fn[i], a = args[i];
    if (cut) break;
    switch (op) {
      case OPS.save: stack.push({ ctm, sc, fc, lw }); break;
      case OPS.restore: { const s = stack.pop(); if (s) ({ ctm, sc, fc, lw } = s); break; }
      case OPS.transform: ctm = mulM(ctm, a); break;
      case OPS.paintFormXObjectBegin: stack.push({ ctm, sc, fc, lw }); if (a?.[0]) ctm = mulM(ctm, a[0]); break;
      case OPS.paintFormXObjectEnd: { const s = stack.pop(); if (s) ({ ctm, sc, fc, lw } = s); break; }
      case OPS.setLineWidth: lw = a[0]; break;
      case OPS.setGState: (a?.[0] || []).forEach(([k, v]) => { if (k === 'LW') lw = v; }); break;
      case OPS.setStrokeRGBColor: sc = [a[0], a[1], a[2]]; break;
      case OPS.setFillRGBColor: fc = [a[0], a[1], a[2]]; break;
      case OPS.constructPath: run(a[0], a[1]); break;
      case OPS.moveTo: case OPS.lineTo: case OPS.curveTo: case OPS.curveTo2: case OPS.curveTo3: case OPS.closePath: case OPS.rectangle: run([op], a || []); break;
      case OPS.stroke: paint(true, false); subs = []; break;
      case OPS.closeStroke: if (subs.length) curSub().closed = true; paint(true, false); subs = []; break;
      case OPS.fill: case OPS.eoFill: paint(false, true); subs = []; break;
      case OPS.fillStroke: case OPS.eoFillStroke: paint(true, true); subs = []; break;
      case OPS.closeFillStroke: case OPS.closeEOFillStroke: if (subs.length) curSub().closed = true; paint(true, true); subs = []; break;
      case OPS.endPath: subs = []; break;
      default: break;
    }
  }
  // Ergebnis in zusammenhängende Zahlenfelder packen
  const gl = [...groups.values()].filter(g => g.a.length), total = gl.reduce((n, g) => n + g.a.length, 0), segs = new Float32Array(total);
  let o = 0; gl.forEach(g => { segs.set(g.a, o); o += g.a.length; });
  const fl = fills.slice(0, 20000), fn2 = fl.reduce((n, f) => n + f.p.length * 2, 0), fpts = new Float32Array(fn2);
  o = 0; fl.forEach(f => { f.p.forEach(q => { fpts[o++] = q[0]; fpts[o++] = q[1]; }); });
  return { groups: gl.map(g => ({ c: g.c, w: g.w, n: g.a.length / 4 })), segs, fills: fl.map(f => ({ c: f.c, n: f.p.length })), fpts, truncated: cut, count: total / 4 };
}

// Spatial-Hash über die Strecken (Bildpunkte): Zellen von 40 Punkten, lange Strecken werden entlang der Linie eingetragen
function buildGrid(segs, cell = 40) {
  const g = new Map(), n = segs.length / 4;
  for (let i = 0; i < n; i++) {
    const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3], L = Math.hypot(x2 - x1, y2 - y1), steps = Math.min(60, Math.max(1, Math.ceil(L / (cell / 2)))), seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, key = `${Math.floor((x1 + (x2 - x1) * t) / cell)},${Math.floor((y1 + (y2 - y1) * t) / cell)}`;
      if (seen.has(key)) continue; seen.add(key);
      let a = g.get(key); if (!a) { a = []; g.set(key, a); } a.push(i);
    }
  }
  return { g, cell };
}
// Strecken nahe (x, y) in Bildpunkten: Liste { i, d } der nächsten, höchstens `cap`
function nearSegs(segs, grid, x, y, r, cap = 40) {
  const { g, cell } = grid, out = new Set(), res = [];
  for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++) (g.get(`${cx},${cy}`) || []).forEach(i => out.add(i));
  out.forEach(i => {
    const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3], dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0, d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
    if (d <= r) res.push({ i, d });
  });
  return res.sort((a, b) => a.d - b.d).slice(0, cap);
}

export { extractVectors, buildGrid, nearSegs };
