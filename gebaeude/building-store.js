// Speicher (IndexedDB „biege-bau“), neues Gebäude, Datei-Download. Teil von building.js.
import { uid } from './building-math.js';
import { seedTypes } from './building-data.js';
import { SCHEMA } from './building-schema.js';
// ---------- Speicher ----------
const DBN = 'biege-bau';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('buildings', { keyPath: 'id' }); d.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbDo(store, mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), r = fn(t.objectStore(store));
    t.oncomplete = () => { d.close(); res(r?.result); };
    t.onerror = () => { d.close(); rej(t.error); };
  });
}
const loadB = id => dbDo('buildings', 'readonly', s => s.get(id));
const listB = () => dbDo('buildings', 'readonly', s => s.getAll());
const delB = id => dbDo('buildings', 'readwrite', s => s.delete(id));
const saveB = b => dbDo('buildings', 'readwrite', s => s.put(b));
const putFile = (id, blob) => dbDo('files', 'readwrite', s => s.put(blob, id));
const getFile = id => dbDo('files', 'readonly', s => s.get(id));
const delFile = id => dbDo('files', 'readwrite', s => s.delete(id));
const newBuilding = (name = 'Gebäude') => ({ id: uid(), name, ver: 1, storeys: [{ id: uid(), name: 'EG', elev: 0, height: 3000 }], grids: [], els: [], underlays: [], types: seedTypes(), schema: SCHEMA });
const LAST_KEY = 'biege.bau.last';
const lastId = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };
const remember = id => { try { localStorage.setItem(LAST_KEY, id); } catch {} };
function download(blob, name) {
  const url = URL.createObjectURL(blob), l = document.createElement('a');
  l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export { DBN, idb, dbDo, loadB, listB, delB, saveB, putFile, getFile, delFile, newBuilding, LAST_KEY, lastId, remember, download };
