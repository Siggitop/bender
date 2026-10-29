// Rechenkern: Rohrverlauf als Polylinie der Achs-Schnittpunkte (Achsmaß),
// daraus Bögen, gerade Stücke, Zuschnitt und Markierungen.

export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]); return l ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
};

// Rodrigues-Drehung von v um die Einheitsachse k
export function rotAbout(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}

// Eingabe "Richtungen": jeder Schenkel als Weg dx/dy/dz (X rechts, Y hinten, Z oben)
export function pointsFromDeltas(deltas, origin = [0, 0, 0]) {
  let p = [...origin];
  const pts = [p];
  for (const d of deltas) { p = V.add(p, [d.x || 0, d.y || 0, d.z || 0]); pts.push(p); }
  return pts;
}

// Eingabe "Winkel & Drehung": Schenkel startet in frame.d (Standard +X), Bezug der ersten Biegung frame.b (Standard oben).
// rot = Drehung der Biegerichtung um die Rohrachse gegenüber der vorigen Biegung
// (rechtshändig, d. h. im Uhrzeigersinn beim Blick in Rohrrichtung).
export function pointsFromAngles(legs, frame = null, origin = [0, 0, 0]) {
  let p = [...origin], d = frame?.d || [1, 0, 0], b = frame?.b || [0, 0, 1];
  const pts = [p];
  legs.forEach((leg, i) => {
    p = V.add(p, V.mul(d, leg.len || 0));
    pts.push(p);
    if (i < legs.length - 1) {
      const th = rad(leg.angle || 0), ph = rad(leg.rot || 0);
      b = rotAbout(b, d, ph);
      const d2 = V.add(V.mul(d, Math.cos(th)), V.mul(b, Math.sin(th)));
      b = V.add(V.mul(d, -Math.sin(th)), V.mul(b, Math.cos(th)));
      d = d2;
    }
  });
  return pts;
}

export function refPerp(d) {
  let r = [0, 0, 1];
  if (Math.abs(V.dot(r, d)) > 0.999) r = [0, -1, 0];
  return V.norm(V.sub(r, V.mul(d, V.dot(r, d))));
}

// Null-Schenkel und Punkte ohne Richtungsänderung entfernen
export function cleanPoints(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (V.len(V.sub(pts[i], out[out.length - 1])) > 1e-6) out.push(pts[i]);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = V.norm(V.sub(out[i], out[i - 1])), c = V.norm(V.sub(out[i + 1], out[i]));
    if (V.dot(a, c) > 1 - 1e-9) out.splice(i, 1);
  }
  return out;
}

// Polylinie -> Schenkel mit Biegewinkel und Drehung (Gegenstück zu pointsFromAngles)
export function anglesFromPoints(pts) {
  const legs = [];
  let bp = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = V.norm(V.sub(pts[i + 1], pts[i]));
    const leg = { len: V.len(V.sub(pts[i + 1], pts[i])), angle: 0, rot: 0 };
    if (!bp) bp = refPerp(d);
    if (i < pts.length - 2) {
      const d2 = V.norm(V.sub(pts[i + 2], pts[i + 1]));
      const c = Math.max(-1, Math.min(1, V.dot(d, d2)));
      const th = Math.acos(c);
      let b = V.sub(d2, V.mul(d, c));
      b = V.len(b) < 1e-9 ? bp : V.norm(b);
      const ph = Math.atan2(V.dot(V.cross(bp, b), d), V.dot(bp, b));
      leg.angle = deg(th);
      leg.rot = deg(ph);
      bp = V.add(V.mul(d, -Math.sin(th)), V.mul(b, Math.cos(th)));
    }
    legs.push(leg);
  }
  return legs;
}

