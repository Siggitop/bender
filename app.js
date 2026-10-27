import { pointsFromDeltas, pointsFromAngles, anglesFromPoints, cleanPoints, computeLayout, calibrate, pointAt, V, rotAbout, selfCollisions } from './geometry.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 1) => Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: d, useGrouping: false }) : '–';
const fin = n => (n ? String(Math.round(n * 10) / 10).replace('.', ',') : '');
const num = s => { const v = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const r1 = n => Math.round(n * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normRot = r => { let x = ((r % 360) + 360) % 360; return x > 180 ? x - 360 : x; };

// ---------- Daten ----------
const STORE = 'biege.v1';

// Zangenmarken: k = Abstand Bleistiftstrich -> Biegeanfang, side = wo der Rohranfang liegt.
// Schätzung bis zur Kalibrierung: 0 = Biegeanfang, L/R = Schnittpunkt bei 90° (k = R).
const defaultMarks = R => [
  { name: '0', k: 0, side: 'links', cal: false },
  { name: 'L', k: R, side: 'links', cal: false },
  { name: 'R', k: R, side: 'rechts', cal: false },
];
function defaultProfiles() {
  const base = { springback: 0, pref: 'auto' };
  return [
    { ...base, id: 'es6', name: 'Edelstahl 6 mm', D: 6, R: 15, minStraight: 20, marks: defaultMarks(15) },
    { ...base, id: 'es8', name: 'Edelstahl 8 mm', D: 8, R: 24, minStraight: 25, marks: defaultMarks(24) },
  ];
}
// Profile aus der ersten Version (eine Marke mit k) übernehmen
function migrate(d) {
  d.profiles.forEach(f => {
    if (f.marks) return;
    f.marks = defaultMarks(f.R);
    const m = f.marks.find(x => x.name === f.mark) || f.marks[0];
    m.k = f.k || 0; m.cal = !!f.calibrated;
    f.pref = 'auto';
    delete f.k; delete f.mark; delete f.insert; delete f.calibrated;
  });
  return d;
}
const anyCal = f => f.marks.some(m => m.cal);

// Automatisch: 90° mit L (Strich = Schnittpunkt), sonst 0
function pickMark(f, angle) {
  const ms = f.marks || [];
  const by = n => ms.find(m => m.name.trim().toUpperCase() === n);
  if (f.pref && f.pref !== 'auto') { const m = ms.find(x => x.name === f.pref); if (m) return m; }
  if (Math.abs(angle - 90) < 0.5 && by('L')) return by('L');
  return by('0') || ms[0] || { name: '0', k: 0, side: 'links' };
}
function newProject(profileId, name) {
  return {
    id: uid(), name, profileId, mode: 'deltas', zugA: 0, zugE: 0, done: {},
    deltas: [{ x: 200, y: 0, z: 0 }, { x: 0, y: 0, z: 150 }],
    legs: [{ len: 200, angle: 90, rot: 0 }, { len: 150 }],
  };
}
function seed() {
  const profiles = defaultProfiles();
  const p = newProject(profiles[0].id, 'Beispiel 3D');
  p.deltas = [{ x: 150, y: 0, z: 0 }, { x: 0, y: 0, z: 120 }, { x: 0, y: 180, z: 0 }, { x: 140, y: 0, z: 0 }];
  return { profiles, projects: [p], currentId: p.id };
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE)); if (d?.profiles?.length && d?.projects?.length) return migrate(d); } catch {}
  return seed();
}
let db = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch {} };
const proj = () => db.projects.find(p => p.id === db.currentId) || db.projects[0];
const prof = (p = proj()) => db.profiles.find(x => x.id === p.profileId) || db.profiles[0];
const points = p => (p.mode === 'deltas' ? pointsFromDeltas(p.deltas) : pointsFromAngles(p.legs));

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks.at(-1)] = val;
}

// Modus wechseln: Geometrie in die andere Darstellung umrechnen
function toDeltas(legs) {
  const pts = pointsFromAngles(legs);
  return pts.slice(1).map((q, i) => ({ x: q[0] - pts[i][0], y: q[1] - pts[i][1], z: q[2] - pts[i][2] }));
}
function toLegs(deltas) {
  const pts = cleanPoints(pointsFromDeltas(deltas));
  if (pts.length < 2) return [{ len: 100 }];
  return anglesFromPoints(pts).map(l => ({ len: r1(l.len), angle: r1(l.angle), rot: r1(normRot(l.rot)) }));
}

const TEMPLATES = {
  w90: [{ len: 150, angle: 90, rot: 0 }, { len: 150 }],
  etage: [{ len: 100, angle: 45, rot: 0 }, { len: 141.4, angle: 45, rot: 180 }, { len: 100 }],
  u: [{ len: 150, angle: 90, rot: 0 }, { len: 80, angle: 90, rot: 0 }, { len: 150 }],
  d3: [{ len: 150, angle: 90, rot: 0 }, { len: 200, angle: 90, rot: 90 }, { len: 150 }],
};

// ---------- Rückgängig / Wiederholen ----------
// Verlauf je Projekt (nur im Speicher). commit() VOR jeder Änderung aufrufen; Tippen im selben Feld
// innerhalb von 1,5 s wird zu einem Schritt zusammengefasst.
const hist = new Map();
const histOf = p => { if (!hist.has(p.id)) hist.set(p.id, { undo: [], redo: [] }); return hist.get(p.id); };
const snapshot = p => structuredClone({ mode: p.mode, deltas: p.deltas, legs: p.legs, zugA: p.zugA, zugE: p.zugE, profileId: p.profileId });
let lastKey = null, lastTime = 0;
function commit(key = null, snap = null) {
  const p = proj(), now = Date.now();
  if (key && key === lastKey && now - lastTime < 1500) { lastTime = now; return; }
  lastKey = key; lastTime = now;
  const h = histOf(p);
  h.undo.push(snap || snapshot(p));
  if (h.undo.length > 100) h.undo.shift();
  h.redo = [];
  updateUndoButtons();
}
function undoRedo(dir) {
  const p = proj(), h = histOf(p), from = dir < 0 ? h.undo : h.redo, to = dir < 0 ? h.redo : h.undo;
  if (!from.length || gz || drag) return;
  to.push(snapshot(p));
  Object.assign(p, from.pop());
  lastKey = null;
  if (!isOrtho()) fit = null;
  renderProjectBar(); renderInputs(); recompute();
  selectLeg(sel < points(p).length - 1 ? sel : -1);
  updateUndoButtons();
}
function updateUndoButtons() {
  const h = histOf(proj());
  $('#undoBtn').disabled = !h.undo.length;
  $('#redoBtn').disabled = !h.redo.length;
}
$('#undoBtn').addEventListener('click', () => undoRedo(-1));
$('#redoBtn').addEventListener('click', () => undoRedo(1));
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.target.matches('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  else if (k === 'y') { e.preventDefault(); undoRedo(1); }
});

// ---------- Eingabe ----------
let layout = null, highlight = -1;

const ANGLE_STEP = 15;
// Auswahlliste im 15°-Raster; ein Wert außerhalb bleibt als eigene Option sichtbar
function angleSelect(path, val, from, to) {
  let o = '', hit = false;
  for (let a = from; a <= to; a += ANGLE_STEP) {
    const on = Math.abs(a - val) < 0.05;
    hit ||= on;
    o += `<option value="${a}"${on ? ' selected' : ''}>${a}°</option>`;
  }
  if (!hit) o = `<option value="${val}" selected>${fmt(val)}° (außerhalb Raster)</option>` + o;
  return `<select data-p="${path}">${o}</select>`;
}

function signed(path, val) {
  return `<span class="sgn"><button type="button" class="sgbtn" data-sign="${path}" aria-label="Vorzeichen">${val < 0 ? '−' : '+'}</button>` +
    `<input inputmode="decimal" data-p="${path}" data-signed value="${fin(Math.abs(val || 0))}" placeholder="0"></span>`;
}

function renderProjectBar() {
  const p = proj();
  $('#projSel').innerHTML = db.projects.map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#pName').value = p.name;
  $('#pProf').innerHTML = db.profiles.map(f => `<option value="${f.id}"${f.id === p.profileId ? ' selected' : ''}>${esc(f.name)} · R ${fmt(f.R)}</option>`).join('');
  $('#pZugA').value = fin(p.zugA);
  $('#pZugE').value = fin(p.zugE);
}

function renderInputs() {
  const p = proj();
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === p.mode));
  $('#modeHint').textContent = p.mode === 'deltas'
    ? 'Jeder Schenkel = Weg von Schnittpunkt zu Schnittpunkt (Achsmaß, Rohrmitte). X: rechts + / links −, Y: hinten + / vorn −, Z: oben + / unten −. Für schräge Schenkel mehrere Werte eintragen.'
    : 'Achsmaß jedes Schenkels bis zum nächsten Schnittpunkt. Drehung = Lage der Biegung gegenüber der vorigen: 0° gleiche Ebene (U-Form), 180° gleiche Ebene (Z-Form/Etage), ±90° räumlich.';
  const n = p.mode === 'deltas' ? p.deltas.length : p.legs.length;
  const legName = i => (i === 0 ? 'Rohranfang → Schnittpunkt 1' : i === n - 1 ? `Schnittpunkt ${i} → Rohrende` : `Schnittpunkt ${i} → ${i + 1}`);
  let h = '';
  if (p.mode === 'deltas') {
    p.deltas.forEach((d, i) => {
      h += `<div class="leg"><div class="leghead">Schenkel ${i + 1} <span class="meta" data-len="${i}"></span>` +
        `${n > 1 ? `<button data-del="${i}" aria-label="Schenkel löschen">✕</button>` : ''}</div>` +
        `<div class="row3">` +
        `<label>X <small>rechts + / links −</small>${signed(`deltas.${i}.x`, d.x)}</label>` +
        `<label>Y <small>hinten + / vorn −</small>${signed(`deltas.${i}.y`, d.y)}</label>` +
        `<label>Z <small>oben + / unten −</small>${signed(`deltas.${i}.z`, d.z)}</label>` +
        `</div><div class="hint" style="margin:6px 0 0">${legName(i)}</div></div>` +
        (i < n - 1 ? `<div class="bendrow"><div class="t" data-bend="${i}">Biegung ${i + 1}</div></div>` : '');
    });
  } else {
    p.legs.forEach((l, i) => {
      h += `<div class="leg"><div class="leghead">Schenkel ${i + 1} <span class="meta">${legName(i)}</span>` +
        `${n > 1 ? `<button data-del="${i}" aria-label="Schenkel löschen">✕</button>` : ''}</div>` +
        `<label>Achsmaß (mm)<input inputmode="decimal" data-p="legs.${i}.len" value="${fin(l.len)}" placeholder="0"></label></div>`;
      if (i < n - 1) {
        h += `<div class="bendrow"><div class="t">Biegung ${i + 1}</div><div class="row2" style="margin:0">` +
          `<label>Winkel${angleSelect(`legs.${i}.angle`, l.angle ?? 90, ANGLE_STEP, 180)}</label>` +
          (i === 0 ? `<label>Drehung (°)<input disabled placeholder="– erste Biegung –"></label>`
            : `<label>Drehung${angleSelect(`legs.${i}.rot`, normRot(l.rot || 0), -165, 180)}</label>`) +
          `</div></div>`;
      }
    });
  }
  $('#legList').innerHTML = h;
}

