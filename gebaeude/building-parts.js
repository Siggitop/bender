// Bauteil-Baukasten: Quader, Zylinder, Keil und GLB-Netze mit Addieren/Abziehen, Formeln und Parametern.
// Teil der Gebäude-App. Rein rechnend (kein DOM): building.js und der Editor nutzen buildPart() und evalExpr().
// Einheiten Millimeter, z nach oben. Ein Bauteil (part) = { id, name, params:[{k,v,d}], prims:[…] }.

// ---------- Formeln ----------
// Zahlen, Parameternamen, + - * / ( ) und min max abs round sqrt floor ceil. Wirft bei Fehlern.
function evalExpr(src, vars = {}) {
  if (typeof src === 'number') return src;
  const s = String(src ?? '').trim().replace(/,/g, '.').replace(/\s*;\s*/g, ',');
  if (s === '') return 0;
  let i = 0;
  const FN = { min: Math.min, max: Math.max, abs: Math.abs, round: Math.round, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil };
  const ws = () => { while (s[i] === ' ') i++; };
  function prim() {
    ws();
    if (s[i] === '(') { i++; const v = sum(); ws(); if (s[i] !== ')') throw new Error('")" fehlt'); i++; return v; }
    if (s[i] === '-') { i++; return -prim(); }
    if (s[i] === '+') { i++; return prim(); }
    const m = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const id = /^[A-Za-zÄÖÜäöüß_][\wÄÖÜäöüß]*/.exec(s.slice(i));
    if (id) {
      i += id[0].length; ws();
      if (s[i] === '(') {
        i++; const a = []; ws();
        if (s[i] !== ')') { do { a.push(sum()); ws(); if (s[i] === ',') { i++; continue; } break; } while (true); }
        ws(); if (s[i] !== ')') throw new Error('")" fehlt'); i++;
        const f = FN[id[0].toLowerCase()]; if (!f) throw new Error(`Funktion „${id[0]}“ unbekannt`);
        return f(...a);
      }
      if (!(id[0] in vars)) throw new Error(`„${id[0]}“ ist kein Parameter`);
      return vars[id[0]];
    }
    throw new Error(`Unerwartet: „${s.slice(i, i + 6)}“`);
  }
  function prod() { let v = prim(); for (;;) { ws(); if (s[i] === '*') { i++; v *= prim(); } else if (s[i] === '/') { i++; const d = prim(); if (d === 0) throw new Error('Teilung durch 0'); v /= d; } else return v; } }
  function sum() { let v = prod(); for (;;) { ws(); if (s[i] === '+') { i++; v += prod(); } else if (s[i] === '-') { i++; v -= prod(); } else return v; } }
  const v = sum(); ws();
  if (i < s.length) throw new Error(`Unerwartet: „${s.slice(i, i + 6)}“`);
  if (!Number.isFinite(v)) throw new Error('Kein Zahlenwert');
  return v;
}

// ---------- Vektoren ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a); return l ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

// ---------- CSG (BSP, nach dem bekannten csg.js-Verfahren) ----------
const EPS = 1e-4;
class Poly {
  constructor(v, col) { this.v = v; this.col = col; const n = unit(cross(sub(v[1], v[0]), sub(v[2], v[0]))); this.n = n; this.w = dot(n, v[0]); }
}
class Node {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys) this.build(polys); }
  invert() {
    this.polys.forEach(p => { p.v.reverse(); p.n = p.n.map(x => -x); p.w = -p.w; });
    if (this.plane) { this.plane = { n: this.plane.n.map(x => -x), w: -this.plane.w }; }
    [this.front, this.back] = [this.back, this.front];
    this.front?.invert(); this.back?.invert();
  }
  clip(polys) {
    if (!this.plane) return polys.slice();
    let f = [], b = [];
    polys.forEach(p => split(this.plane, p, f, b, f, b));
    f = this.front ? this.front.clip(f) : f;
    b = this.back ? this.back.clip(b) : [];
    return f.concat(b);
  }
  clipTo(o) { this.polys = o.clip(this.polys); this.front?.clipTo(o); this.back?.clipTo(o); }
  all() { return this.polys.concat(this.front ? this.front.all() : [], this.back ? this.back.all() : []); }
  build(polys) {
    if (!polys.length) return;
    if (!this.plane) this.plane = { n: polys[0].n.slice(), w: polys[0].w };
    const f = [], b = [];
    polys.forEach(p => split(this.plane, p, this.polys, this.polys, f, b));
    if (f.length) (this.front ||= new Node()).build(f);
    if (b.length) (this.back ||= new Node()).build(b);
  }
}
function split(pl, poly, cf, cb, f, b) {
  let pt = 0; const T = [];
  for (const v of poly.v) { const t = dot(pl.n, v) - pl.w, ty = t < -EPS ? 2 : t > EPS ? 1 : 0; pt |= ty; T.push(ty); }
  if (pt === 0) (dot(pl.n, poly.n) > 0 ? cf : cb).push(poly);
  else if (pt === 1) f.push(poly);
  else if (pt === 2) b.push(poly);
  else {
    const F = [], Bk = [], n = poly.v.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ti = T[i], tj = T[j], vi = poly.v[i], vj = poly.v[j];
      if (ti !== 2) F.push(vi);
      if (ti !== 1) Bk.push(vi);
      if ((ti | tj) === 3) { const t = (pl.w - dot(pl.n, vi)) / dot(pl.n, sub(vj, vi)), v = [vi[0] + (vj[0] - vi[0]) * t, vi[1] + (vj[1] - vi[1]) * t, vi[2] + (vj[2] - vi[2]) * t]; F.push(v); Bk.push(v.slice()); }
    }
    const mk = V => { const P = new Poly(V, poly.col); return Number.isFinite(P.w) && Math.hypot(...P.n) > 0.5 ? P : null; };
    if (F.length >= 3) { const P = mk(F); if (P) f.push(P); }
    if (Bk.length >= 3) { const P = mk(Bk); if (P) b.push(P); }
  }
}
function csgUnion(A, B) {
  const a = new Node(A), b = new Node(B);
  a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all());
  return a.all();
}
function csgSub(A, B) {
  const a = new Node(A), b = new Node(B);
  a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert();
  return a.all();
}

