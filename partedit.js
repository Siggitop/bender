// Bauteil-Editor: Anschlüsse, Achsen und Punkte direkt an der Geometrie festlegen, dazu Messen.
// Vorbild Fusion 360 (Joint Origin, Konstruktionsachsen, Messen). Eigene Ansicht, eigene Kamera, eigenes WebGL.
import { analyzePart, coaxial, outward, portFrom, suggestPorts, rayHit, extentAlong, pipeD, G } from './partgeom.js';
const { sub, add, mul, dot, cross, len, norm } = G;

const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  ok: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  list: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  measure: '<path d="M3 16 16 3l5 5L8 21z"/><path d="m7.5 11.5 2 2M11 8l3 3M14.5 4.5l2 2"/>',
  port: '<circle cx="9" cy="15" r="5"/><path d="M12.5 11.5 20 4M15 4h5v5"/>',
  axis: '<path d="M3 21l3-3M9 15l6-6M18 6l3-3"/><circle cx="12" cy="12" r="2"/>',
  point: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="m12 9 3 3-3 3-3-3Z"/>',
  xray: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" stroke-dasharray="3 2.5"/><path d="M12 12v9M4 7.5l8 4.5 8-4.5"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  view: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  flip: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  rot: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  auto: '<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>',
};
const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uM; uniform mat3 uR;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() { vec4 c = uM * vec4(aPos, 1.0); gl_Position = c; vN = uR * aNor; vC = aCol; vZ = c.z; }`;
const FS = `precision mediump float;
uniform vec3 uL; uniform float uAlpha; uniform float uFlat;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() {
  vec3 n = normalize(vN);
  float d = abs(dot(n, uL));
  float s = pow(max(dot(n, normalize(uL + vec3(0.0, 0.0, -1.0))), 0.0), 30.0);
  vec3 col = mix(vC * (0.45 + 0.6 * d) + vec3(0.25) * s, vC, uFlat);
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`;
const VIEWS = { iso: [-0.6, 0.45, 'Iso'], front: [0, 0, 'Vorne'], top: [0, Math.PI / 2 - 1e-4, 'Oben'], right: [-Math.PI / 2, 0, 'Rechts'], back: [Math.PI, 0, 'Hinten'], left: [Math.PI / 2, 0, 'Links'] };

export function openPartEditor(lib, mesh, env) {
  const fmt2 = n => (Number.isFinite(n) ? (Math.abs(n) < 0.005 ? 0 : n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
  const num = s => { const v = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgb = h => { h = css(h); if (h.startsWith('#')) return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return [0.04, 0.49, 0.74]; };
  const axCol = n => { const a = n.map(Math.abs), k = a.indexOf(Math.max(...a)); return a[k] > 0.95 ? css(['--ax-x', '--ax-y', '--ax-z'][k]) : css('--mark'); };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const geo = analyzePart(mesh), mid = geo.mn.map((v, k) => (v + geo.mx[k]) / 2), size = geo.size || 1;
  lib.aux ||= { axes: [], pts: [] };
  lib.aux.axes ||= []; lib.aux.pts ||= [];

  // ---------- Oberfläche ----------
  const root = document.createElement('div');
  root.className = 'ped';
  root.innerHTML = `
    <canvas class="ped-gl"></canvas><canvas class="ped-2d"></canvas>
    <div class="ped-head">
      <button class="flbtn" data-pe="list" title="Liste" aria-label="Liste">${SVG(IC.list)}</button>
      <button class="flbtn" data-pe="undo" title="Rückgängig" aria-label="Rückgängig">${SVG(IC.undo)}</button>
      <button class="flbtn" data-pe="redo" title="Wiederholen" aria-label="Wiederholen">${SVG(IC.redo)}</button>
      <b class="ped-title">${esc(lib.name)}</b>
      <button class="flbtn primary" data-pe="done" title="Fertig" aria-label="Fertig">${SVG(IC.ok)}</button>
    </div>
    <aside class="ped-list"></aside>
    <div class="ped-info" hidden></div>
    <div class="ped-bottom">
      <div class="ped-cmd" hidden></div>
      <div class="navbar ped-tools" role="toolbar" aria-label="Werkzeuge">
        <button class="nvb" data-pe="measure" title="Messen" aria-label="Messen">${SVG(IC.measure)}</button>
        <button class="nvb" data-pe="port" title="Anschluss" aria-label="Anschluss">${SVG(IC.port)}</button>
        <button class="nvb" data-pe="axis" title="Achse" aria-label="Achse">${SVG(IC.axis)}</button>
        <button class="nvb" data-pe="point" title="Punkt" aria-label="Punkt">${SVG(IC.point)}</button>
        <i class="bsep"></i>
        <button class="nvb" data-pe="xray" title="Durchsicht" aria-label="Durchsicht">${SVG(IC.xray)}</button>
        <button class="nvb" data-pe="view" title="Ansicht" aria-label="Ansicht">${SVG(IC.view)}</button>
        <button class="nvb" data-pe="fit" title="Einpassen" aria-label="Einpassen">${SVG(IC.fit)}</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const glc = $('.ped-gl'), cv = $('.ped-2d'), ctx = cv.getContext('2d');
  const listEl = $('.ped-list'), infoEl = $('.ped-info'), cmdEl = $('.ped-cmd');

  // ---------- Zustand ----------
  const cam = { yaw: VIEWS.iso[0], pitch: VIEWS.iso[1], sc: 1, panX: 0, panY: 0, view: 'iso' };
  let W = 1, H = 1, xray = false, listOpen = innerWidth > 700, hover = null, cmd = null, sel = null, meas = [], viewMenu = false;
  const undo = [], redo = [];
  const snap = () => JSON.stringify({ ports: lib.ports, axis: lib.axis ?? null, aux: lib.aux });
  const apply = s => { const o = JSON.parse(s); lib.ports = o.ports; if (o.axis == null) delete lib.axis; else lib.axis = o.axis; lib.aux = o.aux; };
  const change = fn => { undo.push(snap()); redo.length = 0; fn(); env.changed(); renderUi(); draw(); };

  // ---------- Kamera ----------
  const basis = () => {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return { rx: [cy, -sy, 0], ry: [-sy * sp, -cy * sp, -cp], rz: [sy * cp, cy * cp, -sp] };
  };
  const P3 = p => { const { rx, ry, rz } = basis(), d = sub(p, mid); return [W / 2 + cam.panX + dot(rx, d) * cam.sc, H / 2 + cam.panY + dot(ry, d) * cam.sc, dot(rz, d)]; };
  const unP = (x, y, z) => { const { rx, ry, rz } = basis(); return add(add(add(mid, mul(rx, (x - W / 2 - cam.panX) / cam.sc)), mul(ry, (y - H / 2 - cam.panY) / cam.sc)), mul(rz, z)); };
  const toward = () => mul(basis().rz, -1);
  // Einpassen in den freien Teil: neben der Liste, über den Leisten
  const fitView = () => { const side = listOpen && W > 700 ? 300 : 0; cam.sc = (W < 700 ? 0.9 : 0.8) * Math.min(W - side, H - 160) / size; cam.panX = side / 2; cam.panY = -30; };
  const setView = v => { cam.yaw = VIEWS[v][0]; cam.pitch = VIEWS[v][1]; cam.view = v; fitView(); draw(); };

  // ---------- WebGL ----------
  const gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  let glp = null, partN = 0, lineN = 0;
  if (gl) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    const u = n => gl.getUniformLocation(p, n), a = n => gl.getAttribLocation(p, n);
    glp = { p, part: gl.createBuffer(), lines: gl.createBuffer(), dyn: gl.createBuffer(), aPos: a('aPos'), aNor: a('aNor'), aCol: a('aCol'), uM: u('uM'), uR: u('uR'), uL: u('uL'), uAlpha: u('uAlpha'), uFlat: u('uFlat') };
    // Bauteil: Dreiecke mit den Normalen der Datei, damit Rundungen weich aussehen
    const d = new Float32Array(mesh.idx.length * 9);
    for (let i = 0; i < mesh.idx.length; i++) {
      const v = mesh.idx[i];
      d.set([mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2], mesh.nor[v * 3], mesh.nor[v * 3 + 1], mesh.nor[v * 3 + 2], mesh.col[v * 3], mesh.col[v * 3 + 1], mesh.col[v * 3 + 2]], i * 9);
    }
    partN = mesh.idx.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, glp.part); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    const L = new Float32Array(geo.feat.length * 18);
    geo.feat.forEach(([a1, b1], i) => { L.set([...geo.P[a1], 0, 0, -1, 0, 0, 0, ...geo.P[b1], 0, 0, -1, 0, 0, 0], i * 18); });
    lineN = geo.feat.length * 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, glp.lines); gl.bufferData(gl.ARRAY_BUFFER, L, gl.STATIC_DRAW);
  }
  const attribs = () => { [[glp.aPos, 0], [glp.aNor, 12], [glp.aCol, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 36, off); }); };
  // Rohrstück als Vorschau eines Anschlusses
  function tube(s, e, r, c) {
    const ax = norm(sub(e, s)), u = norm(Math.abs(ax[2]) < 0.9 ? cross(ax, [0, 0, 1]) : cross(ax, [1, 0, 0])), w = cross(ax, u), N = 28, out = [];
    for (let k = 0; k < N; k++) {
      const a0 = 2 * Math.PI * k / N, a1 = 2 * Math.PI * (k + 1) / N, n0 = add(mul(u, Math.cos(a0)), mul(w, Math.sin(a0))), n1 = add(mul(u, Math.cos(a1)), mul(w, Math.sin(a1)));
      const A = add(s, mul(n0, r)), B = add(s, mul(n1, r)), C = add(e, mul(n1, r)), D = add(e, mul(n0, r));
      [[A, n0], [B, n1], [C, n1], [A, n0], [C, n1], [D, n0]].forEach(([p, n]) => out.push(...p, ...n, ...c));
      [[e, ax], [D, ax], [C, ax]].forEach(([p, n]) => out.push(...p, ...n, ...c));
    }
    return out;
  }
  function renderGL() {
    const dpr = devicePixelRatio || 1, w = Math.round(W * dpr), h = Math.round(H * dpr);
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
    if (!glp) return;
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { rx, ry, rz } = basis(), zr = size;
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
    const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
    // Kanten: dunkel auf hell, hell auf dunkel; in der Durchsicht alle, sonst nur die vorne
    const edge = dark ? [0.82, 0.85, 0.9] : [0.12, 0.14, 0.17];
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    if (!xray) {
      gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(glp.uAlpha, 1); gl.uniform1f(glp.uFlat, 0);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.part); attribs(); gl.drawArrays(gl.TRIANGLES, 0, partN);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // Kantenfarbe über die Farbe der Linienpunkte: einmal setzen reicht nicht, also Linien flach mit eigener Farbe zeichnen
    gl.uniform1f(glp.uFlat, 1); gl.uniform1f(glp.uAlpha, xray ? 0.55 : 0.8); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, glp.lines); attribs(); gl.disableVertexAttribArray(glp.aCol); gl.vertexAttrib3fv(glp.aCol, edge);
    gl.drawArrays(gl.LINES, 0, lineN);
    gl.enableVertexAttribArray(glp.aCol);
    if (xray) {
      gl.depthMask(false); gl.uniform1f(glp.uFlat, 0); gl.uniform1f(glp.uAlpha, 0.22);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.part); attribs(); gl.drawArrays(gl.TRIANGLES, 0, partN);
      gl.depthMask(true);
    }
    // Rohrstücke an den Anschlüssen, durchsichtig
    const acc = rgb('--accent'), dyn = [];
    const portList = lib.ports.map((o, i) => (cmd?.t === 'port' && cmd.edit === i ? null : o)).filter(Boolean);
    if (cmd?.t === 'port' && cmd.mouth) portList.push(cmdPort());
    portList.forEach(o => { if (o.D > 0) dyn.push(...tube(o.p, add(o.mouth, mul(o.d, Math.max(6, o.depth * 0.6))), o.D / 2, acc)); });
    if (dyn.length) {
      gl.depthMask(false); gl.uniform1f(glp.uFlat, 0); gl.uniform1f(glp.uAlpha, 0.38);
      if (xray) gl.disable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, glp.dyn); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dyn), gl.DYNAMIC_DRAW); attribs();
      gl.drawArrays(gl.TRIANGLES, 0, dyn.length / 9);
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
  }

  // ---------- Elemente zum Picken ----------
  const circPts = (c, n = 48) => {
    const u = norm(Math.abs(c.n[0]) < 0.9 ? cross(c.n, [1, 0, 0]) : cross(c.n, [0, 1, 0])), w = cross(c.n, u);
    return Array.from({ length: n + 1 }, (_, k) => add(c.c, add(mul(u, c.r * Math.cos(2 * Math.PI * k / n)), mul(w, c.r * Math.sin(2 * Math.PI * k / n)))));
  };
  const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; return [Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy), t]; };
  const visible = p => {
    if (xray) return true;
    const t = toward();
    return !rayHit(geo, add(p, mul(t, 0.04)), t, 0);
  };
  const PT_NAME = { center: 'Kreismitte', vertex: 'Eckpunkt', mid: 'Kantenmitte', face: 'Flächenmitte' };
  const axisOfPort = i => { const o = lib.ports[i]; return { p: o.mouth, n: o.d }; };
  // Alle Kandidaten im Bild; types: welche Arten der Befehl gerade annimmt
  function pickAt(x, y, types, touch) {
    const tolP = touch ? 18 : 10, tolL = touch ? 14 : 7, hits = [];
    const want = t => types.includes(t);
    // eigene Elemente zuerst: Anschlüsse, Achsen, Punkte
    if (want('port')) lib.ports.forEach((o, i) => {
      const a = P3(o.mouth), tip = portTip(o), b = P3(o.p);
      const d = Math.min(Math.hypot(tip[0] - x, tip[1] - y) - 4, Math.hypot(b[0] - x, b[1] - y), segD(x, y, a, tip)[0]);
      if (d < tolP) hits.push({ kind: 'port', i, p: o.p, n: o.d, label: portName(i), d: d - 6, vis: true });
    });
    if (want('axis')) lib.aux.axes.forEach((ax, i) => {
      const [a, b] = axisEnds(ax), d = segD(x, y, P3(a), P3(b))[0];
      if (d < tolL) hits.push({ kind: 'axis', i, p: ax.A, n: ax.n, label: ax.name, d: d - 2, vis: true });
    });
    if (want('apt')) lib.aux.pts.forEach((q, i) => {
      const [a, b] = P3(q.p), d = Math.hypot(a - x, b - y);
      if (d < tolP) hits.push({ kind: 'point', apt: i, p: q.p, label: q.name, d: d - 6, vis: true });
    });
    if (want('point')) geo.points.forEach(q => {
      const [a, b] = P3(q.p), d = Math.hypot(a - x, b - y);
      if (d < tolP) {
        const c = q.kind === 'center' ? geo.circles[q.ref] : null;
        hits.push({ kind: 'point', p: q.p, label: c ? `Kreismitte Ø ${fmt2(c.r * 2)}` : PT_NAME[q.kind], d: d - 4, pk: q.kind });
      }
    });
    if (want('circle')) geo.circles.forEach(c => {
      const pts = circPts(c).map(P3);
      let best = Infinity, at = null;
      for (let k = 1; k < pts.length; k++) { const [d, t] = segD(x, y, pts[k - 1], pts[k]); if (d < best) { best = d; at = k; } }
      if (best < tolL) hits.push({ kind: 'circle', c, p: c.c, n: c.n, label: `Kreis Ø ${fmt2(c.r * 2)}`, d: best, probe: circPts(c)[at] });
    });
    if (want('line')) geo.lines.forEach(l => {
      const [d, t] = segD(x, y, P3(l.a), P3(l.b));
      if (d < tolL) hits.push({ kind: 'line', l, p: mul(add(l.a, l.b), 0.5), n: norm(sub(l.b, l.a)), label: `Kante ${fmt2(len(sub(l.b, l.a)))}`, d: d + 2, probe: add(l.a, mul(sub(l.b, l.a), t)) });
    });
    hits.sort((a, b) => a.d - b.d);
    for (const h of hits.slice(0, 12)) if (h.vis || visible(h.probe || h.p)) return h;
    if (want('face')) {
      const o = unP(x, y, -size * 3), h = rayHit(geo, o, basis().rz, 0);
      if (h) {
        const f = geo.faces[geo.region[h.tri]];
        if (f.planar) return { kind: 'face', f, p: f.c, n: f.n, hit: h.p, label: `Fläche ${fmt2(f.area)} mm²` };
      }
    }
    return null;
  }

  // ---------- Anschlüsse ----------
  const portName = i => lib.ports[i]?.name || `Anschluss ${i + 1}`;
  const portTip = o => { const a = P3(o.mouth), b = P3(add(o.mouth, mul(o.d, 1))), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return l < 1e-3 ? [a[0] + 26, a[1] - 26] : [a[0] + dx / l * 34, a[1] + dy / l * 34]; };
  const axisEnds = ax => { const L = size * 0.75; return [sub(ax.A, mul(ax.n, L)), add(ax.A, mul(ax.n, L))]; };
  const cmdPort = () => ({ mouth: cmd.mouth, d: cmd.d, D: cmd.D, depth: cmd.depth, p: sub(cmd.mouth, mul(cmd.d, cmd.depth)) });
  // Öffnung auf einer Achse: dort, wo das Material in Pfeilrichtung endet
  function openFromAxis(A, n) {
    const d = outward(geo, A, n), [, hi] = extentAlong(geo, d);
    return { mouth: add(A, mul(d, hi - dot(A, d))), d };
  }
  function setOpening(mouth, d, src) {
    const s = portFrom(geo, mouth, d);
    Object.assign(cmd, { mouth, d, src: { ...cmd.src, open: src }, step: 'stop' });
    if (cmd.edit == null || cmd.reopen) { cmd.D = s?.D ?? cmd.D ?? 6; cmd.depth = s?.depth ?? 10; cmd.src.stop = s ? 'Bohrungsstufe' : 'Mitte'; }
    cmd.reopen = false;
    if (!xray) { xray = true; cmd.autoXray = true; }
  }
  // Tiefe bis zu einem Element entlang der Achse des Anschlusses
  function depthTo(h) {
    if (h.kind === 'face') {
      const c = dot(cmd.d, h.n);
      if (Math.abs(c) < 0.2) return null;
      return dot(sub(cmd.mouth, h.f.c), h.n) / c;
    }
    return dot(sub(cmd.mouth, h.p), cmd.d);
  }
  function portOk() {
    if (!(cmd.D > 0)) { env.toast('Ø fehlt.'); return; }
    const o = { ...cmdPort(), D: cmd.D, src: cmd.src };
    if (cmd.edit != null && lib.ports[cmd.edit]?.name) o.name = lib.ports[cmd.edit].name;
    change(() => { if (cmd.edit != null) lib.ports[cmd.edit] = o; else lib.ports.push(o); });
    const i = cmd.edit ?? lib.ports.length - 1;
    endCmd(); sel = { kind: 'port', i }; renderUi(); draw();
  }

  // ---------- Messen ----------
  const dirOf = h => (h.kind === 'circle' || h.kind === 'axis' || h.kind === 'line' || h.kind === 'port' || h.kind === 'face' ? h.n : null);
  const ptOf = h => (h.kind === 'face' ? h.hit || h.p : h.p);
  function measure(a, b) {
    const rows = [], segs = [];
    if (!b) {
      if (a.kind === 'circle') rows.push(['Ø', fmt2(a.c.r * 2)], ['Radius', fmt2(a.c.r)], ['Mitte', a.c.c.map(fmt2).join(' · ')]);
      else if (a.kind === 'line') { rows.push(['Länge', fmt2(len(sub(a.l.b, a.l.a)))]); segs.push([a.l.a, a.l.b]); }
      else if (a.kind === 'face') rows.push(['Inhalt', `${fmt2(a.f.area)} mm²`], ['Normale', a.n.map(fmt2).join(' · ')]);
      else if (a.kind === 'axis' || a.kind === 'port') rows.push(['Richtung', a.n.map(fmt2).join(' · ')], ['Durch', a.p.map(fmt2).join(' · ')]);
      else rows.push(['X', fmt2(a.p[0])], ['Y', fmt2(a.p[1])], ['Z', fmt2(a.p[2])]);
      return { rows, segs };
    }
    const da = dirOf(a), db = dirOf(b), pa = ptOf(a), pb = ptOf(b);
    const isPt = h => h.kind === 'point' || h.kind === 'circle' || h.kind === 'port';
    // Punkt zu Punkt
    if (isPt(a) && isPt(b)) {
      const d = sub(pb, pa);
      rows.push(['Abstand', fmt2(len(d))], ['ΔX', fmt2(d[0])], ['ΔY', fmt2(d[1])], ['ΔZ', fmt2(d[2])]);
      segs.push([pa, pb]);
    }
    // Punkt zu Fläche
    const pf = a.kind === 'face' && b.kind !== 'face' ? [b, a] : b.kind === 'face' && a.kind !== 'face' ? [a, b] : null;
    if (pf) {
      const [p, f] = pf, q = ptOf(p), t = dot(sub(q, f.f.c), f.n);
      rows.push(['Abstand zur Fläche', fmt2(Math.abs(t))]);
      segs.push([q, sub(q, mul(f.n, t))]);
      if (dirOf(p) && p.kind !== 'point') rows.push(['Winkel zur Normale', `${fmt2(Math.acos(Math.min(1, Math.abs(dot(dirOf(p), f.n)))) * 180 / Math.PI)}°`]);
    }
    // Fläche zu Fläche
    if (a.kind === 'face' && b.kind === 'face') {
      const c = Math.abs(dot(a.n, b.n));
      if (c > 0.9999) { const t = dot(sub(b.f.c, a.f.c), a.n); rows.push(['Abstand', fmt2(Math.abs(t))]); segs.push([b.f.c, sub(b.f.c, mul(a.n, t))]); }
      else rows.push(['Winkel', `${fmt2(Math.acos(Math.min(1, c)) * 180 / Math.PI)}°`]);
    }
    // Punkt zu Achse: radial und entlang
    const axisLike = h => h.kind === 'circle' || h.kind === 'axis' || h.kind === 'line' || h.kind === 'port';
    const pa2 = axisLike(a) && b.kind === 'point' ? [b, a] : axisLike(b) && a.kind === 'point' ? [a, b] : null;
    if (pa2) {
      const [p, ax] = pa2, A = ax.kind === 'port' ? lib.ports[ax.i].mouth : ax.p, t = dot(sub(p.p, A), ax.n), foot = add(A, mul(ax.n, t));
      rows.push(['Abstand zur Achse', fmt2(len(sub(p.p, foot)))], ['Entlang der Achse', fmt2(t)]);
      segs.push([p.p, foot]);
    }
    // Zwei Richtungen: Winkel, bei parallelen Achsen der Abstand
    if (da && db && axisLike(a) && axisLike(b)) {
      const c = Math.abs(dot(da, db));
      rows.push(['Winkel', `${fmt2(Math.acos(Math.min(1, c)) * 180 / Math.PI)}°`]);
      const A = a.kind === 'port' ? lib.ports[a.i].mouth : a.p, B = b.kind === 'port' ? lib.ports[b.i].mouth : b.p;
      if (c > 0.9999) {
        const off = sub(B, A), along = dot(off, da), rad = sub(off, mul(da, along));
        rows.push(['Abstand der Achsen', fmt2(len(rad))], ['Versatz entlang', fmt2(along)]);
        if (len(rad) > 0.01) segs.push([add(A, mul(da, along)), B]);
      }
    }
    if (!rows.length) rows.push(['Abstand', fmt2(len(sub(pb, pa)))]), segs.push([pa, pb]);
    return { rows, segs };
  }

  // ---------- Befehle ----------
  function startCmd(t, extra = {}) {
    endCmd();
    sel = null; meas = [];
    cmd = { t, ...extra };
    if (t === 'port' && cmd.edit != null && !cmd.step) { const o = lib.ports[cmd.edit]; Object.assign(cmd, { mouth: o.mouth, d: o.d, D: o.D, depth: o.depth, src: o.src || {}, step: 'stop' }); if (!xray) { xray = true; cmd.autoXray = true; } }
    if (t === 'port' && !cmd.step) Object.assign(cmd, { step: 'open', src: {} });
    if (t === 'point') Object.assign(cmd, { step: 'base', off: [0, 0, 0], dist: 0 });
    renderUi(); draw();
  }
  function endCmd() {
    if (cmd?.autoXray) xray = false;
    cmd = null; hover = null;
  }
  const typesNow = () => {
    if (!cmd) return ['port', 'axis', 'apt', 'point', 'circle', 'line', 'face'];
    if (cmd.t === 'measure') return ['port', 'axis', 'apt', 'point', 'circle', 'line', 'face'];
    if (cmd.t === 'port') return cmd.step === 'open' ? ['circle', 'axis'] : ['apt', 'point', 'circle', 'face'];
    if (cmd.t === 'axis') return cmd.first ? ['apt', 'point'] : ['apt', 'point', 'circle', 'line', 'face'];
    if (cmd.t === 'point') return cmd.pickDir ? ['axis', 'circle', 'line', 'face', 'port'] : ['apt', 'point', 'circle'];
    return [];
  };
  function onPick(h) {
    if (!cmd) {
      if (!h) { sel = null; meas = []; }
      else if (h.kind === 'port') sel = { kind: 'port', i: h.i };
      else if (h.kind === 'axis') sel = { kind: 'axis', i: h.i };
      else if (h.apt != null) sel = { kind: 'apt', i: h.apt };
      else { sel = null; meas = [h]; } // ein Element der Geometrie: seine Werte zeigen
      renderUi(); draw(); return;
    }
    if (cmd.t === 'measure') {
      if (!h) meas = []; else meas = meas.length >= 2 ? [h] : [...meas, h];
      renderUi(); draw(); return;
    }
    if (!h) return;
    if (cmd.t === 'port') {
      if (cmd.step === 'open') {
        if (h.kind === 'circle') setOpening(h.c.c, outward(geo, h.c.c, h.c.n), `Kreis Ø ${fmt2(h.c.r * 2)}`);
        else { const o = openFromAxis(h.p, h.n); setOpening(o.mouth, o.d, h.label); }
      } else {
        const t = depthTo(h);
        if (t == null) { env.toast('Diese Fläche liegt längs der Achse.'); return; }
        cmd.depth = Math.round(t * 1000) / 1000; cmd.src.stop = h.label;
        if (h.kind === 'circle' && cmd.src.open?.startsWith('Kreis') && Math.abs(t) < 0.01) cmd.D = pipeD(h.c.r * 2);
      }
      renderUi(); draw(); return;
    }
    if (cmd.t === 'axis') {
      const addAxis = (A, n, src) => {
        const id = Math.random().toString(36).slice(2, 8), name = `Achse ${lib.aux.axes.length + 1}`;
        change(() => lib.aux.axes.push({ id, name, A, n: norm(n), src }));
        endCmd(); sel = { kind: 'axis', i: lib.aux.axes.length - 1 }; renderUi(); draw();
      };
      if (h.kind === 'circle') addAxis(h.c.c, h.c.n, `aus Kreis Ø ${fmt2(h.c.r * 2)}`);
      else if (h.kind === 'line') addAxis(h.p, h.n, `aus Kante ${fmt2(len(sub(h.l.b, h.l.a)))}`);
      else if (h.kind === 'face') addAxis(h.f.c, h.n, 'Normale einer Fläche');
      else if (!cmd.first) { cmd.first = h; renderUi(); draw(); }
      else if (len(sub(h.p, cmd.first.p)) < 0.01) env.toast('Derselbe Punkt.');
      else addAxis(cmd.first.p, sub(h.p, cmd.first.p), `durch ${cmd.first.label} und ${h.label}`);
      return;
    }
    if (cmd.t === 'point') {
      if (cmd.pickDir) {
        const n = h.kind === 'port' ? lib.ports[h.i].d : h.n;
        Object.assign(cmd, { along: n, alongName: h.label, pickDir: false, dist: cmd.dist || 0 });
      } else Object.assign(cmd, { base: h.p, baseName: h.label, step: 'off' });
      renderUi(); draw();
    }
  }
  const pointRes = () => add(add(cmd.base, cmd.off), cmd.along ? mul(cmd.along, cmd.dist) : [0, 0, 0]);
  function pointOk() {
    const id = Math.random().toString(36).slice(2, 8), name = `Punkt ${lib.aux.pts.length + 1}`, p = pointRes();
    const parts = [cmd.baseName, ...cmd.off.map((v, k) => (v ? `${'XYZ'[k]} ${fmt2(v)}` : '')).filter(Boolean), cmd.along && cmd.dist ? `${fmt2(cmd.dist)} entlang ${cmd.alongName}` : ''].filter(Boolean);
    change(() => lib.aux.pts.push({ id, name, p, src: parts.join(' + ') }));
    endCmd(); sel = { kind: 'apt', i: lib.aux.pts.length - 1 }; renderUi(); draw();
  }

  // ---------- Drehachse ----------
  const axisVal = () => (lib.axis && typeof lib.axis === 'object' ? `a${lib.axis.aux}` : lib.axis || '');
  function setAxis(v) {
    change(() => {
      if (!v) delete lib.axis;
      else if (v[0] === 'a') { const ax = lib.aux.axes.find(a => a.id === v.slice(1)); lib.axis = { A: ax.A, n: ax.n, aux: ax.id }; }
      else lib.axis = v;
    });
  }
  const rotAxis = () => {
    const a = lib.axis;
    if (!a) return null;
    if (typeof a === 'object') return a;
    if (a[0] === 'p') { const o = lib.ports[+a.slice(1)]; return o && { A: o.p, n: o.d }; }
    const k = 'xyz'.indexOf(a);
    return k >= 0 ? { A: mid, n: [0, 1, 2].map(i => +(i === k)) } : null;
  };

  // ---------- Leisten und Liste ----------
  const fld = (k, v, label, unit = 'mm') => `<label class="ped-f"><span>${label}</span><input data-pf="${k}" inputmode="decimal" value="${Number.isFinite(v) ? fmt2(v) : ''}"><i>${unit}</i></label>`;
  const ib = (a, ic, t, cls = '') => `<button class="icbtn${cls}" data-pe="${a}" title="${t}" aria-label="${t}">${SVG(IC[ic])}</button>`;
  function renderUi() {
    root.classList.toggle('list-open', listOpen);
    $('[data-pe="list"]').classList.toggle('on', listOpen);
    $('[data-pe="undo"]').disabled = !undo.length;
    $('[data-pe="redo"]').disabled = !redo.length;
    ['measure', 'port', 'axis', 'point'].forEach(t => $(`[data-pe="${t}"]`).classList.toggle('on', cmd?.t === t));
    $('[data-pe="xray"]').classList.toggle('on', xray);
    // Liste
    const opts = [['', 'Frei'], ...lib.ports.map((_, i) => [`p${i}`, portName(i)]), ...lib.aux.axes.map(a => [`a${a.id}`, a.name]), ['x', 'X durch die Mitte'], ['y', 'Y durch die Mitte'], ['z', 'Z durch die Mitte']];
    const row = (kind, i, t, s) => `<div class="ped-row${sel?.kind === kind && sel.i === i ? ' on' : ''}"><button class="ped-rn" data-ps="${kind}:${i}"><b>${esc(t)}</b><small>${esc(s)}</small></button><button class="icbtn danger" data-pd="${kind}:${i}" title="Löschen" aria-label="Löschen">${SVG(IC.trash)}</button></div>`;
    listEl.innerHTML = `<label class="ped-f ped-rot"><span>Drehachse</span><select data-pa>${opts.map(([v, t]) => `<option value="${v}"${v === axisVal() ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <h4>Anschlüsse</h4>${lib.ports.map((o, i) => row('port', i, portName(i), `Ø ${fmt2(o.D)} · Tiefe ${fmt2(o.depth)}`)).join('') || '<p class="ped-empty">Noch keiner.</p>'}
      <div class="ped-add"><button data-pe="port">+ Anschluss</button><button data-pe="auto" title="Anschlüsse aus der Geometrie vorschlagen">${SVG(IC.auto)} Erkennen</button></div>
      <h4>Achsen</h4>${lib.aux.axes.map((a, i) => row('axis', i, a.name, a.src)).join('') || '<p class="ped-empty">Keine.</p>'}
      <h4>Punkte</h4>${lib.aux.pts.map((q, i) => row('apt', i, q.name, q.src)).join('') || '<p class="ped-empty">Keine.</p>'}`;
    renderCmd(); renderInfo();
  }
  function renderCmd() {
    cmdEl.hidden = !cmd;
    if (!cmd) { cmdEl.innerHTML = ''; return; }
    const ok = ib('ok', 'ok', 'Übernehmen', ' on'), no = ib('cancel', 'x', 'Abbrechen');
    let h = '';
    if (cmd.t === 'measure') h = `<span class="bprompt">${meas.length ? (meas.length === 1 ? 'Zweites Element wählen' : 'Neues Element wählen') : 'Messen: Punkt, Kreis, Kante oder Fläche wählen'}</span>${ib('cancel', 'x', 'Beenden')}`;
    else if (cmd.t === 'port' && cmd.step === 'open') h = `<span class="bprompt">Öffnung wählen: Kreis an der Mündung oder Achse</span>${no}`;
    else if (cmd.t === 'port') h = `<span class="bprompt">Anschlag wählen oder Tiefe tippen</span>${fld('D', cmd.D, 'Ø')}${fld('depth', cmd.depth, 'Tiefe')}${ib('flip', 'flip', 'Richtung umkehren')}${no}${ok}`;
    else if (cmd.t === 'axis') h = `<span class="bprompt">${cmd.first ? `Zweiten Punkt wählen (erster: ${esc(cmd.first.label)})` : 'Achse: Kreis, gerade Kante, Fläche oder zwei Punkte wählen'}</span>${no}`;
    else if (cmd.t === 'point' && cmd.step === 'base') h = `<span class="bprompt">Punkt: Fangpunkt oder Kreis wählen</span>${no}`;
    else if (cmd.t === 'point') h = `<span class="bprompt">${cmd.pickDir ? 'Richtung wählen: Achse, Kreis, Kante oder Fläche' : `Ab ${esc(cmd.baseName)}`}</span>${fld('ox', cmd.off[0], 'X')}${fld('oy', cmd.off[1], 'Y')}${fld('oz', cmd.off[2], 'Z')}${cmd.along ? fld('dist', cmd.dist, esc(cmd.alongName)) : ''}<button data-pe="along"${cmd.pickDir ? ' class="on"' : ''}>Entlang …</button>${no}${ok}`;
    cmdEl.innerHTML = h;
  }
  function renderInfo() {
    let h = '';
    if (sel?.kind === 'port' && lib.ports[sel.i]) {
      const o = lib.ports[sel.i], isRot = axisVal() === `p${sel.i}`;
      h = `<h4>${esc(portName(sel.i))}</h4><div class="ped-grid">${fld('pD', o.D, 'Ø')}${fld('pdepth', o.depth, 'Tiefe')}</div>
        <small>Öffnung: ${esc(o.src?.open || 'erkannt')}<br>Anschlag: ${esc(o.src?.stop || 'erkannt')}</small>
        <div class="ped-acts"><button data-pe="reopen">Öffnung neu</button><button data-pe="restop">Anschlag neu</button>${ib('pflip', 'flip', 'Richtung umkehren')}<button data-pe="prot"${isRot ? ' class="on"' : ''}>${SVG(IC.rot)} Drehachse</button>${ib('pdel', 'trash', 'Löschen', ' danger')}</div>`;
    } else if (sel?.kind === 'axis' && lib.aux.axes[sel.i]) {
      const a = lib.aux.axes[sel.i], isRot = axisVal() === `a${a.id}`;
      h = `<h4>${esc(a.name)}</h4><small>${esc(a.src)}<br>Richtung ${a.n.map(fmt2).join(' · ')}</small><div class="ped-acts"><button data-pe="arot"${isRot ? ' class="on"' : ''}>${SVG(IC.rot)} Drehachse</button>${ib('adel', 'trash', 'Löschen', ' danger')}</div>`;
    } else if (sel?.kind === 'apt' && lib.aux.pts[sel.i]) {
      const q = lib.aux.pts[sel.i];
      h = `<h4>${esc(q.name)}</h4><small>${esc(q.src)}</small><table>${q.p.map((v, k) => `<tr><td>${'XYZ'[k]}</td><td>${fmt2(v)}</td></tr>`).join('')}</table><div class="ped-acts">${ib('qdel', 'trash', 'Löschen', ' danger')}</div>`;
    } else if (meas.length) {
      const r = measure(meas[0], meas[1]);
      h = `<h4>${esc(meas.map(m => m.label).join(' → '))}</h4><table>${r.rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
    }
    infoEl.hidden = !h;
    infoEl.innerHTML = h;
  }

  // ---------- Zeichnen ----------
  let queued = false;
  function draw() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
  function render() {
    const r = root.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = r.width; H = r.height;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    renderGL();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const acc = css('--accent'), mark = css('--mark'), text = css('--text'), card = css('--card');
    const poly = (pts, col, w = 2, dash = []) => { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); pts.forEach((q, k) => { const [x, y] = P3(q); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore(); };
    const dot2 = (p, rr, col, ring = false) => { const [x, y] = P3(p); ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); if (ring) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = card; ctx.lineWidth = 1.5; ctx.stroke(); } };
    const tag = (x, y, t, col = text, bg = card) => { ctx.save(); ctx.font = '600 12px system-ui'; const w = ctx.measureText(t).width + 12; ctx.fillStyle = bg; ctx.globalAlpha = 0.94; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 0.5); ctx.restore(); };
    // Beschriftung einer Achse: auf der Seite, die frei im Bild liegt (nicht unter Liste oder Infokarte)
    const free = (x, y) => x > (listOpen ? 300 : 40) && x < W - (infoEl.hidden ? 40 : 320) && y > 70 && y < H - 120;
    const labelAt = (A, n, f) => { for (const s of [1, -1]) { const q = P3(add(A, mul(n, s * size * f))); if (free(q[0], q[1])) return q; } return P3(add(A, mul(n, size * f))); };
    const dim = (a, b, t, col) => { poly([a, b], col, 1.5, [5, 3]); dot2(a, 3, col); dot2(b, 3, col); const [x0, y0] = P3(a), [x1, y1] = P3(b); tag((x0 + x1) / 2, (y0 + y1) / 2, t, col); };
    const drawHit = (h, col) => {
      if (!h) return;
      if (h.kind === 'circle') { poly(circPts(h.c), col, 3); dot2(h.c.c, 3.5, col); }
      else if (h.kind === 'line') poly([h.l.a, h.l.b], col, 3.5);
      else if (h.kind === 'face') {
        ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.28; ctx.beginPath();
        h.f.tris.forEach(ti => { geo.tri[ti].v.forEach((v, k) => { const [x, y] = P3(geo.P[v]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); });
        ctx.fill(); ctx.restore(); dot2(h.f.c, 3, col);
      } else if (h.kind === 'point') dot2(h.p, 6, col, true);
      else if (h.kind === 'axis') poly(axisEnds(lib.aux.axes[h.i]), col, 3, [10, 4, 2, 4]);
    };
    // Achsen
    const rot = rotAxis();
    lib.aux.axes.forEach((a, i) => {
      const on = sel?.kind === 'axis' && sel.i === i, col = axCol(a.n), [p0, p1] = axisEnds(a);
      poly([p0, p1], col, on ? 2.5 : 1.5, [10, 4, 2, 4]);
      const [x, y] = labelAt(a.A, a.n, 0.45); tag(x, y, a.name, col);
    });
    if (rot) {
      const L = size * 0.8, a = sub(rot.A, mul(rot.n, L)), b = add(rot.A, mul(rot.n, L));
      poly([a, b], mark, 2, [3, 4]); const [x, y] = labelAt(rot.A, rot.n, 0.3); tag(x, y + 20, '↻ Drehachse', mark);
    }
    // Punkte
    lib.aux.pts.forEach((q, i) => {
      const [x, y] = P3(q.p), on = sel?.kind === 'apt' && sel.i === i;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = on ? mark : text; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
      ctx.save(); ctx.font = '600 11px system-ui'; ctx.fillStyle = text; ctx.fillText(q.name, x + 8, y - 6); ctx.restore();
    });
    // Anschlüsse: Pfeil nach außen, Nummer, Anschlag
    const ports = lib.ports.map((o, i) => ({ o, i })).filter(({ i }) => !(cmd?.t === 'port' && cmd.edit === i));
    if (cmd?.t === 'port' && cmd.mouth) ports.push({ o: cmdPort(), i: cmd.edit ?? lib.ports.length, live: true });
    ports.forEach(({ o, i, live }) => {
      const on = live || (sel?.kind === 'port' && sel.i === i), [ax, ay] = P3(o.mouth), [tx, ty] = portTip(o);
      ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(tx, ty, 10, 0, 7); ctx.fillStyle = acc; ctx.fill();
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i + 1, tx, ty + 0.5); ctx.restore();
      dot2(o.mouth, 3.5, acc);
      // Der Anschlag liegt meist im Inneren: verdeckt nur blass
      ctx.save(); if (!on && !xray && !visible(o.p)) ctx.globalAlpha = 0.3; dot2(o.p, 4.5, mark); ctx.restore();
      if (on) { dim(o.mouth, o.p, `Tiefe ${fmt2(o.depth)}`, mark); tag(tx, ty - 24, `Ø ${fmt2(o.D)}`, acc); }
    });
    // Kandidaten im Anschlag-Schritt: Kreise auf derselben Achse mit ihrer Tiefe
    if (cmd?.t === 'port' && cmd.step === 'stop' && cmd.mouth) {
      coaxial(geo, cmd.mouth, cmd.d).forEach(({ c }) => poly(circPts(c, 32), acc, 1, [3, 3]));
    }
    if (cmd?.t === 'axis' && cmd.first) drawHit(cmd.first, mark);
    if (cmd?.t === 'point' && cmd.base) {
      const p = pointRes(); dot2(cmd.base, 3, mark);
      if (len(sub(p, cmd.base)) > 1e-6) dim(cmd.base, p, fmt2(len(sub(p, cmd.base))), mark);
      ctx.save(); const [x, y] = P3(p); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = mark; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    }
    // Messen
    meas.forEach(m => drawHit(m, mark));
    if (meas.length) measure(meas[0], meas[1]).segs.forEach(([a, b]) => dim(a, b, fmt2(len(sub(b, a))), mark));
    // Hervorhebung unter der Maus mit Beschriftung
    if (hover) {
      drawHit(hover, acc);
      let t = hover.label;
      if (cmd?.t === 'port' && cmd.step === 'stop') { const d = depthTo(hover); if (d != null) t += ` · Tiefe ${fmt2(d)}`; }
      ctx.font = '600 12px system-ui';
      const tw = ctx.measureText(t).width + 12, tx = Math.min(W - tw / 2 - 6, hover.x + 16 + tw / 2);
      tag(tx, Math.max(14, hover.y - 22), t, acc);
    }
  }

  // ---------- Eingaben ----------
  const ptrs = new Map();
  let drag = null, pinch = null;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y });
    viewMenu = false; $('.ped-views')?.remove();
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; return; }
    drag = { pan: e.button === 2 || e.shiftKey || e.button === 1, moved: false, touch: e.pointerType !== 'mouse' };
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e), p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { const h = pickAt(x, y, typesNow(), false); if (h) { h.x = x; h.y = y; } if (JSON.stringify(h && [h.kind, h.p, h.i]) !== JSON.stringify(hover && [hover.kind, hover.p, hover.i]) || h) { hover = h; cv.style.cursor = h ? 'pointer' : ''; draw(); } }
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
    drag.moved = true; hover = null;
    if (drag.pan) { cam.panX += dx; cam.panY += dy; }
    else { cam.yaw += dx * 0.01; cam.pitch = Math.max(-Math.PI / 2 + 1e-4, Math.min(Math.PI / 2 - 1e-4, cam.pitch + dy * 0.01)); cam.view = 'iso'; }
    draw();
  });
  const up = e => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (pinch) { if (!ptrs.size) pinch = null; drag = null; return; }
    if (!p || !drag) return;
    if (!drag.moved) {
      const h = pickAt(p.x, p.y, typesNow(), drag.touch);
      if (h) { h.x = p.x; h.y = p.y; }
      onPick(h);
    }
    drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  function zoomAt(x, y, f) {
    const s = Math.max(0.05, Math.min(400, cam.sc * f)) / cam.sc;
    cam.panX = x - W / 2 - (x - W / 2 - cam.panX) * s; cam.panY = y - H / 2 - (y - H / 2 - cam.panY) * s; cam.sc *= s;
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); hover = null; draw(); }, { passive: false });

  // Knöpfe, Felder, Liste
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.pe;
    if (b.dataset.ps) { const [k, i] = b.dataset.ps.split(':'); endCmd(); meas = []; sel = { kind: k, i: +i }; renderUi(); draw(); return; }
    if (b.dataset.pd) { const [k, i] = b.dataset.pd.split(':'); del(k, +i); return; }
    if (b.dataset.pv) { setView(b.dataset.pv); $('.ped-views')?.remove(); viewMenu = false; return; }
    if (!a) return;
    if (a === 'done') { close(); return; }
    if (a === 'list') { listOpen = !listOpen; renderUi(); return; }
    if (a === 'undo' || a === 'redo') {
      const from = a === 'undo' ? undo : redo, to = a === 'undo' ? redo : undo;
      if (!from.length) return;
      to.push(snap()); apply(from.pop()); env.changed(); endCmd(); sel = null; renderUi(); draw(); return;
    }
    if (['measure', 'port', 'axis', 'point'].includes(a)) { if (cmd?.t === a) endCmd(); else startCmd(a); renderUi(); draw(); return; }
    if (a === 'xray') { xray = !xray; if (cmd) cmd.autoXray = false; renderUi(); draw(); return; }
    if (a === 'fit') { fitView(); draw(); return; }
    if (a === 'view') {
      if ($('.ped-views')) { $('.ped-views').remove(); return; }
      const m = document.createElement('div'); m.className = 'ped-views';
      m.innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button data-pv="${k}"${cam.view === k ? ' class="on"' : ''}>${v[2]}</button>`).join('');
      $('.ped-bottom').appendChild(m); return;
    }
    if (a === 'cancel') { endCmd(); meas = []; renderUi(); draw(); return; }
    if (a === 'ok') { if (cmd?.t === 'port' && cmd.step === 'stop') portOk(); else if (cmd?.t === 'point' && cmd.base) pointOk(); return; }
    if (a === 'flip' && cmd?.t === 'port') { const s = portFrom(geo, cmd.mouth, mul(cmd.d, -1)); cmd.d = mul(cmd.d, -1); if (s) { cmd.depth = s.depth; cmd.D = s.D; } renderUi(); draw(); return; }
    if (a === 'along' && cmd?.t === 'point') { cmd.pickDir = !cmd.pickDir; renderUi(); return; }
    if (a === 'auto') {
      const s = suggestPorts(geo);
      if (!s.length) { env.toast('Keine Öffnung erkannt.'); return; }
      change(() => { lib.ports = s.map(o => ({ ...o, p: sub(o.mouth, mul(o.d, o.depth)), src: { open: 'erkannt', stop: 'Bohrungsstufe' } })); });
      env.toast(`${s.length} ${s.length === 1 ? 'Anschluss' : 'Anschlüsse'} erkannt.`); return;
    }
    if (a === 'reopen' && sel?.kind === 'port') { startCmd('port', { edit: sel.i, step: 'open', src: { ...(lib.ports[sel.i].src || {}) }, D: lib.ports[sel.i].D, depth: lib.ports[sel.i].depth, reopen: true }); return; }
    if (a === 'restop' && sel?.kind === 'port') { startCmd('port', { edit: sel.i }); return; }
    if (a === 'pflip' && sel?.kind === 'port') {
      const o = lib.ports[sel.i];
      change(() => { o.d = mul(o.d, -1); o.p = sub(o.mouth, mul(o.d, o.depth)); });
      return;
    }
    if (a === 'prot' && sel?.kind === 'port') { setAxis(axisVal() === `p${sel.i}` ? '' : `p${sel.i}`); return; }
    if (a === 'arot' && sel?.kind === 'axis') { const id = `a${lib.aux.axes[sel.i].id}`; setAxis(axisVal() === id ? '' : id); return; }
    if (a === 'pdel') { del('port', sel.i); return; }
    if (a === 'adel') { del('axis', sel.i); return; }
    if (a === 'qdel') { del('apt', sel.i); return; }
  });
  function del(kind, i) {
    change(() => {
      if (kind === 'port') {
        lib.ports.splice(i, 1);
        const a = lib.axis;
        if (typeof a === 'string' && a[0] === 'p') { const k = +a.slice(1); if (k === i) delete lib.axis; else if (k > i) lib.axis = `p${k - 1}`; }
        env.portRemoved?.(i);
      } else if (kind === 'axis') {
        const [ax] = lib.aux.axes.splice(i, 1);
        if (lib.axis?.aux === ax.id) delete lib.axis;
      } else lib.aux.pts.splice(i, 1);
    });
    sel = null; renderUi(); draw();
  }
  root.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-pa]')) { setAxis(el.value); return; }
    const k = el.dataset.pf;
    if (!k) return;
    const v = num(el.value);
    if (!Number.isFinite(v)) { renderUi(); return; }
    if (cmd?.t === 'port' && (k === 'D' || k === 'depth')) { if (k === 'D' && v <= 0) return; cmd[k] = v; if (k === 'depth') cmd.src.stop = 'eingegeben'; renderUi(); draw(); return; }
    if (cmd?.t === 'point') { if (k === 'dist') cmd.dist = v; else cmd.off['xyz'.indexOf(k[1])] = v; renderUi(); draw(); return; }
    if (sel?.kind === 'port' && (k === 'pD' || k === 'pdepth')) {
      const o = lib.ports[sel.i];
      if (k === 'pD' && v <= 0) return;
      change(() => { if (k === 'pD') o.D = v; else { o.depth = v; o.p = sub(o.mouth, mul(o.d, v)); o.src = { ...o.src, stop: 'eingegeben' }; } });
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.target.blur(); return; }
    if (e.target.matches('input, select')) return;
    if (e.key === 'Escape') { if (cmd) endCmd(); else { sel = null; meas = []; } renderUi(); draw(); }
    else if (e.key === 'Enter' && cmd) $('[data-pe="ok"]')?.click();
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(`[data-pe="${e.shiftKey ? 'redo' : 'undo'}"]`).click(); }
  });
  root.tabIndex = -1;
  const ro = new ResizeObserver(() => draw());
  ro.observe(root);
  function close() {
    ro.disconnect();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    root.remove();
    env.onClose?.();
  }

  // Start
  const r0 = root.getBoundingClientRect();
  W = r0.width; H = r0.height;
  fitView(); renderUi(); draw(); root.focus({ preventScroll: true });
  return { close, get state() { return { cmd, sel, meas, hover, xray, cam }; }, geo, pickAt, onPick, P3, draw, startCmd, renderUi };
}
