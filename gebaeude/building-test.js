// Selbsttest Gebäude (nur im Testmodus ?debug): biegeDebug.bau.selfTest()
// Läuft in einem eigenen Test-Gebäude im Speicher; das geöffnete Gebäude, Rückgängig und die Datenbank bleiben unberührt.
// api kommt aus building.js (Funktionen aus der Hülle), Rückgabe wie beim Rohr-Selbsttest: Liste { Fall, ok, Info }.
export async function runBuildingTests(api) {
  const { B, cur, num, parseSpacing, detectRoom, wallOutline, wallPieces, opDims, gridGroups, gridFams, gridFollowers, applyFollow, setGap, ifcText, colPoly, zOf, editType, relinkAll, newTypeFrom, applyType } = api;
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

  // 8. IFC
  t('IFC: alle Bezüge vorhanden', () => {
    const ifc = ifcText(), ids = new Set([...ifc.matchAll(/^#(\d+)=/gm)].map(m => m[1])), miss = [...ifc.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !ids.has(x));
    return { ok: !miss.length && ifc.includes('IFCWINDOW') && ifc.includes('IFCMATERIALLAYERSET') && ifc.includes('IFCRELASSOCIATESMATERIAL'), info: `${miss.length} fehlende Bezüge, Schichtaufbau ${ifc.includes('IFCMATERIALLAYERSET') ? 'ja' : 'nein'}` };
  });
  return R;
}
