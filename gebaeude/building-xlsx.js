// Excel-Datei (.xlsx) ohne Bibliothek: ZIP ohne Kompression mit den nötigen XML-Teilen. Teil von building.js.
const enc = new TextEncoder();
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function zip(files) {
  const parts = [], cen = []; let off = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)]);
    parts.push(lh, name, f.data); cen.push({ name, crc, n, off }); off += lh.length + name.length + n;
  });
  const cStart = off;
  cen.forEach(c => { const h = Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c.crc), ...u32(c.n), ...u32(c.n), ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.off)]); parts.push(h, c.name); off += h.length + c.name.length; });
  parts.push(Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(cen.length), ...u16(cen.length), ...u32(off - cStart), ...u32(cStart), ...u16(0)]));
  let total = 0; parts.forEach(p => { total += p.length; }); const out = new Uint8Array(total); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sheetName = (n, used) => { let b = String(n).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Tabelle', s = b, i = 2; while (used.has(s.toLowerCase())) s = `${b} ${i++}`; used.add(s.toLowerCase()); return s; };

// sheets: [{ name, header: [text], rows: [[ number | text ]], foot?: [number | text] }]
function makeXlsx(sheets) {
  const used = new Set(), names = sheets.map(s => sheetName(s.name, used));
  const sheetXml = sh => {
    const cell = (v, r, c, s) => (typeof v === 'number' && Number.isFinite(v) ? `<c r="${colName(c)}${r}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>` : `<c r="${colName(c)}${r}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${X(v ?? '')}</t></is></c>`);
    const row = (arr, r, s) => `<row r="${r}">${arr.map((v, c) => cell(v, r, c, s)).join('')}</row>`;
    const all = [row(sh.header, 1, 1), ...sh.rows.map((a, i) => row(a, i + 2, 0)), ...(sh.foot ? [row(sh.foot, sh.rows.length + 2, 1)] : [])];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${Math.max(1, sh.header.length)}" width="18" customWidth="1"/></cols><sheetData>${all.join('')}</sheetData></worksheet>`;
  };
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ...sheets.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)]),
  ];
  return zip(files.map(([name, xml]) => ({ name, data: enc.encode(xml) })));
}
// Gegenprobe: Einträge lesen und Prüfsummen vergleichen (für den Selbsttest)
function unzipCheck(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), files = {}; let p = 0, ok = true;
  while (p + 30 <= u8.length && dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true), n = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true), name = dec.decode(u8.subarray(p + 30, p + 30 + nl)), data = u8.subarray(p + 30 + nl + el, p + 30 + nl + el + n);
    if (crc32(data) !== crc) ok = false; files[name] = dec.decode(data); p += 30 + nl + el + n;
  }
  const end = u8.length - 22, entries = dv.getUint16(end + 10, true);
  return { ok: ok && dv.getUint32(end, true) === 0x06054b50 && entries === Object.keys(files).length, files, entries };
}

export { makeXlsx, unzipCheck };
