// Listen und Mengen als Tabelle (Fenster, Türen, Räume, Wände, Stützen, Decken, Typen) und CSV-Ausgabe. Teil von building.js.
import { fmt, fmt2, area2, esc } from './building-math.js';

const LISTS = [['windows', 'Fenster'], ['doors', 'Türen'], ['rooms', 'Räume'], ['walls', 'Wände'], ['columns', 'Stützen'], ['slabs', 'Decken'], ['types', 'Typen']];
const C = (v, t) => ({ v, t: t ?? (v == null ? '' : String(v)) });
const M2 = v => C(v, fmt2(v)), M3 = v => C(v, fmt2(v)), MM = v => C(v, fmt(v)), TX = s => C(s ?? '', String(s ?? ''));
const per = P => P.reduce((a, p, i) => a + Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1]), 0);

// ctx: { B, cur, st, typeOf, kindName, wallNet, winText, elLabel, zRange, layerSum, typeInfo }
function listTable(which, ctx, all) {
  const { B, cur, st, typeOf, kindName, wallNet, winText, elLabel, zRange } = ctx;
  const order = new Map(B.storeys.map(s => [s.id, s.elev]));
  const els = B.els.filter(e => all || e.storey === cur).sort((a, c) => (order.get(a.storey) ?? 0) - (order.get(c.storey) ?? 0));
  const sn = e => TX(st(e.storey)?.name || ''), tn = e => TX(typeOf(e)?.name || 'Eigene Maße');
  const rows = [], add = (e, cells, ids) => rows.push({ id: e?.id, ids: ids || (e ? [e.id] : []), cells });
  let cols;
  if (which === 'windows') {
    cols = [['nr', 'Nr.'], ['storey', 'Geschoss'], ['type', 'Typ'], ['w', 'Breite mm', 1, 0], ['h', 'Höhe mm', 1, 0], ['sill', 'Brüstung mm', 1, 0], ['area', 'Fläche m²', 1, 1], ['wall', 'Wand'], ['div', 'Teilung']];
    els.filter(e => e.type === 'window').forEach(e => add(e, { nr: TX(`F${rows.length + 1}`), storey: sn(e), type: tn(e), w: MM(e.w), h: MM(e.h), sill: MM(e.sill || 0), area: M2(e.w * e.h / 1e6), wall: TX(e.host ? elLabel(B.els.find(x => x.id === e.host) || {}) : ''), div: TX(winText(e)) }));
  } else if (which === 'doors') {
    cols = [['nr', 'Nr.'], ['storey', 'Geschoss'], ['type', 'Typ'], ['w', 'Breite mm', 1, 0], ['h', 'Höhe mm', 1, 0], ['leaves', 'Flügel'], ['area', 'Fläche m²', 1, 1], ['wall', 'Wand']];
    els.filter(e => e.type === 'door').forEach(e => add(e, { nr: TX(`T${rows.length + 1}`), storey: sn(e), type: tn(e), w: MM(e.w), h: MM(e.h), leaves: TX(ctx.leafStr(e)), area: M2(e.w * e.h / 1e6), wall: TX(e.host ? elLabel(B.els.find(x => x.id === e.host) || {}) : '') }));
  } else if (which === 'rooms') {
    cols = [['no', 'Nr.'], ['name', 'Name'], ['storey', 'Geschoss'], ['area', 'Fläche m²', 1, 1], ['perim', 'Umfang m', 1, 0], ['h', 'Höhe m', 1, 0], ['vol', 'Volumen m³', 1, 1]];
    els.filter(e => e.type === 'space').forEach(e => { const a = Math.abs(area2(e.pts)) / 1e6 - (e.holes || []).reduce((s, h) => s + Math.abs(area2(h)) / 1e6, 0), h = (st(e.storey)?.height || 0) / 1000; add(e, { no: TX(e.no || ''), name: TX(e.name || ''), storey: sn(e), area: M2(a), perim: M2(per(e.pts) / 1000), h: M2(h), vol: M3(a * h) }); });
  } else if (which === 'walls') {
    cols = [['nr', 'Nr.'], ['storey', 'Geschoss'], ['type', 'Typ'], ['kind', 'Art'], ['len', 'Länge m', 1, 1], ['t', 'Dicke mm', 1, 0], ['h', 'Höhe mm', 1, 0], ['net', 'Fläche netto m²', 1, 1], ['vol', 'Volumen m³', 1, 1]];
    els.filter(e => e.type === 'wall').forEach(e => { const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), [z0, z1] = zRange(e), net = wallNet(e); add(e, { nr: TX(`W${rows.length + 1}`), storey: sn(e), type: tn(e), kind: TX(kindName(e.kind) || ''), len: M2(L / 1000), t: MM(e.t), h: MM(z1 - z0), net: M2(net), vol: M3(net * e.t / 1000) }); });
  } else if (which === 'columns') {
    cols = [['nr', 'Nr.'], ['storey', 'Geschoss'], ['type', 'Typ'], ['form', 'Form'], ['dim', 'Maß'], ['h', 'Höhe mm', 1, 0], ['vol', 'Volumen m³', 1, 1]];
    els.filter(e => e.type === 'column').forEach(e => { const [z0, z1] = zRange(e), h = z1 - z0, a = e.shape === 'round' ? Math.PI * e.w * e.w / 4 / 1e6 : e.shape === 'steel' ? null : e.w * e.d / 1e6; add(e, { nr: TX(`S${rows.length + 1}`), storey: sn(e), type: tn(e), form: TX(e.shape === 'round' ? 'Rund' : e.shape === 'steel' ? 'Stahl' : 'Eckig'), dim: TX(e.shape === 'steel' ? e.prof : e.shape === 'round' ? `Ø ${fmt(e.w)}` : `${fmt(e.w)} × ${fmt(e.d)}`), h: MM(h), vol: a == null ? C(null, '–') : M3(a * h / 1000) }); });
  } else if (which === 'slabs') {
    cols = [['nr', 'Nr.'], ['storey', 'Geschoss'], ['art', 'Art'], ['type', 'Typ'], ['t', 'Dicke mm', 1, 0], ['area', 'Fläche m²', 1, 1], ['vol', 'Volumen m³', 1, 1]];
    els.filter(e => e.type === 'slab').forEach(e => { const holes = B.els.filter(x => x.type === 'hole' && x.host === e.id).reduce((s, h) => s + h.w * h.d / 1e6, 0), a = Math.abs(area2(e.pts)) / 1e6 - holes; add(e, { nr: TX(`D${rows.length + 1}`), storey: sn(e), art: TX(e.base ? 'Bodenplatte' : 'Decke'), type: tn(e), t: MM(e.t), area: M2(a), vol: M3(a * e.t / 1000) }); });
  } else {
    cols = [['name', 'Typ'], ['cat', 'Art'], ['build', 'Aufbau / Maß'], ['n', 'Exemplare', 1, 0], ['qty', 'Menge']];
    const CAT = { wall: 'Wand', slab: 'Decke', column: 'Stütze', window: 'Fenster', door: 'Tür' };
    Object.values(B.types || {}).sort((a, c) => a.cat.localeCompare(c.cat) || a.name.localeCompare(c.name, 'de', { numeric: true })).forEach(t => {
      const use = B.els.filter(e => e.typeId === t.id && (all || e.storey === cur)); let qty = `${use.length} Stk`;
      if (t.cat === 'wall') qty = `${fmt2(use.reduce((s, e) => s + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), 0) / 1000)} m Länge, ${fmt2(use.reduce((s, e) => s + wallNet(e), 0))} m²`;
      else if (t.cat === 'slab') qty = `${fmt2(use.reduce((s, e) => s + Math.abs(area2(e.pts)) / 1e6, 0))} m²`;
      add(null, { name: TX(t.name), cat: TX(CAT[t.cat] || t.cat), build: TX(ctx.typeInfo(t)), n: C(use.length, String(use.length)), qty: TX(qty) }, use.map(e => e.id));
    });
  }
  return { which, cols: cols.map(([k, label, num, sum]) => ({ k, label, num: !!num, sum: num && sum === 1 ? 2 : null })), rows }; // Summen nur für Länge, Fläche und Volumen
}
// sortieren und filtern
function listView(T, { sort, dir = 1, filter = '' } = {}) {
  let rows = T.rows;
  const f = String(filter || '').trim().toLowerCase();
  if (f) rows = rows.filter(r => T.cols.some(c => String(r.cells[c.k]?.t ?? '').toLowerCase().includes(f)));
  if (sort) rows = [...rows].sort((a, b) => { const x = a.cells[sort]?.v, y = b.cells[sort]?.v; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'de', { numeric: true })) * dir; });
  const sums = T.cols.map(c => (c.sum != null ? rows.reduce((s, r) => s + (typeof r.cells[c.k]?.v === 'number' ? r.cells[c.k].v : 0), 0) : null));
  return { rows, sums };
}
function listHtml(T, V, st) {
  const arrow = k => (st.sort === k ? (st.dir > 0 ? ' ▲' : ' ▼') : '');
  const head = T.cols.map(c => `<th data-lsort="${c.k}"${c.num ? ' class="num"' : ''}>${esc(c.label)}${arrow(c.k)}</th>`).join('');
  const body = V.rows.map(r => `<tr data-lrow="${r.ids.join(',')}">${T.cols.map(c => `<td${c.num ? ' class="num"' : ''}>${esc(r.cells[c.k]?.t ?? '')}</td>`).join('')}</tr>`).join('');
  const foot = T.cols.some(c => c.sum != null) ? `<tfoot><tr>${T.cols.map((c, i) => (c.sum != null ? `<td class="num">${esc(c.sum ? fmt2(V.sums[i]) : fmt(V.sums[i]))}</td>` : `<td>${i === 0 ? `Summe (${V.rows.length})` : ''}</td>`)).join('')}</tr></tfoot>` : `<tfoot><tr><td colspan="${T.cols.length}">${V.rows.length} Einträge</td></tr></tfoot>`;
  return `<div class="bau-lwrap"><table class="bau-lt"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${T.cols.length}" class="bau-none">Keine Einträge.</td></tr>`}</tbody>${foot}</table></div>`;
}
// CSV für Excel (Semikolon, Dezimalkomma, UTF-8 mit Kennzeichen)
function csvOf(T, V) {
  const q = s => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s), num = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const cell = (r, c) => { const x = r.cells[c.k]; return c.num && typeof x?.v === 'number' ? num(x.v) : q(String(x?.t ?? '')); };
  const lines = [T.cols.map(c => q(c.label)).join(';'), ...V.rows.map(r => T.cols.map(c => cell(r, c)).join(';'))];
  if (T.cols.some(c => c.sum != null)) lines.push(T.cols.map((c, i) => (c.sum != null ? num(V.sums[i]) : i === 0 ? 'Summe' : '')).join(';'));
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

// Tabellenblatt für Excel: Zahlen bleiben Zahlen (Summen und Sortieren in Excel funktionieren)
function xlsxSheet(T, V, name) {
  const val = (r, c) => { const x = r.cells[c.k]; return c.num && typeof x?.v === 'number' ? x.v : String(x?.t ?? ''); };
  return { name, header: T.cols.map(c => c.label), rows: V.rows.map(r => T.cols.map(c => val(r, c))), foot: T.cols.some(c => c.sum != null) ? T.cols.map((c, i) => (c.sum != null ? V.sums[i] : i === 0 ? 'Summe' : '')) : null };
}

export { LISTS, listTable, listView, listHtml, csvOf, xlsxSheet };
