// Schemaversion der Gebäudedaten und Migrationen. Teil von building.js.
// Jede Version, die das Datenmodell ändert, bekommt hier einen Schritt; geöffnete Gebäude werden der Reihe nach auf den neuesten Stand gebracht
// (statt stiller Reparatur an vielen Stellen). Gebäude aus einer neueren Version bleiben unverändert und werden gemeldet.
import { seedTypes } from './building-data.js';

const SCHEMA = 4;
// Schritte: Eintrag n bringt Version n-1 auf n. hooks.linkOne verknüpft Bauteile mit passenden Typen.
const STEPS = [
  null, // 0 -> 1: Grundgerüst (frühere Versionen hatten keine Nummer)
  (B) => { B.vis ||= { off: {}, hide: [] }; B.vis.off ||= {}; B.vis.hide ||= []; B.grids ||= []; B.underlays ||= []; B.els ||= []; B.storeys ||= []; },
  (B, h) => { B.types ||= seedTypes(); (B.els || []).forEach(e => h?.linkOne?.(e)); delete B.typesV; }, // 1 -> 2: Bauteiltypen (Version 275)
  (B) => { B.els.forEach(e => { if (e.type === 'space' && e.auto && !e.seed) delete e.auto; }); }, // 2 -> 3: Räume können den Wänden folgen (seed = Punkt im Raum), Wandenden ja/jb
  (B) => { B.views ||= []; }, // 3 -> 4: gespeicherte Ansichten (Version 278)
];
const verOf = B => (B.schema ?? (B.typesV ? 2 : B.vis ? 1 : 0));
function migrate(B, hooks) {
  const from = verOf(B), notes = [];
  if (from > SCHEMA) return { from, to: from, newer: true, notes };
  for (let v = from + 1; v <= SCHEMA; v++) { STEPS[v]?.(B, hooks); notes.push(`Schema ${v - 1} → ${v}`); }
  B.schema = SCHEMA;
  B.vis ||= { off: {}, hide: [] }; B.vis.off ||= {}; B.vis.hide ||= []; B.grids ||= []; B.underlays ||= []; B.types ||= seedTypes(); // Gerüst auch bei kaputten Dateien
  return { from, to: SCHEMA, newer: false, notes: from === SCHEMA ? [] : notes };
}

export { SCHEMA, migrate, verOf };
