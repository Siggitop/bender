// Fittings: GLB-Dateien lesen, Anschlüsse finden, Modelle im Browser speichern
const ARR = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const CNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// Spaltenweise 4×4-Matrizen wie in glTF
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mulM(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// Liefert Position, Normale, Farbe je Punkt und Dreiecke, alles in Millimetern. Wirft bei Dateien, die wir nicht lesen können
export function readGlb(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('Das ist keine GLB-Datei.');
  const jsonLen = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const needs = (j.extensionsRequired || []).filter(e => e !== 'KHR_materials_unlit');
  if (needs.length) throw new Error(`Diese GLB-Datei ist komprimiert (${needs.join(', ')}) und lässt sich nicht lesen.`);
  const binAt = 20 + jsonLen + 8, read = id => {
    const a = j.accessors[id], v = j.bufferViews[a.bufferView], T = ARR[a.componentType], n = CNT[a.type], size = T.BYTES_PER_ELEMENT, out = new T(a.count * n);
    const start = binAt + (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || size * n;
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) {
      const at = start + i * stride + k * size;
      out[i * n + k] = T === Float32Array ? dv.getFloat32(at, true) : T === Uint32Array ? dv.getUint32(at, true) : T === Uint16Array ? dv.getUint16(at, true) : T === Int16Array ? dv.getInt16(at, true) : T === Uint8Array ? dv.getUint8(at) : dv.getInt8(at);
    }
    return out;
  };
  const pos = [], nor = [], col = [], idx = [];
  const walk = (id, parent) => {
    const n = j.nodes[id], M = mulM(parent, nodeMatrix(n));
    (j.meshes?.[n.mesh]?.primitives || []).forEach(pr => {
      if ((pr.mode ?? 4) !== 4 || pr.attributes.POSITION == null) return;
      const P = read(pr.attributes.POSITION), N = pr.attributes.NORMAL != null ? read(pr.attributes.NORMAL) : null, base = pos.length / 3;
      const c = j.materials?.[pr.material]?.pbrMetallicRoughness?.baseColorFactor || [0.6, 0.6, 0.6, 1];
      for (let i = 0; i < P.length; i += 3) {
        const [x, y, z] = [P[i], P[i + 1], P[i + 2]];
        pos.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
        const a = N ? N[i] : 0, b = N ? N[i + 1] : 0, d = N ? N[i + 2] : 1;
        const u = M[0] * a + M[4] * b + M[8] * d, v = M[1] * a + M[5] * b + M[9] * d, w = M[2] * a + M[6] * b + M[10] * d, l = Math.hypot(u, v, w) || 1;
        nor.push(u / l, v / l, w / l); col.push(c[0], c[1], c[2]);
      }
      const I = pr.indices != null ? read(pr.indices) : Array.from({ length: P.length / 3 }, (_, i) => i);
      for (let i = 0; i < I.length; i++) idx.push(base + I[i]);
    });
    (n.children || []).forEach(c => walk(c, M));
  };
  (j.scenes?.[j.scene ?? 0]?.nodes || j.nodes.map((_, i) => i)).forEach(id => walk(id, IDENT));
  if (!idx.length) throw new Error('In der Datei ist kein Modell.');
  // glTF rechnet in Metern; Dateien mit Maßen in Millimetern erkennt man an der Größe
  const mn = [0, 1, 2].map(k => { let v = Infinity; for (let i = k; i < pos.length; i += 3) v = Math.min(v, pos[i]); return v; });
  const mx = [0, 1, 2].map(k => { let v = -Infinity; for (let i = k; i < pos.length; i += 3) v = Math.max(v, pos[i]); return v; });
  const scale = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) < 5 ? 1000 : 1;
  return { pos: new Float32Array(pos.map(v => v * scale)), nor: new Float32Array(nor), col: new Float32Array(col), idx: new Uint32Array(idx), mn: mn.map(v => v * scale), mx: mx.map(v => v * scale) };
}

// Modelle liegen in IndexedDB: localStorage wäre dafür zu klein
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('biege-fittings', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('mesh');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, run) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('mesh', mode), out = run(t.objectStore('mesh'));
    t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error);
  });
};
export const saveMesh = (id, mesh) => tx('readwrite', s => s.put(mesh, id));
export const dropMesh = id => tx('readwrite', s => s.delete(id));
export async function loadMeshes() {
  const db = await open();
  return new Promise((res, rej) => {
    const out = new Map(), c = db.transaction('mesh').objectStore('mesh').openCursor();
    c.onsuccess = () => { const r = c.result; if (r) { out.set(r.key, r.value); r.continue(); } else res(out); };
    c.onerror = () => rej(c.error);
  });
}
