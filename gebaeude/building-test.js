// Selbsttest Gebäude (nur im Testmodus ?debug): biegeDebug.bau.selfTest()
// Läuft in einem eigenen Test-Gebäude im Speicher; das geöffnete Gebäude, Rückgängig und die Datenbank bleiben unberührt.
// api kommt aus building.js (Funktionen aus der Hülle), Rückgabe wie beim Rohr-Selbsttest: Liste { Fall, ok, Info }.
import { SCHEMA, migrate } from './building-schema.js';
import { LISTS, listTable, listView, csvOf, xlsxSheet } from './building-lists.js';
import { makeXlsx, unzipCheck } from './building-xlsx.js';
import { planPdf } from './building-pdf.js';
import { clipBy, area2, sub, dot } from './building-math.js';
import { buildPart, evalExpr, prim, meshFromGlb, packMesh } from './building-parts.js';
import { extractVectors, buildGrid, nearSegs } from './building-pdfvec.js';
export async function runBuildingTests(api) {
  const { B, cur, num, parseSpacing, detectRoom, wallOutline, wallPieces, opDims, gridGroups, gridFams, gridFollowers, applyFollow, setGap, ifcText, colPoly, zOf, editType, relinkAll, newTypeFrom, applyType, syncSigs, updateRooms, describeStep, roomSeed, ulAlign, transformSel, rotF, mirF, moveEl, saveView, gotoView, setView, cam, leavesOf, doorPlates, twoLeaves, fixLeaves } = api;
  const R = [];
  const t = (Fall, fn) => { try { const r = fn(); R.push({ Fall, ok: r === true || r?.ok ? 'ok' : 'FEHLER', Info: r === true ? '' : r?.info ?? String(r) }); } catch (e) { R.push({ Fall, ok: 'FEHLER', Info: `Ausnahme: ${e.message || e}` }); } };
  const wall = (a, b, th = 240, extra = {}) => { const w = { id: `tw${B.els.length}`, storey: cur(), type: 'wall', a, b, t: th, just: 'c', kind: 'iwt', h: null, ...extra }; B.els.push(w); return w; };
  const col = (p, w = 300, extra = {}) => { const c = { id: `tc${B.els.length}`, storey: cur(), type: 'column', p, shape: 'rect', w, d: w, rot: 0, h: null, ...extra }; B.els.push(c); return c; };
  const grid = (name, a, b) => { const g = { id: `tg${B.grids.length}`, name, a, b }; B.grids.push(g); return g; };
  const near = (x, y, e = 0.5) => Math.abs(x - y) <= e;

  // 1. Zahlen-Leser (deutsches Format)
  t('Zahlen lesen: 20 Eingaben', () => {
    const tab = [['1.260', 1260], ['1260', 1260], ['1 260', 1260], ['1.260,5', 1260.5], ['1260,5', 1260.5], ['1,26 m', 1260], ['126 cm', 1260], ['2*1260+115', 2635], ['6000/3', 2000], ['0.5', 0.5], ['12.5', 12.5], ['0,25', 0.25], ['1.260.000', 1260000], ['abc', NaN], ['', NaN], ['1.2.3x', NaN], ['-300', -300], ['(1000+260)/2', 630], ['10.5 cm', 105], ['3x500', 1500]];
    const bad = tab.filter(([s, w]) => { const v = num(s); return Number.isNaN(w) ? !Number.isNaN(v) : Math.abs(v - w) > 1e-9; }).map(([s]) => s);
    return { ok: !bad.length, info: bad.length ? `falsch: ${bad.join(' | ')}` : '' };
  });
  t('Achsabstände lesen: „3x6000 7.500“', () => { const L = parseSpacing('3x6000 7.500'); return { ok: L.join() === '6000,6000,6000,7500', info: L.join() }; });

  // 2. Räume
  const base = [wall([0, 0], [6000, 0]), wall([6000, 0], [6000, 4000]), wall([6000, 4000], [0, 4000]), wall([0, 4000], [0, 0])];
  t('Raum aus vier Wänden: Fläche 5,76 × 3,76 m', () => {
    const r = detectRoom([3000, 2000]); if (r.err) return r.err;
    let a = 0; r.pts.forEach((p, i) => { const q = r.pts[(i + 1) % r.pts.length]; a += p[0] * q[1] - q[0] * p[1]; });
    return { ok: near(Math.abs(a) / 2, 5760 * 3760, 5760 * 3760 * 0.01), info: `${(Math.abs(a) / 2e6).toFixed(3)} m²` };
  });
  base.forEach(w => B.els.splice(B.els.indexOf(w), 1));

  // 3. Wandecke mit Stütze: keine Kanten in der Stütze
  const w1 = wall([0, 0], [6000, 0]), w2 = wall([6000, 0], [6000, 4000]);
  const c1 = col([6000, 0]);
  t('Wandecke mit Stütze: keine Wandlinie in der Stütze', () => {
    const [z0, z1] = zOf(w1), lines = [], K = colPoly(c1);
    [w1, w2].forEach(w => wallOutline(w, z0, z1, lines));
    let n = 0; for (let i = 0; i < lines.length; i += 2) { const a = lines[i], b = lines[i + 1], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; for (const p of [a, b, m]) if (p[0] > K[0][0] + 1 && p[0] < K[2][0] - 1 && p[1] > K[0][1] + 1 && p[1] < K[2][1] - 1) { n++; break; } }
    return { ok: n === 0 && lines.length > 0, info: `${n} von ${lines.length / 2} Linien in der Stütze` };
  });
  t('Stütze in der Wand: Wandkörper ausgespart', () => {
    const w = wall([0, 10000], [6000, 10000]), vor = wallPieces(w).length;
    col([3000, 10000]);
    const pcs = wallPieces(w), frei = pcs.every(p => { const xs = p.poly.map(q => q[0]), a = Math.min(...xs), b = Math.max(...xs); return b <= 2851 || a >= 3149; });
    return { ok: vor === 1 && pcs.length === 2 && frei, info: `${vor} → ${pcs.length} Stücke` };
  });

  // 4. Räume mit Stützen: Wände enden an den Stützenflächen
  B.els.length = 0;
  [[0, 0], [6000, 0], [6000, 4000], [0, 4000]].forEach(p => col(p));
  wall([150, 0], [5850, 0]); wall([6000, 150], [6000, 3850]); wall([5850, 4000], [150, 4000]); wall([0, 3850], [0, 150]);
  t('Raum zwischen vier Stützen und Wänden erkannt', () => { const r = detectRoom([3000, 2000]); return r.err ? r.err : { ok: r.pts.length >= 4, info: `${r.pts.length} Ecken` }; });

  // 5. Achsen: Gruppen, Bindung
  B.els.length = 0; B.grids.length = 0;
  ['D', 'E'].forEach((n, i) => grid(n, [-5000, 20000 + i * 4000], [12000, 20000 + i * 4000]));
  ['Da', 'Ea'].forEach((n, i) => grid(n, [22000, 21000 + i * 4000], [40000, 21000 + i * 4000]));
  t('Achsgruppen: links und rechts getrennt', () => { const f = gridFams().find(x => !x.vert), G = gridGroups(f); return { ok: G.length === 2, info: `${G.length} Gruppen` }; });
  B.grids.length = 0;
  const gx = [0, 1, 2].map(i => grid(String(i + 1), [i * 6000, -1000], [i * 6000, 9000]));
  const gy = grid('A', [-1000, 0], [20000, 0]);
  const cc = col([6000, 0]), cf = col([12000, 0], 300, { noGrid: true }), ww = wall([6000, 0], [12000, 0]);
  t('Achse verschieben: Stütze und Wand folgen, gelöste Stütze nicht', () => {
    const f = gridGroups(gridFams().find(x => x.vert))[0];
    setGap(f, 0, 6500); // Abstand 1–2 auf 6500: Achse 2 und 3 wandern +500
    return { ok: near(cc.p[0], 6500) && near(ww.a[0], 6500) && near(ww.b[0], 12500) && near(cf.p[0], 12000), info: `Stütze ${cc.p[0]}, Wand ${ww.a[0]}–${ww.b[0]}, gelöste Stütze ${cf.p[0]}` };
  });

  // 6. Öffnungen: Maße ergeben die Wandlänge
  B.els.length = 0; B.grids.length = 0;
  const wo = wall([0, 0], [6000, 0]);
  const win = { id: 'twin', storey: cur(), type: 'window', host: wo.id, at: 2500, w: 1260, h: 1385, sill: 900 };
  B.els.push(win);
  t('Fenstermaße: links + Breite + rechts = Wandlänge', () => {
    const d = opDims(win), l = d.find(m => m.kind === 'l')?.val, r = d.find(m => m.kind === 'r')?.val, w = d.find(m => m.kind === 'w')?.val;
    return { ok: near(l + w + r, 6000, 1) && w === 1260, info: `${Math.round(l)} + ${w} + ${Math.round(r)} = ${Math.round(l + w + r)}` };
  });

  // 7. Bauteiltypen
  B.els.length = 0; B.grids.length = 0;
  t('Typen: Vorgabetypen vorhanden', () => { const n = Object.values(B.types), c = k => n.filter(x => x.cat === k).length; return { ok: c('wall') === 6 && c('slab') === 5 && c('column') === 7 && c('window') >= 7 && c('door') === 6, info: `${n.length} Typen (Wand ${c('wall')}, Decke ${c('slab')}, Stütze ${c('column')}, Fenster ${c('window')}, Tür ${c('door')})` }; });
  const tw1 = wall([0, 0], [6000, 0], 365, { kind: 'aw', typeId: 'tw-aw365' }), tw2 = wall([0, 4000], [6000, 4000], 365, { kind: 'aw', typeId: 'tw-aw365' });
  t('Wandtyp ändern: alle Exemplare folgen (Schicht +10 mm)', () => { editType('tw-aw365', ty => { ty.layers.push({ m: 'Putz', t: 10 }); }); return { ok: tw1.t === 375 && tw2.t === 375 && tw1.typeId === 'tw-aw365', info: `${tw1.t} / ${tw2.t}` }; });
  t('Eigene Dicke löst die Wand vom Typ', () => { tw2.t = 250; relinkAll(); return { ok: !tw2.typeId && tw1.typeId === 'tw-aw365', info: `Wand 2: ${tw2.typeId || 'Eigene Maße'}` }; });
  t('Neuer Typ aus Auswahl wird angewendet', () => { const ty = newTypeFrom([tw2]); return { ok: tw2.typeId === ty.id && B.types[ty.id].layers[0].t === 250, info: ty.name }; });
  t('Typ der Stütze: Maße und Verknüpfung', () => { const c = col([0, 8000], 300); applyType(c, B.types['tc-40']); const ok1 = c.w === 400 && c.d === 400; c.w = 450; relinkAll(); return { ok: ok1 && !c.typeId, info: `Stütze ${c.w}, Typ ${c.typeId || 'Eigene Maße'}` }; });
  t('Fenstertyp: Maße und Teilung werden übernommen', () => { const w = { id: 'twt', storey: cur(), type: 'window', host: tw1.id, at: 3000, w: 1260, h: 1385, sill: 900 }; B.els.push(w); applyType(w, B.types['tf-3']); return { ok: w.typeId === 'tf-3' && w.cfg?.cols?.length === 3, info: `${w.cfg?.cols?.length} Felder` }; });

  // 8. Datenstand, Verlauf, Wandecken, Räume
  t('Schema: Datei ohne Version wird auf den neuesten Stand gebracht', () => {
    const o = { id: 'x', storeys: [{ id: 's', name: 'EG', elev: 0, height: 3000 }], els: [{ id: 'a', type: 'wall', a: [0, 0], b: [6000, 0], t: 365, kind: 'aw', storey: 's' }] }, r1 = migrate(o), r2 = migrate(o);
    return { ok: o.schema === SCHEMA && !!o.types && !!o.vis && Array.isArray(o.grids) && r1.notes.length > 0 && r2.notes.length === 0, info: `Schema ${r1.from} → ${r1.to}, zweiter Lauf ohne Schritte` };
  });
  t('Schema: neuere Version bleibt unverändert', () => { const o = { schema: SCHEMA + 5, els: [] }, r1 = migrate(o); return { ok: r1.newer && o.schema === SCHEMA + 5 && !o.vis, info: `Version ${o.schema}` }; });
  t('Verlauf: Schritte bekommen Namen', () => {
    B.els.length = 0; const a0 = JSON.stringify(B), w = wall([0, 0], [3000, 0]), a1 = JSON.stringify(B); w.t = 300; const a2 = JSON.stringify(B); B.els.pop(); const a3 = JSON.stringify(B);
    const n = [describeStep(a0, a1), describeStep(a1, a2), describeStep(a2, a3)];
    return { ok: n[0] === 'Wand angelegt' && n[1] === 'Wand geändert' && n[2] === 'Wand gelöscht', info: n.join(' · ') };
  });
  t('Wandecke stumpf: Wand stößt an die Fläche, Nachbarwand läuft durch', () => {
    B.els.length = 0; const wa = wall([0, 0], [6000, 0]), wb = wall([6000, 0], [6000, 4000]);
    const xs = P => P.map(q => q[0]), ys = P => P.map(q => q[1]), pa0 = api.wallPoly(wa), pb0 = api.wallPoly(wb);
    wa.jb = 'butt'; const pa = api.wallPoly(wa), pb = api.wallPoly(wb);
    return { ok: Math.max(...xs(pa)) < 5881 && Math.min(...ys(pb)) < -119 && Math.max(...xs(pa0)) > 6100 && pb0.some(q => Math.abs(q[1] - 120) < 1) && !pb.some(q => Math.abs(q[1] - 120) < 1), info: `Wand A endet bei x ${Math.round(Math.max(...xs(pa)))}, Wand B reicht bis y ${Math.round(Math.min(...ys(pb)))}` };
  });
  t('Raum folgt der Wand und meldet „offen“', () => {
    B.els.length = 0;
    const ws = [wall([0, 0], [6000, 0]), wall([6000, 0], [6000, 4000]), wall([6000, 4000], [0, 4000]), wall([0, 4000], [0, 0])];
    const r0 = detectRoom([3000, 2000]); if (r0.err) return r0.err;
    const sp = { id: 'tsp', storey: cur(), type: 'space', seed: [3000, 2000], auto: true, pts: r0.pts, name: 'Raum', no: '1' }; B.els.push(sp);
    syncSigs(); ws[1].a = [7000, 0]; ws[1].b = [7000, 4000]; ws[0].b = [7000, 0]; ws[2].a = [7000, 4000]; syncSigs(); updateRooms();
    const w1 = Math.max(...sp.pts.map(q => q[0])) - Math.min(...sp.pts.map(q => q[0])), ok1 = w1 > 6700 && !sp.open;
    B.els.splice(B.els.indexOf(ws[3]), 1); syncSigs(); updateRooms();
    return { ok: ok1 && sp.open === true && roomSeed(sp) != null, info: `Breite ${Math.round(w1)} mm, nach Entfernen einer Wand: ${sp.open ? 'offen gemeldet' : 'nicht gemeldet'}` };
  });

  // 9. Bearbeiten: Drehen, Spiegeln, Verschieben
  B.els.length = 0;
  t('Drehen um 90°: Wand, Stütze und Fenster drehen mit', () => {
    const w = wall([1000, 0], [5000, 0], 240, { just: 'l' }), c = col([3000, 0]), fw = { id: 'trw', storey: cur(), type: 'window', host: w.id, at: 2000, w: 1000, h: 1200, sill: 900 }; B.els.push(fw);
    transformSel(rotF([0, 0], 90), { deg: 90 }, [w.id, c.id]);
    return { ok: near(w.a[0], 0, 0.2) && near(w.a[1], 1000, 0.2) && near(w.b[1], 5000, 0.2) && near(c.p[1], 3000, 0.2) && c.rot === 90 && fw.at === 2000 && fw.host === w.id, info: `Wand ${w.a}→${w.b}, Stütze ${c.p} Drehung ${c.rot}°` };
  });
  t('Spiegeln an der Y-Achse mit Kopie: Original bleibt, Lage der Wand wechselt', () => {
    B.els.length = 0; const w = wall([1000, 0], [5000, 0], 240, { just: 'l' }), c = col([3000, 0], 300, { rot: 30 }), n0 = B.els.length;
    const made = transformSel(mirF([0, 0], [0, 1000]), { mirror: true, ax: 90, copy: true }, [w.id, c.id]), mw = B.els.find(e => e.id === made[0]), mc = B.els.find(e => e.id === made[1]);
    return { ok: B.els.length === n0 + 2 && w.a[0] === 1000 && near(mw.a[0], -1000, 0.2) && near(mw.b[0], -5000, 0.2) && mw.just === 'r' && near(mc.rot, 150, 0.1), info: `Kopie ${mw.a}→${mw.b}, Lage ${mw.just}, Stütze Drehung ${mc.rot}°` };
  });
  t('Raum merkt beim Verschieben seinen Punkt', () => {
    const sp = { id: 'tsm', storey: cur(), type: 'space', seed: [100, 100], auto: true, pts: [[0, 0], [200, 0], [200, 200], [0, 200]] }; moveEl(sp, [1000, 500]);
    return { ok: sp.seed[0] === 1100 && sp.seed[1] === 600 && sp.pts[0][0] === 1000, info: `Punkt ${sp.seed}` };
  });

  // 10. Unterzug in der Wand, gespeicherte Ansichten
  t('Unterzug in der Wand: Wand ist an der Stelle ausgespart', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240);
    const bm = { id: 'tbm', storey: cur(), type: 'beam', a: [3000, -1000], b: [3000, 1000], shape: 'rect', w: 300, bh: 500, top: 2500 }; B.els.push(bm);
    const pcs = api.wallPieces(w).filter(p => Math.min(...p.poly.map(q => q[0])) <= 3000 && Math.max(...p.poly.map(q => q[0])) >= 3000), ok = pcs.length >= 2 && pcs.every(p => p.z1 <= 2000.5 || p.z0 >= 2499.5);
    return { ok, info: `${pcs.length} Stücke bei x 3000, z ${pcs.map(p => `${Math.round(p.z0)}–${Math.round(p.z1)}`).join(' | ')}` };
  });
  t('Unterzug in der Wand, schmaler als die Wand: Wand bleibt seitlich stehen', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240);
    B.els.push({ id: 'tbm2', storey: cur(), type: 'beam', a: [1000, 0], b: [5000, 0], shape: 'rect', w: 100, bh: 500, top: 2500 });
    const side = api.wallPieces(w).filter(p => p.z0 >= 1999 && p.z1 <= 2501);
    return { ok: side.length >= 2, info: `${side.length} Seitenstücke im Höhenbereich des Unterzugs` };
  });
  t('Ansicht speichern und wieder aufrufen', () => {
    const keep = { yaw: cam.yaw, pitch: cam.pitch, sc: cam.sc, panX: cam.panX, panY: cam.panY, plan: cam.plan };
    cam.yaw = 1.2; cam.pitch = 0.3; cam.plan = false; const v = saveView(); cam.yaw = -0.4; cam.pitch = 0.9; const ok1 = gotoView(v.id); const ok = ok1 && near(cam.yaw, 1.2, 1e-9) && near(cam.pitch, 0.3, 1e-9) && B.views.length === 1;
    setView('top'); const top = cam.plan; Object.assign(cam, keep);
    return { ok: ok && top, info: `Ansicht „${v.name}“, Oben = Grundriss` };
  });

  // 11. Schnitthöhe, Ansichten umbenennen
  t('Schnitthöhe kappt Körper, IFC bleibt vollständig', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240); cam.cutH = 1200; api.buildGeom();
    const cut = api.triCount(), top = api.maxTriZ(); cam.cutH = null; api.buildGeom(); const full = api.maxTriZ();
    return { ok: Math.abs(top - 1200) < 1 && full > 2000, info: `höchster Punkt mit Schnitt ${Math.round(top)} mm, ohne ${Math.round(full)} mm, ${cut} Dreiecke` };
  });
  t('Ansicht umbenennen', () => { const v = B.views[0]; const n0 = v.name; v.name = 'Grundriss EG, 1:50'; return { ok: B.views.some(x => x.name === 'Grundriss EG, 1:50'), info: `„${n0}“ → „${v.name}“` }; });

  // 12. Listen, CSV, PDF
  B.els.length = 0; B.grids.length = 0;
  const lw1 = wall([0, 0], [6000, 0], 240, { typeId: 'tw-iwt240' }), lw2 = wall([0, 4000], [4000, 4000], 365, { kind: 'aw', typeId: 'tw-aw365' }), lwin = { id: 'tlw', storey: cur(), type: 'window', host: lw1.id, at: 3000, w: 1260, h: 1385, sill: 900 };
  B.els.push(lwin); B.els.push({ id: 'tlr', storey: cur(), type: 'space', no: '1', name: 'Wohnen', pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], seed: [3000, 2000], auto: true });
  col([0, 0], 300); B.grids.push({ id: 'tg1', name: '1', a: [0, -1000], b: [0, 5000] }, { id: 'tg2', name: '2', a: [6000, -1000], b: [6000, 5000] });
  t('Listen: Wände mit Summen, Sortieren und Filtern', () => {
    const T = listTable('walls', api.listCtx(), true), V = listView(T, {}), sumLen = V.sums[T.cols.findIndex(c => c.k === 'len')];
    const V2 = listView(T, { sort: 'len', dir: -1 }), V3 = listView(T, { filter: 'außen' });
    return { ok: T.rows.length === 2 && near(sumLen, 10, 0.01) && V2.rows[0].id === lw1.id && V3.rows.length === 1, info: `${T.rows.length} Wände, Summe ${sumLen} m, größte zuerst: ${V2.rows[0].cells.type.t}, Filter „außen“: ${V3.rows.length}` };
  });
  t('Listen: Fenster, Räume, Stützen, Typen', () => {
    const w = listTable('windows', api.listCtx(), true), r = listTable('rooms', api.listCtx(), true), c = listTable('columns', api.listCtx(), true), ty = listTable('types', api.listCtx(), true);
    const ar = r.rows[0].cells.area.v, wa = w.rows[0].cells.area.v;
    return { ok: w.rows.length === 1 && near(wa, 1.26 * 1.385, 0.001) && near(ar, 24, 0.001) && c.rows.length === 1 && ty.rows.length >= 20, info: `Fenster ${wa.toFixed(2)} m², Raum ${ar} m², ${c.rows.length} Stütze, ${ty.rows.length} Typen` };
  });
  t('CSV: Kennzeichen, Semikolon, Dezimalkomma, Summenzeile', () => {
    const T = listTable('walls', api.listCtx(), true), csv = csvOf(T, listView(T, {})), L = csv.split('\r\n');
    return { ok: csv.charCodeAt(0) === 0xfeff && L[0].includes(';') && L[0].includes('Länge m') && /\d,\d/.test(L[1]) && L[3].startsWith('Summe'), info: `${L.length - 1} Zeilen, Kopf: ${L[0].slice(1, 40)}…` };
  });
  t('PDF: gültiger Aufbau, Stempel und Maßstab', () => {
    const r = planPdf(api.pdfCtx(), { paper: 'a3', scale: 'auto' }); if (!r) return 'kein PDF';
    let txt = ''; for (let i = 0; i < r.bytes.length; i++) txt += String.fromCharCode(r.bytes[i]);
    const xr = txt.lastIndexOf('\nxref\n') + 1, n = +txt.slice(xr).match(/xref\n0 (\d+)/)[1], offs = [...txt.slice(xr).matchAll(/(\d{10}) 00000 n/g)].map(m => +m[1]);
    const okObj = offs.length === n - 1 && offs.every((o, i) => txt.slice(o, o + 12).startsWith(`${i + 1} 0 obj`));
    return { ok: txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF') && okObj && txt.includes('Wohnen') && txt.includes('24,00 m') && txt.includes(`1 : ${r.den}`), info: `${r.bytes.length} Bytes, ${n - 1} Objekte, Maßstab 1 : ${r.den}` };
  });

  t('Excel: gültige Datei, Blätter, Zahlen bleiben Zahlen', () => {
    const sheets = ['walls', 'windows', 'rooms'].map(k => { const T = listTable(k, api.listCtx(), true); return xlsxSheet(T, listView(T, {}), k); });
    const z = unzipCheck(makeXlsx(sheets)), dp = new DOMParser(), good = Object.values(z.files).every(x => !dp.parseFromString(x, 'application/xml').querySelector('parsererror'));
    const sh1 = z.files['xl/worksheets/sheet1.xml'] || '';
    return { ok: z.ok && z.entries === 8 && good && /<v>\d/.test(sh1) && z.files['xl/workbook.xml'].includes('sheetId="3"') && sh1.includes('Summe'), info: `${z.entries} Teile, Prüfsummen ${z.ok ? 'stimmen' : 'FALSCH'}, ${sheets.map(x => x.rows.length).join('/')} Zeilen` };
  });
  t('PDF: alle Geschosse, eine Seite je Geschoss', () => {
    B.storeys.push({ id: 'tps2', name: 'OG', elev: 3000, height: 3000 }); B.els.push({ id: 'tw2a', storey: 'tps2', type: 'wall', a: [0, 0], b: [6000, 0], t: 240, just: 'c', kind: 'iwt', h: null });
    const r = planPdf(api.pdfCtx(), { paper: 'a4', scale: 'auto', all: true }); if (!r) return 'kein PDF';
    let txt = ''; for (let i = 0; i < r.bytes.length; i++) txt += String.fromCharCode(r.bytes[i]);
    const xr = txt.lastIndexOf('\nxref\n') + 1, offs = [...txt.slice(xr).matchAll(/(\d{10}) 00000 n/g)].map(m => +m[1]), okObj = offs.every((o, i) => txt.slice(o, o + 12).startsWith(`${i + 1} 0 obj`));
    return { ok: r.pages === 2 && txt.includes('/Count 2') && okObj && txt.includes('Grundriss OG') && txt.includes('Grundriss EG'), info: `${r.pages} Seiten, ${offs.length} Objekte` };
  });

  // 13. Doppelflügeltür mit ungleichen Flügeln
  t('Doppeltür: ungleiche Flügel, Breite ändern behält das Verhältnis', () => {
    B.els.length = 0; const w = wall([0, 0], [8000, 0], 240), d = { id: 'tdt', storey: cur(), type: 'door', host: w.id, at: 2000, w: 1260, h: 2135, sill: 0 }; B.els.push(d);
    d.leaves = twoLeaves(d); const a = d.leaves.map(l => l.w).join('+'); d.w = 1500; fixLeaves(d);
    const sum = d.leaves.reduce((x, l) => x + l.w, 0);
    return { ok: leavesOf(d).length === 2 && a === '840+420' && Math.abs(sum - 1500) < 0.2 && d.leaves[0].w === 1000 && d.leaves[1].w === 500 && doorPlates(d).length === 2, info: `${a} → ${d.leaves.map(l => l.w).join('+')}, ${doorPlates(d).length} Türblätter` };
  });
  t('Doppeltür als Typ: Flügelbreiten werden übernommen und gelöst', () => {
    const d = B.els.find(e => e.id === 'tdt'); applyType(d, B.types['tt-1260u']); const ok1 = d.w === 1260 && d.leaves.map(l => l.w).join('+') === '885+375' && d.typeId === 'tt-1260u';
    d.leaves[0].w = 800; d.leaves[1].w = 460; relinkAll(); return { ok: ok1 && !d.typeId, info: `Typ „${B.types['tt-1260u'].name}“ angewendet, nach Änderung der Flügel: ${d.typeId || 'Eigene Maße'}` };
  });
  t('Doppeltür in Liste und IFC', () => {
    const d = B.els.find(e => e.id === 'tdt'), T = listTable('doors', api.listCtx(), true), cell = T.rows[0].cells.leaves.t, ifc = ifcText();
    return { ok: cell.startsWith('2 Flügel') && ifc.includes('DOUBLE_DOOR_SINGLE_SWING') && ifc.includes('Flügelbreiten') || (cell.startsWith('2 Flügel') && ifc.includes('DOUBLE_DOOR_SINGLE_SWING') && ifc.includes('X2')), info: `${cell}; IFC Flügel ${ifc.includes('DOUBLE_DOOR_SINGLE_SWING') ? 'ja' : 'nein'}` };
  });

  // Zwischenspeicher der Ansicht: gleiches Ergebnis wie ein voller Neuaufbau, bearbeitete Geschosse werden neu gebaut
  t('Ansicht: Zwischenspeicher liefert dasselbe wie ein Neuaufbau', () => {
    B.els.length = 0; B.storeys.push({ id: 'tgs2', name: 'OG', elev: 3000, height: 3000 });
    const w = wall([0, 0], [6000, 0], 240), c1 = col([0, 0], 300), sl = { id: 'tgsl', storey: 'tgs2', type: 'slab', pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], t: 250 }; B.els.push(sl);
    api.clearGeomCache(); api.buildGeom(); const s0 = api.geomSum();
    api.buildGeom(); const s1 = api.geomSum(), st1 = api.geomStats();
    w.b = [8000, 0]; B.els[B.els.indexOf(sl)].pts[1] = [8000, 0]; api.buildGeom(); const s2 = api.geomSum();
    api.clearGeomCache(); api.buildGeom(); const s3 = api.geomSum();
    return { ok: Math.abs(s0 - s1) < 1e-6 && st1.hits > 0 && Math.abs(s2 - s3) < 1e-6 && Math.abs(s2 - s1) > 1, info: `Treffer ${st1.hits}, nach Änderung ${Math.abs(s2 - s3) < 1e-6 ? 'identisch zum Neuaufbau' : 'ABWEICHUNG'}` };
  });
  t('Ansicht: Auswahl ändert nur das gewählte Bauteil', () => {
    B.els.length = 0; for (let i = 0; i < 6; i++) wall([0, i * 3000], [5000, i * 3000], 240); api.clearGeomCache(); api.buildGeom(); const m0 = api.geomStats().miss;
    api.setSel?.([B.els[2].id]); api.buildGeom(); const m1 = api.geomStats().miss - m0; api.setSel?.([]);
    return { ok: m1 >= 1 && m1 <= 2, info: `${m1} Bauteil(e) neu gebaut von ${B.els.length}` };
  });

  // Schiefer Plan: „Ausrichten“ dreht die Unterlage, bis die gewählte Linie waagerecht liegt
  t('Plan ausrichten: schiefe Linie wird waagerecht', () => {
    B.underlays.length = 0; const u = { id: 'tul', storey: cur(), file: 'none', name: 'x', w: 100, h: 100, s: 10, rot: 0, alpha: 0.5, pos: [0, 1000] }; B.underlays.push(u);
    const ang = 3.2 * Math.PI / 180; ulAlign([0, 0], [Math.cos(ang) * 4000, Math.sin(ang) * 4000]);
    return { ok: near(u.rot, -3.2, 0.01), info: `Drehung ${u.rot}°` };
  });

  // Öffnung mit Maß ab Wandende, Kantenmaße der Decke
  t('Öffnung ab Wandende: Abstand zum Ende bleibt bei längerer Wand', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240), fb = { id: 'tfb', storey: cur(), type: 'window', host: w.id, at: 5000, w: 1000, h: 1200, sill: 900, ref: 'b' }, fa = { id: 'tfa', storey: cur(), type: 'window', host: w.id, at: 1000, w: 1000, h: 1200, sill: 900 }; B.els.push(fb, fa);
    api.change(() => { w.b = [7000, 0]; });
    return { ok: fb.at === 6000 && fa.at === 1000, info: `ab Wandende: ${fb.at} (vorher 5000), ab Wandanfang: ${fa.at}` };
  });
  t('Decke: Kantenlänge ändern verschiebt die gegenüberliegende Kante', () => {
    B.els.length = 0; const sl = { id: 'tsd', storey: cur(), type: 'slab', pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], t: 250 }; B.els.push(sl);
    const D = api.slabDims(sl), d0 = D[0]; api.applyDim({ op: sl.id, kind: 'se', idx: 0, rect: d0.rect, val: d0.val }, 7000);
    return { ok: d0.rect && D.length === 4 && sl.pts[1][0] === 7000 && sl.pts[2][0] === 7000 && sl.pts[0][0] === 0 && sl.pts[3][0] === 0, info: `Rechteck ${d0.rect ? 'erkannt' : 'nicht erkannt'}, Punkte ${sl.pts.map(p => p.join('|')).join(' ')}` };
  });

  t('Festes Maß: Stütze hält Abstand zur Wand, Wandlänge bleibt', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240), c = col([1000, 1000]);
    const d0 = api.colDims(c).find(m => m.kind === 'y-'); c.locks = { 'y-': d0.val }; w.locks = { wl: 6000 };
    api.change(() => { w.a = [0, 500]; w.b = [7000, 500]; });
    const len1 = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    return { ok: Math.abs(c.p[1] - 1500) < 1 && Math.abs(len1 - 6000) < 0.1, info: `Stütze y=${c.p[1]} (soll 1500), Wandlänge ${Math.round(len1)} (soll 6000)` };
  });

  t('Ausrichten: Stützen an linker Kante, Treppe drehen/spiegeln', () => {
    B.els.length = 0; const c1 = col([1000, 500]), c2 = col([2500, 3000], 400), c3 = col([4000, 800]);
    api.setSel([c1.id, c2.id, c3.id]); const n = api.alignSel('l');
    const okA = n === 2 && c2.p[0] - 200 === 850 && c3.p[0] - 150 === 850;
    const stair = { id: 'tst1', storey: cur(), type: 'stair', a: [0, 0], dir: [1, 0], kind: 'straight', w: 1000, g: 270, side: 1 }; B.els.push(stair);
    api.setSel([stair.id]); api.transformSel(api.rotF([0, 0], 90), { deg: 90 }); const okR = Math.abs(stair.dir[0]) < 0.01 && Math.abs(stair.dir[1] - 1) < 0.01;
    api.transformSel(api.mirF([0, 0], [1, 0]), { mirror: true, ax: 0 }); const okM = stair.side === -1 && Math.abs(stair.dir[1] + 1) < 0.01;
    return { ok: okA && okR && okM, info: `ausgerichtet ${n} (${okA}), Treppe gedreht ${okR}, gespiegelt ${okM}` };
  });

  const vol = out => { let v = 0; for (let i = 0; i < out.length; i += 27) { const a = [out[i], out[i + 1], out[i + 2]], b = [out[i + 9], out[i + 10], out[i + 11]], c = [out[i + 18], out[i + 19], out[i + 20]]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return v; };
  t('Formeln: Parameter, Klammern, Funktionen', () => {
    const v = evalExpr('B-2*S+max(10;5)', { B: 1000, S: 25 }); let bad = false; try { evalExpr('B+', { B: 1 }); } catch { bad = true; } let bad2 = false; try { evalExpr('X*2', {}); } catch { bad2 = true; }
    return { ok: v === 960 && evalExpr('(2+3)*4/5') === 4 && evalExpr('1,5*2') === 3 && bad && bad2, info: `B-2*S+max(10;5)=${v}` };
  });
  t('Bauteil: Rauminhalt Quader, Zylinder, Keil, Ausschnitt', () => {
    const mk = (prims, params = []) => ({ id: 'x', name: 'x', params, prims });
    const box = vol(buildPart(mk([prim({ w: '100', d: '200', h: '300' })])).out), cyl = vol(buildPart(mk([prim({ kind: 'cyl', w: '200', d: '200', h: '100' })])).out), wed = vol(buildPart(mk([prim({ kind: 'wedge', w: '100', d: '50', h: '80' })])).out);
    const cut = vol(buildPart(mk([prim({ w: '100', d: '100', h: '100' }), prim({ op: 'sub', x: '25', y: '25', z: '25', w: '50', d: '50', h: '50' })])).out);
    const pr = vol(buildPart(mk([prim({ w: 'B', d: '100', h: '100', n: '3', dx: '200' })], [{ k: 'B', v: '50' }])).out);
    const ok = Math.abs(box - 6e6) < 1 && Math.abs(cyl - Math.PI * 1e4 * 100) / (Math.PI * 1e6) < 0.02 && Math.abs(wed - 0.5 * 100 * 80 * 50) < 1 && Math.abs(cut - (1e6 - 125000)) < 5 && Math.abs(pr - 3 * 50 * 1e4) < 1;
    return { ok, info: `Quader ${Math.round(box)} (6000000), Zylinder ${Math.round(cyl)}, Keil ${Math.round(wed)} (200000), Ausschnitt ${Math.round(cut)} (875000), Wiederholung ${Math.round(pr)} (1500000)` };
  });
  t('GLB-Netz als Grundkörper: Größe und Skalierung', () => {
    const g = { pos: new Float32Array([0, 0, 0, 100, 0, 0, 0, 200, 0, 0, 0, 50]), idx: new Uint32Array([0, 1, 2, 0, 1, 3]), col: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.1, 0.1]) }, m = meshFromGlb(g), r = packMesh(m);
    const P = { id: 'g', name: 'g', params: [], prims: [prim({ kind: 'mesh', mesh: r, w: '200', d: '', h: '', col: '' })] }, res = buildPart(P);
    return { ok: m.size[0] === 100 && m.size[1] === 50 && m.size[2] === 200 && res.tris === 2 && Math.abs(res.mx[0] - 200) < 0.01 && Math.abs(buildPart({ ...P, prims: [{ ...P.prims[0], col: '' }] }).out[6] - 0.5) < 0.01, info: `Größe ${m.size.join(' × ')}, Dreiecke ${res.tris}, Breite skaliert auf ${res.mx[0]}` };
  });
  t('GLB-Netz ausschneiden: Würfel halbiert', () => {
    const V = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0], [0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]], F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
    const pos = [], idx = []; V.forEach(([x, y, z]) => pos.push(x, z, -y)); F.forEach(([a, b, c, d]) => idx.push(a, b, c, a, c, d));
    const m = meshFromGlb({ pos: new Float32Array(pos), idx: new Uint32Array(idx), col: new Float32Array(24).fill(0.6) }), r = packMesh(m);
    const P = { id: 'c', name: 'c', params: [], prims: [prim({ kind: 'mesh', mesh: r, col: '' }), prim({ op: 'sub', x: '50', y: '-1', z: '-1', w: '60', d: '102', h: '102' })] }, res = buildPart(P);
    return { ok: Math.abs(vol(res.out) - 500000) < 50 && Math.abs(res.mx[0] - 50) < 0.1, info: `Rauminhalt ${Math.round(vol(res.out))} (500000), Breite ${res.mx[0]}` };
  });
  t('Wand und schräge Stütze: Wand folgt der Stützenkontur, keine Keile', () => {
    B.els.length = 0; const ang = 40 * Math.PI / 180, d = [Math.cos(ang), Math.sin(ang)];
    const w = wall([-4000 * d[0], -4000 * d[1]], [4000 * d[0], 4000 * d[1]], 240), c = col([0, 0], 400);
    const K = api.colPoly(c), P = api.wallPoly(w); let inter = P; const sg = area2(K) >= 0 ? 1 : -1; K.forEach((q, i) => { const e = sub(K[(i + 1) % 4], q), nx = [e[1] * sg, -e[0] * sg]; inter = inter.length ? clipBy(inter, p => -dot(nx, sub(p, q))) : inter; });
    const want = Math.abs(area2(P)) - (inter.length >= 3 ? Math.abs(area2(inter)) : 0), got = api.wallPieces(w).reduce((s, pc) => s + Math.abs(area2(pc.poly)), 0);
    return { ok: Math.abs(want - got) < 5, info: `Fläche Wand ohne Stütze ${Math.round(want)} mm², Stücke ${Math.round(got)} mm²` };
  });
  t('Fang: Mittellinie und Mitte bei Wand mit Achse rechts', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240, { just: 'r' });
    const L = api.snapLines(null).filter(l => l.label === 'Wandachse'), P = api.snapPoints({}).filter(q => q.label === 'Wandmitte');
    const ok = L.length === 1 && Math.abs(Math.abs(L[0].a[1]) - 120) < 0.5 && P.length === 1 && Math.abs(P[0].p[0] - 3000) < 0.5 && Math.abs(Math.abs(P[0].p[1]) - 120) < 0.5;
    return { ok, info: `Mittellinie bei y=${L[0]?.a[1]}, Wandmitte ${P[0]?.p.join('|')}` };
  });
  t('Durchbruch im Unterzug: Volumen und Maße', () => {
    B.els.length = 0; const bm = { id: 'tbm', storey: cur(), type: 'beam', a: [0, 0], b: [6000, 0], shape: 'rect', w: 300, bh: 500, top: 2600 }; B.els.push(bm);
    const op = { id: 'tbo', storey: cur(), type: 'opening', host: bm.id, at: 3000, w: 600, h: 300, sill: 100 }; B.els.push(op);
    const vol = api.wallPieces(bm).reduce((s, pc) => s + Math.abs(area2(pc.poly)) * (pc.z1 - pc.z0), 0), want = 6000 * 300 * 500 - 600 * 300 * 300;
    const D = api.opDims(op), poly = api.footprint(op);
    return { ok: Math.abs(vol - want) < 1000 && D.length > 0 && poly.length === 4, info: `Volumen ${Math.round(vol / 1e6)} Liter (soll ${Math.round(want / 1e6)}), ${D.length} Maße, Umriss ${poly.length} Ecken` };
  });
  t('Wandecke mit Achse links/rechts und verschiedener Dicke: Gehrung ohne Lücke', () => {
    B.els.length = 0; const A = wall([0, 3000], [0, 0], 200, { just: 'r' }), C = wall([0, 0], [4000, 0], 200, { just: 'l' }), D = wall([-3000, 3000], [-3000, 0], 115), E = wall([-3000, 0], [-1000, 0], 300, { just: 'r' });
    const key = p => `${Math.round(p[0])},${Math.round(p[1])}`, ends = (w, k) => (k ? [api.wallPoly(w)[1], api.wallPoly(w)[2]] : [api.wallPoly(w)[0], api.wallPoly(w)[3]]).map(key).sort().join('|');
    const ok1 = ends(A, 1) === ends(C, 0), ok2 = ends(D, 1) === ends(E, 0);
    return { ok: ok1 && ok2, info: `Ecke r/l: ${ends(A, 1)} gegen ${ends(C, 0)}; Ecke 115/300: ${ends(D, 1)} gegen ${ends(E, 0)}` };
  });
  t('PDF-Vektoren: Operatorliste → Strecken, Matrix, Gruppen, Fangraster', () => {
    const OPS = { save: 1, restore: 2, transform: 3, setLineWidth: 4, setStrokeRGBColor: 5, setFillRGBColor: 6, constructPath: 7, stroke: 8, fill: 9, endPath: 10, moveTo: 11, lineTo: 12, curveTo: 13, curveTo2: 14, curveTo3: 15, closePath: 16, rectangle: 17, closeStroke: 18, fillStroke: 19, eoFill: 20, eoFillStroke: 21, closeFillStroke: 22, closeEOFillStroke: 23, setGState: 24, paintFormXObjectBegin: 25, paintFormXObjectEnd: 26 };
    // Seitenraum → Bildpunkte: Maßstab 2, y nach unten bei Seitenhöhe 100
    const vp = [2, 0, 0, -2, 0, 200];
    const fn = [OPS.setStrokeRGBColor, OPS.setLineWidth, OPS.save, OPS.transform, OPS.constructPath, OPS.stroke, OPS.restore, OPS.constructPath, OPS.stroke],
      args = [[255, 0, 0], [1.5], null, [1, 0, 0, 1, 10, 0], [[OPS.moveTo, OPS.lineTo, OPS.lineTo], [0, 0, 20, 0, 20, 30]], null, null, [[OPS.rectangle], [50, 50, 10, 10]], null];
    const r = extractVectors(fn, args, OPS, vp);
    const first = [r.segs[0], r.segs[1], r.segs[2], r.segs[3]];
    // erste Strecke: (0,0)+(10,0) → (10,0), (30,0) → Bild (20,200), (60,200)
    const ok1 = r.count === 6 && first.join() === '20,200,60,200' && r.groups.length === 1 && r.groups[0].c === '#ff0000' && Math.abs(r.groups[0].w - 3) < 0.1;
    const g = buildGrid(r.segs), near = nearSegs(r.segs, g, 40, 201, 4), far = nearSegs(r.segs, g, 500, 500, 4);
    return { ok: ok1 && near.length >= 1 && far.length === 0, info: `${r.count} Strecken, erste ${first.join('|')} (20|200|60|200), ${r.groups.length} Gruppe, Fang nahe ${near.length}, fern ${far.length}` };
  });
  t('PDF: Hochformat, Linienstärke, Schraffur und Treppe', () => {
    B.els.length = 0; const w1 = wall([0, 0], [6000, 0], 365, { typeId: 'tw-aw365' }); wall([6000, 0], [6000, 4000], 240); col([0, 4000], 400);
    B.els.push({ id: 'tsta', storey: cur(), type: 'stair', a: [1000, 1000], dir: [1, 0], kind: 'straight', w: 1000, g: 270, side: 1 });
    const land = planPdf(api.pdfCtx(), { paper: 'a3' }), port = planPdf(api.pdfCtx(), { paper: 'a3', orient: 'portrait', lw: 1.5 });
    const txt = u => Array.from(u, c => String.fromCharCode(c)).join(''), tl = txt(land.bytes), tp = txt(port.bytes);
    const mb = s => /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(s).slice(1).map(Number);
    const [lw0, lh0] = mb(tl), [pw0, ph0] = mb(tp), hatchN = (tl.match(/[-\d.]+ [-\d.]+ m [-\d.]+ [-\d.]+ l\nS/g) || []).length;
    return { ok: lw0 > lh0 && ph0 > pw0 && hatchN > 30 && tp.includes('0.4') && tl.includes('(auf)') && tp.length > 0, info: `quer ${lw0}×${lh0}, hoch ${pw0}×${ph0}, ${hatchN} Schraffurlinien, „auf“ ${tl.includes('(auf)')}` };
  });
  t('Ansicht: von unten, Schnittbox um Auswahl', () => {
    B.els.length = 0; const w = wall([0, 0], [6000, 0], 240); api.setSel([w.id]);
    api.setView('bottom'); const kb = api.viewKey(), pb = api.cam.pitch; api.setView('iso');
    api.sboxAction('sboxsel'); const b = api.cam.sbox; api.sboxAction('sboxoff');
    return { ok: kb === 'bottom' && pb < -1.5 && b && b.x0 < 0 && b.x1 > 6000 && b.z1 > 2500 && !api.cam.sbox, info: `Unten ${kb} (Neigung ${pb.toFixed(2)}), Box ${b ? [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].join('|') : '–'}` };
  });
  t('Gespeicherte Wandverbindungen: Nachbarwand folgt, Verschieben löst nicht', () => {
    B.els.length = 0; const A = wall([0, 0], [6000, 0], 240), Bw = wall([6000, 0], [6000, 4000], 240), C = wall([0, 4000], [0, 0], 240);
    api.change(() => { Bw.a = [6500, 0]; Bw.b = [6500, 4000]; });
    const ok1 = Math.abs(A.b[0] - 6500) < 0.1;
    api.setSel([Bw.id]); api.transformSel(x => [x[0] + 300, x[1]], { deg: 0 }, [Bw.id]);
    const ok2 = Math.abs(A.b[0] - 6500) < 0.1 && Math.abs(Bw.a[0] - 6800) < 0.1;
    return { ok: ok1 && ok2 && A.jn && Array.isArray(A.jn.b), info: `Nachbar folgt ${ok1} (${A.b[0]}), nach Verschieben bleibt ${ok2}` };
  });
  t('Maße: Raum verschiebt Folgewand, Wandende-Abstand, Dachkante', () => {
    B.els.length = 0; wall([0, 0], [6000, 0], 240); wall([6000, 0], [6000, 4000], 240); wall([6000, 4000], [0, 4000], 240); wall([0, 4000], [0, 0], 240);
    const sp = { id: 'trd', storey: cur(), type: 'space', pts: [[120, 120], [5880, 120], [5880, 3880], [120, 3880]] }; B.els.push(sp);
    const rd = api.roomDims(sp), d0 = rd[0]; api.applyDim({ op: sp.id, kind: 're', idx: 0, val: d0.val }, d0.val + 1000);
    const w2 = B.els.filter(e => e.type === 'wall'), right = w2[1], top = w2[0], ok1 = Math.abs(right.a[0] - 7000) < 0.1 && Math.abs(top.b[0] - 7000) < 0.1;
    B.els.length = 0; const A = wall([0, 0], [2000, 0], 240); wall([5000, -1000], [5000, 1000], 240);
    const e1 = api.wallEndDims(A).find(m => m.kind === 'eb'); api.applyDim({ op: A.id, kind: 'eb', dir: e1.dir, val: e1.val }, 1000);
    const ok2 = Math.abs(e1.val - 2880) < 1 && Math.abs(A.b[0] - 3880) < 0.5;
    B.els.length = 0; const rf = { id: 'trf', storey: cur(), type: 'roof', pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], t: 200, base: 2700, kind: 'flat', par: { h: 0, w: 240, o: 0 }, over: 0 }; B.els.push(rf);
    const sd = api.slabDims(rf); api.applyDim({ op: rf.id, kind: 'se', idx: 0, rect: sd[0].rect, val: sd[0].val }, 7000);
    const ok3 = sd.length === 4 && rf.pts[1][0] === 7000 && rf.pts[2][0] === 7000;
    return { ok: ok1 && ok2 && ok3, info: `Raum ${ok1} (rechte Wand x=${right.a[0]}), Wandende ${ok2} (Ende x=${A.b[0]}), Dachkante ${ok3}` };
  });
  t('Rand folgt den Wänden und Höhen als Bezug', () => {
    B.els.length = 0; const w1 = wall([0, 0], [6000, 0], 240), w2 = wall([6000, 0], [6000, 4000], 240), w3 = wall([6000, 4000], [0, 4000], 240), w4 = wall([0, 4000], [0, 0], 240);
    const sl = { id: 'tbs', storey: cur(), type: 'slab', t: 250, pts: api.wallPoly(w1).slice(0, 1).concat([[6120, -120], [6120, 4120], [-120, 4120]]) }; sl.pts[0] = [-120, -120]; B.els.push(sl);
    api.bindMake(sl); const nb = sl.bind.filter(Boolean).length;
    api.change(() => { w2.a = [7000, 0]; w2.b = [7000, 4000]; });
    const ok1 = nb === 4 && Math.abs(sl.pts[1][0] - 7120) < 1 && Math.abs(sl.pts[2][0] - 7120) < 1 && Math.abs(sl.pts[0][0] + 120) < 1;
    const s0 = B.storeys.find(x => x.id === cur()); const up = { id: 'tup', name: 'OG', elev: s0.elev + s0.height, height: 2750 }; B.storeys.push(up);
    const hw = wall([1000, 1000], [3000, 1000], 240); hw.topRef = { s: 'tup', off: -250 }; const z1 = api.zOf(hw)[1];
    up.elev += 200; const z2 = api.zOf(hw)[1];
    return { ok: ok1 && Math.abs(z1 - (s0.elev + s0.height - 250)) < 1 && Math.abs(z2 - z1 - 200) < 1, info: `${nb} Ecken gebunden, Rand folgt ${ok1}; OK ${z1} → ${z2} nach Geschosshöhe +200` };
  });
  t('Mehrere Fenster gleichzeitig bearbeiten, Griffe, Raster-Befehl', () => {
    B.els.length = 0; const w = wall([0, 0], [10000, 0], 240), mk = (id, at) => { const f = { id, storey: cur(), type: 'window', host: w.id, at, w: 1000, h: 1200, sill: 900 }; B.els.push(f); return f; };
    const f1 = mk('tw1', 2000), f2 = mk('tw2', 5000), f3 = mk('tw3', 8000); api.setSel([f1.id, f2.id, f3.id]);
    api.winEdit(f1, c => { c.frame = 95; });
    const ok1 = f1.cfg.frame === 95 && f2.cfg.frame === 95 && f3.cfg.frame === 95;
    const fu = { id: 'thf', storey: cur(), type: 'furn', p: [3000, 3000], partId: (api.ensureParts(), Object.keys(B.parts)[0]), pv: {}, rot: 0, z: 0 }, sl = { id: 'ths', storey: cur(), type: 'slab', t: 250, pts: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]] }, st0 = { id: 'tht', storey: cur(), type: 'stair', a: [0, 0], dir: [1, 0], kind: 'straight', w: 1000, g: 270, side: 1 }; B.els.push(fu, sl, st0);
    const hs = id => { api.setSel([id]); return api.handles().map(h => h.k).join(','); };
    const hf = hs(fu.id), hl = hs(sl.id), hst = hs(st0.id);
    const ok2 = hf.includes('rot') && /e0,e1,e2,e3/.test(hl) && hst.includes('sd');
    api.startCmd('gridgen'); const ok3 = true; api.makeGrid([6000, 6000], [5000]); const gN = B.grids.length;
    return { ok: ok1 && ok2 && ok3 && gN === 5, info: `3 Fenster ${ok1}, Griffe Einbauteil [${hf}], Decke [${hl}], Treppe [${hst}], Raster ${gN} Achsen` };
  });
  t('Flächenfang in 3D beim Zeichnen: auf der Wandfläche', () => {
    B.els.length = 0; wall([0, 0], [8000, 0], 240); api.setView('iso'); api.fitView(); api.startCmd('wall');
    const s0 = api.P3([3000, -120, 1000]), r = api.snapAt(s0[0], s0[1], {}); api.startCmd('sel');
    return { ok: !!r && /Wandfläche/.test(r.label) && Math.abs(r.p[1] + 120) < 2 && Math.abs(r.p[0] - 3000) < 400, info: r ? `${r.label} bei ${r.p.map(Math.round).join('|')}` : 'kein Fang' };
  });
  t('Einbauteil: platzieren, Maß ändern, Fläche und Höhe', () => {
    B.els.length = 0; api.ensureParts();
    const P = Object.values(B.parts).find(p => p.name === 'Regal'), f = { id: 'tfu', storey: cur(), type: 'furn', p: [2000, 1000], partId: P.id, pv: {}, rot: 0, z: 0 }; B.els.push(f);
    const fp0 = api.furnPoly(f), w0 = Math.abs(fp0[1][0] - fp0[0][0]), z = api.zOf(f);
    f.pv = { B: '1500' }; const w1 = (() => { const q = api.furnPoly(f); return Math.abs(q[1][0] - q[0][0]); })(); f.rot = 90; const q2 = api.furnPoly(f), h2 = Math.abs(q2[2][1] - q2[0][1]);
    return { ok: Math.abs(w0 - 1000) < 1 && Math.abs(w1 - 1500) < 1 && Math.abs(z[1] - z[0] - 2000) < 1 && Math.abs(h2 - 1500) < 1, info: `Breite ${w0} → ${w1}, Höhe ${z[1] - z[0]}, gedreht ${h2}` };
  });
  t('Rasterdecke: Griffe auf Deckenhöhe, Rasterstart an gewählter Ecke', () => {
    B.els.length = 0; const ce = { id: 'tce', storey: cur(), type: 'ceil', pts: [[0, 0], [5000, 0], [5000, 4000], [0, 4000]], z: 2600, t: 20, gx: 625, gy: 625, ox: 0, oy: 0, off: [] }; B.els.push(ce);
    api.setSelEl(ce.id); const hz = api.handleZ(ce), z0 = api.zOf(ce)[0];
    ce.pts.splice(1, 0, [2500, 0], [2600, 0]); const nc = api.gCorners(ce).length; api.gstartPick(ce, 2 + 2);
    return { ok: Math.abs(hz - z0) < 1 && hz > 2000 && ce.start?.k === 4 && nc === 4, info: `Griffhöhe ${hz} (Decken-UK ${z0}), Start an Ecke ${ce.start ? ce.start.k + 1 : '–'}` };
  });
  t('Einbauteil: Fangen an Wand und Ecke', () => {
    B.els.length = 0; api.ensureParts(); const P = Object.values(B.parts).find(p => p.name === 'Regal');
    wall([0, 0], [6000, 0], 240); wall([0, 0], [0, 4000], 240);
    const f = { id: 'tfs', storey: cur(), type: 'furn', p: [2000, 400], partId: P.id, pv: {}, rot: 0, z: 0 };
    const s1 = api.furnSnap([2000, 420], f), f2 = { ...f, rot: 0 };
    const s2 = api.furnSnap([620, 340], f2);
    return { ok: Math.abs(s1.p[1] - 320) < 1.5 && Math.abs(s1.rot - 180) < 0.5 && Math.abs(s2.p[0] - 620) < 1.5 && Math.abs(s2.p[1] - 320) < 1.5, info: `an Wand: ${s1.p.join('|')} Drehung ${s1.rot} (${s1.label}); in der Ecke: ${s2.p.join('|')} (${s2.label})` };
  });
  t('Einbauteil: gehört zum Raum und wandert mit', () => {
    B.els.length = 0; api.ensureParts(); const P = Object.values(B.parts).find(p => p.name === 'Regal');
    const sp = { id: 'tsp', storey: cur(), type: 'space', no: '1.02', name: 'Labor', pts: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]] }, f = { id: 'tfr', storey: cur(), type: 'furn', p: [1000, 1000], partId: P.id, pv: {}, rot: 0, z: 0 }; B.els.push(sp, f);
    const r1 = api.roomOfF(f)?.id === 'tsp', m = api.roomMates([sp.id]).includes(f.id);
    f.space = 'none'; const r2 = api.roomOfF(f) === null; delete f.space;
    api.transformSel(api.rotF([0, 0], 90), { deg: 90 }, [sp.id]);
    return { ok: r1 && m && r2 && Math.abs(f.p[0] + 1000) < 1 && Math.abs(f.p[1] - 1000) < 1, info: `automatisch ${r1}, mit Raum gewählt ${m}, „keinem Raum“ ${r2}, nach Drehung ${f.p.join('|')}` };
  });
  t('Einbauteil: Liste und IFC', () => {
    const ifc = ifcText(), l = listTable('furn', api.listCtx(), true);
    return { ok: ifc.includes('IFCFURNISHINGELEMENT') && l.rows.length === 1, info: `IFC ${ifc.includes('IFCFURNISHINGELEMENT')}, Listenzeilen ${l.rows.length}` };
  });

  // 14. IFC
  t('IFC: Raumbegrenzung mit Fläche, Schichtaufbau am Typobjekt', () => {
    B.els.length = 0; const iw = wall([0, 0], [6000, 0], 365, { kind: 'aw', typeId: 'tw-aw365' }); wall([6000, 0], [6000, 4000], 365, { kind: 'aw', typeId: 'tw-aw365' }); wall([6000, 4000], [0, 4000], 365, { kind: 'aw', typeId: 'tw-aw365' }); wall([0, 4000], [0, 0], 365, { kind: 'aw', typeId: 'tw-aw365' });
    B.els.push({ id: 'tisp', storey: cur(), type: 'space', no: '1', name: 'Raum', pts: [[182.5, 182.5], [5817.5, 182.5], [5817.5, 3817.5], [182.5, 3817.5]] });
    const ifc = ifcText(), ids = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map(m => m[1])), miss = [...ifc.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !ids.has(x));
    const nb = (ifc.match(/IFCRELSPACEBOUNDARY\([^;]*#\d+,\.PHYSICAL\./g) || []).length, assoc = ifc.match(/IFCRELASSOCIATESMATERIAL\([^;]*\)/g) || [];
    const onType = assoc.some(x => { const m = /\(\$,\$,\$,\((#\d+)\),/.exec(x) || /,\$,\$,\$,\((#\d+)\)/.exec(x); return m && new RegExp(`${m[1]}=IFCWALLTYPE`).test(ifc); });
    return { ok: !miss.length && ifc.includes('IFCCONNECTIONSURFACEGEOMETRY') && ifc.includes('IFCCURVEBOUNDEDPLANE') && nb >= 4 && onType, info: `${miss.length} fehlende Bezüge, ${nb} Raumbegrenzungen mit Fläche, Schichtaufbau am Wandtyp ${onType}` };
  });
  t('IFC: alle Bezüge vorhanden', () => {
    B.els.length = 0; const iw = wall([0, 0], [6000, 0], 365, { kind: 'aw', typeId: 'tw-aw365' }); B.els.push({ id: 'tifw', storey: cur(), type: 'window', host: iw.id, at: 3000, w: 1260, h: 1385, sill: 900, typeId: 'tf-1' });
    B.els.push({ id: 'tifr', storey: cur(), type: 'space', no: '1', name: 'Raum', pts: [[200, 182.5], [5800, 182.5], [5800, 3800], [200, 3800]] });
    const ifc = ifcText(), ids = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map(m => m[1])), miss = [...ifc.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !ids.has(x));
    return { ok: !miss.length && ifc.includes('IFCWINDOW') && ifc.includes('IFCMATERIALLAYERSET') && ifc.includes('IFCRELASSOCIATESMATERIAL') && ifc.includes('IFCWALLTYPE') && ifc.includes('IFCWINDOWTYPE') && ifc.includes('IFCRELDEFINESBYTYPE') && ifc.includes('IFCRELSPACEBOUNDARY') && ifc.includes('Pset_BuildingStoreyCommon'), info: `${miss.length} fehlende Bezüge, Typobjekte ${ifc.includes('IFCWALLTYPE') ? 'ja' : 'nein'}, Raumbegrenzung ${ifc.includes('IFCRELSPACEBOUNDARY') ? 'ja' : 'nein'}, Geschosshöhe ${ifc.includes('Pset_BuildingStoreyCommon') ? 'ja' : 'nein'}` };
  });
  return R;
}

// ---------- Prüfmodelle (Dateien im Ordner pruefmodelle) ----------
const pdfOk = bytes => {
  let txt = ''; for (let i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
  const xr = txt.lastIndexOf('\nxref\n') + 1, n = +txt.slice(xr).match(/xref\n0 (\d+)/)[1], offs = [...txt.slice(xr).matchAll(/(\d{10}) 00000 n/g)].map(m => +m[1]);
  return txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF') && offs.length === n - 1 && offs.every((o, i) => txt.slice(o, o + 12).startsWith(`${i + 1} 0 obj`));
};
export async function runBuildingModels(api) {
  const R = [], MODELS = [
    ['einfamilienhaus.json', { wall: 13, window: 11, door: 6, space: 7, slab: 2, column: 0, beam: 0, dbl: 1, storeys: 2 }],
    ['buerokomplex.json', { wall: 32, window: 112, door: 8, space: 4, slab: 4, column: 96, beam: 8, dbl: 4, storeys: 4 }],
  ];
  const t = (Fall, fn) => { const t0 = performance.now(); try { const r = fn(); R.push({ Fall, ok: r === true || r?.ok ? 'ok' : 'FEHLER', Info: `${r?.info ?? (r === true ? '' : String(r))} · ${Math.round(performance.now() - t0)} ms` }); } catch (e) { R.push({ Fall, ok: 'FEHLER', Info: `Ausnahme: ${e.message || e}` }); } };
  for (const [file, ex] of MODELS) {
    let obj;
    try { obj = await (await fetch(new URL(`./pruefmodelle/${file}`, import.meta.url), { cache: 'no-store' })).json(); } catch (e) { R.push({ Fall: `${file}: laden`, ok: 'FEHLER', Info: String(e) }); continue; }
    const from = obj.schema ?? 'ohne Nummer', N = file.replace('.json', '');
    api.setB(obj); const B = () => api.B, cnt = k => B().els.filter(e => e.type === k).length;
    t(`${N}: Datei öffnen und migrieren`, () => ({ ok: B().schema === SCHEMA && !!B().types && B().els.some(e => e.typeId), info: `Schema ${from} → ${B().schema}, ${B().els.filter(e => e.typeId).length} von ${B().els.length} Bauteilen mit Typ` }));
    t(`${N}: Bauteile gezählt`, () => { const got = { wall: cnt('wall'), window: cnt('window'), door: cnt('door'), space: cnt('space'), slab: cnt('slab'), column: cnt('column'), beam: cnt('beam'), dbl: B().els.filter(e => e.leaves?.length === 2).length, storeys: B().storeys.length }; const bad = Object.keys(ex).filter(k => got[k] !== ex[k]); return { ok: !bad.length, info: bad.length ? `abweichend: ${bad.map(k => `${k} ${got[k]} statt ${ex[k]}`).join(', ')}` : `${B().els.length} Bauteile` }; });
    t(`${N}: Öffnungen sitzen in ihren Wänden`, () => { const bad = B().els.filter(e => (e.type === 'window' || e.type === 'door') && (() => { const w = B().els.find(x => x.id === e.host); if (!w) return true; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); return e.at - e.w / 2 < -0.5 || e.at + e.w / 2 > L + 0.5; })()); return { ok: !bad.length, info: `${bad.length} fehlerhaft` }; });
    t(`${N}: Räume werden wieder erkannt (Fläche stimmt)`, () => {
      let n = 0, bad = [];
      B().els.filter(e => e.type === 'space').forEach(sp => { api.setCur(sp.storey); const r = api.detectRoom(sp.seed); n++; if (r.err) { bad.push(`${sp.name}: ${r.err}`); return; } const A = P => { let a = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a) / 2; }; if (Math.abs(A(r.pts) - A(sp.pts)) > A(sp.pts) * 0.02) bad.push(`${sp.name}: ${Math.round(A(r.pts) / 1e4) / 100} statt ${Math.round(A(sp.pts) / 1e4) / 100} m²`); });
      api.setCur(B().storeys[0].id); return { ok: !bad.length, info: bad.length ? bad.join('; ') : `${n} Räume` };
    });
    t(`${N}: Wandstücke ohne Ausfälle`, () => { let n = 0, bad = 0; B().els.filter(e => e.type === 'wall').forEach(w => { const P = api.wallPieces(w); n += P.length; if (!P.length || P.some(p => !(p.z1 > p.z0) || p.poly.some(q => !Number.isFinite(q[0] + q[1])))) bad++; }); return { ok: bad === 0, info: `${n} Stücke, ${bad} Wände mit Fehler` }; });
    t(`${N}: alle Listen`, () => { const bad = []; for (const [k] of LISTS) { const T = listTable(k, api.listCtx(), true); T.rows.forEach(r => T.cols.forEach(c => { const v = r.cells[c.k]?.v; if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${k}.${c.k}`); })); } return { ok: !bad.length, info: bad.length ? bad.slice(0, 4).join(', ') : `${LISTS.length} Listen ohne ungültige Zahlen` }; });
    t(`${N}: IFC vollständig`, () => { const ifc = api.ifcText(), ids = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map(m => m[1])), miss = [...ifc.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !ids.has(x)), c = k => (ifc.match(new RegExp(`=${k}\\(`, 'g')) || []).length; return { ok: !miss.length && c('IFCWALL') === ex.wall && c('IFCDOOR') === ex.door && c('IFCWINDOW') === ex.window && c('IFCBUILDINGSTOREY') === ex.storeys, info: `${miss.length} fehlende Bezüge, ${c('IFCWALL')} Wände, ${c('IFCWINDOW')} Fenster, ${c('IFCDOOR')} Türen, ${Math.round(ifc.length / 1024)} KB` }; });
    t(`${N}: Plan als PDF für jedes Geschoss`, () => { const bad = []; B().storeys.forEach(s => { api.setCur(s.id); const r = planPdf(api.pdfCtx(), { paper: 'a3', scale: 'auto' }); if (!r || !pdfOk(r.bytes)) bad.push(s.name); }); api.setCur(B().storeys[0].id); return { ok: !bad.length, info: bad.length ? `fehlerhaft: ${bad.join(', ')}` : `${B().storeys.length} Geschosse` }; });
  }
  return R;
}

// ---------- Leistung mit großem Modell ----------
export async function runBuildingPerf(api) {
  const R = [], B = api.B, N = 9, G = 8, SP = 5000, H = 3000;
  B.storeys.length = 0; B.els.length = 0; B.grids.length = 0;
  for (let s = 0; s < N; s++) B.storeys.push({ id: `ps${s}`, name: `G${s}`, elev: s * H, height: H });
  let id = 0;
  for (let s = 0; s < N; s++) {
    const sid = `ps${s}`;
    for (let i = 0; i <= G; i++) for (let j = 0; j < G; j++) {
      const h = { id: `p${id++}`, storey: sid, type: 'wall', a: [j * SP, i * SP], b: [(j + 1) * SP, i * SP], t: i === 0 || i === G ? 365 : 240, just: 'c', kind: i === 0 || i === G ? 'aw' : 'iwt', h: null };
      const v = { id: `p${id++}`, storey: sid, type: 'wall', a: [i * SP, j * SP], b: [i * SP, (j + 1) * SP], t: i === 0 || i === G ? 365 : 240, just: 'c', kind: i === 0 || i === G ? 'aw' : 'iwt', h: null };
      B.els.push(h, v);
      if (j % 2 === 0) { B.els.push({ id: `p${id++}`, storey: sid, type: i === 0 || i === G ? 'window' : 'door', host: h.id, at: 2500, w: 1260, h: 1385, sill: 900 }); }
    }
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) B.els.push({ id: `p${id++}`, storey: sid, type: 'column', p: [i * SP, j * SP], shape: 'rect', w: 300, d: 300, rot: 0, h: null });
    B.els.push({ id: `p${id++}`, storey: sid, type: 'slab', pts: [[-300, -300], [G * SP + 300, -300], [G * SP + 300, G * SP + 300], [-300, G * SP + 300]], t: 250 });
  }
  api.setCur(`ps${N - 1}`);
  const T = (Fall, limit, fn) => { const t0 = performance.now(); let info = ''; try { info = fn() ?? ''; } catch (e) { info = `Ausnahme: ${e.message || e}`; R.push({ Fall, ok: 'FEHLER', Info: info }); return; } const ms = Math.round(performance.now() - t0); R.push({ Fall, ok: ms <= limit ? 'ok' : 'FEHLER', Info: `${ms} ms (Grenze ${limit} ms)${info ? ` · ${info}` : ''}` }); };
  R.push({ Fall: `Modell: ${B.els.length} Bauteile, ${N} Geschosse`, ok: 'ok', Info: `${B.els.filter(e => e.type === 'wall').length} Wände, ${B.els.filter(e => e.type === 'column').length} Stützen` });
  T('Ansicht aufbauen (alle Geschosse sichtbar)', 3000, () => { api.buildGeom(); return `${api.triCount()} Dreiecke`; });
  T('Wandstücke aller Wände', 3000, () => { let n = 0; B.els.filter(e => e.type === 'wall').forEach(w => { n += api.wallPieces(w).length; }); return `${n} Stücke`; });
  T('Raum erkennen (ein Raum im obersten Geschoss)', 3000, () => { const r = api.detectRoom([2500, 2500]); return r.err || `${r.pts.length} Ecken`; });
  T('Änderungsprüfung (Signaturen, Verknüpfungen)', 400, () => { api.syncSigs(); api.relinkAll(); });
  T('Listen: Wände aller Geschosse', 1000, () => `${listTable('walls', api.listCtx(), true).rows.length} Zeilen`);
  T('Plan als PDF (ein Geschoss)', 3000, () => `${planPdf(api.pdfCtx(), { paper: 'a3', scale: 'auto' }).bytes.length} Bytes`);
  T('IFC-Export (alle Geschosse)', 20000, () => `${Math.round(api.ifcText().length / 1024)} KB`);
  return R;
}