// ---------- Grundkörper (Polygone, nach außen gerichtet) ----------
const mkPoly = (V, col) => { const P = new Poly(V, col); return Math.hypot(...P.n) > 0.5 ? P : null; };
// Prisma aus konvexem Querschnitt (x,y) von c0 bis c1, abgebildet mit M(a,b,c)
function prismPolys(sec, c0, c1, M, col) {
  const out = [], N = sec.length;
  const cap = (c, rev) => { const V = sec.map(p => M(p[0], p[1], c)); if (rev) V.reverse(); const P = mkPoly(V, col); if (P) out.push(P); };
  cap(c1, false); cap(c0, true);
  for (let i = 0; i < N; i++) { const p = sec[i], q = sec[(i + 1) % N], P = mkPoly([M(p[0], p[1], c0), M(q[0], q[1], c0), M(q[0], q[1], c1), M(p[0], p[1], c1)], col); if (P) out.push(P); }
  return out;
}
const SEG = 32;
function ellipse(ra, rb) { const S = []; for (let i = 0; i < SEG; i++) { const t = i / SEG * Math.PI * 2; S.push([Math.cos(t) * ra, Math.sin(t) * rb]); } return S; }
function rotZ(polys, deg, cx, cy) {
  if (!deg) return polys;
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return polys.map(P => new Poly(P.v.map(v => [cx + (v[0] - cx) * c - (v[1] - cy) * s, cy + (v[0] - cx) * s + (v[1] - cy) * c, v[2]]), P.col));
}
// Ein Grundkörper aus fertigen Zahlen: { kind, x,y,z,w,d,h, rot, axis }
function solidPolys(q, col) {
  const { x, y, z, w, d, h } = q;
  let P;
  if (q.kind === 'cyl') {
    const ax = q.axis || 'z';
    if (ax === 'z') P = prismPolys(ellipse(w / 2, d / 2), 0, h, (a, b, c) => [x + w / 2 + a, y + d / 2 + b, z + c], col);
    else if (ax === 'x') P = prismPolys(ellipse(d / 2, h / 2), 0, w, (a, b, c) => [x + c, y + d / 2 + a, z + h / 2 + b], col);
    else P = prismPolys(ellipse(w / 2, h / 2), 0, d, (a, b, c) => [x + w / 2 + a, y + c, z + h / 2 + b], col);
  } else if (q.kind === 'wedge') {
    P = prismPolys([[0, 0], [w, 0], [w, h]], 0, d, (a, b, c) => [x + a, y + c, z + b], col);
    // Orientierung: Querschnitt liegt in x/z, Ausdehnung in y; Normalen stimmen, wenn der Querschnitt gegen den Uhrzeigersinn in (a,b) läuft und (a,b,c)->(x,z,y) spiegelt
    P = P.map(p => new Poly([...p.v].reverse(), p.col));
  } else {
    const V = [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    P = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]].map(f => mkPoly(f.map(i => V[i]), col)).filter(Boolean);
  }
  return rotZ(P.filter(Boolean), q.rot || 0, x + w / 2, y + d / 2);
}

