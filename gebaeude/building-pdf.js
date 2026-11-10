// Grundriss als PDF (Vektor): kleiner PDF-Schreiber ohne Bibliothek und die Zeichnung des Geschosses. Teil von building.js.
import { sub, add, mul, dot, len, norm, perp, fmt, fmt2, area2, centroid, clipBy } from './building-math.js';

const PT = 72 / 25.4, f = n => (Math.round(n * 100) / 100).toString();
const WIN = { '–': 0x96, '—': 0x97, '„': 0x84, '“': 0x93, '”': 0x94, '€': 0x80, '≈': 0x7e, '·': 0xb7 };
const enc = s => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, c => { const k = WIN[c] ?? (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 0x3f); return `\\${k.toString(8).padStart(3, '0')}`; });

// Seite in Millimetern, Ursprung unten links
function makePdf(wmm, hmm) {
  const pages = [[]], rgb = c => c.map(v => f(v)).join(' '); let o = pages[0];
  const tcv = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const api = {
    w: wmm, h: hmm,
    tw(s, size, bold) { const k = 25.4 / 72; if (!tcv) return String(s).length * size * 0.5 * k; tcv.font = `${bold ? '700 ' : ''}${size}px Helvetica, Arial, sans-serif`; return tcv.measureText(s).width * k; }, // Breite in mm; Schriftgröße in pt
    poly(pts, { fill, stroke, lw = 0.2, dash, close = true } = {}) {
      if (pts.length < 2) return;
      o.push('q'); if (fill) o.push(`${rgb(fill)} rg`); if (stroke) o.push(`${rgb(stroke)} RG ${f(lw * PT)} w`); if (dash) o.push(`[${dash.map(d => f(d * PT)).join(' ')}] 0 d`);
      o.push(pts.map((p, i) => `${f(p[0] * PT)} ${f(p[1] * PT)} ${i ? 'l' : 'm'}`).join(' ') + (close && pts.length > 2 ? ' h' : ''));
      o.push(fill && stroke ? 'B' : fill ? 'f' : 'S'); o.push('Q');
    },
    line(a, b, opt = {}) { api.poly([a, b], { stroke: [0, 0, 0], ...opt, close: false }); },
    circle(c, r, opt = {}) { const k = 0.5523 * r, P = [[c[0] + r, c[1]], [c[0] + r, c[1] + k, c[0] + k, c[1] + r, c[0], c[1] + r], [c[0] - k, c[1] + r, c[0] - r, c[1] + k, c[0] - r, c[1]], [c[0] - r, c[1] - k, c[0] - k, c[1] - r, c[0], c[1] - r], [c[0] + k, c[1] - r, c[0] + r, c[1] - k, c[0] + r, c[1]]];
      o.push('q'); if (opt.fill) o.push(`${rgb(opt.fill)} rg`); if (opt.stroke) o.push(`${rgb(opt.stroke)} RG ${f((opt.lw ?? 0.2) * PT)} w`);
      o.push(`${f(P[0][0] * PT)} ${f(P[0][1] * PT)} m ` + P.slice(1).map(q => `${q.map(v => f(v * PT)).join(' ')} c`).join(' ') + ' h'); o.push(opt.fill && opt.stroke ? 'B' : opt.fill ? 'f' : 'S'); o.push('Q'); },
    text(x, y, s, { size = 8, align = 'l', color = [0, 0, 0], bold = false } = {}) {
      const w = api.tw(s, size, bold), x0 = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
      o.push(`q BT /${bold ? 'F2' : 'F1'} ${f(size)} Tf ${rgb(color)} rg ${f(x0 * PT)} ${f(y * PT)} Td (${enc(s)}) Tj ET Q`);
    },
    newPage() { o = []; pages.push(o); },
    finish() {
      const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        ...pages.flatMap((pg, i) => { const content = pg.join('\n'); return [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(wmm * PT)} ${f(hmm * PT)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]; }),
      ];
      let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
      objs.forEach((s, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${s}\nendobj\n`; });
      const xr = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(v => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
      const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
      return u;
    },
  };
  return api;
}

const PAPER = { a4: [297, 210], a3: [420, 297] };
const NICE = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];

// ctx: { B, st, cur, wallPoly, colPoly, opPoly, wallAxis, wallOffs, gridFams, gridGroups, elLabel, hostOf, fmtDate }
function planPdf(ctx, { paper = 'a3', scale = 'auto', all = false } = {}) {
  const [PW, PH] = PAPER[paper] || PAPER.a3, pdf = makePdf(PW, PH), dens = [];
  const sids = all ? [...ctx.B.storeys].sort((a, c) => a.elev - c.elev).map(s => s.id) : [ctx.cur];
  for (const sid of sids) { const d = planPage(pdf, ctx, sid, PW, PH, scale, dens.length > 0); if (d) dens.push(d); }
  return dens.length ? { bytes: pdf.finish(), den: dens[0], dens, paper, pages: dens.length } : null;
}
function planPage(pdf, ctx, sid, PW, PH, scale, newPage) {
  const { B, wallPoly, colPoly, wallAxis, wallOffs, gridFams, gridGroups, hostOf } = ctx, S = ctx.st(sid), M = 10, TB = 24; // Rand und Schriftfeld in mm
  const walls = B.els.filter(e => e.type === 'wall' && e.storey === sid), cols = B.els.filter(e => e.type === 'column' && e.storey === sid), ops = B.els.filter(e => (e.type === 'door' || e.type === 'window') && e.storey === sid), rooms = B.els.filter(e => e.type === 'space' && e.storey === sid);
  const pts = [...walls.flatMap(wallPoly), ...cols.flatMap(colPoly), ...B.grids.flatMap(g => [g.a, g.b])];
  if (!pts.length) return null;
  if (newPage) pdf.newPage();
  const x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
  const aw = PW - 2 * M - 2 * 34, ah = PH - 2 * M - TB - 2 * 34; // Platz für Achsköpfe und Maßketten rundum
  const den = scale === 'auto' ? (NICE.find(d => (x1 - x0) / d <= aw && (y1 - y0) / d <= ah) || NICE.at(-1)) : +scale, k = 1 / den;
  const ox = M + 34 + (aw - (x1 - x0) * k) / 2, oy = M + TB + 34 + (ah - (y1 - y0) * k) / 2;
  const P = q => [ox + (q[0] - x0) * k, oy + (q[1] - y0) * k];
  const INK = [0.1, 0.1, 0.1], RED = [0.78, 0.2, 0.2];
  pdf.poly([[M - 3, M - 3], [PW - M + 3, M - 3], [PW - M + 3, PH - M + 3], [M - 3, PH - M + 3]], { stroke: INK, lw: 0.5 });
  // Räume: leichte Fläche
  rooms.forEach(r => pdf.poly(r.pts.map(P), { fill: [0.96, 0.97, 0.95] }));
  // Wände: Schichten als Bänder, sonst grau; Umriss
  const MAT = { Putz: [0.93, 0.9, 0.84], Mauerwerk: [0.85, 0.6, 0.47], 'Dämmung': [0.95, 0.86, 0.45], Stahlbeton: [0.62, 0.66, 0.7], Gipskarton: [0.96, 0.96, 0.94], 'Ständerwerk': [0.84, 0.86, 0.87] };
  walls.forEach(w => {
    const Pw = wallPoly(w), ty = ctx.typeOf(w);
    pdf.poly(Pw.map(P), { fill: [0.78, 0.78, 0.78], stroke: INK, lw: 0.25 });
    if (ty?.layers?.length > 1 && w.t * k > 1.2) {
      const { d } = wallAxis(w), n = perp(d), [lo] = wallOffs(w); let o0 = lo; const lat = q => dot(sub(q, w.a), n);
      ty.layers.forEach(l => { const o1 = o0 + l.t, a0 = o0, a1 = o1, band = clipBy(clipBy(Pw, q => lat(q) - a0), q => a1 - lat(q)); if (band.length >= 3) pdf.poly(band.map(P), { fill: MAT[l.m] || [0.8, 0.8, 0.8], stroke: INK, lw: 0.08 }); o0 = o1; });
      pdf.poly(Pw.map(P), { stroke: INK, lw: 0.3 });
    }
  });
  // Stützen
  cols.forEach(c => pdf.poly(colPoly(c).map(P), { fill: c.shape === 'steel' ? [0.55, 0.6, 0.66] : [0.7, 0.74, 0.78], stroke: INK, lw: 0.3 }));
  // Türen und Fenster: Öffnung weiß, Symbole
  ops.forEach(o => {
    const w = hostOf(o); if (!w) return;
    const { d } = wallAxis(w), n = perp(d), [lo, hi] = wallOffs(w), at = s => add(w.a, mul(d, s)), s0 = o.at - o.w / 2, s1 = o.at + o.w / 2;
    pdf.poly([add(at(s0), mul(n, lo)), add(at(s1), mul(n, lo)), add(at(s1), mul(n, hi)), add(at(s0), mul(n, hi))].map(P), { fill: [1, 1, 1], stroke: INK, lw: 0.12 });
    if (o.type === 'window') [lo, (lo + hi) / 2, hi].forEach(off => pdf.line(P(add(at(s0), mul(n, off))), P(add(at(s1), mul(n, off))), { stroke: INK, lw: 0.15 }));
    else {
      let sx = s0;
      ctx.leavesOf(o).forEach(lf => {
        const sw = lf.swing ?? 1, face = sw > 0 ? hi : lo, left = (lf.hinge || 'l') === 'l', H = add(at(left ? sx : sx + lf.w), mul(n, face)), Fr = add(at(left ? sx + lf.w : sx), mul(n, face)), Op = add(H, mul(n, sw * lf.w));
        pdf.line(P(H), P(Op), { stroke: INK, lw: 0.2 });
        const a0 = Math.atan2(Fr[1] - H[1], Fr[0] - H[0]), a1 = Math.atan2(Op[1] - H[1], Op[0] - H[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        pdf.poly(Array.from({ length: 17 }, (_, i) => { const a = a0 + da * i / 16; return P([H[0] + Math.cos(a) * lf.w, H[1] + Math.sin(a) * lf.w]); }), { stroke: INK, lw: 0.12, close: false });
        sx += lf.w;
      });
    }
  });
  // Achsen: Strichpunkt, Köpfe
  B.grids.forEach(g => {
    const a = P(g.a), b = P(g.b), dd = norm(sub(b, a));
    pdf.line(a, b, { stroke: RED, lw: 0.15, dash: [4, 0.8, 0.6, 0.8] });
    [[a, -1, g.hideA], [b, 1, g.hideB]].forEach(([q, sg, hid]) => { if (hid) return; const c = [q[0] + dd[0] * 4.5 * sg, q[1] + dd[1] * 4.5 * sg]; pdf.circle(c, 3.4, { fill: [1, 1, 1], stroke: RED, lw: 0.25 }); pdf.text(c[0], c[1] - 1, g.name, { size: 7, align: 'c', color: RED, bold: true }); });
  });
  // Maßketten der Achsen
  gridFams().forEach(f0 => gridGroups(f0).forEach(G => {
    if (G.items.length < 2 || G.side === 'off') return;
    (G.side === 'both' ? ['a', 'b'] : [G.side]).forEach(sd => {
      const sg = sd === 'b' ? 1 : -1, t0 = sd === 'b' ? G.t1 : G.t0, at = (t, c) => add(mul(G.d, t), mul(G.n, c));
      const row = (mmOff, i0, i1, val) => {
        const t = t0 + sg * mmOff * den, A = P(at(t, G.items[i0].off)), Bq = P(at(t, G.items[i1].off)); pdf.line(A, Bq, { stroke: RED, lw: 0.15 });
        const dd = norm(sub(Bq, A)), tk = [(dd[0] - dd[1]) * 1.1, (dd[1] + dd[0]) * 1.1]; [A, Bq].forEach(q => pdf.line([q[0] - tk[0], q[1] - tk[1]], [q[0] + tk[0], q[1] + tk[1]], { stroke: RED, lw: 0.15 }));
        const m = [(A[0] + Bq[0]) / 2, (A[1] + Bq[1]) / 2], txt = fmt(val); pdf.text(m[0], m[1] + 0.8, txt, { size: 6, align: 'c', color: RED });
      };
      for (let i = 0; i < G.items.length - 1; i++) row(12, i, i + 1, G.items[i + 1].off - G.items[i].off);
      if (G.items.length > 2) row(18, 0, G.items.length - 1, G.items.at(-1).off - G.items[0].off);
    });
  }));
  // Raumstempel
  rooms.forEach(r => { const c = P(centroid(r.pts)), a = Math.abs(area2(r.pts)) / 1e6 - (r.holes || []).reduce((s, h) => s + Math.abs(area2(h)) / 1e6, 0); pdf.text(c[0], c[1] + 1.2, `${r.no ? `${r.no} ` : ''}${r.name || ''}`, { size: 7.5, align: 'c', bold: true }); pdf.text(c[0], c[1] - 2.2, `${fmt2(a)} m²`, { size: 6.5, align: 'c' }); });
  // Maßstabsbalken (1 m und 5 m) und Schriftfeld
  const bx = PW - M - 8 - 60, by = M + TB + 6; [[0, 1000], [1000, 5000]].forEach(([a, b], i) => pdf.poly([[bx + a * k, by], [bx + b * k, by], [bx + b * k, by + 1.6], [bx + a * k, by + 1.6]], { fill: i ? [1, 1, 1] : INK, stroke: INK, lw: 0.2 }));
  pdf.text(bx, by + 3, '0', { size: 6 }); pdf.text(bx + 1000 * k, by + 3, '1 m', { size: 6, align: 'c' }); pdf.text(bx + 5000 * k, by + 3, '5 m', { size: 6, align: 'c' });
  pdf.poly([[M, M], [PW - M, M], [PW - M, M + TB], [M, M + TB]], { stroke: INK, lw: 0.4 });
  pdf.line([PW - M - 90, M], [PW - M - 90, M + TB], { lw: 0.3 }); pdf.line([PW - M - 45, M], [PW - M - 45, M + TB], { lw: 0.3 });
  pdf.text(M + 4, M + TB - 9, B.name || 'Gebäude', { size: 14, bold: true }); pdf.text(M + 4, M + 5, `Grundriss ${S?.name || ''}`, { size: 10 });
  pdf.text(PW - M - 86, M + TB - 9, 'Maßstab', { size: 6.5, color: [0.4, 0.4, 0.4] }); pdf.text(PW - M - 86, M + 6, `1 : ${den}`, { size: 12, bold: true });
  pdf.text(PW - M - 41, M + TB - 9, 'Datum', { size: 6.5, color: [0.4, 0.4, 0.4] }); pdf.text(PW - M - 41, M + 6, ctx.date, { size: 10 });
  return den;
}

export { makePdf, planPdf, PAPER };
