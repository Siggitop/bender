// Symbole, Namen, Vorgaben, Fenstervorlagen. Teil von building.js.
// ---------- Symbole und Namen ----------
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor" fill-opacity=".22"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>', cubeline: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9" stroke-dasharray="2.5 2"/>', cubex: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor" fill-opacity=".08"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9" opacity=".6"/><circle cx="12" cy="12" r="2"/>',
  // Menüband (Version 273)
  plus: '<path d="M12 5v14M5 12h14"/>', save: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>', upload: '<path d="M12 16V5"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  ifc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 13h6M9 17h6"/>', image: '<path d="M4 5h16v14H4z"/><path d="m4 16 5-5 4 4 3-3 4 4"/>',
  stair: '<path d="M4 20h4v-4h4v-4h4V8h4"/>', roof: '<path d="m3 12 9-8 9 8"/><path d="M6 10v9h12v-9"/>', ceil: '<path d="M4 5h16v14H4z"/><path d="M9.3 5v14M14.7 5v14M4 9.7h16M4 14.3h16"/>',
  space: '<path d="M5 5h14v14H5z"/><path d="M9 10h6M9 14h4"/>', shaft: '<path d="M6 4h12v16H6z"/><path d="m6 4 12 16M18 4 6 20"/>', grid: '<path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>',
  window: '<path d="M5 4h14v16H5z"/><path d="M12 4v16M5 12h14"/>', hole: '<path d="M4 4h16v16H4z"/><path d="M9 9h6v6H9z"/>', opening: '<path d="M4 4h16v16H4z"/><path d="M9 20v-8h6v8"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="3 2"/><path d="M9 7 4 12l5 5z"/><path d="m15 7 5 5-5 5z"/>', move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>', under: '<path d="M4 5h16v14H4z"/><path d="m4 15 5-4 4 3 3-2 4 3"/>',
  layers: '<path d="m12 3-9 5 9 5 9-5z"/><path d="m3 13 9 5 9-5"/>', ruler: '<path d="m4 16 12-12 4 4L8 20z"/><path d="m8 12 2 2M11 9l2 2M14 6l2 2"/>', rotate: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  cut: '<path d="M12 4v16"/><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 

  ok: '<path d="m5 12 5 5 9-10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  list: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  sel: '<path d="M5 3l14 8-6 2-2 6z"/>',
  wall: '<path d="M3 6h18v12H3z"/><path d="M3 12h18M9 6v6M15 12v6"/>',
  column: '<path d="M7 3h10M7 21h10M9.5 3v18M14.5 3v18"/>',
  beam: '<path d="M3 7h18M3 17h18M12 7v10"/>',
  slab: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M3 9v3l9 5 9-5V9"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="14.5" cy="12" r=".8"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h9v8M13 4v4"/>',
  iso: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  measure: '<path d="M3 16 16 3l5 5L8 21z"/><path d="m7.5 11.5 2 2M11 8l3 3M14.5 4.5l2 2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  house: '<path d="M4 21V5l8-3v19"/><path d="M12 9h8v12"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="12" rx="1"/><path d="M5 15V4a1 1 0 0 1 1-1h9"/>',
};
const TYPE_NAME = { wall: 'Wand', column: 'Stütze', beam: 'Träger', slab: 'Decke', roof: 'Dach', ceil: 'Rasterdecke', space: 'Raum', shaft: 'Schacht', stair: 'Treppe', door: 'Tür', window: 'Fenster', opening: 'Wanddurchbruch', hole: 'Deckendurchbruch' };
// Layer: je Bauteilart ein- und ausblendbar
const LAYERS = [['wall', 'Wände'], ['column', 'Stützen'], ['beam', 'Träger'], ['slab', 'Decken, Bodenplatten'], ['stair', 'Treppen'], ['roof', 'Dächer'], ['ceil', 'Rasterdecken'], ['space', 'Räume'], ['shaft', 'Schächte'], ['ops', 'Türen, Fenster, Durchbrüche'], ['grid', 'Achsen'], ['under', 'Planunterlage'], ['terrain', 'Gelände']];
const ROOM_NAMES = ['Wohnen', 'Essen', 'Kochen', 'Wohnen/Essen', 'Schlafen', 'Kind', 'Arbeiten', 'Bad', 'Dusche', 'WC', 'Flur', 'Diele', 'Abstellraum', 'Hausanschluss', 'Technik', 'Heizung', 'Keller', 'Waschen', 'Büro', 'Besprechung', 'Teeküche', 'Treppenhaus', 'Aufzug', 'Archiv', 'Server', 'Lager', 'Empfang', 'Sanitär'];
const TILE_PRESETS = [[625, 625], [625, 1250], [600, 600], [1200, 600]];
const WALL_PRESETS = [365, 300, 240, 175, 115, 100];
const WALL_KINDS = [['aw', 'Außenwand', 365], ['iwt', 'Innenwand tragend', 240], ['iwn', 'Innenwand', 115], ['tb', 'Trockenbau', 100]];
const kindName = k => WALL_KINDS.find(x => x[0] === k)?.[1];
// Fenster: Öffnungsart je Feld (Band = Seite des Drehpunkts)
const WOPS = [['f', 'Fest', 'F'], ['dk-l', 'Drehkipp links', 'DK'], ['dk-r', 'Drehkipp rechts', 'DK'], ['d-l', 'Dreh links', 'D'], ['d-r', 'Dreh rechts', 'D'], ['k', 'Kipp', 'K'], ['s', 'Schiebe', 'S']];
const wopName = k => WOPS.find(x => x[0] === k)?.[1] || 'Fest';
// Vorlagen: Maße null = Maße des Fensters behalten
const WIN_TPL = [
  ['1', '1-flügelig', null, { cols: [null], ops: { main: ['dk-r'] } }],
  ['2', '2-flügelig', null, { cols: [null, null], ops: { main: ['dk-l', 'dk-r'] } }],
  ['3', '3-teilig', null, { cols: [null, null, null], ops: { main: ['dk-l', 'f', 'dk-r'] } }],
  ['ol', 'Mit Oberlicht', null, { cols: [null, null], top: { h: 500, split: false }, ops: { main: ['dk-l', 'dk-r'], top: ['k'] } }],
  ['ft', 'Fenstertür', { w: 1010, h: 2135, sill: 0 }, { cols: [null], ops: { main: ['dk-r'] } }],
  ['fts', 'Fenstertür + Seitenteil', { w: 1885, h: 2135, sill: 0 }, { cols: [1010, null], ops: { main: ['dk-r', 'f'] } }],
  ['hs', 'Hebeschiebetür', { w: 2760, h: 2260, sill: 0 }, { cols: [null, null], ops: { main: ['f', 's'] } }],
];
const WALL_SEG = [['aw', 'Außen'], ['iwt', 'Tragend'], ['iwn', 'Innen'], ['tb', 'Trockenbau']];
const TYPE_COL = { wall: '#d2bf98', column: '#7f98b6', beam: '#c39a64', slab: '#a9b6c6', roof: '#d0694f', ceil: '#cfc7a8', space: '#5fbf87', shaft: '#f0a050', stair: '#a995d8', door: '#4fa3e0', window: '#4fa3e0', opening: '#4fa3e0', hole: '#4fa3e0' };
const WALL_OPS = ['door', 'window', 'opening'], OPS = [...WALL_OPS, 'hole'];
const OP_DEF = { door: { w: 1010, h: 2135, sill: 0 }, window: { w: 1260, h: 1385, sill: 900 }, opening: { w: 300, h: 300, sill: 2300 }, hole: { w: 600, d: 400 } };
const JUST = [['l', 'Links'], ['c', 'Mitte'], ['r', 'Rechts']];
const MORE = [['stair', 'Treppe'], ['roof', 'Dach'], ['ceil', 'Rasterdecke'], ['space', 'Raum'], ['shaft', 'Schacht'], ['grid', 'Achse']];
// Bauteile über der Schnittebene: im Grundriss nur gestrichelt
const ABOVE = ['beam', 'roof', 'ceil', 'shaft', 'stair'];
const layerOf = e => (OPS.includes(e.type) ? 'ops' : e.type);