function readSigned(inp) {
  const btn = inp.previousElementSibling;
  if (inp.value.trim().startsWith('-')) {
    btn.textContent = btn.textContent === '−' ? '+' : '−';
    inp.value = inp.value.replace('-', '');
  }
  return num(inp.value) * (btn.textContent === '−' ? -1 : 1);
}

$('#legList').addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.p) return;
  commit('f:' + el.dataset.p);
  setPath(proj(), el.dataset.p, 'signed' in el.dataset ? readSigned(el) : num(el.value));
  recompute();
});
$('#legList').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const p = proj();
  if (b.dataset.sign) {
    b.textContent = b.textContent === '−' ? '+' : '−';
    commit();
    setPath(p, b.dataset.sign, num(b.nextElementSibling.value) * (b.textContent === '−' ? -1 : 1));
    recompute();
  } else if (b.dataset.del != null) {
    const arr = p.mode === 'deltas' ? p.deltas : p.legs;
    commit();
    arr.splice(+b.dataset.del, 1);
    renderInputs(); recompute();
  }
});
$('#addLeg').addEventListener('click', () => {
  const p = proj();
  commit();
  if (p.mode === 'deltas') {
    const last = p.deltas.at(-1) || { x: 1 };
    p.deltas.push(Math.abs(last.z) > 0 ? { x: 100, y: 0, z: 0 } : { x: 0, y: 0, z: 100 });
  } else {
    const last = p.legs.at(-1);
    if (last) { last.angle = last.angle || 90; last.rot = last.rot || 0; }
    p.legs.push({ len: 100 });
  }
  renderInputs(); recompute();
});
$('#modeSeg').addEventListener('click', e => {
  const m = e.target.closest('button')?.dataset.mode;
  const p = proj();
  if (!m || m === p.mode) return;
  commit();
  if (m === 'deltas') p.deltas = toDeltas(p.legs); else p.legs = toLegs(p.deltas);
  p.mode = m;
  renderInputs(); recompute();
});
$('.tpl').addEventListener('click', e => {
  const t = TEMPLATES[e.target.closest('button')?.dataset.tpl];
  if (!t) return;
  commit();
  const p = proj();
  p.legs = structuredClone(t);
  if (p.mode === 'deltas') p.deltas = toDeltas(p.legs);
  p.done = {};
  renderInputs(); recompute(); resetView();
});

$('#projSel').addEventListener('change', e => { db.currentId = e.target.value; highlight = -1; fullRender(); resetView(); });
$('#pName').addEventListener('input', e => { proj().name = e.target.value; save(); $('#projSel').selectedOptions[0].textContent = e.target.value; });
$('#pProf').addEventListener('change', e => { commit(); proj().profileId = e.target.value; recompute(); });
$('#pZugA').addEventListener('input', e => { commit('zugA'); proj().zugA = num(e.target.value); recompute(); });
$('#pZugE').addEventListener('input', e => { commit('zugE'); proj().zugE = num(e.target.value); recompute(); });
$('#pNew').addEventListener('click', () => {
  const p = newProject(proj().profileId, `Rohr ${db.projects.length + 1}`);
  db.projects.push(p); db.currentId = p.id; fullRender(); resetView();
});
$('#pDup').addEventListener('click', () => {
  const p = { ...structuredClone(proj()), id: uid(), name: proj().name + ' (Kopie)', done: {} };
  db.projects.push(p); db.currentId = p.id; fullRender();
});
$('#pDel').addEventListener('click', () => {
  if (!confirm(`Projekt „${proj().name}“ löschen?`)) return;
  db.projects = db.projects.filter(p => p.id !== db.currentId);
  if (!db.projects.length) db.projects.push(newProject(db.profiles[0].id, 'Rohr 1'));
  db.currentId = db.projects[0].id; fullRender(); resetView();
});

// ---------- Berechnung & Ausgabe ----------
function recompute(light = false) {
  const p = proj(), f = prof(p);
  layout = computeLayout(points(p), { R: f.R, zugA: p.zugA, zugE: p.zugE, minStraight: f.minStraight, pickMark: b => pickMark(f, b.angle) });
  layout.collisions = selfCollisions(layout.samples, f.D);
  if (light) { draw(); return; }
  if (layout.collisions.length) layout.errors.push(`Rohr berührt sich selbst (${layout.collisions.length}× – rot markiert).`);
  layout.bends.forEach((b, j) => {
    const off = Math.abs(b.angle / ANGLE_STEP - Math.round(b.angle / ANGLE_STEP)) * ANGLE_STEP;
    if (off > 0.1) layout.warnings.push(`Biegung ${j + 1}: ${fmt(b.angle)}° liegt nicht im ${ANGLE_STEP}°-Raster.`);
  });
  const uncal = [...new Set(layout.bends.filter(b => !f.marks.find(m => m.name === b.markName)?.cal).map(b => b.markName))];
  if (uncal.length) layout.warnings.push(`Marke ${uncal.map(n => `„${n}“`).join(', ')} nicht kalibriert – Strichpositionen sind Schätzwerte.`);
  if (highlight >= layout.bends.length) highlight = -1;
  if (p.mode === 'deltas') {
    p.deltas.forEach((d, i) => {
      const el = $(`[data-len="${i}"]`);
      if (el) el.textContent = `= ${fmt(Math.hypot(d.x || 0, d.y || 0, d.z || 0))} mm`;
    });
    // Biegeinfos zwischen den Schenkeln nur, wenn keine Schenkel zusammengefasst wurden
    const direct = layout.verts.length === p.deltas.length + 1;
    $$('[data-bend]').forEach(el => {
      const i = +el.dataset.bend, b = direct ? layout.bends[i] : null;
      el.textContent = b ? `Biegung ${i + 1}: ${fmt(b.angle)}°` + (i > 0 ? ` · Drehung ${fmt(normRot(b.rot))}°` : '') : `Biegung ${i + 1}`;
    });
  }
  renderSummary();
  renderGuide();
  draw();
  save();
}

function messages() {
  return layout.errors.map(m => `<div class="msg err">✕ ${esc(m)}</div>`).join('') +
    layout.warnings.map(m => `<div class="msg warn">⚠ ${esc(m)}</div>`).join('');
}

function renderSummary() {
  const f = prof();
  $('#summary').innerHTML =
    `<div class="kv"><span>Zuschnitt</span></div><div class="big">${fmt(layout.total)} mm</div>` +
    `<div class="kv"><span>Biegungen <b>${layout.bends.length}</b></span><span>Radius <b>${fmt(f.R)} mm</b></span><span>Zange <b>${esc(f.name)}</b></span></div>` +
    `<div class="chips">${layout.bends.map((b, j) => `<span class="chip">${j + 1}: ${fmt(b.angle)}°${j ? ' / ' + fmt(normRot(b.rot)) + '°' : ''}</span>`).join('')}</div>` +
    messages();
}

