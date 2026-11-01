import { roomPlanes, planeDist, planeHits, autoClamps, clampInfo, drillCoords, bundleGeometry, pipeGap, parallelPoints, sideDir, straightRuns, cutPlan, triangulate, cleanOutline, signedArea, pointInPoly, wallLetter } from './site.js';
import { pointsFromDeltas, pointsFromAngles, computeLayout, pointAt, V, rotAbout, selfCollisions } from './geometry.js';

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

// Zangenmarken (fest): k = Abstand Bleistiftstrich -> Biegeanfang, side = wo der gemessene Teil liegt.
// 0 = Biegeanfang, L/R = Schnittpunkt bei 90° (k = R).
const marksOf = f => [
  { name: '0', k: 0, side: 'links' },
  { name: 'L', k: f.R, side: 'links' },
  { name: 'R', k: f.R, side: 'rechts' },
];
function defaultProfiles() {
  return [
    { ...CLAMP_DEFAULTS, id: 'es6', name: 'Edelstahl 6 mm', D: 6, R: 16, minStraight: 20 },
    { ...CLAMP_DEFAULTS, id: 'es8', name: 'Edelstahl 8 mm', D: 8, R: 24, minStraight: 25 },
  ];
}
// Schellen-Regeln je Profil: größter Abstand, kleinster Abstand auf einer Geraden, Abstand zum Bogen bzw. Rohrende,
// Schellenhöhe (Untergrund → Rohrmitte), Stangenlänge
const CLAMP_DEFAULTS = { clampMax: 600, clampMin: 300, clampBend: 80, clampEnd: 80, clampH: 20, stock: 6000 };
// Felder, die spätere Versionen ergänzt haben. roomId = Raum (db.rooms), bundle = Parallelrohre { id, side 0–3, dist }
// bundleTx = Lagewechsel des Bündels an Biegungen { bend, rot ±1, where 'before'|'after', ang, gap }
// endFixed = Rohrende bleibt beim Ändern von Längen/Winkeln im Raum stehen (Ausgleich über freie Schenkel)
// startFixed = Rohranfang bleibt stehen; ist er lose und das Ende fest, wandert das ganze Rohr, bis das Ende wieder stimmt
const PROJECT_DEFAULTS = { origin: [0, 0, 0], frame: null, roomId: null, bundle: [], bundleTx: [], target: null, clamps: [], clampMode: 'auto', endFixed: false, startFixed: true, hidden: false, color: null, sceneId: null, refs: null, unrouted: false };

// Bis Version 14 hatte jedes Rohr eigene, unbegrenzte Flächen → daraus einen rechteckigen Raum machen
function roomFromPlanes(p) {
  const pts = p.mode === 'deltas' ? pointsFromDeltas(p.deltas, p.origin || [0, 0, 0]) : pointsFromAngles(p.legs, p.frame, p.origin || [0, 0, 0]);
  const mn = [0, 1, 2].map(k => Math.min(...pts.map(q => q[k]))), mx = [0, 1, 2].map(k => Math.max(...pts.map(q => q[k])));
  const get = k => p.planes.find(pl => pl.kind === k);
  const x0 = get('left')?.c ?? mn[0] - 500, x1 = get('right')?.c ?? mx[0] + 500;
  const y0 = get('front')?.c ?? mn[1] - 1500, y1 = get('back')?.c ?? mx[1] + 500;
  const z0 = get('floor')?.c ?? mn[2] - 1000, z1 = get('ceil')?.c ?? Math.max(z0 + 2500, mx[2] + 300);
  return {
    id: uid(), name: `Raum ${p.name}`, outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, height: z1 - z0,
    pass: { 0: !!get('front')?.pass, 1: !!get('right')?.pass, 2: !!get('back')?.pass, 3: !!get('left')?.pass },
  };
}

// Ältere Daten auf den aktuellen Stand bringen
function migrate(d) {
  d.rooms ||= []; d.scenes ||= [];
  d.projects.forEach(p => {
    for (const [k, v] of Object.entries(PROJECT_DEFAULTS)) if (p[k] === undefined) p[k] = structuredClone(v);
    p.bundleTx = p.bundleTx.filter(t => !t.flip); p.bundle.forEach(b => delete b.mode); // verworfene Versuche
    if (p.planes?.length && !p.roomId) { const r = roomFromPlanes(p); d.rooms.push(r); p.roomId = r.id; }
    // Eingabe „Winkel & Drehung“ entfällt: in Richtungen umrechnen, Lage im Raum bleibt (frame)
    if (p.mode === 'angles') { p.deltas = toDeltas(p.legs, p.frame); p.mode = 'deltas'; }
    if (!p.deltas?.length) p.deltas = [{ x: 500, y: 0, z: 0 }]; // leere Rohre (Version 29/30) bekommen einen geraden Anfang
    delete p.planes; delete p.group; // Rohrgruppen entfallen: Parallelrohre gehören jetzt zum Rohr (bundle)
  });
  d.profiles.forEach(f => { for (const [k, v] of Object.entries(CLAMP_DEFAULTS)) if (f[k] === undefined) f[k] = v; });
  // Startpunkt ohne ersten Schenkel: Der Befehl wurde nicht beendet
  if (d.projects.some(p => p.stub)) {
    const cur = d.projects.find(p => p.id === d.currentId);
    d.projects = d.projects.filter(p => !p.stub);
    if (cur?.stub) d.currentId = (d.projects.find(p => p.sceneId === cur.sceneId) || d.projects[0]).id;
  }
  // Szene = mehrere Rohre an einem Ort; ältere Projekte werden Szenen mit einem Rohr
  d.projects.forEach(p => {
    if (d.scenes.some(s => s.id === p.sceneId)) return;
    const sc = { id: uid(), name: p.name, planes: [] };
    d.scenes.push(sc); p.sceneId = sc.id;
  });
  d.scenes = d.scenes.filter(s => d.projects.some(p => p.sceneId === s.id));
  // Das erste Rohr neuer Projekte hieß früher „Projekt N“: einmalig nach seiner Position benennen
  if (!d.pipeNames) {
    d.scenes.forEach(s => {
      const pipes = d.projects.filter(p => p.sceneId === s.id);
      pipes.forEach((p, i) => {
        if (!/^Projekt \d+$/.test(p.name)) return;
        let n = i + 1;
        while (pipes.some(o => o.name === `Rohr ${n}`)) n++;
        p.name = `Rohr ${n}`;
      });
    });
    d.pipeNames = true;
  }
  // Marken, Kalibrierung und Rückfederung gibt es nicht mehr
  d.profiles.forEach(f => { ['marks', 'pref', 'springback', 'k', 'mark', 'insert', 'calibrated'].forEach(k => delete f[k]); });
  // Standardradius 6 mm ist 16 mm (früher 15): einmalig nachziehen, solange die Vorgabe nicht geändert wurde
  if (!d.r16) { d.profiles.forEach(f => { if (f.id === 'es6' && f.R === 15) f.R = 16; }); d.r16 = true; }
  return d;
}

// 90° mit L (Strich = Schnittpunkt), sonst 0
function pickMark(f, angle) {
  const [m0, mL] = marksOf(f);
  return Math.abs(angle - 90) < 0.5 ? mL : m0;
}
function newProject(profileId, name) {
  return {
    id: uid(), name, profileId, mode: 'deltas', zugA: 0, zugE: 0, done: {}, ...structuredClone(PROJECT_DEFAULTS),
    // gerader Anfang: ersten Schenkel aufmessen, dann weiterführen
    deltas: [{ x: 500, y: 0, z: 0 }],
    legs: [{ len: 500 }],
  };
}
function seed() {
  const profiles = defaultProfiles();
  const p = newProject(profiles[0].id, 'Rohr 1');
  return migrate({ profiles, projects: [p], rooms: [], currentId: p.id, r16: true });
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE)); if (d?.profiles?.length && d?.projects?.length) return migrate(d); } catch {}
  return seed();
}
let db = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch {} };
const proj = () => db.projects.find(p => p.id === db.currentId) || db.projects[0];
const prof = (p = proj()) => db.profiles.find(x => x.id === p.profileId) || db.profiles[0];
const scene = (p = proj()) => db.scenes.find(s => s.id === p.sceneId);
const scenePipes = (p = proj()) => db.projects.filter(q => q.sceneId === p.sceneId);
// Neues Rohr in eine Szene legen; ohne Angabe bekommt es eine eigene Szene
function addPipe(p, sceneId = null, sceneName = p.name) {
  if (!sceneId) { const sc = { id: uid(), name: sceneName, planes: [] }; db.scenes.push(sc); sceneId = sc.id; }
  p.sceneId = sceneId; db.projects.push(p); db.currentId = p.id;
  return p;
}
const roomOf = (p = proj()) => db.rooms.find(r => r.id === p.roomId) || null;
// Labor: Raum, Schellen und Ziel sind Experimente – nur sichtbar und wirksam, wenn eingeschaltet.
// Die Daten bleiben beim Ausschalten erhalten, werden aber nicht gerechnet und nicht gezeichnet.
let lab = false;
try { lab = localStorage.getItem('biege.lab') === '1'; } catch {}
document.body.classList.toggle('lab', lab);
const activeRoom = (p = proj()) => (lab ? roomOf(p) : null);
// Achs-Schnittpunkte in Raumkoordinaten; origin = Lage des Rohranfangs, frame = Ausrichtung im Winkel-Modus
const points = p => (p.mode === 'deltas' ? pointsFromDeltas(p.deltas, p.origin) : pointsFromAngles(p.legs, p.frame, p.origin));

// Lagewechsel hängen an Biegungsnummern: beim Einfügen/Löschen von Schenkeln mitschieben
function txInsertLegs(p, at, count) { (p.bundleTx || []).forEach(t => { if (t.bend >= at) t.bend += count; }); }
function txDeleteLeg(p, i) {
  p.bundleTx = (p.bundleTx || []).filter(t => t.bend !== i - 1 && t.bend !== i);
  p.bundleTx.forEach(t => { if (t.bend > i) t.bend--; });
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks.at(-1)] = val;
}

// Modus wechseln: Geometrie in die andere Darstellung umrechnen
function toDeltas(legs, frame = null) {
  const pts = pointsFromAngles(legs, frame);
  const z = v => (Math.abs(v) < 1e-9 ? 0 : v); // Rundungsreste der Winkelrechnung entfernen
  return pts.slice(1).map((q, i) => ({ x: z(q[0] - pts[i][0]), y: z(q[1] - pts[i][1]), z: z(q[2] - pts[i][2]) }));
}
const TEMPLATES = {
  w90: [{ len: 150, angle: 90, rot: 0 }, { len: 150 }],
  u: [{ len: 150, angle: 90, rot: 0 }, { len: 80, angle: 90, rot: 0 }, { len: 150 }],
  d3: [{ len: 150, angle: 90, rot: 0 }, { len: 200, angle: 90, rot: 90 }, { len: 150 }],
};

// ---------- Rückgängig / Wiederholen ----------
// Verlauf je Projekt (nur im Speicher). commit() VOR jeder Änderung aufrufen; Tippen im selben Feld
// innerhalb von 1,5 s wird zu einem Schritt zusammengefasst.
const hist = { undo: [], redo: [] };
const snapshot = () => structuredClone({ projects: db.projects, scenes: db.scenes, rooms: db.rooms, currentId: db.currentId });
// Stand wiederherstellen; vorhandene Objekte bleiben dieselben, damit laufende Griffe ihre Bezüge behalten
function restoreSnapshot(snap) {
  const s = structuredClone(snap);
  const merge = (list, items) => items.map(o => {
    const q = list.find(x => x.id === o.id);
    if (!q) return o;
    Object.keys(q).forEach(k => { if (!(k in o)) delete q[k]; });
    return Object.assign(q, o);
  });
  db.projects = merge(db.projects, s.projects); db.scenes = merge(db.scenes, s.scenes); db.rooms = merge(db.rooms, s.rooms);
  db.currentId = s.currentId;
}
let lastKey = null, lastTime = 0;
function commit(key = null, snap = null) {
  const now = Date.now();
  if (key && key === lastKey && now - lastTime < 1500) { lastTime = now; return; }
  lastKey = key; lastTime = now;
  hist.undo.push(snap || snapshot());
  if (hist.undo.length > 100) hist.undo.shift();
  hist.redo = [];
  updateUndoButtons();
}
// Rückgängig nimmt immer den letzten Befehl zurück, egal an welchem Rohr oder Projekt er lief
function undoRedo(dir) {
  const from = dir < 0 ? hist.undo : hist.redo, to = dir < 0 ? hist.redo : hist.undo;
  if (!from.length || gz || drag || inCmd()) return;
  const pid0 = db.currentId, sc0 = proj().sceneId;
  to.push(snapshot());
  restoreSnapshot(from.pop());
  lastKey = null;
  const p = proj();
  if (p.id !== pid0) {
    fullRender();
    if (p.sceneId !== sc0) resetView();
    return;
  }
  refit();
  renderProjectBar(); renderInputs(); recompute();
  const keepPlane = selPlane && scene(p).planes.some(x => x.id === selPlane) ? selPlane : null, keepPoint = selPoint && pipeById(selPoint.pid) ? selPoint : null;
  selectLeg(sel < points(p).length - 1 ? sel : -1);
  if (keepPlane) selectPlane(keepPlane); else if (keepPoint) selectPoint(keepPoint.pid, keepPoint.w);
  updateUndoButtons();
}
function updateUndoButtons() {
  $('#undoBtn').disabled = !hist.undo.length;
  $('#redoBtn').disabled = !hist.redo.length;
}
// Die App selbst zoomt nie: Pinch wirkt nur in der 3D-Ansicht
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
// Menü hinter den drei Strichen
$('#menuBtn').addEventListener('click', () => { $('#menuPop').hidden = !$('#menuPop').hidden; });
// Offene Menüs: Ein Klick außerhalb schließt sie und wirkt sonst nicht. Daneben steht, was das Menü nicht schließt
const MENUS = [['#menuPop', '#menuBtn'], ['#visPop', '#visBtn'], ['#addPop', '#addBtn'], ['#planePop', '#addPlane'], ['#browser', '#treeBtn, #undoBtn, #redoBtn']];
let eatClick = false;
document.addEventListener('pointerdown', e => {
  const t = e.target;
  eatClick = false;
  if (t.closest?.('.modal, .dimbox')) return;
  for (const [m, keep] of MENUS) {
    if (!$(m).getClientRects().length || t.closest?.(`${m}, ${keep}`)) continue;
    if (m === '#browser') { treeCol = treeMenu = null; setBrowser(false); } else $(m).hidden = true;
    eatClick = true;
  }
  if (!treeEdit && (treeCol || treeMenu) && t.closest?.('#browser') && !t.closest('.tcols, .tacts, [data-tc], [data-tm]')) { treeCol = treeMenu = null; renderBrowser(); eatClick = true; }
  if (eatClick) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('click', e => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
// Eigene Rückfrage: confirm() ist in manchen Umgebungen abgeschaltet und sieht überall anders aus
function ask(msg, ok = 'Löschen') {
  const dlg = $('#askDlg'), yes = $('#askYes'), no = $('#askNo');
  $('#askMsg').textContent = msg; yes.textContent = ok; yes.classList.toggle('mdanger', ok === 'Löschen'); dlg.hidden = false;
  return new Promise(res => {
    const done = v => { dlg.hidden = true; yes.onclick = no.onclick = dlg.onclick = null; res(v); };
    yes.onclick = () => done(true); no.onclick = () => done(false);
    dlg.onclick = e => { if (e.target === dlg) done(false); };
  });
}
$('#undoBtn').addEventListener('click', () => undoRedo(-1));
$('#redoBtn').addEventListener('click', () => undoRedo(1));
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.target.matches?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  else if (k === 'y') { e.preventDefault(); undoRedo(1); }
});

// ---------- Eingabe ----------
let layout = null, highlight = -1;

const ANGLE_STEP = 15;
function signed(path, val) {
  return `<span class="sgn"><button type="button" class="sgbtn" data-sign="${path}" aria-label="Vorzeichen">${val < 0 ? '−' : '+'}</button>` +
    `<input inputmode="decimal" data-p="${path}" data-signed value="${fin(Math.abs(val || 0))}" placeholder="0"></span>`;
}

// Projektliste im Menü; ⋮ klappt Aktionen unter der Zeile auf, Umbenennen geschieht direkt in der Zeile
let projMenu = null, projEdit = null;
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
function renderProjectBar() {
  if (projEdit) return;
  const p = proj();
  $('#projSel').innerHTML = db.scenes.map(x => {
    const on = x.id === p.sceneId;
    return `<div class="mrow"><button class="mi${on ? ' on' : ''}" data-sc="${x.id}"><span class="mname">${esc(x.name)}</span>${on ? CHECK : ''}</button><button class="mmore" data-ctx="${x.id}" title="Aktionen" aria-label="Aktionen für ${esc(x.name)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></button></div>${projMenu === x.id ? `<div class="mctx"><button class="mi" data-ca="ren" data-id="${x.id}">Umbenennen</button><button class="mi" data-ca="dup" data-id="${x.id}">Duplizieren</button><button class="mi mdanger" data-ca="del" data-id="${x.id}">Löschen</button></div>` : ''}`;
  }).join('');
}
function renameProject(id) {
  const sc = db.scenes.find(x => x.id === id), inp = document.createElement('input');
  projMenu = null; renderProjectBar();
  inp.className = 'tedit'; inp.value = sc.name; inp.enterKeyHint = 'done'; inp.setAttribute('autocomplete', 'off');
  $(`#projSel [data-sc="${id}"]`).replaceWith(inp);
  projEdit = id; inp.focus(); inp.select();
  let keep = true;
  const finish = () => {
    if (projEdit !== id) return;
    projEdit = null;
    const t = inp.value.trim();
    if (keep && t && t !== sc.name) { commit(); sc.name = t; save(); const n = $('#sName'); if (n) n.value = scene().name; renderBrowser(); }
    renderProjectBar();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(); else if (e.key === 'Escape') { keep = false; finish(); } e.stopPropagation(); });
  inp.addEventListener('blur', finish);
}

function renderInputs() {
  const p = proj(), n = p.deltas.length;
  $('#legList').innerHTML = p.deltas.map((d, i) => legCard(p, d, i, n) +
    (i < n - 1 ? `<div class="bendrow"><div class="t" data-bend="${i}">Biegung ${i + 1}</div></div>` : '')).join('');
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
  const el = e.target, p = proj();
  if (el.dataset.leglen != null) {
    const i = +el.dataset.leglen, L = num(el.value);
    if (!(L > 0)) return;
    commit('len' + i);
    withEnd(i, () => setDelta(i, V.mul(V.norm(deltaVec(p.deltas[i])), L)));
    recompute(); return;
  }
  if (el.dataset.obla != null || el.dataset.oblb != null || el.dataset.oblg != null) {
    const i = +(el.dataset.obla ?? el.dataset.oblb ?? el.dataset.oblg), card = el.closest('.leg');
    let a = +card.querySelector('[data-obla]').value, b = +card.querySelector('[data-oblb]').value;
    const g = +card.querySelector('[data-oblg]').value;
    if (!perpDirs(a).includes(b)) b = perpDirs(a).includes(2) ? 2 : perpDirs(a)[0];
    oblPref.set(i, { a, b });
    commit();
    // Ende fixiert und nur der Winkel geändert: Versatz (Anteil quer) bleibt, Schräge und Lauflänge passen sich an
    const v0 = deltaVec(p.deltas[i]), off0 = V.dot(v0, DIRS[b].v);
    const L = p.endFixed && el.dataset.oblg != null && off0 > 0.5 ? off0 / Math.sin(g * Math.PI / 180) : V.len(v0) || 100;
    withEnd(i, () => setDelta(i, obliqueVec(a, b, g, L)));
    renderInputs(); recompute(); focusLeg(i); return;
  }
  if (!el.dataset.p) return;
  commit('f:' + el.dataset.p);
  const m = /^deltas\.(\d+)\./.exec(el.dataset.p), val = 'signed' in el.dataset ? readSigned(el) : num(el.value);
  if (m) withEnd(+m[1], () => setPath(proj(), el.dataset.p, val)); else setPath(proj(), el.dataset.p, val);
  recompute();
});
$('#legList').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const p = proj();
  if (b.dataset.sign) {
    b.textContent = b.textContent === '−' ? '+' : '−';
    commit();
    const m = /^deltas\.(\d+)\./.exec(b.dataset.sign), val = num(b.nextElementSibling.value) * (b.textContent === '−' ? -1 : 1);
    if (m) withEnd(+m[1], () => setPath(p, b.dataset.sign, val)); else setPath(p, b.dataset.sign, val);
    recompute();
  } else if (b.dataset.dir) {
    const [i, k] = b.dataset.dir.split(':');
    legDirClick(+i, k);
  } else if (b.dataset.lk) {
    const [i, f] = b.dataset.lk.split(':'), o = p.deltas[+i], on = !o[f];
    commit(); delete o.lock; delete o.flex; if (on) o[f] = true;
    renderInputs(); recompute();
  } else if (b.dataset.free != null) {
    freeLegs.add(+b.dataset.free); renderInputs(); focusLeg(+b.dataset.free);
  } else if (b.dataset.off != null) {
    openOffset('insert', +b.dataset.off);
  } else if (b.dataset.del != null) {
    commit();
    txDeleteLeg(p, +b.dataset.del);
    p.deltas.splice(+b.dataset.del, 1);
    renderInputs(); recompute();
  }
});
$('#legList').addEventListener('focusin', e => { const c = e.target.closest('.leg'); if (c) focusLeg(+c.dataset.leg); });
$('#addLeg').addEventListener('click', () => {
  const p = proj();
  commit();
  const last = p.deltas.at(-1) || { x: 1 };
  p.deltas.push(Math.abs(last.z) > 0 ? { x: 100, y: 0, z: 0 } : { x: 0, y: 0, z: 100 });
  renderInputs(); recompute();
});
$('.tpl').addEventListener('click', e => {
  const t = TEMPLATES[e.target.closest('button')?.dataset.tpl];
  if (!t) return;
  commit();
  const p = proj();
  p.deltas = toDeltas(t);
  p.bundleTx = [];
  p.done = {};
  renderInputs(); recompute(); resetView();
});

// Projektliste: Zeile wählt das Projekt, ⋮ zeigt die Aktionen
$('#projSel').addEventListener('click', e => {
  const ctx = e.target.closest('[data-ctx]')?.dataset.ctx, ca = e.target.closest('[data-ca]')?.dataset;
  if (ctx) { projMenu = projMenu === ctx ? null : ctx; renderProjectBar(); return; }
  if (ca) {
    const sc = db.scenes.find(x => x.id === ca.id);
    if (ca.ca === 'ren') { renameProject(ca.id); return; }
    projMenu = null;
    if (ca.ca === 'del') delScene(sc); else { $('#menuPop').hidden = true; dupScene(sc); }
    renderProjectBar();
    return;
  }
  const id = e.target.closest('[data-sc]')?.dataset.sc;
  if (!id) return;
  projMenu = null;
  $('#menuPop').hidden = true;
  if (id === proj().sceneId) return;
  db.currentId = db.projects.find(q => q.sceneId === id).id; highlight = -1; renderProjectBar(); fullRender(); resetView();
});
// Ohne Labor kein Raum-Dialog: neues gerades Rohr sofort anlegen
$('#pNew').addEventListener('click', () => {
  $('#menuPop').hidden = true;
  if (lab) { openNewDlg(); return; }
  commit();
  addPipe(newProject(proj().profileId, 'Rohr 1'), null, `Projekt ${db.scenes.length + 1}`);
  fullRender(); resetView();
  toast('Neues Projekt angelegt.');
});
function dupScene(sc = scene()) {
  commit();
  const n = { ...structuredClone(sc), id: uid(), name: sc.name + ' (Kopie)' }, ids = {};
  const copies = db.projects.filter(q => q.sceneId === sc.id).map(q => { const c = { ...structuredClone(q), id: uid(), sceneId: n.id, done: {} }; ids[q.id] = c.id; return c; });
  const fix = r => { if (r) r.to = r.to.replace(/^([SE]):(.+)$/, (m, w, id) => `${w}:${ids[id] || id}`); };
  copies.forEach(c => ['S', 'E'].forEach(w => c.refs?.[w]?.forEach(fix)));
  n.planes.forEach(pl => fix(pl.ref));
  db.scenes.push(n); db.projects.push(...copies); db.currentId = copies[0].id;
  fullRender(); resetView();
}
async function delScene(sc = scene()) {
  if (!await ask(`Projekt „${sc.name}“ löschen?`)) return;
  commit();
  const stay = proj().sceneId !== sc.id;
  db.projects = db.projects.filter(p => p.sceneId !== sc.id);
  db.scenes = db.scenes.filter(x => x !== sc);
  if (!db.projects.length) addPipe(newProject(db.profiles[0].id, 'Rohr 1'), null, 'Projekt 1');
  if (!stay) db.currentId = db.projects[0].id;
  fullRender();
  if (!stay) resetView();
}

// ---------- Reiter „Raum“: Grundriss, Rohr ausrichten, Ziel-Anschluss, Schellen ----------
const bbox2 = o => ({ x0: Math.min(...o.map(q => q[0])), x1: Math.max(...o.map(q => q[0])), y0: Math.min(...o.map(q => q[1])), y1: Math.max(...o.map(q => q[1])) });
const isRect = o => o?.length === 4 && o.every((q, i) => { const n = o[(i + 1) % 4]; return Math.abs(q[0] - n[0]) < 1e-6 || Math.abs(q[1] - n[1]) < 1e-6; });
const edgeLen = (o, i) => { const a = o[i], b = o[(i + 1) % o.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
const mm = n => String(r1(n)).replace('.', ',');

// Neuer Raum ums Rohr: Rohr hängt an der Rückwand (in Schellenhöhe), 1 m über dem Boden, links/rechts 0,5 m Platz
function newRoomAround(p) {
  const pts = points(p), f = prof(p), round = (v, s) => Math.round(v / s) * s;
  const mn = [0, 1, 2].map(k => Math.min(...pts.map(q => q[k]))), mx = [0, 1, 2].map(k => Math.max(...pts.map(q => q[k])));
  const x0 = round(mn[0] - 500, 10), x1 = round(mx[0] + 500, 10), y1 = mx[1] + f.clampH, y0 = y1 - Math.max(2500, round(mx[1] - mn[1] + 1500, 10));
  const z0 = mn[2] - 1000, height = Math.max(2500, round(mx[2] - z0 + 300, 10));
  return { id: uid(), name: `Raum ${db.rooms.length + 1}`, outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, height, pass: {} };
}
// Kantenlänge ändern: die folgende Wand wandert mit (Grundriss bleibt rechtwinklig)
function setEdgeLen(room, i, L) {
  const o = room.outline, n = o.length, a = o[i], b = o[(i + 1) % n], ax = Math.abs(b[0] - a[0]) > 1e-6 ? 0 : 1;
  const d = Math.sign(b[ax] - a[ax]) * (L - edgeLen(o, i));
  const next = structuredClone(o);
  next[(i + 1) % n][ax] += d; next[(i + 2) % n][ax] += d;
  if (next.some((q, k) => edgeLen(next, k) < 50)) return false;
  room.outline = next; return true;
}
// Wand-Koordinaten eines Punkts: Abstand zur Wand, Lage entlang der Wand (ab ihrem Anfang = kleinere Koordinate), Höhe über Boden
function wallFrame(pl, planes) {
  const u = pl.axis === 0 ? 1 : 0, lo = pl.ext[u][0];
  const ref = planes.find(q => q.kind === 'wall' && q.axis === u && Math.abs(q.c - lo) < 0.5);
  return { u, lo, refName: ref ? ref.name : 'Wandanfang' };
}
function wallCoords(pt, pl, room, planes = layout.planes) {
  const { u, lo } = wallFrame(pl, planes);
  return { dist: planeDist(pl, pt), along: pt[u] - lo, height: pt[2] - (room.z0 || 0) };
}
function fromWallCoords(c, pl, room, planes = layout.planes) {
  const { u, lo } = wallFrame(pl, planes), q = [0, 0, 0];
  q[pl.axis] = pl.c + pl.n * c.dist; q[u] = lo + c.along; q[2] = (room.z0 || 0) + c.height;
  return q;
}
// Bezugspunkt des Rohrs: A, E oder Schnittpunkt i
const place = { ref: 'A', wall: null, tgWall: null };
function refPoint(p, ref) {
  const pts = points(p);
  return ref === 'A' ? pts[0] : ref === 'E' ? pts.at(-1) : pts[+ref.slice(1)] || pts[0];
}
// Nächste Wand zum Punkt als Vorgabe
const nearestWall = pt => layout.planes.filter(q => q.kind === 'wall').sort((a, b) => Math.abs(planeDist(a, pt)) - Math.abs(planeDist(b, pt)))[0];

function renderRoomTab() {
  const p = proj(), f = prof(p), room = roomOf(p), walls = layout.planes.filter(q => q.kind === 'wall');
  let h = `<div class="card">
    <h3>Raum</h3>
    <div class="row2">
      <label>Raum für dieses Rohr<select id="rmSel"><option value="">– kein Raum –</option>${db.rooms.map(r => `<option value="${r.id}"${r.id === p.roomId ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      ${room ? `<label>Name<input id="rmName" value="${esc(room.name)}"></label>` : ''}
    </div>
    <div class="btnrow">
      <button id="rmNew">+ Neuer Raum ums Rohr</button>
      ${room ? '<button id="rmDraw" class="primary">✎ Grundriss in 3D zeichnen</button>' : ''}
    </div>`;
  if (!room) {
    h += `<p class="hint">Ein Raum gibt Wände, Boden und Decke vor: Das Rohr rastet in Schellenhöhe davor ein, Schellen bekommen Bohrpunkte, und Rohre, die durch Wände laufen, werden erkannt. Mehrere Rohre können im selben Raum liegen und sehen sich gegenseitig.</p></div>`;
  } else {
    const rect = isRect(room.outline), bb = bbox2(room.outline);
    h += `<div class="row3" style="margin-top:12px">
        ${rect ? `<label>Breite (mm)<input data-rm="w" inputmode="decimal" value="${mm(bb.x1 - bb.x0)}"></label><label>Tiefe (mm)<input data-rm="d" inputmode="decimal" value="${mm(bb.y1 - bb.y0)}"></label>` : ''}
        <label>Raumhöhe (mm)<input data-rm="h" inputmode="decimal" value="${mm(room.height)}"></label>
      </div>
      <p class="hint">${rect ? 'Rechteckiger Raum. Für L-Formen und Nischen den Grundriss in 3D zeichnen.' : 'Grundriss mit ' + room.outline.length + ' Ecken.'} Länge einer Wand ändern verschiebt die folgende Wand mit.</p>
      ${walls.map(w => `<div class="wallrow"><b>${w.name}</b>
        <label class="unit"><input data-edge="${w.edge}" inputmode="decimal" value="${mm(edgeLen(room.outline, w.edge))}" aria-label="Länge ${w.name}"><span>mm</span></label>
        <label class="chk"><input type="checkbox" data-pass="${w.edge}"${w.pass ? ' checked' : ''}> Durchführung</label></div>`).join('')}
      <div class="btnrow" style="margin-top:8px"><button id="rmDel" class="danger">Raum löschen</button></div>
    </div>`;

    // Rohr im Raum
    if (!place.wall || !walls.some(w => w.id === place.wall)) place.wall = nearestWall(refPoint(p, place.ref))?.id || walls[0]?.id;
    const pl = walls.find(w => w.id === place.wall);
    if (pl) {
      const wc = wallCoords(refPoint(p, place.ref), pl, room), fr = wallFrame(pl, layout.planes);
      const refs = [['A', 'Rohranfang A'], ['E', 'Rohrende'], ...points(p).slice(1, -1).map((_, i) => [`V${i + 1}`, `Schnittpunkt ${i + 1}`])];
      h += `<div class="card"><h3>Startpunkt</h3>
        <div class="row2">
          <label>Bezugspunkt am Rohr<select id="plRef">${refs.map(([v, t]) => `<option value="${v}"${v === place.ref ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>gemessen an<select id="plWall">${walls.map(w => `<option value="${w.id}"${w.id === pl.id ? ' selected' : ''}>${w.name}</option>`).join('')}</select></label>
        </div>
        <div class="row3">
          <label>Abstand zur Wand<input data-plc="dist" inputmode="decimal" value="${mm(wc.dist)}"></label>
          <label>ab ${fr.refName}<input data-plc="along" inputmode="decimal" value="${mm(wc.along)}"></label>
          <label>Höhe über Boden<input data-plc="height" inputmode="decimal" value="${mm(wc.height)}"></label>
        </div>
        <div class="btnrow" style="margin-top:8px"><button id="plWallH">An Wand (${fmt(f.clampH)} mm)</button><button id="plRotL">↺ 90° drehen</button><button id="plRotR">↻ 90° drehen</button></div>
        <p class="hint">Bezugspunkt meist der Rohranfang A. Maße bis Rohrmitte; Änderungen wirken sofort – in 3D mitverfolgen.</p></div>`;
    }
  }

  // Ziel-Anschluss
  h += `<div class="card"><h3>Ziel (Endpunkt)</h3>`;
  if (!p.target) h += `<p class="hint" style="margin-top:0">Wo soll das Rohr ankommen? Die App zeigt laufend, wie weit das Rohrende noch davon entfernt ist.</p><button id="tgAdd" class="wide" style="margin:0">◎ Ziel festlegen (am aktuellen Rohrende)</button>`;
  else if (room && walls.length) {
    if (!place.tgWall || !walls.some(w => w.id === place.tgWall)) place.tgWall = nearestWall(p.target)?.id;
    const tw = walls.find(w => w.id === place.tgWall), tc = wallCoords(p.target, tw, room), fr = wallFrame(tw, layout.planes);
    h += `<div class="row2"><label>gemessen an<select id="tgWall">${walls.map(w => `<option value="${w.id}"${w.id === tw.id ? ' selected' : ''}>${w.name}</option>`).join('')}</select></label><span></span></div>
      <div class="row3">
        <label>Abstand zur Wand<input data-tgc="dist" inputmode="decimal" value="${mm(tc.dist)}"></label>
        <label>ab ${fr.refName}<input data-tgc="along" inputmode="decimal" value="${mm(tc.along)}"></label>
        <label>Höhe über Boden<input data-tgc="height" inputmode="decimal" value="${mm(tc.height)}"></label>
      </div>`;
  } else {
    const t = V.sub(p.target, layout.A);
    h += `<p class="hint" style="margin-top:0">Lage ab Rohranfang (Rohrmitte).</p><div class="row3">
        <label>X <small>rechts + / links −</small>${signed('tg.0', t[0])}</label>
        <label>Y <small>hinten + / vorn −</small>${signed('tg.1', t[1])}</label>
        <label>Z <small>oben + / unten −</small>${signed('tg.2', t[2])}</label></div>`;
  }
  if (p.target) h += `${targetHtml()}<button id="tgRoute" class="primary" style="width:100%;margin-top:8px">↳ Weg vom Start zum Ziel vorschlagen</button>
    <div class="btnrow" style="margin-top:8px"><button id="tgFromEnd">= aktuelles Rohrende</button><button id="tgDel" class="danger">Ziel entfernen</button></div>`;
  h += '</div>';

  // Schellen
  h += `<div class="card"><h3>Schellen</h3>
    <div class="seg" style="margin-bottom:8px">
      <button data-cm="auto"${p.clampMode !== 'manual' ? ' class="on"' : ''}>Automatisch</button>
      <button data-cm="manual"${p.clampMode === 'manual' ? ' class="on"' : ''}>Von Hand</button>
    </div>
    <p class="hint" style="margin:0">${layout.clampS.length} ${layout.bundle.length ? 'Mehrfachschellen' : 'Schellen'} · höchstens ${fmt(f.clampMax)} mm Abstand, ${fmt(f.clampBend)} mm vom Bogen, auf einer Geraden nicht näher als ${fmt(f.clampMin)} mm (einstellbar unter „Zangen“).
      ${p.clampMode === 'manual' ? 'Von Hand: in 3D „Schellen“ wählen – Rohr antippen setzt, Ziehen verschiebt, Antippen löscht.' : ''}</p>
    ${p.clampMode === 'manual' ? '<div class="btnrow" style="margin-top:8px"><button id="clampRedo">Neu verteilen</button><button id="clampClear" class="danger">Alle entfernen</button></div>' : ''}
  </div>`;
  $('#tab-room').innerHTML = h;
}

// Ein Rohr um 90° um die Senkrechte durch den Bezugspunkt drehen
function rotatePipe(p, dir) {
  const R = refPoint(p, place.ref);
  ensureDeltas();
  const rz = v => (dir > 0 ? [-v[1], v[0], v[2]] : [v[1], -v[0], v[2]]);
  p.deltas = p.deltas.map(d => { const v = rz(deltaVec(d)); return { x: v[0], y: v[1], z: v[2] }; });
  p.origin = V.add(R, rz(V.sub(p.origin, R)));
}

$('#tab-room').addEventListener('input', e => {
  const el = e.target, p = proj(), room = roomOf(p);
  if (el.id === 'rmName') { room.name = el.value; save(); $('#rmSel').selectedOptions[0].textContent = el.value; return; }
  if (el.dataset.rm) {
    const v = num(el.value);
    if (!(v >= 300)) return;
    commit('rm' + el.dataset.rm);
    if (el.dataset.rm === 'h') room.height = v;
    else {
      const bb = bbox2(room.outline), ax = el.dataset.rm === 'w' ? 0 : 1, hi = ax ? bb.y1 : bb.x1, lo = ax ? bb.y0 : bb.x0;
      room.outline.forEach(q => { if (Math.abs(q[ax] - hi) < 1e-6) q[ax] = lo + v; });
    }
  } else if (el.dataset.edge) {
    const v = num(el.value);
    if (!(v >= 50)) return;
    commit('edge' + el.dataset.edge);
    if (!setEdgeLen(room, +el.dataset.edge, v)) return;
  } else if (el.dataset.pass) {
    commit(); room.pass ||= {}; room.pass[el.dataset.pass] = el.checked;
  } else if (el.dataset.plc || el.dataset.tgc) {
    const isT = !!el.dataset.tgc, pl = layout.planes.find(w => w.id === (isT ? place.tgWall : place.wall));
    if (!pl) return;
    commit((isT ? 'tg' : 'pl') + (el.dataset.plc || el.dataset.tgc));
    const pt = isT ? p.target : refPoint(p, place.ref), c = wallCoords(pt, pl, room);
    c[el.dataset.plc || el.dataset.tgc] = num(el.value);
    const q = fromWallCoords(c, pl, room);
    if (isT) p.target = q; else p.origin = V.add(p.origin, V.sub(q, pt));
    refit();
  } else if (el.dataset.p?.startsWith('tg.')) {
    commit('tg' + el.dataset.p);
    p.target[+el.dataset.p.split('.')[1]] = layout.A[+el.dataset.p.split('.')[1]] + readSigned(el);
  } else return;
  recompute();
});
$('#tab-room').addEventListener('change', e => {
  const el = e.target, p = proj();
  if (el.id === 'rmSel') { commit(); p.roomId = el.value || null; fit = null; recompute(); renderRoomTab(); }
  else if (el.id === 'plRef') { place.ref = el.value; place.wall = null; renderRoomTab(); }
  else if (el.id === 'plWall') { place.wall = el.value; renderRoomTab(); }
  else if (el.id === 'tgWall') { place.tgWall = el.value; renderRoomTab(); }
});
$('#tab-room').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const p = proj(), f = prof(p), room = roomOf(p);
  if (b.dataset.sign?.startsWith('tg.')) {
    commit(); b.textContent = b.textContent === '−' ? '+' : '−';
    const k = +b.dataset.sign.split('.')[1];
    p.target[k] = layout.A[k] + num(b.nextElementSibling.value) * (b.textContent === '−' ? -1 : 1);
  } else if (b.id === 'rmNew') {
    commit(); const r = newRoomAround(p); db.rooms.push(r); p.roomId = r.id; fit = null;
    toast('Raum angelegt – das Rohr hängt an der Rückwand. Maße und Lage hier anpassen.');
  } else if (b.id === 'rmDel') {
    ask(`Raum „${room.name}“ löschen? Rohre darin bleiben erhalten.`).then(ok => {
      if (!ok) return;
      commit(); db.rooms = db.rooms.filter(r => r !== room); db.projects.forEach(q => { if (q.roomId === room.id) q.roomId = null; });
      recompute(); renderRoomTab();
    });
    return;
  } else if (b.id === 'rmDraw') {
    startRoomDraw(); return;
  } else if (b.id === 'plWallH') {
    const pl = layout.planes.find(w => w.id === place.wall); if (!pl) return;
    commit(); const pt = refPoint(p, place.ref), c = wallCoords(pt, pl, room); c.dist = f.clampH;
    p.origin = V.add(p.origin, V.sub(fromWallCoords(c, pl, room), pt));
  } else if (b.id === 'plRotL' || b.id === 'plRotR') {
    commit(); rotatePipe(p, b.id === 'plRotL' ? 1 : -1); renderInputs();
  } else if (b.id === 'tgAdd' || b.id === 'tgFromEnd') { commit(); p.target = [...layout.E]; }
  else if (b.id === 'tgDel') { commit(); p.target = null; }
  else if (b.id === 'tgRoute') {
    const legs = routeLegs(layout.A, p.target, room ? nearestWall(layout.A) : null);
    if (!legs.length) { toast('Start und Ziel liegen aufeinander.'); return; }
    commit(); ensureDeltas(); p.deltas = legs; p.done = {}; renderInputs();
    toast('Rechtwinkliger Weg vorgeschlagen – Ecken und Längen jetzt anpassen.');
  }
  else if (b.dataset.cm) {
    if (b.dataset.cm === p.clampMode) return;
    commit();
    if (b.dataset.cm === 'manual') p.clamps = [...layout.clampS];
    p.clampMode = b.dataset.cm;
  } else if (b.id === 'clampRedo') { commit(); p.clamps = autoClamps(layout, f); }
  else if (b.id === 'clampClear') { commit(); p.clamps = []; }
  else return;
  refit();
  recompute(); renderRoomTab();
});

// ---------- Schenkel als Richtung + Länge ----------
// Jede Richtung als Knopf; schräge Schenkel als Winkel zwischen zwei Richtungen (15°-Raster); sonst frei in X/Y/Z.
const DIRS = [
  { v: [1, 0, 0], label: '→ rechts', word: 'rechts', ax: 'x' }, { v: [-1, 0, 0], label: '← links', word: 'links', ax: 'x' },
  { v: [0, 0, 1], label: '↑ oben', word: 'oben', ax: 'z' }, { v: [0, 0, -1], label: '↓ unten', word: 'unten', ax: 'z' },
  { v: [0, 1, 0], label: '↗ hinten', word: 'hinten', ax: 'y' }, { v: [0, -1, 0], label: '↙ vorne', word: 'vorne', ax: 'y' },
];
const freeLegs = new Set(); // Schenkel, die bewusst frei in X/Y/Z bearbeitet werden
const oblPref = new Map();  // gewählte Lesart einer Schräge je Schenkel: { a, b } („von a nach b“)
const OBL_ORDER = [0, 1, 4, 5, 2, 3]; // ohne Vorgabe zuerst waagrecht: „von rechts nach oben“ statt „von oben nach rechts“
const perpDirs = a => DIRS.map((D, k) => k).filter(k => Math.abs(V.dot(DIRS[k].v, DIRS[a].v)) < 1e-9);
function classifyLeg(v, pref = null) {
  const L = V.len(v);
  if (L < 1e-9) return { kind: 'axis', dir: -1, len: 0 };
  for (let a = 0; a < 6; a++) if (Math.abs(V.dot(v, DIRS[a].v) - L) < 1e-6) return { kind: 'axis', dir: a, len: L };
  const order = pref ? [pref.a, ...OBL_ORDER.filter(a => a !== pref.a)] : OBL_ORDER;
  for (const a of order) {
    const ca = V.dot(v, DIRS[a].v);
    if (ca <= 1e-9) continue;
    for (const b of (pref?.a === a ? [pref.b, ...perpDirs(a).filter(k => k !== pref.b)] : perpDirs(a))) {
      const cb = V.dot(v, DIRS[b].v);
      if (cb <= 1e-9 || V.len(V.sub(v, V.add(V.mul(DIRS[a].v, ca), V.mul(DIRS[b].v, cb)))) > 1e-6) continue;
      const ang = Math.atan2(cb, ca) * 180 / Math.PI;
      if (Math.abs(ang / 15 - Math.round(ang / 15)) < 1e-4) return { kind: 'oblique', a, b, ang: Math.round(ang), len: L };
    }
  }
  return { kind: 'free', len: L };
}
const obliqueVec = (a, b, ang, L) => V.mul(V.add(V.mul(DIRS[a].v, Math.cos(ang * Math.PI / 180)), V.mul(DIRS[b].v, Math.sin(ang * Math.PI / 180))), L);
// Kurzname eines Schenkels: von Anfang/Schnittpunkt bis Schnittpunkt/Ende
const legSpan = (i, n) => (n === 1 ? 'Anfang → Ende' : i === 0 ? 'Anfang → Punkt 1' : i === n - 1 ? `Punkt ${i} → Ende` : `Punkt ${i} → ${i + 1}`);
function legCard(p, d, i, n) {
  const legName = legSpan(i, n);
  const v = deltaVec(d), c = freeLegs.has(i) ? { kind: 'free', len: V.len(v) } : classifyLeg(v, oblPref.get(i));
  const prev = i > 0 ? V.norm(deltaVec(p.deltas[i - 1])) : null;
  const blocked = k => prev && Math.abs(Math.abs(V.dot(prev, DIRS[k].v)) - 1) < 1e-9; // gleiche Richtung oder zurück
  const sel = (data, opts, val) => `<select data-${data}="${i}">${opts.map(([k, t]) => `<option value="${k}"${k === val ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const lockBtns = p.endFixed && n > 1
    ? `<button data-lk="${i}:lock" class="lk${d.lock ? ' on' : ''}" title="Maß festhalten – gleicht nie aus">🔒</button><button data-lk="${i}:flex" class="lk${d.flex ? ' on' : ''}" title="Ausgleichsschenkel – nimmt Änderungen auf">⇄</button>` : '';
  let h = `<div class="leg${d.flex ? ' flex' : ''}" data-leg="${i}"><div class="leghead">Schenkel ${i + 1} <span class="meta">${legName}</span>${lockBtns}` +
    `<button data-off="${i}" title="Versatz einfügen">⤳ Versatz</button>` +
    `${n > 1 ? `<button data-del="${i}" aria-label="Schenkel löschen">✕</button>` : ''}</div>` +
    `<div class="dirpick">${DIRS.map((D, k) => `<button data-dir="${i}:${k}" class="ax-${D.ax}${c.kind === 'axis' && c.dir === k ? ' on' : ''}"${blocked(k) ? ' disabled' : ''}>${D.label}</button>`).join('')}` +
    `<button data-dir="${i}:obl"${c.kind !== 'axis' ? ' class="on"' : ''}>∠ schräg</button></div>`;
  if (c.kind === 'oblique') {
    h += `<div class="row3 oblrow">
      <label>Richtung${sel('obla', DIRS.map((D, k) => [k, D.word]), c.a)}</label>
      <label>geneigt nach${sel('oblb', perpDirs(c.a).map(k => [k, DIRS[k].word]), c.b)}</label>
      <label>um${sel('oblg', [15, 30, 45, 60, 75].map(a => [a, a + '°']), c.ang)}</label></div>
      <button class="linkbtn" data-free="${i}">X/Y/Z frei eingeben</button>`;
  } else if (c.kind === 'free') {
    h += `<div class="row3 oblrow">
      <label>X <small>rechts + / links −</small>${signed(`deltas.${i}.x`, d.x)}</label>
      <label>Y <small>hinten + / vorn −</small>${signed(`deltas.${i}.y`, d.y)}</label>
      <label>Z <small>oben + / unten −</small>${signed(`deltas.${i}.z`, d.z)}</label></div>`;
  }
  if (c.kind !== 'free') h += `<label class="lenrow">Achsmaß<span class="unit"><input data-leglen="${i}" inputmode="decimal" value="${fin(c.len)}" placeholder="0"><span>mm</span></span></label>`;
  else h += `<p class="hint lenfree">Achsmaß ${fmt(c.len)} mm</p>`;
  h += `</div>`;
  return h;
}

// Schenkel i auf neue Richtung setzen; Länge bleibt (leerer Schenkel: 100 mm)
function setLegDir(i, vec) {
  const p = proj(), L = V.len(deltaVec(p.deltas[i])) || 100;
  setDelta(i, V.mul(V.norm(vec), L));
}
function legDirClick(i, k) {
  const p = proj(), v = deltaVec(p.deltas[i]), c = classifyLeg(v);
  commit();
  if (k === 'obl') {
    if (c.kind !== 'axis') return;
    const a = c.dir < 0 ? 0 : c.dir, b = perpDirs(a).includes(2) ? 2 : perpDirs(a)[0];
    withEnd(i, () => setDelta(i, obliqueVec(a, b, 45, c.len || 100)));
    oblPref.set(i, { a, b });
    freeLegs.delete(i);
  } else { withEnd(i, () => setLegDir(i, DIRS[+k].v)); freeLegs.delete(i); }
  renderInputs(); recompute(); focusLeg(i);
}

// Gerade bearbeiteten Schenkel in 3D und in der Vorschau hervorheben
let previewLeg = -1;
function focusLeg(i) {
  previewLeg = i;
  if (sel !== i) selectLeg(i);
  $$('#legList .leg').forEach(el => el.classList.toggle('focus', +el.dataset.leg === i));
  drawMini();
}

// ---------- Neues Rohr: erst Raum, dann Start und Ziel ----------
// Richtiger Ablauf auf der Baustelle: Raum festlegen (oder bewusst ohne), Startpunkt an der Wand,
// optional Ziel – daraus ein erster rechtwinkliger Rohrweg entlang der Wand.

// Vorschlag: rechtwinklig vom Start zum Ziel – erst entlang der Startwand, dann hoch/runter, dann quer zur Wand
function routeLegs(A, T, startWall) {
  const d = V.sub(T, A);
  const u = startWall ? (startWall.axis === 0 ? 1 : 0) : (Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1);
  return [u, 2, 1 - u].filter(k => Math.abs(d[k]) > 0.5).map(k => { const v = [0, 0, 0]; v[k] = d[k]; return { x: v[0], y: v[1], z: v[2] }; });
}
// Ohne Ziel: ein Schenkel entlang der Wand in die Richtung mit mehr Platz
function firstLegAlong(A, wall, planes) {
  const { u, lo } = wallFrame(wall, planes), hi = wall.ext[u][1], dir = A[u] - lo < hi - A[u] ? 1 : -1;
  const L = Math.max(200, Math.min(1000, Math.floor(Math.abs((dir > 0 ? hi : lo) - A[u]) / 20) * 10));
  const v = [0, 0, 0]; v[u] = dir * L;
  return [{ x: v[0], y: v[1], z: v[2] }];
}

const nw = {};
function openNewDlg() {
  Object.assign(nw, {
    name: `Rohr ${db.projects.length + 1}`, room: proj().roomId || (db.rooms.length ? db.rooms.at(-1).id : 'new'),
    W: 4000, D: 3000, H: 2600, draw: false,
    start: { wall: null, along: 500, height: 1000 }, useEnd: false, end: { wall: null, along: 2500, height: 1500 },
  });
  renderNewDlg();
  $('#newDlg').hidden = false;
}
// Raum, so wie er im Dialog gewählt ist (neuer Raum: Rechteck ab Ecke 0/0)
const nwRoom = () => (nw.room === 'new' ? { id: 'neu', outline: [[0, 0], [nw.W, 0], [nw.W, nw.D], [0, nw.D]], z0: 0, height: nw.H, pass: {} }
  : nw.room === 'none' ? null : db.rooms.find(r => r.id === nw.room));

function renderNewDlg() {
  const room = nwRoom(), planes = roomPlanes(room), walls = planes.filter(w => w.kind === 'wall'), f = prof();
  // Vorgabe Startwand: die Wand hinter dem Raum (größte Y-Lage), sonst die erste
  const defWall = (walls.find(w => w.axis === 1 && w.n < 0) || walls[0])?.id;
  if (!walls.some(w => w.id === nw.start.wall)) nw.start.wall = defWall;
  if (!walls.some(w => w.id === nw.end.wall)) nw.end.wall = defWall;
  const wallSel = (id, val) => `<select id="${id}">${walls.map(w => `<option value="${w.id}"${w.id === val ? ' selected' : ''}>${w.name}</option>`).join('')}</select>`;
  const refName = id => { const w = walls.find(x => x.id === id); return w ? wallFrame(w, planes).refName : ''; };
  const point = (key, o) => `<div class="row3">
      <label>an Wand${wallSel(`nw-${key}-wall`, o.wall)}</label>
      <label>ab ${refName(o.wall)}<input id="nw-${key}-along" inputmode="decimal" value="${mm(o.along)}"></label>
      <label>Höhe über Boden<input id="nw-${key}-height" inputmode="decimal" value="${mm(o.height)}"></label></div>`;
  $('#newBody').innerHTML = `
    <label>Name<input id="nwName" value="${esc(nw.name)}"></label>
    <div class="lbl" style="margin-top:12px">Wo wird verlegt?</div>
    <div class="choice">
      ${db.rooms.map(r => `<label class="radio"><input type="radio" name="nwRoom" value="${r.id}"${nw.room === r.id ? ' checked' : ''}> ${esc(r.name)}</label>`).join('')}
      <label class="radio"><input type="radio" name="nwRoom" value="new"${nw.room === 'new' ? ' checked' : ''}> Neuer Raum</label>
      <label class="radio"><input type="radio" name="nwRoom" value="none"${nw.room === 'none' ? ' checked' : ''}> Ohne Raum</label>
    </div>
    ${nw.room === 'new' ? `<div class="row3">
        <label>Breite (mm)<input id="nwW" inputmode="decimal" value="${mm(nw.W)}"></label>
        <label>Tiefe (mm)<input id="nwD" inputmode="decimal" value="${mm(nw.D)}"></label>
        <label>Höhe (mm)<input id="nwH" inputmode="decimal" value="${mm(nw.H)}"></label></div>
      <label class="chk"><input type="checkbox" id="nwDraw"${nw.draw ? ' checked' : ''}> danach Grundriss in 3D zeichnen (L-Form, Nischen)</label>` : ''}
    ${room ? `<h4>Startpunkt (Rohranfang)</h4>${point('start', nw.start)}
      <label class="chk" style="margin-top:6px"><input type="checkbox" id="nwUseEnd"${nw.useEnd ? ' checked' : ''}> Ziel (Endpunkt) festlegen</label>
      ${nw.useEnd ? `<h4>Ziel</h4>${point('end', nw.end)}` : ''}
      <p class="hint">Maße bis Rohrmitte; Abstand zur Wand = Schellenhöhe (${fmt(f.clampH)} mm). ${nw.useEnd ? 'Die App schlägt einen rechtwinkligen Weg entlang der Wand vor.' : 'Das Rohr beginnt mit einem Schenkel entlang der Wand.'}</p>`
    : '<p class="hint">Das Rohr liegt frei. Ein Raum lässt sich später im Reiter „Raum“ ergänzen.</p>'}`;
}
// Werte aus dem Dialog übernehmen; Auswahl-Änderungen bauen ihn neu auf
$('#newDlg').addEventListener('input', e => {
  const id = e.target.id, v = num(e.target.value);
  if (id === 'nwName') nw.name = e.target.value;
  else if (id === 'nwW' || id === 'nwD' || id === 'nwH') { if (v >= 500) nw[id.slice(2)] = v; }
  else if (/^nw-(start|end)-(along|height)$/.test(id)) { const [, k, f] = id.split('-'); nw[k][f] = v; }
});
$('#newDlg').addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'nwRoom') { nw.room = t.value; nw.start.wall = nw.end.wall = null; } // Wand-Kennungen gelten je Raum
  else if (t.id === 'nwDraw') nw.draw = t.checked;
  else if (t.id === 'nwUseEnd') nw.useEnd = t.checked;
  else if (/^nw-(start|end)-wall$/.test(t.id)) nw[t.id.split('-')[1]].wall = t.value;
  else if (t.id === 'nwW' || t.id === 'nwD') { /* Wände neu benennen */ } else return;
  renderNewDlg();
});
function createFromDlg() {
  const f = prof(), p = newProject(proj().profileId, nw.name.trim() || `Rohr ${db.projects.length + 1}`);
  let room = null;
  if (nw.room === 'new') { room = { ...nwRoom(), id: uid(), name: `Raum ${db.rooms.length + 1}` }; db.rooms.push(room); }
  else if (nw.room !== 'none') room = db.rooms.find(r => r.id === nw.room);
  if (room) {
    const planes = roomPlanes(room), walls = planes.filter(w => w.kind === 'wall');
    const wallOf = id => walls.find(w => w.id === id) || walls[0];
    const sw = wallOf(nw.start.wall), A = fromWallCoords({ dist: f.clampH, along: nw.start.along, height: nw.start.height }, sw, room, planes);
    p.roomId = room.id; p.origin = A; p.mode = 'deltas';
    if (nw.useEnd) {
      p.target = fromWallCoords({ dist: f.clampH, along: nw.end.along, height: nw.end.height }, wallOf(nw.end.wall), room, planes);
      const legs = routeLegs(A, p.target, sw);
      p.deltas = legs.length ? legs : firstLegAlong(A, sw, planes);
    } else p.deltas = firstLegAlong(A, sw, planes);
  }
  addPipe(p);
  $('#newDlg').hidden = true;
  fullRender(); resetView();
  if (room && nw.draw) startRoomDraw();
  else toast(room ? (nw.useEnd ? 'Rohrweg vom Start zum Ziel vorgeschlagen – jetzt anpassen.' : 'Rohr beginnt an der Wand – mit dem Gimbal oder im Reiter „Rohr“ weiterführen.') : 'Neues Rohr angelegt.');
}
$('#newOk').addEventListener('click', createFromDlg);
$('#newCancel').addEventListener('click', () => { $('#newDlg').hidden = true; });
$('#newDlg').addEventListener('click', e => { if (e.target.id === 'newDlg') $('#newDlg').hidden = true; });

// ---------- Berechnung & Ausgabe ----------
function hitMessages(hits, who) {
  for (const h of hits) {
    if (h.type === 'outside') layout.errors.push(`${who} liegt außerhalb des Raums – Lage im Reiter „Raum“ prüfen.`);
    else if (h.through && !h.plane.pass) layout.errors.push(`${who} läuft durch ${h.plane.name} (rot markiert). Als Durchführung freigeben oder Weg ändern.`);
    else if (!h.through) layout.warnings.push(`${who} liegt zu dicht an ${h.plane.name}.`);
  }
}
// Gerade, auf der die abgewickelte Länge s liegt (= Schenkelnummer)
const legAt = (L, s) => Math.max(0, straightRuns(L).findIndex(r => s >= r.s0 - 0.01 && s <= r.s1 + 0.01));

// Parallelrohre: aus dem Hauptrohr berechnet, laufen bei jeder Änderung live mit. Anfang und Ende sind orthogonal versetzt, dazwischen liegt das Rohr im Abstand daneben.
// Schellen sitzen an denselben Stellen wie beim Hauptrohr (Mehrfachschellen).
function bundleLayouts(p, f, main, fitLast) {
  const verts = main.verts;
  if (verts.length < 2 || !p.bundle?.length) return [];
  const txs = (p.bundleTx || []).filter(t => t.bend < verts.length - 2);
  const out = p.bundle.map((b, i) => {
    const g = bundleGeometry(verts, b.dist, sideDir(verts, b.side), txs, { R: f.R, minStraight: f.minStraight });
    const L = computeLayout(g.pts, { R: f.R, zugA: p.zugA, zugE: p.zugE, minStraight: f.minStraight, fitLast, fitAll: !!fitLast, pickMark: bd => pickMark(f, bd.angle) });
    Object.assign(L, { name: `Rohr ${i + 2}`, def: b, offsets: g.offsets, A: g.pts[0], E: g.pts.at(-1), short: fitLast ? null : g.short, turns: g.turns });
    L.clampInfo = main.clampS.map(s => clampInfo(main.samples, s, main.planes, f, g.offsets[legAt(main, s)]));
    L.hits = main.room ? planeHits(L.samples, main.room, f.D / 2) : [];
    return L;
  });
  // Berühren sich zwei Rohre (Achsabstand unter Rohr-Ø)? Nur bei Lagewechseln nötig – sonst laufen alle im festen Abstand
  if (txs.length) {
    const all = [main, ...out], line = L => L.samples.map(q => q.p);
    out.forEach((L, i) => {
      for (let k = 0; k < all.length; k++) {
        if (k === i + 1) continue;
        if (pipeGap(line(L), line(all[k])) < f.D - 0.01) { L.clash = { touch: k ? all[k].name : 'Rohr 1' }; break; }
      }
    });
  }
  return out;
}
// Die anderen Rohre der Szene (samt Parallelrohren): sichtbar und antippbar, treten aber zurück
function sceneGhosts(p) {
  return scenePipes(p).filter(q => q.id !== p.id && !q.hidden).flatMap(q => {
    const f = prof(q), L = buildLayout(q);
    return [L, ...L.bundle.filter(B => !B.def.hidden)].map(x => ({ id: q.id, samples: x.samples, verts: x.verts, D: f.D, color: q.color, name: q.name, unrouted: q.unrouted }));
  });
}

// ---------- Weiche Übergänge ----------
// Nach Eingaben im Panel, Rückgängig oder Ausrichten gleiten Rohr und Raum in die neue Lage, statt zu springen.
// Beim direkten Ziehen in 3D (light-Neuberechnung) folgt die Anzeige ohne Verzögerung.
const ANIM_MS = 300;
let anim = null, animLayout = null, animRunning = false, shown = null;
const curLayout = () => animLayout || layout;
const ease = t => 1 - Math.pow(1 - t, 3);
const lerpN = (a, b, t) => a + (b - a) * t;
const geomOf = p => { const r = activeRoom(p); return { pid: p.id, pts: points(p), outline: r ? structuredClone(r.outline) : null, z0: r?.z0 || 0, h: r?.height || 0 }; };
// Unterschiedliche Punktzahl (Schenkel dazu/weg): das kürzere Rohr endet in seinem letzten Punkt
function lerpGeom(A, B, t) {
  const n = Math.max(A.pts.length, B.pts.length), at = (P, i) => P[Math.min(i, P.length - 1)];
  const pts = Array.from({ length: n }, (_, i) => at(A.pts, i).map((v, k) => lerpN(v, at(B.pts, i)[k], t)));
  const outline = A.outline && B.outline && A.outline.length === B.outline.length ? A.outline.map((q, i) => q.map((v, k) => lerpN(v, B.outline[i][k], t))) : B.outline;
  return { pid: B.pid, pts, outline, z0: lerpN(A.z0, B.z0, t), h: lerpN(A.h || B.h, B.h, t) };
}
const sameGeom = (A, B) => A.pid === B.pid && A.pts.length === B.pts.length && A.pts.every((q, i) => V.len(V.sub(q, B.pts[i])) < 1e-6)
  && JSON.stringify(A.outline) === JSON.stringify(B.outline) && A.z0 === B.z0 && A.h === B.h;
function animLayoutFor(g) {
  const p = proj(), room = activeRoom(p);
  const L = buildLayout(p, g.pts, room && g.outline ? { ...room, outline: g.outline, z0: g.z0, height: g.h } : room, true);
  L.ghosts = layout.ghosts;
  return L;
}
function animateTo(p, light) {
  const now = geomOf(p);
  const busy = drag || gz || roomDrag || clampDrag;
  if (light || busy || !shown || shown.pid !== p.id || matchMedia('(prefers-reduced-motion: reduce)').matches) { anim = null; animLayout = null; shown = now; return; }
  if (sameGeom(anim ? anim.to : shown, now)) return;
  const from = anim ? lerpGeom(anim.from, anim.to, ease(Math.min(1, (performance.now() - anim.t0) / ANIM_MS))) : shown;
  anim = { from, to: now, t0: performance.now() };
  shown = now;
  animLayout = animLayoutFor(from); // erstes Bild zeigt noch den alten Stand
  if (!animRunning) { animRunning = true; requestAnimationFrame(animFrame); }
}
function animFrame() {
  if (!anim) { animRunning = false; return; }
  const t = Math.min(1, (performance.now() - anim.t0) / ANIM_MS);
  if (t >= 1) { anim = null; animLayout = null; }
  else animLayout = animLayoutFor(lerpGeom(anim.from, anim.to, ease(t)));
  render3d(); drawMini();
  if (anim) requestAnimationFrame(animFrame); else animRunning = false;
}

// Rohrdaten für Rechnung und Anzeige: Mittellinie, Raum, Schellen, Ziel, Parallelrohre.
// pts/room lassen sich für Zwischenbilder der Animation vorgeben.
// fit: Zwischenbilder (Ziehen am Rohrende, Gleiten): Ein kurzer letzter Schenkel nimmt den Bogen mit, statt ihn zu verzerren
function buildLayout(p, pts = points(p), room = activeRoom(p), fit = !!(gz?.tail || gz?.soft) && p === proj()) {
  const f = prof(p), fitLast = fit ? f.D : 0;
  const L = computeLayout(pts, { R: f.R, zugA: p.zugA, zugE: p.zugE, minStraight: f.minStraight, fitLast, fitAll: fit, pickMark: b => pickMark(f, b.angle) });
  L.collisions = selfCollisions(L.samples, f.D);
  L.A = pts[0]; L.E = pts.at(-1);
  L.room = room; L.planes = roomPlanes(room);
  L.hits = room ? planeHits(L.samples, room, f.D / 2) : [];
  L.clampS = !lab ? [] : p.clampMode === 'manual' ? p.clamps.filter(s => s >= 0 && s <= L.total).sort((a, b) => a - b) : autoClamps(L, f);
  L.clampInfo = L.clampS.map(s => clampInfo(L.samples, s, L.planes, f));
  L.targetDelta = lab && p.target ? V.sub(p.target, L.E) : null;
  L.bundle = bundleLayouts(p, f, L, fitLast);
  return L;
}

// Das fertige Rohr; beim Zeichnen steht layout für das Zwischenbild der Animation
const finalLayout = () => layout;
function recompute(light = false) {
  const p = proj(), f = prof(p), room = activeRoom(p);
  if (!light) refit();
  resolveScene(p);
  layout = buildLayout(p);
  layout.ghosts = sceneGhosts(p);
  if (!light) renderBrowser();
  animateTo(p, light);
  if (light) { draw(); drawMini(); return; }
  if (layout.collisions.length) layout.errors.push(`Rohr berührt sich selbst (${layout.collisions.length}× – rot markiert).`);
  const who = layout.bundle.length ? 'Rohr 1' : 'Rohr';
  hitMessages(layout.hits, who);
  layout.bundle.forEach(B => {
    if (B.def.dist <= f.D) layout.errors.push(`${B.name}: Abstand muss größer als der Rohrdurchmesser (${fmt(f.D)} mm) sein.`);
    else if (B.clash) {
      layout.errors.push(`${B.name} (rot) läuft in ${B.clash.touch} – beim Lagewechsel unter „Lage danach“ die andere Seite wählen oder das Bündel am Griff des Rohranfangs auf die Außenseite der Ecke drehen.`);
    } else if (B.short) {
      const s = B.short, has = s.len < 0 ? 'würde rückwärts laufen' : `wäre nur ${fmt(s.len)} mm lang`;
      layout.errors.push(s.kind === 'drop'
        ? `${B.name} (rot): Das senkrechte Stück an Biegung ${s.bend + 1} ist nur ${fmt(s.len)} mm, die zwei Bögen brauchen ${fmt(s.need)} mm – Rohrabstand vergrößern.`
        : `${B.name} (rot) ist so nicht verlegbar: Schenkel ${s.leg + 1} liegt innen im Bündel und ${has}, braucht für die Bögen aber ${fmt(s.need)} mm. ` +
          `Bündel am Griff des Rohranfangs drehen, Lagewechsel einbauen oder Schenkel ${s.leg + 1} um mindestens ${fmt(Math.ceil(s.need - s.len))} mm verlängern.`);
    } else B.errors.forEach(m => layout.errors.push(`${B.name}: ${m}`));
    B.warnings.forEach(m => layout.warnings.push(`${B.name}: ${m}`));
    hitMessages(B.hits, B.name);
  });
  const free = layout.clampInfo.filter((c, i) => !c.mount || layout.bundle.some(B => !B.clampInfo[i]?.mount)).length;
  if (room && free) layout.warnings.push(`${free} Schelle(n) ohne Befestigung – keine Wand/Decke in Schellenhöhe (${fmt(f.clampH)} mm).`);
  if (sceneFails.length) layout.errors.push(`${sceneFails.join(', ')}: Bezug nicht erfüllbar – kein Schenkel kann ausgleichen. Maß ändern oder Weg neu vorschlagen.`);
  layout.bends.forEach((b, j) => {
    const off = Math.abs(b.angle / ANGLE_STEP - Math.round(b.angle / ANGLE_STEP)) * ANGLE_STEP;
    if (off > 0.1) layout.warnings.push(`Biegung ${j + 1}: ${fmt(b.angle)}° liegt nicht im ${ANGLE_STEP}°-Raster.`);
  });
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
  if (lab && !$('#tab-room').contains(document.activeElement)) renderRoomTab();
  if (!$('#bundleCard').contains(document.activeElement)) renderBundle();
  renderBundleBar();
  renderGuide();
  draw();
  drawMini();
  save();
}

function messages() {
  return layout.errors.map(m => `<div class="msg err">✕ ${esc(m)}</div>`).join('') +
    layout.warnings.map(m => `<div class="msg warn">⚠ ${esc(m)}</div>`).join('');
}

// Abweichung Rohrende → Ziel-Anschluss
function targetHtml() {
  const d = layout.targetDelta;
  if (!d) return '';
  const ok = V.len(d) < 0.5;
  const parts = [0, 1, 2].map(k => Math.abs(d[k]) < 0.05 ? null : `${fmt(Math.abs(d[k]))} ${[['rechts', 'links'], ['hinten', 'vorne'], ['höher', 'tiefer']][k][d[k] > 0 ? 0 : 1]}`).filter(Boolean);
  return ok ? '<div class="msg ok">✓ Rohrende trifft den Ziel-Anschluss.</div>'
    : `<div class="msg warn">◎ Ziel-Anschluss liegt noch ${parts.join(', ')} (gesamt ${fmt(V.len(d))} mm).</div>`;
}
function renderSummary() {
  const f = prof();
  $('#summary').innerHTML =
    `<div class="kv"><span>Zuschnitt</span></div><div class="big">${fmt(layout.total)} mm</div>` +
    `<div class="kv"><span>Biegungen <b>${layout.bends.length}</b></span><span>Radius <b>${fmt(f.R)} mm</b></span><span>Zange <b>${esc(f.name)}</b></span></div>` +
    `<div class="chips">${layout.bends.map((b, j) => `<span class="chip">${j + 1}: ${fmt(b.angle)}°${j ? ' / ' + fmt(normRot(b.rot)) + '°' : ''}</span>`).join('')}</div>` +
    targetHtml() + messages() +
    (layout.bends.length ? `<button class="primary nextbtn" id="goBend">Weiter zum Biegen →</button>` : '');
}
$('#summary').addEventListener('click', e => { if (e.target.id === 'goBend') $('[data-tab=guide]').click(); });

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

function tapeSvg(Lo = layout) {
  const L = Lo.total || 1, W = 600, x0 = 14, sc = (W - 2 * x0) / L;
  let s = `<svg class="tape" viewBox="0 0 ${W} 120" role="img" aria-label="Rohr mit Markierungen">`;
  s += `<rect x="${x0}" y="48" width="${L * sc}" height="14" rx="3" fill="var(--tube-hi)" stroke="var(--tube)"/>`;
  Lo.bends.forEach(b => { s += `<rect x="${x0 + b.start * sc}" y="48" width="${Math.max(1, b.B * sc)}" height="14" fill="var(--tube)" opacity=".6"/>`; });
  Lo.bends.forEach((b, j) => {
    const x = x0 + b.mark * sc, up = j % 2 === 0;
    s += `<line x1="${x}" y1="${up ? 34 : 48}" x2="${x}" y2="${up ? 62 : 76}" stroke="var(--mark)" stroke-width="3"/>`;
    s += `<circle cx="${x}" cy="${up ? 20 : 90}" r="13" fill="var(--mark)"/><text x="${x}" y="${up ? 26 : 96}" text-anchor="middle" fill="#fff" style="font-weight:700">${j + 1}</text>`;
  });
  s += `<text x="${x0}" y="116">A</text><text x="${W - x0}" y="116" text-anchor="end">${fmt(L)}</text></svg>`;
  s += `<div class="marklist">${Lo.bends.map((b, j) => `<span><span class="num">${j + 1}</span>${fmt(b.mark)} mm</span>`).join('')}</div>`;
  return s;
}

// ---------- Anleitung: Kontrolle, Montage, Material ----------
// Kontrollmaß nach Biegung j: bei 90° vom Rohrende bzw. von der Außenkante des vorletzten Schenkels
// bis zur Außenkante des neuen Schenkels (nur wenn beide parallel liegen), sonst Winkel prüfen.
function checkText(L, j) {
  const b = L.bends[j], D = prof().D, pts = L.pts;
  const dir = i => V.norm(V.sub(pts[i + 1], pts[i]));
  if (Math.abs(b.angle - 90) > 0.5) return `Winkel mit dem Winkelmesser prüfen: <b>${fmt(b.angle)}°</b>`;
  if (j === 0) return `Rohrende A bis Außenkante des neuen Schenkels: <b>${fmt(L.legs[0].len + D / 2)} mm</b>`;
  if (Math.abs(V.dot(dir(j - 1), dir(j + 1))) > 0.999 && Math.abs(L.bends[j - 1].angle - 90) < 0.5) {
    return `Außenkante Schenkel ${j} bis Außenkante Schenkel ${j + 2}: <b>${fmt(L.legs[j].len + D)} mm</b>`;
  }
  return `Rechten Winkel prüfen (Anschlagwinkel).`;
}

const PREP = { rechts: 'rechts vom', links: 'links vom', hinten: 'hinter dem', vor: 'vor dem', über: 'über dem', unter: 'unter dem' };
// z. B. „80 mm rechts vom Rohranfang · 1200 mm ab Boden“
const drillText = (q, plane, L) => drillCoords(q, plane, layout.planes, L.A || layout.A, L.E || layout.E)
  .map(d => (d.ref === 'Rohranfang' || d.ref === 'Rohrende')
    ? (d.dir ? `${fmt(d.v)} mm ${PREP[d.dir]} ${d.ref}` : `auf Höhe ${d.ref}`)
    : `${fmt(d.v)} mm ab ${d.ref}`)
  .join(' · ');

// Montage: Schellen (bei Parallelrohren als Mehrfachschelle) mit Bohrpunkt je Rohr, Durchführungen
function montageHtml(p, f) {
  const pipes = [layout, ...layout.bundle], ci = layout.clampInfo;
  const pass = pipes.flatMap(L => L.hits.filter(h => h.type === 'through' && h.plane.pass).map(h => ({ ...h, L })));
  if (!ci.length && !pass.length) return '';
  const multi = pipes.length > 1, mountTxt = c => c.mount
    ? c.mount.plane.name + (Math.abs(c.mount.d - f.clampH) > 0.5 ? ` <span class="hint">(Abstand ${fmt(c.mount.d)} – Distanz ${fmt(c.mount.d - f.clampH)})</span>` : '')
    : (layout.room ? '<span style="color:var(--warn)">keine Fläche</span>' : '–');
  let h = `<div class="card"><h3>Montage</h3>`;
  if (ci.length) {
    h += `<p class="hint" style="margin-top:0">${ci.length} ${multi ? `Mehrfachschellen für ${pipes.length} Rohre` : 'Schellen'}, Schellenhöhe ${fmt(f.clampH)} mm. „ab A“ = gemessen auf Rohr 1 ab Rohrende A.</p>
      <div class="scroll-x"><table class="det mont"><tr><th>Nr.</th><th>auf Rohr ab A</th>${multi ? '<th>Rohr</th>' : ''}<th>Befestigung</th><th>Bohrpunkt</th></tr>
      ${ci.map((c, i) => pipes.map((L, k) => {
        const cc = k ? L.clampInfo[i] : c;
        return `<tr${k ? ' class="sub"' : ''}>${k ? '<td></td><td></td>' : `<td>S${i + 1}</td><td>${fmt(c.s)}</td>`}${multi ? `<td>${k + 1}</td>` : ''}
          <td>${mountTxt(cc)}</td><td>${cc.mount ? drillText(cc.q, cc.mount.plane, L) : '–'}</td></tr>`;
      }).join('')).join('')}
      </table></div>`;
  }
  if (pass.length) {
    h += `<h3 style="margin-top:12px">Durchführungen</h3><ul style="margin:0;padding-left:18px">
      ${pass.map(x => `<li>${multi ? `${x.L === layout ? 'Rohr 1' : x.L.name} · ` : ''}${x.plane.name}: ${drillText(x.p, x.plane, x.L)} <span class="hint">(Bohrung > ${fmt(f.D)} mm)</span></li>`).join('')}</ul>`;
  }
  return h + '</div>';
}

// Material: alle Rohre des Bündels, Schellen, Aufteilung auf Stangen
function materialHtml(p, f) {
  const pipes = [{ name: layout.bundle.length ? 'Rohr 1' : p.name, len: layout.total }, ...layout.bundle.map(L => ({ name: L.name, len: L.total }))];
  const plan = cutPlan(pipes, f.stock), n = layout.clampS.length;
  return `<div class="card"><h3>Material</h3>
    <div class="scroll-x"><table class="det"><tr><th>Rohr</th><th>Zuschnitt</th></tr>
      ${pipes.map(g => `<tr><td>${esc(g.name)}</td><td>${fmt(g.len)} mm</td></tr>`).join('')}
      ${pipes.length > 1 ? `<tr><td><b>Summe</b></td><td><b>${fmt(pipes.reduce((a, g) => a + g.len, 0))} mm</b></td></tr>` : ''}
    </table></div>
    <p style="margin:10px 0 4px">Schellen: <b>${n}</b>${pipes.length > 1 ? ` Mehrfachschellen für je ${pipes.length} Rohre` : ''}</p>
    <p style="margin:6px 0 4px"><b>${plan.bars.length}</b> Stange(n) à ${fmt(f.stock)} mm (3 mm Sägeschnitt):</p>
    <ul style="margin:0;padding-left:18px">${plan.bars.map((b, i) => `<li>Stange ${i + 1}: ${b.cuts.map(c => `${fmt(c.len)} <span class="hint">(${esc(c.name)})</span>`).join(' + ')} – Rest ${fmt(b.rest)} mm</li>`).join('')}</ul>
    ${plan.tooLong.length ? `<div class="msg err">✕ Länger als eine Stange: ${plan.tooLong.map(c => esc(c.name)).join(', ')} – Verbindung einplanen.</div>` : ''}</div>`;
}

// ---------- Baustellenmodus: Bildschirm an, große Schrift, Drucken ----------
let wakeLock = null, wantWake = false, printing = false;
async function setWake(on) {
  wantWake = on;
  try {
    if (on) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener?.('release', () => { wakeLock = null; renderGuide(); }); }
    else { await wakeLock?.release(); wakeLock = null; }
  } catch { wantWake = false; wakeLock = null; }
  renderGuide();
}
document.addEventListener('visibilitychange', () => { if (wantWake && !document.hidden && !wakeLock) setWake(true); });
try { if (localStorage.getItem('biege.big') === '1') document.body.classList.add('bigtext'); } catch {}

// Bild der 3D-Ansicht für den Druck (auf dem Handy ist die Ansicht dabei ausgeblendet → kurz unsichtbar einblenden)
async function snapshot3d() {
  const tv = $('#tab-view'), wasHidden = !cv.clientWidth;
  if (wasHidden) tv.classList.add('offscreen');
  printing = true;
  render3d();
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  for (const src of [cvBg, glc, cv]) if (src.width && !src.hidden) g.drawImage(src, 0, 0, c.width, c.height);
  printing = false;
  if (wasHidden) tv.classList.remove('offscreen');
  draw();
  return c.toDataURL('image/png');
}
async function printPlan() {
  const p = proj();
  $('#printHead').innerHTML = `<h2>${esc(p.name)}</h2><div class="kv"><span>${new Date().toLocaleDateString('de-DE')}</span><span>${esc(prof(p).name)}</span><span>Rohrbiegen v${APP_VERSION}</span></div><img src="${await snapshot3d()}" alt="3D-Ansicht">`;
  window.print();
}

// Welches Rohr des Bündels die Anleitung zeigt (0 = Rohr 1)
let guidePipe = 0;
function renderGuide() {
  const p = proj(), f = prof(p);
  if (p.unrouted) {
    const others = scenePipes(p).filter(q => q !== p && !q.unrouted);
    $('#tab-guide').innerHTML = `${others.length ? `<label class="noprint" style="margin-bottom:10px">Rohr<select id="gPipe"><option selected>${esc(p.name)}</option>${others.map(q => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select></label>` : ''}<div class="card">„${esc(p.name)}“ ist noch nicht verlegt: In 3D Endpunkt antippen und „Weg vorschlagen“ wählen.</div>`;
    return;
  }
  if (guidePipe > layout.bundle.length) guidePipe = 0;
  const L = guidePipe ? layout.bundle[guidePipe - 1] : layout, bends = L.bends;
  const doneKey = j => (guidePipe ? `${guidePipe}:${j}` : j);
  const pipesHere = scenePipes(p).filter(q => !q.unrouted || q === p);
  let h = `${pipesHere.length > 1 ? `<label class="noprint" style="margin-bottom:10px">Rohr<select id="gPipe">${pipesHere.map(q => `<option value="${q.id}"${q.id === p.id ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select></label>` : ''}<div class="guidebar noprint">
      <button id="gPrint">🖨 Drucken / PDF</button>
      ${'wakeLock' in navigator ? `<button id="gWake"${wakeLock ? ' class="on"' : ''}>☀ Bildschirm ${wakeLock ? 'bleibt an' : 'anlassen'}</button>` : ''}
      <button id="gBig"${document.body.classList.contains('bigtext') ? ' class="on"' : ''}>A+ Große Schrift</button>
    </div>
    <div id="printHead" class="printonly"></div>
    ${layout.bundle.length ? `<div class="seg noprint" id="guidePipeSel" style="margin-bottom:12px">${[layout, ...layout.bundle].map((x, i) => `<button data-gp="${i}"${i === guidePipe ? ' class="on"' : ''}>Rohr ${i + 1}</button>`).join('')}</div>` : ''}
    <div class="card"><div class="kv"><span>Zuschnitt${layout.bundle.length ? ` Rohr ${guidePipe + 1}` : ''}</span></div><div class="big">${fmt(L.total)} mm</div>
    <div class="kv"><span>Zange <b>${esc(f.name)}</b></span><span>R <b>${fmt(f.R)}</b></span></div>
    ${messages()}</div>`;

  h += `<div class="card"><h3>1. Ablängen &amp; anzeichnen</h3>
    <p style="margin:0 0 8px">Rohr${layout.bundle.length ? ` ${guidePipe + 1}` : ''} auf <b>${fmt(L.total)} mm</b> ablängen, Anfang mit „A“ beschriften. Strichpositionen ab Anfang auf dem geraden Rohr:</p>
    ${tapeSvg(L)}
    <p class="hint">Tipp: Vor dem Biegen einen Längsstrich über das ganze Rohr ziehen – damit siehst du beim Drehen, wie weit das Rohr verdreht ist.</p></div>`;

  if (!bends.length) h += `<div class="card">Keine Biegung – gerades Rohr.</div>`;
  bends.forEach((b, j) => {
    const phi = normRot(b.rot);
    const k = b.mark - b.start;
    // Nach einer 90°-Biegung steht der vorige Schenkel quer: Strich direkt ab dessen Achse messen.
    // Abstand = Achsmaß − Tangente + Markenabstand (bei 90° mit L/R genau das Achsmaß).
    const fromAxis = j > 0 && Math.abs(bends[j - 1].angle - 90) < 0.5;
    const axisDist = L.legs[j].len - b.T + k;
    const measure = j === 0
      ? `Strich bei <b class="hl">${fmt(b.mark)} mm</b> ab Rohranfang`
      : fromAxis
        ? `Strich bei <b class="hl">${fmt(axisDist)} mm</b>, gemessen ab Achse von Schenkel ${j} <span class="hint">(Außenkante − ${fmt(f.D / 2)} mm)</span>
           <div class="alt">oder vorab auf dem geraden Rohr: ${fmt(b.mark)} mm ab Anfang</div>`
        : `Strich bei <b class="hl">${fmt(b.mark)} mm</b> ab Anfang <span class="hint">(vor dem ersten Biegen anzeichnen – nach einem schrägen Bogen lässt sich nicht ab Achse messen)</span>`;
    const others = marksOf(f).filter(m => m.name !== b.markName);
    h += `<div class="step${highlight === j ? ' hl' : ''}${p.done[doneKey(j)] ? ' done' : ''}" data-step="${j}">
      <h3><span class="num">${j + 1}</span> Biegung ${j + 1} · ${fmt(b.angle)}°
        <label class="done-box"><input type="checkbox" data-done="${doneKey(j)}"${p.done[doneKey(j)] ? ' checked' : ''}> erledigt</label></h3>
      <div class="inst"><ol>
        <li>${measure}</li>
        <li>Strich auf Marke <b class="hl">„${esc(b.markName)}“</b> – der gemessene Teil liegt <b>${esc(b.markSide || 'links')}</b> von der Zange.
          ${others.length ? `<div class="alt">${others.map(m => `oder „${esc(m.name)}“ (gemessener Teil ${esc(m.side)}) → ${Math.abs(m.k - k) < 0.05 ? 'gleicher Strich' : `Strich ${fmt(Math.abs(m.k - k))} mm ${m.k > k ? 'weiter weg vom' : 'näher zum'} gemessenen Ende`}`).join(' · ')}</div>` : ''}</li>
        ${j ? `<li>${rotText(phi)}</li>` : ''}
        <li>Biegen bis Skala <b class="hl">${fmt(b.angle)}°</b></li>
        <li class="check">✓ Kontrolle: ${checkText(L, j)}</li>
      </ol>${j ? `<div class="rotbox">${rotSvg(phi)}<div><span style="color:var(--mark)">▲ Biegerichtung</span><br><span style="color:var(--accent)">━ voriger Schenkel</span><br>Blick zum freien Ende</div></div>` : ''}</div></div>`;
  });

  if (bends.length) {
    h += `<div class="card"><h3>Details</h3><div class="scroll-x"><table class="det">
      <tr><th>Nr.</th><th>Winkel</th><th>Drehung</th><th>Gerade davor</th><th>Tangente</th><th>Bogen</th><th>Biegeanfang</th><th>Markierung</th></tr>
      ${bends.map((b, j) => `<tr><td>${j + 1}</td><td>${fmt(b.angle)}°</td><td>${j ? fmt(normRot(b.rot)) + '°' : '–'}</td><td>${fmt(L.straights[j])}</td><td>${fmt(b.T)}</td><td>${fmt(b.B)}</td><td>${fmt(b.start)}</td><td>${fmt(b.mark)}</td></tr>`).join('')}
      <tr><td>Ende</td><td></td><td></td><td>${fmt(L.straights.at(-1))}</td><td></td><td></td><td></td><td></td></tr>
      </table></div><p class="hint">Alle Maße in mm, gemessen auf der Rohrmitte. Gerade + Bögen ergeben den Zuschnitt.</p></div>`;
  }
  if (lab) h += montageHtml(p, f) + materialHtml(p, f);
  $('#tab-guide').innerHTML = h;
}

$('#tab-guide').addEventListener('change', e => { if (e.target.id === 'gPipe') { db.currentId = e.target.value; fullRender(); } });
$('#tab-guide').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn?.id === 'gPrint') { printPlan(); return; }
  if (btn?.dataset.gp) { guidePipe = +btn.dataset.gp; highlight = -1; renderGuide(); draw(); return; }
  if (btn?.id === 'gWake') { setWake(!wakeLock); return; }
  if (btn?.id === 'gBig') {
    const on = document.body.classList.toggle('bigtext');
    try { localStorage.setItem('biege.big', on ? '1' : '0'); } catch {}
    renderGuide(); return;
  }
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
// lab: nur mit eingeschaltetem Labor sichtbar
const PF = [
  ['name', 'Bezeichnung', 'text', ''],
  ['D', 'Rohr-Außendurchmesser (mm)', 'num', ''],
  ['R', 'Biegeradius auf Rohrmitte (mm)', 'num', 'Steht meist auf der Zange. Die Marken L/R liegen um diesen Radius neben „0“.'],
  ['minStraight', 'Mindest-Gerade zwischen Bögen (mm)', 'num', 'Kürzeste gerade Strecke, die die Zange noch greift.'],
  ['clampMax', 'Schellen: größter Abstand (mm)', 'num', 'Entlang des Rohrs, auch über Bögen hinweg.', 'lab'],
  ['clampBend', 'Schellen: Abstand vom Bogen (mm)', 'num', 'Gemessen vom Bogenende bzw. -anfang.', 'lab'],
  ['clampMin', 'Schellen: kleinster Abstand auf einer Geraden (mm)', 'num', 'Kämen zwei Schellen zwischen zwei Bögen näher, wird nur eine in die Mitte gesetzt.', 'lab'],
  ['clampEnd', 'Schellen: Abstand vom Rohrende (mm)', 'num', '', 'lab'],
  ['clampH', 'Schellenhöhe (mm)', 'num', 'Untergrund bis Rohrmitte – ergibt den Wandabstand.', 'lab'],
  ['stock', 'Stangenlänge (mm)', 'num', 'Für den Zuschnitt-Plan.', 'lab'],
];
const curTool = () => db.profiles.find(x => x.id === toolProfId);

function renderTools() {
  const f = curTool() || db.profiles[0];
  toolProfId = f.id;
  const p = proj(), sc = scene(p);
  $('#tab-tools').innerHTML = `
  <div class="card">
    <h3>Projekt</h3>
    <div class="row2">
      <label>Projektname<input id="sName" autocomplete="off" value="${esc(sc.name)}"></label>
      <label>Rohrname<input id="sPipe" autocomplete="off" value="${esc(p.name)}"></label>
    </div>
    <label style="margin-bottom:10px">Zange für alle Rohre<select id="sProf">${db.profiles.map(x => `<option value="${x.id}"${x.id === p.profileId ? ' selected' : ''}>${esc(x.name)} · R ${fmt(x.R)}</option>`).join('')}</select></label>
    <div class="row2">
      <label>Zugabe Anfang (mm)<input id="sZugA" inputmode="decimal" placeholder="0" value="${fin(p.zugA)}"></label>
      <label>Zugabe Ende (mm)<input id="sZugE" inputmode="decimal" placeholder="0" value="${fin(p.zugE)}"></label>
    </div>
    <div class="btnrow"><button id="pDup">Duplizieren</button><button id="pExport">Teilen / Export</button><button id="pImport">Import</button><button id="pDel" class="danger">Löschen</button></div>
  </div>
  <div class="card">
    <h3>Zangen</h3>
    <label>Zange / Rohr-Profil<select id="tSel">${db.profiles.map(x => `<option value="${x.id}"${x.id === f.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <div class="btnrow" style="margin:10px 0 0"><button id="tNew">Neues Profil</button><button id="tDel" class="danger">Löschen</button></div>
  </div>
  <div class="card">${PF.filter(x => lab || !x[4]).map(([k, l, t, hlp]) => `<label style="margin-bottom:10px">${l}<input data-pf="${k}" data-t="${t}" ${t === 'num' ? 'inputmode="decimal"' : ''} value="${esc(t === 'num' ? fin(f[k]) : f[k])}">${hlp ? `<small>${hlp}</small>` : ''}</label>`).join('')}</div>
  <div class="card">
    <h3>Labor</h3>
    <label class="chk"><input type="checkbox" id="labChk"${lab ? ' checked' : ''}> Rohr-Eingabe, Raum, Wände &amp; Schellen (experimentell)</label>
    <p class="hint" style="margin-bottom:0">Blendet die Reiter „Rohr“ und „Raum“, Schellen, Ziel-Anschluss sowie Montage und Material in der Anleitung ein. Ausgeschaltet bleiben die Daten erhalten, werden aber nicht gerechnet.</p>
  </div>
  <div class="card">
    <h3>App</h3>
    <div class="appinfo"><span>Version <b>${APP_VERSION}</b> vom ${APP_DATE}</span><span id="appStatus">${updateStatus()}</span><button id="reloadBtn">Neu laden</button></div>
  </div>`;
}

const afterProfileChange = () => { save(); renderProjectBar(); recompute(); };

$('#tab-tools').addEventListener('input', e => {
  const el = e.target, f = curTool(), p = proj();
  if (el.id === 'sName') { scene(p).name = el.value; save(); renderProjectBar(); return; }
  if (el.id === 'sPipe') { p.name = el.value; save(); return; }
  if (el.id === 'sZugA' || el.id === 'sZugE') { const k = el.id === 'sZugA' ? 'zugA' : 'zugE'; commit(k); scenePipes(p).forEach(q => { q[k] = num(el.value); }); recompute(); return; }
  if (el.dataset.pf) {
    f[el.dataset.pf] = el.dataset.t === 'num' ? num(el.value) : el.value;
    if (el.dataset.pf === 'name') $('#tSel').selectedOptions[0].textContent = el.value;
    afterProfileChange();
  }
});
$('#tab-tools').addEventListener('change', e => {
  if (e.target.id === 'labChk') { setLab(e.target.checked); return; }
  if (e.target.id === 'sProf') { commit(); scenePipes().forEach(q => { q.profileId = e.target.value; }); recompute(); return; }
  if (e.target.id === 'tSel') { toolProfId = e.target.value; renderTools(); }
});
$('#tab-tools').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const f = curTool();
  if (b.id === 'reloadBtn') { reloadApp(); return; }
  if (b.id === 'pDup') { dupScene(); renderTools(); return; }
  if (b.id === 'pDel') { delScene().then(renderTools); return; }
  if (b.id === 'pExport') { exportProject(); return; }
  if (b.id === 'pImport') { $('#pImportFile').click(); return; }
  if (b.id === 'tNew') {
    const n = { ...structuredClone(f), id: uid(), name: 'Neue Zange' };
    db.profiles.push(n); toolProfId = n.id; save(); renderTools(); renderProjectBar();
  } else if (b.id === 'tDel') {
    if (db.profiles.length < 2) { toast('Das letzte Profil kann nicht gelöscht werden.'); return; }
    ask(`Profil „${f.name}“ löschen?`).then(ok => {
      if (!ok) return;
      db.profiles = db.profiles.filter(x => x.id !== f.id);
      db.projects.forEach(p => { if (p.profileId === f.id) p.profileId = db.profiles[0].id; });
      toolProfId = null; renderTools(); afterProfileChange();
    });
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
// Nach dem Bearbeiten neu einpassen – außer der Nutzer hat selbst gedreht, geschoben oder gezoomt (cam.held)
const ZOOM_IN_AT = 1.5; // Einzoomen erst, wenn das Rohr nur noch zwei Drittel des Platzes braucht
let refitDue = false, fitGlide = null;
const refit = () => { refitDue = true; };
const holdView = () => { fit = fitGlide ? lastBase : fit || lastBase; fitGlide = null; cam.held = true; navT = performance.now(); settleSoon(SETTLE_MS + 20); };
// extOpen: Fortführ-Pfeile am Rohrende eingeblendet (Griff angetippt), extHover: Maus über dem Griff
let extOpen = false, extHover = false;
// startOpen: Pfeile am Griff des Rohranfangs offen, bundleSel: gewähltes Parallelrohr (Index in p.bundle)
let startOpen = false, bundleSel = -1;
const BUNDLE_GZ = ['start', 'bnew', 'bdist', 'brot', 'pt', 'plane', 'pmove', 'lmove', 'ofs', 'ofsc', 'spin', 'cmove', 'first', 'cofs'];
// ofs: Versatz-X auf Schenkel i, t mm ab dessen Anfang, ang = Winkel, n = gewählte Ebene (null = automatisch), cur = angezeigte Ebene
let ofs = null;
// selPoint: gewählter Punkt { pid, w }, selPlane: gewählte Ebene, pointMove: Verschiebepfeile, pick: Maß wird festgelegt { key, to }
let selPoint = null, selPlane = null, pointMove = false, pick = null;
// create: Befehl „Rohr anlegen“ { step 'ref'|'ofs', ref, off, hover }, lastOff: Versatz des letzten angelegten Rohrs
let create = null, lastOff = null;
// measure: Befehl „Messen“ { a, b, hover, turn }: Punkte wie beim Anlegen, turn = Achsfolge im Bild
let measure = null;
const inCmd = () => !!(create || measure);
let sel = -1, selCorner = -1, drag = null; // gewählter Schenkel bzw. Eckpunkt (Schnittpunkt), laufendes Ziehen eines Anfassers
let camTool = 'edit';      // 'edit' = Gimbal/Anfasser, 'clamp' = Schellen setzen
function resetView(v = 'iso') {
  const [y, q] = VIEWS[v];
  setView(y, q, v);
}
// Blickrichtung ändern, der Drehpunkt bleibt im Bild stehen: Zoom und Lage bleiben, wie sie sind
function turnTo(yaw, pitch, c) {
  const a = project(c), s = fit.sc * cam.zoom;
  cam.yaw = yaw; cam.pitch = pitch;
  const b = project(c);
  cam.panX -= (b.x - a.x) * s; cam.panY -= (b.y - a.y) * s;
}
function setView(yaw, pitch, v, c = null) {
  setTimeout(() => { if (!$('#legList').contains(document.activeElement)) renderInputs(); });
  if (c) { turnTo(yaw, pitch, c); cam.view = v; } else {
    cam.yaw = yaw; cam.pitch = pitch;
    cam.view = v; cam.zoom = 1; cam.panX = cam.panY = 0; cam.held = false; fit = null; fitGlide = null;
  }
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
  light: { fog: hex('#e4e7ea'), grid: 'rgba(40,50,62,.16)', shadow: 'rgba(25,35,50,.30)' },
  dark: { fog: hex('#2d3034'), grid: 'rgba(210,218,228,.10)', shadow: 'rgba(0,0,0,.5)' },
};
const niceStep = v => [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(s => s >= v) || 5000;

// ---------- Rohr in WebGL ----------
// Röhrenmodell entlang der Mittellinie, Licht von oben links vorne, leichter Tiefennebel.
// Dieselbe orthografische Projektion wie project(), damit Beschriftung und Gimbal deckungsgleich bleiben.
const glc = $('#cvGL');
const gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
let glp = null;
const VS = `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uM; uniform mat3 uR;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() { vec4 c = uM * vec4(aPos, 1.0); gl_Position = c; vN = uR * aNor; vC = aCol; vZ = c.z; }`;
const FS = `precision mediump float;
uniform vec3 uL; uniform vec3 uFog; uniform float uFogAmt; uniform float uAlpha;
varying vec3 vN; varying vec3 vC; varying float vZ;
void main() {
  vec3 n = normalize(vN);
  float d = max(dot(n, uL), 0.0);
  float s = pow(max(dot(n, normalize(uL + vec3(0.0, 0.0, -1.0))), 0.0), 36.0);
  vec3 col = vC * (0.42 + 0.62 * d) + vec3(0.30) * s;
  gl_FragColor = vec4(mix(col, uFog, clamp((vZ + 1.0) * 0.5, 0.0, 1.0) * uFogAmt) * uAlpha, uAlpha);
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
    glp = { p, buf: gl.createBuffer(), aPos: a('aPos'), aNor: a('aNor'), aCol: a('aCol'), uM: u('uM'), uR: u('uR'), uL: u('uL'), uFog: u('uFog'), uFogAmt: u('uFogAmt'), uAlpha: u('uAlpha') };
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
  if (n < 2) return [];
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
  return data;
}

// Szene: undurchsichtige Teile (Rohr, Nachbarrohre, Schellen) und halbtransparente Flächen (Wände, Boden, Decke)
function quadMesh(corners, n, c) {
  const [a, b, d, e] = corners, data = [], put = p => data.push(...p, ...n, ...c);
  [a, b, d, a, d, e].forEach(put);
  return data;
}
function renderSceneGL(W, H, dpr, sc, cx, cyy, scene) {
  if (!initGL()) { glc.hidden = true; return false; }
  const w = Math.round(W * dpr), h = Math.round(H * dpr);
  if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  // Projektion wie project(): Zeilen für Bildschirm-x, Bildschirm-y (nach unten) und Tiefe
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rx = [cy, -sy, 0], ry = [-sy * sp, -cy * sp, -cp], rz = [sy * cp, cy * cp, -sp];
  const opaque = new Float32Array(scene.opaque), trans = new Float32Array(scene.trans), refPl = new Float32Array(scene.refPl || []);
  let z0 = Infinity, z1 = -Infinity;
  for (const arr of [opaque, trans, refPl]) for (let i = 0; i < arr.length; i += 9) {
    const z = rz[0] * arr[i] + rz[1] * arr[i + 1] + rz[2] * arr[i + 2];
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (!Number.isFinite(z0)) { z0 = -1; z1 = 1; }
  const zc = (z0 + z1) / 2, zr = (z1 - z0) / 2 + 2;
  const rows = [
    [...V.mul(rx, 2 * sc / W), 2 * cx / W - 1],
    [...V.mul(ry, -2 * sc / H), 1 - 2 * cyy / H],
    [...V.mul(rz, 1 / zr), -zc / zr],
    [0, 0, 0, 1],
  ];
  const M = new Float32Array(16), R3 = new Float32Array(9);
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) M[c * 4 + k] = rows[k][c];
  [rx, ry, rz].forEach((row, k) => row.forEach((v, c) => { R3[c * 3 + k] = v; }));

  gl.useProgram(glp.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, glp.buf);
  const st = 36;
  [[glp.aPos, 0], [glp.aNor, 12], [glp.aCol, 24]].forEach(([loc, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, st, off); });
  gl.uniformMatrix4fv(glp.uM, false, M);
  gl.uniformMatrix3fv(glp.uR, false, R3);
  gl.uniform3fv(glp.uL, V.norm([-0.45, -0.65, -0.6]));
  gl.uniform3fv(glp.uFog, PAL[isDark() ? 'dark' : 'light'].fog.map(v => v / 255));
  gl.uniform1f(glp.uFogAmt, 0.3);

  gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(glp.uAlpha, 1);
  if (opaque.length) { gl.bufferData(gl.ARRAY_BUFFER, opaque, gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, opaque.length / 9); }
  if (trans.length) {
    // Flächen durchscheinend, ohne in den Tiefenpuffer zu schreiben – Rohr dahinter bleibt sichtbar
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(glp.uAlpha, 0.2);
    gl.bufferData(gl.ARRAY_BUFFER, trans, gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, trans.length / 9);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  if (refPl.length) { // Referenzebenen: sehr durchscheinend, Rohre bleiben davor und dahinter sichtbar
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(glp.uAlpha, 0.12);
    gl.bufferData(gl.ARRAY_BUFFER, refPl, gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, refPl.length / 9);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
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

// Anzeige-Schalter (je Gerät gespeichert)
// Rohrfarben (mit Schalter im Anzeige-Menü abschaltbar)
const COLOR_NAMES = ['Blau', 'Rot', 'Grün', 'Orange', 'Violett', 'Türkis', 'Pink', 'Braun'];
const PIPE_COLORS = [[0.13, 0.45, 0.85], [0.84, 0.2, 0.2], [0.15, 0.6, 0.33], [0.93, 0.55, 0.1], [0.55, 0.3, 0.8], [0.05, 0.63, 0.68], [0.85, 0.3, 0.6], [0.5, 0.38, 0.25]];
const rgbCss = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
const lighter = (c, t) => c.map(v => v + (1 - v) * t);
const VIS_DEFAULT = { snap: false, cornerMove: false, offsets: false, extAng: 90, tree: false, actsOpen: false, colors: true, labels: true, refPlanes: true, dimLevel: 'sel', axis: true, total: false, angles: false, marks: true, grid: true, planes: true, clamps: true, ghosts: true, extAlways: false };
let vis = { ...VIS_DEFAULT };
try { Object.assign(vis, JSON.parse(localStorage.getItem('biege.vis') || '{}')); } catch {}
const saveVis = () => { try { localStorage.setItem('biege.vis', JSON.stringify(vis)); } catch {} };

// Blickrichtung (vom Betrachter weg) in Weltkoordinaten – für die Puppenhaus-Ansicht
const viewDir = () => { const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch); return [sy * cp, cy * cp, -sp]; };
// Puppenhaus: Flächen, deren Raumseite vom Betrachter weg zeigt (Wand zwischen uns und dem Raum, Decke von oben), ausblenden
const planeVisible = pl => { const n = [0, 0, 0]; n[pl.axis] = pl.n; return V.dot(n, viewDir()) < 0.05; };

function render3d() {
  const layout = curLayout(); // während einer Animation das Zwischenbild
  if (!layout || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  fitCanvas(cv, ctx, W, H, dpr);
  fitCanvas(cvBg, bctx, W, H, dpr);
  const S = layout.samples;
  if (S.length < 2) return;
  const p = proj(), f = prof(), pal = PAL[isDark() ? 'dark' : 'light'], dark = isDark();
  const room = layout.room, showRoom = !!room && (vis.planes || camTool === 'room');
  const planes = showRoom ? layout.planes : [], ghosts = layout.ghosts || [];
  const pipes = [layout, ...layout.bundle.filter(B => !B.def.hidden)];

  // Grenzen fürs Einpassen: Rohre, Ziel; im Raum-Werkzeug der ganze Raum
  const shownOf = L => [L, ...L.bundle.filter(B => !B.def.hidden)];
  const collect = L => {
    const q = [...shownOf(L).flatMap(B => B.samples.map(s => s.p)), ...(L.ghosts || []).flatMap(g => g.samples.map(s => s.p)), ...(p.target ? [p.target] : []), ...(vis.refPlanes ? scene(p).planes.filter(pl => !pl.hidden).flatMap(planeCorners) : [])];
    if (camTool === 'room' && room) room.outline.forEach(([x, y]) => { q.push([x, y, room.z0 || 0], [x, y, (room.z0 || 0) + room.height]); });
    if (camTool === 'room' && roomDraw) roomDraw.pts.forEach(([x, y]) => q.push([x, y, roomDraw.z0]));
    return q;
  };
  const floorOf = q => {
    const mn = [0, 1, 2].map(k => Math.min(...q.map(c => c[k]))), mx = [0, 1, 2].map(k => Math.max(...q.map(c => c[k])));
    return room ? room.z0 || 0 : mn[2] - Math.max(f.D * 3, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 0.12 || 0.12);
  };
  const ortho = isOrtho(), fitPts = collect(layout);
  const mn = [0, 1, 2].map(k => Math.min(...fitPts.map(c => c[k]))), mx = [0, 1, 2].map(k => Math.max(...fitPts.map(c => c[k])));
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1, zf = floorOf(fitPts);
  const fp = ortho || !vis.grid ? [] : pipes.map(L => L.samples.map(s => project([s.p[0], s.p[1], zf])));
  // Einpassen: Maßstab und Mitte für ein Rohr
  const fitOf = L => {
    const q = collect(L), z = floorOf(q), all = q.map(c => project(c));
    if (!ortho && vis.grid && !room) shownOf(L).forEach(B => B.samples.forEach(s => all.push(project([s.p[0], s.p[1], z]))));
    const xs = all.map(c => c.x), ys = all.map(c => c.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // Rand für Gimbal-Pfeile (~70 px) und oben für die Ansichtsbuttons
    const side = Math.min(90, W * 0.12), top = Math.min(120, H * 0.18), bottom = Math.min(80, H * 0.12);
    return { sc: Math.min((W - 2 * side) / Math.max(x1 - x0, 1), (H - top - bottom) / Math.max(y1 - y0, 1)), mx: (x0 + x1) / 2, my: (y0 + y1) / 2, dy: (top - bottom) / 2, W, H };
  };
  if (fit && !ortho && !cam.held && (fit.W !== W || fit.H !== H)) fit = null; // Fenstergröße geändert
  // Nach einer Änderung nur nachführen, wenn es sich lohnt: raus, sobald das Rohr nicht mehr passt, rein erst bei deutlich weniger Platzbedarf
  if (refitDue && fit && !ortho && !cam.held) {
    const c = fitOf(finalLayout()), far = Math.abs(c.mx - fit.mx) * fit.sc > W * 0.2 || Math.abs(c.my - fit.my) * fit.sc > H * 0.2;
    if (c.sc < fit.sc * 0.98 || c.sc > fit.sc * ZOOM_IN_AT || far) fitGlide = { a: fit, b: c, t0: performance.now() };
  }
  refitDue = false;
  let base = fit;
  if (fitGlide) {
    const { a, b: e, t0 } = fitGlide, t = Math.min(1, (performance.now() - t0) / ANIM_MS), k = ease(t);
    base = { ...e, sc: lerpN(a.sc, e.sc, k), mx: lerpN(a.mx, e.mx, k), my: lerpN(a.my, e.my, k) };
    if (t < 1) requestAnimationFrame(() => draw()); else { fit = e; fitGlide = null; }
  } else if (!base) fit = base = fitOf(layout); // Maßstab festhalten, damit beim Bearbeiten nichts springt
  lastBase = base;
  const sc = base.sc * cam.zoom;
  const cx = W / 2 + cam.panX - base.mx * sc, cyy = H / 2 + base.dy + cam.panY - base.my * sc;
  const P = q => [cx + q.x * sc, cyy + q.y * sc];
  const P3 = q => P(project(q));
  view = { P3, sc, cx, cyy, mid: mn.map((v, k) => (v + mx[k]) / 2) };
  const tw = Math.max(2, f.D * sc);

  if (vis.grid && ortho) {
    // Ebenenraster der Ansicht
    const gs = niceStep(28 / sc), px = gs * sc;
    bctx.lineWidth = 1;
    for (const major of [false, true]) {
      bctx.strokeStyle = major ? pal.grid.replace(/[\d.]+\)$/, m => `${Math.min(1, parseFloat(m) * 2.2)})`) : pal.grid;
      bctx.beginPath();
      for (let k = Math.ceil(-cx / px); k * px + cx <= W; k++) if ((k % 5 === 0) === major) { bctx.moveTo(cx + k * px, 0); bctx.lineTo(cx + k * px, H); }
      for (let k = Math.ceil(-cyy / px); k * px + cyy <= H; k++) if ((k % 5 === 0) === major) { bctx.moveTo(0, cyy + k * px); bctx.lineTo(W, cyy + k * px); }
      bctx.stroke();
    }
  } else if (vis.grid) {
    // Boden: Raster (im Raum über den ganzen Grundriss) und weicher Schatten der Rohre
    const lo = room ? [Math.min(...room.outline.map(q => q[0])), Math.min(...room.outline.map(q => q[1]))] : [mn[0], mn[1]];
    const hi = room ? [Math.max(...room.outline.map(q => q[0])), Math.max(...room.outline.map(q => q[1]))] : [mx[0], mx[1]];
    const step = niceStep(Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 8 || diag / 6);
    const pad = room ? 0 : 1;
    const gx0 = Math.floor(lo[0] / step - pad) * step, gx1 = Math.ceil(hi[0] / step + pad) * step;
    const gy0 = Math.floor(lo[1] / step - pad) * step, gy1 = Math.ceil(hi[1] / step + pad) * step;
    bctx.save();
    if (room) { // Raster nur innerhalb des Grundrisses
      bctx.beginPath(); room.outline.forEach(([x, y], i) => { const [a, b] = P3([x, y, zf]); i ? bctx.lineTo(a, b) : bctx.moveTo(a, b); }); bctx.closePath(); bctx.clip();
    }
    bctx.strokeStyle = pal.grid; bctx.lineWidth = 1; bctx.beginPath();
    for (let x = gx0; x <= gx1 + 1e-6; x += step) { const [ax, ay] = P3([x, gy0, zf]), [bx, by] = P3([x, gy1, zf]); bctx.moveTo(ax, ay); bctx.lineTo(bx, by); }
    for (let y = gy0; y <= gy1 + 1e-6; y += step) { const [ax, ay] = P3([gx0, y, zf]), [bx, by] = P3([gx1, y, zf]); bctx.moveTo(ax, ay); bctx.lineTo(bx, by); }
    bctx.stroke();
    bctx.restore();
    const off = 10000; // Pfad außerhalb zeichnen, nur der Schatten fällt ins Bild
    bctx.save();
    bctx.shadowColor = pal.shadow; bctx.shadowBlur = Math.max(6, tw * 2) * dpr; bctx.shadowOffsetX = off * dpr;
    bctx.lineWidth = tw * 1.3; bctx.lineCap = 'round'; bctx.lineJoin = 'round'; bctx.strokeStyle = '#000';
    fp.forEach(line => { bctx.beginPath(); line.forEach((q, i) => { const [x, y] = P(q); i ? bctx.lineTo(x - off, y) : bctx.moveTo(x - off, y); }); bctx.stroke(); });
    bctx.restore();
  }

  // 3D-Szene: Rohre, Nachbarrohre im Raum, Schellen-Hülsen, Raumflächen
  const r = Math.max(f.D / 2, 1 / sc); // maßstäblich, nur unter 2 px bleibt das Rohr sichtbar
  const steel = dark ? [0.56, 0.6, 0.66] : [0.66, 0.7, 0.75], orange = [0.91, 0.36, 0.06];
  const ghostCol = dark ? [0.42, 0.46, 0.52] : [0.76, 0.79, 0.83], clampCol = dark ? [0.85, 0.86, 0.9] : [0.2, 0.22, 0.26];
  const opaque = [], add = (arr, out = opaque) => { for (let i = 0; i < arr.length; i++) out.push(arr[i]); };
  const bad = [0.88, 0.2, 0.2]; // nicht verlegbares Parallelrohr
  // Rohr 1 in Rohrfarbe (sonst Stahl), Parallelrohre dezent heller; die anderen Rohre der Szene treten zurück
  const tone = vis.colors && p.color != null ? PIPE_COLORS[p.color] : steel, par = lighter(tone, dark ? 0.2 : 0.38);
  (p.unrouted ? [] : pipes).forEach((L, k) => add(tubeMesh(L.samples, r, (a, b) => (k && (L.short || L.clash) ? bad : k === guidePipe && a.b >= 0 && a.b === b.b && a.b === highlight ? orange : k ? par : tone))));
  ghosts.filter(g => !g.unrouted).forEach(g => add(tubeMesh(g.samples, Math.max(g.D / 2, 1 / sc), () => (vis.colors && g.color != null ? lighter(PIPE_COLORS[g.color], 0.35) : ghostCol))));
  const clampSets = pipes.map(L => L.clampInfo);
  if (vis.clamps) clampSets.flat().forEach(c => add(tubeMesh([{ p: V.sub(c.p, V.mul(c.t, 5)), b: -1 }, { p: V.add(c.p, V.mul(c.t, 5)), b: -1 }], r * 1.45 + 0.8, () => clampCol)));
  const trans = [], wallCol = [0.85, 0.74, 0.55], floorCol = [0.55, 0.62, 0.72];
  const visiblePlanes = planes.filter(planeVisible);
  visiblePlanes.forEach(pl => {
    const n = [0, 0, 0]; n[pl.axis] = pl.n;
    if (pl.poly) { // Boden/Decke: Grundriss in Dreiecken
      triangulate(pl.poly).forEach(([i, j, k]) => add([pl.poly[i], pl.poly[j], pl.poly[k]].flatMap(([x, y]) => [x, y, pl.c, ...n, ...floorCol]), trans));
    } else {
      const u = pl.axis === 0 ? 1 : 0, e = pl.ext, pt = (a, z) => { const q = [0, 0, z]; q[pl.axis] = pl.c; q[u] = a; return q; };
      add(quadMesh([pt(e[u][0], e[2][0]), pt(e[u][1], e[2][0]), pt(e[u][1], e[2][1]), pt(e[u][0], e[2][1])], n, wallCol), trans);
    }
  });
  const refPl = [];
  if (vis.refPlanes) scene(p).planes.filter(pl => !pl.hidden).forEach(pl => { // gefüllt nur, wenn gewählt oder gerade Ziel eines Maßes
    if (selPlane !== pl.id && !pick) return;
    const n = [0, 0, 0]; n[pl.axis] = 1; add(quadMesh(planeCorners(pl), n, AX_RGB[pl.axis]), refPl);
  });
  if (!renderSceneGL(W, H, dpr, sc, cx, cyy, { opaque, trans, refPl })) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = tw; ctx.strokeStyle = css('--tube');
    pipes.forEach(L => { ctx.beginPath(); L.samples.forEach((s, i) => { const [x, y] = P3(s.p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
  }

  const cMark = css('--mark'), cAcc = css('--accent'), cText = css('--text'), cMuted = css('--muted');
  ctx.font = '600 12px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Raum: Grundriss am Boden und Deckenkanten, Wandnamen auf sichtbaren Wänden
  if (showRoom) {
    const z0 = room.z0 || 0, z1 = z0 + room.height;
    ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
    // Puppenhaus: nur Kanten sichtbarer Flächen – ausgeblendete Wände und die Decke von oben zeichnen nichts
    const edge = (a, b) => { const [x0, y0] = P3(a), [x1, y1] = P3(b); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); };
    ctx.beginPath();
    visiblePlanes.forEach(pl => {
      if (pl.poly) pl.poly.forEach(([x, y], i) => { const [nx, ny] = pl.poly[(i + 1) % pl.poly.length]; edge([x, y, pl.c], [nx, ny, pl.c]); });
      else {
        const u = pl.axis === 0 ? 1 : 0, e = pl.ext, pt = (a, z) => { const q = [0, 0, z]; q[pl.axis] = pl.c; q[u] = a; return q; };
        edge(pt(e[u][0], z0), pt(e[u][0], z1)); edge(pt(e[u][1], z0), pt(e[u][1], z1)); edge(pt(e[u][0], z1), pt(e[u][1], z1));
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    visiblePlanes.filter(pl => pl.kind === 'wall').forEach(pl => {
      const u = pl.axis === 0 ? 1 : 0, q = [0, 0, z1 - Math.min(150, room.height * 0.08)];
      q[pl.axis] = pl.c; q[u] = (pl.ext[u][0] + pl.ext[u][1]) / 2;
      const [x, y] = P3(q);
      ctx.fillStyle = cMuted; ctx.fillText(pl.name + (pl.pass ? ' ⇄' : ''), x, y);
    });
  }

  const ML = guidePipe ? layout.bundle[guidePipe - 1] || layout : layout; // Markierungen des Rohrs aus der Anleitung
  // Noch nicht verlegte Rohre: gestrichelte Verbindung S → E
  [...(p.unrouted ? [layout] : []), ...ghosts.filter(g => g.unrouted)].forEach(L => {
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = cMuted;
    ctx.beginPath(); ctx.moveTo(...P3(L.verts[0])); ctx.lineTo(...P3(L.verts.at(-1))); ctx.stroke(); ctx.restore();
  });
  if (vis.refPlanes) drawPlanesOverlay(P3);
  if (vis.axis && !p.unrouted) {
    // Achslinie: durchgehend von Rohranfang über alle Schnittpunkte bis zum Rohrende, mit hellem Rand gut sichtbar auf dem Rohr
    const line = L => { ctx.beginPath(); L.verts.forEach((q, i) => { const [x, y] = P3(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    pipes.forEach((L, k) => {
      if (k) { ctx.save(); ctx.globalAlpha = 0.55; line(L); ctx.strokeStyle = cAcc; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore(); return; } // Parallelrohre dezent
      line(L); ctx.strokeStyle = css('--card'); ctx.lineWidth = 4.5; ctx.stroke();
      line(L); ctx.strokeStyle = cAcc; ctx.lineWidth = 2.2; ctx.stroke();
      L.verts.slice(1, -1).forEach(q => { const [x, y] = P3(q); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fillStyle = cAcc; ctx.fill(); ctx.strokeStyle = css('--card'); ctx.lineWidth = 1.5; ctx.stroke(); });
    });
  }
  // Ausgeglichene Schenkel leuchten nach einer Änderung kurz orange auf
  const flashAge = performance.now() - adjusted.t;
  if (flashAge < 1400 && adjusted.set.size && layout.verts.length === p.deltas.length + 1) {
    ctx.save(); ctx.globalAlpha = 0.55 * (1 - flashAge / 1400); ctx.lineCap = 'round';
    adjusted.set.forEach(j => { const a = layout.verts[j], b = layout.verts[j + 1]; if (a && b) polyline([P3(a), P3(b)], cMark, Math.max(12, tw * 2.2)); });
    ctx.restore();
    requestAnimationFrame(() => draw());
  }
  // Schellen: Halter zur Wand, Nummer; ohne Befestigung orange
  if (vis.clamps) clampSets.forEach((set, k) => set.forEach((c, i) => {
    const [x, y] = P3(c.p);
    if (c.q) {
      const [qx, qy] = P3(c.q);
      ctx.strokeStyle = dark ? '#d0d4da' : '#3b4048'; ctx.lineWidth = 3; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(qx, qy); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(qx - 4, qy - 4, 8, 8);
    }
    const big = camTool === 'clamp' && k === 0;
    ctx.fillStyle = c.mount || !room ? (dark ? '#d0d4da' : '#3b4048') : '#f08c00';
    ctx.beginPath(); ctx.arc(x, y, big ? 9 : 6, 0, 7); ctx.fill();
    if (k === 0 && vis.labels && (big || vis.dimLevel !== 'quiet')) { ctx.fillStyle = cText; ctx.font = '600 10px system-ui'; ctx.fillText(`S${i + 1}`, x + 14, y - 10); ctx.font = '600 12px -apple-system, system-ui, sans-serif'; }
  }));

  // Selbstberührungen und Raum-Treffer
  (layout.collisions || []).forEach(c => {
    const [x, y] = P3(c.p);
    ctx.strokeStyle = '#e03131'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, Math.max(12, tw * 1.5), 0, 7); ctx.stroke();
  });
  pipes.flatMap(L => L.hits || []).forEach(h => {
    const [x, y] = P3(h.p), ok = h.type === 'through' && h.plane?.pass;
    ctx.strokeStyle = ok ? cAcc : '#e03131'; ctx.lineWidth = 3; ctx.setLineDash(ok ? [4, 3] : []);
    ctx.beginPath(); ctx.arc(x, y, Math.max(12, tw * 1.6), 0, 7); ctx.stroke(); ctx.setLineDash([]);
  });

  // Ziel-Anschluss: Fadenkreuz, gestrichelte Linie vom Rohrende
  if (lab && p.target && layout.targetDelta) {
    const [tx, ty] = P3(p.target), [ex, ey] = P3(layout.E), hit = V.len(layout.targetDelta) < 0.5;
    const col = hit ? css('--ok') : '#7048e8';
    if (!hit) { ctx.setLineDash([4, 4]); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx, ty, 11, 0, 7); ctx.moveTo(tx - 16, ty); ctx.lineTo(tx + 16, ty); ctx.moveTo(tx, ty - 16); ctx.lineTo(tx, ty + 16); ctx.stroke();
    ctx.fillStyle = col; ctx.font = '700 11px system-ui'; ctx.fillText('Ziel', tx, ty + 26); ctx.font = '600 12px -apple-system, system-ui, sans-serif';
  }

  // Strich-Markierungen (des Rohrs aus der Anleitung) und Rohranfänge
  if (vis.marks) ML.bends.forEach((b, j) => {
    const [x, y] = P3(pointAt(ML.samples, b.mark));
    ctx.fillStyle = cMark; ctx.beginPath(); ctx.arc(x, y, j === highlight ? 12 : 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 12px -apple-system, system-ui, sans-serif'; ctx.fillText(j + 1, x, y + 0.5);
  });
  ctx.fillStyle = cText; ctx.font = '700 13px -apple-system, system-ui, sans-serif';
  if (scenePipes(p).length < 2 && vis.labels) { const [sx, sy] = P3(S[0].p); ctx.fillText('A', sx - 14, sy - 12); } // Parallelrohre beginnen daneben – ein „A“ genügt

  if (camTool === 'room') { gizmo = []; drawRoomOverlay(P3); }
  else if (camTool !== 'clamp' && !printing && !animLayout) {
    if (ortho && !inCmd() && !p.stub) drawEditOverlay(P3, cAcc);
    drawGizmo();
  } else gizmo = [];

  // Maße nach dem Gimbal: Sie weichen den Griffen aus und liegen obenauf, damit sie lesbar und antippbar bleiben
  dimHits = []; placed = []; spotSeen = new Map();
  pipeSegs = pipes.flatMap(L => L.verts.slice(1).map((q, k) => [...P3(L.verts[k]), ...P3(q)]));
  // Stufe: Ruhig = nur das Angetippte, Auswahl = dazu kleine Längen, Alle = alles
  const allDims = vis.dimLevel === 'all';
  if (!p.unrouted) [...new Set([layout, ML])].forEach(L => drawDims(L, P3, tw, L === layout));
  if (camTool === 'edit' && (allDims || bundleSel >= 0 || (selPoint?.pid === p.id && selPoint.w === 'S'))) drawBundleDims(layout, P3);
  if (camTool === 'edit') drawRefDims(P3, allDims);
  if (camTool === 'edit') drawLocks(P3);
  if (create?.step === 'ofs') dimSegs(axisSegs(create.ref.pos, create.off), P3);
  if (measure) { const m = measureResult(); if (m) dimSegs(axisSegs(m.S, m.d, MEASURE_TURNS[measure.turn]), P3); }
  // Fangen: Hilfslinie zum Punkt, auf dessen Höhe der gezogene Punkt eingerastet ist
  if (gz && snapLine) {
    const [bx, by] = P3(snapLine.of()), ring = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
    ctx.save(); ctx.strokeStyle = css('--mark');
    if (snapLine.plane) {
      ctx.lineWidth = 2.5; ctx.beginPath(); planeCorners(snapLine.plane).forEach(q => ctx.lineTo(...P3(q))); ctx.closePath(); ctx.stroke();
    } else {
      const [ax, ay] = P3(snapLine.at);
      ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2; ring(ax, ay, 5);
    }
    ctx.lineWidth = 2; ring(bx, by, 7);
    ctx.restore();
  }
  // Eckpunkt verschieben: Der Weg steht beim Ziehen am Rohr
  if (gz?.type === 'cmove' && gz.t) { const a = P3(gz.A0), b = P3(points(p)[gz.i]); dimLine(a, b, fmt(Math.abs(gz.t)), P3(points(p)[gz.i - 1]), 26, null, {}); }
  // Versatzmaße: Bei jedem schrägen Schenkel der Versatz quer zum Schenkel davor, antippbar
  if (vis.offsets && !p.unrouted && !gz && camTool === 'edit') {
    const q3 = points(p);
    p.deltas.forEach((d, j) => {
      const o = j && !etageAt(p, j - 1) ? offsetOf(p, j) : null; // der Schenkel hinter einer Schräge läuft nur wieder geradeaus
      if (o) dimLine(P3(V.sub(q3[j + 1], o.w)), P3(q3[j + 1]), fmt(r1(o.v)), P3(q3[j]), 30, { offV: j }, {});
    });
  }
  // Schräger Abgang am Rohrende: das Versatzmaß quer zum Schenkel davor, bei 90° ist es der Schenkel selbst
  if (gz?.type === 'ext' && p.deltas.length > gz.orig.length && (vis.extAng || 90) !== 90) {
    const end = points(p).at(-1), rel = V.sub(end, gz.E), foot = V.add(gz.E, V.mul(gz.d, V.dot(rel, gz.d))), v = V.len(V.sub(end, foot));
    if (v > 0.5) dimLine(P3(foot), P3(end), fmt(r1(v)), P3(gz.E), 30, null, {});
  }
  // Beim Ziehen des Versatzes steht sein Maß am Rohr, quer zur Rohrachse am Ende der Schräge
  if (gz?.type === 'ofs' && gz.v > 0.5 && p.deltas.length >= gz.dOrig.length + 2) {
    const q = points(p)[ofs.i + 2], c = V.sub(q, V.mul(gz.dir, gz.v * gz.s)), end = P3(q), foot = P3(c), mid = [(end[0] + foot[0]) / 2, (end[1] + foot[1]) / 2];
    const leg = P3(points(p)[ofs.i + 3] || q), away = [mid[0] * 2 - leg[0], mid[1] * 2 - leg[1]];
    dimLine(foot, end, fmt(gz.v), away, 30, null, {});
  }
  // Versatz-Startpunkt: beide Teilstücke des Schenkels als Maß am Rohr, antippbar
  if (ofs && gz?.type !== 'ofs' && layout.verts[ofs.i + 1]) {
    const A = layout.verts[ofs.i], B = layout.verts[ofs.i + 1], len = V.len(V.sub(B, A)), t = Math.min(ofs.t, len), C = V.add(A, V.mul(V.norm(V.sub(B, A)), t)), mid = P3(V.mul(V.add(A, B), 0.5)), awayPt = [mid[0], mid[1] + 1000];
    dimLine(P3(A), P3(C), fmt(t), awayPt, 34, { ofsPart: 0 });
    dimLine(P3(C), P3(B), fmt(len - t), awayPt, 34, { ofsPart: 1 });
  }
  if (vis.total || allDims) drawTotal(layout, P3, tw);
  if (vis.angles || allDims) drawAngles(ML, P3);
  else if (selCorner >= 1 && layout.bends[selCorner - 1]) drawAngles(layout, P3, selCorner - 1);

  if (gz?.label) pill(gz.label, gz.px, gz.py, css('--accent'));

  drawCube();
  // Achsenkreuz nur im Ausdruck, sonst sitzt es am Würfel
  const gx = 34, gy = H - 34;
  if (printing) [['X', [1, 0, 0], '#e03131'], ['Y', [0, 1, 0], '#2f9e44'], ['Z', [0, 0, 1], '#1c7ed6']].forEach(([n, v, c]) => {
    const q = project(v);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + q.x * 22, gy + q.y * 22); ctx.stroke();
    ctx.fillStyle = c; ctx.font = '700 11px system-ui'; ctx.fillText(n, gx + q.x * 30, gy + q.y * 30);
  });
}

// ---------- Bemaßung wie in der technischen Zeichnung ----------
// Je Schenkel eine parallele Maßlinie neben dem Rohr (Hilfslinien an den Schnittpunkten, Pfeile, Maßzahl auf der Linie).
// Die Maße von Rohr 1 lassen sich antippen und direkt ändern (wie im Skizzenmodus von Fusion 360).
let dimHits = [];
// Eine Maßlinie zwischen den Bildpunkten a und b: Hilfslinien, Pfeile, Maßzahl. Die Linie liegt auf der Seite weg von away.
// hit: Angaben fürs Antippen ({ i } = Schenkellänge, { i, k } = Anteil in Achse k), null = nur Anzeige.
function dimLine(a, b, val, away, off, hit, style = {}) {
  const [ax, ay] = a, [bx, by] = b, len = Math.hypot(bx - ax, by - ay);
  const ink = style.color || (style.driven || style.minor ? css('--muted') : css('--text'));
  if (len < 6 && style.minor) return; // Anteil zeigt in die Ansicht hinein – Hilfsmaß weglassen
  if (style.driven) val = `(${val})`; // abgeleitetes Maß (Ausgleich) wie in Fusion in Klammern
  if (style.lock) val += ' 🔒';
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  let ux = 1, uy = 0, nx = 0, ny = -1;
  if (len > 1) { ux = (bx - ax) / len; uy = (by - ay) / len; nx = -uy; ny = ux; }
  const side = (mx - away[0]) * nx + (my - away[1]) * ny;
  if (side < -0.5 || (Math.abs(side) <= 0.5 && ny > 0)) { nx = -nx; ny = -ny; }
  let ang = Math.atan2(uy, ux);
  if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
  if (len < 14) ang = 0;
  const fontPx = style.minor || style.plain ? 11 : 12;
  ctx.save();
  ctx.font = `${style.minor ? 600 : 700} ${fontPx}px -apple-system, system-ui, sans-serif`;
  const w = ctx.measureText(val).width + 8, h = fontPx + 4;
  // Platz suchen: bevorzugte Seite, dann weiter außen, dann die andere Seite – die Maßzahl soll keine andere und kein Rohr überdecken
  // Reicht das nicht (Griffe sitzen meist auf der Mitte), rutscht die Zahl auf der Maßlinie zur Seite
  const spots = [[1, off], [1, off + 18], [-1, off], [1, off + 36], [-1, off + 18]];
  const tries = [0, ...(len > 70 ? [0.3, -0.3] : [])].flatMap(t => spots.map(q => [...q, t * len]));
  const spot = i => { const [sg, o, t] = tries[i], tx = mx + ux * t + nx * sg * o, ty = my + uy * t + ny * sg * o; return { sg, o, tx, ty, box: labelBox(tx, ty, w, h, ang) }; };
  const key = hit ? `${hit.i}/${hit.k}/${hit.bgap}/${hit.key}/${hit.legRef}/${hit.ofsPart}/${hit.offV}` : `${style.color}/${val}`;
  const { sg, o, tx, ty, box } = spot(chooseSpot(key, tries, i => overlapCost(spot(i).box))), Nx = nx * sg, Ny = ny * sg;
  placed.push(box);
  const A = [ax + Nx * o, ay + Ny * o], B = [bx + Nx * o, by + Ny * o];
  ctx.lineWidth = style.plain || style.minor ? 0.7 : 1; ctx.strokeStyle = ink; ctx.fillStyle = ink;
  if (style.plain) ctx.globalAlpha = 0.6;
  if (len >= (style.plain ? 40 : 14)) { // bei kurzen, nicht gewählten Maßen genügt die Zahl
    // Hilfslinien vom Messpunkt bis etwas über die Maßlinie
    const g = ctx.globalAlpha; ctx.globalAlpha = g * 0.45; ctx.beginPath();
    const from = style.plain ? o - 8 : 5;
    for (const [px, py] of [[ax, ay], [bx, by]]) { ctx.moveTo(px + Nx * from, py + Ny * from); ctx.lineTo(px + Nx * (o + 4), py + Ny * (o + 4)); }
    ctx.stroke(); ctx.globalAlpha = g;
    // Maßlinie mit Pfeilen (bei kurzen Maßen Pfeile außen)
    const inside = len > 34, ah = style.minor ? 6 : 7, aw = style.minor ? 2.2 : 2.6;
    ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B);
    if (!inside) { ctx.moveTo(A[0] - ux * 14, A[1] - uy * 14); ctx.lineTo(...A); ctx.moveTo(...B); ctx.lineTo(B[0] + ux * 14, B[1] + uy * 14); }
    ctx.stroke();
    const arrowHead = ([px, py], dx, dy) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - dx * ah - dy * aw, py - dy * ah + dx * aw); ctx.lineTo(px - dx * ah + dy * aw, py - dy * ah - dx * aw); ctx.closePath(); ctx.fill(); };
    if (inside) { arrowHead(A, -ux, -uy); arrowHead(B, ux, uy); } else { arrowHead(A, ux, uy); arrowHead(B, -ux, -uy); }
  }
  // Maßzahl auf der Linie, lesbar ausgerichtet (nie auf dem Kopf)
  ctx.globalAlpha = 1;
  ctx.translate(tx, ty); ctx.rotate(ang);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Änderbare Maße heben sich unter der Maus hervor
  const hot = !!hit && hover?.dk === key;
  if (hot) { ctx.fillStyle = css('--accent-soft'); ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4); ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4); }
  else if (style.plain || style.minor) { ctx.strokeStyle = css('--card'); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeText(val, 0, 0.5); } // nur Text mit hellem Rand
  else {
    ctx.fillStyle = css('--card'); ctx.fillRect(-w / 2, -h / 2, w, h);
    if (hit) { ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h); }
  }
  ctx.fillStyle = hit && !style.driven && !style.minor && !style.color ? css('--accent') : ink; ctx.fillText(val, 0, 0.5);
  ctx.restore();
  if (hit) dimHits.push({ ...hit, key, x: tx, y: ty, w: Math.max(w, 36), h: 30, ang });
}
// Jede Maßzahl behält ihren Platz: Beim Zoomen, Drehen und Ziehen wird nicht neu gesucht, sonst springen die Zahlen bei jedem Bild.
// Erst danach sucht sie einmal neu, und wechselt dann nur, wenn der neue Platz frei ist oder deutlich weniger verdeckt.
const spotMemo = new Map(), SPOT_KEEP = 150, SETTLE_MS = 220;
let spotSeen = new Map(), navT = 0, settleT = 0;
const navigating = () => !!flight || !!gz || !!drag || ptrs.size > 0 || performance.now() - navT < SETTLE_MS;
const settleSoon = ms => { clearTimeout(settleT); settleT = setTimeout(draw, ms); };
function chooseSpot(key, tries, costOf) {
  const n = (spotSeen.get(key) || 0) + 1, id = `${key}#${n}`, old = spotMemo.get(id), kept = old < tries.length ? old : -1;
  spotSeen.set(key, n);
  if (kept >= 0 && navigating()) return kept;
  let best = 0, bc = Infinity;
  for (let i = 0; i < tries.length && bc > 0; i++) { const c = costOf(i); if (c < bc) { bc = c; best = i; } }
  const pick = kept >= 0 && bc > 0 && costOf(kept) < bc + SPOT_KEEP ? kept : best;
  spotMemo.set(id, pick);
  return pick;
}
// Belegte Flächen der Maßzahlen (je Bild neu) und Rohrstrecken auf dem Bildschirm – zum Ausweichen
let placed = [], pipeSegs = [];
function labelBox(x, y, w, h, ang) {
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang)), hx = c * w / 2 + s * h / 2 + 2, hy = s * w / 2 + c * h / 2 + 2;
  return { x0: x - hx, x1: x + hx, y0: y - hy, y1: y + hy };
}
function overlapCost(b) {
  let cost = 0;
  for (const q of placed) cost += Math.max(0, Math.min(b.x1, q.x1) - Math.max(b.x0, q.x0)) * Math.max(0, Math.min(b.y1, q.y1) - Math.max(b.y0, q.y0));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = Math.min(b.x1 - b.x0, b.y1 - b.y0) / 2 + 3;
  for (const [x0, y0, x1, y1] of pipeSegs) { const d = segDist(cx, cy, x0, y0, x1, y1); if (d < r) cost += (r - d) * 20; }
  if (b.x0 < 2 || b.y0 < 2 || b.x1 > cv.clientWidth - 2 || b.y1 > cv.clientHeight - 2) cost += 3000; // außerhalb nicht antippbar
  // Griffe, Pfeile und Ringe des Gimbals
  const near = (x, y, m) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m;
  for (const g of gizmo) {
    const hit = g.at ? near(...g.at, 14) : g.seg ? [0, 0.25, 0.5, 0.75, 1].some(t => near(g.seg[0] + (g.seg[2] - g.seg[0]) * t, g.seg[1] + (g.seg[3] - g.seg[1]) * t, 5)) : g.poly.some(q => near(...q, 5));
    if (hit) cost += 2000;
  }
  return cost;
}

// Abstände am Rohranfang: je ein Maß von Rohr zu Rohr (zum Nachbarn), antippbar; liegt hinter dem Anfang, weg vom Rohr
function drawBundleDims(L, P3) {
  const p = proj();
  if (!L.bundle?.length || L.verts.length < 2) return;
  const A = L.verts[0], away = P3(V.add(A, V.mul(V.norm(V.sub(L.verts[1], A)), 100)));
  p.bundle.forEach((b, i) => {
    if (b.hidden) return;
    const B = L.bundle[i], prev = p.bundle.slice(0, i).map((o, k) => k).filter(k => p.bundle[k].side === b.side).at(-1);
    if (!B) return;
    dimLine(P3(prev == null ? A : L.bundle[prev].A), P3(B.A), fmt(bundleGapOf(p, i)), away, 24, { bgap: i }, { plain: bundleSel !== i });
  });
}

// Winkelmaße: an jedem Schnittpunkt der Biegewinkel – Bogen von der gestrichelten Verlängerung des ankommenden
// Schenkels zum abgehenden Schenkel, Wert = wahrer Winkel im Raum (so weit wird gebogen)
function drawAngles(L, P3, only = -1) {
  const ink = css('--mark'), r = 30;
  L.bends.forEach((b, j) => {
    if (only >= 0 && j !== only) return;
    const [vx, vy] = P3(b.vertex), [ix, iy] = P3(V.add(b.vertex, b.din)), [ox, oy] = P3(V.add(b.vertex, b.dout));
    let a1 = Math.atan2(iy - vy, ix - vx), a2 = Math.atan2(oy - vy, ox - vx);
    const l1 = Math.hypot(ix - vx, iy - vy), l2 = Math.hypot(ox - vx, oy - vy);
    if (l1 < 1e-6 || l2 < 1e-6) return; // Schenkel zeigt genau in die Ansicht
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    ctx.save();
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.2;
    // Verlängerung des ankommenden Schenkels
    ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + Math.cos(a1) * (r + 10), vy + Math.sin(a1) * (r + 10)); ctx.stroke(); ctx.setLineDash([]);
    // Winkelbogen mit Pfeilen an beiden Enden
    ctx.beginPath(); ctx.arc(vx, vy, r, a1, a1 + da, da < 0); ctx.stroke();
    const head = (ang, dir) => {
      const px = vx + Math.cos(ang) * r, py = vy + Math.sin(ang) * r, tx = -Math.sin(ang) * dir, ty = Math.cos(ang) * dir;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - tx * 7 - Math.cos(ang) * 2.6, py - ty * 7 - Math.sin(ang) * 2.6); ctx.lineTo(px - tx * 7 + Math.cos(ang) * 2.6, py - ty * 7 + Math.sin(ang) * 2.6); ctx.closePath(); ctx.fill();
    };
    if (Math.abs(da) > 0.35) { head(a1 + da, Math.sign(da)); head(a1, -Math.sign(da)); }
    // Wert in der Mitte des Bogens, etwas außerhalb – weiter außen, falls dort schon eine Maßzahl steht
    const am = a1 + da / 2, t = `${fmt(b.angle)}°`;
    ctx.font = '700 12px -apple-system, system-ui, sans-serif';
    const w = ctx.measureText(t).width + 8;
    const rings = [r + 14, r + 30, r + 46], at = i => [vx + Math.cos(am) * rings[i], vy + Math.sin(am) * rings[i]];
    const [tx, ty] = at(chooseSpot(`w${j}`, rings, i => overlapCost(labelBox(...at(i), w, 16, 0))));
    placed.push(labelBox(tx, ty, w, 16, 0));
    ctx.fillStyle = css('--card'); ctx.fillRect(tx - w / 2, ty - 8, w, 16);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, tx, ty + 0.5);
    ctx.restore();
  });
}

// Gesamtmaße: Versatz vom Rohranfang A bis zum Rohrende in X/Y/Z – gestrichelter Weg entlang der Achsen mit je einem Maß,
// weiter außen als die Schenkelmaße, in den Achsfarben (X rot, Y grün, Z blau)
function drawTotal(L, P3, tw) {
  if (L.verts.length < 2) return;
  const A = L.verts[0], E = L.verts.at(-1), d = V.sub(E, A), comps = [0, 1, 2].filter(k => Math.abs(d[k]) > 0.5);
  if (!comps.length) return;
  const cols = [css('--ax-x') || '#e03131', css('--ax-y') || '#2f9e44', css('--ax-z') || '#1c7ed6'], names = [['X', '-X'], ['Y', '-Y'], ['Z', '-Z']];
  const path = [A];
  comps.forEach(k => { const q = [...path.at(-1)]; q[k] += d[k]; path.push(q); });
  const sp = path.map(q => P3(q)), pts = L.verts.map(q => P3(q));
  const cen = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
  ctx.save(); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
  comps.forEach((k, j) => { ctx.strokeStyle = cols[k]; ctx.beginPath(); ctx.moveTo(...sp[j]); ctx.lineTo(...sp[j + 1]); ctx.stroke(); });
  ctx.restore();
  const off = Math.max(46, tw / 2 + 40);
  comps.forEach((k, j) => dimLine(sp[j], sp[j + 1], `${fmt(Math.abs(d[k]))} ${names[k][d[k] > 0 ? 0 : 1]}`, cen, off, null, { color: cols[k] }));
}

// Je Schenkel eine parallele Maßlinie (wahre Länge). Schräge Schenkel (Etage, Versatz) zusätzlich orthogonal:
// gestricheltes Hilfsdreieck entlang der Achsen mit je einem Maß – erst in Richtung des vorigen Schenkels, dann der Versatz.
function drawDims(L, P3, tw, editable) {
  const pts = L.verts.map(q => P3(q));
  if (pts.length < 2) return;
  const cen = [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
  const off = Math.max(22, tw / 2 + 16), muted = css('--muted'), p = proj();
  const direct = editable && L.verts.length === p.deltas.length + 1;
  // Fokus: ist ein Schenkel oder Eckpunkt gewählt, treten die übrigen Maße zurück
  const focus = editable && (sel >= 0 || selCorner >= 1) ? (sel >= 0 ? [sel] : [selCorner - 1, selCorner]) : null;
  const legs = [];
  for (let i = 1; i < pts.length; i++) {
    const A = L.verts[i - 1], B = L.verts[i], d = V.sub(B, A);
    const fl = direct ? p.deltas[i - 1] : {};
    const on = !!focus && focus.includes(i - 1);
    const st = { lock: !!fl.lock, driven: direct && p.endFixed && (fl.flex || adjusted.set.has(i - 1)), plain: !on };
    const comps = [0, 1, 2].filter(k => Math.abs(d[k]) > 0.5);
    let sp = null;
    if (comps.length > 1) {
      // Hilfsdreieck: Anteil in Richtung des vorigen Schenkels zuerst (Etage „läuft weiter, dann hoch“)
      const prev = i > 1 ? V.norm(V.sub(A, L.verts[i - 2])) : null;
      comps.sort((k1, k2) => (prev ? Math.abs(prev[k2]) - Math.abs(prev[k1]) : 0));
      const path = [A];
      comps.forEach(k => { const q = [...path.at(-1)]; q[k] += d[k]; path.push(q); });
      sp = path.map(q => P3(q));
    }
    legs.push({ i, d, st, comps, sp, on });
  }
  // Erst die Hauptmaße (wahre Länge) – sie bekommen die besten Plätze –, dann die Hilfsmaße der schrägen Schenkel
  legs.forEach(({ i, d, st, sp, on }) => { if ((on || vis.dimLevel !== 'quiet') && !(ofs && editable && ofs.i === i - 1)) dimLine(pts[i - 1], pts[i], fmt(V.len(d)), sp ? sp[1] : cen, off, editable ? { i: i - 1 } : null, st); });
  legs.forEach(({ i, d, st, comps, sp, on }) => {
    if (!sp || !(on || vis.dimLevel === 'all')) return;
    const mid = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
    ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = muted;
    ctx.beginPath(); sp.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    comps.forEach((k, j) => dimLine(sp[j], sp[j + 1], fmt(Math.abs(d[k])), mid, off * 0.8, editable ? { i: i - 1, k } : null, { ...st, minor: true }));
  });
}
function hitDim(x, y) {
  for (const d of dimHits) {
    const dx = x - d.x, dy = y - d.y, c = Math.cos(-d.ang), s = Math.sin(-d.ang);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) <= d.w / 2 + 4 && Math.abs(ly) <= d.h / 2) return d;
  }
  return null;
}
// Maß bearbeiten: Eingabefeld genau auf der Maßzahl; Enter/Fertig übernimmt, Esc bricht ab. Richtung bleibt, der Rest des Rohrs wandert mit.
// Eingabefeld für ein Maß: eigene Box über allem, die auf dem Handy oberhalb der Tastatur bleibt – die Ansicht selbst bewegt sich nicht.
// Solange die Tastaturhöhe noch unbekannt ist, wird sie geschätzt, damit Safari die Seite beim Fokussieren nicht hochschiebt.
// Rechnen im Maßfeld: + − × ÷ und Klammern, Punkt vor Strich. Beginnt die Eingabe mit einem Rechenzeichen, gilt sie für das bisherige Maß (+50, ×2).
// Ergebnis oder null, wenn es keine gültige Rechnung ist
function calc(text, base, signed = false) {
  let t = String(text).replace(/\s/g, '').replace(/,/g, '.').replace(/[×xX]/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-').replace(/[+\-*/]+$/, '');
  if (!t) return null;
  if (/^[*/+]/.test(t) || (!signed && t[0] === '-')) t = `(${base})${t}`;
  let i = 0;
  const factor = () => {
    if (t[i] === '-') { i++; return -factor(); }
    if (t[i] === '(') { i++; const v = sum(); if (t[i++] !== ')') throw 0; return v; }
    const m = /^\d*\.?\d+\.?/.exec(t.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const product = () => { let v = factor(); while (t[i] === '*' || t[i] === '/') { const o = t[i++], b = factor(); v = o === '*' ? v * b : v / b; } return v; };
  function sum() { let v = product(); while (t[i] === '+' || t[i] === '-') { const o = t[i++], b = product(); v = o === '+' ? v + b : v - b; } return v; }
  try { const v = sum(); return i === t.length && Number.isFinite(v) ? v : null; } catch { return null; }
}
const hasCalc = s => /[+\-−*×x/÷:(]/i.test(String(s).trim().slice(1)) || /^[+\-−*×x/÷:]/i.test(String(s).trim());
function dimBox(d, value, signed = false) {
  const vv = window.visualViewport, box = document.createElement('div'), inp = document.createElement('input'), r = cv.getBoundingClientRect();
  box.className = 'dimbox';
  inp.className = 'dimedit'; inp.inputMode = 'decimal'; inp.enterKeyHint = 'done'; inp.value = fin(value);
  box.append(inp);
  // Rechnung: Vorschau beim Tippen; vor der Übernahme steht das Ergebnis im Feld, die Bearbeiter lesen nur noch die Zahl
  const res = document.createElement('div');
  res.className = 'dimres'; res.hidden = true; box.append(res);
  const show = () => { const on = hasCalc(inp.value), v = on ? calc(inp.value, value, signed) : null; res.hidden = !on; res.textContent = v == null ? '…' : `= ${fmt(r1(v))}`; res.classList.toggle('bad', on && v == null); };
  const settle = () => { if (!hasCalc(inp.value)) return; const v = calc(inp.value, value, signed); inp.value = String(r1(v ?? value)).replace('.', ','); };
  inp.addEventListener('input', show);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') settle(); });
  inp.addEventListener('blur', settle);
  // Die Zifferntastatur des Handys hat keine Rechenzeichen
  if (matchMedia('(pointer: coarse)').matches) {
    const ops = document.createElement('div');
    ops.className = 'dimtools dimcalc';
    ops.innerHTML = ['+', '−', '×', '÷'].map(o => `<button data-op="${o}">${o}</button>`).join('');
    ops.addEventListener('pointerdown', e => e.preventDefault());
    ops.addEventListener('click', e => {
      const o = e.target.closest('[data-op]')?.dataset.op;
      if (!o) return;
      const all = inp.selectionStart === 0 && inp.selectionEnd === inp.value.length, at = all ? inp.value.length : inp.selectionStart;
      inp.setRangeText(o, at, all ? at : inp.selectionEnd, 'end');
      inp.focus({ preventScroll: true }); show();
    });
    box.append(ops);
  }
  const sx = r.left + d.x, sy = r.top + d.y;
  const place = () => {
    const vt = vv?.offsetTop || 0, vl = vv?.offsetLeft || 0, vw = vv?.width || innerWidth, vh = vv?.height || innerHeight;
    const coarse = matchMedia('(pointer: coarse)').matches, keyboardOpen = innerHeight - vh > 120;
    const free = coarse && !keyboardOpen ? vh * (innerWidth > innerHeight ? 0.42 : 0.52) : vh; // Tastatur kommt gleich
    const bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.left = `${Math.max(vl + 8, Math.min(sx - bw / 2, vl + vw - bw - 8))}px`;
    box.style.top = `${Math.max(vt + 8, Math.min(sy - 18, vt + free - bh - 8))}px`;
  };
  document.body.append(box);
  place();
  vv?.addEventListener('resize', place); vv?.addEventListener('scroll', place);
  return { box, inp, place, close() { vv?.removeEventListener('resize', place); vv?.removeEventListener('scroll', place); box.remove(); } };
}
function editGap(d) {
  const p = proj(), gap = bundleGapOf(p, d.bgap), { inp, close } = dimBox(d, gap);
  inp.focus({ preventScroll: true }); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = num(inp.value);
    close();
    if (ok && v > 0 && Math.abs(v - gap) > 0.01) { commit(); shiftBundle(p.bundle, structuredClone(p.bundle), d.bgap, v - gap); recompute(); renderBundle(); }
    draw();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
}
function editOffset(d) {
  const p = proj(), o = offsetOf(p, d.offV), { inp, close } = dimBox(d, r1(o.v));
  inp.focus({ preventScroll: true }); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = num(inp.value);
    close();
    if (ok && v > 0.5 && Math.abs(v - o.v) > 0.05) { const snap = snapshot(); if (setOffset(p, d.offV, v)) commit(null, snap); renderInputs(); recompute(); }
    draw();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
}
// Lage des Versatz-Startpunkts als Zahl: Abstand von der jeweiligen Seite des Schenkels
function editOfsPart(d) {
  const L = V.len(legVec(ofs.i)), { inp, close } = dimBox(d, d.ofsPart ? L - ofs.t : ofs.t);
  inp.focus({ preventScroll: true }); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = num(inp.value);
    close();
    if (ok && ofs && v >= 0 && v <= L) ofs.t = Math.max(1, Math.min(L - 1, d.ofsPart ? L - v : v));
    draw();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
}
function editDim(d) {
  if (d.bgap != null) { editGap(d); return; }
  if (d.ofsPart != null) { editOfsPart(d); return; }
  if (d.offV != null) { editOffset(d); return; }
  if (d.robj) { editRef(d); return; }
  const p = proj();
  if (layout.verts.length !== p.deltas.length + 1 && p.mode === 'deltas') { selectLeg(d.i, true); return; }
  ensureDeltas();
  const cur0 = deltaVec(p.deltas[d.i]), { box, inp, place, close } = dimBox(d, d.k != null ? Math.abs(cur0[d.k]) : V.len(cur0));
  // Darunter: Maß festhalten oder als Ausgleich markieren (nur sinnvoll bei fixiertem Ende)
  const tools = document.createElement('div');
  tools.className = 'dimtools';
  const flags = () => p.deltas[d.i] || {};
  const paint = () => { tools.innerHTML = `<button data-f="lock" class="${flags().lock ? 'on' : ''}">🔒 Fest</button><button data-f="flex" class="${flags().flex ? 'on' : ''}">⇄ Ausgleich</button>`; };
  paint();
  if (p.endFixed) { box.append(tools); place(); }
  tools.addEventListener('pointerdown', e => e.preventDefault()); // Eingabefeld behält den Fokus
  tools.addEventListener('click', e => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    commit();
    const o = p.deltas[d.i], on = !o[f];
    delete o.lock; delete o.flex;
    if (on) o[f] = true;
    save(); paint(); draw(); renderInputs();
  });
  selectLeg(d.i);
  inp.focus({ preventScroll: true }); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = num(inp.value);
    close();
    if (ok && v > 0) {
      const cur = deltaVec(p.deltas[d.i]);
      if (d.k != null) { // ein Achsanteil (z. B. Höhenversatz): nur diesen ändern, Vorzeichen bleibt
        if (Math.abs(Math.abs(cur[d.k]) - v) > 0.01) { const n = [...cur]; n[d.k] = Math.sign(cur[d.k] || 1) * v; commit(); withEnd(d.i, () => setDelta(d.i, n)); renderInputs(); recompute(); }
      } else if (Math.abs(V.len(cur) - v) > 0.01) { commit(); withEnd(d.i, () => setDelta(d.i, V.mul(V.norm(cur), v))); renderInputs(); recompute(); }
    }
    draw();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
}

// ---------- Bearbeiten in den Ansichten ----------
// Anfasser = Schnittpunkte. Ziehen ändert nur den Schenkel davor, der Rest des Rohrs wandert mit.
// Richtung rastet auf 15° in der Bildebene, Länge auf 5 mm; ein Anteil quer zur Ansicht bleibt erhalten.
function ensureDeltas() {
  const p = proj();
  if (p.mode === 'deltas') return;
  p.deltas = toDeltas(p.legs, p.frame);
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
  const p = proj();
  drag.orig ||= structuredClone(p.deltas); drag.E0 ||= endOf(p);
  p.deltas = structuredClone(drag.orig);
  setLegInView(drag.i, inLen, ang, drag.c);
  const r = drag.i < p.deltas.length - 1 ? keepEnd(p, drag.i, drag.E0) : { ok: true, changed: [] };
  if (r.ok && !bendsFit(p)) p.deltas = structuredClone(drag.good || drag.orig); else drag.good = structuredClone(p.deltas);
  if (!r.ok) { p.deltas = structuredClone(drag.orig); drag.fail = r.reason; } else { drag.fail = null; adjusted = { set: new Set(r.changed), t: performance.now() }; }
  drag.label = { inLen, ang };
  recompute(true);
}
function endDrag() {
  const { i, committed, before, fail } = drag;
  drag = null;
  if (fail) toast(fail);
  if (!committed) restoreSnapshot(before); // nur angetippt: auch den Moduswechsel zurücknehmen
  renderInputs(); recompute();
  // Nur angetippt: innerer Eckpunkt → Drehringe, Rohrende → Schenkel davor
  if (!committed && i + 1 < points(proj()).length - 1) selectCorner(i + 1); else selectLeg(i);
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

// Eckpunkt (Schnittpunkt zwischen Schenkel i-1 und i) antippen: nur dort erscheinen die Drehringe
function selectCorner(i) {
  sel = -1; selCorner = i; bundleSel = -1; clearSel();
  $('#legPanel').hidden = $('#offLegView').hidden = true;
  renderBundleBar(); draw();
}
function selectBundle(i) {
  sel = -1; selCorner = -1; bundleSel = i; clearSel();
  $('#legPanel').hidden = $('#offLegView').hidden = true;
  renderBundleBar(); draw();
}
function hitCorner(x, y) {
  const pts = points(proj());
  let best = -1, bd = hitTol(16);
  const sc = pts.map(q => view.P3(q));
  for (let i = 1; i < pts.length - 1; i++) {
    // Bei kurzen Schenkeln bleibt die Mitte für die Gerade frei
    const lim = Math.min(Math.hypot(sc[i][0] - sc[i - 1][0], sc[i][1] - sc[i - 1][1]), Math.hypot(sc[i + 1][0] - sc[i][0], sc[i + 1][1] - sc[i][1])) * 0.35;
    const d = Math.hypot(sc[i][0] - x, sc[i][1] - y);
    if (d < bd && d < Math.max(8, lim)) { bd = d; best = i; }
  }
  return best;
}

// Schenkel-Feld
const DIR_OPTS = Array.from({ length: 360 / ANGLE_STEP }, (_, k) => k * ANGLE_STEP);
// Auswahl zeigt den Gimbal; das Eingabefeld nur als Rückfall (Maße tippt man direkt an)
function selectLeg(i, openPanel = false) {
  sel = i; selCorner = -1; bundleSel = -1; clearSel(); renderBundleBar();
  $('#legPanel').hidden = !(openPanel && i >= 0);
  $('#offLegView').hidden = i < 0 || openPanel;
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
  // Parallelrohre: Lage ab diesem Schenkel wählen = Lagewechsel an der Biegung davor
  const p = proj(), nm = sel > 0 && p.bundle.length ? txNames(sel - 1) : null;
  $('#lpBundleL').hidden = !nm;
  if (nm) {
    const cur = p.bundleTx.find(t => t.bend === sel - 1)?.rot ?? 0;
    $('#lpBundle').innerHTML = [[0, `${nm[0]} (wie bisher)`], [1, `${nm[1]} (Lagewechsel)`], [-1, `${nm[-1]} (Lagewechsel)`]]
      .map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');
  }
}
$('#lpBundle').addEventListener('change', e => {
  const r = +e.target.value, bend = sel - 1;
  if (bend < 0) return;
  setTx(bend, r); renderBundle(); fillPanel();
  if (r) toast('Lagewechsel eingebaut – die Parallelrohre gehen an der Ecke senkrecht auf die neue Höhe.');
});
function afterViewEdit() { renderInputs(); recompute(); fillPanel(); }

$('#lpLen').addEventListener('input', e => {
  const len = num(e.target.value);
  if (!(len > 0) || sel < 0) return;
  commit('lpLen' + sel);
  ensureDeltas();
  const v = legVec(sel), l = V.len(v);
  const { r } = screenAxes();
  const n = l > 1e-6 ? V.mul(v, len / l) : V.mul(r, len);
  withEnd(sel, () => setDelta(sel, n));
  afterViewEdit();
});
$('#lpDir').addEventListener('change', e => {
  if (e.target.value === '' || sel < 0) return;
  commit();
  ensureDeltas();
  const L = legInView(legVec(sel));
  withEnd(sel, () => { if (L.inLen > 0.05) setLegInView(sel, L.inLen, +e.target.value, L.c); else setLegInView(sel, L.len, +e.target.value, [0, 0, 0]); });
  afterViewEdit();
});
function insertLeg(at, fromLeg) {
  commit();
  ensureDeltas();
  const L = fromLeg >= 0 ? legInView(legVec(fromLeg)) : { inLen: 0, ang: 0 };
  const { r, u } = screenAxes(), t = ((L.inLen > 0.05 ? L.ang : 0) + 90) * Math.PI / 180;
  const v = V.add(V.mul(r, 100 * Math.cos(t)), V.mul(u, 100 * Math.sin(t)));
  txInsertLegs(proj(), at, 1);
  proj().deltas.splice(at, 0, { x: v[0], y: v[1], z: v[2] });
  sel = at;
  afterViewEdit();
}
$('#lpIns').addEventListener('click', () => { if (sel >= 0) insertLeg(sel + 1, sel); });
const delLeg = () => {
  commit();
  ensureDeltas();
  const p = proj();
  if (sel < 0 || p.deltas.length < 2) return;
  txDeleteLeg(p, sel);
  p.deltas.splice(sel, 1);
  renderInputs(); recompute(); selectLeg(-1);
};
$('#lpDel').addEventListener('click', delLeg);
$('#lpClose').addEventListener('click', () => selectLeg(sel));

// ---------- Gimbal ----------
// Rohrende: ein Griff. Beim Ziehen folgt die Richtung laufend dem Zeiger (geradeaus, zurück = kürzen,
// oder eine der Richtungen im rechten Winkel); kurz hinter dem Griff passiert nichts.
// Gewählter Schenkel: oranger Ring = Biegewinkel, grüner Ring = Drehung um den vorigen Schenkel,
// Pfeil am Ende = Länge. Bei Winkel und Drehung dreht der Rest des Rohrs mit wie beim echten Biegen.
const C_ROT = '#0ca678';
const AXIS_COL = ['#e03131', '#2f9e44', '#1c7ed6'];
const axisColor = v => AXIS_COL[[0, 1, 2].reduce((m, k) => (Math.abs(v[k]) > Math.abs(v[m]) ? k : m), 0)];
const round5 = (v, min = 10) => Math.max(min, Math.round(v / 5) * 5);
const deltaVec = d => [d.x || 0, d.y || 0, d.z || 0];
const EXT_DEAD = 5; // px
let gizmo = [], gz = null;

function setDelta(i, v) {
  const z = c => (Math.abs(c) < 1e-9 ? 0 : c), o = proj().deltas[i] || {};
  proj().deltas[i] = { ...(o.lock ? { lock: true } : {}), ...(o.flex ? { flex: true } : {}), ...(o.ref ? { ref: o.ref } : {}), x: z(v[0]), y: z(v[1]), z: z(v[2]) };
}

// ---------- Ende fixiert: Ausgleich über freie Schenkel ----------
// Ändert sich ein Schenkel, muss die Summe aller Schenkel trotzdem genau von A zum alten Rohrende reichen.
// Die Differenz nehmen andere Schenkel nur über ihre Länge auf (Richtungen bleiben, keine neuen Winkel):
// zuerst als „Ausgleich“ markierte, sonst freie Schenkel – dahinter vor davor, nahe zuerst. „Fest“ markierte nie.
const endOf = p => points(p).at(-1);
let adjusted = { set: new Set(), t: 0 }; // zuletzt ausgeglichene Schenkel (kurz orange, Maße in Klammern)
function legMinLen(j, n) {
  const p = proj(), L = computeLayout(points(p), { R: prof(p).R }), direct = L.verts.length === p.deltas.length + 1;
  const T = k => (direct && L.bends[k] ? L.bends[k].T : prof(p).R);
  return (j > 0 ? T(j - 1) : 0) + (j < n - 1 ? T(j) : 0) + (j > 0 && j < n - 1 ? prof(p).minStraight || 0 : 0);
}
// Kleinste Längenänderungen c (je Kandidat) mit Σ c·u = diff; Kandidaten werden nur aufgenommen, wenn sie den Rest verkleinern
function solveLengths(diff, pool) {
  const S = [];
  const fit = dirs => {
    const m = dirs.length;
    if (!m) return { c: [], res: diff };
    const A = dirs.map(u => dirs.map(w => V.dot(u, w))), b = dirs.map(u => V.dot(u, diff));
    // Gauß-Elimination (m ≤ 3)
    for (let k = 0; k < m; k++) {
      let piv = k; for (let r = k + 1; r < m; r++) if (Math.abs(A[r][k]) > Math.abs(A[piv][k])) piv = r;
      [A[k], A[piv]] = [A[piv], A[k]]; [b[k], b[piv]] = [b[piv], b[k]];
      if (Math.abs(A[k][k]) < 1e-9) return null;
      for (let r = 0; r < m; r++) if (r !== k) { const f = A[r][k] / A[k][k]; for (let q = k; q < m; q++) A[r][q] -= f * A[k][q]; b[r] -= f * b[k]; }
    }
    const c = b.map((v, k) => v / A[k][k]);
    return { c, res: V.sub(diff, dirs.reduce((acc, u, k) => V.add(acc, V.mul(u, c[k])), [0, 0, 0])) };
  };
  let cur = fit([]);
  for (const l of pool) {
    if (V.len(cur.res) < 0.01 || S.length >= 3) break;
    const next = fit([...S, l].map(x => x.u));
    if (next && V.len(next.res) < V.len(cur.res) - 0.01) { S.push(l); cur = next; }
  }
  return { S, c: cur.c, ok: V.len(cur.res) < 0.01, res: cur.res };
}
function keepEnd(p, edited, E0, force = false) {
  // Anfang lose: nicht ausgleichen, sondern das ganze Rohr so schieben, dass das Ende stehen bleibt
  if (!force && p.endFixed && !p.startFixed && E0) { p.origin = V.add(p.origin, V.sub(E0, endOf(p))); return { ok: true, changed: [] }; }
  if ((!p.endFixed && !force) || p.deltas.length < 2 || !E0) return { ok: true, changed: [] };
  const diff = V.sub(E0, endOf(p));
  if (V.len(diff) < 0.01) return { ok: true, changed: [] };
  const n = p.deltas.length;
  const order = j => (j > edited ? j - edited : 1000 + edited - j);
  const legs = p.deltas.map((d, j) => { const v = deltaVec(d), L = V.len(v); return { j, L, u: L > 1e-9 ? V.mul(v, 1 / L) : null, d }; })
    .filter(l => l.j !== edited && l.u && !l.d.lock).sort((a, b) => order(a.j) - order(b.j));
  let last = null, tooShort = false;
  for (const pool0 of [legs.filter(l => l.d.flex), legs]) {
    let pool = [...pool0];
    for (let tries = 0; tries <= pool0.length && pool.length; tries++) {
      const r = solveLengths(diff, pool);
      last = r;
      if (!r.ok) break;
      // Ausgleich darf keinen Schenkel umdrehen oder unter seine Mindestlänge drücken
      const bad = r.S.findIndex((l, k) => l.L + r.c[k] < Math.max(1, legMinLen(l.j, n)) - 0.05);
      if (bad < 0) {
        r.S.forEach((l, k) => setDelta(l.j, V.mul(l.u, l.L + r.c[k])));
        return { ok: true, changed: r.S.map(l => l.j) };
      }
      tooShort = true;
      pool = pool.filter(l => l !== r.S[bad]);
    }
  }
  const miss = last && !last.ok && !tooShort ? dirName(V.norm(last.res)) : null;
  return { ok: false, reason: miss ? `Ende fixiert: kein freier Schenkel, der ${miss === 'oben' || miss === 'unten' ? 'die Höhe' : `in Richtung ${miss}`} ausgleichen kann – Schenkel freigeben, einfügen oder Ende lösen.`
    : 'Ende fixiert: Die Ausgleichsschenkel würden zu kurz – Ende lösen oder anderen Schenkel freigeben.' };
}
// Passen alle Bögen auf ihre Schenkel? Sonst würde sich das Rohr im Bogen verformen
function bendsFit(p) {
  const L = computeLayout(points(p), { R: prof(p).R });
  return L.straights.every(g => g >= -0.05);
}
// Eine Änderung am Schenkel i mit festem Ende ausführen; geht der Ausgleich nicht, bleibt alles wie vorher
function withEnd(i, change) {
  const p = proj(), E0 = endOf(p), before = structuredClone(p.deltas), o0 = p.origin;
  change();
  const r = keepEnd(p, i, E0);
  if (r.ok && !bendsFit(p)) { p.deltas = before; p.origin = o0; toast('Schenkel zu kurz: Die Bögen passen so nicht.'); return false; }
  if (!r.ok) { p.deltas = before; toast(r.reason); return false; }
  if (r.changed.length) adjusted = { set: new Set(r.changed), t: performance.now() };
  return true;
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
// Schloss am Punkt: Fest ist immer zu sehen, offen nur am gewählten Punkt
function lockMark(x, y, closed) {
  const col = css(closed ? '--text' : '--muted');
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fillStyle = css('--card'); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, -2, 2.6, Math.PI, closed ? 0 : -0.5); if (closed) ctx.lineTo(2.6, 0);
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(-4, -0.5, 8, 5.5);
  ctx.restore();
}
function drawLocks(P3) {
  scenePipes().forEach(q => {
    if (q.hidden) return;
    [['S', q.startFixed], ['E', q.endFixed]].forEach(([w, fixed]) => {
      if (!fixed && !(selPoint?.pid === q.id && selPoint.w === w)) return;
      const [x, y] = P3(nodePos(`${w}:${q.id}`));
      lockMark(x + 16, y + 16, fixed);
    });
  });
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
  // fester Platz mittig direkt über den unteren Leisten – wird nie von Fingern oder Knöpfen verdeckt
  const top = Math.min(...[$('.viewacts'), $('#bundleBar')].filter(el => !el.hidden).map(el => el.getBoundingClientRect().top)) - cv.getBoundingClientRect().top;
  const bx = (cv.clientWidth - w) / 2, by = top - 32;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(bx, by, w, 24, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 8, by + 12.5); ctx.textAlign = 'center';
}

// Richtungen am Rohrende samt Bildschirmrichtung (px je mm); Richtungen, die in den Bildschirm zeigen, fallen weg
function extCandidates(E, d) {
  const [ex, ey] = view.P3(E);
  // Abgangswinkel aus der Leiste: Die Querrichtungen kippen zum Schenkel hin, n bleibt die Querrichtung des Pfeils
  const th = (vis.extAng || 90) * Math.PI / 180;
  const all = [...extDirs(d), V.mul(d, -1)].map(n => {
    const straight = Math.abs(V.dot(n, d)) > 0.9999, a = straight ? n : V.norm(V.add(V.mul(d, Math.cos(th)), V.mul(n, Math.sin(th))));
    const [x, y] = view.P3(V.add(E, a));
    return { a, n: straight ? null : n, sx: x - ex, sy: y - ey, straight };
  });
  const max = Math.max(...all.map(c => Math.hypot(c.sx, c.sy)));
  // Pfeile quer in die Ansicht hinein lassen sich nicht ziehen, auch wenn sie gekippt noch sichtbar wären
  const vd = viewDir();
  return all.filter(c => Math.hypot(c.sx, c.sy) >= 0.3 * max && !(c.n && Math.abs(V.dot(c.n, vd)) > 0.9));
}

function drawGizmo() {
  gizmo = [];
  // Leiste sitzt direkt über den Knöpfen, auch wenn diese zweizeilig werden
  const bbar = $('#bundleBar');
  if (!bbar.hidden) bbar.style.bottom = `${$('#viewwrap').getBoundingClientRect().bottom - $('.viewacts').getBoundingClientRect().top + 6}px`;
  if (create) { drawCreate(view.P3); return; }
  if (measure) { drawMeasure(view.P3); return; }
  if (proj().stub) { drawStub(); return; }
  const pts = points(proj()), n = pts.length - 1, sc = view.sc, P3 = view.P3, cAcc = css('--accent');
  if (n < 1) return;
  if (sel >= n) sel = -1;
  if (selCorner >= n) selCorner = -1;

  if (hover && !gz) { // unter der Maus, schwächer als die Auswahl
    ctx.save(); ctx.globalAlpha = 0.18;
    if (hover.l != null && hover.l !== sel && pts[hover.l + 1]) polyline([P3(pts[hover.l]), P3(pts[hover.l + 1])], cAcc, 14);
    if (hover.b != null && layout.bundle[hover.b]) polyline(layout.bundle[hover.b].verts.map(q => P3(q)), cAcc, 14);
    if (hover.g) (layout.ghosts || []).filter(x => x.id === hover.g).forEach(x => polyline(x.verts.map(q => P3(q)), cAcc, 14));
    ctx.globalAlpha = 0.5;
    if (hover.c != null && pts[hover.c]) { ctx.beginPath(); ctx.arc(...P3(pts[hover.c]), 9, 0, 7); ctx.fillStyle = cAcc; ctx.fill(); }
    ctx.restore();
  }
  if (sel >= 0) { // gewählten Schenkel hervorheben: Achslinie bis zu beiden Eckpunkten, wie mit eingeschalteter Achslinie
    const [ax, ay] = P3(pts[sel]), [bx, by] = P3(pts[sel + 1]), card = css('--card');
    ctx.save(); ctx.globalAlpha = 0.3; polyline([[ax, ay], [bx, by]], cAcc, 16); ctx.restore();
    ctx.save(); ctx.lineCap = 'round';
    polyline([[ax, ay], [bx, by]], card, 4.5); polyline([[ax, ay], [bx, by]], cAcc, 2.2);
    for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fillStyle = cAcc; ctx.fill(); ctx.strokeStyle = card; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  }

  if (!gz || BUNDLE_GZ.includes(gz.type)) drawStartHandle();
  if (!gz || gz.type === 'pmove') drawSceneHandles();

  // Fortführen: Hilfspfeile (blass, beim Ziehen die gewählte Richtung kräftig) + Griff am Ende
  if (!gz || gz.type === 'ext') {
    const E = gz ? gz.E : pts[n], d = gz ? gz.d : V.norm(V.sub(pts[n], pts[n - 1]));
    const [ex, ey] = P3(E);
    // Pfeile nur beim Fortführen: Griff angetippt, gerade gezogen, Maus darüber (blass) oder „immer zeigen“
    const showArrows = !!gz || extOpen || vis.extAlways || extHover;
    for (const c of showArrows ? extCandidates(E, d) : []) {
      if (V.dot(c.a, d) < -0.9999) continue; // „zurück“ nicht anzeigen, wirkt aber beim Ziehen (kürzen)
      // Flache Winkel liegen nah am Längspfeil: Der wird kurz, die schrägen werden länger und sind nur außen zu greifen
      const ang = vis.extAng || 90, far = ang < 60 ? Math.round(58 + (60 - ang) * 1.2) : 58, to = c.straight && ang < 60 ? 36 : far, from = !c.straight && ang < 60 ? far * 0.45 : 16;
      const l = Math.hypot(c.sx, c.sy), ux = c.sx / l, uy = c.sy / l, active = !!gz?.choice && V.dot(gz.choice, c.a) > 0.9999;
      ctx.save(); ctx.globalAlpha = gz ? (active ? 1 : 0.18) : extOpen || vis.extAlways ? 0.55 : 0.25;
      arrow(ex + ux * 16, ey + uy * 16, ex + ux * to, ey + uy * to, axisColor(c.n || c.a), c.straight ? 4 : 3);
      ctx.restore();
      if (!gz && (extOpen || vis.extAlways)) gizmo.push({ type: 'ext', a: c.a, n: c.n, seg: [ex + ux * from, ey + uy * from, ex + ux * to, ey + uy * to] });
    }
    if (!gz) {
      // Griff nur, wenn gewählt oder Stufe „Alle“; sonst ein kleiner Punkt – antippbar bleibt er immer
      const on = vis.dimLevel === 'all' || extOpen || vis.extAlways || extHover || (selPoint?.pid === proj().id && selPoint.w === 'E');
      if (on) {
        knob(ex, ey, 8, cAcc);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(ex - 3.5, ey); ctx.lineTo(ex + 3.5, ey); ctx.moveTo(ex, ey - 3.5); ctx.lineTo(ex, ey + 3.5); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fillStyle = css('--muted'); ctx.fill(); }
      gizmo.push({ type: 'ext', at: [ex, ey], r: 22 });
    }
  }

  // Kugel am angetippten Eckpunkt: ein Ring dreht den Schenkel um die ankommende Achse, einer biegt ganz herum in beide Richtungen.
  // Der dritte Ring entfällt, die zwei erreichen schon jede Richtung.
  // Verschieben: Pfeile in den drei Achsen. Nur dieser Eckpunkt wandert, die beiden Schenkel daran ändern Länge und Winkel
  if (selCorner >= 1 && vis.cornerMove && (!gz || gz.type === 'cmove')) {
    const A = pts[selCorner], [cx, cy] = P3(A);
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fillStyle = cAcc; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    if (!gz) [0, 1, 2].forEach(k => {
      const e = [0, 0, 0]; e[k] = 100;
      const [x, y] = P3(V.add(A, e)), mx = (x - cx) / 100, my = (y - cy) / 100, l = Math.hypot(mx, my);
      if (l < sc * 0.2) return; // Achse zeigt in die Ansicht hinein
      const ux = mx / l, uy = my / l;
      for (const g of [1, -1]) {
        const seg = [cx + g * ux * 18, cy + g * uy * 18, cx + g * ux * 58, cy + g * uy * 58];
        arrow(...seg, rgbCss(AX_RGB[k]), 4);
        gizmo.push({ type: 'cmove', i: selCorner, k, seg, pxPerMm: [mx, my] });
      }
    });
  }
  if (selCorner >= 1 && !vis.cornerMove && (!gz || gz.type === 'bend' || gz.type === 'rot')) {
    const i = selCorner, A = pts[i], { p, q, w, theta } = ringBasis(i, pts), r = 60 / sc, [cx, cy] = P3(A);
    if (!gz) { ballShade(cx, cy); ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fillStyle = cAcc; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    // Beide Ringe kreuzen sich: Dort gilt die Biegung, sie steht darum zuerst. Der Griff des Drehrings sitzt eine Vierteldrehung daneben
    if (!gz || gz.type === 'bend') {
      const col = axisColor(w), ring = ballRing(A, p, q, r, col, !gz);
      if (ring && !gz) { knob(...P3(V.add(A, V.mul(V.add(V.mul(p, Math.cos(theta * Math.PI / 180)), V.mul(q, Math.sin(theta * Math.PI / 180))), r))), 9, col); gizmo.push({ type: 'bend', i, poly: ring }); }
    }
    if (!gz || gz.type === 'rot') {
      const ring = ballRing(A, q, w, r, axisColor(p), !gz);
      if (ring && !gz) { knob(...P3(V.add(A, V.mul(w, r))), 8, axisColor(p)); gizmo.push({ type: 'rot', i, poly: ring }); }
    }
  }

  // Versatz-X: Jeder Arm steht für Rohrseite und Richtung, der Punkt in der Mitte legt die Lage auf dem Schenkel fest
  if (ofs && (!gz || gz.type === 'ofsc')) {
    const f = ofsFrame(), p = proj(), C = V.add(pts[ofs.i], V.mul(f.u, Math.min(ofs.t, f.L))), [cx, cy] = P3(C), col = axisColor(f.n);
    if (f.cur !== ofs.cur) { ofs.cur = f.cur; renderBundleBar(); }
    for (const s of [1, -1]) for (const d of [1, -1]) {
      const a = V.mul(V.add(V.mul(f.u, s), V.mul(f.n, d)), Math.SQRT1_2), [x, y] = P3(V.add(C, V.mul(a, 100))), mx = (x - cx) / 100, my = (y - cy) / 100, l = Math.hypot(mx, my);
      if (l < sc * 0.2) continue; // Arm zeigt in die Ansicht hinein
      const ux = mx / l, uy = my / l, dir = V.mul(f.n, d), blocked = ofsBuild(p.deltas, p.origin, ofs, p, 20, s, dir)?.blocked;
      ctx.save(); ctx.globalAlpha = blocked ? 0.25 : 0.9;
      arrow(cx + ux * 16, cy + uy * 16, cx + ux * 72, cy + uy * 72, blocked ? css('--muted') : col, 4);
      ctx.restore();
      if (!gz) gizmo.push({ type: 'ofs', s, dir, blocked, seg: [cx + ux * 16, cy + uy * 16, cx + ux * 72, cy + uy * 72], pxPerMm: [mx, my] });
    }
    knob(cx, cy, 9, cAcc);
    if (!gz) { const [x, y] = P3(V.add(C, V.mul(f.u, 100))); gizmo.push({ type: 'ofsc', at: [cx, cy], r: 14, pxPerMm: [(x - cx) / 100, (y - cy) / 100] }); }
  }

  // Längenpfeil am Ende eines inneren Schenkels (am Rohrende macht das der Griff)
  if (!ofs && sel >= 0 && sel < n - 1 && (!gz || gz.type === 'len')) {
    // Pfeil beginnt hinter dem Eckpunkt, damit der Eckpunkt selbst antippbar bleibt (Drehringe)
    const B = pts[sel + 1], d = V.norm(V.sub(B, pts[sel])), L = 34 / sc;
    const [bx, by] = P3(B), [tx0, ty0] = P3(V.add(B, V.mul(d, L)));
    const l = Math.hypot(tx0 - bx, ty0 - by);
    if (l > 12) {
      const ux = (tx0 - bx) / l, uy = (ty0 - by) / l, sx = bx + ux * 16, sy = by + uy * 16, tx = sx + ux * 34, ty = sy + uy * 34;
      arrow(sx, sy, tx, ty, cAcc, 3);
      gizmo.push({ type: 'len', i: sel, seg: [sx, sy, tx, ty], pxPerMm: [(tx0 - bx) / L, (ty0 - by) / L] });
    }
  }

  // Abschnitt verschieben: Pfeile in der Mitte der gewählten Geraden, je Achse quer zum Abschnitt
  if (!ofs && sel >= 0 && !proj().unrouted && (!gz || gz.type === 'lmove')) {
    const a = pts[sel], b = pts[sel + 1], m = V.mul(V.add(a, b), 0.5), d = V.norm(V.sub(b, a)), [mx, my] = P3(m), ds = proj().deltas;
    [0, 1, 2].forEach(k => {
      if (Math.abs(d[k]) > 0.999) return; // in Laufrichtung geht der Längenpfeil
      const e = [0, 0, 0]; e[k] = 1;
      if (legShift(ds, sel, e, !proj().endFixed, !proj().startFixed).locked) return;
      const [px, py] = P3(V.add(m, V.mul(e, 100))), ax = (px - mx) / 100, ay = (py - my) / 100, l = Math.hypot(ax, ay);
      if (l < sc * 0.2) return;
      const ux = ax / l, uy = ay / l, col = rgbCss(AX_RGB[k]);
      ctx.save(); ctx.globalAlpha = gz ? (gz.k === k ? 1 : 0.2) : 0.85;
      for (const sn of [1, -1]) {
        arrow(mx + sn * ux * 14, my + sn * uy * 14, mx + sn * ux * 46, my + sn * uy * 46, col, 3);
        if (!gz) gizmo.push({ type: 'lmove', i: sel, k, seg: [mx + sn * ux * 14, my + sn * uy * 14, mx + sn * ux * 46, my + sn * uy * 46], pxPerMm: [ax, ay] });
      }
      ctx.restore();
    });
  }

}

// Griff am Rohranfang: Parallelrohre anlegen (Pfeile quer zum ersten Schenkel), Bündel drehen (Ring), Abstand ziehen (Punkte)
function drawStartHandle() {
  const verts = layout.verts, p = proj(), P3 = view.P3, cAcc = css('--accent');
  if (verts.length < 2) return;
  const A = verts[0], d0 = V.norm(V.sub(verts[1], A)), [ax, ay] = P3(A), mmPx = v => { const [x, y] = P3(V.add(A, V.mul(v, 100))); return [(x - ax) / 100, (y - ay) / 100]; };
  if (bundleSel >= 0 && layout.bundle[bundleSel]) { ctx.save(); ctx.globalAlpha = 0.3; polyline(layout.bundle[bundleSel].verts.map(q => P3(q)), cAcc, 16); ctx.restore(); }
  // Startpunkt: Kugel aus drei Ringen dreht das ganze Rohr um X, Y und Z
  const spinning = gz?.type === 'spin';
  if (selPoint?.pid === p.id && selPoint.w === 'S' && !startOpen && !pointMove && (!p.endFixed || p.deltas.length === 1) && (!gz || spinning)) {
    if (!gz) ballShade(ax, ay);
    SPIN_AX.forEach(([u, v, n], k) => {
      if (spinning && gz.k !== k) return;
      const poly = ballRing(A, u, v, 60 / view.sc, axisColor(n), !spinning);
      if (poly && !gz) gizmo.push({ type: 'spin', k, u, v, n, poly });
    });
  }
  if (selPoint?.pid === p.id && selPoint.w === 'S' && startOpen && (!gz || gz.type === 'bnew')) {
    [0, 1, 2, 3].forEach(k => {
      const v = sideDir(verts, k), [mx, my] = mmPx(v), l = Math.hypot(mx, my);
      if (l < view.sc * 0.2) return; // Richtung zeigt in die Ansicht hinein
      const ux = mx / l, uy = my / l, active = gz?.side === k;
      ctx.save(); ctx.globalAlpha = gz ? (active ? 1 : 0.18) : 0.7;
      arrow(ax + ux * 18, ay + uy * 18, ax + ux * 60, ay + uy * 60, axisColor(v), 4);
      ctx.restore();
      if (!gz) gizmo.push({ type: 'bnew', side: k, seg: [ax + ux * 18, ay + uy * 18, ax + ux * 60, ay + uy * 60], pxPerMm: [mx, my] });
    });
  }
  if (selPoint?.pid === p.id && selPoint.w === 'S' && startOpen && p.bundle.length && (!gz || gz.type === 'brot')) {
    const q = sideDir(verts, 0), w = sideDir(verts, 1), r = 74 / view.sc, ring = ringPts(A, q, w, r, 0, 360, 4);
    const xs = ring.map(c => c[0]), ys = ring.map(c => c[1]);
    if (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= 14) { // von der Kante gesehen nicht bedienbar
      ctx.save(); ctx.globalAlpha = 0.85; polyline(ring, C_ROT, 3); ctx.restore();
      knob(...ring[0], 8, C_ROT);
      gizmo.push({ type: 'brot', poly: ring, q, w });
    }
  }
  // Griffe nur, wenn der Anfang gewählt ist, ein Parallelrohr gewählt ist oder Stufe „Alle“ gilt
  const on = vis.dimLevel === 'all' || startOpen || bundleSel >= 0 || (selPoint?.pid === p.id && selPoint.w === 'S');
  if ((!gz && on) || gz?.type === 'bdist') p.bundle.forEach((b, i) => {
    const B = layout.bundle[i];
    if (!B || b.hidden) return;
    const [x, y] = P3(B.A), v = sideDir(verts, b.side);
    knob(x, y, i === bundleSel ? 8 : 6, cAcc);
    if (!gz) gizmo.push({ type: 'bdist', i, at: [x, y], r: 12, pxPerMm: mmPx(v) });
  });
  if (!gz) {
    if (on) {
      knob(ax, ay, 8, cAcc);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const dy of [-2.5, 0, 2.5]) { ctx.moveTo(ax - 3.5, ay + dy); ctx.lineTo(ax + 3.5, ay + dy); }
      ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(ax, ay, 3, 0, 7); ctx.fillStyle = css('--muted'); ctx.fill(); }
    if (on && p.bundle.length && vis.labels) { ctx.font = '700 11px system-ui'; ctx.fillStyle = cAcc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.bundle.length + 1, ax + 16, ay - 14); }
    gizmo.push({ type: 'start', at: [ax, ay], r: 22 });
  }
}

function segDist(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)) : 0;
  return Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
}
function hitGizmo(x, y) {
  let best = null, bd = hitTol(16);
  for (const g of gizmo) {
    let d = Infinity;
    if (g.at) d = Math.hypot(x - g.at[0], y - g.at[1]) - g.r + 6; // Griff hat Vorrang
    else if (g.seg) d = segDist(x, y, ...g.seg) - 3;
    else for (let k = 1; k < g.poly.length; k++) d = Math.min(d, segDist(x, y, ...g.poly[k - 1], ...g.poly[k]));
    if (d < bd) { bd = d; best = g; }
  }
  // Griff mit Plus geht vor: Die Pfeile beginnen direkt daneben und würden ihn sonst abfangen und die Richtung sperren
  const plus = gizmo.find(g => g.type === 'ext' && g.at);
  if (plus && best?.type === 'ext' && best.a && Math.hypot(x - plus.at[0], y - plus.at[1]) < hitTol(16)) best = plus;
  // Bei kleinem Maßstab liegen die Punkte der Parallelrohre im Griff: es zählt, was dem Finger am nächsten ist
  if (best?.type === 'start') {
    const raw = g => Math.hypot(x - g.at[0], y - g.at[1]);
    for (const g of gizmo) if (g.type === 'bdist' && raw(g) < hitTol(14) && raw(g) < raw(best)) best = g;
  }
  return best;
}

function gzStart(g, e) {
  const p = proj(), [lx, ly] = local(e);
  const before = snapshot();
  ensureDeltas();
  const pts = points(p), n = pts.length - 1;
  gz = { ...g, before, committed: false, sx: e.clientX, sy: e.clientY, px: lx, py: ly, moved: false, orig: structuredClone(p.deltas), E0: endOf(p), label: '', pool: [...pts, ...(layout.ghosts || []).flatMap(q => q.verts)], planes: snapPlanes(p, g) };
  fit = lastBase;
  if (BUNDLE_GZ.includes(g.type)) {
    gz.bOrig = structuredClone(p.bundle); gz.As = view.P3(layout.verts[0]);
    if (g.type === 'pmove') { gz.sOrig = sceneState(p); gz.dOrig = structuredClone(p.deltas); gz.oOrig = [...p.origin]; gz.v0 = g.key[0] === 'R' ? (pl => pl[planeKey(pl, g.k)])(planeById(g.key.slice(2))) : nodePos(g.key)[g.k]; }
    gz.gx = lx; gz.gy = ly;
    if (g.type === 'lmove') { gz.oOrig = [...p.origin]; gz.dOrig = structuredClone(p.deltas); gz.txOrig = structuredClone(p.bundleTx); gz.t = 0; gz.res = null; }
    if (g.type === 'ofs') { gz.oOrig = [...p.origin]; gz.dOrig = structuredClone(p.deltas); gz.txOrig = structuredClone(p.bundleTx); gz.res = null;
      // Kleinster Versatz, für den die Bögen wirklich reichen; darunter ist es nur Vorschau
      gz.vMin = Infinity;
      for (let v = 5; v <= 1000 && gz.vMin === Infinity; v += 5) { const r = ofsBuild(gz.dOrig, gz.oOrig, ofs, p, v, g.s, g.dir); if (!r) break; if (r.deltas && shiftOk(p, r)) gz.vMin = v; }
    }
    if (g.type === 'ofsc') gz.t0 = ofs.t;
    if (g.type === 'first') { gz.S = pts[0]; gz.min = minLengths(); gz.pool = (layout.ghosts || []).flatMap(q => q.verts); }
    if (g.type === 'cofs') { gz.v0 = create.off[g.k]; gz.base = create.ref.pos[g.k]; }
    if (g.type === 'cmove') { gz.A0 = pts[g.i]; gz.dOrig = structuredClone(p.deltas); gz.t = 0; }
    if (g.type === 'spin') { gz.A = pts[0]; gz.r = 60 / view.sc; gz.t0 = ringAngle(g.u, g.v, 0, 359, lx, ly); }
    if (g.type === 'bnew') gz.base = p.bundle.filter(b => b.side === g.side).at(-1)?.dist || 0;
    if (g.type === 'brot') { gz.A = layout.verts[0]; gz.r = 74 / view.sc; gz.t0 = ringAngle(g.q, g.w, 0, 359, lx, ly); }
    return;
  }
  if (g.type === 'ext') {
    gz.E = pts[n]; gz.d = V.norm(V.sub(pts[n], pts[n - 1])); gz.L0 = V.len(V.sub(pts[n], pts[n - 1]));
    gz.Es = view.P3(gz.E); gz.min = minLengths(); gz.grab = [lx, ly];
  } else if (g.type === 'len') {
    gz.idx = g.i; gz.dir = V.norm(legVec(g.i)); gz.L0 = V.len(legVec(g.i));
  } else {
    Object.assign(gz, ringBasis(g.i, pts), { A: pts[g.i], r: 60 / view.sc });
    // Griffpunkt merken: Der Ring dreht ab hier, das Rohr springt nicht zum Zeiger
    gz.t0 = g.type === 'bend' ? ringAngle(gz.p, gz.q, 0, 359, lx, ly) : ringAngle(gz.q, gz.w, 0, 359, lx, ly);
    gz.lastA = gz.theta;
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
  const a = deg * Math.PI / 180, p = proj();
  if (p.endFixed && gz.i < gz.orig.length - 1) {
    // Ende fixiert: nur dieser Schenkel dreht sich, die freien Schenkel gleichen über ihre Länge aus
    p.deltas = structuredClone(gz.orig);
    setDelta(gz.i, rotAbout(deltaVec(gz.orig[gz.i]), axis, a));
    gzKeep();
    return;
  }
  p.deltas = gz.orig.map((d, k) => (k < gz.i ? { ...d } : null));
  gz.orig.forEach((d, k) => { if (k >= gz.i) setDelta(k, rotAbout(deltaVec(d), axis, a)); });
}
// Während des Ziehens: Ausgleich für das feste Ende; geht es nicht, bleibt die Form wie vor dem Ziehen
function gzKeep() {
  const p = proj(), r = keepEnd(p, gz.i ?? gz.idx, gz.E0);
  if (!r.ok) { p.deltas = structuredClone(gz.orig); gz.fail = r.reason; } else { gz.fail = null; adjusted = { set: new Set(r.changed), t: performance.now() }; }
}

function extMove(lx, ly) {
  // Pfeil: Maßgeblich ist der Weg ab dem Griffpunkt, sonst spränge das Rohr bis dorthin. Griff mit Plus: Zeiger gegenüber dem Rohrende
  const p = proj(), [ox, oy] = gz.a ? gz.grab : gz.Es, vx = lx - ox, vy = ly - oy, vl = Math.hypot(vx, vy);
  p.deltas = structuredClone(gz.orig);
  gz.choice = null; gz.tail = 0;
  if (vl < EXT_DEAD) { gz.label = 'Loslassen = nichts ändern'; return; }
  // Pfeil: nur seine Achse, in beide Richtungen. Griff mit Plus: Richtung, die am besten zur Zeigerrichtung passt, bei jeder Bewegung neu bestimmt
  const cands = extCandidates(gz.E, gz.d).filter(c => !gz.a || (gz.n ? c.n && Math.abs(V.dot(c.n, gz.n)) > 0.9999 : c.straight));
  let best = null, bs = -Infinity;
  for (const c of cands) {
    const s = (vx * c.sx + vy * c.sy) / (vl * Math.hypot(c.sx, c.sy));
    if (s > bs) { bs = s; best = c; }
  }
  if (!best) { gz.label = 'Loslassen = nichts ändern'; return; }
  gzChanged();
  gz.choice = best.a;
  const last = p.deltas.length - 1;
  if (best.straight) {
    // geradeaus länger, zurück kürzer: Projektion auf die Schenkelrichtung (vorzeichenbehaftet)
    const sx = best.sx * Math.sign(V.dot(best.a, gz.d)), sy = best.sy * Math.sign(V.dot(best.a, gz.d));
    const want = gz.L0 + (vx * sx + vy * sy) / (sx * sx + sy * sy);
    // Unter der Mindestlänge schrumpft der Bogen mit; was beim Loslassen zu kurz ist, regelt gzEnd
    if (last > 0 && want < gz.min.lastLeg) {
      gz.tail = gz.min.lastLeg;
      setDelta(last, V.mul(gz.d, Math.max(1, want)));
      gz.label = want < gz.min.lastLeg / 2 ? 'Loslassen: Schenkel und Bogen entfallen' : `Schenkel ${last + 1}: mindestens ${fmt(gz.min.lastLeg)} mm`;
      return;
    }
    const raw = round5(want, gz.min.lastLeg);
    const { L, tag } = snapLen(V.sub(gz.E, V.mul(gz.d, gz.L0)), gz.d, raw);
    setDelta(last, V.mul(gz.d, L));
    gz.label = `Schenkel ${last + 1}: ${fmt(L)} mm${tag ? ' · ' + tag : ''}`;
  } else {
    const want = (vx * best.sx + vy * best.sy) / (best.sx * best.sx + best.sy * best.sy);
    p.deltas.push({ x: 0, y: 0, z: 0 });
    // Kurz nach dem Abzweigen wächst der Bogen mit dem Schenkel
    if (want < gz.min.newLeg) {
      gz.tail = gz.min.newLeg;
      setDelta(last + 1, V.mul(best.a, Math.max(1, want)));
      gz.label = want < gz.min.newLeg / 2 ? 'Loslassen = nichts ändern' : `Neuer Schenkel: mindestens ${fmt(gz.min.newLeg)} mm`;
      return;
    }
    const raw = round5(want, gz.min.newLeg);
    const { L, tag } = snapLen(gz.E, best.a, raw);
    setDelta(last + 1, V.mul(best.a, L));
    gz.label = `Neuer Schenkel ${fmt(L)} mm · ${tag || `${vis.extAng || 90}°`}`;
  }
}

function gzMove(e) {
  snapLine = null;
  const dx = e.clientX - gz.sx, dy = e.clientY - gz.sy, [lx, ly] = local(e);
  if (Math.hypot(dx, dy) > (gz.type === 'ofs' ? 1 : 4)) gz.moved = true; // der Versatz soll vom ersten Pixel an mitlaufen
  gz.px = lx; gz.py = ly;
  if (BUNDLE_GZ.includes(gz.type)) { bundleMove(lx, ly); return; }
  if (gz.type === 'ext') {
    extMove(lx, ly);
  } else if (gz.type === 'len') {
    if (!gz.moved) return;
    gzChanged();
    const [mx, my] = gz.pxPerMm, B0 = V.mul(gz.dir, 1), k = [0, 1, 2].find(c => Math.abs(Math.abs(B0[c]) - 1) < 1e-6), S = points(proj())[gz.idx];
    let L = round5(gz.L0 + (dx * mx + dy * my) / (mx * mx + my * my));
    if (k !== undefined) { const E = S[k] + B0[k] * L, F = fang(k, E, Math.hypot(mx, my), [S, V.add(S, V.mul(gz.dir, gz.L0))], () => points(proj())[gz.idx + 1]); if (F !== E && (F - S[k]) * B0[k] > 0) L = (F - S[k]) * B0[k]; }
    proj().deltas = structuredClone(gz.orig);
    setDelta(gz.idx, V.mul(gz.dir, L));
    gzKeep();
    gz.label = gz.fail ? 'Ende fixiert – so nicht möglich' : `${fmt(L)} mm`;
  } else if (gz.type === 'bend') {
    // Ganzer Ring: negative Winkel biegen in die Gegenrichtung, 0° macht gerade (die Schenkel verschmelzen beim Loslassen), ganz zurück (180°) geht nicht
    const t = normRot(ringAngle(gz.p, gz.q, 0, 359, lx, ly) - gz.t0), st = normRot(gz.theta + Math.round(t / ANGLE_STEP) * ANGLE_STEP);
    const a = Math.abs(st) <= ANGLE_STEP / 2 ? 0 : Math.abs(st) > 180 - ANGLE_STEP / 2 ? gz.lastA : st;
    gz.lastA = a;
    if (Math.abs(a - gz.theta) > 0.01 || gz.committed) { gzChanged(); rotateTail(V.norm(V.cross(gz.p, gz.q)), a - gz.theta); }
    gz.label = gz.fail ? 'Ende fixiert – so nicht möglich' : a ? `Biegung ${gz.i}: ${fmt(Math.abs(a))}°` : 'Gerade: Bogen entfällt beim Loslassen';
  } else {
    const t = normRot(Math.round(normRot(ringAngle(gz.q, gz.w, 0, 359, lx, ly) - gz.t0) / ANGLE_STEP) * ANGLE_STEP);
    if (t !== 0 || gz.committed) { gzChanged(); rotateTail(gz.p, t); }
    gz.label = gz.fail ? 'Ende fixiert – so nicht möglich' : `Drehung ${t > 0 ? '+' : ''}${t}°`;
  }
  // Reicht die Geometrie nicht, bleibt der letzte passende Stand: Das Rohr verformt sich nie
  if (gz.type !== 'ext') {
    const p = proj();
    if (bendsFit(p)) gz.good = { d: structuredClone(p.deltas), o: [...p.origin] };
    else { p.deltas = structuredClone(gz.good?.d || gz.orig); if (gz.good) p.origin = [...gz.good.o]; gz.label = 'Schenkel zu kurz für diesen Bogen'; }
  }
  recompute(true);
}
// Abschnitt i um den Vektor v verschieben. Reihenfolge: Erst nehmen bestehende Schenkel die Verschiebung auf – auf jeder Seite
// der nächste Schenkel, der sie über seine Länge ausgleichen kann; was dazwischen liegt, wandert unverändert mit.
// Nur wenn es auf einer Seite keinen solchen Schenkel gibt, entsteht dort ein neuer Schenkel mit zusätzlicher Biegung
// (bei freiem Ende wandert der Rest stattdessen samt Rohrende mit, bei losem Anfang samt Rohranfang: shiftStart).
// „Fest“ markierte Schenkel gleichen nie aus.
function legShift(ds, i, v, freeEnd = false, freeStart = false) {
  const n = ds.length, dir = j => V.norm(deltaVec(ds[j]));
  const split = (u, d) => { // v = a·u + b·d
    const ud = V.dot(u, d), det = 1 - ud * ud;
    if (Math.abs(det) < 1e-9) return null;
    const a = (V.dot(u, v) - ud * V.dot(d, v)) / det, b = (V.dot(d, v) - ud * V.dot(u, v)) / det;
    return V.len(V.sub(v, V.add(V.mul(u, a), V.mul(d, b)))) < 0.01 ? a : null;
  };
  const add = ds.map(() => [0, 0, 0]), changed = new Set(), moved = new Set([i]);
  const stretch = (j, w) => { add[j] = V.add(add[j], w); if (V.len(w) > 0.01) changed.add(j); };
  // Davor: Schenkel j nimmt auf, der Schenkel dahinter (k) passt sich an, alles bis i wandert mit
  let insP = true;
  for (let k = i, j = i - 1; j >= 0; k = j, j--) {
    const a = ds[j].lock ? null : split(dir(j), dir(k));
    if (a != null) { const w = V.mul(dir(j), a); stretch(j, w); stretch(k, V.sub(v, w)); insP = false; break; }
    moved.add(j);
  }
  const shiftStart = insP && freeStart;
  if (shiftStart) insP = false;
  else if (insP) { moved.clear(); moved.add(i); }
  // Dahinter entsprechend; ohne ausgleichenden Schenkel wandert bei freiem Ende alles mit
  let insN = true, runN = [];
  for (let k = i, j = i + 1; j < n; k = j, j++) {
    const a = ds[j].lock ? null : split(dir(j), dir(k));
    if (a != null) { const w = V.mul(dir(j), a); stretch(j, V.mul(w, -1)); stretch(k, V.sub(w, v)); insN = false; break; }
    runN.push(j);
  }
  if (insN && freeEnd) insN = false;
  else if (insN) runN = [];
  runN.forEach(j => moved.add(j));
  // Neue Schenkelliste
  const out = [], index = {};
  ds.forEach((o, j) => {
    if (j === i && insP) { changed.add(`n${out.length}`); out.push({ x: v[0], y: v[1], z: v[2] }); }
    index[j] = out.length;
    const w = V.add(deltaVec(o), add[j]);
    out.push({ ...o, x: w[0], y: w[1], z: w[2] });
    if (j === i && insN) { changed.add(`n${out.length}`); out.push({ x: -v[0], y: -v[1], z: -v[2] }); }
  });
  const list = [...changed].map(c => (typeof c === 'string' ? +c.slice(1) : index[c]));
  const flip = ds.some((o, j) => V.dot(deltaVec(o), deltaVec(out[index[j]])) <= 0);
  const locked = !!ds[i].lock && changed.has(i);
  return { deltas: out, newI: index[i], insP, insN, shiftStart, changed: list, locked, flip, index, moved: [...moved].map(j => [index[j], j]) };
}
// Ein Zwischenstand ist erlaubt, wenn alle geänderten Schenkel für ihre Bögen reichen
function shiftOk(p, r) {
  const f = prof(p), L = computeLayout(pointsFromDeltas(r.deltas, p.origin), { R: f.R, minStraight: f.minStraight }), n = r.deltas.length;
  if (r.flip || L.verts.length !== n + 1) return false;
  return r.changed.every(j => L.straights[j] >= (j > 0 && j < n - 1 ? f.minStraight || 0 : 0) - 0.05);
}
// Bis zu welcher Verschiebung läuft ein Nachbarschenkel auf Länge 0? Ab der Hälfte dieses Wegs rastet der Abschnitt dort ein.
function vanishAt(ds, r, t) {
  let best = null;
  ds.forEach((o, j) => {
    const old = deltaVec(o), L = V.len(old), now = V.dot(deltaVec(r.deltas[r.index[j]]), V.norm(old)), slope = (now - L) / t;
    if (Math.abs(slope) < 1e-6) return;
    const t0 = -L / slope;
    if (t0 * t > 0 && Math.abs(t) >= 0.5 * Math.abs(t0) && (best == null || Math.abs(t0) < Math.abs(best))) best = t0;
  });
  return best;
}
// Schenkel ohne Länge entfernen; laufen die Nachbarn danach geradeaus, werden sie ein Schenkel
function collapseLegs(r) {
  const arr = r.deltas.map(o => ({ ...o })), ops = [], near = [];
  let newI = r.newI;
  for (let j = 0; j < arr.length; j++) {
    if (V.len(deltaVec(arr[j])) > 0.5) continue;
    if (arr.length < 2) return null;
    arr.splice(j, 1); ops.push(['del', j]);
    if (j <= newI) newI = Math.max(0, newI - 1);
    if (j > 0 && j < arr.length) {
      const a = deltaVec(arr[j - 1]), b = deltaVec(arr[j]);
      if (V.len(V.cross(a, b)) < 1e-3 * V.len(a) * V.len(b)) {
        if (V.dot(a, b) < 0) return null; // liefe zurück: nicht biegbar
        const w = V.add(a, b);
        arr[j - 1] = { ...arr[j - 1], x: w[0], y: w[1], z: w[2] };
        arr.splice(j, 1); ops.push(['merge', j]);
        if (j <= newI) newI = Math.max(0, newI - 1);
      }
    }
    near.push(Math.max(0, j - 1), Math.min(arr.length - 1, j));
    j--;
  }
  if (!ops.length || !arr.length) return null;
  return { ...r, deltas: arr, newI, ops, changed: [...new Set(near)].filter(j => j < arr.length), flip: false, moved: [], removed: true };
}
// Rahmen des Versatz-X: Rohrrichtung u und die beiden Querrichtungen (die erste waagerecht).
// Das X liegt in der Ebene aus u und der Versatzrichtung; automatisch in der, die am besten zum Betrachter zeigt.
function ofsFrame() {
  const v = legVec(ofs.i), u = V.norm(v), c = V.cross(u, [0, 0, 1]), n1 = V.len(c) > 1e-6 ? V.norm(c) : [1, 0, 0], n2 = V.norm(V.cross(u, n1)), d = viewDir();
  const cur = ofs.n ?? (Math.abs(V.dot(n2, d)) >= Math.abs(V.dot(n1, d)) ? 0 : 1);
  return { u, L: V.len(v), ns: [n1, n2], cur, n: cur ? n2 : n1 };
}
// Versatz v in Richtung nd: s = 1 setzt den Rohrteil danach ab, s = -1 den Teil davor. Er beginnt am Punkt t und arbeitet in Zugrichtung:
// Die Schräge verbraucht Länge nur auf der gezogenen Seite, die andere Seite des Schenkels bleibt, wie sie ist.
// Ist die bewegte Seite fest, gleicht dort ein Schenkel aus. Ergebnis: neue Schenkel, { blocked } oder null (kein Platz).
function ofsBuild(ds, origin, o, p, v, s, nd) {
  const i = o.i, leg = deltaVec(ds[i]), L = V.len(leg), u = V.mul(leg, 1 / L), w = V.mul(nd, v), run = o.ang >= 89.9 ? 0 : v / Math.tan(o.ang * Math.PI / 180);
  const a = s > 0 ? o.t : o.t - run, b = s > 0 ? L - o.t - run : L - o.t, vec = q => ({ x: q[0], y: q[1], z: q[2] });
  if (a < 1 || b < 1) return null;
  const A = vec(V.mul(u, a)), B = vec(V.mul(u, b)), out = ds.map(d => ({ ...d }));
  // Bezug und Ausgleich bleiben an dem Stück, das nicht wandert
  out.splice(i, 1, s > 0 ? { ...ds[i], ...A } : A, vec(V.add(V.mul(w, s), V.mul(u, run))), s > 0 ? B : { ...ds[i], ...B });
  const changed = [i, i + 1, i + 2];
  if (s > 0 ? !p.endFixed : !p.startFixed) return { deltas: out, origin: s > 0 ? origin : V.add(origin, w), changed };
  const pool = out.map((d, j) => j).filter(j => (s > 0 ? j > i + 2 : j < i)).sort((x, y) => (s > 0 ? x - y : y - x)).filter(j => !out[j].lock)
    .map(j => { const q = deltaVec(out[j]), l = V.len(q); return { j, L: l, u: l > 1e-9 ? V.mul(q, 1 / l) : null, d: out[j] }; }).filter(l => l.u);
  const r = solveLengths(V.mul(w, -s), pool);
  if (!r.ok) return { blocked: `${s > 0 ? 'Das Ende' : 'Der Anfang'} ist fest, und kein Schenkel kann ausgleichen. ${s > 0 ? 'Ende' : 'Anfang'} öffnen oder die andere Seite des X ziehen.` };
  if (r.S.some((l, k) => l.L + r.c[k] < 1)) return null;
  r.S.forEach((l, k) => { Object.assign(out[l.j], vec(V.mul(l.u, l.L + r.c[k]))); changed.push(l.j); });
  return { deltas: out, origin, changed };
}
// Versatz eines schrägen Schenkels j gegenüber dem Schenkel davor; rechtwinklige Schenkel sind selbst das Maß
function offsetOf(p, j) {
  const u = V.norm(deltaVec(p.deltas[j - 1])), b = deltaVec(p.deltas[j]), run = V.dot(b, u), w = V.sub(b, V.mul(u, run)), v = V.len(w);
  return Math.abs(run) < 0.5 || v < 0.5 ? null : { u, run, w, v };
}
// Versatz nacharbeiten: Der Winkel bleibt. Beim Versatz gleicht der gerade Teil dahinter die Schräge aus, das Rohr dahinter rückt nur quer
function setOffset(p, j, v) {
  const o = offsetOf(p, j), k = v / o.v, e = etageAt(p, j), b = deltaVec(p.deltas[j]);
  return withEnd(j, () => {
    setDelta(j, V.mul(b, k));
    if (e) setDelta(j + 1, V.sub(deltaVec(p.deltas[j + 1]), V.mul(o.u, o.run * (k - 1))));
  });
}
// Schenkel j als Schräge eines Versatzes: Nachbarn laufen parallel weiter
function etageAt(p, j) {
  if (j < 1 || j >= p.deltas.length - 1) return null;
  const a = deltaVec(p.deltas[j - 1]), b = deltaVec(p.deltas[j]), c = deltaVec(p.deltas[j + 1]), u = V.norm(a);
  if (V.len(V.cross(u, V.norm(c))) > 1e-3 || V.dot(u, c) <= 0) return null;
  const run = V.dot(b, u), w = V.sub(b, V.mul(u, run)), v = V.len(w);
  return v < 0.5 || run < -0.01 ? null : { u, w, run, v, ang: Math.atan2(v, run) * 180 / Math.PI };
}
// Winkel eines Versatzes ändern: Versatz und Mitte bleiben, die Nachbarn gleichen je zur Hälfte aus
function setEtageAng(p, j, ang) {
  const e = etageAt(p, j);
  if (!e) return;
  const run = ang >= 89.9 ? 0 : e.v / Math.tan(ang * Math.PI / 180), da = (run - e.run) / 2, out = p.deltas.map(d => ({ ...d }));
  const put = (k, q) => Object.assign(out[k], { x: q[0], y: q[1], z: q[2] });
  put(j - 1, V.sub(deltaVec(out[j - 1]), V.mul(e.u, da))); put(j + 1, V.sub(deltaVec(out[j + 1]), V.mul(e.u, da))); put(j, V.add(e.w, V.mul(e.u, run)));
  if (out[j - 1].lock || out[j + 1].lock || !shiftOk(p, { deltas: out, flip: false, changed: [j - 1, j, j + 1] })) { toast('Dieser Winkel passt hier nicht: Die geraden Stücke würden zu kurz.'); return; }
  commit(); p.deltas = out; renderInputs(); recompute(); selectLeg(j);
}
function legMoveTo(t) {
  const p = proj(), e = [0, 0, 0], ds = gz.dOrig;
  e[gz.k] = t;
  let r = legShift(ds, gz.i, e, !p.endFixed, !p.startFixed);
  if (!shiftOk(p, r)) {
    const t0 = t ? vanishAt(ds, r, t) : null;
    if (t0 == null) return null;
    e[gz.k] = t0;
    r = collapseLegs(legShift(ds, gz.i, e, !p.endFixed, !p.startFixed));
    if (!r || !shiftOk(p, r)) return null;
    t = t0;
  }
  r.t = t;
  p.deltas = structuredClone(r.deltas);
  p.origin = r.shiftStart ? V.add(gz.oOrig, e) : [...gz.oOrig];
  p.bundleTx = structuredClone(gz.txOrig);
  if (r.insP) txInsertLegs(p, gz.i, 1);
  if (r.insN) txInsertLegs(p, r.newI + 1, 1);
  (r.ops || []).forEach(([op, j]) => {
    if (op === 'del') txDeleteLeg(p, j);
    else { p.bundleTx = p.bundleTx.filter(x => x.bend !== j - 1); p.bundleTx.forEach(x => { if (x.bend >= j) x.bend--; }); }
  });
  // Mitwandernde Schenkel, die an einer Ebene hängen, behalten ihren Bezug: Das Maß ändert sich mit
  r.moved.forEach(([ni, oi]) => { const leg = p.deltas[ni]; if (leg.ref && planeById(leg.ref.plane)?.axis === gz.k) leg.ref.off = r1(gz.dOrig[oi].ref.off + t); });
  return r;
}
// Abstand zu Rohr 1 aus der Zeigerposition (Pfeil oder Punkt zieht quer zum ersten Schenkel)
const pointerMm = (lx, ly, [mx, my]) => ((lx - gz.As[0]) * mx + (ly - gz.As[1]) * my) / (mx * mx + my * my);
// Gap ändern: dieses Rohr und alle weiter außen auf derselben Seite wandern mit, die anderen Abstände bleiben
function shiftBundle(bs, orig, i, delta) {
  bs.forEach((b, k) => { if (k >= i && orig[k].side === orig[i].side) b.dist = r1(orig[k].dist + delta); });
}
function bundleMove(lx, ly) {
  const p = proj(), D = prof(p).D;
  if (!gz.moved || gz.blocked) return;
  if (gz.type === 'first' || gz.type === 'cofs') {
    const [mx, my] = gz.pxPerMm, px = Math.hypot(mx, my), t = ((gz.px - gz.gx) * mx + (gz.py - gz.gy) * my) / (mx * mx + my * my);
    if (gz.type === 'cofs') {
      create.off[gz.k] = fang(gz.k, gz.base + gz.v0 + Math.round(t / 5) * 5, px, [], createPos) - gz.base;
      gz.label = `${'XYZ'[gz.k]} ${fmt(create.off[gz.k])}`;
      renderBundleBar();
      return;
    }
    setFirstLeg(p, gz.k, t, px);
    return;
  }
  if (gz.type === 'cmove') {
    const [mx, my] = gz.pxPerMm, e = [0, 0, 0];
    let t = Math.round(((gz.px - gz.gx) * mx + (gz.py - gz.gy) * my) / (mx * mx + my * my));
    t = fang(gz.k, gz.A0[gz.k] + t, Math.hypot(mx, my), [gz.A0], () => points(p)[gz.i]) - gz.A0[gz.k];
    e[gz.k] = t;
    const legs = structuredClone(gz.dOrig), put = (j, v) => { legs[j] = { ...legs[j], x: v[0], y: v[1], z: v[2] }; };
    put(gz.i - 1, V.add(deltaVec(gz.dOrig[gz.i - 1]), e)); put(gz.i, V.sub(deltaVec(gz.dOrig[gz.i]), e));
    const was = p.deltas, cross = V.dot(deltaVec(legs[gz.i]), deltaVec(gz.dOrig[gz.i])) > 0;
    p.deltas = legs;
    if (cross && bendsFit(p)) { gzChanged(); gz.t = t; gz.label = ''; } else { p.deltas = was; gz.label = 'Schenkel zu kurz für diesen Bogen'; }
    recompute(true);
    return;
  }
  if (gz.type === 'spin') {
    const deg = normRot(Math.round(normRot(ringAngle(gz.u, gz.v, 0, 359, lx, ly) - gz.t0) / ANGLE_STEP) * ANGLE_STEP);
    if (deg || gz.committed) { gzChanged(); p.deltas = structuredClone(gz.orig); gz.orig.forEach((d, k) => setDelta(k, rotAbout(deltaVec(d), gz.n, deg * Math.PI / 180).map(c => (Math.abs(c) < 1e-9 ? 0 : c)))); }
    gz.label = `Drehung ${deg > 0 ? '+' : ''}${deg}°`;
    recompute(true);
    return;
  }
  if (gz.type === 'ofsc') {
    const [mx, my] = gz.pxPerMm, m = mx * mx + my * my, L = V.len(legVec(ofs.i));
    if (m < 1e-6) return;
    ofs.t = round5(Math.max(5, Math.min(L - 5, gz.t0 + ((gz.px - gz.gx) * mx + (gz.py - gz.gy) * my) / m)), 5);
    draw();
    return;
  }
  if (gz.type === 'ofs') {
    const [mx, my] = gz.pxPerMm, raw = Math.max(0, ((gz.px - gz.gx) * mx + (gz.py - gz.gy) * my) / (mx * mx + my * my)) * Math.SQRT1_2;
    // Unter dem kleinsten möglichen Versatz läuft er stufenlos mit, die Bögen werden dafür enger; was beim Loslassen zu klein ist, regelt bundleEnd
    const v = raw < gz.vMin ? r1(raw) : round5(raw, 0), r = v > 0.5 ? ofsBuild(gz.dOrig, gz.oOrig, ofs, p, v, gz.s, gz.dir) : null;
    const ok = !!r?.deltas && shiftOk(p, r), soft = !ok && !!r?.deltas && v < gz.vMin;
    if (ok || soft || !r) {
      if (r?.deltas) gzChanged();
      const use = r?.deltas ? r : null;
      p.deltas = structuredClone(use ? use.deltas : gz.dOrig); p.origin = [...(use ? use.origin : gz.oOrig)]; p.bundleTx = structuredClone(gz.txOrig);
      if (use) txInsertLegs(p, ofs.i, 2);
      gz.res = ok ? r : null; gz.soft = soft; gz.v = v;
    }
    gz.label = ok || !r ? '' : soft ? `Mindestens ${fmt(gz.vMin)} mm` : 'Zu wenig Platz'; // das Maß selbst steht am Rohr
    recompute(true);
    return;
  }
  if (gz.type === 'lmove') {
    gzChanged();
    const [mx, my] = gz.pxPerMm, A = points({ ...p, deltas: gz.dOrig, origin: gz.oOrig })[gz.i], B = points({ ...p, deltas: gz.dOrig, origin: gz.oOrig })[gz.i + 1];
    const t = fang(gz.k, A[gz.k] + Math.round(((gz.px - gz.gx) * mx + (gz.py - gz.gy) * my) / (mx * mx + my * my)), Math.hypot(mx, my), [A, B], () => { const n = gz?.res?.newI ?? gz?.i ?? 0, q = points(p); return V.mul(V.add(q[n], q[n + 1]), 0.5); }) - A[gz.k];
    const r = legMoveTo(t);
    if (r) { gz.t = r.t; gz.res = r; } else if (gz.res || gz.t === 0) legMoveTo(gz.t);
    const f = prof(p), neu = r && (r.insP || r.insN), weg = r?.removed;
    gz.label = !r ? (gz.t === 0 ? `Neue Biegung erst ab ${fmt(2 * f.R + (f.minStraight || 0))} mm` : `Weiter geht es nicht: Mindestlänge · ${fmt(Math.abs(gz.t))} mm`) : `${fmt(Math.abs(r.t))} mm${weg ? ' · Bogen entfällt' : neu ? ' · neue Biegung' : ''}`;
    recompute(true);
    return;
  }
  if (gz.type === 'pmove') {
    gzChanged();
    restoreSceneState(p, gz.sOrig); p.deltas = structuredClone(gz.dOrig); p.origin = [...gz.oOrig];
    const [mx, my] = gz.pxPerMm, dx = gz.px - gz.gx, dy = gz.py - gz.gy, A0 = gz.key[0] === 'R' ? null : gz.nodeA ??= nodePos(gz.key);
    const v = fang(gz.k, Math.round(gz.v0 + (dx * mx + dy * my) / (mx * mx + my * my)), Math.hypot(mx, my), A0 ? [A0] : [], () => (A0 ? nodePos(gz.key) : view.mid));
    const ok = setNodeCoord(gz.key, gz.k, v);
    gz.label = ok ? `${'XYZ'[gz.k]} ${fmt(v)}` : 'So nicht möglich – kein Schenkel kann ausgleichen';
    recompute(true);
    return;
  }
  if (gz.type === 'bnew') {
    gzChanged();
    if (gz.newI == null) { p.bundle.push({ id: uid(), side: gz.side, dist: gz.base + D + 1 }); gz.newI = p.bundle.length - 1; }
    const dist = Math.round(Math.max(gz.base + D + 1, pointerMm(lx, ly, gz.pxPerMm)));
    p.bundle[gz.newI].dist = dist;
    gz.label = `Rohr ${gz.newI + 2}: ${fmt(dist - gz.base)} mm zum Nachbarn`;
  } else if (gz.type === 'bdist') {
    gzChanged();
    const orig = gz.bOrig, base = orig.slice(0, gz.i).filter(b => b.side === orig[gz.i].side).at(-1)?.dist || 0;
    const dist = Math.round(Math.max(base + D + 1, pointerMm(lx, ly, gz.pxPerMm)));
    shiftBundle(p.bundle, orig, gz.i, dist - orig[gz.i].dist);
    gz.label = `Rohr ${gz.i + 2}: ${fmt(dist - base)} mm zum Nachbarn`;
  } else if (gz.type === 'brot') {
    const steps = Math.round(normRot(ringAngle(gz.q, gz.w, 0, 359, lx, ly) - gz.t0) / 90);
    if (steps || gz.committed) { gzChanged(); p.bundle.forEach((b, k) => { b.side = (((gz.bOrig[k].side + steps) % 4) + 4) % 4; }); }
    gz.label = `Bündel: ${dirName(sideDir(layout.verts, p.bundle[0].side))}`;
  }
  recompute(true);
}
function bundleEnd(g) {
  const p = proj();
  if (g.type === 'cofs') { renderBundleBar(); draw(); return; }
  if (g.type === 'first') {
    if (!g.moved) setLeg0(p, g.k, g.s * 500);
    if (p.stub) { restoreSnapshot(g.before); recompute(); return; } // zu kurz gezogen: weiter nur der Startpunkt
    commit(null, g.before);
    extOpen = true;
    refit(); renderInputs(); recompute(); selectLeg(-1);
    return;
  }
  if (g.type === 'ofsc') { draw(); return; }
  if (g.type === 'cmove') { renderInputs(); recompute(); selectCorner(g.i); return; }
  if (g.type === 'spin') { renderInputs(); recompute(); selectPoint(p.id, 'S'); return; }
  if (g.type === 'ofs') {
    if (g.blocked) { toast(g.blocked); draw(); return; }
    // Beim Loslassen unter der Mindestgröße: Bis zur Hälfte fällt der Versatz weg, darüber gilt der kleinste mögliche
    if (g.soft) {
      const r = g.v >= g.vMin / 2 && g.vMin < Infinity ? ofsBuild(g.dOrig, g.oOrig, ofs, p, g.vMin, g.s, g.dir) : null;
      p.deltas = structuredClone(r ? r.deltas : g.dOrig); p.origin = [...(r ? r.origin : g.oOrig)]; p.bundleTx = structuredClone(g.txOrig);
      if (r) txInsertLegs(p, ofs.i, 2);
      g.res = r;
    }
    if (!g.res) { if (!g.moved) toast('Arm ziehen: Der Rohrteil auf dieser Seite wandert in Pfeilrichtung.'); recompute(); return; }
    const i = ofs.i;
    ofs = null; adjusted = { set: new Set(g.res.changed.filter(j => j < i || j > i + 2)), t: performance.now() };
    refit(); renderInputs(); recompute(); selectLeg(i + 1);
    return;
  }
  if (g.type === 'lmove') {
    if (!g.moved) return;
    if (g.res) adjusted = { set: new Set(g.res.changed), t: performance.now() };
    refit();
    renderInputs(); recompute(); selectLeg(g.res ? g.res.newI : g.i);
    return;
  }
  if (g.type === 'start' && !g.moved) { if (pick) pickNode(`S:${p.id}`); else selectPoint(p.id, 'S'); }
  else if (g.type === 'pt' && !g.moved) { if (pick) pickNode(`${g.w}:${g.pid}`); else selectPoint(g.pid, g.w); }
  else if (g.type === 'plane' && !g.moved) { if (pick) pickNode(`R:${g.id}`); else selectPlane(g.id); }
  else if (g.type === 'bnew' && !g.moved) { commit(null, g.before); p.bundle.push({ id: uid(), side: g.side, dist: nextBundleDist(p, g.side) }); }
  else if (g.type === 'bdist' && !g.moved) { selectBundle(g.i); }
  refit();
  recompute();
}
function gzEnd() {
  const g = gz, p = proj();
  gz = null;
  if (BUNDLE_GZ.includes(g.type)) { bundleEnd(g); return; }
  if (g.fail) toast(g.fail);
  // Rohrende beim Loslassen: Zu kurzes verschwindet, sonst gilt die Mindestlänge
  if (g.tail) {
    const last = p.deltas.length - 1, v = deltaVec(p.deltas[last]);
    if (V.len(v) < g.tail / 2) p.deltas.pop(); else setDelta(last, V.mul(V.norm(v), g.tail));
  }
  // Antippen eines Hilfspfeils = neuer Schenkel in diese Richtung
  const endTap = g.type === 'ext' && !g.moved && !g.a; // Griff nur angetippt: Punkt wählen, Pfeile ein-/ausblenden
  if (endTap) extOpen = pick ? extOpen : !extOpen;
  else if (g.type === 'ext') { extOpen = true; if (g.moved || g.a) p.unrouted = false; } // nach dem Fortführen bleiben die Pfeile für den nächsten Schenkel
  if (g.type === 'ext' && !g.moved && g.a) {
    commit(null, g.before);
    p.deltas = structuredClone(g.orig);
    const last = V.dot(g.a, g.d) > 0.9999;
    if (last) setDelta(p.deltas.length - 1, V.mul(g.d, g.L0 + 50));
    else { p.deltas.push({ x: 0, y: 0, z: 0 }); setDelta(p.deltas.length - 1, V.mul(g.a, Math.max(100, g.min.newLeg))); }
  } else if (!g.committed) {
    restoreSnapshot(g.before); // nichts geändert: auch den Moduswechsel zurücknehmen
  }
  // Biegung auf 0° gedreht: Der Schenkel verschmilzt mit dem Rohr, auf dessen Achse er liegt
  let merged = false;
  if (g.type === 'bend' && g.committed) {
    const a = deltaVec(p.deltas[g.i - 1]), b = deltaVec(p.deltas[g.i]);
    if (V.len(V.cross(V.norm(a), V.norm(b))) < 1e-6 && V.dot(a, b) > 0) {
      setDelta(g.i - 1, V.add(a, b)); p.deltas.splice(g.i, 1);
      p.bundleTx = p.bundleTx.filter(t => t.bend !== g.i - 1); p.bundleTx.forEach(t => { if (t.bend >= g.i) t.bend--; });
      merged = true;
    }
  }
  refit(); // in 3D nach dem Loslassen neu einpassen
  renderInputs(); recompute();
  // Nach dem Fortführen nichts auswählen, damit gleich weitergezogen werden kann
  if (merged) selectLeg(g.i - 1);
  else if (g.type === 'rot' || g.type === 'bend') selectCorner(g.i); // Ringe bleiben am Eckpunkt
  else selectLeg(g.type === 'ext' ? -1 : g.idx ?? g.i);
  if (endTap) { if (pick) pickNode(`E:${p.id}`); else selectPoint(p.id, 'E'); }
}

// ---------- Einrasten an Wand und Ziel ----------
// Läuft ein Schenkel achsparallel auf eine Fläche zu, rastet sein Ende so ein, dass das Rohr danach
// in Schellenhöhe vor der Fläche liegt; außerdem auf die Koordinate des Ziel-Anschlusses.
// Fangen: Ein gezogener Punkt rastet ein, wenn er in einer Achse auf Höhe eines anderen Punkts liegt. Mögliche Partner sind alle Eck- und Endpunkte der Szene
let snapLine = null; // { at | plane, of }: Fangpunkt oder Ebene und Funktion, die den gezogenen Punkt liefert
const SNAP_PX = 6;
// Partner stehen beim Griffbeginn fest: Sonst finge der gezogene Punkt sich selbst
// Ebenen, die am gezogenen Rohr hängen, wandern mit und scheiden deshalb aus
const snapPlanes = (p, g) => (vis.refPlanes ? scene(p).planes.filter(pl => !pl.hidden && g.key !== `R:${pl.id}` && (pl.locked || !pl.ref?.to?.endsWith(`:${p.id}`))) : []);
const snapPool = (skip = []) => (gz?.pool || []).filter(q => !skip.some(c => V.len(V.sub(c, q)) < 0.5));
function fang(k, val, px, skip, of) {
  if (!vis.snap) return val;
  let best = null, bd = SNAP_PX / px;
  const here = of();
  // Bei gleicher Höhe zählt der nächste Punkt: Die Hilfslinie soll kurz und eindeutig sein
  const far = q => V.len(V.sub(q, here));
  for (const q of snapPool(skip)) { const d = Math.abs(q[k] - val); if (d < bd - 1e-6 || (best && Math.abs(d - bd) < 1e-6 && far(q) < far(best))) { bd = d; best = q; } }
  let plane = null;
  for (const pl of gz?.planes || []) if (pl.axis === k && Math.abs(pl.c - val) < bd - 1e-6) { bd = Math.abs(pl.c - val); plane = pl; }
  if (plane) { snapLine = { plane, of }; return plane.c; }
  if (!best) return val;
  snapLine = { at: best, of };
  return best[k];
}
function snapLen(start, dir, L) {
  const p = proj(), f = prof(p), tol = hitTol(12) / view.sc, cands = [];
  const k = [0, 1, 2].find(i => Math.abs(Math.abs(dir[i]) - 1) < 1e-6);
  if (k === undefined) return { L };
  for (const pl of layout.planes) {
    if (pl.axis !== k) continue;
    const Lw = (pl.c - start[k]) * dir[k] - f.clampH;
    if (Lw > 0) cands.push({ L: Lw, tag: `Schellenhöhe vor ${pl.name}` });
  }
  if (lab && p.target) {
    const Lt = (p.target[k] - start[k]) * dir[k];
    if (Lt > 0) cands.push({ L: Lt, tag: 'auf Höhe Ziel-Anschluss' });
  }
  if (vis.snap) for (const q of snapPool([gz.E, start])) { const Lq = (q[k] - start[k]) * dir[k]; if (Lq > 0) cands.push({ L: Lq, tag: 'gefangen', at: q }); }
  if (vis.snap) for (const pl of gz.planes) { const Lq = (pl.c - start[k]) * dir[k]; if (pl.axis === k && Lq > 0) cands.push({ L: Lq, tag: `auf R${planeNo(pl)}`, plane: pl }); }
  const hit = cands.filter(c => Math.abs(c.L - L) < tol).sort((a, b) => Math.abs(a.L - L) - Math.abs(b.L - L))[0];
  if (hit?.at || hit?.plane) snapLine = { at: hit.at, plane: hit.plane, of: () => endOf(proj()) };
  return hit || { L };
}

// ---------- Schellen-Werkzeug ----------
let clampDrag = null;
document.body.append($('#toast')); // Hinweise auch im Reiter „Rohr“ sichtbar
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}
function setTool(tool) {
  const p = proj();
  if (tool === 'room' && !roomOf(p)) { commit(); const r = newRoomAround(p); db.rooms.push(r); p.roomId = r.id; recompute(); toast('Raum ums Rohr angelegt – jetzt Wände ziehen oder neu zeichnen.'); }
  if (tool !== 'room') roomDraw = null;
  if (tool !== camTool) fit = null;
  camTool = tool;
  $$('.toolseg button').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  renderRoomBar();
  if (tool === 'clamp') { selectLeg(-1); toast('Rohr antippen = Schelle setzen · Schelle ziehen = verschieben · antippen = löschen'); }
  if (tool === 'room') { selectLeg(-1); if (!roomDraw) toast('Wand ziehen = verschieben · Maß antippen = Länge eingeben'); }
  draw();
}
$('.toolseg').addEventListener('click', e => { const t = e.target.closest('button')?.dataset.tool; if (t) setTool(t); });
const renderDimLevel = () => $$('#dimLevel button').forEach(b => b.classList.toggle('on', b.dataset.lv === vis.dimLevel));
$('#visBtn').addEventListener('click', () => {
  const pop = $('#visPop');
  pop.hidden = !pop.hidden;
  $$('[data-vis]', pop).forEach(i => { i.checked = !!vis[i.dataset.vis]; });
  renderDimLevel();
});
$('#dimLevel').addEventListener('click', e => {
  const lv = e.target.closest('button')?.dataset.lv;
  if (!lv) return;
  vis.dimLevel = lv; saveVis(); renderDimLevel(); draw();
});
$('#visPop').addEventListener('change', e => {
  const k = e.target.dataset.vis;
  if (!k) return;
  vis[k] = e.target.checked; saveVis(); draw();
});

function hitClamp(x, y) {
  let best = -1, bd = hitTol(14);
  layout.clampInfo.forEach((c, i) => { const [px, py] = view.P3(c.p), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
// Nächster Punkt auf dem Rohr (abgewickelte Länge s) zur Bildschirmposition
function nearestS(x, y, tol = hitTol(16)) {
  const S = layout.samples;
  let best = null, bd = tol;
  for (let i = 1; i < S.length; i++) {
    const [ax, ay] = view.P3(S[i - 1].p), [bx, by] = view.P3(S[i].p);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < bd) { bd = d; best = S[i - 1].s + (S[i].s - S[i - 1].s) * t; }
  }
  return best == null ? null : Math.max(0, Math.min(layout.total, Math.round(best / 5) * 5));
}
// Erste Handänderung schaltet auf „von Hand“ und übernimmt die automatischen Positionen
function ensureManualClamps() {
  const p = proj();
  if (p.clampMode === 'manual') return;
  p.clamps = [...layout.clampS]; p.clampMode = 'manual';
  toast('Schellen jetzt „von Hand“ – im Reiter Eingabe wieder auf „Automatisch“ umschaltbar');
}
function clampDown(e, lx, ly) {
  const idx = hitClamp(lx, ly), s = idx < 0 ? nearestS(lx, ly) : null;
  if (idx < 0 && s == null) return false;
  clampDrag = { idx, s, sx: e.clientX, sy: e.clientY, moved: false, before: snapshot() };
  fit = lastBase;
  return true;
}
function clampMove(e) {
  const [lx, ly] = local(e);
  if (!clampDrag.moved && Math.hypot(e.clientX - clampDrag.sx, e.clientY - clampDrag.sy) < 5) return;
  const p = proj();
  if (!clampDrag.moved) {
    clampDrag.moved = true;
    commit(null, clampDrag.before);
    ensureManualClamps();
    if (clampDrag.idx < 0) { p.clamps.push(clampDrag.s); clampDrag.idx = p.clamps.length - 1; }
    else clampDrag.idx = p.clamps.indexOf(layout.clampS[clampDrag.idx]);
  }
  const s = nearestS(lx, ly, 1e9);
  if (s != null && clampDrag.idx >= 0) p.clamps[clampDrag.idx] = s;
  recompute(true);
}
function clampUp() {
  const c = clampDrag, p = proj();
  clampDrag = null;
  if (!c.moved) {
    commit(null, c.before);
    ensureManualClamps();
    if (c.idx >= 0) p.clamps.splice(p.clamps.indexOf(layout.clampS[c.idx]), 1);
    else p.clamps.push(c.s);
  }
  p.clamps.sort((a, b) => a - b);
  refit();
  recompute();
}

// ---------- Raum-Werkzeug in 3D: Grundriss zeichnen, Wände ziehen, Maße antippen ----------
let roomDraw = null;   // beim Zeichnen: { pts: [[x, y]…], hover, z0 }
let roomDrag = null;   // beim Ziehen einer Wand
let roomLabels = [];   // Trefferflächen der Maßzahlen

// Bildschirmpunkt → Punkt auf dem Boden (Höhe z0); von der Seite gesehen nicht möglich
function floorPoint(X, Y, z0) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  if (sp < 0.15) return null;
  const a = (X - view.cx) / view.sc, b = (Y - view.cyy) / view.sc, m = (-b - z0 * cp) / sp;
  return [cy * a + sy * m, -sy * a + cy * m];
}
const roomGrid = () => Math.min(100, Math.max(10, niceStep(14 / view.sc))); // Fangraster 10 … 100 mm
const snapG = (v, g = roomGrid()) => Math.round(v / g) * g;

function renderRoomBar() {
  const bar = $('#roomBar');
  bar.hidden = camTool !== 'room';
  if (bar.hidden) return;
  bar.innerHTML = roomDraw
    ? `<span>${roomDraw.pts.length < 3 ? 'Ecken auf dem Boden antippen' : 'Ersten Punkt antippen oder „Schließen“'}</span>
       <button data-rb="cancel">Abbrechen</button><button data-rb="undo"${roomDraw.pts.length ? '' : ' disabled'}>↶ Punkt</button><button data-rb="close" class="primary"${roomDraw.pts.length >= 3 ? '' : ' disabled'}>Schließen</button>`
    : `<span>Wand ziehen · Maß antippen</span><button data-rb="new">✎ Neu zeichnen</button><button data-rb="done" class="primary">Fertig</button>`;
}
$('#roomBar').addEventListener('click', e => {
  const k = e.target.closest('button')?.dataset.rb;
  if (!k) return;
  if (k === 'new') startRoomDraw();
  else if (k === 'cancel') { roomDraw = null; renderRoomBar(); draw(); }
  else if (k === 'undo') { roomDraw.pts.pop(); renderRoomBar(); draw(); }
  else if (k === 'close') closeRoomDraw();
  else if (k === 'done') setTool('edit');
});

function startRoomDraw() {
  const p = proj();
  if (!roomOf(p)) { commit(); const r = newRoomAround(p); db.rooms.push(r); p.roomId = r.id; recompute(); }
  roomDraw = { pts: [], hover: null, z0: roomOf(p).z0 || 0 };
  // auf dem Handy liegt die 3D-Ansicht in einem eigenen Reiter
  if (!cv.clientWidth) $('[data-tab=view]').click();
  setTool('room');
  resetView('top');
  cam.zoom = 0.6; // Platz rund um den bisherigen Raum zum Zeichnen
  draw();
}
function closeRoomDraw() {
  const pts = roomDraw.pts, first = pts[0], last = pts.at(-1);
  if (pts.length < 3) return;
  // letzte Kante rechtwinklig schließen: notfalls eine Ecke einfügen. Wände wechseln sich ab (waagrecht/senkrecht),
  // also geht es nach einer senkrechten letzten Kante erst waagrecht zurück und umgekehrt.
  if (Math.abs(last[0] - first[0]) > 0.5 && Math.abs(last[1] - first[1]) > 0.5) {
    const prev = pts.at(-2), lastVertical = prev && Math.abs(prev[0] - last[0]) < 0.5;
    pts.push(lastVertical ? [first[0], last[1]] : [last[0], first[1]]);
  }
  const o = cleanOutline(pts);
  if (o.length < 4 || Math.abs(signedArea(o)) < 1e5) { toast('Der Grundriss ist zu klein – bitte neu zeichnen.'); return; }
  const room = roomOf();
  commit();
  room.outline = o; room.pass = {};
  roomDraw = null; fit = null;
  recompute(); renderRoomTab(); renderRoomBar();
  toast(`Grundriss mit ${o.length} Wänden übernommen. Wände ziehen oder Maße antippen zum Anpassen.`);
}
// Nächster Rasterpunkt; rechtwinklig zum letzten Punkt
function drawSnap(X, Y) {
  const q = floorPoint(X, Y, roomDraw.z0);
  if (!q) return null;
  const s = [snapG(q[0]), snapG(q[1])], last = roomDraw.pts.at(-1);
  if (last) { if (Math.abs(s[0] - last[0]) >= Math.abs(s[1] - last[1])) s[1] = last[1]; else s[0] = last[0]; }
  return s;
}
function roomTap(x, y) {
  if (!roomDraw) {
    const lb = roomLabels.find(l => x >= l.x - l.w / 2 - 6 && x <= l.x + l.w / 2 + 6 && y >= l.y - 14 && y <= l.y + 14);
    if (lb) {
      const room = roomOf(), v = prompt(`Länge ${lb.name} (mm):`, String(r1(edgeLen(room.outline, lb.edge))));
      if (v == null) return;
      commit();
      if (!setEdgeLen(room, lb.edge, num(v))) toast('Diese Länge passt nicht in den Grundriss.');
      recompute(); renderRoomTab();
    }
    return;
  }
  if (floorPoint(x, y, roomDraw.z0) == null) { toast('Zum Zeichnen von oben schauen (Ansicht „Oben“ oder 3D).'); return; }
  const first = roomDraw.pts[0];
  if (first && roomDraw.pts.length >= 3) {
    const [fx, fy] = view.P3([first[0], first[1], roomDraw.z0]);
    if (Math.hypot(fx - x, fy - y) < hitTol(18)) { closeRoomDraw(); return; }
  }
  const s = drawSnap(x, y), last = roomDraw.pts.at(-1);
  if (last && Math.hypot(s[0] - last[0], s[1] - last[1]) < 1) return;
  roomDraw.pts.push(s);
  renderRoomBar(); draw();
}
function roomHover(x, y) {
  if (!roomDraw) return;
  roomDraw.hover = drawSnap(x, y);
  draw();
}

// Wand ziehen: beide Ecken der Kante wandern senkrecht zur Wand
function hitEdge(x, y) {
  const room = roomOf();
  if (!room || roomDraw) return -1;
  const z0 = room.z0 || 0, o = room.outline;
  let best = -1, bd = hitTol(14);
  o.forEach((a, i) => {
    const b = o[(i + 1) % o.length], d = segDist(x, y, ...view.P3([a[0], a[1], z0]), ...view.P3([b[0], b[1], z0]));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function roomDown(e, lx, ly) {
  if (roomDraw) return false;
  if (roomLabels.some(l => lx >= l.x - l.w / 2 - 6 && lx <= l.x + l.w / 2 + 6 && ly >= l.y - 14 && ly <= l.y + 14)) return false; // Antippen auf Maß: beim Loslassen
  const i = hitEdge(lx, ly);
  if (i < 0) return false;
  const room = roomOf(), o = room.outline, a = o[i], b = o[(i + 1) % o.length];
  roomDrag = { edge: i, axis: Math.abs(b[0] - a[0]) > 1e-6 ? 1 : 0, before: snapshot(), moved: false, sx: e.clientX, sy: e.clientY };
  fit = lastBase;
  return true;
}
function roomMove(e) {
  const [lx, ly] = local(e), room = roomOf();
  if (!roomDrag.moved && Math.hypot(e.clientX - roomDrag.sx, e.clientY - roomDrag.sy) < 4) return;
  const q = floorPoint(lx, ly, room.z0 || 0);
  if (!q) return;
  if (!roomDrag.moved) { roomDrag.moved = true; commit(null, roomDrag.before); }
  const o = structuredClone(room.outline), n = o.length, v = snapG(q[roomDrag.axis], 10);
  o[roomDrag.edge][roomDrag.axis] = v; o[(roomDrag.edge + 1) % n][roomDrag.axis] = v;
  if (o.every((_, k) => edgeLen(o, k) >= 50)) room.outline = o;
  recompute(true);
}
function roomUp() {
  const moved = roomDrag.moved;
  roomDrag = null;
  if (moved) { recompute(); renderRoomTab(); }
}

// Anzeige im Raum-Werkzeug: Maße der Wände bzw. der gezeichnete Grundriss
function drawRoomOverlay(P3) {
  roomLabels = [];
  const cAcc = css('--accent'), card = css('--card');
  const label = (t, x, y, col = cAcc) => {
    ctx.font = '700 12px -apple-system, system-ui, sans-serif';
    const w = ctx.measureText(t).width + 12;
    ctx.fillStyle = card; ctx.fillRect(x - w / 2, y - 11, w, 22);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x - w / 2, y - 11, w, 22);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 0.5);
    return w;
  };
  if (roomDraw) {
    const z0 = roomDraw.z0, pts = roomDraw.pts.map(([x, y]) => P3([x, y, z0]));
    ctx.strokeStyle = cAcc; ctx.lineWidth = 3;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    if (roomDraw.hover && pts.length) {
      const [hx, hy] = P3([roomDraw.hover[0], roomDraw.hover[1], z0]), last = roomDraw.pts.at(-1);
      ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(...pts.at(-1)); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
      const L = Math.hypot(roomDraw.hover[0] - last[0], roomDraw.hover[1] - last[1]);
      if (L > 0) label(`${fmt(L)} mm`, (pts.at(-1)[0] + hx) / 2, (pts.at(-1)[1] + hy) / 2 - 16);
    }
    roomDraw.pts.forEach((q, i) => { if (i) { const a = roomDraw.pts[i - 1]; label(fmt(Math.hypot(q[0] - a[0], q[1] - a[1])), (pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2 - 16, css('--muted')); } });
    pts.forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, i === 0 && pts.length >= 3 ? 10 : 6, 0, 7); ctx.fillStyle = i === 0 ? css('--mark') : cAcc; ctx.fill(); });
    if (roomDraw.hover) { const [hx, hy] = P3([roomDraw.hover[0], roomDraw.hover[1], z0]); ctx.strokeStyle = cAcc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.stroke(); }
    return;
  }
  const room = roomOf();
  if (!room) return;
  const z0 = room.z0 || 0, o = room.outline, walls = layout.planes.filter(q => q.kind === 'wall');
  o.forEach((a, i) => {
    const b = o[(i + 1) % o.length], [ax, ay] = P3([a[0], a[1], z0]), [bx, by] = P3([b[0], b[1], z0]);
    const active = roomDrag?.edge === i;
    ctx.strokeStyle = cAcc; ctx.globalAlpha = active ? 1 : 0.55; ctx.lineWidth = active ? 6 : 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1;
    // Maß außen neben der Wand
    const w = walls.find(q => q.edge === i), out = w ? -w.n : 0, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z0], off = 26 / view.sc;
    if (w) m[w.axis] += out * off;
    const [lx, ly] = P3(m), name = w ? w.name : `Kante ${i + 1}`;
    const lw = label(`${w ? wallLetter(i) + ' · ' : ''}${fmt(edgeLen(o, i))}`, lx, ly);
    roomLabels.push({ x: lx, y: ly, w: lw, edge: i, name });
  });
  o.forEach(([x, y]) => { const [a, b] = P3([x, y, z0]); ctx.fillStyle = cAcc; ctx.beginPath(); ctx.arc(a, b, 4, 0, 7); ctx.fill(); });
}

// ---------- Zeiger ----------
// Gimbal hat Vorrang. Iso: ziehen = drehen. Ortho: Anfasser ziehen = bearbeiten, Hintergrund ziehen = verschieben.
// Schenkel antippen = auswählen.
// Überall: zwei Finger / Shift / Rechtsklick = verschieben, Pinch/Rad = zoomen zum Zeiger.
const ptrs = new Map();
// Navigationsleiste: pan/zoom = ein Finger navigiert überall, Griffe ruhen; Antippen wählt weiter aus. null = normal
let navMode = null;
let touchUI = false; // letzter Zeiger war Finger/Stift → größere Trefferflächen
const hitTol = px => (touchUI ? px * 1.6 : px);
// Drehpunkt der Navigation: die aktuelle Auswahl (Schenkel und Rohr in der Mitte); null = nichts gewählt
function selPivot() {
  const p = proj(), pts = points(p);
  if (selCorner >= 1 && pts[selCorner]) return pts[selCorner];
  if (sel >= 0 && pts[sel + 1]) return V.mul(V.add(pts[sel], pts[sel + 1]), 0.5);
  if (bundleSel >= 0 && layout.bundle[bundleSel]) { const S = layout.bundle[bundleSel].samples; return S[S.length >> 1].p; }
  const q = selPoint && pipeById(selPoint.pid);
  if (q) return selPoint.w === 'S' ? points(q)[0] : endOf(q);
  const pl = selPlane && planeById(selPlane);
  if (pl) { const c = planeCorners(pl); return c.reduce(V.add).map(v => v / c.length); }
  return null;
}
// Drehen um die Auswahl: ihr Bildpunkt bleibt stehen
function orbitBy(dx, dy) {
  holdView();
  const c = selPivot() || view.mid, a = project(c), s = fit.sc * cam.zoom;
  cam.yaw += dx * 0.01;
  cam.pitch = Math.max(-H90, Math.min(H90, cam.pitch + dy * 0.01));
  const b = project(c);
  cam.panX -= (b.x - a.x) * s; cam.panY -= (b.y - a.y) * s;
}
// Zoom zur Auswahl, ohne Auswahl zum Zeiger
function zoomAt(clientX, clientY, ratio) {
  holdView();
  const r = cv.getBoundingClientRect(), z = Math.max(0.3, Math.min(20, cam.zoom * ratio)), c = selPivot();
  ratio = z / cam.zoom;
  let ox = clientX - r.left - r.width / 2, oy = clientY - r.top - r.height / 2 - fit.dy;
  if (c) { const q = project(c), s = fit.sc * cam.zoom; ox = cam.panX + (q.x - fit.mx) * s; oy = cam.panY + (q.y - fit.my) * s; }
  cam.panX = ox - (ox - cam.panX) * ratio; cam.panY = oy - (oy - cam.panY) * ratio;
  cam.zoom = z;
}
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function hitVertex(x, y) {
  const pts = points(proj());
  for (let i = pts.length - 1; i >= 1; i--) { const [px, py] = view.P3(pts[i]); if (Math.hypot(px - x, py - y) < hitTol(22)) return i - 1; }
  return -1;
}
// Parallelrohr unter dem Finger – nur wenn es näher liegt als Rohr 1
function hitBundle(x, y) {
  const near = L => L.verts.slice(1).reduce((m, q, k) => Math.min(m, segDist(x, y, ...view.P3(L.verts[k]), ...view.P3(q))), Infinity);
  let best = -1, bd = Math.min(hitTol(14), near(layout));
  layout.bundle.forEach((L, i) => { const d = L.def.hidden ? Infinity : near(L); if (d < bd) { bd = d; best = i; } });
  return best;
}
// Was läge unter der Maus: wie in Fusion hebt sich das hervor, bevor man klickt
let hover = null;
function ptrHover(x, y) {
  if (navMode || gz || drag) return null;
  const dm = hitDim(x, y);
  if (dm) return { dk: dm.key };
  if (hitGizmo(x, y)) return null;
  const c = hitCorner(x, y), b = c >= 1 ? -1 : hitBundle(x, y), l = c >= 1 || b >= 0 ? -1 : hitLeg(x, y), g = c < 1 && b < 0 && l < 0 ? hitGhost(x, y) : null;
  return c >= 1 ? { c } : b >= 0 ? { b } : l >= 0 ? { l } : g ? { g } : null;
}
// Anderes Rohr der Szene unter dem Finger → dessen Kennung
function hitGhost(x, y) {
  let best = null, bd = hitTol(14);
  for (const g of layout.ghosts || []) g.verts.slice(1).forEach((q, k) => { const d = segDist(x, y, ...view.P3(g.verts[k]), ...view.P3(q)); if (d < bd) { bd = d; best = g.id; } });
  return best;
}
// Ebene unter dem Finger: die ganze Fläche zählt; von der Kante gesehen bleibt nur der Griff in der Mitte
function hitPlane(x, y) {
  if (!vis.refPlanes) return null;
  for (const pl of scene().planes.filter(q => !q.hidden && (!q.locked || measure))) {
    const c = planeCorners(pl).map(q => view.P3(q));
    if (pointInPoly(c, x, y) || c.some((q, i) => segDist(x, y, ...q, ...c[(i + 1) % 4]) < hitTol(10))) return pl.id;
  }
  return null;
}
function hitLeg(x, y) {
  const pts = points(proj());
  let best = -1, bd = hitTol(18);
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(x, y, ...view.P3(pts[i]), ...view.P3(pts[i + 1]));
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('lostpointercapture', e => ptrs.delete(e.pointerId));
cv.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
cv.addEventListener('pointerdown', e => {
  touchUI = e.pointerType !== 'mouse';
  if (e.pointerType === 'mouse') ptrs.clear(); // Maus hat nur einen Zeiger – hängengebliebene Einträge verwerfen
  try { cv.setPointerCapture(e.pointerId); } catch {} // synthetische Testereignisse haben keinen echten Zeiger
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: navMode ? navMode === 'pan' : e.shiftKey || e.button === 2 || isOrtho() });
  endFlight();
  if (ptrs.size === 1 && view && !navMode) {
    const [lx, ly] = local(e);
    if (camTool === 'clamp') { if (clampDown(e, lx, ly)) return; }
    if (camTool === 'room') { if (roomDown(e, lx, ly)) return; }
    // Gimbal und Schnittpunkt-Anfasser gehören nur zum Werkzeug „Rohr“
    let g = camTool === 'edit' ? hitGizmo(lx, ly) : null;
    // Direkt auf einem Eckpunkt hat der Eckpunkt Vorrang vor dem Längenpfeil daneben
    if (g?.type === 'len' || g?.type === 'lmove') { const c = hitCorner(lx, ly), q = c >= 1 && view.P3(points(proj())[c]); if (q && Math.hypot(q[0] - lx, q[1] - ly) < 12) g = null; }
    // Liegt ein Maß unter dem Finger, gilt Tippen dem Maß; erst Ziehen greift den Griff darunter
    const onDim = camTool === 'edit' && !pick && !inCmd() && !!hitDim(lx, ly);
    if (g && onDim) { ptrs.get(e.pointerId).grab = g; return; }
    if (g) { gzStart(g, e); return; }
    const i = camTool === 'edit' && isOrtho() && !onDim && !inCmd() && !proj().stub ? hitVertex(lx, ly) : -1;
    if (i >= 0) {
      const before = snapshot();
      ensureDeltas();
      const L = legInView(legVec(i));
      drag = { i, sx: e.clientX, sy: e.clientY, a0: L.a, b0: L.b, c: L.c, label: null, before, committed: false };
      fit = lastBase;
    }
  } else if (ptrs.size === 2) { if (drag) endDrag(); if (gz) gzEnd(); if (clampDrag) clampUp(); }
});
cv.addEventListener('pointermove', e => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) {
    if ((create?.step === 'ref' || measure) && view) {
      const m = measure || create, id = hitCand(createCands(!!measure), ...local(e))?.id ?? null;
      if (id !== m.hover) { m.hover = id; renderBundleBar(); draw(); }
      return;
    }
    if (camTool === 'room' && roomDraw && view) roomHover(...local(e));
    if (e.pointerType === 'mouse' && view && camTool === 'edit') {
      const [lx, ly] = local(e), knob = gizmo.find(g => g.type === 'ext' && g.at), h = !!knob && Math.hypot(lx - knob.at[0], ly - knob.at[1]) < knob.r + 6;
      if (h !== extHover) { extHover = h; draw(); }
      const hv = ptrHover(lx, ly);
      if (JSON.stringify(hv) !== JSON.stringify(hover)) { hover = hv; cv.style.cursor = navMode ? cv.style.cursor : hv ? 'pointer' : ''; draw(); }
    }
    return;
  } // Vorschau beim Zeichnen (Maus)
  if (roomDrag && ptrs.size === 1) { roomMove(e); return; }
  if (clampDrag && ptrs.size === 1) { clampMove(e); return; }
  if (prev.grab && ptrs.size === 1 && Math.hypot(e.clientX - prev.x0, e.clientY - prev.y0) >= 6) { gzStart(prev.grab, { clientX: prev.x0, clientY: prev.y0 }); prev.grab = null; }
  if (gz && ptrs.size === 1) { gzMove(e); return; }
  if (drag && ptrs.size === 1) { dragTo(e.clientX, e.clientY); return; }
  if (ptrs.size === 1 && !prev.moved && Math.hypot(e.clientX - prev.x0, e.clientY - prev.y0) < 6) return; // Zittern beim Antippen bewegt nichts
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  holdView();
  if (ptrs.size === 1 && navMode === 'zoom') zoomAt(prev.x0, prev.y0, Math.exp(-dy * 0.01));
  else if (ptrs.size === 1 && prev.pan) { cam.panX += dx; cam.panY += dy; }
  else if (ptrs.size === 1) {
    orbitBy(dx, dy);
  } else if (ptrs.size === 2) {
    const other = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    cam.panX += dx / 2; cam.panY += dy / 2;
    if (d0 > 0) zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, d1 / d0);
  }
  ptrs.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY, moved: true });
  draw();
});
cv.addEventListener('pointerup', e => {
  const pt = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (pt?.moved) settleSoon(60);
  if (clampDrag) { clampUp(); return; }
  if (roomDrag) { roomUp(); return; }
  if (gz) { gzEnd(); return; }
  if (drag) { endDrag(); return; }
  if (pt && ptrs.size === 0 && view && Math.hypot(e.clientX - pt.x0, e.clientY - pt.y0) < 6) {
    const [lx, ly] = local(e);
    if (create) { const c = create.step === 'ref' && hitCand(createCands(), lx, ly); if (c) createPick(c); return; }
    if (measure) { const c = hitCand(createCands(true), lx, ly); if (c) measurePick(c); return; }
    if (dropStub()) return;
    extOpen = false; startOpen = false;
    // Maß festlegen: Ebene antippen; ein Tipp daneben bricht nicht ab, dafür gibt es „Abbrechen“
    if (pick) { const pl = hitPlane(lx, ly); if (pl) pickNode(`R:${pl}`); return; }
    const dim = camTool === 'edit' ? hitDim(lx, ly) : null, corner = camTool === 'edit' && !dim ? hitCorner(lx, ly) : -1;
    if (dim) editDim(dim);
    else if (camTool === 'room') roomTap(lx, ly);
    else if (corner >= 1) selectCorner(corner);
    else if (camTool === 'edit') {
      const unr = proj().unrouted, b = hitBundle(lx, ly), g = b < 0 && (unr || hitLeg(lx, ly) < 0) ? hitGhost(lx, ly) : null;
      const leg = unr ? -1 : hitLeg(lx, ly), plane = leg < 0 ? hitPlane(lx, ly) : null;
      if (b >= 0) selectBundle(b); else if (g) { db.currentId = g; highlight = -1; fullRender(); } else if (plane) selectPlane(plane); else selectLeg(leg);
    }
  } else if (camTool === 'room' && roomDraw && pt && e.pointerType !== 'mouse') roomHover(...local(e));
});
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (clampDrag) clampUp(); if (roomDrag) roomUp(); if (gz) gzEnd(); if (drag) endDrag(); });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); draw(); }, { passive: false });
// ---------- ViewCube wie in Fusion ----------
// Flächen, Kanten und Ecken antippen = Ansicht dorthin, Würfel ziehen = drehen.
// a, b: Schreibrichtung und „oben“ der Beschriftung, von außen gesehen
const FACES = [
  { v: 'front', t: 'VORNE', n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] }, { v: 'back', t: 'HINTEN', n: [0, 1, 0], a: [-1, 0, 0], b: [0, 0, 1] },
  { v: 'right', t: 'RECHTS', n: [1, 0, 0], a: [0, 1, 0], b: [0, 0, 1] }, { v: 'left', t: 'LINKS', n: [-1, 0, 0], a: [0, -1, 0], b: [0, 0, 1] },
  { v: 'top', t: 'OBEN', n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] }, { v: 'bottom', t: 'UNTEN', n: [0, 0, -1], a: [1, 0, 0], b: [0, -1, 0] },
];
const cube = $('#cube'), cubeCtx = cube.getContext('2d'), CUBE_S = 29, CUBE_C = 70, CELL = 0.6;
let cubeHot = null, cubeDrag = null, flight = null;
const faceShown = f => V.dot(f.n, viewDir()) < -0.05;
// Was liegt unter dem Punkt: Fläche f, Zelle su/sv (-1, 0, 1); n = Blickrichtung dorthin (zum Betrachter)
function cubePick(x, y) {
  for (const f of FACES) {
    if (!faceShown(f)) continue;
    const c = project(V.mul(f.n, CUBE_S)), A = project(f.a), B = project(f.b), det = A.x * B.y - A.y * B.x, dx = x - CUBE_C - c.x, dy = y - CUBE_C - c.y;
    const u = (dx * B.y - dy * B.x) / det / CUBE_S, v = (A.x * dy - A.y * dx) / det / CUBE_S;
    if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
    const su = Math.abs(u) > CELL ? Math.sign(u) : 0, sv = Math.abs(v) > CELL ? Math.sign(v) : 0;
    return { f, su, sv, n: V.add(V.add(f.n, V.mul(f.a, su)), V.mul(f.b, sv)) };
  }
  return null;
}
function drawCube() {
  const dpr = window.devicePixelRatio || 1, W = 2 * CUBE_C, g = cubeCtx, P = q => { const r = project(q); return [CUBE_C + r.x, CUBE_C + r.y]; };
  if (cube.width !== W * dpr) cube.width = cube.height = W * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
  const dark = isDark(), S = CUBE_S, ink = css('--text'), corner = (f, u, v) => P(V.add(V.add(V.mul(f.n, S), V.mul(f.a, u * S)), V.mul(f.b, v * S)));
  const quad = q => { g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // XYZ an der Ecke vorne links unten, entlang der Kanten; verdeckte Kanten laufen hinter dem Würfel
  const O = [-S, -S, -S], [ox, oy] = P(O), AXES = [['X', [1, 0, 0], '#e03131'], ['Y', [0, 1, 0], '#2f9e44'], ['Z', [0, 0, 1], '#1c7ed6']];
  const edgeSeen = v => FACES.some(f => V.dot(f.n, v) === 0 && V.dot(f.n, O) > 0 && faceShown(f));
  const axis = ([t, v, c]) => {
    const [x, y] = P(V.add(O, V.mul(v, 2 * S + 10))), [lx, ly] = P(V.add(O, V.mul(v, 2 * S + 19)));
    g.strokeStyle = c; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(ox, oy); g.lineTo(x, y); g.stroke();
    g.fillStyle = c; g.font = '700 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, lx, ly);
  };
  AXES.filter(q => !edgeSeen(q[1])).forEach(axis);
  for (const f of FACES) {
    if (!faceShown(f)) continue;
    const lit = Math.max(0, -V.dot(f.n, viewDir())), tone = Math.round((dark ? 44 : 214) + lit * (dark ? 22 : 34));
    quad([corner(f, -1, -1), corner(f, 1, -1), corner(f, 1, 1), corner(f, -1, 1)]);
    g.fillStyle = `rgb(${tone},${tone + 2},${tone + 5})`; g.fill();
    g.strokeStyle = dark ? 'rgba(255,255,255,.28)' : 'rgba(40,55,75,.4)'; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke();
    if (cubeHot?.f === f) {
      const cell = s => (s ? [s * CELL, s] : [-CELL, CELL]), [u0, u1] = cell(cubeHot.su), [v0, v1] = cell(cubeHot.sv);
      quad([corner(f, u0, v0), corner(f, u1, v0), corner(f, u1, v1), corner(f, u0, v1)]);
      g.fillStyle = css('--accent'); g.globalAlpha = 0.45; g.fill(); g.globalAlpha = 1;
    }
    // Beschriftung liegt in der Fläche: Bild der Schreibachsen als Transformation
    const A = project(f.a), B = project(f.b), [cx, cy] = P(V.mul(f.n, S));
    g.save(); g.transform(A.x, A.y, -B.x, -B.y, cx, cy);
    g.font = '700 10px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.fillText(f.t, 0, 0.5);
    g.restore();
  }
  AXES.filter(q => edgeSeen(q[1])).forEach(axis);
  // Dreiecke zur Nachbarfläche nur in Flächenansichten, Drehpfeile nur dort, wo die Kamera sie kann (oben/unten)
  const v = cam.view, flat = isOrtho() && !flight;
  $$('.cb-tri').forEach(b => { b.hidden = !flat; });
  $$('.cb-roll').forEach(b => { b.hidden = !(flat && (v === 'top' || v === 'bottom')); });
}
// Sanfter Flug in eine Ansicht; v = Name der Ansicht am Ziel, 'iso' = frei
// keep: Würfel und Dreiecke drehen nur die Blickrichtung, Zoom und Lage bleiben; nur das Häuschen passt neu ein
function flyTo(yaw, pitch, v, keep = true) {
  endFlight();
  const y0 = cam.yaw, dy = yaw - y0, wrap = Math.atan2(Math.sin(dy), Math.cos(dy));
  const c = keep ? selPivot() || view.mid : null;
  if (c) holdView();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(yaw, pitch, v, c); return; }
  flight = { y0, wrap, yaw, pitch, v, c, p0: cam.pitch, z0: cam.zoom, x0: cam.panX, y1: cam.panY, t0: performance.now() };
  cam.view = 'iso';
  if (!c) { cam.held = false; fit = null; }
  requestAnimationFrame(flyFrame);
}
function flyFrame() {
  if (!flight) return;
  const F = flight, t = Math.min(1, (performance.now() - F.t0) / 350), k = ease(t);
  if (t >= 1) { endFlight(); return; }
  if (F.c) turnTo(F.y0 + F.wrap * k, lerpN(F.p0, F.pitch, k), F.c);
  else { cam.yaw = F.y0 + F.wrap * k; cam.pitch = lerpN(F.p0, F.pitch, k); cam.zoom = lerpN(F.z0, 1, k); cam.panX = lerpN(F.x0, 0, k); cam.panY = lerpN(F.y1, 0, k); fit = null; }
  draw(); requestAnimationFrame(flyFrame);
}
function endFlight() { if (flight) { const F = flight; flight = null; setView(F.yaw, F.pitch, F.v, F.c); } }
function flyFace(v) { flyTo(...VIEWS[v], v); }
function flyDir(n) {
  const c = V.norm(n);
  flyTo(Math.atan2(-c[0], -c[1]), Math.asin(c[2]), 'iso');
}
const flyHome = () => flyTo(...VIEWS.iso, 'iso', false);
const cubeXY = e => { const r = cube.getBoundingClientRect(); return [(e.clientX - r.left) * 2 * CUBE_C / r.width, (e.clientY - r.top) * 2 * CUBE_C / r.height]; };
cube.addEventListener('pointerdown', e => {
  try { cube.setPointerCapture(e.pointerId); } catch {}
  endFlight();
  cubeDrag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, hit: cubePick(...cubeXY(e)) };
  cubeHot = cubeDrag.hit; draw();
});
cube.addEventListener('pointermove', e => {
  if (!cubeDrag) {
    if (e.pointerType !== 'mouse') return;
    const h = cubePick(...cubeXY(e));
    if (h?.f !== cubeHot?.f || h?.su !== cubeHot?.su || h?.sv !== cubeHot?.sv) { cubeHot = h; draw(); }
    return;
  }
  if (!cubeDrag.moved && Math.hypot(e.clientX - cubeDrag.x0, e.clientY - cubeDrag.y0) < 5) return;
  cubeDrag.moved = true; cubeHot = null;
  holdView(); cam.view = 'iso';
  orbitBy(e.clientX - cubeDrag.x, e.clientY - cubeDrag.y);
  cubeDrag.x = e.clientX; cubeDrag.y = e.clientY;
  draw();
});
cube.addEventListener('pointerup', () => {
  const d = cubeDrag;
  cubeDrag = null; cubeHot = null;
  if (d?.hit && !d.moved) { if (d.hit.su || d.hit.sv) flyDir(d.hit.n); else flyFace(d.hit.f.v); }
  draw();
});
cube.addEventListener('pointercancel', () => { cubeDrag = null; cubeHot = null; draw(); });
cube.addEventListener('pointerleave', () => { if (cubeHot && !cubeDrag) { cubeHot = null; draw(); } });
$('#cubeHome').addEventListener('click', flyHome);
function fitView() { cam.zoom = 1; cam.panX = cam.panY = 0; cam.held = false; fit = null; fitGlide = null; draw(); }
function setNav(m) {
  navMode = m;
  $$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === m));
  cv.style.cursor = m === 'pan' ? 'move' : m === 'zoom' ? 'ns-resize' : '';
}
$('.navbar').addEventListener('click', e => { const m = e.target.closest('[data-nav]')?.dataset.nav; if (m) setNav(navMode === m ? null : m); });
$('#navFit').addEventListener('click', fitView);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && navMode) setNav(null); });
$('#cubeBox').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tri) {
    const { r, u } = screenAxes(), dir = { l: V.mul(r, -1), r, u, d: V.mul(u, -1) }[b.dataset.tri];
    flyFace(FACES.find(f => V.dot(f.n, dir) > 0.9).v);
  } else if (b.dataset.roll) flyTo(cam.yaw + +b.dataset.roll * Math.PI / 2, cam.pitch, cam.view);
});
const renderMore = () => { $('#actsMore').hidden = !vis.actsOpen; $('#moreBtn').classList.toggle('on', !!vis.actsOpen); };
$('#moreBtn').addEventListener('click', () => { vis.actsOpen = !vis.actsOpen; saveVis(); renderMore(); });
renderMore();
new ResizeObserver(() => draw()).observe($('#viewwrap'));
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => draw());

// ---------- Anfang und Ende fest/lose ----------
const lockIcon = closed => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="${closed ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'}"/></svg>`;
// Schloss des gewählten Punkts: Der Punktname steht schon in der Leiste
const pipeLocks = (q, w) => {
  const k = w === 'S' ? 'startFixed' : 'endFixed', t = `${w === 'S' ? 'Anfang' : 'Ende'} ${q[k] ? 'fest' : 'lose'}`;
  return `<button class="lockbtn${q[k] ? '' : ' open'}" data-lock="${k}" data-pid="${q.id}" title="${t}" aria-label="${t}" aria-pressed="${!!q[k]}">${lockIcon(q[k])}</button><i class="bsep"></i>`;
};
function toggleLock(q, k) {
  commit();
  q[k] = !q[k];
  adjusted = { set: new Set(), t: 0 };
  renderInputs(); recompute(); renderBundleBar();
  toast(k === 'endFixed' ? (q[k] ? 'Ende fest: Änderungen verschieben das Rohrende nicht.' : 'Ende lose: Änderungen verschieben das Rohrende.') : q[k] ? 'Anfang fest: Änderungen verschieben den Rohranfang nicht.' : 'Anfang lose: Ist das Ende fest, wandert das Rohr mit, und der Anfang gibt nach.');
}

// ---------- Labor ein/aus ----------
function setLab(on) {
  lab = on;
  try { localStorage.setItem('biege.lab', on ? '1' : '0'); } catch {}
  document.body.classList.toggle('lab', on);
  if (!on) { setTool('edit'); $('#visPop').hidden = true; if (['input', 'room'].includes(document.body.dataset.tab)) showTab('tools'); }
  shown = null; fit = null;
  recompute(); renderTools();
}

// ---------- Reiter ----------
function showTab(t) {
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  if (t === 'tools') renderTools();
  if (t === 'room') renderRoomTab();
  if (t === 'input') requestAnimationFrame(drawMini);
  document.body.dataset.tab = t;
  window.scrollTo(0, 0);
  draw();
}
$('.tabbar').addEventListener('click', e => { const t = e.target.closest('button')?.dataset.tab; if (t) showTab(t); });
document.body.dataset.tab = 'view';

// ---------- Versatz / Etage ----------
// Winkel + Versatz eingeben; Schräge (Achsmaß) = Versatz / sin α, Länge in Laufrichtung = Versatz / tan α.
// „Neu“ legt ein Rohr gerade – schräg – gerade an, „Einfügen“ ersetzt einen geraden Schenkel durch dieselbe Form
// (die Länge in Laufrichtung bleibt, der Rest des Rohrs wandert um den Versatz mit).
const DIR_NAMES = [['rechts', 'links'], ['hinten', 'vorne'], ['oben', 'unten']];
const dirName = v => {
  const k = [0, 1, 2].reduce((m, j) => (Math.abs(v[j]) > Math.abs(v[m]) ? j : m), 0);
  return DIR_NAMES[k][v[k] > 0 ? 0 : 1] + (Math.abs(Math.abs(v[k]) - 1) < 1e-6 ? '' : ' (schräg)');
};
const off = { ang: 45, V: 100, mode: 'new', i: -1, d: [1, 0, 0], dirs: [], L: 0, userPos: false }; // userPos: Lage selbst eingegeben

function openOffset(mode, i = -1) {
  off.mode = mode; off.i = i; off.userPos = false;
  off.d = [1, 0, 0];
  if (mode === 'insert') {
    const v = legVec(i);
    off.L = V.len(v);
    if (off.L < 1) return;
    off.d = V.norm(v);
  }
  off.dirs = extDirs(off.d).filter(a => Math.abs(V.dot(a, off.d)) < 0.999);
  const up = Math.max(0, off.dirs.findIndex(a => a[2] > 0.9));
  $('#offDir').innerHTML = off.dirs.map((a, k) => `<option value="${k}"${k === up ? ' selected' : ''}>${dirName(a)}</option>`).join('');
  $('#offTitle').textContent = mode === 'insert' ? `Versatz in Schenkel ${i + 1} (${fmt(off.L)} mm)` : 'Neues Rohr mit Versatz';
  $('#offALbl').textContent = mode === 'insert' ? 'Abstand bis Versatz (mm)' : 'Gerade davor (mm)';
  $('#offBLbl').textContent = mode === 'insert' ? 'Rest danach (mm)' : 'Gerade danach (mm)';
  $('#offV').value = fin(off.V);
  $$('#offAng button').forEach(b => b.classList.toggle('on', +b.dataset.a === off.ang));
  if (mode === 'insert') {
    const A = Math.max(0, (off.L - offValues().run) / 2);
    $('#offA').value = String(r1(A)).replace('.', ',');
  } else {
    $('#offA').value = '150'; $('#offB').value = '150';
  }
  $('#offDlg').hidden = false;
  updateOffset('A');
}

function offValues() {
  const a = off.ang * Math.PI / 180, v = num($('#offV').value);
  const run = off.ang >= 90 ? 0 : v / Math.tan(a);
  return { a, v, S: v / Math.sin(a), run, A: num($('#offA').value), B: num($('#offB').value) };
}

// changed = welches Feld zuletzt geändert wurde; beim Einfügen ergibt sich das andere aus der Schenkellänge
function updateOffset(changed) {
  if (off.mode === 'insert') {
    const v = offValues();
    const show = n => String(r1(n)).replace('.', ',');
    if (changed === 'B') $('#offA').value = show(off.L - v.B - v.run);
    else $('#offB').value = show(off.L - v.A - v.run);
  }
  const v = offValues(), f = prof(), T = f.R * Math.tan(v.a / 2), errs = [], warns = [];
  if (!(v.v > 0)) errs.push('Versatz eingeben.');
  else if (v.A < -0.05 || v.B < -0.05) {
    errs.push(off.mode === 'insert' ? `Passt nicht in den Schenkel – braucht ${fmt(v.run)} mm in Laufrichtung. Kleineren Versatz oder größeren Winkel wählen.` : 'Längen dürfen nicht negativ sein.');
  } else {
    if (v.S - 2 * T < f.minStraight) warns.push(`Schräge hat nur ${fmt(v.S - 2 * T)} mm gerade – die Zange braucht ${fmt(f.minStraight)} mm. Größeren Versatz oder kleineren Winkel wählen.`);
    // gerade Reste davor/danach abzüglich der Bögen (Versatz + vorhandene Nachbarbiegungen)
    const tPrev = off.mode === 'insert' && off.i > 0 ? layout.bends[off.i - 1]?.T || 0 : 0;
    const tNext = off.mode === 'insert' ? layout.bends[off.i]?.T || 0 : 0;
    const gA = v.A - T - tPrev, gB = v.B - T - tNext;
    if (v.A > 0.05 && gA < f.minStraight) warns.push(`Vor dem Versatz bleiben nur ${fmt(gA)} mm gerade (Zange: ${fmt(f.minStraight)} mm).`);
    if (v.B > 0.05 && gB < f.minStraight) warns.push(`Nach dem Versatz bleiben nur ${fmt(gB)} mm gerade (Zange: ${fmt(f.minStraight)} mm).`);
  }
  $('#offInfo').innerHTML =
    `<div class="kv"><span>Schräge (Achsmaß) <b>${fmt(v.S)} mm</b></span><span>In Laufrichtung <b>${fmt(v.run)} mm</b></span><span>2 × <b>${off.ang}°</b></span></div>` +
    errs.map(m => `<div class="msg err">✕ ${esc(m)}</div>`).join('') + warns.map(m => `<div class="msg warn">⚠ ${esc(m)}</div>`).join('');
  $('#offOk').disabled = errs.length > 0;
  $('#offSketch').innerHTML = offSketch(v);
}

// Skizze: gerade – schräg – gerade mit Versatz, Winkel und Schräge
function offSketch(v) {
  const A = Math.max(v.A, 0), B = Math.max(v.B, 0), tot = Math.max(A + v.run + B, 1), H = Math.max(v.v, 1);
  const s = Math.min(240 / tot, 80 / H), x0 = 30 + (240 - tot * s) / 2, y0 = 100;
  const p1 = [x0 + A * s, y0], p2 = [p1[0] + v.run * s, y0 - v.v * s], p3 = [p2[0] + B * s, p2[1]];
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], dx = Math.max(p3[0], p1[0] + 20) + 14;
  const arcR = 22, ea = [p1[0] + arcR * Math.cos(v.a), p1[1] - arcR * Math.sin(v.a)];
  return `<polyline points="${x0},${y0} ${p1} ${p2} ${p3}" fill="none" stroke="var(--tube)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="${p1[0]}" y1="${y0}" x2="${p1[0] + 40}" y2="${y0}" stroke="var(--muted)" stroke-dasharray="3 3"/>
    ${off.ang < 90 ? `<path d="M${p1[0] + arcR},${y0} A${arcR},${arcR} 0 0 0 ${ea}" fill="none" stroke="var(--mark)" stroke-width="2"/>
    <text x="${p1[0] + arcR + 4}" y="${y0 - 6}" fill="var(--mark)">${off.ang}°</text>` : ''}
    <line x1="${dx}" y1="${y0}" x2="${dx}" y2="${p2[1]}" stroke="var(--accent)" stroke-width="1.5"/>
    <line x1="${dx - 5}" y1="${y0}" x2="${dx + 5}" y2="${y0}" stroke="var(--accent)" stroke-width="1.5"/>
    <line x1="${dx - 5}" y1="${p2[1]}" x2="${dx + 5}" y2="${p2[1]}" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="${dx + 6}" y="${(y0 + p2[1]) / 2 + 4}" fill="var(--accent)" style="font-weight:600">${fmt(v.v)}</text>
    <text x="${mid[0] - 8}" y="${mid[1] - 6}" text-anchor="end">${fmt(v.S)}</text>`;
}

function applyOffset() {
  const v = offValues(), p = proj(), u = off.dirs[+$('#offDir').value] || off.dirs[0];
  const legs = [V.mul(off.d, v.A), V.add(V.mul(off.d, v.run), V.mul(u, v.v)), V.mul(off.d, v.B)]
    .filter(x => V.len(x) > 0.01)
    .map(x => ({ x: x[0], y: x[1], z: x[2] }));
  commit();
  if (off.mode === 'insert') { ensureDeltas(); txInsertLegs(p, off.i, legs.length - 1); p.deltas.splice(off.i, 1, ...legs); }
  else { p.mode = 'deltas'; p.deltas = legs; p.bundleTx = []; p.done = {}; }
  off.V = v.v;
  $('#offDlg').hidden = true;
  refit();
  renderInputs(); recompute(); selectLeg(-1);
}

$('#offAng').addEventListener('click', e => {
  const a = e.target.closest('button')?.dataset.a;
  if (!a) return;
  off.ang = +a;
  $$('#offAng button').forEach(b => b.classList.toggle('on', b === e.target.closest('button')));
  centerOffset();
  updateOffset('A');
});
// Beim Einfügen mittig setzen, solange die Lage nicht selbst eingegeben wurde
function centerOffset() {
  if (off.mode === 'insert' && !off.userPos) $('#offA').value = String(r1(Math.max(0, (off.L - offValues().run) / 2))).replace('.', ',');
}
$('#offV').addEventListener('input', () => { centerOffset(); updateOffset('A'); });
$('#offA').addEventListener('input', () => { off.userPos = true; updateOffset('A'); });
$('#offB').addEventListener('input', () => { off.userPos = true; updateOffset('B'); });
$('#offOk').addEventListener('click', applyOffset);
$('#offCancel').addEventListener('click', () => { $('#offDlg').hidden = true; });
$('#offDlg').addEventListener('click', e => { if (e.target.id === 'offDlg') $('#offDlg').hidden = true; });
$('#offNew').addEventListener('click', () => openOffset('new'));
// „⤳ Versatz“ schaltet das X auf dem gewählten Schenkel ein und aus
$('#offLegView').addEventListener('click', () => {
  if (sel < 0) return;
  ensureDeltas();
  const L = V.len(legVec(sel));
  if (proj().deltas[sel].lock) { toast('Dieser Schenkel ist fest. Erst lösen, dann Versatz setzen.'); return; }
  ofs = ofs || L < 1 ? null : { i: sel, t: round5(L / 2), ang: 45, n: null };
  renderBundleBar(); draw();
});
$('#lpOff').addEventListener('click', () => { if (sel >= 0) openOffset('insert', sel); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#offDlg').hidden = true; $('#newDlg').hidden = true; $('#visPop').hidden = true; } });

// ---------- Version / Update ----------
// Eigene Version aus version.js; beim Öffnen und beim Zurückkehren in die App mit dem Server vergleichen.
const APP_VERSION = self.APP_VERSION ?? '?', APP_DATE = self.APP_DATE ?? '';
let serverVersion; // undefined = noch nicht geprüft, null = Server nicht erreichbar
const updateStatus = () => serverVersion === undefined ? 'wird geprüft …'
  : serverVersion === null ? 'Server nicht erreichbar (offline)'
  : serverVersion === APP_VERSION ? '✓ aktuell' : `Neue Version ${serverVersion} verfügbar`;
async function checkUpdate() {
  try {
    const t = await (await fetch('version.js', { cache: 'no-store' })).text();
    const m = t.match(/APP_VERSION\s*=\s*(\d+)/);
    serverVersion = m ? +m[1] : null;
  } catch { serverVersion = null; }
  const newer = typeof serverVersion === 'number' && serverVersion !== APP_VERSION;
  $('#updateBar').hidden = !newer;
  if (newer) $('#updateBar').textContent = `Neue Version ${serverVersion} – tippen zum Laden`;
  const st = $('#appStatus');
  if (st) st.textContent = updateStatus();
}
async function reloadApp() {
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch {}
  location.reload();
}
$('#verTag').textContent = `v${APP_VERSION}`;
$('#updateBar').addEventListener('click', reloadApp);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

// ---------- Export / Import ----------
// Datei mit dem aktuellen Projekt (samt Parallelrohren) und den benutzten Zangenprofilen.
// Auf dem iPhone über das Teilen-Menü (AirDrop, Dateien, Mail …), sonst als Download.
async function exportProject() {
  const p = proj();
  const projects = scenePipes(p), scenes = [scene(p)];
  const profiles = db.profiles.filter(f => projects.some(q => q.profileId === f.id));
  const rooms = db.rooms.filter(r => projects.some(q => q.roomId === r.id));
  const data = { format: 'rohrbiegen', version: 2, app: APP_VERSION, exported: new Date().toISOString(), projects, profiles, rooms, scenes };
  const name = `${p.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'Rohr'}.rohrbiegen.json`;
  const file = new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: p.name }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Import: Projekte bekommen neue IDs (nichts wird überschrieben); gleiche Zangenprofile (Name + Radius) werden wiederverwendet
async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Die Datei ist keine gültige Projektdatei.'); return; }
  if (data?.format !== 'rohrbiegen' || !Array.isArray(data.projects)) { toast('Die Datei ist keine Rohrbiegen-Projektdatei.'); return; }
  const profMap = {};
  (data.profiles || []).forEach(f => {
    const same = db.profiles.find(x => x.name === f.name && Math.abs(x.R - f.R) < 0.01);
    if (same) profMap[f.id] = same.id;
    else { const n = { ...structuredClone(f), id: uid() }; db.profiles.push(n); profMap[f.id] = n.id; }
  });
  // Räume bekommen neue IDs; ältere Dateien (Version 1) bringen Flächen mit, die migrate() in Räume umwandelt
  const roomMap = {};
  (data.rooms || []).forEach(r => { const n = { ...structuredClone(r), id: uid() }; db.rooms.push(n); roomMap[r.id] = n.id; });
  // Szenen bekommen neue IDs; ältere Dateien ohne Szenen ergeben je Rohr eine eigene Szene (migrate)
  const sceneMap = {};
  (data.scenes || []).forEach(sc => { const n = { ...structuredClone(sc), id: uid() }; db.scenes.push(n); sceneMap[sc.id] = n.id; });
  const added = data.projects.map(q => {
    const n = { ...structuredClone(q), id: uid(), sceneId: sceneMap[q.sceneId] || null };
    n.profileId = profMap[q.profileId] || db.profiles[0].id;
    if (q.roomId) n.roomId = roomMap[q.roomId] || null;
    return n;
  });
  // Bezüge zeigen auf Rohre: auf die neuen IDs umschreiben
  const ids = Object.fromEntries(data.projects.map((q, i) => [q.id, added[i].id]));
  const fix = r => { if (r) r.to = r.to.replace(/^([SE]):(.+)$/, (m, w, id) => `${w}:${ids[id] || id}`); };
  added.forEach(n => ['S', 'E'].forEach(w => n.refs?.[w]?.forEach(fix)));
  Object.values(sceneMap).forEach(id => db.scenes.find(x => x.id === id).planes?.forEach(pl => fix(pl.ref)));
  db.projects.push(...added);
  migrate(db);
  db.currentId = added[0].id;
  fullRender(); resetView();
  toast(`${added.length} Rohr(e) importiert.`);
}

$('#pImportFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; });

// ---------- Vorschau im Reiter „Eingabe“ ----------
// Kleine 3D-Skizze (gleiche Blickrichtung wie die 3D-Ansicht), damit beim Tippen sichtbar ist, wohin das Rohr läuft.
// Der bearbeitete Schenkel leuchtet orange; Richtungspfeile mit Klartext „rechts / oben / hinten“.
const mini = $('#miniPrev'), mctx = mini.getContext('2d');
// iPhone-Tastatur: Safari schiebt den sichtbaren Ausschnitt nach unten, „sticky“ klebt aber am ganzen Fenster.
// Darum Vorschau an den oberen Rand des sichtbaren Ausschnitts setzen und das Eingabefeld unter ihr halten.
const vv = window.visualViewport;
function fitKeyboard() {
  if (!vv) return;
  const open = innerHeight - vv.height > 120 && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if (document.body.classList.contains('kbd') !== open) { document.body.classList.toggle('kbd', open); drawMini(); }
  document.documentElement.style.setProperty('--vv-top', `${open ? Math.max(0, vv.offsetTop) : 0}px`);
  if (!open || !mini.offsetParent) return;
  const el = document.activeElement, r = el.getBoundingClientRect(), m = mini.getBoundingClientRect();
  const top = m.bottom + 8, bottom = vv.offsetTop + vv.height - 8;
  if (r.top < top) scrollBy(0, r.top - top);
  else if (r.bottom > bottom) scrollBy(0, r.bottom - bottom);
}
if (vv) {
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitKeyboard); };
  vv.addEventListener('resize', later); vv.addEventListener('scroll', later);
  document.addEventListener('focusin', () => setTimeout(fitKeyboard, 350));
  document.addEventListener('focusout', () => setTimeout(fitKeyboard, 50));
}
function drawMini() {
  const layout = curLayout();
  if (!layout || !mini.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, W = mini.clientWidth, H = mini.clientHeight;
  if (mini.width !== Math.round(W * dpr) || mini.height !== Math.round(H * dpr)) { mini.width = Math.round(W * dpr); mini.height = Math.round(H * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, W, H);
  const pipes = [layout, ...layout.bundle], room = layout.room;
  const pts = pipes.flatMap(L => L.samples.map(s => project(s.p)));
  if (pts.length < 2) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  pts.forEach(q => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
  const pad = 22, sc = Math.min((W - 2 * pad - 70) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1));
  const ox = 70 + (W - 70) / 2 - (x0 + x1) / 2 * sc, oy = H / 2 - (y0 + y1) / 2 * sc;
  const P = p => { const q = project(p); return [ox + q.x * sc, oy + q.y * sc]; };
  const muted = css('--muted');
  if (room) { // Grundriss als Bezug
    mctx.strokeStyle = muted; mctx.globalAlpha = 0.35; mctx.lineWidth = 1;
    mctx.beginPath(); room.outline.forEach(([x, y], i) => { const [a, b] = P([x, y, room.z0 || 0]); i ? mctx.lineTo(a, b) : mctx.moveTo(a, b); }); mctx.closePath(); mctx.stroke();
    mctx.globalAlpha = 1;
  }
  pipes.forEach((L, k) => {
    mctx.strokeStyle = k && (L.short || L.clash) ? css('--err') : k ? css('--tube-hi') : css('--tube'); mctx.lineWidth = k ? 3 : 5; mctx.lineCap = mctx.lineJoin = 'round';
    mctx.beginPath(); L.samples.forEach((s, i) => { const [a, b] = P(s.p); i ? mctx.lineTo(a, b) : mctx.moveTo(a, b); }); mctx.stroke();
  });
  // bearbeiteter Schenkel: von Schnittpunkt zu Schnittpunkt
  const raw = points(proj()), i = previewLeg >= 0 ? previewLeg : sel;
  if (i >= 0 && i < raw.length - 1) {
    const [a, b] = P(raw[i]), [c, d] = P(raw[i + 1]);
    mctx.strokeStyle = css('--mark'); mctx.lineWidth = 6;
    mctx.beginPath(); mctx.moveTo(a, b); mctx.lineTo(c, d); mctx.stroke();
    const l = Math.hypot(c - a, d - b);
    if (l > 12) { // Pfeilspitze am Schenkelende
      const ux = (c - a) / l, uy = (d - b) / l;
      mctx.fillStyle = css('--mark'); mctx.beginPath(); mctx.moveTo(c + ux * 6, d + uy * 6);
      mctx.lineTo(c - ux * 8 - uy * 7, d - uy * 8 + ux * 7); mctx.lineTo(c - ux * 8 + uy * 7, d - uy * 8 - ux * 7); mctx.fill();
    }
  }
  const [ax, ay] = P(raw[0]);
  mctx.fillStyle = css('--text'); mctx.font = '700 12px system-ui'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.beginPath(); mctx.arc(ax, ay, 4, 0, 7); mctx.fill(); mctx.fillText('A', ax - 10, ay - 10);
  // Richtungskreuz mit Wörtern
  const gx = 36, gy = H / 2 + 6;
  [['rechts', [1, 0, 0], '#e03131'], ['hinten', [0, 1, 0], '#2f9e44'], ['oben', [0, 0, 1], '#1c7ed6']].forEach(([n, v, c]) => {
    const q = project(v), ex = gx + q.x * 24, ey = gy + q.y * 24;
    mctx.strokeStyle = c; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(gx, gy); mctx.lineTo(ex, ey); mctx.stroke();
    mctx.fillStyle = c; mctx.font = '600 10px system-ui'; mctx.fillText(n, gx + q.x * 34, gy + q.y * 34);
  });
}
mini.addEventListener('click', () => $('[data-tab=view]').click());
new ResizeObserver(() => drawMini()).observe(mini);

// ---------- Punkte, Ebenen, Abhängigkeiten ----------
// Knoten: S:<rohr> / E:<rohr> = Rohranfang/-ende, R:<ebene> = Referenzebene.
// Je Achse hat ein Punkt höchstens einen Bezug { to, off }: Koordinate = Bezug + Maß. Ebenen haben nur ihre Normalenachse,
// Schenkel können über d.ref an einer Ebene hängen. Kreise werden abgelehnt, damit das Ergebnis immer eindeutig bleibt.
const noPipe = q => scenePipes(q).indexOf(q) + 1;
const pipeById = id => db.projects.find(q => q.id === id);
const planeById = id => scene().planes.find(x => x.id === id);
const planeNo = pl => scene().planes.indexOf(pl) + 1;
const nodeName = key => { const [w, id] = key.split(':'); return w === 'R' ? `R${planeNo(planeById(id))}` : `${w}${noPipe(pipeById(id))}`; };
const nodePos = key => { const [w, id] = key.split(':'), q = pipeById(id); return w === 'S' ? points(q)[0] : endOf(q); };
const nodeVal = (key, k) => (key[0] === 'R' ? planeById(key.slice(2)).c : nodePos(key)[k]);
const nodeExists = key => (key[0] === 'R' ? !!planeById(key.slice(2)) : !!pipeById(key.slice(2)));
// Lage einer Ebene je Achse: Normalenachse = Lage der Ebene, die beiden anderen = Mitte der Fläche
const planeKey = (pl, k) => (k === pl.axis ? 'c' : k === [0, 1, 2].find(i => i !== pl.axis) ? 'u' : 'v');
const pointRefs = (q, w) => (q.refs ||= { S: [null, null, null], E: [null, null, null] })[w];
function refOfNode(key, k) {
  const [w, id] = key.split(':');
  if (w === 'R') { const pl = planeById(id); return pl?.axis === k ? pl.ref : null; }
  return pipeById(id)?.refs?.[w]?.[k] || null;
}
function refCycle(from, k, goal) { for (let n = from, g = 0; n && g < 99; g++) { if (n === goal) return true; n = refOfNode(n, k)?.to; } return false; }
function withPipe(q, fn) { const c = db.currentId; db.currentId = q.id; try { return fn(); } finally { db.currentId = c; } }
// Punkt setzen: Start verschiebt das Rohr nicht, sondern der andere Punkt bleibt stehen und die Schenkel gleichen aus
function setPoint(q, w, tgt) {
  const S = points(q)[0], E = endOf(q);
  if (scene(q).moveWhole && w === 'S') { q.origin = [...tgt]; return true; }
  if (q.unrouted || q.deltas.length < 2) {
    const a = w === 'S' ? tgt : S, b = w === 'S' ? E : tgt, v = V.sub(b, a);
    if (V.len(v) < 1) return false;
    q.origin = [...a]; q.deltas = [{ ...(q.deltas[0]?.lock ? { lock: true } : {}), x: v[0], y: v[1], z: v[2] }];
    return true;
  }
  // Ist der andere Punkt lose, wandert das ganze Rohr mit
  if (w === 'S' && !q.endFixed) { q.origin = [...tgt]; return true; }
  if (w === 'E' && !q.startFixed) { q.origin = V.add(q.origin, V.sub(tgt, E)); return true; }
  const before = structuredClone(q.deltas), o0 = q.origin;
  return withPipe(q, () => {
    if (w === 'S') q.origin = [...tgt];
    const r = keepEnd(q, -1, w === 'S' ? E : tgt, true);
    if (!r.ok) { q.deltas = before; q.origin = o0; }
    return r.ok;
  });
}
// Schenkel j an Ebene: Lage ändern, die Nachbarschenkel gleichen aus
function alignLeg(q, j) {
  const d = q.deltas[j], pl = planeById(d.ref.plane), n = q.deltas.length;
  if (!pl || j < 1 || j > n - 2) return false;
  const key = 'xyz'[pl.axis], cur = points(q)[j][pl.axis], dv = pl.c + d.ref.off - cur;
  if (Math.abs(dv) < 0.01) return false;
  q.deltas[j - 1][key] += dv; q.deltas[j + 1][key] -= dv;
  return true;
}
// Alle Bezüge der Szene erfüllen; was nicht geht (Schenkel zu kurz, kein Ausgleich), bleibt stehen und wird gemeldet
function resolveScene(p = proj()) {
  const sc = scene(p), pipes = scenePipes(p), failed = new Set();
  for (let pass = 0, again = true; again && pass < 8; pass++) {
    again = false;
    sc.planes.forEach(pl => {
      if (pl.locked || !pl.ref || !nodeExists(pl.ref.to)) return; // gesperrte Ebenen bleiben stehen
      const v = nodeVal(pl.ref.to, pl.axis) + pl.ref.off;
      if (Math.abs(v - pl.c) > 0.01) { pl.c = v; again = true; }
    });
    pipes.forEach(q => {
      for (const w of ['S', 'E']) {
        const refs = q.refs?.[w];
        if (!refs || failed.has(w + q.id)) continue;
        const tgt = [...(w === 'S' ? points(q)[0] : endOf(q))]; let moved = false;
        refs.forEach((r, k) => { if (r && nodeExists(r.to)) { const v = nodeVal(r.to, k) + r.off; if (Math.abs(v - tgt[k]) > 0.01) { tgt[k] = v; moved = true; } } });
        if (moved && w === 'S' && !q.unrouted && !q.endFixed) { q.origin = tgt; again = true; }
        else if (moved) { if (setPoint(q, w, tgt)) again = true; else failed.add(w + q.id); }
      }
      q.deltas.forEach((d, j) => { if (d.ref && alignLeg(q, j)) again = true; });
    });
  }
  sceneFails = [...failed].map(k => `${k[0]}${noPipe(pipeById(k.slice(1)))}`);
}
let sceneFails = [];
// Zustand aller Rohre und Ebenen – für Rückgängig und fürs Ziehen
const sceneState = p => ({ pipes: scenePipes(p).filter(q => q !== p).map(q => ({ id: q.id, origin: q.origin, deltas: q.deltas, refs: q.refs, unrouted: q.unrouted })), planes: scene(p).planes });
function restoreSceneState(p, st) {
  scene(p).planes = structuredClone(st.planes);
  st.pipes.forEach(o => { const q = pipeById(o.id); if (q) Object.assign(q, structuredClone(o)); });
}

// Rechtwinklige Wege von S nach E: je Achse eine Gerade, in jeder Reihenfolge
function routeOptions(rel) {
  const axes = [0, 1, 2].filter(k => Math.abs(rel[k]) > 0.5);
  const perms = a => (a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  return axes.length ? perms(axes) : [];
}
function applyRoute(p, next) {
  const rel = V.sub(endOf(p), points(p)[0]), ways = routeOptions(rel);
  if (!ways.length) return;
  commit();
  p.routeIdx = ((p.routeIdx || 0) + (next ? 1 : 0)) % ways.length;
  p.deltas = ways[p.routeIdx].map(k => { const v = [0, 0, 0]; v[k] = rel[k]; return { x: v[0], y: v[1], z: v[2] }; });
  p.unrouted = false; p.bundleTx = []; p.done = {};
  renderInputs(); recompute();
}

// Auswahl
function clearSel() { selPoint = null; selPlane = null; pointMove = false; ofs = null; }
function selectPoint(pid, w) {
  if (pid !== db.currentId) dropStub();
  if (pid !== db.currentId) { db.currentId = pid; highlight = -1; fullRender(); }
  sel = -1; selCorner = -1; bundleSel = -1; startOpen = false;
  selPlane = null; pointMove = false; selPoint = { pid, w };
  if (w === 'S') extOpen = false;
  $('#legPanel').hidden = $('#offLegView').hidden = true;
  renderBundleBar(); draw();
}
function selectPlane(id) {
  sel = -1; selCorner = -1; bundleSel = -1; startOpen = false; selPoint = null; pointMove = false; selPlane = id;
  $('#legPanel').hidden = $('#offLegView').hidden = true;
  renderBundleBar(); draw();
}
// Maß festlegen: Quelle gewählt, jetzt wird das Gegenstück angetippt
function pickNode(key) {
  if (!pick || key === pick.key) return;
  const srcPlane = pick.key[0] === 'R' ? planeById(pick.key.slice(2)) : null, dstPlane = key[0] === 'R' ? planeById(key.slice(2)) : null;
  if (srcPlane && dstPlane && srcPlane.axis !== dstPlane.axis) { toast('Ebenen lassen sich nur an parallelen Ebenen ausrichten.'); return; }
  if (srcPlane || dstPlane) { addRef(pick.key, (srcPlane || dstPlane).axis, key); return; }
  pick.to = key;
  renderBundleBar();
}
function addRef(src, k, to) {
  if (refOfNode(src, k)) { toast(`${nodeName(src)} hat in ${'XYZ'[k]} schon einen Bezug – erst dort löschen.`); return; }
  if (refCycle(to, k, src)) { toast('Das ergäbe einen Kreis: Dieser Punkt hängt schon davon ab.'); return; }
  commit();
  const off = r1(nodeVal(src, k) - nodeVal(to, k)), r = { to, off };
  if (src[0] === 'R') planeById(src.slice(2)).ref = r;
  else { const [w, id] = src.split(':'); pointRefs(pipeById(id), w)[k] = r; }
  pick = null;
  recompute();
  toast(`${nodeName(src)} hängt jetzt an ${nodeName(to)} (${'XYZ'[k]}). Farbiges Maß antippen, um den Abstand zu ändern – „Auf 0“ legt es genau darauf.`);
}
function dropRef(src, k) {
  commit();
  if (src[0] === 'R') planeById(src.slice(2)).ref = null;
  else { const [w, id] = src.split(':'); pipeById(id).refs[w][k] = null; }
  recompute();
}
// Koordinate eines Punkts setzen: mit Bezug ändert sich das Maß, ohne Bezug der Punkt selbst
function setNodeCoord(key, k, v) {
  const r = refOfNode(key, k);
  if (r) { r.off = r1(v - nodeVal(r.to, k)); return true; }
  if (key[0] === 'R') { const pl = planeById(key.slice(2)); pl[planeKey(pl, k)] = v; return true; }
  const [w, id] = key.split(':'), q = pipeById(id), tgt = [...nodePos(key)];
  tgt[k] = v;
  return setPoint(q, w, tgt);
}
function renderSceneBar(bar) {
  const p = proj(), sc = scene(p), xyz = key => [0, 1, 2].map(k => `<button data-pk="${k}" class="ax-${'xyz'[k]}-b">${'XYZ'[k]} ${fmt(nodePos(key)[k])}</button>`).join('');
  if (pick?.to) {
    bar.innerHTML = `<span>${nodeName(pick.key)} an ${nodeName(pick.to)}, Achse:</span>${[0, 1, 2].map(k => `<button data-pa="${k}" class="ax-${'xyz'[k]}-b">${'XYZ'[k]} ${fmt(Math.abs(nodeVal(pick.key, k) - nodeVal(pick.to, k)))}</button>`).join('')}<button data-pc="1">Abbrechen</button>`;
  } else if (pick) {
    const srcPl = pick.key[0] === 'R' ? planeById(pick.key.slice(2)) : null;
    const opts = sc.planes.filter(pl => `R:${pl.id}` !== pick.key && (!srcPl || pl.axis === srcPl.axis));
    bar.innerHTML = `<span>${nodeName(pick.key)}: Bezug wählen</span>${opts.map(pl => `<button data-pr="${pl.id}" class="ax-${'xyz'[pl.axis]}-b">R${planeNo(pl)}</button>`).join('')}<button data-pc="1">Abbrechen</button>`;
  } else if (selPlane && planeById(selPlane)) {
    const pl = planeById(selPlane), key = `R:${pl.id}`;
    if (pl.locked) bar.innerHTML = `<span>R${planeNo(pl)} · ${'XYZ'[pl.axis]}-Ebene</span><span>${[0, 1, 2].map(k => `${'XYZ'[k]} ${fmt(pl[planeKey(pl, k)])}`).join(' · ')} · B ${fmt(pl.w)} · H ${fmt(pl.h)}</span><button data-bb="pldel" class="danger">Löschen</button>`;
    else bar.innerHTML = `<span>R${planeNo(pl)} · ${'XYZ'[pl.axis]}-Ebene</span>${[0, 1, 2].map(k => `<button data-plk="${k}" class="ax-${'xyz'[k]}-b">${'XYZ'[k]} ${fmt(pl[planeKey(pl, k)])}</button>`).join('')}<button data-plk="w">B ${fmt(pl.w)}</button><button data-plk="h">H ${fmt(pl.h)}</button><button data-pm="${key}">Maß</button><button data-bb="pldel" class="danger">Löschen</button>`;
  } else if (selPoint && pipeById(selPoint.pid)) {
    const q = pipeById(selPoint.pid), key = `${selPoint.w}:${q.id}`, isS = selPoint.w === 'S', ways = routeOptions(V.sub(endOf(q), points(q)[0])).length;
    bar.innerHTML = `<span>${nodeName(key)}</span>${!isS && !q.unrouted ? `${extAngChips()}<i class="bsep"></i>` : ''}${pipeLocks(q, selPoint.w)}${isS ? `<button data-bb="par"${startOpen ? ' class="on"' : ''}>Parallelrohr</button>${q === p && p.bundle.length ? '<button data-bb="paradd">+ Parallelrohr</button>' : ''}` : ''}<button data-bb="move"${pointMove ? ' class="on"' : ''}>Verschieben</button>${pointMove ? xyz(key) + (isS ? `<button data-bb="whole"${sc.moveWhole ? ' class="on"' : ''}>Rohr mitnehmen</button>` : '') : ''}<button data-pm="${key}">Maß</button>${ways ? `<button data-bb="route">${q.unrouted ? 'Weg vorschlagen' : 'Anderer Weg'}</button>` : ''}${q.unrouted && scenePipes(q).length > 1 ? '<button data-bb="pipedel" class="danger">Rohr löschen</button>' : ''}`;
  } else return false;
  bar.hidden = false;
  return true;
}
$('#bundleBar').addEventListener('click', e => {
  const b = e.target.closest('button'), p = proj(), ds = b?.dataset;
  if (!b) return;
  if (ds.pc) { pick = null; renderBundleBar(); return; }
  if (ds.pm) { pick = { key: ds.pm }; renderBundleBar(); toast('Punkt oder Ebene in 3D antippen oder eine Ebene in der Leiste wählen.'); return; }
  if (ds.pr) { pickNode(`R:${ds.pr}`); renderBundleBar(); return; }
  if (ds.pa != null) { addRef(pick.key, +ds.pa, pick.to); renderBundleBar(); return; }
  const barBox = () => { const r = b.getBoundingClientRect(), c = cv.getBoundingClientRect(); return { x: r.left + r.width / 2 - c.left, y: r.top - 30 - c.top }; };
  const askNum = (val, set, noHist) => {
    const { inp, close } = dimBox(barBox(), val, true);
    inp.focus({ preventScroll: true }); inp.select();
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const raw = inp.value.trim(), v = num(raw);
      close();
      if (ok && raw !== '') { if (!noHist) commit(); if (!set(v)) toast('So nicht möglich: Der andere Punkt steht fest und kein Schenkel kann ausgleichen.'); renderInputs(); recompute(); }
      renderBundleBar(); draw();
    };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); ev.stopPropagation(); });
    inp.addEventListener('blur', () => finish(true));
  };
  if (ds.me) {
    if (ds.me === 'end') measure = null;
    else if (ds.me === 'new') measure.a = measure.b = null;
    else {
      // Achsen ohne Versatz zählen nicht: Der nächste Weg soll im Bild anders aussehen
      const d = measureResult().d, way = t => MEASURE_TURNS[t].filter(k => d[k]).join(), now = way(measure.turn);
      do measure.turn = (measure.turn + 1) % MEASURE_TURNS.length; while (way(measure.turn) === now);
    }
    renderBundleBar(); draw();
    return;
  }
  if (ds.co) {
    if (ds.co === 'cancel') { create = null; renderBundleBar(); draw(); }
    else if (ds.co === 'ok') createOk();
    else if (ds.co === 'ref') { create.step = 'ref'; create.ref = null; renderBundleBar(); draw(); }
    else if (ds.co === 'last') { create.off = [...lastOff]; renderBundleBar(); draw(); }
    else askNum(create.off[+ds.co], v => { create.off[+ds.co] = v; return true; }, true);
    return;
  }
  if (ds.bb === 'stubdrop') { dropStub(); return; }
  if (ds.pk != null) { const key = `${selPoint.w}:${selPoint.pid}`, k = +ds.pk; askNum(nodePos(key)[k], v => setNodeCoord(key, k, v)); return; }
  if (ds.plk) {
    const pl = planeById(selPlane), f = ds.plk;
    if (f === 'w' || f === 'h') askNum(pl[f], v => { if (v < 50) return false; pl[f] = v; return true; });
    else askNum(pl[planeKey(pl, +f)], v => setNodeCoord(`R:${pl.id}`, +f, v));
    return;
  }
  if (ds.bb === 'par') { startOpen = !startOpen; renderBundleBar(); draw(); }
  else if (ds.bb === 'move') { pointMove = !pointMove; renderBundleBar(); draw(); }
  else if (ds.bb === 'whole') { const sc = scene(p); sc.moveWhole = !sc.moveWhole; renderBundleBar(); save(); }
  else if (ds.bb === 'route') applyRoute(p, !p.unrouted);
  else if (ds.bb === 'pldel') { delPlane(selPlane); } else if (ds.la) {
    const pl = planeById(ds.la), d = p.deltas[sel];
    commit(); d.ref = { plane: pl.id, off: r1(points(p)[sel][pl.axis] - pl.c) }; recompute(); toast(`Schenkel ${sel + 1} hängt jetzt an R${planeNo(pl)}.`);
  }
});
$('#addBtn').addEventListener('click', () => { $('#addPop').hidden = !$('#addPop').hidden; $('#visPop').hidden = $('#planePop').hidden = true; });
$('#addPop').addEventListener('click', () => { $('#addPop').hidden = true; });
$('#addPar').addEventListener('click', () => { const p = proj(); if (p.unrouted) toast('Erst den Weg des Rohrs festlegen.'); else addBundlePipe(p); });
$('#addPlane').addEventListener('click', () => {
  $('#planePop').hidden = !$('#planePop').hidden;
});
$('#planePop').addEventListener('click', e => {
  const k = e.target.closest('[data-ax]')?.dataset.ax;
  if (k == null) return;
  const p = proj(), sc = scene(p), id = uid(), a = +k, A = points(p)[0], [u, v] = [0, 1, 2].filter(i => i !== a);
  commit();
  sc.planes.push({ id, axis: a, c: A[a], w: 1000, h: 1000, u: A[u], v: A[v], ref: null });
  $('#planePop').hidden = true;
  refit();
  selectPlane(id); recompute();
});
// Ebene als Rechteck: Mitte (u, v) in den beiden anderen Achsen
function planeCorners(pl) {
  const [a, b] = [0, 1, 2].filter(i => i !== pl.axis), pt = (x, y) => { const q = [0, 0, 0]; q[pl.axis] = pl.c; q[a] = x; q[b] = y; return q; };
  const x0 = pl.u - pl.w / 2, x1 = pl.u + pl.w / 2, y0 = pl.v - pl.h / 2, y1 = pl.v + pl.h / 2;
  return [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
}
const AX_RGB = [[0.88, 0.19, 0.19], [0.18, 0.62, 0.27], [0.11, 0.49, 0.84]];
function drawPlanesOverlay(P3) {
  scene().planes.forEach((pl, i) => {
    if (pl.hidden) return;
    const c = planeCorners(pl).map(q => P3(q)), col = rgbCss(AX_RGB[pl.axis]), on = selPlane === pl.id;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = on ? 1.5 : 0.8; ctx.globalAlpha = on ? 0.9 : 0.35;
    ctx.beginPath(); c.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = on ? 1 : 0.55; ctx.fillStyle = col; ctx.font = '600 10px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; if (vis.labels || pick) ctx.fillText(`R${i + 1}`, c[2][0] + 4, c[2][1] - 4);
    ctx.restore();
    if (pl.locked) lockMark(c[2][0] + 32, c[2][1] - 8, true);
  });
}
// Griffe in 3D: alle Punkte der Szene, Ebenen, Verschiebepfeile
function drawSceneHandles() {
  const p = proj(), P3 = view.P3, sc = scene(p), cAcc = css('--accent');
  (vis.refPlanes ? sc.planes.filter(pl => !pl.hidden) : []).forEach(pl => {
    const c = planeCorners(pl).map(q => P3(q)), x = (c[0][0] + c[2][0]) / 2, y = (c[0][1] + c[2][1]) / 2, col = rgbCss(AX_RGB[pl.axis]);
    if (selPlane !== pl.id || pl.locked) return;
    knob(x, y, 7, col);
    gizmo.push({ type: 'plane', id: pl.id, at: [x, y], r: 12 });
    moveArrows(`R:${pl.id}`, [0, 1, 2]);
  });
  scenePipes(p).forEach((q, n) => {
    if (q.hidden) return;
    for (const w of ['S', 'E']) {
      const key = `${w}:${q.id}`, A = nodePos(key), [x, y] = P3(A), mine = q === p;
      if (!mine) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = q.color != null && vis.colors ? rgbCss(PIPE_COLORS[q.color]) : css('--muted'); ctx.fill(); gizmo.push({ type: 'pt', pid: q.id, w, at: [x, y], r: 12 }); }
      if ((vis.labels && scenePipes(p).length > 1) || pick) { ctx.save(); ctx.font = '700 12px system-ui'; ctx.fillStyle = css('--text'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${w}${n + 1}`, x - (mine ? 20 : 14), y + (mine ? 20 : 14)); ctx.restore(); }
      if (selPoint?.pid === q.id && selPoint.w === w) {
        ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.strokeStyle = css('--mark'); ctx.lineWidth = 2.5; ctx.stroke();
        if (pointMove) moveArrows(key, [0, 1, 2]);
      }
    }
  });
  void cAcc;
}
function axisArrows(A, axes, push) {
  const [x, y] = view.P3(A);
  axes.forEach(k => {
    const e = [0, 0, 0]; e[k] = 100;
    const [px, py] = view.P3(V.add(A, e)), mx = (px - x) / 100, my = (py - y) / 100, l = Math.hypot(mx, my);
    if (l < view.sc * 0.2) return;
    const ux = mx / l, uy = my / l, col = rgbCss(AX_RGB[k]);
    for (const s of [1, -1]) {
      const seg = [x + s * ux * 18, y + s * uy * 18, x + s * ux * 56, y + s * uy * 56];
      arrow(...seg, col, 4);
      push({ k, s, seg, pxPerMm: [mx, my] });
    }
  });
}
function moveArrows(key, axes) {
  const pl = key[0] === 'R' && planeById(key.slice(2)), c = pl && planeCorners(pl);
  axisArrows(pl ? [0, 1, 2].map(i => (c[0][i] + c[2][i]) / 2) : nodePos(key), axes, g => gizmo.push({ type: 'pmove', key, ...g }));
}
// Maße der Bezüge: je Achse eine Linie vom Bezug zum Punkt, antippbar; 0 heißt fluchtend/gleiche Höhe
function drawRefDims(P3, all) {
  const p = proj(), sc = scene(p), cols = ['--ax-x', '--ax-y', '--ax-z'].map(css);
  const selKey = selPoint ? `${selPoint.w}:${selPoint.pid}` : selPlane ? `R:${selPlane}` : null;
  const shown = (key, r) => all || key === selKey || r.to === selKey;
  const cen = P3(points(p)[0]);
  const one = (key, k, r) => {
    if (!nodeExists(r.to) || !shown(key, r)) return;
    const a = nodePos(key), b = [...a];
    b[k] = nodeVal(r.to, k);
    if (r.to[0] === 'R') planeMark(P3(b), r.to, k);
    dimLine(P3(b), P3(a), `${nodeName(r.to)}: ${fmt(Math.abs(r.off))} ${'XYZ'[k]}`, cen, 26, { robj: r, key, k }, { color: cols[k] });
  };
  scenePipes(p).forEach(q => ['S', 'E'].forEach(w => q.refs?.[w]?.forEach((r, k) => { if (r) one(`${w}:${q.id}`, k, r); })));
  sc.planes.forEach(pl => {
    if (!pl.ref || !nodeExists(pl.ref.to) || !shown(`R:${pl.id}`, pl.ref)) return;
    const c = planeCorners(pl), m = [0, 1, 2].map(i => (c[0][i] + c[2][i]) / 2), b = [...m];
    b[pl.axis] = nodeVal(pl.ref.to, pl.axis);
    if (pl.ref.to[0] === 'R') planeMark(P3(b), pl.ref.to, pl.axis);
    dimLine(P3(b), P3(m), `${nodeName(pl.ref.to)}: ${fmt(Math.abs(pl.c - b[pl.axis]))} ${'XYZ'[pl.axis]}`, cen, 26, pl.locked ? null : { robj: pl.ref, key: `R:${pl.id}`, k: pl.axis }, { color: cols[pl.axis] });
  });
  p.deltas.forEach((d, j) => {
    const pl = d.ref && planeById(d.ref.plane);
    if (!pl || !(all || sel === j || selPlane === pl.id)) return;
    const a = points(p)[j], b = [...a];
    b[pl.axis] = pl.c;
    planeMark(P3(b), `R:${pl.id}`, pl.axis);
    dimLine(P3(b), P3(a), `R${planeNo(pl)}: ${fmt(Math.abs(d.ref.off))} ${'XYZ'[pl.axis]}`, cen, 26, { robj: d.ref, legRef: j }, { color: cols[pl.axis] });
  });
}
// Ausgeblendete Ebene: kleines Symbol samt Name am Ende der Maßlinie, damit klar bleibt, wozu das Maß gehört
function planeMark([x, y], key, k) {
  if (vis.refPlanes) return;
  const col = rgbCss(AX_RGB[k]);
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(x - 9, y + 4); ctx.lineTo(x - 3, y - 4); ctx.lineTo(x + 9, y - 4); ctx.lineTo(x + 3, y + 4); ctx.closePath(); ctx.stroke();
  ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; if (vis.labels) ctx.fillText(nodeName(key), x + 12, y);
  ctx.restore();
}
function editRef(d) {
  const r = d.robj, sign = r.off < 0 ? -1 : 1, { box, inp, place, close } = dimBox(d, Math.abs(r.off));
  const tools = document.createElement('div');
  tools.className = 'dimtools';
  tools.innerHTML = '<button data-r="zero">Auf 0</button><button data-r="drop">Bezug löschen</button>';
  box.append(tools); place();
  tools.addEventListener('pointerdown', e => e.preventDefault());
  let done = false;
  const finish = (ok, v = num(inp.value)) => {
    if (done) return; done = true;
    close();
    if (ok && Math.abs(v * sign - r.off) > 0.01) { commit(); r.off = v * sign; recompute(); }
    draw();
  };
  tools.addEventListener('click', e => {
    const a = e.target.closest('[data-r]')?.dataset.r;
    if (a === 'zero') finish(true, 0);
    else if (a === 'drop') {
      done = true; close();
      if (d.legRef != null) { commit(); delete proj().deltas[d.legRef].ref; recompute(); } else dropRef(d.key, d.k);
    }
  });
  inp.focus({ preventScroll: true }); inp.select();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => finish(true));
}

// ---------- Parallelrohre (Eingabe) ----------
// In 3D: Bündel um das Rohr drehen – Lage gilt ab Schenkel 1, jede Biegung folgt daraus (innen/außen oder nebeneinander)
const bundleGapOf = (p, i) => { const b = p.bundle[i], prev = p.bundle.slice(0, i).filter(o => o.side === b.side).at(-1); return b.dist - (prev ? prev.dist : 0); };
// Neues Rohr im gleichen Raster: Abstand wie beim ersten Parallelrohr
function nextBundleDist(p, side) {
  const f = prof(p), same = p.bundle.filter(b => b.side === side);
  const gap = same[0]?.dist ?? p.bundle[0]?.dist ?? Math.max(20, Math.ceil(f.D * 4 / 5) * 5);
  return r1((same.at(-1)?.dist || 0) + gap);
}
// Ein Klick: weiteres Parallelrohr auf derselben Seite; es bleibt gewählt, der nächste Klick setzt das nächste
function addBundlePipe(p) {
  const side = p.bundle[bundleSel]?.side ?? p.bundle.at(-1)?.side ?? 0;
  commit();
  p.bundle.push({ id: uid(), side, dist: nextBundleDist(p, side) });
  bundleSel = p.bundle.length - 1; sel = -1; selCorner = -1; clearSel();
  $('#legPanel').hidden = $('#offLegView').hidden = true;
  recompute(); renderBundleBar();
}
// Parallelrohre werden eigene Rohre der Szene: Lage bleibt, die Kopplung ans Hauptrohr fällt weg. Rückgängig nimmt sie wieder zurück
function bundleToPipes(p, idx) {
  const L = buildLayout(p), snap = snapshot(), used = new Set(scenePipes(p).map(q => q.name));
  const done = {}, tail = o => o.includes(':') ? [+o.split(':')[0] - 1, o.split(':')[1]] : [-1, o];
  const made = idx.map(i => {
    const verts = L.bundle[i].verts, q = newProject(p.profileId, '');
    for (let n = 2; !q.name; n++) if (!used.has(`Rohr ${n}`)) { q.name = `Rohr ${n}`; used.add(q.name); }
    const legs = verts.slice(1).map((v, k) => V.sub(v, verts[k])).filter(d => V.len(d) > 0.01);
    q.origin = [...verts[0]]; q.color = p.color; q.zugA = p.zugA; q.zugE = p.zugE; q.endFixed = p.endFixed; q.startFixed = p.startFixed; q.roomId = p.roomId;
    const same = legs.length === p.deltas.length; // mit Lagewechsel hat das Rohr andere Schenkel
    q.deltas = legs.map(([x, y, z], k) => ({ x, y, z, ...(same && p.deltas[k].lock ? { lock: true } : {}), ...(same && p.deltas[k].flex ? { flex: true } : {}) }));
    q.done = {}; q.sceneId = p.sceneId;
    return [i, q];
  });
  // Fortschritt beim Biegen wandert mit, die übrigen Parallelrohre rücken in der Nummerierung nach
  const rest = p.bundle.map((b, i) => i).filter(i => !idx.includes(i));
  Object.entries(p.done).forEach(([k, v]) => {
    const [i, j] = tail(k), q = made.find(m => m[0] === i)?.[1];
    if (q) q.done[j] = v; else done[i < 0 ? j : `${rest.indexOf(i) + 1}:${j}`] = v;
  });
  commit(null, snap);
  db.projects.push(...made.map(m => m[1]));
  p.bundle = rest.map(i => p.bundle[i]); p.done = done;
  if (!p.bundle.length) p.bundleTx = [];
  bundleSel = -1; recompute(); renderBundleBar();
  toast(made.length > 1 ? `${made.length} eigene Rohre angelegt.` : `${made[0][1].name} ist jetzt ein eigenes Rohr.`);
}
// Drehkugel: Ringe um die drei Achsen, je Ring zwei Richtungen, die ihn aufspannen, und seine Achse
const SPIN_AX = [[[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
const ballShade = (x, y) => { ctx.save(); ctx.fillStyle = css('--accent'); ctx.globalAlpha = 0.06; ctx.beginPath(); ctx.arc(x, y, 60, 0, 7); ctx.fill(); ctx.restore(); };
// Ring der Kugel: vorne kräftig, hinten blass; von der Kante gesehen nicht bedienbar → null
function ballRing(A, u, v, r, color, full = true) {
  const pts = [], z0 = project(A).z;
  for (let t = 0; t <= 360; t += 6) { const c = V.add(A, V.add(V.mul(u, r * Math.cos(t * Math.PI / 180)), V.mul(v, r * Math.sin(t * Math.PI / 180)))); pts.push([...view.P3(c), project(c).z]); }
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  if (Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 14) return null;
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = 3;
  for (let k = 1; k < pts.length; k++) {
    ctx.globalAlpha = (pts[k][2] + pts[k - 1][2]) / 2 < z0 ? 0.95 : full ? 0.28 : 0.95;
    ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
  }
  ctx.restore();
  return pts.map(q => [q[0], q[1]]);
}
// Winkel, in dem das Rohr am Ende weitergeht
const extAngChips = () => [15, 30, 45, 60, 75, 90].map(a => `<button data-exa="${a}"${a === (vis.extAng || 90) ? ' class="on"' : ''}>${a}°</button>`).join('');
// Leiste in 3D: gewähltes Parallelrohr oder Lage des Bündels nach dem gewählten Eckpunkt
function renderBundleBar() {
  const p = proj(), bar = $('#bundleBar');
  if (bundleSel >= p.bundle.length) bundleSel = -1;
  renderBrowser();
  $('#measBtn').classList.toggle('on', !!measure);
  if (create) { renderCreateBar(bar); return; }
  if (measure) { renderMeasureBar(bar); return; }
  if (p.stub) { bar.hidden = false; bar.innerHTML = `<span>${esc(p.name)}: Richtung und Länge ziehen</span><button data-bb="stubdrop">Abbrechen</button>`; return; }
  $('#offLegView').classList.toggle('on', !!ofs);
  if (ofs) {
    const f = ofsFrame(), names = Math.abs(f.u[2]) > 0.999 ? ['X-Richtung', 'Y-Richtung'] : ['Waagerecht', 'Senkrecht'];
    ofs.cur = f.cur; bar.hidden = false;
    bar.innerHTML = `<span>Versatz</span>${[15, 30, 45, 60, 75, 90].map(a => `<button data-ofa="${a}"${a === ofs.ang ? ' class="on"' : ''}>${a}°</button>`).join('')}${names.map((t, k) => `<button data-ofn="${k}"${k === f.cur ? ' class="on"' : ''}>${t}</button>`).join('')}<button data-bb="ofsx">Fertig</button>`;
    return;
  }
  if (renderSceneBar(bar)) return;
  if (extOpen && sel < 0 && bundleSel < 0 && selCorner < 1) { bar.hidden = false; bar.innerHTML = `<span>Abgang</span>${extAngChips()}`; return; }
  const nm = selCorner >= 1 && p.bundle.length ? txNames(selCorner - 1) : null, corner = selCorner >= 1 && bundleSel < 0;
  bar.hidden = bundleSel < 0 && !corner && sel < 0;
  if (bundleSel < 0 && !nm && sel >= 0) {
    const eta = etageAt(p, sel);
    bar.innerHTML = `<span>${esc(p.name)}</span>${eta ? [15, 30, 45, 60, 75, 90].map(a => `<button data-ofa="${a}"${Math.abs(a - eta.ang) < 0.5 ? ' class="on"' : ''}>${a}°</button>`).join('') : ''}${p.bundle.length ? '<button data-bb="paradd">+ Parallelrohr</button><button data-bb="ownall">Alle als eigene Rohre</button>' : ''}${sel > 0 && sel < p.deltas.length - 1 ? scene(p).planes.filter(pl => Math.abs(deltaVec(p.deltas[sel])[pl.axis]) < 0.5).map(pl => `<button data-la="${pl.id}">An R${planeNo(pl)}</button>`).join('') : ''}${sel === p.deltas.length - 1 && p.deltas.length > 1 ? '<button data-bb="legdel" class="danger">Schenkel löschen</button>' : ''}`;
    return;
  }
  const modes = `<button data-cmode="0"${vis.cornerMove ? '' : ' class="on"'}>Drehen</button><button data-cmode="1"${vis.cornerMove ? ' class="on"' : ''}>Verschieben</button>`;
  if (corner && !nm) bar.innerHTML = `<span>Eckpunkt</span>${modes}`;
  else if (bundleSel >= 0) bar.innerHTML = `<span>Rohr ${bundleSel + 2} · ${fmt(bundleGapOf(p, bundleSel))} mm zum Nachbarn</span><button data-bb="paradd">+ Parallelrohr</button><button data-bb="own">Als eigenes Rohr</button>${p.bundle.length > 1 ? '<button data-bb="ownall">Alle als eigene Rohre</button>' : ''}<button data-bb="guide">In Anleitung zeigen</button><button data-bb="del" class="danger">Löschen</button>`;
  else if (nm) {
    const cur = p.bundleTx.find(t => t.bend === selCorner - 1)?.rot ?? 0;
    bar.innerHTML = `<span>Eckpunkt</span>${modes}<i class="bsep"></i><span>Bündel danach:</span>${[[0, nm[0]], [1, nm[1]], [-1, nm[-1]]].map(([r, t]) => `<button data-tx="${r}"${r === cur ? ' class="on"' : ''}>${t}</button>`).join('')}`;
  }
}
// Lagewechsel an Biegung bend setzen (0 = wie bisher)
function setTx(bend, r) {
  const p = proj(), t = p.bundleTx.find(o => o.bend === bend);
  commit();
  if (!r) p.bundleTx = p.bundleTx.filter(o => o !== t);
  else if (t) t.rot = r;
  else addTx(p, bend, r);
  recompute();
}
// ---------- Befehl „Rohr anlegen“: Bezugspunkt, Versatz, dann Richtung und Länge am Gimbal ----------
$('#addPipe').addEventListener('click', () => {
  startCmd();
  create = { step: 'ref', ref: null, off: [0, 0, 0], hover: null };
  renderBundleBar(); draw();
});
function startCmd() {
  dropStub();
  create = measure = null;
  if (camTool !== 'edit') setTool('edit');
  ofs = null; pick = null;
  selectLeg(-1);
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (inCmd()) { create = measure = null; renderBundleBar(); draw(); } else dropStub();
});
const createPos = () => V.add(create.ref.pos, create.off);
// Mögliche Bezüge. to = Punkt, an dem der neue Anfang hängen bleibt, axes = Achsen dieses Bezugs; Eckpunkte und Nullpunkt kennt das Maß-System nicht
// Beim Messen (all) zählen auch Parallelrohre und gesperrte Ebenen
function createCands(all = false) {
  const out = [], add = (id, pos, name, to = null, axes = []) => { if (!out.some(c => V.len(V.sub(c.pos, pos)) < 0.5)) out.push({ id, pos, name, to, axes }); };
  const pipes = scenePipes().filter(q => !q.hidden);
  pipes.forEach(q => ['S', 'E'].forEach(w => { const key = `${w}:${q.id}`; add(key, nodePos(key), nodeName(key), key, [0, 1, 2]); }));
  pipes.forEach(q => { if (!q.unrouted) points(q).slice(1, -1).forEach((v, i) => add(`C:${q.id}:${i}`, v, `Eckpunkt ${i + 1} von ${q.name}`)); });
  if (all) {
    const others = (layout.ghosts || []).filter(g => pipes.some(q => q.id === g.id));
    [...layout.bundle.filter(B => !B.def.hidden), ...others].forEach((L, j) => L.verts.forEach((v, i) => add(`B:${j}:${i}`, v, 'Parallelrohr')));
  }
  if (vis.refPlanes) scene().planes.filter(pl => !pl.hidden && (all || !pl.locked)).forEach(pl => {
    const c = planeCorners(pl), id = `R:${pl.id}`;
    out.push({ id, pos: c.reduce(V.add).map(v => v / c.length), name: nodeName(id), to: id, axes: [pl.axis], plane: pl });
  });
  add('O', [0, 0, 0], 'Nullpunkt');
  return out;
}
function hitCand(cands, x, y) {
  let best = null, bd = hitTol(18);
  for (const c of cands) { const [px, py] = view.P3(c.pos), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = c; } }
  if (best) return best;
  const pl = hitPlane(x, y);
  return pl ? cands.find(c => c.id === `R:${pl}`) || null : null;
}
function createPick(c) {
  create.ref = c; create.step = 'ofs'; create.hover = null;
  renderBundleBar(); draw();
}
function renderCreateBar(bar) {
  bar.hidden = false;
  const cancel = '<button data-co="cancel">Abbrechen</button>';
  if (create.step === 'ref') { bar.innerHTML = `<span>${esc(createCands().find(c => c.id === create.hover)?.name || 'Rohr anlegen: Bezugspunkt wählen')}</span>${cancel}`; return; }
  bar.innerHTML = `<span>Von ${esc(create.ref.name)}</span>${[0, 1, 2].map(k => `<button data-co="${k}" class="ax-${'xyz'[k]}-b">${'XYZ'[k]} ${fmt(create.off[k])}</button>`).join('')}${lastOff ? '<button data-co="last">Wie zuletzt</button>' : ''}<button data-co="ref">Anderer Bezug</button>${cancel}<button data-co="ok" class="on">OK</button>`;
}
function createOk() {
  const { ref, off } = create, p = proj(), T = createPos(), q = newProject(p.profileId, `Rohr ${scenePipes(p).length + 1}`);
  commit();
  create = null; lastOff = [...off];
  q.origin = T; q.zugA = p.zugA; q.zugE = p.zugE; q.color = null;
  q.deltas = [{ x: 1, y: 0, z: 0 }]; q.unrouted = true; q.stub = true; // Rohr ohne Länge: nur der Startpunkt zählt
  ref.axes.forEach(k => { pointRefs(q, 'S')[k] = { to: ref.to, off: r1(off[k]) }; });
  addPipe(q, p.sceneId); fullRender();
}
// Erster Schenkel: k = Achse, L = Länge mit Vorzeichen. Der Startpunkt allein ist noch kein Rohr
function setLeg0(p, k, L) {
  const d = { x: 0, y: 0, z: 0 };
  d['xyz'[k]] = L;
  p.deltas = [d]; p.stub = false; p.unrouted = false;
}
function setFirstLeg(p, k, t, px) {
  const min = gz.min.lastLeg, c = gz.S[k], E = fang(k, c + Math.round(t / 5) * 5, px, [gz.S], () => endOf(p));
  if (Math.abs(t) < min / 2) {
    p.deltas = [{ x: 1, y: 0, z: 0 }]; p.stub = true; p.unrouted = true;
    snapLine = null; gz.label = 'Loslassen = nichts ändern';
  } else {
    const L = E - c;
    setLeg0(p, k, Math.sign(L || t) * Math.max(min, Math.abs(L)));
    gz.label = `${fmt(V.len(deltaVec(p.deltas[0])))} mm`;
  }
  recompute(true);
}
// Klick daneben oder Abbrechen: Vom Startpunkt bleibt nichts zurück, auch nicht im Verlauf
function dropStub() {
  if (!proj().stub) return false;
  hist.redo = [];
  restoreSnapshot(hist.undo.pop());
  lastKey = null;
  fullRender();
  return true;
}
function drawCands(cands, hoverId, alpha, P3) {
  const cAcc = css('--accent');
  cands.forEach(c => {
    const [x, y] = P3(c.pos), on = hoverId === c.id;
    ctx.save(); ctx.globalAlpha = on ? 1 : alpha;
    if (c.id === 'O') { ctx.strokeStyle = cAcc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); }
    if (on || c.id !== 'O') knob(x, y, on ? 9 : 5, cAcc);
    ctx.restore();
  });
}
// Weg von A entlang der Achsen; Achsen ohne Versatz entfallen
const axisSegs = (A, d, order = [0, 1, 2]) => {
  let a = A;
  return order.flatMap(k => {
    if (!d[k]) return [];
    const e = [0, 0, 0]; e[k] = d[k];
    const b = V.add(a, e), seg = { k, v: d[k], a, b };
    a = b;
    return [seg];
  });
};
function drawSegs(segs, P3) {
  segs.forEach(({ k, a, b }) => { ctx.save(); ctx.strokeStyle = rgbCss(AX_RGB[k]); ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(...P3(a)); ctx.lineTo(...P3(b)); ctx.stroke(); ctx.restore(); });
}
// Maß je Achse am Weg. Zeigt eine Achse aus dem Bild, steht ihr Wert nur in der Leiste
function dimSegs(segs, P3) {
  if (!segs.length) return;
  const away = P3(V.mul(V.add(segs[0].a, segs.at(-1).b), 0.5));
  segs.forEach(({ k, v, a, b }) => {
    const pa = P3(a), pb = P3(b);
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 2) dimLine(pa, pb, `${'XYZ'[k]} ${fmt(v)}`, away, 26, null, { color: rgbCss(AX_RGB[k]) });
  });
}
function drawCreate(P3) {
  if (create.step === 'ref') { drawCands(createCands(), create.hover, 0.7, P3); return; }
  const { ref, off } = create, T = createPos();
  drawSegs(axisSegs(ref.pos, off), P3);
  ctx.beginPath(); ctx.arc(...P3(ref.pos), 6, 0, 7); ctx.strokeStyle = css('--mark'); ctx.lineWidth = 2; ctx.stroke();
  knob(...P3(T), 7, css('--accent'));
  axisArrows(T, [0, 1, 2], g => gizmo.push({ type: 'cofs', ...g }));
}
function drawStub() {
  const S = points(proj())[0];
  knob(...view.P3(S), 7, css('--accent'));
  axisArrows(S, [0, 1, 2], g => { if (!gz) gizmo.push({ type: 'first', ...g }); });
}
// ---------- Befehl „Messen“: nur orthogonal, ändert nichts und landet nicht im Verlauf ----------
const MEASURE_TURNS = [[0, 1, 2], [2, 0, 1], [1, 2, 0]];
$('#measBtn').addEventListener('click', () => {
  const on = !measure;
  startCmd();
  if (on) measure = { a: null, b: null, hover: null, turn: 0 };
  renderBundleBar(); draw();
});
const planesCross = (a, b) => a?.plane && b?.plane && a.plane.axis !== b.plane.axis;
function measurePick(c) {
  const m = measure, from = m.b || m.a;
  if (from?.id === c.id) return;
  if (planesCross(from, c)) { toast('Nur parallele Ebenen haben einen Abstand.'); return; }
  if (!m.a) m.a = c;
  else if (!m.b) m.b = c;
  else { m.a = m.b; m.b = c; } // weitermessen: Die Kette läuft vom letzten Punkt aus
  m.hover = null;
  renderBundleBar(); draw();
}
// Von a nach b. Bei einer Ebene zählt nur ihr senkrechter Abstand
function measureResult() {
  const { a } = measure, b = measure.b || createCands(true).find(c => c.id === measure.hover);
  if (!a || !b || a.id === b.id || planesCross(a, b)) return null;
  const k = (a.plane || b.plane)?.axis, S = [...a.pos], E = [...b.pos];
  if (b.plane) { E.splice(0, 3, ...a.pos); E[k] = b.plane.c; } else if (a.plane) { S.splice(0, 3, ...b.pos); S[k] = a.plane.c; }
  return { S, E, b, axes: k == null ? [0, 1, 2] : [k], d: V.sub(E, S).map(v => (Math.abs(v) < 0.05 ? 0 : v)) };
}
function renderMeasureBar(bar) {
  const { a, b, hover } = measure, m = measureResult(), end = '<button data-me="end">Beenden</button>';
  bar.hidden = false;
  if (!m) { bar.innerHTML = `<span>${esc(createCands(true).find(c => c.id === hover)?.name || (a ? `Von ${a.name}: Punkt 2 wählen` : 'Messen: Punkt 1 wählen'))}</span>${a ? '<button data-me="new">Neu</button>' : ''}${end}`; return; }
  const vals = m.axes.map(k => `<span class="ax-${'xyz'[k]}-b">${'XYZ'[k]} ${fmt(m.d[k])}</span>`).join('');
  bar.innerHTML = `<span>${esc(a.name)} → ${esc(m.b.name)}</span>${vals}${b ? `${m.d.filter(Boolean).length > 1 ? '<button data-me="turn">Weg drehen</button>' : ''}<button data-me="new">Neu</button>` : ''}${end}`;
}
function drawMeasure(P3) {
  const m = measureResult(), { a, b } = measure;
  drawCands(createCands(true), measure.hover, b ? 0.35 : 0.7, P3);
  if (!m) { if (a) { ctx.beginPath(); ctx.arc(...P3(a.pos), 8, 0, 7); ctx.strokeStyle = css('--mark'); ctx.lineWidth = 2.5; ctx.stroke(); } return; }
  drawSegs(axisSegs(m.S, m.d, MEASURE_TURNS[measure.turn]), P3);
  [m.S, m.E].forEach(q => { ctx.beginPath(); ctx.arc(...P3(q), 8, 0, 7); ctx.strokeStyle = css('--mark'); ctx.lineWidth = 2.5; ctx.stroke(); });
}
$('#bundleBar').addEventListener('click', e => {
  const b = e.target.closest('button'), p = proj();
  if (!b) return;
  if (b.dataset.tx != null) { setTx(selCorner - 1, +b.dataset.tx); return; }
  if (b.dataset.ofa) { if (ofs) { ofs.ang = +b.dataset.ofa; renderBundleBar(); draw(); } else setEtageAng(p, sel, +b.dataset.ofa); return; }
  if (b.dataset.cmode) { vis.cornerMove = b.dataset.cmode === '1'; saveVis(); renderBundleBar(); draw(); return; }
  if (b.dataset.exa) { vis.extAng = +b.dataset.exa; saveVis(); extOpen = true; renderBundleBar(); draw(); return; }
  if (b.dataset.ofn) { ofs.n = +b.dataset.ofn; renderBundleBar(); draw(); return; }
  if (b.dataset.bb === 'ofsx') { ofs = null; renderBundleBar(); draw(); return; }
  if (b.dataset.lock) { toggleLock(pipeById(b.dataset.pid), b.dataset.lock); return; }
  if (b.dataset.bb === 'legdel') { delLeg(); return; }
  if (b.dataset.bb === 'paradd') addBundlePipe(p);
  else if (b.dataset.bb === 'own') bundleToPipes(p, [bundleSel]);
  else if (b.dataset.bb === 'ownall') ask(`Alle ${p.bundle.length} Parallelrohre in eigene Rohre umwandeln?`, 'Umwandeln').then(ok => { if (ok) bundleToPipes(p, p.bundle.map((_, i) => i)); });
  else if (b.dataset.bb === 'del') { commit(); p.bundle.splice(bundleSel, 1); bundleSel = -1; recompute(); }
  else if (b.dataset.bb === 'guide') { guidePipe = bundleSel + 1; highlight = -1; $('[data-tab=guide]').click(); }
});
function renderBundle() {
  const p = proj(), f = prof(p), verts = layout.verts;
  const sideName = k => (verts.length > 1 ? dirName(sideDir(verts, k)) : '–');
  $('#bundleCard').innerHTML = `<h3>Parallelrohre</h3>
    <p class="hint" style="margin-top:0">Weitere Rohre im festen Abstand, gemessen von Rohrmitte <b>Rohr 1</b> bis Rohrmitte. Sie laufen bei jeder Änderung mit. Ein neues Rohr übernimmt den Abstand des ersten Parallelrohrs.</p>
    ${p.bundle.map((b, i) => {
      const prev = p.bundle.slice(0, i).filter(o => o.side === b.side).at(-1), gap = b.dist - (prev ? prev.dist : 0);
      return `<div class="bundlerow"><b>Rohr ${i + 2}</b>
      <label>Seite<select data-bs="${i}">${[0, 1, 2, 3].map(k => `<option value="${k}"${k === b.side ? ' selected' : ''}>${sideName(k)}</option>`).join('')}</select></label>
      <label>zu Rohr 1<span class="unit"><input data-bd="${i}" inputmode="decimal" value="${fin(b.dist)}"><span>mm</span></span><small data-bgap="${i}">zum Nachbarn ${fmt(gap)} mm</small></label>
      <button data-bdel="${i}" aria-label="Parallelrohr entfernen">✕</button></div>`;
    }).join('')}
    <button id="bAdd" class="wide" style="margin:6px 0 0">+ Parallelrohr</button>
    ${p.bundle.length && layout.bends.length ? txHtml(p) : ''}`;
}
// Lagewechsel: Bündel an einer Ecke kippen (z. B. übereinander → nebeneinander). Rohr 1 biegt normal; jedes Parallelrohr
// läuft über die Ecke hinaus, geht senkrecht auf seine neue Höhe und biegt dann weiter.
// Lage des Bündels nach Biegung j: Name für „wie bisher“ (0) und die beiden Kipprichtungen (±1)
function txNames(j) {
  const t = layout.bundle[0]?.turns?.[j], nm = v => dirName(V.norm(v));
  return t ? { 0: nm(t[0]), 1: nm(t[1]), [-1]: nm(t[-1]) } : null;
}
function txHtml(p) {
  const nb = layout.bends.length, opt = (v, cur, txt) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${txt}</option>`;
  return `<h4 class="txhead">Lagewechsel</h4>
    <p class="hint" style="margin-top:0">Bündel an einer Ecke kippen, z. B. von übereinander auf nebeneinander. Rohr 1 biegt normal, die anderen laufen über die Ecke hinaus, gehen dort senkrecht auf die neue Höhe und biegen weiter.</p>
    ${(p.bundleTx || []).map((t, i) => {
      const nm = txNames(t.bend) || { 1: '–', [-1]: '–', 0: '–' };
      return `<div class="txrow"><div class="txtop"><b>Lagewechsel ${i + 1}</b><button data-txdel="${i}" aria-label="Lagewechsel entfernen">✕</button></div>
        <label>an Biegung<select data-txb="${i}">${Array.from({ length: nb }, (_, k) => opt(k, t.bend, `${k + 1} (${fmt(layout.bends[k].angle)}°)`)).join('')}</select></label>
        <label>Lage danach<select data-txr="${i}">${opt(1, t.rot, nm[1])}${opt(-1, t.rot, nm[-1])}</select><small>bisher ${nm[0]}</small></label></div>`;
    }).join('')}
    <button id="txAdd" class="wide" style="margin:6px 0 0">+ Lagewechsel an einer Biegung</button>`;
}
// Lagewechsel an Biegung bend setzen; ohne Vorgabe die Seite nehmen, auf der sich keine Rohre berühren
function addTx(p, bend, rot = 0) {
  p.bundleTx = (p.bundleTx || []).filter(t => t.bend !== bend);
  const t = { bend, rot: rot || 1 };
  p.bundleTx.push(t);
  p.bundleTx.sort((a, b) => a.bend - b.bend);
  if (!rot) {
    const ok = () => buildLayout(p).bundle.every(B => !B.clash);
    if (!ok()) { t.rot = -1; if (!ok()) t.rot = 1; }
  }
}
$('#bundleCard').addEventListener('input', e => {
  const el = e.target, p = proj();
  if (el.dataset.bd != null) {
    const v = num(el.value); if (!(v > 0)) return;
    commit('bd' + el.dataset.bd); p.bundle[+el.dataset.bd].dist = v; recompute();
    // Abstand zum Nachbarn mitführen, ohne das Feld neu aufzubauen
    p.bundle.forEach((b, i) => { const prev = p.bundle.slice(0, i).filter(o => o.side === b.side).at(-1); const t = $(`[data-bgap="${i}"]`); if (t) t.textContent = `zum Nachbarn ${fmt(b.dist - (prev ? prev.dist : 0))} mm`; });
  }
});
$('#bundleCard').addEventListener('change', e => {
  const el = e.target, p = proj(), ds = el.dataset;
  if (ds.bs != null) { commit(); p.bundle[+ds.bs].side = +el.value; recompute(); return; }
  const i = +(ds.txb ?? ds.txr ?? NaN);
  if (Number.isNaN(i)) return;
  commit();
  if (ds.txb != null) { p.bundleTx.splice(i, 1); addTx(p, +el.value); }
  else p.bundleTx[i].rot = +el.value;
  recompute(); renderBundle();
});
$('#bundleCard').addEventListener('click', e => {
  const b = e.target.closest('button'), p = proj(), f = prof(p);
  if (!b) return;
  if (b.id === 'bAdd') {
    commit();
    const side = p.bundle.at(-1)?.side ?? 0;
    p.bundle.push({ id: uid(), side, dist: nextBundleDist(p, side) });
  } else if (b.dataset.bdel != null) { commit(); p.bundle.splice(+b.dataset.bdel, 1); }
  else if (b.id === 'txAdd') {
    const nb = layout.bends.length, used = new Set((p.bundleTx || []).map(t => t.bend));
    const bend = [...Array(nb).keys()].find(k => !used.has(k));
    if (bend == null) return;
    commit(); addTx(p, bend);
  } else if (b.dataset.txdel != null) { commit(); p.bundleTx.splice(+b.dataset.txdel, 1); }
  else return;
  refit();
  recompute(); renderBundle();
});

// Testzugang nur mit ?debug in der Adresse
if (new URLSearchParams(location.search).has('debug')) {
  window.biegeDebug = { editDim, get gizmo() { return gizmo; }, get view() { return view; }, get layout() { return layout; }, get dimHits() { return dimHits; }, get animLayout() { return animLayout; }, get roomDraw() { return roomDraw; }, proj, points, resetView };
}

// ---------- Browser: Objektbaum wie in Fusion ----------
// Rohre, ihre Punkte und Schenkel, Parallelrohre und Ebenen; antippen wählt aus, das Auge blendet aus (gebogen wird trotzdem alles)
const treeOpen = new Map(); // aufgeklappt, sonst gilt: aktuelles Rohr und die Ordner offen
let treeMenu = null, treeEdit = null, treeCol = null; // Zeile mit offenem ⋮-Menü, Zeile im Umbenennen, Rohr mit offener Farbwahl
const svgIcon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const EYE_ON = svgIcon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF = svgIcon('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2"/><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5"/>');
const pipeCss = c => (c == null ? 'var(--tube)' : rgbCss(PIPE_COLORS[c]));
function renderBrowser() {
  const box = $('#browser');
  if (box.hidden || treeEdit) return;
  const p = proj(), sc = scene(p), pipes = scenePipes(p), scroll = box.scrollTop;
  const open = (k, d) => treeOpen.get(k) ?? d;
  const row = (lv, o) => `<div class="trow${o.on ? ' on' : ''}${o.off ? ' off' : ''}" style="padding-left:${lv * 14 + 2}px">${o.tg ? `<button class="tchev" data-tg="${o.tg}" data-open="${o.open ? 1 : 0}" aria-label="Auf- oder zuklappen">${o.open ? '▾' : '▸'}</button>` : '<span class="tchev"></span>'}${o.eye ? `<button class="teye" data-eye="${o.eye}" aria-label="Ein- oder ausblenden">${o.off ? EYE_OFF : EYE_ON}</button>` : ''}${o.lock ? `<button class="teye tlock${o.lock.on ? ' on' : ''}" data-pl="${o.lock.id}" aria-label="${o.lock.on ? 'Entsperren' : 'Sperren'}" aria-pressed="${o.lock.on}">${lockIcon(o.lock.on)}</button>` : ''}${o.dot ? `<button class="tdot" data-tc="${o.dot.id}" aria-label="Rohrfarbe" aria-expanded="${treeCol === o.dot.id}"><i style="background:${o.dot.css}"></i></button>` : ''}<button class="tname" ${o.go ? `data-go="${o.go}"` : `data-tg="${o.tg}" data-open="${o.open ? 1 : 0}"`}><span>${esc(o.t)}</span>${o.m ? `<small>${o.m}</small>` : ''}</button>${o.acts ? `<button class="tmore" data-tm="${o.acts.k}" aria-label="Aktionen">⋮</button>` : ''}</div>${o.acts && treeMenu === o.acts.k ? `<div class="tacts" style="padding-left:${lv * 14 + 26}px">${o.acts.b.map(([a, t, cls]) => `<button data-ta="${a}" data-k="${o.acts.k}"${cls ? ` class="${cls}"` : ''}>${t}</button>`).join('')}</div>` : ''}`;
  const pipeRows = q => {
    const me = q === p, k = `p:${q.id}`, o = open(k, me), Bs = q.bundle || [];
    let h = row(1, { tg: k, open: o, eye: k, off: q.hidden, go: k, t: q.name, on: me && sel < 0 && selCorner < 1 && bundleSel < 0 && !selPoint && !selPlane, dot: { id: q.id, css: pipeCss(q.color) }, acts: { k, b: [['ren', 'Umbenennen'], ...(pipes.length > 1 ? [['del', 'Löschen', 'danger']] : [])] } });
    if (treeCol === q.id) h += `<div class="tcols">${[null, 0, 1, 2, 3, 4, 5, 6, 7].map(c => `<button class="swatch${q.color === c ? ' on' : ''}" data-col="${c}" data-pid="${q.id}" aria-label="${c == null ? 'Standardfarbe' : COLOR_NAMES[c]}" aria-pressed="${q.color === c}" style="background:${pipeCss(c)}"></button>`).join('')}</div>`;
    if (!o) return h;
    for (const [w, t] of q.stub ? [['S', 'Anfang']] : [['S', 'Anfang'], ['E', 'Ende']]) h += row(2, { go: `pt:${q.id}:${w}`, t, on: selPoint?.pid === q.id && selPoint.w === w });
    if (!q.unrouted) q.deltas.forEach((d, i) => { h += row(2, { go: `leg:${q.id}:${i}`, t: `Schenkel ${i + 1}`, m: `${fmt(V.len(deltaVec(d)))} mm`, on: me && sel === i }); });
    Bs.forEach((b, i) => { h += row(2, { eye: `b:${q.id}:${i}`, off: b.hidden, go: `b:${q.id}:${i}`, t: `Parallel ${i + 1}`, m: `${fmt(b.dist)} mm`, on: me && bundleSel === i, acts: { k: `b:${q.id}:${i}`, b: [['own', 'Als eigenes Rohr'], ['del', 'Löschen', 'danger']] } }); });
    return h;
  };
  const planes = sc.planes.map((pl, i) => row(1, { eye: `pl:${pl.id}`, off: pl.hidden, lock: { id: pl.id, on: !!pl.locked }, go: `pl:${pl.id}`, t: `R${i + 1}`, m: `${'XYZ'[pl.axis]}-Ebene`, on: selPlane === pl.id, acts: { k: `pl:${pl.id}`, b: [['del', 'Löschen', 'danger']] } })).join('');
  box.innerHTML = `<div class="thead"><b>${esc(sc.name)}</b><button class="tmore" data-tm="scene" aria-label="Aktionen">⋮</button><button id="brClose" aria-label="Browser schließen">✕</button></div>
    ${treeMenu === 'scene' ? `<div class="tacts"><button data-ta="ren" data-k="scene">Umbenennen</button><button data-ta="dup" data-k="scene">Duplizieren</button><button data-ta="del" data-k="scene" class="danger">Löschen</button></div>` : ''}
    ${row(0, { tg: 'pipes', open: open('pipes', true), t: 'Rohre', m: pipes.length })}${open('pipes', true) ? pipes.map(pipeRows).join('') : ''}
    ${row(0, { tg: 'planes', open: open('planes', true), t: 'Ebenen', m: sc.planes.length })}${open('planes', true) ? planes : ''}`;
  box.scrollTop = scroll;
}
// Löschen und Umbenennen, auch aus dem Baum
async function delPipe(q) {
  if (!await ask(`„${q.name}“ löschen?`)) return;
  commit();
  const others = scenePipes(q).filter(o => o !== q), dead = r => r?.to?.endsWith(`:${q.id}`) && r.to[0] !== 'R';
  others.forEach(o => ['S', 'E'].forEach(w => o.refs?.[w]?.forEach((r, k) => { if (dead(r)) o.refs[w][k] = null; })));
  scene(q).planes.forEach(pl => { if (dead(pl.ref)) pl.ref = null; });
  db.projects = db.projects.filter(o => o !== q);
  if (db.currentId === q.id) db.currentId = others[0].id;
  fullRender();
}
function delPlane(id) {
  const p = proj(), sc = scene(p);
  commit();
  sc.planes = sc.planes.filter(x => x.id !== id);
  sc.planes.forEach(x => { if (x.ref?.to === `R:${id}`) x.ref = null; });
  scenePipes(p).forEach(q => { ['S', 'E'].forEach(w => q.refs?.[w]?.forEach((r, k) => { if (r?.to === `R:${id}`) q.refs[w][k] = null; })); q.deltas.forEach(d => { if (d.ref?.plane === id) delete d.ref; }); });
  if (selPlane === id) selPlane = null;
  recompute(); renderBundleBar();
}
function delBundle(q, i) {
  commit();
  q.bundle.splice(i, 1);
  if (!q.bundle.length) q.bundleTx = [];
  bundleSel = -1; recompute(); renderBundleBar();
}
function togglePlaneLock(id) {
  commit();
  const pl = planeById(id);
  pl.locked = !pl.locked;
  if (pl.locked && selPlane === id) selectLeg(-1);
  recompute(); renderBrowser();
}
function setBrowser(on) {
  vis.tree = on; saveVis();
  $('#browser').hidden = !on; $('#treeBtn').classList.toggle('on', on);
  renderBrowser();
}
function goPipe(id) {
  const q = pipeById(id);
  q.hidden = false;
  if (db.currentId !== id) { db.currentId = id; highlight = -1; fullRender(); }
}
// Name direkt in der Zeile ändern; Enter oder Tippen daneben übernimmt, Esc bricht ab
function treeRename(k) {
  const q = k === 'scene' ? scene() : pipeById(k.slice(2)), box = $('#browser'), inp = document.createElement('input'), slot = k === 'scene' ? box.querySelector('.thead b') : box.querySelector(`[data-go="${k}"]`);
  treeMenu = null; treeEdit = k;
  inp.className = 'tedit'; inp.value = q.name; inp.enterKeyHint = 'done'; inp.setAttribute('autocomplete', 'off');
  slot.replaceWith(inp);
  inp.focus(); inp.select();
  let keep = true;
  const finish = () => {
    if (treeEdit !== k) return;
    treeEdit = null;
    const t = inp.value.trim();
    if (keep && t && t !== q.name) { commit(); q.name = t; save(); renderProjectBar(); renderBundleBar(); if ($('#sName')) $('#sName').value = scene().name; }
    renderBrowser();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(); else if (e.key === 'Escape') { keep = false; finish(); } e.stopPropagation(); });
  inp.addEventListener('blur', finish);
}
function treeAct(a, k) {
  const [t, id, i] = k.split(':');
  treeMenu = a === 'ren' ? treeMenu : null;
  if (a === 'ren') { renderBrowser(); treeRename(k); }
  else if (k === 'scene') { if (a === 'dup') dupScene(); else delScene().then(renderBrowser); }
  else if (t === 'pl') delPlane(id);
  else if (t === 'p') delPipe(pipeById(id));
  else if (a === 'del') delBundle(pipeById(id), +i);
  else { goPipe(id); bundleToPipes(proj(), [+i]); }
}
function browserGo(k) {
  const [t, a, b] = k.split(':');
  if (create) { const c = t === 'pt' && create.step === 'ref' && createCands().find(x => x.id === `${b}:${a}`); if (c) createPick(c); return; }
  if (measure) { const c = createCands(true).find(x => x.id === (t === 'pl' ? `R:${a}` : `${b}:${a}`)); if (c) measurePick(c); return; }
  if (dropStub()) return;
  if (t === 'pl') {
    if (!vis.refPlanes) { vis.refPlanes = true; saveVis(); const c = $('[data-vis=refPlanes]'); if (c) c.checked = true; }
    planeById(a).hidden = false; selectPlane(a);
  } else {
    goPipe(a);
    if (t === 'leg') selectLeg(+b);
    else if (t === 'pt') selectPoint(a, b);
    else if (t === 'b') { proj().bundle[+b].hidden = false; selectBundle(+b); recompute(); }
    else selectLeg(-1);
  }
  renderBrowser();
}
function toggleHidden(k) {
  commit();
  const [t, a, b] = k.split(':');
  if (t === 'pl') { const pl = planeById(a); pl.hidden = !pl.hidden; if (selPlane === a) selectLeg(-1); }
  else if (t === 'b') { const q = pipeById(a), e = q.bundle[+b]; e.hidden = !e.hidden; if (q === proj() && bundleSel === +b) selectLeg(-1); }
  else {
    const q = pipeById(a), other = scenePipes(q).find(o => o !== q && !o.hidden);
    if (q.hidden) q.hidden = false;
    else if (q !== proj()) q.hidden = true;
    else if (!other) { toast('Das letzte sichtbare Rohr bleibt sichtbar.'); return; }
    else { q.hidden = true; db.currentId = other.id; fullRender(); }
  }
  recompute(); renderBrowser();
}
$('#treeBtn').addEventListener('click', () => setBrowser(!vis.tree));
$('#browser').addEventListener('click', e => {
  const b = e.target.closest('button'), ds = b?.dataset;
  if (!b) return;
  if (b.id === 'brClose') setBrowser(false);
  else if (ds.pl) togglePlaneLock(ds.pl);
  else if (ds.tc) { treeCol = treeCol === ds.tc ? null : ds.tc; renderBrowser(); }
  else if (ds.col) { commit(); pipeById(ds.pid).color = ds.col === 'null' ? null : +ds.col; treeCol = null; recompute(); renderBrowser(); }
  else if (ds.tm) { treeMenu = treeMenu === ds.tm ? null : ds.tm; renderBrowser(); }
  else if (ds.ta) treeAct(ds.ta, ds.k);
  else if (ds.eye) toggleHidden(ds.eye);
  else if (ds.go) { browserGo(ds.go); if (innerWidth < 600) setBrowser(false); } // auf dem Handy gibt der Baum die Sicht wieder frei
  else if (ds.tg) { treeOpen.set(ds.tg, ds.open !== '1'); renderBrowser(); }
});

// ---------- Quicktipps: nur mit Maus oder Trackpad, Text aus title oder der Bezeichnung des Symbols ----------
const TIP_DELAY = 500, TIP_GRACE = 300;
const tip = { el: null, timer: 0, until: 0 }, tipBox = $('#tip');
function tipText(b) {
  if (b.title) { b.dataset.tip = b.title; b.removeAttribute('title'); } // sonst käme der Browser-Tooltip dazu
  return b.dataset.tip || (/\p{L}{3}/u.test(b.textContent) ? '' : b.getAttribute('aria-label') || '');
}
function showTip(b, t) {
  if (!b.isConnected) return;
  const m = t.match(/^(.*) \((.*[⌘⇧].*)\)$/);
  tipBox.innerHTML = m ? `${esc(m[1])}<kbd>${esc(m[2])}</kbd>` : esc(t);
  tipBox.hidden = false;
  const r = b.getBoundingClientRect(), w = tipBox.offsetWidth, h = tipBox.offsetHeight;
  const top = r.bottom + 6 + h > innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
  tipBox.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tipBox.style.top = `${Math.max(8, top)}px`;
}
function hideTip() {
  clearTimeout(tip.timer);
  if (!tipBox.hidden) tip.until = Date.now() + TIP_GRACE; // Nachbarsymbole zeigen ihren Tipp dann sofort
  tipBox.hidden = true;
}
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest?.('button, [title], [data-tip]') || null;
  if (b === tip.el) return;
  hideTip();
  tip.el = b;
  const t = b && tipText(b);
  if (t) tip.timer = setTimeout(showTip, Date.now() < tip.until ? 0 : TIP_DELAY, b, t);
});
document.addEventListener('pointerout', e => { if (!e.relatedTarget) { hideTip(); tip.el = null; } });
['pointerdown', 'wheel', 'keydown'].forEach(n => document.addEventListener(n, hideTip, { capture: true, passive: true }));

function fullRender() { create = measure = null; spotMemo.clear(); extOpen = false; startOpen = false; bundleSel = -1; pick = null; clearSel(); adjusted = { set: new Set(), t: 0 }; sel = -1; selCorner = -1; guidePipe = 0; previewLeg = -1; freeLegs.clear(); oblPref.clear(); lastKey = null; updateUndoButtons(); $('#legPanel').hidden = $('#offLegView').hidden = true; renderProjectBar(); renderInputs(); recompute(); }
fullRender();
resetView('iso');
setBrowser(!!vis.tree);
checkUpdate();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache: 'none' – auch version.js (per importScripts) immer frisch prüfen
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