// Bauteiltypen (Version 275): Katalog je Gebäude, Vorgabetypen mit festen Kennungen
const MAT = { Putz: '#e9e3d6', Mauerwerk: '#cf9473', 'Dämmung': '#f2dc72', Stahlbeton: '#9ea8b3', Gipskarton: '#f5f5f1', 'Ständerwerk': '#d5d9dd' };
const TYPE_CATS = { wall: 'Wandtypen', slab: 'Deckentypen', column: 'Stützentypen', window: 'Fenstertypen', door: 'Türtypen' };
function seedTypes() {
  const T = {}, add = o => { T[o.id] = o; }, L = (m, t) => ({ m, t });
  add({ id: 'tw-aw365', cat: 'wall', name: 'Außenwand 36,5', kind: 'aw', layers: [L('Putz', 15), L('Mauerwerk', 175), L('Dämmung', 160), L('Putz', 15)] });
  add({ id: 'tw-sb300', cat: 'wall', name: 'Stahlbeton-Wand 30', kind: 'iwt', layers: [L('Putz', 15), L('Stahlbeton', 270), L('Putz', 15)] });
  add({ id: 'tw-iwt240', cat: 'wall', name: 'Innenwand tragend 24', kind: 'iwt', layers: [L('Putz', 15), L('Mauerwerk', 210), L('Putz', 15)] });
  add({ id: 'tw-iwt175', cat: 'wall', name: 'Innenwand tragend 17,5', kind: 'iwt', layers: [L('Putz', 10), L('Mauerwerk', 155), L('Putz', 10)] });
  add({ id: 'tw-iwn115', cat: 'wall', name: 'Innenwand 11,5', kind: 'iwn', layers: [L('Putz', 10), L('Mauerwerk', 95), L('Putz', 10)] });
  add({ id: 'tw-tb100', cat: 'wall', name: 'Trockenbauwand 10', kind: 'tb', layers: [L('Gipskarton', 12.5), L('Ständerwerk', 75), L('Gipskarton', 12.5)] });
  [[200, 'Decke 20'], [250, 'Decke 25'], [300, 'Decke 30']].forEach(([t, n]) => add({ id: `ts-d${t / 10}`, cat: 'slab', name: n, layers: [L('Stahlbeton', t)] }));
  [[300, 'Bodenplatte 30'], [400, 'Bodenplatte 40']].forEach(([t, n]) => add({ id: `ts-bp${t / 10}`, cat: 'slab', name: n, base: true, layers: [L('Stahlbeton', t)] }));
  [240, 300, 400, 500].forEach(w => add({ id: `tc-${w / 10}`, cat: 'column', name: `Stütze ${w / 10} × ${w / 10}`, shape: 'rect', w, d: w }));
  [300, 400].forEach(w => add({ id: `tc-r${w / 10}`, cat: 'column', name: `Rundstütze Ø ${w / 10}`, shape: 'round', w, d: w }));
  add({ id: 'tc-heb200', cat: 'column', name: 'Stahlstütze HEB 200', shape: 'steel', prof: 'HEB 200' });
  WIN_TPL.forEach(([k, n, dim, cfg]) => { const d = dim || OP_DEF.window; add({ id: `tf-${k}`, cat: 'window', name: n, w: d.w, h: d.h, sill: d.sill, cfg: JSON.parse(JSON.stringify(cfg)) }); });
  [[885, 'Tür 88,5 × 213,5'], [1010, 'Tür 101 × 213,5'], [1135, 'Tür 113,5 × 213,5'], [1760, 'Doppeltür 176 × 213,5']].forEach(([w, n]) => add({ id: `tt-${w}`, cat: 'door', name: n, w, h: 2135, sill: 0 }));
  return T;
}

export { SVG, IC, TYPE_NAME, LAYERS, ROOM_NAMES, TILE_PRESETS, WALL_PRESETS, WALL_KINDS, kindName, WOPS, wopName, WIN_TPL, WALL_SEG, TYPE_COL, WALL_OPS, OPS, OP_DEF, JUST, MORE, ABOVE, layerOf, MAT, TYPE_CATS, seedTypes };