function rotText(phi) {
  const a = Math.abs(phi);
  if (a < 0.5) return 'Nicht drehen: Der vorige Schenkel zeigt in Biegerichtung (alles in einer Ebene, U-Form).';
  if (Math.abs(a - 180) < 0.5) return 'Um 180° drehen: Der vorige Schenkel zeigt entgegen der Biegerichtung (eine Ebene, Z-Form/Etage).';
  return `Drehen, bis der vorige Schenkel <b>${fmt(a)}° ${phi > 0 ? 'links' : 'rechts'}</b> neben der Biegerichtung steht (Blick entlang des Rohrs zum freien Ende).`;
}
function rotSvg(phi) {
  const a = phi * Math.PI / 180, x = -Math.sin(a), y = -Math.cos(a);
  return `<svg class="rotsvg" viewBox="-60 -60 120 120" aria-hidden="true">
    <circle r="15" fill="var(--tube-hi)" stroke="var(--tube)" stroke-width="2"/>
    <line x1="0" y1="-18" x2="0" y2="-46" stroke="var(--mark)" stroke-width="4"/>
    <path d="M-7 -40 L0 -52 L7 -40 Z" fill="var(--mark)"/>
    <line x1="${x * 18}" y1="${y * 18}" x2="${x * 44}" y2="${y * 44}" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}

function tapeSvg() {
  const L = layout.total || 1, W = 600, x0 = 14, sc = (W - 2 * x0) / L;
  let s = `<svg class="tape" viewBox="0 0 ${W} 120" role="img" aria-label="Rohr mit Markierungen">`;
  s += `<rect x="${x0}" y="48" width="${L * sc}" height="14" rx="3" fill="var(--tube-hi)" stroke="var(--tube)"/>`;
  layout.bends.forEach(b => { s += `<rect x="${x0 + b.start * sc}" y="48" width="${Math.max(1, b.B * sc)}" height="14" fill="var(--tube)" opacity=".6"/>`; });
  layout.bends.forEach((b, j) => {
    const x = x0 + b.mark * sc, up = j % 2 === 0;
    s += `<line x1="${x}" y1="${up ? 34 : 48}" x2="${x}" y2="${up ? 62 : 76}" stroke="var(--mark)" stroke-width="3"/>`;
    s += `<circle cx="${x}" cy="${up ? 20 : 90}" r="13" fill="var(--mark)"/><text x="${x}" y="${up ? 26 : 96}" text-anchor="middle" fill="#fff" style="font-weight:700">${j + 1}</text>`;
  });
  s += `<text x="${x0}" y="116">A</text><text x="${W - x0}" y="116" text-anchor="end">${fmt(L)}</text></svg>`;
  s += `<div class="marklist">${layout.bends.map((b, j) => `<span><span class="num">${j + 1}</span>${fmt(b.mark)} mm</span>`).join('')}</div>`;
  return s;
}

function renderGuide() {
  const p = proj(), f = prof(p);
  const bends = layout.bends;
  let h = `<div class="card"><div class="kv"><span>Zuschnitt</span></div><div class="big">${fmt(layout.total)} mm</div>
    <div class="kv"><span>Zange <b>${esc(f.name)}</b></span><span>R <b>${fmt(f.R)}</b></span><span>Rückfederung <b>${fmt(f.springback)}°/90°</b></span></div>
    ${anyCal(f) ? '' : '<div class="msg warn">⚠ Diese Zange ist noch nicht kalibriert – Radius und Markenabstände sind Schätzwerte. Im Reiter „Zangen“ eine Probebiegung machen.</div>'}
    ${messages()}</div>`;

  h += `<div class="card"><h3>1. Ablängen &amp; anzeichnen</h3>
    <p style="margin:0 0 8px">Rohr auf <b>${fmt(layout.total)} mm</b> ablängen, Anfang mit „A“ beschriften. Strichpositionen ab Anfang auf dem geraden Rohr:</p>
    ${tapeSvg()}
    <p class="hint">Tipp: Vor dem Biegen einen Längsstrich über das ganze Rohr ziehen – damit siehst du beim Drehen, wie weit das Rohr verdreht ist.</p></div>`;

  if (!bends.length) h += `<div class="card">Keine Biegung – gerades Rohr.</div>`;
  bends.forEach((b, j) => {
    const scale = b.angle + (f.springback || 0) * b.angle / 90;
    const phi = normRot(b.rot);
    const k = b.mark - b.start;
    // Nach einer 90°-Biegung steht der vorige Schenkel quer: Strich direkt ab dessen Achse messen.
    // Abstand = Achsmaß − Tangente + Markenabstand (bei 90° mit L/R genau das Achsmaß).
    const fromAxis = j > 0 && Math.abs(bends[j - 1].angle - 90) < 0.5;
    const axisDist = layout.legs[j].len - b.T + k;
    const measure = j === 0
      ? `Strich bei <b class="hl">${fmt(b.mark)} mm</b> ab Rohranfang`
      : fromAxis
        ? `Strich bei <b class="hl">${fmt(axisDist)} mm</b>, gemessen ab Achse von Schenkel ${j} <span class="hint">(Außenkante − ${fmt(f.D / 2)} mm)</span>
           <div class="alt">oder vorab auf dem geraden Rohr: ${fmt(b.mark)} mm ab Anfang</div>`
        : `Strich bei <b class="hl">${fmt(b.mark)} mm</b> ab Anfang <span class="hint">(vor dem ersten Biegen anzeichnen – nach einem schrägen Bogen lässt sich nicht ab Achse messen)</span>`;
    const others = f.marks.filter(m => m.name !== b.markName);
    h += `<div class="step${highlight === j ? ' hl' : ''}${p.done[j] ? ' done' : ''}" data-step="${j}">
      <h3><span class="num">${j + 1}</span> Biegung ${j + 1} · ${fmt(b.angle)}°
        <label class="done-box"><input type="checkbox" data-done="${j}"${p.done[j] ? ' checked' : ''}> erledigt</label></h3>
      <div class="inst"><ol>
        <li>${measure}</li>
        <li>Strich auf Marke <b class="hl">„${esc(b.markName)}“</b> – der gemessene Teil liegt <b>${esc(b.markSide || 'links')}</b> von der Zange.
          ${others.length ? `<div class="alt">${others.map(m => `oder „${esc(m.name)}“ (gemessener Teil ${esc(m.side)}) → ${Math.abs(m.k - k) < 0.05 ? 'gleicher Strich' : `Strich ${fmt(Math.abs(m.k - k))} mm ${m.k > k ? 'weiter weg vom' : 'näher zum'} gemessenen Ende`}`).join(' · ')}</div>` : ''}</li>
        ${j ? `<li>${rotText(phi)}</li>` : ''}
        <li>Biegen bis Skala <b class="hl">${fmt(scale)}°</b>${f.springback ? ` <span class="hint">(Soll ${fmt(b.angle)}° + Rückfederung)</span>` : ''}</li>
      </ol>${j ? `<div class="rotbox">${rotSvg(phi)}<div><span style="color:var(--mark)">▲ Biegerichtung</span><br><span style="color:var(--accent)">━ voriger Schenkel</span><br>Blick zum freien Ende</div></div>` : ''}</div></div>`;
  });

  if (bends.length) {
    h += `<div class="card"><h3>Details</h3><div class="scroll-x"><table class="det">
      <tr><th>Nr.</th><th>Winkel</th><th>Drehung</th><th>Gerade davor</th><th>Tangente</th><th>Bogen</th><th>Biegeanfang</th><th>Markierung</th></tr>
      ${bends.map((b, j) => `<tr><td>${j + 1}</td><td>${fmt(b.angle)}°</td><td>${j ? fmt(normRot(b.rot)) + '°' : '–'}</td><td>${fmt(layout.straights[j])}</td><td>${fmt(b.T)}</td><td>${fmt(b.B)}</td><td>${fmt(b.start)}</td><td>${fmt(b.mark)}</td></tr>`).join('')}
      <tr><td>Ende</td><td></td><td></td><td>${fmt(layout.straights.at(-1))}</td><td></td><td></td><td></td><td></td></tr>
      </table></div><p class="hint">Alle Maße in mm, gemessen auf der Rohrmitte. Gerade + Bögen ergeben den Zuschnitt.</p></div>`;
  }
  $('#tab-guide').innerHTML = h;
}

$('#tab-guide').addEventListener('click', e => {
  const cb = e.target.closest('[data-done]');
  if (cb) {
    proj().done[cb.dataset.done] = cb.checked;
    save();
    cb.closest('.step').classList.toggle('done', cb.checked);
    return;
  }
  if (e.target.closest('.done-box')) return;
  const st = e.target.closest('[data-step]');
  if (!st) return;
  highlight = highlight === +st.dataset.step ? -1 : +st.dataset.step;
  $$('.step').forEach(s => s.classList.toggle('hl', +s.dataset.step === highlight));
  draw();
});

// ---------- Zangen ----------
let toolProfId = null;
const PF = [
  ['name', 'Bezeichnung', 'text', ''],
  ['D', 'Rohr-Außendurchmesser (mm)', 'num', ''],
  ['R', 'Biegeradius auf Rohrmitte (mm)', 'num', 'Steht meist auf der Zange; genauer per Probebiegung.'],
  ['springback', 'Rückfederung (° bei 90°)', 'num', 'So viel weiter biegen. Wird für andere Winkel anteilig gerechnet.'],
  ['minStraight', 'Mindest-Gerade zwischen Bögen (mm)', 'num', 'Kürzeste gerade Strecke, die die Zange noch greift.'],
];
const curTool = () => db.profiles.find(x => x.id === toolProfId);

function renderTools() {
  const f = curTool() || db.profiles[0];
  toolProfId = f.id;
  const calMark = $('[data-calmark]')?.value;
  $('#tab-tools').innerHTML = `
  <div class="card">
    <label>Zange / Rohr-Profil<select id="tSel">${db.profiles.map(x => `<option value="${x.id}"${x.id === f.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="btnrow" style="margin:10px 0 0"><button id="tNew">Neues Profil</button><button id="tDel" class="danger">Löschen</button></div>
  </div>
  <div class="card">${PF.map(([k, l, t, hlp]) => `<label style="margin-bottom:10px">${l}<input data-pf="${k}" data-t="${t}" ${t === 'num' ? 'inputmode="decimal"' : ''} value="${esc(t === 'num' ? fin(f[k]) : f[k])}">${hlp ? `<small>${hlp}</small>` : ''}</label>`).join('')}</div>
  <div class="card">
    <h3>Marken der Zange</h3>
    <p class="hint" style="margin-top:0">L/R: Liegt das gemessene Stück links der Zange, kommt der Strich auf L, liegt es rechts, auf R. Nach 90° liegt die neue Rohrachse genau am Strich – dann ist der Abstand Strich → Biegeanfang gleich dem Biegeradius. Die Probebiegung bestätigt das.</p>
    <table class="marks">
      <tr><th>Marke</th><th>Abstand (mm)</th><th>Gemessener Teil</th><th></th></tr>
      ${f.marks.map((m, i) => `<tr>
        <td><input data-mk="${i}.name" value="${esc(m.name)}"></td>
        <td><input data-mk="${i}.k" inputmode="decimal" value="${String(r1(m.k)).replace('.', ',')}"></td>
        <td><select data-mk="${i}.side"><option${m.side === 'links' ? ' selected' : ''}>links</option><option${m.side === 'rechts' ? ' selected' : ''}>rechts</option></select></td>
        <td><span class="badge${m.cal ? ' ok' : ''}">${m.cal ? '✓' : 'Schätzung'}</span> <button data-mkdel="${i}" aria-label="Marke löschen" style="min-height:32px;padding:2px 8px;border:0;background:transparent;color:var(--muted)">✕</button></td>
      </tr>`).join('')}
    </table>
    <button id="mAdd" class="wide" style="margin:0 0 10px">+ Marke</button>
    <label>Welche Marke verwenden?<select data-pf="pref" data-t="text">
      <option value="auto"${f.pref === 'auto' ? ' selected' : ''}>Automatisch: 90° mit „L“, sonst „0“</option>
      ${f.marks.map(m => `<option value="${esc(m.name)}"${f.pref === m.name ? ' selected' : ''}>Immer „${esc(m.name)}“</option>`).join('')}
    </select></label>
  </div>
  <div class="card">
    <h3>Kalibrieren mit einer Probebiegung</h3>
    <ol class="hint" style="padding-left:18px;margin-top:0">
      <li>Gerades Stück Rohr ablängen (z. B. 300 mm), Länge eintragen.</li>
      <li>Strich bei z. B. 100 mm ab Anfang. Gemessenes Stück auf die Seite der Marke (L = links), Strich auf die Marke.</li>
      <li>Auf 90° biegen, Skalenwert notieren.</li>
      <li>Achsmaße messen (Außenmaß − halber Rohr-Ø). Schenkel 1 = vom Anfang bis Achse des anderen Schenkels – bei L/R sollte das genau x sein.</li>
      <li>Mit dem Winkelmesser den echten Winkel messen.</li>
    </ol>
    <label style="margin-bottom:10px">Probebiegung mit Marke<select data-calmark>${f.marks.map((m, i) => `<option value="${i}"${String(i) === calMark || (calMark == null && m.name === 'L') ? ' selected' : ''}>„${esc(m.name)}“ (gemessener Teil ${esc(m.side)})</option>`).join('')}</select></label>
    <div class="row2">
      <label>Rohrlänge L<input data-cal="L" inputmode="decimal"></label>
      <label>Strich bei x<input data-cal="x" inputmode="decimal"></label>
    </div>
    <div class="row2">
      <label>Achsmaß Schenkel 1<input data-cal="A1" inputmode="decimal"></label>
      <label>Achsmaß Schenkel 2<input data-cal="A2" inputmode="decimal" placeholder="optional"></label>
    </div>
    <div class="row2">
      <label>Gebogen bis Skala (°)<input data-cal="S" inputmode="decimal" placeholder="optional"></label>
      <label>Gemessener Winkel (°)<input data-cal="M" inputmode="decimal" placeholder="optional"></label>
    </div>
    <div id="calRes" class="hint"></div>
    <button id="calApply" class="primary" style="width:100%" disabled>Werte übernehmen</button>
    <p class="hint">Noch nicht kalibrierte Marken werden aus dem Ergebnis abgeschätzt (L/R liegen um den Radius neben „0“). Am genauesten ist eine Probebiegung pro Marke.</p>
  </div>`;
}

function calValues() {
  const c = {};
  $$('[data-cal]').forEach(i => { c[i.dataset.cal] = num(i.value); });
  return c;
}
function calResult() {
  const f = curTool(), c = calValues();
  if (!(c.x > 0 && c.A1 > 0)) return null;
  const r = calibrate({ L: c.L, x: c.x, A1: c.A1, A2: c.A2, R: f.R });
  if (c.S > 0 && c.M > 0) r.springback = (c.S - c.M) * 90 / c.M;
  return r;
}
function showCal() {
  const r = calResult();
  $('#calApply').disabled = !r || !(r.R > 0);
  $('#calRes').innerHTML = r
    ? (r.R > 0 ? `Ergebnis: Radius <b>${fmt(r.R)} mm</b> · Abstand Strich→Biegeanfang <b>${fmt(r.k)} mm</b>${r.springback != null ? ` · Rückfederung <b>${fmt(r.springback)}°</b>` : ''}` : '<span style="color:var(--err)">Messwerte passen nicht zusammen (Radius ≤ 0).</span>')
    : 'Mindestens Strich x und Achsmaß Schenkel 1 eintragen.';
}
const afterProfileChange = () => { save(); renderProjectBar(); recompute(); };

$('#tab-tools').addEventListener('input', e => {
  const el = e.target, f = curTool();
  if (el.dataset.pf) {
    f[el.dataset.pf] = el.dataset.t === 'num' ? num(el.value) : el.value;
    if (el.dataset.pf === 'name') $('#tSel').selectedOptions[0].textContent = el.value;
    afterProfileChange();
  } else if (el.dataset.mk) {
    const [i, key] = el.dataset.mk.split('.');
    const m = f.marks[+i], old = m.name;
    m[key] = key === 'k' ? num(el.value) : el.value;
    if (key === 'name' && f.pref === old) f.pref = el.value;
    afterProfileChange();
  } else if (el.dataset.cal) showCal();
});
$('#tab-tools').addEventListener('change', e => {
  if (e.target.id === 'tSel') { toolProfId = e.target.value; renderTools(); }
  else if (e.target.dataset.mk?.endsWith('.name')) renderTools(); // Auswahllisten aktualisieren
});
$('#tab-tools').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const f = curTool();
  if (b.id === 'tNew') {
    const n = { ...structuredClone(f), id: uid(), name: 'Neue Zange' };
    n.marks.forEach(m => { m.cal = false; });
    db.profiles.push(n); toolProfId = n.id; save(); renderTools(); renderProjectBar();
  } else if (b.id === 'tDel') {
    if (db.profiles.length < 2) { alert('Das letzte Profil kann nicht gelöscht werden.'); return; }
    if (!confirm(`Profil „${f.name}“ löschen?`)) return;
    db.profiles = db.profiles.filter(x => x.id !== f.id);
    db.projects.forEach(p => { if (p.profileId === f.id) p.profileId = db.profiles[0].id; });
    toolProfId = null; renderTools(); afterProfileChange();
  } else if (b.id === 'mAdd') {
    f.marks.push({ name: '?', k: 0, side: 'links', cal: false });
    renderTools(); afterProfileChange();
  } else if (b.dataset.mkdel != null) {
    if (f.marks.length < 2) return;
    const [m] = f.marks.splice(+b.dataset.mkdel, 1);
    if (f.pref === m.name) f.pref = 'auto';
    renderTools(); afterProfileChange();
  } else if (b.id === 'calApply') {
    const r = calResult();
    if (!r) return;
    const m = f.marks[+$('[data-calmark]').value];
    f.R = r1(r.R);
    m.k = r1(r.k); m.cal = true;
    if (r.springback != null) f.springback = r1(r.springback);
    // Nicht kalibrierte Marken aus der Theorie nachziehen: L/R = 0 + R
    const isVertex = n => ['L', 'R'].includes(n.trim().toUpperCase());
    const k0 = isVertex(m.name) ? m.k - f.R : m.k;
    f.marks.forEach(o => { if (!o.cal) o.k = r1(isVertex(o.name) ? k0 + f.R : k0); });
    renderTools(); afterProfileChange();
  }
});