// o: { R, zugA, zugE, minStraight, pickMark(bend) -> { name, k, side } }
// k = Abstand Bleistiftstrich -> Biegeanfang für die gewählte Zangenmarke (aus Kalibrierung)
export function computeLayout(rawPts, o) {
  const errors = [], warnings = [];
  const verts = cleanPoints(rawPts);
  if (verts.length < 2) return { verts, pts: verts, legs: [], bends: [], straights: [], total: 0, samples: [], errors: ['Mindestens ein Schenkel mit Länge nötig.'], warnings };
  const R = o.R;
  if (!(R > 0)) errors.push('Biegeradius der Zange fehlt.');

  // Zugaben an Anfang und Ende verlängern den ersten/letzten Schenkel
  const pts = [...verts];
  const d0 = V.norm(V.sub(pts[1], pts[0])), dn = V.norm(V.sub(pts.at(-1), pts.at(-2)));
  pts[0] = V.sub(pts[0], V.mul(d0, o.zugA || 0));
  pts[pts.length - 1] = V.add(pts.at(-1), V.mul(dn, o.zugE || 0));

  const legs = anglesFromPoints(pts);
  const bends = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const L = legs[i - 1];
    if (L.angle > 179.5) errors.push(`Biegung ${i}: ${L.angle.toFixed(0)}° – Rohr läuft zurück, nicht biegbar.`);
    const th = rad(Math.min(L.angle, 179.5));
    const T = R * Math.tan(th / 2), B = R * th;
    bends.push({
      angle: L.angle, rot: L.rot, T, B, gain: 2 * T - B, vertex: pts[i],
      din: V.norm(V.sub(pts[i], pts[i - 1])), dout: V.norm(V.sub(pts[i + 1], pts[i])),
    });
  }

  const straights = legs.map((leg, j) => leg.len - (j > 0 ? bends[j - 1].T : 0) - (j < bends.length ? bends[j].T : 0));
  let s = 0;
  bends.forEach((b, j) => {
    s += straights[j];
    b.start = s;
    const mk = o.pickMark ? o.pickMark(b) : { name: '0', k: o.k || 0, side: 'links' };
    b.markName = mk.name; b.markSide = mk.side; b.mark = s + (mk.k || 0);
    s += b.B; b.end = s;
  });
  const total = s + straights.at(-1);

  const min = o.minStraight || 0;
  straights.forEach((g, j) => {
    const name = j === 0 ? 'Anfang bis Biegung 1' : j === straights.length - 1 ? `Biegung ${j} bis Ende` : `Biegung ${j} bis ${j + 1}`;
    if (g < -0.05) errors.push(`${name}: Bögen überschneiden sich (gerade Strecke ${g.toFixed(1)} mm). Schenkel länger machen.`);
    else if (bends.length && g < min) warnings.push(`${name}: nur ${g.toFixed(1)} mm gerade – Zange braucht mind. ${min} mm.`);
  });
  bends.forEach((b, j) => {
    if (b.mark < 0 || b.mark > total) errors.push(`Markierung ${j + 1} liegt außerhalb des Rohrs (${b.mark.toFixed(1)} mm).`);
  });

  // Mittellinie zum Zeichnen; s = abgewickelte Länge, b = Index der Biegung (-1 = gerade)
  const samples = [{ p: pts[0], s: 0, b: -1 }];
  bends.forEach((bd, j) => {
    const ts = V.sub(bd.vertex, V.mul(bd.din, bd.T));
    samples.push({ p: ts, s: bd.start, b: -1 });
    const bv = V.norm(V.sub(bd.dout, V.mul(bd.din, V.dot(bd.din, bd.dout))));
    const C = V.add(ts, V.mul(bv, R));
    const th = rad(Math.min(bd.angle, 179.5));
    const n = Math.max(3, Math.ceil(bd.angle / 6));
    for (let q = 0; q <= n; q++) {
      const t = th * q / n;
      samples.push({ p: V.add(C, V.add(V.mul(bv, -R * Math.cos(t)), V.mul(bd.din, R * Math.sin(t)))), s: bd.start + R * t, b: j });
    }
  });
  samples.push({ p: pts.at(-1), s: total, b: -1 });

  return { verts, pts, legs, bends, straights, total, samples, errors, warnings };
}

// Punkt auf der Mittellinie bei abgewickelter Länge s
export function pointAt(samples, s) {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (s <= b.s || i === samples.length - 1) {
      const t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
      return V.add(a.p, V.mul(V.sub(b.p, a.p), t));
    }
  }
  return samples[0]?.p || [0, 0, 0];
}

// Kürzester Abstand zweier Strecken im Raum; liefert Abstand und Punkt auf der ersten Strecke
function segSeg(p1, q1, p2, q2) {
  const cl = v => Math.max(0, Math.min(1, v));
  const d1 = V.sub(q1, p1), d2 = V.sub(q2, p2), r = V.sub(p1, p2);
  const a = V.dot(d1, d1), e = V.dot(d2, d2), f = V.dot(d2, r);
  let s = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) return { d: V.len(r), p: p1 };
  if (a < 1e-12) t = cl(f / e);
  else {
    const c = V.dot(d1, r);
    if (e < 1e-12) s = cl(-c / a);
    else {
      const b = V.dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? cl((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a); } else if (t > 1) { t = 1; s = cl((b - c) / a); }
    }
  }
  const pa = V.add(p1, V.mul(d1, s));
  return { d: V.len(V.sub(pa, V.add(p2, V.mul(d2, t)))), p: pa };
}

// Stellen, an denen sich das Rohr selbst berührt (Mittellinien näher als ein Rohrdurchmesser).
// Benachbarte Stücke entlang des Rohrs werden übersprungen.
export function selfCollisions(samples, D) {
  const out = [];
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = i + 2; j < samples.length - 1; j++) {
      if (samples[j].s - samples[i + 1].s < 3 * D) continue;
      const r = segSeg(samples[i].p, samples[i + 1].p, samples[j].p, samples[j + 1].p);
      if (r.d < D && !out.some(o => V.len(V.sub(o.p, r.p)) < 3 * D)) out.push(r);
    }
  }
  return out;
}
