// Stahlprofile (Nennmaße) und Profilumriss. Teil von building.js.
// ---------- Stahlprofile (Nennmaße h × b × s × t in mm) ----------
const STEEL = (() => {
  const S = {};
  const I = (fam, rows) => rows.trim().split(/\s+/).forEach(r => { const [n, h, b, tw, tf] = r.split(':').map(Number); S[`${fam} ${n}`] = { kind: fam === 'UPN' ? 'U' : 'I', h, b, tw, tf }; });
  I('IPE', '80:80:46:3.8:5.2 100:100:55:4.1:5.7 120:120:64:4.4:6.3 140:140:73:4.7:6.9 160:160:82:5:7.4 180:180:91:5.3:8 200:200:100:5.6:8.5 220:220:110:5.9:9.2 240:240:120:6.2:9.8 270:270:135:6.6:10.2 300:300:150:7.1:10.7 330:330:160:7.5:11.5 360:360:170:8:12.7 400:400:180:8.6:13.5 450:450:190:9.4:14.6 500:500:200:10.2:16 600:600:220:12:19');
  I('HEA', '100:96:100:5:8 120:114:120:5:8 140:133:140:5.5:8.5 160:152:160:6:9 180:171:180:6:9.5 200:190:200:6.5:10 220:210:220:7:11 240:230:240:7.5:12 260:250:260:7.5:12.5 280:270:280:8:13 300:290:300:8.5:14 320:310:300:9:15.5 340:330:300:9.5:16.5 360:350:300:10:17.5 400:390:300:11:19 450:440:300:11.5:21 500:490:300:12:23');
  I('HEB', '100:100:100:6:10 120:120:120:6.5:11 140:140:140:7:12 160:160:160:8:13 180:180:180:8.5:14 200:200:200:9:15 220:220:220:9.5:16 240:240:240:10:17 260:260:260:10:17.5 280:280:280:10.5:18 300:300:300:11:19 320:320:300:11.5:20.5 340:340:300:12:21.5 360:360:300:12.5:22.5 400:400:300:13.5:24 450:450:300:14:26 500:500:300:14.5:28');
  I('UPN', '80:80:45:6:8 100:100:50:6:8.5 120:120:55:7:9 140:140:60:7:10 160:160:65:7.5:10.5 180:180:70:8:11 200:200:75:8.5:11.5 220:220:80:9:12.5 240:240:85:9.5:13 260:260:90:10:14 280:280:95:10:15 300:300:100:10:16');
  '48.3x4 60.3x4 76.1x4 88.9x5 114.3x5 139.7x6.3 168.3x6.3 219.1x8'.split(' ').forEach(r => { const [d, t] = r.split('x').map(Number); S[`RO ${r.replace('.', ',')}`] = { kind: 'O', h: d, b: d, t }; });
  '50x50x4 60x60x4 80x80x5 100x100x6 120x120x6 140x140x8 160x160x8 200x200x10'.split(' ').forEach(r => { const [h, b, t] = r.split('x').map(Number); S[`QRO ${r}`] = { kind: 'Q', h, b, t }; });
  return S;
})();
const STEEL_FAM = ['IPE', 'HEA', 'HEB', 'UPN', 'RO', 'QRO'];
// Querschnitt in der Ebene (x quer, y Profilhöhe), mittig; Löcher für Hohlprofile
function steelSection(name) {
  const s = STEEL[name] || STEEL['HEA 200'], { h, b } = s, H = h / 2, Bh = b / 2;
  if (s.kind === 'I') { const { tw, tf } = s, w = tw / 2; return { outer: [[-Bh, -H], [Bh, -H], [Bh, -H + tf], [w, -H + tf], [w, H - tf], [Bh, H - tf], [Bh, H], [-Bh, H], [-Bh, H - tf], [-w, H - tf], [-w, -H + tf], [-Bh, -H + tf]], holes: [], h, b }; }
  if (s.kind === 'U') { const { tw, tf } = s; return { outer: [[-Bh, -H], [Bh, -H], [Bh, -H + tf], [-Bh + tw, -H + tf], [-Bh + tw, H - tf], [Bh, H - tf], [Bh, H], [-Bh, H]], holes: [], h, b }; }
  if (s.kind === 'O') { const c = r => Array.from({ length: 24 }, (_, k) => [Math.cos(2 * Math.PI * k / 24) * r, Math.sin(2 * Math.PI * k / 24) * r]); return { outer: c(H), holes: [c(H - s.t).reverse()], h, b }; }
  const t = s.t; return { outer: [[-Bh, -H], [Bh, -H], [Bh, H], [-Bh, H]], holes: [[[-Bh + t, -H + t], [-Bh + t, H - t], [Bh - t, H - t], [Bh - t, -H + t]]], h, b };
}

export { STEEL, STEEL_FAM, steelSection };