// ---------- 3D-Ansicht ----------
// Zwei Ebenen: cvBg = Bodenraster + weicher Schatten, cv = Rohr (mit Verdeckungsschatten) + Beschriftung
const cv = $('#cv'), ctx = cv.getContext('2d'), cvBg = $('#cvBg'), bctx = cvBg.getContext('2d');
const cam = { yaw: -0.6, pitch: 0.45, zoom: 1, panX: 0, panY: 0, view: 'iso' };
const H90 = Math.PI / 2 - 1e-4;
const VIEWS = {
  iso: [-0.6, 0.45], front: [0, 0], back: [Math.PI, 0], top: [0, H90], bottom: [0, -H90],
  right: [-Math.PI / 2, 0], left: [Math.PI / 2, 0],
};
const isOrtho = () => cam.view !== 'iso';
let fit = null, lastBase = null, view = null; // fit: gesperrte Grundskalierung (beim Bearbeiten springt nichts)
let sel = -1, drag = null;                       // gewählter Schenkel, laufendes Ziehen eines Anfassers
function resetView(v = 'iso') {
  [cam.yaw, cam.pitch] = VIEWS[v];
  cam.view = v; cam.zoom = 1; cam.panX = cam.panY = 0; fit = null;
  $$('.viewbtns button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#viewHint').textContent = isOrtho() ? 'Pfeile ziehen · Punkte ziehen · Schenkel antippen' : 'Pfeile am Ende ziehen · Schenkel antippen';
  if (sel >= 0 && !$('#legPanel').hidden) fillPanel();
  draw();
}
// Bildschirmachsen der aktuellen Ansicht in Weltkoordinaten (rechts r, oben u), bei Ortho-Ansichten auf Achsen gerundet
function screenAxes() {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rnd = v => v.map(c => (Math.abs(c) < 1e-3 ? 0 : Math.abs(Math.abs(c) - 1) < 1e-3 ? Math.sign(c) : c));
  return { r: rnd([cy, -sy, 0]), u: rnd([sy * sp, cy * sp, cp]) };
}

