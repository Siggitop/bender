// Bauteil-Editor der Gebäude-App: einfache 3D-Strukturen aus Quader, Zylinder, Keil und GLB-Netz (Addieren/Abziehen, Formeln, Parameter).
// Eigene Vollbild-Ansicht mit eigenem WebGL. Änderungen laufen über api.change(), damit Rückgängig und Speichern der Gebäude-App gelten.
import { buildPart, primNums, prim, PART_COLORS, evalExpr } from './building-parts.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtN = v => (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '–');
const KIND = { box: 'Quader', cyl: 'Zylinder', wedge: 'Keil', mesh: 'GLB-Netz' };
const CSS = `
.bau-pe { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bg, #f4f5f7); color: var(--text, #222); font: 13px system-ui, sans-serif; }
.bau-pe * { box-sizing: border-box; }
.bau-pe .pe-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; background: var(--card, #fff); border-bottom: 1px solid var(--line, #d8dbe0); }
.bau-pe .pe-head select { width: auto; max-width: 240px; flex: none; }
.bau-pe .pe-head select, .bau-pe .pe-head input { height: 32px; border: 1px solid var(--line, #d8dbe0); border-radius: 8px; background: var(--card, #fff); color: inherit; padding: 0 8px; font: inherit; }
.bau-pe .pe-head input.pe-name { flex: 1 1 140px; min-width: 120px; max-width: 280px; font-weight: 700; }
.bau-pe button { height: 32px; padding: 0 11px; border: 1px solid var(--line, #d8dbe0); border-radius: 8px; background: var(--card, #fff); color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
.bau-pe button:hover { border-color: var(--accent, #0a7cbd); }
.bau-pe button.on, .bau-pe button.pri { background: var(--accent, #0a7cbd); border-color: var(--accent, #0a7cbd); color: #fff; }
.bau-pe button:disabled { opacity: .4; cursor: default; }
.bau-pe .pe-sp { flex: 1; }
.bau-pe .pe-body { flex: 1; display: flex; min-height: 0; }
.bau-pe .pe-left, .bau-pe .pe-right { width: 290px; flex: none; overflow: auto; padding: 10px; background: var(--card, #fff); }
.bau-pe .pe-left { border-right: 1px solid var(--line, #d8dbe0); }
.bau-pe .pe-right { border-left: 1px solid var(--line, #d8dbe0); width: 310px; }
.bau-pe .pe-view { flex: 1; position: relative; min-width: 0; }
.bau-pe canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
.bau-pe h5 { margin: 12px 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #777); }
.bau-pe h5:first-child { margin-top: 0; }
.bau-pe .pe-row { display: flex; align-items: center; gap: 6px; padding: 5px 7px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
.bau-pe .pe-row:hover { background: var(--accent-soft, #e6f2fa); }
.bau-pe .pe-row.sel { background: var(--accent-soft, #e6f2fa); border-color: var(--accent, #0a7cbd); }
.bau-pe .pe-row .pe-op { width: 18px; height: 18px; border-radius: 5px; text-align: center; line-height: 18px; font-weight: 800; background: #5fa66f; color: #fff; flex: none; }
.bau-pe .pe-row .pe-op.sub { background: #c24a3d; }
.bau-pe .pe-row .pe-n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bau-pe .pe-row .pe-eye { width: 22px; padding: 0; height: 22px; border: 0; background: none; opacity: .7; }
.bau-pe .pe-row.off .pe-n { opacity: .45; text-decoration: line-through; }
.bau-pe .pe-acts { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0; }
.bau-pe .pe-acts button { height: 28px; padding: 0 8px; font-size: 12px; }
.bau-pe .pe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bau-pe label.pe-f { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--muted, #777); }
.bau-pe label.pe-f input, .bau-pe label.pe-f select, .bau-pe .pe-in { height: 30px; border: 1px solid var(--line, #d8dbe0); border-radius: 7px; padding: 0 7px; background: var(--card, #fff); color: var(--text, #222); font: 13px ui-monospace, Menlo, monospace; width: 100%; min-width: 0; }
.bau-pe label.pe-f input.bad, .bau-pe .pe-in.bad { border-color: var(--err, #c0392b); background: #fdecea; }
.bau-pe label.pe-f small { color: var(--muted, #777); font-size: 10.5px; min-height: 12px; }
.bau-pe label.pe-f small.err { color: var(--err, #c0392b); }
.bau-pe .pe-seg { display: flex; gap: 0; }
.bau-pe .pe-seg button { border-radius: 0; flex: 1; }
.bau-pe .pe-seg button:first-child { border-radius: 8px 0 0 8px; }
.bau-pe .pe-seg button:last-child { border-radius: 0 8px 8px 0; }
.bau-pe .pe-sw { display: flex; flex-wrap: wrap; gap: 5px; }
.bau-pe .pe-sw button { width: 24px; height: 24px; padding: 0; border-radius: 6px; }
.bau-pe .pe-sw button.on { outline: 2px solid var(--accent, #0a7cbd); outline-offset: 1px; }
.bau-pe .pe-par { display: grid; grid-template-columns: 52px 1fr 24px; gap: 4px; margin-bottom: 4px; align-items: center; }
.bau-pe .pe-par .pe-d { grid-column: 1 / 3; font-size: 11px; height: 24px; }
.bau-pe .pe-par button { height: 28px; padding: 0; }
.bau-pe .pe-hint { color: var(--muted, #777); font-size: 11.5px; line-height: 1.4; margin: 6px 0; }
.bau-pe canvas.pe-ov { pointer-events: none; }
.bau-pe .pe-lib { position: absolute; top: 48px; right: 10px; z-index: 5; width: 300px; max-height: 60%; overflow: auto; background: var(--card, #fff); border: 1px solid var(--line, #d8dbe0); border-radius: 12px; box-shadow: 0 10px 34px rgba(0,0,0,.22); padding: 10px; }
.bau-pe .pe-lib .pe-row { cursor: default; }
.bau-pe .pe-info { position: absolute; left: 10px; bottom: 10px; padding: 6px 10px; border-radius: 9px; background: var(--card, #fff); border: 1px solid var(--line, #d8dbe0); font-size: 12px; color: var(--muted, #777); pointer-events: none; }
.bau-pe .pe-vbar { position: absolute; top: 10px; left: 10px; display: flex; gap: 5px; flex-wrap: wrap; }
.bau-pe .pe-vbar button { height: 28px; padding: 0 9px; font-size: 12px; }
@media (max-width: 900px) { .bau-pe .pe-body { flex-direction: column; } .bau-pe .pe-left, .bau-pe .pe-right { width: auto; max-height: 30%; border: 0; border-top: 1px solid var(--line, #d8dbe0); } .bau-pe .pe-view { min-height: 40%; order: -1; } }
`;

