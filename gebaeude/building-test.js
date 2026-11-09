// Selbsttest Gebäude (nur im Testmodus ?debug): biegeDebug.bau.selfTest()
// Läuft in einem eigenen Test-Gebäude im Speicher; das geöffnete Gebäude, Rückgängig und die Datenbank bleiben unberührt.
// api kommt aus building.js (Funktionen aus der Hülle), Rückgabe wie beim Rohr-Selbsttest: Liste { Fall, ok, Info }.
import { SCHEMA, migrate } from './building-schema.js';
export async function runBuildingTests(api) {
  const { B, cur, num, parseSpacing, detectRoom, wallOutline, wallPieces, opDims, gridGroups, gridFams, gridFollowers, applyFollow, setGap, ifcText, colPoly, zOf, editType, relinkAll, newTypeFrom, applyType, syncSigs, updateRooms, describeStep, roomSeed, transformSel, rotF, mirF, moveEl, saveView, gotoView, setView, cam } = api;
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
  t('Typen: Vorgabetypen vorhanden', () => { const n = Object.values(B.types), c = k => n.filter(x => x.cat === k).length; return { ok: c('wall') === 6 && c('slab') === 5 && c('column') === 7 && c('window') >= 7 && c('door') === 4, info: `${n.length} Typen (Wand ${c('wall')}, Decke ${c('slab')}, Stütze ${c('column')}, Fenster ${c('window')}, Tür ${c('door')})` }; });
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

  // 11. IFC
  t('IFC: alle Bezüge vorhanden', () => {
    B.els.length = 0; const iw = wall([0, 0], [6000, 0], 365, { kind: 'aw', typeId: 'tw-aw365' }); B.els.push({ id: 'tifw', storey: cur(), type: 'window', host: iw.id, at: 3000, w: 1260, h: 1385, sill: 900 });
    const ifc = ifcText(), ids = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map(m => m[1])), miss = [...ifc.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !ids.has(x));
    return { ok: !miss.length && ifc.includes('IFCWINDOW') && ifc.includes('IFCMATERIALLAYERSET') && ifc.includes('IFCRELASSOCIATESMATERIAL'), info: `${miss.length} fehlende Bezüge, Schichtaufbau ${ifc.includes('IFCMATERIALLAYERSET') ? 'ja' : 'nein'}` };
  });
  return R;
}