// ---------- Farben ----------
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [0.7, 0.7, 0.7]; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const PART_COLORS = [['#c8ccd2', 'Metall hell'], ['#8d949c', 'Metall dunkel'], ['#d9c29a', 'Holz'], ['#f2f2ef', 'Weiß'], ['#e3b52a', 'Gelb (Sicherheit)'], ['#2f6fb0', 'Blau'], ['#b83a32', 'Rot'], ['#4d9a6b', 'Grün'], ['#9fc7dc', 'Glas'], ['#3b3e43', 'Schwarz']];

// ---------- GLB-Netz als Grundkörper ----------
// m = { tri: Float32Array (9 Zahlen je Dreieck: 3 Ecken), col:[r,g,b], mn:[x,y,z], mx:[x,y,z] } in Millimetern, z nach oben, Minimum im Ursprung
function meshFromGlb(g) {
  // glTF: y oben → Gebäude: z oben (x, y, z) → (x, -z, y). Je Dreieck 12 Zahlen: 3 Ecken (x,y,z) und die Farbe aus dem Werkstoff
  const n = g.idx.length / 3, tri = new Float32Array(n * 12), P = g.pos, C = g.col;
  for (let t = 0; t < n; t++) {
    for (let v = 0; v < 3; v++) { const k = g.idx[t * 3 + v] * 3, o = t * 12 + v * 3; tri[o] = P[k]; tri[o + 1] = -P[k + 2]; tri[o + 2] = P[k + 1]; }
    const k0 = g.idx[t * 3] * 3; tri[t * 12 + 9] = C?.length ? C[k0] : 0.7; tri[t * 12 + 10] = C?.length ? C[k0 + 1] : 0.7; tri[t * 12 + 11] = C?.length ? C[k0 + 2] : 0.7;
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) { const x = tri[t * 12 + v * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) tri[t * 12 + v * 3 + k] -= mn[k];
  const c = C?.length ? [C[0], C[1], C[2]] : [0.7, 0.7, 0.7];
  return { tri, col: c, size: [0, 1, 2].map(k => mx[k] - mn[k]) };
}
// Netze liegen nicht im Gebäude-JSON (Undo/Speichern bleiben klein), sondern im Speicher (MESHES) und in der Dateiablage (building-store, Schlüssel „mesh-<key>“)
const MESHES = new Map();
const setMesh = (key, f32) => { MESHES.set(key, f32); };
const getMesh = key => MESHES.get(key);
function meshKey(f32) { let h = 2166136261 >>> 0; const u = new Uint32Array(f32.buffer, f32.byteOffset, f32.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return `${h.toString(36)}-${f32.length}c`; }
// m aus meshFromGlb → Verweis fürs Bauteil; die Daten selbst kommen in MESHES
function packMesh(m) { const key = meshKey(m.tri); setMesh(key, m.tri); return { key, col: m.col.map(v => Math.round(v * 1000) / 1000), size: m.size.map(v => Math.round(v * 10) / 10) }; }

// ---------- Bauteil rechnen ----------
// Ergebnis: { out: [pos,nor,col je Ecke …] (9 Zahlen je Ecke), mn, mx, errors: {primId: Text}, vars }
function paramVars(part, pv = {}) {
  const vars = {}, errors = {};
  (part.params || []).forEach(p => {
    if (!p.k) return;
    try { vars[p.k] = pv[p.k] != null && pv[p.k] !== '' ? evalExpr(pv[p.k], vars) : evalExpr(p.v, vars); } catch (e) { vars[p.k] = 0; errors['param:' + p.k] = e.message; }
  });
  return { vars, errors };
}
const PCACHE = new Map();
function buildPart(part, pv = {}) {
  const key = JSON.stringify([part.params, part.prims, pv, MESHES.size]);
  const hit = PCACHE.get(key); if (hit) return hit;
  const { vars, errors } = paramVars(part, pv);
  const out = [], loose = [];
  let solid = [], lastCol = [0.7, 0.7, 0.7];
  const num = (pr, f) => { try { return evalExpr(pr[f], vars); } catch (e) { errors[pr.id || pr.name] = `${f}: ${e.message}`; return 0; } };
  for (const pr of part.prims || []) {
    if (pr.off) continue;
    const reps = Math.max(1, Math.min(200, Math.round(num(pr, 'n') || 1))), dx = num(pr, 'dx'), dy = num(pr, 'dy'), dz = num(pr, 'dz');
    const q = { kind: pr.kind, axis: pr.axis, x: num(pr, 'x'), y: num(pr, 'y'), z: num(pr, 'z'), w: num(pr, 'w'), d: num(pr, 'd'), h: num(pr, 'h'), rot: num(pr, 'rot') };
    const col = pr.col ? hexRgb(pr.col) : (pr.op === 'sub' ? lastCol : [0.7, 0.7, 0.7]);
    if (pr.op !== 'sub' && pr.col) lastCol = col; else if (pr.op !== 'sub') lastCol = col;
    if (pr.kind === 'mesh') {
      if (!pr.mesh) continue;
      const T = getMesh(pr.mesh.key); if (!T) continue;
      const ST = pr.mesh.key.endsWith('c') ? 12 : 9, sz = pr.mesh.size, sx = sz[0] ? (q.w || sz[0]) / sz[0] : 1, sy = sz[1] ? (q.d || sz[1]) / sz[1] : 1, sz2 = sz[2] ? (q.h || sz[2]) / sz[2] : 1;
      const over = pr.col ? hexRgb(pr.col) : null, a = (q.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = q.x + (sz[0] * sx) / 2, cy = q.y + (sz[1] * sy) / 2;
      const later = (part.prims || []).slice((part.prims || []).indexOf(pr) + 1).some(x => x.op === 'sub' && !x.off), csg = later && T.length / ST <= 6000;
      if (later && !csg) errors[pr.id || pr.name] = 'Zu viele Dreiecke zum Ausschneiden (über 6000): das Netz wird nur hinzugefügt';
      for (let r = 0; r < reps; r++) {
        const polys = [];
        for (let i = 0; i < T.length; i += ST) {
          const V = [0, 3, 6].map(o => { const px = q.x + dx * r + T[i + o] * sx, py = q.y + dy * r + T[i + o + 1] * sy, pz = q.z + dz * r + T[i + o + 2] * sz2, ox = cx + dx * r, oy = cy + dy * r; return [ox + (px - ox) * ca - (py - oy) * sa, oy + (px - ox) * sa + (py - oy) * ca, pz]; });
          const c = over || (ST === 12 ? [T[i + 9], T[i + 10], T[i + 11]] : pr.mesh.col);
          if (csg) { const P = mkPoly(V, c); if (P) polys.push(P); }
          else { const nn = unit(cross(sub(V[1], V[0]), sub(V[2], V[0]))); V.forEach(v => loose.push(v[0], v[1], v[2], nn[0], nn[1], nn[2], c[0], c[1], c[2])); }
        }
        if (csg && polys.length) solid = solid.length ? csgUnion(solid, polys) : polys;
      }
      continue;
    }
    if (pr.op !== 'sub' && !(q.w > 0 && q.d > 0 && q.h > 0)) { errors[pr.id || pr.name] = 'Breite, Tiefe und Höhe müssen größer als 0 sein'; continue; }
    if (pr.op === 'sub' && !(q.w > 0 && q.d > 0 && q.h > 0)) continue;
    for (let r = 0; r < reps; r++) {
      const P = solidPolys({ ...q, x: q.x + dx * r, y: q.y + dy * r, z: q.z + dz * r }, col);
      if (pr.op === 'sub') { if (solid.length) solid = csgSub(solid, P); } else solid = solid.length ? csgUnion(solid, P) : P;
    }
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], seen = (x, y, z) => { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z); };
  solid.forEach(P => {
    for (let i = 1; i < P.v.length - 1; i++) for (const v of [P.v[0], P.v[i], P.v[i + 1]]) { out.push(v[0], v[1], v[2], P.n[0], P.n[1], P.n[2], P.col[0], P.col[1], P.col[2]); seen(v[0], v[1], v[2]); }
  });
  for (let i = 0; i < loose.length; i += 9) { out.push(...loose.slice(i, i + 9)); seen(loose[i], loose[i + 1], loose[i + 2]); }
  if (!out.length) { mn.fill(0); mx.fill(0); }
  const res = { out, mn, mx, errors, vars, tris: out.length / 27 };
  if (PCACHE.size > 60) PCACHE.clear();
  PCACHE.set(key, res);
  return res;
}

// Zahlenwerte eines Grundkörpers für Anzeige und Auswahl: { o:{x,y,z,w,d,h,rot,n,dx,dy,dz}, err:{feld:Text}, vars }
function primNums(part, pr, pv = {}) {
  const { vars } = paramVars(part, pv), o = {}, err = {};
  for (const f of ['x', 'y', 'z', 'w', 'd', 'h', 'rot', 'n', 'dx', 'dy', 'dz']) { try { o[f] = evalExpr(pr[f], vars); } catch (e) { o[f] = 0; err[f] = e.message; } }
  if (pr.kind === 'mesh' && pr.mesh) { if (!(o.w > 0)) o.w = pr.mesh.size[0]; if (!(o.d > 0)) o.d = pr.mesh.size[1]; if (!(o.h > 0)) o.h = pr.mesh.size[2]; }
  return { o, err, vars };
}

// ---------- Vorlagen ----------
let _id = 0;
const pid = () => `p${Date.now().toString(36)}${(_id++).toString(36)}`;
const prim = (o = {}) => ({ id: pid(), name: '', kind: 'box', op: 'add', x: '0', y: '0', z: '0', w: '100', d: '100', h: '100', rot: '0', col: '#c8ccd2', ...o });
function startParts() {
  const mk = (name, params, prims) => ({ id: pid(), name, params, prims: prims.map(p => prim(p)) });
  return [
    mk('Regal', [{ k: 'B', v: '1000', d: 'Breite' }, { k: 'T', v: '400', d: 'Tiefe' }, { k: 'H', v: '2000', d: 'Höhe' }, { k: 'S', v: '25', d: 'Stärke' }, { k: 'N', v: '5', d: 'Böden' }], [
      { name: 'Seite links', w: 'S', d: 'T', h: 'H', col: '#d9c29a' }, { name: 'Seite rechts', x: 'B-S', w: 'S', d: 'T', h: 'H', col: '#d9c29a' },
      { name: 'Böden', x: 'S', w: 'B-2*S', d: 'T', h: 'S', n: 'N', dz: '(H-S)/(N-1)', col: '#d9c29a' },
    ]),
    mk('Gasflaschenschrank', [{ k: 'B', v: '1200', d: 'Breite' }, { k: 'T', v: '600', d: 'Tiefe' }, { k: 'H', v: '2050', d: 'Höhe' }, { k: 'S', v: '40', d: 'Wandstärke' }], [
      { name: 'Korpus', w: 'B', d: 'T', h: 'H', col: '#e3b52a' }, { name: 'Innenraum', x: 'S', y: 'S', z: 'S', w: 'B-2*S', d: 'T-2*S', h: 'H-2*S', op: 'sub' },
      { name: 'Lüftung oben', x: 'B/2-100', y: '-1', z: 'H-150', w: '200', d: 'S+2', h: '60', op: 'sub' }, { name: 'Lüftung unten', x: 'B/2-100', y: '-1', z: '90', w: '200', d: 'S+2', h: '60', op: 'sub' },
      { name: 'Tür links', x: 'S', y: '-6', z: 'S', w: '(B-2*S)/2-2', d: '6', h: 'H-2*S', col: '#d9a621' }, { name: 'Tür rechts', x: 'B/2+2', y: '-6', z: 'S', w: '(B-2*S)/2-2', d: '6', h: 'H-2*S', col: '#d9a621' },
    ]),
    mk('Digestorium', [{ k: 'B', v: '1500', d: 'Breite' }, { k: 'T', v: '800', d: 'Tiefe' }, { k: 'H', v: '2400', d: 'Höhe' }, { k: 'AH', v: '900', d: 'Arbeitshöhe' }], [
      { name: 'Unterschrank', w: 'B', d: 'T', h: 'AH', col: '#f2f2ef' }, { name: 'Arbeitsfläche', z: 'AH', w: 'B', d: 'T', h: '30', col: '#3b3e43' },
      { name: 'Rückwand', y: 'T-60', z: 'AH+30', w: 'B', d: '60', h: 'H-AH-30', col: '#f2f2ef' }, { name: 'Seite links', z: 'AH+30', w: '60', d: 'T-60', h: 'H-AH-30', col: '#f2f2ef' }, { name: 'Seite rechts', x: 'B-60', z: 'AH+30', w: '60', d: 'T-60', h: 'H-AH-30', col: '#f2f2ef' },
      { name: 'Oberteil', z: 'H-250', w: 'B', d: 'T', h: '250', col: '#f2f2ef' }, { name: 'Frontscheibe', x: '60', y: '40', z: 'AH+250', w: 'B-120', d: '10', h: 'H-AH-500', col: '#9fc7dc' },
      { name: 'Abluftstutzen', kind: 'cyl', x: 'B/2-125', y: 'T/2-125', z: 'H', w: '250', d: '250', h: '300', col: '#8d949c' },
    ]),
  ];
}

export { primNums, setMesh, getMesh, meshKey, evalExpr, buildPart, paramVars, prim, pid, startParts, meshFromGlb, packMesh, hexRgb, PART_COLORS, csgUnion, csgSub, solidPolys };