// ---------- kleine Matrizenrechnung ----------
const mul4 = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vnorm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function lookAt(e, c, up) { const f = vnorm(vsub(c, e)), r = vnorm(vcross(f, up)), u = vcross(r, f); return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -vdot(r, e), -vdot(u, e), vdot(f, e), 1]; }

const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; uniform mat4 uM; varying vec3 vN; varying vec3 vC; void main() { gl_Position = uM * vec4(aPos, 1.0); vN = aNor; vC = aCol; }`;
const FS = `precision mediump float; uniform float uFlat; varying vec3 vN; varying vec3 vC; void main() { vec3 n = normalize(vN); float d = abs(dot(n, normalize(vec3(-0.4, -0.6, 0.8)))); float e = abs(dot(n, normalize(vec3(0.7, 0.3, 0.2)))); vec3 c = mix(vC * (0.42 + 0.5 * d + 0.18 * e), vC, uFlat); gl_FragColor = vec4(c, 1.0); }`;

export function openPartEditor({ root, B, partId, api }) {
  if (!document.getElementById('bau-pe-css')) { const st = document.createElement('style'); st.id = 'bau-pe-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'bau-pe';
  el.innerHTML = `<div class="pe-head"></div><div class="pe-body"><div class="pe-left"></div><div class="pe-view"><canvas class="pe-gl"></canvas><canvas class="pe-ov"></canvas><div class="pe-vbar"></div><div class="pe-info"></div></div><div class="pe-right"></div></div>`;
  root.appendChild(el);
  const $ = s => el.querySelector(s), cv = $('canvas.pe-gl'), ov = $('canvas.pe-ov');
  const S = { pid: partId, sel: null, cut: true, yaw: -1.05, pitch: 0.5, dist: 3000, ctr: [0, 0, 500], dirty: true };
  const part = () => B().parts?.[S.pid];
  const pv = () => ({});
  const selPrim = () => part()?.prims.find(p => p.id === S.sel) || null;

  // ---------- Änderungen ----------
  function edit(fn, rerender = true) { api.change(() => { const p = part(); if (p) fn(p); }); S.dirty = true; if (rerender) render(); else draw(); }

  // ---------- Oberfläche ----------
  function renderHead() {
    const P = part(), parts = Object.values(B().parts || {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    $('.pe-head').innerHTML = `<select data-a="pick" title="Bauteil wählen">${parts.map(p => `<option value="${p.id}"${p.id === S.pid ? ' selected' : ''}>${esc(p.name || 'Ohne Namen')}</option>`).join('')}</select>
      <input class="pe-name" data-pname value="${esc(P?.name || '')}" placeholder="Name des Bauteils" aria-label="Name">
      <button data-a="new">Neu</button><button data-a="dup">Kopie</button><button data-a="del">Löschen</button><button data-a="lib" title="Bauteile über Gebäude hinweg sammeln und als Datei austauschen">Bibliothek</button>
      <span class="pe-sp"></span><button data-a="undo" title="Rückgängig (Strg+Z)">↶</button><button data-a="redo" title="Wiederholen">↷</button>
      <button class="pri" data-a="close">Fertig</button>`;
    $('.pe-vbar').innerHTML = [['iso', 'Iso'], ['front', 'Vorne'], ['top', 'Oben'], ['right', 'Rechts'], ['back', 'Hinten'], ['left', 'Links']].map(([k, t]) => `<button data-a="view:${k}">${t}</button>`).join('') + `<button data-a="fit">Einpassen</button><button data-a="cut" class="${S.cut ? 'on' : ''}" title="Abzugskörper als rote Rahmen zeigen">Ausschnitte</button>`;
  }
  function renderLeft() {
    const P = part(); if (!P) { $('.pe-left').innerHTML = ''; return; }
    const R = buildPart(P, pv());
    const rows = P.prims.map(p => `<div class="pe-row${p.id === S.sel ? ' sel' : ''}${p.off ? ' off' : ''}" data-row="${p.id}"><span class="pe-op${p.op === 'sub' ? ' sub' : ''}" title="${p.op === 'sub' ? 'zieht ab' : 'addiert'}">${p.op === 'sub' ? '−' : '+'}</span><span class="pe-n">${esc(p.name || KIND[p.kind])}</span><span style="color:var(--muted);font-size:11px">${KIND[p.kind]}</span><button class="pe-eye" data-a="eye:${p.id}" title="Ein-/ausblenden">${p.off ? '○' : '●'}</button></div>`).join('');
    const params = (P.params || []).map((q, i) => `<div class="pe-par"><input class="pe-in" data-pk="k:${i}" value="${esc(q.k)}" placeholder="Name"><input class="pe-in${R.errors['param:' + q.k] ? ' bad' : ''}" data-pk="v:${i}" value="${esc(q.v)}" placeholder="Wert / Formel" title="${esc(R.errors['param:' + q.k] || '')}"><button data-a="pdel:${i}" title="Parameter löschen">×</button><input class="pe-in pe-d" data-pk="d:${i}" value="${esc(q.d || '')}" placeholder="Beschreibung"></div>`).join('');
    const n = api.instances(S.pid);
    $('.pe-left').innerHTML = `<h5>Körper (von unten nach oben gerechnet)</h5>${rows || '<div class="pe-hint">Noch kein Körper. Unten einen hinzufügen.</div>'}
      <div class="pe-acts"><button data-a="add:box">+ Quader</button><button data-a="add:cyl">+ Zylinder</button><button data-a="add:wedge">+ Keil</button><button data-a="glb">+ GLB-Datei …</button></div>
      <div class="pe-acts"><button data-a="pdupe"${S.sel ? '' : ' disabled'}>Duplizieren</button><button data-a="pdelp"${S.sel ? '' : ' disabled'}>Löschen</button><button data-a="pup"${S.sel ? '' : ' disabled'}>↑</button><button data-a="pdown"${S.sel ? '' : ' disabled'}>↓</button></div>
      <h5>Parameter</h5>${params || '<div class="pe-hint">Parameter sind benannte Maße (zum Beispiel B, H, T). In den Feldern der Körper kannst du sie in Formeln nutzen: <b>B-2*S</b>. Beim Platzieren lassen sie sich je Einbauteil ändern.</div>'}
      <div class="pe-acts"><button data-a="padd">+ Parameter</button></div>
      <div class="pe-hint">Größe: ${fmtN(R.mx[0] - R.mn[0])} × ${fmtN(R.mx[1] - R.mn[1])} × ${fmtN(R.mx[2] - R.mn[2])} mm · ${Math.round(R.tris)} Dreiecke${n ? ` · ${n}× im Gebäude platziert` : ''}</div>`;
  }
  function renderRight() {
    const P = part(), p = selPrim();
    if (!P) { $('.pe-right').innerHTML = '<div class="pe-hint">Kein Bauteil. „Neu“ legt eins an.</div>'; return; }
    if (!p) { $('.pe-right').innerHTML = `<h5>Bauteil</h5><div class="pe-hint">Einen Körper links in der Liste oder im Bild anklicken, dann erscheinen hier seine Maße.<br><br><b>Ablauf:</b> Körper werden der Reihe nach verrechnet. <b>Addieren</b> fügt hinzu, <b>Abziehen</b> schneidet aus allem davor aus (Türöffnung, Lüftungsschlitz, Aussparung).<br><br>Alle Maße in mm. Ursprung ist die linke vordere untere Ecke; „Vorne“ ist die Seite bei y = 0.</div>`; return; }
    const { o, err } = primNums(P, p, pv());
    const f = (k, label) => { const raw = String(p[k] ?? ''), isNum = raw.trim() !== '' && Number.isFinite(Number(raw.replace(',', '.'))); return `<label class="pe-f">${label}<input data-pf="${k}" value="${esc(raw)}" class="${err[k] ? 'bad' : ''}" autocomplete="off" spellcheck="false"><small class="${err[k] ? 'err' : ''}">${err[k] ? esc(err[k]) : isNum ? '' : '= ' + fmtN(o[k])}</small></label>`; };
    const isMesh = p.kind === 'mesh';
    $('.pe-right').innerHTML = `<h5>${KIND[p.kind]}</h5>
      <label class="pe-f">Name<input data-pt="name" value="${esc(p.name)}"></label>
      ${isMesh ? '' : `<div class="pe-seg" style="margin:8px 0"><button data-a="op:add" class="${p.op !== 'sub' ? 'on' : ''}">Addieren</button><button data-a="op:sub" class="${p.op === 'sub' ? 'on' : ''}">Abziehen</button></div>`}
      ${p.kind === 'cyl' ? `<label class="pe-f">Achse<select data-pt="axis"><option value="z"${(p.axis || 'z') === 'z' ? ' selected' : ''}>senkrecht (z)</option><option value="x"${p.axis === 'x' ? ' selected' : ''}>liegend in x</option><option value="y"${p.axis === 'y' ? ' selected' : ''}>liegend in y</option></select></label>` : ''}
      <div class="pe-hint">Im Bild: Kreise verschieben, Quadrate ändern die Größe, beides rastet an Kanten anderer Körper ein (Alt = ohne Fang). Die Zahlen an den Kanten springen ins Feld.</div><h5>Lage (Ecke links vorne unten)</h5><div class="pe-grid">${f('x', 'x')}${f('y', 'y')}${f('z', 'z')}${f('rot', 'Drehung um z (°)')}</div>
      <h5>${isMesh ? 'Größe (leer = Originalgröße)' : 'Größe'}</h5><div class="pe-grid">${f('w', 'Breite (x)')}${f('d', 'Tiefe (y)')}${f('h', 'Höhe (z)')}</div>
      <h5>Wiederholen</h5><div class="pe-grid">${f('n', 'Anzahl')}${f('dx', 'Abstand x')}${f('dy', 'Abstand y')}${f('dz', 'Abstand z')}</div>
      ${p.kind === 'wedge' ? '<div class="pe-hint">Keil: die Schräge steigt in +x an. Mit der Drehung um z zeigt sie in andere Richtungen.</div>' : ''}
      ${p.kind === 'cyl' ? '<div class="pe-hint">Zylinder füllt den Quader aus Lage und Größe (bei ungleicher Breite und Tiefe eine Ellipse).</div>' : ''}
      <h5>${p.op === 'sub' ? 'Farbe der Schnittflächen' : 'Farbe'}</h5>
      ${isMesh ? `<div class="pe-acts"><button data-a="orig" class="${p.col ? '' : 'on'}">Originalfarben</button></div>` : ''}<div class="pe-sw">${PART_COLORS.map(([h, t]) => `<button data-a="col:${h}" style="background:${h}" title="${t}" class="${(p.col || '').toLowerCase() === h ? 'on' : ''}"></button>`).join('')}</div>`;
  }
  function render() {
    renderHead(); renderLeft(); renderRight(); draw();
    $('.pe-head [data-a=undo]').disabled = !api.canUndo(); $('.pe-head [data-a=redo]').disabled = !api.canRedo();
  }

  // ---------- 3D ----------
  const gl = cv.getContext('webgl', { antialias: true, alpha: false });
  let prog, buf, bufL, bufS, nTri = 0, nLine = 0, nSel = 0;
  if (gl) {
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    buf = gl.createBuffer(); bufL = gl.createBuffer(); bufS = gl.createBuffer();
  }
  const boxCorners = (o, dx = 0, dy = 0, dz = 0) => {
    const x = o.x + dx, y = o.y + dy, z = o.z + dz, cx = x + o.w / 2, cy = y + o.d / 2, a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([i, j, k]) => { const px = x + i * o.w, py = y + j * o.d; return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c, z + k * o.h]; });
  };
  const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  function lineBuf() {
    const P = part(), L = [], put = (a, b, c) => L.push(a[0], a[1], a[2], 0, 0, 1, c[0], c[1], c[2], b[0], b[1], b[2], 0, 0, 1, c[0], c[1], c[2]);
    const R = buildPart(P, pv()), ext = Math.max(R.mx[0], R.mx[1], 600) * 1.4 + 200, step = ext > 4000 ? 500 : 100, g = [0.72, 0.74, 0.77];
    for (let v = -ext; v <= ext + 1; v += step) { put([v, -ext, 0], [v, ext, 0], g); put([-ext, v, 0], [ext, v, 0], g); }
    put([0, 0, 0], [400, 0, 0], [0.9, 0.2, 0.2]); put([0, 0, 0], [0, 400, 0], [0.2, 0.7, 0.3]); put([0, 0, 0], [0, 0, 400], [0.2, 0.4, 0.9]);
    const draw1 = (p, col) => { const { o } = primNums(P, p, pv()), n = Math.max(1, Math.min(60, Math.round(o.n || 1))); for (let r = 0; r < n; r++) { const C = boxCorners(o, (o.dx || 0) * r, (o.dy || 0) * r, (o.dz || 0) * r); EDGES.forEach(([i, j]) => put(C[i], C[j], col)); } };
    P.prims.forEach(p => { if (p.off) return; if (p.op === 'sub' && S.cut && p.id !== S.sel) draw1(p, [0.85, 0.3, 0.25]); });
    const sp = selPrim(), n0 = L.length; if (sp) draw1(sp, sp.op === 'sub' ? [1, 0.2, 0.1] : [0.04, 0.49, 0.74]);
    return { all: new Float32Array(L.slice(0, n0)), sel: new Float32Array(L.slice(n0)) };
  }
  function upload() {
    const P = part(); if (!gl || !P) { nTri = nLine = 0; return; }
    const R = buildPart(P, pv()); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(R.out), gl.STATIC_DRAW); nTri = R.out.length / 9;
    const L = lineBuf(); gl.bindBuffer(gl.ARRAY_BUFFER, bufL); gl.bufferData(gl.ARRAY_BUFFER, L.all, gl.STATIC_DRAW); nLine = L.all.length / 9; gl.bindBuffer(gl.ARRAY_BUFFER, bufS); gl.bufferData(gl.ARRAY_BUFFER, L.sel, gl.STATIC_DRAW); nSel = L.sel.length / 9;
    S.dirty = false;
    const sz = [R.mx[0] - R.mn[0], R.mx[1] - R.mn[1], R.mx[2] - R.mn[2]];
    $('.pe-info').textContent = R.out.length ? `${fmtN(sz[0])} × ${fmtN(sz[1])} × ${fmtN(sz[2])} mm` : 'Leer';
  }
  function camEye() { return [S.ctr[0] + S.dist * Math.cos(S.pitch) * Math.cos(S.yaw), S.ctr[1] + S.dist * Math.cos(S.pitch) * Math.sin(S.yaw), S.ctr[2] + S.dist * Math.sin(S.pitch)]; }
  const FOV = 0.8;
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function paint() {
    if (!gl || !el.isConnected) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(2, Math.round(cv.clientWidth * dpr)), h = Math.max(2, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (S.dirty) upload();
    gl.viewport(0, 0, w, h); gl.clearColor(0.95, 0.96, 0.97, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const M = mul4(persp(FOV, w / h, Math.max(10, S.dist / 200), S.dist * 40), lookAt(camEye(), S.ctr, [0, 0, 1]));
    gl.useProgram(prog); gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uM'), false, M);
    const aP = gl.getAttribLocation(prog, 'aPos'), aN = gl.getAttribLocation(prog, 'aNor'), aC = gl.getAttribLocation(prog, 'aCol'), uF = gl.getUniformLocation(prog, 'uFlat');
    const bind = b => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 36, 24); };
    S.M = M; gl.uniform1f(uF, 0); bind(buf); if (nTri) gl.drawArrays(gl.TRIANGLES, 0, nTri);
    gl.uniform1f(uF, 1); bind(bufL); if (nLine) gl.drawArrays(gl.LINES, 0, nLine);
    gl.disable(gl.DEPTH_TEST); bind(bufS); if (nSel) gl.drawArrays(gl.LINES, 0, nSel);
    overlay(dpr);
  }
  // ---------- Griffe, Maße, Fangen ----------
  const AXN = ['x', 'y', 'z'], SZN = ['w', 'd', 'h'], AXC = ['#d23b3b', '#2f9e50', '#2f6fd0'];
  function proj(p) {
    const M = S.M; if (!M) return null;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    if (w <= 0) return null;
    const r = cv.getBoundingClientRect(); return [(x / w * 0.5 + 0.5) * r.width, (1 - (y / w * 0.5 + 0.5)) * r.height];
  }
  const mmpx = () => S.dist * Math.tan(FOV / 2) * 2 / Math.max(1, cv.clientHeight);
  function handleList() {
    const P = part(), p = selPrim(); if (!P || !p || p.off) return [];
    const { o } = primNums(P, p, pv()), c = [o.x + o.w / 2, o.y + o.d / 2, o.z + o.h / 2], half = [o.w / 2, o.d / 2, o.h / 2], off = mmpx() * 26, L = [];
    for (let i = 0; i < 3; i++) {
      const e = [0, 0, 0]; e[i] = 1;
      const mv = [c[0] + e[0] * (half[i] + off), c[1] + e[1] * (half[i] + off), c[2] + e[2] * (half[i] + off)], fc = [c[0] + e[0] * half[i], c[1] + e[1] * half[i], c[2] + e[2] * half[i]];
      L.push({ kind: 'move', axis: i, w: mv, from: fc });
      if (!(o.rot % 360)) L.push({ kind: 'size', axis: i, w: fc });
    }
    L.forEach(h => { h.s = proj(h.w); });
    return L.filter(h => h.s);
  }
  function overlay(dpr) {
    const w = cv.width, h = cv.height; if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
    const g = ov.getContext('2d'); g.clearRect(0, 0, w, h); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.labelHits = [];
    const P = part(), p = selPrim(); if (!P || !p || p.off) return;
    const { o } = primNums(P, p, pv());
    // Maße an den Kanten (antippbar: springt ins Feld)
    const labs = [['w', o.w, [o.x + o.w / 2, o.y, o.z]], ['d', o.d, [o.x, o.y + o.d / 2, o.z]], ['h', o.h, [o.x, o.y, o.z + o.h / 2]]];
    g.font = '600 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    labs.forEach(([k, v, wp]) => { const sp = proj(wp); if (!sp) return; const t = fmtN(v), tw = g.measureText(t).width + 10; g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = 'rgba(10,124,189,.7)'; g.beginPath(); g.roundRect(sp[0] - tw / 2, sp[1] - 9, tw, 18, 6); g.fill(); g.stroke(); g.fillStyle = '#0a5c8c'; g.fillText(t, sp[0], sp[1] + 0.5); S.labelHits.push({ k, x: sp[0], y: sp[1], w: tw }); });
    handleList().forEach(hd => {
      const col = AXC[hd.axis];
      if (hd.kind === 'move') { const f = proj(hd.from); if (f) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(hd.s[0], hd.s[1]); g.stroke(); } g.fillStyle = col; g.beginPath(); g.arc(hd.s[0], hd.s[1], 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
      else { g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.rect(hd.s[0] - 5, hd.s[1] - 5, 10, 10); g.fill(); g.stroke(); }
    });
    if (S.snapMsg) { g.font = '600 12px system-ui'; g.fillStyle = '#d9480f'; g.textAlign = 'left'; g.fillText(S.snapMsg, 14, cv.clientHeight - 44); }
  }
  function rayAt(px, py) {
    const r = cv.getBoundingClientRect(), asp = r.width / r.height, nx = (px - r.left) / r.width * 2 - 1, ny = 1 - (py - r.top) / r.height * 2, eye = camEye();
    const f = vnorm(vsub(S.ctr, eye)), rt = vnorm(vcross(f, [0, 0, 1])), up2 = vcross(rt, f), th = Math.tan(FOV / 2);
    return { o: eye, d: vnorm([f[0] + rt[0] * nx * th * asp + up2[0] * ny * th, f[1] + rt[1] * nx * th * asp + up2[1] * ny * th, f[2] + rt[2] * nx * th * asp + up2[2] * ny * th]) };
  }
  // Parameter t auf der Achse (P0 + t·A), der dem Mausstrahl am nächsten liegt
  function axisT(P0, A, ray) { const w0 = vsub(P0, ray.o), b = vdot(A, ray.d), d = vdot(A, w0), e = vdot(ray.d, w0), den = 1 - b * b; return Math.abs(den) < 1e-6 ? 0 : (b * e - d) / den; }
  function snapCands(i) {
    const P = part(), out = [0];
    P.prims.forEach(q => { if (q.off || q.id === S.sel) return; const { o } = primNums(P, q, pv()); if ((o.rot || 0) % 90) return; const lo = [o.x, o.y, o.z][i], sz = [o.w, o.d, o.h][i]; out.push(lo, lo + sz, lo + sz / 2); });
    return out;
  }
  function setExpr(p, f, orig, start, val) { const isNum = orig.trim() !== '' && Number.isFinite(Number(orig.replace(',', '.'))); const v = Math.round(val * 10) / 10; if (isNum || orig.trim() === '') { p[f] = String(v); return; } const dl = Math.round((val - start) * 10) / 10; p[f] = Math.abs(dl) < 0.05 ? orig : `${orig}${dl >= 0 ? '+' : '-'}${Math.abs(dl)}`; }
  function startDrag(hd, e) {
    const P = part(), p = selPrim(), { o } = primNums(P, p, pv()), f = hd.kind === 'move' ? AXN[hd.axis] : SZN[hd.axis], i = hd.axis, ax = [0, 0, 0]; ax[i] = 1;
    const base = hd.kind === 'move' ? [o.x + o.w / 2, o.y + o.d / 2, o.z + o.h / 2] : [o.x + (i === 0 ? o.w : o.w / 2), o.y + (i === 1 ? o.d : o.d / 2), o.z + (i === 2 ? o.h : o.h / 2)];
    const D = { hd, f, i, ax, orig: String(p[f] ?? ''), start: o[f === 'x' || f === 'y' || f === 'z' ? f : f], size: [o.w, o.d, o.h][i], pos: [o.x, o.y, o.z][i], t0: axisT(base, ax, rayAt(e.clientX, e.clientY)), base, n: 0, id: p.id };
    api.begin(); S.drag = D;
  }
  function dragMove(e) {
    const D = S.drag, P = part(), p = P?.prims.find(q => q.id === D.id); if (!p) return;
    const t = axisT(D.base, D.ax, rayAt(e.clientX, e.clientY)) - D.t0, tol = mmpx() * 9, cands = snapCands(D.i); D.n++;
    let val = (D.hd.kind === 'move' ? D.pos : D.size) + t, msg = '';
    if (!e.altKey) {
      const edges = D.hd.kind === 'move' ? [[val, 0], [val + D.size, D.size]] : [[D.pos + val, D.pos]];
      let best = null; edges.forEach(([at, ref]) => cands.forEach(c => { const dd = Math.abs(c - at); if (dd < tol && (!best || dd < best.dd)) best = { dd, c, ref }; }));
      if (best) { val = D.hd.kind === 'move' ? best.c - best.ref : best.c - D.pos; msg = `Fang an Kante bei ${fmtN(best.c)} mm`; }
      else val = Math.round(val / 5) * 5;
    }
    if (D.hd.kind === 'size' && val < 1) val = 1;
    S.snapMsg = msg; setExpr(p, D.f, D.orig, D.hd.kind === 'move' ? D.pos : D.size, val);
    S.dirty = true; renderRight(); draw();
  }
  function endDrag() {
    const D = S.drag; S.drag = null; S.snapMsg = '';
    if (!D) return;
    if (D.n < 2) { api.cancelBegin(); S.dirty = true; render(); return; }
    api.end(); S.dirty = true; render();
  }
  function hitHandle(px, py) {
    const r = cv.getBoundingClientRect(), x = px - r.left, y = py - r.top;
    const L = S.labelHits?.find(l => Math.abs(l.x - x) < l.w / 2 && Math.abs(l.y - y) < 10); if (L) return { label: L.k };
    return handleList().map(h => ({ h, d: Math.hypot(h.s[0] - x, h.s[1] - y) })).filter(q => q.d < 11).sort((a, b) => a.d - b.d)[0]?.h || null;
  }
  function fit() {
    const P = part(); if (!P) return;
    const R = buildPart(P, pv()), has = R.out.length > 0, mn = has ? R.mn : [0, 0, 0], mx = has ? R.mx : [800, 600, 800];
    S.ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    S.dist = Math.max(400, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1.35);
    draw();
  }
  const VIEWS = { iso: [-1.05, 0.5], front: [-Math.PI / 2, 0], top: [-Math.PI / 2, Math.PI / 2 - 0.001], right: [0, 0], back: [Math.PI / 2, 0], left: [Math.PI, 0] };

  // Auswahl per Klick: Strahl gegen die (gedrehten) Quader der Körper
  function pick(px, py) {
    const P = part(); if (!P) return null;
    const r = cv.getBoundingClientRect(), asp = r.width / r.height, nx = (px - r.left) / r.width * 2 - 1, ny = 1 - (py - r.top) / r.height * 2, eye = camEye();
    const f = vnorm(vsub(S.ctr, eye)), rt = vnorm(vcross(f, [0, 0, 1])), up = vcross(rt, f), th = Math.tan(FOV / 2);
    const dir = vnorm([f[0] + rt[0] * nx * th * asp + up[0] * ny * th, f[1] + rt[1] * nx * th * asp + up[1] * ny * th, f[2] + rt[2] * nx * th * asp + up[2] * ny * th]);
    let best = null;
    P.prims.forEach(p => {
      if (p.off) return;
      const { o } = primNums(P, p, pv()), n = Math.max(1, Math.min(60, Math.round(o.n || 1)));
      for (let k = 0; k < n; k++) {
        const x = o.x + (o.dx || 0) * k, y = o.y + (o.dy || 0) * k, z = o.z + (o.dz || 0) * k, cx = x + o.w / 2, cy = y + o.d / 2, a = -(o.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        const loc = q => [cx + (q[0] - cx) * c - (q[1] - cy) * s, cy + (q[0] - cx) * s + (q[1] - cy) * c, q[2]], O = loc(eye), D = (() => { const t = loc([eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]]); return [t[0] - O[0], t[1] - O[1], t[2] - O[2]]; })();
        let t0 = 0, t1 = Infinity;
        for (const [i, lo, hi] of [[0, x, x + o.w], [1, y, y + o.d], [2, z, z + o.h]]) {
          if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo || O[i] > hi) { t1 = -1; break; } continue; }
          let a1 = (lo - O[i]) / D[i], a2 = (hi - O[i]) / D[i]; if (a1 > a2) [a1, a2] = [a2, a1]; t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
        }
        if (t1 >= t0 && (!best || t0 < best.t)) best = { t: t0, id: p.id };
      }
    });
    return best?.id || null;
  }
  const ptr = new Map(); let moved = 0, pinch0 = 0;
  cv.addEventListener('pointerdown', e => { if (e.button === 0 && !e.shiftKey && ptr.size === 0) { const hh = hitHandle(e.clientX, e.clientY); if (hh?.label) { const inp = el.querySelector(`[data-pf=${hh.label}]`); inp?.focus(); inp?.select(); return; } if (hh) { cv.setPointerCapture?.(e.pointerId); startDrag(hh, e); return; } } cv.setPointerCapture?.(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, shift: e.shiftKey }); moved = 0; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
  cv.addEventListener('pointermove', e => {
    if (S.drag) { dragMove(e); return; }
    const p = ptr.get(e.pointerId); if (!p) { const hh = hitHandle(e.clientX, e.clientY); cv.style.cursor = hh ? 'pointer' : ''; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) S.dist = Math.max(100, Math.min(60000, S.dist * pinch0 / d)); pinch0 = d; draw(); return; }
    if (p.btn === 2 || p.shift || e.shiftKey || p.btn === 1) {
      const eye = camEye(), f = vnorm(vsub(S.ctr, eye)), rt = vnorm(vcross(f, [0, 0, 1])), up = vcross(rt, f), k = S.dist * Math.tan(FOV / 2) * 2 / cv.clientHeight;
      for (let i = 0; i < 3; i++) S.ctr[i] += (-rt[i] * dx + up[i] * dy) * k;
    } else { S.yaw -= dx * 0.008; S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch + dy * 0.008)); }
    draw();
  });
  const up = e => { if (S.drag) { endDrag(); return; } const p = ptr.get(e.pointerId); ptr.delete(e.pointerId); pinch0 = 0; if (p && moved < 5 && p.btn === 0 && !p.shift && ptr.size === 0) { S.sel = pick(e.clientX, e.clientY); S.dirty = true; render(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { if (S.drag) endDrag(); ptr.delete(e.pointerId); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); S.dist = Math.max(100, Math.min(60000, S.dist * Math.exp(e.deltaY * 0.0012))); draw(); }, { passive: false });
  new ResizeObserver(() => draw()).observe(cv);

  // ---------- Bedienung ----------
  let libEl = null;
  const closeLib = () => { libEl?.remove(); libEl = null; };
  async function toggleLib(force) {
    if (libEl && !force) { closeLib(); return; }
    const list = await api.libList();
    if (!libEl) { libEl = document.createElement('div'); libEl.className = 'pe-lib'; $('.pe-view').appendChild(libEl); }
    libEl.innerHTML = `<h5>Bibliothek (gilt für alle Gebäude)</h5>${list.length ? list.map(q => `<div class="pe-row"><span class="pe-n">${esc(q.name)}</span><button data-a="libget:${q.id}">Holen</button><button data-a="libdel:${q.id}" title="Aus der Bibliothek löschen">×</button></div>`).join('') : '<div class="pe-hint">Noch leer. „In Bibliothek sichern“ legt das aktuelle Bauteil ab.</div>'}
      <div class="pe-acts"><button data-a="libsave" class="pri">Aktuelles Bauteil sichern</button></div>
      <h5>Datei</h5><div class="pe-acts"><button data-a="pexp">Bauteil als Datei sichern</button><button data-a="pimp">Datei laden …</button></div>`;
  }
  async function addGlb() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.glb,model/gltf-binary';
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      try {
        const r = await api.importGlb(await file.arrayBuffer());
        edit(P => { const p = prim({ kind: 'mesh', op: 'add', name: file.name.replace(/\.glb$/i, ''), mesh: r, w: String(Math.round(r.size[0])), d: String(Math.round(r.size[1])), h: String(Math.round(r.size[2])), col: '' }); P.prims.push(p); S.sel = p.id; });
        fit();
      } catch (e) { api.toast(`GLB: ${e.message || e}`); }
    };
    inp.click();
  }
  el.addEventListener('click', async e => {
    const row = e.target.closest('[data-row]'); if (row && !e.target.closest('[data-a]')) { S.sel = row.dataset.row; S.dirty = true; render(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const [a, v] = b.dataset.a.split(':'), P = part(), p = selPrim();
    if (a === 'close') { api.close(); return; }
    if (a === 'lib') { toggleLib(); return; }
    if (a === 'libsave') { await api.libSave(S.pid); await toggleLib(true); return; }
    if (a === 'libget') { const id = await api.libGet(v); if (id) { S.pid = id; S.sel = null; S.dirty = true; closeLib(); render(); fit(); } return; }
    if (a === 'libdel') { await api.libDel(v); await toggleLib(true); return; }
    if (a === 'pexp') { await api.exportPart(S.pid); return; }
    if (a === 'pimp') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; const id = await api.importPart(f); if (id) { S.pid = id; S.sel = null; S.dirty = true; closeLib(); render(); fit(); } }; inp.click(); return; }
    if (a === 'orig' && selPrim()) { edit(() => { selPrim().col = ''; }); return; }
    if (a === 'undo') { api.undo(); S.dirty = true; render(); return; }
    if (a === 'redo') { api.redo(); S.dirty = true; render(); return; }
    if (a === 'new') { const id = api.newPart(); if (id) { S.pid = id; S.sel = null; S.dirty = true; render(); fit(); } return; }
    if (a === 'dup') { const id = api.dupPart(S.pid); if (id) { S.pid = id; S.sel = null; S.dirty = true; render(); } return; }
    if (a === 'del') { const nxt = await api.delPart(S.pid); if (nxt !== false) { S.pid = nxt; S.sel = null; S.dirty = true; if (!nxt) { api.close(); return; } render(); fit(); } return; }
    if (a === 'view') { [S.yaw, S.pitch] = VIEWS[v]; draw(); return; }
    if (a === 'fit') { fit(); return; }
    if (a === 'cut') { S.cut = !S.cut; S.dirty = true; render(); return; }
    if (!P) return;
    if (a === 'add') { edit(Q => { const last = Q.prims.at(-1); const q = prim({ kind: v, name: KIND[v], w: v === 'cyl' ? '200' : '300', d: v === 'cyl' ? '200' : '300', h: '300', x: last ? '0' : '0' }); Q.prims.push(q); S.sel = q.id; }); fit(); return; }
    if (a === 'glb') { addGlb(); return; }
    if (a === 'eye') { edit(Q => { const q = Q.prims.find(x => x.id === v); if (q) q.off = !q.off; }); return; }
    if (a === 'pdupe' && p) { edit(Q => { const i = Q.prims.findIndex(x => x.id === p.id), q = JSON.parse(JSON.stringify(p)); q.id = prim().id; q.name = (p.name || KIND[p.kind]) + ' Kopie'; Q.prims.splice(i + 1, 0, q); S.sel = q.id; }); return; }
    if (a === 'pdelp' && p) { edit(Q => { Q.prims = Q.prims.filter(x => x.id !== p.id); S.sel = null; }); return; }
    if (a === 'pup' || a === 'pdown') { edit(Q => { const i = Q.prims.findIndex(x => x.id === S.sel), j = a === 'pup' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < Q.prims.length) [Q.prims[i], Q.prims[j]] = [Q.prims[j], Q.prims[i]]; }); return; }
    if (a === 'op' && p) { edit(() => { p.op = v; }); return; }
    if (a === 'col' && p) { edit(() => { p.col = v; }); return; }
    if (a === 'padd') { edit(Q => { (Q.params ||= []).push({ k: 'P' + (Q.params.length + 1), v: '100', d: '' }); }); return; }
    if (a === 'pdel') { edit(Q => { Q.params.splice(+v, 1); }); return; }
  });
  el.addEventListener('change', e => {
    const t = e.target, P = part(), p = selPrim();
    if (t.matches('[data-a=pick]')) { S.pid = t.value; S.sel = null; S.dirty = true; render(); fit(); return; }
    if (!P) return;
    if (t.dataset.pname !== undefined) { const nm = t.value.trim(); if (nm) edit(Q => { Q.name = nm; }); return; }
    if (t.dataset.pf && p) { const k = t.dataset.pf; let ok = true; try { evalExpr(t.value, primNums(P, p, pv()).vars); } catch { ok = false; } edit(() => { p[k] = t.value.trim(); }); if (!ok) api.toast('Formel nicht lesbar: Parameter, Zahlen, + − * / ( ) nutzen.'); return; }
    if (t.dataset.pt && p) { edit(() => { p[t.dataset.pt] = t.value; }); return; }
    if (t.dataset.pk) { const [f, i] = t.dataset.pk.split(':'); edit(Q => { const q = Q.params[+i]; if (q) q[f] = f === 'k' ? t.value.trim().replace(/[^\wÄÖÜäöüß]/g, '') : t.value.trim(); }); return; }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input, select, textarea')) { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? api.redo : api.undo)(); S.dirty = true; render(); }
    else if (e.key === 'Delete' && selPrim() && !e.target.matches('input, select, textarea')) { e.stopPropagation(); edit(Q => { Q.prims = Q.prims.filter(x => x.id !== S.sel); S.sel = null; }); }
  });
  el.tabIndex = -1;
  render(); fit(); el.focus();
  return { el, close() { el.remove(); }, refresh() { S.dirty = true; render(); }, setPart(id) { S.pid = id; S.sel = null; S.dirty = true; render(); fit(); }, get pid() { return S.pid; }, select(id) { S.sel = id; S.dirty = true; render(); } };
}