// Orthografische Kamera; pitch > 0 = Blick von oben. z = Tiefe (größer = weiter weg)
function project(p) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const xr = p[0] * cy - p[1] * sy, yr = p[0] * sy + p[1] * cy;
  return { x: xr, y: -(yr * sp + p[2] * cp), z: yr * cp - p[2] * sp };
}
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// fog = Hintergrundfarbe für den Tiefennebel
const PAL = {
  light: { fog: hex('#fbfcfd'), grid: 'rgba(40,55,75,.10)', shadow: 'rgba(25,35,50,.30)' },
  dark: { fog: hex('#161a20'), grid: 'rgba(200,215,235,.08)', shadow: 'rgba(0,0,0,.55)' },
};
const niceStep = v => [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(s => s >= v) || 5000;

// ---------- Rohr in WebGL ----------
// Röhrenmodell entlang der Mittellinie, Licht von oben links vorne, leichter Tiefennebel.
// Dieselbe orthografische Projektion wie project(), damit Beschriftung und Gimbal deckungsgleich bleiben.
const glc = $('#cvGL');
const gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
let glp = null;
const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uM; uniform mat3 uR;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() { vec4 c = uM * vec4(aPos, 1.0); gl_Position = c; vN = uR * aNor; vC = aCol; vZ = c.z; }`;
const FS = `precision mediump float;
uniform vec3 uL; uniform vec3 uFog; uniform float uFogAmt;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() {
  vec3 n = normalize(vN);
  float d = max(dot(n, uL), 0.0);
  float s = pow(max(dot(n, normalize(uL + vec3(0.0, 0.0, -1.0))), 0.0), 36.0);
  vec3 col = vC * (0.42 + 0.62 * d) + vec3(0.30) * s;
  gl_FragColor = vec4(mix(col, uFog, clamp((vZ + 1.0) * 0.5, 0.0, 1.0) * uFogAmt), 1.0);
}`;
function initGL() {
  if (!gl) return false;
  if (glp) return true;
  try {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = n => gl.getUniformLocation(p, n), a = n => gl.getAttribLocation(p, n);
    glp = { p, buf: gl.createBuffer(), aPos: a('aPos'), aNor: a('aNor'), aCol: a('aCol'), uM: u('uM'), uR: u('uR'), uL: u('uL'), uFog: u('uFog'), uFogAmt: u('uFogAmt') };
    return true;
  } catch (err) {
    console.warn('WebGL nicht nutzbar, Rohr wird flach gezeichnet:', err);
    return false;
  }
}

// Dreiecke (Position, Normale, Farbe) für die Röhre; Ringe mit Paralleltransport, damit sich nichts verdrillt
function tubeMesh(S, r, colOf) {
  const P = [];
  S.forEach(s => { if (!P.length || V.len(V.sub(s.p, P.at(-1).p)) > 1e-6) P.push(s); });
  const n = P.length, N = 20;
  if (n < 2) return new Float32Array(0);
  const T = P.map((s, i) => {
    const a = i > 0 ? V.norm(V.sub(s.p, P[i - 1].p)) : null, b = i < n - 1 ? V.norm(V.sub(P[i + 1].p, s.p)) : null;
    return a && b ? V.norm(V.add(a, b)) : a || b;
  });
  let nr = Math.abs(T[0][2]) < 0.9 ? V.norm(V.cross(T[0], [0, 0, 1])) : V.norm(V.cross(T[0], [1, 0, 0]));
  const rings = P.map((s, i) => {
    nr = V.norm(V.sub(nr, V.mul(T[i], V.dot(nr, T[i]))));
    const bn = V.cross(T[i], nr);
    return Array.from({ length: N }, (_, k) => {
      const a = 2 * Math.PI * k / N, d = V.add(V.mul(nr, Math.cos(a)), V.mul(bn, Math.sin(a)));
      return { p: V.add(s.p, V.mul(d, r)), n: d };
    });
  });
  const data = [], put = (v, c) => data.push(...v.p, ...v.n, ...c);
  for (let i = 0; i < n - 1; i++) {
    const c = colOf(P[i], P[i + 1]), A = rings[i], B = rings[i + 1];
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      put(A[k], c); put(B[k], c); put(B[k2], c);
      put(A[k], c); put(B[k2], c); put(A[k2], c);
    }
  }
  // Rohrenden als Scheiben
  for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
    const nn = V.mul(T[i], sg), c = colOf(P[i], P[i]), R = rings[i], ctr = { p: P[i].p, n: nn };
    for (let k = 0; k < N; k++) { put(ctr, c); put({ p: R[k].p, n: nn }, c); put({ p: R[(k + 1) % N].p, n: nn }, c); }
  }
  return new Float32Array(data);
}

function renderTubeGL(W, H, dpr, sc, cx, cyy, S, f) {
  if (!initGL()) { glc.hidden = true; return false; }
  const w = Math.round(W * dpr), h = Math.round(H * dpr);
  if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  // Projektion wie project(): Zeilen für Bildschirm-x, Bildschirm-y (nach unten) und Tiefe
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rx = [cy, -sy, 0], ry = [-sy * sp, -cy * sp, -cp], rz = [sy * cp, cy * cp, -sp];
  let z0 = Infinity, z1 = -Infinity;
  S.forEach(s => { const z = V.dot(rz, s.p); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
  const r = Math.max(f.D / 2, 2.5 / sc), zc = (z0 + z1) / 2, zr = (z1 - z0) / 2 + r + 1;
  const rows = [
    [...V.mul(rx, 2 * sc / W), 2 * cx / W - 1],
    [...V.mul(ry, -2 * sc / H), 1 - 2 * cyy / H],
    [...V.mul(rz, 1 / zr), -zc / zr],
    [0, 0, 0, 1],
  ];
  const M = new Float32Array(16), R3 = new Float32Array(9);
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) M[c * 4 + k] = rows[k][c];
  [rx, ry, rz].forEach((row, k) => row.forEach((v, c) => { R3[c * 3 + k] = v; }));

  const dark = isDark(), fog = PAL[dark ? 'dark' : 'light'].fog.map(v => v / 255);
  const steel = dark ? [0.56, 0.6, 0.66] : [0.66, 0.7, 0.75], orange = [0.91, 0.36, 0.06];
  const mesh = tubeMesh(S, r, (a, b) => (a.b >= 0 && a.b === b.b && a.b === highlight ? orange : steel));

  gl.useProgram(glp.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, glp.buf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);
  const st = 36;
  [[glp.aPos, 0], [glp.aNor, 12], [glp.aCol, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, st, off); });
  gl.uniformMatrix4fv(glp.uM, false, M);
  gl.uniformMatrix3fv(glp.uR, false, R3);
  gl.uniform3fv(glp.uL, V.norm([-0.45, -0.65, -0.6]));
  gl.uniform3fv(glp.uFog, fog);
  gl.uniform1f(glp.uFogAmt, 0.3);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 9);
  glc.hidden = false;
  return true;
}

let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; render3d(); });
}

function fitCanvas(c, g, W, H, dpr) {
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
}

function render3d() {
  if (!layout || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  fitCanvas(cv, ctx, W, H, dpr);
  fitCanvas(cvBg, bctx, W, H, dpr);
  const S = layout.samples;
  if (S.length < 2) return;
  const f = prof(), pal = PAL[isDark() ? 'dark' : 'light'];

  // Weltgrenzen, Boden etwas unter dem tiefsten Punkt
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  S.forEach(s => s.p.forEach((v, k) => { mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }));
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const zf = mn[2] - Math.max(f.D * 3, diag * 0.12);

  const ortho = isOrtho();
  const pr = S.map(s => project(s.p)), fp = ortho ? [] : S.map(s => project([s.p[0], s.p[1], zf]));
  let base = fit;
  if (!base) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    [...pr, ...fp].forEach(q => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    // Rand für Gimbal-Pfeile (~70 px) und oben für die Ansichtsbuttons
    const side = 90, top = 120, bottom = 80;
    base = { sc: Math.min((W - 2 * side) / Math.max(x1 - x0, 1), (H - top - bottom) / Math.max(y1 - y0, 1)), mx: (x0 + x1) / 2, my: (y0 + y1) / 2, dy: (top - bottom) / 2 };
    if (ortho) fit = base; // in Bearbeitungsansichten Maßstab festhalten
  }
  lastBase = base;
  const sc = base.sc * cam.zoom;
  const cx = W / 2 + cam.panX - base.mx * sc, cyy = H / 2 + base.dy + cam.panY - base.my * sc;
  const P = q => [cx + q.x * sc, cyy + q.y * sc];
  const P3 = p => P(project(p));
  view = { P3, sc };
  const tw = Math.max(5, f.D * sc);

  if (ortho) {
    // Ebenenraster der Ansicht statt Boden
    const gs = niceStep(28 / sc), px = gs * sc;
    bctx.lineWidth = 1;
    for (const major of [false, true]) {
      bctx.strokeStyle = major ? pal.grid.replace(/[\d.]+\)$/, m => `${Math.min(1, parseFloat(m) * 2.2)})`) : pal.grid;
      bctx.beginPath();
      for (let k = Math.ceil(-cx / px); k * px + cx <= W; k++) if ((k % 5 === 0) === major) { bctx.moveTo(cx + k * px, 0); bctx.lineTo(cx + k * px, H); }
      for (let k = Math.ceil(-cyy / px); k * px + cyy <= H; k++) if ((k % 5 === 0) === major) { bctx.moveTo(0, cyy + k * px); bctx.lineTo(W, cyy + k * px); }
      bctx.stroke();
    }
  } else {
  // Boden: Raster
  const step = niceStep(diag / 6);
  const gx0 = Math.floor(mn[0] / step - 1) * step, gx1 = Math.ceil(mx[0] / step + 1) * step;
  const gy0 = Math.floor(mn[1] / step - 1) * step, gy1 = Math.ceil(mx[1] / step + 1) * step;
  bctx.strokeStyle = pal.grid; bctx.lineWidth = 1; bctx.beginPath();
  for (let x = gx0; x <= gx1 + 1e-6; x += step) { const [ax, ay] = P3([x, gy0, zf]), [bx, by] = P3([x, gy1, zf]); bctx.moveTo(ax, ay); bctx.lineTo(bx, by); }
  for (let y = gy0; y <= gy1 + 1e-6; y += step) { const [ax, ay] = P3([gx0, y, zf]), [bx, by] = P3([gx1, y, zf]); bctx.moveTo(ax, ay); bctx.lineTo(bx, by); }
  bctx.stroke();

  // Boden: weicher Schatten (Licht von oben). Pfad außerhalb zeichnen, nur der Schatten fällt ins Bild.
  const off = 10000;
  bctx.save();
  bctx.shadowColor = pal.shadow; bctx.shadowBlur = Math.max(6, tw * 2) * dpr; bctx.shadowOffsetX = off * dpr;
  bctx.lineWidth = tw * 1.3; bctx.lineCap = 'round'; bctx.lineJoin = 'round'; bctx.strokeStyle = '#000';
  bctx.beginPath();
  fp.forEach((q, i) => { const [x, y] = P(q); i ? bctx.lineTo(x - off, y) : bctx.moveTo(x - off, y); });
  bctx.stroke();
  bctx.restore();
  }

  // Achsmaß-Ecken: gestrichelt vom Biegeanfang zum Schnittpunkt zum Biegeende (liegen außerhalb des Rohrs)
  const cMark = css('--mark'), cAcc = css('--accent'), cText = css('--text');
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = cAcc; ctx.globalAlpha = 0.7;
  ctx.beginPath();
  layout.bends.forEach(b => {
    const [ax, ay] = P3(V.sub(b.vertex, V.mul(b.din, b.T))), [vx, vy] = P3(b.vertex), [ex2, ey2] = P3(V.add(b.vertex, V.mul(b.dout, b.T)));
    ctx.moveTo(ax, ay); ctx.lineTo(vx, vy); ctx.lineTo(ex2, ey2);
  });
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;

  // Rohr: echtes 3D (WebGL) mit Licht und Tiefenpuffer; ohne WebGL flach in 2D
  if (!renderTubeGL(W, H, dpr, sc, cx, cyy, S, f)) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = tw; ctx.strokeStyle = css('--tube');
    ctx.beginPath(); S.forEach((s, i) => { const [x, y] = P3(s.p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  }

  // Maße an den Schenkeln
  ctx.font = '600 12px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i < layout.verts.length; i++) {
    const a = layout.verts[i - 1], b = layout.verts[i];
    const [x, y] = P3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    const t = fmt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    const w = ctx.measureText(t).width + 10;
    ctx.fillStyle = css('--card'); ctx.fillRect(x - w / 2, y - 26, w, 18);
    ctx.strokeStyle = cAcc; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y - 26, w, 18);
    ctx.fillStyle = cAcc; ctx.fillText(t, x, y - 17);
  }

  // Selbstberührungen
  (layout.collisions || []).forEach(c => {
    const [x, y] = P3(c.p);
    ctx.strokeStyle = '#e03131'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, Math.max(12, tw * 1.5), 0, 7); ctx.stroke();
  });

  // Markierungen
  layout.bends.forEach((b, j) => {
    const [x, y] = P3(pointAt(S, b.mark));
    ctx.fillStyle = cMark; ctx.beginPath(); ctx.arc(x, y, j === highlight ? 12 : 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 12px -apple-system, system-ui, sans-serif'; ctx.fillText(j + 1, x, y + 0.5);
  });
  const [sx, sy] = P(pr[0]);
  ctx.fillStyle = cText; ctx.font = '700 13px -apple-system, system-ui, sans-serif'; ctx.fillText('A', sx - 14, sy - 12);

  if (ortho) drawEditOverlay(P3, cAcc);
  drawGizmo();

  // Achsenkreuz
  const gx = 34, gy = H - 34;
  [['X', [1, 0, 0], '#e03131'], ['Y', [0, 1, 0], '#2f9e44'], ['Z', [0, 0, 1], '#1c7ed6']].forEach(([n, v, c]) => {
    const q = project(v);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + q.x * 22, gy + q.y * 22); ctx.stroke();
    ctx.fillStyle = c; ctx.font = '700 11px system-ui'; ctx.fillText(n, gx + q.x * 30, gy + q.y * 30);
  });
}

// ---------- Bearbeiten in den Ansichten ----------
// Anfasser = Schnittpunkte. Ziehen ändert nur den Schenkel davor, der Rest des Rohrs wandert mit.
// Richtung rastet auf 15° in der Bildebene, Länge auf 5 mm; ein Anteil quer zur Ansicht bleibt erhalten.
function ensureDeltas() {
  const p = proj();
  if (p.mode === 'deltas') return;
  p.deltas = toDeltas(p.legs);
  p.mode = 'deltas';
  renderInputs();
}
const norm360 = a => ((a % 360) + 360) % 360;
const dirArrow = a => ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][Math.round(norm360(a) / 45) % 8];
const legVec = i => { const pts = points(proj()); return V.sub(pts[i + 1], pts[i]); };

function legInView(v) {
  const { r, u } = screenAxes();
  const a = V.dot(v, r), b = V.dot(v, u);
  const c = V.sub(v, V.add(V.mul(r, a), V.mul(u, b)));
  return { a, b, c, len: V.len(v), inLen: Math.hypot(a, b), ang: Math.atan2(b, a) * 180 / Math.PI };
}
function setLegInView(i, inLen, angDeg, c) {
  const { r, u } = screenAxes(), t = angDeg * Math.PI / 180;
  const v = V.add(V.add(V.mul(r, inLen * Math.cos(t)), V.mul(u, inLen * Math.sin(t))), c);
  setDelta(i, v);
}

// Biegewinkel zwischen zwei Richtungen (Grad)
const bendDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) * 180 / Math.PI;
const onGrid = a => { const k = Math.round(a / ANGLE_STEP); return k >= 1 && Math.abs(a - k * ANGLE_STEP) < 0.05; };

// Richtung für Schenkel i so wählen, dass die Biegungen davor und danach im 15°-Raster liegen.
// Kandidaten: 15°-Richtungen in der Bildebene + exakte Lösungen für jeden Rasterwinkel zu beiden Nachbarn;
// gewählt wird der nächste zum Zeiger, Kandidaten mit Winkel außerhalb des Rasters bekommen einen Malus.
function snapDir(i, inLen, c, ptrDeg) {
  const pts = points(proj()), { r, u } = screenAxes();
  const prev = i > 0 ? V.sub(pts[i], pts[i - 1]) : null;
  const next = i + 2 < pts.length ? V.sub(pts[i + 2], pts[i + 1]) : null;
  const dirAt = t => V.add(V.add(V.mul(r, inLen * Math.cos(t)), V.mul(u, inLen * Math.sin(t))), c);
  const len = Math.hypot(inLen, V.len(c));
  const cands = Array.from({ length: 360 / ANGLE_STEP }, (_, k) => k * ANGLE_STEP * Math.PI / 180);
  for (const nb of [prev, next]) {
    if (!nb) continue;
    const n = V.norm(nb), A = inLen * V.dot(n, r), B = inLen * V.dot(n, u), C0 = V.dot(n, c), R = Math.hypot(A, B);
    if (R < 1e-9) continue;
    const phi = Math.atan2(B, A);
    for (let k = 1; k * ANGLE_STEP <= 180; k++) {
      const C = Math.cos(k * ANGLE_STEP * Math.PI / 180) * len - C0;
      if (Math.abs(C) <= R) { const d = Math.acos(C / R); cands.push(phi + d, phi - d); }
    }
  }
  let best = 0, bs = Infinity;
  for (const t of cands) {
    const d = dirAt(t);
    const pen = (prev && !onGrid(bendDeg(prev, d)) ? 10 : 0) + (next && !onGrid(bendDeg(d, next)) ? 10 : 0);
    const s = Math.abs(((t * 180 / Math.PI - ptrDeg) % 360 + 540) % 360 - 180) + pen;
    if (s < bs) { bs = s; best = t; }
  }
  return best * 180 / Math.PI;
}

function dragTo(clientX, clientY) {
  const a = drag.a0 + (clientX - drag.sx) / view.sc, b = drag.b0 - (clientY - drag.sy) / view.sc;
  if (!drag.committed) {
    if (Math.hypot(clientX - drag.sx, clientY - drag.sy) < 4) return;
    commit(null, drag.before); drag.committed = true;
  }
  const inLen = round5(Math.hypot(a, b));
  const ang = snapDir(drag.i, inLen, drag.c, Math.atan2(b, a) * 180 / Math.PI);
  setLegInView(drag.i, inLen, ang, drag.c);
  drag.label = { inLen, ang };
  recompute(true);
}
function endDrag() {
  const { i, committed, before } = drag;
  drag = null;
  if (!committed) Object.assign(proj(), before); // nur angetippt: auch den Moduswechsel zurücknehmen
  renderInputs(); recompute(); selectLeg(i);
}

function drawEditOverlay(P3, cAcc) {
  const pts = points(proj());
  if (sel >= pts.length - 1) sel = -1;
  const [sx, sy] = P3(pts[0]);
  ctx.fillStyle = cAcc; ctx.fillRect(sx - 5, sy - 5, 10, 10);
  const card = css('--card');
  pts.slice(1).forEach((q, k) => {
    const [x, y] = P3(q), on = drag?.i === k || sel === k;
    ctx.beginPath(); ctx.arc(x, y, on ? 11 : 9, 0, 7);
    ctx.fillStyle = on ? cAcc : card; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = cAcc; ctx.stroke();
  });
  if (drag?.label) {
    const i = drag.i, [x, y] = P3(pts[i + 1]);
    let t = `${fmt(drag.label.inLen)} mm`;
    const cur = V.sub(pts[i + 1], pts[i]);
    if (i > 0) t += ` · Biegung ${i}: ${fmt(bendDeg(V.sub(pts[i], pts[i - 1]), cur))}°`;
    if (i + 2 < pts.length) t += ` · Biegung ${i + 1}: ${fmt(bendDeg(cur, V.sub(pts[i + 2], pts[i + 1])))}°`;
    if (i === 0) t += ` · ${fmt(norm360(drag.label.ang))}° ${dirArrow(drag.label.ang)}`;
    ctx.font = '600 13px -apple-system, system-ui, sans-serif';
    const w = ctx.measureText(t).width + 16, bx = Math.min(Math.max(x - w / 2, 4), cv.clientWidth - w - 4), by = Math.max(y - 44, 4);
    ctx.fillStyle = cAcc; ctx.beginPath(); ctx.roundRect(bx, by, w, 24, 12); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(t, bx + 8, by + 12.5); ctx.textAlign = 'center';
  }
}

// Schenkel-Feld
const DIR_OPTS = Array.from({ length: 360 / ANGLE_STEP }, (_, k) => k * ANGLE_STEP);
// Auswahl zeigt den Gimbal; das Eingabefeld nur auf Wunsch („✎ Maße“)
function selectLeg(i, openPanel = false) {
  sel = i;
  $('#legPanel').hidden = !(openPanel && i >= 0);
  $('#addLegView').hidden = i < 0 || openPanel;
  if (openPanel && i >= 0) fillPanel();
  draw();
}
function fillPanel() {
  const pts = points(proj());
  if (sel < 0 || sel >= pts.length - 1) { selectLeg(-1); return; }
  const L = legInView(V.sub(pts[sel + 1], pts[sel]));
  $('#lpTitle').textContent = `Schenkel ${sel + 1}`;
  $('#lpDir').closest('label').hidden = !isOrtho(); // Richtung nur in Seitenansichten sinnvoll
  if (document.activeElement !== $('#lpLen')) $('#lpLen').value = fin(L.len);
  const perp = L.inLen < 0.05, cur = norm360(L.ang), onGridDir = DIR_OPTS.some(a => Math.abs(a - cur) < 0.05);
  $('#lpDir').innerHTML =
    (perp ? '<option value="" selected>⊙ quer zur Ansicht</option>' : !onGridDir ? `<option value="" selected>${fmt(cur)}° ${dirArrow(cur)}</option>` : '') +
    DIR_OPTS.map(a => `<option value="${a}"${!perp && Math.abs(a - cur) < 0.05 ? ' selected' : ''}>${a}° ${dirArrow(a)}</option>`).join('');
  const cl = V.len(L.c);
  $('#lpNote').textContent = perp ? 'Dieser Schenkel zeigt in die Ansicht hinein – in einer anderen Ansicht bearbeiten oder Richtung wählen.'
    : cl > 0.05 ? `Zusätzlich ${fmt(cl)} mm quer zur Ansicht (bleibt erhalten).` : '';
}
function afterViewEdit() { renderInputs(); recompute(); fillPanel(); }

$('#lpLen').addEventListener('input', e => {
  const len = num(e.target.value);
  if (!(len > 0) || sel < 0) return;
  commit('lpLen' + sel);
  ensureDeltas();
  const v = legVec(sel), l = V.len(v);
  const { r } = screenAxes();
  const n = l > 1e-6 ? V.mul(v, len / l) : V.mul(r, len);
  proj().deltas[sel] = { x: n[0], y: n[1], z: n[2] };
  afterViewEdit();
});
$('#lpDir').addEventListener('change', e => {
  if (e.target.value === '' || sel < 0) return;
  commit();
  ensureDeltas();
  const L = legInView(legVec(sel));
  if (L.inLen > 0.05) setLegInView(sel, L.inLen, +e.target.value, L.c);
  else setLegInView(sel, L.len, +e.target.value, [0, 0, 0]);
  afterViewEdit();
});
function insertLeg(at, fromLeg) {
  commit();
  ensureDeltas();
  const L = fromLeg >= 0 ? legInView(legVec(fromLeg)) : { inLen: 0, ang: 0 };
  const { r, u } = screenAxes(), t = ((L.inLen > 0.05 ? L.ang : 0) + 90) * Math.PI / 180;
  const v = V.add(V.mul(r, 100 * Math.cos(t)), V.mul(u, 100 * Math.sin(t)));
  proj().deltas.splice(at, 0, { x: v[0], y: v[1], z: v[2] });
  sel = at;
  afterViewEdit();
}
$('#lpIns').addEventListener('click', () => { if (sel >= 0) insertLeg(sel + 1, sel); });
$('#addLegView').addEventListener('click', () => selectLeg(sel, true));
$('#lpDel').addEventListener('click', () => {
  commit();
  ensureDeltas();
  const p = proj();
  if (sel < 0 || p.deltas.length < 2) return;
  p.deltas.splice(sel, 1);
  renderInputs(); recompute(); selectLeg(-1);
});
$('#lpClose').addEventListener('click', () => selectLeg(sel));

// ---------- Gimbal ----------
// Rohrende: ein Griff. Beim Ziehen folgt die Richtung laufend dem Zeiger (geradeaus, zurück = kürzen,
// oder eine der Richtungen im rechten Winkel); unter 18 px Bewegung passiert nichts.
// Gewählter Schenkel: oranger Ring = Biegewinkel, grüner Ring = Drehung um den vorigen Schenkel,
// Pfeil am Ende = Länge. Bei Winkel und Drehung dreht der Rest des Rohrs mit wie beim echten Biegen.
const C_BEND = '#e8590c', C_ROT = '#0ca678';
const AXIS_COL = ['#e03131', '#2f9e44', '#1c7ed6'];
const axisColor = v => AXIS_COL[[0, 1, 2].reduce((m, k) => (Math.abs(v[k]) > Math.abs(v[m]) ? k : m), 0)];
const round5 = (v, min = 10) => Math.max(min, Math.round(v / 5) * 5);
const deltaVec = d => [d.x || 0, d.y || 0, d.z || 0];
const EXT_DEAD = 18; // px
let gizmo = [], gz = null;

function setDelta(i, v) {
  const z = c => (Math.abs(c) < 1e-9 ? 0 : c);
  proj().deltas[i] = { x: z(v[0]), y: z(v[1]), z: z(v[2]) };
}

// Richtungen zum Fortführen: liegt der letzte Schenkel auf einer Achse, die Weltachsen, sonst ein Rahmen
// senkrecht dazu (eine Richtung möglichst „oben“). So entstehen immer 90°-Biegungen.
function extDirs(last) {
  if (Math.max(...last.map(Math.abs)) > 0.9999) {
    return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].filter(a => V.dot(a, last) > -0.999);
  }
  let u = V.sub([0, 0, 1], V.mul(last, last[2]));
  u = V.len(u) < 1e-6 ? [1, 0, 0] : V.norm(u);
  const w = V.cross(last, u);
  return [last, u, V.mul(u, -1), w, V.mul(w, -1)];
}

// Kleinste sinnvolle Längen: neuer Endschenkel = Tangente (90° → R) + Mindest-Gerade
function minLengths() {
  const f = prof(), lastT = layout?.bends.at(-1)?.T || 0;
  const up5 = v => Math.max(10, Math.ceil(v / 5 - 1e-9) * 5); // aufrunden, sonst fehlt am Ende 1 mm
  return { newLeg: up5(f.R + f.minStraight), lastLeg: up5(lastT + f.minStraight) };
}

function ringBasis(i, pts) {
  const p = V.norm(V.sub(pts[i], pts[i - 1])), d = V.norm(V.sub(pts[i + 1], pts[i]));
  let q = V.sub(d, V.mul(p, V.dot(d, p)));
  if (V.len(q) < 1e-6) q = Math.abs(p[2]) < 0.9 ? V.cross(p, [0, 0, 1]) : V.cross(p, [1, 0, 0]);
  q = V.norm(q);
  return { p, q, w: V.cross(p, q), theta: bendDeg(p, d) };
}

function arrow(x0, y0, x1, y1, color, w) {
  const l = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / l, uy = (y1 - y0) / l;
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * 10, y1 - uy * 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * 14 - uy * 7, y1 - uy * 14 + ux * 7); ctx.lineTo(x1 - ux * 14 + uy * 7, y1 - uy * 14 - ux * 7);
  ctx.closePath(); ctx.fill();
}
function polyline(pts, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function knob(x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
}
const ringPts = (A, a, b, r, from, to, step) => {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const s = t * Math.PI / 180;
    out.push(view.P3(V.add(A, V.mul(V.add(V.mul(a, Math.cos(s)), V.mul(b, Math.sin(s))), r))));
  }
  return out;
};
function pill(text, x, y, color) {
  ctx.font = '600 13px -apple-system, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 16;
  // fester Platz unten mittig – wird nie von Fingern, Buttons oder Rohr verdeckt
  const bx = (cv.clientWidth - w) / 2, by = cv.clientHeight - 64;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(bx, by, w, 24, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 8, by + 12.5); ctx.textAlign = 'center';
}

// Richtungen am Rohrende samt Bildschirmrichtung (px je mm); Richtungen, die in den Bildschirm zeigen, fallen weg
function extCandidates(E, d) {
  const [ex, ey] = view.P3(E);
  const all = [...extDirs(d), V.mul(d, -1)].map(a => {
    const [x, y] = view.P3(V.add(E, a));
    return { a, sx: x - ex, sy: y - ey, straight: Math.abs(V.dot(a, d)) > 0.9999 };
  });
  const max = Math.max(...all.map(c => Math.hypot(c.sx, c.sy)));
  return all.filter(c => Math.hypot(c.sx, c.sy) >= 0.3 * max);
}

function drawGizmo() {
  gizmo = [];
  const pts = points(proj()), n = pts.length - 1, sc = view.sc, P3 = view.P3, cAcc = css('--accent');
  if (n < 1) return;
  if (sel >= n) sel = -1;

  if (sel >= 0) { // gewählten Schenkel hervorheben
    const [ax, ay] = P3(pts[sel]), [bx, by] = P3(pts[sel + 1]);
    ctx.save(); ctx.globalAlpha = 0.3; polyline([[ax, ay], [bx, by]], cAcc, 16); ctx.restore();
  }

  // Fortführen: Hilfspfeile (blass, beim Ziehen die gewählte Richtung kräftig) + Griff am Ende
  if (!gz || gz.type === 'ext') {
    const E = gz ? gz.E : pts[n], d = gz ? gz.d : V.norm(V.sub(pts[n], pts[n - 1]));
    const [ex, ey] = P3(E);
    for (const c of extCandidates(E, d)) {
      if (V.dot(c.a, d) < -0.9999) continue; // „zurück“ nicht anzeigen, wirkt aber beim Ziehen (kürzen)
      const l = Math.hypot(c.sx, c.sy), ux = c.sx / l, uy = c.sy / l, active = gz?.choice === c.a;
      ctx.save(); ctx.globalAlpha = gz ? (active ? 1 : 0.18) : 0.55;
      arrow(ex + ux * 16, ey + uy * 16, ex + ux * 58, ey + uy * 58, axisColor(c.a), c.straight ? 4 : 3);
      ctx.restore();
      if (!gz) gizmo.push({ type: 'ext', a: c.a, seg: [ex + ux * 16, ey + uy * 16, ex + ux * 58, ey + uy * 58] });
    }
    if (!gz) {
      knob(ex, ey, 11, cAcc);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ex - 5, ey); ctx.lineTo(ex + 5, ey); ctx.moveTo(ex, ey - 5); ctx.lineTo(ex, ey + 5); ctx.stroke();
      gizmo.push({ type: 'ext', at: [ex, ey], r: 22 });
    }
  }

  // Ringe am Biegepunkt des gewählten Schenkels
  if (sel >= 1 && (!gz || gz.type === 'bend' || gz.type === 'rot')) {
    const i = sel, A = pts[i], { p, q, w, theta } = ringBasis(i, pts);
    if (!gz || gz.type === 'rot') {
      const ring = ringPts(A, q, w, 40 / sc, 0, 360, 4);
      ctx.save(); ctx.globalAlpha = 0.85; polyline(ring, C_ROT, 3); ctx.restore();
      knob(...ring[0], 8, C_ROT);
      gizmo.push({ type: 'rot', i, poly: ring });
    }
    if (!gz || gz.type === 'bend') {
      const arc = ringPts(A, p, q, 66 / sc, 0, 180, 3);
      ctx.save(); ctx.globalAlpha = 0.9; polyline(arc, C_BEND, 3); ctx.restore();
      ringPts(A, p, q, 66 / sc, ANGLE_STEP, 180 - ANGLE_STEP, ANGLE_STEP).forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fillStyle = C_BEND; ctx.fill(); });
      knob(...ringPts(A, p, q, 66 / sc, theta, theta, 1)[0], 9, C_BEND);
      gizmo.push({ type: 'bend', i, poly: arc });
    }
  }

  // Längenpfeil am Ende eines inneren Schenkels (am Rohrende macht das der Griff)
  if (sel >= 0 && sel < n - 1 && (!gz || gz.type === 'len')) {
    const B = pts[sel + 1], d = V.norm(V.sub(B, pts[sel])), L = 34 / sc;
    const [bx, by] = P3(B), [tx, ty] = P3(V.add(B, V.mul(d, L)));
    if (Math.hypot(tx - bx, ty - by) > 12) {
      arrow(bx, by, tx, ty, cAcc, 3);
      gizmo.push({ type: 'len', i: sel, seg: [bx, by, tx, ty], pxPerMm: [(tx - bx) / L, (ty - by) / L] });
    }
  }

  if (gz?.label) pill(gz.label, gz.px, gz.py, gz.type === 'bend' ? C_BEND : gz.type === 'rot' ? C_ROT : cAcc);
}

function segDist(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)) : 0;
  return Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
}
function hitGizmo(x, y) {
  let best = null, bd = 16;
  for (const g of gizmo) {
    let d = Infinity;
    if (g.at) d = Math.hypot(x - g.at[0], y - g.at[1]) - g.r + 6; // Griff hat Vorrang
    else if (g.seg) d = segDist(x, y, ...g.seg) - 3;
    else for (let k = 1; k < g.poly.length; k++) d = Math.min(d, segDist(x, y, ...g.poly[k - 1], ...g.poly[k]));
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function gzStart(g, e) {
  const p = proj(), [lx, ly] = local(e);
  const before = snapshot(p);
  ensureDeltas();
  const pts = points(p), n = pts.length - 1;
  gz = { ...g, before, committed: false, sx: e.clientX, sy: e.clientY, px: lx, py: ly, moved: false, orig: structuredClone(p.deltas), label: '' };
  fit = lastBase;
  if (g.type === 'ext') {
    gz.E = pts[n]; gz.d = V.norm(V.sub(pts[n], pts[n - 1])); gz.L0 = V.len(V.sub(pts[n], pts[n - 1]));
    gz.Es = view.P3(gz.E); gz.min = minLengths();
  } else if (g.type === 'len') {
    gz.idx = g.i; gz.dir = V.norm(legVec(g.i)); gz.L0 = V.len(legVec(g.i));
  } else {
    Object.assign(gz, ringBasis(g.i, pts), { A: pts[g.i], r: (g.type === 'bend' ? 66 : 40) / view.sc });
  }
}
// Erst bei der ersten echten Änderung in den Verlauf schreiben
function gzChanged() {
  if (!gz.committed) { commit(null, gz.before); gz.committed = true; }
}

// Ring: nächsten Punkt auf dem projizierten Ring zum Zeiger suchen (funktioniert auch bei schräg gesehenen Ringen)
function ringAngle(a, b, from, to, x, y) {
  let best = from, bd = Infinity;
  for (let t = from; t <= to; t += 1) {
    const s = t * Math.PI / 180, [px, py] = view.P3(V.add(gz.A, V.mul(V.add(V.mul(a, Math.cos(s)), V.mul(b, Math.sin(s))), gz.r)));
    const d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function rotateTail(axis, deg) {
  const a = deg * Math.PI / 180;
  proj().deltas = gz.orig.map((d, k) => (k < gz.i ? { ...d } : null));
  gz.orig.forEach((d, k) => { if (k >= gz.i) setDelta(k, rotAbout(deltaVec(d), axis, a)); });
}

function extMove(lx, ly) {
  const p = proj(), vx = lx - gz.Es[0], vy = ly - gz.Es[1], vl = Math.hypot(vx, vy);
  p.deltas = structuredClone(gz.orig);
  gz.choice = null;
  if (vl < EXT_DEAD) { gz.label = 'Loslassen = nichts ändern'; return; }
  // Richtung, die am besten zur Zeigerrichtung passt – wird bei jeder Bewegung neu bestimmt
  let best = null, bs = -Infinity;
  for (const c of extCandidates(gz.E, gz.d)) {
    const s = (vx * c.sx + vy * c.sy) / (vl * Math.hypot(c.sx, c.sy));
    if (s > bs) { bs = s; best = c; }
  }
  gzChanged();
  gz.choice = best.a;
  const last = p.deltas.length - 1;
  if (best.straight) {
    // geradeaus länger, zurück kürzer: Projektion auf die Schenkelrichtung (vorzeichenbehaftet)
    const sx = best.sx * Math.sign(V.dot(best.a, gz.d)), sy = best.sy * Math.sign(V.dot(best.a, gz.d));
    const L = round5(gz.L0 + (vx * sx + vy * sy) / (sx * sx + sy * sy), gz.min.lastLeg);
    setDelta(last, V.mul(gz.d, L));
    gz.label = `Schenkel ${last + 1}: ${fmt(L)} mm`;
  } else {
    const L = round5((vx * best.sx + vy * best.sy) / (best.sx * best.sx + best.sy * best.sy), gz.min.newLeg);
    p.deltas.push({ x: 0, y: 0, z: 0 });
    setDelta(last + 1, V.mul(best.a, L));
    gz.label = `Neuer Schenkel ${fmt(L)} mm · 90°`;
  }
}

function gzMove(e) {
  const dx = e.clientX - gz.sx, dy = e.clientY - gz.sy, [lx, ly] = local(e);
  if (Math.hypot(dx, dy) > 4) gz.moved = true;
  gz.px = lx; gz.py = ly;
  if (gz.type === 'ext') {
    extMove(lx, ly);
  } else if (gz.type === 'len') {
    if (!gz.moved) return;
    gzChanged();
    const [mx, my] = gz.pxPerMm, L = round5(gz.L0 + (dx * mx + dy * my) / (mx * mx + my * my));
    setDelta(gz.idx, V.mul(gz.dir, L));
    gz.label = `${fmt(L)} mm`;
  } else if (gz.type === 'bend') {
    const t = ringAngle(gz.p, gz.q, 0, 180, lx, ly);
    const a = Math.min(180 - ANGLE_STEP, Math.max(ANGLE_STEP, Math.round(t / ANGLE_STEP) * ANGLE_STEP));
    if (Math.abs(a - gz.theta) > 0.01 || gz.committed) { gzChanged(); rotateTail(V.norm(V.cross(gz.p, gz.q)), a - gz.theta); }
    gz.label = `Biegung ${gz.i}: ${a}°`;
  } else {
    const t = normRot(Math.round(ringAngle(gz.q, gz.w, 0, 359, lx, ly) / ANGLE_STEP) * ANGLE_STEP);
    if (t !== 0 || gz.committed) { gzChanged(); rotateTail(gz.p, t); }
    gz.label = `Drehung ${t > 0 ? '+' : ''}${t}°`;
  }
  recompute(true);
}
function gzEnd() {
  const g = gz, p = proj();
  gz = null;
  // Antippen eines Hilfspfeils = neuer Schenkel in diese Richtung
  if (g.type === 'ext' && !g.moved && g.a) {
    commit(null, g.before);
    p.deltas = structuredClone(g.orig);
    const last = V.dot(g.a, g.d) > 0.9999;
    if (last) setDelta(p.deltas.length - 1, V.mul(g.d, g.L0 + 50));
    else { p.deltas.push({ x: 0, y: 0, z: 0 }); setDelta(p.deltas.length - 1, V.mul(g.a, Math.max(100, g.min.newLeg))); }
  } else if (!g.committed) {
    Object.assign(p, g.before); // nichts geändert: auch den Moduswechsel zurücknehmen
  }
  if (!isOrtho()) fit = null; // in 3D nach dem Loslassen neu einpassen
  renderInputs(); recompute();
  // Nach dem Fortführen nichts auswählen, damit gleich weitergezogen werden kann
  selectLeg(g.type === 'ext' ? -1 : g.idx ?? g.i);
}

// ---------- Zeiger ----------
// Gimbal hat Vorrang. Iso: ziehen = drehen. Ortho: Anfasser ziehen = bearbeiten, Hintergrund ziehen = verschieben.
// Schenkel antippen = auswählen.
// Überall: zwei Finger / Shift / Rechtsklick = verschieben, Pinch/Rad = zoomen zum Zeiger.
const ptrs = new Map();
function zoomAt(clientX, clientY, ratio) {
  const r = cv.getBoundingClientRect(), z = Math.max(0.3, Math.min(20, cam.zoom * ratio));
  ratio = z / cam.zoom;
  const ox = clientX - r.left - r.width / 2, oy = clientY - r.top - r.height / 2;
  cam.panX = ox - (ox - cam.panX) * ratio; cam.panY = oy - (oy - cam.panY) * ratio;
  cam.zoom = z;
}
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function hitVertex(x, y) {
  const pts = points(proj());
  for (let i = pts.length - 1; i >= 1; i--) { const [px, py] = view.P3(pts[i]); if (Math.hypot(px - x, py - y) < 22) return i - 1; }
  return -1;
}
function hitLeg(x, y) {
  const pts = points(proj());
  let best = -1, bd = 18;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(x, y, ...view.P3(pts[i]), ...view.P3(pts[i + 1]));
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('lostpointercapture', e => ptrs.delete(e.pointerId));
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') ptrs.clear(); // Maus hat nur einen Zeiger – hängengebliebene Einträge verwerfen
  try { cv.setPointerCapture(e.pointerId); } catch {} // synthetische Testereignisse haben keinen echten Zeiger
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.shiftKey || e.button === 2 || isOrtho() });
  if (ptrs.size === 1 && view) {
    const [lx, ly] = local(e), g = hitGizmo(lx, ly);
    if (g) { gzStart(g, e); return; }
    const i = isOrtho() ? hitVertex(lx, ly) : -1;
    if (i >= 0) {
      const before = snapshot(proj());
      ensureDeltas();
      const L = legInView(legVec(i));
      drag = { i, sx: e.clientX, sy: e.clientY, a0: L.a, b0: L.b, c: L.c, label: null, before, committed: false };
      fit = lastBase;
    }
  } else if (ptrs.size === 2) { if (drag) endDrag(); if (gz) gzEnd(); }
});
cv.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) return;
  if (gz && ptrs.size === 1) { gzMove(e); return; }
  if (drag && ptrs.size === 1) { dragTo(e.clientX, e.clientY); return; }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  if (ptrs.size === 1 && prev.pan) { cam.panX += dx; cam.panY += dy; }
  else if (ptrs.size === 1) {
    cam.yaw += dx * 0.01;
    cam.pitch = Math.max(-H90, Math.min(H90, cam.pitch + dy * 0.01));
  } else if (ptrs.size === 2) {
    const other = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    cam.panX += dx / 2; cam.panY += dy / 2;
    if (d0 > 0) zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, d1 / d0);
  }
  ptrs.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
  draw();
});
cv.addEventListener('pointerup', e => {
  const pt = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gz) { gzEnd(); return; }
  if (drag) { endDrag(); return; }
  if (pt && ptrs.size === 0 && view && Math.hypot(e.clientX - pt.x0, e.clientY - pt.y0) < 6) {
    const [lx, ly] = local(e);
    selectLeg(hitLeg(lx, ly));
  }
});
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (gz) gzEnd(); if (drag) endDrag(); });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); draw(); }, { passive: false });
$('.viewbtns').addEventListener('click', e => { const v = e.target.closest('button')?.dataset.view; if (v) resetView(v); });
new ResizeObserver(() => draw()).observe($('#viewwrap'));
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => draw());

// ---------- Reiter ----------
$('.tabbar').addEventListener('click', e => {
  const t = e.target.closest('button')?.dataset.tab;
  if (!t) return;
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'tools') renderTools();
  window.scrollTo(0, 0);
  draw();
});

// Testzugang nur mit ?debug in der Adresse
if (new URLSearchParams(location.search).has('debug')) {
  window.biegeDebug = { get gizmo() { return gizmo; }, get view() { return view; }, get layout() { return layout; }, proj, points, resetView };
}

function fullRender() { sel = -1; lastKey = null; updateUndoButtons(); $('#legPanel').hidden = $('#addLegView').hidden = true; renderProjectBar(); renderInputs(); recompute(); }
fullRender();
resetView('iso');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
